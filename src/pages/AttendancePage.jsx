import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Card from "../components/Card";
import GradientHeader from "../components/GradientHeader";
import { useAuth } from "../state/auth";
import { db } from "../lib/firebase";
import { collectIdentifierTokens } from "../lib/qr";
import { resolveScheduleEntryDateKey, toDateKey } from "../lib/scheduleDate";
import {
  createBulkUserNotifications,
  createUserNotification,
  notificationTypes,
} from "../lib/notifications";
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  limit,
  where,
} from "firebase/firestore";

const FaceAttendanceModal = lazy(() => import("../components/FaceAttendanceModal"));

const formatDateLabel = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const formatDateTimeLabel = (value) => {
  if (!value) return "";
  const date = value?.toDate ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const FACE_MATCH_THRESHOLD = 0.74;
const FACE_MATCH_MIN_MARGIN = 0.035;
const FACE_MATCH_CONFIRMATION_COUNT = 2;
const FACE_MATCH_CONFIRMATION_WINDOW_MS = 2600;
const FACE_MATCH_COOLDOWN_MS = 4200;
const FACE_MIN_VECTOR_LENGTH = 64;
const FACE_REGISTRATION_SAMPLE_TARGET = 3;
const FACE_REGISTRATION_SAMPLE_LIMIT = 6;
const FACE_REGISTRATION_MIN_CONSISTENCY = 0.82;
const OFFLINE_SCAN_QUEUE_KEY = "ckcethub_attendance_scan_queue_v1";
const MAX_OFFLINE_SCAN_QUEUE_ITEMS = 240;
const SCAN_QUEUE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const SCAN_QUEUE_TOKEN_PATTERN = /^[A-Za-z0-9:_-]{1,160}$/;
const RETRYABLE_SCAN_ERROR_CODES = new Set([
  "aborted",
  "cancelled",
  "deadline-exceeded",
  "internal",
  "resource-exhausted",
  "unavailable",
]);

const normalizeFirestoreErrorCode = (value) =>
  String(value || "")
    .replace(/^firestore\//i, "")
    .trim()
    .toLowerCase();

const isRetryableScanError = (code) =>
  RETRYABLE_SCAN_ERROR_CODES.has(normalizeFirestoreErrorCode(code));

const normalizeOfflineScanQueueItem = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const date = String(value.date || "").trim();
  const qrToken = String(value.qrToken || "").trim();
  const queuedAt = getTimestampMillis(value.queuedAt);

  if (!SCAN_QUEUE_DATE_PATTERN.test(date)) return null;
  if (!SCAN_QUEUE_TOKEN_PATTERN.test(qrToken)) return null;
  if (!queuedAt) return null;

  const parsedSimilarity = Number(value.matchSimilarity);

  return {
    id:
      String(value.id || "").trim() ||
      `${date}:${qrToken}:${queuedAt}:${Math.random().toString(36).slice(2, 7)}`,
    date,
    qrToken,
    queuedAt,
    studentId: String(value.studentId || "").trim(),
    studentName: String(value.studentName || "").trim(),
    source: String(value.source || "face").trim() || "face",
    matchSimilarity: Number.isFinite(parsedSimilarity) ? parsedSimilarity : null,
  };
};

const readOfflineScanQueue = () => {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(OFFLINE_SCAN_QUEUE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((item) => normalizeOfflineScanQueueItem(item))
      .filter(Boolean)
      .slice(-MAX_OFFLINE_SCAN_QUEUE_ITEMS);
  } catch {
    return [];
  }
};

const writeOfflineScanQueue = (items) => {
  if (typeof window === "undefined") return;

  try {
    const safeItems = Array.isArray(items)
      ? items
          .map((item) => normalizeOfflineScanQueueItem(item))
          .filter(Boolean)
          .slice(-MAX_OFFLINE_SCAN_QUEUE_ITEMS)
      : [];
    window.localStorage.setItem(
      OFFLINE_SCAN_QUEUE_KEY,
      JSON.stringify(safeItems)
    );
  } catch {
    // Ignore storage failures so scan flow keeps working.
  }
};

const mergeOfflineScanQueueItem = (queue, incoming) => {
  const safeQueue = Array.isArray(queue) ? queue : [];
  const normalizedIncoming = normalizeOfflineScanQueueItem(incoming);
  if (!normalizedIncoming) return safeQueue;

  const duplicateIndex = safeQueue.findIndex(
    (item) =>
      item.date === normalizedIncoming.date &&
      item.qrToken === normalizedIncoming.qrToken
  );

  if (duplicateIndex >= 0) {
    const next = [...safeQueue];
    next[duplicateIndex] = {
      ...next[duplicateIndex],
      studentId:
        normalizedIncoming.studentId || next[duplicateIndex].studentId || "",
      studentName:
        normalizedIncoming.studentName || next[duplicateIndex].studentName || "",
      source: normalizedIncoming.source || next[duplicateIndex].source || "face",
      matchSimilarity:
        normalizedIncoming.matchSimilarity ?? next[duplicateIndex].matchSimilarity ?? null,
    };
    return next.slice(-MAX_OFFLINE_SCAN_QUEUE_ITEMS);
  }

  return [...safeQueue, normalizedIncoming].slice(-MAX_OFFLINE_SCAN_QUEUE_ITEMS);
};

const getPeriodNumber = (value) => {
  const match = String(value || "").match(/\d+/);
  return match ? Number(match[0]) : Number.NaN;
};

const getCreatedAtMillis = (value) => {
  if (value?.toMillis) {
    return value.toMillis();
  }
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.getTime() : 0;
};

const getTimestampMillis = (value) => {
  if (value?.toMillis) return value.toMillis();
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.getTime() : 0;
};

const normalizeDailyQrScanEntry = (value) => {
  if (value === null || value === undefined || value === false) return null;

  if (value && typeof value === "object" && !Array.isArray(value)) {
    return {
      scannedAtMillis: getTimestampMillis(
        value.scannedAt ?? value.timestamp ?? value.at
      ),
      scannedBy: String(value.scannedBy || ""),
      scannedByName: String(value.scannedByName || ""),
      qrNum: String(value.qrNum || value.qrNumber || ""),
    };
  }

  return {
    scannedAtMillis: getTimestampMillis(value),
    scannedBy: "",
    scannedByName: "",
    qrNum: "",
  };
};

const formatTimeLabel = (value) => {
  const millis = getTimestampMillis(value);
  if (!millis) return "";
  return new Date(millis).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
};

const getStudentScanTokens = (student) =>
  collectIdentifierTokens(
    student?.id,
    student?.qrNum,
    student?.qrNumber,
    student?.qr_num,
    student?.qrNumNumber,
    student?.qrNumberNumeric
  );

const getStudentScanToken = (student) => {
  const tokens = getStudentScanTokens(student);
  return tokens[0] || String(student?.id || "").trim();
};

const resolveStudentEmail = (student = {}) =>
  String(
    student?.email ||
      student?.studentEmail ||
      student?.emailId ||
      student?.emailID ||
      student?.userEmail ||
      student?.details?.email ||
      student?.details?.emailId ||
      student?.details?.emailID ||
      student?.details?.studentEmail ||
      student?.studentDetails?.email ||
      student?.studentDetails?.emailId ||
      student?.studentDetails?.emailID ||
      ""
  )
    .trim()
    .toLowerCase();

const normalizeFaceVector = (value) => {
  if (!Array.isArray(value)) return [];
  const vector = value
    .map((entry) => Number(entry))
    .filter((entry) => Number.isFinite(entry));
  if (vector.length < FACE_MIN_VECTOR_LENGTH) return [];

  let squaredNorm = 0;
  vector.forEach((entry) => {
    squaredNorm += entry * entry;
  });
  if (squaredNorm <= 0) return [];

  const norm = Math.sqrt(squaredNorm);
  return vector.map((entry) => Number((entry / norm).toFixed(7)));
};

const cosineSimilarity = (vectorA, vectorB) => {
  if (!Array.isArray(vectorA) || !Array.isArray(vectorB)) return 0;
  if (vectorA.length === 0 || vectorB.length === 0) return 0;

  const dimensions = Math.min(vectorA.length, vectorB.length);
  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let index = 0; index < dimensions; index += 1) {
    const a = Number(vectorA[index]) || 0;
    const b = Number(vectorB[index]) || 0;
    dot += a * b;
    normA += a * a;
    normB += b * b;
  }

  if (normA <= 0 || normB <= 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
};

const dedupeFaceVectors = (vectors, duplicateSimilarity = 0.998) => {
  const next = [];
  const safeVectors = Array.isArray(vectors) ? vectors : [];
  safeVectors.forEach((candidate) => {
    if (!Array.isArray(candidate) || candidate.length < FACE_MIN_VECTOR_LENGTH) {
      return;
    }
    const duplicate = next.some(
      (existing) => cosineSimilarity(existing, candidate) >= duplicateSimilarity
    );
    if (!duplicate) {
      next.push(candidate);
    }
  });
  return next;
};

const averageFaceVector = (vectors) => {
  if (!Array.isArray(vectors) || vectors.length === 0) return [];
  const dimensions = vectors.reduce(
    (max, vector) => Math.max(max, Array.isArray(vector) ? vector.length : 0),
    0
  );
  if (dimensions < FACE_MIN_VECTOR_LENGTH) return [];

  const sums = new Array(dimensions).fill(0);
  const counts = new Array(dimensions).fill(0);

  vectors.forEach((vector) => {
    if (!Array.isArray(vector)) return;
    for (let index = 0; index < dimensions; index += 1) {
      const value = Number(vector[index]);
      if (!Number.isFinite(value)) continue;
      sums[index] += value;
      counts[index] += 1;
    }
  });

  const averaged = sums.map((sum, index) => {
    const count = counts[index];
    if (!count) return 0;
    return sum / count;
  });

  return normalizeFaceVector(averaged);
};

const collectFaceSampleVectors = (student) => {
  const faceAttendance = student?.faceAttendance;
  const rawSampleCandidates = [
    faceAttendance?.sampleVectors,
    faceAttendance?.samples,
    student?.faceSamples,
  ];

  const collected = [];
  rawSampleCandidates.forEach((candidate) => {
    if (!Array.isArray(candidate)) return;
    candidate.forEach((entry) => {
      if (Array.isArray(entry)) {
        collected.push(entry);
        return;
      }
      if (!entry || typeof entry !== "object") return;
      if (Array.isArray(entry.vector)) {
        collected.push(entry.vector);
        return;
      }
      if (Array.isArray(entry.descriptor)) {
        collected.push(entry.descriptor);
        return;
      }
      if (Array.isArray(entry.embedding)) {
        collected.push(entry.embedding);
      }
    });
  });

  return dedupeFaceVectors(
    collected
      .map((value) => normalizeFaceVector(value))
      .filter((value) => value.length >= FACE_MIN_VECTOR_LENGTH)
  );
};

const getStudentFaceTemplates = (student) => {
  if (!student || typeof student !== "object") return [];

  const directCandidates = [
    student?.faceAttendance?.vector,
    student?.faceAttendance?.descriptor,
    student?.faceAttendance?.embedding,
    student?.faceVector,
    student?.faceDescriptor,
    student?.faceEmbedding,
    student?.faceAttendanceVector,
  ]
    .map((candidate) => normalizeFaceVector(candidate))
    .filter((candidate) => candidate.length >= FACE_MIN_VECTOR_LENGTH);

  const sampleVectors = collectFaceSampleVectors(student);
  const merged = dedupeFaceVectors([...directCandidates, ...sampleVectors]);
  if (merged.length === 0) return [];

  const centroidVector = averageFaceVector(merged);
  if (centroidVector.length >= FACE_MIN_VECTOR_LENGTH) {
    return dedupeFaceVectors([centroidVector, ...merged]);
  }
  return merged;
};

const getStudentFaceVector = (student) => {
  const templates = getStudentFaceTemplates(student);
  return templates[0] || [];
};

const computeFaceSampleConsistency = (vectors) => {
  const safeVectors = dedupeFaceVectors(
    (Array.isArray(vectors) ? vectors : [])
      .map((vector) => normalizeFaceVector(vector))
      .filter((vector) => vector.length >= FACE_MIN_VECTOR_LENGTH)
  );

  if (safeVectors.length <= 1) {
    return {
      sampleCount: safeVectors.length,
      averageSimilarity: 1,
      minSimilarity: 1,
      centroidVector: safeVectors[0] || [],
    };
  }

  const centroidVector = averageFaceVector(safeVectors);
  if (centroidVector.length < FACE_MIN_VECTOR_LENGTH) {
    return {
      sampleCount: safeVectors.length,
      averageSimilarity: 0,
      minSimilarity: 0,
      centroidVector: [],
    };
  }

  const similarities = safeVectors
    .map((vector) => cosineSimilarity(vector, centroidVector))
    .filter((value) => Number.isFinite(value));
  if (similarities.length === 0) {
    return {
      sampleCount: safeVectors.length,
      averageSimilarity: 0,
      minSimilarity: 0,
      centroidVector,
    };
  }

  const sum = similarities.reduce((total, value) => total + value, 0);
  return {
    sampleCount: safeVectors.length,
    averageSimilarity: sum / similarities.length,
    minSimilarity: Math.min(...similarities),
    centroidVector,
  };
};

const toSimilarityPercentLabel = (value) => {
  const percent = Math.max(0, Math.min(100, Number(value) * 100));
  return `${Math.round(percent)}%`;
};

const normalizeAttendanceStatus = (value) => {
  if (value === true || value === "present") return "present";
  if (value === false || value === "absent") return "absent";
  return "unmarked";
};

const statusLabelMap = {
  present: "Present",
  absent: "Absent",
  unmarked: "Not marked",
};

const statusChipClassMap = {
  present:
    "border border-emerald-200 bg-emerald-100 text-emerald-900",
  absent:
    "border border-rose-200 bg-rose-100 text-rose-900",
  unmarked:
    "border border-clay/35 bg-white/90 text-ink/75",
};

export default function AttendancePage({ forcedStaff }) {
  const { role, user, profile } = useAuth();
  const [scheduleItems, setScheduleItems] = useState([]);
  const [loadingSchedule, setLoadingSchedule] = useState(true);
  const [scheduleError, setScheduleError] = useState("");
  const [students, setStudents] = useState([]);
  const [loadingStudents, setLoadingStudents] = useState(true);
  const [studentsError, setStudentsError] = useState("");
  const [attendanceData, setAttendanceData] = useState(null);
  const [loadingAttendance, setLoadingAttendance] = useState(true);
  const [attendanceError, setAttendanceError] = useState("");
  const [selectedDate, setSelectedDate] = useState(() => {
    return toDateKey(new Date());
  });
  const [absenceReason, setAbsenceReason] = useState(null);
  const [absenceReasonText, setAbsenceReasonText] = useState("");
  const [absenceReasonStatus, setAbsenceReasonStatus] = useState("");
  const [absenceReasonError, setAbsenceReasonError] = useState("");
  const [loadingAbsenceReason, setLoadingAbsenceReason] = useState(false);
  const [savingAbsenceReason, setSavingAbsenceReason] = useState(false);
  const [_scanStatus, setScanStatus] = useState("");
  const [scanError, setScanError] = useState("");
  const [_lastScannedId, setLastScannedId] = useState("");
  const [isFaceScanModalOpen, setIsFaceScanModalOpen] = useState(false);
  const [isFaceRegisterModalOpen, setIsFaceRegisterModalOpen] = useState(false);
  const [faceProfileStatus, setFaceProfileStatus] = useState("");
  const [faceProfileError, setFaceProfileError] = useState("");
  const [scanQueue, setScanQueue] = useState([]);
  const [scanQueueStatus, setScanQueueStatus] = useState("");
  const [isSyncingScanQueue, setIsSyncingScanQueue] = useState(false);
  const [periodUpdateStatus, setPeriodUpdateStatus] = useState("");
  const [periodUpdateError, setPeriodUpdateError] = useState("");
  const [savingPeriodKey, setSavingPeriodKey] = useState("");
  const [savingBulkSessionId, setSavingBulkSessionId] = useState("");
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator !== "undefined" ? navigator.onLine : true
  );

  const [records, setRecords] = useState({});
  const lastScanRef = useRef({ key: "", at: 0 });
  const lastFaceMatchRef = useRef({ studentId: "", at: 0 });
  const pendingFaceMatchRef = useRef({ studentId: "", count: 0, at: 0 });
  const registrationSamplesRef = useRef([]);
  const queueSyncInFlightRef = useRef(false);
  const faceModalAutoOpenedRef = useRef(false);

  const isStaff =
    typeof forcedStaff === "boolean" ? forcedStaff : role === "staff";
  const isParent = role === "parent";
  const isStudent = !isStaff && role === "student";
  const canSubmitAbsenceReason = !isStaff && isParent;
  const staffDisplayName = profile?.name || user?.displayName || "Staff";
  const dateLabel = useMemo(() => formatDateLabel(selectedDate), [selectedDate]);
  const currentStudentId = user?.uid || "";
  const currentStudentName = profile?.name || user?.displayName || "Student";
  const attendanceDateLabel = dateLabel || selectedDate;
  const absenceReasonDocId =
    currentStudentId && selectedDate ? `${selectedDate}_${currentStudentId}` : "";
  const orderedScheduleItems = useMemo(
    () =>
      [...scheduleItems].sort((a, b) => {
        const aPeriod = getPeriodNumber(a.label);
        const bPeriod = getPeriodNumber(b.label);
        const aHasPeriod = Number.isFinite(aPeriod);
        const bHasPeriod = Number.isFinite(bPeriod);

        if (aHasPeriod && bHasPeriod && aPeriod !== bPeriod) {
          return aPeriod - bPeriod;
        }

        if (aHasPeriod !== bHasPeriod) {
          return aHasPeriod ? -1 : 1;
        }

        return getCreatedAtMillis(a.createdAt) - getCreatedAtMillis(b.createdAt);
      }),
    [scheduleItems]
  );
  const studentScanIndex = useMemo(() => {
    const index = new Map();
    if (!isStaff) return index;

    students.forEach((student) => {
      getStudentScanTokens(student).forEach((token) => {
        const existing = index.get(token) || [];
        existing.push(student);
        index.set(token, existing);
      });
    });

    return index;
  }, [isStaff, students]);
  const studentFaceProfiles = useMemo(() => {
    const next = [];
    if (!isStaff) return next;

    students.forEach((student) => {
      const templates = getStudentFaceTemplates(student);
      if (templates.length > 0) {
        next.push({
          student,
          templates,
          templateCount: templates.length,
        });
      }
    });

    return next;
  }, [isStaff, students]);
  const enrolledFaceCount = studentFaceProfiles.length;
  const dailyQrScans = useMemo(() => {
    const faceValue = attendanceData?.dailyFaceScans;
    if (faceValue && typeof faceValue === "object") return faceValue;
    const rawValue = attendanceData?.dailyQrScans;
    return rawValue && typeof rawValue === "object" ? rawValue : {};
  }, [attendanceData]);
  const dailyQrScanMetaByStudent = useMemo(() => {
    const next = {};
    Object.entries(dailyQrScans).forEach(([studentId, scanValue]) => {
      const meta = normalizeDailyQrScanEntry(scanValue);
      if (meta) {
        next[studentId] = meta;
      }
    });
    return next;
  }, [dailyQrScans]);
  const periodStatusByStudent = useMemo(() => {
    const next = {};
    students.forEach((student) => {
      let hasPresent = false;
      let hasAbsent = false;
      orderedScheduleItems.forEach((session) => {
        const status = normalizeAttendanceStatus(records[session.id]?.[student.id]);
        if (status === "present") hasPresent = true;
        if (status === "absent") hasAbsent = true;
      });

      if (hasAbsent) {
        next[student.id] = "absent";
        return;
      }
      if (hasPresent) {
        next[student.id] = "present";
        return;
      }

      next[student.id] = "unmarked";
    });
    return next;
  }, [orderedScheduleItems, records, students]);
  const scanStatusByStudent = useMemo(() => {
    const next = {};
    students.forEach((student) => {
      next[student.id] = dailyQrScanMetaByStudent[student.id]
        ? "present"
        : "unmarked";
    });
    return next;
  }, [dailyQrScanMetaByStudent, students]);
  const scanStatusCounts = useMemo(() => {
    const counts = {
      present: 0,
      absent: 0,
      unmarked: 0,
    };

    students.forEach((student) => {
      const status = scanStatusByStudent[student.id] || "unmarked";
      if (status === "present") {
        counts.present += 1;
      } else if (status === "absent") {
        counts.absent += 1;
      } else {
        counts.unmarked += 1;
      }
    });

    return counts;
  }, [scanStatusByStudent, students]);
  const sessionStatusCounts = useMemo(() => {
    const next = {};
    if (!isStaff || students.length === 0) return next;

    orderedScheduleItems.forEach((session) => {
      const periodRecords = records[session.id] || {};
      const counts = {
        present: 0,
        absent: 0,
        unmarked: 0,
      };

      students.forEach((student) => {
        const status = normalizeAttendanceStatus(periodRecords[student.id]);
        counts[status] += 1;
      });

      next[session.id] = counts;
    });

    return next;
  }, [isStaff, orderedScheduleItems, records, students]);
  const absentSessions = useMemo(() => {
    if (!canSubmitAbsenceReason || !currentStudentId) return [];
    return orderedScheduleItems
      .filter((session) => {
        const periodRecords = records[session.id] || {};
        return periodRecords[currentStudentId] === false;
      })
      .map((session) => ({
        id: session.id,
        label: session.label || "",
        subject: session.subject || "",
        time: session.time || "",
      }));
  }, [canSubmitAbsenceReason, currentStudentId, orderedScheduleItems, records]);
  const currentStudentDailyStatus = useMemo(() => {
    if (!isStudent || !currentStudentId) return "unmarked";
    const periodStatus = periodStatusByStudent[currentStudentId] || "unmarked";
    if (periodStatus === "absent") {
      return "absent";
    }
    if (periodStatus === "present") {
      return "present";
    }

    return dailyQrScanMetaByStudent[currentStudentId] ? "present" : "unmarked";
  }, [currentStudentId, dailyQrScanMetaByStudent, isStudent, periodStatusByStudent]);
  const currentStudentFaceVector = useMemo(
    () => getStudentFaceVector({ ...(profile || {}), id: currentStudentId }),
    [currentStudentId, profile]
  );
  const hasCurrentStudentFaceProfile =
    currentStudentFaceVector.length >= FACE_MIN_VECTOR_LENGTH;
  useEffect(() => {
    if (!isStudent) {
      registrationSamplesRef.current = [];
      return;
    }
    registrationSamplesRef.current = collectFaceSampleVectors(profile || {});
  }, [isStudent, profile]);
  const absenceReasonSubmittedAtLabel = formatDateTimeLabel(
    absenceReason?.submittedAt || absenceReason?.updatedAt || absenceReason?.createdAt
  );
  const hasSubmittedAbsenceReason = Boolean(
    String(absenceReason?.reason || "").trim()
  );
  const queuedScanCount = scanQueue.length;
  const queuedScanCountForSelectedDate = useMemo(
    () => scanQueue.filter((item) => item.date === selectedDate).length,
    [scanQueue, selectedDate]
  );
  const latestQueuedScanLabel = useMemo(() => {
    if (scanQueue.length === 0) return "";
    const latest = [...scanQueue].sort((a, b) => b.queuedAt - a.queuedAt)[0];
    return latest ? formatDateTimeLabel(latest.queuedAt) : "";
  }, [scanQueue]);

  useEffect(() => {
    if (!SCAN_QUEUE_DATE_PATTERN.test(selectedDate)) {
      setScheduleItems([]);
      setLoadingSchedule(false);
      setScheduleError("Select a valid date.");
      return undefined;
    }

    setLoadingSchedule(true);
    setScheduleError("");

    let unsubscribe = () => {};
    try {
      const scheduleQuery = query(
        collection(db, "todaysSchedules"),
        orderBy("createdAt", "desc"),
        limit(240)
      );

      unsubscribe = onSnapshot(
        scheduleQuery,
        (snapshot) => {
          const next = snapshot.docs
            .map((docItem) => {
              const data = docItem.data() || {};
              return {
                id: docItem.id,
                entryDateKey: resolveScheduleEntryDateKey(data),
                label: String(data.period || data.label || data.title || ""),
                subject: String(
                  data.subjectName || data.subject || data.title || "Subject"
                ),
                time: String(data.time || ""),
                createdAt: data.createdAt || null,
              };
            })
            .filter((item) => item.entryDateKey === selectedDate)
            .sort((a, b) => {
              const aPeriod = getPeriodNumber(a.label);
              const bPeriod = getPeriodNumber(b.label);
              const aHasPeriod = Number.isFinite(aPeriod);
              const bHasPeriod = Number.isFinite(bPeriod);

              if (aHasPeriod && bHasPeriod && aPeriod !== bPeriod) {
                return aPeriod - bPeriod;
              }

              if (aHasPeriod !== bHasPeriod) {
                return aHasPeriod ? -1 : 1;
              }

              return getCreatedAtMillis(a.createdAt) - getCreatedAtMillis(b.createdAt);
            });
          setScheduleItems(next);
          setLoadingSchedule(false);
          setScheduleError("");
        },
        () => {
          setScheduleError("Unable to load today's schedule.");
          setLoadingSchedule(false);
        }
      );
    } catch {
      setScheduleError("Unable to load today's schedule.");
      setLoadingSchedule(false);
    }

    return () => unsubscribe();
  }, [selectedDate]);

  useEffect(() => {
    if (!isStaff) {
      setStudents([]);
      setLoadingStudents(false);
      setStudentsError("");
      return undefined;
    }

    setLoadingStudents(true);
    setStudentsError("");

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
            .map((docItem) => ({
              id: docItem.id,
              ...docItem.data(),
            }))
            .filter((student) => student.name || student.email)
            .map((student) => ({
              ...student,
              name: student.name || student.email || "Student",
            }))
            .sort((a, b) => a.name.localeCompare(b.name));
          setStudents(next);
          setLoadingStudents(false);
          setStudentsError("");
        },
        () => {
          setStudentsError("Unable to load students.");
          setLoadingStudents(false);
        }
      );
    } catch {
      setStudentsError("Unable to load students.");
      setLoadingStudents(false);
    }

    return () => unsubscribe();
  }, [isStaff]);

  useEffect(() => {
    if (!selectedDate || !/^\d{4}-\d{2}-\d{2}$/.test(selectedDate)) {
      setAttendanceData(null);
      setLoadingAttendance(false);
      setAttendanceError("Select a valid date.");
      return undefined;
    }

    setLoadingAttendance(true);
    setAttendanceError("");

    let unsubscribe = () => {};
    try {
      unsubscribe = onSnapshot(
        doc(db, "attendance", selectedDate),
        (snapshot) => {
          setAttendanceData(snapshot.exists() ? snapshot.data() : null);
          setLoadingAttendance(false);
          setAttendanceError("");
        },
        () => {
          setAttendanceError("Unable to load attendance.");
          setLoadingAttendance(false);
        }
      );
    } catch {
      setAttendanceError("Unable to load attendance.");
      setLoadingAttendance(false);
    }

    return () => unsubscribe();
  }, [selectedDate]);

  useEffect(() => {
    const savedMap = new Map();
    const savedPeriods = Array.isArray(attendanceData?.periods)
      ? attendanceData.periods
      : [];
    if (savedPeriods.length) {
      savedPeriods.forEach((period) => {
        if (period?.id) {
          savedMap.set(period.id, period.students || {});
        }
      });
    }

    setRecords(() => {
      const next = {};
      orderedScheduleItems.forEach((session) => {
        next[session.id] = savedMap.has(session.id)
          ? savedMap.get(session.id)
          : {};
      });
      return next;
    });
  }, [attendanceData, orderedScheduleItems, selectedDate]);

  useEffect(() => {
    if (!isStaff) {
      setIsFaceScanModalOpen(false);
      setScanStatus("");
      setScanError("");
      setLastScannedId("");
      setScanQueue([]);
      setScanQueueStatus("");
      setIsSyncingScanQueue(false);
      setPeriodUpdateStatus("");
      setPeriodUpdateError("");
      setSavingPeriodKey("");
      setSavingBulkSessionId("");
      setIsOnline(typeof navigator !== "undefined" ? navigator.onLine : true);
      lastScanRef.current = { key: "", at: 0 };
      lastFaceMatchRef.current = { studentId: "", at: 0 };
      faceModalAutoOpenedRef.current = false;
      queueSyncInFlightRef.current = false;
      return undefined;
    }

    setScanQueue(readOfflineScanQueue());
    return undefined;
  }, [isStaff]);

  useEffect(() => {
    setPeriodUpdateStatus("");
    setPeriodUpdateError("");
    setSavingPeriodKey("");
    setSavingBulkSessionId("");
  }, [selectedDate]);

  useEffect(() => {
    if (isStudent) return;
    setIsFaceRegisterModalOpen(false);
    setFaceProfileStatus("");
    setFaceProfileError("");
  }, [isStudent]);

  useEffect(() => {
    if (!isStaff) return;
    if (faceModalAutoOpenedRef.current) return;
    if (loadingStudents || Boolean(studentsError)) return;
    if (students.length === 0 || enrolledFaceCount === 0) return;

    faceModalAutoOpenedRef.current = true;
    setIsFaceScanModalOpen(true);
  }, [enrolledFaceCount, isStaff, loadingStudents, students.length, studentsError]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const updateOnlineState = () => {
      setIsOnline(window.navigator.onLine);
    };

    updateOnlineState();
    window.addEventListener("online", updateOnlineState);
    window.addEventListener("offline", updateOnlineState);

    return () => {
      window.removeEventListener("online", updateOnlineState);
      window.removeEventListener("offline", updateOnlineState);
    };
  }, []);

  useEffect(() => {
    if (!isStaff) return;
    writeOfflineScanQueue(scanQueue);
  }, [isStaff, scanQueue]);

  useEffect(() => {
    if (!canSubmitAbsenceReason || !absenceReasonDocId) {
      setAbsenceReason(null);
      setAbsenceReasonText("");
      setAbsenceReasonStatus("");
      setAbsenceReasonError("");
      setLoadingAbsenceReason(false);
      return undefined;
    }

    setLoadingAbsenceReason(true);
    setAbsenceReasonError("");
    setAbsenceReasonStatus("");

    const reasonRef = doc(db, "attendanceAbsenceReasons", absenceReasonDocId);
    const unsubscribe = onSnapshot(
      reasonRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          setAbsenceReason({
            id: snapshot.id,
            ...data,
          });
          setAbsenceReasonText(String(data?.reason || ""));
        } else {
          setAbsenceReason(null);
          setAbsenceReasonText("");
        }
        setLoadingAbsenceReason(false);
      },
      () => {
        setAbsenceReason(null);
        setLoadingAbsenceReason(false);
        setAbsenceReasonError("Unable to load submitted reason.");
      }
    );

    return () => unsubscribe();
  }, [absenceReasonDocId, canSubmitAbsenceReason]);

  const markStudentPresentFromQr = useCallback(
    async ({
      student,
      qrToken,
      scanSource = "face",
      matchSimilarity = null,
      vectorLength = null,
      attendanceDate = selectedDate,
      applyLocalState = attendanceDate === selectedDate,
    }) => {
      const normalizedDate = String(attendanceDate || "").trim();
      const normalizedToken =
        String(qrToken || "").trim() || getStudentScanToken(student);
      if (
        !isStaff ||
        !student?.id ||
        !user ||
        !normalizedToken ||
        !SCAN_QUEUE_DATE_PATTERN.test(normalizedDate)
      ) {
        return { ok: false, reason: "invalid_context" };
      }

      const attendanceRef = doc(db, "attendance", normalizedDate);
      const similarityValue = Number.isFinite(matchSimilarity)
        ? Number(Number(matchSimilarity).toFixed(6))
        : null;
      const vectorLengthValue = Number.isFinite(vectorLength)
        ? Number(vectorLength)
        : null;

      try {
        const transactionResult = await runTransaction(db, async (transaction) => {
          const attendanceSnapshot = await transaction.get(attendanceRef);
          const attendanceValue = attendanceSnapshot.exists()
            ? attendanceSnapshot.data()
            : {};

          const nextDailyScans =
            attendanceValue?.dailyFaceScans &&
            typeof attendanceValue.dailyFaceScans === "object"
              ? { ...attendanceValue.dailyFaceScans }
              : attendanceValue?.dailyQrScans &&
                  typeof attendanceValue.dailyQrScans === "object"
                ? { ...attendanceValue.dailyQrScans }
              : {};

          const existingScanMeta = normalizeDailyQrScanEntry(
            nextDailyScans[student.id]
          );
          if (existingScanMeta) {
            return {
              status: "already_scanned",
              existingScanMeta,
            };
          }

          const scanMeta = {
            qrNum: normalizedToken,
            scannedAt: serverTimestamp(),
            scannedBy: user.uid,
            scannedByName: staffDisplayName,
            source: scanSource,
          };
          if (similarityValue !== null) {
            scanMeta.similarity = similarityValue;
          }
          if (vectorLengthValue !== null) {
            scanMeta.vectorLength = vectorLengthValue;
          }

          nextDailyScans[student.id] = scanMeta;

          const payload = {
            date: normalizedDate,
            updatedAt: serverTimestamp(),
            dailyFaceScans: nextDailyScans,
            dailyQrScans: nextDailyScans,
          };

          transaction.set(attendanceRef, payload, { merge: true });

          return {
            status: "marked_present",
          };
        });

        if (transactionResult?.status === "already_scanned") {
          return {
            ok: false,
            reason: "already_scanned",
            existingScanMeta: transactionResult.existingScanMeta,
          };
        }

        if (applyLocalState) {
          const optimisticScanAt = Date.now();
          setAttendanceData((prev) => {
            const next = prev && typeof prev === "object" ? { ...prev } : {};
            const existingDailyScans =
              next.dailyFaceScans && typeof next.dailyFaceScans === "object"
                ? next.dailyFaceScans
                : next.dailyQrScans && typeof next.dailyQrScans === "object"
                  ? next.dailyQrScans
                : {};

            const optimisticScanMeta = {
              qrNum: normalizedToken,
              scannedAt: optimisticScanAt,
              scannedBy: user.uid,
              scannedByName: staffDisplayName,
              source: scanSource,
            };
            if (similarityValue !== null) {
              optimisticScanMeta.similarity = similarityValue;
            }
            if (vectorLengthValue !== null) {
              optimisticScanMeta.vectorLength = vectorLengthValue;
            }

            const nextValue = {
              ...existingDailyScans,
              [student.id]: optimisticScanMeta,
            };
            next.dailyFaceScans = nextValue;
            next.dailyQrScans = nextValue;

            return next;
          });
        }

        try {
          const studentName = student.name || student.email || "Student";
          const notificationDateLabel =
            formatDateLabel(normalizedDate) || normalizedDate;
          await createUserNotification(db, {
            recipientId: student.id,
            recipientEmail: resolveStudentEmail(student),
            type: notificationTypes.ATTENDANCE_STATUS,
            priority: "low",
            topic: notificationTypes.ATTENDANCE_STATUS,
            title: "Attendance marked Present",
            message: `${studentName}: Present on ${notificationDateLabel}.`,
            link: "/student/attendance",
            sourceType: "attendance",
            sourceId: `${normalizedDate}_daily_${student.id}_present`,
            channels: {
              inApp: true,
              email: true,
              whatsapp: true,
              push: true,
            },
          });
        } catch {
          // Attendance save already succeeded; notification can fail independently.
        }

        return { ok: true };
      } catch (error) {
        const errorCode = normalizeFirestoreErrorCode(error?.code);
        console.error("Face attendance update failed", error);
        return {
          ok: false,
          reason: isRetryableScanError(errorCode) ? "retryable_error" : "save_failed",
          errorCode,
        };
      }
    },
    [
      isStaff,
      selectedDate,
      staffDisplayName,
      user,
    ]
  );

  const handleStaffPeriodAttendanceChange = useCallback(
    async ({ session, student, nextStatus }) => {
      const normalizedDate = String(selectedDate || "").trim();
      if (
        !isStaff ||
        !user ||
        !session?.id ||
        !student?.id ||
        !SCAN_QUEUE_DATE_PATTERN.test(normalizedDate)
      ) {
        setPeriodUpdateError("Select a valid date to update attendance.");
        return;
      }

      const normalizedStatus =
        nextStatus === true || nextStatus === false ? nextStatus : null;
      const studentName = student.name || student.email || "Student";
      const sessionLabel =
        session?.label && session?.subject
          ? `${session.label} - ${session.subject}`
          : session?.label || session?.subject || "Session";
      const currentSaveKey = `${session.id}:${student.id}`;

      setSavingPeriodKey(currentSaveKey);
      setPeriodUpdateStatus("");
      setPeriodUpdateError("");

      try {
        const attendanceRef = doc(db, "attendance", normalizedDate);
        await runTransaction(db, async (transaction) => {
          const attendanceSnapshot = await transaction.get(attendanceRef);
          const attendanceValue = attendanceSnapshot.exists()
            ? attendanceSnapshot.data()
            : {};

          const persistedPeriods = Array.isArray(attendanceValue?.periods)
            ? attendanceValue.periods.filter((period) => Boolean(period?.id))
            : [];
          const persistedById = new Map(
            persistedPeriods.map((period) => [period.id, period])
          );

          const configuredPeriods = orderedScheduleItems.filter((period) =>
            Boolean(period?.id)
          );
          const configuredById = new Map(
            configuredPeriods.map((period) => [period.id, period])
          );

          const orderedPeriodIds =
            configuredPeriods.length > 0
              ? [
                  ...configuredPeriods.map((period) => period.id),
                  ...persistedPeriods
                    .map((period) => period.id)
                    .filter((periodId) => !configuredById.has(periodId)),
                ]
              : persistedPeriods.map((period) => period.id);

          if (!orderedPeriodIds.includes(session.id)) {
            orderedPeriodIds.push(session.id);
          }

          const nextPeriods = orderedPeriodIds.map((periodId) => {
            const configuredSession = configuredById.get(periodId);
            const persistedSession = persistedById.get(periodId);
            const periodStudents =
              persistedSession?.students && typeof persistedSession.students === "object"
                ? { ...persistedSession.students }
                : {};

            if (periodId === session.id) {
              if (normalizedStatus === null) {
                delete periodStudents[student.id];
              } else {
                periodStudents[student.id] = normalizedStatus;
              }
            }

            return {
              id: periodId,
              label: configuredSession?.label || persistedSession?.label || "",
              subject: configuredSession?.subject || persistedSession?.subject || "",
              time: configuredSession?.time || persistedSession?.time || "",
              students: periodStudents,
            };
          });

          transaction.set(
            attendanceRef,
            {
              date: normalizedDate,
              updatedAt: serverTimestamp(),
              periods: nextPeriods,
            },
            { merge: true }
          );
        });

        setRecords((prev) => {
          const next = { ...prev };
          const nextSessionStudents = {
            ...(next[session.id] || {}),
          };

          if (normalizedStatus === null) {
            delete nextSessionStudents[student.id];
          } else {
            nextSessionStudents[student.id] = normalizedStatus;
          }

          next[session.id] = nextSessionStudents;
          return next;
        });

        const updatedLabel =
          normalizedStatus === true
            ? "Present"
            : normalizedStatus === false
            ? "Absent"
            : "Not marked";
        setPeriodUpdateStatus(`${studentName}: ${sessionLabel} set to ${updatedLabel}.`);

        if (normalizedStatus !== null) {
          try {
            const notificationDateLabel =
              formatDateLabel(normalizedDate) || normalizedDate;
            await createUserNotification(db, {
              recipientId: student.id,
              recipientEmail: resolveStudentEmail(student),
              type: notificationTypes.ATTENDANCE_STATUS,
              priority: "low",
              topic: notificationTypes.ATTENDANCE_STATUS,
              title: `Attendance marked ${updatedLabel}`,
              message: `${sessionLabel} on ${notificationDateLabel}: ${updatedLabel}.`,
              link: "/student/attendance",
              sourceType: "attendance",
              sourceId: `${normalizedDate}_${session.id}_${student.id}_${updatedLabel.toLowerCase()}`,
              channels: {
                inApp: true,
                email: true,
                whatsapp: true,
                push: true,
              },
            });
          } catch {
            // Attendance update succeeded; notification can fail independently.
          }
        }
      } catch (error) {
        console.error("Manual period attendance update failed", error);
        setPeriodUpdateError("Unable to update period attendance right now.");
      } finally {
        setSavingPeriodKey("");
      }
    },
    [isStaff, orderedScheduleItems, selectedDate, user]
  );

  const handleStaffPresentAllForSession = useCallback(
    async ({ session }) => {
      const normalizedDate = String(selectedDate || "").trim();
      if (
        !isStaff ||
        !user ||
        !session?.id ||
        !SCAN_QUEUE_DATE_PATTERN.test(normalizedDate)
      ) {
        setPeriodUpdateError("Select a valid date to update attendance.");
        return;
      }

      if (students.length === 0) {
        setPeriodUpdateError("No students found for this session.");
        return;
      }

      const sessionLabel =
        session?.label && session?.subject
          ? `${session.label} - ${session.subject}`
          : session?.label || session?.subject || "Session";

      setSavingBulkSessionId(session.id);
      setPeriodUpdateStatus("");
      setPeriodUpdateError("");

      try {
        const attendanceRef = doc(db, "attendance", normalizedDate);
        await runTransaction(db, async (transaction) => {
          const attendanceSnapshot = await transaction.get(attendanceRef);
          const attendanceValue = attendanceSnapshot.exists()
            ? attendanceSnapshot.data()
            : {};

          const persistedPeriods = Array.isArray(attendanceValue?.periods)
            ? attendanceValue.periods.filter((period) => Boolean(period?.id))
            : [];
          const persistedById = new Map(
            persistedPeriods.map((period) => [period.id, period])
          );

          const configuredPeriods = orderedScheduleItems.filter((period) =>
            Boolean(period?.id)
          );
          const configuredById = new Map(
            configuredPeriods.map((period) => [period.id, period])
          );

          const orderedPeriodIds =
            configuredPeriods.length > 0
              ? [
                  ...configuredPeriods.map((period) => period.id),
                  ...persistedPeriods
                    .map((period) => period.id)
                    .filter((periodId) => !configuredById.has(periodId)),
                ]
              : persistedPeriods.map((period) => period.id);

          if (!orderedPeriodIds.includes(session.id)) {
            orderedPeriodIds.push(session.id);
          }

          const nextPeriods = orderedPeriodIds.map((periodId) => {
            const configuredSession = configuredById.get(periodId);
            const persistedSession = persistedById.get(periodId);
            const periodStudents =
              persistedSession?.students && typeof persistedSession.students === "object"
                ? { ...persistedSession.students }
                : {};

            if (periodId === session.id) {
              students.forEach((student) => {
                if (student?.id) {
                  periodStudents[student.id] = true;
                }
              });
            }

            return {
              id: periodId,
              label: configuredSession?.label || persistedSession?.label || "",
              subject: configuredSession?.subject || persistedSession?.subject || "",
              time: configuredSession?.time || persistedSession?.time || "",
              students: periodStudents,
            };
          });

          transaction.set(
            attendanceRef,
            {
              date: normalizedDate,
              updatedAt: serverTimestamp(),
              periods: nextPeriods,
            },
            { merge: true }
          );
        });

        setRecords((prev) => {
          const next = { ...prev };
          const nextSessionStudents = {
            ...(next[session.id] || {}),
          };
          students.forEach((student) => {
            if (student?.id) {
              nextSessionStudents[student.id] = true;
            }
          });
          next[session.id] = nextSessionStudents;
          return next;
        });

        setPeriodUpdateStatus(`All students marked Present for ${sessionLabel}.`);

        const recipientIds = students
          .map((student) => String(student?.id || "").trim())
          .filter((id) => Boolean(id));
        if (recipientIds.length > 0) {
          const recipientContactById = students.reduce((acc, item) => {
            const recipientId = String(item?.id || "").trim();
            if (!recipientId) return acc;
            const email = resolveStudentEmail(item);
            if (email) {
              acc[recipientId] = { email };
            }
            return acc;
          }, {});

          try {
            const notificationDateLabel =
              formatDateLabel(normalizedDate) || normalizedDate;
            await createBulkUserNotifications(db, {
              recipientIds,
              recipientContactById,
              type: notificationTypes.ATTENDANCE_STATUS,
              priority: "low",
              topic: notificationTypes.ATTENDANCE_STATUS,
              title: "Attendance marked Present",
              message: `${sessionLabel} on ${notificationDateLabel}: Present.`,
              link: "/student/attendance",
              sourceType: "attendance",
              sourceId: `${normalizedDate}_${session.id}_bulk_present`,
              channels: {
                inApp: true,
                email: true,
                whatsapp: true,
                push: true,
              },
            });
          } catch {
            // Attendance update succeeded; notification can fail independently.
          }
        }
      } catch (error) {
        console.error("Bulk present update failed", error);
        setPeriodUpdateError("Unable to mark all students present right now.");
      } finally {
        setSavingBulkSessionId("");
      }
    },
    [isStaff, orderedScheduleItems, selectedDate, students, user]
  );

  const queueScanForOfflineSync = useCallback(
    ({
      date,
      qrToken,
      student,
      source = "face",
      matchSimilarity = null,
    }) => {
      const normalizedDate = String(date || "").trim();
      const normalizedToken = String(qrToken || "").trim();
      if (
        !SCAN_QUEUE_DATE_PATTERN.test(normalizedDate) ||
        !SCAN_QUEUE_TOKEN_PATTERN.test(normalizedToken)
      ) {
        return { alreadyQueued: false };
      }

      const alreadyQueued = scanQueue.some(
        (item) => item.date === normalizedDate && item.qrToken === normalizedToken
      );
      setScanQueue((prev) =>
        mergeOfflineScanQueueItem(prev, {
          date: normalizedDate,
          qrToken: normalizedToken,
          queuedAt: Date.now(),
          studentId: student?.id || "",
          studentName: student?.name || student?.email || "Student",
          source,
          matchSimilarity,
        })
      );

      return { alreadyQueued };
    },
    [scanQueue]
  );

  useEffect(() => {
    if (!isStaff || !user || !isOnline) return undefined;
    if (loadingStudents || studentsError) return undefined;
    if (scanQueue.length === 0) return undefined;
    if (queueSyncInFlightRef.current) return undefined;

    let isActive = true;

    const syncQueuedScans = async () => {
      queueSyncInFlightRef.current = true;
      setIsSyncingScanQueue(true);

      let pendingQueue = [...scanQueue];
      let syncedCount = 0;
      let unresolvedCount = 0;
      let retryableFailureCount = 0;

      try {
        for (const item of scanQueue) {
          if (!isActive) break;

          const matches = studentScanIndex.get(item.qrToken) || [];
          const matchedStudent =
            matches.length === 1
              ? matches[0]
              : students.find((student) => student.id === item.studentId) || null;
          if (!matchedStudent) {
            unresolvedCount += 1;
            continue;
          }

          const saveResult = await markStudentPresentFromQr({
            student: matchedStudent,
            qrToken: item.qrToken,
            scanSource: item.source || "face",
            matchSimilarity: item.matchSimilarity,
            attendanceDate: item.date,
            applyLocalState: item.date === selectedDate,
          });

          if (saveResult.ok || saveResult.reason === "already_scanned") {
            syncedCount += 1;
            pendingQueue = pendingQueue.filter((entry) => entry.id !== item.id);
            continue;
          }

          if (saveResult.reason === "retryable_error") {
            retryableFailureCount += 1;
            continue;
          }

          unresolvedCount += 1;
          pendingQueue = pendingQueue.filter((entry) => entry.id !== item.id);
        }

        if (!isActive) return;

        if (pendingQueue.length !== scanQueue.length) {
          setScanQueue(pendingQueue);
        }

        if (syncedCount > 0) {
          setScanQueueStatus(
            `${syncedCount} queued face scan${syncedCount > 1 ? "s" : ""} synced successfully.`
          );
        } else if (retryableFailureCount > 0) {
          setScanQueueStatus("Queue sync paused. Waiting for stable internet.");
        } else if (unresolvedCount > 0) {
          setScanQueueStatus(
            "Some queued face scans could not be matched. They remain in queue."
          );
        }
      } finally {
        queueSyncInFlightRef.current = false;
        if (isActive) {
          setIsSyncingScanQueue(false);
        }
      }
    };

    void syncQueuedScans();

    return () => {
      isActive = false;
    };
  }, [
    isOnline,
    isStaff,
    loadingStudents,
    markStudentPresentFromQr,
    scanQueue,
    selectedDate,
    studentScanIndex,
    students,
    studentsError,
    user,
  ]);

  const handleStudentFaceRegistration = useCallback(
    async ({ vector, vectorLength, detectionScore }) => {
      if (!isStudent || !user?.uid) {
        return {
          tone: "error",
          message: "Only students can register a face profile.",
        };
      }

      const normalizedVector = normalizeFaceVector(vector);
      if (normalizedVector.length < FACE_MIN_VECTOR_LENGTH) {
        setFaceProfileError("Captured face vector is not valid. Try again.");
        return {
          tone: "error",
          message: "Captured face vector is not valid. Try again.",
        };
      }

      const existingSamples = Array.isArray(registrationSamplesRef.current)
        ? registrationSamplesRef.current
        : [];
      const mergedSamples = dedupeFaceVectors([
        ...existingSamples,
        normalizedVector,
      ]).slice(-FACE_REGISTRATION_SAMPLE_LIMIT);
      const consistency = computeFaceSampleConsistency(mergedSamples);
      const stableVector =
        consistency.centroidVector.length >= FACE_MIN_VECTOR_LENGTH
          ? consistency.centroidVector
          : normalizedVector;
      const sampleCount = Math.max(1, mergedSamples.length);

      setFaceProfileStatus("");
      setFaceProfileError("");

      try {
        await setDoc(
          doc(db, "users", user.uid),
          {
            faceAttendance: {
              vector: stableVector,
              vectorLength: Number.isFinite(vectorLength)
                ? Number(vectorLength)
                : stableVector.length,
              sampleVectors: mergedSamples,
              sampleCount,
              algorithm: "face-api-128d",
              matchThreshold: FACE_MATCH_THRESHOLD,
              detectionScore: Number.isFinite(detectionScore)
                ? Number(detectionScore.toFixed(4))
                : null,
              sampleConsistency: Number(
                (consistency.averageSimilarity || 0).toFixed(4)
              ),
              sampleMinSimilarity: Number(
                (consistency.minSimilarity || 0).toFixed(4)
              ),
              updatedAt: serverTimestamp(),
            },
          },
          { merge: true }
        );

        registrationSamplesRef.current = mergedSamples;

        const remainingSamples = Math.max(
          0,
          FACE_REGISTRATION_SAMPLE_TARGET - sampleCount
        );
        let successMessage = "";
        let successTone = "success";

        if (remainingSamples > 0) {
          successTone = "info";
          successMessage = `Face sample ${sampleCount}/${FACE_REGISTRATION_SAMPLE_TARGET} saved. Capture ${remainingSamples} more sample${remainingSamples > 1 ? "s" : ""} for better accuracy.`;
        } else if (
          (consistency.minSimilarity || 0) < FACE_REGISTRATION_MIN_CONSISTENCY
        ) {
          successTone = "info";
          successMessage =
            "Face profile updated, but sample consistency is low. Re-capture in stable light to improve accuracy.";
        } else {
          successMessage = `Face profile saved with ${sampleCount} samples for reliable attendance match.`;
        }

        setFaceProfileStatus(successMessage);
        setFaceProfileError("");

        return {
          tone: successTone,
          message: successMessage,
        };
      } catch (error) {
        console.error("Face profile registration failed", error);
        const message = "Unable to save face profile right now.";
        setFaceProfileStatus("");
        setFaceProfileError(message);
        return {
          tone: "error",
          message,
        };
      }
    },
    [isStudent, user]
  );

  const handleStaffFaceDescriptor = useCallback(
    async ({ vector, vectorLength }) => {
      if (!isStaff) {
        return {
          tone: "error",
          message: "Only staff can scan attendance.",
        };
      }

      setScanStatus("");
      setScanError("");

      if (loadingStudents) {
        pendingFaceMatchRef.current = { studentId: "", count: 0, at: 0 };
        return {
          tone: "info",
          message: "Loading students for face matching...",
        };
      }

      if (studentsError) {
        pendingFaceMatchRef.current = { studentId: "", count: 0, at: 0 };
        setScanError(studentsError);
        return {
          tone: "error",
          message: studentsError,
        };
      }

      if (studentFaceProfiles.length === 0) {
        pendingFaceMatchRef.current = { studentId: "", count: 0, at: 0 };
        const message = "No registered student face profiles found.";
        setScanError(message);
        return {
          tone: "error",
          message,
        };
      }

      const inputVector = normalizeFaceVector(vector);
      if (inputVector.length < FACE_MIN_VECTOR_LENGTH) {
        pendingFaceMatchRef.current = { studentId: "", count: 0, at: 0 };
        return {
          tone: "error",
          message: "Detected face vector is invalid.",
        };
      }

      const rankedMatches = studentFaceProfiles
        .map((entry) => {
          const templateSimilarities = entry.templates
            .map((template) => cosineSimilarity(inputVector, template))
            .filter((value) => Number.isFinite(value))
            .sort((a, b) => b - a);

          if (templateSimilarities.length === 0) return null;

          const bestTemplateSimilarity = templateSimilarities[0];
          const consensusSlice = templateSimilarities.slice(
            0,
            Math.min(3, templateSimilarities.length)
          );
          const consensusSimilarity =
            consensusSlice.reduce((sum, value) => sum + value, 0) /
            consensusSlice.length;
          const weightedSimilarity =
            bestTemplateSimilarity * 0.85 + consensusSimilarity * 0.15;

          return {
            student: entry.student,
            similarity: weightedSimilarity,
            bestTemplateSimilarity,
            consensusSimilarity,
            templateCount: entry.templateCount,
          };
        })
        .filter(Boolean)
        .sort((a, b) => b.similarity - a.similarity);

      const bestMatch = rankedMatches[0] || null;
      const secondBestMatch = rankedMatches[1] || null;

      if (!bestMatch) {
        pendingFaceMatchRef.current = { studentId: "", count: 0, at: 0 };
        const message = "No face match found.";
        setScanError(message);
        return {
          tone: "error",
          message,
        };
      }

      const bestPercentLabel = toSimilarityPercentLabel(bestMatch.similarity);
      if (bestMatch.similarity < FACE_MATCH_THRESHOLD) {
        pendingFaceMatchRef.current = { studentId: "", count: 0, at: 0 };
        const message = `No reliable match above ${toSimilarityPercentLabel(
          FACE_MATCH_THRESHOLD
        )}. Best: ${bestMatch.student.name} at ${bestPercentLabel}.`;
        setScanError(message);
        return {
          tone: "info",
          message,
        };
      }

      if (secondBestMatch) {
        const matchMargin = bestMatch.similarity - secondBestMatch.similarity;
        if (matchMargin < FACE_MATCH_MIN_MARGIN) {
          pendingFaceMatchRef.current = { studentId: "", count: 0, at: 0 };
          const message = `Ambiguous match. ${bestMatch.student.name} (${bestPercentLabel}) and ${secondBestMatch.student.name} (${toSimilarityPercentLabel(
            secondBestMatch.similarity
          )}) are too close. Re-scan with better alignment.`;
          setScanError(message);
          return {
            tone: "info",
            message,
          };
        }
      }

      const matchedStudent = bestMatch.student;
      const now = Date.now();
      const previousPending = pendingFaceMatchRef.current;
      if (
        previousPending.studentId === matchedStudent.id &&
        now - previousPending.at < FACE_MATCH_CONFIRMATION_WINDOW_MS
      ) {
        pendingFaceMatchRef.current = {
          studentId: matchedStudent.id,
          count: previousPending.count + 1,
          at: now,
        };
      } else {
        pendingFaceMatchRef.current = {
          studentId: matchedStudent.id,
          count: 1,
          at: now,
        };
      }

      if (pendingFaceMatchRef.current.count < FACE_MATCH_CONFIRMATION_COUNT) {
        return {
          tone: "info",
          message: `Hold steady on ${matchedStudent.name} for confirmation (${pendingFaceMatchRef.current.count}/${FACE_MATCH_CONFIRMATION_COUNT}).`,
        };
      }
      pendingFaceMatchRef.current = { studentId: "", count: 0, at: 0 };

      const scanKey = `${selectedDate}:${matchedStudent.id}`;
      if (
        lastScanRef.current.key === scanKey &&
        now - lastScanRef.current.at < FACE_MATCH_COOLDOWN_MS
      ) {
        return {
          tone: "info",
          message: `${matchedStudent.name} was just processed. Hold for a moment.`,
        };
      }

      if (
        lastFaceMatchRef.current.studentId === matchedStudent.id &&
        now - lastFaceMatchRef.current.at < FACE_MATCH_COOLDOWN_MS
      ) {
        return {
          tone: "info",
          message: `${matchedStudent.name} was just processed. Hold for a moment.`,
        };
      }

      lastScanRef.current = { key: scanKey, at: now };
      lastFaceMatchRef.current = { studentId: matchedStudent.id, at: now };
      setLastScannedId(`${matchedStudent.name} (${bestPercentLabel})`);

      const localScanMeta = dailyQrScanMetaByStudent[matchedStudent.id];
      if (localScanMeta) {
        const timeLabel = formatTimeLabel(localScanMeta.scannedAtMillis);
        const message = `${matchedStudent.name} already marked today${
          timeLabel ? ` at ${timeLabel}` : ""
        }.`;
        setScanStatus(message);
        return {
          tone: "info",
          message,
        };
      }

      const scanToken = getStudentScanToken(matchedStudent);
      if (!SCAN_QUEUE_TOKEN_PATTERN.test(String(scanToken || ""))) {
        const message = `Cannot save ${matchedStudent.name}. Missing a valid student token.`;
        setScanError(message);
        return {
          tone: "error",
          message,
        };
      }

      if (!isOnline) {
        const queueResult = queueScanForOfflineSync({
          date: selectedDate,
          qrToken: scanToken,
          student: matchedStudent,
          source: "face",
          matchSimilarity: bestMatch.similarity,
        });

        const message = queueResult.alreadyQueued
          ? `${matchedStudent.name} face scan already queued. It will sync when internet is back.`
          : `${matchedStudent.name} face scan saved offline. It will auto-sync once online.`;
        setScanStatus(message);
        setScanError("");
        return {
          tone: "info",
          message,
        };
      }

      const saveResult = await markStudentPresentFromQr({
        student: matchedStudent,
        qrToken: scanToken,
        scanSource: "face",
        matchSimilarity: bestMatch.similarity,
        vectorLength,
      });

      if (!saveResult.ok && saveResult.reason === "already_scanned") {
        const timeLabel = formatTimeLabel(saveResult.existingScanMeta?.scannedAtMillis);
        const message = `${matchedStudent.name} already marked today${
          timeLabel ? ` at ${timeLabel}` : ""
        }.`;
        setScanStatus(message);
        return {
          tone: "info",
          message,
        };
      }

      if (!saveResult.ok) {
        const shouldQueueForSync = !isOnline || saveResult.reason === "retryable_error";
        if (shouldQueueForSync) {
          const queueResult = queueScanForOfflineSync({
            date: selectedDate,
            qrToken: scanToken,
            student: matchedStudent,
            source: "face",
            matchSimilarity: bestMatch.similarity,
          });

          const message = queueResult.alreadyQueued
            ? `${matchedStudent.name} face scan already queued. It will sync when internet is back.`
            : `${matchedStudent.name} face scan saved offline. It will auto-sync once online.`;
          setScanStatus(message);
          setScanError("");
          return {
            tone: "info",
            message,
          };
        }

        const message = "Unable to save face attendance right now.";
        setScanError(message);
        return {
          tone: "error",
          message,
        };
      }

      const message = `${matchedStudent.name} marked present for ${attendanceDateLabel} (${bestPercentLabel}).`;
      setScanStatus(message);
      setScanError("");
      return {
        tone: "success",
        message,
      };
    },
    [
      attendanceDateLabel,
      dailyQrScanMetaByStudent,
      isOnline,
      isStaff,
      loadingStudents,
      markStudentPresentFromQr,
      queueScanForOfflineSync,
      selectedDate,
      studentFaceProfiles,
      studentsError,
    ]
  );

  const handleSubmitAbsenceReason = async (event) => {
    event.preventDefault();
    if (!canSubmitAbsenceReason || !absenceReasonDocId || savingAbsenceReason) {
      return;
    }

    if (hasSubmittedAbsenceReason) {
      setAbsenceReasonStatus("Reason already sent for this date.");
      return;
    }

    if (absentSessions.length === 0) {
      setAbsenceReasonStatus("You are not marked absent for this date.");
      return;
    }

    const safeReason = absenceReasonText.trim();
    if (!safeReason) {
      setAbsenceReasonStatus("Enter your absent reason.");
      return;
    }

    setSavingAbsenceReason(true);
    setAbsenceReasonStatus("");
    setAbsenceReasonError("");

    const absentSessionPayload = absentSessions.map((session) => ({
      id: session.id,
      label: session.label || "",
      subject: session.subject || "",
      time: session.time || "",
    }));

    try {
      await setDoc(doc(db, "attendanceAbsenceReasons", absenceReasonDocId), {
        studentId: currentStudentId,
        studentName: currentStudentName,
        studentEmail: user?.email || profile?.email || "",
        date: selectedDate,
        dateLabel: attendanceDateLabel,
        absentSessions: absentSessionPayload,
        reason: safeReason,
        submittedByRole: "parent",
        submittedByName: profile?.name || user?.displayName || currentStudentName,
        submittedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
      });

      try {
        const staffSnapshot = await getDocs(
          query(collection(db, "users"), where("role", "==", "staff"), limit(100))
        );
        const recipientIds = staffSnapshot.docs
          .map((docItem) => docItem.id)
          .filter((id) => Boolean(id));

        if (recipientIds.length > 0) {
          await createBulkUserNotifications(db, {
            recipientIds,
            type: notificationTypes.ATTENDANCE_REASON_REPLY,
            priority: "high",
            topic: notificationTypes.ATTENDANCE_REASON_REPLY,
            title: `${currentStudentName} absent reason submitted`,
            message: `${attendanceDateLabel}: ${safeReason}`,
            link: "/staff/menu/parent-replies",
            sourceType: "attendance_absence_reason",
            sourceId: absenceReasonDocId,
          });
        }
      } catch {
        // Reason save is successful even if notification delivery fails.
      }

      setAbsenceReasonStatus("Reason sent to staff.");
    } catch {
      setAbsenceReasonError("Unable to send reason to staff.");
    } finally {
      setSavingAbsenceReason(false);
    }
  };

  return (
    <>
      <GradientHeader
        title="Attendance"
        subtitle={
          isStaff
            ? "Scan daily attendance by face, then mark each period manually."
            : "View your attendance status for the selected date."
        }
      />

      <div className="mt-4 space-y-4">
        <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-ink/72">
              Attendance Date
            </p>
            <p className="text-xl font-semibold text-ink">{dateLabel}</p>
          </div>
          <input
            type="date"
            value={selectedDate}
            onChange={(event) => setSelectedDate(event.target.value)}
            className="rounded-xl border border-ocean/35 bg-white px-3 py-2 text-sm font-semibold text-ink shadow-sm"
          />
        </div>

        {isStaff ? (
          <div className="mt-4 space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink/72">
                  Face Attendance Count
                </p>
                <span className="rounded-full border border-clay/35 bg-white px-2.5 py-1 text-[11px] font-semibold text-ink/75">
                  Face Match
                </span>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-emerald-200/70 bg-emerald-100/70 px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-900/80">
                    Present
                  </p>
                  <p className="mt-0.5 text-lg font-semibold text-emerald-900">
                    {scanStatusCounts.present}
                  </p>
                </div>
                <div className="rounded-xl border border-rose-200/70 bg-rose-100/70 px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-rose-900/80">
                    Absent
                  </p>
                  <p className="mt-0.5 text-lg font-semibold text-rose-900">0</p>
                </div>
                <div className="rounded-xl border border-clay/45 bg-white/85 px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink/70">
                    Not Marked
                  </p>
                  <p className="mt-0.5 text-lg font-semibold text-ink/85">
                    {scanStatusCounts.unmarked}
                  </p>
                </div>
              </div>
            </div>

          </div>
        ) : null}
        {isStudent ? (
          <div className="mt-4 rounded-xl border border-clay/35 bg-white/85 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink/70">
              Current Daily Status
            </p>
            <div className="mt-1 flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-ink">Face Attendance</p>
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  statusChipClassMap[currentStudentDailyStatus]
                }`}
              >
                {statusLabelMap[currentStudentDailyStatus]}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <span
                className={`rounded-full px-3 py-1 text-[11px] font-semibold ${
                  hasCurrentStudentFaceProfile
                    ? "border border-emerald-200 bg-emerald-100 text-emerald-900"
                    : "border border-amber-200 bg-amber-100 text-amber-900"
                }`}
              >
                {hasCurrentStudentFaceProfile
                  ? `Face Registered (${currentStudentFaceVector.length}D)`
                  : "Face Not Registered"}
              </span>
              <button
                type="button"
                onClick={() => {
                  setFaceProfileStatus("");
                  setFaceProfileError("");
                  setIsFaceRegisterModalOpen(true);
                }}
                className="rounded-full border border-ocean/45 bg-white px-3 py-1 text-[11px] font-semibold text-ink/80 hover:border-ocean/70"
              >
                {hasCurrentStudentFaceProfile ? "Re-Register Face" : "Register Face"}
              </button>
            </div>
            {faceProfileStatus ? (
              <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-100/80 px-3 py-2 text-xs font-semibold text-emerald-900">
                {faceProfileStatus}
              </p>
            ) : null}
            {faceProfileError ? (
              <p className="mt-3 rounded-lg border border-rose-200 bg-rose-100/80 px-3 py-2 text-xs font-semibold text-rose-900">
                {faceProfileError}
              </p>
            ) : null}
          </div>
        ) : null}
        {isParent ? (
          <div className="mt-4 rounded-xl border border-clay/35 bg-white/80 px-4 py-3">
            <p className="text-xs text-ink/78">
              Select a date to review attendance and submit reason if absent.
            </p>
          </div>
        ) : null}
      </Card>

      {isStaff ? (
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-ink/80">
                Face Attendance Scan
              </p>
              <p className="text-sm text-ink/78">
                Keep one student face in camera. Match above{" "}
                {toSimilarityPercentLabel(FACE_MATCH_THRESHOLD)} marks daily attendance.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-ocean/35 bg-white px-3 py-1 text-xs font-semibold text-ink/80">
                One Match Per Day
              </span>
              <span className="rounded-full border border-clay/40 bg-white px-3 py-1 text-xs font-semibold text-ink/80">
                Face Registered: {enrolledFaceCount}/{students.length}
              </span>
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  isOnline
                    ? "border border-emerald-200 bg-emerald-100 text-emerald-900"
                    : "border border-amber-200 bg-amber-100 text-amber-900"
                }`}
              >
                {isOnline ? "Online" : "Offline"}
              </span>
              <span className="rounded-full border border-clay/40 bg-white px-3 py-1 text-xs font-semibold text-ink/80">
                Queue: {queuedScanCount}
              </span>
            </div>
          </div>

          <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
            <div className="rounded-xl border border-clay/35 bg-white/80 px-4 py-4 text-xs text-ink/75">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink/72">
                Attendance Date
              </p>
              <p className="mt-1 text-base font-semibold text-ink">{attendanceDateLabel}</p>
              <p className="mt-1 text-[11px] text-ink/70">
                Daily face scan and period-wise attendance are tracked separately.
              </p>
              <p className="mt-1 text-[11px] text-ink/70">
                Face descriptor vectors use 128 dimensions for matching.
              </p>
            </div>
            <div className="rounded-xl border border-clay/35 bg-white/82 px-4 py-4 text-xs text-ink/75">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink/72">
                Live Face Camera
              </p>
              <p className="mt-1 text-[11px] text-ink/70">
                Open the modal, keep one student in frame, and the system auto-marks if match is{" "}
                {toSimilarityPercentLabel(FACE_MATCH_THRESHOLD)} or higher.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setScanStatus("");
                    setScanError("");
                    setIsFaceScanModalOpen(true);
                  }}
                  disabled={
                    loadingStudents ||
                    Boolean(studentsError) ||
                    students.length === 0 ||
                    enrolledFaceCount === 0
                  }
                  className="rounded-full border border-ocean/45 bg-gradient-to-r from-ocean to-cocoa px-3 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Open Face Attendance
                </button>
                <span className="rounded-full border border-clay/35 bg-white px-3 py-1.5 text-[11px] font-semibold text-ink/75">
                  Threshold: {toSimilarityPercentLabel(FACE_MATCH_THRESHOLD)}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-3 grid gap-3">
            {!isOnline ? (
              <div className="rounded-lg border border-amber-200 bg-amber-100/80 px-4 py-3 text-xs font-semibold text-amber-900">
                Offline mode active. Face scans are queued and will sync automatically when online.
              </div>
            ) : null}
            {isSyncingScanQueue ? (
              <div className="rounded-lg border border-ocean/35 bg-ocean/10 px-4 py-3 text-xs font-semibold text-ink/85">
                Syncing queued face scans...
              </div>
            ) : null}
            {scanQueueStatus ? (
              <div className="rounded-lg border border-ocean/35 bg-ocean/10 px-4 py-3 text-xs font-semibold text-ink/85">
                {scanQueueStatus}
              </div>
            ) : null}
            {queuedScanCount > 0 ? (
              <div className="rounded-lg border border-clay/35 bg-white/85 px-4 py-3 text-xs font-semibold text-ink/80">
                Pending queue: {queuedScanCount} total ({queuedScanCountForSelectedDate} for selected date)
                {latestQueuedScanLabel ? ` - Last queued: ${latestQueuedScanLabel}` : ""}
              </div>
            ) : null}
            {scanError ? (
              <div className="rounded-lg border border-rose-200 bg-rose-100/80 px-4 py-3 text-xs font-semibold text-rose-900">
                {scanError}
              </div>
            ) : null}
            {loadingStudents ? (
              <p className="text-xs text-ink/70">Loading students for face match...</p>
            ) : studentsError ? (
              <p className="text-xs text-ink/70">{studentsError}</p>
            ) : null}
          </div>

          {!loadingStudents && !studentsError && students.length > 0 ? (
            <div className="mt-4 rounded-xl border border-clay/35 bg-white/75 p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink/72">
                  Students List
                </p>
                <span className="text-[11px] text-ink/70">Face Status</span>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] font-semibold">
                <span className="rounded-full border border-emerald-200 bg-emerald-100 px-2.5 py-1 text-emerald-900">
                  Present: {scanStatusCounts.present}
                </span>
                <span className="rounded-full border border-clay/35 bg-white px-2.5 py-1 text-ink/75">
                  Not matched: {scanStatusCounts.unmarked}
                </span>
              </div>

              <div className="mt-3 space-y-3">
                {students.map((student) => {
                  const status =
                    scanStatusByStudent[student.id] === "present"
                      ? "present"
                      : "unmarked";
                  return (
                    <div
                      key={`scan-inline-${student.id}`}
                      className="flex items-center justify-between gap-3 rounded-lg border border-clay/30 bg-white/92 px-4 py-3"
                    >
                      <p className="truncate text-sm font-medium text-ink">
                        {student.name}
                      </p>
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          statusChipClassMap[status]
                        }`}
                      >
                        {status === "present" ? "Present" : "Not matched"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </Card>
      ) : null}

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-ink/80">
              Today's Attendance
            </p>
            <p className="text-sm text-ink/78">
              {isStaff
                ? "Staff marks each period manually as present or absent"
                : "Your attendance status by session"}
            </p>
          </div>
          <span className="rounded-full border border-ocean/35 bg-white px-3 py-1 text-xs font-semibold text-ink/80">
            {dateLabel}
          </span>
        </div>

        {isStaff && periodUpdateStatus ? (
          <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-100/80 px-3 py-2 text-xs font-semibold text-emerald-900">
            {periodUpdateStatus}
          </p>
        ) : null}
        {isStaff && periodUpdateError ? (
          <p className="mt-3 rounded-lg border border-rose-200 bg-rose-100/80 px-3 py-2 text-xs font-semibold text-rose-900">
            {periodUpdateError}
          </p>
        ) : null}

        {loadingSchedule ? (
          <p className="mt-4 text-sm text-ink/75">Loading schedule...</p>
        ) : scheduleError ? (
          <p className="mt-4 text-sm text-ink/75">{scheduleError}</p>
        ) : orderedScheduleItems.length === 0 ? (
          <p className="mt-4 text-sm text-ink/75">No schedule yet.</p>
        ) : (
          <div className="mt-4 grid gap-4">
            {orderedScheduleItems.map((session) => {
              const periodRecords = records[session.id] || {};
              const studentRow = currentStudentId
                ? [
                    {
                      id: currentStudentId,
                      name: currentStudentName,
                    },
                  ]
                : [];
              const counts = sessionStatusCounts[session.id] || {
                present: 0,
                absent: 0,
                unmarked: students.length,
              };
              const isBulkSavingSession = savingBulkSessionId === session.id;
              const allStudentsPresent =
                isStaff && students.length > 0 && counts.present === students.length;
              const totalStudents = students.length;
              const sessionLabel = session.label
                ? `${session.label} - ${session.subject}`
                : session.subject;
              return (
                <article
                  key={session.id}
                  className="rounded-xl border border-clay/35 bg-white/92 px-4 py-4 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <p className="truncate text-[11px] font-semibold uppercase tracking-[0.16em] text-ink/72">
                        Today's Attendance
                      </p>
                      <p className="truncate text-sm font-semibold text-ink">{sessionLabel}</p>
                      {session.time ? (
                        <span className="inline-flex rounded-full border border-clay/35 bg-white px-2.5 py-1 text-[11px] font-semibold text-ink/75">
                          {session.time}
                        </span>
                      ) : null}
                    </div>
                    {isStaff ? (
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <span className="rounded-full border border-emerald-200 bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold text-emerald-900">
                          Present {counts.present}/{totalStudents}
                        </span>
                        <span className="rounded-full border border-rose-200 bg-rose-100 px-2.5 py-1 text-[11px] font-semibold text-rose-900">
                          Absent {counts.absent}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            void handleStaffPresentAllForSession({ session });
                          }}
                          disabled={
                            loadingStudents ||
                            Boolean(studentsError) ||
                            students.length === 0 ||
                            isBulkSavingSession ||
                            allStudentsPresent
                          }
                          className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${
                            allStudentsPresent
                              ? "border-emerald-300 bg-emerald-100 text-emerald-900"
                              : "border-clay/35 bg-white text-ink/80 hover:border-emerald-200"
                          } ${
                            loadingStudents ||
                            Boolean(studentsError) ||
                            students.length === 0 ||
                            isBulkSavingSession ||
                            allStudentsPresent
                              ? "cursor-not-allowed opacity-70"
                              : ""
                          }`}
                        >
                          {isBulkSavingSession ? "Saving..." : "Select All Present"}
                        </button>
                      </div>
                    ) : null}
                  </div>

                  <div className="mt-3 grid gap-3">
                    {isStaff ? (
                      loadingStudents ? (
                        <p className="text-xs text-ink/70">Loading students...</p>
                      ) : studentsError ? (
                        <p className="text-xs text-ink/70">{studentsError}</p>
                      ) : students.length === 0 ? (
                        <p className="text-xs text-ink/70">No students found.</p>
                      ) : (
                        students.map((student) => {
                          const status = normalizeAttendanceStatus(
                            periodRecords[student.id]
                          );
                          const rowSaveKey = `${session.id}:${student.id}`;
                          const isSavingRow =
                            savingPeriodKey === rowSaveKey || isBulkSavingSession;
                          return (
                            <div
                              key={`${session.id}-${student.id}`}
                              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-clay/30 bg-white/95 px-4 py-3"
                            >
                              <p className="truncate text-sm font-medium text-ink">
                                {student.name}
                              </p>
                              <div className="flex flex-wrap items-center justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    void handleStaffPeriodAttendanceChange({
                                      session,
                                      student,
                                      nextStatus: true,
                                    });
                                  }}
                                  disabled={isSavingRow || status === "present"}
                                  className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                                    status === "present"
                                      ? "border-emerald-300 bg-emerald-100 text-emerald-900"
                                      : "border-clay/35 bg-white text-ink/80 hover:border-emerald-200"
                                  } ${
                                    isSavingRow || status === "present"
                                      ? "cursor-not-allowed opacity-70"
                                      : ""
                                  }`}
                                >
                                  Present
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    void handleStaffPeriodAttendanceChange({
                                      session,
                                      student,
                                      nextStatus: false,
                                    });
                                  }}
                                  disabled={isSavingRow || status === "absent"}
                                  className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                                    status === "absent"
                                      ? "border-rose-300 bg-rose-100 text-rose-900"
                                      : "border-clay/35 bg-white text-ink/80 hover:border-rose-200"
                                  } ${
                                    isSavingRow || status === "absent"
                                      ? "cursor-not-allowed opacity-70"
                                      : ""
                                  }`}
                                >
                                  Absent
                                </button>
                              </div>
                            </div>
                          );
                        })
                      )
                    ) : studentRow.length === 0 ? (
                      <p className="text-xs text-ink/70">Sign in to view attendance.</p>
                    ) : (
                      studentRow.map((student) => {
                        const status = normalizeAttendanceStatus(
                          periodRecords[student.id]
                        );
                        return (
                          <div
                            key={`${session.id}-${student.id}`}
                            className="flex items-center justify-between gap-3 rounded-lg border border-clay/30 bg-white/95 px-4 py-3"
                          >
                            <p className="text-sm font-medium text-ink">{student.name}</p>
                            <span
                              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                                statusChipClassMap[status]
                              }`}
                            >
                              {statusLabelMap[status]}
                            </span>
                          </div>
                        );
                      })
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {attendanceError ? (
          <p className="mt-3 text-xs text-ink/70">{attendanceError}</p>
        ) : loadingAttendance ? (
          <p className="mt-3 text-xs text-ink/70">Loading attendance...</p>
        ) : null}
      </Card>

      {canSubmitAbsenceReason ? (
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-ink/80">
                Absent Reason
              </p>
              <p className="text-sm text-ink/78">
                {absentSessions.length > 0
                  ? `${currentStudentName} is absent. Please share your reason with staff.`
                  : "No absent mark for this date."}
              </p>
            </div>
            <span className="rounded-full border border-ocean/35 bg-white px-3 py-1 text-xs font-semibold text-ink/80">
              {absentSessions.length} Absent
            </span>
          </div>

          {loadingAbsenceReason ? (
            <p className="mt-4 text-xs text-ink/70">Loading reason status...</p>
          ) : absenceReasonError ? (
            <p className="mt-4 rounded-lg border border-rose-200 bg-rose-100/80 px-3 py-2 text-xs font-semibold text-rose-900">
              {absenceReasonError}
            </p>
          ) : null}

          {absentSessions.length > 0 ? (
            <form onSubmit={handleSubmitAbsenceReason} className="mt-4 grid gap-4">
              <div className="flex flex-wrap gap-2.5">
                {absentSessions.map((session) => {
                  const sessionLabel =
                    session.label && session.subject
                      ? `${session.label} - ${session.subject}`
                      : session.label || session.subject || "Absent";
                  return (
                    <span
                      key={session.id}
                      className="rounded-full border border-rose-200 bg-rose-100 px-2.5 py-1 text-[11px] font-semibold text-rose-900"
                    >
                      {sessionLabel}
                    </span>
                  );
                })}
              </div>

              <textarea
                value={absenceReasonText}
                onChange={(event) => {
                  setAbsenceReasonText(event.target.value);
                  setAbsenceReasonStatus("");
                  setAbsenceReasonError("");
                }}
                rows={3}
                placeholder="Write the reason for absence..."
                disabled={savingAbsenceReason || hasSubmittedAbsenceReason}
                className="w-full rounded-xl border border-ocean/35 bg-white px-3 py-2.5 text-sm text-ink placeholder:text-ink/55"
              />

              {absenceReasonSubmittedAtLabel ? (
                <p className="text-[11px] text-ink/70">
                  Last submitted: {absenceReasonSubmittedAtLabel}
                </p>
              ) : null}
              {hasSubmittedAbsenceReason ? (
                <p className="rounded-lg border border-clay/35 bg-white/85 px-3 py-2 text-xs font-semibold text-ink/82">
                  Reason already submitted for this date.
                </p>
              ) : null}

              {absenceReasonStatus ? (
                <p className="rounded-lg border border-clay/35 bg-white/85 px-3 py-2 text-xs font-semibold text-ink/82">
                  {absenceReasonStatus}
                </p>
              ) : null}

              {!hasSubmittedAbsenceReason ? (
                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={savingAbsenceReason}
                    className="rounded-xl border border-ocean/55 bg-gradient-to-r from-ocean to-cocoa px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {savingAbsenceReason ? "Sending..." : "Send Reason"}
                  </button>
                </div>
              ) : null}
            </form>
          ) : null}
        </Card>
      ) : null}

      {isStaff ? (
        <Suspense fallback={null}>
          <FaceAttendanceModal
            open={isFaceScanModalOpen}
            mode="scan"
            title="Live Face Attendance"
            description={`Registered face profiles: ${enrolledFaceCount}/${students.length}`}
            thresholdPercent={Math.round(FACE_MATCH_THRESHOLD * 100)}
            onClose={() => setIsFaceScanModalOpen(false)}
            onDescriptor={handleStaffFaceDescriptor}
            disabled={
              loadingStudents ||
              Boolean(studentsError) ||
              students.length === 0 ||
              enrolledFaceCount === 0
            }
          />
        </Suspense>
      ) : null}

      {isStudent ? (
        <Suspense fallback={null}>
          <FaceAttendanceModal
            open={isFaceRegisterModalOpen}
            mode="register"
            title="Register Student Face"
            description="Capture at least 3 samples. A stable 128-dimensional profile is saved for better accuracy."
            thresholdPercent={Math.round(FACE_MATCH_THRESHOLD * 100)}
            onClose={() => setIsFaceRegisterModalOpen(false)}
            onDescriptor={handleStudentFaceRegistration}
            disabled={!currentStudentId}
          />
        </Suspense>
      ) : null}
      </div>
    </>
  );
}
