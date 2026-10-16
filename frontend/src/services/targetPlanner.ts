/**
 * TargetPlanner
 * Calculates 360° photo capture targets based on camera field of view, configurable rotation steps (30°–45°),
 * and overlap percentages (30%–40%).
 * Computes spherical-to-screen coordinate projections, angular distance, and directional arrows.
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
  exposureScore?: number;
  overlapScore?: number | null;
  orientationMetadata?: {
    capturedYaw: number;
    capturedPitch: number;
    capturedRoll: number;
    timestamp: number;
  };
}

export type CaptureMode = 'horizontal_360' | 'full_sphere';
export type RotationStepAngle = 30 | 36 | 45;

export interface TargetProjection {
  screenX: number;         // Percentage [0, 100] from left of viewfinder
  screenY: number;         // Percentage [0, 100] from top of viewfinder
  isInView: boolean;       // Whether target is inside visible camera bounds
  deltaYaw: number;        // Signed yaw delta in degrees [-180, 180]
  deltaPitch: number;      // Signed pitch delta in degrees
  angularDistance: number; // Total angular distance in degrees
  edgeArrowAngle: number;  // Rotation angle in degrees for the off-screen edge arrow
  directionHint: string;    // Actionable guidance: "Rotate left", "Rotate right", "Tilt up", "Tilt down", "Hold steady"
  degreesToTarget: number; // Round degrees to target
  guidanceText: string;    // Full formatted string, e.g. "Rotate right • 14° to target"
}

export interface TargetPlannerConfig {
  hfov?: number;           // Camera horizontal field of view in degrees (default 60°)
  vfov?: number;           // Camera vertical field of view in degrees (default 75° in portrait)
  stepAngle?: RotationStepAngle; // Configurable rotation step between positions (30°, 36°, 45°)
  overlapPercentage?: number;    // Target overlap percentage [0.25, 0.45] (default 0.35)
  mode?: CaptureMode;
}

export class TargetPlanner {
  private hfov: number;
  private vfov: number;
  private stepAngle: RotationStepAngle;
  private overlap: number;
  private mode: CaptureMode;

  constructor(config: TargetPlannerConfig = {}) {
    this.hfov = config.hfov ?? 60;
    this.vfov = config.vfov ?? 75;
    this.stepAngle = config.stepAngle ?? 36; // 36° = 10 positions (approx 35% overlap)
    this.overlap = config.overlapPercentage ?? 0.35;
    this.mode = config.mode ?? 'horizontal_360';
  }

  public setMode(mode: CaptureMode): void {
    this.mode = mode;
  }

  public getMode(): CaptureMode {
    return this.mode;
  }

  public setStepAngle(step: RotationStepAngle): void {
    this.stepAngle = step;
  }

  public getStepAngle(): RotationStepAngle {
    return this.stepAngle;
  }

  public setOverlap(overlap: number): void {
    this.overlap = Math.max(0.25, Math.min(0.45, overlap));
  }

  public getOverlap(): number {
    return this.overlap;
  }

  /**
   * Generates spherical capture targets based on the current mode and step configuration
   */
  public generateTargets(): SphericalTarget[] {
    if (this.mode === 'horizontal_360') {
      return this.generateHorizontalRingTargets();
    }
    return this.generateFullSphereTargets();
  }

  /**
   * Generates a 360° horizontal panorama ring with configurable steps (30°, 36°, or 45°)
   * - 30° step = 12 capture positions (high overlap ~45%)
   * - 36° step = 10 capture positions (standard overlap ~35%)
   * - 45° step = 8 capture positions (quick capture ~30%)
   */
  private generateHorizontalRingTargets(): SphericalTarget[] {
    const targetCount = Math.round(360 / this.stepAngle);
    const actualStep = 360 / targetCount;

    const targets: SphericalTarget[] = [];
    for (let i = 0; i < targetCount; i++) {
      const yaw = Math.round(i * actualStep) % 360;
      let label = `${Math.round(yaw)}°`;
      let instruction = `Rotate to ${Math.round(yaw)}°`;

      if (i === 0) {
        label = '0° (Forward)';
        instruction = 'Face straight ahead at eye level to establish baseline';
      } else {
        instruction = `Rotate right towards ${Math.round(yaw)}°`;
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
   * Horizon Ring (8 shots), Upper Sky (+35°, 4 shots), Zenith (+75°, 1 shot),
   * Lower Ground (-35°, 4 shots), Nadir (-75°, 1 shot)
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
        instruction: yaw === 0 ? 'Face straight forward at eye level' : `Rotate to ${yaw}°`,
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
      instruction: 'Tilt camera straight up towards zenith',
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
      instruction: 'Tilt camera straight down towards nadir',
      isCaptured: false,
    });

    return targets;
  }

  /**
   * Projects a spherical target onto 2D camera viewfinder coordinates.
   * Calculates screen coordinates, edge clamp vector, and actionable direction guidance:
   * "Rotate left", "Rotate right", "Tilt up", "Tilt down", "Hold steady" + remaining degrees.
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
    const degreesToTarget = Math.round(angularDistance);

    // 2. Unclamped screen percentage (50% = viewport center)
    const rawX = 50 + (deltaYaw / this.hfov) * 100;
    const rawY = 50 - (deltaPitch / this.vfov) * 100;

    // Viewport margin: target is considered in-view if center is within [15%, 85%]
    const isInView =
      rawX >= 15 && rawX <= 85 && rawY >= 15 && rawY <= 85 && Math.abs(deltaYaw) < this.hfov * 0.55;

    // 3. Screen edge clamping for off-screen target circle / arrow
    let screenX = rawX;
    let screenY = rawY;

    if (!isInView) {
      const dx = rawX - 50;
      const dy = rawY - 50;
      const dist = Math.hypot(dx, dy) || 1;

      // Project onto border perimeter (margin 8%)
      const maxRadius = 40;
      const scale = maxRadius / dist;
      screenX = 50 + dx * scale;
      screenY = 50 + dy * scale;
    }

    // 4. Directional arrow bearing in degrees (0° = right, 90° = down, 180° = left, 270° = up)
    const edgeArrowAngle = (Math.atan2(50 - rawY, rawX - 50) * (180 / Math.PI) + 360) % 360;

    // 5. Actionable guidance phrases requested by user:
    // "Rotate left", "Rotate right", "Tilt up", "Tilt down", "Hold steady"
    let directionHint = '';
    let guidanceText = '';

    if (angularDistance <= 3.0) {
      directionHint = 'Hold steady';
      guidanceText = 'Aligned • Hold steady';
    } else if (Math.abs(deltaPitch) > 6 && Math.abs(deltaPitch) > Math.abs(deltaYaw)) {
      if (deltaPitch > 0) {
        directionHint = 'Tilt up';
        guidanceText = `Tilt up (${degreesToTarget}° to target)`;
      } else {
        directionHint = 'Tilt down';
        guidanceText = `Tilt down (${degreesToTarget}° to target)`;
      }
    } else {
      if (deltaYaw > 0) {
        directionHint = 'Rotate right';
        guidanceText = `Rotate right (${degreesToTarget}° to target)`;
      } else {
        directionHint = 'Rotate left';
        guidanceText = `Rotate left (${degreesToTarget}° to target)`;
      }
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
      degreesToTarget,
      guidanceText,
    };
  }
}

export const globalTargetPlanner = new TargetPlanner();
