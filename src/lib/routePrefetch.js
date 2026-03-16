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
  },
  {
    key: "student-menu-resume-builder",
    match: isExact("/student/menu/resume-builder"),
    load: () => import("../pages/ResumeBuilderPage"),
  },
  {
    key: "student-menu-todo",
    match: isExact("/student/menu/my-to-do-list"),
    load: () => import("../pages/student/StudentTodoListPage"),
  },
  {
    key: "student-menu-progress",
    match: isExact("/student/menu/marks-progress"),
    load: () => import("../pages/MarksProgressPage"),
  },
  {
    key: "student-menu-books",
    match: isExact("/student/menu/books"),
    load: () => import("../pages/BooksPage"),
  },
  {
    key: "student-menu-book-subject",
    match: (path) => path.startsWith("/student/menu/books/"),
    load: () => import("../pages/BookSubjectPage"),
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
  },
  {
    key: "student-code",
    match: isExact("/student/code"),
    load: () => import("../pages/CodeLabPage"),
  },
  {
    key: "student-code-python",
    match: isExact("/student/code/python"),
    load: () => import("../pages/PythonInterpreterPage"),
  },
  {
    key: "student-code-c",
    match: isExact("/student/code/c"),
    load: () => import("../pages/CCompilerPage"),
  },
  {
    key: "student-code-cpp",
    match: isExact("/student/code/cpp"),
    load: () => import("../pages/CppCompilerPage"),
  },
  {
    key: "student-ai",
    match: isExact("/student/ai"),
    load: () => import("../pages/AiChatPage"),
  },
  {
    key: "student-exam-schedule",
    match: isExact("/student/exam-schedule"),
    load: () => import("../pages/ExamSchedulePage"),
  },
  {
    key: "student-test",
    match: isExact("/student/test"),
    load: () => import("../pages/TestPage"),
  },
  {
    key: "student-results",
    match: isExact("/student/results"),
    load: () => import("../pages/TestResultsPage"),
  },
  {
    key: "student-leave",
    match: isExact("/student/leave"),
    load: () => import("../pages/LeaveManagementPage"),
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
  },
  {
    key: "staff-menu-progress",
    match: isExact("/staff/menu/marks-progress"),
    load: () => import("../pages/MarksProgressPage"),
  },
  {
    key: "staff-menu-student-assignments",
    match: isExact("/staff/menu/student-assignments"),
    load: () => import("../pages/staff/StaffStudentAssignmentsPage"),
  },
  {
    key: "staff-menu-parent-replies",
    match: isExact("/staff/menu/parent-replies"),
    load: () => import("../pages/staff/StaffParentRepliesPage"),
  },
  {
    key: "staff-menu-books",
    match: isExact("/staff/menu/books"),
    load: () => import("../pages/BooksPage"),
  },
  {
    key: "staff-menu-book-subject",
    match: (path) => path.startsWith("/staff/menu/books/"),
    load: () => import("../pages/BookSubjectPage"),
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
  },
  {
    key: "staff-code-python",
    match: isExact("/staff/code/python"),
    load: () => import("../pages/PythonInterpreterPage"),
  },
  {
    key: "staff-code-c",
    match: isExact("/staff/code/c"),
    load: () => import("../pages/CCompilerPage"),
  },
  {
    key: "staff-code-cpp",
    match: isExact("/staff/code/cpp"),
    load: () => import("../pages/CppCompilerPage"),
  },
  {
    key: "staff-ai",
    match: isExact("/staff/ai"),
    load: () => import("../pages/AiChatPage"),
  },
  {
    key: "staff-exam-schedule",
    match: isExact("/staff/exam-schedule"),
    load: () => import("../pages/ExamSchedulePage"),
  },
  {
    key: "staff-test",
    match: isExact("/staff/test"),
    load: () => import("../pages/TestPage"),
  },
  {
    key: "staff-results",
    match: isExact("/staff/results"),
    load: () => import("../pages/TestResultsPage"),
  },
  {
    key: "staff-leave",
    match: isExact("/staff/leave"),
    load: () => import("../pages/LeaveManagementPage"),
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
  },
  {
    key: "parent-progress",
    match: isExact("/parent/menu/marks-progress"),
    load: () => import("../pages/MarksProgressPage"),
  },
];

export async function prefetchRoute(path) {
  const normalizedPath = normalizePath(path);
  if (!normalizedPath) return false;

  const entry = ROUTE_PREFETCH_ENTRIES.find((item) => item.match(normalizedPath));
  if (!entry) return false;
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
