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
import { formatDateTime, normalizeRole, normalizeStatus, toMillis } from "../lib/format";

const toSafeText = (value) => String(value || "").trim();

export default function AdminStaffRequestsPage() {
  const { user, profile } = useAuth();
  const [actionBusyId, setActionBusyId] = useState("");
  const [statusMessage, setStatusMessage] = useState("");

  const usersQuery = useMemo(() => query(collection(db, "users"), limit(2000)), []);
  const usersState = useRealtimeCollection(usersQuery, {
    map: (docItem) => ({ id: docItem.id, ...docItem.data() }),
    onErrorMessage: "Unable to load staff requests.",
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

  const pendingStaffRequests = useMemo(
    () =>
      (usersState.data || [])
        .filter((item) => {
          const role = normalizeRole(item.role);
          const status = normalizeStatus(item.status);
          return role === "staff" && status === "pending";
        })
        .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt)),
    [usersState.data]
  );

  const handleUpdateRequest = async (item, nextStatus) => {
    if (!item?.id || actionBusyId) return;
    setActionBusyId(item.id);
    setStatusMessage("");

    const previousStatus = normalizeStatus(item.status);
    const updatePayload = {
      status: nextStatus,
      updatedAt: serverTimestamp(),
      updatedBy: user?.uid || null,
    };

    if (nextStatus === "active") {
      updatePayload.approvedAt = serverTimestamp();
      updatePayload.approvedBy = user?.uid || null;
    }

    try {
      await updateDoc(doc(db, "users", item.id), updatePayload);
      await logAuditEvent({
        db,
        action: AUDIT_ACTIONS.USER_STATUS_CHANGED,
        module: "staff_requests",
        targetId: item.id,
        performedBy,
        metadata: {
          email: toSafeText(item.email),
          previousStatus,
          nextStatus,
          role: "staff",
        },
      }).catch(() => {});
      setStatusMessage(
        nextStatus === "active"
          ? "Staff request approved successfully."
          : "Staff request rejected."
      );
    } catch {
      setStatusMessage("Unable to update staff request.");
    } finally {
      setActionBusyId("");
    }
  };

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
          Staff Requests
        </p>
        <h2 className="text-2xl font-bold text-slate-900">
          Approve Staff Registrations
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          New staff signups stay pending until admin approval.
        </p>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        {usersState.loading ? (
          <p className="text-sm text-slate-500">Loading staff requests...</p>
        ) : null}
        {usersState.error ? (
          <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {usersState.error}
          </p>
        ) : null}

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-[0.12em] text-slate-500">
                <th className="px-2 py-2">Name</th>
                <th className="px-2 py-2">Email</th>
                <th className="px-2 py-2">Department</th>
                <th className="px-2 py-2">Requested At</th>
                <th className="px-2 py-2">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pendingStaffRequests.map((item) => (
                <tr key={item.id}>
                  <td className="px-2 py-3 font-semibold text-slate-900">
                    {toSafeText(item.name) || "-"}
                  </td>
                  <td className="px-2 py-3 text-slate-600">
                    {toSafeText(item.email) || "-"}
                  </td>
                  <td className="px-2 py-3 text-slate-600">
                    {toSafeText(item.department) || "-"}
                  </td>
                  <td className="px-2 py-3 text-slate-600">
                    {formatDateTime(item.createdAt)}
                  </td>
                  <td className="px-2 py-3">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={actionBusyId === item.id}
                        onClick={() => handleUpdateRequest(item, "active")}
                        className="rounded-lg border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 disabled:opacity-60"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        disabled={actionBusyId === item.id}
                        onClick={() => handleUpdateRequest(item, "blocked")}
                        className="rounded-lg border border-rose-300 bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700 disabled:opacity-60"
                      >
                        Reject
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {pendingStaffRequests.length === 0 && !usersState.loading ? (
                <tr>
                  <td className="px-2 py-4 text-sm text-slate-500" colSpan={5}>
                    No pending staff requests.
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
