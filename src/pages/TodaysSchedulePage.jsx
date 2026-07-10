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
} from "../lib/supabaseData";
import { db } from "../lib/supabase";
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
      const docRef = await addDoc(collection(db, "todaysSchedules"), {
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
      
      // Optimistically update UI
      const newEntry = {
        id: docRef.id,
        entryDateKey: todayKey,
        time: safeTime,
        period: safePeriod,
        subjectName: safeSubjectName,
        createdAt: { toMillis: () => Date.now() },
        createdByName: String(
          profile?.name || user?.displayName || user?.email || "Staff"
        ).trim(),
      };
      setEntries((prev) => {
        const updated = [...prev, newEntry];
        return updated.sort((a, b) => {
          const timeDiff = parseTimeToMinutes(a.time) - parseTimeToMinutes(b.time);
          if (timeDiff !== 0) return timeDiff;
          const aMillis = a.createdAt?.toMillis?.() || 0;
          const bMillis = b.createdAt?.toMillis?.() || 0;
          return aMillis - bMillis;
        });
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

  const isErrorStatus = status.startsWith("Unable") || status.includes("are required");

  return (
    <section className="space-y-5">
      <div className="relative overflow-hidden rounded-3xl border border-clay/50 bg-cream p-5 shadow-[0_18px_34px_-28px_rgb(var(--cocoa)/0.35)] sm:p-6">
        <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-ocean/10 blur-2xl" />
        <div className="relative flex items-center gap-4">
          <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-linear-to-br from-cocoa to-ocean text-white shadow-[0_10px_22px_-10px_rgb(var(--ocean)/0.6)]">
            <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" aria-hidden="true">
              <rect x="3.5" y="5" width="17" height="15.5" rx="3" stroke="currentColor" strokeWidth="1.6" />
              <path d="M3.5 9.5h17" stroke="currentColor" strokeWidth="1.6" />
              <path d="M8 3v3.2M16 3v3.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              <circle cx="12" cy="15" r="2.6" stroke="currentColor" strokeWidth="1.4" />
              <path d="M12 13.7v1.4l0.9 0.7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink/60">
              Today's Schedule
            </p>
            <h2 className="mt-0.5 text-xl font-semibold text-ink sm:text-2xl">
              {todayLabel || "Today"}
            </h2>
            <p className="mt-1 text-sm text-ink/65">
              {isStaff
                ? "Add and manage today's classes, labs, and events."
                : "View today's classes, labs, and campus schedule."}
            </p>
          </div>
        </div>
      </div>

      {isStaff ? (
        <form
          onSubmit={handleCreate}
          className="rounded-3xl border border-clay/50 bg-cream p-5 shadow-[0_18px_34px_-28px_rgb(var(--cocoa)/0.35)] sm:p-6"
        >
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink/60">
            Add Item
          </p>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-ink/55">Which period</span>
              <input
                type="text"
                value={form.period}
                onChange={(event) => handleFormChange("period", event.target.value)}
                placeholder="e.g. Period 3"
                className="w-full rounded-xl border border-clay/60 bg-white px-3 py-2.5 text-sm text-ink placeholder:text-ink/40 transition focus:border-ocean/60 focus:bg-white focus:outline-none focus:ring-2 focus:ring-ocean/15"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-ink/55">Subject name</span>
              <input
                type="text"
                value={form.subjectName}
                onChange={(event) => handleFormChange("subjectName", event.target.value)}
                placeholder="e.g. Data Structures"
                className="w-full rounded-xl border border-clay/60 bg-white px-3 py-2.5 text-sm text-ink placeholder:text-ink/40 transition focus:border-ocean/60 focus:bg-white focus:outline-none focus:ring-2 focus:ring-ocean/15"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-ink/55">Time</span>
              <input
                type="time"
                value={form.time}
                onChange={(event) => handleFormChange("time", event.target.value)}
                className="w-full rounded-xl border border-clay/60 bg-white px-3 py-2.5 text-sm text-ink placeholder:text-ink/40 transition focus:border-ocean/60 focus:bg-white focus:outline-none focus:ring-2 focus:ring-ocean/15"
              />
            </label>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className={`text-xs font-medium ${isErrorStatus ? "text-rose-600" : "text-ink/60"}`}>
              {status}
            </p>
            <button
              type="submit"
              disabled={creating}
              className="inline-flex items-center gap-2 rounded-xl bg-linear-to-r from-cocoa to-ocean px-4 py-2.5 text-sm font-semibold text-white shadow-[0_10px_20px_-10px_rgb(var(--ocean)/0.55)] transition hover:-translate-y-0.5 hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0"
            >
              {creating ? "Adding..." : "Add Schedule"}
            </button>
          </div>
        </form>
      ) : status ? (
        <p className="rounded-2xl border border-clay/50 bg-cream px-4 py-3 text-sm text-ink/70">
          {status}
        </p>
      ) : null}

      <section className="rounded-3xl border border-clay/50 bg-cream p-5 shadow-[0_18px_34px_-28px_rgb(var(--cocoa)/0.35)] sm:p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-ink">Schedule Items</p>
          <span className="rounded-full border border-clay/60 bg-white px-2.5 py-1 text-xs font-semibold text-ink/70">
            {entries.length}
          </span>
        </div>

        {loading ? (
          <p className="text-sm text-ink/60">Loading today's schedule...</p>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-clay/70 bg-white/60 px-4 py-10 text-center">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-ocean/10 text-ocean">
              <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden="true">
                <rect x="3.5" y="5" width="17" height="15.5" rx="3" stroke="currentColor" strokeWidth="1.6" />
                <path d="M3.5 9.5h17" stroke="currentColor" strokeWidth="1.6" />
                <path d="M8 3v3.2M16 3v3.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </span>
            <p className="text-sm font-medium text-ink/70">No schedule items for today.</p>
            {isStaff ? (
              <p className="text-xs text-ink/50">Add a period, subject, and time above to get started.</p>
            ) : null}
          </div>
        ) : (
          <div className="space-y-3">
            {entries.map((item) => (
              <article
                key={item.id}
                className="group rounded-2xl border border-clay/50 bg-white p-4 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-ocean/30 hover:shadow-md"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
                      <span className="inline-flex min-w-[72px] items-center justify-center rounded-xl border border-ocean/25 bg-ocean/10 px-3 py-1.5 text-sm font-semibold tracking-tight text-cocoa">
                        {item.time || "--:--"}
                      </span>
                      <h3 className="min-w-0 flex-1 truncate text-base font-semibold text-ink">
                        {item.subjectName}
                      </h3>
                      {item.period ? (
                        <span className="inline-flex rounded-full border border-clay/60 bg-sand px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink/65">
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
