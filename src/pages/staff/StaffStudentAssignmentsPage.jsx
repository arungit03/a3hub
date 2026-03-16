import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import Card from "../../components/Card";
import GradientHeader from "../../components/GradientHeader";
import { db } from "../../lib/firebase";
import { useAuth } from "../../state/auth";

const getMillis = (value) => {
  if (!value) return 0;
  if (typeof value?.toMillis === "function") return value.toMillis();
  const parsed = new Date(value);
  const millis = parsed.getTime();
  return Number.isNaN(millis) ? 0 : millis;
};

const getAssignmentDueMillis = (assignment) => {
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

const formatDateTime = (value) => {
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

const formatAssignmentDueLabel = (assignment) => {
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

const normalizeAssignment = (docItem) => ({
  id: docItem.id,
  ...docItem.data(),
});

const normalizeStudent = (docItem) => {
  const data = docItem.data();
  const fallbackName = data?.email || "Student";
  return {
    id: docItem.id,
    name: data?.name || fallbackName,
    email: data?.email || "",
  };
};

const normalizeSubmission = (docItem) => ({
  id: docItem.id,
  ...docItem.data(),
});

export default function StaffStudentAssignmentsPage() {
  const navigate = useNavigate();
  const { role } = useAuth();
  const isStaff = role === "staff";

  const [assignments, setAssignments] = useState([]);
  const [loadingAssignments, setLoadingAssignments] = useState(true);
  const [assignmentsError, setAssignmentsError] = useState("");

  const [students, setStudents] = useState([]);
  const [loadingStudents, setLoadingStudents] = useState(true);
  const [studentsError, setStudentsError] = useState("");

  const [selectedAssignmentId, setSelectedAssignmentId] = useState("");

  const [submissions, setSubmissions] = useState([]);
  const [loadingSubmissions, setLoadingSubmissions] = useState(false);
  const [submissionsError, setSubmissionsError] = useState("");

  useEffect(() => {
    if (!isStaff) return undefined;

    const assignmentsQuery = query(
      collection(db, "assignments"),
      orderBy("createdAt", "desc"),
      limit(200)
    );

    const unsubscribe = onSnapshot(
      assignmentsQuery,
      (snapshot) => {
        const nextAssignments = snapshot.docs.map(normalizeAssignment);
        setAssignments(nextAssignments);
        setLoadingAssignments(false);
        setAssignmentsError("");
        setSelectedAssignmentId((previous) => {
          const nextSelectedId =
            previous && nextAssignments.some((item) => item.id === previous)
              ? previous
              : nextAssignments[0]?.id || "";
          if (nextSelectedId !== previous) {
            setSubmissions([]);
            setSubmissionsError("");
            setLoadingSubmissions(Boolean(nextSelectedId));
          }
          return nextSelectedId;
        });
        if (nextAssignments.length === 0) {
          setSubmissions([]);
          setLoadingSubmissions(false);
          setSubmissionsError("");
        }
      },
      () => {
        setAssignments([]);
        setLoadingAssignments(false);
        setAssignmentsError("Unable to load assignments.");
        setSelectedAssignmentId("");
        setSubmissions([]);
        setLoadingSubmissions(false);
        setSubmissionsError("");
      }
    );

    return () => unsubscribe();
  }, [isStaff]);

  useEffect(() => {
    if (!isStaff) return undefined;

    const studentsQuery = query(
      collection(db, "users"),
      where("role", "==", "student")
    );

    const unsubscribe = onSnapshot(
      studentsQuery,
      (snapshot) => {
        const nextStudents = snapshot.docs
          .map(normalizeStudent)
          .sort((a, b) => a.name.localeCompare(b.name));
        setStudents(nextStudents);
        setLoadingStudents(false);
        setStudentsError("");
      },
      () => {
        setStudents([]);
        setLoadingStudents(false);
        setStudentsError("Unable to load students.");
      }
    );

    return () => unsubscribe();
  }, [isStaff]);

  useEffect(() => {
    if (!isStaff || !selectedAssignmentId) return undefined;

    const submissionsQuery = query(
      collection(db, "assignmentSubmissions"),
      where("assignmentId", "==", selectedAssignmentId)
    );

    const unsubscribe = onSnapshot(
      submissionsQuery,
      (snapshot) => {
        const nextSubmissions = snapshot.docs.map(normalizeSubmission);
        nextSubmissions.sort((a, b) => {
          const aMillis = getMillis(a?.updatedAt || a?.submittedAt);
          const bMillis = getMillis(b?.updatedAt || b?.submittedAt);
          return bMillis - aMillis;
        });
        setSubmissions(nextSubmissions);
        setLoadingSubmissions(false);
        setSubmissionsError("");
      },
      () => {
        setSubmissions([]);
        setLoadingSubmissions(false);
        setSubmissionsError("Unable to load submissions.");
      }
    );

    return () => unsubscribe();
  }, [isStaff, selectedAssignmentId]);

  const studentsById = useMemo(() => {
    const map = new Map();
    students.forEach((student) => {
      map.set(student.id, student);
    });
    return map;
  }, [students]);

  const submittedByStudentId = useMemo(() => {
    const map = new Map();
    const visibleSubmissions = selectedAssignmentId ? submissions : [];
    visibleSubmissions.forEach((submission) => {
      const studentId = String(submission?.studentId || "").trim();
      if (!studentId) return;
      const previous = map.get(studentId);
      const previousMs = getMillis(previous?.updatedAt || previous?.submittedAt);
      const currentMs = getMillis(submission?.updatedAt || submission?.submittedAt);
      if (!previous || currentMs >= previousMs) {
        map.set(studentId, submission);
      }
    });
    return map;
  }, [selectedAssignmentId, submissions]);

  const submittedList = useMemo(
    () =>
      Array.from(submittedByStudentId.entries())
        .map(([studentId, submission]) => {
          const student = studentsById.get(studentId);
          return {
            id: studentId,
            name: student?.name || submission?.studentName || "Student",
            email: student?.email || submission?.studentEmail || "",
            submission,
          };
        })
        .sort((a, b) => {
          const aMillis = getMillis(a.submission?.updatedAt || a.submission?.submittedAt);
          const bMillis = getMillis(b.submission?.updatedAt || b.submission?.submittedAt);
          if (bMillis !== aMillis) return bMillis - aMillis;
          return a.name.localeCompare(b.name);
        }),
    [studentsById, submittedByStudentId]
  );

  const pendingStudents = useMemo(
    () =>
      students.filter((student) => !submittedByStudentId.has(student.id)),
    [students, submittedByStudentId]
  );

  const selectedAssignment = useMemo(
    () => assignments.find((item) => item.id === selectedAssignmentId) || null,
    [assignments, selectedAssignmentId]
  );

  if (!isStaff) {
    return (
      <Card>
        <p className="text-sm text-ink/80">Only staff can view this page.</p>
      </Card>
    );
  }

  return (
    <div className="grid gap-4">
      <GradientHeader
        title="Student's Assignments"
        subtitle="Submitted and pending assignment answers"
        rightSlot={(
          <button
            type="button"
            onClick={() => navigate("/staff/menu/assignments")}
            className="rounded-full border border-clay/35 bg-white/90 px-3 py-1 text-xs font-semibold text-ink/80"
          >
            Back
          </button>
        )}
      />

      <Card className="grid gap-3">
        <div className="grid gap-1.5">
          <label className="text-xs font-semibold uppercase tracking-[0.18em] text-ink/75">
            Assignment
          </label>
          <select
            value={selectedAssignmentId}
            onChange={(event) => {
              const nextAssignmentId = event.target.value;
              setSelectedAssignmentId(nextAssignmentId);
              setSubmissions([]);
              setSubmissionsError("");
              setLoadingSubmissions(Boolean(nextAssignmentId));
            }}
            disabled={loadingAssignments || assignments.length === 0}
            className="w-full rounded-xl border border-clay/20 bg-white px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-70"
          >
            {assignments.length === 0 ? (
              <option value="">
                {loadingAssignments ? "Loading assignments..." : "No assignments found"}
              </option>
            ) : null}
            {assignments.map((assignment) => (
              <option key={assignment.id} value={assignment.id}>
                {assignment.title || "Assignment"}
              </option>
            ))}
          </select>
        </div>

        {assignmentsError ? (
          <p className="text-xs font-semibold text-ink/80">{assignmentsError}</p>
        ) : null}

        {selectedAssignment ? (
          <div className="rounded-xl border border-clay/25 bg-white/90 px-3 py-3 text-xs text-ink/75">
            <p className="font-semibold text-ink">{selectedAssignment.title || "Assignment"}</p>
            <p className="mt-1">Submit by {formatAssignmentDueLabel(selectedAssignment)}</p>
            {selectedAssignment?.attachment?.url ? (
              <a
                href={selectedAssignment.attachment.url}
                target="_blank"
                rel="noreferrer"
                download={selectedAssignment?.attachment?.name || undefined}
                className="mt-2 inline-flex rounded-full border border-clay/35 bg-sand/70 px-2.5 py-1 text-[11px] font-semibold text-ink/80"
              >
                Open / Download question file
              </a>
            ) : null}
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="rounded-xl border border-emerald-200 bg-emerald-100/70 px-3 py-2">
            <p className="uppercase tracking-[0.12em] text-emerald-900/80">Submitted</p>
            <p className="mt-1 text-sm font-semibold text-emerald-900">
              {submittedList.length}/{students.length}
            </p>
          </div>
          <div className="rounded-xl border border-rose-200 bg-rose-100/70 px-3 py-2">
            <p className="uppercase tracking-[0.12em] text-rose-900/80">Not Submitted</p>
            <p className="mt-1 text-sm font-semibold text-rose-900">{pendingStudents.length}</p>
          </div>
        </div>

        {(loadingStudents || loadingSubmissions) && selectedAssignmentId ? (
          <p className="text-sm text-ink/75">Loading student submission status...</p>
        ) : null}
        {studentsError ? (
          <p className="text-sm text-ink/75">{studentsError}</p>
        ) : null}
        {submissionsError ? (
          <p className="text-sm text-ink/75">{submissionsError}</p>
        ) : null}
      </Card>

      <div className="grid gap-4">
        <Card className="grid gap-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink/70">
              Submitted List
            </p>
            <p className="text-xs text-ink/70">{submittedList.length} students</p>
          </div>

          {!selectedAssignmentId ? (
            <p className="text-sm text-ink/75">Choose an assignment to view submissions.</p>
          ) : submittedList.length === 0 ? (
            <p className="text-sm text-ink/75">No students submitted yet.</p>
          ) : (
            <div className="grid gap-2">
              {submittedList.map((item) => (
                <div
                  key={item.id}
                  className="rounded-xl border border-clay/20 bg-white px-3 py-2"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink">{item.name}</p>
                      <p className="text-[11px] text-ink/65">{item.email || "No email"}</p>
                      <p className="mt-1 text-[11px] text-ink/70">
                        Submitted:{" "}
                        {formatDateTime(
                          item.submission?.updatedAt || item.submission?.submittedAt
                        ) || "recently"}
                      </p>
                    </div>
                    {item.submission?.file?.url ? (
                      <a
                        href={item.submission.file.url}
                        target="_blank"
                        rel="noreferrer"
                        download={item?.submission?.file?.name || undefined}
                        className="shrink-0 rounded-full border border-clay/35 bg-sand/80 px-3 py-1 text-[11px] font-semibold text-ink/80"
                      >
                        Open / Download
                      </a>
                    ) : (
                      <span className="text-[11px] text-ink/65">No file</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="grid gap-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink/70">
              Not Submitted List
            </p>
            <p className="text-xs text-ink/70">{pendingStudents.length} students</p>
          </div>

          {!selectedAssignmentId ? (
            <p className="text-sm text-ink/75">Choose an assignment to view pending students.</p>
          ) : pendingStudents.length === 0 ? (
            <p className="text-sm text-ink/75">All students have submitted.</p>
          ) : (
            <div className="grid gap-2">
              {pendingStudents.map((student) => (
                <div
                  key={student.id}
                  className="rounded-xl border border-clay/20 bg-white px-3 py-2"
                >
                  <p className="text-sm font-semibold text-ink">{student.name}</p>
                  <p className="text-[11px] text-ink/65">{student.email || "No email"}</p>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
