import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import { config } from "./config.js";
import { AudioFormat } from "./types.js";
import { MB } from "./utils.js";

interface ProbeResult {
  duration: number;
  bitrate?: number;
}

function run(command: string, args: string[], onStderr?: (line: string) => void) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stderr += text;
      onStderr?.(text);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(stderr || `${command} exited with code ${code}`));
    });
  });
}

export async function probeAudio(inputPath: string): Promise<ProbeResult> {
  const { stdout } = await run(config.ffprobePath, [
    "-v",
    "error",
    "-print_format",
    "json",
    "-show_format",
    inputPath
  ]);
  const parsed = JSON.parse(stdout) as { format?: { duration?: string; bit_rate?: string } };
  const duration = Number.parseFloat(parsed.format?.duration ?? "0");
  const bitrate = Number.parseInt(parsed.format?.bit_rate ?? "0", 10);

  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error("Could not read the audio duration.");
  }

  return {
    duration,
    bitrate: Number.isFinite(bitrate) && bitrate > 0 ? bitrate : undefined
  };
}

export function calculateBitrateKbps(duration: number, targetMb: number, sourceBitrate?: number) {
  const targetBytes = targetMb * MB;
  const reservedForMetadata = Math.max(128 * 1024, targetBytes * 0.055);
  const availableBits = Math.max((targetBytes - reservedForMetadata) * 8, 24_000 * duration);
  const rawKbps = Math.floor(availableBits / duration / 1000);
  const sourceKbps = sourceBitrate ? Math.floor(sourceBitrate / 1000) : 320;
  return Math.max(24, Math.min(rawKbps, sourceKbps, 320));
}

export async function compressAudio(options: {
  inputPath: string;
  outputPath: string;
  format: AudioFormat;
  targetMb: number;
  probe?: ProbeResult;
  threads?: number;
  onProgress: (progress: number, bitrateKbps: number) => void;
}) {
  const probe = options.probe || await probeAudio(options.inputPath);
  const targetBytes = options.targetMb * MB;
  let bitrateKbps = calculateBitrateKbps(probe.duration, options.targetMb, probe.bitrate);
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < 7; attempt += 1) {
    await fs.rm(options.outputPath, { force: true });
    const args = buildArgs(options.inputPath, options.outputPath, options.format, bitrateKbps, options.threads);

    try {
      await run(config.ffmpegPath, args, (text) => {
        const match = text.match(/time=(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)/);
        if (!match) return;
        const seconds =
          Number(match[1]) * 3600 + Number(match[2]) * 60 + Number.parseFloat(match[3]);
        const progress = Math.min(98, Math.round((seconds / probe.duration) * 100));
        options.onProgress(progress, bitrateKbps);
      });

      const stat = await fs.stat(options.outputPath);
      if (stat.size <= targetBytes) {
        options.onProgress(100, bitrateKbps);
        return { duration: probe.duration, bitrateKbps, outputSize: stat.size };
      }
      lastError = new Error("Compressed file exceeded the selected target size.");
      bitrateKbps = Math.max(24, Math.floor(bitrateKbps * 0.88));
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("FFmpeg compression failed.");
      bitrateKbps = Math.max(24, Math.floor(bitrateKbps * 0.88));
    }
  }

  throw lastError ?? new Error("Unable to compress within the selected target size.");
}

function buildArgs(inputPath: string, outputPath: string, format: AudioFormat, bitrateKbps: number, threads?: number) {
  const audioCodec = format === "mp3" ? "libmp3lame" : "aac";
  const args = [
    "-y",
    "-threads",
    (threads ?? 0).toString(),
    "-i",
    inputPath,
    "-map",
    "0:a:0",
    "-map",
    "0:v?",
    "-map_metadata",
    "0",
    "-c:a",
    audioCodec,
    "-b:a",
    `${bitrateKbps}k`,
    "-c:v",
    "copy"
  ];

  if (format === "mp3") {
    args.push("-id3v2_version", "3", "-write_id3v1", "1");
  } else {
    args.push("-movflags", "+faststart+use_metadata_tags");
  }

  args.push(outputPath);
  return args;
}
