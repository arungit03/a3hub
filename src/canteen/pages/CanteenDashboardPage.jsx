import { Package, PackageX, ShoppingBag, TriangleAlert } from "lucide-react";
import { getLocalDateKey } from "../../../shared/utils/canteen.js";
import { EmptyState } from "../components/EmptyState";
import { LiveIndicator } from "../components/LiveIndicator";
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
    <div className="grid gap-5">
      <section className="flex flex-col gap-3 rounded-[28px] border border-clay/18 bg-white/95 p-6 shadow-[0_22px_48px_-38px_rgba(15,23,42,0.16)] sm:flex-row sm:items-center sm:justify-between">
        <div>
          <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-ocean">
            Live overview
          </span>
          <h2 className="mt-2 text-2xl font-semibold text-ink">
            Counter operations at a glance
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-ink/65">
            Track ready-made stock, spot low inventory quickly, and watch today&apos;s
            pickup load without opening multiple screens.
          </p>
        </div>
        <LiveIndicator />
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total items"
          value={totalItems}
          description="All visible and hidden menu records."
          tone="ocean"
          icon={Package}
        />
        <StatCard
          label="Available now"
          value={availableItems}
          description="Items users can order immediately."
          tone="aurora"
          icon={ShoppingBag}
        />
        <StatCard
          label="Sold out"
          value={soldOutItems}
          description="Items that need restocking or republishing."
          tone="rose"
          icon={PackageX}
        />
        <StatCard
          label="Orders today"
          value={todayOrders}
          description="Placed orders since today started."
          tone="sunset"
          icon={TriangleAlert}
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
                Low stock
              </span>
              <h3 className="mt-1 text-lg font-semibold text-ink">
                Items needing attention
              </h3>
            </div>
          </div>

          {lowStockItems.length === 0 ? (
            <div className="mt-4">
              <EmptyState
                title="No low-stock items"
                description="Everything currently visible has healthy stock."
              />
            </div>
          ) : (
            <div className="mt-4 grid gap-3">
              {lowStockItems.map((item) => (
                <article
                  key={item.id}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-clay/16 bg-sand/50 p-4"
                >
                  <div>
                    <strong className="text-sm text-ink">{item.name}</strong>
                    <p className="mt-0.5 text-xs text-ink/55">{item.category}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={item.status} />
                    <strong className="text-sm text-ink">{item.quantity} left</strong>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-[28px] border border-clay/18 bg-white/95 p-6 shadow-[0_22px_48px_-38px_rgba(15,23,42,0.16)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-ocean">
                Incoming orders
              </span>
              <h3 className="mt-1 text-lg font-semibold text-ink">Latest tokens</h3>
            </div>
          </div>

          {orders.length === 0 ? (
            <div className="mt-4">
              <EmptyState
                title="No orders yet"
                description="Incoming orders will appear here in realtime."
              />
            </div>
          ) : (
            <div className="mt-4 grid gap-3">
              {orders.slice(0, 5).map((order) => (
                <article
                  key={order.id}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-clay/16 bg-sand/50 p-4"
                >
                  <div>
                    <strong className="text-sm text-ink">
                      Token {order.tokenNumber || "Pending"}
                    </strong>
                    <p className="mt-0.5 text-xs text-ink/55">{order.userName}</p>
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
