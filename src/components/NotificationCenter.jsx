import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../state/auth";

const TYPE_META = {
  leave_decision: {
    label: "Leave",
    chipClass: "border-emerald-300 bg-emerald-100 text-emerald-900",
  },
  new_notice: {
    label: "Notice",
    chipClass: "border-sky-300 bg-sky-100 text-sky-900",
  },
  exam_update: {
    label: "Exam",
    chipClass: "border-indigo-300 bg-indigo-100 text-indigo-900",
  },
  fee_due: {
    label: "Fee",
    chipClass: "border-amber-300 bg-amber-100 text-amber-900",
  },
  attendance_status: {
    label: "Attendance",
    chipClass: "border-teal-300 bg-teal-100 text-teal-900",
  },
  attendance_reason_reply: {
    label: "Reason",
    chipClass: "border-amber-300 bg-amber-100 text-amber-900",
  },
  marks_update: {
    label: "Marks",
    chipClass: "border-cyan-300 bg-cyan-100 text-cyan-900",
  },
  general: {
    label: "Update",
    chipClass: "border-clay/40 bg-clay/20 text-ink/85",
  },
};
const NOTIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_PRIORITY = "normal";
const QUIET_HOURS_DEFAULT = Object.freeze({
  enabled: false,
  start: "22:00",
  end: "07:00",
  whatsapp: true,
  push: true,
  timezoneOffsetMinutes: null,
});

const PRIORITY_META = {
  low: {
    label: "Low",
    chipClass: "border-ink/20 bg-white/75 text-ink/70",
  },
  normal: {
    label: "Normal",
    chipClass: "border-clay/40 bg-clay/22 text-ink/80",
  },
  high: {
    label: "High",
    chipClass: "border-amber-300 bg-amber-100 text-amber-900",
  },
  urgent: {
    label: "Urgent",
    chipClass: "border-rose-300 bg-rose-100 text-rose-900",
  },
};

const DELIVERY_META = {
  sent: { label: "Sent", chipClass: "border-emerald-300 bg-emerald-100 text-emerald-900" },
  pending: { label: "Pending", chipClass: "border-sky-300 bg-sky-100 text-sky-900" },
  failed: { label: "Failed", chipClass: "border-rose-300 bg-rose-100 text-rose-900" },
  disabled: { label: "Disabled", chipClass: "border-zinc-300 bg-zinc-100 text-zinc-700" },
  skipped: { label: "Skipped", chipClass: "border-zinc-300 bg-zinc-100 text-zinc-700" },
  quiet_hours: { label: "Quiet", chipClass: "border-indigo-300 bg-indigo-100 text-indigo-900" },
};

const getTypeMeta = (type) => TYPE_META[type] || TYPE_META.general;

const normalizePriority = (value) => {
  const safe = String(value || "").trim().toLowerCase();
  if (safe && PRIORITY_META[safe]) return safe;
  return DEFAULT_PRIORITY;
};

const getPriorityMeta = (priority) =>
  PRIORITY_META[normalizePriority(priority)] || PRIORITY_META[DEFAULT_PRIORITY];

const getDeliveryMeta = (status) =>
  DELIVERY_META[String(status || "").trim().toLowerCase()] || DELIVERY_META.pending;

const getMillis = (value) => {
  if (!value) return 0;
  if (typeof value?.toMillis === "function") return value.toMillis();
  const asDate = new Date(value);
  const ms = asDate.getTime();
  return Number.isNaN(ms) ? 0 : ms;
};

const getExpiryMillis = (item) => {
  const explicitExpiry = getMillis(item?.expiresAt);
  if (explicitExpiry) return explicitExpiry;

  const createdAtMs = getMillis(item?.createdAt);
  return createdAtMs ? createdAtMs + NOTIFICATION_TTL_MS : 0;
};

