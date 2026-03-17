import { lazy } from "react";
import { Route } from "react-router-dom";
import { RequireFeature, RequireRole } from "../components/RouteGuards";

const HomePage = lazy(() => import("../pages/HomePage"));
const AttendancePage = lazy(() => import("../pages/AttendancePage"));
const MarksProgressPage = lazy(() => import("../pages/MarksProgressPage"));
const ExamSchedulePage = lazy(() => import("../pages/ExamSchedulePage"));
const ParentAssignmentsPage = lazy(() =>
  import("../pages/parent/ParentAssignmentsPage")
);

const PARENT_PAGE_ROUTES = [
  { path: "/parent/home", element: <HomePage forcedRole="parent" /> },
  {
    path: "/parent/attendance",
    element: <AttendancePage forcedStaff={false} />,
    feature: "attendance",
  },
  {
    path: "/parent/menu/marks-progress",
    element: <MarksProgressPage forcedRole="parent" />,
    feature: "marks",
  },
  {
    path: "/parent/exam-schedule",
    element: <ExamSchedulePage forcedRole="parent" />,
    feature: "exams",
  },
  {
    path: "/parent/menu/assignments",
    element: <ParentAssignmentsPage />,
    feature: "assignments",
  },
];

function renderParentRoleElement(element, withRouteLoader, feature) {
  const wrappedElement = feature ? (
    <RequireFeature feature={feature}>{withRouteLoader(element)}</RequireFeature>
  ) : (
    withRouteLoader(element)
  );

  return (
    <RequireRole allow={["parent"]}>
      {wrappedElement}
    </RequireRole>
  );
}

export function renderParentRoutes(withRouteLoader) {
  return (
    <>
      {PARENT_PAGE_ROUTES.map(({ path, element, feature }) => (
        <Route
          key={path}
          path={path}
          element={renderParentRoleElement(element, withRouteLoader, feature)}
        />
      ))}
    </>
  );
}
