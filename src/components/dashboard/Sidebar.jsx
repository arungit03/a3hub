import { useEffect } from "react";

function SidebarItem({ item, isActive, onNavigate }) {
  const baseClasses =
    "group flex w-full items-center gap-3.5 rounded-2xl px-3.5 py-3 text-left text-sm font-medium transition";
  const activeClasses =
    "bg-white/14 text-white shadow-[0_10px_30px_-20px_rgba(255,255,255,0.85)]";
  const idleClasses = "text-slate-200/90 hover:bg-white/10 hover:text-white";

  return (
    <button
      type="button"
      onClick={() => onNavigate(item)}
      className={`${baseClasses} ${isActive ? activeClasses : idleClasses}`}
      aria-current={isActive ? "page" : undefined}
    >
      <span
        className={`inline-flex h-9 w-9 items-center justify-center rounded-xl border text-[12px] transition ${
          isActive
            ? "border-white/20 bg-white/20 text-white"
            : "border-white/15 bg-white/5 text-slate-200/90 group-hover:border-white/25 group-hover:bg-white/15 group-hover:text-white"
        }`}
        aria-hidden="true"
      >
        {item.icon}
      </span>
      <span className="truncate">{item.label}</span>
    </button>
  );
}

export default function Sidebar({
  open,
  onClose,
  roleLabel,
  sections,
  bottomItems,
  activeItemId,
  onNavigate,
}) {
  useEffect(() => {
    if (!open) return undefined;

    const handleEscape = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [onClose, open]);

  return (
    <>
      <button
        type="button"
        className={`fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-[1px] transition lg:hidden ${
          open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={onClose}
        aria-hidden={!open}
      />

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[290px] max-w-[88vw] flex-col bg-[#0B1F3A] p-5 text-white shadow-2xl transition-transform duration-300 lg:static lg:z-10 lg:w-72 lg:max-w-none lg:translate-x-0 lg:shadow-none ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
        aria-label="Sidebar"
      >
        <div className="relative mb-6 flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-2xl font-semibold tracking-tight">A3 Hub</h1>
          </div>
          <button
            type="button"
            className="absolute right-0 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-xl border border-white/15 bg-white/5 text-slate-200 transition hover:bg-white/10 lg:hidden"
            onClick={onClose}
            aria-label="Close sidebar"
          >
            ✕
          </button>
        </div>

        <div className="mb-5 rounded-2xl border border-white/15 bg-white/[0.08] px-4 py-3.5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-300">
              Logged in as
            </p>
            <span className="inline-flex items-center rounded-full border border-white/25 bg-white/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-100">
              {roleLabel}
            </span>
          </div>
        </div>

        <nav className="min-h-0 flex-1 overflow-y-auto pr-1">
          <div className="space-y-5.5">
            {sections.map((section) => (
              <section key={section.title}>
                <p className="mb-2.5 px-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                  {section.title}
                </p>
                <div className="space-y-2">
                  {section.items.map((item) => (
                    <SidebarItem
                      key={item.id}
                      item={item}
                      isActive={activeItemId === item.id}
                      onNavigate={onNavigate}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </nav>

        <div className="mt-6 shrink-0 space-y-2.5 border-t border-white/10 pt-4">
          {bottomItems.map((item) => (
            <SidebarItem
              key={item.id}
              item={item}
              isActive={activeItemId === item.id}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      </aside>
    </>
  );
}
