import type { HeadPose } from './poseAnalyzer';

export type ChallengeDirection = 'turnLeft' | 'turnRight' | 'lookUp' | 'lookDown';

export interface MotionResult {
  isValid: boolean;
  progress: number;            // 0–1 how far toward goal
  rejectionReason?: string;
}

// ── Tunable constants ────────────────────────────────────────────
/** Minimum total displacement in the target axis to count as a real movement */
const MIN_DISPLACEMENT_HORIZONTAL = 0.30;
const MIN_DISPLACEMENT_VERTICAL = 0.18;  // lower threshold for lookUp / lookDown

function getMinDisplacement(direction: ChallengeDirection): number {
  return direction === 'lookUp' || direction === 'lookDown'
    ? MIN_DISPLACEMENT_VERTICAL
    : MIN_DISPLACEMENT_HORIZONTAL;
}

/** Maximum allowed frame-to-frame jump in the target axis (anti-photo-swap) */
const MAX_FRAME_DELTA = 0.12;

/** Sliding window size (frames) for motion analysis */
const WINDOW_SIZE = 18;

/** 
 * Minimum ratio of frames that must move in the correct direction.
 * e.g. 0.55 means at least 55% of consecutive frame deltas must be in the target direction.
 * This is intentionally not 1.0 because natural head movement has micro-jitter.
 */
const MIN_DIRECTIONAL_RATIO = 0.55;
// ─────────────────────────────────────────────────────────────────

export class MotionValidator {
  private poseHistory: HeadPose[] = [];
  private _isStarted: boolean = false;

  /** Reset for a new challenge */
  reset(): void {
    this.poseHistory = [];
    this._isStarted = false;
  }

  get isStarted(): boolean {
    return this._isStarted;
  }

  /**
   * Feed a new frame's pose data and get validation result.
   */
  addFrame(pose: HeadPose, direction: ChallengeDirection): MotionResult {
    if (!this._isStarted) {
      this._isStarted = true;
    }

    this.poseHistory.push(pose);

    // Keep only the sliding window
    if (this.poseHistory.length > WINDOW_SIZE) {
      this.poseHistory = this.poseHistory.slice(-WINDOW_SIZE);
    }

    // Need at least 6 frames to analyze
    if (this.poseHistory.length < 6) {
      return { isValid: false, progress: 0 };
    }

    return this.validate(direction);
  }

  private validate(direction: ChallengeDirection): MotionResult {
    const history = this.poseHistory;
    const axis = this.getAxis(direction);
    const expectedSign = this.getExpectedSign(direction);

    // 1) Check for sudden jumps (anti photo-swap)
    for (let i = 1; i < history.length; i++) {
      const delta = Math.abs(this.getAxisValue(history[i], axis) - this.getAxisValue(history[i - 1], axis));
      if (delta > MAX_FRAME_DELTA) {
        return {
          isValid: false,
          progress: 0,
          rejectionReason: 'Sudden movement detected — please move slowly',
        };
      }
    }

    // 2) Compute total displacement from first to last frame
    const first = this.getAxisValue(history[0], axis);
    const last = this.getAxisValue(history[history.length - 1], axis);
    const totalDisplacement = (last - first) * expectedSign; // positive if correct direction

    // 3) Check directional consistency (monotonicity ratio)
    let correctDirectionCount = 0;
    for (let i = 1; i < history.length; i++) {
      const delta = this.getAxisValue(history[i], axis) - this.getAxisValue(history[i - 1], axis);
      if (delta * expectedSign > 0) {
        correctDirectionCount++;
      }
    }
    const directionalRatio = correctDirectionCount / (history.length - 1);

    // Progress is displacement normalized by min required
    const minDisp = getMinDisplacement(direction);
    const progress = Math.min(1, Math.max(0, totalDisplacement / minDisp));

    // All three checks must pass
    const isValid =
      totalDisplacement >= minDisp &&
      directionalRatio >= MIN_DIRECTIONAL_RATIO;

    return { isValid, progress };
  }

  private getAxis(direction: ChallengeDirection): 'yaw' | 'pitch' {
    return direction === 'turnLeft' || direction === 'turnRight' ? 'yaw' : 'pitch';
  }

  /**
   * Expected sign of the axis delta for each direction.
   * In MediaPipe's coordinate system (raw, not mirrored):
   *   - turnLeft  → nose.x increases → yaw increases   → sign +1
   *   - turnRight → nose.x decreases → yaw decreases   → sign -1
   *   - lookUp    → nose.y decreases → pitch decreases  → sign -1
   *   - lookDown  → nose.y increases → pitch increases   → sign +1
   */
  private getExpectedSign(direction: ChallengeDirection): number {
    switch (direction) {
      case 'turnLeft':  return 1;
      case 'turnRight': return -1;
      case 'lookUp':    return -1;
      case 'lookDown':  return 1;
    }
  }

  private getAxisValue(pose: HeadPose, axis: 'yaw' | 'pitch'): number {
    return axis === 'yaw' ? pose.yaw : pose.pitch;
  }
}
