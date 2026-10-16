import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  Camera,
  X,
  Check,
  AlertTriangle,
  ChevronRight,
  ChevronLeft,
  RefreshCw,
  Smartphone,
  Compass,
  Volume2,
  VolumeX,
  Pause,
  Play,
  RotateCcw,
  CheckCircle2,
  Circle,
  Layers,
  ArrowRight
} from 'lucide-react';
import {
  globalOrientationTracker,
  type OrientationData
} from '../services/orientationTracker';
import {
  TargetPlanner,
  type SphericalTarget,
  type CaptureMode
} from '../services/targetPlanner';
import {
  AlignmentValidator
} from '../services/alignmentValidator';
import { feedback } from '../utils/feedback';

interface CameraGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddCapturedPhotos: (photos: File[]) => void;
}

export const CameraGuideModal: React.FC<CameraGuideModalProps> = ({
  isOpen,
  onClose,
  onAddCapturedPhotos,
}) => {
  // Capture configuration state
  const [captureMode, setCaptureMode] = useState<CaptureMode>('horizontal_360');
  const [overlapPct, setOverlapPct] = useState<number>(0.33); // 33% overlap default

  // Planner instance
  const planner = useMemo(() => {
    return new TargetPlanner({
      mode: captureMode,
      overlapPercentage: overlapPct,
      hfov: 60,
      vfov: 75,
    });
  }, [captureMode, overlapPct]);

  // Target collection
  const [targets, setTargets] = useState<SphericalTarget[]>(() => planner.generateTargets());
  const [activeTargetIndex, setActiveTargetIndex] = useState(0);
  const [capturedHistory, setCapturedHistory] = useState<number[]>([]);

  // Regenerate targets whenever mode or overlap changes
  const handleModeChange = (newMode: CaptureMode) => {
    setCaptureMode(newMode);
    const newPlanner = new TargetPlanner({
      mode: newMode,
      overlapPercentage: overlapPct,
      hfov: 60,
      vfov: 75,
    });
    setTargets(newPlanner.generateTargets());
    setActiveTargetIndex(0);
    setCapturedHistory([]);
  };

  const handleOverlapChange = (newOverlap: number) => {
    setOverlapPct(newOverlap);
    const newPlanner = new TargetPlanner({
      mode: captureMode,
      overlapPercentage: newOverlap,
      hfov: 60,
      vfov: 75,
    });
    setTargets(newPlanner.generateTargets());
    setActiveTargetIndex(0);
    setCapturedHistory([]);
  };

  // Hardware Camera State
  const [cameraActive, setCameraActive] = useState(false);
  const [isStartingCamera, setIsStartingCamera] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [availableCameras, setAvailableCameras] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [isCapturing, setIsCapturing] = useState(false);
  const [isFlashing, setIsFlashing] = useState(false);
  const [lastBlurWarning, setLastBlurWarning] = useState<string | null>(null);

  // Sensor & Orientation State
  const [orientation, setOrientation] = useState<OrientationData>({
    yaw: 0,
    pitch: 0,
    roll: 0,
    rawAlpha: 0,
    rawBeta: 0,
    rawGamma: 0,
    isCalibrated: false,
    screenAngle: 0,
  });
  const [hasOrientationSensor, setHasOrientationSensor] = useState(false);
  const [sensorPermissionNeeded, setSensorPermissionNeeded] = useState<boolean>(() => {
    return typeof (window as any)?.DeviceOrientationEvent?.requestPermission === 'function';
  });

  // Controls State
  const [isAutoCapturePaused, setIsAutoCapturePaused] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Alignment Validator
  const validator = useMemo(() => new AlignmentValidator({
    toleranceDegrees: 3.5, // 2-4 degrees
    stabilityHoldMs: 300,  // 300ms hold
    rollToleranceDegrees: 15,
  }), []);

  const [holdProgress, setHoldProgress] = useState(0);
  const [alignmentStatus, setAlignmentStatus] = useState<'unaligned' | 'holding' | 'aligned_green'>('unaligned');

  // DOM Refs
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const nativeInputRef = useRef<HTMLInputElement | null>(null);
  const captureLockRef = useRef(false);

  const activeTarget = targets[activeTargetIndex] || targets[0];
  const capturedCount = targets.filter((t) => t.isCaptured).length;
  const progressPct = targets.length > 0 ? Math.round((capturedCount / targets.length) * 100) : 0;

  // Project active target onto camera screen space
  const projection = useMemo(() => {
    if (!activeTarget) {
      return {
        screenX: 50,
        screenY: 50,
        isInView: true,
        deltaYaw: 0,
        deltaPitch: 0,
        angularDistance: 0,
        edgeArrowAngle: 0,
        directionHint: 'Align target with reticle',
      };
    }
    return planner.projectTarget(activeTarget, orientation.yaw, orientation.pitch);
  }, [activeTarget, orientation.yaw, orientation.pitch, planner]);

  // Clean stop camera stream
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  }, []);

  // Multi-tier, fault-tolerant camera startup
  const startCamera = useCallback(async (overrideDeviceId?: string) => {
    setCameraError(null);
    setIsStartingCamera(true);

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error(
          'In-browser camera access requires HTTPS or localhost. If accessing over a local Wi-Fi IP, use localhost port-forwarding or use the "Snap with Device Camera" option.'
        );
      }

      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }

      const targetDeviceId = overrideDeviceId !== undefined ? overrideDeviceId : selectedDeviceId;
      let stream: MediaStream | null = null;

      if (targetDeviceId) {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: { exact: targetDeviceId } },
          audio: false,
        });
      } else {
        try {
          // Tier 1: Rear environment camera with HD resolution
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: { ideal: 'environment' },
              width: { ideal: 1920 },
              height: { ideal: 1080 },
            },
            audio: false,
          });
        } catch {
          try {
            // Tier 2: Basic environment camera
            stream = await navigator.mediaDevices.getUserMedia({
              video: { facingMode: { ideal: 'environment' } },
              audio: false,
            });
          } catch {
            // Tier 3: Universal fallback (webcam, laptop camera)
            stream = await navigator.mediaDevices.getUserMedia({
              video: true,
              audio: false,
            });
          }
        }
      }

      streamRef.current = stream;
      setCameraActive(true);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play().catch((playErr) => {
            console.warn('Video play prevented by browser:', playErr);
          });
        };
      }

      try {
        const allDevices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = allDevices.filter((d) => d.kind === 'videoinput');
        setAvailableCameras(videoDevices);
      } catch (enumErr) {
        console.warn('Camera enumeration error:', enumErr);
      }
    } catch (err: any) {
      console.error('Camera access error:', err);
      let errorMsg = 'Could not access camera.';
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        errorMsg = 'Camera permission was denied. Please allow camera access in your browser address bar.';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        errorMsg = 'No camera hardware detected. Connect a camera or use "Snap with Device Camera".';
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        errorMsg = 'Camera is already in use by another app. Please close other camera apps and retry.';
      } else if (err.message) {
        errorMsg = err.message;
      }
      setCameraError(errorMsg);
      setCameraActive(false);
    } finally {
      setIsStartingCamera(false);
    }
  }, [selectedDeviceId]);

  // Request iOS 13+ sensor permissions
  const requestOrientationPermission = async () => {
    const granted = await globalOrientationTracker.requestPermission();
    if (granted) {
      setSensorPermissionNeeded(false);
      setHasOrientationSensor(true);
      globalOrientationTracker.start();
    }
  };

  // Re-calibrate relative 0° heading to current phone direction
  const handleRecenter = () => {
    globalOrientationTracker.recenter(orientation.rawAlpha);
    validator.resetHold();
    feedback.playLockTick();
  };

  // Subscribe to orientation tracker
  useEffect(() => {
    if (!isOpen) return;

    const unsubscribe = globalOrientationTracker.subscribe((data) => {
      setHasOrientationSensor(true);
      setOrientation(data);
    });

    return () => {
      unsubscribe();
      validator.resetHold();
    };
  }, [isOpen, validator]);

  // Lifecycle start/stop camera
  useEffect(() => {
    let active = true;
    if (isOpen) {
      queueMicrotask(() => {
        if (active) void startCamera();
      });
    } else {
      queueMicrotask(() => {
        stopCamera();
      });
    }
    return () => {
      active = false;
    };
  }, [isOpen, startCamera, stopCamera]);

  // Laplacian variance blur check on canvas
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
      return 35;
    }
  };

  // Perform capture of active target
  const captureCurrentTarget = useCallback(() => {
    if (!videoRef.current || !cameraActive || isCapturing || captureLockRef.current) return;

    captureLockRef.current = true;
    setIsCapturing(true);
    setIsFlashing(true);

    feedback.playCaptureChime();
    feedback.triggerHapticCapture();
    setTimeout(() => setIsFlashing(false), 240);

    const video = videoRef.current;
    const canvas = canvasRef.current || document.createElement('canvas');
    canvas.width = video.videoWidth || 1920;
    canvas.height = video.videoHeight || 1080;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      setIsCapturing(false);
      captureLockRef.current = false;
      return;
    }

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blurScore = checkCanvasBlur(ctx, canvas.width, canvas.height);
    if (blurScore < 15) {
      setLastBlurWarning(`Angle '${activeTarget.label}' may have motion blur (${blurScore}). You can undo or retake.`);
    }

    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setIsCapturing(false);
          captureLockRef.current = false;
          return;
        }

        // Standard filename required by backend parser:
        // capture_{id}_{tier}_{timestamp}.jpg
        const timestamp = Date.now();
        const filename = `capture_${activeTarget.id}_${activeTarget.tier}_${timestamp}.jpg`;
        const file = new File([blob], filename, { type: 'image/jpeg' });
        const previewUrl = URL.createObjectURL(blob);

        setTargets((prev) =>
          prev.map((t, idx) =>
            idx === activeTargetIndex
              ? {
                  ...t,
                  isCaptured: true,
                  photoFile: file,
                  previewUrl,
                  blurScore,
                  orientationMetadata: {
                    capturedYaw: Math.round(orientation.yaw),
                    capturedPitch: Math.round(orientation.pitch),
                    capturedRoll: Math.round(orientation.roll),
                    timestamp,
                  },
                }
              : t
          )
        );

        setCapturedHistory((prev) => [...prev, activeTargetIndex]);
        validator.onCaptureComplete();

        // Advance automatically to the next uncaptured target
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
        captureLockRef.current = false;
        setHoldProgress(0);
        setAlignmentStatus('unaligned');
      },
      'image/jpeg',
      0.95
    );
  }, [activeTarget, activeTargetIndex, cameraActive, isCapturing, orientation.pitch, orientation.roll, orientation.yaw, targets, validator]);

  // Main alignment & stability auto-capture loop
  useEffect(() => {
    if (
      !hasOrientationSensor ||
      isAutoCapturePaused ||
      activeTarget.isCaptured ||
      isCapturing ||
      captureLockRef.current
    ) {
      validator.resetHold();
      setHoldProgress(0);
      setAlignmentStatus('unaligned');
      return;
    }

    const evaluation = validator.evaluate(
      projection.angularDistance,
      orientation.roll,
      isCapturing,
      isAutoCapturePaused,
      hasOrientationSensor
    );

    setAlignmentStatus(evaluation.status);
    setHoldProgress(evaluation.holdProgressPct);

    if (evaluation.status === 'holding' && holdProgress === 0) {
      feedback.triggerHapticLock();
    }

    if (evaluation.canCapture) {
      captureCurrentTarget();
    }
  }, [
    activeTarget.isCaptured,
    captureCurrentTarget,
    hasOrientationSensor,
    holdProgress,
    isAutoCapturePaused,
    isCapturing,
    orientation.roll,
    projection.angularDistance,
    validator,
  ]);

  // Undo the last captured photo
  const handleUndoLastCapture = () => {
    if (capturedHistory.length === 0) return;

    const lastCapturedIdx = capturedHistory[capturedHistory.length - 1];
    setTargets((prev) =>
      prev.map((t, idx) =>
        idx === lastCapturedIdx
          ? {
              ...t,
              isCaptured: false,
              photoFile: undefined,
              previewUrl: undefined,
              orientationMetadata: undefined,
            }
          : t
      )
    );

    setCapturedHistory((prev) => prev.slice(0, prev.length - 1));
    setActiveTargetIndex(lastCapturedIdx);
    validator.resetHold();
    setLastBlurWarning(null);
    feedback.playLockTick();
  };

  // Retake a specific target
  const retakeTarget = (index: number) => {
    setTargets((prev) =>
      prev.map((t, idx) =>
        idx === index
          ? {
              ...t,
              isCaptured: false,
              photoFile: undefined,
              previewUrl: undefined,
              orientationMetadata: undefined,
            }
          : t
      )
    );
    setActiveTargetIndex(index);
    validator.resetHold();
    setLastBlurWarning(null);
  };

  // Native camera fallback capture for devices without WebRTC permission
  const handleNativeCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const previewUrl = URL.createObjectURL(file);
    const timestamp = Date.now();
    const filename = `capture_${activeTarget.id}_${activeTarget.tier}_${timestamp}.jpg`;
    const renamedFile = new File([file], filename, { type: file.type || 'image/jpeg' });

    setTargets((prev) =>
      prev.map((t, idx) =>
        idx === activeTargetIndex
          ? {
              ...t,
              isCaptured: true,
              photoFile: renamedFile,
              previewUrl,
              blurScore: 35,
              orientationMetadata: {
                capturedYaw: Math.round(orientation.yaw),
                capturedPitch: Math.round(orientation.pitch),
                capturedRoll: Math.round(orientation.roll),
                timestamp,
              },
            }
          : t
      )
    );

    setCapturedHistory((prev) => [...prev, activeTargetIndex]);
    const nextIndex = targets.findIndex((t, idx) => idx > activeTargetIndex && !t.isCaptured);
    if (nextIndex !== -1) {
      setActiveTargetIndex(nextIndex);
    } else {
      const anyUncaptured = targets.findIndex((t) => !t.isCaptured);
      if (anyUncaptured !== -1) setActiveTargetIndex(anyUncaptured);
    }

    if (nativeInputRef.current) nativeInputRef.current.value = '';
  };

  // Complete and hand over captured photos to the application
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

  return (
    <div className="modal-backdrop">
      <div className="modal-content camera-guide-modal-container">
        {/* Hidden native camera capture input for fallback */}
        <input
          type="file"
          ref={nativeInputRef}
          accept="image/*"
          capture="environment"
          style={{ display: 'none' }}
          onChange={handleNativeCapture}
        />

        {/* Modal Header */}
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div className="icon-badge">
              <Camera size={22} color="#00d4ff" />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <h2 className="modal-title">Photo Sphere Guided Camera</h2>
                <span className="badge" style={{ fontSize: '0.72rem', background: 'rgba(0, 212, 255, 0.1)', color: '#00d4ff', border: '1px solid rgba(0, 212, 255, 0.3)' }}>
                  {captureMode === 'horizontal_360' ? '360° Panorama' : 'Full Sphere'}
                </span>
              </div>
              <p className="modal-subtitle">
                Align the floating target with the center reticle. Turns green and captures automatically.
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {/* Mode Toggle Button */}
            <button
              className="btn btn-sm btn-secondary"
              style={{ fontSize: '0.75rem', padding: '6px 10px', height: '32px' }}
              onClick={() => handleModeChange(captureMode === 'horizontal_360' ? 'full_sphere' : 'horizontal_360')}
              title="Switch between single-row horizontal 360° and multi-tier full sphere"
            >
              <Layers size={14} />
              <span>{captureMode === 'horizontal_360' ? 'Switch to Full Sphere' : 'Switch to 360° Ring'}</span>
            </button>

            <button className="modal-close-btn" onClick={onClose} aria-label="Close modal">
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Live Viewfinder & Photo Sphere HUD */}
        <div className={`camera-viewfinder-wrapper ${isFlashing ? 'camera-shutter-flash' : ''}`}>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={`camera-video-element ${cameraActive ? 'active' : 'hidden'}`}
          />
          <canvas ref={canvasRef} style={{ display: 'none' }} />

          {/* Fallback Screen when Camera is Stopped or Initializing */}
          {!cameraActive && (
            <div className="camera-start-screen">
              <div className="camera-start-card">
                <div style={{ position: 'relative', display: 'inline-block' }}>
                  <Camera size={48} color="#00d4ff" style={{ marginBottom: '14px' }} />
                  {isStartingCamera && (
                    <RefreshCw
                      size={22}
                      color="#38bdf8"
                      className="animate-spin"
                      style={{ position: 'absolute', bottom: 10, right: -8 }}
                    />
                  )}
                </div>

                <h3>{isStartingCamera ? 'Connecting to Camera...' : 'Camera Access'}</h3>
                <p>
                  {isStartingCamera
                    ? 'Requesting live camera stream. If prompted, please click "Allow" in your browser.'
                    : 'To capture authentic 360° photos with live target tracking, allow camera access or snap directly with your device camera.'}
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
                    <Smartphone size={18} color="#00d4ff" />
                    <span>Snap with Device Camera</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Active Overlay HUD */}
          {cameraActive && (
            <div className="camera-hud-overlay">
              {/* Top Bar: Progress, Calibrate, Sound, Pause, Overlap */}
              <div className="hud-top-bar">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <div className="hud-badge active-target-badge">
                    <span style={{ color: '#00d4ff', fontWeight: 700 }}>
                      Target {activeTargetIndex + 1} of {targets.length}
                    </span>
                    <span style={{ opacity: 0.5 }}>•</span>
                    <span>{activeTarget.label}</span>
                  </div>

                  {hasOrientationSensor ? (
                    <button
                      className="hud-badge hud-action-pill"
                      onClick={handleRecenter}
                      title="Re-center Heading: Set current camera direction as 0° forward"
                    >
                      <RotateCcw size={12} color="#00d4ff" />
                      <span>Re-center 0°</span>
                    </button>
                  ) : (
                    <div className="hud-badge" style={{ color: '#f59e0b' }}>
                      <span>Manual Alignment</span>
                    </div>
                  )}

                  {sensorPermissionNeeded && (
                    <button
                      className="hud-badge hud-action-pill"
                      style={{ background: 'rgba(0, 212, 255, 0.25)', border: '1px solid #00d4ff' }}
                      onClick={() => void requestOrientationPermission()}
                    >
                      <Compass size={12} color="#00d4ff" />
                      <span>Enable Sensors</span>
                    </button>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {/* Overlap config selector */}
                  <select
                    className="hud-badge"
                    value={overlapPct}
                    onChange={(e) => handleOverlapChange(parseFloat(e.target.value))}
                    title="Configurable image overlap percentage"
                    style={{ cursor: 'pointer', background: 'rgba(7, 11, 20, 0.85)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)' }}
                  >
                    <option value={0.30}>Overlap 30%</option>
                    <option value={0.33}>Overlap 33%</option>
                    <option value={0.38}>Overlap 38%</option>
                  </select>

                  {/* Sound Toggle */}
                  <button
                    className="hud-icon-btn"
                    onClick={() => {
                      const next = !soundEnabled;
                      setSoundEnabled(next);
                      feedback.setSoundEnabled(next);
                    }}
                    title={soundEnabled ? 'Mute shutter chime' : 'Enable shutter chime'}
                  >
                    {soundEnabled ? <Volume2 size={16} color="#00d4ff" /> : <VolumeX size={16} color="#94a3b8" />}
                  </button>

                  {/* Pause / Resume Auto-Capture */}
                  {hasOrientationSensor && (
                    <button
                      className={`hud-icon-btn ${isAutoCapturePaused ? 'paused' : ''}`}
                      onClick={() => setIsAutoCapturePaused(!isAutoCapturePaused)}
                      title={isAutoCapturePaused ? 'Resume Auto-Capture' : 'Pause Auto-Capture'}
                    >
                      {isAutoCapturePaused ? <Play size={16} color="#f59e0b" /> : <Pause size={16} color="#00d4ff" />}
                    </button>
                  )}

                  {/* Camera switcher if multiple cameras are detected */}
                  {availableCameras.length > 1 && (
                    <select
                      className="hud-badge"
                      value={selectedDeviceId}
                      onChange={(e) => {
                        setSelectedDeviceId(e.target.value);
                        void startCamera(e.target.value);
                      }}
                      title="Switch camera sensor"
                      style={{ cursor: 'pointer', background: 'rgba(7, 11, 20, 0.85)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)' }}
                    >
                      {availableCameras.map((cam, idx) => (
                        <option key={cam.deviceId || idx} value={cam.deviceId}>
                          {cam.label || `Camera ${idx + 1}`}
                        </option>
                      ))}
                    </select>
                  )}

                  {/* Progress Pill */}
                  <div className="hud-badge progress-badge">
                    <span>{capturedCount} / {targets.length} ({progressPct}%)</span>
                  </div>
                </div>
              </div>

              {/* 1. Center Reticle & Level Guidance (Fixed in Center) */}
              <div className="hud-center-reticle-container">
                <div
                  className={`hud-reticle-ring ${alignmentStatus === 'aligned_green' ? 'aligned' : ''} ${alignmentStatus === 'holding' ? 'holding' : ''}`}
                >
                  {/* 300ms Hold Progress Ring */}
                  {holdProgress > 0 && (
                    <svg className="hud-progress-svg" viewBox="0 0 80 80">
                      <circle
                        cx="40"
                        cy="40"
                        r="36"
                        fill="none"
                        stroke={alignmentStatus === 'aligned_green' ? '#10b981' : '#00d4ff'}
                        strokeWidth="4"
                        strokeDasharray={226}
                        strokeDashoffset={226 - (226 * holdProgress) / 100}
                        strokeLinecap="round"
                      />
                    </svg>
                  )}
                  <div className="hud-reticle-crosshair-h" />
                  <div className="hud-reticle-crosshair-v" />
                  <div className="hud-reticle-dot" />
                </div>

                {/* Level Horizon Bar (Roll indicator) */}
                {hasOrientationSensor && (
                  <div className="hud-level-indicator" title="Hold phone level horizontally">
                    <div
                      className={`hud-level-line ${Math.abs(orientation.roll) < 5 ? 'level' : ''}`}
                      style={{ transform: `rotate(${-orientation.roll}deg)` }}
                    />
                  </div>
                )}
              </div>

              {/* 2. Photo Sphere Floating Target Circle (Moves across viewfinder) */}
              {projection.isInView ? (
                <div
                  className={`hud-photosphere-target ${alignmentStatus === 'aligned_green' ? 'aligned-green' : ''} ${alignmentStatus === 'holding' ? 'holding' : ''}`}
                  style={{
                    left: `${projection.screenX}%`,
                    top: `${projection.screenY}%`,
                  }}
                >
                  {alignmentStatus === 'aligned_green' ? (
                    <Check size={26} color="#ffffff" strokeWidth={3} />
                  ) : (
                    <div className="target-bullseye-dot" />
                  )}
                </div>
              ) : (
                /* 3. Off-Screen Directional Edge Arrow (Guides user towards target) */
                <div
                  className="hud-edge-arrow-container"
                  style={{
                    left: `${projection.screenX}%`,
                    top: `${projection.screenY}%`,
                  }}
                >
                  <div
                    className="edge-arrow-disc"
                    style={{
                      transform: `rotate(${projection.edgeArrowAngle}deg)`,
                    }}
                  >
                    <ArrowRight size={22} color="#00d4ff" />
                  </div>
                  <div className="edge-distance-pill">
                    {Math.round(projection.angularDistance)}°
                  </div>
                </div>
              )}

              {/* Direction Guidance Banner */}
              <div className="hud-instruction-card">
                <div className="hud-primary-instruction">
                  {alignmentStatus === 'aligned_green'
                    ? 'Capturing!'
                    : alignmentStatus === 'holding'
                    ? 'Hold Steady...'
                    : projection.directionHint}
                </div>
                <div className="hud-secondary-hint">
                  {hasOrientationSensor
                    ? `Align circle with center reticle • Pitch: ${Math.round(orientation.pitch)}° | Yaw: ${Math.round(orientation.yaw)}°`
                    : activeTarget.instruction}
                </div>
              </div>

              {/* Bottom Control Bar: Undo, Shutter, Next, Retake */}
              <div className="hud-bottom-controls">
                {/* Undo Button */}
                <button
                  className="hud-nav-btn"
                  onClick={handleUndoLastCapture}
                  disabled={capturedHistory.length === 0}
                  style={{ opacity: capturedHistory.length === 0 ? 0.35 : 1 }}
                  title="Undo last captured photo"
                  aria-label="Undo last photo"
                >
                  <RotateCcw size={20} />
                </button>

                {/* Previous Target */}
                <button
                  className="hud-nav-btn"
                  onClick={() => setActiveTargetIndex((prev) => (prev > 0 ? prev - 1 : targets.length - 1))}
                  title="Previous angle"
                  aria-label="Previous angle"
                >
                  <ChevronLeft size={22} />
                </button>

                {/* Shutter Button (Auto / Manual Tap) */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                  <button
                    className={`hud-shutter-btn ${activeTarget.isCaptured ? 'captured' : ''} ${isCapturing ? 'capturing' : ''}`}
                    onClick={captureCurrentTarget}
                    disabled={isCapturing}
                    aria-label={activeTarget.isCaptured ? 'Retake photo' : 'Capture photo'}
                    title={activeTarget.isCaptured ? 'Angle captured - tap to retake' : 'Tap to capture photo manually'}
                  >
                    <div className="hud-shutter-inner">
                      {activeTarget.isCaptured ? (
                        <Check size={28} color="#10b981" />
                      ) : (
                        <div className="hud-shutter-circle" />
                      )}
                    </div>
                  </button>
                  <span style={{ fontSize: '0.68rem', color: '#cbd5e1', textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>
                    {activeTarget.isCaptured
                      ? 'Captured'
                      : isAutoCapturePaused
                      ? 'Manual Shutter'
                      : 'Auto-Align / Tap'}
                  </span>
                </div>

                {/* Next Uncaptured Target */}
                <button
                  className="hud-nav-btn"
                  onClick={() => {
                    const nextUncaptured = targets.findIndex((t, idx) => idx > activeTargetIndex && !t.isCaptured);
                    if (nextUncaptured !== -1) {
                      setActiveTargetIndex(nextUncaptured);
                    } else {
                      setActiveTargetIndex((prev) => (prev < targets.length - 1 ? prev + 1 : 0));
                    }
                  }}
                  title="Skip to next target"
                  aria-label="Next angle"
                >
                  <ChevronRight size={22} />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Warning Toast if Photo is Blurry */}
        {lastBlurWarning && (
          <div className="coverage-notice-card alert" style={{ margin: '10px 0 0', padding: '10px 14px' }}>
            <AlertTriangle size={18} color="#f59e0b" style={{ flexShrink: 0 }} />
            <div style={{ fontSize: '0.82rem', color: '#fbbf24' }}>{lastBlurWarning}</div>
          </div>
        )}

        {/* Target Coverage Radar Section */}
        <div className="camera-coverage-radar-section">
          <div className="radar-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Compass size={18} color="#00d4ff" />
              <h4>{captureMode === 'horizontal_360' ? '360° Horizontal Ring Progress' : 'Spherical 360° × 180° Radar'}</h4>
            </div>
            <span className="radar-status-text">
              {capturedCount === targets.length
                ? 'Full 360° Coverage Complete!'
                : `${capturedCount} of ${targets.length} targets captured`}
            </span>
          </div>

          {/* Visual Step Timeline dots */}
          <div className="guided-step-timeline">
            {targets.map((t, idx) => {
              const isActive = idx === activeTargetIndex;
              return (
                <button
                  key={t.id}
                  className={`timeline-dot-btn ${t.isCaptured ? 'captured' : ''} ${isActive ? 'active' : ''}`}
                  onClick={() => (t.isCaptured && isActive ? retakeTarget(idx) : setActiveTargetIndex(idx))}
                  title={`Target ${idx + 1}: ${t.label} (${t.isCaptured ? 'Captured - click to retake' : 'Click to aim'})`}
                  aria-label={`Target ${idx + 1}: ${t.label}`}
                >
                  {t.isCaptured ? (
                    <CheckCircle2 size={16} color="#10b981" />
                  ) : isActive ? (
                    <div className="timeline-active-glow" />
                  ) : (
                    <Circle size={12} color="#64748b" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Modal Footer Actions */}
        <div className="modal-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
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

            {capturedCount > 0 && (
              <button
                className="btn btn-outline"
                style={{ color: '#f43f5e', borderColor: 'rgba(244, 63, 94, 0.3)' }}
                onClick={() => {
                  setTargets(planner.generateTargets());
                  setActiveTargetIndex(0);
                  setCapturedHistory([]);
                }}
                title="Reset all captured camera angles"
              >
                Reset All
              </button>
            )}
          </div>

          <button
            className="btn btn-primary"
            onClick={handleFinish}
            disabled={capturedCount === 0}
            style={{ minWidth: '180px' }}
          >
            <Check size={18} />
            <span>Use {capturedCount} Photos for Stitching</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default CameraGuideModal;
