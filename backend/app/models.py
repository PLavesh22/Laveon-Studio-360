from typing import Optional, List, Dict, Any
from pydantic import BaseModel

class HealthResponse(BaseModel):
    status: str = "ok"
    app_name: str
    version: str
    ffmpeg_available: bool
    ffmpeg_version: Optional[str] = None
    ffmpeg_path: Optional[str] = None
    opencv_version: str
    message: str

class VideoMeta(BaseModel):
    filename: str
    size_bytes: int
    duration_sec: Optional[float] = None
    width: Optional[int] = None
    height: Optional[int] = None
    fps: Optional[float] = None
    format_name: Optional[str] = None

class FrameStats(BaseModel):
    extracted_count: int = 0
    selected_count: int = 0
    discarded_redundant: int = 0
    discarded_blurry: int = 0

class PhotoQualityItem(BaseModel):
    index: int
    filename: str
    width: int
    height: int
    blur_score: float
    is_blurry: bool
    keypoints_count: int
    status: str
    overlaps_with: List[int] = []

class DirectionalCoverage(BaseModel):
    has_zenith: bool = False
    has_upper_sky: bool = False
    has_horizon: bool = False
    has_lower_ground: bool = False
    has_nadir: bool = False
    estimated_horizontal_fov_deg: float = 0.0
    estimated_vertical_fov_deg: float = 0.0
    missing_areas: List[str] = []
    is_full_sphere_viable: bool = False

class PhotoCheckResponse(BaseModel):
    total_photos: int
    valid_photos: int
    blurry_photos: int
    average_blur_score: float
    overlap_quality_pct: float
    coverage_score_pct: float
    estimated_horizontal_deg: float
    estimated_vertical_deg: float
    zenith_covered: bool
    nadir_covered: bool
    loop_closed: bool
    is_360_complete: bool
    missing_areas: List[str] = []
    photos: List[PhotoQualityItem] = []
    can_stitch: bool = True
    recommendations: List[str] = []

class StitchResultResponse(BaseModel):
    result_id: str
    status: str  # "success" | "failed" | "processing"
    message: str
    error_code: Optional[str] = None
    error_details: Optional[str] = None
    troubleshooting_tips: Optional[List[str]] = None
    frame_stats: Optional[FrameStats] = None
    panorama_width: Optional[int] = None
    panorama_height: Optional[int] = None
    panorama_aspect_ratio: Optional[float] = None
    is_360_complete: bool = False
    is_equirectangular: bool = False
    panorama_type: str = "Wide Horizontal Panorama"
    panorama_coverage_notice: str = ""
    coverage_summary: Optional[Dict[str, Any]] = None
    processing_time_sec: float = 0.0
    created_at: str
    download_url: Optional[str] = None
    preview_url: Optional[str] = None
