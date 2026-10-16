import React from 'react';
import { Sliders, Layers, Gauge, Maximize2, ShieldAlert, Globe } from 'lucide-react';
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
  const updateSetting = <K extends keyof SettingsType>(key: K, value: SettingsType[K]) => {
    onChange({
      ...settings,
      [key]: value,
    });
  };

  return (
    <div className="glass-panel" style={{ padding: '24px' }}>
      <div className="section-title-wrap">
        <h3 className="section-title">
          <Sliders size={20} color="#8b5cf6" />
          <span>{mode === 'photo' ? '2. Stitching & Projection Settings' : '2. Extraction Parameters'}</span>
        </h3>
        <span className="section-badge">{mode === 'photo' ? 'OpenCV Spherical' : 'OpenCV & FFmpeg'}</span>
      </div>

      <div className="settings-group">
        {/* Photo Mode Settings */}
        {mode === 'photo' && (
          <>
            {/* Projection Mode */}
            <div className="setting-item">
              <div className="setting-header">
                <label className="setting-label">
                  <Globe size={15} color="#06b6d4" />
                  <span>Stitching & Projection Mode</span>
                </label>
                <span className="setting-value-badge">
                  {settings.stitching_mode === 'wide_panorama'
                    ? 'Wide Sweep'
                    : 'Full 360° × 180° Sphere'}
                </span>
              </div>
              <select
                value={settings.stitching_mode || 'full_sphere'}
                onChange={(e) => updateSetting('stitching_mode', e.target.value as any)}
                disabled={disabled}
                className="select-input"
              >
                <option value="full_sphere">Full 360° × 180° Equirectangular Sphere (Interactive 3D)</option>
                <option value="wide_panorama">Wide Horizontal Panorama (Cylindrical / Flat)</option>
                <option value="auto">Auto-detect from captured coverage</option>
              </select>
              <div className="setting-desc">
                Full 360° mode maps photos onto a strict 2:1 equirectangular canvas for realistic 3D look-around in all directions (left, right, sky, and ground).
              </div>
            </div>

            {/* Target Resolution Scaling */}
            <div className="setting-item">
              <div className="setting-header">
                <label className="setting-label">
                  <Maximize2 size={15} color="#38bdf8" />
                  <span>Target Width Resolution</span>
                </label>
                <span className="setting-value-badge">
                  {settings.scale_width ? `${settings.scale_width}px` : 'Original Size'}
                </span>
              </div>
              <select
                value={settings.scale_width || ''}
                onChange={(e) => {
                  const val = e.target.value ? parseInt(e.target.value, 10) : undefined;
                  updateSetting('scale_width', val);
                }}
                disabled={disabled}
                className="select-input"
              >
                <option value="">Original Resolution (Highest Quality)</option>
                <option value="2560">2.5K (2560px width - High Quality)</option>
                <option value="1920">1080p (1920px width - Fast & Balanced)</option>
                <option value="1280">720p (1280px width - Fast Preview)</option>
              </select>
              <div className="setting-desc">
                High resolution creates crisper panoramas. Downscaling slightly accelerates OpenCV bundle adjustment without visual distortion.
              </div>
            </div>

            {/* Sharpness Filter */}
            <div className="setting-item">
              <div className="setting-header">
                <label className="setting-label">
                  <ShieldAlert size={15} color="#10b981" />
                  <span>Sharpness Threshold (Laplacian)</span>
                </label>
                <span className="setting-value-badge">
                  Min {settings.min_blur_threshold.toFixed(0)} score
                </span>
              </div>
              <input
                type="range"
                min="5"
                max="35"
                step="1"
                value={settings.min_blur_threshold}
                onChange={(e) => updateSetting('min_blur_threshold', parseFloat(e.target.value))}
                disabled={disabled}
                className="slider-input"
              />
              <div className="setting-desc">
                Photos with a Laplacian variance below this score will be flagged as blurry in the pre-check.
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
                <label className="setting-label">
                  <Gauge size={15} color="#06b6d4" />
                  <span>Sampling Interval</span>
                </label>
                <span className="setting-value-badge">
                  Every {settings.sample_interval_sec.toFixed(1)}s
                </span>
              </div>
              <input
                type="range"
                min="0.2"
                max="3.0"
                step="0.1"
                value={settings.sample_interval_sec}
                onChange={(e) => updateSetting('sample_interval_sec', parseFloat(e.target.value))}
                disabled={disabled}
                className="slider-input"
              />
              <div className="setting-desc">
                Shorter intervals extract more overlapping frames from video.
              </div>
            </div>

            {/* Max Frames Cap */}
            <div className="setting-item">
              <div className="setting-header">
                <label className="setting-label">
                  <Layers size={15} color="#8b5cf6" />
                  <span>Max Frame Cap</span>
                </label>
                <span className="setting-value-badge">
                  {settings.max_frames} frames max
                </span>
              </div>
              <input
                type="range"
                min="8"
                max="60"
                step="2"
                value={settings.max_frames}
                onChange={(e) => updateSetting('max_frames', parseInt(e.target.value, 10))}
                disabled={disabled}
                className="slider-input"
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
};
