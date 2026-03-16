import { useCallback, useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import Card from "../components/Card";
import GradientHeader from "../components/GradientHeader";
import { db } from "../lib/firebase";
import {
  createUserNotification,
  notificationTypes,
} from "../lib/notifications";
import { useToast } from "../hooks/useToast";
import { useAutosaveDraft } from "../hooks/useAutosaveDraft";
import { useDirtyPrompt } from "../hooks/useDirtyPrompt";
import { useAuth } from "../state/auth";

const parseDateValue = (value) => {
  if (!value) return null;
  if (value?.toDate) return value.toDate();
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const parsed = new Date(`${value}T00:00:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatDateLabel = (value) => {
  const parsed = parseDateValue(value);
  if (!parsed) return "";
  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const formatDateRange = (fromDate, toDate) => {
  const fromLabel = formatDateLabel(fromDate);
  const toLabel = formatDateLabel(toDate);
  if (fromLabel && toLabel) return `${fromLabel} ? ${toLabel}`;
  return fromLabel || toLabel || "";
};

const getTodayKey = () => {
  const now = new Date();
  const offsetMs = now.getTimezoneOffset() * 60 * 1000;
  const local = new Date(now.getTime() - offsetMs);
  return local.toISOString().slice(0, 10);
};

const trimValue = (value) => String(value || "").trim();

const LEAVE_TTL_MS = 24 * 60 * 60 * 1000;
const LEAVE_DRAFT_PREFIX = "ckcethub:draft:leave:";

const STATUS_META = {
  pending: {
    label: "Pending",
    reply: "Pending",
    pillClass: "bg-sand/70 text-ink/75",
  },
  approved: {
    label: "Approved",
    reply: "Approved",
    pillClass: "bg-emerald-100 text-emerald-900",
  },
  rejected: {
    label: "Rejected",
    reply: "Rejected",
    pillClass: "bg-rose-100 text-rose-900",
  },
};

const normalizeLeaveStatus = (status) => {
  if (status === "take") return "approved";
  if (status === "notake") return "rejected";
  return status;
};

const getStatusMeta = (status) =>
  STATUS_META[normalizeLeaveStatus(status)] || STATUS_META.pending;

const getSendErrorMessage = (error) => {
  const code = error?.code || "";
  if (code === "permission-denied") {
    return "You already sent a request today or Firestore rules blocked the request.";
  }
  if (code === "unauthenticated") {
    return "Please sign in again to send a request.";
  }
  if (code === "unavailable") {
    return "Network error. Please try again.";
  }
  return code ? `Unable to send request (${code}).` : "Unable to send request. Try again.";
};

const getLoadErrorMessage = (error) => {
  const code = error?.code || "";
  if (code === "permission-denied") {
    return "Cannot load requests. Firestore rules blocked access.";
  }
  if (code === "failed-precondition") {
    return "Query needs a Firestore index.";
  }
  return code ? `Unable to load requests (${code}).` : "Unable to load leave requests.";
};

export default function LeaveManagementPage({ forcedStaff }) {
  const { role, user, profile } = useAuth();
  const { success, error: toastError, info } = useToast();
  const isStaff =
    typeof forcedStaff === "boolean"
      ? forcedStaff
      : role === "staff" || profile?.role === "staff";
  const [requests, setRequests] = useState([]);
  const [loadingRequests, setLoadingRequests] = useState(true);
  const [requestError, setRequestError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [form, setForm] = useState({
    fromName: "",
    fromDepartment: "",
    toName: "",
    toDepartment: "",
    reason: "",
  });
  const [formStatus, setFormStatus] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [pendingDecisionId, setPendingDecisionId] = useState("");
  const [rejectEditorRequestId, setRejectEditorRequestId] = useState("");
  const [rejectReasonDraft, setRejectReasonDraft] = useState("");

  const studentName =
    profile?.name || user?.displayName || user?.email || "Student";
  const staffName =
    profile?.name || user?.displayName || user?.email || "Staff";

  const baseStudentForm = useMemo(
    () => ({
      fromName: studentName,
      fromDepartment: profile?.department || "",
      toName: "",
      toDepartment: "",
      reason: "",
    }),
    [profile?.department, studentName]
  );
  const leaveDraftKey = useMemo(
    () => (user?.uid ? `${LEAVE_DRAFT_PREFIX}${user.uid}` : ""),
    [user?.uid]
  );

  const restoreLeaveDraft = useCallback((draftValue) => {
    if (!draftValue || typeof draftValue !== "object") return;
    setForm((prev) => ({
      ...prev,
      ...draftValue,
    }));
    info("Restored saved leave request draft.");
  }, [info]);

  const { clearDraft } = useAutosaveDraft({
    key: leaveDraftKey,
    value: form,
    onRestore: restoreLeaveDraft,
    enabled: !isStaff && Boolean(user?.uid),
  });

  const isStudentFormDirty = useMemo(() => {
    if (isStaff) return false;
    return Object.keys(baseStudentForm).some(
      (field) => trimValue(form[field]) !== trimValue(baseStudentForm[field])
    );
  }, [baseStudentForm, form, isStaff]);

  useDirtyPrompt(
    isStudentFormDirty && !submitting,
    "You have unsaved leave form changes. Leave this page?"
  );

  useEffect(() => {
    if (isStaff || !user) return;
    setForm((prev) => ({
      ...prev,
      fromName: prev.fromName || baseStudentForm.fromName,
      fromDepartment: prev.fromDepartment || baseStudentForm.fromDepartment,
    }));
  }, [baseStudentForm.fromDepartment, baseStudentForm.fromName, isStaff, user]);

  const clearFieldError = useCallback((field) => {
    setFieldErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }, []);

  const handleFormFieldChange = useCallback(
    (field, value) => {
      setForm((prev) => ({
        ...prev,
        [field]: value,
      }));
      clearFieldError(field);
      setFormStatus("");
    },
    [clearFieldError]
  );

  const validateStudentForm = useCallback(() => {
    const nextErrors = {};

    if (!trimValue(form.fromName)) {
      nextErrors.fromName = "From name is required.";
    }
    if (!trimValue(form.fromDepartment)) {
      nextErrors.fromDepartment = "From department is required.";
    }
    if (!trimValue(form.toName)) {
      nextErrors.toName = "Staff name is required.";
    }
    if (!trimValue(form.toDepartment)) {
      nextErrors.toDepartment = "Staff department is required.";
    }
    if (!trimValue(form.reason)) {
      nextErrors.reason = "Reason is required.";
    }

    return nextErrors;
  }, [form]);

  useEffect(() => {
    if (!user) {
      setRequests([]);
      setLoadingRequests(false);
      return undefined;
    }

    setLoadingRequests(true);
    setRequestError("");
    const requestCutoff = Timestamp.fromMillis(Date.now() - LEAVE_TTL_MS);
    const requestCutoffMs = Date.now() - LEAVE_TTL_MS;

    const baseQuery = isStaff
      ? query(
          collection(db, "leaveRequests"),
          where("createdAt", ">=", requestCutoff),
          orderBy("createdAt", "desc"),
          limit(50)
        )
      : query(
          collection(db, "leaveRequests"),
          where("studentId", "==", user.uid),
          limit(20)
        );

    const unsubscribe = onSnapshot(
      baseQuery,
      (snapshot) => {
        const next = snapshot.docs
          .map((docItem) => ({
          id: docItem.id,
          ...docItem.data(),
          }))
          .filter((item) => {
            const createdAt = parseDateValue(item?.createdAt);
            if (!createdAt) return true;
            return createdAt.getTime() >= requestCutoffMs;
          });
        if (!isStaff) {
          next.sort((a, b) => {
            const aDate = parseDateValue(a?.createdAt) || new Date(0);
            const bDate = parseDateValue(b?.createdAt) || new Date(0);
            return bDate - aDate;
          });
        }
        setRequests(next);
        setLoadingRequests(false);
        setRequestError("");
      },
      (error) => {
        setRequestError(getLoadErrorMessage(error));
        setLoadingRequests(false);
      }
    );

    return () => unsubscribe();
  }, [isStaff, user]);

  useEffect(() => {
    if (!isStaff) return undefined;

    let cancelled = false;

    const cleanupExpiredRequests = async () => {
      try {
        const requestCutoff = Timestamp.fromMillis(Date.now() - LEAVE_TTL_MS);
        while (!cancelled) {
          const expiredQuery = query(
            collection(db, "leaveRequests"),
            where("createdAt", "<=", requestCutoff),
            limit(100)
          );
          const expiredSnapshot = await getDocs(expiredQuery);

          if (expiredSnapshot.empty) return;

          const batch = writeBatch(db);
          expiredSnapshot.docs.forEach((docItem) => {
            batch.delete(docItem.ref);
          });
          await batch.commit();

          if (expiredSnapshot.size < 100) return;
        }
      } catch {
        // Keep UI responsive; Firebase TTL can still clean these up server-side.
      }
    };

    cleanupExpiredRequests();

    return () => {
      cancelled = true;
    };
  }, [isStaff]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (isStaff || submitting) return;
    if (!user) {
      setFormStatus("Sign in to send a request.");
      toastError("Sign in to send a request.");
      return;
    }

    const validationErrors = validateStudentForm();
    if (Object.keys(validationErrors).length > 0) {
      setFieldErrors(validationErrors);
      setFormStatus("Please correct the highlighted fields.");
      toastError("Please correct the highlighted leave form fields.");
      return;
    }

    const fromName = trimValue(form.fromName);
    const fromDepartment = trimValue(form.fromDepartment);
    const toName = trimValue(form.toName);
    const toDepartment = trimValue(form.toDepartment);
    const reason = trimValue(form.reason);

    setSubmitting(true);
    setFormStatus("");

    try {
      const requestDate = getTodayKey();
      const requestId = `${user.uid}_${requestDate}`;
      const requestRef = doc(db, "leaveRequests", requestId);
      await setDoc(requestRef, {
        studentId: user.uid,
        studentName,
        studentEmail: user.email || "",
        studentRollNo: profile?.rollNo || "",
        studentDepartment: profile?.department || "",
        studentYear: profile?.year || null,
        fromName,
        fromDepartment,
        toName,
        toDepartment,
        reason,
        requestDate,
        status: "pending",
        createdAt: serverTimestamp(),
        expiresAt: Timestamp.fromMillis(Date.now() + LEAVE_TTL_MS),
      });
      setForm(baseStudentForm);
      setFieldErrors({});
      clearDraft();
      setFormStatus("Request sent to staff.");
      success("Leave request sent.");
    } catch (error) {
      const nextStatus = getSendErrorMessage(error);
      setFormStatus(nextStatus);
      toastError(nextStatus);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDecision = async (requestItem, decision) => {
    if (!isStaff || !requestItem?.id) return;
    const requestId = requestItem.id;
    const studentId = requestItem.studentId || "";
    const normalizedDecision = normalizeLeaveStatus(decision);
    const rejectionReason = rejectReasonDraft.trim();

    if (normalizedDecision === "rejected" && !rejectionReason) {
      setRequestError("Enter reject reason before rejecting.");
      toastError("Enter reject reason before rejecting.");
      return;
    }

    setPendingDecisionId(requestId);
    setRequestError("");

    try {
      await updateDoc(doc(db, "leaveRequests", requestId), {
        status: normalizedDecision,
        reviewedAt: serverTimestamp(),
        reviewedBy: user?.uid || null,
        reviewedByName: staffName,
        rejectionReason: normalizedDecision === "rejected" ? rejectionReason : "",
      });

      if (studentId) {
        const decisionText =
          normalizedDecision === "approved" ? "approved" : "rejected";
        const rejectionSuffix = normalizedDecision === "rejected" && rejectionReason
          ? ` Reason: ${rejectionReason}`
          : "";
        try {
          await createUserNotification(db, {
            recipientId: studentId,
            type: notificationTypes.LEAVE_DECISION,
            priority: "high",
            topic: notificationTypes.LEAVE_DECISION,
            title: `Leave request ${decisionText}`,
            message: `Your leave request was ${decisionText} by ${staffName}.${rejectionSuffix}`,
            link: "/student/leave",
            sourceType: "leaveRequests",
            sourceId: requestId,
          });
        } catch {
          // Leave decision is already saved; notification retry can happen later.
        }
      }

      if (rejectEditorRequestId === requestId) {
        setRejectEditorRequestId("");
        setRejectReasonDraft("");
      }
      success(
        normalizedDecision === "approved"
          ? "Leave request approved."
          : "Leave request rejected."
      );
    } catch {
      setRequestError("Unable to update the request.");
      toastError("Unable to update the request.");
    } finally {
      setPendingDecisionId("");
    }
  };

  const openRejectEditor = (requestItem) => {
    if (!isStaff || !requestItem?.id) return;
    setRequestError("");
    setRejectEditorRequestId(requestItem.id);
    setRejectReasonDraft(
      typeof requestItem.rejectionReason === "string" ? requestItem.rejectionReason : ""
    );
  };

  const closeRejectEditor = () => {
    setRejectEditorRequestId("");
    setRejectReasonDraft("");
    setRequestError("");
  };

  const listTitle = isStaff ? "Leave Inbox" : "Your Leave Requests";
  const listSubtitle = isStaff
    ? "Review and respond to student requests"
    : "Track replies from staff";

  return (
    <>
      <GradientHeader
        title="Leave Management"
        subtitle={
          isStaff
            ? "Review leave requests from students"
            : "Request leave from your staff"
        }
      />

      {!isStaff ? (
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-ink/80">
                Request to the Staff
              </p>
              <h3 className="text-lg font-semibold text-ink">
                Leave application
              </h3>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="mt-4 grid gap-3">
            <label className="text-xs font-semibold uppercase tracking-[0.2em] text-ink/75">
              From (Student Name)
            </label>
            <input
              type="text"
              value={form.fromName}
              onChange={(event) =>
                handleFormFieldChange("fromName", event.target.value)
              }
              placeholder="Your name"
              className="w-full rounded-xl border border-clay/20 bg-white px-3 py-2 text-sm placeholder:text-ink/50"
            />
            {fieldErrors.fromName ? (
              <p className="text-xs font-semibold text-rose-700">
                {fieldErrors.fromName}
              </p>
            ) : null}

            <label className="text-xs font-semibold uppercase tracking-[0.2em] text-ink/75">
              From Department
            </label>
            <input
              type="text"
              value={form.fromDepartment}
              onChange={(event) =>
                handleFormFieldChange("fromDepartment", event.target.value)
              }
              placeholder="Your department"
              className="w-full rounded-xl border border-clay/20 bg-white px-3 py-2 text-sm placeholder:text-ink/50"
            />
            {fieldErrors.fromDepartment ? (
              <p className="text-xs font-semibold text-rose-700">
                {fieldErrors.fromDepartment}
              </p>
            ) : null}

            <label className="text-xs font-semibold uppercase tracking-[0.2em] text-ink/75">
              To (Staff Name)
            </label>
            <input
              type="text"
              value={form.toName}
              onChange={(event) =>
                handleFormFieldChange("toName", event.target.value)
              }
              placeholder="Staff name"
              className="w-full rounded-xl border border-clay/20 bg-white px-3 py-2 text-sm placeholder:text-ink/50"
            />
            {fieldErrors.toName ? (
              <p className="text-xs font-semibold text-rose-700">
                {fieldErrors.toName}
              </p>
            ) : null}

            <label className="text-xs font-semibold uppercase tracking-[0.2em] text-ink/75">
              To Department
            </label>
            <input
              type="text"
              value={form.toDepartment}
              onChange={(event) =>
                handleFormFieldChange("toDepartment", event.target.value)
              }
              placeholder="Staff department"
              className="w-full rounded-xl border border-clay/20 bg-white px-3 py-2 text-sm placeholder:text-ink/50"
            />
            {fieldErrors.toDepartment ? (
              <p className="text-xs font-semibold text-rose-700">
                {fieldErrors.toDepartment}
              </p>
            ) : null}

            <label className="text-xs font-semibold uppercase tracking-[0.2em] text-ink/75">
              Reason
            </label>
            <textarea
              rows={3}
              value={form.reason}
              onChange={(event) =>
                handleFormFieldChange("reason", event.target.value)
              }
              placeholder="Mention the reason for leave"
              className="w-full rounded-xl border border-clay/20 bg-white px-3 py-2 text-sm placeholder:text-ink/50"
            />
            {fieldErrors.reason ? (
              <p className="text-xs font-semibold text-rose-700">
                {fieldErrors.reason}
              </p>
            ) : null}

            {formStatus ? (
              <p className="text-xs font-semibold text-ink/80">{formStatus}</p>
            ) : null}

            <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.18em] text-ink/60">
                  Yours faithfully
                </p>
                <p className="text-sm font-semibold text-ink">{studentName}</p>
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="rounded-xl bg-clay px-4 py-2 text-sm font-semibold text-black shadow"
              >
                {submitting ? "Sending..." : "Send Request"}
              </button>
            </div>
          </form>
        </Card>
      ) : null}

      <Card className={isStaff ? "" : "bg-cream"}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-ink/80">
              {listTitle}
            </p>
            <h3 className="text-lg font-semibold text-ink">{listSubtitle}</h3>
          </div>
        </div>

        {loadingRequests ? (
          <p className="mt-4 text-sm text-ink/75">Loading requests...</p>
        ) : requestError ? (
          <p className="mt-4 text-sm text-ink/75">{requestError}</p>
        ) : requests.length === 0 ? (
          <p className="mt-4 text-sm text-ink/75">No leave requests yet.</p>
        ) : (
          <div className="mt-4 grid gap-3">
            {requests.map((request) => {
              const normalizedStatus = normalizeLeaveStatus(request.status);
              const statusMeta = getStatusMeta(normalizedStatus);
              const dateRange = formatDateRange(
                request.fromDate,
                request.toDate
              );
              const createdLabel = formatDateLabel(request.createdAt);
              const reviewedLabel = formatDateLabel(request.reviewedAt);
              const studentLabel = request.studentName || "Student";
              const staffLabel = request.reviewedByName || "";
              const fromDetails = [request.fromName, request.fromDepartment]
                .filter(Boolean)
                .join(" | ");
              const toDetails = [request.toName, request.toDepartment]
                .filter(Boolean)
                .join(" | ");

              return (
                <div
                  key={request.id}
                  className="rounded-xl border border-clay/15 bg-white/95 px-3 py-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-ink">
                        {studentLabel}
                      </p>
                      {fromDetails ? (
                        <p className="text-xs text-ink/75">
                          From: {fromDetails}
                        </p>
                      ) : dateRange ? (
                        <p className="text-xs text-ink/75">{dateRange}</p>
                      ) : null}
                      {toDetails ? (
                        <p className="text-xs text-ink/75">
                          To: {toDetails}
                        </p>
                      ) : null}
                    </div>
                    <span
                      className={`rounded-full px-2 py-1 text-[11px] font-semibold ${
                        statusMeta.pillClass
                      }`}
                    >
                      {statusMeta.label}
                    </span>
                  </div>

                  {request.reason ? (
                    <p className="mt-2 text-sm text-ink/80 whitespace-pre-wrap">
                      <span className="font-semibold">Student reason:</span>{" "}
                      {request.reason}
                    </p>
                  ) : null}
                  {normalizeLeaveStatus(request.status) === "rejected"
                  && typeof request.rejectionReason === "string"
                  && request.rejectionReason.trim() ? (
                    <p className="mt-2 text-sm text-rose-900 whitespace-pre-wrap">
                      <span className="font-semibold">Reject reason:</span>{" "}
                      {request.rejectionReason}
                    </p>
                  ) : null}

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-ink/70">
                    {createdLabel ? (
                      <span>Requested {createdLabel}</span>
                    ) : (
                      <span>Request submitted</span>
                    )}
                    {request.studentRollNo ? (
                      <span>Roll No: {request.studentRollNo}</span>
                    ) : null}
                  </div>

                  {isStaff ? (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleDecision(request, "approved")}
                        disabled={pendingDecisionId === request.id}
                        className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                          normalizedStatus === "approved"
                            ? "border-emerald-200 bg-emerald-100 text-emerald-900"
                            : "border-clay/20 bg-white text-ink/70"
                        } disabled:cursor-not-allowed disabled:opacity-60`}
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => openRejectEditor(request)}
                        disabled={pendingDecisionId === request.id}
                        className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                          normalizedStatus === "rejected"
                            ? "border-rose-200 bg-rose-100 text-rose-900"
                            : "border-clay/20 bg-white text-ink/70"
                        } disabled:cursor-not-allowed disabled:opacity-60`}
                      >
                        Reject with reason
                      </button>
                      {staffLabel ? (
                        <span className="text-[11px] text-ink/60">
                          Updated by {staffLabel}
                        </span>
                      ) : null}
                      {reviewedLabel ? (
                        <span className="text-[11px] text-ink/60">
                          on {reviewedLabel}
                        </span>
                      ) : null}
                    </div>
                  ) : null}

                  {isStaff && rejectEditorRequestId === request.id ? (
                    <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50/60 p-3">
                      <label className="text-xs font-semibold uppercase tracking-[0.18em] text-ink/75">
                        Reject reason
                      </label>
                      <textarea
                        rows={3}
                        value={rejectReasonDraft}
                        onChange={(event) => {
                          setRejectReasonDraft(event.target.value);
                          setRequestError("");
                        }}
                        placeholder="Why is this leave request rejected?"
                        className="mt-2 w-full rounded-xl border border-rose-200 bg-white px-3 py-2 text-sm placeholder:text-ink/50"
                      />
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleDecision(request, "rejected")}
                          disabled={pendingDecisionId === request.id}
                          className="rounded-full border border-rose-200 bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-900 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {pendingDecisionId === request.id ? "Saving..." : "Confirm Reject"}
                        </button>
                        <button
                          type="button"
                          onClick={closeRejectEditor}
                          disabled={pendingDecisionId === request.id}
                          className="rounded-full border border-clay/20 bg-white px-3 py-1 text-xs font-semibold text-ink/70 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {!isStaff ? (
                    <div className="mt-3 rounded-lg border border-clay/15 bg-cream px-3 py-2 text-xs text-ink/80">
                      <span className="font-semibold">Staff reply:</span>{" "}
                      {statusMeta.reply}
                      {normalizeLeaveStatus(request.status) === "rejected"
                      && typeof request.rejectionReason === "string"
                      && request.rejectionReason.trim()
                        ? ` (${request.rejectionReason})`
                        : ""}
                      {staffLabel ? ` by ${staffLabel}` : ""}
                      {reviewedLabel ? ` on ${reviewedLabel}` : ""}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </>
  );
}

