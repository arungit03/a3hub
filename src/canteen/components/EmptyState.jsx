export function EmptyState({ title, description, action = null }) {
  return (
    <div className="mx-auto grid max-w-lg gap-3 rounded-[28px] border border-clay/18 bg-white/95 p-8 text-center shadow-[0_22px_48px_-38px_rgba(15,23,42,0.16)]">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-linear-to-br from-ocean to-aurora text-lg font-extrabold tracking-tight text-white">
        A3
      </div>
      <h2 className="text-xl font-semibold text-ink">{title}</h2>
      <p className="text-sm text-ink/60">{description}</p>
      {action}
    </div>
  );
}
