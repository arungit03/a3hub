import { useCallback, useEffect, useMemo, useState } from "react";
import Card from "../components/Card";
import GradientHeader from "../components/GradientHeader";
import { useAuth } from "../state/auth";
import { db } from "../lib/supabase";
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
} from "../lib/supabaseData";
import {
  formatDateLabel,
  formatDateTimeLabel,
  getCreatedAtMillis,
  getPeriodNumber,
  normalizeAttendanceStatus,
  normalizeDailyQrScanEntry,
  resolveStudentEmail,
  SCAN_QUEUE_DATE_PATTERN,
  statusChipClassMap,
  statusLabelMap,
} from "../features/attendance/attendanceUtils.js";

const normalizeDepartmentFilter = (value) =>
  String(value || "")
    .trim()
    .toLowerCase();

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
  const [periodUpdateStatus, setPeriodUpdateStatus] = useState("");
  const [periodUpdateError, setPeriodUpdateError] = useState("");
  const [savingPeriodKey, setSavingPeriodKey] = useState("");
  const [savingBulkSessionId, setSavingBulkSessionId] = useState("");

  const [records, setRecords] = useState({});

  const isStaff =
    typeof forcedStaff === "boolean" ? forcedStaff : role === "staff";
  const isParent = role === "parent";
  const isStudent = !isStaff && role === "student";
  const canSubmitAbsenceReason = !isStaff && isParent;
  const staffDepartmentFilter = useMemo(() => {
    const departmentKey = normalizeDepartmentFilter(profile?.departmentKey);
    if (departmentKey) {
      return {
        field: "departmentKey",
        value: departmentKey,
      };
    }

    const department = String(profile?.department || "").trim();
    if (department) {
      return {
        field: "department",
        value: department,
      };
    }

    return null;
  }, [profile?.department, profile?.departmentKey]);
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
  const dailyQrScans = useMemo(() => {
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
  const absenceReasonSubmittedAtLabel = formatDateTimeLabel(
    absenceReason?.submittedAt || absenceReason?.updatedAt || absenceReason?.createdAt
  );
  const hasSubmittedAbsenceReason = Boolean(
    String(absenceReason?.reason || "").trim()
  );
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
      const studentsQuery = staffDepartmentFilter
        ? query(
            collection(db, "users"),
            where("role", "==", "student"),
            where(staffDepartmentFilter.field, "==", staffDepartmentFilter.value)
          )
        : query(collection(db, "users"), where("role", "==", "student"));

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
  }, [isStaff, staffDepartmentFilter]);

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
      setPeriodUpdateStatus("");
      setPeriodUpdateError("");
      setSavingPeriodKey("");
      setSavingBulkSessionId("");
    }
    return undefined;
  }, [isStaff]);

  useEffect(() => {
    setPeriodUpdateStatus("");
    setPeriodUpdateError("");
    setSavingPeriodKey("");
    setSavingBulkSessionId("");
  }, [selectedDate]);

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
            ? "Mark each period manually and review daily attendance."
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
                  Daily Attendance Count
                </p>
                <span className="rounded-full border border-clay/35 bg-white px-2.5 py-1 text-[11px] font-semibold text-ink/75">
                  Daily Scan
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
              <p className="text-sm font-medium text-ink">Daily Attendance</p>
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  statusChipClassMap[currentStudentDailyStatus]
                }`}
              >
                {statusLabelMap[currentStudentDailyStatus]}
              </span>
            </div>
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

      </div>
    </>
  );
}
