const roleStyles = {
  staff: "bg-sky-50 text-sky-700 border-sky-200",
  student: "bg-emerald-50 text-emerald-700 border-emerald-200",
  parent: "bg-indigo-50 text-indigo-700 border-indigo-200",
  system: "bg-slate-100 text-slate-700 border-slate-200",
};

export default function NotificationItem({
  message,
  role = "system",
  timeLabel,
}) {
  const roleClass = roleStyles[role] || roleStyles.system;
  const roleLabel = role.charAt(0).toUpperCase() + role.slice(1);

  return (
    <article className="relative pl-7">
      <span
        className="absolute left-[6px] top-2 h-2.5 w-2.5 rounded-full bg-sky-500"
        aria-hidden="true"
      />
      <div className="rounded-2xl border border-slate-200 bg-white p-3">
        <p className="text-sm font-medium text-slate-900">{message}</p>
        <div className="mt-2 flex items-center justify-between gap-2">
          <span
            className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] ${roleClass}`}
          >
            {roleLabel}
          </span>
          <p className="text-[11px] text-slate-400">{timeLabel}</p>
        </div>
      </div>
    </article>
  );
}

