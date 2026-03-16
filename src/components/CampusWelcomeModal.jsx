const ROLE_OPTIONS = [
  { label: "Student", value: "student" },
  { label: "Staff", value: "staff" },
];

export default function CampusWelcomeModal({
  open,
  onClose,
  role = "student",
  onRoleChange,
  roleHint = "Staff or Student",
  continueLabel = "Continue",
}) {
  if (!open) return null;

  const canChangeRole = typeof onRoleChange === "function";
  const safeRole = role === "staff" ? "staff" : "student";

  return (
    <div
      className="ui-modal ui-modal--compact"
      role="dialog"
      aria-modal="true"
      aria-labelledby="campus-welcome-title"
    >
      <button
        type="button"
        aria-label="Close welcome modal"
        className="ui-modal__scrim"
        tabIndex={-1}
        onClick={onClose}
      />

      <div tabIndex={-1} className="ui-modal__panel w-full max-w-sm p-4">
        <div className="rounded-[1.6rem] border border-clay/35 bg-gradient-to-br from-cream via-sand to-mist p-5 shadow-float">
          <div className="flex items-start gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-ink/70">
                Campus Hub
              </p>
              <div className="mt-2 h-0.5 w-16 rounded-full bg-ink/20" />
              <h3 id="campus-welcome-title" className="mt-3 text-3xl font-bold leading-none text-ink">
                Welcome
              </h3>
            </div>
          </div>

          <p className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-ink/65">
            {roleHint}
          </p>

          <div className="mt-2 flex items-center gap-2" role="radiogroup" aria-label="Select role">
            {ROLE_OPTIONS.map((item) => {
              const isActive = safeRole === item.value;
              return (
                <button
                  key={item.value}
                  type="button"
                  role="radio"
                  aria-checked={isActive}
                  onClick={() => onRoleChange?.(item.value)}
                  disabled={!canChangeRole}
                  className={`flex-1 rounded-full border px-3 py-1.5 text-sm font-semibold transition ${
                    isActive
                      ? "border-clay/70 bg-gradient-to-r from-clay via-ocean to-rose text-ink shadow-sm"
                      : "border-ink/15 bg-white/85 text-ink/80"
                  } ${canChangeRole ? "hover:border-clay/65" : "cursor-default opacity-80"}`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>

          <div className="mt-5 flex items-center justify-between">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-ink/15 bg-white/85 px-3 py-1.5 text-xs font-semibold text-ink/80 transition hover:bg-white"
            >
              Close
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full bg-ink px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-white transition hover:opacity-90"
            >
              {continueLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
