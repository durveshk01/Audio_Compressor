export type CompletionCategory =
  | "frontend"
  | "backend"
  | "ffmpeg"
  | "uiux"
  | "testing"
  | "deployment";

export type TaskState = "completed" | "remaining";

export interface ProjectTask {
  id: string;
  category: CompletionCategory;
  milestone: string;
  label: string;
  state: TaskState;
}

export interface CategoryProgress {
  category: CompletionCategory;
  label: string;
  completed: number;
  total: number;
  percent: number;
  status: string;
}

export const categoryLabels: Record<CompletionCategory, string> = {
  frontend: "Frontend",
  backend: "Backend",
  ffmpeg: "FFmpeg Integration",
  uiux: "UI/UX",
  testing: "Testing",
  deployment: "Deployment Readiness"
};

export const projectTasks: ProjectTask[] = [
  { id: "upload-page", category: "frontend", milestone: "Frontend", label: "Upload Page", state: "completed" },
  { id: "multi-file-upload", category: "frontend", milestone: "Frontend", label: "Multi-File Upload", state: "completed" },
  { id: "drag-drop-upload", category: "frontend", milestone: "Frontend", label: "Drag and Drop Upload", state: "completed" },
  { id: "progress-ui", category: "frontend", milestone: "Frontend", label: "Progress UI", state: "completed" },
  { id: "results-ui", category: "frontend", milestone: "Frontend", label: "Results UI", state: "completed" },
  { id: "mobile-responsiveness", category: "frontend", milestone: "Frontend", label: "Mobile Responsiveness", state: "completed" },

  { id: "upload-api", category: "backend", milestone: "Backend", label: "Upload API", state: "completed" },
  { id: "compression-api", category: "backend", milestone: "Backend", label: "Compression API", state: "completed" },
  { id: "zip-download-api", category: "backend", milestone: "Backend", label: "ZIP Download API", state: "completed" },
  { id: "individual-download-api", category: "backend", milestone: "Backend", label: "Individual Download API", state: "completed" },
  { id: "error-handling", category: "backend", milestone: "Backend", label: "Error Handling", state: "completed" },
  { id: "temp-cleanup", category: "backend", milestone: "Backend", label: "Automatic Temp Cleanup", state: "completed" },

  { id: "mp3-compression", category: "ffmpeg", milestone: "FFmpeg", label: "MP3 Compression", state: "completed" },
  { id: "m4a-compression", category: "ffmpeg", milestone: "FFmpeg", label: "M4A Compression", state: "completed" },
  { id: "target-size-compression", category: "ffmpeg", milestone: "FFmpeg", label: "Target Size Compression", state: "completed" },
  { id: "metadata-preservation", category: "ffmpeg", milestone: "FFmpeg", label: "Metadata and Artwork Mapping", state: "completed" },

  { id: "dark-mode", category: "uiux", milestone: "UI/UX", label: "Dark Mode", state: "completed" },
  { id: "glassmorphism", category: "uiux", milestone: "UI/UX", label: "Glassmorphism", state: "completed" },
  { id: "animations", category: "uiux", milestone: "UI/UX", label: "Smooth Animations", state: "completed" },
  { id: "toast-notifications", category: "uiux", milestone: "UI/UX", label: "Toast Notifications", state: "completed" },
  { id: "dashboard", category: "uiux", milestone: "UI/UX", label: "Project Completion Dashboard", state: "completed" },

  { id: "unit-tests", category: "testing", milestone: "Testing", label: "Unit Tests", state: "completed" },
  { id: "ffmpeg-verification", category: "testing", milestone: "Testing", label: "FFmpeg Verification", state: "completed" },
  { id: "upload-testing", category: "testing", milestone: "Testing", label: "Upload Testing", state: "completed" },
  { id: "compression-testing", category: "testing", milestone: "Testing", label: "Compression Testing", state: "completed" },
  { id: "zip-testing", category: "testing", milestone: "Testing", label: "ZIP Testing", state: "completed" },
  { id: "browser-smoke-test", category: "testing", milestone: "Testing", label: "In-App Browser Smoke Test", state: "completed" },

  { id: "render-yaml", category: "deployment", milestone: "Deployment", label: "Render Blueprint", state: "completed" },
  { id: "ffmpeg-apt", category: "deployment", milestone: "Deployment", label: "FFmpeg apt.txt Install", state: "completed" },
  { id: "health-endpoint", category: "deployment", milestone: "Deployment", label: "Health Endpoint", state: "completed" },
  { id: "production-build", category: "deployment", milestone: "Deployment", label: "Production Build", state: "completed" },
  { id: "git-ready", category: "deployment", milestone: "Deployment", label: "GitHub-Ready Repository", state: "completed" },
  { id: "security-hardening", category: "deployment", milestone: "Deployment", label: "Security Hardening (Helmet + Rate Limiting)", state: "completed" },
  { id: "render-live-deploy", category: "deployment", milestone: "Deployment", label: "Live Render Deployment", state: "remaining" }
];

export function getStatusLabel(percent: number) {
  if (percent <= 10) return "Not Started";
  if (percent <= 70) return "In Progress";
  if (percent <= 95) return "Near Completion";
  return "Ready for Deployment";
}

export function calculateCategoryProgress(tasks: ProjectTask[]) {
  return (Object.keys(categoryLabels) as CompletionCategory[]).map((category) => {
    const categoryTasks = tasks.filter((task) => task.category === category);
    const completed = categoryTasks.filter((task) => task.state === "completed").length;
    const total = categoryTasks.length;
    const percent = total === 0 ? 0 : Math.round((completed / total) * 100);
    return {
      category,
      label: categoryLabels[category],
      completed,
      total,
      percent,
      status: getStatusLabel(percent)
    };
  });
}

export function calculateOverallProgress(tasks: ProjectTask[]) {
  const completed = tasks.filter((task) => task.state === "completed").length;
  const total = tasks.length;
  const percent = total === 0 ? 0 : Math.round((completed / total) * 100);
  return {
    completed,
    total,
    remaining: total - completed,
    percent,
    status: getStatusLabel(percent)
  };
}
