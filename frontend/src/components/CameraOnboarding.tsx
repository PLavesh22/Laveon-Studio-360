import React, { useState } from 'react';
import {
  Camera,
  Compass,
  CheckCircle2,
  Smartphone,
  Eye,
  ArrowRight,
  ShieldAlert
} from 'lucide-react';

interface CameraOnboardingProps {
  cameraReady: boolean;
  cameraError: string | null;
  sensorStatus: 'active' | 'permission_needed' | 'unsupported' | 'checking';
  onRequestCamera: () => Promise<void>;
  onRequestSensors: () => Promise<void>;
  onStartCapture: () => void;
  onSkipTutorial: () => void;
  onClose: () => void;
}

export const CameraOnboarding: React.FC<CameraOnboardingProps> = ({
  cameraReady,
  cameraError,
  sensorStatus,
  onRequestCamera,
  onRequestSensors,
  onStartCapture,
  onSkipTutorial,
  onClose,
}) => {
  const [isRequestingCamera, setIsRequestingCamera] = useState(false);

  const handleAllowCamera = async () => {
    setIsRequestingCamera(true);
    try {
      await onRequestCamera();
    } finally {
      setIsRequestingCamera(false);
    }
  };

  const isReadyToStart = cameraReady;

  return (
    <div className="onboarding-overlay">
      <div className="onboarding-modal-card">
        {/* Header */}
        <div className="onboarding-header">
          <div className="onboarding-pill">Step-by-Step Assistant</div>
          <h2 className="onboarding-title">How to Capture Your 360° Panorama</h2>
          <p className="onboarding-desc">
            No technical knowledge needed. Follow the visual target and arrows — the camera guides you every step.
          </p>
        </div>

        {/* 3 Step Visual Cards */}
        <div className="onboarding-steps-grid">
          {/* Step 1: Device Permissions & Readiness */}
          <div className={`onboarding-step-card ${cameraReady ? 'completed' : 'active'}`}>
            <div className="step-card-num">1</div>
            <div className="step-card-icon">
              <Camera size={26} color={cameraReady ? '#10b981' : '#00d4ff'} />
            </div>
            <h4>Allow Camera Access</h4>
            <p>We need your camera stream to display live guidance and take high-resolution panoramic frames.</p>

            <div className="permission-badges-stack">
              <div className={`status-pill ${cameraReady ? 'ready' : 'pending'}`}>
                {cameraReady ? <CheckCircle2 size={14} color="#10b981" /> : <Camera size={14} color="#00d4ff" />}
                <span>{cameraReady ? 'Camera Access Allowed' : 'Camera Access Needed'}</span>
              </div>

              {sensorStatus === 'permission_needed' && (
                <button
                  type="button"
                  className="btn btn-sm btn-outline"
                  onClick={() => void onRequestSensors()}
                  style={{ fontSize: '0.72rem', padding: '4px 8px' }}
                >
                  <Compass size={13} color="#00d4ff" />
                  <span>Tap to Enable Motion Sensors (iOS)</span>
                </button>
              )}

              {sensorStatus === 'active' && (
                <div className="status-pill ready">
                  <CheckCircle2 size={14} color="#10b981" />
                  <span>Motion Sensors Active</span>
                </div>
              )}

              {sensorStatus === 'unsupported' && (
                <div className="status-pill neutral">
                  <Compass size={14} color="#94a3b8" />
                  <span>Manual Guidance Mode (Desktop / No Gyro)</span>
                </div>
              )}
            </div>

            {!cameraReady && (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                style={{ width: '100%', marginTop: '12px' }}
                onClick={handleAllowCamera}
                disabled={isRequestingCamera}
              >
                {isRequestingCamera ? 'Connecting…' : 'Allow Camera Access'}
              </button>
            )}

            {cameraError && (
              <div className="onboarding-error-box">
                <ShieldAlert size={15} color="#f43f5e" style={{ flexShrink: 0 }} />
                <span>{cameraError}</span>
              </div>
            )}
          </div>

          {/* Step 2: Stand in One Spot & Rotate Phone */}
          <div className="onboarding-step-card">
            <div className="step-card-num">2</div>
            <div className="step-rotation-animation-wrapper" aria-label="Horizontal rotation animation">
              <div className="animation-orbit-ring">
                <div className="animation-phone-icon">
                  <Smartphone size={22} color="#00d4ff" />
                </div>
                <div className="animation-orbit-dot" />
              </div>
              <div className="animation-center-person">
                <div className="person-dot" />
              </div>
              <div className="animation-sweep-arc" />
            </div>
            <h4>Stand in One Spot and Slowly Rotate</h4>
            <p>
              Plant your feet in one spot. Rotate your body smoothly in place like a tripod — do not walk around.
            </p>
          </div>

          {/* Step 3: Hold Phone at Chest or Eye Level */}
          <div className="onboarding-step-card">
            <div className="step-card-num">3</div>
            <div className="step-posture-visual">
              <div className="posture-icon-wrap">
                <Eye size={24} color="#00d4ff" />
                <div className="posture-phone-badge">
                  <Smartphone size={18} color="#10b981" />
                </div>
              </div>
              <div className="posture-line-indicator">
                <span className="posture-label">Eye / Chest Level</span>
              </div>
            </div>
            <h4>Hold Phone at Chest or Eye Level</h4>
            <p>
              Hold your phone comfortably upright. Keep it vertical and follow the on-screen arrow from target to target.
            </p>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="onboarding-footer">
          <button
            type="button"
            className="btn btn-outline"
            onClick={onSkipTutorial}
            style={{ minHeight: '44px', padding: '0 20px' }}
          >
            Skip Tutorial
          </button>

          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              style={{ minHeight: '44px', padding: '0 16px' }}
            >
              Cancel
            </button>

            <button
              type="button"
              className="btn btn-primary"
              disabled={!isReadyToStart}
              onClick={onStartCapture}
              style={{ minHeight: '44px', padding: '0 24px', fontWeight: 600 }}
            >
              <span>Start Guided Capture</span>
              <ArrowRight size={18} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
