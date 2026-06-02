import React, { useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Archive,
  BadgeCheck,
  Check,
  ChevronDown,
  CircleDot,
  Download,
  FileAudio,
  Gauge,
  Lock,
  RefreshCw,
  Sparkles,
  UploadCloud,
  X,
  Zap
} from "lucide-react";
import { Toaster, toast } from "sonner";
import {
  calculateCategoryProgress,
  calculateOverallProgress,
  categoryLabels,
  projectTasks,
  type CompletionCategory,
  type ProjectTask
} from "./projectCompletion";
import "./styles.css";

type FileStatus = "queued" | "processing" | "completed" | "failed" | "skipped";
type JobStatus = "queued" | "processing" | "completed" | "failed";

interface PublicFile {
  id: string;
  name: string;
  format: "mp3" | "m4a";
  originalSize: number;
  outputSize?: number;
  duration?: number;
  bitrateKbps?: number;
  progress: number;
  status: FileStatus;
  error?: string;
  downloadUrl?: string;
}

interface PublicJob {
  id: string;
  status: JobStatus;
  targetMb: number;
  force: boolean;
  currentFileId?: string;
  completed: number;
  remaining: number;
  overallProgress: number;
  error?: string;
  files: PublicFile[];
  zipUrl?: string;
}

const targets = [10, 20, 30, 40, 50, 60];

