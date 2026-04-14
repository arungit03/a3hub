import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../state/auth";
import StatCard from "../components/dashboard/StatCard";
import ActivityItem from "../components/dashboard/ActivityItem";
import { resolveScheduleEntryDateKey, toDateKey } from "../lib/scheduleDate";
import { isFeatureEnabled } from "../config/features";

const iconProps = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: "1.9",
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": "true",
};

const STAT_ICONS = {
  attendance: (
    <svg {...iconProps}>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M8 3v4M16 3v4M4 10h16M8 14h3" />
    </svg>
  ),
  exams: (
    <svg {...iconProps}>
      <path d="M8 4h8l4 4v12H8z" />
      <path d="M16 4v4h4M11 13h6M11 17h6M11 9h2" />
    </svg>
  ),
  assignments: (
    <svg {...iconProps}>
      <path d="M4 5h16v14H4z" />
      <path d="M8 9h8M8 13h8M8 17h5" />
    </svg>
  ),
  notices: (
    <svg {...iconProps}>
      <path d="M6.5 9.5a5.5 5.5 0 0 1 11 0v3.8c0 .8.3 1.6.9 2.1l1.1 1H5l1.1-1c.6-.5.9-1.3.9-2.1z" />
      <path d="M9.5 18a2.5 2.5 0 0 0 5 0" />
    </svg>
  ),
};

const ROLE_LABELS = {
  student: "Student",
  staff: "Staff",
  parent: "Parent",
};

const ACTIVITY_ORDER = Object.freeze({
  assignment: 0,
  attendance: 1,
  marks: 2,
  leave: 3,
});

const toMillis = (value) => {
  if (!value) return 0;
  if (typeof value?.toMillis === "function") return value.toMillis();
  const date = new Date(value);
  const millis = date.getTime();
  return Number.isNaN(millis) ? 0 : millis;
};

