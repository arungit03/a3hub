import { useEffect, useId, useMemo, useState } from "react";

const badgeToneClasses = {
  green: "bg-emerald-50 text-emerald-700 border-emerald-200",
  blue: "bg-sky-50 text-sky-700 border-sky-200",
  orange: "bg-amber-50 text-amber-700 border-amber-200",
  purple: "bg-indigo-50 text-indigo-700 border-indigo-200",
};

export default function StatCard({
  icon,
  title,
  value,
  badgeText,
  badgeTone = "blue",
  showCircularProgress = false,
  progressValue = 0,
  onClick,
}) {
  const badgeClass = badgeToneClasses[badgeTone] || badgeToneClasses.blue;
  const safeProgress = useMemo(() => {
    const parsed = Number(progressValue);
    if (!Number.isFinite(parsed)) return 0;
    return Math.min(100, Math.max(0, Math.round(parsed)));
  }, [progressValue]);
  const [animatedProgress, setAnimatedProgress] = useState(
    showCircularProgress ? 0 : safeProgress
  );

  useEffect(() => {
    if (!showCircularProgress) return undefined;

    let frameId = 0;
    let startTime = 0;
    const durationMs = 900;

    const animate = (timestamp) => {
      if (!startTime) startTime = timestamp;
      const elapsed = timestamp - startTime;
      const progress = Math.min(elapsed / durationMs, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setAnimatedProgress(Math.round(safeProgress * eased));

      if (progress < 1) {
        frameId = window.requestAnimationFrame(animate);
      }
    };

    frameId = window.requestAnimationFrame(animate);
    return () => {
      if (frameId) window.cancelAnimationFrame(frameId);
    };
  }, [safeProgress, showCircularProgress]);

  const ringRadius = 30;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringOffset =
    ringCircumference - (animatedProgress / 100) * ringCircumference;
  const displayValue = showCircularProgress ? `${animatedProgress}%` : value;
  const gradientId = useId();
  const progressLabel =
    safeProgress >= 80
      ? "Excellent"
      : safeProgress >= 60
      ? "Good"
      : safeProgress >= 40
      ? "Average"
      : "Needs focus";
  const circularCardClass = showCircularProgress
    ? "bg-[linear-gradient(140deg,#ffffff_0%,#f8fbff_62%,#f2f8ff_100%)]"
    : "bg-white";
  const cardClassName = `rounded-3xl border border-slate-200 p-5 shadow-[0_20px_40px_-28px_rgba(15,23,42,0.4)] transition hover:-translate-y-1 hover:shadow-[0_22px_44px_-24px_rgba(59,130,246,0.28)] ${circularCardClass}`;
  const content = (
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-sm font-medium text-slate-500">{title}</p>
        <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
          {displayValue}
        </p>
        {showCircularProgress ? (
          <p className="mt-1 text-xs font-medium text-slate-500">
            {progressLabel}
          </p>
        ) : null}
        <span
          className={`mt-3 inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${badgeClass}`}
        >
          {badgeText}
        </span>
      </div>
      {showCircularProgress ? (
        <span className="relative inline-flex h-24 w-24 items-center justify-center rounded-full border border-slate-200/90 bg-white shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_18px_30px_-24px_rgba(37,99,235,0.55)]">
          <svg
            viewBox="0 0 96 96"
            className="-rotate-90 h-20 w-20"
            aria-hidden="true"
          >
            <defs>
              <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#38bdf8" />
                <stop offset="100%" stopColor="#2563eb" />
              </linearGradient>
            </defs>
            <circle
              cx="48"
              cy="48"
              r={ringRadius}
              className="stroke-slate-200/90"
              strokeWidth="8"
              fill="none"
            />
            <circle
              cx="48"
              cy="48"
              r={ringRadius}
              stroke={`url(#${gradientId})`}
              strokeWidth="8"
              strokeLinecap="round"
              fill="none"
              style={{
                strokeDasharray: ringCircumference,
                strokeDashoffset: ringOffset,
              }}
            />
          </svg>
          <span className="absolute grid justify-items-center leading-none">
            <span className="text-base font-bold text-slate-800">
              {animatedProgress}%
            </span>
            <span className="mt-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-400">
              Present
            </span>
          </span>
        </span>
      ) : (
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-xl text-slate-700">
          {icon}
        </span>
      )}
    </div>
  );

  if (typeof onClick === "function") {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`${cardClassName} w-full cursor-pointer text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-300`}
      >
        {content}
      </button>
    );
  }

  return <article className={cardClassName}>{content}</article>;
}
