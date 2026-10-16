import React from 'react';
import { X, Compass, ShieldAlert } from 'lucide-react';

interface RecordingGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const RecordingGuideModal: React.FC<RecordingGuideModalProps> = ({
  isOpen,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Compass size={24} color="#06b6d4" />
            <h3 style={{ fontSize: '1.3rem' }}>Panoramic Video Recording Guide</h3>
          </div>
          <button className="tool-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <p style={{ color: '#94a3b8', fontSize: '0.9rem', lineHeight: '1.5', marginBottom: '20px' }}>
          Follow these computer-vision principles to achieve flawless stitching every time without homography or overlap errors.
        </p>

        <div className="guide-card-grid">
          <div className="guide-card">
            <div className="guide-step-num">1</div>
            <div className="guide-card-title">Pure Rotation (Nodal Point)</div>
            <div className="guide-card-text">
              Keep the camera at approximately <strong>one fixed point</strong> in space. Rotate smoothly around the camera body (pure yaw). Avoid walking, leaning, or translating forward/backward.
            </div>
          </div>

          <div className="guide-card">
            <div className="guide-step-num">2</div>
            <div className="guide-card-title">Slow & Steady Panning</div>
            <div className="guide-card-text">
              Rotate slowly. A full 360° sweep should take at least <strong>15 to 25 seconds</strong>. This guarantees 40% to 60% visual overlap between adjacent frames and minimizes motion blur.
            </div>
          </div>

          <div className="guide-card">
            <div className="guide-step-num">3</div>
            <div className="guide-card-title">Lock Exposure & White Balance</div>
            <div className="guide-card-text">
              Lock AE/AF (Auto Exposure / Auto Focus) on your phone or camera before hitting record. Dynamic exposure causes color banding and noticeable seam lines between stitched frames.
            </div>
          </div>

          <div className="guide-card">
            <div className="guide-step-num">4</div>
            <div className="guide-card-title">Feature-Rich Environment</div>
            <div className="guide-card-text">
              OpenCV detects corners and high-contrast textures (SIFT/ORB). Avoid pointing at plain blank walls, featureless skies, or reflective glass windows where no keypoints exist.
            </div>
          </div>
        </div>

        {/* 360 vs Wide Panorama Honesty Card */}
        <div className="coverage-notice-card" style={{ marginTop: '16px' }}>
          <ShieldAlert size={22} color="#06b6d4" style={{ flexShrink: 0, marginTop: '2px' }} />
          <div>
            <div className="notice-title">Understanding 360° vs Wide Panorama</div>
            <div className="notice-body">
              <strong>OpenCV’s Stitcher API</strong> maps rotational frames onto a cylindrical or planar surface. It generates a wide horizontal sweep. 
              To form a certified 360° continuous loop, the video must complete a full circle with the end overlapping the beginning, followed by circular equirectangular reprojection.
              Laveon Studio 360 will never artificially stretch normal images to a 2:1 ratio or falsely label a partial sweep as a true 360° sphere.
            </div>
          </div>
        </div>

        <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn btn-primary" onClick={onClose}>
            Got it, let's stitch!
          </button>
        </div>
      </div>
    </div>
  );
};
