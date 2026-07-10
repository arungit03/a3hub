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
  const isComplete = Number(progress) >= 100;

  return (
    <article className="group overflow-hidden rounded-[1.5rem] border border-clay/50 bg-cream shadow-[0_18px_36px_-26px_rgb(var(--cocoa)/0.4)] transition duration-200 hover:-translate-y-1 hover:shadow-[0_24px_44px_-24px_rgb(var(--cocoa)/0.48)]">
      <div className={`relative overflow-hidden bg-linear-to-r ${course.accent} p-5 text-white`}>
        <div className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-white/15 blur-2xl" />
        <div className="relative flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/80">
              {course.title}
            </p>
            <h2 className="mt-2 text-2xl font-bold">{course.subtitle}</h2>
          </div>
          {isComplete ? (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-white/30 bg-white/20 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-widest text-white">
              <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5" aria-hidden="true">
                <path d="M5 10.5 8.5 14 15 6.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Done
            </span>
          ) : null}
        </div>
        <p className="relative mt-2 text-sm text-white/85">{course.heroSummary}</p>
      </div>

      <div className="space-y-4 p-5">
        <div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-semibold text-ink/75">Progress</span>
            <span className="text-sm font-bold text-ink">{progress}%</span>
          </div>
          <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-sand">
            <div
              className="h-full rounded-full bg-linear-to-r from-cocoa to-ocean transition-all duration-500"
              style={{ width: getProgressWidth(progress) }}
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-clay/50 bg-white/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ink/55">
              Topics done
            </p>
            <p className="mt-2 text-xl font-bold text-ink">
              {completedTopics}/{totalTopics}
            </p>
          </div>
          <div className="rounded-2xl border border-clay/50 bg-white/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ink/55">
              Recommended next
            </p>
            <p className="mt-2 truncate text-sm font-semibold text-ink">
              {nextTopic?.title || "Review completed lessons"}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            to={coursePath}
            className="rounded-full bg-linear-to-r from-cocoa to-ocean px-4 py-2 text-sm font-semibold text-white shadow-[0_10px_20px_-10px_rgb(var(--ocean)/0.55)] transition hover:-translate-y-0.5 hover:brightness-105"
          >
            Open Course
          </Link>
          {nextTopic ? (
            <Link
              to={topicPath}
              className="rounded-full border border-clay/60 bg-white px-4 py-2 text-sm font-semibold text-ink/75 transition hover:border-ocean/40 hover:text-ink"
            >
              Continue Topic
            </Link>
          ) : null}
        </div>
      </div>
    </article>
  );
}
