import { isFeatureEnabled } from "../config/features";

const rawMenuItems = [
  {
    id: "calendar",
    label: "Calendar",
    icon: "\uD83D\uDCC6",
    staffEditable: true,
  },
  {
    id: "test",
    label: "Test",
    icon: "\u2705",
    staffEditable: false,
    path: "/test",
  },
  {
    id: "assignments",
    label: "Assignments",
    icon: "\uD83D\uDCDA",
    staffEditable: true,
  },
  {
    id: "student-assignments",
    label: "Student's Assignments",
    icon: "\uD83D\uDCC2",
    staffEditable: false,
    path: "/menu/student-assignments",
  },
  {
    id: "parent-replies",
    label: "Parent's Reply",
    icon: "\uD83D\uDCAC",
    staffEditable: false,
    path: "/menu/parent-replies",
  },
  {
    id: "books",
    label: "Books",
    icon: "\uD83D\uDCDA",
    staffEditable: false,
    path: "/menu/books",
  },
  {
    id: "leave",
    label: "Leave Management",
    icon: "\uD83D\uDCDD",
    staffEditable: false,
  },
  {
    id: "exam",
    label: "Exam Schedule",
    icon: "\uD83D\uDDD3\uFE0F",
    staffEditable: true,
  },
  {
    id: "marks-progress",
    label: "Marks & Progress",
    icon: "\uD83D\uDCCA",
    staffEditable: false,
    path: "/menu/marks-progress",
  },
  {
    id: "student-details",
    label: "Student's Details",
    icon: "\uD83D\uDC64",
    staffEditable: false,
  },
  {
    id: "daily-python-challenges",
    label: "Daily Python",
    icon: "\uD83D\uDD25",
    staffEditable: false,
    feature: "compilers",
  },
  {
    id: "interview-quiz-contact",
    label: "Interview Quiz",
    icon: "\uD83C\uDFA4",
    staffEditable: false,
    feature: "ai-chat",
  },
  {
    id: "my-todo-list",
    label: "My To-Do List",
    icon: "\uD83D\uDCDD",
    staffEditable: false,
    path: "/menu/my-to-do-list",
  },
  {
    id: "resume-builder",
    label: "Resume Builder AI",
    icon: "\uD83E\uDDFE",
    staffEditable: false,
    path: "/menu/resume-builder",
    feature: "ai-chat",
  },
  {
    id: "fees",
    label: "Fees",
    icon: "\uD83D\uDCB0",
    staffEditable: true,
  },
  {
    id: "circulars",
    label: "Circulars",
    icon: "\uD83D\uDCE2",
    staffEditable: true,
  },
];

export const menuItems = rawMenuItems.filter(
  (item) => !item.feature || isFeatureEnabled(item.feature)
);

export const staffEditableModules = menuItems.filter((item) => item.staffEditable);
