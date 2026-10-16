import os
import re
import uuid
import json
import logging
from datetime import datetime
from pathlib import Path
from typing import Optional, List

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

from app.config import (
    APP_NAME, APP_VERSION, STORAGE_DIR, TEMP_DIR_ROOT,
    MAX_UPLOAD_SIZE_BYTES, ALLOWED_EXTENSIONS, CORS_ORIGINS,
    DEFAULT_SAMPLE_INTERVAL_SEC, DEFAULT_MAX_FRAMES
)
from app.models import HealthResponse, StitchResultResponse, FrameStats, PhotoCheckResponse
from app.video_extractor import (
    check_ffmpeg, get_ffmpeg_install_guide,
    probe_video_metadata, extract_and_filter_frames,
    cleanup_temp_dir
)
from app.stitcher import stitch_frames_to_panorama
from app.photo_processor import check_uploaded_photos, process_photos_to_panorama
from sample_generator import generate_synthetic_360_photos
import cv2

# Set up logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("laveon.api")

app = FastAPI(
    title=APP_NAME,
    version=APP_VERSION,
    description="Backend API for Laveon Studio 360 - Panoramic Video Stitching Application"
)

# Enable CORS for local frontend development
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UUID_REGEX = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")

def validate_result_id(result_id: str) -> None:
    """Guards against path traversal by enforcing strict UUID format."""
    if not UUID_REGEX.match(result_id.lower()):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid result ID format. Must be a valid UUID."
        )

@app.get("/api/health", response_model=HealthResponse)
def get_health():
    """
    Checks backend health, FFmpeg availability, and OpenCV version.
    """
    ffmpeg_ok, ffmpeg_ver, ffmpeg_path = check_ffmpeg()

    if ffmpeg_ok:
        message = "Backend is operational and FFmpeg is ready for frame extraction."
    else:
        message = "Backend is operational, but FFmpeg was not detected on system PATH. Please follow installation guide."

    return HealthResponse(
        status="ok",
        app_name=APP_NAME,
        version=APP_VERSION,
        ffmpeg_available=ffmpeg_ok,
        ffmpeg_version=ffmpeg_ver,
        ffmpeg_path=ffmpeg_path,
        opencv_version=cv2.__version__,
        message=message
    )

