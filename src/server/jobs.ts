import archiver from "archiver";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { nanoid } from "nanoid";
import { config } from "./config.js";
import { compressAudio, probeAudio } from "./ffmpeg.js";
import { Job, ProcessedAudio, UploadedAudio } from "./types.js";
import { compressedName, ensureDir, MB, removeDir, toPublicJob } from "./utils.js";

const jobs = new Map<string, Job>();
const subscribers = new Map<string, Set<(payload: string) => void>>();

export function createJob(files: UploadedAudio[], targetMb: number, force: boolean, dirs: { uploadDir: string; outputDir: string }) {
  const job: Job = {
    id: nanoid(12),
    status: "queued",
    targetMb,
    force,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    uploadDir: dirs.uploadDir,
    outputDir: dirs.outputDir,
    completed: 0,
    files: files.map((file): ProcessedAudio => ({ ...file, progress: 0, status: "queued" }))
  };

  jobs.set(job.id, job);
  void processJob(job.id);
  return job;
}

export function getJob(id: string) {
  return jobs.get(id);
}

export function subscribe(jobId: string, send: (payload: string) => void) {
  let set = subscribers.get(jobId);
  if (!set) {
    set = new Set();
    subscribers.set(jobId, set);
  }
  set.add(send);
  const job = getJob(jobId);
  if (job) send(JSON.stringify(toPublicJob(job)));
  return () => {
    set?.delete(send);
    if (set?.size === 0) subscribers.delete(jobId);
  };
}

function publish(job: Job) {
  job.updatedAt = Date.now();
  const payload = JSON.stringify(toPublicJob(job));
  subscribers.get(job.id)?.forEach((send) => send(payload));
}

async function processJob(jobId: string) {
  const job = jobs.get(jobId);
  if (!job) return;

  console.log(`Processing job ${jobId} with ${job.files.length} files`);
  job.status = "processing";
  publish(job);

  try {
    await ensureDir(job.outputDir);

    const cpus = os.cpus().length;
    // Increased concurrency: allow more parallel jobs on high-core systems
    const concurrency = Math.max(1, Math.min(cpus > 8 ? 8 : 4, job.files.length));
    const threadsPerFfmpeg = Math.max(1, Math.floor(cpus / concurrency));
    const queue = [...job.files];
    
    console.log(`Concurrency: ${concurrency}, Threads per FFmpeg: ${threadsPerFfmpeg}`);

    const workers = Array.from({ length: concurrency }, async () => {
      while (queue.length > 0) {
        const file = queue.shift();
        if (!file) break;

        console.log(`  Processing file ${file.id}: ${file.originalName}`);
        job.currentFileId = file.id;
        file.status = "processing";
        file.progress = 3;
        publish(job);

        try {
          const targetBytes = job.targetMb * MB;
          const outName = compressedName(file.originalName);
          const outPath = path.join(job.outputDir, `${file.id}-${outName}`);
          
          console.log(`    Probing ${file.inputPath}`);
          const probe = await probeAudio(file.inputPath);
          file.duration = probe.duration;

          if (file.size <= targetBytes && !job.force) {
            console.log(`    Skipping compression, size is below target`);
            await fsp.copyFile(file.inputPath, outPath);
            file.outputPath = outPath;
            file.outputName = file.safeName;
            file.outputSize = file.size;
            file.progress = 100;
            file.status = "skipped";
          } else {
            console.log(`    Compressing to target ${job.targetMb}MB`);
            const result = await compressAudio({
              inputPath: file.inputPath,
              outputPath: outPath,
              format: file.format,
              targetMb: job.targetMb,
              probe,
              threads: threadsPerFfmpeg,
              onProgress: (progress, bitrateKbps) => {
                file.progress = progress;
                file.bitrateKbps = bitrateKbps;
                publish(job);
              }
            });
            file.outputPath = outPath;
            file.outputName = outName;
            file.outputSize = result.outputSize;
            file.duration = result.duration;
            file.bitrateKbps = result.bitrateKbps;
            file.progress = 100;
            file.status = "completed";
            console.log(`    Completed: ${result.outputSize} bytes`);
          }
        } catch (error) {
          console.error(`    Error processing file ${file.id}:`, error);
          file.status = "failed";
          file.error = error instanceof Error ? error.message : "Could not process this file.";
          file.progress = 100;
        }
        job.completed += 1;
        publish(job);
      }
    });

    await Promise.all(workers);

    await createZip(job);
    job.status = job.files.some((file) => file.outputPath) ? "completed" : "failed";
    if (job.status === "failed") job.error = "No files could be compressed.";
    console.log(`Job ${jobId} finished with status ${job.status}`);
    publish(job);
  } catch (error) {
    console.error(`Batch processing error for job ${jobId}:`, error);
    job.status = "failed";
    job.error = error instanceof Error ? error.message : "The compression job failed.";
    publish(job);
  }
}

async function createZip(job: Job) {
  const success = job.files.filter((file) => file.outputPath);
  if (success.length === 0) return;

  // Deduplicate archive entry names to prevent overwrites
  const nameCount = new Map<string, number>();
  const getUniqueName = (name: string) => {
    const count = nameCount.get(name) ?? 0;
    nameCount.set(name, count + 1);
    if (count === 0) return name;
    const dot = name.lastIndexOf(".");
    const base = dot > 0 ? name.slice(0, dot) : name;
    const ext = dot > 0 ? name.slice(dot) : "";
    return `${base} (${count})${ext}`;
  };

  const zipPath = path.join(job.outputDir, `${job.id}-audiocompress.zip`);
  await new Promise<void>((resolve, reject) => {
    const output = fs.createWriteStream(zipPath);
    const archive = archiver("zip", { zlib: { level: 1 } });

    output.on("close", resolve);
    output.on("error", reject);
    archive.on("error", reject);
    archive.on("warning", (err) => {
      if (err.code !== "ENOENT") reject(err);
    });
    archive.pipe(output);

    for (const file of success) {
      const entryName = getUniqueName(file.outputName ?? compressedName(file.originalName));
      archive.file(file.outputPath as string, { name: entryName });
    }

    archive.finalize().catch(reject);
  });

  job.zipPath = zipPath;
}

setInterval(() => {
  const ttl = config.jobTtlMinutes * 60 * 1000;
  const now = Date.now();
  for (const [jobId, job] of jobs.entries()) {
    // Never delete jobs that are still processing
    if (job.status === "processing" || job.status === "queued") continue;
    if (now - job.createdAt > ttl) {
      jobs.delete(jobId);
      subscribers.delete(jobId);
      // Remove the entire job root directory (parent of uploads/ and outputs/)
      const rootDir = path.dirname(job.uploadDir);
      void removeDir(rootDir);
    }
  }
}, 10 * 60 * 1000).unref();
