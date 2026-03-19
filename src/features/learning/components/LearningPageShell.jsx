import { NavLink } from "react-router-dom";

const getTabClassName = ({ isActive }) =>
  `rounded-full px-4 py-2 text-sm font-semibold transition ${
    isActive
      ? "bg-slate-900 text-white shadow-sm"
      : "bg-white/80 text-slate-600 hover:bg-white hover:text-slate-900"
  }`;

export default function LearningPageShell({
  badge = "Programming Learning Module",
  title,
  subtitle,
  tabs = [],
  actions = null,
  children,
}) {
  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-[1.8rem] border border-slate-200 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-700 p-5 text-white shadow-xl shadow-slate-900/20 sm:p-6">
        <div className="pointer-events-none absolute -right-14 -top-10 h-40 w-40 rounded-full bg-cyan-400/15 blur-3xl" />
        <div className="pointer-events-none absolute -left-10 bottom-0 h-36 w-36 rounded-full bg-emerald-300/15 blur-3xl" />

        <div className="relative space-y-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-3">
              {badge ? (
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-300">
                  {badge}
                </p>
              ) : null}
              <div>
                <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
                  {title}
                </h1>
                {subtitle ? (
                  <p className="mt-2 max-w-3xl text-sm text-slate-200 sm:text-base">
                    {subtitle}
                  </p>
                ) : null}
              </div>
            </div>
            {actions ? <div className="flex flex-wrap gap-3">{actions}</div> : null}
          </div>

          {tabs.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {tabs.map((tab) => (
                <NavLink key={tab.to} to={tab.to} end={tab.end} className={getTabClassName}>
                  {tab.label}
                </NavLink>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      {children}
    </div>
  );
}
