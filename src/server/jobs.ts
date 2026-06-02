import archiver from "archiver";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
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

  job.status = "processing";
  publish(job);

  try {
    await ensureDir(job.outputDir);
    for (const file of job.files) {
      job.currentFileId = file.id;
      file.status = "processing";
      file.progress = 3;
      publish(job);

      try {
        const targetBytes = job.targetMb * MB;
        const outName = compressedName(file.originalName);
        const outPath = path.join(job.outputDir, `${file.id}-${outName}`);
        const probe = await probeAudio(file.inputPath);
        file.duration = probe.duration;

        if (file.size <= targetBytes && !job.force) {
          await fsp.copyFile(file.inputPath, outPath);
          file.outputPath = outPath;
          file.outputName = file.safeName;
          file.outputSize = file.size;
          file.progress = 100;
          file.status = "skipped";
        } else {
          const result = await compressAudio({
            inputPath: file.inputPath,
            outputPath: outPath,
            format: file.format,
            targetMb: job.targetMb,
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
        }
      } catch (error) {
        file.status = "failed";
        file.error = error instanceof Error ? error.message : "Could not process this file.";
        file.progress = 100;
      }

      job.completed += 1;
      publish(job);
    }

    await createZip(job);
    job.status = job.files.some((file) => file.outputPath) ? "completed" : "failed";
    if (job.status === "failed") job.error = "No files could be compressed.";
    publish(job);
  } catch (error) {
    job.status = "failed";
    job.error = error instanceof Error ? error.message : "The compression job failed.";
    publish(job);
  }
}

async function createZip(job: Job) {
  const success = job.files.filter((file) => file.outputPath);
  if (success.length === 0) return;

  const zipPath = path.join(job.outputDir, `${job.id}-audiocompress.zip`);
  await new Promise<void>((resolve, reject) => {
    const output = fs.createWriteStream(zipPath);
    const archive = archiver("zip", { zlib: { level: 9 } });

    output.on("close", resolve);
    archive.on("error", reject);
    archive.pipe(output);

    for (const file of success) {
      archive.file(file.outputPath as string, { name: file.outputName ?? compressedName(file.originalName) });
    }

    void archive.finalize();
  });

  job.zipPath = zipPath;
}

setInterval(() => {
  const ttl = config.jobTtlMinutes * 60 * 1000;
  const now = Date.now();
  for (const [jobId, job] of jobs.entries()) {
    if (now - job.createdAt > ttl) {
      jobs.delete(jobId);
      subscribers.delete(jobId);
      void removeDir(job.uploadDir);
      void removeDir(job.outputDir);
    }
  }
}, 10 * 60 * 1000).unref();
