import NotificationCenter from "../NotificationCenter";
import { isFeatureEnabled } from "../../config/features";

const iconProps = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: "1.9",
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": "true",
};

export default function Navbar({
  userName,
  roleLabel,
  avatarLetter,
  searchTerm,
  onSearchChange,
  onMenuToggle,
  onProfileClick,
}) {
  const notificationsEnabled = isFeatureEnabled("notifications");

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/92 backdrop-blur">
      <div className="flex items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <button
          type="button"
          onClick={onMenuToggle}
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:border-slate-300 hover:text-slate-900 lg:hidden"
          aria-label="Open sidebar"
        >
          <svg {...iconProps}>
            <path d="M3.5 7h17M3.5 12h17M3.5 17h17" />
          </svg>
        </button>

        <label className="relative flex-1">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
            <svg {...iconProps}>
              <circle cx="11" cy="11" r="6.5" />
              <path d="m16 16 4 4" />
            </svg>
          </span>
          <input
            type="search"
            value={searchTerm}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search students, subjects, notices..."
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-9 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 transition focus:border-sky-300 focus:bg-white focus:outline-none"
          />
        </label>

        {notificationsEnabled ? (
          <NotificationCenter
            inlineTrigger
            triggerClassName="h-11 w-11 rounded-2xl shadow-sm"
          />
        ) : null}

        <button
          type="button"
          onClick={onProfileClick}
          className="hidden items-center gap-3 rounded-[1.35rem] border border-slate-200/90 bg-slate-50/90 px-3.5 py-2.5 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] transition hover:border-slate-300 hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 sm:flex"
          aria-label="Open profile page"
        >
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-900 text-[15px] font-semibold text-white">
            {avatarLetter}
          </div>
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold leading-none text-slate-900">
              {userName}
            </p>
            <span className="mt-1 inline-flex rounded-full border border-slate-300 bg-slate-100 px-2.5 py-0.5 text-xs font-medium leading-none text-slate-700">
              {roleLabel}
            </span>
          </div>
        </button>
      </div>
    </header>
  );
}
