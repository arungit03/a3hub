import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { ToastContext } from "../state/toast-context";
const DEFAULT_DURATION_MS = 3400;

const TYPE_STYLES = {
  success: "border-emerald-300 bg-emerald-50 text-emerald-900",
  error: "border-rose-300 bg-rose-50 text-rose-900",
  warning: "border-amber-300 bg-amber-50 text-amber-900",
  info: "border-ocean/35 bg-white text-ink",
};

function ToastItem({ toast, onDismiss }) {
  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      onDismiss(toast.id);
    }, toast.durationMs);
    return () => window.clearTimeout(timeoutId);
  }, [onDismiss, toast.durationMs, toast.id]);

  const styleClass = TYPE_STYLES[toast.type] || TYPE_STYLES.info;
  const liveMode = toast.type === "error" ? "assertive" : "polite";

  return (
    <article
      role="status"
      aria-live={liveMode}
      className={`pointer-events-auto rounded-xl border px-3 py-2 shadow-[0_14px_28px_-22px_rgb(var(--ink)_/_0.64)] backdrop-blur ${styleClass}`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold">{toast.message}</p>
        <button
          type="button"
          onClick={() => onDismiss(toast.id)}
          aria-label="Dismiss toast"
          className="rounded-full border border-current/20 bg-transparent px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]"
        >
          Close
        </button>
      </div>
    </article>
  );
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((toastId) => {
    setToasts((prev) => prev.filter((item) => item.id !== toastId));
  }, []);

  const show = useCallback((message, options = {}) => {
    const nextMessage = String(message || "").trim();
    if (!nextMessage) return "";

    const nextToast = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      message: nextMessage,
      type: options.type || "info",
      durationMs:
        typeof options.durationMs === "number" && options.durationMs > 0
          ? options.durationMs
          : DEFAULT_DURATION_MS,
    };

    setToasts((prev) => [...prev, nextToast].slice(-4));
    return nextToast.id;
  }, []);

  const api = useMemo(
    () => ({
      show,
      success: (message, options = {}) =>
        show(message, { ...options, type: "success" }),
      error: (message, options = {}) =>
        show(message, { ...options, type: "error" }),
      warning: (message, options = {}) =>
        show(message, { ...options, type: "warning" }),
      info: (message, options = {}) =>
        show(message, { ...options, type: "info" }),
    }),
    [show]
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 top-3 z-[130] flex justify-center px-3 sm:justify-end"
        aria-label="Application toasts"
      >
        <div className="flex w-full max-w-sm flex-col gap-2 sm:w-[360px]">
          {toasts.map((toast) => (
            <ToastItem key={toast.id} toast={toast} onDismiss={dismiss} />
          ))}
        </div>
      </div>
    </ToastContext.Provider>
  );
}
