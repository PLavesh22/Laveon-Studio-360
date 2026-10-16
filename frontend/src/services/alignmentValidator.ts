/**
 * AlignmentValidator
 * Evaluates whether the camera angle is aligned with the active target within 2–4 degrees (default ±3°)
 * and remains steady with low rotational movement for at least 500–800 milliseconds before turning green.
 */

export interface AlignmentConfig {
  toleranceDegrees?: number;      // Alignment threshold (default 3.0°, within 2–4°)
  rollToleranceDegrees?: number;  // Level horizon tolerance (default 12°)
  stabilityHoldMs?: number;       // Required steady hold duration (default 600ms, between 500–800ms)
  maxAngularVelocity?: number;    // Maximum degrees per second considered "steady" (default 4.0°/s)
}

export type AlignmentStatus = 'unaligned' | 'holding' | 'aligned_green';

export interface AlignmentEvaluation {
  status: AlignmentStatus;
  isWithinTolerance: boolean;
  isLevel: boolean;
  isSteady: boolean;
  holdProgressPct: number; // 0 to 100
  canCapture: boolean;     // True exactly when stability threshold is reached
  holdTimeRemainingMs: number;
}

export class AlignmentValidator {
  private toleranceDegrees: number;
  private rollToleranceDegrees: number;
  private stabilityHoldMs: number;
  private maxAngularVelocity: number;

  private holdStartTime: number | null = null;
  private hasTriggeredCapture = false;

  // Stability tracking (velocity detection)
  private lastSampleTime: number = 0;
  private lastAngularDistance: number = 0;
  private currentAngularVelocity: number = 0;

  constructor(config: AlignmentConfig = {}) {
    this.toleranceDegrees = config.toleranceDegrees ?? 3.0; // Initially ±3°
    this.rollToleranceDegrees = config.rollToleranceDegrees ?? 12.0;
    this.stabilityHoldMs = config.stabilityHoldMs ?? 600; // 600ms (within 500–800ms range)
    this.maxAngularVelocity = config.maxAngularVelocity ?? 5.0; // deg/sec
  }

  public setTolerance(degrees: number): void {
    this.toleranceDegrees = Math.max(1.5, Math.min(6.0, degrees));
  }

  public getTolerance(): number {
    return this.toleranceDegrees;
  }

  public setHoldDuration(ms: number): void {
    this.stabilityHoldMs = Math.max(400, Math.min(1200, ms));
  }

  public getHoldDuration(): number {
    return this.stabilityHoldMs;
  }

  /**
   * Evaluates current sensor alignment against the active target.
   * Target turns green ONLY when:
   * 1. Angular error is within tolerance (default ±3°).
   * 2. Phone is held level horizontally (roll within tolerance).
   * 3. Low rotational movement (velocity <= maxAngularVelocity).
   * 4. Maintained continuously for at least 500–800ms (default 600ms).
   */
  public evaluate(
    angularDistance: number,
    roll: number,
    isCapturing: boolean,
    isPaused: boolean,
    hasOrientationSensor: boolean
  ): AlignmentEvaluation {
    const now = Date.now();

    // Calculate angular velocity (degrees/second)
    if (this.lastSampleTime > 0) {
      const dt = (now - this.lastSampleTime) / 1000;
      if (dt > 0.01 && dt < 0.5) {
        const dAngle = Math.abs(angularDistance - this.lastAngularDistance);
        const instantVelocity = dAngle / dt;
        // Low pass filter velocity
        this.currentAngularVelocity = 0.7 * this.currentAngularVelocity + 0.3 * instantVelocity;
      }
    }
    this.lastSampleTime = now;
    this.lastAngularDistance = angularDistance;

    if (isCapturing || isPaused) {
      this.resetHold();
      return {
        status: 'unaligned',
        isWithinTolerance: false,
        isLevel: true,
        isSteady: false,
        holdProgressPct: 0,
        canCapture: false,
        holdTimeRemainingMs: this.stabilityHoldMs,
      };
    }

    // Manual guidance mode (when orientation sensors are unavailable)
    if (!hasOrientationSensor) {
      return {
        status: 'unaligned',
        isWithinTolerance: true,
        isLevel: true,
        isSteady: true,
        holdProgressPct: 0,
        canCapture: false, // User taps manual shutter
        holdTimeRemainingMs: 0,
      };
    }

    const isWithinTolerance = angularDistance <= this.toleranceDegrees;
    const isLevel = Math.abs(roll) <= this.rollToleranceDegrees;
    const isSteady = this.currentAngularVelocity <= this.maxAngularVelocity;

    // Both alignment and low rotational movement are required
    if (isWithinTolerance && isLevel && isSteady) {
      if (this.holdStartTime === null) {
        this.holdStartTime = now;
      }

      const elapsed = now - this.holdStartTime;
      const progress = Math.min(100, Math.round((elapsed / this.stabilityHoldMs) * 100));
      const remainingMs = Math.max(0, this.stabilityHoldMs - elapsed);

      // Stable green lock activated once hold duration is satisfied
      if (elapsed >= this.stabilityHoldMs) {
        const canCapture = !this.hasTriggeredCapture;
        if (canCapture) {
          this.hasTriggeredCapture = true;
        }

        return {
          status: 'aligned_green',
          isWithinTolerance: true,
          isLevel: true,
          isSteady: true,
          holdProgressPct: 100,
          canCapture,
          holdTimeRemainingMs: 0,
        };
      }

      return {
        status: 'holding',
        isWithinTolerance: true,
        isLevel: true,
        isSteady: true,
        holdProgressPct: progress,
        canCapture: false,
        holdTimeRemainingMs: remainingMs,
      };
    }

    // Reset hold timer immediately when moving outside tolerance or moving too quickly
    this.resetHold();
    return {
      status: 'unaligned',
      isWithinTolerance,
      isLevel,
      isSteady,
      holdProgressPct: 0,
      canCapture: false,
      holdTimeRemainingMs: this.stabilityHoldMs,
    };
  }

  /**
   * Resets the stability timer and capture trigger flag
   */
  public resetHold(): void {
    this.holdStartTime = null;
    this.hasTriggeredCapture = false;
  }

  /**
   * Call after successful capture to arm validator for next target
   */
  public onCaptureComplete(): void {
    this.resetHold();
  }
}
