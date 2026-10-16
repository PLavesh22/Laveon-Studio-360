import React from 'react';
import { X, ShieldCheck, HelpCircle } from 'lucide-react';

interface CameraHelpModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentStepLabel: string;
}

export const CameraHelpModal: React.FC<CameraHelpModalProps> = ({
  isOpen,
  onClose,
  currentStepLabel,
}) => {
  if (!isOpen) return null;

  return (
    <div className="camera-help-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="camera-help-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="camera-help-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div className="icon-badge" style={{ width: '36px', height: '36px' }}>
              <HelpCircle size={20} color="#00d4ff" />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#f8fafc' }}>Camera Assistant Guide</h3>
              <p style={{ margin: 0, fontSize: '0.78rem', color: '#94a3b8' }}>
                Current Step: <strong style={{ color: '#00d4ff' }}>{currentStepLabel}</strong>
              </p>
            </div>
          </div>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close help">
            <X size={18} />
          </button>
        </div>

        {/* 4 Easy Steps */}
        <div className="camera-help-body">
          <div className="help-step-item">
            <div className="help-step-number">1</div>
            <div className="help-step-text">
              <strong>Follow the Directional Arrow</strong>
              <p>Turn your body slowly in the direction shown by the large arrow. The orange circle will glide toward the center of your screen.</p>
            </div>
          </div>

          <div className="help-step-item">
            <div className="help-step-number">2</div>
            <div className="help-step-text">
              <strong>Align the Circle with the Ring</strong>
              <p>Gently position the orange circle inside the white central ring. When you are close, move very slowly.</p>
            </div>
          </div>

          <div className="help-step-item">
            <div className="help-step-number">3</div>
            <div className="help-step-text">
              <strong>Hold Steady for the 3-Second Countdown</strong>
              <p>Once aligned, the ring turns green and a 3-second countdown begins. Hold still! If your phone moves, the countdown restarts safely.</p>
            </div>
          </div>

          <div className="help-step-item">
            <div className="help-step-number">4</div>
            <div className="help-step-text">
              <strong>Advance to the Next Angle</strong>
              <p>After each shot, the arrow points to the next spot. Continue around in a circle until all angles are captured, then tap Finish to generate your 360° panorama!</p>
            </div>
          </div>

          {/* Quick Tips */}
          <div className="help-tips-box">
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#10b981', fontWeight: 600, fontSize: '0.82rem', marginBottom: '4px' }}>
              <ShieldCheck size={16} />
              <span>Helpful Tips</span>
            </div>
            <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '0.78rem', color: '#cbd5e1', lineHeight: 1.5 }}>
              <li>Rotate your feet in place rather than twisting your arms.</li>
              <li>You can tap the large bottom shutter button anytime for manual photo capture.</li>
              <li>Use the Retake button to redo any shot if you were bumped or dissatisfied.</li>
            </ul>
          </div>
        </div>

        <div className="camera-help-footer">
          <button type="button" className="btn btn-primary" style={{ width: '100%', minHeight: '42px' }} onClick={onClose}>
            Got It — Resume Camera
          </button>
        </div>
      </div>
    </div>
  );
};
