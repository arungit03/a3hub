import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
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
import { useAuth } from "../../state/auth";

const getMillis = (value) => {
  if (!value) return 0;
  if (typeof value?.toMillis === "function") return value.toMillis();
  const parsed = new Date(value);
  const millis = parsed.getTime();
  return Number.isNaN(millis) ? 0 : millis;
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

const formatDate = (value) => {
  const safeDate = String(value || "").trim();
  if (!safeDate) return "";
  const parsed = new Date(`${safeDate}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return safeDate;
  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const normalizeReply = (docItem) => {
  const data = docItem.data();
  return {
    id: docItem.id,
    studentId: data?.studentId || "",
    studentName: data?.studentName || "Student",
    studentEmail: data?.studentEmail || "",
    date: data?.date || "",
    dateLabel: data?.dateLabel || "",
    reason: String(data?.reason || "").trim(),
    absentSessions: Array.isArray(data?.absentSessions)
      ? data.absentSessions.filter((session) => session && session.id)
      : [],
    submittedByRole: data?.submittedByRole || "student",
    submittedAt: data?.submittedAt || data?.updatedAt || data?.createdAt || null,
  };
};

export default function StaffParentRepliesPage() {
  const navigate = useNavigate();
  const { role } = useAuth();
  const isStaff = role === "staff";

  const [replies, setReplies] = useState([]);
  const [loadingReplies, setLoadingReplies] = useState(true);
  const [repliesError, setRepliesError] = useState("");

  useEffect(() => {
    if (!isStaff) return undefined;

    const repliesQuery = query(
      collection(db, "attendanceAbsenceReasons"),
      orderBy("updatedAt", "desc"),
      limit(200)
    );

    const unsubscribe = onSnapshot(
      repliesQuery,
      (snapshot) => {
        const nextReplies = snapshot.docs.map(normalizeReply);
        setReplies(nextReplies);
        setLoadingReplies(false);
        setRepliesError("");
      },
      () => {
        setReplies([]);
        setLoadingReplies(false);
        setRepliesError("Unable to load parent replies.");
      }
    );

    return () => unsubscribe();
  }, [isStaff]);

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
        title="Parent's Reply"
        subtitle="Your children's absent reason"
        rightSlot={(
          <button
            type="button"
            onClick={() => navigate("/staff/menu")}
            className="rounded-full border border-clay/35 bg-white/90 px-3 py-1 text-xs font-semibold text-ink/80"
          >
            Back
          </button>
        )}
      />

      <Card>
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink/75">
            Replies
          </p>
          <span className="rounded-full border border-clay/30 bg-white px-3 py-1 text-xs font-semibold text-ink/80">
            {replies.length}
          </span>
        </div>

        {loadingReplies ? (
          <p className="mt-4 text-sm text-ink/75">Loading parent replies...</p>
        ) : repliesError ? (
          <p className="mt-4 text-sm text-ink/75">{repliesError}</p>
        ) : replies.length === 0 ? (
          <p className="mt-4 text-sm text-ink/75">No absent reason replies yet.</p>
        ) : (
          <div className="mt-4 grid gap-3">
            {replies.map((entry) => {
              const roleLabel =
                entry.submittedByRole === "parent" ? "Parent" : "Student";
              const dateLabel = entry.dateLabel || formatDate(entry.date);
              const submittedAtLabel = formatDateTime(entry.submittedAt);

              return (
                <article
                  key={entry.id}
                  className="rounded-xl border border-clay/30 bg-white/95 p-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-ink">
                        {entry.studentName || "Student"}
                      </p>
                      <p className="text-xs text-ink/70">
                        {entry.studentEmail || "No email"}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {dateLabel ? (
                        <span className="rounded-full border border-clay/30 bg-cream px-2.5 py-1 text-[11px] font-semibold text-ink/80">
                          {dateLabel}
                        </span>
                      ) : null}
                      <span className="rounded-full border border-clay/30 bg-cream px-2.5 py-1 text-[11px] font-semibold text-ink/80">
                        {roleLabel}
                      </span>
                    </div>
                  </div>

                  {entry.absentSessions.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {entry.absentSessions.map((session) => {
                        const label = String(session?.label || "").trim();
                        const subject = String(session?.subject || "").trim();
                        const text = label && subject ? `${label} - ${subject}` : label || subject || "Absent";
                        return (
                          <span
                            key={`${entry.id}-${session.id}`}
                            className="rounded-full border border-rose-200 bg-rose-100 px-2.5 py-1 text-[11px] font-semibold text-rose-900"
                          >
                            {text}
                          </span>
                        );
                      })}
                    </div>
                  ) : null}

                  <p className="mt-3 rounded-lg border border-clay/25 bg-cream/70 px-3 py-2 text-sm text-ink/85">
                    {entry.reason || "No reason provided."}
                  </p>

                  {submittedAtLabel ? (
                    <p className="mt-2 text-[11px] text-ink/65">
                      Submitted: {submittedAtLabel}
                    </p>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
