/**
 * OrientationTracker
 * Manages device orientation sensors, permissions, screen rotation compensation,
 * relative yaw calibration, and jitter smoothing via Exponential Moving Average (EMA).
 */

export interface OrientationData {
  yaw: number;       // Relative yaw in degrees [0, 360)
  pitch: number;     // Pitch in degrees [-90, 90] (0 = horizontal eye level)
  roll: number;      // Roll in degrees [-180, 180] (0 = level horizon)
  rawAlpha: number;  // Uncalibrated compass alpha
  rawBeta: number;   // Raw device beta
  rawGamma: number;  // Raw device gamma
  isCalibrated: boolean;
  screenAngle: number;
  timestamp: number;
}

export type OrientationListener = (data: OrientationData) => void;
export type SensorStatus = 'checking' | 'active' | 'permission_needed' | 'unsupported';

export class OrientationTracker {
  private listeners: Set<OrientationListener> = new Set();
  private baselineAlpha: number | null = null;
  private baselinePitch: number | null = null;
  private baselineRoll: number | null = null;
  private isListening = false;
  private hasSensor = false;

  // Smoothed orientation state (EMA)
  private smoothedYaw = 0;
  private smoothedPitch = 0;
  private smoothedRoll = 0;
  private latestReading: OrientationData | null = null;
  private isFirstReading = true;

  // Smoothing factor: higher = more responsive, lower = smoother (0.28 is ideal for 60Hz)
  private readonly smoothingAlpha = 0.28;

  // Bound event handler
  private handleDeviceOrientation = (e: DeviceOrientationEvent) => {
    if (e.alpha === null || e.beta === null || e.gamma === null) {
      return;
    }

    this.hasSensor = true;

    // 1. Screen orientation compensation
    const screenAngle = this.getScreenOrientationAngle();

    // In portrait mode:
    // e.beta: [-180, 180], ~90° when phone is held vertically facing forward.
    // e.gamma: [-90, 90], left/right tilt.
    // e.alpha: [0, 360), rotation around z-axis (compass heading).
    let rawYaw = e.alpha;
    let rawPitch = 90 - e.beta; // 0° when upright and looking straight forward
    let rawRoll = e.gamma;

    // Compensate for screen orientation rotation (e.g. 90deg landscape)
    if (screenAngle === 90) {
      rawPitch = e.gamma;
      rawRoll = -(90 - e.beta);
    } else if (screenAngle === 270 || screenAngle === -90) {
      rawPitch = -e.gamma;
      rawRoll = (90 - e.beta);
    } else if (screenAngle === 180) {
      rawPitch = -(90 - e.beta);
      rawRoll = -e.gamma;
    }
    this.latestRawPitch = rawPitch;
    this.latestRawRoll = rawRoll;

    // Until the user starts capture, expose sensor availability without pretending
    // that an arbitrary page-load heading is the capture baseline.
    const isCalibrated = this.baselineAlpha !== null && this.baselinePitch !== null && this.baselineRoll !== null;
    let relativeYaw = isCalibrated ? this.normalizeAngle(rawYaw - this.baselineAlpha!) : 0;
    const relativePitch = isCalibrated ? rawPitch - this.baselinePitch! : 0;
    const relativeRoll = isCalibrated ? this.normalizeAngle(rawRoll - this.baselineRoll! + 180) - 180 : 0;

    // 3. Smooth angle differences to prevent visual jitter
    if (this.isFirstReading) {
      this.smoothedYaw = relativeYaw;
      this.smoothedPitch = relativePitch;
      this.smoothedRoll = relativeRoll;
      this.isFirstReading = false;
    } else {
      // Angular distance for yaw with 0/360 wrap-around
      let dyaw = relativeYaw - this.smoothedYaw;
      while (dyaw > 180) dyaw -= 360;
      while (dyaw < -180) dyaw += 360;
      this.smoothedYaw = (this.smoothedYaw + dyaw * this.smoothingAlpha + 360) % 360;

      this.smoothedPitch += (relativePitch - this.smoothedPitch) * this.smoothingAlpha;
      let droll = relativeRoll - this.smoothedRoll;
      while (droll > 180) droll -= 360;
      while (droll < -180) droll += 360;
      this.smoothedRoll += droll * this.smoothingAlpha;
    }

    const orientationData: OrientationData = {
      yaw: this.smoothedYaw,
      pitch: this.smoothedPitch,
      roll: this.smoothedRoll,
      rawAlpha: e.alpha,
      rawBeta: e.beta,
      rawGamma: e.gamma,
      isCalibrated,
      screenAngle,
      timestamp: Date.now(),
    };
    this.latestReading = orientationData;

    this.listeners.forEach((listener) => listener(orientationData));
  };

