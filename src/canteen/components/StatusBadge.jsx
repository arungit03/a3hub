import {
  getMenuStatusTone,
  getOrderStatusTone,
} from "../../../shared/utils/canteen.js";
import { formatStatusLabel } from "../../../shared/utils/format.js";

const TONE_CLASSES = {
  success: "bg-emerald-50 text-emerald-700",
  warning: "bg-amber-50 text-amber-700",
  danger: "bg-rose-50 text-rose-700",
  info: "bg-ocean/10 text-ocean",
  highlight: "bg-aurora/15 text-aurora",
  neutral: "bg-sand text-ink/60",
};

export function StatusBadge({ status, mode = "menu" }) {
  const tone =
    mode === "order" ? getOrderStatusTone(status) : getMenuStatusTone(status);

  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
        TONE_CLASSES[tone] || TONE_CLASSES.neutral
      }`}
    >
      {formatStatusLabel(status)}
    </span>
  );
}
