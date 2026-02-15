# Face Liveness Detection

A lightweight, browser-based face liveness detection system built with React, Vite, and MediaPipe. Designed to distinguish real users from static photos or spoof attacks using motion continuity analysis and blink detection.

## Features

- **MediaPipe FaceMesh**: High-precision 478-point face landmarks for accurate pose and eye tracking.
- **Anti-Spoofing Engine**:
  - **Motion Continuity**: Reject static photos by requiring smooth, monotonic head movement.
  - **Sudden Jump Detection**: Detects and rejects instantaneous pose changes (e.g., swapping photos).
  - **Blink Verification**: Requires natural blink patterns (close → reopen) to confirm liveness.
- **Challenge-Response**: Randomized sequence of head movements (Left, Right, Up, Down) and blinks.
- **Privacy-First**: All processing happens locally in the browser. No images are sent to any server.
- **Multi-Face Tracking**: Automatically detects up to 4 faces and locks onto the closest/largest face for liveness verification.
- **Lightweight**: Uses `@mediapipe/tasks-vision` with assets loaded from CDN (~2 MB).

## Tech Stack

- **Framework**: React + Vite
- **Language**: TypeScript
- **ML Library**: MediaPipe Tasks Vision (FaceLandmarker)
- **Styling**: Native CSS (Dark mode, Glassmorphism)

## Getting Started

### Prerequisites

- Node.js (v16+)
- npm

### Installation

1. Clone the repository:
   ```bash
   https://github.com/christopherjneelankavil/face_liveness_detector.git
   cd face_liveness_detection
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

4. Open your browser at `http://localhost:5173`.

## How It Works

1. **Initialization**: Loads the MediaPipe FaceLandmarker model from the Google CDN.
2. **Face Detection**: Acquires webcam stream and detects up to 4 faces. Selects the largest face (closest to camera) for tracking.
3. **Challenge Sequencer**:
   - Users are presented with a randomized sequence of challenges (e.g., "Turn Left", "Blink", "Look Up").
4. **Validation**:
   - **Head Turns**: The `MotionValidator` analyzes the last ~18 frames to ensure the movement is smooth, strictly directional, and covers a minimum distance.
   - **Blinks**: The `BlinkDetector` monitors eye aspect ratio (EAR) via blendshapes to detect a full blink cycle.
5. **Success**: Completing all challenges confirms liveness.

## Configuration

Tunable constants in `src/lib/motionValidator.ts`:
- `MIN_DISPLACEMENT_HORIZONTAL` / `MIN_DISPLACEMENT_VERTICAL`: Minimum normalized distance the head must turn (lower for up/down).
- `MAX_FRAME_DELTA`: Maximum allowed frame-to-frame change (prevents photo swapping).
- `MIN_DIRECTIONAL_RATIO`: Percentage of frames that must move in the target direction.

## License

MIT
