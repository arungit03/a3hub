const FACE_API_SCRIPT_URL =
  "https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15/dist/face-api.js";
const FACE_API_SCRIPT_SELECTOR = 'script[data-face-api-loader="true"]';
const FACE_MODEL_BASE_URI =
  "https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model";

let faceApiScriptPromise = null;
let faceApiReadyPromise = null;

const getGlobalFaceApi = () => {
  const globalFaceApi =
    typeof globalThis !== "undefined" ? globalThis.faceapi : null;
  return globalFaceApi?.nets ? globalFaceApi : null;
};

const loadFaceApiScript = () => {
  const existingFaceApi = getGlobalFaceApi();
  if (existingFaceApi) {
    return Promise.resolve(existingFaceApi);
  }

  if (faceApiScriptPromise) {
    return faceApiScriptPromise;
  }

  if (typeof document === "undefined") {
    return Promise.reject(
      new Error("Face API can only be loaded in the browser.")
    );
  }

  faceApiScriptPromise = new Promise((resolve, reject) => {
    const existingScript = document.querySelector(FACE_API_SCRIPT_SELECTOR);
    if (existingScript) {
      existingScript.addEventListener("load", () => {
        const faceapi = getGlobalFaceApi();
        if (faceapi) {
          resolve(faceapi);
          return;
        }
        reject(new Error("Face API loaded without exposing the global object."));
      });
      existingScript.addEventListener("error", () => {
        reject(new Error("Unable to load Face API script."));
      });
      return;
    }

    const script = document.createElement("script");
    script.src = FACE_API_SCRIPT_URL;
    script.async = true;
    script.crossOrigin = "anonymous";
    script.dataset.faceApiLoader = "true";
    script.onload = () => {
      const faceapi = getGlobalFaceApi();
      if (faceapi) {
        resolve(faceapi);
        return;
      }
      reject(new Error("Face API loaded without exposing the global object."));
    };
    script.onerror = () => {
      script.remove();
      reject(new Error("Unable to load Face API script."));
    };
    document.head.appendChild(script);
  }).catch((error) => {
    faceApiScriptPromise = null;
    throw error;
  });

  return faceApiScriptPromise;
};

export const loadFaceApi = async () => {
  const faceapi = await loadFaceApiScript();
  if (!faceapi?.nets) {
    throw new Error("Face API module could not be initialized.");
  }
  return faceapi;
};

export const ensureFaceApiReady = async () => {
  if (faceApiReadyPromise) {
    return faceApiReadyPromise;
  }

  faceApiReadyPromise = (async () => {
    const faceapi = await loadFaceApi();

    if (faceapi?.tf?.ready) {
      await faceapi.tf.ready();
      try {
        if (
          typeof faceapi.tf.findBackend === "function" &&
          faceapi.tf.findBackend("webgl")
        ) {
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
  })().catch((error) => {
    faceApiReadyPromise = null;
    throw error;
  });

  return faceApiReadyPromise;
};

export default loadFaceApi;
