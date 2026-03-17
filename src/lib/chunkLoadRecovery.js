const CHUNK_RELOAD_STORAGE_KEY = "a3hub:chunk-reload-once";
const CHUNK_ERROR_PATTERNS = [
  /Failed to fetch dynamically imported module/i,
  /Importing a module script failed/i,
  /ChunkLoadError/i,
  /Loading chunk [\w-]+ failed/i,
];

/**
 * @param {unknown} reason
 * @returns {boolean}
 */
const isChunkLoadError = (reason) => {
  const maybeReasonObject =
    reason && typeof reason === "object"
      ? /** @type {{ message?: unknown }} */ (reason)
      : null;
  const message =
    typeof reason === "string"
      ? reason
      : reason instanceof Error
        ? reason.message
        : typeof maybeReasonObject?.message === "string"
          ? maybeReasonObject.message
          : "";

  return CHUNK_ERROR_PATTERNS.some((pattern) => pattern.test(message));
};

const getCurrentLocationKey = () => {
  if (typeof window === "undefined") return "";
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
};

const shouldReloadForChunkError = () => {
  if (typeof window === "undefined") return false;

  const currentLocationKey = getCurrentLocationKey();
  const previousLocationKey = window.sessionStorage.getItem(
    CHUNK_RELOAD_STORAGE_KEY
  );

  if (previousLocationKey === currentLocationKey) {
    return false;
  }

  window.sessionStorage.setItem(
    CHUNK_RELOAD_STORAGE_KEY,
    currentLocationKey
  );
  return true;
};

const clearChunkReloadMarkerSoon = () => {
  if (typeof window === "undefined") return;

  window.setTimeout(() => {
    if (window.sessionStorage.getItem(CHUNK_RELOAD_STORAGE_KEY) === getCurrentLocationKey()) {
      window.sessionStorage.removeItem(CHUNK_RELOAD_STORAGE_KEY);
    }
  }, 60000);
};

const reloadForChunkError = () => {
  if (!shouldReloadForChunkError()) return;
  window.location.reload();
};

/**
 * @returns {void}
 */
export const installChunkLoadRecovery = () => {
  if (typeof window === "undefined") return;

  clearChunkReloadMarkerSoon();

  window.addEventListener(
    "error",
    (event) => {
      if (isChunkLoadError(event?.error || event?.message)) {
        reloadForChunkError();
      }
    },
    true
  );

  window.addEventListener("unhandledrejection", (event) => {
    if (isChunkLoadError(event?.reason)) {
      event.preventDefault?.();
      reloadForChunkError();
    }
  });
};
