import "dotenv/config";
import path from "node:path";
import os from "node:os";

const toInt = (value: string | undefined, fallback: number) => {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const config = {
  port: toInt(process.env.PORT, 10000),
  maxUploadFiles: toInt(process.env.MAX_UPLOAD_FILES, 100),
  maxFileMb: toInt(process.env.MAX_FILE_MB, 600),
  jobTtlMinutes: toInt(process.env.JOB_TTL_MINUTES, 60),
  ffmpegPath: process.env.FFMPEG_PATH || "ffmpeg",
  ffprobePath: process.env.FFPROBE_PATH || "ffprobe",
  tempRoot: process.env.TEMP_ROOT || path.join(os.tmpdir(), "audiocompress")
};
