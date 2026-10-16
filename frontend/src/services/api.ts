import type { HealthData, ProcessingSettings, StitchResult, PhotoCheckResult } from '../types';

const API_BASE = '';

export async function fetchHealth(): Promise<HealthData> {
  const res = await fetch(`${API_BASE}/api/health`);
  if (!res.ok) {
    throw new Error(`Health check failed with status: ${res.status}`);
  }
  return res.json();
}

export async function checkPhotos(
  photos: File[],
  minBlurThreshold: number = 15.0
): Promise<PhotoCheckResult> {
  const formData = new FormData();
  photos.forEach((photo) => {
    formData.append('photos', photo);
  });
  formData.append('min_blur_threshold', minBlurThreshold.toString());

  const res = await fetch(`${API_BASE}/api/check-photos`, {
    method: 'POST',
    body: formData,
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.detail || `Photo quality check failed (${res.status})`);
  }
  return data;
}

export async function processPhotos(
  photos: File[],
  settings: ProcessingSettings
): Promise<StitchResult> {
  const formData = new FormData();
  photos.forEach((photo) => {
    formData.append('photos', photo);
  });
  formData.append('min_blur_threshold', settings.min_blur_threshold.toString());
  formData.append('scale_width', (settings.scale_width || 1920).toString());
  formData.append('stitching_mode', settings.stitching_mode || 'full_sphere');

  const res = await fetch(`${API_BASE}/api/process-photos`, {
    method: 'POST',
    body: formData,
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.detail || `Photo stitching failed (${res.status})`);
  }
  return data;
}

export async function loadSamplePhotos(): Promise<File[]> {
  const metaRes = await fetch(`${API_BASE}/api/sample-photos`);
  if (!metaRes.ok) {
    throw new Error('Failed to load sample photos list from backend.');
  }
  const meta = await metaRes.json();
  const fileNames: string[] = meta.files || [];

  const photoFiles: File[] = [];
  for (const name of fileNames) {
    const fileRes = await fetch(`${API_BASE}/api/sample-photos/${name}`);
    if (fileRes.ok) {
      const blob = await fileRes.blob();
      photoFiles.push(new File([blob], name, { type: 'image/jpeg' }));
    }
  }

  if (photoFiles.length === 0) {
    throw new Error('No sample photos could be downloaded from backend.');
  }

  return photoFiles;
}

export async function processVideo(
  videoFile: File,
  settings: ProcessingSettings
): Promise<StitchResult> {
  const formData = new FormData();
  formData.append('video', videoFile);
  formData.append('sample_interval_sec', settings.sample_interval_sec.toString());
  formData.append('max_frames', settings.max_frames.toString());
  formData.append('similarity_threshold', settings.similarity_threshold.toString());
  formData.append('min_blur_threshold', settings.min_blur_threshold.toString());

  if (settings.scale_width && settings.scale_width > 0) {
    formData.append('scale_width', settings.scale_width.toString());
  }

  const res = await fetch(`${API_BASE}/api/process-video`, {
    method: 'POST',
    body: formData,
  });

  const data = await res.json();

  if (!res.ok) {
    const errorMsg = data.detail || `Server error (${res.status})`;
    throw new Error(errorMsg);
  }

  return data;
}

export async function fetchResult(resultId: string): Promise<StitchResult> {
  const res = await fetch(`${API_BASE}/api/results/${resultId}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Failed to fetch result ${resultId}`);
  }
  return res.json();
}

export async function loadSampleVideoFile(): Promise<File> {
  const res = await fetch(`${API_BASE}/api/sample-video`);
  if (!res.ok) {
    throw new Error('Failed to load sample rotating camera video from backend.');
  }
  const blob = await res.blob();
  return new File([blob], 'sample_rotating_camera.mp4', { type: 'video/mp4' });
}

export function getPreviewUrl(resultId: string): string {
  return `${API_BASE}/api/results/${resultId}/preview`;
}

export function getDownloadUrl(resultId: string): string {
  return `${API_BASE}/api/results/${resultId}/download`;
}

export async function downloadPanorama(resultId: string): Promise<void> {
  const res = await fetch(getDownloadUrl(resultId));
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.detail || `Panorama download failed (${res.status}).`);
  }

  const contentType = res.headers.get('content-type') || '';
  if (!contentType.toLowerCase().includes('image/jpeg')) {
    throw new Error('The server did not return a JPEG panorama. Please try processing the photos again.');
  }

  const image = await res.blob();
  if (image.size === 0) {
    throw new Error('The server returned an empty panorama file. Please try processing the photos again.');
  }

  const objectUrl = URL.createObjectURL(image);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = `laveon_studio_360_panorama_${resultId.slice(0, 8)}.jpg`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}
