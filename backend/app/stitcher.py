import logging
import time
from pathlib import Path
from typing import List, Tuple, Optional, Dict, Any
import cv2
import numpy as np

logger = logging.getLogger(__name__)

# Human-readable mapping of OpenCV Stitcher status codes
STITCHER_STATUS_EXPLANATIONS = {
    cv2.Stitcher_OK: (
        "OK",
        "Panorama stitching completed successfully.",
        []
    ),
    cv2.Stitcher_ERR_NEED_MORE_IMGS: (
        "ERR_NEED_MORE_IMGS",
        "Not enough overlapping images: OpenCV requires at least 30% to 50% visual overlap between successive frames.",
        [
            "Decrease the sampling interval (e.g. from 1.0s to 0.5s) to extract more intermediate frames.",
            "Rotate the camera more slowly when recording.",
            "Ensure the camera stays close to one fixed pivot point without walking around."
        ]
    ),
    cv2.Stitcher_ERR_HOMOGRAPHY_EST_FAIL: (
        "ERR_HOMOGRAPHY_EST_FAIL",
        "Homography estimation failed: Could not detect or match sufficient distinctive keypoints between frames.",
        [
            "Ensure the scene has rich textures and visual details (avoid plain white walls, blank skies, or repetitive textures).",
            "Reduce motion blur by moving the camera smoothly.",
            "Avoid scenes with fast-moving foreground objects (e.g., people walking directly in front of the lens).",
            "Try adjusting the sampling rate so adjacent frames have closer visual match."
        ]
    ),
    cv2.Stitcher_ERR_CAMERA_PARAMS_ADJUST_FAIL: (
        "ERR_CAMERA_PARAMS_ADJUST_FAIL",
        "Camera parameters adjustment failed: Bundle adjustment could not optimize camera focal length or rotation matrices.",
        [
            "Keep camera exposure, white balance, and focus locked (avoid sudden lighting changes).",
            "Rotate horizontally along a single axis (pure yaw) rather than tilting up/down or rolling sideways.",
            "Do not translate or walk with the camera; pivot smoothly on a tripod or fixed hand position."
        ]
    )
}

def crop_black_borders(panorama_bgr: np.ndarray) -> np.ndarray:
    """
    Optional helper to crop outer fully-black canvas borders while preserving the stitched image.
    """
    gray = cv2.cvtColor(panorama_bgr, cv2.COLOR_BGR2GRAY)
    _, thresh = cv2.threshold(gray, 1, 255, cv2.THRESH_BINARY)
    contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    if not contours:
        return panorama_bgr

    # Find the largest bounding box
    x, y, w, h = cv2.boundingRect(max(contours, key=cv2.contourArea))
    if w > 100 and h > 100:
        return panorama_bgr[y:y+h, x:x+w]

    return panorama_bgr

def stitch_frames_to_panorama(
    frame_paths: List[Path],
    output_jpeg_path: Path
) -> Tuple[bool, Dict[str, Any]]:
    """
    Executes OpenCV panorama stitching on the provided frame paths.
    Saves output to output_jpeg_path upon success.

    Returns:
    (success_bool, details_dict)
    """
    if len(frame_paths) < 2:
        return False, {
            "status": "failed",
            "error_code": "INSUFFICIENT_FRAMES",
            "message": f"At least 2 frames are required for stitching. Provided: {len(frame_paths)}.",
            "troubleshooting_tips": [
                "Decrease the sample interval setting to extract more frames from the video.",
                "Ensure your video is at least 3-5 seconds long."
            ]
        }

    logger.info(f"Loading {len(frame_paths)} frames into memory for OpenCV Stitcher...")
    images: List[np.ndarray] = []

    for p in frame_paths:
        img = cv2.imread(str(p))
        if img is not None:
            images.append(img)
        else:
            logger.warning(f"Failed to read image at {p}")

    if len(images) < 2:
        return False, {
            "status": "failed",
            "error_code": "CORRUPTED_FRAMES",
            "message": "Fewer than 2 valid images could be loaded from disk.",
            "troubleshooting_tips": ["Check disk storage and file permissions."]
        }

    start_time = time.time()

    # Create OpenCV Stitcher in PANORAMA mode
    stitcher = cv2.Stitcher_create(cv2.Stitcher_PANORAMA)

    logger.info("Starting OpenCV stitcher.stitch()...")
    status, stitched = stitcher.stitch(images)
    elapsed_sec = round(time.time() - start_time, 2)

    if status != cv2.Stitcher_OK:
        err_name, err_desc, tips = STITCHER_STATUS_EXPLANATIONS.get(
            status,
            ("UNKNOWN_STITCHER_ERROR", f"OpenCV stitcher returned unexpected status code {status}", [])
        )
        logger.warning(f"OpenCV Stitcher failed with status {status} ({err_name}): {err_desc}")
        return False, {
            "status": "failed",
            "error_code": err_name,
            "opencv_status_code": int(status),
            "message": f"Stitching failed ({err_name}): {err_desc}",
            "troubleshooting_tips": tips,
            "processing_time_sec": elapsed_sec
        }

    if stitched is None or stitched.size == 0:
        return False, {
            "status": "failed",
            "error_code": "EMPTY_RESULT",
            "message": "OpenCV reported success but returned an empty canvas.",
            "troubleshooting_tips": ["Try adjusting frame resolution and sampling interval."],
            "processing_time_sec": elapsed_sec
        }

    # Optional border crop to trim dark edges around cylindrical/spherical warp
    try:
        stitched = crop_black_borders(stitched)
    except Exception as e:
        logger.warning(f"Border trimming skipped: {e}")

    h, w = stitched.shape[:2]
    aspect_ratio = round(w / float(h), 2) if h > 0 else 0.0

    # Save output JPEG with high quality
    output_jpeg_path.parent.mkdir(parents=True, exist_ok=True)
    encode_success = cv2.imwrite(
        str(output_jpeg_path),
        stitched,
        [int(cv2.IMWRITE_JPEG_QUALITY), 95]
    )

    if not encode_success or not output_jpeg_path.exists():
        return False, {
            "status": "failed",
            "error_code": "SAVE_FAILED",
            "message": "Failed to encode and save stitched JPEG image.",
            "troubleshooting_tips": ["Check file permissions on the storage directory."],
            "processing_time_sec": elapsed_sec
        }

    logger.info(f"Panorama stitched successfully: {w}x{h} (Aspect ratio: {aspect_ratio}:1) in {elapsed_sec}s")

    return True, {
        "status": "success",
        "message": "Panorama stitched successfully using OpenCV PANORAMA mode.",
        "panorama_width": w,
        "panorama_height": h,
        "panorama_aspect_ratio": aspect_ratio,
        "processing_time_sec": elapsed_sec,
        "is_360_complete": False,
        "panorama_type": "Wide Horizontal Panorama (Planar/Cylindrical Projection)"
    }


