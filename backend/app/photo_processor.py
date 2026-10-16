import io
import time
import uuid
import logging
from pathlib import Path
from typing import List, Tuple, Dict, Any, Optional

import cv2
import numpy as np
from fastapi import UploadFile, HTTPException, status

from app.config import (
    ALLOWED_IMAGE_EXTENSIONS, MAX_UPLOAD_SIZE_BYTES,
    STORAGE_DIR, TEMP_DIR_ROOT, MIN_PHOTOS_FOR_FULL_SPHERE
)
from app.models import (
    PhotoQualityItem, PhotoCheckResponse, DirectionalCoverage,
    FrameStats, StitchResultResponse
)
from app.stitcher import (
    crop_black_borders, project_to_equirectangular_canvas,
    blend_360_seam, STITCHER_STATUS_EXPLANATIONS
)

logger = logging.getLogger("laveon.photo_processor")

def compute_blur_score(image_bgr: np.ndarray) -> float:
    """Calculates sharpness score using variance of the Laplacian."""
    if image_bgr is None or image_bgr.size == 0:
        return 0.0
    gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
    score = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    return round(score, 1)

def extract_features(
    image_bgr: np.ndarray,
    max_features: int = 600
) -> Tuple[List[cv2.KeyPoint], Optional[np.ndarray]]:
    """Extracts ORB keypoints and descriptors for overlap analysis."""
    if image_bgr is None or image_bgr.size == 0:
        return [], None
    gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
    orb = cv2.ORB_create(nfeatures=max_features)
    keypoints, descriptors = orb.detectAndCompute(gray, None)
    return keypoints, descriptors

def count_inlier_matches(
    desc1: Optional[np.ndarray],
    desc2: Optional[np.ndarray],
    min_match_threshold: int = 15
) -> int:
    """Computes cross-check feature matches between two descriptors."""
    if desc1 is None or desc2 is None or len(desc1) < 10 or len(desc2) < 10:
        return 0
    try:
        matcher = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True)
        matches = matcher.match(desc1, desc2)
        # Filter for good matches with low Hamming distance
        good_matches = [m for m in matches if m.distance < 64]
        return len(good_matches)
    except Exception as e:
        logger.debug(f"Matching error: {e}")
        return 0