const formatDateTimeLabel = (value) => {
  const millis = toMillis(value);
  if (!millis) return "Recently";
  return new Date(millis).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const formatDateLabel = (value) => {
  const safe = String(value || "").trim();
  if (!safe) return "";
  const parsed = new Date(`${safe}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return safe;
  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const parseExamDate = (value) => {
  if (!value) return null;
  if (value?.toDate) return value.toDate();
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const parsed = new Date(`${value}T23:59:59`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatExamDate = (value) => {
  const parsed = parseExamDate(value);
  if (!parsed) return String(value || "");
  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const parseAssignmentExpiry = (item) => {
  const fromTimestamp = toMillis(item?.expiresAt || item?.dueAt);
  if (fromTimestamp) return fromTimestamp;

  const rawSubmitEnd = String(item?.submitEnd || "").trim();
  if (rawSubmitEnd) {
    const parsed = new Date(`${rawSubmitEnd}T23:59:59`);
    if (!Number.isNaN(parsed.getTime())) return parsed.getTime();
  }

  return 0;
};

const formatAssignmentDueLabel = (item) => {
  const dueMillis = parseAssignmentExpiry(item);
  if (dueMillis) {
    return new Date(dueMillis).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }
  return String(item?.submitEnd || "Not set");
};

const parseTimeToMinutes = (value) => {
  const safe = String(value || "").trim();
  if (!/^\d{2}:\d{2}$/.test(safe)) return Number.MAX_SAFE_INTEGER;
  const [hours, minutes] = safe.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return Number.MAX_SAFE_INTEGER;
  }
  return hours * 60 + minutes;
};

const getLeaveStatus = (status) => {
  const safe = String(status || "").toLowerCase();
  if (safe === "approved" || safe === "take") return "approved";
  if (safe === "rejected" || safe === "notake") return "completed";
  return "pending";
};

const upsertActivity = (items, nextItem) =>
  [...items.filter((item) => item?.id !== nextItem.id), nextItem].sort(
    (left, right) =>
      (ACTIVITY_ORDER[left?.id] ?? Number.MAX_SAFE_INTEGER) -
      (ACTIVITY_ORDER[right?.id] ?? Number.MAX_SAFE_INTEGER)
  );

const removeActivity = (items, activityId) =>
  items.filter((item) => item?.id !== activityId);

export default function HomePage({ forcedRole }) {
  const navigate = useNavigate();
  const { role: contextRole, profile, user } = useAuth();
  const role = forcedRole || contextRole || "student";
  const isStaff = role === "staff";
  const basePath = role === "parent" ? "/parent" : "/student";
  const attendanceEnabled = isFeatureEnabled("attendance");
  const assignmentsEnabled = isFeatureEnabled("assignments");
  const marksEnabled = isFeatureEnabled("marks");
  const examsEnabled = isFeatureEnabled("exams");
  const leaveEnabled = isFeatureEnabled("leave");
  const notificationsEnabled = isFeatureEnabled("notifications");
  const todayKey = useMemo(() => toDateKey(new Date()), []);
  const roleLabel = ROLE_LABELS[role] || "Student";
  const userName = String(
    profile?.name || user?.displayName || user?.email || "Campus Member"
  )
    .trim()
    .replace(/@.*/, "");
  const dashboardName = userName || "Campus Member";

  const [attendancePercent, setAttendancePercent] = useState(0);
  const [upcomingExamCount, setUpcomingExamCount] = useState(0);
  const [pendingAssignmentCount, setPendingAssignmentCount] = useState(0);
  const [activeNoticeCount, setActiveNoticeCount] = useState(0);
  const [activities, setActivities] = useState([]);
  const [attendanceBreakdown, setAttendanceBreakdown] = useState({
    present: 0,
    total: 0,
  });
  const [attendanceModalOpen, setAttendanceModalOpen] = useState(false);
  const [panelAnimatedPercent, setPanelAnimatedPercent] = useState(0);
  const [modalAnimatedPercent, setModalAnimatedPercent] = useState(0);
  const [staffScheduleItems, setStaffScheduleItems] = useState([]);
  const [staffScheduleLoading, setStaffScheduleLoading] = useState(true);
  const [staffScheduleStatus, setStaffScheduleStatus] = useState("");
  const [removingScheduleId, setRemovingScheduleId] = useState("");
  const [staffExamItems, setStaffExamItems] = useState([]);
  const [staffExamsLoading, setStaffExamsLoading] = useState(true);
  const [staffExamsStatus, setStaffExamsStatus] = useState("");
  const [removingExamId, setRemovingExamId] = useState("");
  const [staffAssignmentItems, setStaffAssignmentItems] = useState([]);
  const [staffAssignmentsLoading, setStaffAssignmentsLoading] = useState(true);
  const [staffAssignmentsStatus, setStaffAssignmentsStatus] = useState("");
  const [removingAssignmentId, setRemovingAssignmentId] = useState("");
  const [staffAttendanceDate, setStaffAttendanceDate] = useState(() =>
    toDateKey(new Date())
  );
  const [staffStudentCount, setStaffStudentCount] = useState(0);
  const [staffDailyScanPresentCount, setStaffDailyScanPresentCount] = useState(0);
  const [staffScanStatus, setStaffScanStatus] = useState("");

  useEffect(() => {
    if (!attendanceEnabled) {
      setAttendanceBreakdown({ present: 0, total: 0 });
      setAttendancePercent(0);
      setActivities((prev) => removeActivity(prev, "attendance"));
      return undefined;
    }

    const attendanceQuery = query(collection(db, "attendance"), limit(60));
    const unsubscribe = onSnapshot(
      attendanceQuery,
      (snapshot) => {
        let present = 0;
        let total = 0;
        let latest = null;

        snapshot.forEach((docItem) => {
          const data = docItem.data() || {};
          const periods = Array.isArray(data?.periods)
            ? data.periods
            : [];
          const candidateMillis =
            toMillis(data.updatedAt) ||
            toMillis(data.createdAt) ||
            toMillis(data.date);

          if (!latest || candidateMillis > latest.millis) {
            latest = {
              millis: candidateMillis,
              data,
            };
          }

          periods.forEach((period) => {
            const students = period?.students || {};
            if (role === "staff") {
              Object.values(students).forEach((status) => {
                if (status === true || status === false) {
                  total += 1;
                  if (status === true) present += 1;
                }
              });
              return;
            }

            const currentStatus = students?.[user?.uid];
            if (currentStatus === true || currentStatus === false) {
              total += 1;
              if (currentStatus === true) present += 1;
            }
          });
        });

        setAttendanceBreakdown({ present, total });
        if (total > 0) {
          const nextPercent = Math.max(0, Math.min(100, Math.round((present / total) * 100)));
          setAttendancePercent(nextPercent);
        } else {
          setAttendancePercent(0);
        }

        if (!latest) {
          setActivities((prev) => removeActivity(prev, "attendance"));
          return;
        }

        setActivities((prev) => {
          const nextActivity = {
            id: "attendance",
            title: "Attendance marked",
            subtitle: latest.data?.department || "Class attendance",
            timeLabel: formatDateTimeLabel(
              latest.data?.updatedAt || latest.data?.createdAt
            ),
            status: "completed",
          };
          return upsertActivity(prev, nextActivity);
        });
      },
      () => {
        setAttendanceBreakdown({ present: 0, total: 0 });
        setAttendancePercent(0);
        setActivities((prev) => removeActivity(prev, "attendance"));
      }
    );

    return () => unsubscribe();
  }, [attendanceEnabled, role, user?.uid]);

  useEffect(() => {
    if (!examsEnabled) {
      setUpcomingExamCount(0);
      setStaffExamItems([]);
      setStaffExamsLoading(false);
      setStaffExamsStatus("");
      return undefined;
    }

    setStaffExamsLoading(true);
    const examsQuery = query(
      collection(db, "examSchedules"),
      orderBy("examDate", "asc"),
      limit(60)
    );

    const unsubscribe = onSnapshot(
      examsQuery,
      (snapshot) => {
        const nextExamItems = snapshot.docs.map((docItem) => ({
          id: docItem.id,
          ...docItem.data(),
        }));
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        const count = nextExamItems.reduce((acc, item) => {
          const examDate = parseExamDate(item?.examDate);
          if (examDate && examDate.getTime() >= now.getTime()) {
            return acc + 1;
          }
          return acc;
        }, 0);
        setUpcomingExamCount(count || 0);
        setStaffExamItems(nextExamItems);
        setStaffExamsLoading(false);
        setStaffExamsStatus("");
      },
      () => {
        setUpcomingExamCount(0);
        setStaffExamItems([]);
        setStaffExamsLoading(false);
        setStaffExamsStatus("Unable to load exam schedule.");
      }
    );

    return () => unsubscribe();
  }, [examsEnabled]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    let frameId = 0;
    let startTime = 0;
    const duration = 900;

    const tick = (timestamp) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      const nextValue = Math.round(attendancePercent * progress);
      setPanelAnimatedPercent(nextValue);
      if (progress < 1) {
        frameId = window.requestAnimationFrame(tick);
      }
    };

    frameId = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [attendancePercent]);

  useEffect(() => {
    if (!attendanceModalOpen) {
      return undefined;
    }
    if (typeof window === "undefined") {
      return undefined;
    }

    let frameId = 0;
    let startTime = 0;
    const duration = 1000;

    const tick = (timestamp) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      const nextValue = Math.round(attendancePercent * progress);
      setModalAnimatedPercent(nextValue);
      if (progress < 1) {
        frameId = window.requestAnimationFrame(tick);
      }
    };

    frameId = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [attendanceModalOpen, attendancePercent]);

  useEffect(() => {
    if (!isStaff || !user?.uid) {
      setStaffScheduleItems([]);
      setStaffScheduleLoading(false);
      return undefined;
    }

    setStaffScheduleLoading(true);
    setStaffScheduleStatus("");
    const schedulesQuery = query(
      collection(db, "todaysSchedules"),
      orderBy("createdAt", "desc"),
      limit(240)
    );

    const unsubscribe = onSnapshot(
      schedulesQuery,
      (snapshot) => {
        const next = snapshot.docs
          .map((item) => {
            const data = item.data() || {};
            return {
              id: item.id,
              entryDateKey: resolveScheduleEntryDateKey(data),
              time: String(data.time || ""),
              period: String(data.period || data.title || ""),
              subjectName: String(
                data.subjectName || data.subject || data.title || "Subject"
              ),
              createdAt: data.createdAt,
            };
          })
          .filter((item) => item.entryDateKey === todayKey)
          .sort((a, b) => {
            const timeDiff = parseTimeToMinutes(a.time) - parseTimeToMinutes(b.time);
            if (timeDiff !== 0) return timeDiff;
            return toMillis(a.createdAt) - toMillis(b.createdAt);
          });

        setStaffScheduleItems(next);
        setStaffScheduleLoading(false);
      },
      () => {
        setStaffScheduleItems([]);
        setStaffScheduleLoading(false);
        setStaffScheduleStatus("Unable to load today's schedule.");
      }
    );

    return () => unsubscribe();
  }, [isStaff, todayKey, user?.uid]);

  useEffect(() => {
    if (!isStaff) {
      setStaffAssignmentItems([]);
      setStaffAssignmentsLoading(false);
      setStaffAssignmentsStatus("");
    }

    if (!assignmentsEnabled) {
      setStaffAssignmentItems([]);
      setStaffAssignmentsLoading(false);
      setStaffAssignmentsStatus("");
      setPendingAssignmentCount(0);
      setActivities((prev) => removeActivity(prev, "assignment"));
      return undefined;
    }

    if (isStaff) {
      setStaffAssignmentsLoading(true);
      setStaffAssignmentsStatus("");
    }
    const assignmentsQuery = query(
      collection(db, "assignments"),
      orderBy("createdAt", "desc"),
      limit(80)
    );

    const unsubscribe = onSnapshot(
      assignmentsQuery,
      (snapshot) => {
        const next = snapshot.docs.map((docItem) => ({
          id: docItem.id,
          ...docItem.data(),
        }));
        const nowMillis = Date.now();
        const openCount = next.reduce((acc, item) => {
          const expiresAtMillis = parseAssignmentExpiry(item);
          if (!expiresAtMillis || expiresAtMillis > nowMillis) return acc + 1;
          return acc;
        }, 0);
        const latestAssignment = next[0] || null;

        if (isStaff) {
          setStaffAssignmentItems(next);
          setStaffAssignmentsLoading(false);
          setStaffAssignmentsStatus("");
        }

        setPendingAssignmentCount(openCount || 0);
        if (!latestAssignment) {
          setActivities((prev) => removeActivity(prev, "assignment"));
          return;
        }

        setActivities((prev) => {
          const nextActivity = {
            id: "assignment",
            title: "Assignment uploaded",
            subtitle: latestAssignment?.title || "Subject assignment",
            timeLabel: formatDateTimeLabel(latestAssignment?.createdAt),
            status: "pending",
          };
          return upsertActivity(prev, nextActivity);
        });
      },
      () => {
        if (isStaff) {
          setStaffAssignmentItems([]);
          setStaffAssignmentsLoading(false);
          setStaffAssignmentsStatus("Unable to load assignments.");
        }
        setPendingAssignmentCount(0);
        setActivities((prev) => removeActivity(prev, "assignment"));
      }
    );

    return () => unsubscribe();
  }, [assignmentsEnabled, isStaff]);

  useEffect(() => {
    if (!notificationsEnabled) {
      setActiveNoticeCount(0);
      return undefined;
    }

    const noticesQuery = query(
      collection(db, "notices"),
      orderBy("createdAt", "desc"),
      limit(40)
    );

    const unsubscribe = onSnapshot(
      noticesQuery,
      (snapshot) => {
        const windowStart = Date.now() - 14 * 24 * 60 * 60 * 1000;
        const count = snapshot.docs.reduce((acc, docItem) => {
          const createdAtMillis = toMillis(docItem.data()?.createdAt);
          if (createdAtMillis && createdAtMillis >= windowStart) return acc + 1;
          return acc;
        }, 0);
        setActiveNoticeCount(count || 0);
      },
      () => {
        setActiveNoticeCount(0);
      }
    );

    return () => unsubscribe();
  }, [notificationsEnabled]);

  useEffect(() => {
    const unsubscribers = [];

    if (!assignmentsEnabled) {
      setActivities((prev) => removeActivity(prev, "assignment"));
    }

    if (!attendanceEnabled) {
      setActivities((prev) => removeActivity(prev, "attendance"));
    }

    if (marksEnabled) {
      const marksUnsubscribe = onSnapshot(
        query(collection(db, "internalMarks"), orderBy("createdAt", "desc"), limit(1)),
        (snapshot) => {
          const firstItem = snapshot.docs[0]?.data();
          if (!firstItem) {
            setActivities((prev) => removeActivity(prev, "marks"));
            return;
          }
          setActivities((prev) => {
            const nextActivity = {
              id: "marks",
              title: "Marks updated",
              subtitle: firstItem?.examName || "Internal marks",
              timeLabel: formatDateTimeLabel(firstItem?.createdAt),
              status: "completed",
            };
            return upsertActivity(prev, nextActivity);
          });
        }
      );
      unsubscribers.push(marksUnsubscribe);
    } else {
      setActivities((prev) => removeActivity(prev, "marks"));
    }

    if (leaveEnabled) {
      const leaveUnsubscribe = onSnapshot(
        query(collection(db, "leaveRequests"), orderBy("createdAt", "desc"), limit(20)),
        (snapshot) => {
          const approvedItem = snapshot.docs
            .map((docItem) => docItem.data())
            .find((item) => {
              const normalized = String(item?.status || "").toLowerCase();
              return normalized === "approved" || normalized === "take";
            });
          if (!approvedItem) {
            setActivities((prev) => removeActivity(prev, "leave"));
            return;
          }
          setActivities((prev) => {
            const nextActivity = {
              id: "leave",
              title: "Leave approved",
              subtitle: approvedItem?.fromDepartment || "Department leave",
              timeLabel: formatDateTimeLabel(approvedItem?.updatedAt || approvedItem?.createdAt),
              status: getLeaveStatus(approvedItem?.status),
            };
            return upsertActivity(prev, nextActivity);
          });
        }
      );
      unsubscribers.push(leaveUnsubscribe);
    } else {
      setActivities((prev) => removeActivity(prev, "leave"));
    }

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [assignmentsEnabled, attendanceEnabled, leaveEnabled, marksEnabled]);

  const statCards = useMemo(
    () =>
      [
        examsEnabled
          ? {
              id: "exams",
              title: "Upcoming Exams",
              value: String(upcomingExamCount),
              badgeText: "This Week",
              badgeTone: "blue",
              icon: STAT_ICONS.exams,
              to: `${basePath}/exam-schedule`,
            }
          : null,
        assignmentsEnabled
          ? {
              id: "assignments",
              title: "Pending Assignments",
              value: String(pendingAssignmentCount),
              badgeText: "Due Soon",
              badgeTone: "orange",
              icon: STAT_ICONS.assignments,
              to: `${basePath}/menu/assignments`,
            }
          : null,
        notificationsEnabled
          ? {
              id: "notices",
              title: "New Notices",
              value: String(activeNoticeCount),
              badgeText: "Active",
              badgeTone: "purple",
              icon: STAT_ICONS.notices,
              to: role === "parent" ? `${basePath}/home` : `${basePath}/menu?open=notices`,
            }
          : null,
      ].filter(Boolean),
    [
      activeNoticeCount,
      assignmentsEnabled,
      basePath,
      examsEnabled,
      notificationsEnabled,
      pendingAssignmentCount,
      role,
      upcomingExamCount,
    ]
  );
  const attendancePresentCount = attendanceBreakdown.present;
  const attendanceTotalCount = attendanceBreakdown.total;
  const attendanceAbsentCount = Math.max(
    attendanceTotalCount - attendancePresentCount,
    0
  );
  const staffAttendanceDateLabel = useMemo(
    () => formatDateLabel(staffAttendanceDate),
    [staffAttendanceDate]
  );
  const staffScanCounts = useMemo(() => {
    const present = Math.max(
      0,
      staffStudentCount > 0
        ? Math.min(staffDailyScanPresentCount, staffStudentCount)
        : staffDailyScanPresentCount
    );
    return {
      present,
      absent: 0,
      unmarked: Math.max(staffStudentCount - present, 0),
    };
  }, [staffDailyScanPresentCount, staffStudentCount]);
  const panelProgressRadius = 64;
  const panelProgressCircumference = 2 * Math.PI * panelProgressRadius;
  const modalProgressRadius = 56;
  const modalProgressCircumference = 2 * Math.PI * modalProgressRadius;
  const panelProgressOffset =
    panelProgressCircumference - (panelAnimatedPercent / 100) * panelProgressCircumference;
  const modalProgressOffset =
    modalProgressCircumference - (modalAnimatedPercent / 100) * modalProgressCircumference;
  const openAttendanceModal = () => {
    setModalAnimatedPercent(0);
    setAttendanceModalOpen(true);
  };
  const closeAttendanceModal = () => {
    setAttendanceModalOpen(false);
    setModalAnimatedPercent(0);
  };

  const handleRemoveStaffSchedule = async (scheduleId) => {
    if (!isStaff || !scheduleId || removingScheduleId) return;
    setRemovingScheduleId(scheduleId);
    setStaffScheduleStatus("");
    try {
      await deleteDoc(doc(db, "todaysSchedules", scheduleId));
      setStaffScheduleStatus("Schedule item removed.");
    } catch {
      setStaffScheduleStatus("Unable to remove schedule item.");
    } finally {
      setRemovingScheduleId("");
    }
  };

  const handleRemoveStaffExam = async (examId) => {
    if (!isStaff || !examId || removingExamId) return;
    setRemovingExamId(examId);
    setStaffExamsStatus("");
    try {
      await deleteDoc(doc(db, "examSchedules", examId));
      setStaffExamsStatus("Exam removed.");
    } catch {
      setStaffExamsStatus("Unable to remove exam.");
    } finally {
      setRemovingExamId("");
    }
  };

  const handleRemoveStaffAssignment = async (assignmentId) => {
    if (!isStaff || !assignmentId || removingAssignmentId) return;
    setRemovingAssignmentId(assignmentId);
    setStaffAssignmentsStatus("");
    try {
      await deleteDoc(doc(db, "assignments", assignmentId));
      setStaffAssignmentsStatus("Assignment removed.");
    } catch {
      setStaffAssignmentsStatus("Unable to remove assignment.");
    } finally {
      setRemovingAssignmentId("");
    }
  };

  useEffect(() => {
    if (!isStaff) {
      setStaffStudentCount(0);
      setStaffScanStatus("");
      return undefined;
    }

    const studentsQuery = query(
      collection(db, "users"),
      where("role", "==", "student")
    );
    const unsubscribe = onSnapshot(
      studentsQuery,
      (snapshot) => {
        const totalStudents = snapshot.docs
          .map((docItem) => docItem.data() || {})
          .filter((item) => item.name || item.email).length;
        setStaffStudentCount(totalStudents);
      },
      () => {
        setStaffStudentCount(0);
        setStaffScanStatus("Unable to load student count.");
      }
    );

    return () => unsubscribe();
  }, [isStaff]);

  useEffect(() => {
    if (!isStaff) {
      setStaffDailyScanPresentCount(0);
      setStaffScanStatus("");
      return undefined;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(staffAttendanceDate)) {
      setStaffDailyScanPresentCount(0);
      setStaffScanStatus("Select a valid date.");
      return undefined;
    }

    const attendanceRef = doc(db, "attendance", staffAttendanceDate);
    const unsubscribe = onSnapshot(
      attendanceRef,
      (snapshot) => {
        const payload = snapshot.exists() ? snapshot.data() : {};
        const dailyQrScans =
          payload?.dailyQrScans && typeof payload.dailyQrScans === "object"
            ? payload.dailyQrScans
            : {};
        const presentCount = Object.values(dailyQrScans).reduce(
          (total, scanValue) => {
            if (
              scanValue === null ||
              scanValue === undefined ||
              scanValue === false
            ) {
              return total;
            }
            return total + 1;
          },
          0
        );
        setStaffDailyScanPresentCount(presentCount);
        setStaffScanStatus("");
      },
      () => {
        setStaffDailyScanPresentCount(0);
        setStaffScanStatus("Unable to load scan attendance.");
      }
    );

    return () => unsubscribe();
  }, [isStaff, staffAttendanceDate]);

  return (
    <section className="space-y-6">
      <div className="relative overflow-hidden rounded-[1.8rem] border border-white/35 bg-gradient-to-br from-blue-600 via-indigo-600 to-indigo-700 p-5 text-white shadow-lg shadow-indigo-900/30 sm:p-6">
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
                A3 Hub Dashboard
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                Welcome back, {dashboardName} 👋
              </h2>
              <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/15 px-3 py-1 text-xs font-semibold text-white">
                <span className="inline-flex h-2 w-2 rounded-full bg-emerald-300" />
                {roleLabel}
              </div>
            </div>

            {!isStaff ? (
              <div className="w-full max-w-[180px] rounded-2xl border border-white/25 bg-white/10 p-2">
                <div className="rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-center">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-blue-100/80">
                    Attendance
                  </p>
                  <p className="mt-1 text-sm font-semibold text-white">{attendancePercent}%</p>
                </div>
              </div>
            ) : null}
          </div>

          <p className="mt-4 text-sm text-blue-100/90">
            {roleLabel} workspace overview with recent academic and campus updates.
          </p>
        </div>
      </div>

      {isStaff ? (
        <section className="rounded-[1.6rem] border border-ocean/25 bg-gradient-to-br from-white/90 via-slate-50/90 to-blue-100/75 p-5 shadow-[0_18px_34px_-28px_rgba(37,99,235,0.38)]">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-600">
                Attendance Date
              </p>
              <p className="text-3xl font-semibold tracking-tight text-slate-900">
                {staffAttendanceDateLabel || staffAttendanceDate}
              </p>
            </div>
            <input
              type="date"
              value={staffAttendanceDate}
              onChange={(event) => setStaffAttendanceDate(event.target.value)}
              className="rounded-2xl border border-blue-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm outline-none focus:border-blue-300"
            />
          </div>

          <div className="mt-6 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-600">
                Scan Attendance Count
              </p>
              <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600">
                QR Only
              </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-emerald-200/80 bg-emerald-100/75 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-900/80">
                  Present
                </p>
                <p className="mt-0.5 text-3xl font-semibold tracking-tight text-emerald-900">
                  {staffScanCounts.present}
                </p>
              </div>
              <div className="rounded-2xl border border-rose-200/80 bg-rose-100/75 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-rose-900/80">
                  Absent
                </p>
                <p className="mt-0.5 text-3xl font-semibold tracking-tight text-rose-900">
                  {staffScanCounts.absent}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white/90 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                  Not Marked
                </p>
                <p className="mt-0.5 text-3xl font-semibold tracking-tight text-slate-700">
                  {staffScanCounts.unmarked}
                </p>
              </div>
            </div>
          </div>

          {staffScanStatus ? (
            <p className="mt-3 text-xs font-medium text-slate-500">{staffScanStatus}</p>
          ) : null}
        </section>
      ) : null}

      {isStaff ? (
        <section className="rounded-[1.6rem] border border-ocean/25 bg-gradient-to-br from-white/90 via-slate-50/90 to-blue-100/75 p-5 shadow-[0_18px_34px_-28px_rgba(37,99,235,0.38)]">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-600">
                Upcoming Exams
              </p>
              <h3 className="text-3xl font-semibold tracking-tight text-slate-900">
                {staffExamItems.length} entries
              </h3>
            </div>
          </div>

          {staffExamsStatus ? (
            <p className="mb-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-600">
              {staffExamsStatus}
            </p>
          ) : null}

          {staffExamsLoading ? (
            <p className="text-sm text-slate-500">Loading exam schedule...</p>
          ) : staffExamItems.length === 0 ? (
            <p className="text-sm text-slate-500">No exams scheduled yet.</p>
          ) : (
            <div className="grid gap-3">
              {staffExamItems.map((exam) => {
                const label = String(exam.label || "").trim();
                const subject = String(exam.subject || "").trim();
                const headline =
                  label && subject ? `${label} - ${subject}` : label || subject || "Exam";
                return (
                  <article
                    key={exam.id || `${headline}-${exam.examDate}`}
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm"
                  >
                    <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-start">
                      <div>
                        <p className="font-semibold text-slate-900">{headline}</p>
                        {exam.examType ? (
                          <div className="mt-1">
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                              {exam.examType}
                            </span>
                          </div>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-3 md:flex-col md:items-end">
                        {exam.examDate ? (
                          <span className="rounded-full bg-slate-100 px-3 py-1.5 text-[11px] font-semibold text-slate-700">
                            Exam date: {formatExamDate(exam.examDate)}
                          </span>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => void handleRemoveStaffExam(exam.id)}
                          disabled={removingExamId === exam.id}
                          className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-700 hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-70"
                        >
                          {removingExamId === exam.id ? "Removing..." : "Remove"}
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      ) : null}

      {isStaff ? (
        <section className="rounded-[1.6rem] border border-ocean/25 bg-gradient-to-br from-white/90 via-slate-50/90 to-blue-100/75 p-5 shadow-[0_18px_34px_-28px_rgba(37,99,235,0.38)]">
          <div className="mb-4 flex items-center justify-between gap-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-600">
              Published Assignments
            </p>
          </div>

          {staffAssignmentsStatus ? (
            <p className="mb-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-600">
              {staffAssignmentsStatus}
            </p>
          ) : null}

          {staffAssignmentsLoading ? (
            <p className="text-sm text-slate-500">Loading assignments...</p>
          ) : staffAssignmentItems.length === 0 ? (
            <p className="text-sm text-slate-500">No assignments yet.</p>
          ) : (
            <div className="grid gap-3">
              {staffAssignmentItems.map((assignment) => {
                const dueMillis = parseAssignmentExpiry(assignment);
                const isClosed = Boolean(dueMillis && dueMillis <= Date.now());
                return (
                  <article
                    key={assignment.id}
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-slate-900">
                            {assignment.title || "Assignment"}
                          </p>
                          <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-700">
                            Assignment
                          </span>
                          {isClosed ? (
                            <span className="rounded-full border border-rose-200 bg-rose-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-rose-900">
                              Closed
                            </span>
                          ) : (
                            <span className="rounded-full border border-emerald-200 bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-900">
                              Open
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-sm text-slate-600">
                          Submit by {formatAssignmentDueLabel(assignment)}
                        </p>
                        {assignment?.attachment?.url ? (
                          <a
                            href={assignment.attachment.url}
                            target="_blank"
                            rel="noreferrer"
                            download={assignment?.attachment?.name || undefined}
                            className="mt-2 inline-flex items-center rounded-full border border-slate-300 bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700"
                          >
                            Open / Download file
                          </a>
                        ) : (
                          <p className="mt-2 text-xs text-slate-500">No file attached.</p>
                        )}
                      </div>

                      <div className="flex flex-col items-end gap-2">
                        <button
                          type="button"
                          onClick={() => navigate("/staff/menu/student-assignments")}
                          className="rounded-full border border-slate-300 bg-white px-3 py-1 text-[11px] font-semibold text-slate-700"
                        >
                          Student's Assignments
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleRemoveStaffAssignment(assignment.id)}
                          disabled={removingAssignmentId === assignment.id}
                          className="rounded-full border border-slate-300 bg-white px-3 py-1 text-[11px] font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-70"
                        >
                          {removingAssignmentId === assignment.id ? "Removing..." : "Remove"}
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      ) : null}

      {isStaff ? (
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_18px_34px_-28px_rgba(15,23,42,0.35)]">
          <div className="mb-4 flex items-center justify-between gap-3">
            <p className="text-lg font-semibold text-slate-900">Schedule Items</p>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600">
              {staffScheduleItems.length}
            </span>
          </div>

          {staffScheduleStatus ? (
            <p className="mb-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-600">
              {staffScheduleStatus}
            </p>
          ) : null}

          {staffScheduleLoading ? (
            <p className="text-sm text-slate-500">Loading today's schedule...</p>
          ) : staffScheduleItems.length === 0 ? (
            <p className="text-sm text-slate-500">No schedule yet.</p>
          ) : (
            <div className="space-y-3">
              {staffScheduleItems.map((item) => (
                <article
                  key={item.id}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
                        <span className="inline-flex min-w-[72px] items-center justify-center rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-sm font-semibold tracking-tight text-indigo-700">
                          {item.time || "--:--"}
                        </span>
                        <h3 className="min-w-0 flex-1 truncate text-base font-semibold text-slate-900">
                          {item.subjectName}
                        </h3>
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-2">
                      {item.period ? (
                        <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">
                          {item.period}
                        </span>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => void handleRemoveStaffSchedule(item.id)}
                        disabled={removingScheduleId === item.id}
                        className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:border-rose-300 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-70"
                      >
                        {removingScheduleId === item.id ? "Removing..." : "Remove"}
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {!isStaff ? (
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {statCards.map((item) => (
            <StatCard
              key={item.id}
              title={item.title}
              value={item.value}
              badgeText={item.badgeText}
              badgeTone={item.badgeTone}
              icon={item.icon}
              showCircularProgress={item.showCircularProgress}
              progressValue={item.progressValue}
              onClick={item.to ? () => navigate(item.to) : undefined}
            />
          ))}
        </section>
      ) : null}

      {!isStaff ? (
        <section className="grid gap-6 xl:grid-cols-[1.55fr_1fr]">
          <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_18px_34px_-28px_rgba(15,23,42,0.35)]">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Recent Activity
                </p>
                <h3 className="mt-1 text-lg font-semibold text-slate-900">
                  Latest operational events
                </h3>
              </div>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
                Live
              </span>
            </div>
            {activities.length === 0 ? (
              <p className="text-sm text-slate-500">No recent activity yet.</p>
            ) : (
              <div className="space-y-3">
                {activities.map((item) => (
                  <ActivityItem
                    key={item.id}
                    title={item.title}
                    subtitle={item.subtitle}
                    timeLabel={item.timeLabel}
                    status={item.status}
                  />
                ))}
              </div>
            )}
          </article>

          <aside className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_18px_34px_-28px_rgba(15,23,42,0.35)]">
            <div className="mb-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                Attendance
              </p>
              <h3 className="mt-1 text-lg font-semibold text-slate-900">
                Percentage Overview
              </h3>
            </div>

            <button
              type="button"
              onClick={openAttendanceModal}
              className="w-full rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 via-white to-indigo-50/50 p-4 transition hover:border-indigo-300 hover:shadow-md"
            >
              <div className="flex justify-center">
                <div className="relative h-36 w-36 shrink-0 rounded-full bg-white shadow-[0_20px_34px_-24px_rgba(59,130,246,0.75)]">
                  <svg
                    className="h-full w-full -rotate-90"
                    viewBox="0 0 160 160"
                    aria-hidden="true"
                  >
                    <defs>
                      <linearGradient
                        id="attendancePanelGradient"
                        x1="0%"
                        y1="0%"
                        x2="100%"
                        y2="100%"
                      >
                        <stop offset="0%" stopColor="rgb(14 165 233)" />
                        <stop offset="55%" stopColor="rgb(37 99 235)" />
                        <stop offset="100%" stopColor="rgb(79 70 229)" />
                      </linearGradient>
                    </defs>
                    <circle
                      cx="80"
                      cy="80"
                      r={panelProgressRadius}
                      fill="none"
                      stroke="rgb(224 231 255)"
                      strokeWidth="12"
                    />
                    <circle
                      cx="80"
                      cy="80"
                      r={panelProgressRadius}
                      fill="none"
                      stroke="url(#attendancePanelGradient)"
                      strokeWidth="12"
                      strokeLinecap="round"
                      strokeDasharray={panelProgressCircumference}
                      strokeDashoffset={panelProgressOffset}
                      className="transition-all duration-500 ease-out"
                    />
                  </svg>
                  <div className="absolute inset-0 grid place-items-center">
                    <p className="text-3xl font-bold text-slate-900">{panelAnimatedPercent}%</p>
                  </div>
                </div>
              </div>
            </button>

            <div className="mt-4 grid grid-cols-3 gap-2">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-2.5 text-center">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-700">
                  Present
                </p>
                <p className="mt-1 text-sm font-semibold text-emerald-800">
                  {attendancePresentCount}
                </p>
              </div>
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-2.5 text-center">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-rose-700">
                  Absent
                </p>
                <p className="mt-1 text-sm font-semibold text-rose-800">
                  {attendanceAbsentCount}
                </p>
              </div>
              <div className="rounded-xl border border-sky-200 bg-sky-50 p-2.5 text-center">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-700">
                  Total
                </p>
                <p className="mt-1 text-sm font-semibold text-sky-800">
                  {attendanceTotalCount}
                </p>
              </div>
            </div>
          </aside>
        </section>
      ) : null}

      {!isStaff && attendanceModalOpen ? (
        <div
          className="ui-modal ui-modal--compact"
          role="dialog"
          aria-modal="true"
          aria-label="Attendance percentage details"
        >
          <button
            type="button"
            aria-label="Close attendance modal"
            onClick={closeAttendanceModal}
            className="ui-modal__scrim"
            tabIndex={-1}
          />
          <div tabIndex={-1} className="ui-modal__panel w-full max-w-md p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink/70">
                  Attendance
                </p>
                <h3 className="mt-1 text-xl font-semibold text-ink">
                  Percentage Details
                </h3>
              </div>
              <button
                type="button"
                onClick={closeAttendanceModal}
                className="ui-modal__close"
              >
                Close
              </button>
            </div>

            <div className="mt-4 flex justify-center">
              <div className="relative h-40 w-40">
                <svg
                  className="h-full w-full -rotate-90"
                  viewBox="0 0 140 140"
                  aria-hidden="true"
                >
                  <circle
                    cx="70"
                    cy="70"
                    r={modalProgressRadius}
                    fill="none"
                    stroke="rgb(226 232 240)"
                    strokeWidth="10"
                  />
                  <circle
                    cx="70"
                    cy="70"
                    r={modalProgressRadius}
                    fill="none"
                    stroke="rgb(37 99 235)"
                    strokeWidth="10"
                    strokeLinecap="round"
                    strokeDasharray={modalProgressCircumference}
                    strokeDashoffset={modalProgressOffset}
                    className="transition-all duration-700 ease-out"
                  />
                </svg>
                <div className="absolute inset-0 grid place-items-center">
                  <p className="text-3xl font-bold text-slate-900">
                    {modalAnimatedPercent}%
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-2 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-700">
                  Present
                </p>
                <p className="mt-1 text-sm font-semibold text-emerald-800">
                  {attendancePresentCount}
                </p>
              </div>
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-2 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-rose-700">
                  Absent
                </p>
                <p className="mt-1 text-sm font-semibold text-rose-800">
                  {attendanceAbsentCount}
                </p>
              </div>
              <div className="rounded-xl border border-sky-200 bg-sky-50 px-2 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-700">
                  Total
                </p>
                <p className="mt-1 text-sm font-semibold text-sky-800">
                  {attendanceTotalCount}
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
