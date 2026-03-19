import { useMemo, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  Activity,
  BookOpen,
  ClipboardCheck,
  LayoutDashboard,
  ListChecks,
  MonitorPlay,
  Megaphone,
  Menu,
  Settings,
  UserCheck,
  Users,
  X,
} from "lucide-react";
import { useAuth } from "../../state/auth";

const NAV_ITEMS = [
  { to: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/admin/users", label: "Users", icon: Users },
  { to: "/admin/academics", label: "Academics", icon: BookOpen },
  { to: "/admin/tests", label: "Tests", icon: ClipboardCheck },
  { to: "/admin/learning", label: "Code learning", icon: MonitorPlay },
  { to: "/admin/notices", label: "Notices", icon: Megaphone },
  { to: "/admin/staff-requests", label: "Staff Requests", icon: UserCheck },
  { to: "/admin/analytics", label: "Analytics", icon: Activity },
  { to: "/admin/settings", label: "Settings", icon: Settings },
  { to: "/admin/audit-logs", label: "Audit Logs", icon: ListChecks },
];

const getNavClassName = ({ isActive }) =>
  `flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold transition ${
    isActive
      ? "bg-blue-600 text-white shadow-sm"
      : "text-slate-700 hover:bg-slate-100 hover:text-slate-900"
  }`;

function AdminSidebar({ onItemClick }) {
  return (
    <nav className="space-y-1">
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.to}
            to={item.to}
            className={getNavClassName}
            onClick={onItemClick}
          >
            <Icon size={16} />
            <span>{item.label}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}

export default function AdminLayout() {
  const navigate = useNavigate();
  const { user, profile, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const adminName = useMemo(() => {
    const base = String(profile?.name || user?.displayName || user?.email || "Admin")
      .trim()
      .replace(/@.*/, "");
    return base || "Admin";
  }, [profile?.name, user?.displayName, user?.email]);

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await logout();
      navigate("/", { replace: true });
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <div className="flex min-h-screen">
        <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-white px-4 py-5 lg:block">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
            A3 Hub
          </p>
          <h1 className="mt-1 text-xl font-bold text-slate-900">Admin Control</h1>
          <p className="mt-1 text-xs text-slate-500">Manage users and modules</p>
          <div className="mt-6">
            <AdminSidebar />
          </div>
        </aside>

        {sidebarOpen ? (
          <div className="fixed inset-0 z-40 lg:hidden">
            <button
              type="button"
              aria-label="Close sidebar"
              className="absolute inset-0 bg-slate-900/35"
              onClick={() => setSidebarOpen(false)}
            />
            <aside className="absolute left-0 top-0 h-full w-72 border-r border-slate-200 bg-white px-4 py-5 shadow-lg">
              <div className="mb-6 flex items-center justify-between">
                <h2 className="text-lg font-bold text-slate-900">Admin Menu</h2>
                <button
                  type="button"
                  className="rounded-lg border border-slate-200 p-2 text-slate-700"
                  onClick={() => setSidebarOpen(false)}
                >
                  <X size={18} />
                </button>
              </div>
              <AdminSidebar onItemClick={() => setSidebarOpen(false)} />
            </aside>
          </div>
        ) : null}

        <div className="flex min-h-screen flex-1 flex-col">
          <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur sm:px-6">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className="inline-flex rounded-lg border border-slate-200 p-2 text-slate-700 lg:hidden"
                  onClick={() => setSidebarOpen(true)}
                  aria-label="Open sidebar"
                >
                  <Menu size={18} />
                </button>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                    Admin Panel
                  </p>
                  <p className="text-sm font-semibold text-slate-900">Welcome, {adminName}</p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleLogout}
                disabled={loggingOut}
                className="rounded-full border border-slate-300 bg-white px-4 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
              >
                {loggingOut ? "Signing out..." : "Logout"}
              </button>
            </div>
          </header>

          <main className="flex-1 px-4 py-4 sm:px-6 sm:py-6">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
