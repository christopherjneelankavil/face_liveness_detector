import type { NormalizedLandmark, Classifications } from '@mediapipe/tasks-vision';

/**
 * From an array of detected faces, select the one with the largest
 * bounding-box area (i.e. the closest / most prominent face).
 *
 * Key silhouette landmark indices (478-point mesh):
 *   10  = Forehead top
 *   152 = Chin bottom
 *   234 = Left cheek (user's left, camera right)
 *   454 = Right cheek (user's right, camera left)
 */

export interface SelectedFace {
  landmarks: NormalizedLandmark[];
  blendshapes: Classifications[] | undefined;
  faceIndex: number;
}

const IDX = {
  FOREHEAD: 10,
  CHIN: 152,
  LEFT_CHEEK: 234,
  RIGHT_CHEEK: 454,
} as const;

/**
 * Compute the bounding-box area of a face mesh using four silhouette landmarks.
 * Coordinates are normalized 0-1, so the returned area is also in that space.
 */
function faceArea(landmarks: NormalizedLandmark[]): number {
  const top = landmarks[IDX.FOREHEAD];
  const bottom = landmarks[IDX.CHIN];
  const left = landmarks[IDX.LEFT_CHEEK];
  const right = landmarks[IDX.RIGHT_CHEEK];

  const width = Math.abs(right.x - left.x);
  const height = Math.abs(bottom.y - top.y);

  return width * height;
}

/**
 * Select the largest (closest) face from the detection results.
 * Returns `null` if no faces are present.
 */
export function selectLargestFace(
  faceLandmarks: NormalizedLandmark[][],
  faceBlendshapes?: Classifications[] | null,
): SelectedFace | null {
  if (!faceLandmarks || faceLandmarks.length === 0) return null;

  let bestIndex = 0;
  let bestArea = -1;

  for (let i = 0; i < faceLandmarks.length; i++) {
    const area = faceArea(faceLandmarks[i]);
    if (area > bestArea) {
      bestArea = area;
      bestIndex = i;
    }
  }

  return {
    landmarks: faceLandmarks[bestIndex],
    blendshapes: faceBlendshapes ? [faceBlendshapes[bestIndex]] : undefined,  // wrap in array for BlinkDetector
    faceIndex: bestIndex,
  };
}
