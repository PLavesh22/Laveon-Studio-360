import React, { useEffect, useState, useRef } from 'react';
import { Loader2, CheckCircle2, Clock } from 'lucide-react';

interface ProgressTrackerProps {
  isProcessing: boolean;
  currentStepIndex: number;
  mode?: 'photo' | 'video';
}

const PHOTO_STEPS = [
  { id: 1, label: 'Uploading & Validating Photos', detail: 'Streaming photo set to backend memory' },
  { id: 2, label: 'Sharpness & Keypoint Analysis', detail: 'Evaluating Laplacian blur variance & ORB descriptors' },
  { id: 3, label: 'Overlap & Coverage Verification', detail: 'Checking adjacent feature matches across sectors' },
  { id: 4, label: 'OpenCV Feature Stitching', detail: 'Matching keypoints and computing homography' },
  { id: 5, label: 'Equirectangular Projection', detail: 'Projecting to spherical canvas with seam blending' },
];

const VIDEO_STEPS = [
  { id: 1, label: 'Uploading & Validating Video', detail: 'Streaming chunks to backend storage' },
  { id: 2, label: 'FFmpeg Frame Extraction', detail: 'Extracting candidate rotational frames' },
  { id: 3, label: 'Deduplication & Blur Filtering', detail: 'Discarding stationary and motion-blurred frames' },
  { id: 4, label: 'OpenCV Feature Stitching', detail: 'Keypoint matching & bundle adjustment' },
  { id: 5, label: 'Encoding Output Panorama', detail: 'Rendering output JPEG with blend masks' },
];

export const ProgressTracker: React.FC<ProgressTrackerProps> = ({
  isProcessing,
  currentStepIndex,
  mode = 'photo',
}) => {
  const [elapsed, setElapsed] = useState(0);
  const startTimeRef = useRef<number>(0);
  const steps = mode === 'photo' ? PHOTO_STEPS : VIDEO_STEPS;

  useEffect(() => {
    if (!isProcessing) {
      return;
    }

    startTimeRef.current = Date.now();
    const interval = setInterval(() => {
      const diffSec = Math.floor((Date.now() - startTimeRef.current) / 1000);
      setElapsed(diffSec);
    }, 1000);

    return () => clearInterval(interval);
  }, [isProcessing]);

  if (!isProcessing) return null;

  const currentStep = steps[currentStepIndex] || steps[0];

  return (
    <div className="glass-panel" style={{ padding: '22px' }} role="status" aria-live="polite" aria-atomic="true">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Loader2 size={18} className="animate-spin" color="#06b6d4" aria-hidden="true" />
          <h4 style={{ fontSize: '0.98rem', fontWeight: 600 }}>
            {mode === 'photo' ? 'Stitching 360° Panorama…' : 'Processing Rotational Video…'}
          </h4>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', color: '#94a3b8' }}>
          <Clock size={13} aria-hidden="true" />
          <span>Elapsed: <strong>{elapsed}s</strong></span>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {steps.map((s, idx) => {
          const isDone = idx < currentStepIndex;
          const isActive = idx === currentStepIndex;

          return (
            <div
              key={s.id}
              className={`step-row ${isActive ? 'active' : ''} ${isDone ? 'completed' : ''}`}
            >
              <div className="step-icon">
                {isDone ? (
                  <CheckCircle2 size={16} color="#10b981" aria-hidden="true" />
                ) : isActive ? (
                  <Loader2 size={16} className="animate-spin" color="#06b6d4" aria-hidden="true" />
                ) : (
                  <span className="step-num">{s.id}</span>
                )}
              </div>
              <div className="step-content">
                <div className="step-label">
                  {s.label}
                  {isActive && <span style={{ fontSize: '0.72rem', color: '#38bdf8', marginLeft: '6px' }}>(in progress)</span>}
                </div>
                <div className="step-detail">{s.detail}</div>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: '14px', paddingTop: '10px', borderTop: '1px solid rgba(255,255,255,0.06)', fontSize: '0.76rem', color: '#94a3b8' }}>
        Step {currentStepIndex + 1} of {steps.length}: <span style={{ color: '#f8fafc' }}>{currentStep.label}</span>
      </div>
    </div>
  );
};

export default ProgressTracker;
