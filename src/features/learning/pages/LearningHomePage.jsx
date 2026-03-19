import { Link } from "react-router-dom";
import { isFeatureEnabled } from "../../../config/features";
import { useAuth } from "../../../state/auth.jsx";
import LearningCourseCard from "../components/LearningCourseCard.jsx";
import LearningPageShell from "../components/LearningPageShell.jsx";
import LearningStatCard from "../components/LearningStatCard.jsx";
import { useLearningCatalog } from "../hooks/useLearningCatalog.js";
import { useLearningProgress } from "../hooks/useLearningProgress.js";
import {
  describeCourseRoute,
  describeTopicRoute,
} from "../data/catalog.js";
import { getLearningBasePath, getLearningTabs } from "../lib/navigation.js";

export default function LearningHomePage() {
  const { role } = useAuth();
  const basePath = getLearningBasePath(role);
  const tabs = getLearningTabs(basePath);
  const { catalog, error: catalogError } = useLearningCatalog();
  const { summary, loading, error: progressError } = useLearningProgress(catalog);
  const compilerEnabled = isFeatureEnabled("compilers");

  return (
    <LearningPageShell
      badge={null}
      title="Programming Learning Module"
      subtitle={null}
      tabs={tabs}
    >
      {catalogError || progressError ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          {catalogError || progressError}
        </div>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <LearningStatCard
          label="Overall progress"
          value={`${summary.overallProgress}%`}
          helper="Average of all learning course progress."
          tone="info"
        />
        <LearningStatCard
          label="Completed lessons"
          value={summary.completedLessonsCount}
          helper="Topics marked as lesson completed."
        />
        <LearningStatCard
          label="Passed quizzes"
          value={summary.passedQuizzesCount}
          helper="Quizzes passed at the required score."
          tone="success"
        />
      </section>

      <section className="grid gap-5 xl:grid-cols-3">
        {catalog.courses.map((course) => {
          const topics = catalog.topicsByCourse[course.id] || [];
          const completedTopics = topics.filter(
            (topic) => (summary.topicProgressById[topic.id] || 0) === 100
          ).length;
          const nextTopic =
            topics.find((topic) => (summary.topicProgressById[topic.id] || 0) < 100) ||
            topics[0] ||
            null;

          return (
            <LearningCourseCard
              key={course.id}
              course={course}
              progress={summary.courseProgress[course.id] || 0}
              completedTopics={completedTopics}
              totalTopics={topics.length}
              nextTopic={nextTopic}
              coursePath={describeCourseRoute(basePath, course.id)}
              topicPath={nextTopic ? describeTopicRoute(basePath, nextTopic) : ""}
            />
          );
        })}
      </section>

      <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="rounded-[1.6rem] border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            How it works
          </p>
          <h2 className="mt-1 text-2xl font-bold text-slate-900">
            Learn topic by topic
          </h2>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-900">1. Read lesson</p>
              <p className="mt-2 text-sm text-slate-600">
                Open a topic, study the explanation, syntax, code example, notes, and common mistakes.
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-900">2. Practice and quiz</p>
              <p className="mt-2 text-sm text-slate-600">
                Answer topic quizzes, use practice pages, and review examples carefully before moving ahead.
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-900">3. Track progress</p>
              <p className="mt-2 text-sm text-slate-600">
                Your lesson completion and quiz results update progress automatically.
              </p>
            </div>
          </div>
        </div>

        <aside className="rounded-[1.6rem] border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            Code Tools
          </p>
          <h2 className="mt-1 text-xl font-bold text-slate-900">
            Open practice pages
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            The learning module stays inside the app, and the editor or compiler pages still open as separate pages whenever you want to run code.
          </p>
          <div className="mt-4 grid gap-3">
            {compilerEnabled ? (
              <>
                <Link
                  to={`${basePath}/html-editor`}
                  className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                >
                  HTML Editor
                </Link>
                <Link
                  to={`${basePath}/code/python`}
                  className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                >
                  Python Interpreter
                </Link>
                <Link
                  to={`${basePath}/code/c`}
                  className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                >
                  C Compiler
                </Link>
                <Link
                  to={`${basePath}/code/cpp`}
                  className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                >
                  C++ Compiler
                </Link>
              </>
            ) : (
              <p className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                Editor and compiler pages are disabled in this deploy profile, but the lessons, quizzes, and progress dashboard still work.
              </p>
            )}
          </div>
          {loading ? <p className="mt-3 text-xs text-slate-500">Loading progress...</p> : null}
        </aside>
      </section>
    </LearningPageShell>
  );
}
