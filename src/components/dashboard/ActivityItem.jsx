const statusStyles = {
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  completed: "bg-sky-50 text-sky-700 border-sky-200",
};

export default function ActivityItem({
  title,
  subtitle,
  timeLabel,
  status = "pending",
}) {
  const statusClass = statusStyles[status] || statusStyles.pending;
  const statusLabel = status.charAt(0).toUpperCase() + status.slice(1);

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-slate-300 hover:shadow-[0_16px_30px_-24px_rgba(15,23,42,0.38)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">{title}</p>
          <p className="mt-1 text-xs text-slate-500">{subtitle}</p>
        </div>
        <span
          className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusClass}`}
        >
          {statusLabel}
        </span>
      </div>
      <p className="mt-3 text-xs text-slate-400">{timeLabel}</p>
    </article>
  );
}