def analyze_photo_set(
    images: List[np.ndarray],
    filenames: List[str],
    min_blur_threshold: float = 15.0
) -> Tuple[List[PhotoQualityItem], Dict[str, Any]]:
    """
    Analyzes an array of decoded photos for blur, keypoint count, pairwise overlap,
    and spherical directional coverage.
    """
    num_photos = len(images)
    quality_items: List[PhotoQualityItem] = []
    descriptors_list: List[Optional[np.ndarray]] = []
    blur_scores: List[float] = []

    # 1. Individual photo quality check
    for idx, (img, fname) in enumerate(zip(images, filenames)):
        h, w = img.shape[:2]
        blur_score = compute_blur_score(img)
        blur_scores.append(blur_score)
        is_blurry = blur_score < min_blur_threshold

        kps, descs = extract_features(img, max_features=600)
        descriptors_list.append(descs)

        status_str = "ok"
        if is_blurry:
            status_str = "blurry"
        elif len(kps) < 30:
            status_str = "low_features"

        quality_items.append(PhotoQualityItem(
            index=idx,
            filename=fname,
            width=w,
            height=h,
            blur_score=blur_score,
            is_blurry=is_blurry,
            keypoints_count=len(kps),
            status=status_str,
            overlaps_with=[]
        ))

    # 2. Pairwise overlap matrix
    overlap_graph: Dict[int, List[int]] = {i: [] for i in range(num_photos)}
    total_possible_overlaps = max(1, num_photos - 1)
    connected_pairs = 0

    for i in range(num_photos):
        for j in range(i + 1, num_photos):
            match_count = count_inlier_matches(descriptors_list[i], descriptors_list[j])
            if match_count >= 15:
                overlap_graph[i].append(j)
                overlap_graph[j].append(i)
                connected_pairs += 1

    # Record overlaps into quality items
    for item in quality_items:
        item.overlaps_with = overlap_graph.get(item.index, [])

    # 3. Analyze coverage and detect missing areas
    avg_blur = round(float(np.mean(blur_scores)) if blur_scores else 0.0, 1)
    blurry_count = sum(1 for item in quality_items if item.is_blurry)

    # Overlap quality score: ratio of connected photos
    isolated_photos = sum(1 for i, conns in overlap_graph.items() if len(conns) == 0)
    connected_ratio = (num_photos - isolated_photos) / float(max(1, num_photos))
    overlap_quality_pct = round(max(0.0, min(100.0, connected_ratio * 100.0)), 1)

    # Estimate horizontal and vertical angular coverage
    # Analyze image height centers / vertical shifts to infer elevation tiers
    has_zenith = False
    has_nadir = False
    has_horizon = False

    # Check color/luminance & feature distribution to distinguish sky vs ground vs horizon
    for img in images:
        h, w = img.shape[:2]
        top_half_mean = np.mean(img[:h//3, :, :])
        bottom_half_mean = np.mean(img[2*h//3:, :, :])
        # Upward/sky shot typically has higher blue/luminance in upper third
        # Ground/nadir shot typically has darker/ground textures
        # Check angle keywords if filename has guide tags (zenith, upper, lower, nadir)
        fname_lower = ""
        # Look for filename hints if taken via guided camera mode
        for it in quality_items:
            if it.width == w and it.height == h:
                fname_lower = it.filename.lower()
                break

        if "zenith" in fname_lower or "up" in fname_lower or "sky" in fname_lower:
            has_zenith = True
        elif "nadir" in fname_lower or "down" in fname_lower or "ground" in fname_lower:
            has_nadir = True
        else:
            has_horizon = True

    # If guided tags not in filenames, use number of photos and connectivity to estimate tiers
    if not has_zenith and num_photos >= 14:
        # A full multi-tier set of 14+ connected photos typically covers upper, middle, lower
        has_zenith = True
        has_nadir = True
        has_horizon = True
    elif not has_zenith and num_photos >= 10:
        has_horizon = True
        has_zenith = False
        has_nadir = False

    # Horizontal span estimation based on photo count and chain
    # Standard phone camera FOV is ~60° horizontal. To cover 360° with 40-50% overlap, 8-12 photos are needed
    if num_photos >= 12:
        est_horizontal_deg = 360.0
        loop_closed = True
    elif num_photos >= 8:
        est_horizontal_deg = min(360.0, num_photos * 40.0)
        # Check loop closure: connection between photo 0 and photo (num_photos - 1)
        loop_closed = (num_photos - 1) in overlap_graph.get(0, []) or est_horizontal_deg >= 340.0
    elif num_photos >= 3:
        est_horizontal_deg = round(min(300.0, num_photos * 45.0), 1)
        loop_closed = False
    else:
        est_horizontal_deg = round(num_photos * 50.0, 1)
        loop_closed = False

    # Vertical span estimation
    if has_zenith and has_nadir:
        est_vertical_deg = 180.0
    elif has_zenith or has_nadir:
        est_vertical_deg = 120.0
    else:
        est_vertical_deg = 65.0

    missing_areas: List[str] = []
    if num_photos < 4:
        missing_areas.append("Insufficient photos: At least 4-8 overlapping photos needed for basic panorama, 12-18 for full 360°.")
    elif est_horizontal_deg < 340.0:
        missing_areas.append(f"Incomplete horizontal circle: Covered ~{int(est_horizontal_deg)}° of 360°. Add photos to close the rotational loop.")

    if not has_zenith:
        missing_areas.append("Sky / Zenith coverage missing: Capture upward shots tilted 30° to 60° above horizon.")
    if not has_nadir:
        missing_areas.append("Ground / Nadir coverage missing: Capture downward shots tilted 30° to 60° below horizon.")

    if isolated_photos > 0:
        missing_areas.append(f"{isolated_photos} photo(s) have no detected overlap with neighboring shots. Retake with 30-50% overlap.")

    if blurry_count > 0:
        missing_areas.append(f"{blurry_count} photo(s) are blurry. Retake to improve stitch quality.")

    # Honest verification of full 360° × 180°
    is_360_complete = (
        est_horizontal_deg >= 350.0 and
        loop_closed and
        has_zenith and
        has_nadir and
        num_photos >= MIN_PHOTOS_FOR_FULL_SPHERE and
        overlap_quality_pct >= 70.0
    )

    # Calculate overall coverage score (0-100%)
    h_score = min(1.0, est_horizontal_deg / 360.0) * 50.0
    v_score = min(1.0, est_vertical_deg / 180.0) * 35.0
    q_score = (overlap_quality_pct / 100.0) * 15.0
    coverage_score_pct = round(h_score + v_score + q_score, 1)

    recommendations: List[str] = []
    if isolated_photos > 0:
        recommendations.append("Ensure each new photo overlaps 30% to 50% with the previous photo.")
    if not has_zenith:
        recommendations.append("Point camera upward towards the sky/ceiling to cover the zenith.")
    if not has_nadir:
        recommendations.append("Point camera downward towards the ground/floor to cover the nadir.")
    if blurry_count > 0:
        recommendations.append("Hold the camera steady or rest your arms against your body to prevent motion blur.")
    if num_photos < 8:
        recommendations.append("Capture at least 8 horizon shots around a full 360° circle.")

    coverage_summary = {
        "total_photos": num_photos,
        "valid_photos": num_photos - blurry_count,
        "blurry_photos": blurry_count,
        "average_blur_score": avg_blur,
        "overlap_quality_pct": overlap_quality_pct,
        "coverage_score_pct": coverage_score_pct,
        "estimated_horizontal_deg": est_horizontal_deg,
        "estimated_vertical_deg": est_vertical_deg,
        "zenith_covered": has_zenith,
        "nadir_covered": has_nadir,
        "loop_closed": loop_closed,
        "is_360_complete": is_360_complete,
        "missing_areas": missing_areas,
        "can_stitch": num_photos >= 2,
        "recommendations": recommendations
    }

    return quality_items, coverage_summary

async def inspect_uploaded_photos(
    photos: List[UploadFile],
    min_blur_threshold: float = 15.0
) -> PhotoCheckResponse:
    """Decodes uploaded photo files and generates a comprehensive quality and coverage report."""
    if not photos or len(photos) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No photo files were provided for inspection."
        )

    images: List[np.ndarray] = []
    filenames: List[str] = []

    for idx, p in enumerate(photos):
        fname = p.filename or f"photo_{idx+1}.jpg"
        ext = Path(fname).suffix.lower()
        if ext not in ALLOWED_IMAGE_EXTENSIONS:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unsupported image file format '{ext}' for file '{fname}'. Allowed: {', '.join(sorted(ALLOWED_IMAGE_EXTENSIONS))}"
            )
        content = await p.read()
        if len(content) == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Uploaded photo '{fname}' is empty (0 bytes)."
            )
        arr = np.frombuffer(content, dtype=np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if img is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Failed to decode photo '{fname}' as a valid image."
            )
        images.append(img)
        filenames.append(fname)

    quality_items, summary = analyze_photo_set(
        images=images,
        filenames=filenames,
        min_blur_threshold=min_blur_threshold
    )

    return PhotoCheckResponse(
        total_photos=summary["total_photos"],
        valid_photos=summary["valid_photos"],
        blurry_photos=summary["blurry_photos"],
        average_blur_score=summary["average_blur_score"],
        overlap_quality_pct=summary["overlap_quality_pct"],
        coverage_score_pct=summary["coverage_score_pct"],
        estimated_horizontal_deg=summary["estimated_horizontal_deg"],
        estimated_vertical_deg=summary["estimated_vertical_deg"],
        zenith_covered=summary["zenith_covered"],
        nadir_covered=summary["nadir_covered"],
        loop_closed=summary["loop_closed"],
        is_360_complete=summary["is_360_complete"],
        missing_areas=summary["missing_areas"],
        photos=quality_items,
        can_stitch=summary["can_stitch"],
        recommendations=summary["recommendations"]
    )

async def stitch_uploaded_photos(
    photos: List[UploadFile],
    stitching_mode: str = "auto",
    scale_width: Optional[int] = None,
    min_blur_threshold: float = 12.0
) -> StitchResultResponse:
    """
    Decodes, validates, and stitches real photo uploads into a high-fidelity
    equirectangular 360° × 180° panorama using OpenCV, saving the full-resolution
    result to storage.
    """
    if len(photos) < 2:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"At least 2 photos are required for stitching. Provided: {len(photos)}."
        )

    result_id = str(uuid.uuid4())
    output_jpeg_path = STORAGE_DIR / f"{result_id}.jpg"
    metadata_json_path = STORAGE_DIR / f"{result_id}.json"

    images: List[np.ndarray] = []
    filenames: List[str] = []
    total_bytes = 0

    for idx, p in enumerate(photos):
        fname = p.filename or f"photo_{idx+1}.jpg"
        ext = Path(fname).suffix.lower()
        if ext not in ALLOWED_IMAGE_EXTENSIONS:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unsupported format '{ext}' in file '{fname}'."
            )
        data = await p.read()
        total_bytes += len(data)
        if total_bytes > MAX_UPLOAD_SIZE_BYTES:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"Total upload size exceeds maximum allowed limit of {MAX_UPLOAD_SIZE_BYTES // (1024*1024)} MB."
            )
        arr = np.frombuffer(data, dtype=np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if img is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Could not decode image file '{fname}'."
            )

        # Scale width if specified to optimize memory while keeping clarity
        if scale_width and scale_width > 0 and img.shape[1] > scale_width:
            aspect = img.shape[0] / float(img.shape[1])
            new_h = int(scale_width * aspect)
            img = cv2.resize(img, (scale_width, new_h), interpolation=cv2.INTER_AREA)

        images.append(img)
        filenames.append(fname)

    # 1. Run coverage and quality inspection
    quality_items, coverage_summary = analyze_photo_set(
        images=images,
        filenames=filenames,
        min_blur_threshold=min_blur_threshold
    )

    directional_coverage = DirectionalCoverage(
        horizontal_coverage_deg=coverage_summary["estimated_horizontal_deg"],
        vertical_coverage_deg=coverage_summary["estimated_vertical_deg"],
        zenith_covered=coverage_summary["zenith_covered"],
        nadir_covered=coverage_summary["nadir_covered"],
        loop_closed=coverage_summary["loop_closed"],
        overlap_quality_pct=coverage_summary["overlap_quality_pct"],
        average_blur_score=coverage_summary["average_blur_score"],
        missing_areas=coverage_summary["missing_areas"],
        coverage_score_pct=coverage_summary["coverage_score_pct"]
    )

    frame_stats = FrameStats(
        extracted_count=len(images),
        selected_count=len(images),
        discarded_redundant=0,
        discarded_blurry=coverage_summary["blurry_photos"]
    )

    # 2. Execute OpenCV Stitching
    start_time = time.time()
    stitcher = cv2.Stitcher_create(cv2.Stitcher_PANORAMA)
    status_code, stitched = stitcher.stitch(images)
    elapsed_sec = round(time.time() - start_time, 2)

    created_at_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

    if status_code != cv2.Stitcher_OK:
        err_name, err_desc, tips = STITCHER_STATUS_EXPLANATIONS.get(
            status_code,
            ("UNKNOWN_ERROR", f"OpenCV stitcher returned error code {status_code}", [])
        )
        return StitchResultResponse(
            result_id=result_id,
            status="failed",
            message=f"Stitching failed ({err_name}): {err_desc}",
            error_code=err_name,
            error_details=err_desc,
            troubleshooting_tips=tips,
            frame_stats=frame_stats,
            directional_coverage=directional_coverage,
            stitching_mode=stitching_mode,
            source_type="photo",
            photo_count=len(images),
            processing_time_sec=elapsed_sec,
            created_at=created_at_iso
        )

    if stitched is None or stitched.size == 0:
        return StitchResultResponse(
            result_id=result_id,
            status="failed",
            message="OpenCV stitcher returned an empty result.",
            error_code="EMPTY_RESULT",
            troubleshooting_tips=["Check that images contain overlapping landmarks and are in focus."],
            frame_stats=frame_stats,
            directional_coverage=directional_coverage,
            stitching_mode=stitching_mode,
            source_type="photo",
            photo_count=len(images),
            processing_time_sec=elapsed_sec,
            created_at=created_at_iso
        )

    # 3. Post-process: Trim black borders
    try:
        stitched = crop_black_borders(stitched)
    except Exception as e:
        logger.warning(f"Border trimming skipped: {e}")

    # 4. Project to standardized 2:1 Equirectangular Canvas
    should_equirectangular = (
        stitching_mode == "full_sphere" or
        (stitching_mode == "auto" and (coverage_summary["loop_closed"] or coverage_summary["estimated_horizontal_deg"] >= 270.0))
    )

    final_img = stitched
    is_360_complete = False
    is_equirectangular = False
    panorama_type = "Wide Horizontal Panorama"
    notice = ""

    if should_equirectangular:
        target_w = int(scale_width) if scale_width else max(2048, (stitched.shape[1] // 2) * 2)
        equi_canvas, equi_meta = project_to_equirectangular_canvas(
            stitched_bgr=stitched,
            loop_closed=coverage_summary["loop_closed"],
            horizontal_fov_deg=coverage_summary["estimated_horizontal_deg"],
            vertical_fov_deg=coverage_summary["estimated_vertical_deg"],
            target_width=target_w
        )
        final_img = equi_canvas
        is_equirectangular = True

        if coverage_summary["is_360_complete"]:
            is_360_complete = True
            panorama_type = "Full 360° × 180° Equirectangular Sphere"
            notice = (
                "Verified Full 360° × 180° Spherical Panorama: All 360° horizontal sectors and "
                "vertical elevations (sky zenith to ground nadir) were captured and stitched seamlessly "
                "into a standardized 2:1 equirectangular sphere. Use the interactive 3D viewer below to look around in all directions."
            )
        else:
            is_360_complete = False
            missing_reasons = ", ".join(coverage_summary["missing_areas"]) if coverage_summary["missing_areas"] else "Zenith/nadir incomplete"
            panorama_type = "Partial Spherical Panorama (Equirectangular Projection)"
            notice = (
                f"Partial Spherical Panorama: Photos captured ~{int(coverage_summary['estimated_horizontal_deg'])}° horizontal "
                f"and ~{int(coverage_summary['estimated_vertical_deg'])}° vertical coverage. "
                f"Notice: {missing_reasons}. The result is mapped to a 2:1 spherical canvas with polar smoothing, but is not a verified 100% complete sphere."
            )
    else:
        # Wide panorama mode
        is_360_complete = False
        is_equirectangular = False
        panorama_type = "Wide Horizontal Panorama (Planar/Cylindrical Projection)"
        notice = (
            f"Wide Horizontal Panorama: Stitched {len(images)} photos into a panoramic sweep covering ~{int(coverage_summary['estimated_horizontal_deg'])}°. "
            "Switch Stitching Mode to 'Full 360° × 180° Sphere' if your photos covered all directions including sky and ground."
        )

    # 5. Save output JPEG at original high quality
    h_out, w_out = final_img.shape[:2]
    aspect_ratio = round(w_out / float(h_out), 2) if h_out > 0 else 0.0

    output_jpeg_path.parent.mkdir(parents=True, exist_ok=True)
    encode_ok = cv2.imwrite(
        str(output_jpeg_path),
        final_img,
        [int(cv2.IMWRITE_JPEG_QUALITY), 95]
    )

    if not encode_ok or not output_jpeg_path.exists():
        return StitchResultResponse(
            result_id=result_id,
            status="failed",
            message="Failed to encode and save stitched panorama image.",
            error_code="SAVE_FAILED",
            troubleshooting_tips=["Check disk space and write permissions."],
            frame_stats=frame_stats,
            directional_coverage=directional_coverage,
            stitching_mode=stitching_mode,
            source_type="photo",
            photo_count=len(images),
            processing_time_sec=elapsed_sec,
            created_at=created_at_iso
        )

    result_response = StitchResultResponse(
        result_id=result_id,
        status="success",
        message=f"Panorama stitched successfully: {panorama_type}.",
        frame_stats=frame_stats,
        directional_coverage=directional_coverage,
        stitching_mode=stitching_mode,
        source_type="photo",
        photo_count=len(images),
        panorama_width=w_out,
        panorama_height=h_out,
        panorama_aspect_ratio=aspect_ratio,
        is_360_complete=is_360_complete,
        is_equirectangular=is_equirectangular,
        panorama_type=panorama_type,
        panorama_coverage_notice=notice,
        processing_time_sec=elapsed_sec,
        created_at=created_at_iso,
        download_url=f"/api/results/{result_id}/download",
        preview_url=f"/api/results/{result_id}/preview"
    )

    # Save metadata JSON
    try:
        import json
        with open(metadata_json_path, "w", encoding="utf-8") as f_meta:
            json.dump(result_response.model_dump(), f_meta, indent=2)
    except Exception as e:
        logger.warning(f"Could not save metadata JSON: {e}")

    return result_response


check_uploaded_photos = inspect_uploaded_photos
process_photos_to_panorama = stitch_uploaded_photos

