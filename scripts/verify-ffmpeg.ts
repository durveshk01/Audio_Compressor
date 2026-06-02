import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { compressAudio } from "../src/server/ffmpeg.js";

function run(command: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr || `${command} exited with code ${code}`));
    });
  });
}

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "audiocompress-verify-"));
const input = path.join(tempDir, "sample.mp3");
const output = path.join(tempDir, "sample-compressed.mp3");

try {
  await run("ffmpeg", [
    "-y",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=880:duration=30",
    "-c:a",
    "libmp3lame",
    "-b:a",
    "192k",
    input
  ]);

  const result = await compressAudio({
    inputPath: input,
    outputPath: output,
    format: "mp3",
    targetMb: 0.2,
    onProgress: () => undefined
  });

  const original = await fs.stat(input);
  const compressed = await fs.stat(output);
  if (compressed.size > 0.2 * 1024 * 1024) {
    throw new Error("Compressed sample exceeded 0.2 MB.");
  }
  if (compressed.size >= original.size) {
    throw new Error("Compressed sample did not shrink.");
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        originalBytes: original.size,
        compressedBytes: compressed.size,
        bitrateKbps: result.bitrateKbps
      },
      null,
      2
    )
  );
} finally {
  await fs.rm(tempDir, { recursive: true, force: true });
}
