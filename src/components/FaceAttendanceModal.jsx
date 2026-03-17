import { Camera, ScanFace, Shield, UserRound, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { loadFaceApi } from "../lib/faceApiLoader";

const FACE_MODEL_BASE_URI =
  "https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model";
const AUTO_SCAN_INTERVAL_MS = 420;
const MIN_FACE_VECTOR_LENGTH = 64;
const SCAN_FACE_DETECTION_INPUT_SIZE = 416;
const REGISTER_FACE_DETECTION_INPUT_SIZE = 512;
const FACE_DETECTION_SCORE_THRESHOLD = 0.3;
const FACE_CAPTURE_MIN_SCORE = 0.78;
const FACE_CAPTURE_MIN_WIDTH_RATIO = 0.16;
const FACE_CAPTURE_MIN_HEIGHT_RATIO = 0.2;
const FACE_CAPTURE_MIN_AREA_RATIO = 0.04;
const FACE_CAPTURE_MAX_CENTER_OFFSET_RATIO = 0.34;
const AUTO_REGISTER_CAPTURE_INTERVAL_MS = 520;
const AUTO_REGISTER_FRONT_FACE_CAPTURE_PERCENT = 95;
const AUTO_REGISTER_FRONT_FACE_CAPTURE_SCORE =
  AUTO_REGISTER_FRONT_FACE_CAPTURE_PERCENT / 100;
const FRONT_FACE_MAX_EYE_LEVEL_DELTA_RATIO = 0.12;
const FRONT_FACE_MAX_NOSE_OFFSET_RATIO = 0.18;
const FRONT_FACE_MAX_EYE_DISTANCE_DELTA_RATIO = 0.18;
const FRONT_FACE_MAX_MOUTH_OFFSET_RATIO = 0.2;

let loadedFaceApiPromise = null;

const buildTinyFaceDetectorOptions = (faceapi, inputSize) =>
  new faceapi.TinyFaceDetectorOptions({
    inputSize,
    scoreThreshold: FACE_DETECTION_SCORE_THRESHOLD,
  });

const stopStreamTracks = (stream) => {
  if (!stream) return;
  stream.getTracks().forEach((track) => track.stop());
};

const buildCameraErrorMessage = (error) => {
  const code = String(error?.name || "");
  if (code === "NotAllowedError") {
    return "Camera permission denied. Allow access and try again.";
  }
  if (code === "NotFoundError") {
    return "No camera found on this device.";
  }
  if (code === "NotReadableError") {
    return "Camera is being used by another app.";
  }
  return "Unable to start camera for face attendance.";
};

const normalizeDescriptorVector = (descriptor) => {
  if (!descriptor) return [];
  const sourceArray = Array.from(descriptor)
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
  if (sourceArray.length < MIN_FACE_VECTOR_LENGTH) return [];

  let squaredNorm = 0;
  sourceArray.forEach((value) => {
    squaredNorm += value * value;
  });
  if (squaredNorm <= 0) return [];

  const norm = Math.sqrt(squaredNorm);
  return sourceArray.map((value) => Number((value / norm).toFixed(7)));
};

const toPercentLabel = (value) => `${Math.round(Math.max(0, Number(value) || 0) * 100)}%`;

const clampNumber = (value, min, max) =>
  Math.min(max, Math.max(min, Number(value) || 0));

const buildPercentValue = (score) => Math.round(clampNumber(score, 0, 1) * 100);

const scorePoseMetric = (ratio, maxRatio) => {
  const safeRatio = Math.abs(Number(ratio) || 0);
  const safeMaxRatio = Math.max(Number(maxRatio) || 0, Number.EPSILON);
  const normalizedRatio = safeRatio / safeMaxRatio;

  // Keep the score informative across a wider range, while reserving 95%+
  // for very straight, centered faces.
  return clampNumber(1 - Math.min(normalizedRatio, 2) / 2, 0, 1);
};

const averagePoint = (points) => {
  const safePoints = Array.isArray(points)
    ? points.filter(
        (point) =>
          point &&
          Number.isFinite(Number(point.x)) &&
          Number.isFinite(Number(point.y))
      )
    : [];
  if (safePoints.length === 0) return null;

  const total = safePoints.reduce(
    (accumulator, point) => ({
      x: accumulator.x + Number(point.x),
      y: accumulator.y + Number(point.y),
    }),
    { x: 0, y: 0 }
  );

  return {
    x: total.x / safePoints.length,
    y: total.y / safePoints.length,
  };
};

const evaluateFrontFacingPose = (landmarks) => {
  const leftEyeCenter = averagePoint(landmarks?.getLeftEye?.());
  const rightEyeCenter = averagePoint(landmarks?.getRightEye?.());
  const mouthCenter = averagePoint(landmarks?.getMouth?.());
  const nosePoints = landmarks?.getNose?.();
  const noseTip =
    (Array.isArray(nosePoints) && nosePoints[3]) || averagePoint(nosePoints);

  if (!leftEyeCenter || !rightEyeCenter || !mouthCenter || !noseTip) {
    return {
      ok: false,
      reason: "landmarks_missing",
      frontFacingScore: 0,
      frontFacingPercent: 0,
    };
  }

  const eyeDeltaX = rightEyeCenter.x - leftEyeCenter.x;
  const eyeDeltaY = rightEyeCenter.y - leftEyeCenter.y;
  const eyeDistance = Math.max(1, Math.hypot(eyeDeltaX, eyeDeltaY));
  const eyeMidX = (leftEyeCenter.x + rightEyeCenter.x) / 2;
  const rollRatio = Math.abs(eyeDeltaY) / eyeDistance;
  const noseOffsetRatio = Math.abs(noseTip.x - eyeMidX) / eyeDistance;
  const leftEyeDistance = Math.hypot(
    noseTip.x - leftEyeCenter.x,
    noseTip.y - leftEyeCenter.y
  );
  const rightEyeDistance = Math.hypot(
    noseTip.x - rightEyeCenter.x,
    noseTip.y - rightEyeCenter.y
  );
  const averageEyeDistance = Math.max(
    1,
    (leftEyeDistance + rightEyeDistance) / 2
  );
  const eyeDistanceDeltaRatio =
    Math.abs(leftEyeDistance - rightEyeDistance) / averageEyeDistance;
  const mouthOffsetRatio = Math.abs(mouthCenter.x - eyeMidX) / eyeDistance;
  const rollScore = scorePoseMetric(
    rollRatio,
    FRONT_FACE_MAX_EYE_LEVEL_DELTA_RATIO
  );
  const noseOffsetScore = scorePoseMetric(
    noseOffsetRatio,
    FRONT_FACE_MAX_NOSE_OFFSET_RATIO
  );
  const eyeDistanceBalanceScore = scorePoseMetric(
    eyeDistanceDeltaRatio,
    FRONT_FACE_MAX_EYE_DISTANCE_DELTA_RATIO
  );
  const mouthOffsetScore = scorePoseMetric(
    mouthOffsetRatio,
    FRONT_FACE_MAX_MOUTH_OFFSET_RATIO
  );
  const frontFacingScore =
    (rollScore + noseOffsetScore + eyeDistanceBalanceScore + mouthOffsetScore) /
    4;
  const frontFacingPercent = buildPercentValue(frontFacingScore);
  const withinFrontFacingTolerance =
    rollRatio <= FRONT_FACE_MAX_EYE_LEVEL_DELTA_RATIO &&
    noseOffsetRatio <= FRONT_FACE_MAX_NOSE_OFFSET_RATIO &&
    eyeDistanceDeltaRatio <= FRONT_FACE_MAX_EYE_DISTANCE_DELTA_RATIO &&
    mouthOffsetRatio <= FRONT_FACE_MAX_MOUTH_OFFSET_RATIO;

  if (!withinFrontFacingTolerance) {
    return {
      ok: false,
      reason: "face_not_forward",
      rollRatio,
      noseOffsetRatio,
      eyeDistanceDeltaRatio,
      mouthOffsetRatio,
      frontFacingScore,
      frontFacingPercent,
    };
  }

  return {
    ok: true,
    rollRatio,
    noseOffsetRatio,
    eyeDistanceDeltaRatio,
    mouthOffsetRatio,
    frontFacingScore,
    frontFacingPercent,
  };
};

const evaluateFaceFrameQuality = ({
  detectionScore = 0,
  box,
  videoElement,
  landmarks,
  requireFrontFacing = false,
  requireCentered = true,
}) => {
  if (!videoElement || !box) {
    return {
      ok: false,
      reason: "missing_box",
    };
  }

  const videoWidth = Number(videoElement.videoWidth) || 0;
  const videoHeight = Number(videoElement.videoHeight) || 0;
  if (videoWidth <= 0 || videoHeight <= 0) {
    return {
      ok: false,
      reason: "camera_not_ready",
    };
  }

  const widthRatio = box.width / videoWidth;
  const heightRatio = box.height / videoHeight;
  const areaRatio = (box.width * box.height) / (videoWidth * videoHeight);
  const centerXRatio = (box.x + box.width / 2) / videoWidth;
  const centerYRatio = (box.y + box.height / 2) / videoHeight;
  const centerXOffset = Math.abs(centerXRatio - 0.5);
  const centerYOffset = Math.abs(centerYRatio - 0.5);
  const frontFacing = requireFrontFacing ? evaluateFrontFacingPose(landmarks) : null;

  if (Number(detectionScore) < FACE_CAPTURE_MIN_SCORE) {
    return {
      ok: false,
      reason: "low_detection_score",
      detectionScore: Number(detectionScore) || 0,
      ...(frontFacing || {}),
    };
  }

  if (
    widthRatio < FACE_CAPTURE_MIN_WIDTH_RATIO ||
    heightRatio < FACE_CAPTURE_MIN_HEIGHT_RATIO ||
    areaRatio < FACE_CAPTURE_MIN_AREA_RATIO
  ) {
    return {
      ok: false,
      reason: "face_too_small",
      widthRatio,
      heightRatio,
      areaRatio,
      ...(frontFacing || {}),
    };
  }

  if (
    requireCentered &&
    (centerXOffset > FACE_CAPTURE_MAX_CENTER_OFFSET_RATIO ||
      centerYOffset > FACE_CAPTURE_MAX_CENTER_OFFSET_RATIO)
  ) {
    return {
      ok: false,
      reason: "face_off_center",
      centerXOffset,
      centerYOffset,
      ...(frontFacing || {}),
    };
  }

  if (requireFrontFacing) {
    if (!frontFacing.ok) {
      return {
        ok: false,
        reason:
          frontFacing.reason === "landmarks_missing"
            ? "face_landmarks_missing"
            : "face_not_forward",
        widthRatio,
        heightRatio,
        areaRatio,
        centerXOffset,
        centerYOffset,
        ...frontFacing,
      };
    }

    if (
      Number(frontFacing.frontFacingScore || 0) <
      AUTO_REGISTER_FRONT_FACE_CAPTURE_SCORE
    ) {
      return {
        ok: false,
        reason: "front_face_score_low",
        detectionScore: Number(detectionScore) || 0,
        widthRatio,
        heightRatio,
        areaRatio,
        centerXOffset,
        centerYOffset,
        ...frontFacing,
      };
    }

    return {
      ok: true,
      detectionScore: Number(detectionScore) || 0,
      widthRatio,
      heightRatio,
      areaRatio,
      centerXOffset,
      centerYOffset,
      ...frontFacing,
    };
  }

  return {
    ok: true,
    detectionScore: Number(detectionScore) || 0,
    widthRatio,
    heightRatio,
    areaRatio,
    centerXOffset,
    centerYOffset,
  };
};

const buildLowQualityMessage = (quality = {}) => {
  const frontFacingPercentLabel = `${Math.round(
    clampNumber(quality.frontFacingPercent, 0, 100)
  )}%`;

  if (quality.reason === "low_detection_score") {
    return `Face confidence is low (${toPercentLabel(quality.detectionScore)}). Improve light and face the camera.`;
  }
  if (quality.reason === "face_too_small") {
    return "Face appears too small. Move closer to the camera.";
  }
  if (quality.reason === "face_off_center") {
    return "Center your face inside the guide for a stable capture.";
  }
  if (quality.reason === "face_not_forward") {
    return `Front-facing alignment is ${frontFacingPercentLabel}. Look straight at the camera with your head level until it reaches ${AUTO_REGISTER_FRONT_FACE_CAPTURE_PERCENT}% for auto capture.`;
  }
  if (quality.reason === "front_face_score_low") {
    return `Front-facing alignment is ${frontFacingPercentLabel}. Auto capture starts once it is above ${AUTO_REGISTER_FRONT_FACE_CAPTURE_PERCENT}%.`;
  }
  if (quality.reason === "face_landmarks_missing") {
    return `Front-facing alignment is ${frontFacingPercentLabel}. Hold still and keep your full face visible for auto capture.`;
  }
  if (quality.reason === "camera_not_ready") {
    return "Camera is warming up. Try again.";
  }
  return "Face quality is low. Adjust position and lighting, then retry.";
};

const ensureFaceApiLoaded = async () => {
  if (loadedFaceApiPromise) {
    return loadedFaceApiPromise;
  }

  loadedFaceApiPromise = (async () => {
    const faceapi = await loadFaceApi();

    if (faceapi?.tf?.ready) {
      await faceapi.tf.ready();
      try {
        if (typeof faceapi.tf.findBackend === "function" && faceapi.tf.findBackend("webgl")) {
          await faceapi.tf.setBackend("webgl");
        }
      } catch {
        // Keep default backend when switching fails.
      }
    }

    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(FACE_MODEL_BASE_URI),
      faceapi.nets.faceLandmark68TinyNet.loadFromUri(FACE_MODEL_BASE_URI),
      faceapi.nets.faceRecognitionNet.loadFromUri(FACE_MODEL_BASE_URI),
    ]);

    return faceapi;
  })();

  return loadedFaceApiPromise;
};

