import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import multer from "multer";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { nanoid } from "nanoid";
import { config } from "./config.js";
import { createJob, getJob, subscribe } from "./jobs.js";
import { UploadedAudio } from "./types.js";
import { ensureDir, formatFromFilename, sanitizeFilename, toPublicJob } from "./utils.js";

const app = express();
await ensureDir(config.tempRoot);

// Security headers (allow inline styles for the React app)
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

// Rate limit uploads to prevent abuse (20 job requests per 15 minutes per IP)
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many uploads, please try again later." }
});

type UploadRequest = express.Request & { audioCompressUploadDir?: string };

const storage = multer.diskStorage({
  destination: (req: UploadRequest, _file, cb) => {
    try {
      if (!req.audioCompressUploadDir) {
        const jobId = nanoid(12);
        req.audioCompressUploadDir = path.join(config.tempRoot, jobId, "uploads");
        fs.mkdirSync(req.audioCompressUploadDir, { recursive: true });
      }
      cb(null, req.audioCompressUploadDir);
    } catch (error) {
      cb(error as Error, "");
    }
  },
  filename: (_req, file, cb) => {
    cb(null, `${nanoid(10)}-${sanitizeFilename(file.originalname)}`);
  }
});

const upload = multer({
  storage,
  limits: {
    files: config.maxUploadFiles,
    fileSize: config.maxFileMb * 1024 * 1024
  },
  fileFilter: (_req, file, cb) => {
    const format = formatFromFilename(file.originalname);
    if (!format) cb(new Error(`Unsupported file format: ${path.extname(file.originalname)}`));
    else cb(null, true);
  }
});

app.disable("x-powered-by");
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/health", (_req, res) => {
  res.status(200).json({ ok: true, service: "AudioCompress" });
});

app.post("/api/jobs", uploadLimiter, (req, res, next) => {
  upload.array("files", config.maxUploadFiles)(req, res, (err) => {
    if (err) {
      console.error("Upload error:", err);
      // Clean up orphaned upload directory on failure
      const uploadDir = (req as UploadRequest).audioCompressUploadDir;
      if (uploadDir) {
        const rootDir = path.dirname(uploadDir);
        fs.rm(rootDir, { recursive: true, force: true }, () => {});
      }
      return next(err);
    }
    next();
  });
}, async (req, res) => {
  try {
    const files = (req.files ?? []) as Express.Multer.File[];
    const targetMb = Number(req.body.targetMb ?? 60);
    const force = req.body.force === "true";

    console.log(`Job request: ${files.length} files, target ${targetMb}MB, force ${force}`);

    if (!Number.isFinite(targetMb) || targetMb <= 0 || targetMb > 1000) {
      res.status(400).json({ error: "Choose a target size between 1 MB and 1000 MB." });
      return;
    }
    if (files.length === 0) {
      res.status(400).json({ error: "Upload at least one MP3 or M4A file." });
      return;
    }

    const firstDir = path.dirname(files[0].path);
    const rootDir = path.dirname(firstDir);
    const outputDir = path.join(rootDir, "outputs");
    
    await ensureDir(outputDir);

    const uploaded: UploadedAudio[] = files.map((file) => {
      const format = formatFromFilename(file.originalname);
      if (!format) throw new Error("Only MP3 and M4A files are supported.");
      return {
        id: nanoid(10),
        originalName: file.originalname,
        safeName: sanitizeFilename(file.originalname),
        format,
        size: file.size,
        inputPath: file.path
      };
    });

    const job = createJob(uploaded, targetMb, force, { uploadDir: firstDir, outputDir });
    console.log(`Created job ${job.id}`);
    res.status(202).json(toPublicJob(job));
  } catch (error) {
    console.error("Job creation error:", error);
    res.status(400).json({ error: error instanceof Error ? error.message : "Upload failed." });
  }
});

app.get("/api/jobs/:id", (req, res) => {
  const job = getJob(req.params.id);
  if (!job) {
    res.status(404).json({ error: "Compression job not found or expired." });
    return;
  }
  res.json(toPublicJob(job));
});

app.get("/api/jobs/:id/events", (req, res) => {
  const job = getJob(req.params.id);
  if (!job) {
    res.status(404).end();
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no"
  });

  // Keep-alive heartbeat to prevent proxy/load-balancer timeouts
  const keepAlive = setInterval(() => {
    try { res.write(": keepalive\n\n"); } catch { /* connection gone */ }
  }, 20_000);

  const unsubscribe = subscribe(job.id, (payload) => {
    try {
      res.write(`data: ${payload}\n\n`);
      // Close SSE when job reaches a terminal state
      const parsed = JSON.parse(payload);
      if (parsed.status === "completed" || parsed.status === "failed") {
        clearInterval(keepAlive);
        res.end();
      }
    } catch { /* connection gone */ }
  });

  req.on("close", () => {
    clearInterval(keepAlive);
    unsubscribe();
  });
});

app.get("/api/download/:jobId/zip", (req, res) => {
  const job = getJob(req.params.jobId);
  if (!job?.zipPath || !fs.existsSync(job.zipPath)) {
    res.status(404).json({ error: "ZIP file is not ready." });
    return;
  }
  res.download(job.zipPath, "audiocompress-files.zip");
});

app.get("/api/download/:jobId/:fileId", (req, res) => {
  const job = getJob(req.params.jobId);
  const file = job?.files.find((item) => item.id === req.params.fileId);
  if (!file?.outputPath || !fs.existsSync(file.outputPath)) {
    res.status(404).json({ error: "Compressed file is not ready." });
    return;
  }
  res.download(file.outputPath, file.outputName ?? sanitizeFilename(file.originalName));
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDir = path.resolve(__dirname, "../client");
if (fs.existsSync(clientDir)) {
  app.use(express.static(clientDir));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(clientDir, "index.html"));
  });
}

app.use((error: Error, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (res.headersSent) {
    return next(error);
  }
  const status = (error as Error & { status?: number }).status ?? 400;
  res.status(status).json({ error: error.message || "Something went wrong." });
});

app.listen(config.port, "0.0.0.0", () => {
  console.log(`AudioCompress listening on ${config.port}`);
});