const formatTimeLabel = (value) => {
  if (!value) return "";
  const date = value?.toDate ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const normalizeQuietHours = (value = {}) => ({
  enabled:
    typeof value.enabled === "boolean"
      ? value.enabled
      : QUIET_HOURS_DEFAULT.enabled,
  start: typeof value.start === "string" && value.start ? value.start : QUIET_HOURS_DEFAULT.start,
  end: typeof value.end === "string" && value.end ? value.end : QUIET_HOURS_DEFAULT.end,
  whatsapp:
    typeof value.whatsapp === "boolean"
      ? value.whatsapp
      : QUIET_HOURS_DEFAULT.whatsapp,
  push:
    typeof value.push === "boolean" ? value.push : QUIET_HOURS_DEFAULT.push,
  timezoneOffsetMinutes:
    typeof value.timezoneOffsetMinutes === "number" &&
    Number.isFinite(value.timezoneOffsetMinutes)
      ? value.timezoneOffsetMinutes
      : QUIET_HOURS_DEFAULT.timezoneOffsetMinutes,
});

const hasDeliveryIssue = (item = {}) => {
  const delivery = item?.delivery || {};
  return ["push", "whatsapp"].some(
    (channel) => String(delivery?.[channel] || "").toLowerCase() === "failed"
  );
};

const getLatestDeliveryLog = (item = {}) => {
  const logs = Array.isArray(item?.deliveryLogs) ? item.deliveryLogs : [];
  if (logs.length === 0) return null;
  return [...logs]
    .sort((a, b) => Number(b?.atMs || 0) - Number(a?.atMs || 0))
    .find((entry) => entry && (entry.channel === "push" || entry.channel === "whatsapp"));
};

const getLoadErrorMessage = (error) => {
  const code = error?.code || "";
  if (code === "permission-denied") {
    return "Notifications are blocked by Firestore rules. Deploy updated firestore.rules.";
  }
  if (code === "failed-precondition") {
    return "Notification query needs Firestore index/config updates.";
  }
  if (code) {
    return `Unable to load notifications (${code}).`;
  }
  return "Unable to load notifications.";
};

const mapStudentPathForParent = (pathname) => {
  if (pathname === "/student/home" || pathname.startsWith("/student/home/")) {
    return "/parent/home";
  }
  if (
    pathname === "/student/attendance" ||
    pathname.startsWith("/student/attendance/")
  ) {
    return "/parent/attendance";
  }
  if (
    pathname === "/student/menu/marks-progress" ||
    pathname.startsWith("/student/menu/marks-progress/")
  ) {
    return "/parent/menu/marks-progress";
  }
  if (pathname === "/student" || pathname === "/student/menu") {
    return "/parent/home";
  }
  if (pathname.startsWith("/student/")) {
    return "/parent/home";
  }
  return pathname;
};

const resolveFeeNotificationLink = (rawLink) => {
  const fallbackFeeLink = "/student/menu?open=fees";
  if (!rawLink) {
    return fallbackFeeLink;
  }

  try {
    const parsed = new URL(rawLink, window.location.origin);
    if (parsed.origin !== window.location.origin) {
      return rawLink;
    }

    const isStudentMenu = parsed.pathname === "/student/menu";
    const openValue = (parsed.searchParams.get("open") || "").toLowerCase();
    const hashValue = parsed.hash.replace(/^#/, "").toLowerCase();

    if (isStudentMenu && openValue !== "fees" && hashValue !== "fees") {
      parsed.searchParams.set("open", "fees");
    }

    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return rawLink === "/student/menu" ? fallbackFeeLink : rawLink;
  }
};

const resolveNotificationLink = ({ item, role }) => {
  const rawLink = typeof item?.link === "string" ? item.link.trim() : "";
  const roleAdjustedLink =
    item?.type === "fee_due" ? resolveFeeNotificationLink(rawLink) : rawLink;

  if (!roleAdjustedLink || role !== "parent") {
    return roleAdjustedLink;
  }

  try {
    const parsed = new URL(roleAdjustedLink, window.location.origin);
    if (parsed.origin !== window.location.origin) {
      return roleAdjustedLink;
    }

    const mappedPathname = mapStudentPathForParent(parsed.pathname);
    const mappedToHomeFallback = mappedPathname === "/parent/home";
    parsed.pathname = mappedPathname;
    if (mappedToHomeFallback) {
      parsed.search = "";
      parsed.hash = "";
    }

    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    if (roleAdjustedLink.startsWith("/student/menu/marks-progress")) {
      return "/parent/menu/marks-progress";
    }
    if (roleAdjustedLink.startsWith("/student/attendance")) {
      return "/parent/attendance";
    }
    if (roleAdjustedLink.startsWith("/student/")) {
      return "/parent/home";
    }
    return roleAdjustedLink;
  }
};

export default function NotificationCenter({
  inlineTrigger = false,
  triggerClassName = "",
}) {
  const { user, role, profile } = useAuth();
  const navigate = useNavigate();
  const triggerButtonRef = useRef(null);
  const panelRef = useRef(null);
  const wasOpenRef = useRef(false);

  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [markingAll, setMarkingAll] = useState(false);
  const [readFilter, setReadFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [deliveryFilter, setDeliveryFilter] = useState("all");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [savingQuietHours, setSavingQuietHours] = useState(false);
  const [quietHoursStatus, setQuietHoursStatus] = useState("");
  const [quietHoursForm, setQuietHoursForm] = useState(QUIET_HOURS_DEFAULT);

  useEffect(() => {
    if (!user?.uid) {
      setItems([]);
      setLoading(false);
      return undefined;
    }

    setLoading(true);
    setError("");

    const notificationsCollection = collection(db, "users", user.uid, "notifications");
    const notificationsQuery = query(
      notificationsCollection,
      orderBy("createdAt", "desc"),
      limit(40)
    );
    const fallbackQuery = query(notificationsCollection, limit(40));

    let fallbackUnsubscribe = () => {};
    let fallbackActive = false;

    const cleanupExpiredNotifications = async (expiredIds) => {
      if (!user?.uid || expiredIds.length === 0) return;
      try {
        const batch = writeBatch(db);
        expiredIds.forEach((notificationId) => {
          batch.delete(doc(db, "users", user.uid, "notifications", notificationId));
        });
        await batch.commit();
      } catch {
        // Cleanup is non-blocking; stale docs can be removed later.
      }
    };

    const handleSuccess = (snapshot) => {
      const next = snapshot.docs.map((item) => ({
        id: item.id,
        ...item.data(),
      }));
      if (fallbackActive) {
        next.sort((a, b) => {
          const aTime = a?.createdAt?.toMillis?.() || 0;
          const bTime = b?.createdAt?.toMillis?.() || 0;
          return bTime - aTime;
        });
      }

      const nowMs = Date.now();
      const expiredIds = [];
      const activeItems = next.filter((item) => {
        const expiryMs = getExpiryMillis(item);
        const isExpired = expiryMs > 0 && expiryMs <= nowMs;
        if (isExpired) {
          expiredIds.push(item.id);
        }
        return !isExpired;
      });

      if (expiredIds.length > 0) {
        void cleanupExpiredNotifications(expiredIds);
      }

      setItems(activeItems);
      setLoading(false);
      setError("");
    };

    const unsubscribe = onSnapshot(
      notificationsQuery,
      handleSuccess,
      (error) => {
        if (error?.code === "failed-precondition") {
          fallbackActive = true;
          fallbackUnsubscribe = onSnapshot(
            fallbackQuery,
            handleSuccess,
            (fallbackError) => {
              setItems([]);
              setLoading(false);
              setError(getLoadErrorMessage(fallbackError));
            }
          );
          return;
        }

        setItems([]);
        setLoading(false);
        setError(getLoadErrorMessage(error));
      }
    );

    return () => {
      unsubscribe();
      fallbackUnsubscribe();
    };
  }, [user?.uid]);

  useEffect(() => {
    if (!open) return undefined;

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [open]);

  useEffect(() => {
    if (!open || typeof window === "undefined") return undefined;

    const focusPanel = () => {
      panelRef.current?.focus();
    };

    const frameId = window.requestAnimationFrame(focusPanel);
    return () => window.cancelAnimationFrame(frameId);
  }, [open]);

  useEffect(() => {
    if (!open && wasOpenRef.current) {
      triggerButtonRef.current?.focus();
    }
    wasOpenRef.current = open;
  }, [open]);

  useEffect(() => {
    const nextQuietHours = normalizeQuietHours(
      profile?.notificationPreferences?.quietHours || QUIET_HOURS_DEFAULT
    );
    setQuietHoursForm(nextQuietHours);
  }, [profile?.notificationPreferences?.quietHours]);

  const unreadCount = useMemo(
    () => items.filter((item) => item.read !== true).length,
    [items]
  );

  const typeOptions = useMemo(() => {
    const values = Array.from(
      new Set(items.map((item) => String(item?.type || "").trim()).filter(Boolean))
    );
    return values.sort((a, b) => a.localeCompare(b));
  }, [items]);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (readFilter === "unread" && item.read === true) return false;
      if (readFilter === "read" && item.read !== true) return false;

      if (typeFilter !== "all" && String(item?.type || "") !== typeFilter) {
        return false;
      }

      if (priorityFilter !== "all") {
        const priority = normalizePriority(item?.priority);
        if (priority !== priorityFilter) return false;
      }

      if (deliveryFilter === "failed" && !hasDeliveryIssue(item)) return false;
      if (deliveryFilter === "quiet_hours") {
        const delivery = item?.delivery || {};
        const quiet = ["push", "whatsapp"].some(
          (channel) => String(delivery?.[channel] || "").toLowerCase() === "quiet_hours"
        );
        if (!quiet) return false;
      }
      if (deliveryFilter === "pending") {
        const delivery = item?.delivery || {};
        const pending = ["push", "whatsapp"].some(
          (channel) => String(delivery?.[channel] || "").toLowerCase() === "pending"
        );
        if (!pending) return false;
      }
      if (deliveryFilter === "sent") {
        const delivery = item?.delivery || {};
        const sent = ["push", "whatsapp"].some(
          (channel) => String(delivery?.[channel] || "").toLowerCase() === "sent"
        );
        if (!sent) return false;
      }

      return true;
    });
  }, [items, readFilter, typeFilter, priorityFilter, deliveryFilter]);

  const handleQuietHoursField = (field, value) => {
    setQuietHoursForm((prev) => ({
      ...prev,
      [field]: value,
    }));
    setQuietHoursStatus("");
  };

  const handleSaveQuietHours = async () => {
    if (!user?.uid || savingQuietHours) return;
    setSavingQuietHours(true);
    setQuietHoursStatus("");

    const sanitized = normalizeQuietHours({
      ...quietHoursForm,
      timezoneOffsetMinutes: -new Date().getTimezoneOffset(),
    });

    try {
      await updateDoc(doc(db, "users", user.uid), {
        "notificationPreferences.quietHours": sanitized,
        "notificationPreferences.updatedAt": serverTimestamp(),
      });
      setQuietHoursStatus("Quiet hours updated.");
    } catch {
      try {
        await setDoc(
          doc(db, "users", user.uid),
          {
            notificationPreferences: {
              quietHours: sanitized,
              updatedAt: serverTimestamp(),
            },
          },
          { merge: true }
        );
        setQuietHoursStatus("Quiet hours updated.");
      } catch {
        setQuietHoursStatus("Unable to save quiet hours.");
      }
    } finally {
      setSavingQuietHours(false);
    }
  };

  const clearFilters = () => {
    setReadFilter("all");
    setTypeFilter("all");
    setPriorityFilter("all");
    setDeliveryFilter("all");
  };

  const handleMarkRead = async (notificationId) => {
    if (!user?.uid || !notificationId) return;
    try {
      await updateDoc(
        doc(db, "users", user.uid, "notifications", notificationId),
        {
          read: true,
          readAt: serverTimestamp(),
        }
      );
    } catch {
      // Non-blocking to keep notification navigation responsive.
    }
  };

  const handleMarkAllRead = async () => {
    if (!user?.uid || markingAll || unreadCount === 0) return;
    setMarkingAll(true);
    try {
      const batch = writeBatch(db);
      items
        .filter((item) => item.read !== true)
        .forEach((item) => {
          batch.update(doc(db, "users", user.uid, "notifications", item.id), {
            read: true,
            readAt: serverTimestamp(),
          });
        });
      await batch.commit();
    } catch {
      // Non-blocking. User can retry.
    } finally {
      setMarkingAll(false);
    }
  };

  const handleSelect = async (item) => {
    if (!item) return;
    if (item.read !== true) {
      await handleMarkRead(item.id);
    }
    const destination = resolveNotificationLink({ item, role });
    if (destination) {
      setOpen(false);
      navigate(destination);
    }
  };

  const handlePanelKeyDown = (event) => {
    if (event.key !== "Tab") return;
    const panel = panelRef.current;
    if (!panel) return;

    const focusableElements = Array.from(
      panel.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    ).filter(
      (node) =>
        node instanceof HTMLElement &&
        (node.offsetParent !== null || node === document.activeElement)
    );

    if (focusableElements.length === 0) {
      event.preventDefault();
      return;
    }

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];
    const activeElement = document.activeElement;

    if (event.shiftKey && activeElement === firstElement) {
      event.preventDefault();
      lastElement.focus();
      return;
    }

    if (!event.shiftKey && activeElement === lastElement) {
      event.preventDefault();
      firstElement.focus();
    }
  };

  if (!user?.uid) return null;

  const triggerClasses = inlineTrigger
    ? "relative inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
    : "fixed right-3 top-3 z-[70] flex h-10 w-10 items-center justify-center rounded-full border border-ink/15 bg-white/90 text-ink shadow-md backdrop-blur transition hover:border-ink/30 hover:bg-white sm:right-4 sm:top-4 sm:h-11 sm:w-11";

  return (
    <>
      <button
        ref={triggerButtonRef}
        type="button"
        aria-label={open ? "Close notifications panel" : "Open notifications panel"}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="notification-center-dialog"
        onClick={() => setOpen((prev) => !prev)}
        className={`${triggerClasses} ${triggerClassName}`.trim()}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M6.5 9.5a5.5 5.5 0 0 1 11 0v3.8c0 .8.3 1.6.9 2.1l1.1 1H5l1.1-1c.6-.5.9-1.3.9-2.1z" />
          <path d="M9.5 18a2.5 2.5 0 0 0 5 0" />
        </svg>
        {unreadCount > 0 ? (
          <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-rose px-1.5 py-0.5 text-center text-[10px] font-bold text-ink">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <>
          <button
            type="button"
            aria-label="Close notifications"
            onClick={() => setOpen(false)}
            tabIndex={-1}
            className="fixed inset-0 z-[68] bg-ink/20 backdrop-blur-[1px]"
          />
          <section
            id="notification-center-dialog"
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="notification-center-title"
            aria-describedby="notification-center-summary"
            tabIndex={-1}
            onKeyDown={handlePanelKeyDown}
            className="fixed right-2 top-14 z-[69] w-[min(440px,calc(100vw-16px))] rounded-2xl border border-clay/30 bg-white/95 p-3 shadow-float backdrop-blur sm:right-3 sm:top-16 sm:w-[min(440px,calc(100vw-24px))]"
          >
            <div className="flex items-center justify-between gap-3 border-b border-clay/20 px-1 pb-2">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-ink/65">
                  Inbox
                </p>
                <p id="notification-center-title" className="text-sm font-semibold text-ink">
                  Notifications
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSettingsOpen((prev) => !prev)}
                  className="rounded-full border border-clay/35 bg-white px-3 py-1 text-[11px] font-semibold text-ink/75"
                >
                  Quiet hours
                </button>
                <button
                  type="button"
                  onClick={handleMarkAllRead}
                  disabled={markingAll || unreadCount === 0}
                  className="rounded-full border border-clay/35 bg-white px-3 py-1 text-[11px] font-semibold text-ink/75 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {markingAll ? "Marking..." : "Mark all read"}
                </button>
              </div>
            </div>

            <div className="mt-2 grid gap-2 rounded-xl border border-clay/25 bg-sand/45 p-2">
              <div className="grid grid-cols-2 gap-2">
                <label className="grid gap-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink/65">
                  Read
                  <select
                    value={readFilter}
                    onChange={(event) => setReadFilter(event.target.value)}
                    className="rounded-lg border border-clay/35 bg-white px-2 py-1 text-xs text-ink"
                  >
                    <option value="all">All</option>
                    <option value="unread">Unread</option>
                    <option value="read">Read</option>
                  </select>
                </label>
                <label className="grid gap-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink/65">
                  Type
                  <select
                    value={typeFilter}
                    onChange={(event) => setTypeFilter(event.target.value)}
                    className="rounded-lg border border-clay/35 bg-white px-2 py-1 text-xs text-ink"
                  >
                    <option value="all">All</option>
                    {typeOptions.map((type) => (
                      <option key={type} value={type}>
                        {getTypeMeta(type).label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="grid gap-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink/65">
                  Priority
                  <select
                    value={priorityFilter}
                    onChange={(event) => setPriorityFilter(event.target.value)}
                    className="rounded-lg border border-clay/35 bg-white px-2 py-1 text-xs text-ink"
                  >
                    <option value="all">All</option>
                    <option value="low">Low</option>
                    <option value="normal">Normal</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </label>
                <label className="grid gap-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink/65">
                  Delivery
                  <select
                    value={deliveryFilter}
                    onChange={(event) => setDeliveryFilter(event.target.value)}
                    className="rounded-lg border border-clay/35 bg-white px-2 py-1 text-xs text-ink"
                  >
                    <option value="all">All</option>
                    <option value="failed">Failed</option>
                    <option value="pending">Pending</option>
                    <option value="quiet_hours">Quiet hours</option>
                    <option value="sent">Sent</option>
                  </select>
                </label>
              </div>
              <div className="flex items-center justify-between gap-2">
                <p id="notification-center-summary" className="text-[11px] text-ink/65">
                  Showing {filteredItems.length} of {items.length}
                </p>
                <button
                  type="button"
                  onClick={clearFilters}
                  className="rounded-full border border-clay/35 bg-white px-2.5 py-1 text-[11px] font-semibold text-ink/75"
                >
                  Clear filters
                </button>
              </div>
            </div>

            {settingsOpen ? (
              <div className="mt-2 grid gap-2 rounded-xl border border-clay/25 bg-white/85 p-2">
                <label className="flex items-center gap-2 text-xs font-semibold text-ink/85">
                  <input
                    type="checkbox"
                    checked={quietHoursForm.enabled}
                    onChange={(event) =>
                      handleQuietHoursField("enabled", event.target.checked)
                    }
                    className="h-4 w-4 rounded border-clay/50"
                  />
                  Enable quiet hours
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="grid gap-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink/65">
                    Start
                    <input
                      type="time"
                      value={quietHoursForm.start}
                      onChange={(event) =>
                        handleQuietHoursField("start", event.target.value)
                      }
                      className="rounded-lg border border-clay/35 bg-white px-2 py-1 text-xs text-ink"
                    />
                  </label>
                  <label className="grid gap-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink/65">
                    End
                    <input
                      type="time"
                      value={quietHoursForm.end}
                      onChange={(event) =>
                        handleQuietHoursField("end", event.target.value)
                      }
                      className="rounded-lg border border-clay/35 bg-white px-2 py-1 text-xs text-ink"
                    />
                  </label>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-2 text-xs text-ink/80">
                    <input
                      type="checkbox"
                      checked={quietHoursForm.whatsapp}
                      onChange={(event) =>
                        handleQuietHoursField("whatsapp", event.target.checked)
                      }
                      className="h-4 w-4 rounded border-clay/50"
                    />
                    WhatsApp
                  </label>
                  <label className="flex items-center gap-2 text-xs text-ink/80">
                    <input
                      type="checkbox"
                      checked={quietHoursForm.push}
                      onChange={(event) =>
                        handleQuietHoursField("push", event.target.checked)
                      }
                      className="h-4 w-4 rounded border-clay/50"
                    />
                    Push
                  </label>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] text-ink/65">
                    Quiet-hour deliveries are logged as skipped.
                  </p>
                  <button
                    type="button"
                    onClick={handleSaveQuietHours}
                    disabled={savingQuietHours}
                    className="rounded-full border border-clay/35 bg-white px-3 py-1 text-[11px] font-semibold text-ink/80 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {savingQuietHours ? "Saving..." : "Save"}
                  </button>
                </div>
                {quietHoursStatus ? (
                  <p className="text-[11px] text-ink/70">{quietHoursStatus}</p>
                ) : null}
              </div>
            ) : null}

            <div className="mt-2 grid max-h-[65vh] gap-2 overflow-y-auto pr-1">
              {loading ? (
                <p className="px-1 py-2 text-sm text-ink/75">
                  Loading notifications...
                </p>
              ) : error ? (
                <p className="px-1 py-2 text-sm text-ink/75">{error}</p>
              ) : items.length === 0 ? (
                <p className="px-1 py-2 text-sm text-ink/75">
                  No notifications yet.
                </p>
              ) : filteredItems.length === 0 ? (
                <p className="px-1 py-2 text-sm text-ink/75">
                  No notifications match the current filters.
                </p>
              ) : (
                filteredItems.map((item) => {
                  const typeMeta = getTypeMeta(item.type);
                  const priorityMeta = getPriorityMeta(item.priority);
                  const timeLabel = formatTimeLabel(item.createdAt);
                  const isUnread = item.read !== true;
                  const latestLog = getLatestDeliveryLog(item);
                  const delivery = item?.delivery || {};
                  const channelStates = [
                    {
                      key: "whatsapp",
                      label: "WA",
                      value: String(delivery?.whatsapp || "").toLowerCase(),
                    },
                    {
                      key: "push",
                      label: "Push",
                      value: String(delivery?.push || "").toLowerCase(),
                    },
                  ].filter((entry) => entry.value);

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleSelect(item)}
                      className={`grid gap-2 rounded-xl border px-3 py-2 text-left transition ${
                        isUnread
                          ? "border-clay/45 bg-sand/80"
                          : "border-clay/20 bg-white/90"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${typeMeta.chipClass}`}
                        >
                          {typeMeta.label}
                        </span>
                        <span className="text-[11px] text-ink/60">
                          {timeLabel}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] ${priorityMeta.chipClass}`}
                        >
                          Priority: {priorityMeta.label}
                        </span>
                        {channelStates.map((entry) => {
                          const meta = getDeliveryMeta(entry.value);
                          return (
                            <span
                              key={entry.key}
                              className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] ${meta.chipClass}`}
                            >
                              {entry.label}: {meta.label}
                            </span>
                          );
                        })}
                      </div>

                      <p className="text-sm font-semibold text-ink">
                        {item.title || "Notification"}
                      </p>
                      {item.message ? (
                        <p className="text-xs text-ink/75">{item.message}</p>
                      ) : null}
                      {latestLog ? (
                        <p className="text-[11px] text-ink/65">
                          {latestLog.channel === "whatsapp" ? "WA" : "Push"}{" "}
                          {getDeliveryMeta(latestLog.state).label}
                          {latestLog.error ? `: ${latestLog.error}` : ""}
                        </p>
                      ) : null}
                    </button>
                  );
                })
              )}
            </div>
          </section>
        </>
      ) : null}
    </>
  );
}