def blend_360_seam(canvas_bgr: np.ndarray, blend_width: int = 40) -> np.ndarray:
    """
    Blends the left (0 deg) and right (360 deg) boundary seam of an equirectangular image
    so that when mapped to a 3D sphere, no vertical stitch seam is visible.
    """
    if canvas_bgr is None or canvas_bgr.size == 0 or canvas_bgr.shape[1] < blend_width * 2:
        return canvas_bgr

    result = canvas_bgr.copy()
    h, w = result.shape[:2]
    bw = min(blend_width, w // 8)

    left_strip = result[:, :bw].astype(np.float32)
    right_strip = result[:, w - bw:].astype(np.float32)

    # Linear alpha ramp from 0 to 1
    alpha = np.linspace(0.0, 1.0, bw, dtype=np.float32).reshape(1, bw, 1)

    # Blend right edge towards left edge
    blended_right = right_strip * (1.0 - alpha) + left_strip * alpha
    blended_left = left_strip * (1.0 - alpha) + right_strip * alpha

    result[:, w - bw:] = np.clip(blended_right, 0, 255).astype(np.uint8)
    result[:, :bw] = np.clip(blended_left, 0, 255).astype(np.uint8)
    return result


def project_to_equirectangular_canvas(
    stitched_bgr: np.ndarray,
    loop_closed: bool,
    horizontal_fov_deg: float,
    vertical_fov_deg: float,
    target_width: int = 3840
) -> Tuple[np.ndarray, Dict[str, Any]]:
    """
    Projects stitched imagery onto a strict 2:1 equirectangular canvas (width = 2 * height).
    Centers imagery vertically and blends seams horizontally if full 360-degree coverage is detected.
    """
    if stitched_bgr is None or stitched_bgr.size == 0:
        empty_w = target_width
        empty_h = target_width // 2
        return np.zeros((empty_h, empty_w, 3), dtype=np.uint8), {"width": empty_w, "height": empty_h}

    src_h, src_w = stitched_bgr.shape[:2]
    canvas_w = max(1920, int(target_width))
    canvas_h = canvas_w // 2

    canvas = np.zeros((canvas_h, canvas_w, 3), dtype=np.uint8)

    # Calculate scaling based on FOV
    hfov = min(360.0, max(30.0, float(horizontal_fov_deg)))
    vfov = min(180.0, max(20.0, float(vertical_fov_deg)))

    scaled_w = int(canvas_w * (hfov / 360.0))
    scaled_h = int(canvas_h * (vfov / 180.0))

    scaled_w = max(1, min(canvas_w, scaled_w))
    scaled_h = max(1, min(canvas_h, scaled_h))

    resized_src = cv2.resize(stitched_bgr, (scaled_w, scaled_h), interpolation=cv2.INTER_LANCZOS4)

    # Position in center of equirectangular sphere
    offset_x = (canvas_w - scaled_w) // 2
    offset_y = (canvas_h - scaled_h) // 2

    canvas[offset_y:offset_y + scaled_h, offset_x:offset_x + scaled_w] = resized_src

    # If full horizontal loop is closed, blend the seam wrap-around
    if loop_closed or hfov >= 350.0:
        canvas = blend_360_seam(canvas, blend_width=min(48, canvas_w // 32))

    meta = {
        "width": canvas_w,
        "height": canvas_h,
        "aspect_ratio": 2.0,
        "horizontal_fov_deg": hfov,
        "vertical_fov_deg": vfov,
        "is_equirectangular": True,
    }

    return canvas, meta
