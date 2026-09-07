import React, { useMemo, useRef, useState, useEffect } from "react";
import "./styles.css";
import { createRoot } from "react-dom/client";
import { Activity, CheckCircle, Disc, Download, Music, Radio, RefreshCw, Settings2, Sparkles, UploadCloud, X } from "lucide-react";
import { Toaster, toast } from "sonner";
import { calculateCategoryProgress, calculateOverallProgress, projectTasks } from "./projectCompletion";

// --- Types ---
interface PublicFile {
  id: string;
  name: string;
  format: string;
  originalSize: number;
  outputSize?: number;
  duration?: number;
  bitrateKbps?: number;
  progress: number;
  status: "queued" | "processing" | "completed" | "failed";
  downloadUrl?: string;
  error?: string;
}

interface PublicJob {
  id: string;
  status: "queued" | "processing" | "completed" | "failed";
  targetMb: number;
  force: boolean;
  currentFileId?: string;
  completed: number;
  remaining: number;
  overallProgress: number;
  files: PublicFile[];
  zipUrl?: string;
  error?: string;
}

function formatBytes(bytes: number, decimals = 1) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}

const PRESETS = [
  { id: 'p60', label: 'Max Quality', target: 60, desc: 'Near transparent', color: '#10b981' },
  { id: 'p40', label: 'High Quality', target: 40, desc: 'Excellent balance', color: '#3b82f6' },
  { id: 'p30', label: 'Balanced', target: 30, desc: 'Standard compression', color: '#8b5cf6' },
  { id: 'p20', label: 'Small File', target: 20, desc: 'Fast sharing', color: '#d946ef' },
  { id: 'p10', label: 'Extreme', target: 10, desc: 'Maximum reduction', color: '#f43f5e' },
];

const PROCESSING_MESSAGES = [
  "Analyzing audio frequencies...",
  "Optimizing bitrate...",
  "Preserving sound quality...",
  "Removing unnecessary data...",
  "Finalizing your compressed audio..."
];