const detectSingleFaceDescriptor = async (
  faceapi,
  videoElement,
  { requireFrontFacing = false } = {}
) => {
  if (!videoElement || videoElement.readyState < 2 || videoElement.videoWidth <= 0) {
    return { status: "camera_not_ready" };
  }

  const detections = await faceapi
    .detectAllFaces(
      videoElement,
      buildTinyFaceDetectorOptions(faceapi, REGISTER_FACE_DETECTION_INPUT_SIZE)
    )
    .withFaceLandmarks(true)
    .withFaceDescriptors();

  if (!Array.isArray(detections) || detections.length === 0) {
    return { status: "no_face" };
  }

  if (detections.length > 1) {
    return {
      status: "multiple_faces",
      count: detections.length,
    };
  }

  const first = detections[0];
  const vector = normalizeDescriptorVector(first?.descriptor);
  const box = first?.detection?.box;
  const detectionScore = Number(first?.detection?.score || 0);
  const landmarks = first?.landmarks || null;

  if (vector.length < MIN_FACE_VECTOR_LENGTH) {
    return { status: "invalid_vector", box };
  }

  const quality = evaluateFaceFrameQuality({
    detectionScore,
    box,
    videoElement,
    landmarks,
    requireFrontFacing,
    requireCentered: true,
  });
  if (!quality.ok) {
    return {
      status: "low_quality",
      quality,
      box,
      detectionScore,
    };
  }

  return {
    status: "ok",
    vector,
    vectorLength: vector.length,
    detectionScore,
    quality,
    box,
  };
};

