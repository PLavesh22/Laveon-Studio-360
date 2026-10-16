import os
import shutil
import subprocess
import tempfile
import json
import logging
from pathlib import Path
from typing import Tuple, Optional, List, Dict, Any
import cv2
import numpy as np

from app.config import TEMP_DIR_ROOT

logger = logging.getLogger(__name__)

def find_ffmpeg_executable() -> Optional[str]:
    """
    Locates the ffmpeg executable on PATH or common Windows installation directories.
    """
    # 1. Standard PATH check
    ffmpeg_cmd = shutil.which("ffmpeg")
    if ffmpeg_cmd:
        return ffmpeg_cmd

    # 2. Check WinGet / Gyan / local locations on Windows
    candidate_patterns = [
        Path(os.environ.get("LOCALAPPDATA", "")) / "Microsoft" / "WinGet" / "Packages",
        Path("C:/Program Files/ffmpeg/bin"),
        Path("C:/ffmpeg/bin"),
        Path(os.environ.get("USERPROFILE", "")) / ".local" / "bin",
    ]

    for base in candidate_patterns:
        if base.exists():
            for match in base.glob("**/ffmpeg.exe"):
                if match.is_file():
                    return str(match)

    return None

def find_ffprobe_executable() -> Optional[str]:
    """
    Locates the ffprobe executable on PATH or alongside ffmpeg.
    """
    ffprobe_cmd = shutil.which("ffprobe")
    if ffprobe_cmd:
        return ffprobe_cmd

    ffmpeg_path = find_ffmpeg_executable()
    if ffmpeg_path:
        probe_sibling = Path(ffmpeg_path).parent / "ffprobe.exe"
        if probe_sibling.is_file():
            return str(probe_sibling)

    return None

def check_ffmpeg() -> Tuple[bool, Optional[str], Optional[str]]:
    """
    Verifies if FFmpeg is installed and returns (is_available, version_string, binary_path).
    """
    ffmpeg_path = find_ffmpeg_executable()
    if not ffmpeg_path:
        return False, None, None

    try:
        proc = subprocess.run(
            [ffmpeg_path, "-version"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=5
        )
        if proc.returncode == 0:
            first_line = proc.stdout.splitlines()[0] if proc.stdout else "FFmpeg (version unknown)"
            return True, first_line, ffmpeg_path
    except Exception as e:
        logger.warning(f"Error running FFmpeg version check: {e}")

    return False, None, ffmpeg_path

def get_ffmpeg_install_guide() -> str:
    """
    Returns beginner-friendly installation instructions for Windows.
    """
    return (
        "FFmpeg is required to extract high-quality video frames for panoramic stitching.\n\n"
        "How to install FFmpeg on Windows 10/11:\n"
        "1. Open Windows PowerShell or Terminal.\n"
        "2. Run the command: winget install Gyan.FFmpeg.Essentials\n"
        "3. Alternatively, download a static build from https://www.gyan.dev/ffmpeg/builds/,\n"
        "   extract the zip, and add the 'bin' folder to your system PATH.\n"
        "4. Restart the backend application once installed."
    )

def probe_video_metadata(video_path: Path) -> Dict[str, Any]:
    """
    Probes video metadata using ffprobe if available, falling back to OpenCV VideoCapture.
    """
    meta = {
        "filename": video_path.name,
        "size_bytes": video_path.stat().st_size,
        "duration_sec": 0.0,
        "width": 0,
        "height": 0,
        "fps": 0.0,
        "format_name": None,
        "frame_count": 0
    }

    ffprobe_path = find_ffprobe_executable()
    if ffprobe_path:
        try:
            cmd = [
                ffprobe_path,
                "-v", "quiet",
                "-print_format", "json",
                "-show_format",
                "-show_streams",
                str(video_path)
            ]
            res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=10)
            if res.returncode == 0 and res.stdout:
                data = json.loads(res.stdout)
                fmt = data.get("format", {})
                meta["duration_sec"] = float(fmt.get("duration", 0.0))
                meta["format_name"] = fmt.get("format_name")

                for stream in data.get("streams", []):
                    if stream.get("codec_type") == "video":
                        meta["width"] = int(stream.get("width", 0))
                        meta["height"] = int(stream.get("height", 0))
                        # R_frame_rate e.g. "30/1"
                        r_fps = stream.get("r_frame_rate", "0/1")
                        if "/" in r_fps:
                            num, den = r_fps.split("/")
                            meta["fps"] = round(float(num) / float(den), 2) if float(den) > 0 else 0.0
                        break
                return meta
        except Exception as e:
            logger.warning(f"ffprobe metadata extraction failed, falling back to cv2: {e}")

    # Fallback to OpenCV
    cap = cv2.VideoCapture(str(video_path))
    if cap.isOpened():
        meta["width"] = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        meta["height"] = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        fps = cap.get(cv2.CAP_PROP_FPS)
        meta["fps"] = round(fps, 2) if fps > 0 else 30.0
        frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        meta["frame_count"] = frame_count
        if meta["fps"] > 0:
            meta["duration_sec"] = round(frame_count / meta["fps"], 2)
        cap.release()

    return meta

def calculate_blur_variance(image_bgr: np.ndarray) -> float:
    """
    Computes the Laplacian variance (sharpness score). Lower values indicate motion blur.
    """
    gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
    return float(cv2.Laplacian(gray, cv2.CV_64F).var())

