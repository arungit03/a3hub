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
              className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-slate-100"
            >
              Open HTML Dashboard
            </Link>
          ) : null}
          {isCssCourse ? (
            <Link
              to={`${basePath}/learning/css/dashboard`}
              className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-slate-100"
            >
              Open CSS Dashboard
            </Link>
          ) : null}
          {nextTopic ? (
            <Link
              to={describeTopicRoute(basePath, nextTopic)}
              className="rounded-full border border-white/30 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/20"
            >
              Continue Topic
            </Link>
          ) : null}
          {compilerEnabled && toolPath ? (
            <Link
              to={toolPath}
              className="rounded-full border border-white/30 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/20"
            >
              {course.toolLabel || course.compilerLabel}
            </Link>
          ) : null}
        </>
      }
    >
      <section className="rounded-[1.6rem] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              Course overview
            </p>
            <h2 className="mt-1 text-2xl font-bold text-slate-900">
              {course.totalTopics} topics available
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              {isHtmlCourse
                ? "Learn each HTML topic in order. Every topic includes a lesson, rendered preview, editor practice, exercises, and a quiz."
                : isCssCourse
                ? "Learn CSS topic by topic with visual previews, key points, quizzes, recent-topic tracking, and progress saved inside the existing learning module."
                : "Learn each topic in order. Every topic includes a lesson, practice problems, and a quiz."}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
              Course progress
            </p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{courseProgress}%</p>
          </div>
        </div>
        <div className="mt-4 h-3 rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-slate-900 transition-all"
            style={{ width: getProgressWidth(courseProgress) }}
          />
        </div>
      </section>

      <section className="rounded-[1.6rem] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              Topic search
            </p>
            <h2 className="mt-1 text-xl font-bold text-slate-900">
              Find the next lesson faster
            </h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder={`Search ${course.title} topics`}
              className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-slate-400"
            />
            {hasTopicLevels ? (
              <select
                value={levelFilter}
                onChange={(event) => setLevelFilter(event.target.value)}
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-slate-400"
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
              className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                      Topic {topic.order}
                    </span>
                    {topic.level ? (
                      <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-sky-700">
                        {topic.level}
                      </span>
                    ) : null}
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        isCompleted
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {isCompleted ? "Completed" : `${topicProgress}% progress`}
                    </span>
                  </div>
                  <h2 className="text-xl font-bold text-slate-900">{topic.title}</h2>
                  <p className="max-w-3xl text-sm text-slate-600">{topic.summary}</p>
                </div>
                <Link
                  to={describeTopicRoute(basePath, topic)}
                  className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
                >
                  Open Topic
                </Link>
              </div>
              <div className="mt-4 h-2.5 rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-slate-900 transition-all"
                  style={{ width: getProgressWidth(topicProgress) }}
                />
              </div>
            </article>
          );
        })}
        {filteredTopics.length === 0 ? (
          <div className="rounded-[1.5rem] border border-slate-200 bg-white p-5 text-sm text-slate-600 shadow-sm">
            No topics match this search or level filter yet.
          </div>
        ) : null}
      </section>

      {loading ? <p className="text-sm text-slate-500">Loading progress...</p> : null}
    </LearningPageShell>
  );
}
