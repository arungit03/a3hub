import {
  getMenuStatusTone,
  getOrderStatusTone,
} from "../../../shared/utils/canteen.js";
import { formatStatusLabel } from "../../../shared/utils/format.js";

export function StatusBadge({ status, mode = "menu" }) {
  const tone =
    mode === "order" ? getOrderStatusTone(status) : getMenuStatusTone(status);

  return <span className={`ops-badge ops-${tone}`}>{formatStatusLabel(status)}</span>;
}
