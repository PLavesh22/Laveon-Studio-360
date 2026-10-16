export interface HealthData {
  status: string;
  app_name: string;
  version: string;
  ffmpeg_available: boolean;
  ffmpeg_version?: string;
  ffmpeg_path?: string;
  opencv_version: string;
  message: string;
}

export interface FrameStats {
  extracted_count: number;
  selected_count: number;
  discarded_redundant: number;
  discarded_blurry: number;
}

export interface StitchResult {
  result_id: string;
  status: 'success' | 'failed' | 'processing';
  message: string;
  error_code?: string;
  error_details?: string;
  troubleshooting_tips?: string[];
  frame_stats?: FrameStats;
  panorama_width?: number;
  panorama_height?: number;
  panorama_aspect_ratio?: number;
  is_360_complete: boolean;
  is_equirectangular?: boolean;
  panorama_type: string;
  panorama_coverage_notice: string;
  coverage_summary?: any;
  processing_time_sec: number;
  created_at: string;
  download_url?: string;
  preview_url?: string;
}

export interface ProcessingSettings {
  sample_interval_sec: number;
  max_frames: number;
  scale_width?: number;
  similarity_threshold: number;
  min_blur_threshold: number;
  stitching_mode?: 'full_sphere' | 'wide_panorama' | 'auto';
}

export interface PhotoQualityItem {
  index: number;
  filename: string;
  width?: number;
  height?: number;
  blur_score?: number;
  sharpness_score?: number;
  is_blurry: boolean;
  keypoints_count?: number;
  keypoint_count?: number;
  status?: string;
  overlaps_with: number[];
  has_overlap?: boolean;
  adjacent_overlap_count?: number;
  estimated_heading_deg?: number;
  tier?: string;
}

export interface DirectionalCoverage {
  has_zenith: boolean;
  has_upper_sky: boolean;
  has_horizon: boolean;
  has_lower_ground: boolean;
  has_nadir: boolean;
  estimated_horizontal_fov_deg: number;
  estimated_vertical_fov_deg: number;
  missing_areas: string[];
  is_full_sphere_viable: boolean;
}

export interface PhotoCheckResult {
  status?: string;
  total_photos: number;
  valid_photos?: number;
  usable_photos?: number;
  blurry_photos: number;
  low_feature_photos?: number;
  average_blur_score: number;
  overlap_quality_pct: number;
  coverage_score_pct?: number;
  estimated_horizontal_deg: number;
  estimated_vertical_deg?: number;
  zenith_covered?: boolean;
  nadir_covered?: boolean;
  loop_closed?: boolean;
  is_360_complete: boolean;
  missing_areas: string[];
  photos: PhotoQualityItem[];
  can_stitch: boolean;
  recommendations?: string[];
  actionable_recommendations?: string[];
  summary_message?: string;
}

export interface CaptureTarget {
  id: string;
  tier: 'zenith' | 'upper' | 'horizon' | 'lower' | 'nadir';
  targetYaw: number;
  targetPitch: number;
  label: string;
  description: string;
  isCaptured: boolean;
  photoFile?: File;
  previewUrl?: string;
  blurScore?: number;
}
