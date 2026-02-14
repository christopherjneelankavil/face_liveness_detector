import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

let faceLandmarker: FaceLandmarker | null = null;
let initPromise: Promise<FaceLandmarker> | null = null;

const WASM_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm';
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

/**
 * Singleton FaceLandmarker — creates once, reuses thereafter.
 * Model is ~2 MB float16 loaded from Google's CDN.
 */
export async function getOrCreateFaceLandmarker(): Promise<FaceLandmarker> {
  if (faceLandmarker) return faceLandmarker;

  if (!initPromise) {
    initPromise = (async () => {
      const vision = await FilesetResolver.forVisionTasks(WASM_CDN);

      faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: MODEL_URL,
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        numFaces: 1,
        outputFaceBlendshapes: true,   // Needed for blink detection
        outputFacialTransformationMatrixes: false,
      });

      return faceLandmarker;
    })();
  }

  return initPromise;
}

/**
 * Clean up the FaceLandmarker instance.
 */
export function destroyFaceLandmarker(): void {
  if (faceLandmarker) {
    faceLandmarker.close();
    faceLandmarker = null;
    initPromise = null;
  }
}
