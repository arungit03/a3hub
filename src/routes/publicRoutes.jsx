import { lazy } from "react";
import { Navigate, Route } from "react-router-dom";

const AuthPage = lazy(() => import("../pages/AuthPage"));
const PasswordChangePage = lazy(() => import("../pages/PasswordChangePage"));
const NotFound = lazy(() => import("../pages/NotFound"));

export function renderPublicRoutes(withRouteLoader) {
  return (
    <>
      <Route path="/" element={withRouteLoader(<AuthPage />)} />
      <Route
        path="/password-change"
        element={withRouteLoader(<PasswordChangePage />)}
      />
      <Route
        path="/reset-password"
        element={<Navigate to="/password-change" replace />}
      />
      <Route
        path="/change-password"
        element={<Navigate to="/password-change" replace />}
      />
      <Route path="/dashboard" element={<Navigate to="/home" replace />} />
      <Route path="*" element={withRouteLoader(<NotFound />)} />
    </>
  );
}
