import type { NormalizedLandmark } from '@mediapipe/tasks-vision';

export interface HeadPose {
  /** Horizontal angle: negative = user's right, positive = user's left (mirrored view) */
  yaw: number;
  /** Vertical angle: negative = up, positive = down */
  pitch: number;
  /** Raw nose tip position (normalized 0-1) */
  noseTip: { x: number; y: number };
}

/**
 * MediaPipe FaceMesh key landmark indices (478-point mesh):
 *   1   = Nose tip
 *   33  = Left eye outer corner (user's left)
 *   263 = Right eye outer corner (user's right)
 *   152 = Chin bottom
 *   10  = Forehead top
 */
const IDX = {
  NOSE_TIP: 1,
  LEFT_EYE_OUTER: 33,
  RIGHT_EYE_OUTER: 263,
  CHIN: 152,
  FOREHEAD: 10,
} as const;

/**
 * Extract a simple yaw/pitch estimate from face landmarks.
 *
 * Yaw:  nose X relative to eye midpoint X, normalized by inter-eye distance.
 *       0 = centered, positive = turning left (user perspective), negative = turning right.
 *
 * Pitch: nose Y relative to eye-line, normalized by face height (forehead-to-chin).
 *        0 ≈ centered, negative = looking up, positive = looking down.
 */
export function extractHeadPose(landmarks: NormalizedLandmark[]): HeadPose {
  const nose = landmarks[IDX.NOSE_TIP];
  const leftEye = landmarks[IDX.LEFT_EYE_OUTER];
  const rightEye = landmarks[IDX.RIGHT_EYE_OUTER];
  const chin = landmarks[IDX.CHIN];
  const forehead = landmarks[IDX.FOREHEAD];

  // --- Yaw ---
  const eyeMidX = (leftEye.x + rightEye.x) / 2;
  const interEyeDistance = Math.abs(rightEye.x - leftEye.x);
  // Positive when nose is left of center (user turns left in mirrored view)
  const yaw = interEyeDistance > 0.001
    ? (nose.x - eyeMidX) / interEyeDistance
    : 0;

  // --- Pitch ---
  const eyeMidY = (leftEye.y + rightEye.y) / 2;
  const faceHeight = Math.abs(chin.y - forehead.y);
  // Positive when nose drops below eye-line (looking down)
  const pitch = faceHeight > 0.001
    ? (nose.y - eyeMidY) / faceHeight
    : 0;

  return {
    yaw,
    pitch,
    noseTip: { x: nose.x, y: nose.y },
  };
}
