import type { Classifications } from '@mediapipe/tasks-vision';

/**
 * Blink detection using MediaPipe Face Blendshapes.
 *
 * MediaPipe outputs blendshape scores including `eyeBlinkLeft` and `eyeBlinkRight`.
 * A blink is detected when BOTH eyes close (score > threshold) and then reopen.
 * This dip-and-recover pattern prevents static "eyes closed" photos from passing.
 */

// ── Tunable constants ────────────────────────────────────────────
/** Score above which an eye is considered "closed" */
const BLINK_THRESHOLD = 0.4;

/** Score below which an eye is considered "open" (for recovery) */
const OPEN_THRESHOLD = 0.2;
// ─────────────────────────────────────────────────────────────────

type BlinkPhase = 'waiting' | 'eyes_closed' | 'detected';

export class BlinkDetector {
  private phase: BlinkPhase = 'waiting';

  reset(): void {
    this.phase = 'waiting';
  }

  get isDetected(): boolean {
    return this.phase === 'detected';
  }

  /**
   * Feed blendshapes from the current frame.
   * Returns true once a full blink (close → reopen) is detected.
   */
  addFrame(blendshapes: Classifications[]): boolean {
    if (this.phase === 'detected') return true;

    if (!blendshapes || blendshapes.length === 0) return false;

    const shapes = blendshapes[0].categories;
    const leftBlink = shapes.find(c => c.categoryName === 'eyeBlinkLeft');
    const rightBlink = shapes.find(c => c.categoryName === 'eyeBlinkRight');

    if (!leftBlink || !rightBlink) return false;

    const leftScore = leftBlink.score;
    const rightScore = rightBlink.score;

    switch (this.phase) {
      case 'waiting':
        // Both eyes must close
        if (leftScore > BLINK_THRESHOLD && rightScore > BLINK_THRESHOLD) {
          this.phase = 'eyes_closed';
        }
        break;

      case 'eyes_closed':
        // Both eyes must reopen to complete the blink
        if (leftScore < OPEN_THRESHOLD && rightScore < OPEN_THRESHOLD) {
          this.phase = 'detected';
          return true;
        }
        break;
    }

    return false;
  }
}
