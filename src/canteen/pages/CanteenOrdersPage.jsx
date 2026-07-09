import { useEffect, useMemo, useState } from "react";
import { AlarmClock } from "lucide-react";
import {
  formatCurrency,
  formatDateTime,
  formatToken,
} from "../../../shared/utils/format.js";
import { ORDER_STATUS_TRANSITIONS } from "../../../shared/utils/validation.js";
import { updateOrderStatus } from "../services/canteenService";
import { EmptyState } from "../components/EmptyState";
import { LiveIndicator } from "../components/LiveIndicator";
import { LoadingState } from "../components/LoadingState";
import { StatusBadge } from "../components/StatusBadge";
import { useOrders } from "../hooks/useOrders";

const HISTORY_LIMIT = 30;
const WAIT_WARNING_MINUTES = 10;

const HISTORY_FILTERS = [
  { value: "all", label: "All" },
  { value: "collected", label: "Collected" },
  { value: "cancelled", label: "Cancelled" },
];

const getMillis = (value) => {
  if (!value) return 0;
  if (typeof value?.toDate === "function") return value.toDate().getTime();
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

const getElapsedLabel = (createdAt, nowMs) => {
  const createdMs = getMillis(createdAt);
  if (!createdMs) return "";
  const minutes = Math.max(0, Math.round((nowMs - createdMs) / 60000));
  if (minutes < 1) return "Just now";
  if (minutes === 1) return "1 min ago";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return `${hours}h ${remainder}m ago`;
};

const getElapsedMinutes = (createdAt, nowMs) => {
  const createdMs = getMillis(createdAt);
  if (!createdMs) return 0;
  return Math.max(0, Math.round((nowMs - createdMs) / 60000));
};

export default function CanteenOrdersPage() {
  const [actionError, setActionError] = useState("");
  const [activeOrderId, setActiveOrderId] = useState("");
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [historyFilter, setHistoryFilter] = useState("all");
  const { grouped, loading, error } = useOrders();

  useEffect(() => {
    const intervalId = window.setInterval(() => setNowMs(Date.now()), 30000);
    return () => window.clearInterval(intervalId);
  }, []);

  const handleStatusUpdate = async (order, nextStatus) => {
    setActionError("");
    setActiveOrderId(order.id);
    try {
      await updateOrderStatus(order.id, nextStatus, order.status);
    } catch (updateError) {
      setActionError(updateError?.message || "Unable to update the order.");
    } finally {
      setActiveOrderId("");
    }
  };

  const historyOrders = useMemo(() => {
    const combined =
      historyFilter === "collected"
        ? grouped.collected
        : historyFilter === "cancelled"
          ? grouped.cancelled
          : [...grouped.collected, ...grouped.cancelled].sort((left, right) => {
              const leftMs = getMillis(left.createdAt);
              const rightMs = getMillis(right.createdAt);
              return rightMs - leftMs;
            });
    return combined.slice(0, HISTORY_LIMIT);
  }, [grouped, historyFilter]);

  if (loading) {
    return (
      <LoadingState
        title="Loading live orders"
        description="Listening for new orders and pickup status changes."
      />
    );
  }

  return (
    <div className="grid gap-5">
      <section className="flex flex-col gap-3 rounded-[28px] border border-clay/18 bg-white/95 p-6 shadow-[0_22px_48px_-38px_rgba(15,23,42,0.16)] sm:flex-row sm:items-center sm:justify-between">
        <div>
          <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-ocean">
            Orders queue
          </span>
          <h2 className="mt-2 text-2xl font-semibold text-ink">
            Manage incoming tokens
          </h2>
          <p className="mt-2 max-w-xl text-sm text-ink/65">
            Ready-made food is already prepared, so a new order just needs to be handed
            over. Mark it collected once the student picks it up.
          </p>
        </div>
        <LiveIndicator />
      </section>

      {error || actionError ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
          {error || actionError}
        </div>
      ) : null}

      <section className="grid gap-3">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink/55">
            Active queue
          </span>
          <span className="rounded-full bg-ocean/10 px-2 py-0.5 text-xs font-bold text-ocean">
            {grouped.placed.length}
          </span>
        </div>

        {grouped.placed.length === 0 ? (
          <EmptyState
            title="No orders waiting"
            description="New orders from students will land here in realtime."
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {grouped.placed.map((order) => {
              const elapsedMinutes = getElapsedMinutes(order.createdAt, nowMs);
              const isOverdue = elapsedMinutes >= WAIT_WARNING_MINUTES;
              const canAct = (ORDER_STATUS_TRANSITIONS[order.status] || []).length > 0;

              return (
                <article
                  key={order.id}
                  className={`overflow-hidden rounded-2xl border bg-white p-4 shadow-[0_16px_32px_-28px_rgba(15,23,42,0.25)] transition hover:-translate-y-0.5 hover:shadow-[0_20px_40px_-24px_rgba(15,23,42,0.32)] ${
                    isOverdue ? "border-rose-200" : "border-clay/18"
                  }`}
                >
                  <div className={`-mx-4 -mt-4 mb-3 h-1 ${isOverdue ? "bg-rose-400" : "bg-ocean"}`} />

                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink/50">
                        Token {formatToken(order.tokenNumber)}
                      </span>
                      <h3 className="mt-0.5 text-sm font-semibold text-ink">
                        {order.userName}
                      </h3>
                      <p className="mt-0.5 text-xs text-ink/50">
                        {formatDateTime(order.createdAt)}
                      </p>
                    </div>
                    <span
                      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold ${
                        isOverdue ? "bg-rose-50 text-rose-600" : "bg-sand text-ink/50"
                      }`}
                    >
                      <AlarmClock className="h-3 w-3" />
                      {getElapsedLabel(order.createdAt, nowMs)}
                    </span>
                  </div>

                  <div className="mt-3 grid gap-1.5 border-t border-clay/12 pt-3">
                    {order.items.map((item) => (
                      <div
                        key={`${order.id}-${item.menuItemId}`}
                        className="flex items-center justify-between text-xs text-ink/70"
                      >
                        <span>
                          {item.name} x{item.quantity}
                        </span>
                        <span className="font-semibold text-ink">
                          {formatCurrency(item.lineTotal || item.price * item.quantity)}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="mt-3 flex items-center justify-between border-t border-clay/12 pt-3 text-sm">
                    <span className="text-xs text-ink/50">Order ID: {order.id}</span>
                    <strong className="text-ink">{formatCurrency(order.totalAmount)}</strong>
                  </div>

                  {canAct ? (
                    <div className="mt-3 grid gap-2">
                      <button
                        type="button"
                        disabled={activeOrderId === order.id}
                        onClick={() => handleStatusUpdate(order, "collected")}
                        className="rounded-full bg-linear-to-r from-ocean to-aurora px-3 py-2 text-xs font-semibold text-white transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {activeOrderId === order.id ? "Updating..." : "Mark Collected"}
                      </button>
                      <button
                        type="button"
                        disabled={activeOrderId === order.id}
                        onClick={() => handleStatusUpdate(order, "cancelled")}
                        className="rounded-full border border-rose-200 bg-white px-3 py-2 text-xs font-semibold text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Cancel Order
                      </button>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="rounded-[28px] border border-clay/18 bg-white/95 p-6 shadow-[0_22px_48px_-38px_rgba(15,23,42,0.16)]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink/55">
              Order history
            </span>
            <h3 className="mt-1 text-lg font-semibold text-ink">
              Recently collected and cancelled tokens
            </h3>
          </div>
          <div className="flex gap-1.5 rounded-full border border-clay/18 bg-sand/50 p-1">
            {HISTORY_FILTERS.map((filterOption) => (
              <button
                key={filterOption.value}
                type="button"
                onClick={() => setHistoryFilter(filterOption.value)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                  historyFilter === filterOption.value
                    ? "bg-white text-ocean shadow-[0_8px_18px_-12px_rgba(15,23,42,0.3)]"
                    : "text-ink/55 hover:text-ink"
                }`}
              >
                {filterOption.label}
              </button>
            ))}
          </div>
        </div>

        {historyOrders.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              title="No history yet"
              description="Collected and cancelled orders will show up here."
            />
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse">
              <thead>
                <tr className="text-left text-xs font-semibold uppercase tracking-[0.08em] text-ink/50">
                  <th className="border-b border-clay/14 px-3 py-2.5">Token</th>
                  <th className="border-b border-clay/14 px-3 py-2.5">Student</th>
                  <th className="border-b border-clay/14 px-3 py-2.5">Placed</th>
                  <th className="border-b border-clay/14 px-3 py-2.5">Amount</th>
                  <th className="border-b border-clay/14 px-3 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody>
                {historyOrders.map((order) => (
                  <tr key={order.id} className="hover:bg-sand/40">
                    <td className="border-b border-clay/12 px-3 py-2.5 text-sm font-semibold text-ink">
                      {formatToken(order.tokenNumber)}
                    </td>
                    <td className="border-b border-clay/12 px-3 py-2.5 text-sm text-ink/75">
                      {order.userName}
                    </td>
                    <td className="border-b border-clay/12 px-3 py-2.5 text-xs text-ink/55">
                      {formatDateTime(order.createdAt)}
                    </td>
                    <td className="border-b border-clay/12 px-3 py-2.5 text-sm font-semibold text-ink">
                      {formatCurrency(order.totalAmount)}
                    </td>
                    <td className="border-b border-clay/12 px-3 py-2.5">
                      <StatusBadge status={order.status} mode="order" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
