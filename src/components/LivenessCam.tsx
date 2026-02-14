import React from 'react';
import { useFaceLiveness, type ChallengeStep, type OverallStatus } from '../hooks/useFaceLiveness';
import type { ChallengeDirection } from '../lib/motionValidator';
import './LivenessCam.css';

// ── Generate a random challenge sequence ─────────────────────────
function generateChallengeSequence(): ChallengeStep[] {
  const directions: ChallengeDirection[] = ['turnLeft', 'turnRight', 'lookUp', 'lookDown'];
  const shuffled = [...directions].sort(() => Math.random() - 0.5);
  const picked = shuffled.slice(0, 3); // 3 random directions

  const steps: ChallengeStep[] = [{ type: 'center' }];
  for (const dir of picked) {
    steps.push({ type: 'head', direction: dir });
    steps.push({ type: 'blink' });
  }
  return steps;
}

// ── Direction icons ──────────────────────────────────────────────
function getStepIcon(step: ChallengeStep): string {
  if (step.type === 'center') return '🎯';
  if (step.type === 'blink') return '👁️';
  switch (step.direction) {
    case 'turnLeft':  return '←';
    case 'turnRight': return '→';
    case 'lookUp':    return '↑';
    case 'lookDown':  return '↓';
  }
}

function getStepLabel(step: ChallengeStep): string {
  if (step.type === 'center') return 'Center';
  if (step.type === 'blink') return 'Blink';
  switch (step.direction) {
    case 'turnLeft':  return 'Left';
    case 'turnRight': return 'Right';
    case 'lookUp':    return 'Up';
    case 'lookDown':  return 'Down';
  }
}

// ── Component ────────────────────────────────────────────────────
export const LivenessCam: React.FC = () => {
  const [sequence] = React.useState<ChallengeStep[]>(() => generateChallengeSequence());
  const { videoRef, state, startChallenge } = useFaceLiveness(sequence);

  const statusClass = getStatusClass(state.overallStatus);

  return (
    <div className="liveness-container">
      {/* Header */}
      <div className="liveness-header">
        <h1>Face Liveness Check</h1>
        <p className="subtitle">Verify you're a real person</p>
      </div>

      {/* Camera viewport */}
      <div className="camera-viewport">
        <div className="camera-inner">
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="camera-feed"
          />

          {/* Circular progress overlay */}
          {state.overallStatus === 'running' && state.stepStatus === 'active' && (
            <svg className="progress-ring" viewBox="0 0 200 200">
              <circle
                className="progress-ring-bg"
                cx="100" cy="100" r="90"
                fill="none"
                strokeWidth="4"
              />
              <circle
                className="progress-ring-fill"
                cx="100" cy="100" r="90"
                fill="none"
                strokeWidth="4"
                strokeDasharray={`${2 * Math.PI * 90}`}
                strokeDashoffset={`${2 * Math.PI * 90 * (1 - state.motionProgress)}`}
                strokeLinecap="round"
              />
            </svg>
          )}

          {/* Face indicator dot */}
          <div className={`face-indicator ${state.isFaceDetected ? 'detected' : 'not-detected'}`}>
            {state.isFaceDetected ? '●' : '○'}
          </div>
        </div>

        {/* Feedback overlay */}
        <div className={`feedback-overlay ${statusClass}`}>
          <p className="feedback-message">{state.feedbackMessage}</p>
          {state.overallStatus === 'running' && state.stepStatus === 'active' && (
            <p className="timer">⏱ {state.timeRemaining.toFixed(1)}s</p>
          )}
        </div>
      </div>

      {/* Step indicators */}
      {state.overallStatus === 'running' && (
        <div className="steps-track">
          {sequence.map((step, i) => {
            let stepClass = 'step-dot';
            if (i < state.currentStepIndex) stepClass += ' completed';
            else if (i === state.currentStepIndex && state.stepStatus === 'active') stepClass += ' active';
            else if (i === state.currentStepIndex && state.stepStatus === 'success') stepClass += ' completed';

            return (
              <div key={i} className={stepClass} title={getStepLabel(step)}>
                <span className="step-icon">{getStepIcon(step)}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Action buttons */}
      <div className="actions">
        {state.overallStatus === 'ready' && (
          <button className="btn btn-primary" onClick={startChallenge}>
            Start Verification
          </button>
        )}
        {(state.overallStatus === 'success' || state.overallStatus === 'failed') && (
          <button className="btn btn-secondary" onClick={() => window.location.reload()}>
            Try Again
          </button>
        )}
      </div>

      {/* Success / Failure banners */}
      {state.overallStatus === 'success' && (
        <div className="result-banner success-banner">
          <span className="result-icon">✅</span>
          <h2>Liveness Confirmed</h2>
          <p>You have been verified as a real person.</p>
        </div>
      )}
      {state.overallStatus === 'failed' && (
        <div className="result-banner failure-banner">
          <span className="result-icon">❌</span>
          <h2>Verification Failed</h2>
          <p>{state.feedbackMessage}</p>
        </div>
      )}
    </div>
  );
};

function getStatusClass(status: OverallStatus): string {
  switch (status) {
    case 'success': return 'status-success';
    case 'failed':  return 'status-failed';
    case 'running': return 'status-running';
    default:        return '';
  }
}
