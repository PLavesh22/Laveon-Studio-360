import React from 'react';
import { Camera, Film, BookOpen, AlertCircle } from 'lucide-react';
import type { HealthData } from '../types';

interface HeaderProps {
  activeTab: 'photo' | 'video';
  onTabChange: (tab: 'photo' | 'video') => void;
  health?: HealthData | null;
  healthLoading?: boolean;
  onRefreshHealth?: () => void;
  onOpenGuide: () => void;
  onOpenLiveCamera?: () => void;
  isProcessing: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  onTabChange,
  health,
  onOpenGuide,
  onOpenLiveCamera,
  isProcessing
}) => {
  const isOnline = health && health.status === 'ok';

  return (
    <header className="glass-panel app-header" role="banner" aria-label="Laveon Studio 360 Header">
      {/* Brand Section (Left on Desktop) */}
      <div className="brand-wrapper">
        <div className="brand-icon-box" aria-hidden="true">
          <Camera size={22} />
        </div>
        <div>
          <h1 className="brand-title">
            <span className="gradient-text-cyan">Laveon Studio 360</span>
          </h1>
          <p className="brand-subtitle">
            360° × 180° Panoramic Photo & Video Stitching Studio
          </p>
        </div>
      </div>

      {/* Primary Mode Selector (Center on Desktop) */}
      <nav aria-label="Workspace Modes">
        <div className="workflow-tab-switcher" role="tablist" aria-label="Stitching Modes">
          <button
            type="button"
            className={`workflow-tab-btn ${activeTab === 'photo' ? 'active' : ''}`}
            onClick={() => onTabChange('photo')}
            role="tab"
            aria-selected={activeTab === 'photo'}
            aria-controls="photo-workspace-panel"
            disabled={isProcessing}
            id="tab-photo-mode"
          >
            <Camera size={15} aria-hidden="true" />
            <span>360° Photos (Primary)</span>
          </button>

          <button
            type="button"
            className={`workflow-tab-btn ${activeTab === 'video' ? 'active' : ''}`}
            onClick={() => onTabChange('video')}
            role="tab"
            aria-selected={activeTab === 'video'}
            aria-controls="video-workspace-panel"
            disabled={isProcessing}
            id="tab-video-mode"
          >
            <Film size={15} aria-hidden="true" />
            <span>Video Sweep</span>
          </button>
        </div>
      </nav>

      {/* Primary & Secondary Actions (Right on Desktop) */}
      <div className="header-actions">
        {/* Quick Camera Capture Action */}
        {activeTab === 'photo' && onOpenLiveCamera && (
          <button
            type="button"
            className="btn btn-primary btn-touch btn-header-action"
            onClick={onOpenLiveCamera}
            disabled={isProcessing}
            title="Open camera with multi-tilt 360 guide dots"
            aria-label="Open 360 Camera Capture"
          >
            <Camera size={15} aria-hidden="true" />
            <span>Open 360 Camera</span>
          </button>
        )}

        {/* Capture Guide Trigger */}
        <button
          type="button"
          className="btn btn-outline btn-touch btn-header-action"
          onClick={onOpenGuide}
          title="Guide on capturing seamless 360° panoramas"
          aria-label="Open Panorama Capture Guide"
        >
          <BookOpen size={15} aria-hidden="true" />
          <span>Capture Guide</span>
        </button>

        {/* System Health Status Pill */}
        {isOnline ? (
          <div className="status-pill online" title={`Backend connected: ${health?.app_name} (OpenCV ${health?.opencv_version})`} role="status" aria-label="Backend status: Online">
            <span className="status-indicator-dot" aria-hidden="true"></span>
            <span>Ready</span>
          </div>
        ) : health?.status === 'error' ? (
          <div className="status-pill warning" title={health?.message || 'Backend offline'} role="alert" aria-label="Backend status: Offline">
            <AlertCircle size={13} aria-hidden="true" />
            <span>Offline</span>
          </div>
        ) : null}
      </div>
    </header>
  );
};

export default Header;
