# AudioCompress

AudioCompress is a production-ready no-login website for compressing MP3 and M4A files to a selected target size with FFmpeg.

## Features

- MP3 and M4A uploads
- Single, multiple, drag-and-drop, and file browser upload
- Up to 100 files per batch
- Smart bitrate calculation from duration and target size
- Skips files already under target size unless recompression is requested
- Per-file progress, overall progress, completed and remaining counts
- Individual downloads and ZIP download
- Temporary disk storage with automatic cleanup
- Render-ready deployment config

## Local Development

Install dependencies:

```bash
npm install
```

Run the app:

```bash
npm run dev
```

Open `http://localhost:5173`.

## Production Build

```bash
npm run build
npm start
```

The server binds to `0.0.0.0:$PORT` and serves both the API and built frontend.

## FFmpeg

The app expects `ffmpeg` and `ffprobe` to be available on `PATH`. You can override them:

```bash
FFMPEG_PATH=/path/to/ffmpeg
FFPROBE_PATH=/path/to/ffprobe
```

Render installs FFmpeg from `apt.txt`.

## Render Deployment

1. Push this repository to GitHub, GitLab, or Bitbucket.
2. In Render, create a new Blueprint from the repository.
3. Render will read `render.yaml`, install dependencies, install FFmpeg from `apt.txt`, build, and start the service.
4. Confirm the health check at `/health` returns `200`.

No database, accounts, payments, or external services are required.
