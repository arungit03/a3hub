import { useMemo, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  limit,
  query,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { useRealtimeCollection } from "../hooks/useRealtimeCollection";
import { db } from "../../lib/firebase";
import { useAuth } from "../../state/auth";
import { AUDIT_ACTIONS, logAuditEvent } from "../lib/auditLogs";
import { formatDateTime, toPercent } from "../lib/format";

const toSafeText = (value) => String(value || "").trim();

export default function AdminTestsPage() {
  const { user, profile } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [busyTestId, setBusyTestId] = useState("");
  const [editStateById, setEditStateById] = useState({});

  const testsQuery = useMemo(() => query(collection(db, "tests"), limit(1000)), []);
  const resultsQuery = useMemo(
    () => query(collection(db, "testResults"), limit(5000)),
    []
  );

  const testsState = useRealtimeCollection(testsQuery, {
    map: (docItem) => ({ id: docItem.id, ...docItem.data() }),
    onErrorMessage: "Unable to load tests.",
  });
  const resultsState = useRealtimeCollection(resultsQuery, {
    map: (docItem) => ({ id: docItem.id, ...docItem.data() }),
    onErrorMessage: "Unable to load test attempts.",
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

  const testStats = useMemo(() => {
    const index = new Map();
    (resultsState.data || []).forEach((result) => {
      const testId = toSafeText(result.testId);
      if (!testId) return;
      const percentage = Number(result.percentage);
      const normalizedPercentage = Number.isFinite(percentage)
        ? percentage
        : Number(result.totalQuestions) > 0
        ? (Number(result.score || 0) / Number(result.totalQuestions || 1)) * 100
        : 0;

      const current = index.get(testId) || {
        attempts: 0,
        totalPercentage: 0,
        highestPercentage: 0,
      };
      current.attempts += 1;
      current.totalPercentage += normalizedPercentage;
      current.highestPercentage = Math.max(current.highestPercentage, normalizedPercentage);
      index.set(testId, current);
    });
    return index;
  }, [resultsState.data]);

  const filteredTests = useMemo(() => {
    const normalizedSearch = toSafeText(searchTerm).toLowerCase();
    return (testsState.data || [])
      .filter((item) => {
        if (!normalizedSearch) return true;
        const subject = toSafeText(item.subject).toLowerCase();
        const creator = toSafeText(item.createdByName).toLowerCase();
        return subject.includes(normalizedSearch) || creator.includes(normalizedSearch);
      })
      .sort((a, b) => {
        const aTime = a.createdAt?.toMillis?.() || 0;
        const bTime = b.createdAt?.toMillis?.() || 0;
        return bTime - aTime;
      });
  }, [searchTerm, testsState.data]);

  const handleFieldEdit = (testId, field, value) => {
    setEditStateById((prev) => ({
      ...prev,
      [testId]: {
        ...(prev[testId] || {}),
        [field]: value,
      },
    }));
  };

  const handleSaveTest = async (testItem) => {
    if (!testItem?.id || busyTestId) return;
    const draft = editStateById[testItem.id] || {};
    const nextSubject = toSafeText(draft.subject ?? testItem.subject);
    const nextIsDisabled = (draft.isDisabled ?? testItem.isDisabled) ? true : false;
    if (!nextSubject) {
      setStatusMessage("Test subject cannot be empty.");
      return;
    }

    setBusyTestId(testItem.id);
    setStatusMessage("");
    try {
      await updateDoc(doc(db, "tests", testItem.id), {
        subject: nextSubject,
        isDisabled: nextIsDisabled,
        updatedAt: serverTimestamp(),
        updatedBy: user?.uid || null,
      });
      await logAuditEvent({
        db,
        action: AUDIT_ACTIONS.TEST_UPDATED,
        module: "tests",
        targetId: testItem.id,
        performedBy,
        metadata: {
          subject: nextSubject,
          isDisabled: nextIsDisabled,
        },
      }).catch(() => {});
      setStatusMessage("Test details updated.");
    } catch {
      setStatusMessage("Unable to update test.");
    } finally {
      setBusyTestId("");
    }
  };

  const handleDisableToggle = async (testItem) => {
    if (!testItem?.id || busyTestId) return;
    const nextDisabled = !testItem.isDisabled;
    setBusyTestId(testItem.id);
    setStatusMessage("");
    try {
      await updateDoc(doc(db, "tests", testItem.id), {
        isDisabled: nextDisabled,
        updatedAt: serverTimestamp(),
        updatedBy: user?.uid || null,
      });
      await logAuditEvent({
        db,
        action: AUDIT_ACTIONS.TEST_UPDATED,
        module: "tests",
        targetId: testItem.id,
        performedBy,
        metadata: {
          isDisabled: nextDisabled,
        },
      }).catch(() => {});
      setStatusMessage(nextDisabled ? "Test disabled." : "Test enabled.");
    } catch {
      setStatusMessage("Unable to update test status.");
    } finally {
      setBusyTestId("");
    }
  };

  const handleDeleteTest = async (testItem) => {
    if (!testItem?.id || busyTestId) return;
    const confirmed = window.confirm(
      "Delete this test and all related attempts? This cannot be undone."
    );
    if (!confirmed) return;

    setBusyTestId(testItem.id);
    setStatusMessage("");
    try {
      const attempts = (resultsState.data || []).filter(
        (result) => toSafeText(result.testId) === testItem.id
      );

      if (attempts.length > 0) {
        const batch = writeBatch(db);
        attempts.forEach((attempt) => {
          batch.delete(doc(db, "testResults", attempt.id));
        });
        await batch.commit();
      }

      await deleteDoc(doc(db, "tests", testItem.id));
      await logAuditEvent({
        db,
        action: AUDIT_ACTIONS.TEST_DELETED,
        module: "tests",
        targetId: testItem.id,
        performedBy,
        metadata: {
          subject: testItem.subject || "",
          attemptsDeleted: attempts.length,
        },
      }).catch(() => {});
      setStatusMessage("Test deleted.");
    } catch {
      setStatusMessage("Unable to delete test.");
    } finally {
      setBusyTestId("");
    }
  };

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
          Test Control
        </p>
        <h2 className="text-2xl font-bold text-slate-900">Manage Tests</h2>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <input
          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm md:w-80"
          placeholder="Search tests by subject or creator"
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
        />

        {testsState.loading || resultsState.loading ? (
          <p className="mt-4 text-sm text-slate-500">Loading tests...</p>
        ) : null}
        {testsState.error || resultsState.error ? (
          <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {testsState.error || resultsState.error}
          </p>
        ) : null}

        <div className="mt-4 space-y-3">
          {filteredTests.map((testItem) => {
            const stats = testStats.get(testItem.id) || {
              attempts: 0,
              totalPercentage: 0,
              highestPercentage: 0,
            };
            const averageScore =
              stats.attempts > 0 ? stats.totalPercentage / stats.attempts : 0;
            const draft = editStateById[testItem.id] || {};
            const subjectValue = draft.subject ?? testItem.subject ?? "";
            const isDisabled = (draft.isDisabled ?? testItem.isDisabled) ? true : false;

            return (
              <article
                key={testItem.id}
                className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4"
              >
                <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr]">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                      Subject
                    </label>
                    <input
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                      value={subjectValue}
                      onChange={(event) =>
                        handleFieldEdit(testItem.id, "subject", event.target.value)
                      }
                    />
                    <p className="text-xs text-slate-500">
                      Created by {testItem.createdByName || "Staff"} on{" "}
                      {formatDateTime(testItem.createdAt)}
                    </p>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-3">
                    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-center">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">
                        Attempts
                      </p>
                      <p className="mt-1 text-base font-bold text-slate-900">{stats.attempts}</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-center">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">
                        Average Score
                      </p>
                      <p className="mt-1 text-base font-bold text-slate-900">
                        {toPercent(averageScore)}%
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-center">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">
                        Highest Score
                      </p>
                      <p className="mt-1 text-base font-bold text-slate-900">
                        {toPercent(stats.highestPercentage)}%
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700">
                    <input
                      type="checkbox"
                      checked={isDisabled}
                      onChange={(event) =>
                        handleFieldEdit(testItem.id, "isDisabled", event.target.checked)
                      }
                    />
                    Disabled
                  </label>
                  <button
                    type="button"
                    disabled={busyTestId === testItem.id}
                    onClick={() => handleSaveTest(testItem)}
                    className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    disabled={busyTestId === testItem.id}
                    onClick={() => handleDisableToggle(testItem)}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-60"
                  >
                    {testItem.isDisabled ? "Enable" : "Disable"}
                  </button>
                  <button
                    type="button"
                    disabled={busyTestId === testItem.id}
                    onClick={() => handleDeleteTest(testItem)}
                    className="rounded-lg border border-rose-300 px-3 py-1.5 text-xs font-semibold text-rose-700 disabled:opacity-60"
                  >
                    Delete
                  </button>
                </div>
              </article>
            );
          })}
          {filteredTests.length === 0 && !testsState.loading ? (
            <p className="text-sm text-slate-500">No tests found.</p>
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
