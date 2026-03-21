import { Navigate } from "react-router-dom";
import { useAuth } from "../state/auth";

export function RoleHomeRedirect() {
  const { role } = useAuth();

  if (role === "canteen") {
    return <Navigate to="/canteen/dashboard" replace />;
  }
  if (role === "admin") {
    return <Navigate to="/admin/dashboard" replace />;
  }
  if (role === "staff") {
    return <Navigate to="/staff/home" replace />;
  }
  if (role === "parent") {
    return <Navigate to="/parent/home" replace />;
  }
  return <Navigate to="/student/home" replace />;
}