const detectMultipleFaceDescriptors = async (faceapi, videoElement) => {
  if (!videoElement || videoElement.readyState < 2 || videoElement.videoWidth <= 0) {
    return { status: "camera_not_ready" };
  }

  const detections = await faceapi
    .detectAllFaces(
      videoElement,
      buildTinyFaceDetectorOptions(faceapi, SCAN_FACE_DETECTION_INPUT_SIZE)
    )
    .withFaceLandmarks(true)
    .withFaceDescriptors();

  if (!Array.isArray(detections) || detections.length === 0) {
    return { status: "no_face" };
  }

  const usableDetections = detections
    .map((entry, detectionIndex) => {
      const vector = normalizeDescriptorVector(entry?.descriptor);
      const box = entry?.detection?.box;
      const detectionScore = Number(entry?.detection?.score || 0);
      const quality = evaluateFaceFrameQuality({
        detectionScore,
        box,
        videoElement,
        landmarks: entry?.landmarks || null,
        requireFrontFacing: false,
        requireCentered: false,
      });

      if (vector.length < MIN_FACE_VECTOR_LENGTH || !quality.ok) {
        return null;
      }

      return {
        detectionIndex,
        vector,
        vectorLength: vector.length,
        detectionScore,
        quality,
        box,
      };
    })
    .filter(Boolean);

  if (usableDetections.length === 0) {
    return {
      status: "low_quality",
      totalCount: detections.length,
    };
  }

  return {
    status: "ok",
    detections: usableDetections,
    totalCount: detections.length,
    skippedCount: Math.max(0, detections.length - usableDetections.length),
  };
};

