import { Link } from "react-router-dom";
import { useAuth } from "../../../state/auth.jsx";
import LearningPageShell from "../components/LearningPageShell.jsx";
import LearningStatCard from "../components/LearningStatCard.jsx";
import { useLearningCatalog } from "../hooks/useLearningCatalog.js";
import { useLearningProgress } from "../hooks/useLearningProgress.js";
import { describeTopicRoute } from "../data/catalog.js";
import { getLearningBasePath, getLearningTabs } from "../lib/navigation.js";

const getProgressWidth = (value) => `${Math.max(0, Math.min(100, Number(value) || 0))}%`;

export default function LearningDashboardPage() {
  const { role } = useAuth();
  const basePath = getLearningBasePath(role);
  const tabs = getLearningTabs(basePath);
  const { catalog } = useLearningCatalog();
  const { summary, error } = useLearningProgress(catalog);
  const recommendedTopic = summary.recommendedTopic;

  return (
    <LearningPageShell
      title="Learning Dashboard"
      subtitle="Track overall progress, course-wise completion, and the best next topic to continue."
      tabs={tabs}
      actions={
        recommendedTopic ? (
          <Link
            to={describeTopicRoute(basePath, recommendedTopic)}
            className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-slate-100"
          >
            Continue Learning
          </Link>
        ) : null
      }
    >
      {error ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          {error}
        </div>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <LearningStatCard
          label="Overall learning"
          value={`${summary.overallProgress}%`}
          helper="Average of all learning courses."
          tone="info"
        />
        <LearningStatCard
          label="Completed lessons"
          value={summary.completedLessonsCount}
          helper="Lesson completion contributes 50% per topic."
        />
        <LearningStatCard
          label="Passed quizzes"
          value={summary.passedQuizzesCount}
          helper="Passed quizzes add 50% per topic."
          tone="success"
        />
      </section>

      <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="rounded-[1.6rem] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                Course Progress
              </p>
              <h2 className="mt-1 text-2xl font-bold text-slate-900">
                All learning courses
              </h2>
            </div>
            <Link
              to={`${basePath}/learning/progress`}
              className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Full Report
            </Link>
          </div>

          <div className="mt-5 space-y-4">
            {catalog.courses.map((course) => {
              const progress = summary.courseProgress[course.id] || 0;
              const topics = catalog.topicsByCourse[course.id] || [];
              const completedTopics = topics.filter(
                (topic) => (summary.topicProgressById[topic.id] || 0) === 100
              ).length;

              return (
                <div
                  key={course.id}
                  className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-semibold text-slate-900">{course.title}</h3>
                      <p className="text-sm text-slate-600">
                        {completedTopics}/{topics.length} topics fully completed
                      </p>
                    </div>
                    <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-sm font-semibold text-slate-700">
                      {progress}%
                    </span>
                  </div>
                  <div className="mt-3 h-3 rounded-full bg-white">
                    <div
                      className="h-full rounded-full bg-slate-900 transition-all"
                      style={{ width: getProgressWidth(progress) }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <aside className="rounded-[1.6rem] border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            Recommended Next Topic
          </p>
          <h2 className="mt-1 text-xl font-bold text-slate-900">
            {recommendedTopic?.title || "Choose a course"}
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            {recommendedTopic?.summary ||
              "Once you open a topic, the dashboard will recommend your next best step here."}
          </p>
          {recommendedTopic ? (
            <Link
              to={describeTopicRoute(basePath, recommendedTopic)}
              className="mt-4 inline-flex rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
            >
              Open Topic
            </Link>
          ) : null}

          <div className="mt-6 space-y-3">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                Progress formula
              </p>
              <p className="mt-2 text-sm text-slate-700">
                50% lesson completion + 50% quiz passed.
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                Overall progress
              </p>
              <p className="mt-2 text-sm text-slate-700">
                Overall learning is the average of all course progress in the learning module.
              </p>
            </div>
          </div>
        </aside>
      </section>
    </LearningPageShell>
  );
}
