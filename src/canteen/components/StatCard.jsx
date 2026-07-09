const TONE_CLASSES = {
  ocean: "border-ocean/20 bg-ocean/8 text-ocean",
  aurora: "border-aurora/25 bg-aurora/10 text-aurora",
  sunset: "border-sunset/25 bg-sunset/10 text-sunset",
  rose: "border-rose-200 bg-rose-50 text-rose-700",
};

export function StatCard({ label, value, description, tone = "ocean", icon: Icon }) {
  const toneClass = TONE_CLASSES[tone] || TONE_CLASSES.ocean;

  return (
    <article className="rounded-[24px] border border-clay/16 bg-white/95 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
      <div className="flex items-center justify-between gap-2">
        <small className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink/55">
          {label}
        </small>
        {Icon ? (
          <span className={`flex h-8 w-8 items-center justify-center rounded-full border ${toneClass}`}>
            <Icon className="h-4 w-4" />
          </span>
        ) : null}
      </div>
      <strong className="mt-2 block text-2xl font-semibold text-ink">{value}</strong>
      <p className="mt-1 text-sm text-ink/60">{description}</p>
    </article>
  );
}
