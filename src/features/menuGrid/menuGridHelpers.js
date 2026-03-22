import {
  BadgeCheck,
  BarChart3,
  BookOpen,
  Bot,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Code2,
  FileText,
  GraduationCap,
  Landmark,
  Megaphone,
  NotebookPen,
  UtensilsCrossed,
} from "lucide-react";

export const SERVICE_CARD_META = Object.freeze({
  calendar: {
    icon: CalendarDays,
    description: "Track events, holidays, and academic milestones.",
  },
  event: {
    icon: CalendarDays,
    description: "Browse campus events and review event registrations.",
  },
  test: {
    icon: ClipboardCheck,
    description: "Attend tests and review performance quickly.",
  },
  assignments: {
    icon: FileText,
    description: "Upload, review, and submit assignment work.",
  },
  "student-assignments": {
    icon: FileText,
    description: "Review student assignment submissions.",
  },
  "parent-replies": {
    icon: NotebookPen,
    description: "Check parent communication and follow-ups.",
  },
  books: {
    icon: BookOpen,
    description: "Open subject resources and digital books.",
  },
  food: {
    icon: UtensilsCrossed,
    description: "Browse ready-made food, place orders, and track pickup tokens.",
  },
  leave: {
    icon: BadgeCheck,
    description: "Manage leave applications and approvals.",
  },
  exam: {
    icon: GraduationCap,
    description: "View upcoming exam plans and timetables.",
  },
  "marks-progress": {
    icon: BarChart3,
    description: "Monitor marks trends and progress reports.",
  },
  "student-details": {
    icon: NotebookPen,
    description: "Access student profile and department details.",
  },
  "daily-python-challenges": {
    icon: Code2,
    description: "Practice daily coding with guided challenges.",
  },
  learning: {
    icon: BookOpen,
    description: "Learn Python, C, C++, HTML, and CSS with lessons, quizzes, practice, previews, and progress tracking.",
  },
  "html-editor": {
    icon: Code2,
    description: "Write HTML, run live preview, load examples, and save snippets instantly.",
  },
  "interview-quiz-contact": {
    icon: Bot,
    description: "Prepare with AI-driven interview support.",
  },
  "my-todo-list": {
    icon: CheckCircle2,
    description: "Organize tasks and track daily productivity.",
  },
  fees: {
    icon: Landmark,
    description: "View fee details, pending dues, and receipts.",
  },
  circulars: {
    icon: Megaphone,
    description: "Read latest notices and campus announcements.",
  },
});

export const ACTION_BADGE_CLASS = Object.freeze({
  Open: "bg-sky-50 text-sky-700",
  View: "bg-indigo-50 text-indigo-700",
  Manage: "bg-indigo-50 text-indigo-700",
  Practice: "bg-emerald-50 text-emerald-700",
  AI: "bg-violet-50 text-violet-700",
  Edit: "bg-amber-50 text-amber-700",
});

