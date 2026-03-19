import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../../../state/auth.jsx";
import LearningPageShell from "../components/LearningPageShell.jsx";
import LearningStatCard from "../components/LearningStatCard.jsx";
import { describeTopicRoute } from "../data/catalog.js";
import { useLearningCatalog } from "../hooks/useLearningCatalog.js";
import { useLearningProgress } from "../hooks/useLearningProgress.js";
import { getLearningBasePath, getLearningTabs } from "../lib/navigation.js";

export default function HtmlLearningDashboardPage() {
  const { role } = useAuth();
  const basePath = getLearningBasePath(role);
  const tabs = getLearningTabs(basePath);
  const { catalog } = useLearningCatalog();
  const { progress, summary, error } = useLearningProgress(catalog);
  const course = catalog.courses.find((item) => item.id === "html");

  if (!course) {
    return <Navigate to={`${basePath}/learning`} replace />;
  }

  const htmlTopics = catalog.topicsByCourse.html || [];
  const recommendedTopic =
    htmlTopics.find((topic) => (summary.topicProgressById[topic.id] || 0) < 100) ||
    htmlTopics[0] ||
    null;
  const completedLessonsCount = htmlTopics.filter(
    (topic) => progress.topicStates[topic.id]?.lessonCompleted
  ).length;
  const passedQuizzesCount = htmlTopics.filter(
    (topic) => progress.topicStates[topic.id]?.quizPassed
  ).length;
  const solvedExercisesCount = htmlTopics.reduce(
    (total, topic) => total + (progress.topicStates[topic.id]?.solvedProblemIds?.length || 0),
    0
  );
  const recentTopics = (progress.recentTopicIds || [])
    .map((topicId) => catalog.topicsById[topicId])
    .filter((topic) => topic?.courseId === "html")
    .slice(0, 5);

  return (
    <LearningPageShell
      badge="HTML Learning"
      title="HTML Dashboard"
      subtitle="Track HTML lesson progress, recent topics viewed, solved exercises, and jump into the HTML editor whenever you want to practice."
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
            to={`${basePath}/html-editor`}
            className="rounded-full border border-white/30 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/20"
          >
            Open HTML Editor
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
          label="HTML progress"
          value={`${summary.courseProgress.html || 0}%`}
          helper="Average of all HTML topic progress."
          tone="info"
        />
        <LearningStatCard
          label="Completed lessons"
          value={completedLessonsCount}
          helper="HTML lessons marked as completed."
        />
        <LearningStatCard
          label="Passed quizzes"
          value={passedQuizzesCount}
          helper="HTML topic quizzes passed."
          tone="success"
        />
        <LearningStatCard
          label="Solved exercises"
          value={solvedExercisesCount}
          helper="HTML practice exercises marked as solved."
        />
      </section>

      <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="rounded-[1.6rem] border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            Recommended Next Topic
          </p>
          <h2 className="mt-1 text-2xl font-bold text-slate-900">
            {recommendedTopic?.title || "Start HTML"}
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            {recommendedTopic?.summary ||
              "Open the HTML course and begin with the introduction lesson."}
          </p>
          {recommendedTopic ? (
            <div className="mt-4 flex flex-wrap gap-3">
              <Link
                to={describeTopicRoute(basePath, recommendedTopic)}
                className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
              >
                Open Topic
              </Link>
              <Link
                to={`${basePath}/html-editor/${recommendedTopic.slug}?topicId=${recommendedTopic.id}`}
                className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Try In Editor
              </Link>
            </div>
          ) : null}
        </div>

        <aside className="rounded-[1.6rem] border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            Recent Topics Viewed
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
                Open HTML topics and they will appear here.
              </p>
            )}
          </div>
        </aside>
      </section>
    </LearningPageShell>
  );
}
