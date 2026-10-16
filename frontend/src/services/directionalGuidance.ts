/**
 * DirectionalGuidance
 * Calculates shortest spherical angular trajectories, 2D screen projections,
 * arrow bearings, and single actionable plain-English instructions for beginner users.
 * Strictly eliminates all technical jargon (yaw, pitch, roll, degrees, compass bearings).
 */

import type { SphericalTarget } from './targetPlanner';

export type PrimaryDirection = 'turn_right' | 'turn_left' | 'tilt_up' | 'tilt_down' | 'aligned';

export type AlignmentVisualState = 'far' | 'approaching' | 'aligned_green' | 'captured';

export interface DirectionalGuidanceState {
  // Screen placement percentage for the floating target dot [0, 100]
  screenX: number;
  screenY: number;
  isInView: boolean;

  // Arrow attributes
  primaryDirection: PrimaryDirection;
  arrowAngleDeg: number;       // Angle in degrees pointing towards the target dot (0° = right, 90° = down, 180° = left, 270° = up)
  distanceRatio: number;       // 0 (perfect alignment) to 1 (far away)

  // Visual state
  visualState: AlignmentVisualState;
  isWithinTolerance: boolean;

  // Single plain-English instruction (no angles, no jargon)
  instruction: string;
  subInstruction?: string;

  // Progress summary string
  progressSummary: string;
}

export interface GuidanceInput {
  target: SphericalTarget;
  currentYaw: number;
  currentPitch: number;
  currentRoll: number;
  angularVelocity: number;      // degrees / second
  isCountdownActive: boolean;
  countdownSeconds: number;     // 3, 2, 1
  isCapturing: boolean;
  recentlyCaptured: boolean;    // true for ~2 seconds after a successful shutter
  phoneMovedWarning: boolean;   // true when movement canceled countdown
  qualityWarning?: string;      // e.g. "Too dark" or "Blurry"
  capturedCount: number;
  totalCount: number;
  hfov?: number;                // default 60
  vfov?: number;                // default 75
  toleranceDegrees?: number;    // default 3.5
}

/**
 * Computes directional guidance and beginner-friendly instructions
 */
