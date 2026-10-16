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
  return (
    <header className="glass-panel app-header">
      <div className="brand-wrapper">
        <div className="brand-icon-box">
          <Camera size={26} color="#06b6d4" />
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

      {/* Primary Workflow Switcher */}
      <div className="workflow-tab-switcher" role="tablist">
        <button
          className={`workflow-tab-btn ${activeTab === 'photo' ? 'active' : ''}`}
          onClick={() => onTabChange('photo')}
          role="tab"
          aria-selected={activeTab === 'photo'}
          disabled={isProcessing}
        >
          <Camera size={15} />
          <span>360° Photos (Primary)</span>
        </button>

        <button
          className={`workflow-tab-btn ${activeTab === 'video' ? 'active' : ''}`}
          onClick={() => onTabChange('video')}
          role="tab"
          aria-selected={activeTab === 'video'}
          disabled={isProcessing}
        >
          <Film size={15} />
          <span>Video Sweep</span>
        </button>
      </div>

      <div className="header-actions">
        {/* Quick Camera Capture Action */}
        {activeTab === 'photo' && onOpenLiveCamera && (
          <button
            className="btn btn-primary btn-touch btn-header-action"
            onClick={onOpenLiveCamera}
            disabled={isProcessing}
            title="Open camera with multi-tilt 360 guide dots"
          >
            <Camera size={15} />
            <span>Open 360 Camera</span>
          </button>
        )}

        {/* Capture Guide Modal Trigger */}
        <button
          className="btn btn-outline btn-touch btn-header-action"
          onClick={onOpenGuide}
          title="Guide on capturing seamless 360° panoramas"
        >
          <BookOpen size={15} />
          <span>Capture Guide</span>
        </button>

        {/* Subtle offline alert only shown if backend is disconnected */}
        {health?.status === 'error' && (
          <div className="status-pill warning" title={health.message}>
            <AlertCircle size={14} color="#f43f5e" />
            <span>Backend Offline</span>
          </div>
        )}
      </div>
    </header>
  );
};