  private normalizeAngle(angle: number): number {
    return ((angle % 360) + 360) % 360;
  }

  /**
   * Returns current screen orientation angle (0, 90, 180, 270)
   */
  public getScreenOrientationAngle(): number {
    if (typeof window === 'undefined') return 0;
    if (window.screen?.orientation?.angle !== undefined) {
      return window.screen.orientation.angle;
    }
    if (typeof (window as any).orientation === 'number') {
      return (window as any).orientation;
    }
    return 0;
  }

  /**
   * Request permission for iOS 13+ devices
   */
  public async requestPermission(): Promise<boolean> {
    try {
      if (typeof (window as any)?.DeviceOrientationEvent?.requestPermission === 'function') {
        const response = await (window as any).DeviceOrientationEvent.requestPermission();
        return response === 'granted';
      }
      return typeof window !== 'undefined' && 'DeviceOrientationEvent' in window;
    } catch (err) {
      console.warn('Orientation permission error:', err);
      return false;
    }
  }

  /**
   * Checks current sensor availability status
   */
  public getSensorStatus(): SensorStatus {
    if (typeof window === 'undefined' || !window.DeviceOrientationEvent) {
      return 'unsupported';
    }
    if (typeof (window as any)?.DeviceOrientationEvent?.requestPermission === 'function' && !this.hasSensor) {
      return 'permission_needed';
    }
    if (this.hasSensor) {
      return 'active';
    }
    return 'checking';
  }

  /**
   * Calibrates current camera orientation as 0° forward heading
   */
  public calibrate(currentAlpha?: number): void {
    if (currentAlpha !== undefined) this.baselineAlpha = currentAlpha;
    else if (this.latestReading) this.baselineAlpha = this.latestReading.rawAlpha;
    if (this.latestReading) {
      // Recover the absolute axes from the reading by retaining the raw event
      // values in the tracker as the most recent uncalibrated measurements.
      this.baselinePitch = this.latestRawPitch;
      this.baselineRoll = this.latestRawRoll;
    }
    this.smoothedYaw = 0;
    this.smoothedPitch = 0;
    this.smoothedRoll = 0;
    this.isFirstReading = true;
  }

  private latestRawPitch: number | null = null;
  private latestRawRoll: number | null = null;

  /**
   * Re-centers the baseline yaw to current heading
   */
  public recenter(headingAlpha?: number): void {
    this.calibrate(headingAlpha);
  }

  /**
   * Start listening to device orientation events
   */
  public start(): void {
    if (this.isListening || typeof window === 'undefined') return;

    this.reset();
    window.addEventListener('deviceorientation', this.handleDeviceOrientation, { passive: true });
    this.isListening = true;
  }

  /**
   * Stop listening and clean up event listeners
   */
  public stop(): void {
    if (!this.isListening || typeof window === 'undefined') return;

    window.removeEventListener('deviceorientation', this.handleDeviceOrientation);
    this.isListening = false;
    this.reset();
  }

  /**
   * Subscribe to orientation updates
   */
  public subscribe(listener: OrientationListener): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) {
        this.stop();
      }
    };
  }

  public getHasSensor(): boolean {
    return this.hasSensor;
  }

  public waitForReading(timeoutMs = 1500): Promise<boolean> {
    if (this.latestReading) return Promise.resolve(true);
    return new Promise((resolve) => {
      let done = false;
      const finish = (received: boolean) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        unsubscribe();
        resolve(received);
      };
      const unsubscribe = this.subscribe(() => finish(true));
      const timer = setTimeout(() => finish(false), timeoutMs);
    });
  }

  public reset(): void {
    this.baselineAlpha = null;
    this.isFirstReading = true;
    this.smoothedYaw = 0;
    this.smoothedPitch = 0;
    this.smoothedRoll = 0;
    this.latestReading = null;
    this.baselinePitch = null;
    this.baselineRoll = null;
    this.latestRawPitch = null;
    this.latestRawRoll = null;
    this.hasSensor = false;
  }
}

export const globalOrientationTracker = new OrientationTracker();
