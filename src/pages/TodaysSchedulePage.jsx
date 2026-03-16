import { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { resolveScheduleEntryDateKey, toDateKey } from "../lib/scheduleDate";
import { useAuth } from "../state/auth";

const formatDisplayDate = (dateKey) => {
  if (!dateKey) return "";
  const parsed = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
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

const EMPTY_FORM = Object.freeze({
  time: "",
  period: "",
  subjectName: "",
});

export default function TodaysSchedulePage({ forcedRole }) {
  const { role: contextRole, user, profile } = useAuth();
  const role = forcedRole || contextRole || "student";
  const isStaff = role === "staff";

  const todayKey = useMemo(() => toDateKey(new Date()), []);
  const todayLabel = useMemo(() => formatDisplayDate(todayKey), [todayKey]);

  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [creating, setCreating] = useState(false);
  const [removingId, setRemovingId] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);

  useEffect(() => {
    if (!user?.uid) {
      setEntries([]);
      setLoading(false);
      return undefined;
    }

    setLoading(true);
    const scheduleQuery = query(
      collection(db, "todaysSchedules"),
      orderBy("createdAt", "desc"),
      limit(240)
    );

    const unsubscribe = onSnapshot(
      scheduleQuery,
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
              createdByName: String(data.createdByName || ""),
            };
          })
          .filter((item) => item.entryDateKey === todayKey)
          .sort((a, b) => {
            const timeDiff = parseTimeToMinutes(a.time) - parseTimeToMinutes(b.time);
            if (timeDiff !== 0) return timeDiff;
            const aMillis = a.createdAt?.toMillis?.() || 0;
            const bMillis = b.createdAt?.toMillis?.() || 0;
            return aMillis - bMillis;
          });

        setEntries(next);
        setLoading(false);
      },
      () => {
        setEntries([]);
        setLoading(false);
        setStatus("Unable to load today's schedule.");
      }
    );

    return () => unsubscribe();
  }, [todayKey, user?.uid]);

  const handleFormChange = (field, value) => {
    setForm((prev) => ({
      ...prev,
      [field]: value,
    }));
    setStatus("");
  };

  const handleCreate = async (event) => {
    event.preventDefault();
    if (!isStaff || creating) return;

    const safePeriod = String(form.period || "").trim();
    const safeSubjectName = String(form.subjectName || "").trim();
    const safeTime = String(form.time || "").trim();
    if (!safePeriod || !safeSubjectName || !safeTime) {
      setStatus("Which period, subject name, and time are required.");
      return;
    }

    setCreating(true);
    setStatus("");
    try {
      await addDoc(collection(db, "todaysSchedules"), {
        dateKey: todayKey,
        date: todayKey,
        time: safeTime,
        period: safePeriod,
        subjectName: safeSubjectName,
        createdAt: serverTimestamp(),
        createdBy: user?.uid || "",
        createdByName: String(
          profile?.name || user?.displayName || user?.email || "Staff"
        ).trim(),
      });
      setForm(EMPTY_FORM);
      setStatus("Today's schedule item added.");
    } catch {
      setStatus("Unable to add schedule item.");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (scheduleId) => {
    if (!isStaff || !scheduleId || removingId) return;
    setRemovingId(scheduleId);
    setStatus("");
    try {
      await deleteDoc(doc(db, "todaysSchedules", scheduleId));
      setStatus("Schedule item removed.");
    } catch {
      setStatus("Unable to remove schedule item.");
    } finally {
      setRemovingId("");
    }
  };

  return (
    <section className="space-y-5">
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_18px_34px_-28px_rgba(15,23,42,0.35)]">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
          Today's Schedule
        </p>
        <h2 className="mt-1 text-xl font-semibold text-slate-900">{todayLabel || "Today"}</h2>
        <p className="mt-1 text-sm text-slate-500">
          {isStaff
            ? "Add and manage today's classes, labs, and events."
            : "View today's classes, labs, and campus schedule."}
        </p>
      </div>

      {isStaff ? (
        <form
          onSubmit={handleCreate}
          className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_18px_34px_-28px_rgba(15,23,42,0.35)]"
        >
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            Add Item
          </p>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <input
              type="text"
              value={form.period}
              onChange={(event) => handleFormChange("period", event.target.value)}
              placeholder="Which period"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-300 focus:bg-white focus:outline-none"
            />
            <input
              type="text"
              value={form.subjectName}
              onChange={(event) => handleFormChange("subjectName", event.target.value)}
              placeholder="Subject Name"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-300 focus:bg-white focus:outline-none"
            />
            <input
              type="time"
              value={form.time}
              onChange={(event) => handleFormChange("time", event.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-300 focus:bg-white focus:outline-none"
            />
          </div>
          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="text-xs font-medium text-slate-500">{status}</p>
            <button
              type="submit"
              disabled={creating}
              className="rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {creating ? "Adding..." : "Add Schedule"}
            </button>
          </div>
        </form>
      ) : status ? (
        <p className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
          {status}
        </p>
      ) : null}

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_18px_34px_-28px_rgba(15,23,42,0.35)]">
        <div className="mb-4 flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-slate-900">Schedule Items</p>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600">
            {entries.length}
          </span>
        </div>

        {loading ? (
          <p className="text-sm text-slate-500">Loading today's schedule...</p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-slate-500">No schedule items for today.</p>
        ) : (
          <div className="space-y-3">
            {entries.map((item) => (
              <article
                key={item.id}
                className="group rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
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
                      {item.period ? (
                        <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">
                          {item.period}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  {isStaff ? (
                    <button
                      type="button"
                      onClick={() => handleDelete(item.id)}
                      disabled={removingId === item.id}
                      className="self-end rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 transition duration-200 hover:border-rose-300 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-70 sm:self-auto"
                    >
                      {removingId === item.id ? "Removing..." : "Remove"}
                    </button>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}
