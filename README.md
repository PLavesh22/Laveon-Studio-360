# 🌐 Laveon Studio 360

An advanced, full-stack 360° panoramic stitching and viewing studio. Convert multi-tier smartphone photos or rotational video sweeps into equirectangular 360° panoramas with an interactive in-browser viewer.

---

## ✨ Features

- **📸 360° Multi-Tier Photo Stitcher:** Stitch multi-row photos (Horizon, Sky/Zenith, Nadir/Ground) into a spherical equirectangular panorama.
- **🎥 Rotational Video Extraction:** Extract keyframes from 360° rotational camera recordings using FFmpeg with blur rejection and duplicate filtering.
- **👁️ Interactive 360° Viewer:** High-performance in-browser panorama exploration with mouse drag, zoom, auto-rotation, and full-screen view.
- **⚡ Quality Pre-Check:** Analyzes photos for blurriness (Laplacian variance), visual feature density, and coverage gaps before processing.
- **📡 Host Network Access:** Built-in host link exposure to test and capture photos directly from mobile devices on the same Wi-Fi network.

---

## 🛠️ Tech Stack

- **Frontend:** React 19, TypeScript, Vite, Lucide Icons, Vanilla CSS
- **Backend:** FastAPI, Uvicorn, OpenCV (`cv2`), Pydantic
- **Media Processing:** FFmpeg, NumPy

---

## 🚀 Quick Start

### Prerequisites
- **Node.js** (v18+)
- **Python** (v3.10+)
- **FFmpeg** (optional for video extraction; auto-detected on PATH)

---

### 1. Backend Setup

```powershell
# Navigate to backend
cd backend

# Create virtual environment and install dependencies
uv venv .venv --python 3.11
uv pip install -r requirements.txt
# (or: python -m venv .venv && .venv\Scripts\pip install -r requirements.txt)

# Run FastAPI Server
powershell -ExecutionPolicy Bypass -File .\run_backend.ps1
# Or: .venv\Scripts\python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Backend will run on:
- API: `http://127.0.0.1:8000`
- Interactive Swagger Docs: `http://127.0.0.1:8000/docs`

---

### 2. Frontend Setup

```powershell
# In a new terminal, navigate to frontend
cd frontend

# Install dependencies
npm install

# Start Vite Dev Server with Network Host link
npm run dev -- --host
```

Frontend will run on:
- Local: `http://localhost:5173/`
- Network: `http://<your-lan-ip>:5173/`

---

## 📂 Project Structure

```
Laveon-Studio-360/
├── backend/
│   ├── app/
│   │   ├── main.py            # FastAPI routes & lifespan
│   │   ├── photo_processor.py # Multi-tier 360 photo stitching
│   │   ├── stitcher.py        # OpenCV panorama stitcher
│   │   ├── video_extractor.py # FFmpeg frame extraction & filtering
│   │   ├── models.py          # Pydantic schemas
│   │   └── config.py          # App settings & paths
│   ├── storage/               # Panoramas & demo assets
│   ├── run_backend.ps1        # One-click backend runner
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/        # UI components (PhotoStudio, PanoramaViewer, etc.)
│   │   ├── services/api.ts    # Backend API client
│   │   ├── App.tsx            # Main layout & state orchestrator
│   │   └── index.css          # Styling & glassmorphism theme
│   ├── package.json
│   └── vite.config.ts         # Proxy & host config
└── README.md
```

---

## 📄 License
MIT License. Created for Laveon Studio 360.
