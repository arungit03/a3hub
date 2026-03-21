import { getLocalDateKey } from "../../../shared/utils/canteen.js";
import { EmptyState } from "../components/EmptyState";
import { LoadingState } from "../components/LoadingState";
import { StatCard } from "../components/StatCard";
import { StatusBadge } from "../components/StatusBadge";
import { useMenuManagement } from "../hooks/useMenuManagement";
import { useOrders } from "../hooks/useOrders";

export default function CanteenDashboardPage() {
  const { items, loading: menuLoading, error: menuError } = useMenuManagement();
  const { orders, loading: ordersLoading, error: ordersError } = useOrders();

  if (menuLoading || ordersLoading) {
    return (
      <LoadingState
        title="Loading operations dashboard"
        description="Syncing menu items, low stock alerts, and live order flow."
      />
    );
  }

  const todayKey = getLocalDateKey();
  const totalItems = items.length;
  const availableItems = items.filter((item) => item.status === "available").length;
  const soldOutItems = items.filter((item) => item.status === "sold_out").length;
  const todayOrders = orders.filter((order) => order.createdDateKey === todayKey).length;
  const lowStockItems = items.filter(
    (item) => item.visible && item.quantity > 0 && item.quantity <= 5
  );

  return (
    <div className="ops-page-stack">
      <section className="ops-card">
        <span className="ops-eyebrow">Live overview</span>
        <h2>Counter operations at a glance</h2>
        <p className="ops-muted">
          Track ready-made stock, spot low inventory quickly, and watch today&apos;s
          pickup load without opening multiple screens.
        </p>
      </section>

      <section className="ops-stat-grid">
        <StatCard
          label="Total items"
          value={totalItems}
          description="All visible and hidden menu records."
        />
        <StatCard
          label="Available now"
          value={availableItems}
          description="Items users can order immediately."
        />
        <StatCard
          label="Sold out"
          value={soldOutItems}
          description="Items that need restocking or republishing."
        />
        <StatCard
          label="Orders today"
          value={todayOrders}
          description="Placed orders since today started."
        />
      </section>

      {menuError || ordersError ? (
        <div className="ops-message ops-message-error">{menuError || ordersError}</div>
      ) : null}

      <section className="ops-two-col">
        <div className="ops-card">
          <div className="ops-section-head">
            <div>
              <span className="ops-eyebrow">Low stock</span>
              <h3>Items needing attention</h3>
            </div>
          </div>

          {lowStockItems.length === 0 ? (
            <EmptyState
              title="No low-stock items"
              description="Everything currently visible has healthy stock."
            />
          ) : (
            <div className="ops-list">
              {lowStockItems.map((item) => (
                <article key={item.id} className="ops-list-card">
                  <div>
                    <strong>{item.name}</strong>
                    <p className="ops-muted">{item.category}</p>
                  </div>
                  <div className="ops-inline">
                    <StatusBadge status={item.status} />
                    <strong>{item.quantity} left</strong>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>

        <div className="ops-card">
          <div className="ops-section-head">
            <div>
              <span className="ops-eyebrow">Incoming orders</span>
              <h3>Latest tokens</h3>
            </div>
          </div>

          {orders.length === 0 ? (
            <EmptyState
              title="No orders yet"
              description="Incoming orders will appear here in realtime."
            />
          ) : (
            <div className="ops-list">
              {orders.slice(0, 5).map((order) => (
                <article key={order.id} className="ops-order-preview">
                  <div>
                    <strong>Token {order.tokenNumber || "Pending"}</strong>
                    <p className="ops-muted">{order.userName}</p>
                  </div>
                  <StatusBadge status={order.status} mode="order" />
                </article>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
