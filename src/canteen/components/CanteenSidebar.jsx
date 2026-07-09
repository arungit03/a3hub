import { NavLink } from "react-router-dom";
import { BarChart3, ClipboardList, LayoutDashboard, UtensilsCrossed } from "lucide-react";

const navItems = [
  { to: "/canteen/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/canteen/menu", label: "Menu", icon: UtensilsCrossed },
  { to: "/canteen/orders", label: "Orders", icon: ClipboardList },
  { to: "/canteen/analytics", label: "Analytics", icon: BarChart3 },
];

export function CanteenSidebar() {
  return (
    <aside className="border-b border-clay/18 bg-white/80 p-5 lg:border-b-0 lg:border-r lg:p-6">
      <div className="mb-6 flex items-center gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-linear-to-br from-ocean to-aurora text-lg font-extrabold tracking-tight text-white">
          CT
        </span>
        <div>
          <p className="text-xs text-ink/55">Canteen</p>
          <strong className="text-sm text-ink">A3 Hub Console</strong>
        </div>
      </div>

      <nav className="grid gap-1.5">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold transition ${
                  isActive
                    ? "bg-linear-to-r from-ocean to-aurora text-white shadow-[0_16px_34px_-26px_rgba(123,44,191,0.6)]"
                    : "text-ink/65 hover:bg-sand/70 hover:text-ink"
                }`
              }
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          );
        })}
      </nav>
    </aside>
  );
}
