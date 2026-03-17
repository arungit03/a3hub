import { lazy } from "react";
import { Navigate, Route } from "react-router-dom";
import { RequireFeature, RequireRole } from "../components/RouteGuards";

const HomePage = lazy(() => import("../pages/HomePage"));
const TodaysSchedulePage = lazy(() => import("../pages/TodaysSchedulePage"));
const AttendancePage = lazy(() => import("../pages/AttendancePage"));
const MenuGridPage = lazy(() => import("../pages/MenuGridPage"));
const BooksPage = lazy(() => import("../pages/BooksPage"));
const BookSubjectPage = lazy(() => import("../pages/BookSubjectPage"));
const MarksProgressPage = lazy(() => import("../pages/MarksProgressPage"));
const StaffStudentAssignmentsPage = lazy(() =>
  import("../pages/staff/StaffStudentAssignmentsPage")
);
const StaffParentRepliesPage = lazy(() =>
  import("../pages/staff/StaffParentRepliesPage")
);
const CodeLabPage = lazy(() => import("../pages/CodeLabPage"));
const PythonInterpreterPage = lazy(() =>
  import("../pages/PythonInterpreterPage")
);
const CCompilerPage = lazy(() => import("../pages/CCompilerPage"));
const CppCompilerPage = lazy(() => import("../pages/CppCompilerPage"));
const AiChatPage = lazy(() => import("../pages/AiChatPage"));
const A3cadPage = lazy(() => import("../pages/A3cadPage"));
const ExamSchedulePage = lazy(() => import("../pages/ExamSchedulePage"));
const TestPage = lazy(() => import("../pages/TestPage"));
const TestResultsPage = lazy(() => import("../pages/TestResultsPage"));
const LeaveManagementPage = lazy(() => import("../pages/LeaveManagementPage"));
const ProfilePage = lazy(() => import("../pages/ProfilePage"));

const STAFF_PAGE_ROUTES = [
  { path: "/staff/home", element: <HomePage forcedRole="staff" /> },
  {
    path: "/staff/todays-schedule",
    element: <TodaysSchedulePage forcedRole="staff" />,
  },
  {
    path: "/staff/menu/attendance",
    element: <AttendancePage forcedStaff />,
    feature: "attendance",
  },
  { path: "/staff/menu", element: <MenuGridPage forcedStaff /> },
  {
    path: "/staff/menu/assignments",
    element: <MenuGridPage forcedStaff />,
    feature: "assignments",
  },
  { path: "/staff/menu/student-details", element: <MenuGridPage forcedStaff /> },
  {
    path: "/staff/menu/books",
    element: <BooksPage forcedRole="staff" />,
    feature: "books",
  },
  {
    path: "/staff/menu/marks-progress",
    element: <MarksProgressPage forcedRole="staff" />,
    feature: "marks",
  },
  {
    path: "/staff/menu/student-assignments",
    element: <StaffStudentAssignmentsPage />,
    feature: "assignments",
  },
  {
    path: "/staff/menu/parent-replies",
    element: <StaffParentRepliesPage />,
    feature: "assignments",
  },
  {
    path: "/staff/menu/books/:subjectId",
    element: <BookSubjectPage forcedRole="staff" />,
    feature: "books",
  },
  { path: "/staff/code", element: <CodeLabPage />, feature: "compilers" },
  {
    path: "/staff/code/python",
    element: <PythonInterpreterPage />,
    feature: "compilers",
  },
  { path: "/staff/code/c", element: <CCompilerPage />, feature: "compilers" },
  {
    path: "/staff/code/cpp",
    element: <CppCompilerPage />,
    feature: "compilers",
  },
  { path: "/staff/ai", element: <AiChatPage />, feature: "ai-chat" },
  { path: "/staff/a3cad", element: <A3cadPage />, feature: "a3cad" },
  {
    path: "/staff/exam-schedule",
    element: <ExamSchedulePage forcedRole="staff" />,
    feature: "exams",
  },
  { path: "/staff/test", element: <TestPage />, feature: "tests" },
  { path: "/staff/results", element: <TestResultsPage />, feature: "tests" },
  {
    path: "/staff/leave",
    element: <LeaveManagementPage forcedStaff={true} />,
    feature: "leave",
  },
  { path: "/staff/profile", element: <ProfilePage forcedRole="staff" /> },
];

const STAFF_REDIRECT_ROUTES = [
  {
    path: "/staff/attendance",
    to: "/staff/menu/attendance",
    feature: "attendance",
  },
];

function renderStaffRoleElement(element, withRouteLoader, feature) {
  const wrappedElement = feature ? (
    <RequireFeature feature={feature}>{withRouteLoader(element)}</RequireFeature>
  ) : (
    withRouteLoader(element)
  );

  return (
    <RequireRole allow={["staff"]}>
      {wrappedElement}
    </RequireRole>
  );
}

export function renderStaffRoutes(withRouteLoader) {
  return (
    <>
      {STAFF_REDIRECT_ROUTES.map((route) => (
        <Route
          key={route.path}
          path={route.path}
          element={
            route.feature ? (
              <RequireFeature feature={route.feature}>
                <Navigate to={route.to} replace />
              </RequireFeature>
            ) : (
              <Navigate to={route.to} replace />
            )
          }
        />
      ))}
      {STAFF_PAGE_ROUTES.map(({ path, element, feature }) => (
        <Route
          key={path}
          path={path}
          element={renderStaffRoleElement(element, withRouteLoader, feature)}
        />
      ))}
    </>
  );
}
