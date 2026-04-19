"use client";
import * as faceapi from "@vladmandic/face-api";

let loaded = false;

export async function loadFaceModels() {
  if (loaded) return;
  const url = "/models";
  await Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri(url),
    faceapi.nets.faceLandmark68Net.loadFromUri(url),
    faceapi.nets.faceRecognitionNet.loadFromUri(url),
  ]);
  loaded = true;
}

export async function detectDescriptor(
  el: HTMLVideoElement | HTMLImageElement,
) {
  const result = await faceapi
    .detectSingleFace(el, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 }))
    .withFaceLandmarks()
    .withFaceDescriptor();
  return result ?? null;
}

// Euclidean distance — càng nhỏ càng giống. Threshold ~0.5 là mặc định.
export function distance(a: Float32Array | number[], b: Float32Array | number[]) {
  const A = a instanceof Float32Array ? a : Float32Array.from(a);
  const B = b instanceof Float32Array ? b : Float32Array.from(b);
  return faceapi.euclideanDistance(A, B);
}

// Liveness: phát hiện chớp mắt qua EAR (Eye Aspect Ratio).
// Dùng ngưỡng tương đối (so với baseline EAR mở của chính user) để thích ứng người/góc/ánh sáng.
export function createBlinkDetector() {
  const history: number[] = [];
  let blinked = false;
  let wasClosed = false;

  const ear = (eye: faceapi.Point[]) => {
    const d = (a: faceapi.Point, b: faceapi.Point) =>
      Math.hypot(a.x - b.x, a.y - b.y);
    return (d(eye[1], eye[5]) + d(eye[2], eye[4])) / (2 * d(eye[0], eye[3]));
  };

  return {
    feed(landmarks: faceapi.FaceLandmarks68) {
      const cur = (ear(landmarks.getLeftEye()) + ear(landmarks.getRightEye())) / 2;
      history.push(cur);
      if (history.length > 60) history.shift();

      // Baseline = EAR cao nhất gần đây (mắt mở bình thường của user này)
      const baseline = Math.max(...history);
      if (history.length < 5) return; // cần warm-up

      // "Nhắm" = EAR giảm xuống dưới 75% baseline (hoặc dưới ngưỡng tuyệt đối 0.22)
      const closed = cur < baseline * 0.75 || cur < 0.22;
      // "Mở lại" = sau khi đã nhắm, EAR quay lại >= 90% baseline
      const opened = cur >= baseline * 0.9;

      if (closed) wasClosed = true;
      if (wasClosed && opened) blinked = true;
    },
    get blinked() {
      return blinked;
    },
    reset() {
      history.length = 0;
      blinked = false;
      wasClosed = false;
    },
  };
}