export function computeDirectionalGuidance(input: GuidanceInput): DirectionalGuidanceState {
  const {
    target,
    currentYaw,
    currentPitch,
    currentRoll,
    angularVelocity,
    isCountdownActive,
    countdownSeconds,
    isCapturing,
    recentlyCaptured,
    phoneMovedWarning,
    qualityWarning,
    capturedCount,
    totalCount,
    hfov = 60,
    vfov = 75,
    toleranceDegrees = 3.5,
  } = input;

  // 1. Shortest angular distance calculation with 0/360 wrap-around
  // deltaYaw > 0 means target is to user's right; < 0 means to user's left
  let deltaYaw = ((target.targetYaw - currentYaw + 540) % 360) - 180;
  if (deltaYaw === -180) deltaYaw = 180; // Prefer clockwise turn for panoramic sweep
  let deltaPitch = target.targetPitch - currentPitch;
  const angularDistance = Math.hypot(deltaYaw, deltaPitch);

  // 2. Screen projection coordinates (50% = viewport center)
  const rawX = 50 + (deltaYaw / hfov) * 100;
  const rawY = 50 - (deltaPitch / vfov) * 100;

  // Target is considered in-view when inside screen boundaries with margin
  const isInView = rawX >= 12 && rawX <= 88 && rawY >= 14 && rawY <= 86;

  // Clamped coordinates for floating target circle
  let screenX = rawX;
  let screenY = rawY;

  if (!isInView) {
    const dx = rawX - 50;
    const dy = rawY - 50;
    const dist = Math.hypot(dx, dy) || 1;
    const clampRadius = 38; // 38% radius from center
    screenX = 50 + (dx / dist) * clampRadius;
    screenY = 50 + (dy / dist) * clampRadius;
  }

  // Ensure within viewport bounds
  screenX = Math.max(8, Math.min(92, screenX));
  screenY = Math.max(10, Math.min(90, screenY));

  // 3. Arrow pointing angle towards the target
  const arrowAngleDeg = (Math.atan2(rawY - 50, rawX - 50) * (180 / Math.PI) + 360) % 360;

  // 4. Determine primary direction for simple 1-direction arrows
  let primaryDirection: PrimaryDirection = 'turn_right';
  if (angularDistance <= toleranceDegrees) {
    primaryDirection = 'aligned';
  } else if (Math.abs(deltaPitch) > 14 && Math.abs(deltaPitch) > Math.abs(deltaYaw)) {
    primaryDirection = deltaPitch > 0 ? 'tilt_up' : 'tilt_down';
  } else {
    primaryDirection = deltaYaw > 0 ? 'turn_right' : 'turn_left';
  }

  // 5. Visual state determination
  const isWithinTolerance = angularDistance <= toleranceDegrees && Math.abs(currentRoll) <= 12;
  const isSteady = angularVelocity <= 4.5;
  let visualState: AlignmentVisualState = 'far';

  if (target.isCaptured) {
    visualState = 'captured';
  } else if (isWithinTolerance && isSteady) {
    visualState = 'aligned_green';
  } else if (angularDistance <= 14) {
    visualState = 'approaching';
  } else {
    visualState = 'far';
  }

  // Distance ratio: 0 (center) to 1 (far)
  const distanceRatio = Math.min(1, angularDistance / 40);

  // 6. Single plain-English instruction (no jargon, no degrees)
  let instruction = '';
  let subInstruction: string | undefined = undefined;

  if (isCapturing) {
    instruction = 'Hold still. Capturing photo…';
  } else if (recentlyCaptured) {
    instruction = 'Photo captured. Follow the next arrow.';
    subInstruction = 'Great shot! Slowly rotate towards the next target.';
  } else if (phoneMovedWarning) {
    instruction = 'Your phone moved. Please try again.';
    subInstruction = 'Line up the orange circle with the center ring.';
  } else if (qualityWarning) {
    instruction = qualityWarning;
  } else if (isCountdownActive) {
    instruction = 'Perfect! Hold your phone still.';
    subInstruction = `Capturing automatically in ${countdownSeconds}s…`;
  } else if (isWithinTolerance) {
    if (!isSteady) {
      instruction = 'Stop moving.';
      subInstruction = 'Hold the phone steady to start capture countdown.';
    } else {
      instruction = 'Perfect! Hold your phone still.';
      subInstruction = 'Stay still while the camera locks.';
    }
  } else if (angularDistance <= 7) {
    instruction = 'Almost there — move slowly.';
    subInstruction = 'Gently center the orange circle.';
  } else if (angularDistance <= 16) {
    instruction = 'Turn a little more.';
    subInstruction = 'Slowly align with the center target.';
  } else if (primaryDirection === 'tilt_up') {
    instruction = 'Tilt phone slightly up.';
    subInstruction = 'Point the camera a little higher.';
  } else if (primaryDirection === 'tilt_down') {
    instruction = 'Tilt phone slightly down.';
    subInstruction = 'Point the camera a little lower.';
  } else if (primaryDirection === 'turn_left') {
    instruction = 'Turn slowly to your left.';
    subInstruction = 'Rotate your body slowly to the left.';
  } else {
    instruction = 'Turn slowly to your right.';
    subInstruction = 'Rotate your body slowly to the right.';
  }

  // 7. Humanized progress text (Image 4 requirement)
  const progressSummary = formatProgressSummary(capturedCount, totalCount);

  return {
    screenX,
    screenY,
    isInView,
    primaryDirection,
    arrowAngleDeg,
    distanceRatio,
    visualState,
    isWithinTolerance,
    instruction,
    subInstruction,
    progressSummary,
  };
}

/**
 * Generates user-friendly progress descriptions like:
 * "6 of 12 photos captured — halfway there"
 */
export function formatProgressSummary(captured: number, total: number): string {
  if (total <= 0) return 'Ready to capture';
  if (captured === 0) return `Ready to capture photo 1 of ${total}`;
  if (captured >= total) return `All ${total} photos captured! Ready to create panorama.`;

  const remaining = total - captured;
  if (captured === Math.floor(total / 2)) {
    return `${captured} of ${total} photos captured — halfway there!`;
  }
  if (remaining === 1) {
    return `${captured} of ${total} photos captured — 1 last shot remaining!`;
  }
  return `${captured} of ${total} photos captured — ${remaining} remaining`;
}
