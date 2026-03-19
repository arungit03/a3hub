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
              className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-slate-100"
            >
              Continue Learning
            </Link>
          ) : null}
          <Link
            to={`${basePath}/learning/css/progress`}
            className="rounded-full border border-white/30 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/20"
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
        <div className="rounded-[1.6rem] border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            Current topic
          </p>
          <h2 className="mt-1 text-2xl font-bold text-slate-900">
            {currentTopic?.title || "Start the CSS course"}
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            {currentTopic?.summary ||
              "Open the CSS course to begin with the introduction lesson and your dashboard will start tracking the latest topic here."}
          </p>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                Recommended next topic
              </p>
              <p className="mt-2 text-base font-semibold text-slate-900">
                {recommendedTopic?.title || "Choose a CSS lesson"}
              </p>
              <p className="mt-2 text-sm text-slate-600">
                {recommendedTopic?.summary ||
                  "The next suggested lesson appears here after you begin the course."}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                Progress formula
              </p>
              <p className="mt-2 text-sm text-slate-700">
                Lesson completion gives 50% and quiz pass gives 50% for each CSS topic.
              </p>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            {currentTopic ? (
              <Link
                to={describeTopicRoute(basePath, currentTopic)}
                className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
              >
                Open Current Topic
              </Link>
            ) : null}
            {recommendedTopic && recommendedTopic.id !== currentTopic?.id ? (
              <Link
                to={describeTopicRoute(basePath, recommendedTopic)}
                className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Open Recommended Topic
              </Link>
            ) : null}
          </div>
        </div>

        <aside className="rounded-[1.6rem] border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            Recent topics viewed
          </p>
          <div className="mt-4 grid gap-3">
            {recentTopics.length > 0 ? (
              recentTopics.map((topic) => (
                <Link
                  key={topic.id}
                  to={describeTopicRoute(basePath, topic)}
                  className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                >
                  {topic.title}
                </Link>
              ))
            ) : (
              <p className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                Open CSS topics and they will appear here.
              </p>
            )}
          </div>
        </aside>
      </section>
    </LearningPageShell>
  );
}
