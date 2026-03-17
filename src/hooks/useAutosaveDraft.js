import { useCallback, useEffect, useRef } from "react";

/**
 * @typedef {{
 *   value: unknown;
 *   updatedAt: number;
 * }} StoredDraft
 */

/**
 * @typedef {{
 *   key: unknown;
 *   value: unknown;
 *   onRestore?: ((value: unknown, updatedAt: number) => void) | undefined;
 *   enabled?: boolean;
 *   delayMs?: number;
 * }} AutosaveDraftOptions
 */

/**
 * @param {string | null} raw
 * @returns {StoredDraft | null}
 */
const parseStoredDraft = (raw) => {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return {
      value: parsed.value,
      updatedAt:
        typeof parsed.updatedAt === "number" && Number.isFinite(parsed.updatedAt)
          ? parsed.updatedAt
          : 0,
    };
  } catch {
    return null;
  }
};

/**
 * @param {AutosaveDraftOptions} options
 */
export function useAutosaveDraft({
  key,
  value,
  onRestore,
  enabled = true,
  delayMs = 450,
}) {
  const storageKey = String(key || "").trim();
  const hasRestoredRef = useRef(false);

  const clearDraft = useCallback(() => {
    if (!storageKey || typeof window === "undefined") return;
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      // Ignore quota/private mode errors.
    }
  }, [storageKey]);

  useEffect(() => {
    if (hasRestoredRef.current) return;
    hasRestoredRef.current = true;

    if (!enabled || !storageKey || typeof window === "undefined") return;
    const parsed = parseStoredDraft(window.localStorage.getItem(storageKey));
    if (!parsed) return;

    onRestore?.(parsed.value, parsed.updatedAt);
  }, [enabled, onRestore, storageKey]);

  useEffect(() => {
    if (!enabled || !storageKey || typeof window === "undefined") return;
    if (!hasRestoredRef.current) return;

    const timeoutId = window.setTimeout(() => {
      try {
        window.localStorage.setItem(
          storageKey,
          JSON.stringify({
            value,
            updatedAt: Date.now(),
          })
        );
      } catch {
        // Ignore quota/private mode errors.
      }
    }, delayMs);

    return () => window.clearTimeout(timeoutId);
  }, [delayMs, enabled, storageKey, value]);

  return {
    clearDraft,
  };
}
