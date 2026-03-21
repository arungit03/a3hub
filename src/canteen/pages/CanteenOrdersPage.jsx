import { useMemo, useState } from "react";
import {
  formatCurrency,
  formatDateTime,
  formatToken,
} from "../../../shared/utils/format.js";
import { updateOrderStatus } from "../services/canteenService";
import { EmptyState } from "../components/EmptyState";
import { LoadingState } from "../components/LoadingState";
import { StatusBadge } from "../components/StatusBadge";
import { useOrders } from "../hooks/useOrders";

export default function CanteenOrdersPage() {
  const [statusFilter, setStatusFilter] = useState("all");
  const [actionError, setActionError] = useState("");
  const [activeOrderId, setActiveOrderId] = useState("");
  const { orders, loading, error } = useOrders();

  const filteredOrders = useMemo(
    () =>
      statusFilter === "all"
        ? orders
        : orders.filter((order) => order.status === statusFilter),
    [orders, statusFilter]
  );

  const handleStatusUpdate = async (orderId, nextStatus) => {
    setActionError("");
    setActiveOrderId(orderId);
    try {
      await updateOrderStatus(orderId, nextStatus);
    } catch (updateError) {
      setActionError(updateError?.message || "Unable to update the order.");
    } finally {
      setActiveOrderId("");
    }
  };

  if (loading) {
    return (
      <LoadingState
        title="Loading live orders"
        description="Listening for new orders and pickup status changes."
      />
    );
  }

  return (
    <div className="ops-page-stack">
      <section className="ops-card">
        <div className="ops-section-head">
          <div>
            <span className="ops-eyebrow">Orders queue</span>
            <h2>Manage incoming tokens</h2>
          </div>

          <select
            className="ops-input ops-filter"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="all">All statuses</option>
            <option value="placed">Placed</option>
            <option value="collected">Collected</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </section>

      {error || actionError ? (
        <div className="ops-message ops-message-error">{error || actionError}</div>
      ) : null}

      {filteredOrders.length === 0 ? (
        <EmptyState
          title="No orders in this view"
          description="Adjust the filter or wait for incoming orders from the main A3 Hub site."
        />
      ) : (
        <div className="ops-order-grid">
          {filteredOrders.map((order) => (
            <article key={order.id} className="ops-card ops-order-card">
              <div className="ops-section-head">
                <div>
                  <span className="ops-eyebrow">Token {formatToken(order.tokenNumber)}</span>
                  <h3>{order.userName}</h3>
                  <p className="ops-muted">{formatDateTime(order.createdAt)}</p>
                </div>
                <StatusBadge status={order.status} mode="order" />
              </div>

              <div className="ops-order-lines">
                {order.items.map((item) => (
                  <div key={`${order.id}-${item.menuItemId}`} className="ops-order-line">
                    <span>
                      {item.name} x{item.quantity}
                    </span>
                    <strong>{formatCurrency(item.lineTotal || item.price * item.quantity)}</strong>
                  </div>
                ))}
              </div>

              <div className="ops-section-head">
                <div className="ops-muted">Order ID: {order.id}</div>
                <strong>{formatCurrency(order.totalAmount)}</strong>
              </div>

              {order.status === "placed" ? (
                <div className="ops-inline">
                  <button
                    className="ops-button ops-button-primary"
                    type="button"
                    disabled={activeOrderId === order.id}
                    onClick={() => handleStatusUpdate(order.id, "collected")}
                  >
                    {activeOrderId === order.id ? "Updating..." : "Mark Collected"}
                  </button>
                  <button
                    className="ghost-button ghost-danger"
                    type="button"
                    disabled={activeOrderId === order.id}
                    onClick={() => handleStatusUpdate(order.id, "cancelled")}
                  >
                    Cancel Order
                  </button>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
