import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { ORDER_STATUS_SEQUENCE } from "../../shared/types/canteen.js";
import { formatStatusLabel } from "../../shared/utils/format.js";

const STEP_ICONS = {
  placed: Clock,
  collected: CheckCircle2,
};

const STEP_LABELS = {
  placed: "Placed",
  collected: "Collected",
};

export function OrderProgressStepper({ status, compact = false }) {
  const safeStatus = String(status || "").toLowerCase();

  if (safeStatus === "cancelled") {
    return (
      <div className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-sm font-semibold text-rose-700">
        <XCircle className="h-4 w-4" />
        Cancelled
      </div>
    );
  }

  const currentIndex = Math.max(0, ORDER_STATUS_SEQUENCE.indexOf(safeStatus));

  if (compact) {
    const Icon = STEP_ICONS[safeStatus] || Clock;
    return (
      <div className="inline-flex items-center gap-2 rounded-full border border-ocean/30 bg-ocean/10 px-3 py-1.5 text-sm font-semibold text-ocean">
        <Icon className="h-4 w-4" />
        {formatStatusLabel(safeStatus)}
      </div>
    );
  }

  return (
    <div className="flex items-center">
      {ORDER_STATUS_SEQUENCE.map((step, index) => {
        const Icon = STEP_ICONS[step];
        const isDone = index < currentIndex;
        const isCurrent = index === currentIndex;
        const isUpcoming = index > currentIndex;

        return (
          <div key={step} className="flex flex-1 items-center last:flex-none">
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={`flex h-9 w-9 items-center justify-center rounded-full border-2 transition ${
                  isDone
                    ? "border-ocean bg-ocean text-white"
                    : isCurrent
                      ? "border-aurora bg-aurora/15 text-aurora"
                      : "border-clay/30 bg-white text-ink/35"
                }`}
              >
                <Icon className="h-4 w-4" />
              </div>
              <span
                className={`text-[11px] font-semibold uppercase tracking-[0.08em] ${
                  isUpcoming ? "text-ink/40" : "text-ink/75"
                }`}
              >
                {STEP_LABELS[step]}
              </span>
            </div>

            {index < ORDER_STATUS_SEQUENCE.length - 1 ? (
              <div
                className={`mx-2 mb-5 h-0.5 flex-1 rounded-full ${
                  isDone ? "bg-ocean" : "bg-clay/25"
                }`}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
