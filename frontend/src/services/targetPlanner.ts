/**
 * TargetPlanner
 * Calculates 360° photo capture targets based on camera field of view and overlap percentage.
 * Computes spherical-to-screen coordinate projections and directional edge arrows for Photo Sphere guidance.
 */

export interface SphericalTarget {
  id: string;
  index: number;
  tier: 'horizon' | 'upper' | 'zenith' | 'lower' | 'nadir';
  targetYaw: number;   // [0, 360)
  targetPitch: number; // [-90, 90]
  label: string;
  instruction: string;
  isCaptured: boolean;
  photoFile?: File;
  previewUrl?: string;
  blurScore?: number;
  orientationMetadata?: {
    capturedYaw: number;
    capturedPitch: number;
    capturedRoll: number;
    timestamp: number;
  };
}

export type CaptureMode = 'horizontal_360' | 'full_sphere';

export interface TargetProjection {
  screenX: number;       // Percentage [0, 100] from left of viewfinder
  screenY: number;       // Percentage [0, 100] from top of viewfinder
  isInView: boolean;     // Whether the target circle is inside visible camera bounds
  deltaYaw: number;      // Signed yaw delta in degrees [-180, 180]
  deltaPitch: number;    // Signed pitch delta in degrees
  angularDistance: number; // Total angular distance in degrees
  edgeArrowAngle: number; // Rotation angle in degrees for the off-screen edge arrow
  directionHint: string;  // Plain English direction ("Turn Right", "Tilt Up", etc.)
}

export interface TargetPlannerConfig {
  hfov?: number;           // Camera horizontal field of view in degrees (default 60°)
  vfov?: number;           // Camera vertical field of view in degrees (default 75° in portrait)
  overlapPercentage?: number; // Target overlap percentage [0.20, 0.50] (default 0.33)
  mode?: CaptureMode;
}

export class TargetPlanner {
  private hfov: number;
  private vfov: number;
  private overlap: number;
  private mode: CaptureMode;

  constructor(config: TargetPlannerConfig = {}) {
    this.hfov = config.hfov ?? 60;
    this.vfov = config.vfov ?? 75;
    this.overlap = config.overlapPercentage ?? 0.33;
    this.mode = config.mode ?? 'horizontal_360';
  }

  public setMode(mode: CaptureMode): void {
    this.mode = mode;
  }

  public getMode(): CaptureMode {
    return this.mode;
  }

  public setOverlap(overlap: number): void {
    this.overlap = Math.max(0.2, Math.min(0.5, overlap));
  }

  public getOverlap(): number {
    return this.overlap;
  }

  /**
   * Generates spherical capture targets based on the current mode and overlap
   */
  public generateTargets(): SphericalTarget[] {
    if (this.mode === 'horizontal_360') {
      return this.generateHorizontalRingTargets();
    }
    return this.generateFullSphereTargets();
  }

  /**
   * Generates a 360° single-row horizontal panorama ring
   */
  private generateHorizontalRingTargets(): SphericalTarget[] {
    // Effective angular step between photos
    const angularStep = Math.max(30, Math.round(this.hfov * (1 - this.overlap)));
    const targetCount = Math.ceil(360 / angularStep);
    const actualStep = 360 / targetCount;

    const targets: SphericalTarget[] = [];
    for (let i = 0; i < targetCount; i++) {
      const yaw = Math.round(i * actualStep) % 360;
      let label = `Point ${i + 1}`;
      let instruction = 'Point straight ahead at eye level';

      if (i === 0) {
        label = 'Center (0°)';
        instruction = 'Point straight ahead at eye level to begin';
      } else {
        label = `${Math.round(yaw)}°`;
        instruction = `Rotate body right towards ${Math.round(yaw)}°`;
      }

      targets.push({
        id: `h_${i}`,
        index: i,
        tier: 'horizon',
        targetYaw: yaw,
        targetPitch: 0,
        label,
        instruction,
        isCaptured: false,
      });
    }

    return targets;
  }

