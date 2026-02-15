import { useEffect, useState, useRef, useCallback } from 'react';
import { getOrCreateFaceLandmarker, destroyFaceLandmarker } from '../lib/mediapipe';
import { extractHeadPose } from '../lib/poseAnalyzer';
import { MotionValidator, type ChallengeDirection } from '../lib/motionValidator';
import { BlinkDetector } from '../lib/blinkDetector';
import { selectLargestFace } from '../lib/faceSelector';
import type { FaceLandmarker } from '@mediapipe/tasks-vision';

// ── Types ────────────────────────────────────────────────────────
export type ChallengeStep =
  | { type: 'center' }
  | { type: 'head'; direction: ChallengeDirection }
  | { type: 'blink' };

export type OverallStatus = 'loading' | 'ready' | 'running' | 'success' | 'failed';

export interface LivenessState {
  overallStatus: OverallStatus;
  currentStepIndex: number;
  stepStatus: 'pending' | 'active' | 'success' | 'failed';
  feedbackMessage: string;
  motionProgress: number;        // 0–1
  isFaceDetected: boolean;
  timeRemaining: number;         // seconds
}

// ── Constants ────────────────────────────────────────────────────
/** Time allowed per challenge step (ms) */
const STEP_TIMEOUT_MS = 5000;

/** Center-face hold requirement: nose within this yaw/pitch range */
const CENTER_YAW_THRESHOLD = 0.25;
const CENTER_PITCH_THRESHOLD = 0.20;

/** Frames the face must be centered before moving on */
const CENTER_HOLD_FRAMES = 15;

