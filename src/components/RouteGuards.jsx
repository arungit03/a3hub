import { Navigate } from "react-router-dom";
import { isFeatureEnabled } from "../config/features";
import { useAuth } from "../state/auth";

const resolveRoleHomePath = (role) => {
  if (role === "admin") return "/admin/dashboard";
  if (role === "staff") return "/staff/home";
  if (role === "parent") return "/parent/home";
  return "/student/home";
};

export function RequireAuth({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-sand">
        <div className="rounded-2xl border border-clay/25 bg-cream px-6 py-4 text-sm text-ink/80 shadow-soft">
          Loading campus dashboard...
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/" replace />;
  }

  return children;
}

export function RequireRole({ allow, children }) {
  const { role } = useAuth();

  if (!allow.includes(role)) {
    return <Navigate to="/home" replace />;
  }

  return children;
}

export function RequireFeature({ feature, children, fallbackPath = "" }) {
  const { role, user } = useAuth();
  if (!feature || isFeatureEnabled(feature)) {
    return children;
  }

  if (!user) {
    return <Navigate to="/" replace />;
  }

  const redirectTo = fallbackPath || resolveRoleHomePath(role);
  return <Navigate to={redirectTo} replace />;
}