function App() {
  const [files, setFiles] = useState<File[]>([]);
  const [targetMb, setTargetMb] = useState(30);
  const [presetId, setPresetId] = useState('p30');
  const [force, setForce] = useState(false);
  
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [job, setJob] = useState<PublicJob | null>(null);
  
  const inputRef = useRef<HTMLInputElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  
  const [msgIdx, setMsgIdx] = useState(0);

  useEffect(() => {
    if (job?.status === 'processing' || isUploading) {
      const int = setInterval(() => setMsgIdx(i => (i + 1) % PROCESSING_MESSAGES.length), 2500);
      return () => clearInterval(int);
    }
  }, [job?.status, isUploading]);

  const activePreset = PRESETS.find(p => p.id === presetId);
  const activeColor = activePreset?.color || '#8b5cf6';

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

  const handlePresetClick = (preset: typeof PRESETS[0]) => {
    setPresetId(preset.id);
    setTargetMb(preset.target);
  };

  const startCompression = async () => {
    if (!files.length) {
      toast.error("Add at least one MP3 or M4A file.");
      return;
    }
    if (!Number.isFinite(targetMb) || targetMb <= 0 || targetMb > 1000) {
      toast.error("Choose a target size between 1 MB and 1000 MB.");
      return;
    }

    const body = new FormData();
    files.forEach((file) => body.append("files", file));
    body.append("targetMb", String(targetMb));
    body.append("force", String(force));

    setIsUploading(true);
    try {
      const response = await fetch("/api/jobs", { method: "POST", body });
      const payload = (await response.json()) as PublicJob | { error: string };
      if (!response.ok || "error" in payload) throw new Error("error" in payload ? payload.error : "Upload failed.");
      setJob(payload);
      listenForProgress(payload.id);
      toast.success("Compression engine started.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setIsUploading(false);
    }
  };

  const listenForProgress = (jobId: string) => {
    eventSourceRef.current?.close();
    const events = new EventSource(`/api/jobs/${jobId}/events`);
    eventSourceRef.current = events;

    events.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as PublicJob;
        setJob(payload);
        if (payload.status === "completed") {
          toast.success("Your compressed tracks are ready.");
          events.close();
          eventSourceRef.current = null;
        }
        if (payload.status === "failed") {
          toast.error(payload.error ?? "Compression failed.");
          events.close();
          eventSourceRef.current = null;
        }
      } catch {}
    };
    events.onerror = () => {
      if (events.readyState === EventSource.CLOSED) {
        toast.error("Lost connection to progress updates.");
        eventSourceRef.current = null;
      }
    };
  };

  const reset = () => {
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
    setFiles([]);
    setJob(null);
  };

  const renderSignatureVisualizer = (isProcessing = false) => (
    <div className={`signature-visualizer ${isProcessing ? 'processing' : ''}`} style={{ '--theme-color': activeColor } as React.CSSProperties}>
      <div className="vis-ring ring-1" />
      <div className="vis-ring ring-2" />
      <div className="vis-core">
        {isProcessing ? (
          <>
            <span className="vis-value">{job?.overallProgress || 0}</span>
            <span className="vis-unit">%</span>
            <span className="vis-label">Completed</span>
          </>
        ) : (
          <>
            <span className="vis-value">{targetMb}</span>
            <span className="vis-unit">MB</span>
            <span className="vis-label">Target Per Track</span>
          </>
        )}
      </div>
    </div>
  );

  return (
    <>
      <Toaster theme="dark" position="top-center" />
      
      <main>
        <nav className="nav">
          <div className="brand">
            <Activity /> AudioCompress
          </div>
        </nav>

        {!job && files.length === 0 && (
          <div className="hero">
            <h1>Compress Audio.<br/>Keep Every Beat.</h1>
            <p>Premium AI-powered audio compression. Reduce file sizes significantly while preserving studio-quality sound.</p>
          </div>
        )}

        {!job && files.length === 0 && (
          <div
            className={`dropzone ${isDragging ? "dragging" : ""}`}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
            }}
            onClick={() => inputRef.current?.click()}
          >
            <input type="file" multiple accept=".mp3,.m4a,audio/mpeg,audio/mp4" ref={inputRef} onChange={(e) => {
              if (e.target.files?.length) addFiles(e.target.files);
              e.target.value = "";
            }} />
            <div className="dropzone-content">
              <div className="visualizer-idle">
                <Radio size={48} className="pulse-icon" />
              </div>
              <h2>Drop your tracks here</h2>
              <p style={{ color: "var(--text-muted)", marginTop: -8 }}>Supports MP3 & M4A (Up to 100 tracks)</p>
              <button className="btn-primary" onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}>
                <UploadCloud /> Select Audio Files
              </button>
            </div>
          </div>
        )}

        {!job && files.length > 0 && (
          <div className="workspace-grid">
            <div className="tracks-panel glass-panel">
              <h3><Music size={18} /> Uploaded Tracks ({files.length})</h3>
              <div className="tracks-list">
                {files.map((file, idx) => (
                  <div key={idx} className="audio-player-card">
                    <div className="player-icon"><Disc className="spin" /></div>
                    <div className="player-info">
                      <h4>{file.name}</h4>
                      <div className="player-meta">
                        <span>{formatBytes(file.size)}</span>
                        <span>{file.name.split('.').pop()?.toUpperCase()}</span>
                      </div>
                    </div>
                    <button className="remove-btn" onClick={() => removeFile(idx)}><X size={18} /></button>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="settings-panel glass-panel">
              <h3><Settings2 size={18} /> Compression Engine</h3>
              
              <div className="visualizer-container">
                {renderSignatureVisualizer()}
              </div>

              <div className="presets-grid">
                {PRESETS.map(p => (
                  <button
                    key={p.id}
                    className={`preset-btn ${presetId === p.id ? 'active' : ''}`}
                    onClick={() => handlePresetClick(p)}
                    style={{ '--accent': p.color, '--accent-rgb': p.color === '#10b981' ? '16, 185, 129' : p.color === '#3b82f6' ? '59, 130, 246' : p.color === '#8b5cf6' ? '139, 92, 246' : p.color === '#d946ef' ? '217, 70, 239' : '244, 63, 94' } as React.CSSProperties}
                  >
                    <div>
                      <div className="preset-name">{p.label}</div>
                      <div className="preset-meta">{p.desc}</div>
                    </div>
                    <div className="preset-name">{p.target} MB</div>
                  </button>
                ))}
              </div>

              <label className="toggle-row">
                <input type="checkbox" style={{ display: 'none' }} checked={force} onChange={(e) => setForce(e.target.checked)} />
                <div className="toggle-switch" />
                Force recompression (ignore target constraints)
              </label>

              <button className="btn-primary" onClick={startCompression} disabled={isUploading} style={{ width: '100%', justifyContent: 'center' }}>
                <Sparkles /> {isUploading ? "Starting Engine..." : "Compress Tracks"}
              </button>
            </div>
          </div>
        )}

        {(job?.status === 'processing' || (isUploading && !job)) && (
          <div className="processing-screen glass-panel">
            {renderSignatureVisualizer(true)}
            <h2 className="processing-text">{PROCESSING_MESSAGES[msgIdx]}</h2>
            <div className="progress-bar-container">
              <div className="progress-fill" style={{ width: `${job?.overallProgress || 0}%` }} />
            </div>
          </div>
        )}

        {job?.status === 'completed' && (
          <div className="success-screen">
            <div className="success-hero glass-panel">
              <CheckCircle className="success-icon" />
              <h2>Compression Complete</h2>
              
              {(() => {
                const totalOrig = job.files.reduce((acc, f) => acc + f.originalSize, 0);
                const totalComp = job.files.reduce((acc, f) => acc + (f.outputSize || f.originalSize), 0);
                const saved = Math.max(0, totalOrig - totalComp);
                const savedPercent = totalOrig > 0 ? Math.round((saved / totalOrig) * 100) : 0;
                
                return (
                  <div className="space-saved-stat">
                    <span className="saved-value">{savedPercent}%</span>
                    <span className="saved-label">Smaller</span>
                  </div>
                );
              })()}
              
              <div className="success-actions">
                {job.zipUrl && (
                  <a href={job.zipUrl} className="btn-primary" style={{ textDecoration: 'none' }}>
                    <Download /> Download ZIP Archive
                  </a>
                )}
                <button className="btn-secondary" onClick={reset}>
                  <RefreshCw /> Compress More
                </button>
              </div>
            </div>

            <div className="tracks-list" style={{ maxHeight: 'none' }}>
              {job.files.map((file) => (
                <div key={file.id} className="result-row">
                  <div className="player-info">
                    <h4>{file.name}</h4>
                    <div className="player-meta">
                      {file.status === "completed" ? "Optimized successfully" : "Failed / Skipped"}
                    </div>
                  </div>
                  
                  <div className="result-stats">
                    <div className="stat-group">
                      <span className="stat-label">Original</span>
                      <span className="stat-val">{formatBytes(file.originalSize)}</span>
                    </div>
                    <div className="stat-group">
                      <span className="stat-label">Compressed</span>
                      <span className="stat-val highlight">{file.outputSize ? formatBytes(file.outputSize) : "—"}</span>
                    </div>
                    <div className="stat-group">
                      <span className="stat-label">Bitrate</span>
                      <span className="stat-val">{file.bitrateKbps ? `${file.bitrateKbps} kbps` : "—"}</span>
                    </div>
                  </div>

                  {file.downloadUrl && (
                    <a href={file.downloadUrl} className="remove-btn" title="Download">
                      <Download size={20} />
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </>
  );
}

const root = createRoot(document.getElementById("root")!);
root.render(<App />);
