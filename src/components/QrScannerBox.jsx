import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { extractNumericQrValue } from "../lib/qr";

const SCAN_COOLDOWN_MS = 1200;
const MAX_SCAN_DIMENSION = 720;

const stopStreamTracks = (stream) => {
  if (!stream) return;
  stream.getTracks().forEach((track) => track.stop());
};

const buildErrorMessage = (error) => {
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
  return "Unable to start camera scanner.";
};

const emitScanResult = (rawValue, lastScanRef, onScanRef) => {
  if (!rawValue) return;
  const now = Date.now();
  if (
    lastScanRef.current.value === rawValue &&
    now - lastScanRef.current.at <= SCAN_COOLDOWN_MS
  ) {
    return;
  }

  lastScanRef.current = { value: rawValue, at: now };
  const numericValue = extractNumericQrValue(rawValue);
  onScanRef.current?.({
    rawValue,
    numericValue,
  });
};

const decodeWithJsQr = (videoElement, scanCanvas, scanContext) => {
  const sourceWidth = Number(videoElement?.videoWidth || 0);
  const sourceHeight = Number(videoElement?.videoHeight || 0);
  if (sourceWidth <= 0 || sourceHeight <= 0) return "";

  const scale = Math.min(1, MAX_SCAN_DIMENSION / Math.max(sourceWidth, sourceHeight));
  const scanWidth = Math.max(1, Math.floor(sourceWidth * scale));
  const scanHeight = Math.max(1, Math.floor(sourceHeight * scale));

  if (scanCanvas.width !== scanWidth || scanCanvas.height !== scanHeight) {
    scanCanvas.width = scanWidth;
    scanCanvas.height = scanHeight;
  }

  scanContext.drawImage(videoElement, 0, 0, scanWidth, scanHeight);

  let imageData;
  try {
    imageData = scanContext.getImageData(0, 0, scanWidth, scanHeight);
  } catch {
    return "";
  }

  const decoded = jsQR(imageData.data, scanWidth, scanHeight, {
    inversionAttempts: "attemptBoth",
  });

  return String(decoded?.data || "").trim();
};

