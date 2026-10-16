import React, { useEffect, useState } from 'react';
import { Loader2, CheckCircle2, Clock } from 'lucide-react';

interface ProgressTrackerProps {
  isProcessing: boolean;
  currentStepIndex: number;
  mode?: 'photo' | 'video';
}

const PHOTO_STEPS = [
  { id: 1, label: 'Uploading & Validating Photos', detail: 'Streaming multi-tier photo set to backend' },
  { id: 2, label: 'Sharpness & Keypoint Analysis', detail: 'Checking Laplacian variance & ORB descriptors' },
  { id: 3, label: 'Overlap & Sector Verification', detail: 'Verifying adjacent overlap and compass sectors' },
  { id: 4, label: 'OpenCV Feature Stitching', detail: 'Matching keypoints and computing homography' },
  { id: 5, label: 'Equirectangular Projection', detail: 'Projecting to 2:1 spherical canvas with seam blending' },
];

const VIDEO_STEPS = [
  { id: 1, label: 'Uploading & Validating Video', detail: 'Streaming chunks to backend storage' },
  { id: 2, label: 'FFmpeg Frame Extraction', detail: 'Extracting candidate rotational frames' },
  { id: 3, label: 'Deduplication & Blur Filtering', detail: 'Discarding static and motion-blurred frames' },
  { id: 4, label: 'OpenCV Feature Stitching', detail: 'Keypoint matching & bundle adjustment' },
  { id: 5, label: 'Encoding Output Panorama', detail: 'Trimming margins and saving full JPEG' },
];

export const ProgressTracker: React.FC<ProgressTrackerProps> = ({
  isProcessing,
  currentStepIndex,
  mode = 'photo',
}) => {
  const [elapsed, setElapsed] = useState(0);
  const steps = mode === 'photo' ? PHOTO_STEPS : VIDEO_STEPS;

  useEffect(() => {
    let interval: any = null;
    if (isProcessing) {
      setElapsed(0);
      interval = setInterval(() => {
        setElapsed((prev) => prev + 1);
      }, 1000);
    } else {
      clearInterval(interval);
    }
    return () => clearInterval(interval);
  }, [isProcessing]);

  if (!isProcessing) return null;

  return (
    <div className="glass-panel" style={{ padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Loader2 size={20} className="animate-spin" color="#06b6d4" />
          <h4 style={{ fontSize: '1rem', fontWeight: 600 }}>
            {mode === 'photo' ? '360° Photo Stitching Active' : 'Video Stitching Active'}
          </h4>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: '#94a3b8' }}>
          <Clock size={14} />
          <span>Elapsed: {elapsed}s</span>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
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
                  <CheckCircle2 size={18} color="#10b981" />
                ) : isActive ? (
                  <Loader2 size={18} className="animate-spin" color="#06b6d4" />
                ) : (
                  <span className="step-num">{s.id}</span>
                )}
              </div>
              <div className="step-content">
                <div className="step-label">{s.label}</div>
                <div className="step-detail">{s.detail}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
