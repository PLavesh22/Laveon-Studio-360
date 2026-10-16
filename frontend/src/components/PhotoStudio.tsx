import React, { useState, useRef } from 'react';
import {
  Upload,
  Camera,
  Trash2,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  Layers
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceIndexRef = useRef<number | null>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = (newFiles: FileList | null) => {
    if (!newFiles || newFiles.length === 0) return;
    const validExtensions = ['.jpg', '.jpeg', '.png', '.webp'];
    const added: File[] = [];

    Array.from(newFiles).forEach((f) => {
      const ext = '.' + f.name.split('.').pop()?.toLowerCase();
      if (validExtensions.includes(ext)) {
        added.push(f);
      }
    });

    if (added.length > 0) {
      onPhotosChange([...photos, ...added]);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
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

  return (
    <div className="photo-studio-panel">
      {/* Hidden File Input for Replace */}
      <input
        type="file"
        ref={replaceInputRef}
        style={{ display: 'none' }}
        accept="image/jpeg,image/png,image/webp"
        onChange={handleReplaceFile}
      />

      {/* Main Upload Dropzone / Action Header */}
      <div
        className={`upload-dropzone ${isDragging ? 'dragging' : ''} ${photos.length > 0 ? 'compact' : ''}`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          type="file"
          ref={fileInputRef}
          style={{ display: 'none' }}
          accept="image/jpeg,image/png,image/webp"
          multiple
          onChange={(e) => handleFiles(e.target.files)}
        />

        <div className="dropzone-content">
          <div className="icon-circle">
            <Upload size={24} color="#06b6d4" />
          </div>
          <div>
            <div className="dropzone-title">
              {photos.length === 0 ? 'Select or Drag & Drop Multiple Photos' : 'Add More Photos'}
            </div>
            <div className="dropzone-subtitle">
              Supports JPEG, PNG, WEBP. Minimum 2 photos; 12–18 photos recommended for full 360° × 180° sphere.
            </div>
          </div>
        </div>
      </div>

      {/* Action Buttons Row */}
      <div className="photo-actions-row">
        <button
          className="btn btn-secondary btn-touch"
          onClick={onOpenLiveCamera}
          disabled={isProcessing}
        >
          <Camera size={16} color="#06b6d4" />
          <span>Capture with Camera</span>
        </button>

        <button
          className="btn btn-secondary btn-touch"
          onClick={onLoadSamplePhotos}
          disabled={isLoadingSample || isProcessing}
        >
          {isLoadingSample ? (
            <RefreshCw size={16} className="animate-spin" />
          ) : (
            <Sparkles size={16} color="#fbbf24" />
          )}
          <span>Load 360° Demo Photos</span>
        </button>

        {photos.length > 0 && (
          <button
            className="btn btn-secondary btn-touch"
            style={{ color: '#f43f5e' }}
            onClick={() => onPhotosChange([])}
            disabled={isProcessing}
          >
            <Trash2 size={16} />
            <span>Clear All ({photos.length})</span>
          </button>
        )}
      </div>

      {/* Photo Quality & Overlap Inspection Section */}
      {photos.length > 0 && (
        <div className="glass-panel quality-inspection-card">
          <div className="inspection-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Layers size={18} color="#06b6d4" />
              <h4>Photo Quality & Overlap Pre-Check</h4>
            </div>

            <button
              className="btn btn-secondary btn-small"
              onClick={onRunQualityCheck}
              disabled={isCheckingQuality || isProcessing}
            >
              {isCheckingQuality ? (
                <>
                  <RefreshCw size={14} className="animate-spin" />
                  <span>Analyzing...</span>
                </>
              ) : (
                <>
                  <RefreshCw size={14} />
                  <span>Check Overlap & Blur</span>
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
                {checkResult ? `${checkResult.overlap_quality_pct}%` : 'Pending Check'}
              </span>
            </div>

            <div className="metric-box">
              <span className="metric-label">Avg Sharpness</span>
              <span className="metric-val">
                {checkResult ? `${checkResult.average_blur_score}` : 'Pending Check'}
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
                <AlertTriangle size={15} color="#fbbf24" />
                <span>Coverage & Overlap Notices:</span>
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
              <CheckCircle2 size={16} color="#10b981" />
              <span>Full 360° × 180° coverage verified: Horizontal loop is closed with upper and lower spherical coverage.</span>
            </div>
          )}
        </div>
      )}

      {/* Selected Photos Grid */}
      {photos.length > 0 && (
        <div className="photo-grid-container">
          <div className="photo-grid-header">
            <h4>Captured / Selected Photos ({photos.length})</h4>
            <span className="photo-grid-count">Click retake to replace any blurry shot</span>
          </div>

          <div className="photo-thumbnails-grid">
            {photos.map((file, idx) => {
              const previewUrl = URL.createObjectURL(file);
              const itemQuality = checkResult?.photos?.find((p) => p.index === idx);

              return (
                <div key={`${file.name}-${idx}`} className="photo-card">
                  <div className="photo-thumb-wrapper">
                    <img src={previewUrl} alt={`Photo ${idx + 1}`} className="photo-thumb-img" />

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
                        className="photo-action-btn retake"
                        onClick={() => triggerReplace(idx)}
                        title="Replace or retake this photo"
                      >
                        <RefreshCw size={13} />
                        <span>Retake</span>
                      </button>

                      <button
                        className="photo-action-btn delete"
                        onClick={() => removePhoto(idx)}
                        title="Remove photo"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  <div className="photo-card-info">
                    <div className="photo-card-name" title={file.name}>
                      {file.name}
                    </div>
                    <div className="photo-card-sub">
                      {(file.size / (1024 * 1024)).toFixed(2)} MB
                      {itemQuality && itemQuality.overlaps_with && itemQuality.overlaps_with.length > 0 && (
                        <span> • Overlaps #{itemQuality.overlaps_with.map((i: number) => i + 1).join(', #')}</span>
                      )}
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