const registerToneClassMap = {
  success: "border-emerald-400/40 bg-emerald-500/12 text-emerald-200",
  error: "border-rose-400/45 bg-rose-500/12 text-rose-200",
  info: "border-sky-400/35 bg-sky-500/10 text-sky-100",
};

export default function FaceAttendanceModal({
  open,
  mode = "scan",
  title = "Face Attendance",
  description = "",
  thresholdPercent = 70,
  onClose,
  onDescriptor,
  disabled = false,
}) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const faceApiRef = useRef(null);
  const scanTimerRef = useRef(null);
  const onDescriptorRef = useRef(onDescriptor);
  const inFlightRef = useRef(false);

  const [cameraOn, setCameraOn] = useState(false);
  const [loadingModels, setLoadingModels] = useState(false);
  const [modelError, setModelError] = useState("");
  const [cameraError, setCameraError] = useState("");
  const [statusText, setStatusText] = useState("");
  const [statusTone, setStatusTone] = useState("info");
  const [frontFacingPercent, setFrontFacingPercent] = useState(0);
  const [zoomStyle, setZoomStyle] = useState({});

  const isRegistrationMode = mode === "register";
  const clampedFrontFacingPercent = clampNumber(frontFacingPercent, 0, 100);
  const frontFacingReady =
    clampedFrontFacingPercent >= AUTO_REGISTER_FRONT_FACE_CAPTURE_PERCENT;

  useEffect(() => {
    onDescriptorRef.current = onDescriptor;
  }, [onDescriptor]);

  useEffect(() => {
    if (!open) {
      setCameraOn(false);
      setCameraError("");
      setStatusText("");
      setModelError("");
      setFrontFacingPercent(0);
      setZoomStyle({});
      return;
    }

    if (!disabled) {
      setCameraOn(true);
    }
  }, [disabled, isRegistrationMode, open]);

  const cleanupStream = useCallback(() => {
    if (scanTimerRef.current) {
      window.clearInterval(scanTimerRef.current);
      scanTimerRef.current = null;
    }

    stopStreamTracks(streamRef.current);
    streamRef.current = null;

    const videoElement = videoRef.current;
    if (videoElement) {
      videoElement.pause();
      videoElement.srcObject = null;
    }
  }, []);

  const handleDescriptorCapture = useCallback(
    async () => {
      const faceapi = faceApiRef.current;
      const videoElement = videoRef.current;
      if (!faceapi || !videoElement || inFlightRef.current) {
        return;
      }

      inFlightRef.current = true;

      try {
        const detected = isRegistrationMode
          ? await detectSingleFaceDescriptor(faceapi, videoElement, {
              requireFrontFacing: true,
            })
          : await detectMultipleFaceDescriptors(faceapi, videoElement);
        const detectedFrontFacingPercent = clampNumber(
          detected?.quality?.frontFacingPercent,
          0,
          100
        );

        if (isRegistrationMode) {
          setFrontFacingPercent(detectedFrontFacingPercent);
        }

        if (isRegistrationMode && detected.box) {
          const videoW = videoElement.videoWidth;
          const videoH = videoElement.videoHeight;
          if (videoW > 0 && videoH > 0) {
            const targetRatio = 0.5; // Auto-zoom to fill ~50% of the view height
            const scale = Math.max(1, Math.min(2.5, (videoH * targetRatio) / detected.box.height));
            const faceCenterX = ((detected.box.x + detected.box.width / 2) / videoW) * 100;
            const faceCenterY = ((detected.box.y + detected.box.height / 2) / videoH) * 100;
            
            setZoomStyle({
              transformOrigin: `${faceCenterX}% ${faceCenterY}%`,
              transform: `scale(${scale})`,
            });
          }
        } else if (isRegistrationMode) {
          setZoomStyle({ transformOrigin: "50% 50%", transform: "scale(1)" });
        }

        if (detected.status === "camera_not_ready") {
          if (isRegistrationMode) {
            setStatusTone("info");
            setStatusText("Camera is warming up for auto capture.");
          }
          return;
        }

        if (detected.status === "no_face") {
          if (isRegistrationMode) {
            setStatusTone("info");
            setStatusText(
              `Keep one front-facing face inside the guide. Auto capture starts above ${AUTO_REGISTER_FRONT_FACE_CAPTURE_PERCENT}%.`
            );
          } else {
            setStatusTone("info");
            setStatusText("No faces detected yet. Keep students visible in the frame.");
          }
          return;
        }

        if (detected.status === "multiple_faces") {
          setStatusTone("error");
          setStatusText("Multiple faces detected. Keep one face in camera.");
          return;
        }

        if (detected.status === "invalid_vector") {
          setStatusTone("error");
          setStatusText("Face vector could not be generated. Try again.");
          return;
        }

        if (detected.status === "low_quality") {
          if (isRegistrationMode) {
            setStatusTone("info");
            setStatusText(buildLowQualityMessage(detected.quality));
          } else {
            setStatusTone("info");
            setStatusText(
              "Faces detected are too small or unclear. Move students closer and improve lighting."
            );
          }
          return;
        }

        const callbackPayload = isRegistrationMode
          ? {
              vector: detected.vector,
              vectorLength: detected.vectorLength,
              detectionScore: detected.detectionScore,
              quality: detected.quality || null,
              detectedAt: Date.now(),
            }
          : {
              detections: detected.detections || [],
              totalCount: Number(detected.totalCount) || 0,
              skippedCount: Number(detected.skippedCount) || 0,
              detectedAt: Date.now(),
            };

        const callbackResult = await onDescriptorRef.current?.(callbackPayload);
        if (callbackResult?.message) {
          setStatusText(callbackResult.message);
          setStatusTone(callbackResult.tone === "success" || callbackResult.tone === "error"
            ? callbackResult.tone
            : "info");
        } else if (isRegistrationMode) {
          setStatusTone("success");
          setStatusText(
            `Face captured. Front-facing alignment reached ${detectedFrontFacingPercent}%.`
          );
        }

        if (isRegistrationMode && callbackResult?.tone === "success") {
          setCameraOn(false);
        }
      } catch {
        setStatusTone("error");
        setStatusText("Face detection failed. Please try again.");
      } finally {
        inFlightRef.current = false;
      }
    },
    [isRegistrationMode]
  );

  useEffect(() => {
    if (!open || disabled || !cameraOn) {
      cleanupStream();
      return undefined;
    }

    if (typeof window === "undefined") return undefined;
    if (!navigator?.mediaDevices?.getUserMedia) {
      setCameraError("Camera is not supported in this browser.");
      setCameraOn(false);
      return undefined;
    }

    let isCancelled = false;

    const start = async () => {
      setLoadingModels(true);
      setModelError("");
      setCameraError("");

      try {
        const faceapi = await ensureFaceApiLoaded();
        if (isCancelled) return;
        faceApiRef.current = faceapi;
      } catch {
        if (!isCancelled) {
          setModelError(
            "Unable to load face recognition models. Check internet and try again."
          );
          setCameraOn(false);
        }
        return;
      } finally {
        if (!isCancelled) {
          setLoadingModels(false);
        }
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "user" },
            width: { ideal: isRegistrationMode ? 1280 : 960 },
            height: { ideal: isRegistrationMode ? 720 : 540 },
            frameRate: { ideal: 30, max: 30 },
          },
          audio: false,
        });

        if (isCancelled) {
          stopStreamTracks(stream);
          return;
        }

        const videoElement = videoRef.current;
        if (!videoElement) {
          stopStreamTracks(stream);
          return;
        }

        streamRef.current = stream;
        videoElement.srcObject = stream;
        videoElement.playsInline = true;
        videoElement.muted = true;

        try {
          await videoElement.play();
        } catch {
          setCameraError("Unable to start camera automatically. Tap Start Camera.");
          setCameraOn(false);
          cleanupStream();
          return;
        }

        if (isRegistrationMode) {
          setStatusTone("info");
          setStatusText(
            `Auto capture is active. Look straight at the camera until front-facing alignment reaches ${AUTO_REGISTER_FRONT_FACE_CAPTURE_PERCENT}%.`
          );
        }

        scanTimerRef.current = window.setInterval(() => {
          void handleDescriptorCapture();
        }, isRegistrationMode ? AUTO_REGISTER_CAPTURE_INTERVAL_MS : AUTO_SCAN_INTERVAL_MS);
      } catch (error) {
        setCameraError(buildCameraErrorMessage(error));
        setCameraOn(false);
      }
    };

    void start();

    return () => {
      isCancelled = true;
      cleanupStream();
    };
  }, [
    cameraOn,
    cleanupStream,
    disabled,
    handleDescriptorCapture,
    isRegistrationMode,
    open,
  ]);

  if (!open) return null;

  if (isRegistrationMode) {
    return (
      <div className="ui-modal ui-modal--compact" role="dialog" aria-modal="true">
        <button
          type="button"
          aria-label="Close face attendance modal"
          className="ui-modal__scrim"
          tabIndex={-1}
          onClick={onClose}
        />

        <div tabIndex={-1} className="ui-modal__panel w-full max-w-lg p-2 sm:p-3">
          <div className="relative overflow-hidden rounded-[20px] border border-[#1d2b44] bg-[#030b1a] text-[#d6e8ff] shadow-[0_28px_65px_-36px_rgba(2,132,199,0.9)]">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 opacity-25"
              style={{
                backgroundImage:
                  "linear-gradient(rgba(60,96,142,0.55) 1px, transparent 1px), linear-gradient(90deg, rgba(60,96,142,0.55) 1px, transparent 1px)",
                backgroundPosition: "-1px -1px",
                backgroundSize: "52px 52px",
              }}
            />
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(14,165,233,0.22),transparent_46%),radial-gradient(circle_at_80%_100%,rgba(14,165,233,0.12),transparent_55%)]" />

            <div className="relative border-b border-[#1b2941] px-4 py-3 sm:px-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="grid h-9 w-9 place-items-center rounded-xl border border-[#18406d] bg-[#081c33] shadow-[inset_0_1px_0_rgba(125,211,252,0.18)]">
                    <Shield className="h-4 w-4 text-sky-300" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-white leading-tight">{title}</h3>
                    <p className="mt-0.5 text-xs text-[#8ea8cb]">Student Attendance System</p>
                    {description ? (
                      <p className="text-xs text-[#7590b4]">{description}</p>
                    ) : null}
                  </div>
                </div>
                <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.1em] text-[#93aac8]">
                  <span
                    className={`h-2 w-2 rounded-full ${
                      cameraOn
                        ? "bg-emerald-400 shadow-[0_0_0_5px_rgba(52,211,153,0.16)]"
                        : "bg-slate-400/70"
                    }`}
                  />
                  {cameraOn ? "Camera On" : "Standby"}
                </div>
              </div>
            </div>

            <div className="relative space-y-3 px-4 py-3 sm:px-5 sm:py-4">
              <div className="rounded-[16px] border border-[#1d2d46] bg-[#0f1828]/95 p-1.5 sm:p-2">
                <div className="relative mx-auto aspect-video w-full max-w-md max-h-[220px] overflow-hidden rounded-[12px] border border-[#1f304a] bg-[#081223]">
                  {cameraOn ? (
                    <video
                      ref={videoRef}
                      className="h-full w-full object-cover"
                      autoPlay
                      muted
                      playsInline
                      style={{
                        ...zoomStyle,
                        transition: "all 0.8s cubic-bezier(0.22, 1, 0.36, 1)",
                      }}
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-[#0a1324]" />
                  )}

                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <div className="relative flex h-[70%] w-[42%] min-h-[120px] min-w-[90px] max-h-[180px] max-w-[130px] items-center justify-center rounded-[999px] border-[2px] border-dashed border-[#0fbaff] shadow-[0_0_0_1px_rgba(8,47,73,0.65),0_0_24px_rgba(14,165,233,0.3)]">
                      <div className="grid h-10 w-10 place-items-center rounded-full border border-[#334c6e] bg-[#142338]/86 text-[#7ea5d1] shadow-[inset_0_1px_0_rgba(186,230,253,0.12)]">
                        <UserRound className="h-5 w-5" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-[10px] border border-[#1f2e48] bg-[#0c1525]/95 px-3 py-2 text-xs text-[#8fa8c8] shadow-[inset_0_1px_0_rgba(125,211,252,0.09)]">
                <div className="flex items-start gap-2.5">
                  <ScanFace className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-300" />
                  <p className="leading-snug">
                    Keep one front-facing face inside the oval guide. Auto capture happens when your front-facing alignment goes above {AUTO_REGISTER_FRONT_FACE_CAPTURE_PERCENT}%.
                  </p>
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setCameraOn(true)}
                  disabled={disabled || cameraOn || loadingModels}
                  className="inline-flex items-center justify-center gap-2 rounded-[10px] border border-sky-400/40 bg-[linear-gradient(135deg,#1698ff_0%,#1477ee_100%)] px-3 py-2 text-sm font-semibold text-white shadow-[0_12px_24px_-16px_rgba(14,116,233,0.95)] transition-all duration-200 hover:-translate-y-0.5 hover:brightness-110 active:translate-y-0 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <Camera className="h-4 w-4" />
                  {loadingModels ? "Loading..." : cameraOn ? "Camera Active" : "Start Camera"}
                </button>

                <div className="rounded-[10px] border border-[#273853] bg-[#071120] px-3 py-2 text-[#b8c8df] shadow-[inset_0_1px_0_rgba(148,197,255,0.08)]">
                  <div className="flex items-center justify-between gap-2">
                    <div className="inline-flex items-center gap-2 text-sm font-semibold text-[#d6e8ff]">
                      <ScanFace
                        className={`h-4 w-4 ${
                          frontFacingReady ? "text-emerald-300" : "text-sky-300"
                        }`}
                      />
                      <span>
                        Front Facing {cameraOn ? `${clampedFrontFacingPercent}%` : "--"}
                      </span>
                    </div>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                        frontFacingReady
                          ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-200"
                          : "border-[#314661] bg-[#0c1525] text-[#9bb2d0]"
                      }`}
                    >
                      {cameraOn
                        ? frontFacingReady
                          ? "Ready"
                          : `${AUTO_REGISTER_FRONT_FACE_CAPTURE_PERCENT}% needed`
                        : "Standby"}
                    </span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#081223]">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        frontFacingReady
                          ? "bg-[linear-gradient(90deg,#34d399_0%,#10b981_100%)]"
                          : "bg-[linear-gradient(90deg,#38bdf8_0%,#0ea5e9_100%)]"
                      }`}
                      style={{
                        width: `${
                          cameraOn && clampedFrontFacingPercent > 0
                            ? Math.max(clampedFrontFacingPercent, 6)
                            : 0
                        }%`,
                      }}
                    />
                  </div>
                  <p className="mt-2 text-[11px] text-[#8fa8c8]">
                    {cameraOn
                      ? `Auto capture starts at ${AUTO_REGISTER_FRONT_FACE_CAPTURE_PERCENT}%+ front alignment.`
                      : "Start the camera to measure front alignment."}
                  </p>
                </div>
              </div>

              <div className="grid gap-2">
                {loadingModels ? (
                  <p className="rounded-xl border border-sky-400/35 bg-sky-500/8 px-3 py-2 text-xs font-semibold text-sky-100">
                    Loading face models...
                  </p>
                ) : null}
                {modelError ? (
                  <p className="rounded-xl border border-rose-400/40 bg-rose-500/12 px-3 py-2 text-xs font-semibold text-rose-200">
                    {modelError}
                  </p>
                ) : null}
                {cameraError ? (
                  <p className="rounded-xl border border-rose-400/40 bg-rose-500/12 px-3 py-2 text-xs font-semibold text-rose-200">
                    {cameraError}
                  </p>
                ) : null}
                {statusText ? (
                  <p
                    className={`rounded-xl px-3 py-2 text-xs font-semibold ${
                      registerToneClassMap[statusTone] || registerToneClassMap.info
                    }`}
                  >
                    {statusText}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="relative flex flex-wrap items-center justify-between gap-3 border-t border-[#1b2941] px-4 py-2.5 text-xs text-[#8ea7c7] sm:px-5">
              <p>Secured with 128-d face embeddings</p>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex items-center gap-1.5 rounded-[8px] px-2 py-1.5 text-[#a8bdd8] transition-colors hover:bg-[#13223a] hover:text-white"
              >
                <X className="h-3.5 w-3.5" />
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="ui-modal ui-modal--compact" role="dialog" aria-modal="true">
      <button
        type="button"
        aria-label="Close face attendance modal"
        className="ui-modal__scrim"
        tabIndex={-1}
        onClick={onClose}
      />

      <div tabIndex={-1} className="ui-modal__panel w-full max-w-lg p-2 sm:p-3">
        <div className="relative overflow-hidden rounded-[20px] border border-[#1d2b44] bg-[#030b1a] text-[#d6e8ff] shadow-[0_28px_65px_-36px_rgba(2,132,199,0.9)]">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-25"
            style={{
              backgroundImage:
                "linear-gradient(rgba(60,96,142,0.55) 1px, transparent 1px), linear-gradient(90deg, rgba(60,96,142,0.55) 1px, transparent 1px)",
              backgroundPosition: "-1px -1px",
              backgroundSize: "52px 52px",
            }}
          />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(14,165,233,0.22),transparent_46%),radial-gradient(circle_at_80%_100%,rgba(14,165,233,0.12),transparent_55%)]" />

          <div className="relative border-b border-[#1b2941] px-4 py-3 sm:px-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="grid h-9 w-9 place-items-center rounded-xl border border-[#18406d] bg-[#081c33] shadow-[inset_0_1px_0_rgba(125,211,252,0.18)]">
                  <ScanFace className="h-4 w-4 text-sky-300" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-white leading-tight">{title}</h3>
                  <p className="mt-0.5 text-xs text-[#8ea8cb]">Live Face Attendance</p>
                  {description ? (
                    <p className="text-xs text-[#7590b4]">{description}</p>
                  ) : null}
                </div>
              </div>
              <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.1em] text-[#93aac8]">
                <span
                  className={`h-2 w-2 rounded-full ${
                    cameraOn
                      ? "bg-emerald-400 shadow-[0_0_0_5px_rgba(52,211,153,0.16)]"
                      : "bg-slate-400/70"
                  }`}
                />
                {cameraOn ? <span className="text-emerald-300">Scanning</span> : "Standby"}
              </div>
            </div>
          </div>

          <div className="relative space-y-3 px-4 py-3 sm:px-5 sm:py-4">
            <div className="rounded-[16px] border border-[#1d2d46] bg-[#0f1828]/95 p-1.5 sm:p-2">
              <div className="relative mx-auto aspect-video w-full max-w-md max-h-[220px] overflow-hidden rounded-[12px] border border-[#1f304a] bg-[#081223]">
                {cameraOn ? (
                  <video
                    ref={videoRef}
                    className="h-full w-full object-cover"
                    autoPlay
                    muted
                    playsInline
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-[#0a1324]" />
                )}

                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(14,165,233,0.12),transparent_58%)]" />

                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="relative flex h-[70%] w-[42%] min-h-[120px] min-w-[90px] max-h-[180px] max-w-[130px] items-center justify-center rounded-[999px] border-[2px] border-dashed border-[#0fbaff] shadow-[0_0_0_1px_rgba(8,47,73,0.65),0_0_24px_rgba(14,165,233,0.3)]">
                    <div className="grid h-10 w-10 place-items-center rounded-full border border-[#334c6e] bg-[#142338]/86 text-[#7ea5d1] shadow-[inset_0_1px_0_rgba(186,230,253,0.12)]">
                      <ScanFace className="h-5 w-5" />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-[10px] border border-[#1f2e48] bg-[#0c1525]/95 px-3 py-2 text-xs text-[#8fa8c8] shadow-[inset_0_1px_0_rgba(125,211,252,0.09)]">
              <div className="flex items-start gap-2.5">
                <ScanFace className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-300" />
                <p className="leading-snug">
                  Keep one or more student faces visible with good light. Reliable matches above {thresholdPercent}% are marked automatically in the same scan cycle.
                </p>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setCameraOn(true)}
                disabled={disabled || cameraOn || loadingModels}
                className="inline-flex items-center justify-center gap-2 rounded-[10px] border border-emerald-400/40 bg-[linear-gradient(135deg,#10b981_0%,#059669_100%)] px-3 py-2 text-sm font-semibold text-white shadow-[0_12px_24px_-16px_rgba(16,185,129,0.95)] transition-all duration-200 hover:-translate-y-0.5 hover:brightness-110 active:translate-y-0 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-45"
              >
                <Camera className="h-4 w-4" />
                {loadingModels ? "Loading..." : "Camera On"}
              </button>

              <button
                type="button"
                onClick={() => setCameraOn(false)}
                disabled={disabled || !cameraOn}
                className="inline-flex items-center justify-center gap-2 rounded-[10px] border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm font-semibold text-rose-200 shadow-[inset_0_1px_0_rgba(244,63,94,0.08)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-rose-500/20 active:translate-y-0 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <X className="h-4 w-4" />
                Camera Off
              </button>
            </div>

            <div className="grid gap-2">
              {loadingModels ? (
                <p className="rounded-xl border border-sky-400/35 bg-sky-500/8 px-3 py-2 text-xs font-semibold text-sky-100">
                  Loading face models...
                </p>
              ) : null}
              {modelError ? (
                <p className="rounded-xl border border-rose-400/40 bg-rose-500/12 px-3 py-2 text-xs font-semibold text-rose-200">
                  {modelError}
                </p>
              ) : null}
              {cameraError ? (
                <p className="rounded-xl border border-rose-400/40 bg-rose-500/12 px-3 py-2 text-xs font-semibold text-rose-200">
                  {cameraError}
                </p>
              ) : null}
              {statusText ? (
                <p
                  className={`rounded-xl px-3 py-2 text-xs font-semibold ${
                    registerToneClassMap[statusTone] || registerToneClassMap.info
                  }`}
                >
                  {statusText}
                </p>
              ) : null}
            </div>
          </div>

          <div className="relative flex flex-wrap items-center justify-between gap-3 border-t border-[#1b2941] px-4 py-2.5 text-xs text-[#8ea7c7] sm:px-5">
            <p>Scanning at {Math.round(1000 / AUTO_SCAN_INTERVAL_MS)} scans/sec</p>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-1.5 rounded-[8px] px-2 py-1.5 text-[#a8bdd8] transition-colors hover:bg-[#13223a] hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
