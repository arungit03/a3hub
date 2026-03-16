import { useMemo, useState } from "react";
import {
  collection,
  doc,
  limit,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { useRealtimeCollection } from "../hooks/useRealtimeCollection";
import { db } from "../../lib/firebase";
import { useAuth } from "../../state/auth";
import { AUDIT_ACTIONS, logAuditEvent } from "../lib/auditLogs";
import { normalizeRole, toMillis, toPercent } from "../lib/format";

const PASS_MARK = 40;
const AT_RISK_ATTENDANCE = 75;
const AT_RISK_MARKS = 50;

const toSafeText = (value) => String(value || "").trim();

const buildAttendanceByStudent = (attendanceDocs) => {
  const index = new Map();

  (attendanceDocs || []).forEach((item) => {
    const records = item.records && typeof item.records === "object" ? item.records : {};
    Object.values(records).forEach((periodRecord) => {
      if (!periodRecord || typeof periodRecord !== "object") return;
      Object.entries(periodRecord).forEach(([studentId, value]) => {
        if (!studentId) return;
        if (value !== true && value !== false && value !== "present" && value !== "absent") {
          return;
        }
        const entry = index.get(studentId) || { present: 0, total: 0 };
        const isPresent = value === true || value === "present";
        entry.total += 1;
        if (isPresent) entry.present += 1;
        index.set(studentId, entry);
      });
    });
  });

  return index;
};

const buildMarksStats = (marksDocs) => {
  const byStudent = new Map();
  const bySubject = new Map();

  (marksDocs || []).forEach((record) => {
    const studentId = toSafeText(record.studentId);
    const percentage = Number(record.percentage);
    if (studentId && Number.isFinite(percentage)) {
      const entry = byStudent.get(studentId) || { sum: 0, count: 0 };
      entry.sum += percentage;
      entry.count += 1;
      byStudent.set(studentId, entry);
    }

    const subjects = Array.isArray(record.subjects) ? record.subjects : [];
    subjects.forEach((subject) => {
      const subjectName = toSafeText(subject?.subject || "Unknown");
      const mark = Number(subject?.mark);
      if (!subjectName || !Number.isFinite(mark)) return;
      const entry = bySubject.get(subjectName) || { pass: 0, total: 0 };
      entry.total += 1;
      if (mark >= PASS_MARK) entry.pass += 1;
      bySubject.set(subjectName, entry);
    });
  });

  return { byStudent, bySubject };
};

export default function AdminAnalyticsPage() {
  const { user, profile } = useAuth();
  const [statusMessage, setStatusMessage] = useState("");
  const [busyRecordId, setBusyRecordId] = useState("");
  const [editPercentByRecordId, setEditPercentByRecordId] = useState({});

  const usersQuery = useMemo(() => query(collection(db, "users"), limit(2000)), []);
  const attendanceQuery = useMemo(
    () => query(collection(db, "attendance"), limit(1000)),
    []
  );
  const marksQuery = useMemo(
    () => query(collection(db, "internalMarks"), limit(3000)),
    []
  );

  const usersState = useRealtimeCollection(usersQuery, {
    map: (docItem) => ({ id: docItem.id, ...docItem.data() }),
    onErrorMessage: "Unable to load users.",
  });
  const attendanceState = useRealtimeCollection(attendanceQuery, {
    map: (docItem) => ({ id: docItem.id, ...docItem.data() }),
    onErrorMessage: "Unable to load attendance.",
  });
  const marksState = useRealtimeCollection(marksQuery, {
    map: (docItem) => ({ id: docItem.id, ...docItem.data() }),
    onErrorMessage: "Unable to load marks.",
  });

  const performedBy = useMemo(
    () => ({
      uid: user?.uid || "",
      name: profile?.name || user?.displayName || user?.email || "Admin",
      email: user?.email || "",
      role: profile?.role || "admin",
    }),
    [profile?.name, profile?.role, user?.displayName, user?.email, user?.uid]
  );

  const userById = useMemo(() => {
    const index = new Map();
    (usersState.data || []).forEach((item) => index.set(item.id, item));
    return index;
  }, [usersState.data]);

  const studentUsers = useMemo(
    () =>
      (usersState.data || [])
        .filter((item) => normalizeRole(item.role) === "student")
        .sort((a, b) =>
          toSafeText(a.name || a.email).localeCompare(toSafeText(b.name || b.email))
        ),
    [usersState.data]
  );

  const attendanceByStudent = useMemo(
    () => buildAttendanceByStudent(attendanceState.data || []),
    [attendanceState.data]
  );

  const marksStats = useMemo(
    () => buildMarksStats(marksState.data || []),
    [marksState.data]
  );

  const attendancePerDepartment = useMemo(() => {
    const index = new Map();
    attendanceByStudent.forEach((attendance, studentId) => {
      const userItem = userById.get(studentId);
      if (!userItem || normalizeRole(userItem.role) !== "student") return;
      const department =
        toSafeText(userItem.departmentKey || userItem.department).toUpperCase() || "UNKNOWN";
      const entry = index.get(department) || { present: 0, total: 0 };
      entry.present += attendance.present;
      entry.total += attendance.total;
      index.set(department, entry);
    });

    return [...index.entries()]
      .map(([department, value]) => ({
        department,
        attendancePercent: value.total > 0 ? (value.present / value.total) * 100 : 0,
      }))
      .sort((a, b) => b.attendancePercent - a.attendancePercent);
  }, [attendanceByStudent, userById]);

  const passPercentageBySubject = useMemo(
    () =>
      [...marksStats.bySubject.entries()]
        .map(([subject, value]) => ({
          subject,
          passPercent: value.total > 0 ? (value.pass / value.total) * 100 : 0,
          total: value.total,
        }))
        .sort((a, b) => b.passPercent - a.passPercent),
    [marksStats.bySubject]
  );

  const topStudents = useMemo(
    () =>
      [...marksStats.byStudent.entries()]
        .map(([studentId, value]) => ({
          studentId,
          averageMarks: value.count > 0 ? value.sum / value.count : 0,
          user: userById.get(studentId),
        }))
        .filter((item) => item.user)
        .sort((a, b) => b.averageMarks - a.averageMarks)
        .slice(0, 10),
    [marksStats.byStudent, userById]
  );

  const atRiskStudents = useMemo(() => {
    return studentUsers
      .map((student) => {
        const marksEntry = marksStats.byStudent.get(student.id);
        const attendanceEntry = attendanceByStudent.get(student.id);
        const marksPercent =
          marksEntry && marksEntry.count > 0 ? marksEntry.sum / marksEntry.count : null;
        const attendancePercent =
          attendanceEntry && attendanceEntry.total > 0
            ? (attendanceEntry.present / attendanceEntry.total) * 100
            : null;

        const lowMarks = marksPercent !== null && marksPercent < AT_RISK_MARKS;
        const lowAttendance =
          attendancePercent !== null && attendancePercent < AT_RISK_ATTENDANCE;

        let reason = "";
        if (lowMarks && lowAttendance) reason = "Low marks and low attendance";
        else if (lowMarks) reason = "Low marks";
        else if (lowAttendance) reason = "Low attendance";

        return {
          student,
          marksPercent,
          attendancePercent,
          reason,
          atRisk: Boolean(reason),
        };
      })
      .filter((item) => item.atRisk)
      .sort((a, b) => {
        const aMarks = a.marksPercent ?? 100;
        const bMarks = b.marksPercent ?? 100;
        return aMarks - bMarks;
      })
      .slice(0, 20);
  }, [attendanceByStudent, marksStats.byStudent, studentUsers]);

  const marksRecordsForAdjustment = useMemo(
    () =>
      (marksState.data || [])
        .slice()
        .sort((a, b) => {
          const aTime = toMillis(a.updatedAt || a.createdAt);
          const bTime = toMillis(b.updatedAt || b.createdAt);
          return bTime - aTime;
        })
        .slice(0, 25),
    [marksState.data]
  );

  const handleUpdateMarksPercentage = async (record) => {
    if (!record?.id || busyRecordId) return;
    const draftedValue =
      editPercentByRecordId[record.id] !== undefined
        ? editPercentByRecordId[record.id]
        : record.percentage;
    const nextPercentage = Number(draftedValue);
    if (!Number.isFinite(nextPercentage) || nextPercentage < 0 || nextPercentage > 100) {
      setStatusMessage("Marks percentage must be between 0 and 100.");
      return;
    }

    const totalMaxMarks =
      Number(record.totalMaxMarks) > 0
        ? Number(record.totalMaxMarks)
        : Array.isArray(record.subjects)
        ? record.subjects.length * 100
        : 100;
    const nextTotalMarks = Number(
      ((nextPercentage / 100) * totalMaxMarks).toFixed(2)
    );

    setBusyRecordId(record.id);
    setStatusMessage("");
    try {
      await updateDoc(doc(db, "internalMarks", record.id), {
        percentage: nextPercentage,
        totalMarks: nextTotalMarks,
        updatedAt: serverTimestamp(),
        updatedBy: user?.uid || null,
      });

      await logAuditEvent({
        db,
        action: AUDIT_ACTIONS.MARKS_UPDATED,
        module: "analytics",
        targetId: record.id,
        performedBy,
        metadata: {
          studentId: record.studentId || "",
          previousPercentage: record.percentage,
          nextPercentage,
        },
      }).catch(() => {});

      setStatusMessage("Marks percentage updated.");
    } catch {
      setStatusMessage("Unable to update marks record.");
    } finally {
      setBusyRecordId("");
    }
  };

  const isLoading = usersState.loading || attendanceState.loading || marksState.loading;
  const error = usersState.error || attendanceState.error || marksState.error;

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
          Analytics
        </p>
        <h2 className="text-2xl font-bold text-slate-900">Performance and Risk Insights</h2>
      </header>

      {isLoading ? (
        <p className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
          Loading analytics...
        </p>
      ) : null}
      {error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-2">
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900">
            Attendance % per Department
          </h3>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-[0.12em] text-slate-500">
                  <th className="px-2 py-2">Department</th>
                  <th className="px-2 py-2">Attendance %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {attendancePerDepartment.map((item) => (
                  <tr key={item.department}>
                    <td className="px-2 py-2 font-semibold text-slate-900">
                      {item.department}
                    </td>
                    <td className="px-2 py-2 text-slate-700">
                      {toPercent(item.attendancePercent)}%
                    </td>
                  </tr>
                ))}
                {attendancePerDepartment.length === 0 ? (
                  <tr>
                    <td className="px-2 py-3 text-slate-500" colSpan={2}>
                      No attendance aggregates available.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900">
            Pass Percentage per Subject
          </h3>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-[0.12em] text-slate-500">
                  <th className="px-2 py-2">Subject</th>
                  <th className="px-2 py-2">Pass %</th>
                  <th className="px-2 py-2">Records</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {passPercentageBySubject.map((item) => (
                  <tr key={item.subject}>
                    <td className="px-2 py-2 font-semibold text-slate-900">
                      {item.subject}
                    </td>
                    <td className="px-2 py-2 text-slate-700">
                      {toPercent(item.passPercent)}%
                    </td>
                    <td className="px-2 py-2 text-slate-700">{item.total}</td>
                  </tr>
                ))}
                {passPercentageBySubject.length === 0 ? (
                  <tr>
                    <td className="px-2 py-3 text-slate-500" colSpan={3}>
                      No marks records available.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </article>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900">Top Performing Students</h3>
          <ol className="mt-3 space-y-2">
            {topStudents.map((item, index) => (
              <li
                key={item.studentId}
                className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
              >
                <span className="font-semibold text-slate-900">
                  {index + 1}. {item.user?.name || item.user?.email || "Student"}
                </span>
                <span className="text-slate-700">{toPercent(item.averageMarks)}%</span>
              </li>
            ))}
            {topStudents.length === 0 ? (
              <li className="text-sm text-slate-500">No top performers yet.</li>
            ) : null}
          </ol>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900">At-Risk Students</h3>
          <div className="mt-3 space-y-2">
            {atRiskStudents.map((item) => (
              <div
                key={item.student.id}
                className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm"
              >
                <p className="font-semibold text-slate-900">
                  {item.student.name || item.student.email}
                </p>
                <p className="text-xs text-slate-700">
                  Marks:{" "}
                  {item.marksPercent !== null ? `${toPercent(item.marksPercent)}%` : "N/A"} |
                  Attendance:{" "}
                  {item.attendancePercent !== null
                    ? `${toPercent(item.attendancePercent)}%`
                    : "N/A"}
                </p>
                <p className="text-xs font-semibold text-amber-700">{item.reason}</p>
              </div>
            ))}
            {atRiskStudents.length === 0 ? (
              <p className="text-sm text-slate-500">No at-risk students detected.</p>
            ) : null}
          </div>
        </article>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-900">Marks Update (Audit Logged)</h3>
        <p className="text-xs text-slate-500">
          Editing percentage here updates `internalMarks` and creates an audit log.
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-[0.12em] text-slate-500">
                <th className="px-2 py-2">Student</th>
                <th className="px-2 py-2">Exam</th>
                <th className="px-2 py-2">Percentage</th>
                <th className="px-2 py-2">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {marksRecordsForAdjustment.map((record) => {
                const draftedValue =
                  editPercentByRecordId[record.id] !== undefined
                    ? editPercentByRecordId[record.id]
                    : record.percentage ?? 0;
                return (
                  <tr key={record.id}>
                    <td className="px-2 py-2 font-semibold text-slate-900">
                      {record.studentName || record.studentEmail || record.studentId || "-"}
                    </td>
                    <td className="px-2 py-2 text-slate-700">
                      {record.examName || "Exam"}
                    </td>
                    <td className="px-2 py-2">
                      <input
                        className="w-24 rounded-lg border border-slate-200 px-2 py-1 text-sm"
                        type="number"
                        min="0"
                        max="100"
                        value={draftedValue}
                        onChange={(event) =>
                          setEditPercentByRecordId((prev) => ({
                            ...prev,
                            [record.id]: event.target.value,
                          }))
                        }
                      />
                    </td>
                    <td className="px-2 py-2">
                      <button
                        type="button"
                        disabled={busyRecordId === record.id}
                        onClick={() => handleUpdateMarksPercentage(record)}
                        className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                      >
                        Save
                      </button>
                    </td>
                  </tr>
                );
              })}
              {marksRecordsForAdjustment.length === 0 ? (
                <tr>
                  <td className="px-2 py-3 text-slate-500" colSpan={4}>
                    No marks records available.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {statusMessage ? (
        <p className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
          {statusMessage}
        </p>
      ) : null}
    </div>
  );
}
