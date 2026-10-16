import React from 'react';
import { X, Terminal, CheckCircle2, AlertTriangle, Copy } from 'lucide-react';
import type { HealthData } from '../types';

interface FFmpegGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  health: HealthData | null;
}

export const FFmpegGuideModal: React.FC<FFmpegGuideModalProps> = ({
  isOpen,
  onClose,
  health,
}) => {
  const [copied, setCopied] = React.useState(false);

  if (!isOpen) return null;

  const copyCommand = (cmd: string) => {
    navigator.clipboard.writeText(cmd);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const wingetCmd = 'winget install Gyan.FFmpeg.Essentials';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Terminal size={24} color="#06b6d4" />
            <h3 style={{ fontSize: '1.3rem' }}>System & FFmpeg Environment</h3>
          </div>
          <button className="tool-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* Current Environment Status */}
        <div className="metrics-grid" style={{ marginBottom: '20px' }}>
          <div className="metric-card">
            <div className="metric-label">FFmpeg Status</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
              {health?.ffmpeg_available ? (
                <>
                  <CheckCircle2 size={18} color="#10b981" />
                  <span style={{ color: '#34d399', fontWeight: 600 }}>Active</span>
                </>
              ) : (
                <>
                  <AlertTriangle size={18} color="#f59e0b" />
                  <span style={{ color: '#fbbf24', fontWeight: 600 }}>Not Detected</span>
                </>
              )}
            </div>
          </div>

          <div className="metric-card">
            <div className="metric-label">OpenCV Engine</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.1rem', fontWeight: 700, marginTop: '4px', color: '#f8fafc' }}>
              v{health?.opencv_version || '5.0.0'}
            </div>
          </div>
        </div>

        {health?.ffmpeg_available ? (
          <div className="coverage-notice-card" style={{ marginBottom: '20px' }}>
            <CheckCircle2 size={20} color="#10b981" />
            <div>
              <div className="notice-title" style={{ color: '#34d399' }}>FFmpeg is configured correctly!</div>
              <div className="notice-body" style={{ fontSize: '0.8rem', wordBreak: 'break-all', marginTop: '4px' }}>
                <strong>Binary:</strong> {health.ffmpeg_path || 'PATH'}<br />
                <strong>Version:</strong> {health.ffmpeg_version}
              </div>
            </div>
          </div>
        ) : (
          <div>
            <p style={{ color: '#cbd5e1', fontSize: '0.9rem', marginBottom: '14px', lineHeight: 1.5 }}>
              FFmpeg is required to extract candidate frames from your video files. Follow these steps to install it on Windows 10/11:
            </p>

            <div style={{ background: '#090d16', padding: '16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)', marginBottom: '16px' }}>
              <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginBottom: '8px', display: 'flex', justifyContent: 'space-between' }}>
                <span>Run in Windows PowerShell (Administrator or standard user):</span>
                <span
                  style={{ cursor: 'pointer', color: '#06b6d4', display: 'flex', alignItems: 'center', gap: '4px' }}
                  onClick={() => copyCommand(wingetCmd)}
                >
                  <Copy size={13} />
                  {copied ? 'Copied!' : 'Copy'}
                </span>
              </div>
              <code style={{ color: '#38bdf8', fontSize: '0.95rem' }}>{wingetCmd}</code>
            </div>

            <ol style={{ paddingLeft: '20px', fontSize: '0.86rem', color: '#94a3b8', lineHeight: 1.6, display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <li>Press <kbd>Win + X</kbd> and open <strong>Terminal</strong> or <strong>PowerShell</strong>.</li>
              <li>Paste the command above and press Enter.</li>
              <li>Once installed, restart your backend terminal to refresh the system PATH.</li>
            </ol>
          </div>
        )}

        <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
