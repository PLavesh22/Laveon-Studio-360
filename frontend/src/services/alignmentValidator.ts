/**
 * AlignmentValidator
 * Evaluates whether the camera angle is aligned with the active target within 2–4 degrees
 * and remains steady for at least 300ms before activating the green lock and triggering capture.
 */

export interface AlignmentConfig {
  toleranceDegrees?: number;      // Alignment threshold (default 3.5°, within 2–4°)
  rollToleranceDegrees?: number;  // Level horizon tolerance (default 15°)
  stabilityHoldMs?: number;       // Required steady hold duration (default 300ms)
}

export type AlignmentStatus = 'unaligned' | 'holding' | 'aligned_green';

export interface AlignmentEvaluation {
  status: AlignmentStatus;
  isWithinTolerance: boolean;
  isLevel: boolean;
  holdProgressPct: number; // 0 to 100
  canCapture: boolean;     // True exactly when stability threshold is reached
}

export class AlignmentValidator {
  private toleranceDegrees: number;
  private rollToleranceDegrees: number;
  private stabilityHoldMs: number;

  private holdStartTime: number | null = null;
  private hasTriggeredCapture = false;

  constructor(config: AlignmentConfig = {}) {
    this.toleranceDegrees = config.toleranceDegrees ?? 3.5;
    this.rollToleranceDegrees = config.rollToleranceDegrees ?? 15;
    this.stabilityHoldMs = config.stabilityHoldMs ?? 300;
  }

  public setTolerance(degrees: number): void {
    this.toleranceDegrees = Math.max(1.5, Math.min(6.0, degrees));
  }

  public setHoldDuration(ms: number): void {
    this.stabilityHoldMs = Math.max(200, Math.min(1000, ms));
  }

  /**
   * Evaluates current sensor alignment against the active target
   */
  public evaluate(
    angularDistance: number,
    roll: number,
    isCapturing: boolean,
    isPaused: boolean,
    hasOrientationSensor: boolean
  ): AlignmentEvaluation {
    if (isCapturing || isPaused) {
      this.resetHold();
      return {
        status: 'unaligned',
        isWithinTolerance: false,
        isLevel: true,
        holdProgressPct: 0,
        canCapture: false,
      };
    }

    // Manual guidance mode (when orientation sensors are unavailable)
    if (!hasOrientationSensor) {
      return {
        status: 'unaligned',
        isWithinTolerance: true,
        isLevel: true,
        holdProgressPct: 0,
        canCapture: false, // User taps manual shutter
      };
    }

    const isWithinTolerance = angularDistance <= this.toleranceDegrees;
    const isLevel = Math.abs(roll) <= this.rollToleranceDegrees;

    if (isWithinTolerance && isLevel) {
      const now = Date.now();
      if (this.holdStartTime === null) {
        this.holdStartTime = now;
      }

      const elapsed = now - this.holdStartTime;
      const progress = Math.min(100, Math.round((elapsed / this.stabilityHoldMs) * 100));

      if (elapsed >= this.stabilityHoldMs) {
        const canCapture = !this.hasTriggeredCapture;
        if (canCapture) {
          this.hasTriggeredCapture = true;
        }

        return {
          status: 'aligned_green',
          isWithinTolerance: true,
          isLevel: true,
          holdProgressPct: 100,
          canCapture,
        };
      }

      return {
        status: 'holding',
        isWithinTolerance: true,
        isLevel: true,
        holdProgressPct: progress,
        canCapture: false,
      };
    }

    // Reset hold timer when alignment breaks
    this.resetHold();
    return {
      status: 'unaligned',
      isWithinTolerance: false,
      isLevel,
      holdProgressPct: 0,
      canCapture: false,
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