// ── Hook ─────────────────────────────────────────────────────────
export function useFaceLiveness(challengeSequence: ChallengeStep[]) {
  const [state, setState] = useState<LivenessState>({
    overallStatus: 'loading',
    currentStepIndex: 0,
    stepStatus: 'pending',
    feedbackMessage: 'Loading face detection models…',
    motionProgress: 0,
    isFaceDetected: false,
    timeRemaining: STEP_TIMEOUT_MS / 1000,
  });

  const videoRef = useRef<HTMLVideoElement>(null);
  const landmarkerRef = useRef<FaceLandmarker | null>(null);
  const rafRef = useRef<number | undefined>(undefined);
  const motionValidator = useRef(new MotionValidator());
  const blinkDetector = useRef(new BlinkDetector());
  const centerFrames = useRef(0);
  const stepStartTime = useRef(0);
  const currentStepRef = useRef(0);
  const isRunningRef = useRef(false);
  const hasAdvanced = useRef(false);

  // Advance to the next step
  const advanceStep = useCallback(() => {
    if (hasAdvanced.current) return;
    hasAdvanced.current = true;

    const nextIndex = currentStepRef.current + 1;

    if (nextIndex >= challengeSequence.length) {
      // All steps done!
      setState(prev => ({
        ...prev,
        stepStatus: 'success',
        overallStatus: 'success',
        feedbackMessage: 'Liveness Confirmed ✅',
        motionProgress: 1,
      }));
      isRunningRef.current = false;
      return;
    }

    // Brief pause then move to next step
    setState(prev => ({
      ...prev,
      stepStatus: 'success',
      feedbackMessage: '✓ Step complete!',
      motionProgress: 1,
    }));

    setTimeout(() => {
      currentStepRef.current = nextIndex;
      hasAdvanced.current = false;
      motionValidator.current.reset();
      blinkDetector.current.reset();
      centerFrames.current = 0;
      stepStartTime.current = Date.now();

      setState(prev => ({
        ...prev,
        currentStepIndex: nextIndex,
        stepStatus: 'active',
        feedbackMessage: getInstructionMessage(challengeSequence[nextIndex]),
        motionProgress: 0,
        timeRemaining: STEP_TIMEOUT_MS / 1000,
      }));
    }, 800);
  }, [challengeSequence]);

  // Fail the current challenge
  const failStep = useCallback((reason: string) => {
    setState(prev => ({
      ...prev,
      stepStatus: 'failed',
      overallStatus: 'failed',
      feedbackMessage: reason,
      motionProgress: 0,
    }));
    isRunningRef.current = false;
  }, []);

  // Start the challenge
  const startChallenge = useCallback(() => {
    currentStepRef.current = 0;
    hasAdvanced.current = false;
    motionValidator.current.reset();
    blinkDetector.current.reset();
    centerFrames.current = 0;
    stepStartTime.current = Date.now();
    isRunningRef.current = true;

    setState({
      overallStatus: 'running',
      currentStepIndex: 0,
      stepStatus: 'active',
      feedbackMessage: getInstructionMessage(challengeSequence[0]),
      motionProgress: 0,
      isFaceDetected: false,
      timeRemaining: STEP_TIMEOUT_MS / 1000,
    });
  }, [challengeSequence]);

  // Reset everything
  const reset = useCallback(() => {
    currentStepRef.current = 0;
    hasAdvanced.current = false;
    motionValidator.current.reset();
    blinkDetector.current.reset();
    centerFrames.current = 0;
    isRunningRef.current = false;

    setState({
      overallStatus: 'ready',
      currentStepIndex: 0,
      stepStatus: 'pending',
      feedbackMessage: 'Press Start to begin verification',
      motionProgress: 0,
      isFaceDetected: false,
      timeRemaining: STEP_TIMEOUT_MS / 1000,
    });
  }, []);

  // ── Main effect: init model + camera + detection loop ──────────
  useEffect(() => {
    let stream: MediaStream | null = null;

    const init = async () => {
      try {
        // 1. Load MediaPipe model
        landmarkerRef.current = await getOrCreateFaceLandmarker();
        setState(prev => ({ ...prev, feedbackMessage: 'Starting camera…' }));

        // 2. Start camera
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        });

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await new Promise<void>(resolve => {
            videoRef.current!.onloadedmetadata = () => resolve();
          });
          await videoRef.current.play();
        }

        setState(prev => ({
          ...prev,
          overallStatus: 'ready',
          feedbackMessage: 'Ready! Press Start to begin verification',
        }));

        // 3. Start detection loop
        detectLoop();
      } catch (err) {
        console.error('Init error:', err);
        setState(prev => ({
          ...prev,
          overallStatus: 'failed',
          feedbackMessage: `Initialization failed: ${(err as Error).message}`,
        }));
      }
    };

    const detectLoop = () => {
      const video = videoRef.current;
      const landmarker = landmarkerRef.current;

      if (!video || !landmarker || video.readyState < 2) {
        rafRef.current = requestAnimationFrame(detectLoop);
        return;
      }

      const now = performance.now();
      let result;
      try {
        result = landmarker.detectForVideo(video, now);
      } catch {
        rafRef.current = requestAnimationFrame(detectLoop);
        return;
      }

      // Select the largest (closest) face from all detected faces
      const selected = selectLargestFace(result.faceLandmarks, result.faceBlendshapes);

      if (!selected) {
        setState(prev => ({
          ...prev,
          isFaceDetected: false,
          ...(isRunningRef.current && prev.stepStatus === 'active'
            ? { feedbackMessage: 'No face detected — look at the camera' }
            : {}),
        }));
        rafRef.current = requestAnimationFrame(detectLoop);
        return;
      }

      setState(prev => ({ ...prev, isFaceDetected: true }));

      // Process the current challenge step using the selected face
      if (isRunningRef.current) {
        const step = challengeSequence[currentStepRef.current];
        const elapsed = Date.now() - stepStartTime.current;
        const timeRemaining = Math.max(0, (STEP_TIMEOUT_MS - elapsed) / 1000);

        // Timeout check
        if (elapsed > STEP_TIMEOUT_MS && !hasAdvanced.current) {
          failStep('⏰ Time expired — please try again');
          rafRef.current = requestAnimationFrame(detectLoop);
          return;
        }

        setState(prev => prev.stepStatus === 'active' ? { ...prev, timeRemaining } : prev);

        const landmarks = selected.landmarks;
        const blendshapes = selected.blendshapes;
        const pose = extractHeadPose(landmarks);

        if (step.type === 'center') {
          // Just check that face is roughly centered
          const isCentered = Math.abs(pose.yaw) < CENTER_YAW_THRESHOLD
                          && Math.abs(pose.pitch) < CENTER_PITCH_THRESHOLD;

          if (isCentered) {
            centerFrames.current++;
            const progress = Math.min(1, centerFrames.current / CENTER_HOLD_FRAMES);
            setState(prev => prev.stepStatus === 'active' ? {
              ...prev,
              motionProgress: progress,
              feedbackMessage: progress < 1 ? 'Hold still — centering…' : '✓ Centered!',
            } : prev);

            if (centerFrames.current >= CENTER_HOLD_FRAMES) {
              advanceStep();
            }
          } else {
            centerFrames.current = 0;
            setState(prev => prev.stepStatus === 'active' ? {
              ...prev,
              motionProgress: 0,
              feedbackMessage: 'Look straight at the camera',
            } : prev);
          }
        } else if (step.type === 'head') {
          const motionResult = motionValidator.current.addFrame(pose, step.direction);

          if (motionResult.rejectionReason) {
            failStep(`❌ ${motionResult.rejectionReason}`);
          } else {
            setState(prev => prev.stepStatus === 'active' ? {
              ...prev,
              motionProgress: motionResult.progress,
              feedbackMessage: motionResult.isValid
                ? '✓ Movement detected!'
                : getInstructionMessage(step),
            } : prev);

            if (motionResult.isValid) {
              advanceStep();
            }
          }
        } else if (step.type === 'blink') {
          if (blendshapes) {
            const blinked = blinkDetector.current.addFrame(blendshapes);

            if (blinked) {
              setState(prev => prev.stepStatus === 'active' ? {
                ...prev,
                motionProgress: 1,
                feedbackMessage: '✓ Blink detected!',
              } : prev);
              advanceStep();
            } else {
              setState(prev => prev.stepStatus === 'active' ? {
                ...prev,
                feedbackMessage: 'Please blink naturally 👁️',
              } : prev);
            }
          }
        }
      }

      rafRef.current = requestAnimationFrame(detectLoop);
    };

    init();

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (stream) stream.getTracks().forEach(t => t.stop());
      destroyFaceLandmarker();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { videoRef, state, startChallenge, reset };
}

// ── Helpers ──────────────────────────────────────────────────────
function getInstructionMessage(step: ChallengeStep): string {
  switch (step.type) {
    case 'center':
      return 'Look straight at the camera';
    case 'blink':
      return 'Please blink naturally 👁️';
    case 'head':
      switch (step.direction) {
        case 'turnLeft':  return '← Turn your head LEFT slowly';
        case 'turnRight': return '→ Turn your head RIGHT slowly';
        case 'lookUp':    return '↑ Look UP slowly';
        case 'lookDown':  return '↓ Look DOWN slowly';
      }
  }
}