  /**
   * Generates a complete 360° × 180° multi-tier spherical target set:
   * 1. Horizon Ring (eye level, 8-9 shots)
   * 2. Upper Sky Ring (+35° tilt, 4 shots)
   * 3. Sky Zenith (+75° tilt, 1 shot)
   * 4. Lower Ground Ring (-35° tilt, 4 shots)
   * 5. Ground Nadir (-75° tilt, 1 shot)
   */
  private generateFullSphereTargets(): SphericalTarget[] {
    const targets: SphericalTarget[] = [];
    let idx = 0;

    // 1. Horizon ring (8 shots, 45° step)
    const horizonAngles = [0, 45, 90, 135, 180, 225, 270, 315];
    horizonAngles.forEach((yaw) => {
      targets.push({
        id: `h_${yaw}`,
        index: idx++,
        tier: 'horizon',
        targetYaw: yaw,
        targetPitch: 0,
        label: `Horizon ${yaw}°`,
        instruction: yaw === 0 ? 'Face straight forward at eye level' : `Rotate body to ${yaw}°`,
        isCaptured: false,
      });
    });

    // 2. Upper sky ring (+35° tilt, 4 shots)
    const upperAngles = [0, 90, 180, 270];
    upperAngles.forEach((yaw) => {
      targets.push({
        id: `upper_${yaw}`,
        index: idx++,
        tier: 'upper',
        targetYaw: yaw,
        targetPitch: 35,
        label: `Sky ${yaw}° (+35°)`,
        instruction: `Tilt camera up +35° facing ${yaw}°`,
        isCaptured: false,
      });
    });

    // 3. Sky Zenith (+75° tilt, 1 shot)
    targets.push({
      id: 'zenith',
      index: idx++,
      tier: 'zenith',
      targetYaw: 0,
      targetPitch: 75,
      label: 'Sky Zenith (+75°)',
      instruction: 'Tilt camera straight up towards the ceiling/sky',
      isCaptured: false,
    });

    // 4. Lower ground ring (-35° tilt, 4 shots)
    const lowerAngles = [0, 90, 180, 270];
    lowerAngles.forEach((yaw) => {
      targets.push({
        id: `lower_${yaw}`,
        index: idx++,
        tier: 'lower',
        targetYaw: yaw,
        targetPitch: -35,
        label: `Ground ${yaw}° (-35°)`,
        instruction: `Tilt camera down -35° facing ${yaw}°`,
        isCaptured: false,
      });
    });

    // 5. Ground Nadir (-75° tilt, 1 shot)
    targets.push({
      id: 'nadir',
      index: idx++,
      tier: 'nadir',
      targetYaw: 0,
      targetPitch: -75,
      label: 'Ground Nadir (-75°)',
      instruction: 'Tilt camera straight down towards the ground',
      isCaptured: false,
    });

    return targets;
  }

  /**
   * Projects a spherical target onto 2D camera viewfinder coordinates.
   * Calculates whether target is inside view, its (X, Y) percent, and edge arrow vector if off-screen.
   */
  public projectTarget(
    target: SphericalTarget,
    currentYaw: number,
    currentPitch: number
  ): TargetProjection {
    // 1. Shortest angular distance on circle for yaw [-180, 180]
    let deltaYaw = ((target.targetYaw - currentYaw + 540) % 360) - 180;
    let deltaPitch = target.targetPitch - currentPitch;

    const angularDistance = Math.hypot(deltaYaw, deltaPitch);

    // 2. Unclamped screen percentage (50% = viewport center)
    // Positive deltaYaw (target is to the right) moves target right (>50%)
    // Positive deltaPitch (target is above) moves target up (<50%)
    const rawX = 50 + (deltaYaw / this.hfov) * 100;
    const rawY = 50 - (deltaPitch / this.vfov) * 100;

    // Viewport margin: target is considered in-view if its center is within [15%, 85%]
    const isInView = rawX >= 15 && rawX <= 85 && rawY >= 15 && rawY <= 85 && Math.abs(deltaYaw) < this.hfov * 0.55;

    // 3. Screen edge clamping for off-screen target circle / arrow
    let screenX = rawX;
    let screenY = rawY;

    if (!isInView) {
      // Vector from center (50, 50) to (rawX, rawY)
      const dx = rawX - 50;
      const dy = rawY - 50;
      const dist = Math.hypot(dx, dy) || 1;

      // Project onto border perimeter (margin 8%)
      const maxRadius = 40; // 50 - 10 margin
      const scale = maxRadius / dist;
      screenX = 50 + dx * scale;
      screenY = 50 + dy * scale;
    }

    // 4. Directional arrow bearing in degrees (0° = right, 90° = down, 180° = left, 270° = up)
    const edgeArrowAngle = (Math.atan2(50 - rawY, rawX - 50) * (180 / Math.PI) + 360) % 360;

    // 5. Human-readable direction hint
    let directionHint = '';
    if (angularDistance <= 4) {
      directionHint = 'Aligned! Hold steady...';
    } else if (Math.abs(deltaPitch) > 15 && Math.abs(deltaYaw) < 15) {
      directionHint = deltaPitch > 0 ? 'Tilt camera upward ↑' : 'Tilt camera downward ↓';
    } else if (Math.abs(deltaYaw) > 15) {
      directionHint = deltaYaw > 0 ? 'Turn slowly to your right →' : '← Turn slowly to your left';
    } else {
      directionHint = 'Rotate to center target';
    }

    return {
      screenX: Math.max(6, Math.min(94, screenX)),
      screenY: Math.max(6, Math.min(94, screenY)),
      isInView,
      deltaYaw,
      deltaPitch,
      angularDistance,
      edgeArrowAngle,
      directionHint,
    };
  }
}

export const globalTargetPlanner = new TargetPlanner();
