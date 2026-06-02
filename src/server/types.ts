export type AudioFormat = "mp3" | "m4a";
export type JobStatus = "queued" | "processing" | "completed" | "failed";
export type FileStatus = "queued" | "processing" | "completed" | "failed" | "skipped";

export interface UploadedAudio {
  id: string;
  originalName: string;
  safeName: string;
  format: AudioFormat;
  size: number;
  inputPath: string;
}

export interface ProcessedAudio extends UploadedAudio {
  outputPath?: string;
  outputName?: string;
  outputSize?: number;
  duration?: number;
  bitrateKbps?: number;
  progress: number;
  status: FileStatus;
  error?: string;
}

export interface Job {
  id: string;
  status: JobStatus;
  targetMb: number;
  force: boolean;
  createdAt: number;
  updatedAt: number;
  uploadDir: string;
  outputDir: string;
  zipPath?: string;
  files: ProcessedAudio[];
  currentFileId?: string;
  completed: number;
  error?: string;
}

export interface PublicJob {
  id: string;
  status: JobStatus;
  targetMb: number;
  force: boolean;
  currentFileId?: string;
  completed: number;
  remaining: number;
  overallProgress: number;
  error?: string;
  files: Array<{
    id: string;
    name: string;
    format: AudioFormat;
    originalSize: number;
    outputSize?: number;
    duration?: number;
    bitrateKbps?: number;
    progress: number;
    status: FileStatus;
    error?: string;
    downloadUrl?: string;
  }>;
  zipUrl?: string;
}
