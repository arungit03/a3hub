import { useEffect, useState } from "react";
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";
import Card from "../../components/Card";
import GradientHeader from "../../components/GradientHeader";
import { db } from "../../lib/firebase";

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

const isAssignmentClosed = (assignment) => {
  const dueMillis = getAssignmentDueMillis(assignment);
  return Boolean(dueMillis && dueMillis <= Date.now());
};

export default function ParentAssignmentsPage() {
  const [assignments, setAssignments] = useState([]);
  const [loadingAssignments, setLoadingAssignments] = useState(true);
  const [assignmentsError, setAssignmentsError] = useState("");

  useEffect(() => {
    const assignmentsQuery = query(
      collection(db, "assignments"),
      orderBy("createdAt", "desc"),
      limit(80)
    );

    const unsubscribe = onSnapshot(
      assignmentsQuery,
      (snapshot) => {
        setAssignments(
          snapshot.docs.map((item) => ({
            id: item.id,
            ...item.data(),
          }))
        );
        setLoadingAssignments(false);
        setAssignmentsError("");
      },
      () => {
        setAssignments([]);
        setLoadingAssignments(false);
        setAssignmentsError("Unable to load assignments.");
      }
    );

    return () => unsubscribe();
  }, []);

  return (
    <>
      <GradientHeader
        title="Assignments"
        subtitle="View published assignments and due dates."
        rightSlot={
          <span className="rounded-full border border-clay/30 bg-white px-3 py-1 text-xs font-semibold text-black">
            Parent
          </span>
        }
      />

      <section className="grid gap-4">
        <Card>
          <div className="flex items-center justify-between">
            <p className="text-sm uppercase tracking-[0.18em] text-ink/80">
              Available Assignments
            </p>
            <span className="rounded-full border border-clay/35 bg-white px-2.5 py-1 text-[11px] font-semibold text-ink/75">
              {assignments.length}
            </span>
          </div>

          {loadingAssignments ? (
            <p className="mt-4 text-sm text-ink/75">Loading assignments...</p>
          ) : assignmentsError ? (
            <p className="mt-4 text-sm font-semibold text-ink/80">{assignmentsError}</p>
          ) : assignments.length === 0 ? (
            <p className="mt-4 text-sm text-ink/75">No assignments yet.</p>
          ) : (
            <div className="mt-4 grid gap-3">
              {assignments.map((assignment) => {
                const closed = isAssignmentClosed(assignment);
                return (
                  <article
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
                            Assignment
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
                          <p className="mt-1 whitespace-pre-wrap text-xs text-ink/80">
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
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </Card>
      </section>
    </>
  );
}
