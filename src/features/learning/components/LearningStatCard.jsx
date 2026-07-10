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
      ? "border-ocean/25 bg-ocean/10"
      : "border-clay/50 bg-cream";

  return (
    <article className={`rounded-2xl border p-4 shadow-sm ${toneClass}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink/55">
        {label}
      </p>
      <p className="mt-2 text-2xl font-bold text-ink">{value}</p>
      {helper ? <p className="mt-1 text-sm text-ink/65">{helper}</p> : null}
    </article>
  );
}
