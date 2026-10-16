import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Download,
  ZoomIn,
  ZoomOut,
  Maximize,
  Minimize,
  RotateCcw,
  AlertTriangle,
  ExternalLink,
  Info,
  Sparkles,
  Compass,
  FileCheck
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
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef({ x: 0, y: 0 });

  // Reset zoom & pan when a new result arrives
  const lastResultIdRef = useRef<string | null>(null);
  if (result?.result_id !== lastResultIdRef.current) {
    lastResultIdRef.current = result?.result_id || null;
    if (zoom !== 1) setZoom(1);
    if (pan.x !== 0 || pan.y !== 0) setPan({ x: 0, y: 0 });
    if (previewError) setPreviewError(null);
    if (downloadError) setDownloadError(null);
  }

  // Handle Fullscreen change listener
  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        if (containerRef.current) {
          await containerRef.current.requestFullscreen();
        }
      } else {
        await document.exitFullscreen();
      }
    } catch (err) {
      console.warn('Fullscreen request denied:', err);
    }
  }, []);

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

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (e.deltaY < 0) {
      setZoom((prev) => Math.min(prev + 0.25, 4));
    } else {
      setZoom((prev) => {
        const next = Math.max(prev - 0.25, 1);
        if (next === 1) setPan({ x: 0, y: 0 });
        return next;
      });
    }
  };

  const handleZoomIn = () => setZoom((prev) => Math.min(prev + 0.35, 4));
  const handleZoomOut = () => {
    setZoom((prev) => {
      const next = Math.max(prev - 0.35, 1);
      if (next === 1) setPan({ x: 0, y: 0 });
      return next;
    });
  };

  const handleResetZoom = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  // State 1: Active Stitching Processing
  if (isProcessing) {
    return (
      <div className="glass-panel panorama-viewport" role="region" aria-label="Panorama Stitching Status">
        <div style={{ textAlign: 'center', padding: '48px 24px', maxWidth: '440px' }}>
          <div
            style={{
              width: '60px',
              height: '60px',
              borderRadius: '50%',
              background: 'rgba(6, 182, 212, 0.12)',
              border: '1px solid rgba(6, 182, 212, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 18px',
              color: '#06b6d4',
            }}
          >
            <Sparkles size={28} className="animate-spin" aria-hidden="true" />
          </div>
          <h3 style={{ fontSize: '1.2rem', marginBottom: '8px', color: '#f8fafc' }}>
            OpenCV Panorama Stitching in Progress
          </h3>
          <p style={{ color: '#94a3b8', fontSize: '0.86rem', lineHeight: 1.5 }}>
            Computing projective homographies, aligning visual keypoints, and blending spherical seams onto a balanced canvas.
          </p>
        </div>
      </div>
    );
  }

  // State 2: Empty Canvas Before Processing
  if (!result) {
    return (
      <div className="glass-panel panorama-viewport" role="region" aria-label="Empty Panorama Canvas">
        <div style={{ textAlign: 'center', padding: '48px 24px', maxWidth: '440px' }}>
          <div
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 18px',
              color: '#64748b'
            }}
            aria-hidden="true"
          >
            <Compass size={30} />
          </div>
          <h3 style={{ fontSize: '1.15rem', marginBottom: '8px', color: '#e2e8f0' }}>
            Interactive Panorama Canvas
          </h3>
          <p style={{ color: '#64748b', fontSize: '0.86rem', lineHeight: 1.5, marginBottom: '14px' }}>
            Add 2 or more overlapping photos or upload a rotational camera sweep on the left, then click <strong>Start Stitching</strong>.
          </p>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.76rem', color: '#06b6d4', background: 'rgba(6, 182, 212, 0.08)', padding: '5px 12px', borderRadius: '9999px', border: '1px solid rgba(6, 182, 212, 0.2)' }}>
            <Sparkles size={13} />
            <span>Click &apos;Load 360° Demo Photos&apos; to test immediately</span>
          </div>
        </div>
      </div>
    );
  }

  // State 3: Failure with Actionable Troubleshooting Tips
  if (result.status === 'failed') {
    return (
      <div className="glass-panel" style={{ padding: '28px' }} role="alert" aria-label="Stitching Error Details">
        <div className="coverage-notice-card alert" style={{ marginBottom: '20px' }}>
          <AlertTriangle size={22} color="#f43f5e" style={{ flexShrink: 0, marginTop: '2px' }} aria-hidden="true" />
          <div>
            <div className="notice-title" style={{ color: '#f43f5e', fontSize: '1rem' }}>
              Stitching Unsuccessful ({result.error_code || 'Feature Match Error'})
            </div>
            <div className="notice-body" style={{ color: '#fecdd3', marginTop: '4px' }}>
              {result.message}
            </div>
          </div>
        </div>

        {/* Actionable Computer Vision Tips */}
        {result.troubleshooting_tips && result.troubleshooting_tips.length > 0 && (
          <div style={{ marginBottom: '22px' }}>
            <h4 style={{ fontSize: '0.92rem', fontWeight: 600, marginBottom: '10px', color: '#f8fafc' }}>
              Troubleshooting Recommendations:
            </h4>
            <ul style={{ paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '7px', fontSize: '0.84rem', color: '#94a3b8' }}>
              {result.troubleshooting_tips.map((tip, idx) => (
                <li key={idx} style={{ lineHeight: 1.45 }}>{tip}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Diagnostics from Frame Extraction */}
        {result.frame_stats && (
          <div className="metrics-grid" style={{ marginBottom: '22px' }}>
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

        <button type="button" className="btn btn-primary" onClick={onRetry}>
          <RotateCcw size={15} aria-hidden="true" />
          <span>Adjust Settings & Retry</span>
        </button>
      </div>
    );
  }

  // State 4: Successful Panorama Output
  const previewUrl = getPreviewUrl(result.result_id);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }} role="region" aria-label="Stitched Panorama Output">
      {/* Interactive Panorama Canvas */}
      <div
        ref={containerRef}
        className="glass-panel panorama-viewport"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        tabIndex={0}
        aria-label="Interactive panorama canvas: click and drag to pan, scroll to zoom"
      >
        <div
          className="panorama-img-wrapper"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          }}
        >
          {previewError ? (
            <div role="alert" style={{ padding: '32px', textAlign: 'center', color: '#fecdd3' }}>
              <AlertTriangle size={24} style={{ marginBottom: '8px' }} aria-hidden="true" />
              <p>{previewError}</p>
            </div>
          ) : (
            <img
              src={previewUrl}
              alt="Stitched 360 Panorama Result"
              className="panorama-img"
              draggable={false}
              onError={() => setPreviewError('The stitched panorama could not be loaded from the backend. Please retry processing.')}
            />
          )}
        </div>

        {/* Floating Viewport Controls */}
        <div className="viewer-toolbar" role="toolbar" aria-label="Viewer controls">
          <button type="button" className="tool-btn" onClick={handleZoomIn} title="Zoom in (+)" aria-label="Zoom In">
            <ZoomIn size={17} aria-hidden="true" />
          </button>
          <button type="button" className="tool-btn" onClick={handleZoomOut} title="Zoom out (-)" aria-label="Zoom Out">
            <ZoomOut size={17} aria-hidden="true" />
          </button>
          <button type="button" className="tool-btn" onClick={handleResetZoom} title="Reset zoom (100%)" aria-label="Reset Zoom">
            <RotateCcw size={15} aria-hidden="true" />
          </button>

          <span style={{ width: '1px', height: '16px', background: 'rgba(255,255,255,0.12)' }} aria-hidden="true"></span>

          <button
            type="button"
            className="tool-btn"
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
            aria-label={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
          >
            {isFullscreen ? <Minimize size={16} aria-hidden="true" /> : <Maximize size={16} aria-hidden="true" />}
          </button>

          <a
            href={previewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="tool-btn"
            title="Open full resolution JPEG in new tab"
            aria-label="Open full resolution in new tab"
          >
            <ExternalLink size={15} aria-hidden="true" />
          </a>
        </div>
      </div>

      {/* Coverage & Projection Notice */}
      <div className="coverage-notice-card">
        <Info size={18} className="notice-icon-box" aria-hidden="true" />
        <div>
          <div className="notice-title">
            {result.panorama_type || 'Equirectangular Spherical Projection'}
          </div>
          <div className="notice-body">
            {result.panorama_coverage_notice || result.message}
          </div>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-label">Resolution</div>
          <div className="metric-value">
            {result.panorama_width} × {result.panorama_height} <span style={{ fontSize: '0.75rem', color: '#64748b' }}>px</span>
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
            {result.frame_stats?.selected_count} <span style={{ fontSize: '0.75rem', color: '#64748b' }}>of {result.frame_stats?.extracted_count}</span>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-label">Processing Time</div>
          <div className="metric-value">
            {result.processing_time_sec}s
          </div>
        </div>
      </div>

      {/* Export / Download Panel */}
      <div className="glass-panel" style={{ padding: '18px 22px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: '0.94rem', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <FileCheck size={16} color="#10b981" aria-hidden="true" />
            <span>Panorama Ready for Export</span>
          </div>
          <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: '2px' }}>
            High-fidelity JPEG output with seam multi-band blending.
          </div>
        </div>

        <button
          type="button"
          className="btn btn-primary"
          onClick={handleDownload}
          disabled={result.status !== 'success' || isDownloading}
          aria-busy={isDownloading}
          aria-label="Download Full Resolution Panorama JPEG"
        >
          <Download size={15} aria-hidden="true" />
          <span>{isDownloading ? 'Preparing JPEG…' : 'Download Panorama'}</span>
        </button>

        {downloadError && (
          <div role="alert" className="notice-body" style={{ color: '#fecdd3', width: '100%', textAlign: 'right' }}>
            {downloadError}
          </div>
        )}
      </div>
    </div>
  );
};

export default PanoramaViewer;
