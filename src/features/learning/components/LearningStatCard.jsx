export default function LearningStatCard({
  label,
  value,
  helper = "",
  tone = "default",
}) {
  const toneClass =
    tone === "success"
      ? "border-emerald-200 bg-emerald-50"
      : tone === "info"
      ? "border-sky-200 bg-sky-50"
      : "border-slate-200 bg-white";

  return (
    <article className={`rounded-2xl border p-4 shadow-sm ${toneClass}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>
      {helper ? <p className="mt-1 text-sm text-slate-600">{helper}</p> : null}
    </article>
  );
}
