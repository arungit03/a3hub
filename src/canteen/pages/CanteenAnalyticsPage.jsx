import { formatCurrency } from "../../../shared/utils/format.js";
import { getLocalDateKey } from "../../../shared/utils/canteen.js";
import { EmptyState } from "../components/EmptyState";
import { LoadingState } from "../components/LoadingState";
import { StatCard } from "../components/StatCard";
import { useMenuManagement } from "../hooks/useMenuManagement";
import { useOrders } from "../hooks/useOrders";

export default function CanteenAnalyticsPage() {
  const { items, loading: menuLoading, error: menuError } = useMenuManagement();
  const { orders, grouped, loading: ordersLoading, error: ordersError } = useOrders();

  if (menuLoading || ordersLoading) {
    return (
      <LoadingState
        title="Loading analytics"
        description="Crunching stock, order totals, and demand signals."
      />
    );
  }

  const todayKey = getLocalDateKey();
  const todayOrders = orders.filter((order) => order.createdDateKey === todayKey);
  const collectedRevenue = grouped.collected.reduce(
    (sum, order) => sum + (Number(order.totalAmount) || 0),
    0
  );

  const topItemsMap = new Map();
  orders.forEach((order) => {
    order.items.forEach((item) => {
      const currentItem = topItemsMap.get(item.menuItemId) || {
        name: item.name,
        quantity: 0,
      };
      currentItem.quantity += Number(item.quantity) || 0;
      topItemsMap.set(item.menuItemId, currentItem);
    });
  });

  const topItems = [...topItemsMap.values()]
    .sort((left, right) => right.quantity - left.quantity)
    .slice(0, 5);

  return (
    <div className="ops-page-stack">
      <section className="ops-card">
        <span className="ops-eyebrow">Analytics snapshot</span>
        <h2>How the counter is performing</h2>
        <p className="ops-muted">
          This view helps the canteen team spot demand, cancellations, and top-moving
          items.
        </p>
      </section>

      <section className="ops-stat-grid">
        <StatCard
          label="Collected revenue"
          value={formatCurrency(collectedRevenue)}
          description="Revenue from collected orders."
        />
        <StatCard
          label="Placed orders"
          value={grouped.placed.length}
          description="Orders waiting to be handed over."
        />
        <StatCard
          label="Cancelled orders"
          value={grouped.cancelled.length}
          description="Orders cancelled after placement."
        />
        <StatCard
          label="Visible menu"
          value={items.filter((item) => item.visible).length}
          description="Items showing on the main A3 Hub site."
        />
      </section>

      {menuError || ordersError ? (
        <div className="ops-message ops-message-error">{menuError || ordersError}</div>
      ) : null}

      <section className="ops-two-col">
        <div className="ops-card">
          <div className="ops-section-head">
            <div>
              <span className="ops-eyebrow">Today</span>
              <h3>Orders since morning</h3>
            </div>
            <strong>{todayOrders.length}</strong>
          </div>

          {todayOrders.length === 0 ? (
            <EmptyState
              title="No orders today"
              description="As fresh orders arrive, this panel will reflect the latest daily volume."
            />
          ) : (
            <div className="ops-list">
              {todayOrders.slice(0, 6).map((order) => (
                <article key={order.id} className="ops-list-card">
                  <div>
                    <strong>{order.userName}</strong>
                    <p className="ops-muted">{order.items.length} item groups</p>
                  </div>
                  <strong>{formatCurrency(order.totalAmount)}</strong>
                </article>
              ))}
            </div>
          )}
        </div>

        <div className="ops-card">
          <div className="ops-section-head">
            <div>
              <span className="ops-eyebrow">Top movers</span>
              <h3>Most ordered items</h3>
            </div>
          </div>

          {topItems.length === 0 ? (
            <EmptyState
              title="No demand data yet"
              description="Top ordered items will appear after the first orders come in."
            />
          ) : (
            <div className="ops-list">
              {topItems.map((item) => (
                <article key={item.name} className="ops-list-card">
                  <div>
                    <strong>{item.name}</strong>
                    <p className="ops-muted">Across all completed and open orders</p>
                  </div>
                  <strong>{item.quantity} sold</strong>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
