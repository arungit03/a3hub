import { useMemo } from "react";
import { collection, limit, orderBy, query } from "firebase/firestore";
import { useRealtimeCollection } from "../hooks/useRealtimeCollection";
import { db } from "../../lib/firebase";
import { formatDateTime } from "../lib/format";

export default function AdminAuditLogsPage() {
  const auditQuery = useMemo(
    () => query(collection(db, "auditLogs"), orderBy("timestamp", "desc"), limit(300)),
    []
  );
  const auditState = useRealtimeCollection(auditQuery, {
    map: (docItem) => ({ id: docItem.id, ...docItem.data() }),
    onErrorMessage: "Unable to load audit logs.",
  });

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
          Audit Logs
        </p>
        <h2 className="text-2xl font-bold text-slate-900">Action History</h2>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        {auditState.loading ? (
          <p className="text-sm text-slate-500">Loading logs...</p>
        ) : null}
        {auditState.error ? (
          <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {auditState.error}
          </p>
        ) : null}

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-[0.12em] text-slate-500">
                <th className="px-2 py-2">Time</th>
                <th className="px-2 py-2">Action</th>
                <th className="px-2 py-2">Module</th>
                <th className="px-2 py-2">Target</th>
                <th className="px-2 py-2">Performed By</th>
                <th className="px-2 py-2">Metadata</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(auditState.data || []).map((item) => (
                <tr key={item.id}>
                  <td className="px-2 py-2 text-slate-600">
                    {formatDateTime(item.timestamp)}
                  </td>
                  <td className="px-2 py-2 font-semibold text-slate-900">
                    {item.action || "-"}
                  </td>
                  <td className="px-2 py-2 text-slate-700">{item.module || "-"}</td>
                  <td className="px-2 py-2 text-slate-700">{item.targetId || "-"}</td>
                  <td className="px-2 py-2 text-slate-700">
                    {item.performedBy?.name || item.performedBy?.email || "-"}
                  </td>
                  <td className="px-2 py-2 text-xs text-slate-500">
                    <pre className="max-w-[320px] overflow-auto whitespace-pre-wrap">
                      {JSON.stringify(item.metadata || {}, null, 2)}
                    </pre>
                  </td>
                </tr>
              ))}
              {(auditState.data || []).length === 0 && !auditState.loading ? (
                <tr>
                  <td className="px-2 py-3 text-slate-500" colSpan={6}>
                    No audit logs yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
