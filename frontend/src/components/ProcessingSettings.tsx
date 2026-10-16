import React, { useState } from 'react';
import { Sliders, Layers, Gauge, Maximize2, ShieldAlert, Globe, ChevronDown, ChevronUp } from 'lucide-react';
import type { ProcessingSettings as SettingsType } from '../types';

interface ProcessingSettingsProps {
  settings: SettingsType;
  onChange: (newSettings: SettingsType) => void;
  disabled: boolean;
  mode?: 'photo' | 'video';
}

export const ProcessingSettings: React.FC<ProcessingSettingsProps> = ({
  settings,
  onChange,
  disabled,
  mode = 'photo'
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);

  const updateSetting = <K extends keyof SettingsType>(key: K, value: SettingsType[K]) => {
    onChange({
      ...settings,
      [key]: value,
    });
  };

  // Human-readable summary for collapsed mobile state
  const summaryText = mode === 'photo'
    ? `${settings.stitching_mode === 'wide_panorama' ? 'Wide Sweep' : 'Full 360° Sphere'} · ${settings.scale_width ? `${settings.scale_width}px` : 'Original'} · Min Sharpness ${settings.min_blur_threshold}`
    : `Interval ${settings.sample_interval_sec}s · Cap ${settings.max_frames} frames`;

  return (
    <div className="glass-panel" style={{ padding: '22px' }} role="region" aria-label="Stitching Settings">
      <div className="section-title-wrap" style={{ marginBottom: isCollapsed ? 0 : '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Sliders size={18} color="#06b6d4" aria-hidden="true" />
          <h3 className="section-title" style={{ fontSize: '1rem', margin: 0 }}>
            {mode === 'photo' ? '2. Stitching & Projection' : '2. Extraction Parameters'}
          </h3>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="section-badge">
            {mode === 'photo' ? 'OpenCV Spherical' : 'OpenCV & FFmpeg'}
          </span>

          {/* Mobile Collapsible Toggle */}
          <button
            type="button"
            className="btn btn-outline btn-small"
            onClick={() => setIsCollapsed(!isCollapsed)}
            style={{ padding: '4px 8px', minHeight: '30px' }}
            aria-expanded={!isCollapsed}
            aria-label={isCollapsed ? 'Expand settings panel' : 'Collapse settings panel'}
          >
            {isCollapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
            <span style={{ fontSize: '0.75rem' }}>{isCollapsed ? 'Edit' : 'Hide'}</span>
          </button>
        </div>
      </div>

      {isCollapsed ? (
        <div style={{ fontSize: '0.78rem', color: '#94a3b8', paddingTop: '8px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          Active parameters: <span style={{ color: '#38bdf8', fontWeight: 600 }}>{summaryText}</span>
        </div>
      ) : (
        <div className="settings-group">
          {/* Photo Mode Settings */}
          {mode === 'photo' && (
            <>
              {/* Projection Mode */}
              <div className="setting-item">
                <div className="setting-header">
                  <label htmlFor="setting-stitching-mode" className="setting-label">
                    <Globe size={14} color="#06b6d4" aria-hidden="true" />
                    <span>Stitching & Projection Mode</span>
                  </label>
                  <span className="setting-value-badge">
                    {settings.stitching_mode === 'wide_panorama' ? 'Wide Sweep' : 'Full 360° × 180° Sphere'}
                  </span>
                </div>
                <select
                  id="setting-stitching-mode"
                  value={settings.stitching_mode || 'full_sphere'}
                  onChange={(e) => updateSetting('stitching_mode', e.target.value as any)}
                  disabled={disabled}
                  className="select-input"
                >
                  <option value="full_sphere">Full 360° × 180° Equirectangular Sphere (2:1 Ratio)</option>
                  <option value="wide_panorama">Wide Horizontal Panorama (Cylindrical / Planar)</option>
                  <option value="auto">Auto-detect from captured coverage</option>
                </select>
                <div className="setting-desc">
                  Full 360° mode projects photos onto an equirectangular canvas for complete horizontal & vertical exploration.
                </div>
              </div>

              {/* Target Resolution Scaling */}
              <div className="setting-item">
                <div className="setting-header">
                  <label htmlFor="setting-scale-width" className="setting-label">
                    <Maximize2 size={14} color="#38bdf8" aria-hidden="true" />
                    <span>Target Resolution Scaling</span>
                  </label>
                  <span className="setting-value-badge">
                    {settings.scale_width ? `${settings.scale_width}px` : 'Original Size'}
                  </span>
                </div>
                <select
                  id="setting-scale-width"
                  value={settings.scale_width || ''}
                  onChange={(e) => {
                    const val = e.target.value ? parseInt(e.target.value, 10) : undefined;
                    updateSetting('scale_width', val);
                  }}
                  disabled={disabled}
                  className="select-input"
                >
                  <option value="">Original Resolution (Highest Quality)</option>
                  <option value="2560">2.5K (2560px width · Recommended)</option>
                  <option value="1920">1080p (1920px width · Fast & Balanced)</option>
                  <option value="1280">720p (1280px width · Fast Preview)</option>
                </select>
                <div className="setting-desc">
                  Higher resolution preserves fine architectural details; moderate downscaling accelerates bundle adjustment.
                </div>
              </div>

              {/* Sharpness Filter */}
              <div className="setting-item">
                <div className="setting-header">
                  <label htmlFor="setting-blur-threshold" className="setting-label">
                    <ShieldAlert size={14} color="#10b981" aria-hidden="true" />
                    <span>Sharpness Threshold (Laplacian)</span>
                  </label>
                  <span className="setting-value-badge">
                    Min {settings.min_blur_threshold.toFixed(0)} score
                  </span>
                </div>
                <input
                  id="setting-blur-threshold"
                  type="range"
                  min="5"
                  max="35"
                  step="1"
                  value={settings.min_blur_threshold}
                  onChange={(e) => updateSetting('min_blur_threshold', parseFloat(e.target.value))}
                  disabled={disabled}
                  className="slider-input"
                  aria-valuemin={5}
                  aria-valuemax={35}
                  aria-valuenow={settings.min_blur_threshold}
                />
                <div className="setting-desc">
                  Frames with Laplacian variance below this threshold will be flagged as blurry in the quality pre-check.
                </div>
              </div>
            </>
          )}

          {/* Video Mode Settings */}
          {mode === 'video' && (
            <>
              {/* Frame Sampling Interval */}
              <div className="setting-item">
                <div className="setting-header">
                  <label htmlFor="setting-sample-interval" className="setting-label">
                    <Gauge size={14} color="#06b6d4" aria-hidden="true" />
                    <span>Frame Sampling Interval</span>
                  </label>
                  <span className="setting-value-badge">
                    Every {settings.sample_interval_sec.toFixed(1)}s
                  </span>
                </div>
                <input
                  id="setting-sample-interval"
                  type="range"
                  min="0.2"
                  max="3.0"
                  step="0.1"
                  value={settings.sample_interval_sec}
                  onChange={(e) => updateSetting('sample_interval_sec', parseFloat(e.target.value))}
                  disabled={disabled}
                  className="slider-input"
                  aria-valuemin={0.2}
                  aria-valuemax={3.0}
                  aria-valuenow={settings.sample_interval_sec}
                />
                <div className="setting-desc">
                  Controls how frequently FFmpeg extracts candidate frames during camera rotation.
                </div>
              </div>

              {/* Max Frames Cap */}
              <div className="setting-item">
                <div className="setting-header">
                  <label htmlFor="setting-max-frames" className="setting-label">
                    <Layers size={14} color="#8b5cf6" aria-hidden="true" />
                    <span>Maximum Frame Cap</span>
                  </label>
                  <span className="setting-value-badge">
                    {settings.max_frames} frames max
                  </span>
                </div>
                <input
                  id="setting-max-frames"
                  type="range"
                  min="8"
                  max="60"
                  step="2"
                  value={settings.max_frames}
                  onChange={(e) => updateSetting('max_frames', parseInt(e.target.value, 10))}
                  disabled={disabled}
                  className="slider-input"
                  aria-valuemin={8}
                  aria-valuemax={60}
                  aria-valuenow={settings.max_frames}
                />
                <div className="setting-desc">
                  Upper ceiling for extracted keyframes. Redundant stationary frames are filtered automatically.
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default ProcessingSettings;