export default function QrScannerBox({
  title,
  description,
  onScan,
  disabled = false,
}) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const frameIdRef = useRef(null);
  const decodeInFlightRef = useRef(false);
  const onScanRef = useRef(onScan);
  const lastScanRef = useRef({ value: "", at: 0 });

  const [cameraOn, setCameraOn] = useState(false);
  const [scannerError, setScannerError] = useState("");

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    if (disabled && cameraOn) {
      setCameraOn(false);
    }
  }, [cameraOn, disabled]);

  useEffect(() => {
    if (!cameraOn || disabled) return undefined;
    if (typeof window === "undefined") return undefined;
    if (!navigator?.mediaDevices?.getUserMedia) {
      setScannerError("Camera is not supported in this browser.");
      setCameraOn(false);
      return undefined;
    }

    const { BarcodeDetector } = window;
    let cancelled = false;

    const cleanup = () => {
      if (frameIdRef.current) {
        window.cancelAnimationFrame(frameIdRef.current);
        frameIdRef.current = null;
      }
      stopStreamTracks(streamRef.current);
      streamRef.current = null;

      const videoElement = videoRef.current;
      if (videoElement) {
        videoElement.pause();
        videoElement.srcObject = null;
      }
    };

    const runScanner = async () => {
      setScannerError("");

      try {
        let detector = null;
        if (typeof BarcodeDetector === "function") {
          let supportsQr = true;
          if (typeof BarcodeDetector.getSupportedFormats === "function") {
            try {
              const formats = await BarcodeDetector.getSupportedFormats();
              supportsQr = formats.includes("qr_code");
            } catch {
              supportsQr = true;
            }
          }
          detector = supportsQr
            ? new BarcodeDetector({ formats: ["qr_code"] })
            : null;
        }

        const scanCanvas = document.createElement("canvas");
        const scanContext =
          scanCanvas.getContext("2d", { willReadFrequently: true }) ||
          scanCanvas.getContext("2d");
        if (!detector && !scanContext) {
          setScannerError("QR scanning is not available in this browser.");
          setCameraOn(false);
          return;
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });

        if (cancelled) {
          stopStreamTracks(stream);
          return;
        }

        streamRef.current = stream;
        const videoElement = videoRef.current;
        if (!videoElement) {
          cleanup();
          return;
        }

        videoElement.srcObject = stream;
        videoElement.playsInline = true;
        videoElement.muted = true;

        try {
          await videoElement.play();
        } catch {
          setScannerError("Tap camera on to start scanning.");
          setCameraOn(false);
          cleanup();
          return;
        }

        const detectFrame = async () => {
          if (cancelled || !videoRef.current) return;

          const currentVideo = videoRef.current;
          if (
            currentVideo.readyState >= 2 &&
            !decodeInFlightRef.current &&
            currentVideo.videoWidth > 0
          ) {
            decodeInFlightRef.current = true;
            try {
              let rawValue = "";

              if (detector) {
                try {
                  const detected = await detector.detect(currentVideo);
                  const first = detected?.[0];
                  rawValue = String(first?.rawValue || "").trim();
                } catch {
                  rawValue = "";
                }
              }

              if (!rawValue && scanContext) {
                rawValue = decodeWithJsQr(currentVideo, scanCanvas, scanContext);
              }

              emitScanResult(rawValue, lastScanRef, onScanRef);
            } catch {
              // Keep scanning if one frame fails.
            } finally {
              decodeInFlightRef.current = false;
            }
          }

          frameIdRef.current = window.requestAnimationFrame(detectFrame);
        };

        frameIdRef.current = window.requestAnimationFrame(detectFrame);
      } catch (error) {
        setScannerError(buildErrorMessage(error));
        setCameraOn(false);
      }
    };

    void runScanner();

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [cameraOn, disabled]);

  const onText = cameraOn ? "Camera is on" : "Camera is off";

  return (
    <div className="rounded-xl border border-clay/25 bg-white/95 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-ink/70">
            {title}
          </p>
          {description ? <p className="text-xs text-ink/70">{description}</p> : null}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCameraOn(true)}
            disabled={disabled || cameraOn}
            className="rounded-full border border-emerald-200 bg-emerald-100 px-3 py-1 text-[11px] font-semibold text-emerald-900 disabled:cursor-not-allowed disabled:opacity-55"
          >
            Camera On
          </button>
          <button
            type="button"
            onClick={() => setCameraOn(false)}
            disabled={disabled || !cameraOn}
            className="rounded-full border border-rose-200 bg-rose-100 px-3 py-1 text-[11px] font-semibold text-rose-900 disabled:cursor-not-allowed disabled:opacity-55"
          >
            Camera Off
          </button>
        </div>
      </div>

      <div className="mt-3">
        <div className="relative mx-auto aspect-square w-full max-w-[180px] overflow-hidden rounded-xl border border-clay/35 bg-black">
          {cameraOn ? (
            <video
              ref={videoRef}
              className="h-full w-full object-cover"
              autoPlay
              muted
              playsInline
            />
          ) : (
            <div className="flex h-full items-center justify-center px-2 text-center text-[11px] font-semibold text-white/80">
              {onText}
            </div>
          )}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-20 w-20 rounded-lg border-2 border-white/90" />
          </div>
        </div>
        <p className="mt-2 text-center text-[11px] text-ink/65">
          {cameraOn
            ? "Keep QR code inside the small box."
            : "Turn on camera to scan QR code."}
        </p>
        {scannerError ? (
          <p className="mt-2 text-center text-xs font-semibold text-rose-700">
            {scannerError}
          </p>
        ) : null}
      </div>
    </div>
  );
}
