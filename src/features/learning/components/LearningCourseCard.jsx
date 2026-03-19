import { Link } from "react-router-dom";

const getProgressWidth = (value) => `${Math.max(0, Math.min(100, Number(value) || 0))}%`;

export default function LearningCourseCard({
  course,
  progress,
  completedTopics,
  totalTopics,
  nextTopic,
  coursePath,
  topicPath,
}) {
  return (
    <article className="overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white shadow-lg shadow-slate-200/60">
      <div className={`bg-gradient-to-r ${course.accent} p-5 text-white`}>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/80">
          {course.title}
        </p>
        <h2 className="mt-2 text-2xl font-bold">{course.subtitle}</h2>
        <p className="mt-2 text-sm text-white/85">{course.heroSummary}</p>
      </div>

      <div className="space-y-4 p-5">
        <div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-semibold text-slate-700">Progress</span>
            <span className="text-sm font-semibold text-slate-900">{progress}%</span>
          </div>
          <div className="mt-2 h-2.5 rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-slate-900 transition-all"
              style={{ width: getProgressWidth(progress) }}
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
              Topics done
            </p>
            <p className="mt-2 text-xl font-bold text-slate-900">
              {completedTopics}/{totalTopics}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
              Recommended next
            </p>
            <p className="mt-2 text-sm font-semibold text-slate-900">
              {nextTopic?.title || "Review completed lessons"}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            to={coursePath}
            className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
          >
            Open Course
          </Link>
          {nextTopic ? (
            <Link
              to={topicPath}
              className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Continue Topic
            </Link>
          ) : null}
        </div>
      </div>
    </article>
  );
}
