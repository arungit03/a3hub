import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { collection, getCountFromServer, limit, query, where } from "firebase/firestore";
import AdminLineChart from "../components/AdminLineChart";
import AdminMetricCard from "../components/AdminMetricCard";
import { useRealtimeCollection } from "../hooks/useRealtimeCollection";
import { db } from "../../lib/firebase";
import {
  dateKeyFromInput,
  toDateKey,
  toPercent,
} from "../lib/format";

const normalizeLeaveStatus = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "take") return "approved";
  if (normalized === "notake") return "rejected";
  return normalized || "pending";
};

const extractAttendanceDateKey = (item) => {
  const data = item?.data || {};
  const directKey =
    data.dateKey ||
    data.date ||
    data.attendanceDate ||
    data.selectedDate ||
    data.requestDate;
  const normalizedDirect = dateKeyFromInput(directKey);
  if (normalizedDirect) return normalizedDirect;
  const idMatch = String(item?.id || "").match(/\d{4}-\d{2}-\d{2}/);
  return idMatch ? idMatch[0] : "";
};

const getAttendanceByDate = (attendanceDocs) => {
  const dailyMap = new Map();

  (attendanceDocs || []).forEach((item) => {
    const dateKey = extractAttendanceDateKey(item);
    if (!dateKey) return;
    const data = item.data || {};
    const dayStudents = dailyMap.get(dateKey) || new Map();

    const records = data?.records;
    if (records && typeof records === "object") {
      Object.values(records).forEach((periodRecord) => {
        if (!periodRecord || typeof periodRecord !== "object") return;
        Object.entries(periodRecord).forEach(([studentId, value]) => {
          if (!studentId) return;
          const studentState = dayStudents.get(studentId) || {
            present: false,
            absent: false,
          };
          if (value === true || value === "present") studentState.present = true;
          if (value === false || value === "absent") studentState.absent = true;
          dayStudents.set(studentId, studentState);
        });
      });
    }

    const dailyScans = data?.dailyQrScans;
    if (dailyScans && typeof dailyScans === "object") {
      Object.keys(dailyScans).forEach((studentId) => {
        if (!studentId) return;
        const studentState = dayStudents.get(studentId) || {
          present: false,
          absent: false,
        };
        studentState.present = true;
        dayStudents.set(studentId, studentState);
      });
    }

    dailyMap.set(dateKey, dayStudents);
  });

  return dailyMap;
};

const buildAttendanceTrend = (attendanceDocs) => {
  const dailyMap = getAttendanceByDate(attendanceDocs);
  const keys = [...dailyMap.keys()].sort().slice(-7);

  return keys.map((dateKey) => {
    const studentStates = [...(dailyMap.get(dateKey)?.values() || [])];
    const present = studentStates.filter((state) => state.present).length;
    const absent = studentStates.filter((state) => !state.present && state.absent).length;
    const total = present + absent;
    return {
      label: dateKey.slice(5),
      value: total > 0 ? (present / total) * 100 : 0,
    };
  });
};

const getTodayAttendancePercent = (attendanceDocs) => {
  const todayKey = toDateKey(new Date());
  const dailyMap = getAttendanceByDate(attendanceDocs);
  const studentStates = [...(dailyMap.get(todayKey)?.values() || [])];
  const present = studentStates.filter((state) => state.present).length;
  const absent = studentStates.filter((state) => !state.present && state.absent).length;
  const total = present + absent;
  return total > 0 ? (present / total) * 100 : 0;
};

const buildMarksTrend = (marksDocs) => {
  const grouped = new Map();

  (marksDocs || []).forEach((item) => {
    const data = item.data || {};
    const dateKey = toDateKey(data.updatedAt || data.createdAt);
    if (!dateKey) return;
    const percentage = Number(data.percentage);
    if (!Number.isFinite(percentage)) return;
    const current = grouped.get(dateKey) || { sum: 0, count: 0 };
    current.sum += percentage;
    current.count += 1;
    grouped.set(dateKey, current);
  });

  return [...grouped.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-7)
    .map(([key, value]) => ({
      label: key.slice(5),
      value: value.count > 0 ? value.sum / value.count : 0,
    }));
};

