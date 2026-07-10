import { Link } from "react-router-dom";
import { useAuth } from "../../../state/auth.jsx";
import LearningPageShell from "../components/LearningPageShell.jsx";
import LearningStatCard from "../components/LearningStatCard.jsx";
import { useLearningCatalog } from "../hooks/useLearningCatalog.js";
import { useLearningProgress } from "../hooks/useLearningProgress.js";
import { describeTopicRoute } from "../data/catalog.js";
import { getLearningBasePath, getLearningTabs } from "../lib/navigation.js";

export default function LearningProgressPage() {
  const { role } = useAuth();
  const basePath = getLearningBasePath(role);
  const tabs = getLearningTabs(basePath);
  const { catalog } = useLearningCatalog();
  const { summary, progress } = useLearningProgress(catalog);

  return (
    <LearningPageShell
      title="Progress Report"
      subtitle="See completed lessons, quiz status, and which topics still need attention."
      tabs={tabs}
    >
      <section
        className={`grid gap-4 md:grid-cols-2 ${
          catalog.courses.length >= 4 ? "xl:grid-cols-5" : "xl:grid-cols-4"
        }`}
      >
        <LearningStatCard
          label="Overall progress"
          value={`${summary.overallProgress}%`}
          helper="Average of all course progress."
          tone="info"
        />
        {catalog.courses.map((course) => (
          <LearningStatCard
            key={course.id}
            label={`${course.title} progress`}
            value={`${summary.courseProgress[course.id] || 0}%`}
            helper={`Average of ${course.title} topics.`}
          />
        ))}
      </section>

      <section className="grid gap-5">
        {catalog.courses.map((course) => (
          <article
            key={course.id}
            className="rounded-3xl border border-clay/50 bg-cream p-5 shadow-[0_18px_34px_-28px_rgb(var(--cocoa)/0.35)]"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span
                  className={`inline-flex h-3 w-3 shrink-0 rounded-full bg-linear-to-br ${course.accent}`}
                  aria-hidden="true"
                />
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink/55">
                    {course.title}
                  </p>
                  <h2 className="mt-1 text-2xl font-bold text-ink">
                    {summary.courseProgress[course.id] || 0}% complete
                  </h2>
                </div>
              </div>
              <Link
                to={`${basePath}/learning/${course.id}`}
                className="rounded-full border border-clay/60 bg-white px-4 py-2 text-sm font-semibold text-ink/75 transition hover:border-ocean/40 hover:text-ink"
              >
                Open Course
              </Link>
            </div>

            <div className="mt-5 grid gap-4">
              {(catalog.topicsByCourse[course.id] || []).map((topic) => {
                const topicState = progress.topicStates[topic.id] || {};
                const topicProgress = summary.topicProgressById[topic.id] || 0;

                return (
                  <div
                    key={topic.id}
                    className="rounded-2xl border border-clay/50 bg-white/70 p-4"
                  >
                    <div>
                      <h3 className="text-lg font-semibold text-ink">{topic.title}</h3>
                      <p className="mt-1 text-sm text-ink/65">{topic.summary}</p>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <div className="inline-flex rounded-full border border-clay/50 bg-white px-4 py-2 text-sm text-ink/70">
                          Topic Progress: <span className="font-semibold text-ink">{topicProgress}%</span>
                        </div>
                        <div className="inline-flex rounded-full border border-clay/50 bg-white px-4 py-2 text-sm text-ink/70">
                          Lesson: <span className={`font-semibold ${topicState.lessonCompleted ? "text-emerald-700" : "text-ink"}`}>{topicState.lessonCompleted ? "Done" : "Pending"}</span>
                        </div>
                        <div className="inline-flex rounded-full border border-clay/50 bg-white px-4 py-2 text-sm text-ink/70">
                          Quiz: <span className={`font-semibold ${topicState.quizPassed ? "text-emerald-700" : "text-ink"}`}>{topicState.quizPassed ? "Passed" : "Pending"}</span>
                        </div>
                        <Link
                          to={describeTopicRoute(basePath, topic)}
                          className="inline-flex rounded-full bg-linear-to-r from-cocoa to-ocean px-4 py-2 text-sm font-semibold text-white shadow-[0_10px_20px_-10px_rgb(var(--ocean)/0.5)] transition hover:-translate-y-0.5 hover:brightness-105"
                        >
                          Open Topic
                        </Link>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </article>
        ))}
      </section>
    </LearningPageShell>
  );
}
