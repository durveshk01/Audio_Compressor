import fs from "node:fs/promises";
import path from "node:path";
import { Job, PublicJob } from "./types.js";

export const MB = 1024 * 1024;

export function sanitizeFilename(name: string) {
  const parsed = path.parse(name);
  const base = parsed.name
    .normalize("NFKD")
    .replace(/[^\w\s.-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 120)
    .replace(/^-|-$/g, "");
  return `${base || "audio"}${parsed.ext.toLowerCase()}`;
}

export function compressedName(name: string) {
  const parsed = path.parse(sanitizeFilename(name));
  return `${parsed.name}-compressed${parsed.ext.toLowerCase()}`;
}

export function formatFromFilename(name: string) {
  const ext = path.extname(name).toLowerCase();
  if (ext === ".mp3") return "mp3";
  if (ext === ".m4a") return "m4a";
  return null;
}

export async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

export async function removeDir(dir: string) {
  await fs.rm(dir, { recursive: true, force: true });
}

export function toPublicJob(job: Job): PublicJob {
  const total = Math.max(job.files.length, 1);
  const overallProgress = Math.round(
    job.files.reduce((sum, file) => sum + file.progress, 0) / total
  );

  return {
    id: job.id,
    status: job.status,
    targetMb: job.targetMb,
    force: job.force,
    currentFileId: job.currentFileId,
    completed: job.completed,
    remaining: Math.max(job.files.length - job.completed, 0),
    overallProgress,
    error: job.error,
    files: job.files.map((file) => ({
      id: file.id,
      name: file.originalName,
      format: file.format,
      originalSize: file.size,
      outputSize: file.outputSize,
      duration: file.duration,
      bitrateKbps: file.bitrateKbps,
      progress: file.progress,
      status: file.status,
      error: file.error,
      downloadUrl:
        file.outputPath && (file.status === "completed" || file.status === "skipped")
          ? `/api/download/${job.id}/${file.id}`
          : undefined
    })),
    zipUrl: job.status === "completed" ? `/api/download/${job.id}/zip` : undefined
  };
}
