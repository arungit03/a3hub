import { formatNumber } from "../lib/format";

export default function AdminMetricCard({
  title,
  value,
  subtitle,
  tone = "default",
}) {
  const toneClasses =
    tone === "good"
      ? "border-emerald-200 bg-emerald-50/60"
      : tone === "warn"
      ? "border-amber-200 bg-amber-50/60"
      : tone === "danger"
      ? "border-rose-200 bg-rose-50/60"
      : "border-sky-200 bg-white";

  return (
    <article className={`rounded-2xl border p-4 shadow-sm ${toneClasses}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
        {title}
      </p>
      <p className="mt-2 text-2xl font-bold text-slate-900">
        {typeof value === "number" ? formatNumber(value) : value}
      </p>
      {subtitle ? <p className="mt-1 text-xs text-slate-500">{subtitle}</p> : null}
    </article>
  );
}
