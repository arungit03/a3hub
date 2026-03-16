import { useEffect, useMemo, useState } from "react";
import {
  collection,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import Card from "../components/Card";
import GradientHeader from "../components/GradientHeader";
import { db } from "../lib/firebase";
import { useAuth } from "../state/auth";

const getMillis = (value) => {
  if (!value) return 0;
  if (typeof value?.toMillis === "function") return value.toMillis();
  const asDate = new Date(value);
  const ms = asDate.getTime();
  return Number.isNaN(ms) ? 0 : ms;
};

const formatDateTime = (value) => {
  const ms = getMillis(value);
  if (!ms) return "";
  return new Date(ms).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const normalizeResult = (docItem) => {
  const data = docItem.data();
  const score = Number(data?.score || 0);
  const totalQuestions = Number(data?.totalQuestions || 0);
  const rawPercentage = Number(data?.percentage);
  const percentage = Number.isFinite(rawPercentage)
    ? rawPercentage
    : totalQuestions > 0
    ? Math.round((score / totalQuestions) * 100)
    : 0;

  return {
    id: docItem.id,
    testId: data?.testId || "",
    testSubject: data?.testSubject || "Test",
    studentId: data?.studentId || "",
    studentName: data?.studentName || "Student",
    studentEmail: data?.studentEmail || "",
    score,
    totalQuestions,
    percentage,
    submittedAt: data?.submittedAt,
    updatedAt: data?.updatedAt,
  };
};

export default function TestResultsPage() {
  const { role, user } = useAuth();
  const isStaff = role === "staff";
  const isStudentWithoutId = role === "student" && !user?.uid;
  const [results, setResults] = useState([]);
  const [loadingResults, setLoadingResults] = useState(true);
  const [resultsError, setResultsError] = useState("");

  useEffect(() => {
    if (isStudentWithoutId) {
      return undefined;
    }

    const constraints = [];
    if (!isStaff) {
      constraints.push(where("studentId", "==", user.uid));
    }

    const resultsQuery = query(collection(db, "testResults"), ...constraints);
    const unsubscribe = onSnapshot(
      resultsQuery,
      (snapshot) => {
        const next = snapshot.docs
          .map(normalizeResult)
          .sort((a, b) => {
            const aMs = getMillis(a.submittedAt) || getMillis(a.updatedAt);
            const bMs = getMillis(b.submittedAt) || getMillis(b.updatedAt);
            return bMs - aMs;
          });

        setResults(next);
        setLoadingResults(false);
        setResultsError("");
      },
      () => {
        setResults([]);
        setLoadingResults(false);
        setResultsError("Unable to load test results.");
      }
    );

    return () => unsubscribe();
  }, [isStaff, isStudentWithoutId, user?.uid]);

  const averagePercentage = useMemo(() => {
    if (!results.length) return 0;
    const sum = results.reduce((accumulator, item) => accumulator + item.percentage, 0);
    return Math.round(sum / results.length);
  }, [results]);

  return (
    <>
      <GradientHeader
        title="Results"
        subtitle={isStaff ? "All student test attempts" : "Your saved test scores"}
        rightSlot={
          <div className="rounded-full border border-clay/30 bg-white px-3 py-1 text-xs font-semibold text-black">
            {isStaff ? "Staff" : "Student"}
          </div>
        }
      />

      <section className="grid gap-4">
        <Card>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm uppercase tracking-[0.18em] text-ink/80">Test Results</p>
              <h3 className="text-xl font-semibold text-ink">
                {results.length} attempt{results.length === 1 ? "" : "s"}
              </h3>
            </div>
            <div className="rounded-full border border-clay/30 bg-cream px-3 py-1 text-xs font-semibold text-ink/80">
              Average: {averagePercentage}%
            </div>
          </div>

          {isStudentWithoutId ? (
            <p className="mt-4 text-sm text-ink/75">
              Sign in again to load your results.
            </p>
          ) : loadingResults ? (
            <p className="mt-4 text-sm text-ink/75">Loading results...</p>
          ) : resultsError ? (
            <p className="mt-4 text-sm text-ink/75">{resultsError}</p>
          ) : results.length === 0 ? (
            <p className="mt-4 text-sm text-ink/75">No results available.</p>
          ) : (
            <div className="mt-4 grid gap-3">
              {results.map((result) => (
                <div
                  key={result.id}
                  className="rounded-xl border border-clay/20 bg-white/95 px-3 py-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-ink">{result.testSubject}</p>
                      {isStaff ? (
                        <p className="mt-1 text-xs text-ink/75">
                          {result.studentName}
                          {result.studentEmail ? ` - ${result.studentEmail}` : ""}
                        </p>
                      ) : null}
                      {result.submittedAt || result.updatedAt ? (
                        <p className="mt-1 text-[11px] text-ink/60">
                          {formatDateTime(result.submittedAt || result.updatedAt)}
                        </p>
                      ) : null}
                    </div>
                    <div className="rounded-xl border border-clay/25 bg-cream px-3 py-2 text-right">
                      <p className="text-sm font-semibold text-ink">
                        {result.score}/{result.totalQuestions}
                      </p>
                      <p className="text-xs font-semibold text-ink/75">{result.percentage}%</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </section>
    </>
  );
}
