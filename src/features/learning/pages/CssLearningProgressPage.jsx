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
          className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-cocoa transition hover:-translate-y-0.5 hover:brightness-95"
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

      <section className="rounded-3xl border border-clay/50 bg-cream p-5 shadow-[0_18px_34px_-28px_rgb(var(--cocoa)/0.35)]">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink/55">
              Topic-wise progress
            </p>
            <h2 className="mt-1 text-2xl font-bold text-ink">
              CSS learning report
            </h2>
          </div>
          <Link
            to={`${basePath}/learning/css`}
            className="rounded-full border border-clay/60 bg-white px-4 py-2 text-sm font-semibold text-ink/75 transition hover:border-ocean/40 hover:text-ink"
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
                className="rounded-2xl border border-clay/50 bg-white/70 p-4"
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-semibold text-ink">{topic.title}</h3>
                      {topic.level ? (
                        <span className="rounded-full border border-ocean/25 bg-ocean/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-cocoa">
                          {topic.level}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-sm text-ink/65">{topic.summary}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <div className="inline-flex rounded-full border border-clay/50 bg-white px-4 py-2 text-sm text-ink/70">
                        Topic Progress:{" "}
                        <span className="font-semibold text-ink">
                          {topicProgress}%
                        </span>
                      </div>
                      <div className="inline-flex rounded-full border border-clay/50 bg-white px-4 py-2 text-sm text-ink/70">
                        Lesson:{" "}
                        <span className={`font-semibold ${topicState.lessonCompleted ? "text-emerald-700" : "text-ink"}`}>
                          {topicState.lessonCompleted ? "Done" : "Pending"}
                        </span>
                      </div>
                      <div className="inline-flex rounded-full border border-clay/50 bg-white px-4 py-2 text-sm text-ink/70">
                        Quiz:{" "}
                        <span className={`font-semibold ${topicState.quizPassed ? "text-emerald-700" : "text-ink"}`}>
                          {topicState.quizPassed ? "Passed" : "Pending"}
                        </span>
                      </div>
                    </div>
                  </div>
                  <Link
                    to={describeTopicRoute(basePath, topic)}
                    className="rounded-full bg-linear-to-r from-cocoa to-ocean px-4 py-2 text-sm font-semibold text-white shadow-[0_10px_20px_-10px_rgb(var(--ocean)/0.5)] transition hover:-translate-y-0.5 hover:brightness-105"
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
