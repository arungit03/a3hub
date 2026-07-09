import { Outlet, useNavigate } from "react-router-dom";
import { LogOut } from "lucide-react";
import { useAuth } from "../../state/auth";
import { CanteenSidebar } from "../components/CanteenSidebar";

export default function CanteenLayout() {
  const navigate = useNavigate();
  const { profile, logout } = useAuth();

  const handleLogout = async () => {
    await logout();
    navigate("/", { replace: true });
  };

  return (
    <div className="min-h-screen bg-linear-to-br from-sand via-cream to-mist/40">
      <div className="grid min-h-screen lg:grid-cols-[280px_1fr]">
        <CanteenSidebar />

        <div className="p-4 sm:p-6">
          <header className="flex flex-col gap-4 rounded-[28px] border border-clay/18 bg-white/95 px-6 py-5 shadow-[0_22px_48px_-38px_rgba(15,23,42,0.16)] sm:flex-row sm:items-center sm:justify-between">
            <div>
              <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-ocean">
                Realtime operations
              </span>
              <h1 className="mt-1 text-2xl font-semibold text-ink">
                Canteen control room
              </h1>
            </div>

            <div className="flex items-center gap-3 rounded-2xl border border-clay/16 bg-sand/70 px-4 py-2.5">
              <div className="text-right">
                <strong className="block text-sm text-ink">
                  {profile?.name || "Canteen Staff"}
                </strong>
                <span className="block text-xs text-ink/55">
                  {profile?.accountRole || profile?.role || "canteen_staff"}
                </span>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                className="flex items-center gap-1.5 rounded-full border border-clay/20 bg-white px-3 py-2 text-xs font-semibold text-ink/75 transition hover:border-rose-200 hover:text-rose-600"
              >
                <LogOut className="h-3.5 w-3.5" />
                Logout
              </button>
            </div>
          </header>

          <main className="mt-5">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