@app.post("/api/process-video", response_model=StitchResultResponse)
async def process_video(
    video: UploadFile = File(..., description="Video recording from a rotating camera (MP4, MOV, AVI)"),
    sample_interval_sec: float = Form(DEFAULT_SAMPLE_INTERVAL_SEC),
    max_frames: int = Form(DEFAULT_MAX_FRAMES),
    scale_width: Optional[int] = Form(None),
    similarity_threshold: float = Form(0.985),
    min_blur_threshold: float = Form(12.0)
):
    """
    Accepts video upload, validates input, extracts frames via FFmpeg,
    removes redundant frames, stitches with OpenCV, and returns result metadata.
    """
    # 1. Pre-flight check: FFmpeg availability
    ffmpeg_ok, _, _ = check_ffmpeg()
    if not ffmpeg_ok:
        guide = get_ffmpeg_install_guide()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"FFmpeg is not installed or not in PATH.\n\n{guide}"
        )

    # 2. Validate file extension
    original_filename = video.filename or "video.mp4"
    ext = Path(original_filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file format '{ext}'. Allowed formats: {', '.join(sorted(ALLOWED_EXTENSIONS))}"
        )

    # 3. Generate unique result ID and temp paths
    result_id = str(uuid.uuid4())
    temp_video_path = TEMP_DIR_ROOT / f"upload_{result_id}{ext}"
    output_jpeg_path = STORAGE_DIR / f"{result_id}.jpg"
    metadata_json_path = STORAGE_DIR / f"{result_id}.json"

    # 4. Stream video to disk while validating file size
    bytes_read = 0
    try:
        with open(temp_video_path, "wb") as f_out:
            while chunk := await video.read(1024 * 1024):  # 1MB chunks
                bytes_read += len(chunk)
                if bytes_read > MAX_UPLOAD_SIZE_BYTES:
                    raise HTTPException(
                        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                        detail=f"File exceeds maximum allowed size of {MAX_UPLOAD_SIZE_BYTES // (1024 * 1024)} MB."
                    )
                f_out.write(chunk)
    except HTTPException:
        if temp_video_path.exists():
            temp_video_path.unlink()
        raise
    except Exception as e:
        if temp_video_path.exists():
            temp_video_path.unlink()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to save upload: {e}")

    if bytes_read == 0:
        if temp_video_path.exists():
            temp_video_path.unlink()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Uploaded file is empty (0 bytes).")

    # 5. Probe video integrity
    meta = probe_video_metadata(temp_video_path)
    if meta.get("duration_sec", 0) <= 0.2 and meta.get("frame_count", 0) <= 1:
        if temp_video_path.exists():
            temp_video_path.unlink()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The uploaded file could not be parsed as a valid video or has no readable frames."
        )

    # 6. Extract and filter frames
    frames_temp_dir: Optional[Path] = None
    try:
        selected_frames, stats, frames_temp_dir = extract_and_filter_frames(
            video_path=temp_video_path,
            sample_interval_sec=sample_interval_sec,
            max_frames=max_frames,
            scale_width=scale_width,
            similarity_threshold=similarity_threshold,
            min_blur_threshold=min_blur_threshold
        )
    except Exception as e:
        logger.error(f"Frame extraction failed: {e}", exc_info=True)
        if temp_video_path.exists():
            temp_video_path.unlink()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Frame extraction error: {str(e)}"
        )
    finally:
        # Clean up temporary uploaded video file
        if temp_video_path.exists():
            try:
                temp_video_path.unlink()
            except Exception:
                pass

    # 7. Stitch frames using OpenCV
    try:
        success, stitch_info = stitch_frames_to_panorama(
            frame_paths=selected_frames,
            output_jpeg_path=output_jpeg_path
        )
    except Exception as e:
        logger.error(f"Unexpected stitching exception: {e}", exc_info=True)
        success = False
        stitch_info = {
            "status": "failed",
            "error_code": "EXCEPTION",
            "message": f"Unexpected error during stitching: {str(e)}",
            "troubleshooting_tips": [
                "Verify video resolution and ensure system has sufficient free RAM.",
                "Try lowering max_frames or downscaling width."
            ]
        }
    finally:
        # Always clean up temporary extracted frames
        if frames_temp_dir:
            cleanup_temp_dir(frames_temp_dir)

    # 8. Build response object
    frame_stats = FrameStats(
        extracted_count=stats["extracted_count"],
        selected_count=stats["selected_count"],
        discarded_redundant=stats["discarded_redundant"],
        discarded_blurry=stats["discarded_blurry"]
    )

    created_at_iso = datetime.utcnow().isoformat() + "Z"

    if success:
        result_response = StitchResultResponse(
            result_id=result_id,
            status="success",
            message=stitch_info.get("message", "Panorama stitched successfully."),
            frame_stats=frame_stats,
            panorama_width=stitch_info.get("panorama_width"),
            panorama_height=stitch_info.get("panorama_height"),
            panorama_aspect_ratio=stitch_info.get("panorama_aspect_ratio"),
            is_360_complete=False,
            panorama_type=stitch_info.get("panorama_type", "Wide Horizontal Panorama"),
            processing_time_sec=stitch_info.get("processing_time_sec", 0.0),
            created_at=created_at_iso,
            download_url=f"/api/results/{result_id}/download",
            preview_url=f"/api/results/{result_id}/preview"
        )
    else:
        result_response = StitchResultResponse(
            result_id=result_id,
            status="failed",
            message=stitch_info.get("message", "Stitching failed."),
            error_code=stitch_info.get("error_code"),
            error_details=stitch_info.get("error_details"),
            troubleshooting_tips=stitch_info.get("troubleshooting_tips"),
            frame_stats=frame_stats,
            processing_time_sec=stitch_info.get("processing_time_sec", 0.0),
            created_at=created_at_iso
        )

    # Save metadata JSON to storage for retrieval
    try:
        with open(metadata_json_path, "w", encoding="utf-8") as f_meta:
            json.dump(result_response.model_dump(), f_meta, indent=2)
    except Exception as e:
        logger.warning(f"Could not save metadata JSON: {e}")

    return result_response

