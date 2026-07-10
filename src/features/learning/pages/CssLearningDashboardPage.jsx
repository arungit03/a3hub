import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../../../state/auth.jsx";
import LearningPageShell from "../components/LearningPageShell.jsx";
import LearningStatCard from "../components/LearningStatCard.jsx";
import { describeTopicRoute } from "../data/catalog.js";
import { useLearningCatalog } from "../hooks/useLearningCatalog.js";
import { useLearningProgress } from "../hooks/useLearningProgress.js";
import { getLearningBasePath, getLearningTabs } from "../lib/navigation.js";

export default function CssLearningDashboardPage() {
  const { role } = useAuth();
  const basePath = getLearningBasePath(role);
  const tabs = getLearningTabs(basePath);
  const { catalog } = useLearningCatalog();
  const { progress, summary, error } = useLearningProgress(catalog);
  const course = catalog.courses.find((item) => item.id === "css");

  if (!course) {
    return <Navigate to={`${basePath}/learning`} replace />;
  }

  const cssTopics = catalog.topicsByCourse.css || [];
  const recommendedTopic =
    cssTopics.find((topic) => (summary.topicProgressById[topic.id] || 0) < 100) ||
    cssTopics[0] ||
    null;
  const currentTopic =
    catalog.topicsById[progress.lastTopicId]?.courseId === "css"
      ? catalog.topicsById[progress.lastTopicId]
      : recommendedTopic;
  const completedLessonsCount = cssTopics.filter(
    (topic) => progress.topicStates[topic.id]?.lessonCompleted
  ).length;
  const passedQuizzesCount = cssTopics.filter(
    (topic) => progress.topicStates[topic.id]?.quizPassed
  ).length;
  const completedTopicsCount = cssTopics.filter(
    (topic) => (summary.topicProgressById[topic.id] || 0) === 100
  ).length;
  const recentTopics = (progress.recentTopicIds || [])
    .map((topicId) => catalog.topicsById[topicId])
    .filter((topic) => topic?.courseId === "css")
    .slice(0, 5);

  return (
    <LearningPageShell
      badge="CSS Learning"
      title="CSS Dashboard"
      subtitle="Track CSS lesson progress, recent topics, passed quizzes, and jump back into the next best styling topic."
      tabs={tabs}
      actions={
        <>
          {recommendedTopic ? (
            <Link
              to={describeTopicRoute(basePath, recommendedTopic)}
              className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-cocoa transition hover:-translate-y-0.5 hover:brightness-95"
            >
              Continue Learning
            </Link>
          ) : null}
          <Link
            to={`${basePath}/learning/css/progress`}
            className="rounded-full border border-white/25 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/20"
          >
            CSS Progress Report
          </Link>
        </>
      }
    >
      {error ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          {error}
        </div>
      ) : null}

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
          helper="CSS topics marked as lesson completed."
        />
        <LearningStatCard
          label="Passed quizzes"
          value={passedQuizzesCount}
          helper="CSS topic quizzes passed."
          tone="success"
        />
        <LearningStatCard
          label="Completed topics"
          value={completedTopicsCount}
          helper="Topics with 100% lesson and quiz completion."
        />
      </section>

      <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="rounded-3xl border border-clay/50 bg-cream p-5 shadow-[0_18px_34px_-28px_rgb(var(--cocoa)/0.35)]">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink/55">
            Current topic
          </p>
          <h2 className="mt-1 text-2xl font-bold text-ink">
            {currentTopic?.title || "Start the CSS course"}
          </h2>
          <p className="mt-2 text-sm text-ink/65">
            {currentTopic?.summary ||
              "Open the CSS course to begin with the introduction lesson and your dashboard will start tracking the latest topic here."}
          </p>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-clay/50 bg-white/70 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ink/55">
                Recommended next topic
              </p>
              <p className="mt-2 text-base font-semibold text-ink">
                {recommendedTopic?.title || "Choose a CSS lesson"}
              </p>
              <p className="mt-2 text-sm text-ink/65">
                {recommendedTopic?.summary ||
                  "The next suggested lesson appears here after you begin the course."}
              </p>
            </div>
            <div className="rounded-2xl border border-clay/50 bg-white/70 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ink/55">
                Progress formula
              </p>
              <p className="mt-2 text-sm text-ink/75">
                Lesson completion gives 50% and quiz pass gives 50% for each CSS topic.
              </p>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            {currentTopic ? (
              <Link
                to={describeTopicRoute(basePath, currentTopic)}
                className="rounded-full bg-linear-to-r from-cocoa to-ocean px-4 py-2 text-sm font-semibold text-white shadow-[0_10px_20px_-10px_rgb(var(--ocean)/0.5)] transition hover:-translate-y-0.5 hover:brightness-105"
              >
                Open Current Topic
              </Link>
            ) : null}
            {recommendedTopic && recommendedTopic.id !== currentTopic?.id ? (
              <Link
                to={describeTopicRoute(basePath, recommendedTopic)}
                className="rounded-full border border-clay/60 bg-white px-4 py-2 text-sm font-semibold text-ink/75 transition hover:border-ocean/40 hover:text-ink"
              >
                Open Recommended Topic
              </Link>
            ) : null}
          </div>
        </div>

        <aside className="rounded-3xl border border-clay/50 bg-cream p-5 shadow-[0_18px_34px_-28px_rgb(var(--cocoa)/0.35)]">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink/55">
            Recent topics viewed
          </p>
          <div className="mt-4 grid gap-3">
            {recentTopics.length > 0 ? (
              recentTopics.map((topic) => (
                <Link
                  key={topic.id}
                  to={describeTopicRoute(basePath, topic)}
                  className="rounded-2xl border border-clay/50 bg-white/70 px-4 py-3 text-sm font-semibold text-ink/75 transition hover:border-ocean/40 hover:text-ink"
                >
                  {topic.title}
                </Link>
              ))
            ) : (
              <p className="rounded-2xl border border-clay/50 bg-white/70 px-4 py-3 text-sm text-ink/65">
                Open CSS topics and they will appear here.
              </p>
            )}
          </div>
        </aside>
      </section>
    </LearningPageShell>
  );
}
