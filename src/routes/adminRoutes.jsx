import { lazy } from "react";
import { Navigate, Route } from "react-router-dom";
import {
  RequireAuth,
  RequireFeature,
  RequireRole,
} from "../components/RouteGuards";

const AdminLayout = lazy(() => import("../admin/components/AdminLayout"));
const AdminDashboardPage = lazy(() => import("../admin/pages/AdminDashboardPage"));
const AdminUsersPage = lazy(() => import("../admin/pages/AdminUsersPage"));
const AdminAcademicsPage = lazy(() => import("../admin/pages/AdminAcademicsPage"));
const AdminTestsPage = lazy(() => import("../admin/pages/AdminTestsPage"));
const AdminNoticesPage = lazy(() => import("../admin/pages/AdminNoticesPage"));
const AdminAnalyticsPage = lazy(() => import("../admin/pages/AdminAnalyticsPage"));
const AdminSettingsPage = lazy(() => import("../admin/pages/AdminSettingsPage"));
const AdminLearningPage = lazy(() => import("../admin/pages/AdminLearningPage.jsx"));
const AdminStaffRequestsPage = lazy(() =>
  import("../admin/pages/AdminStaffRequestsPage")
);
const AdminAuditLogsPage = lazy(() => import("../admin/pages/AdminAuditLogsPage"));

const ADMIN_CHILD_ROUTES = [
  { path: "dashboard", element: <AdminDashboardPage /> },
  { path: "users", element: <AdminUsersPage /> },
  { path: "academics", element: <AdminAcademicsPage /> },
  { path: "tests", element: <AdminTestsPage /> },
  { path: "notices", element: <AdminNoticesPage /> },
  { path: "staff-requests", element: <AdminStaffRequestsPage /> },
  { path: "analytics", element: <AdminAnalyticsPage /> },
  { path: "learning", element: <AdminLearningPage /> },
  { path: "settings", element: <AdminSettingsPage /> },
  { path: "audit-logs", element: <AdminAuditLogsPage /> },
];

export function renderAdminRoutes(withRouteLoader) {
  return (
    <Route
      path="/admin"
      element={
        <RequireAuth>
          <RequireFeature feature="admin">
            <RequireRole allow={["admin"]}>
              {withRouteLoader(<AdminLayout />)}
            </RequireRole>
          </RequireFeature>
        </RequireAuth>
      }
    >
      <Route index element={<Navigate to="/admin/dashboard" replace />} />
      {ADMIN_CHILD_ROUTES.map(({ path, element }) => (
        <Route key={path} path={path} element={withRouteLoader(element)} />
      ))}
    </Route>
  );
}
