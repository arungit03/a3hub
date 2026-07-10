import { useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { isFeatureEnabled } from "../../../config/features";
import { useAuth } from "../../../state/auth.jsx";
import LearningPageShell from "../components/LearningPageShell.jsx";
import { useLearningCatalog } from "../hooks/useLearningCatalog.js";
import { useLearningProgress } from "../hooks/useLearningProgress.js";
import { describeTopicRoute } from "../data/catalog.js";
import { getLearningBasePath, getLearningTabs } from "../lib/navigation.js";

const getProgressWidth = (value) => `${Math.max(0, Math.min(100, Number(value) || 0))}%`;

export default function LearningCoursePage() {
  const { courseId } = useParams();
  const { role } = useAuth();
  const basePath = getLearningBasePath(role);
  const tabs = getLearningTabs(basePath);
  const { catalog } = useLearningCatalog();
  const { summary, loading } = useLearningProgress(catalog);
  const [searchTerm, setSearchTerm] = useState("");
  const [levelFilter, setLevelFilter] = useState("all");
  const compilerEnabled = isFeatureEnabled("compilers");
  const course = catalog.courses.find((item) => item.id === courseId);
  const topics = useMemo(
    () => (course ? catalog.topicsByCourse[course.id] || [] : []),
    [catalog.topicsByCourse, course]
  );
  const hasTopicLevels = topics.some((topic) => topic.level);
  const filteredTopics = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return topics.filter((topic) => {
      const matchesSearch =
        !normalizedSearch ||
        topic.title.toLowerCase().includes(normalizedSearch) ||
        topic.summary.toLowerCase().includes(normalizedSearch);
      const matchesLevel =
        levelFilter === "all" ||
        String(topic.level || "").toLowerCase() === levelFilter;
      return matchesSearch && matchesLevel;
    });
  }, [levelFilter, searchTerm, topics]);

  if (!course) {
    return <Navigate to={`${basePath}/learning`} replace />;
  }

  const courseProgress = summary.courseProgress[course.id] || 0;
  const nextTopic =
    topics.find((topic) => (summary.topicProgressById[topic.id] || 0) < 100) || null;
  const toolPath = course.toolPath
    ? `${basePath}${course.toolPath}`
    : course.compilerPath
    ? `${basePath}/code/${course.compilerPath}`
    : "";
  const isHtmlCourse = course.id === "html";
  const isCssCourse = course.id === "css";

  return (
    <LearningPageShell
      title={`${course.title} Course`}
      subtitle={course.heroSummary}
      tabs={tabs}
      actions={
        <>
          {isHtmlCourse ? (
            <Link
              to={`${basePath}/learning/html/dashboard`}
              className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-cocoa transition hover:-translate-y-0.5 hover:brightness-95"
            >
              Open HTML Dashboard
            </Link>
          ) : null}
          {isCssCourse ? (
            <Link
              to={`${basePath}/learning/css/dashboard`}
              className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-cocoa transition hover:-translate-y-0.5 hover:brightness-95"
            >
              Open CSS Dashboard
            </Link>
          ) : null}
          {nextTopic ? (
            <Link
              to={describeTopicRoute(basePath, nextTopic)}
              className="rounded-full border border-white/25 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/20"
            >
              Continue Topic
            </Link>
          ) : null}
          {compilerEnabled && toolPath ? (
            <Link
              to={toolPath}
              className="rounded-full border border-white/25 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/20"
            >
              {course.toolLabel || course.compilerLabel}
            </Link>
          ) : null}
        </>
      }
    >
      <section className="rounded-3xl border border-clay/50 bg-cream p-5 shadow-[0_18px_34px_-28px_rgb(var(--cocoa)/0.35)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <span
              className={`inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-linear-to-br ${course.accent} text-lg font-bold text-white shadow-[0_10px_20px_-10px_rgba(0,0,0,0.35)]`}
              aria-hidden="true"
            >
              {course.title?.charAt(0) || "?"}
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink/55">
                Course overview
              </p>
              <h2 className="mt-1 text-2xl font-bold text-ink">
                {course.totalTopics} topics available
              </h2>
              <p className="mt-2 max-w-2xl text-sm text-ink/65">
                {isHtmlCourse
                  ? "Learn each HTML topic in order. Every topic includes a lesson, rendered preview, editor practice, exercises, and a quiz."
                  : isCssCourse
                  ? "Learn CSS topic by topic with visual previews, key points, quizzes, recent-topic tracking, and progress saved inside the existing learning module."
                  : "Learn each topic in order. Every topic includes a lesson, practice problems, and a quiz."}
              </p>
            </div>
          </div>
          <div className="rounded-2xl border border-clay/50 bg-white/70 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ink/55">
              Course progress
            </p>
            <p className="mt-1 text-2xl font-bold text-ink">{courseProgress}%</p>
          </div>
        </div>
        <div className="mt-4 h-3 overflow-hidden rounded-full bg-sand">
          <div
            className={`h-full rounded-full bg-linear-to-r ${course.accent} transition-all duration-500`}
            style={{ width: getProgressWidth(courseProgress) }}
          />
        </div>
      </section>

      <section className="rounded-3xl border border-clay/50 bg-cream p-5 shadow-[0_18px_34px_-28px_rgb(var(--cocoa)/0.35)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink/55">
              Topic search
            </p>
            <h2 className="mt-1 text-xl font-bold text-ink">
              Find the next lesson faster
            </h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="relative">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/40"
                aria-hidden="true"
              >
                <circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" strokeWidth="1.6" />
                <path d="m20 20-4.35-4.35" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
              <input
                type="search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder={`Search ${course.title} topics`}
                className="w-full rounded-2xl border border-clay/60 bg-white py-3 pl-10 pr-4 text-sm text-ink outline-none transition focus:border-ocean/60 focus:ring-2 focus:ring-ocean/15"
              />
            </div>
            {hasTopicLevels ? (
              <select
                value={levelFilter}
                onChange={(event) => setLevelFilter(event.target.value)}
                className="w-full rounded-2xl border border-clay/60 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-ocean/60 focus:ring-2 focus:ring-ocean/15"
              >
                <option value="all">All levels</option>
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
              </select>
            ) : null}
          </div>
        </div>
      </section>

      <section className="grid gap-4">
        {filteredTopics.map((topic) => {
          const topicProgress = summary.topicProgressById[topic.id] || 0;
          const isCompleted = topicProgress === 100;
          return (
            <article
              key={topic.id}
              className="group relative overflow-hidden rounded-3xl border border-clay/50 bg-cream p-5 shadow-[0_14px_28px_-24px_rgb(var(--cocoa)/0.35)] transition duration-200 hover:-translate-y-0.5 hover:border-ocean/30 hover:shadow-[0_20px_36px_-24px_rgb(var(--cocoa)/0.4)]"
            >
              <span
                className={`absolute inset-y-0 left-0 w-1.5 bg-linear-to-b ${course.accent}`}
                aria-hidden="true"
              />
              <div className="flex flex-col gap-4 pl-2 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="rounded-full border border-clay/60 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-ink/55">
                      Topic {topic.order}
                    </span>
                    {topic.level ? (
                      <span className="rounded-full border border-ocean/25 bg-ocean/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-cocoa">
                        {topic.level}
                      </span>
                    ) : null}
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        isCompleted
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-sand text-ink/60"
                      }`}
                    >
                      {isCompleted ? "Completed" : `${topicProgress}% progress`}
                    </span>
                  </div>
                  <h2 className="text-xl font-bold text-ink">{topic.title}</h2>
                  <p className="max-w-3xl text-sm text-ink/65">{topic.summary}</p>
                </div>
                <Link
                  to={describeTopicRoute(basePath, topic)}
                  className="rounded-full bg-linear-to-r from-cocoa to-ocean px-4 py-2 text-sm font-semibold text-white shadow-[0_10px_20px_-10px_rgb(var(--ocean)/0.5)] transition hover:-translate-y-0.5 hover:brightness-105"
                >
                  Open Topic
                </Link>
              </div>
              <div className="mt-4 ml-2 h-2.5 overflow-hidden rounded-full bg-sand">
                <div
                  className={`h-full rounded-full bg-linear-to-r ${course.accent} transition-all duration-500`}
                  style={{ width: getProgressWidth(topicProgress) }}
                />
              </div>
            </article>
          );
        })}
        {filteredTopics.length === 0 ? (
          <div className="rounded-3xl border border-clay/50 bg-cream p-5 text-sm text-ink/65 shadow-[0_14px_28px_-24px_rgb(var(--cocoa)/0.35)]">
            No topics match this search or level filter yet.
          </div>
        ) : null}
      </section>

      {loading ? <p className="text-sm text-ink/55">Loading progress...</p> : null}
    </LearningPageShell>
  );
}
