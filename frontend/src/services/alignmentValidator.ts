/**
 * AlignmentValidator
 * Evaluates whether the camera angle is aligned with the active target within tolerance (default ±3.5°)
 * and remains steady with low rotational velocity before arming automatic capture.
 */

export interface AlignmentConfig {
  toleranceDegrees?: number;      // Alignment threshold (default 3.5°)
  rollToleranceDegrees?: number;  // Level horizon tolerance (default 12°)
  maxAngularVelocity?: number;    // Maximum degrees per second considered "steady" (default 4.5°/s)
}

export type AlignmentStatus = 'unaligned' | 'approaching' | 'aligned_green';

export interface AlignmentEvaluation {
  status: AlignmentStatus;
  isWithinTolerance: boolean;
  isLevel: boolean;
  isSteady: boolean;
  isReadyForCountdown: boolean;
  angularDistance: number;
  angularVelocity: number;
}

export class AlignmentValidator {
  private toleranceDegrees: number;
  private rollToleranceDegrees: number;
  private maxAngularVelocity: number;

  // Stability tracking (velocity detection)
  private lastSampleTime: number = 0;
  private lastAngularDistance: number = 0;
  private currentAngularVelocity: number = 0;

  constructor(config: AlignmentConfig = {}) {
    this.toleranceDegrees = config.toleranceDegrees ?? 3.5;
    this.rollToleranceDegrees = config.rollToleranceDegrees ?? 12.0;
    this.maxAngularVelocity = config.maxAngularVelocity ?? 4.5;
  }

  public setTolerance(degrees: number): void {
    this.toleranceDegrees = Math.max(2.0, Math.min(6.0, degrees));
  }

  public getTolerance(): number {
    return this.toleranceDegrees;
  }

  /**
   * Evaluates current sensor alignment against the active target.
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
        // Low pass filter velocity for jitter-free stability check
        this.currentAngularVelocity = 0.65 * this.currentAngularVelocity + 0.35 * instantVelocity;
      }
    }
    this.lastSampleTime = now;
    this.lastAngularDistance = angularDistance;

    if (isCapturing || isPaused) {
      return {
        status: 'unaligned',
        isWithinTolerance: false,
        isLevel: true,
        isSteady: false,
        isReadyForCountdown: false,
        angularDistance,
        angularVelocity: this.currentAngularVelocity,
      };
    }

    // Manual guidance mode (when orientation sensors are unavailable)
    if (!hasOrientationSensor) {
      return {
        status: 'unaligned',
        isWithinTolerance: true,
        isLevel: true,
        isSteady: true,
        isReadyForCountdown: false,
        angularDistance: 0,
        angularVelocity: 0,
      };
    }

    const isWithinTolerance = angularDistance <= this.toleranceDegrees;
    const isLevel = Math.abs(roll) <= this.rollToleranceDegrees;
    const isSteady = this.currentAngularVelocity <= this.maxAngularVelocity;
    const isReadyForCountdown = isWithinTolerance && isLevel && isSteady;

    let status: AlignmentStatus = 'unaligned';
    if (isReadyForCountdown) {
      status = 'aligned_green';
    } else if (angularDistance <= 14) {
      status = 'approaching';
    }

    return {
      status,
      isWithinTolerance,
      isLevel,
      isSteady,
      isReadyForCountdown,
      angularDistance,
      angularVelocity: this.currentAngularVelocity,
    };
  }

  public reset(): void {
    this.lastSampleTime = 0;
    this.lastAngularDistance = 0;
    this.currentAngularVelocity = 0;
  }
}

export const globalAlignmentValidator = new AlignmentValidator();
