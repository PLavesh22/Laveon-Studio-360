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
}

export type OrientationListener = (data: OrientationData) => void;

export class OrientationTracker {
  private listeners: Set<OrientationListener> = new Set();
  private baselineAlpha: number | null = null;
  private isListening = false;
  private hasSensor = false;

  // Smoothed orientation state (EMA)
  private smoothedYaw = 0;
  private smoothedPitch = 0;
  private smoothedRoll = 0;
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

    // 2. Relative baseline calibration (straight forward = 0° yaw)
    if (this.baselineAlpha === null) {
      this.baselineAlpha = rawYaw;
    }

    // Compute relative yaw [0, 360)
    let relativeYaw = (rawYaw - this.baselineAlpha + 360) % 360;

    // 3. Smooth angle differences to prevent visual jitter
    if (this.isFirstReading) {
      this.smoothedYaw = relativeYaw;
      this.smoothedPitch = rawPitch;
      this.smoothedRoll = rawRoll;
      this.isFirstReading = false;
    } else {
      // Angular distance for yaw with 0/360 wrap-around
      let dyaw = relativeYaw - this.smoothedYaw;
      while (dyaw > 180) dyaw -= 360;
      while (dyaw < -180) dyaw += 360;
      this.smoothedYaw = (this.smoothedYaw + dyaw * this.smoothingAlpha + 360) % 360;

      this.smoothedPitch += (rawPitch - this.smoothedPitch) * this.smoothingAlpha;
      this.smoothedRoll += (rawRoll - this.smoothedRoll) * this.smoothingAlpha;
    }

    const orientationData: OrientationData = {
      yaw: this.smoothedYaw,
      pitch: this.smoothedPitch,
      roll: this.smoothedRoll,
      rawAlpha: e.alpha,
      rawBeta: e.beta,
      rawGamma: e.gamma,
      isCalibrated: this.baselineAlpha !== null,
      screenAngle,
    };

    this.listeners.forEach((listener) => listener(orientationData));
  };

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
      return true; // Not required on Android or non-iOS
    } catch (err) {
      console.warn('Orientation permission error:', err);
      return false;
    }
  }

  /**
   * Calibrates current camera orientation as 0° forward heading
   */
  public calibrate(currentAlpha?: number): void {
    if (currentAlpha !== undefined) {
      this.baselineAlpha = currentAlpha;
    } else {
      this.baselineAlpha = this.smoothedYaw;
    }
    this.smoothedYaw = 0;
    this.isFirstReading = true;
  }

  /**
   * Re-centers the baseline yaw to current heading
   */
  public recenter(headingAlpha: number): void {
    this.baselineAlpha = headingAlpha;
    this.smoothedYaw = 0;
  }

  /**
   * Start listening to device orientation events
   */
  public start(): void {
    if (this.isListening || typeof window === 'undefined') return;

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
  }

  /**
   * Subscribe to orientation updates
   */
  public subscribe(listener: OrientationListener): () => void {
    this.listeners.add(listener);
    if (!this.isListening) {
      this.start();
    }

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

  public reset(): void {
    this.baselineAlpha = null;
    this.isFirstReading = true;
    this.smoothedYaw = 0;
    this.smoothedPitch = 0;
    this.smoothedRoll = 0;
  }
}

export const globalOrientationTracker = new OrientationTracker();
