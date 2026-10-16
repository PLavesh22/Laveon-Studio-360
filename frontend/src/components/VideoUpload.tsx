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
    if (sec === null || isNaN(sec)) return 'Calculating...';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="glass-panel" style={{ padding: '24px' }}>
      <div className="section-title-wrap">
        <h3 className="section-title">
          <Film size={20} color="#06b6d4" />
          <span>1. Video Source</span>
        </h3>
        <span className="section-badge">MP4, MOV, AVI</span>
      </div>

      {/* Error Alert */}
      {errorMessage && (
        <div
          className="coverage-notice-card alert"
          style={{ marginBottom: '16px' }}
        >
          <AlertCircle size={20} color="#f43f5e" />
          <div>
            <div className="notice-title" style={{ color: '#f43f5e' }}>Invalid File</div>
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
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".mp4,.mov,.avi,.m4v,video/*"
            style={{ display: 'none' }}
            onChange={handleInputChange}
            disabled={disabled || isProcessing}
          />
          <div className="upload-icon-circle">
            <UploadCloud size={30} />
          </div>
          <div className="dropzone-prompt">Drop your rotation video here</div>
          <div className="dropzone-hint">
            or click to browse your desktop · Max {MAX_SIZE_MB}MB
          </div>
          <p style={{ marginTop: '14px', fontSize: '0.78rem', color: '#64748b' }}>
            Tip: A slow, steady 360° or wide sweep with continuous overlap produces the cleanest panorama.
          </p>

          {onLoadDemoVideo && (
            <button
              type="button"
              className="btn btn-secondary"
              style={{ marginTop: '14px', alignSelf: 'center' }}
              onClick={(e) => {
                e.stopPropagation();
                onLoadDemoVideo();
              }}
              disabled={isLoadingDemo || isProcessing}
            >
              <span>{isLoadingDemo ? 'Loading Sample Video...' : 'Load Sample 360 Video'}</span>
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
          />
          <div className="video-meta-bar">
            <div>
              <div className="file-name-text" title={selectedFile.name}>
                {selectedFile.name}
              </div>
              <div className="file-details-chips" style={{ marginTop: '4px' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <HardDrive size={12} />
                  {formatFileSize(selectedFile.size)}
                </span>
                <span>·</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <Clock size={12} />
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
              className="btn btn-outline"
              style={{ padding: '6px 12px', fontSize: '0.8rem' }}
              onClick={onClearFile}
              disabled={isProcessing}
              title="Remove this video and pick another"
            >
              <X size={14} />
              <span>Change</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
