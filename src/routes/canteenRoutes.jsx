import { lazy } from "react";
import { Navigate, Route } from "react-router-dom";
import { RequireAuth, RequireRole } from "../components/RouteGuards";

const CanteenLayout = lazy(() => import("../canteen/layouts/CanteenLayout.jsx"));
const CanteenDashboardPage = lazy(() =>
  import("../canteen/pages/CanteenDashboardPage.jsx")
);
const CanteenMenuManagementPage = lazy(() =>
  import("../canteen/pages/CanteenMenuManagementPage.jsx")
);
const CanteenOrdersPage = lazy(() =>
  import("../canteen/pages/CanteenOrdersPage.jsx")
);
const CanteenAnalyticsPage = lazy(() =>
  import("../canteen/pages/CanteenAnalyticsPage.jsx")
);

export function renderCanteenRoutes(withRouteLoader) {
  return (
    <Route
      path="/canteen"
      element={
        <RequireAuth>
          <RequireRole allow={["canteen"]}>
            {withRouteLoader(<CanteenLayout />)}
          </RequireRole>
        </RequireAuth>
      }
    >
      <Route index element={<Navigate to="/canteen/dashboard" replace />} />
      <Route
        path="dashboard"
        element={withRouteLoader(<CanteenDashboardPage />)}
      />
      <Route
        path="menu"
        element={withRouteLoader(<CanteenMenuManagementPage />)}
      />
      <Route path="orders" element={withRouteLoader(<CanteenOrdersPage />)} />
      <Route
        path="analytics"
        element={withRouteLoader(<CanteenAnalyticsPage />)}
      />
    </Route>
  );
}
