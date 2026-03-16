import { lazy } from "react";
import { Route } from "react-router-dom";
import { RequireAuth } from "../components/RouteGuards";
import { RoleHomeRedirect } from "./RoleHomeRedirect";
import { renderParentRoutes } from "./parentRoutes";
import { renderStaffRoutes } from "./staffRoutes";
import { renderStudentRoutes } from "./studentRoutes";

const AppShell = lazy(() => import("../components/AppShell"));
const LeaveManagementPage = lazy(() => import("../pages/LeaveManagementPage"));
const FileAssetPage = lazy(() => import("../pages/FileAssetPage"));

export function renderAppShellRoutes(withRouteLoader) {
  return (
    <Route
      element={
        <RequireAuth>
          {withRouteLoader(<AppShell />)}
        </RequireAuth>
      }
    >
      <Route path="/home" element={withRouteLoader(<RoleHomeRedirect />)} />
      <Route
        path="/leavemanagement/menu"
        element={withRouteLoader(<LeaveManagementPage />)}
      />
      <Route
        path="/file-asset/:fileId"
        element={withRouteLoader(<FileAssetPage />)}
      />
      {renderStudentRoutes(withRouteLoader)}
      {renderParentRoutes(withRouteLoader)}
      {renderStaffRoutes(withRouteLoader)}
    </Route>
  );
}