@app.get("/api/results/{result_id}", response_model=StitchResultResponse)
def get_result(result_id: str):
    """
    Retrieves metadata for a specific stitching result.
    """
    validate_result_id(result_id)
    metadata_json_path = STORAGE_DIR / f"{result_id}.json"

    if not metadata_json_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Result with ID '{result_id}' was not found."
        )

    try:
        with open(metadata_json_path, "r", encoding="utf-8") as f_meta:
            data = json.load(f_meta)
        return StitchResultResponse(**data)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to read result metadata: {e}"
        )

@app.get("/api/results/{result_id}/preview")
def get_result_preview(result_id: str):
    """
    Streams the generated stitched JPEG for in-browser preview.
    """
    validate_result_id(result_id)
    jpeg_path = STORAGE_DIR / f"{result_id}.jpg"

    if not jpeg_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Panorama image for ID '{result_id}' not found."
        )

    return FileResponse(
        path=jpeg_path,
        media_type="image/jpeg",
        filename=f"laveon_panorama_{result_id[:8]}.jpg"
    )

@app.get("/api/results/{result_id}/download")
def download_result(result_id: str):
    """
    Downloads the actual generated stitched JPEG image as an attachment.
    """
    validate_result_id(result_id)
    jpeg_path = STORAGE_DIR / f"{result_id}.jpg"

    if not jpeg_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Panorama image for ID '{result_id}' not found."
        )

    return FileResponse(
        path=jpeg_path,
        media_type="image/jpeg",
        filename=f"laveon_studio_360_panorama_{result_id[:8]}.jpg",
        headers={"Content-Disposition": f'attachment; filename="laveon_studio_360_panorama_{result_id[:8]}.jpg"'}
    )

@app.get("/api/sample-video")
def get_sample_video():
    """
    Provides a pre-rendered synthetic rotational camera video for immediate testing.
    """
    from sample_generator import generate_synthetic_panoramic_video
    sample_path = STORAGE_DIR / "sample_rotating_camera.mp4"
    if not sample_path.exists():
        generate_synthetic_panoramic_video(
            output_mp4_path=sample_path,
            canvas_width=2200,
            canvas_height=550,
            frame_width=600,
            frame_height=450,
            num_frames=35,
            fps=12
        )
    return FileResponse(
        path=sample_path,
        media_type="video/mp4",
        filename="sample_rotating_camera.mp4"
    )


@app.post("/api/check-photos", response_model=PhotoCheckResponse)
async def api_check_photos(
    photos: List[UploadFile] = File(...),
    min_blur_threshold: float = Form(15.0)
):
    """
    Evaluates uploaded/captured photos for blur, feature density, and coverage gaps.
    """
    if not photos or len(photos) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No photos provided for quality analysis."
        )
    return await check_uploaded_photos(photos, min_blur_threshold=min_blur_threshold)


@app.post("/api/process-photos", response_model=StitchResultResponse)
async def api_process_photos(
    photos: List[UploadFile] = File(...),
    min_blur_threshold: float = Form(12.0),
    scale_width: int = Form(1920),
    stitching_mode: str = Form("full_sphere")
):
    """
    Stitches uploaded multi-tier photos into an authentic equirectangular 360x180 panorama.
    """
    if not photos or len(photos) < 2:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least 2 photos are required for panorama stitching."
        )
    return await process_photos_to_panorama(
        photos=photos,
        min_blur_threshold=min_blur_threshold,
        scale_width=scale_width,
        stitching_mode=stitching_mode
    )


@app.get("/api/sample-photos")
def get_sample_photos_list():
    """
    Returns the list of pre-generated multi-tier 360 test photos.
    """
    sample_dir = STORAGE_DIR / "sample_photos_360"
    if not sample_dir.exists() or len(list(sample_dir.glob("*.jpg"))) < 10:
        generate_synthetic_360_photos(sample_dir)

    files = sorted([p.name for p in sample_dir.glob("*.jpg")])
    return {
        "status": "success",
        "count": len(files),
        "files": files,
        "base_url": "/api/sample-photos"
    }


@app.get("/api/sample-photos/{filename}")
def get_sample_photo_file(filename: str):
    """
    Streams a single sample photo file for client testing.
    """
    sample_dir = STORAGE_DIR / "sample_photos_360"
    target_file = sample_dir / filename
    if not target_file.exists():
        raise HTTPException(status_code=404, detail="Sample photo not found.")
    return FileResponse(path=target_file, media_type="image/jpeg", filename=filename)

