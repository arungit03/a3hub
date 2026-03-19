import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Card from "../components/Card";
import GradientHeader from "../components/GradientHeader";
import { useAuth } from "../state/auth";
import { ensureFaceApiReady } from "../lib/faceApiLoader";
import { db } from "../lib/firebase";
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
import {
  buildFaceRegistrationProfile,
  cosineSimilarity,
  FACE_MATCH_CONFIRMATION_COUNT,
  FACE_MATCH_CONFIRMATION_WINDOW_MS,
  FACE_MATCH_COOLDOWN_MS,
  FACE_MATCH_FAST_TRACK_THRESHOLD,
  FACE_MATCH_THRESHOLD,
  FACE_MIN_VECTOR_LENGTH,
  FACE_REGISTRATION_MIN_SAMPLE_SIMILARITY,
  FACE_REGISTRATION_REQUIRED_SAMPLE_COUNT,
  formatDateLabel,
  formatDateTimeLabel,
  formatTimeLabel,
  getCreatedAtMillis,
  getRequiredFaceConfirmationCount,
  getPeriodNumber,
  getStudentFaceTemplates,
  getStudentFaceVector,
  getStudentScanTokens,
  getStudentScanToken,
  isRetryableScanError,
  mergeOfflineScanQueueItem,
  normalizeAttendanceStatus,
  normalizeDailyQrScanEntry,
  normalizeFaceVector,
  normalizeFirestoreErrorCode,
  readOfflineScanQueue,
  resolveReliableFaceMatches,
  resolveStudentEmail,
  SCAN_QUEUE_DATE_PATTERN,
  SCAN_QUEUE_TOKEN_PATTERN,
  statusChipClassMap,
  statusLabelMap,
  toSimilarityPercentLabel,
  writeOfflineScanQueue,
} from "../features/attendance/attendanceUtils.js";

const FaceAttendanceModal = lazy(() => import("../components/FaceAttendanceModal"));

const getFaceScanStudentLabel = (student) =>
  student?.name || student?.email || "Student";

const summarizeFaceScanItems = (items, formatter, maxItems = 3) => {
  const safeItems = Array.isArray(items) ? items : [];
  const labels = safeItems
    .map((item, index) =>
      typeof formatter === "function" ? formatter(item, index) : String(item || "").trim()
    )
    .filter(Boolean);

  if (labels.length === 0) return "";
  if (labels.length <= maxItems) return labels.join(", ");
  return `${labels.slice(0, maxItems).join(", ")} +${labels.length - maxItems} more`;
};

const pruneTimestampMap = (entries, maxAgeMs, now = Date.now()) =>
  Object.fromEntries(
    Object.entries(entries && typeof entries === "object" ? entries : {}).filter(
      ([, value]) => {
        const timestamp = Number(value);
        return Number.isFinite(timestamp) && now - timestamp < maxAgeMs;
      }
    )
  );

