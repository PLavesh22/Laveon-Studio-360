import React, { useRef, useState } from 'react';
import { UploadCloud, Film, X, AlertCircle, Clock, HardDrive } from 'lucide-react';

interface VideoUploadProps {
  selectedFile: File | null;
  onFileSelect: (file: File) => void;
  onClearFile: () => void;
  isProcessing: boolean;
  disabled?: boolean;
  onLoadDemoVideo?: () => void;
  isLoadingDemo?: boolean;
}

const ALLOWED_EXTENSIONS = ['.mp4', '.mov', '.avi', '.m4v'];
const MAX_SIZE_MB = 250;

export const VideoUpload: React.FC<VideoUploadProps> = ({
  selectedFile,
  onFileSelect,
  onClearFile,
  isProcessing,
  disabled,
  onLoadDemoVideo,
  isLoadingDemo = false
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [videoDuration, setVideoDuration] = useState<number | null>(null);
  const [videoResolution, setVideoResolution] = useState<{ width: number; height: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoPreviewRef = useRef<HTMLVideoElement>(null);

  const validateAndSelect = (file: File) => {
    setErrorMessage(null);
    setVideoDuration(null);
    setVideoResolution(null);

    // Check extension
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      setErrorMessage(`Invalid file format '${ext}'. Please upload an MP4, MOV, or AVI video.`);
      return;
    }

    // Check file size
    const sizeMb = file.size / (1024 * 1024);
    if (sizeMb > MAX_SIZE_MB) {
      setErrorMessage(`File size (${sizeMb.toFixed(1)} MB) exceeds the ${MAX_SIZE_MB} MB limit.`);
      return;
    }

    if (file.size === 0) {
      setErrorMessage('The selected file is empty (0 bytes).');
      return;
    }

    onFileSelect(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled && !isProcessing) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (disabled || isProcessing) return;

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      validateAndSelect(e.dataTransfer.files[0]);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      validateAndSelect(e.target.files[0]);
    }
  };

  const handleKeyDownDropzone = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fileInputRef.current?.click();
    }
  };

  const handleVideoLoadedMetadata = () => {
    if (videoPreviewRef.current) {
      setVideoDuration(videoPreviewRef.current.duration);
      setVideoResolution({
        width: videoPreviewRef.current.videoWidth,
        height: videoPreviewRef.current.videoHeight,
      });
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024 * 1024) {
      return (bytes / 1024).toFixed(1) + ' KB';
    }
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const formatDuration = (sec: number | null) => {
    if (sec === null || isNaN(sec)) return 'Calculating…';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="glass-panel" style={{ padding: '22px' }} id="video-workspace-panel" role="region" aria-label="Video Sweep Workspace">
      <div className="section-title-wrap">
        <h3 className="section-title">
          <Film size={18} color="#06b6d4" aria-hidden="true" />
          <span>1. Rotational Video Source</span>
        </h3>
        <span className="section-badge">MP4, MOV, AVI</span>
      </div>

      {/* Error Alert */}
      {errorMessage && (
        <div className="coverage-notice-card alert" style={{ marginBottom: '14px' }} role="alert">
          <AlertCircle size={18} color="#f43f5e" style={{ flexShrink: 0, marginTop: '2px' }} aria-hidden="true" />
          <div>
            <div className="notice-title" style={{ color: '#f43f5e' }}>Invalid Video</div>
            <div className="notice-body">{errorMessage}</div>
          </div>
        </div>
      )}

      {!selectedFile ? (
        /* Upload Drag and Drop Area */
        <div
          className={`dropzone-container ${isDragging ? 'is-dragging' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={handleKeyDownDropzone}
          role="button"
          tabIndex={0}
          aria-label="Upload rotational sweep video"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".mp4,.mov,.avi,.m4v,video/*"
            style={{ display: 'none' }}
            onChange={handleInputChange}
            disabled={disabled || isProcessing}
            aria-hidden="true"
          />
          <div className="upload-icon-circle" aria-hidden="true">
            <UploadCloud size={26} />
          </div>
          <div className="dropzone-prompt">Drop your rotational video here</div>
          <div className="dropzone-hint">
            or click to browse from device · Max {MAX_SIZE_MB}MB
          </div>
          <p style={{ marginTop: '12px', fontSize: '0.78rem', color: '#64748b', lineHeight: 1.4 }}>
            Tip: Rotate smoothly around the camera lens axis for optimal feature matching.
          </p>

          {onLoadDemoVideo && (
            <button
              type="button"
              className="btn btn-secondary btn-touch"
              style={{ marginTop: '14px', alignSelf: 'center' }}
              onClick={(e) => {
                e.stopPropagation();
                onLoadDemoVideo();
              }}
              disabled={isLoadingDemo || isProcessing}
              aria-label="Load pre-rendered 360 rotating camera sample video"
            >
              <span>{isLoadingDemo ? 'Loading Sample Video…' : 'Load Sample 360 Video'}</span>
            </button>
          )}
        </div>
      ) : (
        /* Video Selected & Preview Card */
        <div className="video-preview-card">
          <video
            ref={videoPreviewRef}
            src={URL.createObjectURL(selectedFile)}
            controls
            className="video-player-frame"
            onLoadedMetadata={handleVideoLoadedMetadata}
            aria-label="Selected rotation video preview"
          />
          <div className="video-meta-bar">
            <div>
              <div className="file-name-text" title={selectedFile.name}>
                {selectedFile.name}
              </div>
              <div className="file-details-chips" style={{ marginTop: '4px' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <HardDrive size={12} aria-hidden="true" />
                  {formatFileSize(selectedFile.size)}
                </span>
                <span>·</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <Clock size={12} aria-hidden="true" />
                  {formatDuration(videoDuration)}
                </span>
                {videoResolution && (
                  <>
                    <span>·</span>
                    <span>{videoResolution.width}×{videoResolution.height}</span>
                  </>
                )}
              </div>
            </div>

            <button
              type="button"
              className="btn btn-outline"
              style={{ padding: '6px 12px', fontSize: '0.8rem', minHeight: '36px' }}
              onClick={onClearFile}
              disabled={isProcessing}
              title="Remove this video and choose another"
              aria-label="Change selected video"
            >
              <X size={14} aria-hidden="true" />
              <span>Change</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default VideoUpload;
