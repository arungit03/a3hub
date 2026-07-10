import { NavLink } from "react-router-dom";

const getTabClassName = ({ isActive }) =>
  `rounded-full px-4 py-2 text-sm font-semibold transition ${
    isActive
      ? "bg-linear-to-r from-cocoa to-ocean text-white shadow-[0_10px_20px_-10px_rgb(var(--ocean)/0.65)]"
      : "bg-white/10 text-white/75 hover:bg-white/18 hover:text-white"
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
      <section className="relative overflow-hidden rounded-[1.8rem] border border-white/10 bg-linear-to-br from-[#240046] via-cocoa to-ocean p-5 text-white shadow-[0_28px_54px_-30px_rgb(var(--cocoa)/0.55)] sm:p-6">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.12] bg-[radial-gradient(circle_at_1px_1px,white_1px,transparent_0)] bg-size-[22px_22px]"
          aria-hidden="true"
        />
        <div className="pointer-events-none absolute -right-14 -top-10 h-44 w-44 rounded-full bg-aurora/25 blur-3xl" />
        <div className="pointer-events-none absolute -left-10 bottom-0 h-36 w-36 rounded-full bg-rose/20 blur-3xl" />

        <div className="relative space-y-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-3">
              {badge ? (
                <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-white/85">
                  <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5" aria-hidden="true">
                    <path
                      d="M4 6.5 11 3l7 3.5v8L11 18l-7-3.5v-8Z"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinejoin="round"
                    />
                    <path d="M4 6.5 11 10m0 0 7-3.5M11 10v8" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                  </svg>
                  {badge}
                </span>
              ) : null}
              <div>
                <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
                  {title}
                </h1>
                {subtitle ? (
                  <p className="mt-2 max-w-3xl text-sm text-white/75 sm:text-base">
                    {subtitle}
                  </p>
                ) : null}
              </div>
            </div>
            {actions ? <div className="flex flex-wrap gap-3">{actions}</div> : null}
          </div>

          {tabs.length > 0 ? (
            <div className="flex flex-wrap gap-2 border-t border-white/10 pt-4">
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
