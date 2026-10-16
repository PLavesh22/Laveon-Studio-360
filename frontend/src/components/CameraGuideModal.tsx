import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Camera,
  X,
  Check,
  AlertTriangle,
  Compass,
  ChevronRight,
  ChevronLeft,
  RefreshCw,
  Smartphone
} from 'lucide-react';
import type { CaptureTarget } from '../types';

interface CameraGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddCapturedPhotos: (photos: File[]) => void;
}

const INITIAL_TARGETS: CaptureTarget[] = [
  // 1. Zenith (Sky / Ceiling)
  { id: 'zenith', tier: 'zenith', targetYaw: 0, targetPitch: 75, label: 'Zenith', description: 'Tilt straight up towards the sky/ceiling (+75°)', isCaptured: false },
  // 2. Upper Sky Ring (+35° elevation)
  { id: 'upper_n', tier: 'upper', targetYaw: 0, targetPitch: 35, label: 'Sky North', description: 'Tilt 35° up facing North', isCaptured: false },
  { id: 'upper_e', tier: 'upper', targetYaw: 90, targetPitch: 35, label: 'Sky East', description: 'Tilt 35° up facing East', isCaptured: false },
  { id: 'upper_s', tier: 'upper', targetYaw: 180, targetPitch: 35, label: 'Sky South', description: 'Tilt 35° up facing South', isCaptured: false },
  { id: 'upper_w', tier: 'upper', targetYaw: 270, targetPitch: 35, label: 'Sky West', description: 'Tilt 35° up facing West', isCaptured: false },
  // 3. Horizon Ring (0° elevation)
  { id: 'horizon_n', tier: 'horizon', targetYaw: 0, targetPitch: 0, label: 'North (0°)', description: 'Level view North (0°)', isCaptured: false },
  { id: 'horizon_ne', tier: 'horizon', targetYaw: 45, targetPitch: 0, label: 'North-East (45°)', description: 'Level view North-East (45°)', isCaptured: false },
  { id: 'horizon_e', tier: 'horizon', targetYaw: 90, targetPitch: 0, label: 'East (90°)', description: 'Level view East (90°)', isCaptured: false },
  { id: 'horizon_se', tier: 'horizon', targetYaw: 135, targetPitch: 0, label: 'South-East (135°)', description: 'Level view South-East (135°)', isCaptured: false },
  { id: 'horizon_s', tier: 'horizon', targetYaw: 180, targetPitch: 0, label: 'South (180°)', description: 'Level view South (180°)', isCaptured: false },
  { id: 'horizon_sw', tier: 'horizon', targetYaw: 225, targetPitch: 0, label: 'South-West (225°)', description: 'Level view South-West (225°)', isCaptured: false },
  { id: 'horizon_w', tier: 'horizon', targetYaw: 270, targetPitch: 0, label: 'West (270°)', description: 'Level view West (270°)', isCaptured: false },
  { id: 'horizon_nw', tier: 'horizon', targetYaw: 315, targetPitch: 0, label: 'North-West (315°)', description: 'Level view North-West (315°)', isCaptured: false },
  // 4. Lower Ground Ring (-35° elevation)
  { id: 'lower_n', tier: 'lower', targetYaw: 0, targetPitch: -35, label: 'Ground North', description: 'Tilt 35° down facing North', isCaptured: false },
  { id: 'lower_e', tier: 'lower', targetYaw: 90, targetPitch: -35, label: 'Ground East', description: 'Tilt 35° down facing East', isCaptured: false },
  { id: 'lower_s', tier: 'lower', targetYaw: 180, targetPitch: -35, label: 'Ground South', description: 'Tilt 35° down facing South', isCaptured: false },
  { id: 'lower_w', tier: 'lower', targetYaw: 270, targetPitch: -35, label: 'Ground West', description: 'Tilt 35° down facing West', isCaptured: false },
  // 5. Nadir (Ground / Floor)
  { id: 'nadir', tier: 'nadir', targetYaw: 0, targetPitch: -75, label: 'Nadir', description: 'Tilt straight down towards the ground/floor (-75°)', isCaptured: false },
];

