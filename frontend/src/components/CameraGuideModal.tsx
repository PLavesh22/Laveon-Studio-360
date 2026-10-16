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
  type CaptureMode,
  type RotationStepAngle
} from '../services/targetPlanner';
import {
  AlignmentValidator
} from '../services/alignmentValidator';
import {
  ImageQualityAnalyzer,
  type QualityReport
} from '../services/imageQualityAnalyzer';
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
  const [stepAngle, setStepAngle] = useState<RotationStepAngle>(36); // 36° = 10 shots (standard ~35% overlap)
  const [overlapPct, setOverlapPct] = useState<number>(0.35); // 35% overlap default

  // Planner instance
  const planner = useMemo(() => {
    return new TargetPlanner({
      mode: captureMode,
      stepAngle,
      overlapPercentage: overlapPct,
      hfov: 60,
      vfov: 75,
    });
  }, [captureMode, stepAngle, overlapPct]);

  // Target collection
  const [targets, setTargets] = useState<SphericalTarget[]>(() => planner.generateTargets());
  const [activeTargetIndex, setActiveTargetIndex] = useState(0);
  const [capturedHistory, setCapturedHistory] = useState<number[]>([]);

  // Quality Analyzer instance
  const qualityAnalyzer = useMemo(() => new ImageQualityAnalyzer(), []);
  const [lastQualityReport, setLastQualityReport] = useState<QualityReport | null>(null);

  // Regenerate targets whenever mode or step angle changes
  const handleModeChange = (newMode: CaptureMode) => {
    setCaptureMode(newMode);
    const newPlanner = new TargetPlanner({
      mode: newMode,
      stepAngle,
      overlapPercentage: overlapPct,
      hfov: 60,
      vfov: 75,
    });
    setTargets(newPlanner.generateTargets());
    setActiveTargetIndex(0);
    setCapturedHistory([]);
    qualityAnalyzer.reset();
    setLastQualityReport(null);
  };

  const handleStepAngleChange = (newStep: RotationStepAngle) => {
    setStepAngle(newStep);
    // Approximate overlap corresponding to step
    const computedOverlap = newStep === 30 ? 0.45 : newStep === 36 ? 0.35 : 0.28;
    setOverlapPct(computedOverlap);

    const newPlanner = new TargetPlanner({
      mode: captureMode,
      stepAngle: newStep,
      overlapPercentage: computedOverlap,
      hfov: 60,
      vfov: 75,
    });
    setTargets(newPlanner.generateTargets());
    setActiveTargetIndex(0);
    setCapturedHistory([]);
    qualityAnalyzer.reset();
    setLastQualityReport(null);
  };

  // Hardware Camera State
  const [cameraActive, setCameraActive] = useState(false);
  const [isStartingCamera, setIsStartingCamera] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [availableCameras, setAvailableCameras] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [isCapturing, setIsCapturing] = useState(false);
  const [isFlashing, setIsFlashing] = useState(false);

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

  // Alignment Validator (strict ±3.0° tolerance, 600ms hold window between 500-800ms)
  const validator = useMemo(
    () =>
      new AlignmentValidator({
        toleranceDegrees: 3.0,
        rollToleranceDegrees: 12.0,
        stabilityHoldMs: 600, // 600ms steady hold
        maxAngularVelocity: 5.0, // Low rotational movement
      }),
    []
  );

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
  const isRotationComplete = capturedCount === targets.length;

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
        directionHint: 'Hold steady',
        degreesToTarget: 0,
        guidanceText: 'Hold steady',
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
          'In-browser camera access requires HTTPS or localhost. If testing over a Wi-Fi IP, use localhost port-forwarding or use the "Snap with Device Camera" option.'
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
  const handleStartCaptureOrRecenter = () => {
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

  // Capture of active target with real image quality and overlap analysis
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

    // Run real computer vision analysis: blur, exposure, and adjacent-frame overlap
    const qualityReport = qualityAnalyzer.analyzeFrame(canvas, overlapPct);
    setLastQualityReport(qualityReport);

    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setIsCapturing(false);
          captureLockRef.current = false;
          return;
        }

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
                  blurScore: qualityReport.blurScore,
                  exposureScore: qualityReport.exposureScore,
                  overlapScore: qualityReport.overlapScore,
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
  }, [
    activeTarget,
    activeTargetIndex,
    cameraActive,
    isCapturing,
    orientation.pitch,
    orientation.roll,
    orientation.yaw,
    overlapPct,
    qualityAnalyzer,
    targets,
    validator,
  ]);

  // Main alignment & 500-800ms stability auto-capture loop
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
              blurScore: undefined,
              exposureScore: undefined,
              overlapScore: undefined,
              orientationMetadata: undefined,
            }
          : t
      )
    );

    setCapturedHistory((prev) => prev.slice(0, prev.length - 1));
    setActiveTargetIndex(lastCapturedIdx);
    validator.resetHold();
    setLastQualityReport(null);
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
              blurScore: undefined,
              exposureScore: undefined,
              overlapScore: undefined,
              orientationMetadata: undefined,
            }
          : t
      )
    );
    setActiveTargetIndex(index);
    validator.resetHold();
    setLastQualityReport(null);
  };

  // Native camera fallback capture
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
              exposureScore: 128,
              overlapScore: null,
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

  // Reset entire capture session
  const handleRestartCapture = () => {
    setTargets(planner.generateTargets());
    setActiveTargetIndex(0);
    setCapturedHistory([]);
    qualityAnalyzer.reset();
    setLastQualityReport(null);
    validator.resetHold();
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
                <h2 className="modal-title">360° Guided Camera Capture</h2>
                <span
                  className="badge"
                  style={{
                    fontSize: '0.72rem',
                    background: 'rgba(0, 212, 255, 0.1)',
                    color: '#00d4ff',
                    border: '1px solid rgba(0, 212, 255, 0.3)',
                  }}
                >
                  {captureMode === 'horizontal_360' ? `360° Ring (${targets.length} shots)` : 'Full Sphere'}
                </span>
              </div>
              <p className="modal-subtitle">
                Align the rectangular target with the center reticle. Steady hold turns green and captures automatically.
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {/* Mode Switcher */}
            <button
              className="btn btn-sm btn-secondary"
              style={{ fontSize: '0.75rem', padding: '6px 10px', height: '32px' }}
              onClick={() => handleModeChange(captureMode === 'horizontal_360' ? 'full_sphere' : 'horizontal_360')}
              title="Switch between single-row horizontal 360° and multi-tier full sphere"
            >
              <Layers size={14} />
              <span>{captureMode === 'horizontal_360' ? 'Full Sphere' : '360° Ring'}</span>
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

                <div
                  style={{
                    display: 'flex',
                    gap: '12px',
                    flexWrap: 'wrap',
                    justifyContent: 'center',
                    marginTop: '16px',
                  }}
                >
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
                        <span>{cameraError ? 'Retry Camera' : 'Start Capture'}</span>
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
              {/* Top Bar: Progress, Calibrate, Rotation Step, Sound, Pause */}
              <div className="hud-top-bar">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <div className="hud-badge active-target-badge">
                    <span style={{ color: '#00d4ff', fontWeight: 700 }}>
                      Position {activeTargetIndex + 1} of {targets.length}
                    </span>
                    <span style={{ opacity: 0.5 }}>•</span>
                    <span>{activeTarget.label}</span>
                  </div>

                  {/* Start Capture / Re-center Calibration Button */}
                  <button
                    className="hud-badge hud-action-pill"
                    onClick={handleStartCaptureOrRecenter}
                    title="Calibrate 0°: Sets current camera facing direction as starting baseline orientation"
                  >
                    <RotateCcw size={12} color="#00d4ff" />
                    <span>Set Start 0°</span>
                  </button>

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
                  {/* Rotation Step Angle Selector (30°, 36°, 45°) */}
                  {captureMode === 'horizontal_360' && (
                    <select
                      className="hud-badge"
                      value={stepAngle}
                      onChange={(e) => handleStepAngleChange(parseInt(e.target.value) as RotationStepAngle)}
                      title="Configurable capture positions and overlap"
                      style={{
                        cursor: 'pointer',
                        background: 'rgba(7, 11, 20, 0.85)',
                        color: '#fff',
                        border: '1px solid rgba(255,255,255,0.2)',
                      }}
                    >
                      <option value={30}>Every 30° (12 shots • 45% overlap)</option>
                      <option value={36}>Every 36° (10 shots • 35% overlap)</option>
                      <option value={45}>Every 45° (8 shots • 30% overlap)</option>
                    </select>
                  )}

                  {/* Sound Toggle */}
                  <button
                    className="hud-icon-btn"
                    onClick={() => {
                      const next = !soundEnabled;
                      setSoundEnabled(next);
                      feedback.setSoundEnabled(next);
                    }}
                    title={soundEnabled ? 'Mute audio cues' : 'Enable audio cues'}
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
                      style={{
                        cursor: 'pointer',
                        background: 'rgba(7, 11, 20, 0.85)',
                        color: '#fff',
                        border: '1px solid rgba(255,255,255,0.2)',
                      }}
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
                    <span>
                      {capturedCount} / {targets.length} ({progressPct}%)
                    </span>
                  </div>
                </div>
              </div>

              {/* 1. Center Reticle & Level Horizon (Fixed at Viewfinder Center) */}
              <div className="hud-center-reticle-container">
                <div
                  className={`hud-reticle-ring ${
                    alignmentStatus === 'aligned_green'
                      ? 'aligned'
                      : alignmentStatus === 'holding'
                      ? 'holding'
                      : ''
                  }`}
                >
                  <div className="hud-reticle-crosshair-h" />
                  <div className="hud-reticle-crosshair-v" />
                  <div className="hud-reticle-dot" />
                </div>

                {/* Level Horizon Bar (Roll indicator) */}
                {hasOrientationSensor && (
                  <div className="hud-level-indicator" title="Hold phone level horizontally">
                    <div
                      className={`hud-level-line ${Math.abs(orientation.roll) < 4 ? 'level' : ''}`}
                      style={{ transform: `rotate(${-orientation.roll}deg)` }}
                    />
                  </div>
                )}
              </div>

              {/* 2. Floating Alignment Target: Rectangular Frame + Circular Center Target + Directional Marker */}
              {projection.isInView ? (
                <div
                  className={`hud-alignment-target ${
                    alignmentStatus === 'aligned_green'
                      ? 'aligned-green'
                      : alignmentStatus === 'holding'
                      ? 'holding-steady'
                      : ''
                  }`}
                  style={{
                    left: `${projection.screenX}%`,
                    top: `${projection.screenY}%`,
                  }}
                >
                  {/* Transparent Rectangular Frame with Corner Brackets */}
                  <div className="target-rectangular-frame">
                    <div className="frame-corner top-left" />
                    <div className="frame-corner top-right" />
                    <div className="frame-corner bottom-left" />
                    <div className="frame-corner bottom-right" />

                    {/* Small Directional Marker Notch */}
                    <div
                      className="target-directional-marker"
                      style={{
                        transform: `rotate(${projection.edgeArrowAngle}deg)`,
                      }}
                    >
                      <div className="marker-arrow-indicator" />
                    </div>

                    {/* Circular Center Target with Hold Progress Ring */}
                    <div className="target-center-circle">
                      {alignmentStatus === 'aligned_green' ? (
                        <Check size={26} color="#ffffff" strokeWidth={3.5} />
                      ) : (
                        <div className="target-center-bullseye" />
                      )}

                      {/* 500-800ms Circular Stability Progress Ring */}
                      {holdProgress > 0 && (
                        <svg className="target-hold-svg" viewBox="0 0 68 68">
                          <circle
                            cx="34"
                            cy="34"
                            r="30"
                            fill="none"
                            stroke={alignmentStatus === 'aligned_green' ? '#10b981' : '#00d4ff'}
                            strokeWidth="4"
                            strokeDasharray={188.5}
                            strokeDashoffset={188.5 - (188.5 * holdProgress) / 100}
                            strokeLinecap="round"
                          />
                        </svg>
                      )}
                    </div>

                    {/* Dynamic Status / Instruction Text */}
                    <div className="target-floating-badge">
                      {alignmentStatus === 'aligned_green'
                        ? 'HOLD STEADY'
                        : alignmentStatus === 'holding'
                        ? 'HOLD STEADY...'
                        : `${projection.directionHint} (${projection.degreesToTarget}°)`}
                    </div>
                  </div>
                </div>
              ) : (
                /* 3. Off-Screen Directional Edge Arrow with remaining degrees */
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
                    {projection.directionHint} ({projection.degreesToTarget}°)
                  </div>
                </div>
              )}

              {/* Actionable Guidance Banner (Concise instructions) */}
              <div className="hud-instruction-card">
                <div className="hud-primary-instruction">
                  {alignmentStatus === 'aligned_green'
                    ? 'HOLD STEADY'
                    : alignmentStatus === 'holding'
                    ? 'HOLD STEADY...'
                    : projection.guidanceText}
                </div>
                <div className="hud-secondary-hint">
                  {hasOrientationSensor
                    ? `Pitch: ${Math.round(orientation.pitch)}° • Yaw: ${Math.round(orientation.yaw)}° • Roll: ${Math.round(
                        orientation.roll
                      )}°`
                    : activeTarget.instruction}
                </div>
              </div>

              {/* Bottom Control Bar: Undo, Nav, Shutter, Nav */}
              <div className="hud-bottom-controls">
                {/* Retake / Undo Button */}
                <button
                  className="hud-nav-btn"
                  onClick={handleUndoLastCapture}
                  disabled={capturedHistory.length === 0}
                  style={{ opacity: capturedHistory.length === 0 ? 0.35 : 1 }}
                  title="Retake last frame / Undo capture"
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
                    className={`hud-shutter-btn ${activeTarget.isCaptured ? 'captured' : ''} ${
                      isCapturing ? 'capturing' : ''
                    }`}
                    onClick={captureCurrentTarget}
                    disabled={isCapturing}
                    aria-label={activeTarget.isCaptured ? 'Retake photo' : 'Capture photo'}
                    title={activeTarget.isCaptured ? 'Angle captured - tap to retake' : 'Capture photo manually'}
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
                      : 'Auto / Tap'}
                  </span>
                </div>

                {/* Next Target */}
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

        {/* Real Frame Quality & Overlap Inspection Banner */}
        {lastQualityReport && lastQualityReport.warnings.length > 0 && (
          <div className="coverage-notice-card alert" style={{ margin: '10px 0 0', padding: '10px 14px' }}>
            <AlertTriangle size={18} color="#f59e0b" style={{ flexShrink: 0 }} />
            <div style={{ fontSize: '0.82rem', color: '#fbbf24', display: 'flex', flexDirection: 'column', gap: '3px' }}>
              {lastQualityReport.warnings.map((w, i) => (
                <span key={i}>{w}</span>
              ))}
              <span style={{ fontSize: '0.74rem', opacity: 0.85 }}>
                Tip: You can tap Retake Last Frame to capture this position again with better alignment.
              </span>
            </div>
          </div>
        )}

        {/* Target Coverage Progression Bar */}
        <div className="camera-coverage-radar-section">
          <div className="radar-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Compass size={18} color="#00d4ff" />
              <h4>
                {captureMode === 'horizontal_360'
                  ? `360° Horizontal Ring (${stepAngle}° Step • ${targets.length} Positions)`
                  : 'Spherical 360° × 180° Radar'}
              </h4>
            </div>
            <span className="radar-status-text">
              {isRotationComplete
                ? 'Full 360° Rotation Complete! Ready to stitch.'
                : `${capturedCount} of ${targets.length} positions captured`}
            </span>
          </div>

          {/* Row of capture-position indicators */}
          <div className="guided-step-timeline">
            {targets.map((t, idx) => {
              const isActive = idx === activeTargetIndex;
              return (
                <button
                  key={t.id}
                  className={`timeline-dot-btn ${t.isCaptured ? 'captured' : ''} ${isActive ? 'active' : ''}`}
                  onClick={() => (t.isCaptured && isActive ? retakeTarget(idx) : setActiveTargetIndex(idx))}
                  title={`Position ${idx + 1}: ${t.label} (${
                    t.isCaptured ? 'Captured - click to retake' : 'Click to select target'
                  })`}
                  aria-label={`Position ${idx + 1}: ${t.label}`}
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

        {/* Modal Footer Controls */}
        <div
          className="modal-footer"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: '16px',
            flexWrap: 'wrap',
            gap: '10px',
          }}
        >
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
                onClick={handleRestartCapture}
                title="Restart capture from position 1"
              >
                Restart Capture
              </button>
            )}
          </div>

          <button
            className="btn btn-primary"
            onClick={handleFinish}
            disabled={capturedCount === 0}
            style={{ minWidth: '220px' }}
          >
            <Check size={18} />
            <span>
              {isRotationComplete
                ? 'Finish and Generate Panorama'
                : `Generate Panorama (${capturedCount}/${targets.length} Captured)`}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default CameraGuideModal;
