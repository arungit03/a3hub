import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../../../state/auth.jsx";
import LearningPageShell from "../components/LearningPageShell.jsx";
import LearningStatCard from "../components/LearningStatCard.jsx";
import { describeTopicRoute } from "../data/catalog.js";
import { useLearningCatalog } from "../hooks/useLearningCatalog.js";
import { useLearningProgress } from "../hooks/useLearningProgress.js";
import { getLearningBasePath, getLearningTabs } from "../lib/navigation.js";

export default function CssLearningProgressPage() {
  const { role } = useAuth();
  const basePath = getLearningBasePath(role);
  const tabs = getLearningTabs(basePath);
  const { catalog } = useLearningCatalog();
  const { progress, summary } = useLearningProgress(catalog);
  const course = catalog.courses.find((item) => item.id === "css");

  if (!course) {
    return <Navigate to={`${basePath}/learning`} replace />;
  }

  const cssTopics = catalog.topicsByCourse.css || [];
  const completedLessonsCount = cssTopics.filter(
    (topic) => progress.topicStates[topic.id]?.lessonCompleted
  ).length;
  const passedQuizzesCount = cssTopics.filter(
    (topic) => progress.topicStates[topic.id]?.quizPassed
  ).length;
  const completedTopicsCount = cssTopics.filter(
    (topic) => (summary.topicProgressById[topic.id] || 0) === 100
  ).length;

  return (
    <LearningPageShell
      badge="CSS Learning"
      title="CSS Progress Report"
      subtitle="See topic-wise CSS progress, lesson status, quiz status, and which styling topics still need attention."
      tabs={tabs}
      actions={
        <Link
          to={`${basePath}/learning/css/dashboard`}
          className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-slate-100"
        >
          Back To CSS Dashboard
        </Link>
      }
    >
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <LearningStatCard
          label="CSS progress"
          value={`${summary.courseProgress.css || 0}%`}
          helper="Average of all CSS topic progress."
          tone="info"
        />
        <LearningStatCard
          label="Completed lessons"
          value={completedLessonsCount}
          helper="Lesson completion counts toward 50% per topic."
        />
        <LearningStatCard
          label="Passed quizzes"
          value={passedQuizzesCount}
          helper="Quiz pass counts toward 50% per topic."
          tone="success"
        />
        <LearningStatCard
          label="Completed topics"
          value={completedTopicsCount}
          helper="Topics that reached full 100% progress."
        />
      </section>

      <section className="rounded-[1.6rem] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              Topic-wise progress
            </p>
            <h2 className="mt-1 text-2xl font-bold text-slate-900">
              CSS learning report
            </h2>
          </div>
          <Link
            to={`${basePath}/learning/css`}
            className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Open CSS Course
          </Link>
        </div>

        <div className="mt-5 grid gap-4">
          {cssTopics.map((topic) => {
            const topicState = progress.topicStates[topic.id] || {};
            const topicProgress = summary.topicProgressById[topic.id] || 0;

            return (
              <div
                key={topic.id}
                className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4"
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-semibold text-slate-900">{topic.title}</h3>
                      {topic.level ? (
                        <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-sky-700">
                          {topic.level}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-sm text-slate-600">{topic.summary}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <div className="inline-flex rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700">
                        Topic Progress:{" "}
                        <span className="font-semibold text-slate-900">
                          {topicProgress}%
                        </span>
                      </div>
                      <div className="inline-flex rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700">
                        Lesson:{" "}
                        <span className="font-semibold text-slate-900">
                          {topicState.lessonCompleted ? "Done" : "Pending"}
                        </span>
                      </div>
                      <div className="inline-flex rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700">
                        Quiz:{" "}
                        <span className="font-semibold text-slate-900">
                          {topicState.quizPassed ? "Passed" : "Pending"}
                        </span>
                      </div>
                    </div>
                  </div>
                  <Link
                    to={describeTopicRoute(basePath, topic)}
                    className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
                  >
                    Open Topic
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </LearningPageShell>
  );
}
