import { Link, Navigate, useParams } from "react-router-dom";
import { isFeatureEnabled } from "../../../config/features";
import { useAuth } from "../../../state/auth.jsx";
import LearningPageShell from "../components/LearningPageShell.jsx";
import { useLearningCatalog } from "../hooks/useLearningCatalog.js";
import { useLearningProgress } from "../hooks/useLearningProgress.js";
import { describeTopicRoute } from "../data/catalog.js";
import { getLearningBasePath, getLearningTabs } from "../lib/navigation.js";

export default function LearningPracticePage() {
  const { courseId, topicSlug } = useParams();
  const { role } = useAuth();
  const basePath = getLearningBasePath(role);
  const tabs = getLearningTabs(basePath);
  const { catalog } = useLearningCatalog();
  const { progress, toggleProblemSolved } = useLearningProgress(catalog);
  const compilerEnabled = isFeatureEnabled("compilers");
  const topic = (catalog.topicsByCourse[courseId] || []).find(
    (item) => item.slug === topicSlug
  );

  if (!topic) {
    return <Navigate to={`${basePath}/learning`} replace />;
  }

  const isHtmlCourse = topic.courseId === "html";
  const solvedProblemIds = new Set(progress.topicStates[topic.id]?.solvedProblemIds || []);

  return (
    <LearningPageShell
      title={`${topic.title} Practice`}
      subtitle={
        isHtmlCourse
          ? "Work through the HTML practice exercises one by one. Open the editor to test your code, then mark the exercise when you finish."
          : "Work through the problems one by one. Mark them as solved when you finish your own solution."
      }
      tabs={tabs}
      actions={
        <>
          <Link
            to={describeTopicRoute(basePath, topic)}
            className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-slate-100"
          >
            Back To Lesson
          </Link>
          {isHtmlCourse && compilerEnabled ? (
            <Link
              to={`${basePath}/html-editor/${topic.slug}?topicId=${topic.id}`}
              className="rounded-full border border-white/30 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/20"
            >
              Open Topic Editor
            </Link>
          ) : null}
        </>
      }
    >
      <section className="grid gap-5">
        {topic.practiceProblems.map((problem, index) => {
          const solved = solvedProblemIds.has(problem.id);
          return (
            <article
              key={problem.id}
              className="rounded-[1.6rem] border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                      Problem {index + 1}
                    </span>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                      {problem.difficulty}
                    </span>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        solved
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-amber-50 text-amber-700"
                      }`}
                    >
                      {solved ? "Solved" : "Pending"}
                    </span>
                  </div>
                  <h2 className="text-xl font-bold text-slate-900">{problem.title}</h2>
                  <p className="text-sm leading-7 text-slate-700">{problem.statement}</p>
                </div>

                <div className="flex flex-wrap justify-end gap-3">
                  {isHtmlCourse && compilerEnabled ? (
                    <Link
                      to={`${basePath}/html-editor/${topic.slug}?topicId=${topic.id}&problemId=${problem.id}`}
                      className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                      Try In HTML Editor
                    </Link>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => toggleProblemSolved(topic.id, problem.id)}
                    className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                      solved
                        ? "border border-slate-300 text-slate-700 hover:bg-slate-50"
                        : "bg-slate-900 text-white hover:bg-slate-700"
                    }`}
                  >
                    {solved ? "Mark As Pending" : "Mark As Solved"}
                  </button>
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                    Sample input
                  </p>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">
                    {problem.sampleInput || "No sample input needed."}
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                    Sample output
                  </p>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">
                    {problem.sampleOutput || "Check your logic with a small custom example."}
                  </p>
                </div>
              </div>

              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                  Hint
                </p>
                <p className="mt-2 text-sm text-slate-700">{problem.hint || "Break the logic into small steps before coding."}</p>
              </div>
            </article>
          );
        })}
      </section>
    </LearningPageShell>
  );
}
