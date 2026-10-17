/** Checks target alignment against live, calibrated sensor samples. */
export interface AlignmentConfig {
  toleranceDegrees?: number;
  rollToleranceDegrees?: number;
  maxAngularVelocity?: number;
  stabilityDurationMs?: number;
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
  steadyDurationMs: number;
}

export interface AlignmentSample {
  yaw: number;
  pitch: number;
  roll: number;
  timestamp: number;
  isCalibrated: boolean;
  hasCameraFrame: boolean;
  isPaused: boolean;
  isCapturing: boolean;
  angularDistance: number;
}

export class AlignmentValidator {
  private toleranceDegrees: number;
  private rollToleranceDegrees: number;
  private maxAngularVelocity: number;
  private stabilityDurationMs: number;
  private lastSample: AlignmentSample | null = null;
  private currentAngularVelocity = Infinity;
  private steadySince: number | null = null;

  constructor(config: AlignmentConfig = {}) {
    this.toleranceDegrees = config.toleranceDegrees ?? 3;
    this.rollToleranceDegrees = config.rollToleranceDegrees ?? 12;
    this.maxAngularVelocity = config.maxAngularVelocity ?? 4.5;
    this.stabilityDurationMs = config.stabilityDurationMs ?? 650;
  }

  public setTolerance(degrees: number): void {
    this.toleranceDegrees = Math.max(2, Math.min(6, degrees));
  }

  public getTolerance(): number {
    return this.toleranceDegrees;
  }

  private angleDelta(a: number, b: number): number {
    return ((a - b + 540) % 360) - 180;
  }

  public evaluate(sample: AlignmentSample): AlignmentEvaluation {
    const previous = this.lastSample;
    let velocity = Infinity;
    if (previous) {
      const dt = (sample.timestamp - previous.timestamp) / 1000;
      if (dt > 0 && dt <= 0.5) {
        const angularChange = Math.hypot(
          this.angleDelta(sample.yaw, previous.yaw),
          sample.pitch - previous.pitch,
          this.angleDelta(sample.roll, previous.roll),
        );
        const instantVelocity = angularChange / dt;
        this.currentAngularVelocity = Number.isFinite(this.currentAngularVelocity)
          ? 0.65 * this.currentAngularVelocity + 0.35 * instantVelocity
          : instantVelocity;
        velocity = this.currentAngularVelocity;
      }
    }
    this.lastSample = sample;
    if (velocity === Infinity) this.currentAngularVelocity = Infinity;

    const sampleAgeMs = Date.now() - sample.timestamp;
    const fresh = sampleAgeMs >= 0 && sampleAgeMs <= 1000;
    const isWithinTolerance = sample.angularDistance <= this.toleranceDegrees;
    const isLevel = Math.abs(sample.roll) <= this.rollToleranceDegrees;
    const isSteady = velocity <= this.maxAngularVelocity;
    const canStabilize = fresh && sample.isCalibrated && sample.hasCameraFrame &&
      !sample.isPaused && !sample.isCapturing && isWithinTolerance && isLevel && isSteady;

    if (canStabilize) {
      if (this.steadySince === null) this.steadySince = sample.timestamp;
    } else {
      this.steadySince = null;
    }
    const steadyDurationMs = this.steadySince === null ? 0 : sample.timestamp - this.steadySince;
    const isReadyForCountdown = canStabilize && steadyDurationMs >= this.stabilityDurationMs;

    return {
      status: isReadyForCountdown ? 'aligned_green' : isWithinTolerance ? 'approaching' : 'unaligned',
      isWithinTolerance,
      isLevel,
      isSteady,
      isReadyForCountdown,
      angularDistance: sample.angularDistance,
      angularVelocity: Number.isFinite(velocity) ? velocity : 0,
      steadyDurationMs,
    };
  }

  public reset(): void {
    this.lastSample = null;
    this.currentAngularVelocity = Infinity;
    this.steadySince = null;
  }
}