export default function AdminDashboardPage() {
  const testsQuery = useMemo(() => query(collection(db, "tests"), limit(500)), []);
  const leavesQuery = useMemo(
    () => query(collection(db, "leaveRequests"), limit(500)),
    []
  );
  const attendanceQuery = useMemo(
    () => query(collection(db, "attendance"), limit(500)),
    []
  );
  const marksQuery = useMemo(
    () => query(collection(db, "internalMarks"), limit(1000)),
    []
  );
  const [userCounts, setUserCounts] = useState({
    activeUsers: 0,
    totalParents: 0,
    totalStaff: 0,
    totalStudents: 0,
  });
  const [loadingUserCounts, setLoadingUserCounts] = useState(true);
  const [userCountsError, setUserCountsError] = useState("");

  const testsState = useRealtimeCollection(testsQuery, {
    map: (docItem) => ({ id: docItem.id, data: docItem.data() || {} }),
    onErrorMessage: "Unable to load tests.",
  });
  const leavesState = useRealtimeCollection(leavesQuery, {
    map: (docItem) => ({ id: docItem.id, data: docItem.data() || {} }),
    onErrorMessage: "Unable to load leave requests.",
  });
  const attendanceState = useRealtimeCollection(attendanceQuery, {
    map: (docItem) => ({ id: docItem.id, data: docItem.data() || {} }),
    onErrorMessage: "Unable to load attendance.",
  });
  const marksState = useRealtimeCollection(marksQuery, {
    map: (docItem) => ({ id: docItem.id, data: docItem.data() || {} }),
    onErrorMessage: "Unable to load marks.",
  });

  useEffect(() => {
    let cancelled = false;

    const loadUserCounts = async ({ background = false } = {}) => {
      if (!background) {
        setLoadingUserCounts(true);
      }
      setUserCountsError("");

      try {
        const [
          totalUsersSnapshot,
          totalStudentsSnapshot,
          totalStaffSnapshot,
          totalParentsSnapshot,
          blockedUsersSnapshot,
          pendingUsersSnapshot,
        ] = await Promise.all([
          getCountFromServer(collection(db, "users")),
          getCountFromServer(
            query(collection(db, "users"), where("role", "==", "student"))
          ),
          getCountFromServer(
            query(collection(db, "users"), where("role", "==", "staff"))
          ),
          getCountFromServer(
            query(collection(db, "users"), where("role", "==", "parent"))
          ),
          getCountFromServer(
            query(collection(db, "users"), where("status", "==", "blocked"))
          ),
          getCountFromServer(
            query(
              collection(db, "users"),
              where("status", "in", ["pending", "pending_approval"])
            )
          ),
        ]);

        if (cancelled) return;

        const totalUsers = totalUsersSnapshot.data().count;
        const blockedUsers = blockedUsersSnapshot.data().count;
        const pendingUsers = pendingUsersSnapshot.data().count;

        setUserCounts({
          activeUsers: Math.max(0, totalUsers - blockedUsers - pendingUsers),
          totalParents: totalParentsSnapshot.data().count,
          totalStaff: totalStaffSnapshot.data().count,
          totalStudents: totalStudentsSnapshot.data().count,
        });
        setLoadingUserCounts(false);
        setUserCountsError("");
      } catch {
        if (cancelled) return;
        setLoadingUserCounts(false);
        setUserCountsError("Unable to load user counts.");
      }
    };

    loadUserCounts();
    const refreshTimer = setInterval(() => {
      loadUserCounts({ background: true });
    }, 60 * 1000);

    return () => {
      cancelled = true;
      clearInterval(refreshTimer);
    };
  }, []);

  const summary = useMemo(() => {
    const pendingLeaveRequests = (leavesState.data || []).filter(
      (item) => normalizeLeaveStatus(item.data?.status) === "pending"
    ).length;

    const activeTests = (testsState.data || []).filter(
      (item) => !item.data?.isDisabled
    ).length;

    const todayAttendancePercent = toPercent(
      getTodayAttendancePercent(attendanceState.data || []),
      0
    );

    return {
      ...userCounts,
      pendingLeaveRequests,
      activeTests,
      todayAttendancePercent,
    };
  }, [attendanceState.data, leavesState.data, testsState.data, userCounts]);

  const attendanceTrend = useMemo(
    () => buildAttendanceTrend(attendanceState.data || []),
    [attendanceState.data]
  );
  const marksTrend = useMemo(
    () => buildMarksTrend(marksState.data || []),
    [marksState.data]
  );

  const isLoading =
    loadingUserCounts ||
    testsState.loading ||
    leavesState.loading ||
    attendanceState.loading ||
    marksState.loading;

  const errors = [
    userCountsError,
    testsState.error,
    leavesState.error,
    attendanceState.error,
    marksState.error,
  ].filter(Boolean);

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
          Admin Dashboard
        </p>
        <h2 className="text-2xl font-bold text-slate-900">System Overview</h2>
      </header>

      {isLoading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
          Loading dashboard metrics...
        </div>
      ) : null}

      {errors.length > 0 ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {errors[0]}
        </div>
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Event Module
            </p>
            <h3 className="mt-1 text-xl font-semibold text-slate-900">
              Open the event console for campus registrations
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              Create event posters, accept student forms, and let staff review who submitted.
            </p>
          </div>
          <Link
            to="/admin/events"
            className="inline-flex items-center justify-center rounded-full bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            Enter Event Console
          </Link>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <AdminMetricCard title="Total Students" value={summary.totalStudents} />
        <AdminMetricCard title="Total Staff" value={summary.totalStaff} />
        <AdminMetricCard title="Total Parents" value={summary.totalParents} />
        <AdminMetricCard title="Active Users" value={summary.activeUsers} tone="good" />
        <AdminMetricCard
          title="Pending Leave Requests"
          value={summary.pendingLeaveRequests}
          tone={summary.pendingLeaveRequests > 0 ? "warn" : "default"}
        />
        <AdminMetricCard title="Active Tests" value={summary.activeTests} />
        <AdminMetricCard
          title="Today Attendance %"
          value={`${summary.todayAttendancePercent}%`}
          tone={summary.todayAttendancePercent >= 75 ? "good" : "warn"}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <AdminLineChart
          title="Attendance Trend"
          subtitle="Last 7 attendance dates"
          points={attendanceTrend}
        />
        <AdminLineChart
          title="Marks Average Trend"
          subtitle="Average marks % by update date"
          points={marksTrend}
        />
      </section>
    </div>
  );
}