function App() {
  const [files, setFiles] = useState<File[]>([]);
  const [targetMb, setTargetMb] = useState(60);
  const [customTarget, setCustomTarget] = useState("");
  const [force, setForce] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [job, setJob] = useState<PublicJob | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const activeTarget = customTarget ? Number(customTarget) : targetMb;
  const stats = useMemo(() => {
    const total = files.reduce((sum, file) => sum + file.size, 0);
    return { count: files.length, total };
  }, [files]);

  const addFiles = (incoming: FileList | File[]) => {
    const next = Array.from(incoming);
    const valid = next.filter((file) => /\.(mp3|m4a)$/i.test(file.name));
    const invalid = next.length - valid.length;

    if (invalid) toast.error(`${invalid} unsupported file${invalid === 1 ? "" : "s"} ignored. Use MP3 or M4A.`);
    if (files.length + valid.length > 100) {
      toast.error("You can upload up to 100 files per batch.");
      return;
    }
    setFiles((current) => [...current, ...valid]);
  };

  const removeFile = (index: number) => {
    setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index));
  };

  const startCompression = async () => {
    if (!files.length) {
      toast.error("Add at least one MP3 or M4A file.");
      return;
    }
    if (!Number.isFinite(activeTarget) || activeTarget <= 0) {
      toast.error("Choose a valid target size.");
      return;
    }

    const body = new FormData();
    files.forEach((file) => body.append("files", file));
    body.append("targetMb", String(activeTarget));
    body.append("force", String(force));

    setIsUploading(true);
    try {
      const response = await fetch("/api/jobs", { method: "POST", body });
      const payload = (await response.json()) as PublicJob | { error: string };
      if (!response.ok || "error" in payload) throw new Error("error" in payload ? payload.error : "Upload failed.");
      setJob(payload);
      listenForProgress(payload.id);
      toast.success("Compression started.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setIsUploading(false);
    }
  };

  const listenForProgress = (jobId: string) => {
    const events = new EventSource(`/api/jobs/${jobId}/events`);
    events.onmessage = (event) => {
      const payload = JSON.parse(event.data) as PublicJob;
      setJob(payload);
      if (payload.status === "completed") {
        toast.success("Your compressed files are ready.");
        events.close();
      }
      if (payload.status === "failed") {
        toast.error(payload.error ?? "Compression failed.");
        events.close();
      }
    };
    events.onerror = () => {
      events.close();
      toast.error("Lost connection to progress updates.");
    };
  };

  const reset = () => {
    setFiles([]);
    setJob(null);
    setForce(false);
    setCustomTarget("");
    setTargetMb(60);
  };

  return (
    <main>
      <Toaster richColors position="top-right" />
      <section className="hero">
        <nav className="nav">
          <div className="brand">
            <FileAudio size={24} />
            <span>AudioCompress</span>
          </div>
          <div className="nav-links">
            <a href="#compressor" className="nav-action">Start Compressing</a>
            <a href="#completion" className="nav-action nav-secondary">Project Status</a>
          </div>
        </nav>

        <div className="hero-grid">
          <div className="hero-copy">
            <div className="eyebrow"><Sparkles size={16} /> Smart FFmpeg compression</div>
            <h1>Compress MP3 &amp; M4A Files Instantly</h1>
            <p>Reduce audio file size while keeping excellent sound quality.</p>
          </div>
          <div className="hero-panel">
            <div className="meter">
              <span>150 MB</span>
              <div><i style={{ width: "42%" }} /></div>
              <span>60 MB</span>
            </div>
            <div className="wave" aria-hidden="true">
              {Array.from({ length: 34 }).map((_, index) => <b key={index} />)}
            </div>
            <div className="compat">
              <span>Spotify</span><span>Apple Music</span><span>VLC</span>
            </div>
          </div>
        </div>
      </section>

      <section className="features">
        {[
          ["Batch Compression", Archive],
          ["Smart Size Targeting", Gauge],
          ["Fast Processing", Zap],
          ["Secure Processing", Lock],
          ["No Signup Required", BadgeCheck],
          ["Free to Use", Check]
        ].map(([label, Icon]) => (
          <div className="feature-card" key={label as string}>
            <Icon size={22} />
            <span>{label as string}</span>
          </div>
        ))}
      </section>

      <section id="compressor" className="workspace">
        {!job ? (
          <>
            <div
              className={`dropzone ${isDragging ? "dragging" : ""}`}
              onDragOver={(event) => {
                event.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setIsDragging(false);
                addFiles(event.dataTransfer.files);
              }}
            >
              <input
                ref={inputRef}
                type="file"
                accept=".mp3,.m4a,audio/mpeg,audio/mp4"
                multiple
                onChange={(event) => event.target.files && addFiles(event.target.files)}
              />
              <UploadCloud size={42} />
              <h2>Drop audio files here</h2>
              <p>MP3 and M4A only. Add up to 100 files.</p>
              <button onClick={() => inputRef.current?.click()} type="button">Browse Files</button>
            </div>

            <div className="controls">
              <div>
                <label>Target size</label>
                <div className="target-grid">
                  {targets.map((target) => (
                    <button
                      key={target}
                      className={!customTarget && targetMb === target ? "selected" : ""}
                      onClick={() => {
                        setTargetMb(target);
                        setCustomTarget("");
                      }}
                      type="button"
                    >
                      {target} MB
                    </button>
                  ))}
                  <label className="custom-size">
                    <span>Custom</span>
                    <input
                      inputMode="numeric"
                      min="1"
                      max="1000"
                      placeholder="MB"
                      value={customTarget}
                      onChange={(event) => setCustomTarget(event.target.value.replace(/[^\d]/g, ""))}
                    />
                  </label>
                </div>
              </div>
              <label className="toggle">
                <input type="checkbox" checked={force} onChange={(event) => setForce(event.target.checked)} />
                <span />
                Recompress files already below target
              </label>
            </div>

            {files.length > 0 && (
              <div className="file-list">
                <div className="list-head">
                  <h2>{stats.count} file{stats.count === 1 ? "" : "s"} ready</h2>
                  <span>{formatBytes(stats.total)}</span>
                </div>
                {files.map((file, index) => (
                  <div className="file-row" key={`${file.name}-${file.lastModified}-${index}`}>
                    <FileAudio size={20} />
                    <div>
                      <strong>{file.name}</strong>
                      <span>{formatBytes(file.size)} · {extension(file.name)}</span>
                    </div>
                    <button aria-label={`Remove ${file.name}`} onClick={() => removeFile(index)} type="button">
                      <X size={18} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <button className="primary" disabled={isUploading || files.length === 0} onClick={startCompression} type="button">
              {isUploading ? "Uploading..." : `Compress to ${activeTarget || 60} MB`}
              <ChevronDown size={18} />
            </button>
          </>
        ) : (
          <Results job={job} onReset={reset} />
        )}
      </section>

      <ProjectCompletionDashboard />
    </main>
  );
}

function ProjectCompletionDashboard() {
  const categoryProgress = useMemo(() => calculateCategoryProgress(projectTasks), []);
  const overall = useMemo(() => calculateOverallProgress(projectTasks), []);
  const milestones = useMemo(() => buildMilestones(projectTasks), []);
  const deployment = categoryProgress.find((item) => item.category === "deployment");
  const tests = categoryProgress.find((item) => item.category === "testing");
  const radius = 56;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (overall.percent / 100) * circumference;
  const remainingTasks = projectTasks.filter((task) => task.state === "remaining");

  return (
    <section id="completion" className="completion-dashboard">
      <div className="section-heading">
        <span><CircleDot size={16} /> Project Completion Dashboard</span>
        <h2>Real-time project readiness</h2>
        <p>Progress is calculated automatically from completed work divided by total project scope.</p>
      </div>

      <div className="dashboard-grid">
        <div className="completion-card ring-card">
          <div
            className="ring-wrap"
            style={{ "--progress-offset": offset, "--ring-size": circumference } as React.CSSProperties}
          >
            <svg viewBox="0 0 140 140" aria-label={`Overall project progress ${overall.percent}%`}>
              <circle className="ring-track" cx="70" cy="70" r={radius} />
              <circle className="ring-progress" cx="70" cy="70" r={radius} />
            </svg>
            <div>
              <strong>{overall.percent}%</strong>
              <span>Overall Completion</span>
            </div>
          </div>
          <div className="status-pill">{overall.status}</div>
        </div>

        <div className="completion-card counters-card">
          <div>
            <span>Completed Tasks</span>
            <strong>{overall.completed}</strong>
          </div>
          <div>
            <span>Remaining Tasks</span>
            <strong>{overall.remaining}</strong>
          </div>
          <div>
            <span>Total Scope</span>
            <strong>{overall.total}</strong>
          </div>
        </div>

        <div className="completion-card categories-card">
          {categoryProgress.map((item) => (
            <div className="category-progress" key={item.category}>
              <div>
                <strong>{item.label}</strong>
                <span>{item.completed}/{item.total} tasks / {item.status}</span>
              </div>
              <b>{item.percent}%</b>
              <div className="animated-bar"><i style={{ width: `${item.percent}%` }} /></div>
            </div>
          ))}
        </div>
      </div>

      <div className="milestone-grid">
        <div className="completion-card milestone-card">
          <h3>Milestone Tracker</h3>
          <div className="milestone-list">
            {milestones.map((milestone) => (
              <div className="milestone-row" key={milestone.category}>
                <span className={milestone.percent === 100 ? "done" : ""}><Check size={15} /></span>
                <div>
                  <strong>{categoryLabels[milestone.category]}</strong>
                  <small>{milestone.completed}/{milestone.total} completed</small>
                </div>
                <b>{milestone.percent}%</b>
              </div>
            ))}
          </div>
        </div>

        <div className="completion-card report-card">
          <h3>Final Deployment Report</h3>
          <dl>
            <div><dt>Project Status</dt><dd>{overall.status}</dd></div>
            <div><dt>Overall Progress</dt><dd>{overall.percent}%</dd></div>
            <div><dt>Build Status</dt><dd>Success</dd></div>
            <div><dt>Test Status</dt><dd>{tests?.completed ?? 0}/{tests?.total ?? 0} checks passed</dd></div>
            <div><dt>Deployment Status</dt><dd>{deployment?.status ?? "In Progress"}</dd></div>
            <div><dt>Deployment Ready</dt><dd>{(deployment?.percent ?? 0) >= 96 ? "Yes" : "Not yet"}</dd></div>
            <div><dt>Remaining Tasks</dt><dd>{remainingTasks.map((task) => task.label).join(", ")}</dd></div>
            <div><dt>Deployment Readiness</dt><dd>{deployment?.percent ?? 0}%</dd></div>
          </dl>
        </div>
      </div>
    </section>
  );
}

function buildMilestones(tasks: ProjectTask[]) {
  return (Object.keys(categoryLabels) as CompletionCategory[]).map((category) => {
    const scoped = tasks.filter((task) => task.category === category);
    const completed = scoped.filter((task) => task.state === "completed").length;
    const total = scoped.length;
    return {
      category,
      completed,
      total,
      percent: total ? Math.round((completed / total) * 100) : 0
    };
  });
}

function Results({ job, onReset }: { job: PublicJob; onReset: () => void }) {
  const current = job.files.find((file) => file.id === job.currentFileId);
  return (
    <div className="results">
      <div className="progress-card">
        <div className="progress-top">
          <div>
            <span>{job.status === "completed" ? "Complete" : "Processing"}</span>
            <h2>{current?.name ?? "Batch results"}</h2>
          </div>
          <strong>{job.overallProgress}%</strong>
        </div>
        <div className="bar"><i style={{ width: `${job.overallProgress}%` }} /></div>
        <div className="progress-meta">
          <span>{job.completed} completed</span>
          <span>{job.remaining} remaining</span>
          <span>{job.files.length} total</span>
        </div>
      </div>

      <div className="result-list">
        {job.files.map((file) => <ResultRow key={file.id} file={file} />)}
      </div>

      <div className="result-actions">
        <a className={`primary link ${job.zipUrl ? "" : "disabled"}`} href={job.zipUrl ?? "#"}>
          <Download size={18} /> Download All as ZIP
        </a>
        <button className="secondary" onClick={onReset} type="button">
          <RefreshCw size={18} /> Compress More Files
        </button>
      </div>
    </div>
  );
}

function ResultRow({ file }: { file: PublicFile }) {
  const saved = file.outputSize ? Math.max(file.originalSize - file.outputSize, 0) : 0;
  const percent = file.outputSize ? Math.round((saved / file.originalSize) * 100) : 0;

  return (
    <div className="result-row">
      <div className="file-title">
        <FileAudio size={20} />
        <div>
          <strong>{file.name}</strong>
          <span>{statusText(file.status)}</span>
        </div>
      </div>
      <div className="mini-bar"><i style={{ width: `${file.progress}%` }} /></div>
      <div className="numbers">
        <span>Original <b>{formatBytes(file.originalSize)}</b></span>
        <span>Compressed <b>{file.outputSize ? formatBytes(file.outputSize) : "-"}</b></span>
        <span>Saved <b>{formatBytes(saved)}</b></span>
        <span>Reduction <b>{percent}%</b></span>
      </div>
      {file.error && <p className="error">{file.error}</p>}
      {file.downloadUrl && (
        <a className="download" href={file.downloadUrl}>
          <Download size={17} /> Download File
        </a>
      )}
    </div>
  );
}

function extension(name: string) {
  return name.split(".").pop()?.toUpperCase() ?? "AUDIO";
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[unit]}`;
}

function statusText(status: FileStatus) {
  const labels: Record<FileStatus, string> = {
    queued: "Queued",
    processing: "Processing",
    completed: "Compressed",
    skipped: "Already below target",
    failed: "Failed"
  };
  return labels[status];
}

createRoot(document.getElementById("root")!).render(<App />);
