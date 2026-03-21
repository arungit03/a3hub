import { NavLink } from "react-router-dom";

const navItems = [
  { to: "/canteen/dashboard", label: "Dashboard" },
  { to: "/canteen/menu", label: "Menu" },
  { to: "/canteen/orders", label: "Orders" },
  { to: "/canteen/analytics", label: "Analytics" },
];

export function CanteenSidebar() {
  return (
    <aside className="ops-sidebar">
      <div className="ops-brand">
        <span className="ops-brand-mark">CT</span>
        <div>
          <p>Canteen</p>
          <strong>A3 Hub Console</strong>
        </div>
      </div>

      <nav className="ops-nav">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `ops-nav-link ${isActive ? "ops-nav-link-active" : ""}`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