export const formatFileSize = (bytes) => {
  if (!bytes && bytes !== 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const formatNoticeDate = (value) => {
  if (!value) return "";
  const date = value?.toDate ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

export const getNoticeMeta = (notice) => {
  const dateLabel = formatNoticeDate(notice?.createdAt);
  const author = notice?.createdByName || "";
  const audienceLabel =
    notice?.departmentKey === "all"
      ? "All departments"
      : notice?.departmentLabel ||
        (notice?.departmentKey ? notice.departmentKey.toUpperCase() : "");
  const audienceMeta =
    audienceLabel && audienceLabel !== "All departments"
      ? `Dept: ${audienceLabel}`
      : audienceLabel;
  const showMeta =
    (dateLabel && dateLabel.length > 0) ||
    (author && author.length > 0) ||
    (audienceMeta && audienceMeta.length > 0);

  return { dateLabel, author, audienceMeta, showMeta };
};

export const normalizeDepartment = (value) =>
  (value || "").trim().toLowerCase();

const EMPTY_VALUE = "-";

export const toInputValue = (value) => {
  if (value === 0) return "0";
  if (value === null || value === undefined) return "";
  return String(value).trim();
};

export const pickFirstValue = (...values) => {
  for (const value of values) {
    const normalized = toInputValue(value);
    if (normalized) return normalized;
  }
  return "";
};

export const toDisplayValue = (value, fallback = EMPTY_VALUE) => {
  if (value === 0) return "0";
  if (!value) return fallback;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || fallback;
  }
  return String(value);
};

const splitParentNames = (value) => {
  const raw = toInputValue(value);
  if (!raw) {
    return { fatherName: "", motherName: "" };
  }

  const separators = ["&", "/", ",", "|"];
  for (const separator of separators) {
    if (!raw.includes(separator)) continue;
    const [first, second] = raw.split(separator);
    return {
      fatherName: toInputValue(first),
      motherName: toInputValue(second),
    };
  }

  return { fatherName: raw, motherName: "" };
};

export const buildStudentDetails = (value) => {
  const nestedDetails =
    value?.studentDetails && typeof value.studentDetails === "object"
      ? value.studentDetails
      : {};
  const parentNameFallback = splitParentNames(
    pickFirstValue(
      nestedDetails.parentNames,
      nestedDetails.parentName,
      nestedDetails.fatherMotherName,
      value?.parentNames,
      value?.parentName,
      value?.fatherMotherName
    )
  );

  return {
    rollNo: pickFirstValue(
      nestedDetails.rollNo,
      nestedDetails.rollNO,
      nestedDetails.roll_no,
      nestedDetails.registerNumber,
      nestedDetails.registerNo,
      nestedDetails.registrationNo,
      value?.rollNo,
      value?.rollNO,
      value?.roll_no,
      value?.registerNumber,
      value?.registerNo,
      value?.registrationNo,
      value?.studentRollNo
    ),
    department: pickFirstValue(
      nestedDetails.department,
      nestedDetails.departmentName,
      nestedDetails.dept,
      value?.department,
      value?.departmentName,
      value?.dept
    ),
    email: pickFirstValue(
      nestedDetails.email,
      nestedDetails.emailId,
      nestedDetails.emailID,
      nestedDetails.studentEmail,
      value?.email,
      value?.emailId,
      value?.emailID,
      value?.studentEmail
    ),
    studentMobile: pickFirstValue(
      nestedDetails.studentMobile,
      nestedDetails.studentMobileNumber,
      nestedDetails.mobile,
      nestedDetails.phone,
      nestedDetails.phoneNumber,
      nestedDetails.studentPhone,
      nestedDetails.whatsapp,
      value?.studentMobile,
      value?.studentMobileNumber,
      value?.mobile,
      value?.phone,
      value?.phoneNumber,
      value?.studentPhone,
      value?.whatsapp
    ),
    bloodGroup: pickFirstValue(
      nestedDetails.bloodGroup,
      nestedDetails.blood_group,
      value?.bloodGroup,
      value?.blood_group
    ),
    fatherName: pickFirstValue(
      nestedDetails.fatherName,
      nestedDetails.fathersName,
      value?.fatherName,
      value?.fathersName,
      parentNameFallback.fatherName
    ),
    motherName: pickFirstValue(
      nestedDetails.motherName,
      nestedDetails.mothersName,
      value?.motherName,
      value?.mothersName,
      parentNameFallback.motherName
    ),
    parentMobile: pickFirstValue(
      nestedDetails.parentMobile,
      nestedDetails.parentMobileNumber,
      nestedDetails.parentPhone,
      nestedDetails.guardianMobile,
      nestedDetails.fatherMobile,
      nestedDetails.motherMobile,
      value?.parentMobile,
      value?.parentMobileNumber,
      value?.parentPhone,
      value?.guardianMobile,
      value?.fatherMobile,
      value?.motherMobile
    ),
  };
};

export const calendarTypeOptions = [
  {
    value: "event",
    label: "Event",
    dotClass: "bg-emerald-500",
    chipClass: "border-emerald-200 bg-emerald-100/80 text-emerald-900",
    rowClass: "border-emerald-200 bg-emerald-100/60",
    dateTileClass: "border-emerald-200 bg-emerald-50",
  },
  {
    value: "holiday",
    label: "Holiday",
    dotClass: "bg-rose-500",
    chipClass: "border-rose-200 bg-rose-100/80 text-rose-900",
    rowClass: "border-rose-200 bg-rose-100/60",
    dateTileClass: "border-rose-200 bg-rose-50",
  },
  {
    value: "iqac",
    label: "IQAC Note",
    dotClass: "bg-amber-500",
    chipClass: "border-amber-200 bg-amber-100/80 text-amber-900",
    rowClass: "border-amber-200 bg-amber-100/60",
    dateTileClass: "border-amber-200 bg-amber-50",
  },
];

export const getCalendarTypeMeta = (value) => {
  const found = calendarTypeOptions.find((item) => item.value === value);
  return found || calendarTypeOptions[0];
};

export const formatDateKey = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const formatCalendarDateLabel = (dateKey) => {
  if (!dateKey) return "";
  const date = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
  });
};

