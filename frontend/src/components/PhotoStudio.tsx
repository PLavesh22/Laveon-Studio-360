import React, { useState, useRef, useEffect } from 'react';
import {
  Upload,
  Camera,
  Trash2,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  Layers,
  Info
} from 'lucide-react';
import type { PhotoCheckResult } from '../types';

interface PhotoStudioProps {
  photos: File[];
  onPhotosChange: (photos: File[]) => void;
  onOpenLiveCamera: () => void;
  onLoadSamplePhotos: () => void;
  isLoadingSample: boolean;
  isProcessing: boolean;
  checkResult: PhotoCheckResult | null;
  onRunQualityCheck: () => Promise<void>;
  isCheckingQuality: boolean;
}

const VALID_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];
const MAX_FILE_SIZE_MB = 100;

export const PhotoStudio: React.FC<PhotoStudioProps> = ({
  photos,
  onPhotosChange,
  onOpenLiveCamera,
  onLoadSamplePhotos,
  isLoadingSample,
  isProcessing,
  checkResult,
  onRunQualityCheck,
  isCheckingQuality,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [validationNotice, setValidationNotice] = useState<string | null>(null);
  const [dimensionsMap, setDimensionsMap] = useState<Record<string, { width: number; height: number }>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceIndexRef = useRef<number | null>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);

  // Clear notice after 6 seconds
  useEffect(() => {
    if (validationNotice) {
      const timer = setTimeout(() => setValidationNotice(null), 6000);
      return () => clearTimeout(timer);
    }
  }, [validationNotice]);

  const handleFiles = (newFiles: FileList | null) => {
    if (!newFiles || newFiles.length === 0) return;
    setValidationNotice(null);

    const added: File[] = [];
    let duplicateCount = 0;
    let invalidCount = 0;
    let oversizedCount = 0;

    const existingSignatures = new Set(photos.map((p) => `${p.name}-${p.size}`));

    Array.from(newFiles).forEach((file) => {
      const ext = '.' + file.name.split('.').pop()?.toLowerCase();
      if (!VALID_EXTENSIONS.includes(ext)) {
        invalidCount++;
        return;
      }

      if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
        oversizedCount++;
        return;
      }

      const sig = `${file.name}-${file.size}`;
      if (existingSignatures.has(sig)) {
        duplicateCount++;
        return;
      }

      existingSignatures.add(sig);
      added.push(file);
    });

    // Provide friendly, non-blocking feedback
    const notices: string[] = [];
    if (invalidCount > 0) notices.push(`${invalidCount} unsupported file(s) skipped (JPEG, PNG, WEBP only)`);
    if (duplicateCount > 0) notices.push(`${duplicateCount} duplicate photo(s) skipped`);
    if (oversizedCount > 0) notices.push(`${oversizedCount} photo(s) exceeded the ${MAX_FILE_SIZE_MB}MB limit`);

    if (notices.length > 0) {
      setValidationNotice(notices.join('. '));
    }

    if (added.length > 0) {
      onPhotosChange([...photos, ...added]);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (isProcessing) return;
    handleFiles(e.dataTransfer.files);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!isProcessing) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const removePhoto = (index: number) => {
    const updated = photos.filter((_, i) => i !== index);
    onPhotosChange(updated);
  };

  const triggerReplace = (index: number) => {
    replaceIndexRef.current = index;
    replaceInputRef.current?.click();
  };

  const handleReplaceFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files[0] && replaceIndexRef.current !== null) {
      const idx = replaceIndexRef.current;
      const updated = [...photos];
      updated[idx] = files[0];
      onPhotosChange(updated);
      replaceIndexRef.current = null;
      if (replaceInputRef.current) replaceInputRef.current.value = '';
    }
  };

  const handleKeyDownDropzone = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fileInputRef.current?.click();
    }
  };

  const handleImageLoad = (sig: string, e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    if (img.naturalWidth && img.naturalHeight) {
      setDimensionsMap((prev) => ({
        ...prev,
        [sig]: { width: img.naturalWidth, height: img.naturalHeight },
      }));
    }
  };

  return (
    <div className="photo-studio-panel" id="photo-workspace-panel" role="region" aria-label="360 Photo Workspace">
      {/* Hidden File Input for Replace */}
      <input
        type="file"
        ref={replaceInputRef}
        style={{ display: 'none' }}
        accept="image/jpeg,image/png,image/webp"
        onChange={handleReplaceFile}
        aria-hidden="true"
      />

      {/* Validation / Notice Banner */}
      {validationNotice && (
        <div className="coverage-notice-card" style={{ marginBottom: '14px', background: 'rgba(245, 158, 11, 0.08)', borderColor: 'rgba(245, 158, 11, 0.25)' }} role="alert">
          <Info size={18} color="#fbbf24" style={{ flexShrink: 0, marginTop: '2px' }} />
          <div className="notice-body" style={{ color: '#fef08a' }}>{validationNotice}</div>
        </div>
      )}

      {/* Main Upload Dropzone */}
      <div
        className={`upload-dropzone ${isDragging ? 'dragging' : ''} ${photos.length > 0 ? 'compact' : ''}`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={handleKeyDownDropzone}
        role="button"
        tabIndex={0}
        aria-label={photos.length === 0 ? 'Select or drop 360 photos' : 'Add more photos'}
      >
        <input
          type="file"
          ref={fileInputRef}
          style={{ display: 'none' }}
          accept="image/jpeg,image/png,image/webp"
          multiple
          onChange={(e) => handleFiles(e.target.files)}
          aria-hidden="true"
        />

        <div className="dropzone-content">
          <div className="icon-circle" aria-hidden="true">
            <Upload size={22} />
          </div>
          <div>
            <div className="dropzone-title">
              {photos.length === 0 ? 'Upload or Drop 360° Photos' : 'Add More Photos'}
            </div>
            <div className="dropzone-subtitle">
              JPEG, PNG, WEBP · Min 2 photos required (12–18 recommended for full 360° × 180° sphere)
            </div>
          </div>
        </div>
      </div>

      {/* Action Buttons Row */}
      <div className="photo-actions-row">
        <button
          type="button"
          className="btn btn-secondary btn-touch"
          onClick={onOpenLiveCamera}
          disabled={isProcessing}
          aria-label="Open camera capture with guide dots"
        >
          <Camera size={16} color="#06b6d4" aria-hidden="true" />
          <span>Capture with Camera</span>
        </button>

        <button
          type="button"
          className="btn btn-secondary btn-touch"
          onClick={onLoadSamplePhotos}
          disabled={isLoadingSample || isProcessing}
          aria-label="Load pre-calibrated 360 demo photos"
        >
          {isLoadingSample ? (
            <RefreshCw size={16} className="animate-spin" aria-hidden="true" />
          ) : (
            <Sparkles size={16} color="#fbbf24" aria-hidden="true" />
          )}
          <span>{isLoadingSample ? 'Loading Demo…' : 'Load 360° Demo Photos'}</span>
        </button>

        {photos.length > 0 && (
          <button
            type="button"
            className="btn btn-secondary btn-touch"
            style={{ color: '#fb7185' }}
            onClick={() => onPhotosChange([])}
            disabled={isProcessing}
            aria-label="Clear all selected photos"
          >
            <Trash2 size={15} aria-hidden="true" />
            <span>Clear ({photos.length})</span>
          </button>
        )}
      </div>

      {/* Too-Few Photos Warning */}
      {photos.length === 1 && (
        <div className="coverage-notice-card alert" style={{ marginTop: '12px' }}>
          <AlertTriangle size={18} color="#f43f5e" style={{ flexShrink: 0, marginTop: '2px' }} />
          <div className="notice-body" style={{ color: '#fecdd3' }}>
            1 photo selected. At least <strong>2 overlapping photos</strong> are required for stitching.
          </div>
        </div>
      )}

      {/* Photo Quality & Overlap Inspection Panel */}
      {photos.length >= 2 && (
        <div className="glass-panel quality-inspection-card" style={{ marginTop: '14px' }}>
          <div className="inspection-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Layers size={17} color="#06b6d4" aria-hidden="true" />
              <h4>Photo Quality & Overlap Pre-Check</h4>
            </div>

            <button
              type="button"
              className="btn btn-secondary btn-small"
              onClick={onRunQualityCheck}
              disabled={isCheckingQuality || isProcessing}
              aria-label="Run quality and overlap check"
            >
              {isCheckingQuality ? (
                <>
                  <RefreshCw size={13} className="animate-spin" aria-hidden="true" />
                  <span>Analyzing…</span>
                </>
              ) : (
                <>
                  <RefreshCw size={13} aria-hidden="true" />
                  <span>Analyze Overlap</span>
                </>
              )}
            </button>
          </div>

          {/* Quick Metrics Bar */}
          <div className="inspection-metrics-grid">
            <div className="metric-box">
              <span className="metric-label">Photos</span>
              <span className="metric-val">{photos.length}</span>
            </div>

            <div className="metric-box">
              <span className="metric-label">Overlap Quality</span>
              <span className="metric-val" style={{ color: checkResult && checkResult.overlap_quality_pct < 60 ? '#f59e0b' : '#10b981' }}>
                {checkResult ? `${checkResult.overlap_quality_pct}%` : 'Pending'}
              </span>
            </div>

            <div className="metric-box">
              <span className="metric-label">Avg Sharpness</span>
              <span className="metric-val">
                {checkResult ? `${checkResult.average_blur_score}` : 'Pending'}
              </span>
            </div>

            <div className="metric-box">
              <span className="metric-label">Est. Coverage</span>
              <span className="metric-val" style={{ color: checkResult?.is_360_complete ? '#10b981' : '#38bdf8' }}>
                {checkResult ? (checkResult.is_360_complete ? 'Full 360° Sphere' : `~${Math.round(checkResult.estimated_horizontal_deg)}° Sweep`) : (photos.length >= 12 ? '360° Candidate' : `${photos.length} Photos`)}
              </span>
            </div>
          </div>

          {/* Missing Areas Notice */}
          {checkResult && checkResult.missing_areas && checkResult.missing_areas.length > 0 && (
            <div className="missing-areas-box">
              <div className="missing-areas-title">
                <AlertTriangle size={14} color="#fbbf24" aria-hidden="true" />
                <span>Coverage & Overlap Insights:</span>
              </div>
              <ul className="missing-areas-list">
                {checkResult.missing_areas.map((msg: string, idx: number) => (
                  <li key={idx}>{msg}</li>
                ))}
              </ul>
            </div>
          )}

          {checkResult && checkResult.is_360_complete && (
            <div className="full-coverage-banner">
              <CheckCircle2 size={16} color="#10b981" aria-hidden="true" />
              <span>Full 360° × 180° coverage verified: Closed horizontal ring with zenith & nadir spherical coverage.</span>
            </div>
          )}
        </div>
      )}

      {/* Selected Photos Thumbnails Grid */}
      {photos.length > 0 && (
        <div className="photo-grid-container" style={{ marginTop: '14px' }}>
          <div className="photo-grid-header">
            <h4>Selected Photos ({photos.length})</h4>
            <span className="photo-grid-count">Click Retake to replace any frame</span>
          </div>

          <div className="photo-thumbnails-grid" role="list" aria-label="Uploaded photo list">
            {photos.map((file, idx) => {
              const previewUrl = URL.createObjectURL(file);
              const sig = `${file.name}-${file.size}`;
              const itemQuality = checkResult?.photos?.find((p) => p.index === idx);
              const dims = dimensionsMap[sig];

              return (
                <div key={`${file.name}-${idx}`} className="photo-card" role="listitem">
                  <div className="photo-thumb-wrapper">
                    <img
                      src={previewUrl}
                      alt={`Photo ${idx + 1}: ${file.name}`}
                      className="photo-thumb-img"
                      loading="lazy"
                      onLoad={(e) => handleImageLoad(sig, e)}
                    />

                    <div className="photo-card-badge-top">
                      <span className="photo-num-badge">#{idx + 1}</span>
                      {itemQuality && (
                        <span className={`photo-status-badge ${itemQuality.is_blurry ? 'blurry' : 'sharp'}`}>
                          {itemQuality.is_blurry ? 'Blurry' : 'Sharp'}
                        </span>
                      )}
                    </div>

                    <div className="photo-card-actions">
                      <button
                        type="button"
                        className="photo-action-btn retake"
                        onClick={() => triggerReplace(idx)}
                        title="Replace or retake this photo"
                        aria-label={`Replace photo ${idx + 1}`}
                      >
                        <RefreshCw size={12} aria-hidden="true" />
                        <span>Retake</span>
                      </button>

                      <button
                        type="button"
                        className="photo-action-btn delete"
                        onClick={() => removePhoto(idx)}
                        title="Remove photo"
                        aria-label={`Remove photo ${idx + 1}: ${file.name}`}
                      >
                        <Trash2 size={12} aria-hidden="true" />
                      </button>
                    </div>
                  </div>

                  <div className="photo-card-info">
                    <div className="photo-card-name" title={file.name}>
                      {file.name}
                    </div>
                    <div className="photo-card-sub">
                      {(file.size / (1024 * 1024)).toFixed(1)} MB
                      {dims ? ` · ${dims.width}×${dims.height}` : ''}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default PhotoStudio;
