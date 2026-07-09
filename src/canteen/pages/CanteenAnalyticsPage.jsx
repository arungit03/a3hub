import { Ban, Clock, IndianRupee, UtensilsCrossed } from "lucide-react";
import { formatCurrency } from "../../../shared/utils/format.js";
import { getLocalDateKey } from "../../../shared/utils/canteen.js";
import { EmptyState } from "../components/EmptyState";
import { LiveIndicator } from "../components/LiveIndicator";
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
    <div className="grid gap-5">
      <section className="flex flex-col gap-3 rounded-[28px] border border-clay/18 bg-white/95 p-6 shadow-[0_22px_48px_-38px_rgba(15,23,42,0.16)] sm:flex-row sm:items-center sm:justify-between">
        <div>
          <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-ocean">
            Analytics snapshot
          </span>
          <h2 className="mt-2 text-2xl font-semibold text-ink">
            How the counter is performing
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-ink/65">
            This view helps the canteen team spot demand, cancellations, and top-moving
            items.
          </p>
        </div>
        <LiveIndicator />
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Collected revenue"
          value={formatCurrency(collectedRevenue)}
          description="Revenue from collected orders."
          tone="ocean"
          icon={IndianRupee}
        />
        <StatCard
          label="Placed orders"
          value={grouped.placed.length}
          description="Orders waiting to be collected."
          tone="sunset"
          icon={Clock}
        />
        <StatCard
          label="Cancelled orders"
          value={grouped.cancelled.length}
          description="Orders cancelled after placement."
          tone="rose"
          icon={Ban}
        />
        <StatCard
          label="Visible menu"
          value={items.filter((item) => item.visible).length}
          description="Items showing on the main A3 Hub site."
          tone="ocean"
          icon={UtensilsCrossed}
        />
      </section>

      {menuError || ordersError ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
          {menuError || ordersError}
        </div>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-[28px] border border-clay/18 bg-white/95 p-6 shadow-[0_22px_48px_-38px_rgba(15,23,42,0.16)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-ocean">
                Today
              </span>
              <h3 className="mt-1 text-lg font-semibold text-ink">
                Orders since morning
              </h3>
            </div>
            <strong className="text-lg text-ink">{todayOrders.length}</strong>
          </div>

          {todayOrders.length === 0 ? (
            <div className="mt-4">
              <EmptyState
                title="No orders today"
                description="As fresh orders arrive, this panel will reflect the latest daily volume."
              />
            </div>
          ) : (
            <div className="mt-4 grid gap-3">
              {todayOrders.slice(0, 6).map((order) => (
                <article
                  key={order.id}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-clay/16 bg-sand/50 p-4"
                >
                  <div>
                    <strong className="text-sm text-ink">{order.userName}</strong>
                    <p className="mt-0.5 text-xs text-ink/55">
                      {order.items.length} item groups
                    </p>
                  </div>
                  <strong className="text-sm text-ink">
                    {formatCurrency(order.totalAmount)}
                  </strong>
                </article>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-[28px] border border-clay/18 bg-white/95 p-6 shadow-[0_22px_48px_-38px_rgba(15,23,42,0.16)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-ocean">
                Top movers
              </span>
              <h3 className="mt-1 text-lg font-semibold text-ink">
                Most ordered items
              </h3>
            </div>
          </div>

          {topItems.length === 0 ? (
            <div className="mt-4">
              <EmptyState
                title="No demand data yet"
                description="Top ordered items will appear after the first orders come in."
              />
            </div>
          ) : (
            <div className="mt-4 grid gap-3">
              {topItems.map((item) => (
                <article
                  key={item.name}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-clay/16 bg-sand/50 p-4"
                >
                  <div>
                    <strong className="text-sm text-ink">{item.name}</strong>
                    <p className="mt-0.5 text-xs text-ink/55">
                      Across all completed and open orders
                    </p>
                  </div>
                  <strong className="text-sm text-ink">{item.quantity} sold</strong>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