export const getCalendarDateParts = (dateKey) => {
  const label = formatCalendarDateLabel(dateKey);
  const [month = "Day", day = "--"] = label.split(" ");
  return { month, day };
};

export const DAILY_PYTHON_CHALLENGE_COLLECTION = "dailyPythonChallenges";
export const DAILY_PYTHON_CHALLENGE_COUNT = 5;
const DAILY_PYTHON_LOCAL_CACHE_PREFIX = "a3hub.dailyPythonChallenges";
const DAILY_PYTHON_CHALLENGE_REQUIRED_FIELDS = [
  "id",
  "title",
  "topic",
  "difficulty",
  "statement",
  "inputFormat",
  "outputFormat",
  "sampleInput",
  "sampleOutput",
  "hint",
];
export const DAILY_CHALLENGE_TTL_MS = 24 * 60 * 60 * 1000;
export const DAILY_PYTHON_PROGRESS_COLLECTION = "dailyPythonProgress";

export const getMillis = (value) => {
  if (!value) return 0;
  if (typeof value?.toMillis === "function") return value.toMillis();
  const parsed = new Date(value);
  const millis = parsed.getTime();
  return Number.isNaN(millis) ? 0 : millis;
};

export const formatChallengeDateTime = (value) => {
  const millis = getMillis(value);
  if (!millis) return "";
  return new Date(millis).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

export const formatDateTimeLabel = (value) => {
  const millis = getMillis(value);
  if (!millis) return "";
  return new Date(millis).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

export const ASSIGNMENT_FILE_MAX_SIZE_BYTES = 10 * 1024 * 1024;
export const ASSIGNMENT_TYPE_VALUE = "assignment";
export const ASSIGNMENT_TYPE_LABEL = "Assignment";

export const getAssignmentDueMillis = (assignment) => {
  const dueMillis = getMillis(assignment?.expiresAt || assignment?.dueAt);
  if (dueMillis) return dueMillis;

  const rawDue = String(assignment?.submitEnd || "").trim();
  if (!rawDue) return 0;
  if (/^\d{4}-\d{2}-\d{2}$/.test(rawDue)) {
    const date = new Date(`${rawDue}T23:59:59`);
    return Number.isNaN(date.getTime()) ? 0 : date.getTime();
  }

  const fallback = new Date(rawDue);
  return Number.isNaN(fallback.getTime()) ? 0 : fallback.getTime();
};

export const formatAssignmentDueLabel = (assignment) => {
  const dueMillis = getAssignmentDueMillis(assignment);
  if (!dueMillis) return assignment?.submitEnd || "Not set";
  return new Date(dueMillis).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

export const isAssignmentClosed = (assignment) => {
  const dueMillis = getAssignmentDueMillis(assignment);
  return dueMillis > 0 && dueMillis <= Date.now();
};

export const getAssignmentUploadErrorMessage = (error) => {
  const code = error?.code || "";
  if (code === "cloudinary/network-error") {
    return "Network issue while uploading file.";
  }
  if (code === "cloudinary/no-file") {
    return "Choose a file before uploading.";
  }
  if (code === "storage/unauthenticated") {
    return "Upload requires a signed-in account.";
  }
  if (code === "storage/unauthorized") {
    return "Upload blocked by Firebase Storage rules. Allow signed-in users to upload.";
  }
  if (code === "storage/unknown") {
    const detail = String(error?.message || "");
    if (/cors|preflight|xmlhttprequest|http status|failed to fetch/i.test(detail)) {
      return "Firebase Storage CORS/bucket issue. Configure Cloudinary runtime config in public/runtime-config.js or fix Storage bucket/CORS.";
    }
    return "Firebase Storage error occurred. Please verify bucket and rules.";
  }
  if (code === "storage/upload-timeout" || code === "storage/download-url-timeout") {
    return "Upload is taking too long. Please try again.";
  }
  if (
    code === "storage/bucket-not-found" ||
    code === "storage/project-not-found" ||
    code === "storage/bucket-not-configured"
  ) {
    return "Firebase Storage is not ready. Enable Storage in Firebase Console.";
  }
  if (code === "upload/inline-too-large") {
    return "Upload fallback supports only small files (<= 700 KB) when using inline mode. Enable Firestore chunk fallback by deploying updated rules.";
  }
  if (code === "permission-denied") {
    return "Upload blocked by Firestore rules. Deploy updated firestore.rules.";
  }
  if (code === "resource-exhausted") {
    return "Firestore quota limit reached. Try later or reduce file size.";
  }
  if (code === "upload/no-provider") {
    if (error?.message) {
      return `All upload methods failed. ${error.message}`;
    }
    return "All upload methods failed. Enable Firebase Storage or configure Cloudinary.";
  }
  if (code) {
    return `Upload failed (${code}).`;
  }
  return "Upload failed. Please try again.";
};

export const getPreviousDateKey = (dateKey) => {
  if (!dateKey || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return "";
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() - 1);
  return formatDateKey(date);
};

export const isValidDailyPythonChallenge = (challenge) => {
  if (!challenge || typeof challenge !== "object") return false;

  const hasRequiredText = DAILY_PYTHON_CHALLENGE_REQUIRED_FIELDS.every((field) => {
    const value = challenge[field];
    return typeof value === "string" && value.trim().length > 0;
  });
  if (!hasRequiredText) return false;

  const sampleInput = String(challenge.sampleInput || "").trim();
  const sampleOutput = String(challenge.sampleOutput || "").trim();

  if (sampleInput.includes("\n") && sampleOutput === sampleInput) {
    return false;
  }

  return true;
};

export const hasValidDailyPythonChallenges = (challenges) =>
  Array.isArray(challenges) &&
  challenges.length === DAILY_PYTHON_CHALLENGE_COUNT &&
  challenges.every((challenge) => isValidDailyPythonChallenge(challenge));

const getDailyPythonLocalCacheKey = (userId) => {
  const safeUserId = String(userId || "").trim();
  return safeUserId ? `${DAILY_PYTHON_LOCAL_CACHE_PREFIX}.${safeUserId}` : "";
};

export const clearDailyPythonChallengeCache = (userId) => {
  if (typeof window === "undefined") return;
  const storageKey = getDailyPythonLocalCacheKey(userId);
  if (!storageKey) return;
  try {
    window.localStorage.removeItem(storageKey);
  } catch {
    // Ignore storage cleanup errors.
  }
};

export const loadDailyPythonChallengeCache = ({
  userId,
  expectedDateKey,
  nowMs,
}) => {
  if (typeof window === "undefined") return null;
  const storageKey = getDailyPythonLocalCacheKey(userId);
  if (!storageKey) return null;

  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    const cachedDateKey = String(parsed?.generatedAtKey || "").trim();
    const cachedChallenges = parsed?.challenges;
    const cachedExpiresMs = getMillis(parsed?.expiresAt);

    const isValid =
      cachedDateKey === expectedDateKey &&
      hasValidDailyPythonChallenges(cachedChallenges) &&
      cachedExpiresMs > nowMs;

    if (!isValid) {
      window.localStorage.removeItem(storageKey);
      return null;
    }

    return {
      challenges: cachedChallenges,
      generatedAtKey: cachedDateKey,
      expiresAt: new Date(cachedExpiresMs),
    };
  } catch {
    return null;
  }
};

export const saveDailyPythonChallengeCache = ({
  userId,
  generatedAtKey,
  challenges,
  expiresAt,
}) => {
  if (typeof window === "undefined") return;
  const storageKey = getDailyPythonLocalCacheKey(userId);
  if (!storageKey) return;
  if (!hasValidDailyPythonChallenges(challenges)) return;

  const expiresMs = getMillis(expiresAt);
  if (!expiresMs) return;

  const payload = {
    generatedAtKey: String(generatedAtKey || "").trim(),
    challenges,
    expiresAt: new Date(expiresMs).toISOString(),
  };

  try {
    window.localStorage.setItem(storageKey, JSON.stringify(payload));
  } catch {
    // Ignore storage write errors.
  }
};
