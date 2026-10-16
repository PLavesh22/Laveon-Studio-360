/**
 * CaptureCountdown
 * Manages the visible 3-second capture countdown.
 * Automatically initiates when target is aligned & phone is stable.
 * Cancels immediately if phone moves outside tolerance or loses stability.
 */

export interface CountdownTickState {
  isActive: boolean;
  secondsRemaining: number;     // 3, 2, 1, 0
  progressRatio: number;        // 0.0 to 1.0 (for SVG progress ring)
  shouldTriggerCapture: boolean;
  wasCanceled: boolean;
  cancelReason?: 'phone_moved' | 'manual';
}

export class CaptureCountdown {
  private durationMs: number = 3000; // Visible 3-second countdown
  private startTime: number | null = null;
  private isActive: boolean = false;
  private hasCompleted: boolean = false;
  private movementWarningActive: boolean = false;
  private warningTimer: any = null;

  constructor(durationMs: number = 3000) {
    this.durationMs = durationMs;
  }

  /**
   * Updates countdown state based on current alignment and stability
   */
  public update(isReadyForCapture: boolean): CountdownTickState {
    const now = Date.now();

    // 1. If conditions are met and countdown is not yet started:
    if (isReadyForCapture && !this.hasCompleted) {
      if (!this.isActive || this.startTime === null) {
        this.startTime = now;
        this.isActive = true;
        this.movementWarningActive = false;
      }

      const elapsed = now - this.startTime;
      const progressRatio = Math.min(1.0, elapsed / this.durationMs);
      const remainingMs = Math.max(0, this.durationMs - elapsed);
      const secondsRemaining = Math.max(1, Math.ceil(remainingMs / 1000));

      if (elapsed >= this.durationMs) {
        this.hasCompleted = true;
        this.isActive = false;
        return {
          isActive: false,
          secondsRemaining: 0,
          progressRatio: 1.0,
          shouldTriggerCapture: true,
          wasCanceled: false,
        };
      }

      return {
        isActive: true,
        secondsRemaining,
        progressRatio,
        shouldTriggerCapture: false,
        wasCanceled: false,
      };
    }

    // 2. If countdown was actively running but conditions were lost (phone moved!):
    if (this.isActive && !isReadyForCapture) {
      this.cancel('phone_moved');
      return {
        isActive: false,
        secondsRemaining: 3,
        progressRatio: 0,
        shouldTriggerCapture: false,
        wasCanceled: true,
        cancelReason: 'phone_moved',
      };
    }

    // 3. Idle state
    return {
      isActive: false,
      secondsRemaining: 3,
      progressRatio: 0,
      shouldTriggerCapture: false,
      wasCanceled: false,
    };
  }

  /**
   * Cancels any running countdown
   */
  public cancel(reason: 'phone_moved' | 'manual' = 'manual'): void {
    if (this.isActive) {
      this.isActive = false;
      this.startTime = null;
      if (reason === 'phone_moved') {
        this.movementWarningActive = true;
        if (this.warningTimer) clearTimeout(this.warningTimer);
        this.warningTimer = setTimeout(() => {
          this.movementWarningActive = false;
        }, 2200);
      }
    }
  }

  /**
   * Resets after successful capture to prepare for the next target
   */
  public resetForNextTarget(): void {
    this.startTime = null;
    this.isActive = false;
    this.hasCompleted = false;
    this.movementWarningActive = false;
    if (this.warningTimer) {
      clearTimeout(this.warningTimer);
      this.warningTimer = null;
    }
  }

  public isMovementWarning(): boolean {
    return this.movementWarningActive;
  }
}

export const globalCaptureCountdown = new CaptureCountdown(3000);
