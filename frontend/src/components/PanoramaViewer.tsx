import React, { useState, useRef, useEffect } from 'react';
import {
  Download,
  ZoomIn,
  ZoomOut,
  Maximize2,
  RotateCcw,
  AlertTriangle,
  ExternalLink,
  Info,
  Sparkles
} from 'lucide-react';
import type { StitchResult } from '../types';
import { downloadPanorama, getPreviewUrl } from '../services/api';

interface PanoramaViewerProps {
  result: StitchResult | null;
  onRetry: () => void;
  isProcessing: boolean;
}

export const PanoramaViewer: React.FC<PanoramaViewerProps> = ({
  result,
  onRetry,
  isProcessing
}) => {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    setPreviewError(null);
    setDownloadError(null);
    setIsDownloading(false);
  }, [result?.result_id]);

  const handleDownload = async () => {
    if (!result || result.status !== 'success' || isDownloading) return;
    setIsDownloading(true);
    setDownloadError(null);
    try {
      await downloadPanorama(result.result_id);
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : 'Panorama download failed. Please try again.');
    } finally {
      setIsDownloading(false);
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoom <= 1) return;
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPan({
      x: e.clientX - dragStartRef.current.x,
      y: e.clientY - dragStartRef.current.y,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleZoomIn = () => setZoom((prev) => Math.min(prev + 0.35, 4));
  const handleZoomOut = () => setZoom((prev) => Math.max(prev - 0.35, 0.5));
  const handleResetZoom = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  if (isProcessing) {
    return (
      <div className="glass-panel panorama-viewport">
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <Sparkles size={40} className="animate-spin" color="#06b6d4" style={{ margin: '0 auto 16px' }} />
          <h3 style={{ fontSize: '1.25rem', marginBottom: '8px' }}>OpenCV Stitching In Progress...</h3>
          <p style={{ color: '#94a3b8', maxWidth: '420px', margin: '0 auto', fontSize: '0.9rem' }}>
            Extracting candidate rotational frames, verifying visual overlap, and calculating projective homography matrices.
          </p>
        </div>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="glass-panel panorama-viewport">
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <div
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
              color: '#64748b'
            }}
          >
            <Maximize2 size={28} />
          </div>
          <h3 style={{ fontSize: '1.2rem', marginBottom: '8px', color: '#cbd5e1' }}>
            Panorama Preview Canvas
          </h3>
          <p style={{ color: '#64748b', maxWidth: '420px', margin: '0 auto', fontSize: '0.88rem' }}>
            Upload a video recorded by rotating your camera at one fixed location and click Start Stitching. Your high-resolution panorama will appear here.
          </p>
        </div>
      </div>
    );
  }

  // Handle Stitching Failure (Never show a fake image!)
  if (result.status === 'failed') {
    return (
      <div className="glass-panel" style={{ padding: '32px' }}>
        <div className="coverage-notice-card alert" style={{ marginBottom: '24px' }}>
          <AlertTriangle size={24} color="#f43f5e" style={{ flexShrink: 0 }} />
          <div>
            <div className="notice-title" style={{ color: '#f43f5e', fontSize: '1.05rem' }}>
              Stitching Unsuccessful ({result.error_code || 'OpenCV Error'})
            </div>
            <div className="notice-body" style={{ color: '#fecdd3', marginTop: '4px' }}>
              {result.message}
            </div>
          </div>
        </div>

        {/* Actionable Computer Vision Explanations */}
        {result.troubleshooting_tips && result.troubleshooting_tips.length > 0 && (
          <div style={{ marginBottom: '24px' }}>
            <h4 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '12px', color: '#f8fafc' }}>
              Recommended Troubleshooting Steps:
            </h4>
            <ul style={{ paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.86rem', color: '#94a3b8' }}>
              {result.troubleshooting_tips.map((tip, idx) => (
                <li key={idx} style={{ lineHeight: 1.45 }}>{tip}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Diagnostics & Stats from extraction */}
        {result.frame_stats && (
          <div className="metrics-grid" style={{ marginBottom: '24px' }}>
            <div className="metric-card">
              <div className="metric-label">Extracted Frames</div>
              <div className="metric-value">{result.frame_stats.extracted_count}</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Selected Frames</div>
              <div className="metric-value">{result.frame_stats.selected_count}</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Duplicate Frames Filtered</div>
              <div className="metric-value">{result.frame_stats.discarded_redundant}</div>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
          <button className="btn btn-primary" onClick={onRetry}>
            <RotateCcw size={16} />
            <span>Adjust Settings & Retry</span>
          </button>
        </div>
      </div>
    );
  }

  // Successful Result
  const previewUrl = getPreviewUrl(result.result_id);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Interactive Panorama Canvas */}
      <div
        className="glass-panel panorama-viewport"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <div
          className="panorama-img-wrapper"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          }}
        >
          {previewError ? (
            <div role="alert" style={{ padding: '32px', textAlign: 'center', color: '#fecdd3' }}>
              <AlertTriangle size={24} style={{ marginBottom: '8px' }} />
              <p>{previewError}</p>
            </div>
          ) : (
            <img
              src={previewUrl}
              alt="Stitched Panorama Result"
              className="panorama-img"
              draggable={false}
              onError={() => setPreviewError('The stitched panorama could not be loaded from the backend. Please retry processing.')}
            />
          )}
        </div>

        {/* Floating Viewport Controls */}
        <div className="viewer-toolbar">
          <button className="tool-btn" onClick={handleZoomIn} title="Zoom in">
            <ZoomIn size={18} />
          </button>
          <button className="tool-btn" onClick={handleZoomOut} title="Zoom out">
            <ZoomOut size={18} />
          </button>
          <button className="tool-btn" onClick={handleResetZoom} title="Reset zoom (100%)">
            <RotateCcw size={16} />
          </button>
          <span style={{ width: '1px', height: '18px', background: 'rgba(255,255,255,0.1)' }}></span>
          <a
            href={previewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="tool-btn"
            title="Open full resolution in new tab"
          >
            <ExternalLink size={16} />
          </a>
        </div>
      </div>

      {/* Coverage Honesty Banner (Critical Feature Requirement) */}
      <div className="coverage-notice-card">
        <Info size={20} className="notice-icon-box" />
        <div>
          <div className="notice-title">
            Wide Horizontal Panorama (Planar/Cylindrical Projection)
          </div>
          <div className="notice-body">
            {result.panorama_coverage_notice}
          </div>
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-label">Resolution</div>
          <div className="metric-value">
            {result.panorama_width} × {result.panorama_height} <span style={{ fontSize: '0.8rem', color: '#64748b' }}>px</span>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-label">Aspect Ratio</div>
          <div className="metric-value">
            {result.panorama_aspect_ratio}:1
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-label">Frames Stitched</div>
          <div className="metric-value">
            {result.frame_stats?.selected_count} <span style={{ fontSize: '0.8rem', color: '#64748b' }}>of {result.frame_stats?.extracted_count}</span>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-label">Stitching Time</div>
          <div className="metric-value">
            {result.processing_time_sec}s
          </div>
        </div>
      </div>

      {/* Action / Export Buttons */}
      <div className="glass-panel" style={{ padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>Ready for Export</div>
          <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
            High-fidelity JPEG output with balanced compression and seam blending.
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleDownload}
            disabled={result.status !== 'success' || isDownloading}
            aria-busy={isDownloading}
          >
            <Download size={16} />
            <span>{isDownloading ? 'Preparing JPEG…' : 'Download Panorama'}</span>
          </button>
        </div>
        {downloadError && (
          <div role="alert" className="notice-body" style={{ color: '#fecdd3', flexBasis: '100%', textAlign: 'right' }}>
            {downloadError}
          </div>
        )}
      </div>
    </div>
  );
};