export const CameraGuideModal: React.FC<CameraGuideModalProps> = ({
  isOpen,
  onClose,
  onAddCapturedPhotos,
}) => {
  const [targets, setTargets] = useState<CaptureTarget[]>(INITIAL_TARGETS);
  const [activeTargetIndex, setActiveTargetIndex] = useState(5); // Start at Horizon North
  const [cameraActive, setCameraActive] = useState(false);
  const [isStartingCamera, setIsStartingCamera] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [availableCameras, setAvailableCameras] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [isCapturing, setIsCapturing] = useState(false);
  const [lastBlurWarning, setLastBlurWarning] = useState<string | null>(null);

  // Device orientation (degrees)
  const [deviceYaw, setDeviceYaw] = useState(0);
  const [devicePitch, setDevicePitch] = useState(0);
  const [hasOrientationSensor, setHasOrientationSensor] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const nativeInputRef = useRef<HTMLInputElement | null>(null);

  const activeTarget = targets[activeTargetIndex] || targets[0];
  const capturedCount = targets.filter((t) => t.isCaptured).length;
  const progressPct = Math.round((capturedCount / targets.length) * 100);

  // Check if camera aligns with current target
  const yawDiff = Math.abs(((deviceYaw - activeTarget.targetYaw + 540) % 360) - 180);
  const pitchDiff = Math.abs(devicePitch - activeTarget.targetPitch);
  const isAligned = hasOrientationSensor ? yawDiff < 18 && pitchDiff < 18 : true;

  // Clean stop camera stream
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  }, []);

  // Multi-tier, fault-tolerant camera start
  const startCamera = useCallback(async (overrideDeviceId?: string) => {
    setCameraError(null);
    setIsStartingCamera(true);

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error(
          'In-browser camera access requires HTTPS or localhost. If you are accessing from another device on your network, use the "Snap with Device Camera App" button below or access via localhost.'
        );
      }

      // Stop any existing active stream first
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }

      const targetDeviceId = overrideDeviceId !== undefined ? overrideDeviceId : selectedDeviceId;
      let stream: MediaStream | null = null;

      if (targetDeviceId) {
        // Specific device selected by user
        stream = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: { exact: targetDeviceId } },
          audio: false,
        });
      } else {
        // Progressive fallback strategy:
        // Tier 1: High-res environment/rear camera (ideal for phones)
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: { ideal: 'environment' },
              width: { ideal: 1920 },
              height: { ideal: 1080 },
            },
            audio: false,
          });
        } catch (tier1Err) {
          console.warn('Tier 1 camera constraints failed, attempting Tier 2:', tier1Err);
          // Tier 2: Basic environment facing camera
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              video: { facingMode: { ideal: 'environment' } },
              audio: false,
            });
          } catch (tier2Err) {
            console.warn('Tier 2 camera constraints failed, attempting universal fallback:', tier2Err);
            // Tier 3: Universal fallback (works with any webcam, laptop camera, virtual camera)
            stream = await navigator.mediaDevices.getUserMedia({
              video: true,
              audio: false,
            });
          }
        }
      }

      streamRef.current = stream;
      setCameraActive(true);

      // Attach stream to video element
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play().catch((playErr) => {
            console.warn('Video play delayed or prevented by browser:', playErr);
          });
        };
      }

      // Enumerate available video devices
      try {
        const allDevices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = allDevices.filter((d) => d.kind === 'videoinput');
        setAvailableCameras(videoDevices);
      } catch (enumErr) {
        console.warn('Camera enumeration warning:', enumErr);
      }
    } catch (err: any) {
      console.error('Camera access error:', err);
      let errorMsg = 'Could not access camera.';
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        errorMsg = 'Camera permission was denied. Please click the camera or lock icon in your browser address bar to allow camera access, then click "Retry Camera".';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        errorMsg = 'No camera hardware detected on this device. You can connect a webcam or use the "Snap with Device Camera App" button.';
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        errorMsg = 'Camera is already in use by another application (e.g. Teams, Zoom, Skype, or Windows Camera app). Please close other camera apps and click "Retry Camera".';
      } else if (err.message) {
        errorMsg = err.message;
      }
      setCameraError(errorMsg);
      setCameraActive(false);
    } finally {
      setIsStartingCamera(false);
    }
  }, [selectedDeviceId]);

  // Automatically start camera when modal opens
  useEffect(() => {
    if (isOpen) {
      void startCamera();
    } else {
      stopCamera();
    }
  }, [isOpen, startCamera, stopCamera]);

  // Switch camera handler
  const handleSwitchCamera = (deviceId: string) => {
    setSelectedDeviceId(deviceId);
    void startCamera(deviceId);
  };

  // Device orientation tracking for mobile compass/gyroscope
  useEffect(() => {
    if (!isOpen) return;

    const handleOrientation = (e: DeviceOrientationEvent) => {
      if (e.alpha !== null && e.beta !== null) {
        setHasOrientationSensor(true);
        const yaw = Math.round(e.alpha);
        const pitch = Math.round(90 - (e.beta || 90));
        setDeviceYaw(yaw);
        setDevicePitch(pitch);
      }
    };

    window.addEventListener('deviceorientation', handleOrientation);
    return () => {
      window.removeEventListener('deviceorientation', handleOrientation);
    };
  }, [isOpen]);

  // Compute local Laplacian variance blur score from canvas
  const checkCanvasBlur = (ctx: CanvasRenderingContext2D, width: number, height: number): number => {
    try {
      const imgData = ctx.getImageData(0, 0, Math.min(width, 320), Math.min(height, 240));
      const data = imgData.data;
      const gray: number[] = [];
      for (let i = 0; i < data.length; i += 4) {
        gray.push(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
      }
      const w = Math.min(width, 320);
      const h = Math.min(height, 240);
      const laplacian: number[] = [];
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          const val =
            -4 * gray[y * w + x] +
            gray[(y - 1) * w + x] +
            gray[(y + 1) * w + x] +
            gray[y * w + (x - 1)] +
            gray[y * w + (x + 1)];
          laplacian.push(val);
        }
      }
      const mean = laplacian.reduce((a, b) => a + b, 0) / laplacian.length;
      const variance = laplacian.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / laplacian.length;
      return Math.round(variance);
    } catch {
      return 30;
    }
  };

  // Capture photo from live video element
  const captureCurrentTarget = () => {
    if (!videoRef.current || !cameraActive || isCapturing) return;

    setIsCapturing(true);
    const video = videoRef.current;

    const canvas = canvasRef.current || document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setIsCapturing(false);
      return;
    }

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Calculate blur score
    const blurScore = checkCanvasBlur(ctx, canvas.width, canvas.height);
    if (blurScore < 15) {
      setLastBlurWarning(`Shot '${activeTarget.label}' appears slightly blurry (sharpness: ${blurScore}). You can retake it anytime.`);
    }

    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setIsCapturing(false);
          return;
        }

        const filename = `capture_${activeTarget.id}_${activeTarget.tier}_${Date.now()}.jpg`;
        const file = new File([blob], filename, { type: 'image/jpeg' });
        const previewUrl = URL.createObjectURL(blob);

        setTargets((prev) =>
          prev.map((t, idx) =>
            idx === activeTargetIndex
              ? { ...t, isCaptured: true, photoFile: file, previewUrl, blurScore }
              : t
          )
        );

        // Advance to next uncaptured target automatically
        const nextIndex = targets.findIndex((t, idx) => idx > activeTargetIndex && !t.isCaptured);
        if (nextIndex !== -1) {
          setActiveTargetIndex(nextIndex);
        } else {
          const anyUncaptured = targets.findIndex((t) => !t.isCaptured);
          if (anyUncaptured !== -1) {
            setActiveTargetIndex(anyUncaptured);
          }
        }

        setIsCapturing(false);
      },
      'image/jpeg',
      0.95
    );
  };

  // Native camera / file picker fallback
  const handleNativeCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const previewUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = Math.min(img.width, 320);
      canvas.height = Math.min(img.height, 240);
      const ctx = canvas.getContext('2d');
      let blurScore = 30;
      if (ctx) {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        blurScore = checkCanvasBlur(ctx, canvas.width, canvas.height);
      }

      setTargets((prev) =>
        prev.map((t, idx) =>
          idx === activeTargetIndex
            ? { ...t, isCaptured: true, photoFile: file, previewUrl, blurScore }
            : t
        )
      );

      // Advance to next uncaptured
      const nextIndex = targets.findIndex((t, idx) => idx > activeTargetIndex && !t.isCaptured);
      if (nextIndex !== -1) {
        setActiveTargetIndex(nextIndex);
      } else {
        const anyUncaptured = targets.findIndex((t) => !t.isCaptured);
        if (anyUncaptured !== -1) setActiveTargetIndex(anyUncaptured);
      }
    };
    img.src = previewUrl;

    if (nativeInputRef.current) nativeInputRef.current.value = '';
  };

  // Retake a specific target
  const retakeTarget = (index: number) => {
    setTargets((prev) =>
      prev.map((t, idx) => (idx === index ? { ...t, isCaptured: false, photoFile: undefined, previewUrl: undefined } : t))
    );
    setActiveTargetIndex(index);
    setLastBlurWarning(null);
  };

  // Complete capture & return photos
  const handleFinish = () => {
    const capturedPhotos = targets
      .filter((t) => t.isCaptured && t.photoFile)
      .map((t) => t.photoFile as File);

    if (capturedPhotos.length > 0) {
      onAddCapturedPhotos(capturedPhotos);
    }
    stopCamera();
    onClose();
  };

  if (!isOpen) return null;

  // Categorize missing areas
  const missingZenith = !targets.find((t) => t.tier === 'zenith')?.isCaptured;
  const missingUpper = targets.filter((t) => t.tier === 'upper' && !t.isCaptured).length;
  const missingHorizon = targets.filter((t) => t.tier === 'horizon' && !t.isCaptured).length;
  const missingLower = targets.filter((t) => t.tier === 'lower' && !t.isCaptured).length;
  const missingNadir = !targets.find((t) => t.tier === 'nadir')?.isCaptured;

  return (
    <div className="modal-backdrop">
      <div className="modal-content camera-guide-modal-container">
        {/* Hidden native camera capture input */}
        <input
          type="file"
          ref={nativeInputRef}
          accept="image/*"
          capture="environment"
          style={{ display: 'none' }}
          onChange={handleNativeCapture}
        />

        {/* Header */}
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div className="icon-badge">
              <Camera size={22} color="#06b6d4" />
            </div>
            <div>
              <h2 className="modal-title">360° Spherical Camera Capture</h2>
              <p className="modal-subtitle">
                Align the reticle with each target dot to capture full 360° × 180° coverage.
              </p>
            </div>
          </div>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close modal">
            <X size={20} />
          </button>
        </div>

        {/* Live Camera Viewfinder & HUD */}
        <div className="camera-viewfinder-wrapper">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={`camera-video-element ${cameraActive ? 'active' : 'hidden'}`}
          />
          <canvas ref={canvasRef} style={{ display: 'none' }} />

          {/* Fallback Screen when Camera is Off or Initializing */}
          {!cameraActive && (
            <div className="camera-start-screen">
              <div className="camera-start-card">
                <div style={{ position: 'relative', display: 'inline-block' }}>
                  <Camera size={48} color="#06b6d4" style={{ marginBottom: '14px' }} />
                  {isStartingCamera && (
                    <RefreshCw
                      size={20}
                      color="#38bdf8"
                      className="animate-spin"
                      style={{ position: 'absolute', bottom: 10, right: -8 }}
                    />
                  )}
                </div>

                <h3>{isStartingCamera ? 'Connecting to Camera...' : 'Browser Camera Access'}</h3>
                <p>
                  {isStartingCamera
                    ? 'Requesting camera stream. If prompted, please click "Allow" in your browser.'
                    : 'To capture genuine 360° photos with live directional guidance, please allow camera access or snap photos with your device camera.'}
                </p>

                {cameraError && (
                  <div className="camera-error-banner">
                    <AlertTriangle size={18} color="#f43f5e" style={{ flexShrink: 0 }} />
                    <span>{cameraError}</span>
                  </div>
                )}

                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center', marginTop: '16px' }}>
                  <button
                    className="btn btn-primary"
                    style={{ padding: '12px 24px' }}
                    onClick={() => void startCamera()}
                    disabled={isStartingCamera}
                  >
                    {isStartingCamera ? (
                      <>
                        <RefreshCw size={18} className="animate-spin" />
                        <span>Starting Camera...</span>
                      </>
                    ) : (
                      <>
                        <Camera size={18} />
                        <span>{cameraError ? 'Retry Camera' : 'Start Camera'}</span>
                      </>
                    )}
                  </button>

                  <button
                    className="btn btn-secondary"
                    style={{ padding: '12px 20px' }}
                    onClick={() => nativeInputRef.current?.click()}
                  >
                    <Smartphone size={18} color="#06b6d4" />
                    <span>Snap with Device Camera</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Active Overlay HUD */}
          {cameraActive && (
            <div className="camera-hud-overlay">
              {/* Top Status Bar in Viewfinder */}
              <div className="hud-top-bar">
                <div className="hud-badge active-target-badge">
                  <Compass size={14} color="#06b6d4" />
                  <span>
                    Target: <strong>{activeTarget.label}</strong> ({activeTarget.targetPitch >= 0 ? `+${activeTarget.targetPitch}°` : `${activeTarget.targetPitch}°`})
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {/* Camera switcher if multiple cameras are available */}
                  {availableCameras.length > 1 && (
                    <select
                      className="hud-badge"
                      style={{ cursor: 'pointer', background: 'rgba(0,0,0,0.7)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)' }}
                      value={selectedDeviceId}
                      onChange={(e) => handleSwitchCamera(e.target.value)}
                    >
                      {availableCameras.map((cam, idx) => (
                        <option key={cam.deviceId || idx} value={cam.deviceId}>
                          {cam.label || `Camera ${idx + 1}`}
                        </option>
                      ))}
                    </select>
                  )}

                  <div className="hud-badge progress-badge">
                    <span>{capturedCount} / {targets.length} Captured ({progressPct}%)</span>
                  </div>
                </div>
              </div>

              {/* Target Guidance Reticle */}
              <div className="hud-center-reticle-container">
                <div className={`hud-reticle-ring ${isAligned ? 'aligned' : ''}`}>
                  <div className="hud-reticle-crosshair-h" />
                  <div className="hud-reticle-crosshair-v" />
                  <div className="hud-reticle-dot" />
                </div>
                <div className="hud-target-guidance-text">
                  {activeTarget.description}
                </div>
              </div>

              {/* Bottom Shutter & Controls Bar */}
              <div className="hud-bottom-controls">
                {/* Previous Target */}
                <button
                  className="hud-nav-btn"
                  onClick={() => setActiveTargetIndex((prev) => (prev > 0 ? prev - 1 : targets.length - 1))}
                  title="Previous target"
                >
                  <ChevronLeft size={20} />
                </button>

                {/* Shutter Button */}
                <button
                  className={`hud-shutter-btn ${activeTarget.isCaptured ? 'captured' : ''}`}
                  onClick={captureCurrentTarget}
                  disabled={isCapturing}
                  aria-label="Capture photo"
                >
                  <div className="hud-shutter-inner">
                    {activeTarget.isCaptured ? (
                      <Check size={28} color="#10b981" />
                    ) : (
                      <div className="hud-shutter-circle" />
                    )}
                  </div>
                </button>

                {/* Next Target */}
                <button
                  className="hud-nav-btn"
                  onClick={() => setActiveTargetIndex((prev) => (prev < targets.length - 1 ? prev + 1 : 0))}
                  title="Next target"
                >
                  <ChevronRight size={20} />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Warning Toast if Blurry */}
        {lastBlurWarning && (
          <div className="coverage-notice-card alert" style={{ margin: '12px 20px 0', padding: '10px 14px' }}>
            <AlertTriangle size={18} color="#f59e0b" style={{ flexShrink: 0 }} />
            <div style={{ fontSize: '0.82rem', color: '#fbbf24' }}>{lastBlurWarning}</div>
          </div>
        )}

        {/* Spherical Target Dots Grid & Missing Areas Overview */}
        <div className="camera-target-matrix-section">
          <div className="matrix-header">
            <h4>Spherical Capture Grid (18 Angles)</h4>
            <span className="matrix-hint">Click any dot to aim camera at that angle</span>
          </div>

          <div className="target-dots-pill-grid">
            {targets.map((t, idx) => {
              const isActive = idx === activeTargetIndex;
              return (
                <button
                  key={t.id}
                  className={`target-dot-pill ${t.isCaptured ? 'captured' : ''} ${isActive ? 'active' : ''}`}
                  onClick={() => (t.isCaptured && isActive ? retakeTarget(idx) : setActiveTargetIndex(idx))}
                  title={t.isCaptured && isActive ? 'Click to retake this angle' : 'Click to aim at this angle'}
                >
                  <div className="dot-indicator">
                    {t.isCaptured ? <Check size={12} color="#10b981" /> : <div className="dot-empty" />}
                  </div>
                  <span className="dot-label">{t.label}</span>
                </button>
              );
            })}
          </div>

          {/* Missing Coverage Summary */}
          <div className="missing-coverage-summary">
            <span className="summary-title">Missing Areas:</span>
            {capturedCount === targets.length ? (
              <span className="summary-ok">
                <Check size={14} color="#10b981" /> Full 360° × 180° sphere covered!
              </span>
            ) : (
              <div className="missing-tags-list">
                {missingZenith && <span className="missing-tag">Sky Zenith (+75°)</span>}
                {missingUpper > 0 && <span className="missing-tag">{missingUpper} Upper Sky</span>}
                {missingHorizon > 0 && <span className="missing-tag">{missingHorizon} Horizon (0°)</span>}
                {missingLower > 0 && <span className="missing-tag">{missingLower} Lower Ground</span>}
                {missingNadir && <span className="missing-tag">Ground Nadir (-75°)</span>}
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer Actions */}
        <div className="modal-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              className="btn btn-secondary"
              onClick={() => {
                stopCamera();
                onClose();
              }}
            >
              Cancel
            </button>
            <button
              className="btn btn-outline"
              onClick={() => nativeInputRef.current?.click()}
              title="Capture photo using your device's native camera application"
            >
              <Smartphone size={16} />
              <span>Snap with Device Camera</span>
            </button>
          </div>

          <button
            className="btn btn-primary"
            onClick={handleFinish}
            disabled={capturedCount === 0}
          >
            <Check size={18} />
            <span>Use {capturedCount} Captured Photos</span>
          </button>
        </div>
      </div>
    </div>
  );
};