const prunePendingFaceMatches = (entries, now = Date.now()) =>
  Object.fromEntries(
    Object.entries(entries && typeof entries === "object" ? entries : {}).filter(
      ([, value]) => {
        const count = Number(value?.count);
        const timestamp = Number(value?.at);
        return (
          Number.isFinite(count) &&
          count > 0 &&
          Number.isFinite(timestamp) &&
          now - timestamp < FACE_MATCH_CONFIRMATION_WINDOW_MS
        );
      }
    )
  );

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
  const lastScanRef = useRef({});
  const lastFaceMatchRef = useRef({});
  const pendingFaceMatchRef = useRef({});
  const registrationSamplesRef = useRef([]);
  const queueSyncInFlightRef = useRef(false);

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
  const canOpenFaceScan =
    !loadingStudents &&
    !studentsError &&
    students.length > 0 &&
    enrolledFaceCount > 0;
  const faceScanStateLabel = loadingStudents
    ? "Loading"
    : studentsError
    ? "Issue"
    : canOpenFaceScan
    ? "Ready"
    : "Standby";
  const faceScanSummaryLabel = loadingStudents
    ? "Preparing registered face profiles"
    : studentsError
    ? "Face scan setup needs attention"
    : students.length === 0
    ? "No students available for live scanning"
    : enrolledFaceCount === 0
    ? "Register at least one student face profile"
    : `${enrolledFaceCount}/${students.length} face profiles ready`;
  useEffect(() => {
    if (!isStaff || !canOpenFaceScan || typeof window === "undefined") {
      return undefined;
    }

    let cancelled = false;

    void import("../components/FaceAttendanceModal");
    void ensureFaceApiReady().catch(() => {
      if (cancelled) return;
      // Warm model assets silently so the first scan opens faster.
    });

    return () => {
      cancelled = true;
    };
  }, [canOpenFaceScan, isStaff]);
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
    if (!isStudent || !isFaceRegisterModalOpen) {
      registrationSamplesRef.current = [];
      return;
    }
    registrationSamplesRef.current = [];
  }, [isFaceRegisterModalOpen, isStudent]);
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
      lastScanRef.current = {};
      lastFaceMatchRef.current = {};
      pendingFaceMatchRef.current = {};
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

      setFaceProfileStatus("");
      setFaceProfileError("");

      try {
        const existingSamples = Array.isArray(registrationSamplesRef.current)
          ? registrationSamplesRef.current
              .map((sample) => normalizeFaceVector(sample))
              .filter((sample) => sample.length >= FACE_MIN_VECTOR_LENGTH)
          : [];
        const bestExistingSimilarity =
          existingSamples.length > 0
            ? existingSamples.reduce(
                (bestSimilarity, sample) =>
                  Math.max(bestSimilarity, cosineSimilarity(normalizedVector, sample)),
                0
              )
            : 1;

        if (
          existingSamples.length > 0 &&
          bestExistingSimilarity < FACE_REGISTRATION_MIN_SAMPLE_SIMILARITY
        ) {
          registrationSamplesRef.current = [normalizedVector];
          return {
            tone: "info",
            message: `Capture restarted because the face changed too much. Sample 1/${FACE_REGISTRATION_REQUIRED_SAMPLE_COUNT} captured.`,
          };
        }

        const registrationProfile = buildFaceRegistrationProfile([
          ...existingSamples,
          normalizedVector,
        ]);
        registrationSamplesRef.current = registrationProfile.vectors;

        if (
          registrationProfile.sampleCount < FACE_REGISTRATION_REQUIRED_SAMPLE_COUNT
        ) {
          const remainingSamples =
            FACE_REGISTRATION_REQUIRED_SAMPLE_COUNT -
            registrationProfile.sampleCount;
          return {
            tone: "info",
            message: `Sample ${registrationProfile.sampleCount}/${FACE_REGISTRATION_REQUIRED_SAMPLE_COUNT} captured. Hold steady for ${remainingSamples} more clear frame${
              remainingSamples === 1 ? "" : "s"
            }.`,
          };
        }

        await setDoc(
          doc(db, "users", user.uid),
          {
            faceAttendance: {
              vector: registrationProfile.vector,
              vectorLength: Number.isFinite(vectorLength)
                ? Number(vectorLength)
                : registrationProfile.vectorLength,
              sampleVectors: registrationProfile.sampleVectors,
              sampleCount: registrationProfile.sampleCount,
              algorithm: "face-api-128d",
              matchThreshold: FACE_MATCH_THRESHOLD,
              detectionScore: Number.isFinite(detectionScore)
                ? Number(detectionScore.toFixed(4))
                : null,
              sampleConsistency: registrationProfile.sampleConsistency,
              sampleMinSimilarity: registrationProfile.sampleMinSimilarity,
              updatedAt: serverTimestamp(),
            },
          },
          { merge: true }
        );

        const successMessage = `Face profile saved with ${registrationProfile.sampleCount} verified samples.`;

        setFaceProfileStatus(successMessage);
        setFaceProfileError("");

        return {
          tone: "success",
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
    async ({
      detections = [],
      vector,
      vectorLength,
      skippedCount = 0,
    }) => {
      if (!isStaff) {
        return {
          tone: "error",
          message: "Only staff can scan attendance.",
        };
      }

      setScanStatus("");
      setScanError("");

      if (loadingStudents) {
        pendingFaceMatchRef.current = {};
        return {
          tone: "info",
          message: "Loading students for face matching...",
        };
      }

      if (studentsError) {
        pendingFaceMatchRef.current = {};
        setScanError(studentsError);
        return {
          tone: "error",
          message: studentsError,
        };
      }

      if (studentFaceProfiles.length === 0) {
        pendingFaceMatchRef.current = {};
        const message = "No registered student face profiles found.";
        setScanError(message);
        return {
          tone: "error",
          message,
        };
      }

      const rawDetections =
        Array.isArray(detections) && detections.length > 0
          ? detections
          : vector
          ? [{ vector, vectorLength }]
          : [];

      const normalizedDetections = rawDetections
        .map((detection, detectionIndex) => {
          const normalizedVector = normalizeFaceVector(detection?.vector ?? detection);
          if (normalizedVector.length < FACE_MIN_VECTOR_LENGTH) {
            return null;
          }

          return {
            ...detection,
            detectionIndex,
            vector: normalizedVector,
            vectorLength: Number.isFinite(detection?.vectorLength)
              ? Number(detection.vectorLength)
              : normalizedVector.length,
          };
        })
        .filter(Boolean);

      if (normalizedDetections.length === 0) {
        pendingFaceMatchRef.current = {};
        const message = "No usable faces detected for attendance.";
        setScanError(message);
        return {
          tone: "info",
          message,
        };
      }

      const { accepted, rejected } = resolveReliableFaceMatches(
        normalizedDetections,
        studentFaceProfiles
      );

      const now = Date.now();
      let pendingMatches = prunePendingFaceMatches(
        pendingFaceMatchRef.current,
        now
      );
      let recentScanKeys = pruneTimestampMap(
        lastScanRef.current,
        FACE_MATCH_COOLDOWN_MS,
        now
      );
      let recentStudentMatches = pruneTimestampMap(
        lastFaceMatchRef.current,
        FACE_MATCH_COOLDOWN_MS,
        now
      );

      if (accepted.length === 0) {
        pendingFaceMatchRef.current = pendingMatches;
        const ambiguousMatches = rejected.filter((item) => item.status === "ambiguous");
        const bestRejectedMatch = rejected
          .map((item) => item.bestMatch)
          .filter(Boolean)
          .sort((a, b) => b.similarity - a.similarity)[0];

        const message =
          ambiguousMatches.length > 0
            ? `Ambiguous matches detected for ${ambiguousMatches.length} face${
                ambiguousMatches.length > 1 ? "s" : ""
              }. Separate students slightly and try again.`
            : bestRejectedMatch
            ? `No reliable multi-face match above ${toSimilarityPercentLabel(
                FACE_MATCH_THRESHOLD
              )}. Best: ${getFaceScanStudentLabel(
                bestRejectedMatch.student
              )} at ${toSimilarityPercentLabel(bestRejectedMatch.similarity)}.`
            : "No reliable face matches found.";
        const finalMessage =
          skippedCount > 0
            ? `${message} ${skippedCount} face${skippedCount > 1 ? "s were" : " was"} skipped for low quality.`
            : message;
        setScanError(finalMessage);
        return {
          tone: "info",
          message: finalMessage,
        };
      }

      const confirmingMatches = [];
      const readyMatches = [];

      accepted.forEach((match) => {
        const studentId = String(match?.student?.id || "").trim();
        if (!studentId) return;
        const requiredConfirmationCount = getRequiredFaceConfirmationCount(
          match.similarity
        );

        const previousPending = pendingMatches[studentId];
        const nextPending =
          previousPending &&
          now - Number(previousPending.at || 0) < FACE_MATCH_CONFIRMATION_WINDOW_MS
            ? {
                count: Number(previousPending.count || 0) + 1,
                at: now,
              }
            : {
                count: 1,
                at: now,
              };

        if (nextPending.count < requiredConfirmationCount) {
          pendingMatches[studentId] = nextPending;
          confirmingMatches.push({
            ...match,
            confirmationCount: nextPending.count,
            requiredConfirmationCount,
          });
          return;
        }

        delete pendingMatches[studentId];
        readyMatches.push({
          ...match,
          requiredConfirmationCount,
        });
      });

      pendingFaceMatchRef.current = pendingMatches;

      const markedMatches = [];
      const alreadyMarkedMatches = [];
      const queuedOfflineMatches = [];
      const alreadyQueuedMatches = [];
      const cooldownMatches = [];
      const invalidTokenMatches = [];
      const failedMatches = [];

      for (const match of readyMatches) {
        const matchedStudent = match.student;
        const studentId = String(matchedStudent?.id || "").trim();
        const studentLabel = getFaceScanStudentLabel(matchedStudent);
        if (!studentId) continue;

        const scanKey = `${selectedDate}:${studentId}`;
        if (
          recentScanKeys[scanKey] ||
          recentStudentMatches[studentId]
        ) {
          cooldownMatches.push(match);
          continue;
        }

        recentScanKeys[scanKey] = now;
        recentStudentMatches[studentId] = now;

        const localScanMeta = dailyQrScanMetaByStudent[studentId];
        if (localScanMeta) {
          alreadyMarkedMatches.push({
            ...match,
            timeLabel: formatTimeLabel(localScanMeta.scannedAtMillis),
          });
          continue;
        }

        const scanToken = getStudentScanToken(matchedStudent);
        if (!SCAN_QUEUE_TOKEN_PATTERN.test(String(scanToken || ""))) {
          invalidTokenMatches.push(match);
          continue;
        }

        if (!isOnline) {
          const queueResult = queueScanForOfflineSync({
            date: selectedDate,
            qrToken: scanToken,
            student: matchedStudent,
            source: "face",
            matchSimilarity: match.similarity,
          });
          if (queueResult.alreadyQueued) {
            alreadyQueuedMatches.push(match);
          } else {
            queuedOfflineMatches.push(match);
          }
          continue;
        }

        const saveResult = await markStudentPresentFromQr({
          student: matchedStudent,
          qrToken: scanToken,
          scanSource: "face",
          matchSimilarity: match.similarity,
          vectorLength: match.detection?.vectorLength ?? match.vectorLength,
        });

        if (saveResult.ok) {
          markedMatches.push(match);
          continue;
        }

        if (saveResult.reason === "already_scanned") {
          alreadyMarkedMatches.push({
            ...match,
            timeLabel: formatTimeLabel(saveResult.existingScanMeta?.scannedAtMillis),
          });
          continue;
        }

        const shouldQueueForSync =
          !isOnline || saveResult.reason === "retryable_error";
        if (shouldQueueForSync) {
          const queueResult = queueScanForOfflineSync({
            date: selectedDate,
            qrToken: scanToken,
            student: matchedStudent,
            source: "face",
            matchSimilarity: match.similarity,
          });
          if (queueResult.alreadyQueued) {
            alreadyQueuedMatches.push(match);
          } else {
            queuedOfflineMatches.push(match);
          }
          continue;
        }

        failedMatches.push({
          ...match,
          studentLabel,
        });
      }

      lastScanRef.current = recentScanKeys;
      lastFaceMatchRef.current = recentStudentMatches;

      if (markedMatches.length > 0) {
        setLastScannedId(
          summarizeFaceScanItems(
            markedMatches,
            (item) =>
              `${getFaceScanStudentLabel(item.student)} (${toSimilarityPercentLabel(
                item.similarity
              )})`
          )
        );
      }

      const ambiguousMatches = rejected.filter((item) => item.status === "ambiguous");
      const lowConfidenceMatches = rejected.filter(
        (item) => item.status === "below_threshold" || item.status === "no_match"
      );
      const messageParts = [];

      if (markedMatches.length > 0) {
        messageParts.push(
          `Marked present: ${summarizeFaceScanItems(markedMatches, (item) =>
            `${getFaceScanStudentLabel(item.student)} (${toSimilarityPercentLabel(
              item.similarity
            )})`
          )}.`
        );
      }

      if (alreadyMarkedMatches.length > 0) {
        messageParts.push(
          `Already marked: ${summarizeFaceScanItems(
            alreadyMarkedMatches,
            (item) =>
              `${getFaceScanStudentLabel(item.student)}${
                item.timeLabel ? ` at ${item.timeLabel}` : ""
              }`
          )}.`
        );
      }

      if (queuedOfflineMatches.length > 0) {
        messageParts.push(
          `${isOnline ? "Queued for retry" : "Saved offline"}: ${summarizeFaceScanItems(
            queuedOfflineMatches,
            (item) => getFaceScanStudentLabel(item.student)
          )}.`
        );
      }

      if (alreadyQueuedMatches.length > 0) {
        messageParts.push(
          `Already queued: ${summarizeFaceScanItems(
            alreadyQueuedMatches,
            (item) => getFaceScanStudentLabel(item.student)
          )}.`
        );
      }

      if (confirmingMatches.length > 0) {
        messageParts.push(
          `Hold steady: ${summarizeFaceScanItems(
            confirmingMatches,
            (item) =>
              `${getFaceScanStudentLabel(item.student)} (${item.confirmationCount}/${item.requiredConfirmationCount})`
          )}.`
        );
      }

      if (cooldownMatches.length > 0) {
        messageParts.push(
          `Cooling down: ${summarizeFaceScanItems(cooldownMatches, (item) =>
            getFaceScanStudentLabel(item.student)
          )}.`
        );
      }

      if (ambiguousMatches.length > 0) {
        messageParts.push(
          `Ambiguous: ${summarizeFaceScanItems(
            ambiguousMatches,
            (item) => getFaceScanStudentLabel(item.bestMatch?.student)
          )}.`
        );
      }

      if (lowConfidenceMatches.length > 0 && markedMatches.length === 0) {
        messageParts.push(
          `Low confidence on ${lowConfidenceMatches.length} face${
            lowConfidenceMatches.length > 1 ? "s" : ""
          }.`
        );
      }

      if (skippedCount > 0) {
        messageParts.push(
          `${skippedCount} face${skippedCount > 1 ? "s were" : " was"} skipped for low quality.`
        );
      }

      const failureMessage =
        invalidTokenMatches.length > 0
          ? `Missing valid student token for ${summarizeFaceScanItems(
              invalidTokenMatches,
              (item) => getFaceScanStudentLabel(item.student)
            )}.`
          : failedMatches.length > 0
          ? `Unable to save attendance for ${summarizeFaceScanItems(
              failedMatches,
              (item) => getFaceScanStudentLabel(item.student)
            )}.`
          : "";

      const message = [...messageParts, failureMessage].filter(Boolean).join(" ");

      if (failureMessage) {
        setScanError(failureMessage);
      } else {
        setScanError("");
      }
      setScanStatus(message);

      return {
        tone:
          markedMatches.length > 0
            ? "success"
            : failureMessage && messageParts.length === 0
            ? "error"
            : "info",
        message:
          message ||
          "Faces detected, but no attendance changes were needed this cycle.",
      };
    },
    [
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
              <p className="text-[11px] text-ink/65">
                Strong matches above{" "}
                {toSimilarityPercentLabel(FACE_MATCH_FAST_TRACK_THRESHOLD)} mark
                instantly. Other matches need {FACE_MATCH_CONFIRMATION_COUNT} steady
                detections.
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
            <div className="rounded-[1.2rem] border border-ocean/20 bg-[linear-gradient(145deg,rgb(var(--cream)_/_0.96)_0%,rgb(var(--mist)_/_0.74)_100%)] px-4 py-4 text-xs text-ink/75 shadow-[inset_0_1px_0_rgb(var(--cream)_/_0.9),0_18px_34px_-26px_rgb(var(--ocean)_/_0.3)]">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-ocean/20 bg-white/88 text-ocean shadow-[0_10px_22px_-18px_rgb(var(--ocean)_/_0.45)]">
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 24 24"
                      className="h-5 w-5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M8 3H6a3 3 0 0 0-3 3v2" />
                      <path d="M16 3h2a3 3 0 0 1 3 3v2" />
                      <path d="M8 21H6a3 3 0 0 1-3-3v-2" />
                      <path d="M16 21h2a3 3 0 0 0 3-3v-2" />
                      <circle cx="12" cy="12" r="3.2" />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink/68">
                      Live Face Camera
                    </p>
                    <p className="mt-1 text-sm font-semibold text-ink">
                      {faceScanSummaryLabel}
                    </p>
                  </div>
                </div>
                <span
                  className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${
                    canOpenFaceScan
                      ? "border-emerald-200 bg-emerald-100/90 text-emerald-800"
                      : "border-clay/35 bg-white/88 text-ink/70"
                  }`}
                >
                  {faceScanStateLabel}
                </span>
              </div>
              <div className="mt-4 flex flex-wrap gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setScanStatus("");
                    setScanError("");
                    setIsFaceScanModalOpen(true);
                  }}
                  disabled={!canOpenFaceScan}
                  className="inline-flex min-h-[2.7rem] items-center rounded-full border border-ocean/45 bg-[linear-gradient(135deg,rgb(var(--ocean))_0%,rgb(var(--aurora))_58%,rgb(var(--cocoa))_100%)] px-4 py-2 text-sm font-semibold text-white shadow-[0_14px_26px_-18px_rgb(var(--cocoa)_/_0.55)] transition-all hover:-translate-y-0.5 hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Open Face Attendance
                </button>
                <span className="inline-flex min-h-[2.7rem] items-center rounded-full border border-clay/35 bg-white/90 px-3.5 py-2 text-[11px] font-semibold text-ink/75">
                  Threshold: {toSimilarityPercentLabel(FACE_MATCH_THRESHOLD)}
                </span>
                <span className="inline-flex min-h-[2.7rem] items-center rounded-full border border-clay/35 bg-white/72 px-3.5 py-2 text-[11px] font-semibold text-ink/68">
                  Students: {students.length}
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
                    className="rounded-xl border border-ocean/55 bg-[linear-gradient(135deg,rgb(var(--ocean))_0%,rgb(var(--aurora))_58%,rgb(var(--cocoa))_100%)] px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-70"
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
            description="Look straight at the camera. Multiple clear front-facing samples will be captured automatically for a stronger face profile."
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

