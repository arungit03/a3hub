import { Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../../state/auth";
import { CanteenSidebar } from "../components/CanteenSidebar";
import "../canteenConsole.css";

export default function CanteenLayout() {
  const navigate = useNavigate();
  const { profile, logout } = useAuth();

  const handleLogout = async () => {
    await logout();
    navigate("/", { replace: true });
  };

  return (
    <div className="canteen-shell-root">
      <div className="ops-shell">
        <CanteenSidebar />

        <div className="ops-main">
          <header className="ops-topbar">
            <div>
              <span className="ops-eyebrow">Realtime operations</span>
              <h1>Canteen control room</h1>
            </div>

            <div className="ops-user-block">
              <div>
                <strong>{profile?.name || "Canteen Staff"}</strong>
                <span>{profile?.accountRole || profile?.role || "canteen_staff"}</span>
              </div>
              <button className="ghost-button" type="button" onClick={handleLogout}>
                Logout
              </button>
            </div>
          </header>

          <main className="ops-page">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
