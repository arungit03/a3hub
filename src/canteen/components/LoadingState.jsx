export function LoadingState({
  title = "Loading",
  description = "Please wait while the canteen console is preparing.",
}) {
  return (
    <div className="mx-auto grid max-w-lg gap-3 rounded-[28px] border border-clay/18 bg-white/95 p-8 text-center shadow-[0_22px_48px_-38px_rgba(15,23,42,0.16)]">
      <div className="mx-auto h-14 w-14 animate-spin rounded-full border-4 border-clay/25 border-t-ocean" />
      <h2 className="text-xl font-semibold text-ink">{title}</h2>
      <p className="text-sm text-ink/60">{description}</p>
    </div>
  );
}
