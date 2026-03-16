import { lazy } from "react";
import { Navigate, Route } from "react-router-dom";
import { RequireFeature, RequireRole } from "../components/RouteGuards";

const HomePage = lazy(() => import("../pages/HomePage"));
const TodaysSchedulePage = lazy(() => import("../pages/TodaysSchedulePage"));
const AttendancePage = lazy(() => import("../pages/AttendancePage"));
const MenuGridPage = lazy(() => import("../pages/MenuGridPage"));
const ResumeBuilderPage = lazy(() => import("../pages/ResumeBuilderPage"));
const StudentTodoListPage = lazy(() =>
  import("../pages/student/StudentTodoListPage")
);
const MarksProgressPage = lazy(() => import("../pages/MarksProgressPage"));
const BooksPage = lazy(() => import("../pages/BooksPage"));
const BookSubjectPage = lazy(() => import("../pages/BookSubjectPage"));
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

const STUDENT_PAGE_ROUTES = [
  { path: "/student/home", element: <HomePage forcedRole="student" /> },
  {
    path: "/student/todays-schedule",
    element: <TodaysSchedulePage forcedRole="student" />,
  },
  {
    path: "/student/menu/attendance",
    element: <AttendancePage forcedStaff={false} />,
    feature: "attendance",
  },
  { path: "/student/menu", element: <MenuGridPage forcedStaff={false} /> },
  { path: "/student/menu/assignments", element: <MenuGridPage forcedStaff={false} /> },
  {
    path: "/student/menu/daily-python-challenges",
    element: <MenuGridPage forcedStaff={false} />,
  },
  { path: "/student/menu/resume-builder", element: <ResumeBuilderPage /> },
  { path: "/student/menu/my-to-do-list", element: <StudentTodoListPage /> },
  {
    path: "/student/menu/marks-progress",
    element: <MarksProgressPage forcedRole="student" />,
  },
  { path: "/student/menu/books", element: <BooksPage forcedRole="student" /> },
  {
    path: "/student/menu/books/:subjectId",
    element: <BookSubjectPage forcedRole="student" />,
  },
  { path: "/student/code", element: <CodeLabPage />, feature: "compilers" },
  {
    path: "/student/code/python",
    element: <PythonInterpreterPage />,
    feature: "compilers",
  },
  { path: "/student/code/c", element: <CCompilerPage />, feature: "compilers" },
  {
    path: "/student/code/cpp",
    element: <CppCompilerPage />,
    feature: "compilers",
  },
  { path: "/student/ai", element: <AiChatPage />, feature: "ai-chat" },
  { path: "/student/a3cad", element: <A3cadPage /> },
  { path: "/student/exam-schedule", element: <ExamSchedulePage forcedRole="student" /> },
  { path: "/student/test", element: <TestPage /> },
  { path: "/student/results", element: <TestResultsPage /> },
  { path: "/student/leave", element: <LeaveManagementPage forcedStaff={false} /> },
  { path: "/student/profile", element: <ProfilePage forcedRole="student" /> },
];

const STUDENT_REDIRECT_ROUTES = [
  {
    path: "/student/attendance",
    to: "/student/menu/attendance",
    feature: "attendance",
  },
  { path: "/student/resume-builder", to: "/student/menu/resume-builder" },
  { path: "/menu/resume-builder", to: "/student/menu/resume-builder" },
  { path: "/resume-builder", to: "/student/menu/resume-builder" },
];

function renderStudentRoleElement(element, withRouteLoader, feature) {
  const wrappedElement = feature ? (
    <RequireFeature feature={feature}>{withRouteLoader(element)}</RequireFeature>
  ) : (
    withRouteLoader(element)
  );

  return (
    <RequireRole allow={["student"]}>
      {wrappedElement}
    </RequireRole>
  );
}

export function renderStudentRoutes(withRouteLoader) {
  return (
    <>
      {STUDENT_REDIRECT_ROUTES.map((route) => (
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
      {STUDENT_PAGE_ROUTES.map(({ path, element, feature }) => (
        <Route
          key={path}
          path={path}
          element={renderStudentRoleElement(element, withRouteLoader, feature)}
        />
      ))}
    </>
  );
}
