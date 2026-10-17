import React, { useState } from 'react';
import { ArrowLeft, ArrowRight, Camera, Check, Compass, X } from 'lucide-react';

interface CameraOnboardingProps {
  cameraReady: boolean;
  cameraLoading?: boolean;
  cameraError: string | null;
  sensorStatus: 'active' | 'permission_needed' | 'unsupported' | 'checking';
  onRequestCamera: () => Promise<void>;
  onRequestSensors: () => Promise<void>;
  onStartCapture: () => void;
  onSkipTutorial: () => void;
  onClose: () => void;
}

const tutorialSteps = [
  {
    title: 'Give yourself some space',
    description: 'Stand 3–4 feet away from nearby objects or surfaces.',
    illustration: 'room',
  },
  {
    title: 'Keep your phone close',
    description: 'Hold your phone close to your chest and keep it steady.',
    illustration: 'phone',
  },
  {
    title: 'Rotate in one spot',
    description: 'Plant your feet and slowly turn in place. Do not walk around.',
    illustration: 'rotate',
  },
  {
    title: 'Capture the floor',
    description: 'Step back and extend your arm to align the camera directly over the target.',
    illustration: 'floor',
  },
] as const;

function TutorialIllustration({ kind }: { kind: (typeof tutorialSteps)[number]['illustration'] }) {
  const shared = {
    fill: 'none',
    stroke: 'currentColor',
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    strokeWidth: 2.2,
  };

  if (kind === 'room') {
    return (
      <svg viewBox="0 0 320 250" role="img" aria-label="Person standing with space around them">
        <g {...shared}>
          <path d="M34 78 158 30l128 49M34 78v105l124 45 128-48V79M158 228V128" />
          <path d="M54 122h42v32H54zM224 132h38v29h-38zM215 123v-29h5v29M211 93l7-14 8 14" />
          <path d="M113 191c0-24 19-42 46-42s47 18 47 42M134 186v-34M184 186v-34" strokeDasharray="5 8" />
          <circle cx="159" cy="104" r="12" />
          <path d="M159 117v39m0-26-20 17m20-17 20 17m-20 9-13 29m13-29 14 29" />
          <path d="M122 187h74" strokeDasharray="3 8" />
        </g>
      </svg>
    );
  }

  if (kind === 'phone') {
    return (
      <svg viewBox="0 0 320 250" role="img" aria-label="Phone held near the chest">
        <g {...shared}>
          <path d="M112 218c-5-28-9-52-7-73 2-16 8-30 19-40l8-37c2-11 18-10 18 2v27l16-7 32-8c10-2 15 9 5 14l-31 14-14 20c4 22 7 43 8 66M110 146l24 16 19 54" />
          <path d="m145 88 1 30c0 8 12 10 16 3l8-14M167 107l26-12" />
          <rect x="192" y="82" width="17" height="31" rx="3" />
          <path d="M223 87h40M223 107h40" markerStart="url(#tutorial-arrow-start)" markerEnd="url(#tutorial-arrow-end)" />
          <defs>
            <marker id="tutorial-arrow-start" markerWidth="7" markerHeight="7" refX="3" refY="3.5" orient="auto"><path d="M6 0 0 3.5 6 7" fill="currentColor" stroke="none" /></marker>
            <marker id="tutorial-arrow-end" markerWidth="7" markerHeight="7" refX="4" refY="3.5" orient="auto"><path d="M0 0 6 3.5 0 7" fill="currentColor" stroke="none" /></marker>
          </defs>
        </g>
      </svg>
    );
  }

  if (kind === 'rotate') {
    return (
      <svg viewBox="0 0 320 250" role="img" aria-label="Rotate in place to capture a panorama">
        <g {...shared}>
          <path d="M42 87 70 67v69L42 153zM96 66l30-7v74l-30 9zM192 59l31 7v75l-31-9zM249 68l29 20v66l-29-17z" />
          <circle cx="56" cy="119" r="5" /><circle cx="112" cy="99" r="5" /><circle cx="207" cy="101" r="5" /><circle cx="264" cy="121" r="5" />
          <path d="M142 124c0-14 8-23 18-23s18 9 18 23v36h-36zM148 160v47m24-47v47m-24-32-19 22m43-22 18 22" />
          <path d="M62 165c22 39 52 53 98 53s78-15 99-53M75 159l-14 6 3 15m181-21 13 6-4 15" />
          <path d="M69 104c10-47 42-74 85-78m13 0c43 4 75 31 85 78" strokeDasharray="4 9" />
          <rect x="149" y="70" width="22" height="33" rx="3" />
          <circle cx="160" cy="80" r="2" />
        </g>
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 320 250" role="img" aria-label="Extend the phone over the floor target">
      <g {...shared}>
        <path d="M85 211c-7-27-3-49 5-67l-8-27c-4-12 11-19 18-8l14 22 10-37c3-11 18-8 16 3l-4 35 14-30c5-10 19-2 14 8l-12 31 20-18c8-7 18 4 10 12l-19 23c-1 17-3 35-4 53" />
        <path d="M92 211h83M141 96l67-13" />
        <rect x="203" y="66" width="23" height="37" rx="4" transform="rotate(-8 203 66)" />
        <path d="M215 104v69" strokeDasharray="5 8" />
        <ellipse cx="214" cy="190" rx="66" ry="13" fill="currentColor" opacity=".45" stroke="none" />
        <ellipse cx="214" cy="190" rx="24" ry="5" />
      </g>
    </svg>
  );
}

export const CameraOnboarding: React.FC<CameraOnboardingProps> = ({
  cameraReady,
  cameraLoading = false,
  cameraError,
  sensorStatus,
  onRequestCamera,
  onRequestSensors,
  onStartCapture,
  onSkipTutorial,
  onClose,
}) => {
  const [stepIndex, setStepIndex] = useState(0);
  const [isRequestingCamera, setIsRequestingCamera] = useState(false);
  const step = tutorialSteps[stepIndex];

  const handleAllowCamera = async () => {
    if (isRequestingCamera || cameraLoading) return;
    setIsRequestingCamera(true);
    try {
      await onRequestCamera();
    } finally {
      setIsRequestingCamera(false);
    }
  };

  const handleNext = () => {
    if (stepIndex < tutorialSteps.length - 1) setStepIndex((current) => current + 1);
    else if (cameraReady) onStartCapture();
  };

  return (
    <div className="onboarding-overlay onboarding-reference" role="dialog" aria-modal="true" aria-label="Panorama capture setup">
      <div className="tutorial-shell">
        <button className="tutorial-close" type="button" onClick={onClose} aria-label="Close setup">
          <X size={20} />
        </button>

        <div className="tutorial-art">
          <TutorialIllustration kind={step.illustration} />
        </div>

        <p className="tutorial-copy" key={stepIndex}>{step.description}</p>

        <div className="tutorial-status" aria-live="polite">
          {cameraError ? <p className="tutorial-error">{cameraError}</p> : null}
          {!cameraReady && !cameraError && (
            <p className="tutorial-camera-status">{cameraLoading ? 'Connecting to camera…' : 'Camera access is needed to start.'}</p>
          )}
          {cameraReady && <p className="tutorial-camera-ready"><Check size={14} /> Camera ready</p>}
          {!cameraReady && (
            <button type="button" className="tutorial-camera-button" onClick={() => void handleAllowCamera()} disabled={isRequestingCamera || cameraLoading}>
              <Camera size={16} />
              <span>{isRequestingCamera || cameraLoading ? 'Connecting…' : 'Allow camera access'}</span>
            </button>
          )}
          {sensorStatus === 'permission_needed' && (
            <button type="button" className="tutorial-sensor-button" onClick={() => void onRequestSensors()}>
              <Compass size={14} /> Enable motion guidance
            </button>
          )}
          {sensorStatus === 'unsupported' && <p className="tutorial-camera-status">Motion sensors unavailable; you can still take photos manually.</p>}
        </div>

        <div className="tutorial-step-dots" aria-label={`Step ${stepIndex + 1} of ${tutorialSteps.length}`}>
          {tutorialSteps.map((tutorialStep, index) => (
            <span key={tutorialStep.illustration} className={index === stepIndex ? 'active' : index < stepIndex ? 'complete' : ''} />
          ))}
        </div>

        <div className="tutorial-navigation">
          {stepIndex === 0 ? (
            <button type="button" className="tutorial-outline-button" onClick={onSkipTutorial}>Skip</button>
          ) : (
            <button type="button" className="tutorial-outline-button" onClick={() => setStepIndex((current) => Math.max(0, current - 1))}>
              <ArrowLeft size={17} /> Back
            </button>
          )}
          <button type="button" className="tutorial-next-button" onClick={handleNext} disabled={stepIndex === tutorialSteps.length - 1 && !cameraReady}>
            {stepIndex === tutorialSteps.length - 1 ? 'Start' : 'Next'}
            {stepIndex < tutorialSteps.length - 1 && <ArrowRight size={17} />}
          </button>
        </div>
      </div>
    </div>
  );
};
