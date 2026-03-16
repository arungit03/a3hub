import { useMemo, useState } from "react";
import {
  collection,
  deleteDoc,
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
import { formatDateTime, toMillis } from "../lib/format";

const toSafeText = (value) => String(value || "").trim();

const normalizeApprovalStatus = (value) => {
  const normalized = toSafeText(value).toLowerCase();
  if (normalized === "approved") return "approved";
  if (normalized === "rejected") return "rejected";
  return "pending";
};

const toDatetimeInputValue = (value) => {
  const millis = toMillis(value);
  if (!millis) return "";
  const date = new Date(millis);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

export default function AdminNoticesPage() {
  const { user, profile } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [busyNoticeId, setBusyNoticeId] = useState("");
  const [editById, setEditById] = useState({});

  const noticesQuery = useMemo(
    () => query(collection(db, "notices"), limit(1000)),
    []
  );
  const noticesState = useRealtimeCollection(noticesQuery, {
    map: (docItem) => ({ id: docItem.id, ...docItem.data() }),
    onErrorMessage: "Unable to load notices.",
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

  const filteredNotices = useMemo(() => {
    const normalizedSearch = toSafeText(searchTerm).toLowerCase();
    return (noticesState.data || [])
      .filter((notice) => {
        if (!normalizedSearch) return true;
        const title = toSafeText(notice.title).toLowerCase();
        const message = toSafeText(notice.message).toLowerCase();
        return title.includes(normalizedSearch) || message.includes(normalizedSearch);
      })
      .sort((a, b) => {
        const aTime = toMillis(a.createdAt);
        const bTime = toMillis(b.createdAt);
        return bTime - aTime;
      });
  }, [noticesState.data, searchTerm]);

  const getDraft = (notice) =>
    editById[notice.id] || {
      title: notice.title || "",
      message: notice.message || "",
      publishAt: toDatetimeInputValue(notice.publishAt),
      approvalStatus: normalizeApprovalStatus(notice.approvalStatus),
    };

  const setDraftField = (noticeId, field, value) => {
    setEditById((prev) => ({
      ...prev,
      [noticeId]: {
        ...(prev[noticeId] || {}),
        [field]: value,
      },
    }));
  };

  const handleSaveNotice = async (notice) => {
    if (!notice?.id || busyNoticeId) return;
    const draft = getDraft(notice);
    const title = toSafeText(draft.title);
    const message = toSafeText(draft.message);
    const publishAtValue = toSafeText(draft.publishAt);
    const publishAtDate = publishAtValue ? new Date(publishAtValue) : null;

    if (!title && !message) {
      setStatusMessage("Notice needs at least a title or message.");
      return;
    }
    if (publishAtDate && Number.isNaN(publishAtDate.getTime())) {
      setStatusMessage("Invalid publish date.");
      return;
    }

    setBusyNoticeId(notice.id);
    setStatusMessage("");
    try {
      await updateDoc(doc(db, "notices", notice.id), {
        title: title || "Notice",
        message,
        publishAt: publishAtDate || null,
        approvalStatus: normalizeApprovalStatus(draft.approvalStatus),
        updatedAt: serverTimestamp(),
        updatedBy: user?.uid || null,
      });
      setStatusMessage("Notice updated.");
    } catch {
      setStatusMessage("Unable to update notice.");
    } finally {
      setBusyNoticeId("");
    }
  };

  const handleApproval = async (notice, decision) => {
    if (!notice?.id || busyNoticeId) return;
    const normalizedDecision = decision === "approved" ? "approved" : "rejected";

    setBusyNoticeId(notice.id);
    setStatusMessage("");
    try {
      await updateDoc(doc(db, "notices", notice.id), {
        approvalStatus: normalizedDecision,
        approvedAt: normalizedDecision === "approved" ? serverTimestamp() : null,
        approvedBy: user?.uid || null,
        approvedByName: performedBy.name,
        updatedAt: serverTimestamp(),
      });

      await logAuditEvent({
        db,
        action:
          normalizedDecision === "approved"
            ? AUDIT_ACTIONS.NOTICE_APPROVED
            : AUDIT_ACTIONS.NOTICE_REJECTED,
        module: "notices",
        targetId: notice.id,
        performedBy,
        metadata: {
          title: notice.title || "",
          decision: normalizedDecision,
        },
      }).catch(() => {});

      setStatusMessage(
        normalizedDecision === "approved"
          ? "Notice approved."
          : "Notice rejected."
      );
    } catch {
      setStatusMessage("Unable to update notice approval.");
    } finally {
      setBusyNoticeId("");
    }
  };

  const handleDeleteNotice = async (notice) => {
    if (!notice?.id || busyNoticeId) return;
    const confirmed = window.confirm("Delete this notice?");
    if (!confirmed) return;

    setBusyNoticeId(notice.id);
    setStatusMessage("");
    try {
      await deleteDoc(doc(db, "notices", notice.id));
      setStatusMessage("Notice deleted.");
    } catch {
      setStatusMessage("Unable to delete notice.");
    } finally {
      setBusyNoticeId("");
    }
  };

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
          Notice Control
        </p>
        <h2 className="text-2xl font-bold text-slate-900">
          Approve, Schedule, and Manage Notices
        </h2>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <input
          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm md:w-80"
          placeholder="Search notices by title/message"
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
        />

        {noticesState.loading ? (
          <p className="mt-4 text-sm text-slate-500">Loading notices...</p>
        ) : null}
        {noticesState.error ? (
          <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {noticesState.error}
          </p>
        ) : null}

        <div className="mt-4 space-y-3">
          {filteredNotices.map((notice) => {
            const draft = getDraft(notice);
            const approvalStatus = normalizeApprovalStatus(
              draft.approvalStatus || notice.approvalStatus
            );

            return (
              <article
                key={notice.id}
                className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4"
              >
                <div className="grid gap-2">
                  <input
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold"
                    value={draft.title}
                    onChange={(event) =>
                      setDraftField(notice.id, "title", event.target.value)
                    }
                  />
                  <textarea
                    className="min-h-[84px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                    value={draft.message}
                    onChange={(event) =>
                      setDraftField(notice.id, "message", event.target.value)
                    }
                  />
                </div>

                <div className="mt-3 grid gap-2 md:grid-cols-3">
                  <div>
                    <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                      Schedule Publish Date
                    </label>
                    <input
                      type="datetime-local"
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                      value={draft.publishAt || ""}
                      onChange={(event) =>
                        setDraftField(notice.id, "publishAt", event.target.value)
                      }
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                      Approval
                    </label>
                    <select
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                      value={approvalStatus}
                      onChange={(event) =>
                        setDraftField(notice.id, "approvalStatus", event.target.value)
                      }
                    >
                      <option value="pending">pending</option>
                      <option value="approved">approved</option>
                      <option value="rejected">rejected</option>
                    </select>
                  </div>
                  <div className="text-xs text-slate-500">
                    <p>
                      Created: <span className="font-semibold">{formatDateTime(notice.createdAt)}</span>
                    </p>
                    <p>
                      Publish: <span className="font-semibold">{formatDateTime(notice.publishAt)}</span>
                    </p>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busyNoticeId === notice.id}
                    onClick={() => handleSaveNotice(notice)}
                    className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    disabled={busyNoticeId === notice.id}
                    onClick={() => handleApproval(notice, "approved")}
                    className="rounded-lg border border-emerald-300 px-3 py-1.5 text-xs font-semibold text-emerald-700 disabled:opacity-60"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    disabled={busyNoticeId === notice.id}
                    onClick={() => handleApproval(notice, "rejected")}
                    className="rounded-lg border border-amber-300 px-3 py-1.5 text-xs font-semibold text-amber-700 disabled:opacity-60"
                  >
                    Reject
                  </button>
                  <button
                    type="button"
                    disabled={busyNoticeId === notice.id}
                    onClick={() => handleDeleteNotice(notice)}
                    className="rounded-lg border border-rose-300 px-3 py-1.5 text-xs font-semibold text-rose-700 disabled:opacity-60"
                  >
                    Delete
                  </button>
                </div>
              </article>
            );
          })}
          {filteredNotices.length === 0 && !noticesState.loading ? (
            <p className="text-sm text-slate-500">No notices found.</p>
          ) : null}
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
