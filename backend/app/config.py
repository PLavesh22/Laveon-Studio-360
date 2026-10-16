import os
from pathlib import Path

# Base Paths
BACKEND_DIR = Path(__file__).resolve().parent.parent
BASE_DIR = BACKEND_DIR.parent
STORAGE_DIR = BACKEND_DIR / "storage"
TEMP_DIR_ROOT = BACKEND_DIR / "temp"

# Ensure directories exist
STORAGE_DIR.mkdir(parents=True, exist_ok=True)
TEMP_DIR_ROOT.mkdir(parents=True, exist_ok=True)

# Application Metadata & Server Configuration
APP_NAME = "Laveon Studio 360"
APP_VERSION = "1.0.0"
HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "8000"))

# Upload and Validation Settings
MAX_UPLOAD_SIZE_BYTES = 250 * 1024 * 1024  # 250 MB
ALLOWED_EXTENSIONS = {".mp4", ".mov", ".avi", ".m4v"}
ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
MIN_PHOTOS_FOR_FULL_SPHERE = 8

# Processing Defaults
DEFAULT_SAMPLE_INTERVAL_SEC = 1.0
DEFAULT_MAX_FRAMES = 30
MIN_FRAMES_FOR_STITCHING = 2
MAX_FRAMES_LIMIT = 80
DEFAULT_SIMILARITY_THRESHOLD = 0.98  # Normalized histogram correlation threshold to discard duplicates
DEFAULT_MIN_LAPLACIAN_VAR = 15.0     # Discard extremely blurry frames

# CORS
CORS_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "*"
]
