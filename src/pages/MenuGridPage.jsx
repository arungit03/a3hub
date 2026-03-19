import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  BarChart3,
  BellRing,
  BookOpen,
  Bot,
  CalendarDays,
  ChevronRight,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Code2,
  CreditCard,
  FileText,
  GraduationCap,
  Landmark,
  Megaphone,
  NotebookPen,
  Sparkles,
  X,
} from "lucide-react";
import { departments } from "../data/departments";
import { menuItems } from "../data/menuItems";
import { useAuth } from "../state/auth";
import {
  db,
  ensureFirebaseStorage,
  getStorageForBucket,
  storageBuckets,
} from "../lib/firebase";
import {
  createBulkUserNotifications,
  createUserNotification,
  getStudentRecipientIds,
  notificationTypes,
} from "../lib/notifications";
import { uploadFileToCloudinary } from "../lib/cloudinaryUpload";
import {
  getGeminiApiKey,
  requestGeminiDailyPythonChallenges,
  requestGeminiDailyPythonSolution,
  requestGeminiInterviewQuizAndContactPlaces,
} from "../lib/geminiClient";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import {
  ACTION_BADGE_CLASS,
  ASSIGNMENT_FILE_MAX_SIZE_BYTES,
  ASSIGNMENT_TYPE_LABEL,
  ASSIGNMENT_TYPE_VALUE,
  buildStudentDetails,
  calendarTypeOptions,
  clearDailyPythonChallengeCache,
  DAILY_CHALLENGE_TTL_MS,
  DAILY_PYTHON_CHALLENGE_COUNT,
  DAILY_PYTHON_CHALLENGE_COLLECTION,
  DAILY_PYTHON_PROGRESS_COLLECTION,
  formatChallengeDateTime,
  formatDateKey,
  formatDateTimeLabel,
  formatFileSize,
  formatAssignmentDueLabel,
  getAssignmentUploadErrorMessage,
  getAssignmentDueMillis,
  getCalendarDateParts,
  getCalendarTypeMeta,
  getMillis,
  getNoticeMeta,
  getPreviousDateKey,
  hasValidDailyPythonChallenges,
  isValidDailyPythonChallenge,
  isAssignmentClosed,
  loadDailyPythonChallengeCache,
  normalizeDepartment,
  saveDailyPythonChallengeCache,
  SERVICE_CARD_META,
  toDisplayValue,
  toInputValue,
} from "../features/menuGrid/menuGridHelpers.js";
import {
  executePythonWithInput,
  generateDailyPythonChallenges,
  getDailyPythonCorrectCode,
  outputsMatch,
} from "../features/menuGrid/menuGridDailyPython.js";

const semesterOptions = Array.from({ length: 8 }, (_, index) => `Semester ${index + 1}`);

const getSemesterNumber = (value) => {
  const match = String(value || "").match(/\d+/);
  return match ? Number(match[0]) : 999;
};

const shouldRetryWithNextBucket = (error) => {
  const code = error?.code || "";
  if (
    code === "storage/bucket-not-found" ||
    code === "storage/project-not-found" ||
    code === "storage/invalid-argument"
  ) {
    return true;
  }
  const message = error?.message || "";
  return /bucket/i.test(message);
};

const getNoticeUploadErrorMessage = (error) => {
  const code = error?.code || "";
  if (code === "storage/unauthenticated") {
    return "Upload requires a signed-in account.";
  }
  if (code === "storage/unauthorized") {
    return "Upload blocked by Storage rules or billing. Check Firebase Storage rules and plan.";
  }
  if (code === "storage/bucket-not-found" || code === "storage/project-not-found") {
    return "Storage bucket not found. Enable Firebase Storage and verify storageBucket in firebase config.";
  }
  if (code === "storage/bucket-not-configured") {
    return "Storage bucket not configured. Add the bucket name in firebase config.";
  }
  if (code === "storage/quota-exceeded") {
    return "Storage quota exceeded. Free up space or upgrade the plan.";
  }
  if (code === "storage/retry-limit-exceeded") {
    return "Network issue while uploading. Please try again.";
  }
  if (code) {
    return `Publish failed (${code}). Please try again.`;
  }
  return "Publish failed. Please try again.";
};

const uploadNoticeFile = async ({ file, noticeId }) => {
  const buckets = storageBuckets?.length ? storageBuckets : [];
  if (buckets.length === 0) {
    const error = new Error("Storage bucket not configured.");
    error.code = "storage/bucket-not-configured";
    throw error;
  }

  let lastError = null;
  for (let index = 0; index < buckets.length; index += 1) {
    const bucket = buckets[index];
    const bucketStorage =
      index === 0
        ? await ensureFirebaseStorage()
        : await getStorageForBucket(bucket);
    if (!bucketStorage) {
      const error = new Error("Storage bucket not configured.");
      error.code = "storage/bucket-not-configured";
      throw error;
    }
    const storageRef = ref(
      bucketStorage,
      `notices/${noticeId}/${file.name}`
    );
    try {
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      return { url, bucket };
    } catch (error) {
      lastError = error;
      if (!shouldRetryWithNextBucket(error)) {
        throw error;
      }
    }
  }

  throw lastError || new Error("Upload failed.");
};

const INTERVIEW_QUIZ_AI_CACHE_KEY = "a3hub:interview-quiz-contact:v1";
const formatInterviewQuizDateLabel = (dateKey) => {
  if (!dateKey) return "";
  const date = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
};

const INTERVIEW_QUIZ_FALLBACK_COMPANIES = [
  {
    company: "TCS",
    quizTopic: "Data structures and coding basics",
    qa: [
      {
        question: "How do you find duplicate values in an array?",
        answer:
          "Use a hash set while iterating. If an element is already in the set, it is a duplicate.",
      },
      {
        question: "What is the time complexity of binary search?",
        answer: "Binary search runs in O(log n) on a sorted list.",
      },
      {
        question: "Why are functions useful in Python?",
        answer:
          "Functions help reuse logic, reduce repetition, and make code easier to test and maintain.",
      },
    ],
  },
  {
    company: "Infosys",
    quizTopic: "Python fundamentals and problem solving",
    qa: [
      {
        question: "Difference between list and tuple in Python?",
        answer:
          "Lists are mutable, tuples are immutable. Tuples are often used for fixed collections.",
      },
      {
        question: "How do you reverse a string in Python?",
        answer: "Use slicing: s[::-1].",
      },
      {
        question: "How to handle division-by-zero safely?",
        answer:
          "Use try-except and catch ZeroDivisionError so the program does not crash.",
      },
    ],
  },
  {
    company: "Wipro",
    quizTopic: "SQL and backend logic",
    qa: [
      {
        question: "What is an SQL JOIN?",
        answer:
          "A JOIN combines rows from two or more tables using a related column.",
      },
      {
        question: "Difference between WHERE and HAVING?",
        answer:
          "WHERE filters rows before grouping; HAVING filters grouped results after aggregation.",
      },
      {
        question: "How do indexes help databases?",
        answer:
          "Indexes speed up reads by reducing full-table scans, with some extra storage/write cost.",
      },
    ],
  },
  {
    company: "Zoho",
    quizTopic: "Web basics and API design",
    qa: [
      {
        question: "What are HTTP status codes 200, 404, and 500?",
        answer:
          "200 means success, 404 means resource not found, and 500 means server error.",
      },
      {
        question: "What is JSON used for?",
        answer:
          "JSON is a lightweight text format used for data exchange between client and server.",
      },
      {
        question: "Why validate API input?",
        answer:
          "Validation prevents bad data, improves security, and returns clear error messages.",
      },
    ],
  },
  {
    company: "HCL",
    quizTopic: "OOP and debugging",
    qa: [
      {
        question: "What is encapsulation in OOP?",
        answer:
          "Encapsulation bundles data and methods inside a class and controls access through methods.",
      },
      {
        question: "How do you debug a failing program quickly?",
        answer:
          "Reproduce reliably, check logs, isolate the failing part, inspect variables, and test the fix.",
      },
      {
        question: "What is the benefit of unit tests?",
        answer:
          "Unit tests verify small logic blocks and catch regressions early during development.",
      },
    ],
  },
];

const INTERVIEW_CONTACT_PLACE_FALLBACK = [
  {
    place: "TIDEL Park",
    city: "Chennai",
    description:
      "Major IT campus with frequent hiring drives and networking events.",
  },
  {
    place: "ELCOT IT Park",
    city: "Coimbatore",
    description:
      "Technology hub where product and service companies conduct interviews.",
  },
  {
    place: "SIPCOT IT Park",
    city: "Siruseri, Chennai",
    description:
      "Large IT corridor with many companies and regular walk-in opportunities.",
  },
  {
    place: "DLF IT Park",
    city: "Chennai",
    description:
      "Corporate office cluster with multi-company recruitment activities.",
  },
  {
    place: "Ramanujan IT City",
    city: "Chennai",
    description:
      "Common location for interview rounds and technical screening events.",
  },
  {
    place: "KGiSL IT Park",
    city: "Coimbatore",
    description:
      "Known for software and BPO hiring with entry-level technical roles.",
  },
  {
    place: "Madurai ELCOT IT Park",
    city: "Madurai",
    description:
      "Regional IT center with opportunities for graduates and support roles.",
  },
  {
    place: "Trichy IT Park",
    city: "Tiruchirappalli",
    description:
      "Growing technology zone with campus and off-campus interview activities.",
  },
  {
    place: "NIT Trichy Career Events",
    city: "Tiruchirappalli",
    description:
      "Career fairs and technical events where companies scout candidates.",
  },
  {
    place: "Anna University Placement Cell",
    city: "Chennai",
    description:
      "Strong placement ecosystem and shared announcements for interview drives.",
  },
];

const getInterviewQuizFallbackPayload = ({ companyCount = 5, placeCount = 10 }) => ({
  companies: INTERVIEW_QUIZ_FALLBACK_COMPANIES.slice(0, companyCount),
  contactPlaces: INTERVIEW_CONTACT_PLACE_FALLBACK.slice(0, placeCount),
});

