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
  HelpCircle,
} from 'lucide-react';
import { globalCameraManager } from '../services/cameraManager';
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
import { AlignmentValidator } from '../services/alignmentValidator';
import { CaptureCountdown } from '../services/captureCountdown';
import { computeDirectionalGuidance } from '../services/directionalGuidance';
import {
  ImageQualityAnalyzer,
  type QualityReport
} from '../services/imageQualityAnalyzer';
import { feedback } from '../utils/feedback';
import { CameraOnboarding } from './CameraOnboarding';
import { CameraHelpModal } from './CameraHelpModal';

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
  // 1. Onboarding & Help State
  const [hasSeenOnboarding, setHasSeenOnboarding] = useState<boolean>(() => {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem('laveon_onboarding_completed') === 'true';
    }
    return false;
  });
  const [showOnboarding, setShowOnboarding] = useState<boolean>(() => !hasSeenOnboarding);
  const [showHelpModal, setShowHelpModal] = useState<boolean>(false);

  // 2. Capture Configuration State
  const [captureMode, setCaptureMode] = useState<CaptureMode>('horizontal_360');
  const [stepAngle, setStepAngle] = useState<RotationStepAngle>(36); // 36° = 10 shots (approx 35% overlap)
  const [overlapPct, setOverlapPct] = useState<number>(0.35);

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

  // Hardware Camera State
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraPlayable, setCameraPlayable] = useState(false);
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
    timestamp: 0,
  });
  const [hasOrientationSensor, setHasOrientationSensor] = useState(false);
  const [sensorStatus, setSensorStatus] = useState<'checking' | 'active' | 'permission_needed' | 'unsupported'>(
    () => globalOrientationTracker.getSensorStatus()
  );
  const [sensorMessage, setSensorMessage] = useState<string | null>(null);
  const [alignmentTargetId, setAlignmentTargetId] = useState<string | null>(null);
  const [angularVelocity, setAngularVelocity] = useState(0);

  // Controls & Feedback State
  const [isAutoCapturePaused, setIsAutoCapturePaused] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => feedback.isSoundEnabled());
  const [voiceEnabled, setVoiceEnabled] = useState<boolean>(() => feedback.isVoiceEnabled());

  // Countdown & Guidance Transient States
  const [countdownSeconds, setCountdownSeconds] = useState<number>(3);
  const [countdownProgress, setCountdownProgress] = useState<number>(0);
  const [isCountdownActive, setIsCountdownActive] = useState<boolean>(false);
  const [recentlyCaptured, setRecentlyCaptured] = useState<boolean>(false);
  const [phoneMovedWarning, setPhoneMovedWarning] = useState<boolean>(false);
  const lastSecondRef = useRef<number>(3);

  // Modular Services instances
  const validator = useMemo(() => new AlignmentValidator({ toleranceDegrees: 3, stabilityDurationMs: 650 }), []);
  const countdownController = useMemo(() => new CaptureCountdown(3000), []);

  // DOM Refs
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const nativeInputRef = useRef<HTMLInputElement | null>(null);
  const captureLockRef = useRef(false);
  const lastAlignmentSampleRef = useRef({ timestamp: 0, targetId: '' });
  const orientationTimestampRef = useRef(orientation.timestamp);

  const activeTarget = targets[activeTargetIndex] || targets[0];
  const isCurrentTargetAligned = alignmentTargetId === activeTarget.id;
  const capturedCount = targets.filter((t) => t.isCaptured).length;
  const isRotationComplete = capturedCount === targets.length;

  // Multi-tier camera startup via CameraManager
  const startCamera = useCallback(async (overrideDeviceId?: string) => {
    setCameraError(null);
    setIsStartingCamera(true);
    setCameraPlayable(false);
    const previousTrack = globalCameraManager.getActiveStream()?.getVideoTracks()[0];
    if (previousTrack) previousTrack.onended = null;

    try {
      const res = await globalCameraManager.startStream(overrideDeviceId);
      setCameraActive(true);
      setCameraPlayable(false);

      if (videoRef.current) {
        videoRef.current.srcObject = res.stream;
        res.videoTrack.onended = () => {
          setCameraPlayable(false);
          setCameraActive(false);
          setCameraError('Camera access ended. Reconnect the camera and try again.');
        };
        videoRef.current.onloadeddata = () => setCameraPlayable(true);
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play().catch((playErr) => {
            console.warn('Video play prevented by browser:', playErr);
            setCameraError('The camera stream opened, but the preview did not start. Retry camera access or use your device camera.');
            setCameraPlayable(false);
            setCameraActive(false);
          });
        };
      }

      const devices = await globalCameraManager.getAvailableCameras();
      setAvailableCameras(devices);
      if (res.deviceId) {
        setSelectedDeviceId(res.deviceId);
      }
    } catch (err: any) {
      console.error('Camera access error:', err);
      let errorMsg = 'Could not access camera.';
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        errorMsg = 'Camera permission denied. Click the lock or camera icon in your address bar to allow.';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        errorMsg = 'No camera hardware detected. Connect a camera or use "Snap with Device Camera".';
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        errorMsg = 'Camera is already in use by another app. Please close other camera apps and retry.';
      } else if (err.message) {
        errorMsg = err.message;
      }
      setCameraError(errorMsg);
      setCameraPlayable(false);
      setCameraActive(false);
    } finally {
      setIsStartingCamera(false);
    }
  }, []);

  // Clean stop camera stream
  const stopCamera = useCallback(() => {
    const track = globalCameraManager.getActiveStream()?.getVideoTracks()[0];
    if (track) track.onended = null;
    globalCameraManager.stopStream();
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
      videoRef.current.onloadeddata = null;
      videoRef.current.onloadedmetadata = null;
    }
    setCameraPlayable(false);
    setCameraActive(false);
    feedback.cancelSpeech();
  }, []);
  // Request iOS 13+ sensor permissions
  const requestOrientationPermission = async () => {
    const granted = await globalOrientationTracker.requestPermission();
    if (granted) {
      setSensorMessage(null);
      setSensorStatus('checking');
      globalOrientationTracker.start();
      const received = await globalOrientationTracker.waitForReading();
      if (!received) {
        setSensorStatus('unsupported');
        setSensorMessage('Motion sensors were allowed, but this browser is not providing orientation readings. Manual capture is available.');
      }
    } else {
      setSensorStatus('unsupported');
      setSensorMessage('Motion sensor permission was denied or is unavailable. You can still capture photos manually.');
    }
  };

  // Re-calibrate relative 0° heading to current phone direction
  const handleRecenter = useCallback(() => {
    globalOrientationTracker.recenter();
    validator.reset();
    setAlignmentTargetId(null);
    countdownController.resetForNextTarget();
    setIsCountdownActive(false);
    setCountdownProgress(0);
    setPhoneMovedWarning(false);
    feedback.playLockTick();
  }, [countdownController, validator]);

  const handleStartFromOnboarding = async () => {
    if (!cameraActive || !cameraPlayable) {
      setCameraError('Wait for the live camera preview before starting capture.');
      return;
    }

    const permissionGranted = await globalOrientationTracker.requestPermission();
    if (permissionGranted) {
      globalOrientationTracker.start();
      const received = await globalOrientationTracker.waitForReading();
      if (received) {
        globalOrientationTracker.recenter();
        validator.reset();
        setHasOrientationSensor(true);
        setSensorStatus('active');
        setSensorMessage(null);
        setOrientation((previous) => ({ ...previous, yaw: 0, pitch: 0, roll: 0, isCalibrated: true, timestamp: Date.now() }));
      } else {
        setHasOrientationSensor(false);
        setSensorStatus('unsupported');
        setSensorMessage('No motion readings arrived. Manual capture is available; alignment guidance needs a supported motion sensor.');
      }
    } else {
      globalOrientationTracker.stop();
      setHasOrientationSensor(false);
      setSensorStatus('unsupported');
      setSensorMessage('Motion sensor permission was denied or is unavailable. Manual capture is available.');
    }

    setShowOnboarding(false);
    setHasSeenOnboarding(true);
    if (typeof localStorage !== 'undefined') localStorage.setItem('laveon_onboarding_completed', 'true');
  };

  // Handle Mode Change (Horizontal Ring vs Full Sphere)
  const handleModeChange = (newMode: CaptureMode) => {
    targets.forEach((target) => target.previewUrl && URL.revokeObjectURL(target.previewUrl));
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
    countdownController.resetForNextTarget();
  };

  const handleStepAngleChange = (newStep: RotationStepAngle) => {
    targets.forEach((target) => target.previewUrl && URL.revokeObjectURL(target.previewUrl));
    setStepAngle(newStep);
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
    countdownController.resetForNextTarget();
  };

  // Directional guidance calculation (Single instruction at a time, no jargon)
  const guidance = useMemo(() => {
    const calculated = computeDirectionalGuidance({
      target: activeTarget,
      currentYaw: orientation.yaw,
      currentPitch: orientation.pitch,
      currentRoll: orientation.roll,
      angularVelocity,
      isCountdownActive,
      countdownSeconds,
      isCapturing,
      recentlyCaptured,
      phoneMovedWarning,
      qualityWarning: lastQualityReport?.warnings?.[0],
      capturedCount,
      totalCount: targets.length,
      hfov: 60,
      vfov: 75,
      toleranceDegrees: 3.5,
    });
    const sensorReady = hasOrientationSensor && orientation.isCalibrated;
    const yawError = ((activeTarget.targetYaw - orientation.yaw + 540) % 360) - 180;
    const remainingAngle = Math.round(Math.hypot(yawError, activeTarget.targetPitch - orientation.pitch));
    return {
      ...calculated,
      visualState: isCurrentTargetAligned ? 'aligned_green' as const : calculated.visualState === 'aligned_green' ? 'approaching' as const : calculated.visualState,
      instruction: !sensorReady ? 'Motion tracking unavailable.' : isCurrentTargetAligned ? 'HOLD STEADY' : calculated.instruction,
      subInstruction: !sensorReady
        ? (sensorMessage || 'Use manual capture or allow motion sensor access.')
        : remainingAngle > 3 && !isCurrentTargetAligned
          ? `${calculated.subInstruction || 'Follow the marker.'} ${remainingAngle}° to target.`
          : calculated.subInstruction,
    };
  }, [
    activeTarget,
    orientation.yaw,
    orientation.pitch,
    orientation.roll,
    orientation.isCalibrated,
    angularVelocity,
    isCurrentTargetAligned,
    hasOrientationSensor,
    sensorMessage,
    isCountdownActive,
    countdownSeconds,
    isCapturing,
    recentlyCaptured,
    phoneMovedWarning,
    lastQualityReport?.warnings,
    capturedCount,
    targets.length,
  ]);

  // Capture the current target frame and check blur/exposure.
  const captureCurrentTarget = useCallback(() => {
    if (!videoRef.current || !cameraActive || !cameraPlayable || isCapturing || captureLockRef.current || activeTarget.isCaptured) return;

    captureLockRef.current = true;
    setIsCapturing(true);
    setIsFlashing(true);

    feedback.playCaptureChime();
    feedback.triggerHapticCapture();
    setTimeout(() => setIsFlashing(false), 240);

    const video = videoRef.current;
    const canvas = canvasRef.current || document.createElement('canvas');
    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || video.videoWidth === 0 || video.videoHeight === 0) {
      setIsCapturing(false);
      captureLockRef.current = false;
      setCameraError('The camera preview is not ready yet. Wait for a live image and try again.');
      return;
    }
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      setCameraError('This browser could not prepare the captured image. Please retry.');
      setIsCapturing(false);
      captureLockRef.current = false;
      return;
    }

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Blur and exposure are measured locally. Visual overlap is deliberately
    // reported as unverified until feature matching is implemented.
    const report = qualityAnalyzer.analyzeFrame(canvas, overlapPct);
    setLastQualityReport(report);

    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setCameraError('This browser could not save the captured frame. Please retry.');
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
                  blurScore: report.blurScore,
                  exposureScore: report.exposureScore,
                  overlapScore: report.overlapScore,
                  orientationMetadata: hasOrientationSensor && orientation.isCalibrated ? {
                    capturedYaw: Math.round(orientation.yaw),
                    capturedPitch: Math.round(orientation.pitch),
                    capturedRoll: Math.round(orientation.roll),
                    timestamp,
                  } : undefined,
                }
              : t
          )
        );

        setCapturedHistory((prev) => [...prev, activeTargetIndex]);
        countdownController.resetForNextTarget();
        setIsCountdownActive(false);
        setCountdownProgress(0);

        // Voice feedback: "Position X of Y captured."
        const newCapturedTotal = capturedCount + 1;
        feedback.speak(`Position ${newCapturedTotal} of ${targets.length} captured.`);

        // Flag recently captured for 2s confirmation state
        setRecentlyCaptured(true);
        setTimeout(() => setRecentlyCaptured(false), 2200);

        // Automatically advance to the next uncaptured target
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
        validator.reset();
        setAlignmentTargetId(null);
      },
      'image/jpeg',
      0.95
    );
  }, [
    activeTarget,
    activeTargetIndex,
    cameraActive,
    cameraPlayable,
    capturedCount,
    countdownController,
    isCapturing,
    hasOrientationSensor,
    orientation.pitch,
    orientation.roll,
    orientation.yaw,
    orientation.isCalibrated,
    overlapPct,
    qualityAnalyzer,
    targets,
    validator,
  ]);

  // Main Alignment & 3-Second Stability Auto-Capture Loop
  useEffect(() => {
    if (
      !cameraActive ||
      !cameraPlayable ||
      !hasOrientationSensor ||
      !orientation.isCalibrated ||
      isAutoCapturePaused ||
      activeTarget.isCaptured ||
      isCapturing ||
      captureLockRef.current
    ) {
      countdownController.resetForNextTarget();
      setIsCountdownActive(false);
      setCountdownProgress(0);
      setAlignmentTargetId(null);
      validator.reset();
      return;
    }

    if (lastAlignmentSampleRef.current.timestamp === orientation.timestamp &&
        lastAlignmentSampleRef.current.targetId === activeTarget.id) return;
    if (lastAlignmentSampleRef.current.targetId !== activeTarget.id) {
      validator.reset();
      setAlignmentTargetId(null);
    }
    lastAlignmentSampleRef.current = { timestamp: orientation.timestamp, targetId: activeTarget.id };

    // Evaluate alignment tolerance and stability
    // Shortest angular distance between target and current heading
    let deltaYaw = ((activeTarget.targetYaw - orientation.yaw + 540) % 360) - 180;
    let deltaPitch = activeTarget.targetPitch - orientation.pitch;
    const angularDist = Math.hypot(deltaYaw, deltaPitch);

    const evaluation = validator.evaluate({
      angularDistance: angularDist,
      yaw: orientation.yaw,
      pitch: orientation.pitch,
      roll: orientation.roll,
      timestamp: orientation.timestamp,
      isCalibrated: orientation.isCalibrated,
      hasCameraFrame: cameraPlayable && !!videoRef.current && videoRef.current.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA,
      isPaused: isAutoCapturePaused,
      isCapturing,
    });
    setAlignmentTargetId(evaluation.isReadyForCountdown ? activeTarget.id : null);
    setAngularVelocity(evaluation.angularVelocity);

    // Update 3-second countdown
    const countdownState = countdownController.update(evaluation.isReadyForCountdown);

    setIsCountdownActive(countdownState.isActive);
    setCountdownSeconds(countdownState.secondsRemaining);
    setCountdownProgress(countdownState.progressRatio);

    // Sound and voice ticks
    if (countdownState.isActive) {
      if (countdownState.secondsRemaining !== lastSecondRef.current) {
        lastSecondRef.current = countdownState.secondsRemaining;
        feedback.playCountdownBeep(countdownState.secondsRemaining);
        if (countdownState.secondsRemaining === 3) {
          feedback.triggerHapticLock();
          feedback.speak('Perfect! Hold still.');
        }
      }
    } else {
      lastSecondRef.current = 3;
    }

    // Phone moved cancellation
    if (countdownState.wasCanceled && countdownState.cancelReason === 'phone_moved') {
      queueMicrotask(() => {
        setPhoneMovedWarning(true);
        feedback.speak('Your phone moved. Please try again.');
        setTimeout(() => setPhoneMovedWarning(false), 2400);
      });
    }

    // Countdown reached zero with stability maintained
    if (countdownState.shouldTriggerCapture) {
      captureCurrentTarget();
    }
  }, [
    activeTarget,
    captureCurrentTarget,
    cameraActive,
    cameraPlayable,
    countdownController,
    hasOrientationSensor,
    isAutoCapturePaused,
    isCapturing,
    orientation.pitch,
    orientation.roll,
    orientation.yaw,
    orientation.timestamp,
    orientation.isCalibrated,
    validator,
  ]);

  useEffect(() => {
    if (!isOpen || !hasOrientationSensor || !orientation.isCalibrated) return;
    const timer = window.setInterval(() => {
      if (Date.now() - orientationTimestampRef.current > 1000) {
        validator.reset();
        countdownController.resetForNextTarget();
        setAlignmentTargetId(null);
        setIsCountdownActive(false);
        setCountdownProgress(0);
        setHasOrientationSensor(false);
        setSensorStatus('unsupported');
        setSensorMessage('Motion readings stopped. Restart capture or use manual capture.');
      }
    }, 250);
    return () => window.clearInterval(timer);
  }, [countdownController, hasOrientationSensor, isOpen, orientation.isCalibrated, validator]);

  // Subscribe to orientation tracker
  useEffect(() => {
    if (!isOpen) return;

    const unsubscribe = globalOrientationTracker.subscribe((data) => {
      setHasOrientationSensor(true);
      setOrientation(data);
      setSensorStatus('active');
    });

    return () => {
      unsubscribe();
      countdownController.resetForNextTarget();
    };
  }, [countdownController, isOpen]);

  // Start one camera stream per modal session; callback identity changes (for
  // example after camera selection) must not silently open another stream.
  useEffect(() => {
    let active = true;
    if (isOpen) {
      queueMicrotask(() => {
        if (active) void startCamera();
      });
    }
    return () => {
      active = false;
      if (isOpen) stopCamera();
    };
  }, [isOpen, startCamera, stopCamera]);

  useEffect(() => {
    orientationTimestampRef.current = orientation.timestamp;
  }, [orientation.timestamp]);

  // Onboarding handlers
  const handleSkipTutorial = () => void handleStartFromOnboarding();

  // Undo the last captured photo
  const handleUndoLastCapture = () => {
    if (capturedHistory.length === 0) return;

    const lastCapturedIdx = capturedHistory[capturedHistory.length - 1];
    const oldPreview = targets[lastCapturedIdx]?.previewUrl;
    if (oldPreview) URL.revokeObjectURL(oldPreview);
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
    countdownController.resetForNextTarget();
    setIsCountdownActive(false);
    setCountdownProgress(0);
    setLastQualityReport(null);
    feedback.playLockTick();
  };

  // Retake a specific target
  const retakeTarget = (index: number) => {
    const oldPreview = targets[index]?.previewUrl;
    if (oldPreview) URL.revokeObjectURL(oldPreview);
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
    setCapturedHistory((previous) => previous.filter((capturedIndex) => capturedIndex !== index));
    countdownController.resetForNextTarget();
    setIsCountdownActive(false);
    setCountdownProgress(0);
    setLastQualityReport(null);
  };

  // Native camera fallback capture
  const handleNativeCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || activeTarget.isCaptured || captureLockRef.current) return;
    captureLockRef.current = true;

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
              blurScore: undefined,
              exposureScore: undefined,
              overlapScore: null,
              orientationMetadata: hasOrientationSensor && orientation.isCalibrated ? {
                capturedYaw: Math.round(orientation.yaw),
                capturedPitch: Math.round(orientation.pitch),
                capturedRoll: Math.round(orientation.roll),
                timestamp,
              } : undefined,
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
    setLastQualityReport(null);
    captureLockRef.current = false;
  };

  // Complete and hand over captured photos to the application
  const handleFinish = () => {
    if (!isRotationComplete) return;
    const capturedPhotos = targets
      .filter((t) => t.isCaptured && t.photoFile)
      .map((t) => t.photoFile as File);

    if (capturedPhotos.length > 0) {
      onAddCapturedPhotos(capturedPhotos);
    }
    targets.forEach((target) => target.previewUrl && URL.revokeObjectURL(target.previewUrl));
    stopCamera();
    onClose();
  };

  // Reset entire capture session
  const handleRestartCapture = () => {
    targets.forEach((target) => target.previewUrl && URL.revokeObjectURL(target.previewUrl));
    setTargets(planner.generateTargets());
    setActiveTargetIndex(0);
    setCapturedHistory([]);
    qualityAnalyzer.reset();
    setLastQualityReport(null);
    countdownController.resetForNextTarget();
    setIsCountdownActive(false);
    setCountdownProgress(0);
  };

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop camera-guide-backdrop">
      <div className={`modal-content camera-guide-modal-container ${cameraActive && !showOnboarding ? 'camera-capture-active' : ''}`}>
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
                <h2 className="modal-title">Guided Camera Assistant</h2>
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
                Follow the green frame to the center marker. Hold steady to capture each view.
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {/* Help Button (Plain language explanation of current step) */}
            <button
              type="button"
              className="btn btn-sm btn-secondary"
              style={{ fontSize: '0.75rem', padding: '6px 10px', height: '32px' }}
              onClick={() => setShowHelpModal(true)}
              title="Show step-by-step help in plain language"
            >
              <HelpCircle size={15} color="#00d4ff" />
              <span>Help</span>
            </button>

            {/* Mode Switcher */}
            <button
              type="button"
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

        {/* Live Viewfinder & Guided Camera HUD */}
        <div className={`camera-viewfinder-wrapper ${isFlashing ? 'camera-shutter-flash' : ''}`}>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={`camera-video-element ${cameraActive ? 'active' : 'hidden'}`}
          />
          <canvas ref={canvasRef} style={{ display: 'none' }} />

          {/* Onboarding Overlay Flow (Section A) */}
          {showOnboarding && (
            <CameraOnboarding
              cameraReady={cameraPlayable}
              cameraLoading={isStartingCamera}
              cameraError={cameraError}
              sensorStatus={sensorStatus}
              onRequestCamera={() => startCamera()}
              onRequestSensors={requestOrientationPermission}
              onStartCapture={handleStartFromOnboarding}
              onSkipTutorial={handleSkipTutorial}
              onClose={onClose}
            />
          )}

          {/* Fallback Screen when Camera is Stopped or Initializing */}
          {!cameraActive && !showOnboarding && (
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

                <h3>{isStartingCamera ? 'Connecting to Camera…' : 'Camera Access Needed'}</h3>
                <p>
                  {isStartingCamera
                    ? 'Connecting to your device camera stream. Click "Allow" if prompted by your browser.'
                    : 'To provide live guided tracking, allow camera access or snap directly using your device camera.'}
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
                        <span>Starting Camera…</span>
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

          {/* Active Overlay HUD (Section B, C, D) */}
          {cameraActive && !showOnboarding && (
            <div className="camera-hud-overlay">
              {/* Top Bar: Progress, Calibrate 0°, Voice, Audio, Pause, Camera switch */}
              <div className="hud-top-bar">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <div className="hud-badge active-target-badge">
                    <span style={{ color: '#00d4ff', fontWeight: 700 }}>
                      Position {activeTargetIndex + 1} of {targets.length}
                    </span>
                    <span style={{ opacity: 0.5 }}>•</span>
                    <span>{activeTarget.label}</span>
                  </div>

                  {/* Reset / Set Start 0° Button */}
                  <button
                    type="button"
                    className="hud-badge hud-action-pill"
                    onClick={handleRecenter}
                    title="Calibrate Forward: Sets current phone heading as starting orientation"
                  >
                    <RotateCcw size={12} color="#00d4ff" />
                    <span>Set Start 0°</span>
                  </button>

                  {/* iOS sensor permission pill if needed */}
                  {sensorStatus === 'permission_needed' && (
                    <button
                      type="button"
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
                  {/* Step Angle Selector (30°, 36°, 45°) */}
                  {captureMode === 'horizontal_360' && (
                    <select
                      className="hud-badge"
                      value={stepAngle}
                      onChange={(e) => handleStepAngleChange(parseInt(e.target.value) as RotationStepAngle)}
                      title="Select rotation step between shots"
                      style={{
                        cursor: 'pointer',
                        background: 'rgba(7, 11, 20, 0.85)',
                        color: '#fff',
                        border: '1px solid rgba(255,255,255,0.2)',
                      }}
                    >
                      <option value={30}>Every 30° (12 shots)</option>
                      <option value={36}>Every 36° (10 shots)</option>
                      <option value={45}>Every 45° (8 shots)</option>
                    </select>
                  )}

                  {/* Audio Chimes Toggle */}
                  <button
                    type="button"
                    className="hud-icon-btn"
                    onClick={() => {
                      const next = !soundEnabled;
                      setSoundEnabled(next);
                      feedback.setSoundEnabled(next);
                    }}
                    title={soundEnabled ? 'Mute audio beeps and chimes' : 'Enable audio beeps and chimes'}
                    aria-label="Toggle audio tones"
                  >
                    {soundEnabled ? <Volume2 size={16} color="#10b981" /> : <VolumeX size={16} color="#94a3b8" />}
                  </button>

                  {/* Spoken Voice Toggle (Section D) */}
                  <button
                    type="button"
                    className="hud-icon-btn"
                    onClick={() => {
                      const next = !voiceEnabled;
                      setVoiceEnabled(next);
                      feedback.setVoiceEnabled(next);
                    }}
                    title={voiceEnabled ? 'Mute spoken voice assistant' : 'Enable spoken voice assistant'}
                    aria-label="Toggle voice guidance"
                  >
                    {voiceEnabled ? <Volume2 size={16} color="#00d4ff" /> : <VolumeX size={16} color="#94a3b8" />}
                  </button>

                  {/* Pause / Resume Auto-Capture */}
                  {
                    <button
                      type="button"
                      className={`hud-icon-btn ${isAutoCapturePaused ? 'paused' : ''}`}
                      onClick={() => setIsAutoCapturePaused(!isAutoCapturePaused)}
                      title={isAutoCapturePaused ? 'Resume Auto-Capture' : 'Pause Auto-Capture (Manual Shutter)'}
                      aria-label="Toggle auto capture pause"
                    >
                      {isAutoCapturePaused ? <Play size={16} color="#f59e0b" /> : <Pause size={16} color="#00d4ff" />}
                    </button>
                  }

                  {/* Camera switcher if multiple cameras detected */}
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
                      {capturedCount} / {targets.length}
                    </span>
                  </div>
                </div>
              </div>

              {/* Fixed white composition frame from the reference capture view. */}
              <div className={`target-rectangular-frame ${isCurrentTargetAligned ? 'aligned' : ''}`} aria-hidden="true" />

              {/* The green panel follows the next orientation target; its circular window reveals the camera image. */}
              <div
                className={`hud-target-panel ${isCurrentTargetAligned ? 'aligned' : guidance.visualState === 'approaching' ? 'approaching' : ''}`}
                style={{
                  left: `${guidance.screenX}%`,
                  top: `${guidance.screenY}%`,
                  transform: `translate(-50%, -50%) rotate(${Math.max(-16, Math.min(16, orientation.roll * 0.9))}deg)`,
                }}
                aria-hidden="true"
              />

              {/* The center marker only displays HOLD after the calibrated stability check passes. */}
              <div className="hud-center-reticle-container">
                <div className={`hud-hold-marker ${isCurrentTargetAligned ? 'aligned' : ''}`}>
                  {isCountdownActive && (
                    <svg className="target-countdown-svg" viewBox="0 0 100 100" aria-hidden="true">
                      <circle cx="50" cy="50" r="44" fill="none" stroke="rgba(0, 0, 0, 0.12)" strokeWidth="5" />
                      <circle
                        cx="50"
                        cy="50"
                        r="44"
                        fill="none"
                        stroke="#12b981"
                        strokeWidth="5"
                        strokeDasharray={276.4}
                        strokeDashoffset={276.4 * (1 - countdownProgress)}
                        strokeLinecap="round"
                        transform="rotate(-90 50 50)"
                      />
                    </svg>
                  )}
                  <span>{isCurrentTargetAligned ? (isCountdownActive ? countdownSeconds : 'HOLD') : ''}</span>
                </div>

                {!isCurrentTargetAligned && guidance.primaryDirection !== 'aligned' && (
                  <div
                    className="hud-target-pointer"
                    style={{ transform: `rotate(${guidance.arrowAngleDeg}deg) translateX(59px)` }}
                    aria-hidden="true"
                  />
                )}

                {hasOrientationSensor && (
                  <div className="hud-level-indicator" title="Hold phone level horizontally">
                    <div
                      className={`hud-level-line ${Math.abs(orientation.roll) < 4 ? 'level' : ''}`}
                      style={{ transform: `rotate(${-orientation.roll}deg)` }}
                    />
                  </div>
                )}
              </div>

              {/* 4. Primary Single Instruction Banner (Section B & E) */}
              <div className="hud-instruction-card">
                <div className="hud-primary-instruction">{guidance.instruction}</div>
                {guidance.subInstruction && (
                  <div className="hud-secondary-hint">{guidance.subInstruction}</div>
                )}
              </div>

              {/* Bottom controls and capture-position dots. */}
              <div className="hud-bottom-controls-container">
                <div className="hud-progress-summary-text">{capturedCount} of {targets.length} positions captured</div>
                <div className="hud-capture-dots" aria-label={`${capturedCount} of ${targets.length} positions captured`}>
                  {targets.map((target, index) => (
                    <button
                      type="button"
                      key={target.id}
                      className={`hud-capture-dot ${target.isCaptured ? 'captured' : ''} ${index === activeTargetIndex ? 'active' : ''}`}
                      onClick={() => target.isCaptured ? retakeTarget(index) : setActiveTargetIndex(index)}
                      aria-label={`Position ${index + 1}${target.isCaptured ? ', captured' : index === activeTargetIndex ? ', current target' : ''}`}
                    />
                  ))}
                </div>

                <div className="hud-bottom-controls">
                  {/* Retake / Undo Button */}
                  <button
                    type="button"
                    className="hud-nav-btn"
                    onClick={handleUndoLastCapture}
                    disabled={capturedHistory.length === 0}
                    style={{ opacity: capturedHistory.length === 0 ? 0.35 : 1 }}
                    title="Retake last photo / Undo capture"
                    aria-label="Retake last frame"
                  >
                    <RotateCcw size={20} />
                  </button>

                  {/* Previous Target */}
                  <button
                    type="button"
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
                      type="button"
                      className={`hud-shutter-btn ${activeTarget.isCaptured ? 'captured' : ''} ${
                        isCapturing ? 'capturing' : ''
                      }`}
                      onClick={() => activeTarget.isCaptured ? retakeTarget(activeTargetIndex) : captureCurrentTarget()}
                      disabled={isCapturing || !cameraPlayable}
                      aria-label={activeTarget.isCaptured ? 'Retake photo' : 'Capture photo'}
                      title={activeTarget.isCaptured ? 'Retake this position' : 'Capture photo manually'}
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
                        ? 'Capture Manually'
                        : isCountdownActive
                        ? 'Hold Still…'
                        : 'Capture Manually'}
                    </span>
                  </div>

                  {/* Next Target */}
                  <button
                    type="button"
                    className="hud-nav-btn"
                    onClick={() => {
                      const nextUncaptured = targets.findIndex((t, idx) => idx > activeTargetIndex && !t.isCaptured);
                      if (nextUncaptured !== -1) {
                        setActiveTargetIndex(nextUncaptured);
                      } else {
                        setActiveTargetIndex((prev) => (prev < targets.length - 1 ? prev + 1 : 0));
                      }
                    }}
                    title="Next angle"
                    aria-label="Next angle"
                  >
                    <ChevronRight size={22} />
                  </button>
                </div>
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
                Tip: You can tap the Retake button to capture this position again with better alignment.
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
                  type="button"
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
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                stopCamera();
                onClose();
              }}
            >
              Cancel
            </button>

            <button
              type="button"
              className="btn btn-outline"
              onClick={() => nativeInputRef.current?.click()}
              title="Capture photo using your device's native camera application"
            >
              <Smartphone size={16} />
              <span>Snap with Device Camera</span>
            </button>

            {capturedCount > 0 && (
              <button
                type="button"
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
            type="button"
            className="btn btn-primary"
            onClick={handleFinish}
            disabled={!isRotationComplete}
            style={{ minWidth: '220px' }}
          >
            <Check size={18} />
            <span>
              {isRotationComplete
                ? 'Finish and Generate Panorama'
                : `Capture remaining positions (${capturedCount}/${targets.length})`}
            </span>
          </button>
        </div>

        {/* Plain Language Step Help Modal */}
        <CameraHelpModal
          isOpen={showHelpModal}
          onClose={() => setShowHelpModal(false)}
          currentStepLabel={`Position ${activeTargetIndex + 1}: ${guidance.instruction}`}
        />
      </div>
    </div>
  );
};

export default CameraGuideModal;
