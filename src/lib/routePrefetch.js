import { isFeatureEnabled } from "../config/features";

const prefetchedRouteChunks = new Set();

const normalizePath = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const withoutQuery = raw.split("?")[0];
  const withoutHash = withoutQuery.split("#")[0];
  if (!withoutHash) return "";
  if (withoutHash === "/") return "/";
  return withoutHash.replace(/\/+$/, "");
};

const isExact = (target) => {
  const normalizedTarget = normalizePath(target);
  return (path) => path === normalizedTarget;
};

const ROUTE_PREFETCH_ENTRIES = [
  {
    key: "student-home",
    match: isExact("/student/home"),
    load: () => import("../pages/HomePage"),
  },
  {
    key: "student-attendance",
    match: isExact("/student/attendance"),
    load: () => import("../pages/AttendancePage"),
    feature: "attendance",
  },
  {
    key: "student-menu-todo",
    match: isExact("/student/menu/my-to-do-list"),
    load: () => import("../pages/student/StudentTodoListPage"),
    feature: "todo",
  },
  {
    key: "student-menu-progress",
    match: isExact("/student/menu/marks-progress"),
    load: () => import("../pages/MarksProgressPage"),
    feature: "marks",
  },
  {
    key: "student-menu-books",
    match: isExact("/student/menu/books"),
    load: () => import("../pages/BooksPage"),
    feature: "books",
  },
  {
    key: "student-menu-book-subject",
    match: (path) => path.startsWith("/student/menu/books/"),
    load: () => import("../pages/BookSubjectPage"),
    feature: "books",
  },
  {
    key: "student-menu",
    match: isExact("/student/menu"),
    load: () => import("../pages/MenuGridPage"),
  },
  {
    key: "student-menu-daily-python",
    match: isExact("/student/menu/daily-python-challenges"),
    load: () => import("../pages/MenuGridPage"),
    feature: "compilers",
  },
  {
    key: "student-code",
    match: isExact("/student/code"),
    load: () => import("../pages/CodeLabPage"),
    feature: "compilers",
  },
  {
    key: "student-learning",
    match: isExact("/student/learning"),
    load: () => import("../features/learning/pages/LearningHomePage.jsx"),
    feature: "learning",
  },
  {
    key: "student-learning-dashboard",
    match: isExact("/student/learning/dashboard"),
    load: () => import("../features/learning/pages/LearningDashboardPage.jsx"),
    feature: "learning",
  },
  {
    key: "student-learning-html-dashboard",
    match: isExact("/student/learning/html/dashboard"),
    load: () => import("../features/learning/pages/HtmlLearningDashboardPage.jsx"),
    feature: "learning",
  },
  {
    key: "student-learning-progress",
    match: isExact("/student/learning/progress"),
    load: () => import("../features/learning/pages/LearningProgressPage.jsx"),
    feature: "learning",
  },
  {
    key: "student-learning-topic",
    match: (path) =>
      path.startsWith("/student/learning/") &&
      path.split("/").length >= 5 &&
      !path.endsWith("/quiz") &&
      !path.endsWith("/practice"),
    load: () => import("../features/learning/pages/LearningTopicPage.jsx"),
    feature: "learning",
  },
  {
    key: "student-learning-quiz",
    match: (path) => path.startsWith("/student/learning/") && path.endsWith("/quiz"),
    load: () => import("../features/learning/pages/LearningQuizPage.jsx"),
    feature: "learning",
  },
  {
    key: "student-learning-practice",
    match: (path) =>
      path.startsWith("/student/learning/") && path.endsWith("/practice"),
    load: () => import("../features/learning/pages/LearningPracticePage.jsx"),
    feature: "learning",
  },
  {
    key: "student-learning-course",
    match: (path) =>
      path.startsWith("/student/learning/") && path.split("/").length === 4,
    load: () => import("../features/learning/pages/LearningCoursePage.jsx"),
    feature: "learning",
  },
  {
    key: "student-html-editor",
    match: (path) => path === "/student/html-editor" || path.startsWith("/student/html-editor/"),
    load: () => import("../features/html-editor/pages/HtmlEditorPage.jsx"),
    feature: "compilers",
  },
  {
    key: "student-code-python",
    match: isExact("/student/code/python"),
    load: () => import("../pages/PythonInterpreterPage"),
    feature: "compilers",
  },
  {
    key: "student-code-c",
    match: isExact("/student/code/c"),
    load: () => import("../pages/CCompilerPage"),
    feature: "compilers",
  },
  {
    key: "student-code-cpp",
    match: isExact("/student/code/cpp"),
    load: () => import("../pages/CppCompilerPage"),
    feature: "compilers",
  },
  {
    key: "student-ai",
    match: isExact("/student/ai"),
    load: () => import("../pages/AiChatPage"),
    feature: "ai-chat",
  },
  {
    key: "student-a3cad",
    match: isExact("/student/a3cad"),
    load: () => import("../pages/A3cadPage"),
    feature: "a3cad",
  },
  {
    key: "student-exam-schedule",
    match: isExact("/student/exam-schedule"),
    load: () => import("../pages/ExamSchedulePage"),
    feature: "exams",
  },
  {
    key: "student-test",
    match: isExact("/student/test"),
    load: () => import("../pages/TestPage"),
    feature: "tests",
  },
  {
    key: "student-results",
    match: isExact("/student/results"),
    load: () => import("../pages/TestResultsPage"),
    feature: "tests",
  },
  {
    key: "student-leave",
    match: isExact("/student/leave"),
    load: () => import("../pages/LeaveManagementPage"),
    feature: "leave",
  },
  {
    key: "student-profile",
    match: isExact("/student/profile"),
    load: () => import("../pages/ProfilePage"),
  },
  {
    key: "staff-home",
    match: isExact("/staff/home"),
    load: () => import("../pages/HomePage"),
  },
  {
    key: "staff-attendance",
    match: isExact("/staff/attendance"),
    load: () => import("../pages/AttendancePage"),
    feature: "attendance",
  },
  {
    key: "staff-menu-progress",
    match: isExact("/staff/menu/marks-progress"),
    load: () => import("../pages/MarksProgressPage"),
    feature: "marks",
  },
  {
    key: "staff-menu-student-assignments",
    match: isExact("/staff/menu/student-assignments"),
    load: () => import("../pages/staff/StaffStudentAssignmentsPage"),
    feature: "assignments",
  },
  {
    key: "staff-menu-parent-replies",
    match: isExact("/staff/menu/parent-replies"),
    load: () => import("../pages/staff/StaffParentRepliesPage"),
    feature: "assignments",
  },
  {
    key: "staff-menu-books",
    match: isExact("/staff/menu/books"),
    load: () => import("../pages/BooksPage"),
    feature: "books",
  },
  {
    key: "staff-menu-book-subject",
    match: (path) => path.startsWith("/staff/menu/books/"),
    load: () => import("../pages/BookSubjectPage"),
    feature: "books",
  },
  {
    key: "staff-menu",
    match: isExact("/staff/menu"),
    load: () => import("../pages/MenuGridPage"),
  },
  {
    key: "staff-code",
    match: isExact("/staff/code"),
    load: () => import("../pages/CodeLabPage"),
    feature: "compilers",
  },
  {
    key: "staff-learning",
    match: isExact("/staff/learning"),
    load: () => import("../features/learning/pages/LearningHomePage.jsx"),
    feature: "learning",
  },
  {
    key: "staff-learning-dashboard",
    match: isExact("/staff/learning/dashboard"),
    load: () => import("../features/learning/pages/LearningDashboardPage.jsx"),
    feature: "learning",
  },
  {
    key: "staff-learning-html-dashboard",
    match: isExact("/staff/learning/html/dashboard"),
    load: () => import("../features/learning/pages/HtmlLearningDashboardPage.jsx"),
    feature: "learning",
  },
  {
    key: "staff-learning-progress",
    match: isExact("/staff/learning/progress"),
    load: () => import("../features/learning/pages/LearningProgressPage.jsx"),
    feature: "learning",
  },
  {
    key: "staff-learning-topic",
    match: (path) =>
      path.startsWith("/staff/learning/") &&
      path.split("/").length >= 5 &&
      !path.endsWith("/quiz") &&
      !path.endsWith("/practice"),
    load: () => import("../features/learning/pages/LearningTopicPage.jsx"),
    feature: "learning",
  },
  {
    key: "staff-learning-quiz",
    match: (path) => path.startsWith("/staff/learning/") && path.endsWith("/quiz"),
    load: () => import("../features/learning/pages/LearningQuizPage.jsx"),
    feature: "learning",
  },
  {
    key: "staff-learning-practice",
    match: (path) =>
      path.startsWith("/staff/learning/") && path.endsWith("/practice"),
    load: () => import("../features/learning/pages/LearningPracticePage.jsx"),
    feature: "learning",
  },
  {
    key: "staff-learning-course",
    match: (path) =>
      path.startsWith("/staff/learning/") && path.split("/").length === 4,
    load: () => import("../features/learning/pages/LearningCoursePage.jsx"),
    feature: "learning",
  },
  {
    key: "staff-html-editor",
    match: (path) => path === "/staff/html-editor" || path.startsWith("/staff/html-editor/"),
    load: () => import("../features/html-editor/pages/HtmlEditorPage.jsx"),
    feature: "compilers",
  },
  {
    key: "staff-code-python",
    match: isExact("/staff/code/python"),
    load: () => import("../pages/PythonInterpreterPage"),
    feature: "compilers",
  },
  {
    key: "staff-code-c",
    match: isExact("/staff/code/c"),
    load: () => import("../pages/CCompilerPage"),
    feature: "compilers",
  },
  {
    key: "staff-code-cpp",
    match: isExact("/staff/code/cpp"),
    load: () => import("../pages/CppCompilerPage"),
    feature: "compilers",
  },
  {
    key: "staff-ai",
    match: isExact("/staff/ai"),
    load: () => import("../pages/AiChatPage"),
    feature: "ai-chat",
  },
  {
    key: "staff-a3cad",
    match: isExact("/staff/a3cad"),
    load: () => import("../pages/A3cadPage"),
    feature: "a3cad",
  },
  {
    key: "staff-exam-schedule",
    match: isExact("/staff/exam-schedule"),
    load: () => import("../pages/ExamSchedulePage"),
    feature: "exams",
  },
  {
    key: "staff-test",
    match: isExact("/staff/test"),
    load: () => import("../pages/TestPage"),
    feature: "tests",
  },
  {
    key: "staff-results",
    match: isExact("/staff/results"),
    load: () => import("../pages/TestResultsPage"),
    feature: "tests",
  },
  {
    key: "staff-leave",
    match: isExact("/staff/leave"),
    load: () => import("../pages/LeaveManagementPage"),
    feature: "leave",
  },
  {
    key: "staff-profile",
    match: isExact("/staff/profile"),
    load: () => import("../pages/ProfilePage"),
  },
  {
    key: "parent-home",
    match: isExact("/parent/home"),
    load: () => import("../pages/HomePage"),
  },
  {
    key: "parent-attendance",
    match: isExact("/parent/attendance"),
    load: () => import("../pages/AttendancePage"),
    feature: "attendance",
  },
  {
    key: "parent-progress",
    match: isExact("/parent/menu/marks-progress"),
    load: () => import("../pages/MarksProgressPage"),
    feature: "marks",
  },
  {
    key: "parent-exam-schedule",
    match: isExact("/parent/exam-schedule"),
    load: () => import("../pages/ExamSchedulePage"),
    feature: "exams",
  },
  {
    key: "parent-assignments",
    match: isExact("/parent/menu/assignments"),
    load: () => import("../pages/parent/ParentAssignmentsPage"),
    feature: "assignments",
  },
];

export async function prefetchRoute(path) {
  const normalizedPath = normalizePath(path);
  if (!normalizedPath) return false;

  const entry = ROUTE_PREFETCH_ENTRIES.find((item) => item.match(normalizedPath));
  if (!entry) return false;
  if (entry.feature && !isFeatureEnabled(entry.feature)) {
    return false;
  }
  if (prefetchedRouteChunks.has(entry.key)) return true;

  prefetchedRouteChunks.add(entry.key);
  try {
    await entry.load(normalizedPath);
    return true;
  } catch {
    prefetchedRouteChunks.delete(entry.key);
    return false;
  }
}

export function prefetchRoutes(paths = []) {
  for (const path of paths) {
    void prefetchRoute(path);
  }
}