def calculate_histogram_similarity(img1_bgr: np.ndarray, img2_bgr: np.ndarray) -> float:
    """
    Computes normalized HSV histogram correlation between two frames.
    Returns value between -1.0 and 1.0 (1.0 = identical frame).
    """
    hsv1 = cv2.cvtColor(img1_bgr, cv2.COLOR_BGR2HSV)
    hsv2 = cv2.cvtColor(img2_bgr, cv2.COLOR_BGR2HSV)

    hist1 = cv2.calcHist([hsv1], [0, 1], None, [50, 60], [0, 180, 0, 256])
    hist2 = cv2.calcHist([hsv2], [0, 1], None, [50, 60], [0, 180, 0, 256])

    cv2.normalize(hist1, hist1, alpha=0, beta=1, norm_type=cv2.NORM_MINMAX)
    cv2.normalize(hist2, hist2, alpha=0, beta=1, norm_type=cv2.NORM_MINMAX)

    correlation = cv2.compareHist(hist1, hist2, cv2.HISTCMP_CORREL)
    return float(correlation)

def extract_and_filter_frames(
    video_path: Path,
    sample_interval_sec: float = 1.0,
    max_frames: int = 30,
    scale_width: Optional[int] = None,
    similarity_threshold: float = 0.985,
    min_blur_threshold: float = 12.0
) -> Tuple[List[Path], Dict[str, int], Path]:
    """
    Extracts frames using FFmpeg at the specified interval, filters out blurry and
    redundant/duplicate frames, and returns:
    (selected_frame_paths, frame_stats, temp_dir)
    """
    ffmpeg_path = find_ffmpeg_executable()
    if not ffmpeg_path:
        raise RuntimeError("FFmpeg executable not found. Please install FFmpeg to extract video frames.")

    temp_dir = Path(tempfile.mkdtemp(prefix="laveon_extract_", dir=TEMP_DIR_ROOT))

    # Calculate fps rate for FFmpeg
    # If sample_interval_sec is 0.5s -> 2 fps; if 1.0s -> 1 fps; if 2.0s -> 0.5 fps
    fps_val = max(0.1, 1.0 / max(0.1, sample_interval_sec))
    vf_filters = [f"fps={fps_val:.3f}"]

    if scale_width and scale_width > 0:
        vf_filters.append(f"scale={scale_width}:-1")

    vf_arg = ",".join(vf_filters)
    out_pattern = temp_dir / "frame_%05d.jpg"

    cmd = [
        ffmpeg_path,
        "-y",
        "-v", "error",
        "-i", str(video_path),
        "-vf", vf_arg,
        "-q:v", "2",  # High JPEG quality for feature detection
        str(out_pattern)
    ]

    logger.info(f"Running FFmpeg frame extraction: {' '.join(cmd)}")
    proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=60)
    if proc.returncode != 0:
        error_msg = proc.stderr.strip() or "Unknown FFmpeg error"
        cleanup_temp_dir(temp_dir)
        raise RuntimeError(f"FFmpeg frame extraction failed: {error_msg}")

    # Collect extracted frames
    extracted_frames = sorted(list(temp_dir.glob("frame_*.jpg")))
    total_extracted = len(extracted_frames)

    if total_extracted == 0:
        cleanup_temp_dir(temp_dir)
        raise RuntimeError("No frames were extracted from the video. Please verify the video duration and format.")

    # Intelligent frame filtering: Redundancy reduction & blur filtering
    selected_frames: List[Path] = []
    discarded_redundant = 0
    discarded_blurry = 0

    last_selected_img: Optional[np.ndarray] = None

    for frame_path in extracted_frames:
        img = cv2.imread(str(frame_path))
        if img is None:
            continue

        # 1. Blur check
        blur_score = calculate_blur_variance(img)
        if blur_score < min_blur_threshold:
            discarded_blurry += 1
            # If we don't have enough frames yet, keep it anyway as a last resort,
            # but generally discard overly blurred frames
            if len(extracted_frames) > 10:
                continue

        # 2. Duplicate / Redundancy check against previous selected frame
        if last_selected_img is not None:
            sim = calculate_histogram_similarity(last_selected_img, img)
            if sim >= similarity_threshold:
                # Camera was stationary or barely moved, skip to avoid redundant overlapping images
                discarded_redundant += 1
                continue

        selected_frames.append(frame_path)
        last_selected_img = img

    # If aggressive filtering left fewer than 2 frames, fall back to evenly sampled extracted frames
    if len(selected_frames) < 2 and total_extracted >= 2:
        logger.warning("Filtering left fewer than 2 frames; falling back to evenly sampled frames.")
        step = max(1, total_extracted // min(max_frames, total_extracted))
        selected_frames = extracted_frames[::step]

    # Enforce max_frames cap while distributing evenly across the rotation
    if len(selected_frames) > max_frames:
        indices = np.linspace(0, len(selected_frames) - 1, max_frames, dtype=int)
        selected_frames = [selected_frames[i] for i in indices]

    stats = {
        "extracted_count": total_extracted,
        "selected_count": len(selected_frames),
        "discarded_redundant": discarded_redundant,
        "discarded_blurry": discarded_blurry
    }

    return selected_frames, stats, temp_dir

def cleanup_temp_dir(temp_dir: Path) -> None:
    """
    Safely removes a temporary directory and its contents.
    """
    if temp_dir and temp_dir.exists():
        try:
            shutil.rmtree(temp_dir, ignore_errors=True)
        except Exception as e:
            logger.warning(f"Could not remove temp dir {temp_dir}: {e}")