const readInterviewQuizAiCache = (dateKey) => {
  if (typeof window === "undefined" || !dateKey) return null;
  try {
    const raw = window.localStorage.getItem(INTERVIEW_QUIZ_AI_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const hasCompanies = Array.isArray(parsed?.companies) && parsed.companies.length > 0;
    const hasPlaces = Array.isArray(parsed?.contactPlaces) && parsed.contactPlaces.length > 0;
    if (parsed?.dateKey !== dateKey || !hasCompanies || !hasPlaces) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};

const writeInterviewQuizAiCache = ({ dateKey, companies, contactPlaces }) => {
  if (typeof window === "undefined" || !dateKey) return;
  if (!Array.isArray(companies) || !Array.isArray(contactPlaces)) return;
  try {
    window.localStorage.setItem(
      INTERVIEW_QUIZ_AI_CACHE_KEY,
      JSON.stringify({
        dateKey,
        companies,
        contactPlaces,
        cachedAt: new Date().toISOString(),
      })
    );
  } catch {
    // Cache is best-effort only.
  }
};

export default function MenuGridPage({ forcedStaff }) {
  const { role, user, profile } = useAuth();
  const isStaff =
    typeof forcedStaff === "boolean" ? forcedStaff : role === "staff";
  const isStudent = !isStaff && role === "student";
  const location = useLocation();
  const navigate = useNavigate();
  const [activeModule, setActiveModule] = useState(null);
  const [draft, setDraft] = useState("");
  const [loadingDraft, setLoadingDraft] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [noticeTitle, setNoticeTitle] = useState("");
  const [noticeMessage, setNoticeMessage] = useState("");
  const [noticeDepartment, setNoticeDepartment] = useState("");
  const [noticeFiles, setNoticeFiles] = useState([]);
  const [noticeStatus, setNoticeStatus] = useState("");
  const [creatingNotice, setCreatingNotice] = useState(false);
  const [circularsOpen, setCircularsOpen] = useState(false);
  const [circularsEntries, setCircularsEntries] = useState([]);
  const [loadingCirculars, setLoadingCirculars] = useState(false);
  const [circularsError, setCircularsError] = useState("");
  const [assignmentsOpen, setAssignmentsOpen] = useState(false);
  const [assignmentEntries, setAssignmentEntries] = useState([]);
  const [loadingAssignments, setLoadingAssignments] = useState(false);
  const [assignmentsError, setAssignmentsError] = useState("");
  const [assignmentsStatus, setAssignmentsStatus] = useState("");
  const [creatingAssignment, setCreatingAssignment] = useState(false);
  const [removingAssignmentId, setRemovingAssignmentId] = useState("");
  const [assignmentForm, setAssignmentForm] = useState({
    title: "",
    description: "",
    submitEnd: "",
  });
  const [assignmentFile, setAssignmentFile] = useState(null);
  const [studentSubmissionsByAssignment, setStudentSubmissionsByAssignment] =
    useState({});
  const [loadingStudentSubmissions, setLoadingStudentSubmissions] = useState(false);
  const [submissionFilesByAssignment, setSubmissionFilesByAssignment] = useState({});
  const [submissionStatusByAssignment, setSubmissionStatusByAssignment] = useState({});
  const [submittingAssignmentId, setSubmittingAssignmentId] = useState("");
  const [staffSubmissionAssignmentId, setStaffSubmissionAssignmentId] = useState("");
  const [staffSubmissions, setStaffSubmissions] = useState([]);
  const [loadingStaffSubmissions, setLoadingStaffSubmissions] = useState(false);
  const [staffSubmissionsError, setStaffSubmissionsError] = useState("");
  const [codeLearningOpen, setCodeLearningOpen] = useState(false);
  const [dailyPythonOpen, setDailyPythonOpen] = useState(false);
  const [studentDetailsOpen, setStudentDetailsOpen] = useState(false);
  const [studentDetailsStudents, setStudentDetailsStudents] = useState([]);
  const [loadingStudentDetailsStudents, setLoadingStudentDetailsStudents] =
    useState(false);
  const [studentDetailsStudentsError, setStudentDetailsStudentsError] =
    useState("");
  const [studentDetailsStudentId, setStudentDetailsStudentId] = useState("");
  const [dailyPythonChallenges, setDailyPythonChallenges] = useState([]);
  const [loadingDailyPythonChallenges, setLoadingDailyPythonChallenges] = useState(false);
  const [dailyPythonError, setDailyPythonError] = useState("");
  const [dailyPythonExpiresAt, setDailyPythonExpiresAt] = useState(null);
  const [dailyPythonGeneratedAtKey, setDailyPythonGeneratedAtKey] = useState("");
  const [dailyPythonSolvedIds, setDailyPythonSolvedIds] = useState([]);
  const [dailyPythonStreak, setDailyPythonStreak] = useState(0);
  const [dailyPythonBestStreak, setDailyPythonBestStreak] = useState(0);
  const [dailyPythonTotalSolved, setDailyPythonTotalSolved] = useState(0);
  const [dailyPythonDaysParticipated, setDailyPythonDaysParticipated] = useState(0);
  const [dailyPythonProgressError, setDailyPythonProgressError] = useState("");
  const [dailyPythonStatus, setDailyPythonStatus] = useState("");
  const [savingDailyPythonChallengeId, setSavingDailyPythonChallengeId] = useState("");
  const [checkingDailyPythonChallengeId, setCheckingDailyPythonChallengeId] = useState("");
  const [dailyPythonCodeByChallengeId, setDailyPythonCodeByChallengeId] = useState({});
  const [dailyPythonReviewByChallengeId, setDailyPythonReviewByChallengeId] = useState({});
  const [dailyPythonCheckedIds, setDailyPythonCheckedIds] = useState([]);
  const [dailyPythonReloadToken, setDailyPythonReloadToken] = useState(0);
  const [interviewQuizOpen, setInterviewQuizOpen] = useState(false);
  const [interviewQuizLoading, setInterviewQuizLoading] = useState(false);
  const [interviewQuizError, setInterviewQuizError] = useState("");
  const [interviewQuizDateLabel, setInterviewQuizDateLabel] = useState("");
  const [interviewQuizCompanies, setInterviewQuizCompanies] = useState([]);
  const [interviewContactPlaces, setInterviewContactPlaces] = useState([]);
  const [activeNotice, setActiveNotice] = useState(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarEntries, setCalendarEntries] = useState([]);
  const [loadingCalendar, setLoadingCalendar] = useState(false);
  const [calendarError, setCalendarError] = useState("");
  const [calendarStatus, setCalendarStatus] = useState("");
  const [savingCalendarEntry, setSavingCalendarEntry] = useState(false);
  const [deletingCalendarEntryId, setDeletingCalendarEntryId] = useState("");
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [calendarForm, setCalendarForm] = useState({
    date: "",
    type: "event",
    title: "",
    note: "",
  });
  const [feesOpen, setFeesOpen] = useState(false);
  const [feesEntries, setFeesEntries] = useState([]);
  const [loadingFees, setLoadingFees] = useState(false);
  const [feesError, setFeesError] = useState("");
  const [feesStatus, setFeesStatus] = useState("");
  const [feesStudents, setFeesStudents] = useState([]);
  const [loadingFeesStudents, setLoadingFeesStudents] = useState(false);
  const [feeStudentId, setFeeStudentId] = useState("");
  const [feeSemesterFilter, setFeeSemesterFilter] = useState("all");
  const [creatingFee, setCreatingFee] = useState(false);
  const [updatingFeeId, setUpdatingFeeId] = useState("");
  const [removingFeeId, setRemovingFeeId] = useState("");
  const [feeForm, setFeeForm] = useState({
    semester: semesterOptions[0],
    type: "Tuition Fee",
    totalAmount: "",
    paidAmount: "",
  });
  const [panelNotices, setPanelNotices] = useState([]);
  const [panelAssignments, setPanelAssignments] = useState([]);
  const [panelLeaveUpdates, setPanelLeaveUpdates] = useState([]);
  const [updatesDrawerOpen, setUpdatesDrawerOpen] = useState(false);
  const fileInputRef = useRef(null);
  const assignmentFileInputRef = useRef(null);
  const leavePath = "/leavemanagement/menu";
  const examSchedulePath = isStaff ? "/staff/exam-schedule" : "/student/exam-schedule";
  const basePath = isStaff ? "/staff" : "/student";
  const isAssignmentsPageRoute = /\/menu\/assignments\/?$/.test(location.pathname);
  const isDailyPythonPageRoute = /\/menu\/daily-python-challenges\/?$/.test(
    location.pathname
  );
  const isStudentDetailsPageRoute = /\/menu\/student-details\/?$/.test(location.pathname);
  const isAssignmentsVisible = assignmentsOpen || isAssignmentsPageRoute;
  const isDailyPythonVisible = !isStaff && (dailyPythonOpen || isDailyPythonPageRoute);
  const isStudentDetailsVisible = studentDetailsOpen || isStudentDetailsPageRoute;

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const openValue = (params.get("open") || "").trim().toLowerCase();
    const hashValue = (location.hash || "").replace(/^#/, "").trim().toLowerCase();
    const shouldOpenFees = openValue === "fees" || hashValue === "fees";
    const shouldOpenCodeLearning =
      openValue === "code-learning" ||
      openValue === "coding" ||
      hashValue === "code-learning" ||
      hashValue === "coding";
    const shouldOpenCirculars =
      openValue === "circulars" ||
      openValue === "notices" ||
      hashValue === "circulars" ||
      hashValue === "notices";
    const shouldOpenAssignments =
      openValue === "assignments" ||
      hashValue === "assignments" ||
      isAssignmentsPageRoute;
    const shouldOpenDailyPython =
      (!isStaff &&
        (openValue === "daily-python-challenges" ||
          openValue === "daily-python" ||
          hashValue === "daily-python-challenges" ||
          hashValue === "daily-python")) ||
      isDailyPythonPageRoute;
    const shouldOpenStudentDetails =
      openValue === "student-details" ||
      hashValue === "student-details" ||
      isStudentDetailsPageRoute;
    if (shouldOpenCodeLearning) {
      navigate(`${basePath}/learning`, { replace: true });
      return;
    }
    if (
      !shouldOpenFees &&
      !shouldOpenAssignments &&
      !shouldOpenDailyPython &&
      !shouldOpenCirculars &&
      !shouldOpenStudentDetails
    ) {
      setAssignmentsOpen(false);
      setDailyPythonOpen(false);
      setCircularsOpen(false);
      setCodeLearningOpen(false);
      setStudentDetailsOpen(false);
      return;
    }

    setActiveModule(null);
    setCalendarOpen(false);
    setCircularsOpen(false);
    setAssignmentsOpen(shouldOpenAssignments);
    setCircularsOpen(shouldOpenCirculars);
    setCodeLearningOpen(false);
    setDailyPythonOpen(shouldOpenDailyPython);
    setInterviewQuizOpen(false);
    setStudentDetailsOpen(shouldOpenStudentDetails);
    setFeesOpen(shouldOpenFees);
    setFeeSemesterFilter("all");
    setFeesStatus("");
    setFeesError("");
    setAssignmentsStatus("");
    setAssignmentsError("");
  }, [
    basePath,
    isAssignmentsPageRoute,
    isDailyPythonPageRoute,
    isStaff,
    isStudentDetailsPageRoute,
    location.hash,
    location.search,
    navigate,
  ]);

  useEffect(() => {
    const assignmentsQuery = query(
      collection(db, "assignments"),
      orderBy("createdAt", "desc"),
      limit(60)
    );

    const unsubscribe = onSnapshot(
      assignmentsQuery,
      (snapshot) => {
        const entries = snapshot.docs.map((item) => ({
          id: item.id,
          ...item.data(),
        }));
        const openAssignments = entries.filter((item) => !isAssignmentClosed(item));
        setPanelAssignments(
          openAssignments.slice(0, 3).map((item) => ({
            id: item.id,
            title: item.title || "Assignment",
            subtitle: `Due ${formatAssignmentDueLabel(item)}`,
            time: getAssignmentDueMillis(item),
          }))
        );
      },
      () => {
        setPanelAssignments([]);
      }
    );

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const noticesQuery = query(
      collection(db, "notices"),
      orderBy("createdAt", "desc"),
      limit(4)
    );

    const unsubscribe = onSnapshot(
      noticesQuery,
      (snapshot) => {
        setPanelNotices(
          snapshot.docs.map((item) => {
            const data = item.data();
            return {
              id: item.id,
              title: data?.title || "New notice posted",
              subtitle: data?.message || "",
              time: getMillis(data?.createdAt),
            };
          })
        );
      },
      () => setPanelNotices([])
    );

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user?.uid) {
      setPanelLeaveUpdates([]);
      return undefined;
    }

    const leaveQuery = isStaff
      ? query(collection(db, "leaveRequests"), orderBy("createdAt", "desc"), limit(5))
      : query(collection(db, "leaveRequests"), where("studentId", "==", user.uid), limit(5));

    const unsubscribe = onSnapshot(
      leaveQuery,
      (snapshot) => {
        const next = snapshot.docs
          .map((item) => {
            const data = item.data();
            const normalizedStatus = String(data?.status || "pending").toLowerCase();
            const statusLabel =
              normalizedStatus === "approved" || normalizedStatus === "take"
                ? "Approved"
                : normalizedStatus === "rejected" || normalizedStatus === "notake"
                ? "Rejected"
                : "Pending";
            return {
              id: item.id,
              title: `Leave ${statusLabel}`,
              subtitle: data?.reason || "Leave request update",
              time: getMillis(data?.updatedAt || data?.createdAt),
            };
          })
          .sort((a, b) => b.time - a.time);
        setPanelLeaveUpdates(next.slice(0, 3));
      },
      () => setPanelLeaveUpdates([])
    );

    return () => unsubscribe();
  }, [isStaff, user?.uid]);

  useEffect(() => {
    setDailyPythonCheckedIds([]);
  }, [user?.uid]);

  useEffect(() => {
    let alive = true;
    if (!activeModule) return undefined;

    setLoadingDraft(true);
    setStatus("");
    setDraft("");

    const load = async () => {
      try {
        const snapshot = await getDoc(doc(db, "modules", activeModule.id));
        if (!alive) return;
        if (snapshot.exists()) {
          const data = snapshot.data();
          setDraft(data?.content || "");
        }
      } catch {
        if (!alive) return;
        setStatus("Unable to load existing content.");
      } finally {
        if (alive) setLoadingDraft(false);
      }
    };

    load();

    return () => {
      alive = false;
    };
  }, [activeModule]);

  useEffect(() => {
    if (!isAssignmentsVisible) return undefined;

    setLoadingAssignments(true);
    setAssignmentsError("");

    const assignmentsQuery = query(
      collection(db, "assignments"),
      orderBy("createdAt", "desc"),
      limit(50)
    );

    const unsubscribe = onSnapshot(
      assignmentsQuery,
      (snapshot) => {
        const next = snapshot.docs
          .map((item) => ({
            id: item.id,
            ...item.data(),
          }))
          .filter((assignment) => {
            const dueMillis = getAssignmentDueMillis(assignment);
            if (isStaff) return true;
            return !dueMillis || dueMillis > Date.now();
          });

        setAssignmentEntries(next);
        setLoadingAssignments(false);
        setAssignmentsError("");
      },
      () => {
        setAssignmentEntries([]);
        setLoadingAssignments(false);
        setAssignmentsError("Unable to load assignments.");
      }
    );

    return () => unsubscribe();
  }, [isAssignmentsVisible, isStaff]);

  useEffect(() => {
    if (!isAssignmentsVisible || isStaff || !user?.uid) {
      setStudentSubmissionsByAssignment({});
      setLoadingStudentSubmissions(false);
      return undefined;
    }

    setLoadingStudentSubmissions(true);
    const submissionsQuery = query(
      collection(db, "assignmentSubmissions"),
      where("studentId", "==", user.uid)
    );

    const unsubscribe = onSnapshot(
      submissionsQuery,
      (snapshot) => {
        const byAssignment = {};
        snapshot.docs.forEach((item) => {
          const data = item.data();
          const assignmentId = String(data?.assignmentId || "").trim();
          if (!assignmentId) return;
          byAssignment[assignmentId] = {
            id: item.id,
            ...data,
          };
        });
        setStudentSubmissionsByAssignment(byAssignment);
        setLoadingStudentSubmissions(false);
      },
      () => {
        setStudentSubmissionsByAssignment({});
        setLoadingStudentSubmissions(false);
      }
    );

    return () => unsubscribe();
  }, [isAssignmentsVisible, isStaff, user?.uid]);

  useEffect(() => {
    if (!isAssignmentsVisible || !isStaff || !staffSubmissionAssignmentId) {
      setStaffSubmissions([]);
      setLoadingStaffSubmissions(false);
      setStaffSubmissionsError("");
      return undefined;
    }

    setLoadingStaffSubmissions(true);
    setStaffSubmissionsError("");

    const submissionsQuery = query(
      collection(db, "assignmentSubmissions"),
      where("assignmentId", "==", staffSubmissionAssignmentId)
    );

    const unsubscribe = onSnapshot(
      submissionsQuery,
      (snapshot) => {
        const next = snapshot.docs
          .map((item) => ({
            id: item.id,
            ...item.data(),
          }))
          .sort((a, b) => {
            const aMillis = getMillis(a?.updatedAt || a?.submittedAt);
            const bMillis = getMillis(b?.updatedAt || b?.submittedAt);
            return bMillis - aMillis;
          });
        setStaffSubmissions(next);
        setLoadingStaffSubmissions(false);
      },
      () => {
        setStaffSubmissions([]);
        setLoadingStaffSubmissions(false);
        setStaffSubmissionsError("Unable to load student submissions.");
      }
    );

    return () => unsubscribe();
  }, [isAssignmentsVisible, isStaff, staffSubmissionAssignmentId]);

  useEffect(() => {
    if (!circularsOpen) return undefined;

    setLoadingCirculars(true);
    setCircularsError("");

    const departmentKey = normalizeDepartment(
      profile?.departmentKey || profile?.department
    );
    const knownDepartments = departments.map(normalizeDepartment);
    const hasDepartmentFilter =
      departmentKey && knownDepartments.includes(departmentKey);
    const shouldFilterByDepartment = !isStaff && hasDepartmentFilter;

    let unsubscribe = () => {};
    try {
      const noticesQuery = query(
        collection(db, "notices"),
        ...(shouldFilterByDepartment
          ? [where("departmentKey", "in", ["all", departmentKey])]
          : []),
        orderBy("createdAt", "desc"),
        limit(25)
      );

      unsubscribe = onSnapshot(
        noticesQuery,
        (snapshot) => {
          const next = snapshot.docs.map((item) => ({
            id: item.id,
            ...item.data(),
          }));
          setCircularsEntries(next);
          setLoadingCirculars(false);
          setCircularsError("");
        },
        () => {
          setCircularsEntries([]);
          setLoadingCirculars(false);
          setCircularsError("Unable to load circulars.");
        }
      );
    } catch {
      setCircularsEntries([]);
      setLoadingCirculars(false);
      setCircularsError("Unable to load circulars.");
    }

    return () => unsubscribe();
  }, [circularsOpen, isStaff, profile?.department, profile?.departmentKey]);

  useEffect(() => {
    if (!calendarOpen) return undefined;

    setLoadingCalendar(true);
    setCalendarError("");

    let unsubscribe = () => {};
    try {
      const calendarQuery = query(
        collection(db, "academicCalendarEntries"),
        orderBy("dateKey", "asc")
      );

      unsubscribe = onSnapshot(
        calendarQuery,
        (snapshot) => {
          const next = snapshot.docs.map((item) => ({
            id: item.id,
            ...item.data(),
          }));
          setCalendarEntries(next);
          setLoadingCalendar(false);
          setCalendarError("");
        },
        () => {
          setCalendarError("Unable to load calendar.");
          setLoadingCalendar(false);
        }
      );
    } catch {
      setCalendarError("Unable to load calendar.");
      setLoadingCalendar(false);
    }

    return () => unsubscribe();
  }, [calendarOpen]);

  useEffect(() => {
    if (!isStudentDetailsVisible || !isStaff) return undefined;

    setLoadingStudentDetailsStudents(true);
    setStudentDetailsStudentsError("");

    let unsubscribe = () => {};
    try {
      const studentsQuery = query(
        collection(db, "users"),
        where("role", "==", "student")
      );

      unsubscribe = onSnapshot(
        studentsQuery,
        (snapshot) => {
          const next = snapshot.docs
            .map((item) => {
              const data = item.data() || {};
              const name =
                toInputValue(data?.name) || toInputValue(data?.email) || "Student";
              return {
                id: item.id,
                name,
                email: toInputValue(data?.email),
                details: buildStudentDetails(data),
              };
            })
            .sort((a, b) => a.name.localeCompare(b.name));

          setStudentDetailsStudents(next);
          setLoadingStudentDetailsStudents(false);
          setStudentDetailsStudentId((previous) => {
            if (previous && next.some((item) => item.id === previous)) {
              return previous;
            }
            return next[0]?.id || "";
          });
        },
        () => {
          setStudentDetailsStudents([]);
          setStudentDetailsStudentId("");
          setLoadingStudentDetailsStudents(false);
          setStudentDetailsStudentsError("Unable to load students right now.");
        }
      );
    } catch {
      setStudentDetailsStudents([]);
      setStudentDetailsStudentId("");
      setLoadingStudentDetailsStudents(false);
      setStudentDetailsStudentsError("Unable to load students right now.");
    }

    return () => unsubscribe();
  }, [isStaff, isStudentDetailsVisible]);

  useEffect(() => {
    if (!feesOpen || !isStaff) return undefined;

    setLoadingFeesStudents(true);

    let unsubscribe = () => {};
    try {
      const studentsQuery = query(
        collection(db, "users"),
        where("role", "==", "student")
      );

      unsubscribe = onSnapshot(
        studentsQuery,
        (snapshot) => {
          const next = snapshot.docs
            .map((item) => ({ id: item.id, ...item.data() }))
            .map((student) => ({
              ...student,
              name: student?.name || student?.email || "Student",
            }))
            .sort((a, b) => a.name.localeCompare(b.name));

          setFeesStudents(next);
          setLoadingFeesStudents(false);

          if (!next.length) {
            setFeeStudentId("");
            return;
          }

          const selectedExists = next.some((student) => student.id === feeStudentId);
          if (!selectedExists) {
            setFeeStudentId(next[0].id);
          }
        },
        () => {
          setFeesStudents([]);
          setFeeStudentId("");
          setLoadingFeesStudents(false);
        }
      );
    } catch {
      setFeesStudents([]);
      setFeeStudentId("");
      setLoadingFeesStudents(false);
    }

    return () => unsubscribe();
  }, [feesOpen, isStaff, feeStudentId]);

  useEffect(() => {
    if (!feesOpen) return undefined;

    const targetStudentId = isStaff ? feeStudentId : user?.uid || "";
    if (!targetStudentId) {
      setFeesEntries([]);
      setLoadingFees(false);
      setFeesError("");
      return undefined;
    }

    setLoadingFees(true);
    setFeesError("");

    let unsubscribe = () => {};
    try {
      const feesQuery = query(
        collection(db, "fees"),
        where("studentId", "==", targetStudentId)
      );

      unsubscribe = onSnapshot(
        feesQuery,
        (snapshot) => {
          const next = snapshot.docs
            .map((item) => ({ id: item.id, ...item.data() }))
            .sort((a, b) => {
              const semesterCompare = getSemesterNumber(a?.semester) - getSemesterNumber(b?.semester);
              if (semesterCompare !== 0) return semesterCompare;
              const aTime =
                a?.updatedAt?.toMillis?.() ||
                a?.createdAt?.toMillis?.() ||
                0;
              const bTime =
                b?.updatedAt?.toMillis?.() ||
                b?.createdAt?.toMillis?.() ||
                0;
              return bTime - aTime;
            });
          setFeesEntries(next);
          setLoadingFees(false);
          setFeesError("");
        },
        () => {
          setFeesEntries([]);
          setLoadingFees(false);
          setFeesError("Unable to load fees.");
        }
      );
    } catch {
      setFeesEntries([]);
      setLoadingFees(false);
      setFeesError("Unable to load fees.");
    }

    return () => unsubscribe();
  }, [feesOpen, isStaff, feeStudentId, user?.uid]);

  useEffect(() => {
    if (isStaff || !user?.uid) return undefined;
    let cancelled = false;

    const cleanupExpiredDailyChallenges = async () => {
      const challengeRef = doc(
        db,
        DAILY_PYTHON_CHALLENGE_COLLECTION,
        user.uid
      );

      try {
        const snapshot = await getDoc(challengeRef);
        if (!snapshot.exists() || cancelled) return;

        const expiresMs = getMillis(snapshot.data()?.expiresAt);
        if (expiresMs && expiresMs <= Date.now()) {
          await deleteDoc(challengeRef);
        }
      } catch {
        // Best-effort cleanup only.
      }
    };

    cleanupExpiredDailyChallenges();

    return () => {
      cancelled = true;
    };
  }, [isStaff, user?.uid]);

  useEffect(() => {
    if (!dailyPythonOpen || isStaff) return undefined;
    let cancelled = false;

    const loadDailyChallenges = async () => {
      if (!user?.uid) {
        if (cancelled) return;
        setDailyPythonChallenges([]);
        setDailyPythonExpiresAt(null);
        setDailyPythonGeneratedAtKey("");
        setDailyPythonSolvedIds([]);
        setDailyPythonStatus("");
        setDailyPythonError("Sign in to load daily Python challenges.");
        return;
      }

      if (!cancelled) {
        setLoadingDailyPythonChallenges(true);
        setDailyPythonError("");
      }

      const challengeRef = doc(
        db,
        DAILY_PYTHON_CHALLENGE_COLLECTION,
        user.uid
      );
      const nowMs = Date.now();
      const dateKey = formatDateKey(new Date());

      try {
        const snapshot = await getDoc(challengeRef);
        if (cancelled) return;

        if (snapshot.exists()) {
          const data = snapshot.data();
          const expiresMs = getMillis(data?.expiresAt);
          const generatedAtKey =
            typeof data?.generatedAtKey === "string" ? data.generatedAtKey : "";
          const hasValidChallenges =
            hasValidDailyPythonChallenges(data?.challenges) &&
            expiresMs > nowMs &&
            generatedAtKey === dateKey;

          if (hasValidChallenges) {
            setDailyPythonChallenges(data.challenges);
            setDailyPythonExpiresAt(data.expiresAt);
            setDailyPythonGeneratedAtKey(
              generatedAtKey
            );
            setLoadingDailyPythonChallenges(false);
            return;
          }

          if (expiresMs && expiresMs <= nowMs) {
            try {
              await deleteDoc(challengeRef);
            } catch {
              // Cleanup failure should not block regeneration.
            }
          } else if (expiresMs > nowMs) {
            try {
              await deleteDoc(challengeRef);
            } catch {
              // Ignore delete failure and continue with local regeneration.
            }
          }
        }

        const cachedChallenges = loadDailyPythonChallengeCache({
          userId: user.uid,
          expectedDateKey: dateKey,
          nowMs,
        });
        if (cachedChallenges) {
          setDailyPythonChallenges(cachedChallenges.challenges);
          setDailyPythonExpiresAt(cachedChallenges.expiresAt);
          setDailyPythonGeneratedAtKey(cachedChallenges.generatedAtKey);
          setDailyPythonStatus("");
          setLoadingDailyPythonChallenges(false);
          return;
        }

        let generatedChallenges = [];
        let generationSource = "template";
        const apiKey = getGeminiApiKey();

        if (apiKey) {
          try {
            const aiResult = await requestGeminiDailyPythonChallenges({
              apiKey,
              dateKey,
              count: DAILY_PYTHON_CHALLENGE_COUNT,
            });

            const normalizedAiChallenges = [];

            for (let index = 0; index < aiResult.challenges.length; index += 1) {
              const challenge = aiResult.challenges[index] || {};
              const normalizedChallenge = {
                id: `${dateKey}-ai-generated-${index + 1}`,
                title: String(challenge.title || "").trim(),
                topic: String(challenge.topic || "Python").trim(),
                difficulty: String(challenge.difficulty || "Medium").trim(),
                statement: String(challenge.statement || "").trim(),
                inputFormat: String(challenge.inputFormat || "").trim(),
                outputFormat: String(challenge.outputFormat || "").trim(),
                sampleInput: String(challenge.sampleInput || "").trim(),
                sampleOutput: String(challenge.sampleOutput || "").trim(),
                hint: String(challenge.hint || "").trim(),
                solutionCode: String(challenge.solutionCode || "").trim(),
              };

              if (!isValidDailyPythonChallenge(normalizedChallenge)) {
                continue;
              }

              try {
                const computedOutput = await executePythonWithInput({
                  sourceCode: normalizedChallenge.solutionCode,
                  stdin: normalizedChallenge.sampleInput || "",
                });
                const finalizedOutput = String(computedOutput).trim();
                if (finalizedOutput) {
                  normalizedChallenge.sampleOutput = finalizedOutput;
                }
              } catch {
                // Keep model-provided output as fallback.
              }

              normalizedAiChallenges.push(normalizedChallenge);
            }

            if (normalizedAiChallenges.length >= DAILY_PYTHON_CHALLENGE_COUNT) {
              generatedChallenges = normalizedAiChallenges.slice(
                0,
                DAILY_PYTHON_CHALLENGE_COUNT
              );
              generationSource = "ai";
              if (!cancelled) {
                setDailyPythonStatus("Generated fresh AI quizzes for today.");
              }
            }
          } catch {
            if (!cancelled) {
              setDailyPythonStatus(
                "AI generation unavailable right now. Using fallback challenge set."
              );
            }
          }
        }

        if (!hasValidDailyPythonChallenges(generatedChallenges)) {
          generatedChallenges = generateDailyPythonChallenges(dateKey);
          generationSource = "template";
        }

        const createdAt = new Date();
        const expiresAt = new Date(createdAt.getTime() + DAILY_CHALLENGE_TTL_MS);

        const payload = {
          generatedAtKey: dateKey,
          source: generationSource,
          generatedBy: user.uid,
          generatedByName: profile?.name || (isStaff ? "Staff" : "Student"),
          createdAt,
          expiresAt,
          challenges: generatedChallenges,
        };

        try {
          await setDoc(challengeRef, payload);
        } catch (error) {
          console.error("Daily Python challenge sync failed:", error);
          if (!cancelled) {
            setDailyPythonError(
              "Showing local AI challenges. Update Firestore rules to sync 24h rotation."
            );
          }
        }

        saveDailyPythonChallengeCache({
          userId: user.uid,
          generatedAtKey: dateKey,
          challenges: generatedChallenges,
          expiresAt,
        });

        if (cancelled) return;
        setDailyPythonChallenges(generatedChallenges);
        setDailyPythonExpiresAt(expiresAt);
        setDailyPythonGeneratedAtKey(dateKey);
      } catch {
        if (cancelled) return;
        const cachedChallenges = loadDailyPythonChallengeCache({
          userId: user?.uid,
          expectedDateKey: dateKey,
          nowMs,
        });
        if (cachedChallenges) {
          setDailyPythonChallenges(cachedChallenges.challenges);
          setDailyPythonExpiresAt(cachedChallenges.expiresAt);
          setDailyPythonGeneratedAtKey(cachedChallenges.generatedAtKey);
          setDailyPythonStatus("");
          setDailyPythonError("");
        } else {
          clearDailyPythonChallengeCache(user?.uid);
          setDailyPythonChallenges([]);
          setDailyPythonExpiresAt(null);
          setDailyPythonGeneratedAtKey("");
          setDailyPythonSolvedIds([]);
          setDailyPythonStatus("");
          setDailyPythonError("Unable to load daily Python challenges.");
        }
      } finally {
        if (!cancelled) {
          setLoadingDailyPythonChallenges(false);
        }
      }
    };

    loadDailyChallenges();

    return () => {
      cancelled = true;
    };
  }, [dailyPythonOpen, dailyPythonReloadToken, isStaff, profile?.name, user?.uid]);

  useEffect(() => {
    if (!dailyPythonOpen || isStaff || !user?.uid) {
      setDailyPythonSolvedIds([]);
      setDailyPythonStreak(0);
      setDailyPythonBestStreak(0);
      setDailyPythonTotalSolved(0);
      setDailyPythonDaysParticipated(0);
      setDailyPythonProgressError("");
      return undefined;
    }

    const progressRef = doc(db, DAILY_PYTHON_PROGRESS_COLLECTION, user.uid);
    setDailyPythonProgressError("");

    const unsubscribe = onSnapshot(
      progressRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          setDailyPythonSolvedIds([]);
          setDailyPythonStreak(0);
          setDailyPythonBestStreak(0);
          setDailyPythonTotalSolved(0);
          setDailyPythonDaysParticipated(0);
          return;
        }

        const data = snapshot.data();
        const currentDayKey =
          typeof data?.currentDayKey === "string" ? data.currentDayKey : "";
        const rawSolvedIds = Array.isArray(data?.solvedChallengeIds)
          ? data.solvedChallengeIds.filter((value) => typeof value === "string")
          : [];
        const solvedIdsForCurrentDay =
          dailyPythonGeneratedAtKey && currentDayKey === dailyPythonGeneratedAtKey
            ? rawSolvedIds
            : [];

        setDailyPythonSolvedIds(solvedIdsForCurrentDay);
        setDailyPythonStreak(Number(data?.dailyStreak || 0));
        setDailyPythonBestStreak(Number(data?.bestStreak || 0));
        setDailyPythonTotalSolved(Number(data?.totalSolvedChallenges || 0));
        setDailyPythonDaysParticipated(Number(data?.daysParticipated || 0));
      },
      () => {
        setDailyPythonProgressError("Unable to load solved tracking right now.");
      }
    );

    return () => unsubscribe();
  }, [dailyPythonOpen, dailyPythonGeneratedAtKey, isStaff, user?.uid]);

  useEffect(() => {
    if (!dailyPythonOpen || !dailyPythonExpiresAt) return undefined;

    const expiresMs = getMillis(dailyPythonExpiresAt);
    if (!expiresMs) return undefined;

    const delayMs = Math.max(0, expiresMs - Date.now() + 1000);
    const timerId = window.setTimeout(() => {
      setDailyPythonReloadToken((prev) => prev + 1);
    }, delayMs);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [dailyPythonOpen, dailyPythonExpiresAt]);

  useEffect(() => {
    if (!dailyPythonOpen || dailyPythonChallenges.length === 0) return;

    setDailyPythonCodeByChallengeId((prev) => {
      const validIds = new Set(
        dailyPythonChallenges
          .map((challenge) => challenge?.id)
          .filter(Boolean)
      );
      const next = {};
      Object.keys(prev).forEach((key) => {
        if (validIds.has(key)) {
          next[key] = prev[key];
        }
      });
      dailyPythonChallenges.forEach((challenge) => {
        if (!challenge?.id) return;
        if (!next[challenge.id]) {
          next[challenge.id] = "# Write your Python solution here\n";
        }
      });
      return next;
    });

    setDailyPythonReviewByChallengeId((prev) => {
      const validIds = new Set(
        dailyPythonChallenges
          .map((challenge) => challenge?.id)
          .filter(Boolean)
      );
      const next = {};
      Object.keys(prev).forEach((key) => {
        if (validIds.has(key)) {
          next[key] = prev[key];
        }
      });
      return next;
    });

    setDailyPythonCheckedIds((prev) => {
      const validIds = new Set(
        dailyPythonChallenges
          .map((challenge) => challenge?.id)
          .filter(Boolean)
      );
      return prev.filter((challengeId) => validIds.has(challengeId));
    });
  }, [dailyPythonOpen, dailyPythonChallenges]);

  useEffect(() => {
    if (!interviewQuizOpen || !isStudent) {
      setInterviewQuizLoading(false);
      return undefined;
    }

    const dateKey = formatDateKey(new Date());
    const fallbackPayload = getInterviewQuizFallbackPayload({
      companyCount: 5,
      placeCount: 10,
    });
    setInterviewQuizDateLabel(formatInterviewQuizDateLabel(dateKey));
    setInterviewQuizLoading(true);
    setInterviewQuizError("");

    const cached = readInterviewQuizAiCache(dateKey);
    if (cached) {
      setInterviewQuizCompanies(cached.companies || []);
      setInterviewContactPlaces(cached.contactPlaces || []);
      setInterviewQuizLoading(false);
      return undefined;
    }

    let cancelled = false;

    const loadInterviewQuiz = async () => {
      try {
        const apiKey = getGeminiApiKey();
        if (!apiKey) {
          const missingKeyError = new Error("Gemini API key is missing.");
          missingKeyError.code = "gemini/missing-api-key";
          throw missingKeyError;
        }

        const result = await requestGeminiInterviewQuizAndContactPlaces({
          apiKey,
          dateKey,
          companyCount: 5,
          placeCount: 10,
        });

        if (cancelled) return;

        const companies = Array.isArray(result?.companies) ? result.companies : [];
        const contactPlaces = Array.isArray(result?.contactPlaces)
          ? result.contactPlaces
          : [];
        const finalCompanies =
          companies.length > 0
            ? companies.slice(0, 5)
            : fallbackPayload.companies;
        const finalContactPlaces =
          contactPlaces.length > 0
            ? contactPlaces.slice(0, 10)
            : fallbackPayload.contactPlaces;

        if (finalCompanies.length === 0 && finalContactPlaces.length === 0) {
          throw new Error("No interview quiz data returned.");
        }

        setInterviewQuizCompanies(finalCompanies);
        setInterviewContactPlaces(finalContactPlaces);
        setInterviewQuizError("");
        writeInterviewQuizAiCache({
          dateKey,
          companies: finalCompanies,
          contactPlaces: finalContactPlaces,
        });
      } catch {
        if (cancelled) return;
        setInterviewQuizCompanies(fallbackPayload.companies);
        setInterviewContactPlaces(fallbackPayload.contactPlaces);
        setInterviewQuizError("");
        writeInterviewQuizAiCache({
          dateKey,
          companies: fallbackPayload.companies,
          contactPlaces: fallbackPayload.contactPlaces,
        });
      } finally {
        if (!cancelled) {
          setInterviewQuizLoading(false);
        }
      }
    };

    loadInterviewQuiz();

    return () => {
      cancelled = true;
    };
  }, [interviewQuizOpen, isStudent]);

  const handleSave = async () => {
    if (!activeModule) return;
    setSaving(true);
    setStatus("");
    try {
      await setDoc(
        doc(db, "modules", activeModule.id),
        {
          content: draft,
          label: activeModule.label,
          updatedAt: serverTimestamp(),
          updatedBy: user?.uid || null,
        },
        { merge: true }
      );
      setStatus("Saved for students to view.");
    } catch {
      setStatus("Save failed. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleCreateNotice = async (event) => {
    event.preventDefault();
    if (!isStaff || creatingNotice) return;

    const trimmedTitle = noticeTitle.trim();
    const trimmedMessage = noticeMessage.trim();
    const normalizedDepartment = normalizeDepartment(noticeDepartment);
    const departmentKey = normalizedDepartment || "all";
    const departmentLabel = normalizedDepartment
      ? noticeDepartment.trim()
      : "All Departments";

    if (!trimmedTitle && !trimmedMessage && noticeFiles.length === 0) {
      setNoticeStatus("Add a title, message, or file to share.");
      return;
    }

    setCreatingNotice(true);
    setNoticeStatus("");

    try {
      const noticeRef = doc(collection(db, "notices"));
      const payload = {
        title: trimmedTitle || "Notice",
        message: trimmedMessage,
        createdAt: serverTimestamp(),
        createdBy: user?.uid || null,
        createdByName: profile?.name || "Staff",
        departmentKey,
        departmentLabel,
        attachments: [],
      };

      await setDoc(noticeRef, payload);

      if (noticeFiles.length > 0) {
        const uploads = [];
        for (const file of noticeFiles) {
          const { url } = await uploadNoticeFile({
            file,
            noticeId: noticeRef.id,
          });
          uploads.push({
            name: file.name,
            url,
            size: file.size,
            type: file.type,
          });
        }

        await setDoc(noticeRef, { attachments: uploads }, { merge: true });
      }

      let noticeNotificationStatus = "";
      try {
        const recipients = await getStudentRecipientIds(db, {
          departmentKey,
        });

        if (recipients.length > 0) {
          const notificationSummary =
            trimmedMessage ||
            (trimmedTitle
              ? `New notice: ${trimmedTitle}`
              : "A new notice has been published.");

          await createBulkUserNotifications(db, {
            recipientIds: recipients,
            type: notificationTypes.NOTICE,
            priority: "normal",
            topic: notificationTypes.NOTICE,
            title: trimmedTitle || "New Notice",
            message: notificationSummary,
            link: "/student/home",
            sourceType: "notices",
            sourceId: noticeRef.id,
          });
        } else {
          noticeNotificationStatus =
            "Notice published. No students matched the selected department.";
        }
      } catch {
        noticeNotificationStatus =
          "Notice published, but notification delivery failed.";
      }

      setNoticeTitle("");
      setNoticeMessage("");
      setNoticeDepartment("");
      setNoticeFiles([]);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      setNoticeStatus(
        noticeNotificationStatus || "Notice published and notifications sent."
      );
    } catch (error) {
      console.error("Notice publish failed:", error);
      setNoticeStatus(getNoticeUploadErrorMessage(error));
    } finally {
      setCreatingNotice(false);
    }
  };

  const handleDeleteNotice = async (noticeId) => {
    if (!isStaff || !noticeId) return;
    const ok = window.confirm("This remove to directly remove in database");
    if (!ok) return;
    try {
      await deleteDoc(doc(db, "notices", noticeId));
      if (activeNotice?.id === noticeId) {
        setActiveNotice(null);
      }
    } catch {
      setNoticeStatus("Unable to remove notice.");
    }
  };

  const handleCreateAssignment = async (event) => {
    event.preventDefault();
    if (!isStaff || creatingAssignment) return;

    const title = assignmentForm.title.trim();
    const description = assignmentForm.description.trim();
    const type = ASSIGNMENT_TYPE_VALUE;
    const submitEnd = assignmentForm.submitEnd.trim();

    if (!title) {
      setAssignmentsStatus("Enter subject.");
      return;
    }

    if (!submitEnd) {
      setAssignmentsStatus("Choose submit last date.");
      return;
    }

    const dueDate = new Date(`${submitEnd}T23:59:59`);
    if (Number.isNaN(dueDate.getTime())) {
      setAssignmentsStatus("Submit last date is invalid.");
      return;
    }

    if (dueDate.getTime() <= Date.now()) {
      setAssignmentsStatus("Submit last date must be in the future.");
      return;
    }

    if (!assignmentFile) {
      setAssignmentsStatus("Attach assignment or quiz file.");
      return;
    }

    if (assignmentFile.size > ASSIGNMENT_FILE_MAX_SIZE_BYTES) {
      setAssignmentsStatus("File size must be 10 MB or less.");
      return;
    }

    setCreatingAssignment(true);
    setAssignmentsStatus("");

    try {
      const assignmentRef = doc(collection(db, "assignments"));
      const uploaded = await uploadFileToCloudinary({
        file: assignmentFile,
        folder: `a3hub/assignments/${assignmentRef.id}/question`,
      });

      await setDoc(assignmentRef, {
        title,
        description,
        type,
        submitEnd,
        dueAt: Timestamp.fromDate(dueDate),
        expiresAt: Timestamp.fromDate(dueDate),
        attachment: {
          name: assignmentFile.name,
          url: uploaded.url,
          size: assignmentFile.size,
          type: assignmentFile.type || "",
          provider: uploaded.provider || "cloudinary",
          publicId: uploaded.publicId || "",
        },
        createdAt: serverTimestamp(),
        createdBy: user?.uid || null,
        createdByName: profile?.name || "Staff",
      });

      setAssignmentForm({
        title: "",
        description: "",
        submitEnd: "",
      });
      setAssignmentFile(null);
      if (assignmentFileInputRef.current) {
        assignmentFileInputRef.current.value = "";
      }
      setAssignmentsStatus("Assignment published for students.");
    } catch (error) {
      setAssignmentsStatus(getAssignmentUploadErrorMessage(error));
    } finally {
      setCreatingAssignment(false);
    }
  };

  const handleDeleteAssignmentEntry = async (assignmentId) => {
    if (!isStaff || !assignmentId || removingAssignmentId) return;
    const ok = window.confirm("This remove to directly remove in database");
    if (!ok) return;

    setRemovingAssignmentId(assignmentId);
    try {
      await deleteDoc(doc(db, "assignments", assignmentId));
      if (staffSubmissionAssignmentId === assignmentId) {
        setStaffSubmissionAssignmentId("");
      }
    } catch {
      setAssignmentsStatus("Unable to remove assignment.");
    } finally {
      setRemovingAssignmentId("");
    }
  };

  const handleStudentAssignmentSubmit = async (assignment) => {
    if (!assignment?.id || isStaff || !user?.uid || submittingAssignmentId) return;

    const assignmentId = assignment.id;
    if (isAssignmentClosed(assignment)) {
      setSubmissionStatusByAssignment((prev) => ({
        ...prev,
        [assignmentId]: "Submission closed for this assignment.",
      }));
      return;
    }

    const file = submissionFilesByAssignment[assignmentId];
    if (!file) {
      setSubmissionStatusByAssignment((prev) => ({
        ...prev,
        [assignmentId]: "Choose your answer file before submit.",
      }));
      return;
    }

    if (file.size > ASSIGNMENT_FILE_MAX_SIZE_BYTES) {
      setSubmissionStatusByAssignment((prev) => ({
        ...prev,
        [assignmentId]: "File size must be 10 MB or less.",
      }));
      return;
    }

    setSubmittingAssignmentId(assignmentId);
    setSubmissionStatusByAssignment((prev) => ({
      ...prev,
      [assignmentId]: "",
    }));

    try {
      const uploaded = await uploadFileToCloudinary({
        file,
        folder: `a3hub/assignments/${assignmentId}/answers/${user.uid}`,
      });

      const submissionRef = doc(
        db,
        "assignmentSubmissions",
        `${assignmentId}_${user.uid}`
      );

      await setDoc(
        submissionRef,
        {
          assignmentId,
          assignmentTitle: assignment?.title || "Assignment",
          assignmentType: assignment?.type || "assignment",
          studentId: user.uid,
          studentName: profile?.name || "Student",
          studentEmail: user?.email || "",
          file: {
            name: file.name,
            url: uploaded.url,
            size: file.size,
            type: file.type || "",
            provider: uploaded.provider || "cloudinary",
            publicId: uploaded.publicId || "",
          },
          submittedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      setSubmissionFilesByAssignment((prev) => {
        const next = { ...prev };
        delete next[assignmentId];
        return next;
      });
      setSubmissionStatusByAssignment((prev) => ({
        ...prev,
        [assignmentId]: "Answer file submitted successfully.",
      }));
    } catch (error) {
      setSubmissionStatusByAssignment((prev) => ({
        ...prev,
        [assignmentId]: getAssignmentUploadErrorMessage(error),
      }));
    } finally {
      setSubmittingAssignmentId("");
    }
  };

  const openAssignmentsModal = () => {
    setActiveModule(null);
    setCalendarOpen(false);
    setCircularsOpen(false);
    setCodeLearningOpen(false);
    setDailyPythonOpen(false);
    setInterviewQuizOpen(false);
    setStudentDetailsOpen(false);
    setFeesOpen(false);
    setAssignmentsOpen(true);
    setAssignmentsStatus("");
    setAssignmentsError("");
    navigate(`${basePath}/menu/assignments`);
  };

  const closeAssignmentsModal = () => {
    setAssignmentsOpen(false);
    setAssignmentsStatus("");
    setAssignmentFile(null);
    setSubmissionFilesByAssignment({});
    setSubmissionStatusByAssignment({});
    setStaffSubmissionAssignmentId("");
    setStaffSubmissions([]);
    setStaffSubmissionsError("");
    if (assignmentFileInputRef.current) {
      assignmentFileInputRef.current.value = "";
    }

    if (isAssignmentsPageRoute) {
      navigate(`${basePath}/menu`);
      return;
    }

    const params = new URLSearchParams(location.search);
    const openValue = (params.get("open") || "").trim().toLowerCase();
    const hashValue = (location.hash || "").replace(/^#/, "").trim().toLowerCase();

    if (openValue === "assignments" || hashValue === "assignments") {
      navigate(`${basePath}/menu`, { replace: true });
    }
  };

  const openCircularsModal = () => {
    setActiveModule(null);
    setCalendarOpen(false);
    setAssignmentsOpen(false);
    setFeesOpen(false);
    setCodeLearningOpen(false);
    setDailyPythonOpen(false);
    setInterviewQuizOpen(false);
    setStudentDetailsOpen(false);
    setCircularsOpen(true);
    setCircularsError("");
    setNoticeStatus("");
  };

  const closeCircularsModal = () => {
    setCircularsOpen(false);
    setActiveNotice(null);
    setNoticeStatus("");

    const params = new URLSearchParams(location.search);
    const openValue = (params.get("open") || "").trim().toLowerCase();
    const hashValue = (location.hash || "").replace(/^#/, "").trim().toLowerCase();
    const hasCircularsOpenParam =
      openValue === "circulars" || openValue === "notices";
    const hasCircularsHash = hashValue === "circulars" || hashValue === "notices";

    if (hasCircularsOpenParam) {
      params.delete("open");
      const nextSearch = params.toString();
      navigate(
        {
          pathname: location.pathname,
          search: nextSearch ? `?${nextSearch}` : "",
          hash: hasCircularsHash ? "" : location.hash,
        },
        { replace: true }
      );
      return;
    }

    if (hasCircularsHash) {
      navigate(
        {
          pathname: location.pathname,
          search: location.search,
          hash: "",
        },
        { replace: true }
      );
    }
  };

  const openCalendarModal = () => {
    setActiveModule(null);
    setCircularsOpen(false);
    setAssignmentsOpen(false);
    setFeesOpen(false);
    setCodeLearningOpen(false);
    setDailyPythonOpen(false);
    setInterviewQuizOpen(false);
    setStudentDetailsOpen(false);
    setCalendarOpen(true);
    setCalendarStatus("");
    setCalendarError("");
  };

  const closeCalendarModal = () => {
    setCalendarOpen(false);
    setCalendarStatus("");
  };

  const openFeesModal = () => {
    setActiveModule(null);
    setCalendarOpen(false);
    setCircularsOpen(false);
    setAssignmentsOpen(false);
    setCodeLearningOpen(false);
    setDailyPythonOpen(false);
    setInterviewQuizOpen(false);
    setStudentDetailsOpen(false);
    setFeesOpen(true);
    setFeeSemesterFilter("all");
    setFeesStatus("");
    setFeesError("");
  };

  const closeFeesModal = () => {
    setFeesOpen(false);
    setFeesStatus("");

    const params = new URLSearchParams(location.search);
    const openValue = (params.get("open") || "").trim().toLowerCase();
    const hashValue = (location.hash || "").replace(/^#/, "").trim().toLowerCase();

    if (openValue === "fees") {
      params.delete("open");
      const nextSearch = params.toString();
      navigate(
        {
          pathname: location.pathname,
          search: nextSearch ? `?${nextSearch}` : "",
          hash: hashValue === "fees" ? "" : location.hash,
        },
        { replace: true }
      );
      return;
    }

    if (hashValue === "fees") {
      navigate(
        {
          pathname: location.pathname,
          search: location.search,
          hash: "",
        },
        { replace: true }
      );
    }
  };

  const openCodeLearningModal = () => {
    navigate(`${basePath}/learning`);
  };

  const closeCodeLearningModal = () => {
    setCodeLearningOpen(false);

    const params = new URLSearchParams(location.search);
    const openValue = (params.get("open") || "").trim().toLowerCase();
    const hashValue = (location.hash || "").replace(/^#/, "").trim().toLowerCase();
    const openedFromQuery =
      openValue === "code-learning" || openValue === "coding";
    const openedFromHash =
      hashValue === "code-learning" || hashValue === "coding";

    if (openedFromQuery) {
      params.delete("open");
      const nextSearch = params.toString();
      navigate(
        {
          pathname: location.pathname,
          search: nextSearch ? `?${nextSearch}` : "",
          hash: openedFromHash ? "" : location.hash,
        },
        { replace: true }
      );
      return;
    }

    if (openedFromHash) {
      navigate(
        {
          pathname: location.pathname,
          search: location.search,
          hash: "",
        },
        { replace: true }
      );
    }
  };

  const openCodeLearningRoute = (language) => {
    setCodeLearningOpen(false);
    navigate(`${basePath}/code/${language}`);
  };

  const openDailyPythonModal = () => {
    if (isStaff) return;
    setActiveModule(null);
    setCalendarOpen(false);
    setCircularsOpen(false);
    setAssignmentsOpen(false);
    setFeesOpen(false);
    setCodeLearningOpen(false);
    setInterviewQuizOpen(false);
    setStudentDetailsOpen(false);
    setDailyPythonOpen(false);
    setDailyPythonError("");
    setDailyPythonProgressError("");
    setDailyPythonStatus("");
    navigate(`${basePath}/menu/daily-python-challenges`);
  };

  const openInterviewQuizModal = () => {
    if (!isStudent) return;
    setActiveModule(null);
    setCalendarOpen(false);
    setCircularsOpen(false);
    setAssignmentsOpen(false);
    setFeesOpen(false);
    setCodeLearningOpen(false);
    setDailyPythonOpen(false);
    setStudentDetailsOpen(false);
    setInterviewQuizOpen(true);
    setInterviewQuizError("");
  };

  const closeInterviewQuizModal = () => {
    setInterviewQuizOpen(false);
  };

  const openStudentDetailsModal = () => {
    if (!isStaff) return;
    setActiveModule(null);
    setCalendarOpen(false);
    setCircularsOpen(false);
    setAssignmentsOpen(false);
    setFeesOpen(false);
    setCodeLearningOpen(false);
    setDailyPythonOpen(false);
    setInterviewQuizOpen(false);
    setStudentDetailsOpen(true);
    setStudentDetailsStudentsError("");
    navigate(`${basePath}/menu/student-details`);
  };

  const closeStudentDetailsModal = () => {
    setStudentDetailsOpen(false);
    if (isStudentDetailsPageRoute) {
      navigate(`${basePath}/menu`);
      return;
    }

    const params = new URLSearchParams(location.search);
    const openValue = (params.get("open") || "").trim().toLowerCase();
    const hashValue = (location.hash || "").replace(/^#/, "").trim().toLowerCase();

    if (openValue === "student-details" || hashValue === "student-details") {
      navigate(`${basePath}/menu`, { replace: true });
    }
  };

  const closeDailyPythonModal = () => {
    setDailyPythonOpen(false);
    setDailyPythonStatus("");
    setSavingDailyPythonChallengeId("");
    setCheckingDailyPythonChallengeId("");
    setDailyPythonReviewByChallengeId({});

    if (isDailyPythonPageRoute) {
      navigate(`${basePath}/menu`);
      return;
    }

    const params = new URLSearchParams(location.search);
    const openValue = (params.get("open") || "").trim().toLowerCase();
    const hashValue = (location.hash || "").replace(/^#/, "").trim().toLowerCase();
    const hasDailyOpenParam =
      openValue === "daily-python-challenges" || openValue === "daily-python";
    const hasDailyHash =
      hashValue === "daily-python-challenges" || hashValue === "daily-python";

    if (hasDailyOpenParam || hasDailyHash) {
      navigate(`${basePath}/menu`, { replace: true });
    }
  };

  const handleDailyPythonCodeChange = (challengeId, value) => {
    if (!challengeId) return;
    setDailyPythonCodeByChallengeId((prev) => ({
      ...prev,
      [challengeId]: value,
    }));
    setDailyPythonReviewByChallengeId((prev) => {
      if (!prev[challengeId]) return prev;
      const next = { ...prev };
      delete next[challengeId];
      return next;
    });
  };

  const handleCheckDailyPythonChallenge = async (challenge) => {
    if (!challenge?.id || isStaff || !user?.uid) return;
    if (dailyPythonCheckedIds.includes(challenge.id)) return;

    const submittedCode = (dailyPythonCodeByChallengeId[challenge.id] || "").trim();
    const expectedOutput = String(challenge.sampleOutput || "").trim();
    if (!submittedCode) {
      setDailyPythonReviewByChallengeId((prev) => ({
        ...prev,
        [challenge.id]: {
          status: "error",
          message: "Enter your code before checking.",
        },
      }));
      return;
    }

    setDailyPythonCheckedIds((prev) =>
      prev.includes(challenge.id) ? prev : [...prev, challenge.id]
    );
    setCheckingDailyPythonChallengeId(challenge.id);
    setDailyPythonProgressError("");
    setDailyPythonStatus("");

    const resolveCorrectPythonCode = async () => {
      let correctPythonCode = getDailyPythonCorrectCode(challenge);
      if (correctPythonCode) {
        return correctPythonCode;
      }

      const apiKey = getGeminiApiKey();
      if (!apiKey) {
        return "";
      }

      try {
        const aiSolution = await requestGeminiDailyPythonSolution({
          apiKey,
          challenge: {
            ...challenge,
            sampleOutput: expectedOutput,
          },
        });
        const generatedCode = String(aiSolution?.solutionCode || "").trim();
        if (!generatedCode) {
          return "";
        }

        let isValidGeneratedCode = false;
        try {
          const generatedOutput = await executePythonWithInput({
            sourceCode: generatedCode,
            stdin: challenge.sampleInput || "",
          });
          isValidGeneratedCode = outputsMatch(generatedOutput, expectedOutput);
        } catch {
          isValidGeneratedCode = false;
        }

        if (!isValidGeneratedCode) {
          return "";
        }

        setDailyPythonChallenges((prev) =>
          prev.map((item) =>
            item?.id === challenge.id
              ? {
                  ...item,
                  solutionCode: generatedCode,
                }
              : item
          )
        );
        return generatedCode;
      } catch {
        return "";
      }
    };

    try {
      const actualOutput = await executePythonWithInput({
        sourceCode: submittedCode,
        stdin: challenge.sampleInput || "",
      });
      const passed = outputsMatch(actualOutput, expectedOutput);

      if (passed) {
        setDailyPythonReviewByChallengeId((prev) => ({
          ...prev,
          [challenge.id]: {
            status: "pass",
            message: "AI check passed for sample test. Progress updated.",
          },
        }));
        await handleMarkDailyPythonChallengeSolved(challenge);
      } else {
        let correctPythonCode = await resolveCorrectPythonCode();

        if (!correctPythonCode) {
          correctPythonCode = "Unable to generate correct Python code right now. Try checking again.";
        }

        setDailyPythonReviewByChallengeId((prev) => ({
          ...prev,
          [challenge.id]: {
            status: "fail",
            message: "AI check failed. Output does not match expected result.",
            correctAnswer: String(expectedOutput),
            actualOutput: String(actualOutput).trim() || "(no output)",
            correctPythonCode,
          },
        }));
      }
    } catch (error) {
      const runtimeError =
        String(error?.message || "").trim() || "Unable to run code.";
      let correctPythonCode = await resolveCorrectPythonCode();
      if (!correctPythonCode) {
        correctPythonCode = "Unable to generate correct Python code right now. Try checking again.";
      }

      setDailyPythonReviewByChallengeId((prev) => ({
        ...prev,
        [challenge.id]: {
          status: "fail",
          message: "AI check failed. Code could not run on sample input.",
          correctAnswer: expectedOutput || "(no expected output)",
          actualOutput: `Runtime error: ${runtimeError}`,
          correctPythonCode,
        },
      }));
    } finally {
      setCheckingDailyPythonChallengeId("");
    }
  };

  const handleMarkDailyPythonChallengeSolved = async (challenge) => {
    if (!user?.uid || isStaff || !challenge?.id || !dailyPythonGeneratedAtKey) return;
    if (dailyPythonSolvedIds.includes(challenge.id)) {
      setDailyPythonStatus("Already marked as solved.");
      return;
    }

    setSavingDailyPythonChallengeId(challenge.id);
    setDailyPythonProgressError("");
    setDailyPythonStatus("");

    try {
      const progressRef = doc(db, DAILY_PYTHON_PROGRESS_COLLECTION, user.uid);
      const txResult = await runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(progressRef);
        const existing = snapshot.exists() ? snapshot.data() : {};

        const currentDayKey =
          typeof existing?.currentDayKey === "string" ? existing.currentDayKey : "";
        const existingSolvedIds =
          currentDayKey === dailyPythonGeneratedAtKey &&
          Array.isArray(existing?.solvedChallengeIds)
            ? existing.solvedChallengeIds.filter((value) => typeof value === "string")
            : [];

        if (existingSolvedIds.includes(challenge.id)) {
          return {
            alreadySolved: true,
            nextStreak: Number(existing?.dailyStreak || 0),
          };
        }

        const nextSolvedIds = [...existingSolvedIds, challenge.id];
        const existingStreak = Number(existing?.dailyStreak || 0);
        const existingBestStreak = Number(existing?.bestStreak || 0);
        const existingDaysParticipated = Number(existing?.daysParticipated || 0);
        const existingTotalSolved = Number(existing?.totalSolvedChallenges || 0);
        const lastSolvedDayKey =
          typeof existing?.lastSolvedDayKey === "string" ? existing.lastSolvedDayKey : "";

        let nextStreak = existingStreak;
        let nextDaysParticipated = existingDaysParticipated;
        if (lastSolvedDayKey !== dailyPythonGeneratedAtKey) {
          const previousDayKey = getPreviousDateKey(dailyPythonGeneratedAtKey);
          nextStreak = lastSolvedDayKey === previousDayKey ? existingStreak + 1 : 1;
          nextDaysParticipated = existingDaysParticipated + 1;
        }

        const nextBestStreak = Math.max(existingBestStreak, nextStreak);
        const nextTotalSolved = existingTotalSolved + 1;

        transaction.set(
          progressRef,
          {
            studentId: user.uid,
            currentDayKey: dailyPythonGeneratedAtKey,
            solvedChallengeIds: nextSolvedIds,
            solvedCount: nextSolvedIds.length,
            totalSolvedChallenges: nextTotalSolved,
            daysParticipated: nextDaysParticipated,
            dailyStreak: nextStreak,
            bestStreak: nextBestStreak,
            lastSolvedDayKey: dailyPythonGeneratedAtKey,
            lastSolvedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );

        return {
          alreadySolved: false,
          nextStreak,
        };
      });

      if (txResult?.alreadySolved) {
        setDailyPythonStatus("Already marked as solved.");
      } else {
        setDailyPythonStatus(
          `Solved saved. Current streak: ${txResult?.nextStreak || 1} day${
            (txResult?.nextStreak || 1) === 1 ? "" : "s"
          }.`
        );
      }
    } catch {
      setDailyPythonProgressError("Unable to save solved progress. Please try again.");
    } finally {
      setSavingDailyPythonChallengeId("");
    }
  };

  const handleCalendarMonthMove = (offset) => {
    setCalendarMonth((prev) => {
      const next = new Date(prev.getFullYear(), prev.getMonth() + offset, 1);
      return next;
    });
  };

  const handleCreateCalendarEntry = async (event) => {
    event.preventDefault();
    if (!isStaff || savingCalendarEntry) return;

    const title = calendarForm.title.trim();
    const note = calendarForm.note.trim();

    if (!calendarForm.date) {
      setCalendarStatus("Select a date.");
      return;
    }

    if (!title) {
      setCalendarStatus("Enter event/holiday title.");
      return;
    }

    setSavingCalendarEntry(true);
    setCalendarStatus("");

    try {
      await addDoc(collection(db, "academicCalendarEntries"), {
        dateKey: calendarForm.date,
        type: getCalendarTypeMeta(calendarForm.type).value,
        title,
        note,
        createdAt: serverTimestamp(),
        createdBy: user?.uid || null,
      });

      const selectedDate = new Date(`${calendarForm.date}T00:00:00`);
      if (!Number.isNaN(selectedDate.getTime())) {
        setCalendarMonth(
          new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1)
        );
      }

      setCalendarForm((prev) => ({
        ...prev,
        title: "",
        note: "",
      }));
      setCalendarStatus("Calendar entry saved.");
    } catch {
      setCalendarStatus("Unable to save calendar entry.");
    } finally {
      setSavingCalendarEntry(false);
    }
  };

  const handleDeleteCalendarEntry = async (entryId) => {
    if (!isStaff || !entryId || deletingCalendarEntryId) return;

    setDeletingCalendarEntryId(entryId);
    setCalendarStatus("");
    try {
      await deleteDoc(doc(db, "academicCalendarEntries", entryId));
      setCalendarStatus("Calendar entry removed.");
    } catch {
      setCalendarStatus("Unable to remove calendar entry.");
    } finally {
      setDeletingCalendarEntryId("");
    }
  };

  const handleCreateFee = async (event) => {
    event.preventDefault();
    if (!isStaff || creatingFee) return;

    const selectedStudent = feesStudents.find((student) => student.id === feeStudentId);
    const feeType = feeForm.type.trim();
    const totalAmountValue = Number(feeForm.totalAmount);
    const paidAmountValue =
      feeForm.paidAmount === "" ? 0 : Number(feeForm.paidAmount);

    if (!selectedStudent) {
      setFeesStatus("Choose a student.");
      return;
    }

    if (!feeForm.semester) {
      setFeesStatus("Choose semester.");
      return;
    }

    if (!feeType) {
      setFeesStatus("Enter fee type.");
      return;
    }

    if (!Number.isFinite(totalAmountValue) || totalAmountValue <= 0) {
      setFeesStatus("Enter a valid total amount.");
      return;
    }

    if (!Number.isFinite(paidAmountValue) || paidAmountValue < 0) {
      setFeesStatus("Enter a valid paid amount.");
      return;
    }

    if (paidAmountValue > totalAmountValue) {
      setFeesStatus("Paid amount cannot exceed total amount.");
      return;
    }

    const normalizedTotal = Math.round(totalAmountValue * 100) / 100;
    const normalizedPaid = Math.round(paidAmountValue * 100) / 100;
    const normalizedPending = Math.max(
      0,
      Math.round((normalizedTotal - normalizedPaid) * 100) / 100
    );

    setCreatingFee(true);
    setFeesStatus("");

    try {
      const feeRef = await addDoc(collection(db, "fees"), {
        studentId: selectedStudent.id,
        studentName: selectedStudent.name || selectedStudent.email || "Student",
        semester: feeForm.semester,
        feeType,
        amount: normalizedTotal,
        totalAmount: normalizedTotal,
        paidAmount: normalizedPaid,
        pendingAmount: normalizedPending,
        paid: normalizedPending <= 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: user?.uid || null,
        updatedBy: user?.uid || null,
      });

      let feeNotificationStatus = "";
      if (normalizedPending > 0) {
        try {
          await createUserNotification(db, {
            recipientId: selectedStudent.id,
            type: notificationTypes.FEE_DUE,
            priority: "urgent",
            topic: notificationTypes.FEE_DUE,
            title: `Fee due: ${feeForm.semester}`,
            message: `Pending Rs. ${normalizedPending.toLocaleString("en-IN")} for ${feeType}.`,
            link: "/student/menu?open=fees",
            sourceType: "fees",
            sourceId: feeRef.id,
          });
        } catch {
          feeNotificationStatus =
            "Fee added, but due alert notification could not be sent.";
        }
      }

      setFeeForm((prev) => ({
        ...prev,
        type: "Tuition Fee",
        totalAmount: "",
        paidAmount: "",
      }));
      setFeesStatus(
        feeNotificationStatus ||
          (normalizedPending > 0
            ? "Fee added and due alert sent."
            : "Fee added successfully.")
      );
    } catch {
      setFeesStatus("Unable to add fee.");
    } finally {
      setCreatingFee(false);
    }
  };

  const handleToggleFeePaid = async (entry) => {
    if (!isStaff || !entry?.id || updatingFeeId) return;

    const totalAmount = Number(entry?.totalAmount ?? entry?.amount ?? 0);
    const nextPaidAmount = entry?.paid ? 0 : totalAmount;
    const nextPendingAmount = Math.max(0, totalAmount - nextPaidAmount);

    setUpdatingFeeId(entry.id);
    setFeesStatus("");
    try {
      await setDoc(
        doc(db, "fees", entry.id),
        {
          amount: totalAmount,
          totalAmount,
          paidAmount: nextPaidAmount,
          pendingAmount: nextPendingAmount,
          paid: nextPendingAmount <= 0,
          updatedAt: serverTimestamp(),
          updatedBy: user?.uid || null,
        },
        { merge: true }
      );

      let statusMessage = "Fee status updated.";
      if (nextPendingAmount > 0 && entry?.studentId) {
        try {
          await createUserNotification(db, {
            recipientId: entry.studentId,
            type: notificationTypes.FEE_DUE,
            priority: "urgent",
            topic: notificationTypes.FEE_DUE,
            title: `Fee due: ${entry?.semester || "Semester"}`,
            message: `Pending Rs. ${nextPendingAmount.toLocaleString("en-IN")} for ${entry?.feeType || "fee item"}.`,
            link: "/student/menu?open=fees",
            sourceType: "fees",
            sourceId: entry.id,
          });
          statusMessage = "Fee status updated and due alert sent.";
        } catch {
          statusMessage =
            "Fee status updated, but due alert notification failed.";
        }
      }

      setFeesStatus(statusMessage);
    } catch {
      setFeesStatus("Unable to update fee status.");
    } finally {
      setUpdatingFeeId("");
    }
  };

  const handleDeleteFee = async (entryId) => {
    if (!isStaff || !entryId || removingFeeId) return;

    setRemovingFeeId(entryId);
    setFeesStatus("");
    try {
      await deleteDoc(doc(db, "fees", entryId));
      setFeesStatus("Fee removed.");
    } catch {
      setFeesStatus("Unable to remove fee.");
    } finally {
      setRemovingFeeId("");
    }
  };

  const monthLabel = calendarMonth.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
  const todayKey = formatDateKey(new Date());
  const monthPrefix = `${calendarMonth.getFullYear()}-${String(
    calendarMonth.getMonth() + 1
  ).padStart(2, "0")}`;

  const entriesByDate = new Map();
  calendarEntries.forEach((entry) => {
    const key = entry?.dateKey || "";
    if (!key) return;
    const existing = entriesByDate.get(key) || [];
    existing.push(entry);
    entriesByDate.set(key, existing);
  });

  const monthEntries = calendarEntries
    .filter((entry) => String(entry?.dateKey || "").startsWith(monthPrefix))
    .sort((a, b) => {
      const dateCompare = String(a?.dateKey || "").localeCompare(
        String(b?.dateKey || "")
      );
      if (dateCompare !== 0) return dateCompare;
      const aType = getCalendarTypeMeta(a?.type).value;
      const bType = getCalendarTypeMeta(b?.type).value;
      return aType.localeCompare(bType);
    });

  const firstDayOfMonth = new Date(
    calendarMonth.getFullYear(),
    calendarMonth.getMonth(),
    1
  );
  const startOffset = (firstDayOfMonth.getDay() + 6) % 7;
  const calendarStartDate = new Date(firstDayOfMonth);
  calendarStartDate.setDate(firstDayOfMonth.getDate() - startOffset);
  const calendarDays = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(calendarStartDate);
    date.setDate(calendarStartDate.getDate() + index);
    const dateKey = formatDateKey(date);
    return {
      date,
      dateKey,
      inMonth: date.getMonth() === calendarMonth.getMonth(),
      entries: entriesByDate.get(dateKey) || [],
    };
  });

  const visibleFeeSemesters = Array.from(
    new Set(
      feesEntries
        .map((entry) => entry?.semester)
        .filter((value) => typeof value === "string" && value.trim().length > 0)
    )
  ).sort((a, b) => getSemesterNumber(a) - getSemesterNumber(b));

  const semesterFilterOptions = isStaff
    ? semesterOptions
    : visibleFeeSemesters;

  const filteredFees = feesEntries.filter((entry) => {
    if (feeSemesterFilter === "all") return true;
    return entry?.semester === feeSemesterFilter;
  });

  const groupedFees = filteredFees.reduce((accumulator, entry) => {
    const semesterKey = entry?.semester || "Semester";
    if (!accumulator[semesterKey]) {
      accumulator[semesterKey] = [];
    }
    accumulator[semesterKey].push(entry);
    return accumulator;
  }, {});

  const groupedSemesterKeys = Object.keys(groupedFees).sort(
    (a, b) => getSemesterNumber(a) - getSemesterNumber(b)
  );

  const getEntryTotalAmount = (entry) =>
    Number(entry?.totalAmount ?? entry?.amount ?? 0);
  const getEntryPaidAmount = (entry) => {
    const explicitPaid = entry?.paidAmount;
    if (explicitPaid !== undefined && explicitPaid !== null) {
      return Number(explicitPaid || 0);
    }
    return entry?.paid ? getEntryTotalAmount(entry) : 0;
  };
  const getEntryPendingAmount = (entry) => {
    const explicitPending = entry?.pendingAmount;
    if (explicitPending !== undefined && explicitPending !== null) {
      return Number(explicitPending || 0);
    }
    return Math.max(0, getEntryTotalAmount(entry) - getEntryPaidAmount(entry));
  };

  const totalFeeAmount = filteredFees.reduce(
    (sum, entry) => sum + getEntryTotalAmount(entry),
    0
  );
  const paidFeeAmount = filteredFees.reduce(
    (sum, entry) => sum + getEntryPaidAmount(entry),
    0
  );
  const pendingFeeAmount = filteredFees.reduce(
    (sum, entry) => sum + getEntryPendingAmount(entry),
    0
  );
  const totalFeeAmountLabel = totalFeeAmount.toLocaleString("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  const paidFeeAmountLabel = paidFeeAmount.toLocaleString("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  const pendingFeeAmountLabel = pendingFeeAmount.toLocaleString("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  const feeFormTotalAmount =
    feeForm.totalAmount === "" ? 0 : Number(feeForm.totalAmount);
  const feeFormPaidAmount =
    feeForm.paidAmount === "" ? 0 : Number(feeForm.paidAmount);
  const feeFormPendingAmount =
    Number.isFinite(feeFormTotalAmount) && Number.isFinite(feeFormPaidAmount)
      ? Math.max(0, feeFormTotalAmount - feeFormPaidAmount)
      : 0;

  const selectedStudentDetailsStudent =
    studentDetailsStudents.find((item) => item.id === studentDetailsStudentId) ||
    null;
  const selectedStudentDetailsRows = selectedStudentDetailsStudent
    ? [
        {
          label: "Roll No",
          value: toDisplayValue(selectedStudentDetailsStudent.details.rollNo),
        },
        {
          label: "Department",
          value: toDisplayValue(selectedStudentDetailsStudent.details.department),
        },
        {
          label: "Email ID",
          value: toDisplayValue(selectedStudentDetailsStudent.details.email),
          mono: true,
        },
        {
          label: "Student's Mobile Number",
          value: toDisplayValue(selectedStudentDetailsStudent.details.studentMobile),
        },
        {
          label: "Blood Group",
          value: toDisplayValue(selectedStudentDetailsStudent.details.bloodGroup),
        },
        {
          label: "Father's Name",
          value: toDisplayValue(selectedStudentDetailsStudent.details.fatherName),
        },
        {
          label: "Mother's Name",
          value: toDisplayValue(selectedStudentDetailsStudent.details.motherName),
        },
        {
          label: "Father or Mother Mobile Number",
          value: toDisplayValue(selectedStudentDetailsStudent.details.parentMobile),
        },
      ]
    : [];

  const headerDisplayName = (() => {
    const rawName = String(
      profile?.name || user?.displayName || user?.email || "Arun"
    ).trim();
    if (!rawName) return "Arun";
    return rawName.split(/\s+/)[0] || rawName;
  })();
  const roleBadgeLabel = isStaff ? "Staff" : "Student";
  const attendanceSummary = (() => {
    const candidates = [
      profile?.attendancePercent,
      profile?.attendancePercentage,
      profile?.attendance,
      profile?.attendanceRate,
    ];
    for (const candidate of candidates) {
      if (candidate === null || candidate === undefined) continue;
      const parsed = Number(
        String(candidate)
          .replace("%", "")
          .trim()
      );
      if (Number.isFinite(parsed)) {
        return Math.max(0, Math.min(100, Math.round(parsed)));
      }
    }
    return isStaff ? 96 : 88;
  })();

  const openServiceDestination = (destination) => {
    if (!destination) return;
    if (destination === "__calendar__") {
      openCalendarModal();
      return;
    }
    if (destination === "__assignments__") {
      openAssignmentsModal();
      return;
    }
    if (destination === "__fees__") {
      openFeesModal();
      return;
    }
    if (destination === "__circulars__") {
      openCircularsModal();
      return;
    }
    if (destination === "__code_learning__") {
      openCodeLearningModal();
      return;
    }
    if (destination === "__daily_python_challenges__") {
      openDailyPythonModal();
      return;
    }
    if (destination === "__interview_quiz__") {
      openInterviewQuizModal();
      return;
    }
    if (destination === "__student_details__") {
      openStudentDetailsModal();
      return;
    }
    navigate(destination);
  };

  const serviceUpdates = useMemo(() => {
    const noticeItems = panelNotices.map((item) => ({
      id: `notice-${item.id}`,
      title: item.title,
      subtitle: "Recent notice",
      time: item.time,
      type: "notice",
    }));
    const assignmentItems = panelAssignments.map((item) => ({
      id: `assignment-${item.id}`,
      title: item.title,
      subtitle: item.subtitle,
      time: item.time,
      type: "assignment",
    }));
    const leaveItems = panelLeaveUpdates.map((item) => ({
      id: `leave-${item.id}`,
      title: item.title,
      subtitle: item.subtitle,
      time: item.time,
      type: "leave",
    }));

    const merged = [...noticeItems, ...assignmentItems, ...leaveItems]
      .filter((item) => item.time > 0)
      .sort((a, b) => b.time - a.time)
      .slice(0, 8);

    if (merged.length > 0) return merged;
    return [
      {
        id: "fallback-1",
        title: "Recent notices will appear here.",
        subtitle: "No live updates yet",
        time: Date.now(),
        type: "notice",
      },
      {
        id: "fallback-2",
        title: "Assignment deadlines and leave updates",
        subtitle: "Stay synced with campus workflow",
        time: Date.now() - 120000,
        type: "assignment",
      },
    ];
  }, [panelAssignments, panelLeaveUpdates, panelNotices]);

  return (
    <div className="menu-grid-page">
      {!isAssignmentsPageRoute && !isDailyPythonPageRoute && !isStudentDetailsPageRoute ? (
        <>
      <section className="relative overflow-hidden rounded-[1.8rem] border border-white/35 bg-gradient-to-br from-blue-600 via-indigo-600 to-indigo-700 p-5 text-white shadow-lg shadow-indigo-900/30 sm:p-6">
        <div className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-white/20 blur-3xl" />
        <div className="pointer-events-none absolute -left-12 bottom-0 h-32 w-32 rounded-full bg-cyan-300/20 blur-3xl" />

        <div className="relative rounded-2xl border border-white/20 bg-white/10 p-4 backdrop-blur-xl sm:p-5">
          <div
            className={`grid gap-4 lg:items-start ${
              isStaff ? "" : "lg:grid-cols-[minmax(0,1fr)_auto]"
            }`}
          >
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-100/90">
                A3 Hub - Campus Services
              </p>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                Welcome back, {headerDisplayName} 👋
              </h1>
              <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/15 px-3 py-1 text-xs font-semibold text-white">
                <span className="inline-flex h-2 w-2 rounded-full bg-emerald-300" />
                {roleBadgeLabel}
              </div>
            </div>

            {!isStaff ? (
              <div className="w-full max-w-[180px] rounded-2xl border border-white/25 bg-white/10 p-2">
                <div className="rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-center">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-blue-100/80">
                    Attendance
                  </p>
                  <p className="mt-1 text-sm font-semibold text-white">{attendanceSummary}%</p>
                </div>
              </div>
            ) : null}
          </div>

          <div className="mt-4 flex items-center justify-between">
            <p className="text-sm text-blue-100/90">
              Premium academic workspace with quick access to all services.
            </p>
            <button
              type="button"
              onClick={() => setUpdatesDrawerOpen(true)}
              className="inline-flex items-center gap-2 rounded-full border border-white/35 bg-white/15 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/25 xl:hidden"
            >
              <Megaphone className="h-3.5 w-3.5" />
              Updates
            </button>
          </div>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {menuItems.map((item) => {
            const isLeave = item.id === "leave";
            const isExam = item.id === "exam";
            const isCalendar = item.id === "calendar";
            const isAssignments = item.id === "assignments";
            const isSpaciousService =
              item.id === "test" ||
              item.id === "assignments" ||
              item.id === "exam" ||
              item.id === "marks-progress";
            const isFees = item.id === "fees";
            const isCirculars = item.id === "circulars";
            const isCodeLearning = item.id === "code-learning";
            const isDailyPythonChallenges = item.id === "daily-python-challenges";
            const isInterviewQuizContact = item.id === "interview-quiz-contact";
            const isMyTodoList = item.id === "my-todo-list";
            const isResumeBuilder = item.id === "resume-builder";
            const isStudentDetails = item.id === "student-details";
            const isStudentAssignments = item.id === "student-assignments";
            const isParentReplies = item.id === "parent-replies";
            if (isStaff && isDailyPythonChallenges) return null;
            if (isStaff && isInterviewQuizContact) return null;
            if (isStaff && isMyTodoList) return null;
            if (isStaff && isResumeBuilder) return null;
            if (!isStudent && isInterviewQuizContact) return null;
            if (!isStaff && isStudentDetails) return null;
            if (isStudentAssignments) return null;
            if (!isStaff && isParentReplies) return null;

            const isLink = Boolean(item.path);
            const destination = isLink
              ? `${basePath}${item.path}`
              : isLeave
              ? leavePath
              : isExam
              ? examSchedulePath
              : isCalendar
              ? "__calendar__"
              : isAssignments
              ? "__assignments__"
              : isFees
              ? "__fees__"
              : isCirculars
              ? "__circulars__"
              : isCodeLearning
              ? "__code_learning__"
              : isDailyPythonChallenges
              ? "__daily_python_challenges__"
              : isInterviewQuizContact
              ? "__interview_quiz__"
              : isStudentDetails
              ? "__student_details__"
              : "";
            const actionLabel = isLeave
              ? "Open"
              : isExam
              ? isStaff
                ? "Manage"
                : "View"
              : isCalendar
              ? isStaff
                ? "Manage"
                : "View"
              : isAssignments
              ? isStaff
                ? "Manage"
                : "View"
              : isFees
              ? isStaff
                ? "Manage"
                : "View"
              : isCirculars
              ? isStaff
                ? "Manage"
                : "View"
              : isCodeLearning
              ? "Open"
              : isDailyPythonChallenges
              ? "Practice"
              : isInterviewQuizContact
              ? "AI"
              : isStudentDetails
              ? "Open"
              : isLink
              ? "Open"
              : item.staffEditable && isStaff
              ? "Edit"
              : "";
            const cardBadgeClass =
              ACTION_BADGE_CLASS[actionLabel] || "bg-slate-100 text-slate-700";
            const meta = SERVICE_CARD_META[item.id] || {};
            const Icon = meta.icon || FileText;
            const description = meta.description || "Open this service module.";

            if (!destination) {
              return (
                <div
                  key={item.id}
                  className="relative rounded-2xl border border-slate-200 bg-white/90 p-5 shadow-lg shadow-slate-200/50"
                >
                  <p className="text-base font-semibold text-slate-900">{item.label}</p>
                  <p className="mt-1 text-sm text-slate-500">{description}</p>
                </div>
              );
            }

            return (
              <button
                key={item.id}
                type="button"
                aria-label={`Open ${item.label}`}
                onClick={() => openServiceDestination(destination)}
                className={`group relative overflow-hidden rounded-2xl border border-slate-200/90 bg-white/95 text-left shadow-lg shadow-slate-200/60 transition duration-300 hover:-translate-y-1.5 hover:border-indigo-200 hover:shadow-xl hover:shadow-indigo-100/70 ${
                  isSpaciousService ? "p-6" : "p-5"
                }`}
              >
                <span className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-indigo-200/70 opacity-0 blur-2xl transition duration-300 group-hover:opacity-100" />
                <div className="relative flex items-start justify-between gap-2">
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-indigo-50 text-indigo-600 shadow-sm transition group-hover:shadow-md">
                    <Icon className="h-5 w-5" />
                  </span>
                  <ArrowUpRight className="h-4 w-4 text-slate-300 transition duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-indigo-500" />
                </div>

                <div className={`relative ${isSpaciousService ? "mt-6" : "mt-5"}`}>
                  <p className="text-base font-semibold text-slate-900">{item.label}</p>
                  <p className="mt-1 truncate text-sm text-slate-500">{description}</p>
                </div>

                <div
                  className={`relative flex items-center justify-between gap-2 ${
                    isSpaciousService ? "mt-5" : "mt-4"
                  }`}
                >
                  <span
                    className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${cardBadgeClass}`}
                  >
                    {actionLabel || "Open"}
                  </span>
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-400 transition group-hover:text-indigo-600">
                    Open
                    <ArrowRight className="h-3.5 w-3.5" />
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        <aside className="hidden h-fit rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-lg shadow-slate-200/60 xl:block">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                Notifications
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-900">Recent updates</p>
            </div>
            <BellRing className="h-4 w-4 text-indigo-500" />
          </div>
          <div className="mt-3 space-y-2.5">
            {serviceUpdates.map((entry) => (
              <div
                key={entry.id}
                className="rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2"
              >
                <p className="text-sm font-medium text-slate-900">{entry.title}</p>
                <p className="mt-0.5 text-xs text-slate-500">{entry.subtitle}</p>
                <p className="mt-1 text-[11px] font-medium text-indigo-500">
                  {formatDateTimeLabel(entry.time) || "Now"}
                </p>
              </div>
            ))}
          </div>
        </aside>
      </section>

      <div
        className={`fixed inset-0 z-[70] bg-slate-900/35 backdrop-blur-[1px] transition xl:hidden ${
          updatesDrawerOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={() => setUpdatesDrawerOpen(false)}
        aria-hidden={!updatesDrawerOpen}
      />
      <aside
        className={`fixed right-0 top-0 z-[71] h-full w-[min(86vw,340px)] border-l border-slate-200 bg-white p-4 shadow-2xl transition-transform duration-300 xl:hidden ${
          updatesDrawerOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              Notifications
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-900">Recent updates</p>
          </div>
          <button
            type="button"
            onClick={() => setUpdatesDrawerOpen(false)}
            className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600"
          >
            Close
          </button>
        </div>
        <div className="mt-3 space-y-2.5 overflow-y-auto pr-1">
          {serviceUpdates.map((entry) => (
            <div
              key={`mobile-${entry.id}`}
              className="rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2"
            >
              <p className="text-sm font-medium text-slate-900">{entry.title}</p>
              <p className="mt-0.5 text-xs text-slate-500">{entry.subtitle}</p>
              <p className="mt-1 text-[11px] font-medium text-indigo-500">
                {formatDateTimeLabel(entry.time) || "Now"}
              </p>
            </div>
          ))}
        </div>
      </aside>
        </>
      ) : null}

      {codeLearningOpen ? (
        <div
          className="code-learning-modal"
          role="dialog"
          aria-modal="true"
          aria-label="Code learning"
        >
          <button
            type="button"
            aria-label="Close code learning"
            onClick={closeCodeLearningModal}
            className="code-learning-modal__backdrop"
            tabIndex={-1}
          />
          <div tabIndex={-1} className="code-learning-modal__card">
            <div className="code-learning-modal__hero">
              <div className="code-learning-modal__hero-main">
                <span className="code-learning-modal__hero-icon" aria-hidden="true">
                  <Code2 className="h-6 w-6" />
                </span>
                <div>
                  <p className="code-learning-modal__kicker">Code Learning</p>
                  <h3 className="code-learning-modal__title">Choose Language</h3>
                  <p className="code-learning-modal__subtitle">
                    Open Python, C, or C++ editor.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeCodeLearningModal}
                className="code-learning-modal__close"
                aria-label="Close code learning"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="code-learning-modal__list">
              <button
                type="button"
                onClick={() => openCodeLearningRoute("python")}
                className="code-learning-language code-learning-language--python"
              >
                <span
                  className="code-learning-language__badge code-learning-language__badge--python"
                  aria-hidden="true"
                >
                  Py
                </span>
                <span className="code-learning-language__content">
                  <span className="code-learning-language__title">Python</span>
                  <span className="code-learning-language__subtitle">
                    Open Python Interpreter
                  </span>
                </span>
                <ChevronRight
                  className="code-learning-language__arrow"
                  aria-hidden="true"
                />
              </button>
              <button
                type="button"
                onClick={() => openCodeLearningRoute("c")}
                className="code-learning-language code-learning-language--c"
              >
                <span
                  className="code-learning-language__badge code-learning-language__badge--c"
                  aria-hidden="true"
                >
                  C
                </span>
                <span className="code-learning-language__content">
                  <span className="code-learning-language__title">C</span>
                  <span className="code-learning-language__subtitle">
                    Open C Compiler
                  </span>
                </span>
                <ChevronRight
                  className="code-learning-language__arrow"
                  aria-hidden="true"
                />
              </button>
              <button
                type="button"
                onClick={() => openCodeLearningRoute("cpp")}
                className="code-learning-language code-learning-language--cpp"
              >
                <span
                  className="code-learning-language__badge code-learning-language__badge--cpp"
                  aria-hidden="true"
                >
                  C++
                </span>
                <span className="code-learning-language__content">
                  <span className="code-learning-language__title">C++</span>
                  <span className="code-learning-language__subtitle">
                    Open C++ Compiler
                  </span>
                </span>
                <ChevronRight
                  className="code-learning-language__arrow"
                  aria-hidden="true"
                />
              </button>
            </div>
            <div className="code-learning-modal__status">
              <span className="code-learning-modal__status-dot" aria-hidden="true" />
              All compilers are ready
            </div>
          </div>
        </div>
      ) : null}

      {isAssignmentsVisible ? (
        <div
          className={
            isAssignmentsPageRoute
              ? "rounded-[1.8rem] border border-white/35 bg-gradient-to-br from-[#dfe8f7] via-[#dbe5f6] to-[#cbd8ee] p-4 shadow-lg shadow-indigo-900/20 sm:p-5"
              : "ui-modal"
          }
          role={isAssignmentsPageRoute ? undefined : "dialog"}
          aria-modal={isAssignmentsPageRoute ? undefined : "true"}
          aria-label="Assignments"
        >
          {!isAssignmentsPageRoute ? (
            <button
              type="button"
              aria-label="Close assignments"
              onClick={closeAssignmentsModal}
              className="ui-modal__scrim" tabIndex={-1}
            />
          ) : null}
          <div
            tabIndex={-1}
            className={
              isAssignmentsPageRoute
                ? "w-full"
                : "ui-modal__panel w-full max-w-4xl"
            }
          >
            <div
              className={
                isAssignmentsPageRoute
                  ? "pb-[calc(2rem+env(safe-area-inset-bottom))]"
                  : "ui-modal__body pb-[calc(8rem+env(safe-area-inset-bottom))]"
              }
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-ink/75">
                    Campus Hub
                  </p>
                  <h3 className="text-xl font-semibold text-ink">Assignments</h3>
                  <p className="text-xs text-ink/75">
                    {isStaff
                      ? "Upload assignment/quiz files for students."
                      : "Download assignment files and upload your answers."}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeAssignmentsModal}
                  className="ui-modal__close"
                >
                  Close
                </button>
              </div>

              {isStaff ? (
                <form
                  onSubmit={handleCreateAssignment}
                  className="mt-4 grid gap-3 rounded-2xl border border-clay/20 bg-white/80 p-4"
                >
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="grid gap-1.5">
                      <label className="text-xs font-semibold uppercase tracking-[0.18em] text-ink/75">
                        Subject
                      </label>
                      <input
                        type="text"
                        value={assignmentForm.title}
                        onChange={(event) => {
                          setAssignmentForm((prev) => ({
                            ...prev,
                            title: event.target.value,
                          }));
                          setAssignmentsStatus("");
                        }}
                        placeholder="Data Structures"
                        className="w-full rounded-xl border border-clay/20 bg-white px-3 py-2 text-sm placeholder:text-ink/50"
                      />
                    </div>

                    <div className="grid gap-1.5">
                      <label className="text-xs font-semibold uppercase tracking-[0.18em] text-ink/75">
                        Submit Last Date
                      </label>
                      <input
                        type="date"
                        value={assignmentForm.submitEnd}
                        min={new Date().toISOString().slice(0, 10)}
                        onChange={(event) => {
                          setAssignmentForm((prev) => ({
                            ...prev,
                            submitEnd: event.target.value,
                          }));
                          setAssignmentsStatus("");
                        }}
                        className="w-full rounded-xl border border-clay/20 bg-white px-3 py-2 text-sm"
                      />
                    </div>
                  </div>

                  <div className="grid gap-1.5">
                    <label className="text-xs font-semibold uppercase tracking-[0.18em] text-ink/75">
                      Description (optional)
                    </label>
                    <textarea
                      value={assignmentForm.description}
                      rows={3}
                      onChange={(event) => {
                        setAssignmentForm((prev) => ({
                          ...prev,
                          description: event.target.value,
                        }));
                        setAssignmentsStatus("");
                      }}
                      placeholder="Add short instructions for students..."
                      className="w-full rounded-xl border border-clay/20 bg-white px-3 py-2 text-sm placeholder:text-ink/50"
                    />
                  </div>

                  <div className="grid gap-1.5">
                    <label className="text-xs font-semibold uppercase tracking-[0.18em] text-ink/75">
                      Assignment/Quiz File
                    </label>
                    <input
                      ref={assignmentFileInputRef}
                      type="file"
                      onChange={(event) => {
                        const nextFile = event.target.files?.[0] || null;
                        setAssignmentFile(nextFile);
                        setAssignmentsStatus("");
                      }}
                      className="w-full rounded-xl border border-clay/20 bg-white px-3 py-2 text-sm text-ink file:mr-3 file:rounded-lg file:border-0 file:bg-sand file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-black"
                    />
                    {assignmentFile ? (
                      <p className="text-xs text-ink/75">
                        {assignmentFile.name} ({formatFileSize(assignmentFile.size)})
                      </p>
                    ) : null}
                  </div>

                  {assignmentsStatus ? (
                    <p className="text-xs font-semibold text-ink/80">{assignmentsStatus}</p>
                  ) : null}

                  <div className="flex items-center justify-end">
                    <button
                      type="submit"
                      disabled={creatingAssignment}
                      className="rounded-xl bg-clay px-4 py-2 text-sm font-semibold text-black shadow"
                    >
                      {creatingAssignment ? "Publishing..." : "Publish Assignment"}
                    </button>
                  </div>
                </form>
              ) : null}

              <div className={`${isStaff ? "mt-6" : "mt-4"} grid gap-3`}>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-ink/75">
                  {isStaff ? "Published Assignments" : "Available Assignments"}
                </p>

                {!isStaff && loadingStudentSubmissions ? (
                  <p className="text-sm text-ink/75">Loading your submissions...</p>
                ) : null}

                {loadingAssignments ? (
                  <p className="text-sm text-ink/75">Loading assignments...</p>
                ) : assignmentsError ? (
                  <p className="text-sm font-semibold text-ink/80">{assignmentsError}</p>
                ) : assignmentEntries.length === 0 ? (
                  <p className="text-sm text-ink/75">No assignments yet.</p>
                ) : (
                  assignmentEntries.map((assignment) => {
                    const typeLabel = ASSIGNMENT_TYPE_LABEL;
                    const closed = isAssignmentClosed(assignment);
                    const submission = studentSubmissionsByAssignment[assignment.id] || null;
                    const selectedFile = submissionFilesByAssignment[assignment.id] || null;
                    const submissionStatus =
                      submissionStatusByAssignment[assignment.id] || "";
                    const isSubmitting = submittingAssignmentId === assignment.id;
                    return (
                      <div
                        key={assignment.id}
                        className="rounded-xl border border-clay/30 bg-white/95 px-3 py-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-semibold text-ink">
                                {assignment.title || "Assignment"}
                              </p>
                              <span className="rounded-full border border-clay/35 bg-clay/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink/80">
                                {typeLabel}
                              </span>
                              {closed ? (
                                <span className="rounded-full border border-rose-200 bg-rose-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-rose-900">
                                  Closed
                                </span>
                              ) : (
                                <span className="rounded-full border border-emerald-200 bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-900">
                                  Open
                                </span>
                              )}
                            </div>
                            <p className="mt-1 text-xs text-ink/75">
                              Submit by {formatAssignmentDueLabel(assignment)}
                            </p>
                            {assignment?.description ? (
                              <p className="mt-1 text-xs text-ink/80 whitespace-pre-wrap">
                                {assignment.description}
                              </p>
                            ) : null}
                            {assignment?.attachment?.url ? (
                              <a
                                href={assignment.attachment.url}
                                target="_blank"
                                rel="noreferrer"
                                download={assignment?.attachment?.name || undefined}
                                className="mt-2 inline-flex items-center rounded-full border border-clay/35 bg-sand/80 px-2.5 py-1 text-[11px] font-semibold text-ink/80"
                              >
                                Open / Download file
                              </a>
                            ) : (
                              <p className="mt-2 text-xs text-ink/70">No file attached.</p>
                            )}
                          </div>

                          {isStaff ? (
                            <div className="flex flex-col items-end gap-2">
                              <button
                                type="button"
                                onClick={() => navigate(`${basePath}/menu/student-assignments`)}
                                className="rounded-full border border-clay/35 bg-white px-3 py-1 text-[11px] font-semibold text-ink/80"
                              >
                                Student's Assignments
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteAssignmentEntry(assignment.id)}
                                disabled={removingAssignmentId === assignment.id}
                                className="rounded-full border border-clay/35 bg-white px-3 py-1 text-[11px] font-semibold text-ink/80 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {removingAssignmentId === assignment.id
                                  ? "Removing..."
                                  : "Remove"}
                              </button>
                            </div>
                          ) : null}
                        </div>

                        {!isStaff ? (
                          <div className="mt-3 grid gap-2 rounded-xl border border-clay/20 bg-sand/60 p-3">
                            {submission ? (
                              <div className="grid gap-1 text-xs text-ink/75">
                                <p>
                                  Submitted on{" "}
                                  <span className="font-semibold text-ink">
                                    {formatDateTimeLabel(
                                      submission?.updatedAt || submission?.submittedAt
                                    ) || "recently"}
                                  </span>
                                </p>
                                {submission?.file?.url ? (
                                  <a
                                    href={submission.file.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    download={submission?.file?.name || undefined}
                                    className="inline-flex w-fit rounded-full border border-clay/35 bg-white px-2.5 py-1 text-[11px] font-semibold text-ink/80"
                                  >
                                    Open / Download submitted file
                                  </a>
                                ) : null}
                              </div>
                            ) : (
                              <p className="text-xs text-ink/75">
                                You have not submitted this assignment yet.
                              </p>
                            )}

                            <div className="grid gap-2 md:grid-cols-[1fr_auto]">
                              <input
                                type="file"
                                onChange={(event) => {
                                  const nextFile = event.target.files?.[0] || null;
                                  setSubmissionFilesByAssignment((prev) => ({
                                    ...prev,
                                    [assignment.id]: nextFile,
                                  }));
                                  setSubmissionStatusByAssignment((prev) => ({
                                    ...prev,
                                    [assignment.id]: "",
                                  }));
                                }}
                                disabled={closed || isSubmitting}
                                className="w-full rounded-xl border border-clay/20 bg-white px-3 py-2 text-xs text-ink file:mr-3 file:rounded-lg file:border-0 file:bg-sand file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-black disabled:cursor-not-allowed disabled:opacity-60"
                              />
                              <button
                                type="button"
                                onClick={() => handleStudentAssignmentSubmit(assignment)}
                                disabled={closed || !selectedFile || isSubmitting}
                                className="rounded-xl bg-clay px-4 py-2 text-sm font-semibold text-black shadow disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {isSubmitting
                                  ? "Submitting..."
                                  : submission
                                  ? "Re-submit"
                                  : "Submit"}
                              </button>
                            </div>
                            {selectedFile ? (
                              <p className="text-xs text-ink/75">
                                Selected: {selectedFile.name} ({formatFileSize(selectedFile.size)})
                              </p>
                            ) : null}
                            {submissionStatus ? (
                              <p className="text-xs font-semibold text-ink/80">
                                {submissionStatus}
                              </p>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    );
                  })
                )}
              </div>

              {isStaff && staffSubmissionAssignmentId ? (
                <section className="mt-5 rounded-2xl border border-clay/25 bg-cream/75 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-ink/75">
                        Student Submissions
                      </p>
                      <p className="text-sm font-semibold text-ink">
                        {(assignmentEntries.find((item) => item.id === staffSubmissionAssignmentId)
                          ?.title || "Assignment")}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setStaffSubmissionAssignmentId("")}
                      className="rounded-full border border-clay/35 bg-white px-3 py-1 text-[11px] font-semibold text-ink/80"
                    >
                      Close
                    </button>
                  </div>

                  {loadingStaffSubmissions ? (
                    <p className="mt-3 text-sm text-ink/75">Loading submissions...</p>
                  ) : staffSubmissionsError ? (
                    <p className="mt-3 text-sm text-ink/75">{staffSubmissionsError}</p>
                  ) : staffSubmissions.length === 0 ? (
                    <p className="mt-3 text-sm text-ink/75">
                      No student has submitted yet.
                    </p>
                  ) : (
                    <div className="mt-3 grid gap-2">
                      {staffSubmissions.map((item) => (
                        <div
                          key={item.id}
                          className="rounded-xl border border-clay/25 bg-white px-3 py-2"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-ink">
                                {item?.studentName || "Student"}
                              </p>
                              <p className="text-xs text-ink/75">
                                {item?.studentEmail || "No email"}
                              </p>
                              <p className="text-xs text-ink/75">
                                Submitted:{" "}
                                {formatDateTimeLabel(item?.updatedAt || item?.submittedAt) ||
                                  "recently"}
                              </p>
                            </div>
                            {item?.file?.url ? (
                              <a
                                href={item.file.url}
                                target="_blank"
                                rel="noreferrer"
                                download={item?.file?.name || undefined}
                                className="rounded-full border border-clay/35 bg-sand/80 px-3 py-1 text-[11px] font-semibold text-ink/80"
                              >
                                Open / Download
                              </a>
                            ) : (
                              <span className="text-xs text-ink/70">No file</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {isStaff && isStudentDetailsVisible ? (
        <section className="surface-card menu-grid-card p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-ink/75">
                Student's Details
              </p>
              <h3 className="text-xl font-semibold text-ink">
                Select Student Name
              </h3>
            </div>
            <button
              type="button"
              onClick={closeStudentDetailsModal}
              className="rounded-full border border-clay/30 bg-cream px-3 py-1 text-xs font-semibold text-ink/80"
            >
              Close
            </button>
          </div>

          <label className="mt-4 block">
            <span className="text-xs font-semibold uppercase tracking-[0.08em] text-ink/65">
              Student Name
            </span>
            <select
              value={studentDetailsStudentId}
              onChange={(event) => {
                setStudentDetailsStudentId(event.target.value);
              }}
              disabled={
                loadingStudentDetailsStudents || studentDetailsStudents.length === 0
              }
              className="mt-1 w-full rounded-xl border border-clay/30 bg-white px-3 py-2 text-sm text-ink disabled:cursor-not-allowed disabled:opacity-70"
            >
              {studentDetailsStudents.length === 0 ? (
                <option value="">
                  {loadingStudentDetailsStudents
                    ? "Loading students..."
                    : "No students found"}
                </option>
              ) : null}
              {studentDetailsStudents.map((studentItem) => (
                <option key={studentItem.id} value={studentItem.id}>
                  {studentItem.name}
                </option>
              ))}
            </select>
          </label>

          {studentDetailsStudentsError ? (
            <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
              {studentDetailsStudentsError}
            </p>
          ) : null}

          {loadingStudentDetailsStudents ? (
            <p className="mt-3 text-sm text-ink/75">Loading student details...</p>
          ) : selectedStudentDetailsStudent ? (
            <div className="mt-4">
              <div className="rounded-xl border border-clay/20 bg-white/90 px-3 py-2">
                <p className="text-sm font-semibold text-ink">
                  {selectedStudentDetailsStudent.name}
                </p>
                <p className="text-xs text-ink/70">
                  {toDisplayValue(selectedStudentDetailsStudent.email)}
                </p>
              </div>
              <dl className="mt-3 divide-y divide-clay/20">
                {selectedStudentDetailsRows.map((row) => (
                  <div
                    key={row.label}
                    className="grid grid-cols-[132px_minmax(0,1fr)] items-center gap-3 py-3 sm:grid-cols-[160px_minmax(0,1fr)]"
                  >
                    <dt className="text-sm text-ink/70">{row.label}</dt>
                    <dd
                      className={`break-words text-right text-sm font-semibold leading-tight text-ink ${row.mono ? "font-mono text-[13px] sm:text-sm" : ""}`}
                    >
                      {row.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : (
            <p className="mt-3 text-sm text-ink/75">
              Select a student to view details.
            </p>
          )}
        </section>
      ) : null}

      {isDailyPythonVisible ? (
        <div
          className={
            isDailyPythonPageRoute
              ? "rounded-[1.8rem] border border-white/35 bg-gradient-to-br from-[#dfe8f7] via-[#dbe5f6] to-[#cbd8ee] p-4 shadow-lg shadow-indigo-900/20 sm:p-5"
              : "ui-modal"
          }
          role={isDailyPythonPageRoute ? undefined : "dialog"}
          aria-modal={isDailyPythonPageRoute ? undefined : "true"}
          aria-label="Daily python challenges"
        >
          {!isDailyPythonPageRoute ? (
            <button
              type="button"
              aria-label="Close daily python challenges"
              onClick={closeDailyPythonModal}
              className="ui-modal__scrim"
              tabIndex={-1}
            />
          ) : null}
          <div
            tabIndex={-1}
            className={
              isDailyPythonPageRoute
                ? "w-full"
                : "ui-modal__panel w-full max-w-4xl"
            }
          >
            <div
              className={
                isDailyPythonPageRoute
                  ? "pb-[calc(2rem+env(safe-area-inset-bottom))]"
                  : "ui-modal__body pb-[calc(8rem+env(safe-area-inset-bottom))]"
              }
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-ink/75">
                    AI Challenge Zone
                  </p>
                  <h3 className="text-xl font-semibold text-ink">
                    Daily {DAILY_PYTHON_CHALLENGE_COUNT} Python Challenges
                  </h3>
                  <p className="text-xs text-ink/75">
                    Auto-rotates every 24 hours with a fresh AI challenge set.
                  </p>
                  {dailyPythonExpiresAt ? (
                    <p className="mt-1 text-[11px] text-ink/70">
                      Current set expires: {formatChallengeDateTime(dailyPythonExpiresAt)}
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={closeDailyPythonModal}
                  className="ui-modal__close"
                >
                  Close
                </button>
              </div>

              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => {
                    setDailyPythonOpen(false);
                    navigate(`${basePath}/code/python`);
                  }}
                  className="rounded-xl border border-clay/25 bg-white px-4 py-2 text-sm font-semibold text-ink/80 transition hover:border-clay/45"
                >
                  Open Python Editor
                </button>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
                <div className="rounded-xl border border-clay/25 bg-white/90 px-3 py-2 text-center">
                  <p className="text-[10px] uppercase tracking-[0.08em] text-ink/65">Solved Today</p>
                  <p className="text-sm font-semibold text-ink">
                    {dailyPythonSolvedIds.length}/{DAILY_PYTHON_CHALLENGE_COUNT}
                  </p>
                </div>
                <div className="rounded-xl border border-clay/25 bg-white/90 px-3 py-2 text-center">
                  <p className="text-[10px] uppercase tracking-[0.08em] text-ink/65">Current Streak</p>
                  <p className="text-sm font-semibold text-ink">{dailyPythonStreak}</p>
                </div>
                <div className="rounded-xl border border-clay/25 bg-white/90 px-3 py-2 text-center">
                  <p className="text-[10px] uppercase tracking-[0.08em] text-ink/65">Best Streak</p>
                  <p className="text-sm font-semibold text-ink">{dailyPythonBestStreak}</p>
                </div>
                <div className="rounded-xl border border-clay/25 bg-white/90 px-3 py-2 text-center">
                  <p className="text-[10px] uppercase tracking-[0.08em] text-ink/65">Total Solved</p>
                  <p className="text-sm font-semibold text-ink">{dailyPythonTotalSolved}</p>
                </div>
                <div className="rounded-xl border border-clay/25 bg-white/90 px-3 py-2 text-center">
                  <p className="text-[10px] uppercase tracking-[0.08em] text-ink/65">Active Days</p>
                  <p className="text-sm font-semibold text-ink">{dailyPythonDaysParticipated}</p>
                </div>
              </div>

              {dailyPythonError ? (
                <p className="mt-3 text-xs font-semibold text-ink/80">
                  {dailyPythonError}
                </p>
              ) : null}
              {dailyPythonProgressError ? (
                <p className="mt-2 text-xs font-semibold text-ink/80">
                  {dailyPythonProgressError}
                </p>
              ) : null}
              {dailyPythonStatus ? (
                <p className="mt-2 text-xs font-semibold text-ink/80">
                  {dailyPythonStatus}
                </p>
              ) : null}

              {loadingDailyPythonChallenges ? (
                <p className="mt-4 text-sm text-ink/75">Loading daily challenges...</p>
              ) : dailyPythonChallenges.length === 0 ? (
                <p className="mt-4 text-sm text-ink/75">No challenges available right now.</p>
              ) : (
                <div className="mt-4 grid gap-3">
                  {dailyPythonChallenges.map((challenge, index) => {
                    const isSolved = dailyPythonSolvedIds.includes(challenge.id);
                    const isCheckedOnce = dailyPythonCheckedIds.includes(challenge.id);
                    const isSaving = savingDailyPythonChallengeId === challenge.id;
                    const isChecking = checkingDailyPythonChallengeId === challenge.id;
                    const challengeCode = dailyPythonCodeByChallengeId[challenge.id] || "";
                    const challengeReview = dailyPythonReviewByChallengeId[challenge.id] || null;

                    return (
                      <article
                        key={challenge.id || `${challenge.title}-${index}`}
                        className="rounded-2xl border border-clay/25 bg-white/90 p-4"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <h4 className="text-sm font-semibold text-ink">
                            {index + 1}. {challenge.title}
                          </h4>
                          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.08em]">
                            <span className="rounded-full border border-clay/30 bg-cream px-2 py-1 text-ink/75">
                              {challenge.topic || "Python"}
                            </span>
                            <span className="rounded-full border border-clay/30 bg-mist px-2 py-1 text-ink/75">
                              {challenge.difficulty || "Easy"}
                            </span>
                            {isSolved ? (
                              <span className="rounded-full border border-emerald-300 bg-emerald-100 px-2 py-1 text-emerald-900">
                                Solved
                              </span>
                            ) : null}
                          </div>
                        </div>

                        <p className="mt-2 text-sm text-ink/80">{challenge.statement}</p>

                        <div className="mt-3 grid gap-3 text-xs text-ink/80">
                          <div>
                            <p className="font-semibold text-ink">Input Format:</p>
                            <pre className="mt-1 whitespace-pre-wrap rounded-lg border border-clay/20 bg-white/80 p-2 font-mono text-[11px] text-ink/85">{challenge.inputFormat}</pre>
                          </div>
                          <div>
                            <p className="font-semibold text-ink">Output Format:</p>
                            <pre className="mt-1 whitespace-pre-wrap rounded-lg border border-clay/20 bg-white/80 p-2 font-mono text-[11px] text-ink/85">{challenge.outputFormat}</pre>
                          </div>
                          <div>
                            <p className="font-semibold text-ink">Sample Input:</p>
                            <pre className="mt-1 whitespace-pre-wrap rounded-lg border border-clay/20 bg-cream/70 p-2 font-mono text-[11px] text-ink/85">{challenge.sampleInput}</pre>
                          </div>
                          {isStaff ? (
                            <div>
                              <p className="font-semibold text-ink">Sample Output:</p>
                              <pre className="mt-1 whitespace-pre-wrap rounded-lg border border-clay/20 bg-mist/80 p-2 font-mono text-[11px] text-ink/85">{challenge.sampleOutput}</pre>
                            </div>
                          ) : null}
                          <p>
                            <span className="font-semibold text-ink">Hint: </span>
                            {challenge.hint}
                          </p>
                        </div>

                        <div className="mt-3 grid gap-1">
                          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-ink/70">
                            Your Python Code
                          </p>
                          <textarea
                            value={challengeCode}
                            onChange={(event) =>
                              handleDailyPythonCodeChange(challenge.id, event.target.value)
                            }
                            rows={8}
                            spellCheck="false"
                            autoCapitalize="off"
                            autoCorrect="off"
                            placeholder="Write your Python solution..."
                            className="w-full rounded-xl border border-clay/20 bg-cream/70 px-3 py-2 font-mono text-xs text-ink/85 placeholder:text-ink/50"
                          />
                        </div>

                        {challengeReview ? (
                          <div
                            className={`mt-3 rounded-xl border px-3 py-2 text-xs ${
                              challengeReview.status === "pass"
                                ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                                : challengeReview.status === "fail"
                                ? "border-amber-300 bg-amber-50 text-amber-900"
                                : "border-rose-300 bg-rose-50 text-rose-900"
                            }`}
                          >
                            <p className="font-semibold">{challengeReview.message}</p>
                            {challengeReview.status === "fail" &&
                            challengeReview.correctAnswer !== undefined &&
                            challengeReview.actualOutput !== undefined ? (
                              <div className="mt-2 grid gap-2">
                                <div>
                                  <p className="font-semibold">Correct Answer:</p>
                                  <pre className="mt-1 whitespace-pre-wrap rounded-md border border-amber-300/60 bg-white/75 p-2 font-mono text-[11px] text-amber-950">{challengeReview.correctAnswer}</pre>
                                </div>
                                <div>
                                  <p className="font-semibold">Output:</p>
                                  <pre className="mt-1 whitespace-pre-wrap rounded-md border border-amber-300/60 bg-white/75 p-2 font-mono text-[11px] text-amber-950">{challengeReview.actualOutput}</pre>
                                </div>
                                {challengeReview.correctPythonCode ? (
                                  <div>
                                    <p className="font-semibold">Correct Python Code:</p>
                                    <pre className="mt-1 whitespace-pre-wrap rounded-md border border-amber-300/60 bg-white/75 p-2 font-mono text-[11px] text-amber-950">{challengeReview.correctPythonCode}</pre>
                                  </div>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        ) : null}

                        <div className="mt-3 flex justify-end">
                          <button
                            type="button"
                            onClick={() => handleCheckDailyPythonChallenge(challenge)}
                            disabled={isSolved || isCheckedOnce || isSaving || isChecking}
                            className="rounded-xl border border-clay/25 bg-white px-3 py-1.5 text-xs font-semibold text-ink/80 transition hover:border-clay/45 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {isChecking
                              ? "Checking..."
                              : isSaving
                              ? "Saving..."
                              : isSolved
                              ? "Solved"
                              : isCheckedOnce
                              ? "Checked"
                              : "Check Answer"}
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {isStudent && interviewQuizOpen ? (
        <div
          className="ui-modal"
          role="dialog"
          aria-modal="true"
          aria-label="Interview quiz"
        >
          <button
            type="button"
            aria-label="Close interview quiz"
            onClick={closeInterviewQuizModal}
            className="ui-modal__scrim" tabIndex={-1}
          />
          <div tabIndex={-1} className="ui-modal__panel ui-modal__panel--interview w-full max-w-4xl">
            <div className="ui-modal__body ui-modal__body--interview pb-[calc(8rem+env(safe-area-inset-bottom))]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-ink/75">
                    AI Interview Zone
                  </p>
                  <h3 className="text-xl font-semibold text-ink">
                    Interview Quiz & Contact Places
                  </h3>
                  <p className="text-xs text-ink/75">
                    Top companies quiz topics with answers and Tamil Nadu contact places.
                  </p>
                  <p className="mt-1 text-[11px] text-ink/70">
                    {interviewQuizDateLabel || "Today"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeInterviewQuizModal}
                  className="ui-modal__close"
                >
                  Close
                </button>
              </div>

              {interviewQuizLoading ? (
                <p className="mt-4 text-sm text-ink/75">Loading AI interview quiz...</p>
              ) : interviewQuizError ? (
                <p className="mt-4 text-sm font-semibold text-ink/80">{interviewQuizError}</p>
              ) : interviewQuizCompanies.length === 0 && interviewContactPlaces.length === 0 ? (
                <p className="mt-4 text-sm text-ink/75">No interview quiz data available.</p>
              ) : (
                <>
                  <section className="mt-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink/75">
                      Top Companies Interview Quiz
                    </p>
                    <div className="mt-2 grid gap-3">
                      {interviewQuizCompanies.map((entry, companyIndex) => (
                        <article
                          key={`${entry.company}-${companyIndex}`}
                          className="rounded-2xl border border-clay/25 bg-white/90 p-4"
                        >
                          <h4 className="text-sm font-semibold text-ink">
                            {companyIndex + 1}. {entry.company}
                          </h4>
                          <p className="mt-1 text-xs text-ink/75">
                            Topic: {entry.quizTopic}
                          </p>
                          <div className="mt-2 grid gap-2">
                            {entry.qa.map((qaItem, qaIndex) => (
                              <div
                                key={`${entry.company}-${qaItem.question}-${qaIndex}`}
                                className="rounded-xl border border-clay/20 bg-cream/70 px-3 py-2"
                              >
                                <p className="text-xs font-semibold text-ink">
                                  {qaIndex + 1}. {qaItem.question}
                                </p>
                                <p className="mt-1 text-xs text-ink/80">{qaItem.answer}</p>
                              </div>
                            ))}
                          </div>
                        </article>
                      ))}
                    </div>
                  </section>

                  <section className="mt-5 border-t border-clay/25 pt-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink/75">
                      Tamil Nadu Top 10 Interview Contact Places
                    </p>
                    <ol className="mt-2 grid gap-2">
                      {interviewContactPlaces.map((place, index) => (
                        <li
                          key={`${place.place}-${place.city}-${index}`}
                          className="rounded-xl border border-clay/20 bg-white/90 px-3 py-2"
                        >
                          <p className="text-sm font-semibold text-ink">
                            {index + 1}. {place.place}
                          </p>
                          <p className="text-xs text-ink/75">{place.city}</p>
                          {place.description ? (
                            <p className="mt-1 text-xs text-ink/80">{place.description}</p>
                          ) : null}
                        </li>
                      ))}
                    </ol>
                  </section>
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {circularsOpen ? (
        <div
          className="ui-modal"
          role="dialog"
          aria-modal="true"
          aria-label="Circulars"
        >
          <button
            type="button"
            aria-label="Close circulars"
            onClick={closeCircularsModal}
            className="ui-modal__scrim" tabIndex={-1}
          />
          <div tabIndex={-1} className="ui-modal__panel w-full max-w-4xl">
            <div className="ui-modal__body">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-ink/75">
                    Campus Hub
                  </p>
                  <h3 className="text-xl font-semibold text-ink">
                    Circulars
                  </h3>
                  <p className="text-xs text-ink/75">
                    {isStaff
                      ? "Publish notices and files for students."
                      : "Latest notices and files shared by staff."}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeCircularsModal}
                  className="ui-modal__close"
                >
                  Close
                </button>
              </div>

              {isStaff ? (
                <form
                  onSubmit={handleCreateNotice}
                  className="mt-4 grid gap-3 rounded-2xl border border-clay/20 bg-white/80 p-4"
                >
                  <label className="text-xs font-semibold uppercase tracking-[0.2em] text-ink/75">
                    Title
                  </label>
                  <input
                    type="text"
                    value={noticeTitle}
                    onChange={(event) => {
                      setNoticeTitle(event.target.value);
                      setNoticeStatus("");
                    }}
                    placeholder="Exam schedule update"
                    className="w-full rounded-xl border border-clay/20 bg-white px-3 py-2 text-sm placeholder:text-ink/50"
                  />

                  <label className="text-xs font-semibold uppercase tracking-[0.2em] text-ink/75">
                    Message
                  </label>
                  <textarea
                    value={noticeMessage}
                    onChange={(event) => {
                      setNoticeMessage(event.target.value);
                      setNoticeStatus("");
                    }}
                    rows={4}
                    placeholder="Add details for students..."
                    className="w-full rounded-xl border border-clay/20 bg-white px-3 py-2 text-sm placeholder:text-ink/50"
                  />

                  <label className="text-xs font-semibold uppercase tracking-[0.2em] text-ink/75">
                    Department (optional)
                  </label>
                  <select
                    value={noticeDepartment}
                    onChange={(event) => {
                      setNoticeDepartment(event.target.value);
                      setNoticeStatus("");
                    }}
                    className="w-full rounded-xl border border-clay/20 bg-white px-3 py-2 text-sm"
                  >
                    <option value="">All departments</option>
                    {departments.map((dept) => (
                      <option key={dept} value={dept}>
                        {dept}
                      </option>
                    ))}
                  </select>

                  <label className="text-xs font-semibold uppercase tracking-[0.2em] text-ink/75">
                    Attachments
                  </label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    onChange={(event) => {
                      const files = Array.from(event.target.files || []);
                      setNoticeFiles(files);
                      setNoticeStatus("");
                    }}
                    className="w-full rounded-xl border border-clay/20 bg-white px-3 py-2 text-sm text-ink file:mr-3 file:rounded-lg file:border-0 file:bg-sand file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-black"
                  />
                  {noticeFiles.length ? (
                    <div className="grid gap-1 text-xs text-ink/75">
                      {noticeFiles.map((file) => (
                        <div
                          key={`${file.name}-${file.lastModified}`}
                          className="flex items-center justify-between"
                        >
                          <span className="truncate">{file.name}</span>
                          <span>{formatFileSize(file.size)}</span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {noticeStatus ? (
                    <p className="text-xs font-semibold text-ink/80">{noticeStatus}</p>
                  ) : null}

                  <div className="flex items-center justify-end">
                    <button
                      type="submit"
                      disabled={creatingNotice}
                      className="rounded-xl bg-clay px-4 py-2 text-sm font-semibold text-black shadow"
                    >
                      {creatingNotice ? "Publishing..." : "Publish Notice"}
                    </button>
                  </div>
                </form>
              ) : null}

              <div className={`${isStaff ? "mt-6" : "mt-4"} grid gap-3`}>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-ink/75">
                  Recent circulars
                </p>

                {loadingCirculars ? (
                  <p className="text-sm text-ink/75">Loading circulars...</p>
                ) : circularsError ? (
                  <p className="text-sm font-semibold text-ink/80">{circularsError}</p>
                ) : circularsEntries.length === 0 ? (
                  <p className="text-sm text-ink/75">No circulars yet.</p>
                ) : (
                  circularsEntries.map((notice) => {
                    const { dateLabel, author, audienceMeta, showMeta } =
                      getNoticeMeta(notice);
                    const preview = notice.message ? notice.message.trim() : "";
                    const previewText =
                      preview && preview.length > 140
                        ? `${preview.slice(0, 140)}...`
                        : preview;

                    return (
                      <div
                        key={notice.id}
                        className="rounded-xl border border-clay/30 bg-white/95 px-3 py-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold text-ink">
                              {notice.title || "Notice"}
                            </p>
                            {showMeta ? (
                              <p className="text-xs text-ink/75">
                                {[dateLabel, author, audienceMeta]
                                  .filter(Boolean)
                                  .join(" - ")}
                              </p>
                            ) : null}
                          </div>
                          <div className="flex flex-col items-end gap-2">
                            {notice.attachments?.length ? (
                              <span className="rounded-full bg-clay/15 px-2 py-1 text-[10px] font-semibold text-ink/80">
                                {notice.attachments.length} files
                              </span>
                            ) : null}
                            <div className="flex flex-wrap items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => setActiveNotice(notice)}
                                className="rounded-full border border-ink/15 bg-white/80 px-3 py-1 text-[11px] font-semibold text-ink/80 shadow-sm transition hover:bg-white"
                              >
                                View details
                              </button>
                              {isStaff ? (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteNotice(notice.id)}
                                  className="rounded-full border border-clay/35 bg-white px-2 py-1 text-[11px] font-semibold text-ink/80 hover:border-clay/50"
                                >
                                  Remove
                                </button>
                              ) : null}
                            </div>
                          </div>
                        </div>

                        {previewText ? (
                          <p className="mt-2 text-sm text-ink/80">
                            {previewText}
                          </p>
                        ) : null}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {calendarOpen ? (
        <div
          className="ui-modal"
          role="dialog"
          aria-modal="true"
          aria-label="Academic calendar"
        >
          <button
            type="button"
            aria-label="Close calendar"
            onClick={closeCalendarModal}
            className="ui-modal__scrim" tabIndex={-1}
          />
          <div tabIndex={-1} className="ui-modal__panel w-full max-w-3xl">
            <div className="ui-modal__body pb-[calc(8rem+env(safe-area-inset-bottom))]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-ink/75">
                  Campus Hub
                </p>
                <h3 className="text-xl font-semibold text-ink">
                  Academic Calendar
                </h3>
                <p className="text-xs text-ink/75">
                  {isStaff
                    ? "Add events/holidays and students will see updates."
                    : "Staff updates are shown here."}
                </p>
              </div>
              <button
                type="button"
                onClick={closeCalendarModal}
                className="ui-modal__close"
              >
                Close
              </button>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2.5 text-xs font-semibold">
              {calendarTypeOptions.map((item) => {
                return (
                  <span
                    key={item.value}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 ${item.chipClass}`}
                  >
                    <span className={`h-2.5 w-2.5 rounded-full ${item.dotClass}`} />
                    {item.label}
                  </span>
                );
              })}
            </div>

            <div className="mt-4 rounded-2xl border border-clay/30 bg-gradient-to-b from-sand/65 to-cream/70 p-4">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => handleCalendarMonthMove(-1)}
                  className="rounded-full border border-clay/35 bg-white px-3 py-1 text-sm font-semibold text-ink/80 shadow-sm transition hover:border-clay/50"
                >
                  {"<"}
                </button>
                <p className="text-lg font-semibold tracking-tight text-ink">{monthLabel}</p>
                <button
                  type="button"
                  onClick={() => handleCalendarMonthMove(1)}
                  className="rounded-full border border-clay/35 bg-white px-3 py-1 text-sm font-semibold text-ink/80 shadow-sm transition hover:border-clay/50"
                >
                  {">"}
                </button>
              </div>

              <div className="mt-3 grid grid-cols-7 gap-2">
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
                  <span
                    key={day}
                    className="rounded-md py-1 text-center text-[11px] font-semibold uppercase tracking-[0.14em] text-ink/65"
                  >
                    {day}
                  </span>
                ))}
              </div>

              {loadingCalendar ? (
                <p className="mt-4 text-sm text-ink/75">Loading calendar...</p>
              ) : calendarError ? (
                <p className="mt-4 text-sm text-ink/75">{calendarError}</p>
              ) : (
                <div className="mt-3 grid grid-cols-7 gap-2">
                  {calendarDays.map((day) => {
                    const dayTypes = Array.from(
                      new Set(
                        day.entries.map((entry) => getCalendarTypeMeta(entry?.type).value)
                      )
                    );
                    const primaryType =
                      dayTypes.find((type) => type === "holiday") ||
                      dayTypes.find((type) => type === "iqac") ||
                      dayTypes.find((type) => type === "event") ||
                      "";
                    const primaryMeta = primaryType
                      ? getCalendarTypeMeta(primaryType)
                      : null;
                    const isToday = day.dateKey === todayKey;

                    return (
                      <div
                        key={day.dateKey}
                        className={`rounded-xl border px-1.5 py-2 ${
                          day.inMonth
                            ? isToday
                              ? "border-ocean/45 bg-white text-ink shadow-[0_0_0_2px_rgb(var(--ocean)_/_0.2)]"
                              : "border-clay/25 bg-white/95 text-ink"
                            : "border-clay/15 bg-sand/35 text-ink/40"
                        }`}
                      >
                        <div className="flex min-h-[44px] flex-col items-center justify-center gap-1">
                          {primaryMeta && day.inMonth ? (
                            <span
                              className={`grid h-8 w-8 place-items-center rounded-full text-xs font-semibold text-white ${primaryMeta.dotClass}`}
                            >
                              {day.date.getDate()}
                            </span>
                          ) : (
                            <span className="grid h-8 w-8 place-items-center text-sm font-medium">
                              {day.date.getDate()}
                            </span>
                          )}
                          {dayTypes.length ? (
                            <span className="flex items-center justify-center gap-1">
                              {dayTypes.slice(0, 3).map((type) => {
                                const meta = getCalendarTypeMeta(type);
                                return (
                                  <span
                                    key={`${day.dateKey}-${type}`}
                                    className={`h-1.5 w-1.5 rounded-full ${meta.dotClass}`}
                                  />
                                );
                              })}
                            </span>
                          ) : (
                            <span className="h-1.5" />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="mt-5">
              <div className="flex items-center justify-between">
                <h4 className="text-lg font-semibold text-ink">{monthLabel}</h4>
                <span className="text-xs font-semibold text-ink/70">
                  {monthEntries.length} item{monthEntries.length === 1 ? "" : "s"}
                </span>
              </div>

              {monthEntries.length === 0 ? (
                <p className="mt-2 text-sm text-ink/75">No entries this month.</p>
              ) : (
                <div className="mt-3 grid gap-3">
                  {monthEntries.map((entry) => {
                    const typeMeta = getCalendarTypeMeta(entry?.type);
                    const dateParts = getCalendarDateParts(entry?.dateKey);

                    return (
                      <div
                        key={entry.id}
                        className={`rounded-xl border ${typeMeta.rowClass} px-3 py-3`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 items-start gap-3">
                            <div
                              className={`min-w-[68px] rounded-lg border px-2 py-2 text-center ${typeMeta.dateTileClass}`}
                            >
                              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink/65">
                                {dateParts.month}
                              </p>
                              <p className="text-lg font-bold text-ink">
                                {dateParts.day}
                              </p>
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-ink">
                                {entry?.title || "Calendar Entry"}
                              </p>
                              <p className="mt-1">
                                <span
                                  className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${typeMeta.chipClass}`}
                                >
                                  {typeMeta.label}
                                </span>
                              </p>
                              {entry?.note ? (
                                <p className="mt-1 text-xs text-ink/75 whitespace-pre-wrap">
                                  {entry.note}
                                </p>
                              ) : null}
                            </div>
                          </div>

                          {isStaff ? (
                            <button
                              type="button"
                              onClick={() => handleDeleteCalendarEntry(entry.id)}
                              disabled={deletingCalendarEntryId === entry.id}
                              className="rounded-full border border-clay/30 bg-white px-3 py-1 text-[11px] font-semibold text-ink/75 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {deletingCalendarEntryId === entry.id
                                ? "Removing..."
                                : "Remove"}
                            </button>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {isStaff ? (
              <form onSubmit={handleCreateCalendarEntry} className="mt-5 grid gap-3 rounded-2xl border border-clay/25 bg-cream/70 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-ink/75">
                  Add Calendar Entry
                </p>

                <div className="grid gap-3 md:grid-cols-3">
                  <input
                    type="date"
                    value={calendarForm.date}
                    onChange={(event) => {
                      setCalendarForm((prev) => ({
                        ...prev,
                        date: event.target.value,
                      }));
                      setCalendarStatus("");
                    }}
                    className="w-full rounded-xl border border-clay/30 bg-white px-3 py-2 text-sm"
                  />
                  <select
                    value={calendarForm.type}
                    onChange={(event) => {
                      setCalendarForm((prev) => ({
                        ...prev,
                        type: event.target.value,
                      }));
                      setCalendarStatus("");
                    }}
                    className="w-full rounded-xl border border-clay/30 bg-white px-3 py-2 text-sm"
                  >
                    {calendarTypeOptions.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={calendarForm.title}
                    onChange={(event) => {
                      setCalendarForm((prev) => ({
                        ...prev,
                        title: event.target.value,
                      }));
                      setCalendarStatus("");
                    }}
                    placeholder="Event / Holiday title"
                    className="w-full rounded-xl border border-clay/30 bg-white px-3 py-2 text-sm placeholder:text-ink/50"
                  />
                </div>

                <textarea
                  value={calendarForm.note}
                  onChange={(event) => {
                    setCalendarForm((prev) => ({
                      ...prev,
                      note: event.target.value,
                    }));
                    setCalendarStatus("");
                  }}
                  rows={3}
                  placeholder="Optional note"
                  className="w-full rounded-xl border border-clay/30 bg-white px-3 py-2 text-sm placeholder:text-ink/50"
                />

                {calendarStatus ? (
                  <p className="text-xs font-semibold text-ink/80">{calendarStatus}</p>
                ) : null}

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={savingCalendarEntry}
                    className="rounded-xl bg-clay px-4 py-2 text-sm font-semibold text-black shadow disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {savingCalendarEntry ? "Saving..." : "Save Calendar Entry"}
                  </button>
                </div>
              </form>
            ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {feesOpen ? (
        <div
          className="ui-modal"
          role="dialog"
          aria-modal="true"
          aria-label="Fees"
        >
          <button
            type="button"
            aria-label="Close fees"
            onClick={closeFeesModal}
            className="ui-modal__scrim" tabIndex={-1}
          />
          <div tabIndex={-1} className="ui-modal__panel w-full max-w-3xl">
            <div className="ui-modal__body">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-ink/75">
                  Campus Hub
                </p>
                <h3 className="text-xl font-semibold text-ink">Fees</h3>
                <p className="text-xs text-ink/75">
                  {isStaff
                    ? "Add fees for a student and update paid status."
                    : "Your semester-wise fee details."}
                </p>
              </div>
              <button
                type="button"
                onClick={closeFeesModal}
                className="ui-modal__close"
              >
                Close
              </button>
            </div>

            {isStaff ? (
              <div className="mt-4 grid gap-2 rounded-2xl border border-clay/25 bg-cream/70 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-ink/75">
                  Choose Student
                </p>
                {loadingFeesStudents ? (
                  <p className="text-xs text-ink/75">Loading students...</p>
                ) : feesStudents.length === 0 ? (
                  <p className="text-xs text-ink/75">No students found.</p>
                ) : (
                  <select
                    value={feeStudentId}
                    onChange={(event) => {
                      setFeeStudentId(event.target.value);
                      setFeesStatus("");
                    }}
                    className="w-full rounded-xl border border-clay/30 bg-white px-3 py-2 text-sm"
                  >
                    {feesStudents.map((student) => (
                      <option key={student.id} value={student.id}>
                        {student.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            ) : null}

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setFeeSemesterFilter("all")}
                className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                  feeSemesterFilter === "all"
                    ? "border-clay/50 bg-clay/20 text-ink"
                    : "border-clay/25 bg-white text-ink/75"
                }`}
              >
                All Semesters
              </button>
              {semesterFilterOptions.map((semester) => (
                <button
                  key={semester}
                  type="button"
                  onClick={() => setFeeSemesterFilter(semester)}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                    feeSemesterFilter === semester
                      ? "border-clay/50 bg-clay/20 text-ink"
                      : "border-clay/25 bg-white text-ink/75"
                  }`}
                >
                  {semester}
                </button>
              ))}
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <button
                type="button"
                className="flex items-center justify-between rounded-xl border border-clay/35 bg-white px-3 py-2 text-left"
              >
                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-ink/70">
                  Total Amount
                </span>
                <span className="text-sm font-bold text-ink">Rs. {totalFeeAmountLabel}</span>
              </button>
              <button
                type="button"
                className="flex items-center justify-between rounded-xl border border-emerald-300 bg-emerald-100/60 px-3 py-2 text-left"
              >
                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-emerald-900/80">
                  Total Amount Given
                </span>
                <span className="text-sm font-bold text-emerald-900">Rs. {paidFeeAmountLabel}</span>
              </button>
              <button
                type="button"
                className="flex items-center justify-between rounded-xl border border-amber-300 bg-amber-100/60 px-3 py-2 text-left"
              >
                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-amber-900/80">
                  Pending Amount
                </span>
                <span className="text-sm font-bold text-amber-900">Rs. {pendingFeeAmountLabel}</span>
              </button>
            </div>

            {feesError ? (
              <p className="mt-3 text-sm text-ink/75">{feesError}</p>
            ) : loadingFees ? (
              <p className="mt-3 text-sm text-ink/75">Loading fees...</p>
            ) : groupedSemesterKeys.length === 0 ? (
              <p className="mt-3 text-sm text-ink/75">No fees available.</p>
            ) : (
              <div className="mt-4 grid gap-4">
                {groupedSemesterKeys.map((semester) => (
                  <section key={semester} className="grid gap-2">
                    <h4 className="text-sm font-semibold uppercase tracking-[0.12em] text-ink/70">
                      {semester}
                    </h4>
                    <div className="grid gap-2">
                      {groupedFees[semester].map((entry) => {
                        const totalAmount = getEntryTotalAmount(entry);
                        const paidAmount = getEntryPaidAmount(entry);
                        const pendingAmount = getEntryPendingAmount(entry);
                        const totalAmountLabel = totalAmount.toLocaleString("en-IN", {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 2,
                        });
                        const paidAmountLabel = paidAmount.toLocaleString("en-IN", {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 2,
                        });
                        const pendingAmountLabel = pendingAmount.toLocaleString(
                          "en-IN",
                          {
                            minimumFractionDigits: 0,
                            maximumFractionDigits: 2,
                          }
                        );
                        const isFullyPaid = pendingAmount <= 0;
                        const paidClass = isFullyPaid
                          ? "border-emerald-200 bg-emerald-100 text-emerald-900"
                          : "border-amber-200 bg-amber-100 text-amber-900";

                        return (
                          <div
                            key={entry.id}
                            className="rounded-xl border border-clay/30 bg-white/95 px-3 py-3"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-ink">
                                  {entry?.feeType || "Fee Item"}
                                </p>
                                <div className="mt-1 grid gap-0.5 text-xs text-ink/75">
                                  <p>
                                    Total:{" "}
                                    <span className="font-semibold text-ink">
                                      Rs. {totalAmountLabel}
                                    </span>
                                  </p>
                                  <p>
                                    Paid:{" "}
                                    <span className="font-semibold text-ink">
                                      Rs. {paidAmountLabel}
                                    </span>
                                  </p>
                                  <p>
                                    Pending:{" "}
                                    <span className="font-semibold text-ink">
                                      Rs. {pendingAmountLabel}
                                    </span>
                                  </p>
                                </div>
                              </div>
                              <span
                                className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${paidClass}`}
                              >
                                {isFullyPaid ? "Paid" : "Pending"}
                              </span>
                            </div>

                            {isStaff ? (
                              <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleToggleFeePaid(entry)}
                                  disabled={updatingFeeId === entry.id}
                                  className="rounded-full border border-clay/30 bg-white px-3 py-1 text-[11px] font-semibold text-ink/75 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  {updatingFeeId === entry.id
                                    ? "Updating..."
                                    : isFullyPaid
                                    ? "Mark Pending"
                                    : "Mark Paid"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteFee(entry.id)}
                                  disabled={removingFeeId === entry.id}
                                  className="rounded-full border border-clay/30 bg-white px-3 py-1 text-[11px] font-semibold text-ink/75 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  {removingFeeId === entry.id ? "Removing..." : "Remove"}
                                </button>
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            )}

            {isStaff ? (
              <form
                onSubmit={handleCreateFee}
                className="mt-5 grid gap-3 rounded-2xl border border-clay/25 bg-cream/70 p-4"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-ink/75">
                  Add Fee
                </p>

                <div className="grid gap-3 md:grid-cols-2">
                  <select
                    value={feeForm.semester}
                    onChange={(event) => {
                      setFeeForm((prev) => ({
                        ...prev,
                        semester: event.target.value,
                      }));
                      setFeesStatus("");
                    }}
                    className="w-full rounded-xl border border-clay/30 bg-white px-3 py-2 text-sm"
                  >
                    {semesterOptions.map((semester) => (
                      <option key={semester} value={semester}>
                        {semester}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={feeForm.type}
                    onChange={(event) => {
                      setFeeForm((prev) => ({
                        ...prev,
                        type: event.target.value,
                      }));
                      setFeesStatus("");
                    }}
                    placeholder="Fee type (e.g. Tuition Fee)"
                    className="w-full rounded-xl border border-clay/30 bg-white px-3 py-2 text-sm placeholder:text-ink/50"
                  />
                </div>

                <div className="grid gap-3">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={feeForm.totalAmount}
                    onChange={(event) => {
                      setFeeForm((prev) => ({
                        ...prev,
                        totalAmount: event.target.value,
                      }));
                      setFeesStatus("");
                    }}
                    placeholder="Total Amount"
                    className="no-number-spin w-full rounded-xl border border-clay/30 bg-white px-3 py-2 text-sm placeholder:text-ink/50"
                  />
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={feeForm.paidAmount}
                    onChange={(event) => {
                      setFeeForm((prev) => ({
                        ...prev,
                        paidAmount: event.target.value,
                      }));
                      setFeesStatus("");
                    }}
                    placeholder="Paid Amount"
                    className="no-number-spin w-full rounded-xl border border-clay/30 bg-white px-3 py-2 text-sm"
                  />
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={Number.isFinite(feeFormPendingAmount) ? feeFormPendingAmount : 0}
                    readOnly
                    placeholder="Pending Amount"
                    className="no-number-spin w-full rounded-xl border border-clay/30 bg-sand/70 px-3 py-2 text-sm text-ink/80"
                  />
                </div>

                {feesStatus ? (
                  <p className="text-xs font-semibold text-ink/80">{feesStatus}</p>
                ) : null}

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={creatingFee}
                    className="rounded-xl bg-clay px-4 py-2 text-sm font-semibold text-black shadow disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {creatingFee ? "Adding..." : "Add Fee"}
                  </button>
                </div>
              </form>
            ) : feesStatus ? (
              <p className="mt-4 text-xs font-semibold text-ink/80">{feesStatus}</p>
            ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {activeNotice ? (() => {
        const { dateLabel, author, audienceMeta, showMeta } =
          getNoticeMeta(activeNotice);

        return (
          <div
            className="ui-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Notice details"
          >
            <button
              type="button"
              onClick={() => setActiveNotice(null)}
              aria-label="Close notice"
              className="ui-modal__scrim" tabIndex={-1}
            />
            <div tabIndex={-1} className="ui-modal__panel w-full max-w-2xl p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-ink/75">
                    Notice
                  </p>
                  <h3 className="text-xl font-semibold text-ink">
                    {activeNotice.title || "Notice"}
                  </h3>
                  {showMeta ? (
                    <p className="mt-1 text-xs text-ink/75">
                      {[dateLabel, author, audienceMeta]
                        .filter(Boolean)
                        .join(" - ")}
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => setActiveNotice(null)}
                  className="ui-modal__close"
                >
                  Close
                </button>
              </div>

              {activeNotice.message ? (
                <p className="mt-4 whitespace-pre-wrap text-sm text-ink/80">
                  {activeNotice.message}
                </p>
              ) : (
                <p className="mt-4 text-sm text-ink/75">No message provided.</p>
              )}

              {activeNotice.attachments?.length ? (
                <div className="mt-4 grid gap-2 text-sm">
                  {activeNotice.attachments.map((file) => (
                    <a
                      key={`${activeNotice.id}-${file.url || file.name}`}
                      href={file.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center justify-between rounded-lg border border-clay/30 bg-cream px-3 py-2 text-sm text-ink/80 transition hover:border-clay/50"
                    >
                      <span className="truncate">{file.name}</span>
                      <span className="text-xs text-ink/75">
                        {formatFileSize(file.size)}
                      </span>
                    </a>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        );
      })() : null}

      {isStaff && activeModule ? (
        <div
          className="ui-modal ui-modal--compact"
          role="dialog"
          aria-modal="true"
          aria-label="Edit module"
        >
          <button
            type="button"
            aria-label="Close edit module"
            onClick={() => setActiveModule(null)}
            className="ui-modal__scrim" tabIndex={-1}
          />
          <div tabIndex={-1} className="ui-modal__panel w-full max-w-lg p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-ink/75">
                  Edit Module
                </p>
                <h3 className="text-lg font-semibold text-ink">
                  {activeModule.label}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setActiveModule(null)}
                className="ui-modal__close"
              >
                Close
              </button>
            </div>

            <div className="mt-4 grid gap-2">
              <label className="text-xs font-semibold uppercase tracking-[0.2em] text-ink/75">
                Content
              </label>
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                rows={6}
                placeholder="Add notes, schedule details, or announcements..."
                className="w-full rounded-xl border border-clay/20 bg-white px-3 py-2 text-sm placeholder:text-ink/50"
              />
              {loadingDraft ? (
                <p className="text-xs text-ink/75">Loading content...</p>
              ) : null}
              {status ? (
                <p className="text-xs font-semibold text-ink/80">{status}</p>
              ) : null}
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setActiveModule(null)}
                className="rounded-xl border border-clay/20 bg-white px-4 py-2 text-sm font-semibold text-ink/80"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="rounded-xl border border-clay/20 bg-white px-4 py-2 text-sm font-semibold text-ink/80"
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}




