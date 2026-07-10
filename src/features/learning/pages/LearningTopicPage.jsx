import { useEffect } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { isFeatureEnabled } from "../../../config/features";
import { useAuth } from "../../../state/auth.jsx";
import HtmlEditorWorkspace from "../../html-editor/components/HtmlEditorWorkspace.jsx";
import LearningPageShell from "../components/LearningPageShell.jsx";
import { useLearningCatalog } from "../hooks/useLearningCatalog.js";
import { useLearningProgress } from "../hooks/useLearningProgress.js";
import {
  describeTopicRoute,
  getNextTopic,
  getPreviousTopic,
} from "../data/catalog.js";
import { getLearningBasePath, getLearningTabs } from "../lib/navigation.js";

const CodeBlock = ({ children, label = "" }) => (
  <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#10002b] shadow-inner">
    <div className="flex items-center gap-1.5 border-b border-white/10 bg-white/4 px-4 py-2">
      <span className="h-2.5 w-2.5 rounded-full bg-rose-400/70" />
      <span className="h-2.5 w-2.5 rounded-full bg-amber-300/70" />
      <span className="h-2.5 w-2.5 rounded-full bg-emerald-300/70" />
      {label ? (
        <span className="ml-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/40">
          {label}
        </span>
      ) : null}
    </div>
    <pre className="overflow-x-auto p-4 text-sm text-white/90">
      <code>{children}</code>
    </pre>
  </div>
);

const TopicProgressRing = ({ value }) => {
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.max(0, Math.min(100, value)) / 100) * circumference;
  return (
    <div className="relative inline-flex h-28 w-28 items-center justify-center">
      <svg viewBox="0 0 96 96" className="h-28 w-28 -rotate-90">
        <circle cx="48" cy="48" r={radius} fill="none" stroke="rgb(var(--sand))" strokeWidth="9" />
        <circle
          cx="48"
          cy="48"
          r={radius}
          fill="none"
          stroke="url(#topicProgressGradient)"
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-500"
        />
        <defs>
          <linearGradient id="topicProgressGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="rgb(var(--cocoa))" />
            <stop offset="100%" stopColor="rgb(var(--ocean))" />
          </linearGradient>
        </defs>
      </svg>
      <span className="absolute text-2xl font-bold text-ink">{value}%</span>
    </div>
  );
};

export default function LearningTopicPage() {
  const { courseId, topicSlug } = useParams();
  const { role } = useAuth();
  const basePath = getLearningBasePath(role);
  const tabs = getLearningTabs(basePath);
  const { catalog } = useLearningCatalog();
  const { summary, progress, markLessonCompleted, recordTopicVisit } =
    useLearningProgress(catalog);
  const course = catalog.courses.find((item) => item.id === courseId);
  const topic = (catalog.topicsByCourse[courseId] || []).find(
    (item) => item.slug === topicSlug
  );
  const compilerEnabled = isFeatureEnabled("compilers");
  const toolPath = course?.toolPath
    ? `${basePath}${course.toolPath}`
    : course?.compilerPath
    ? `${basePath}/code/${course.compilerPath}`
    : "";
  const topicToolPath =
    course?.id === "html" && toolPath && topic
      ? `${toolPath}/${topic.slug}?topicId=${topic.id}`
      : toolPath;
  const htmlExampleOption =
    course?.id === "html" && topic
      ? [
          {
            id: topic.id,
            title: `${topic.title} Example`,
            description: topic.summary,
            code: topic.exampleCode,
          },
        ]
      : [];
  const isCssCourse = course?.id === "css";
  const previewSource =
    course?.id === "html" ? topic?.exampleCode || "" : topic?.previewHtml || "";
  const showRenderedPreview = Boolean(previewSource);

  useEffect(() => {
    if (!topic?.id) {
      return;
    }
    void recordTopicVisit(topic.id);
  }, [recordTopicVisit, topic?.id]);

  if (!course || !topic) {
    return <Navigate to={`${basePath}/learning`} replace />;
  }

  const topicState = progress.topicStates[topic.id] || {};
  const topicProgress = summary.topicProgressById[topic.id] || 0;
  const nextTopic = getNextTopic(topic.id, catalog);
  const previousTopic = getPreviousTopic(topic.id, catalog);
  const canOpenTool = compilerEnabled;

  return (
    <LearningPageShell
      title={topic.title}
      subtitle={topic.summary}
      tabs={tabs}
      actions={
        <>
          <button
            type="button"
            onClick={() => markLessonCompleted(topic.id)}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
              topicState.lessonCompleted
                ? "bg-emerald-400/90 text-emerald-950 hover:brightness-95"
                : "bg-white text-cocoa hover:-translate-y-0.5 hover:brightness-95"
            }`}
          >
            {topicState.lessonCompleted ? "Lesson Completed" : "Mark As Completed"}
          </button>
          {canOpenTool && topicToolPath ? (
            <Link
              to={topicToolPath}
              className="rounded-full border border-white/25 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/20"
            >
              {course.toolLabel || course.compilerLabel}
            </Link>
          ) : null}
        </>
      }
    >
      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          <article className="rounded-3xl border border-clay/50 bg-cream p-5 shadow-[0_18px_34px_-28px_rgb(var(--cocoa)/0.35)]">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink/55">
              Easy explanation
            </p>
            <p className="mt-3 text-sm leading-7 text-ink/80">{topic.explanation}</p>
          </article>

          <article className="rounded-3xl border border-clay/50 bg-cream p-5 shadow-[0_18px_34px_-28px_rgb(var(--cocoa)/0.35)]">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink/55">
              Syntax
            </p>
            <div className="mt-3">
              <CodeBlock label={course.title}>{topic.syntax}</CodeBlock>
            </div>
          </article>

          <article className="rounded-3xl border border-clay/50 bg-cream p-5 shadow-[0_18px_34px_-28px_rgb(var(--cocoa)/0.35)]">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink/55">
              {isCssCourse ? "Example HTML and CSS" : "Example code"}
            </p>
            {isCssCourse && topic.exampleHtml ? (
              <>
                <p className="mt-3 text-xs font-semibold uppercase tracking-[0.12em] text-ink/50">
                  Example HTML
                </p>
                <div className="mt-2">
                  <CodeBlock label="HTML">{topic.exampleHtml}</CodeBlock>
                </div>
                <p className="mt-4 text-xs font-semibold uppercase tracking-[0.12em] text-ink/50">
                  Example CSS
                </p>
                <div className="mt-2">
                  <CodeBlock label="CSS">{topic.exampleCode}</CodeBlock>
                </div>
              </>
            ) : (
              <div className="mt-3">
                <CodeBlock label={course.title}>{topic.exampleCode}</CodeBlock>
              </div>
            )}
            <p className="mt-4 text-xs font-semibold uppercase tracking-[0.16em] text-ink/55">
              {showRenderedPreview ? "Rendered preview" : "Output"}
            </p>
            <div className="mt-3">
              {showRenderedPreview ? (
                <div className="overflow-hidden rounded-2xl border border-clay/50 bg-white">
                  <iframe
                    title={`${topic.title} preview`}
                    sandbox="allow-same-origin"
                    srcDoc={previewSource}
                    className="min-h-[220px] w-full bg-white"
                  />
                </div>
              ) : (
                <CodeBlock label="Output">{topic.output}</CodeBlock>
              )}
            </div>
            {showRenderedPreview ? (
              <div className="mt-4 rounded-2xl border border-clay/50 bg-white/70 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ink/55">
                  Preview note
                </p>
                <p className="mt-2 text-sm text-ink/75">{topic.output}</p>
              </div>
            ) : null}
          </article>

          {course.id === "html" ? (
            <HtmlEditorWorkspace
              key={topic.id}
              heading={`${topic.title} Try It Yourself`}
              description="Edit this HTML example, run it, and preview the result right inside the lesson page."
              initialCode={topic.exampleCode}
              initialTitle={`${topic.title} Example`}
              exampleOptions={htmlExampleOption}
              allowSave={false}
              compact
              sourceId={topic.id}
              sourceTitle={topic.title}
            />
          ) : null}

          <div
            className={`grid gap-5 ${
              topic.keyPoints?.length ? "xl:grid-cols-3" : "lg:grid-cols-2"
            }`}
          >
            <article className="rounded-3xl border border-clay/50 bg-cream p-5 shadow-[0_18px_34px_-28px_rgb(var(--cocoa)/0.35)]">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink/55">
                Notes
              </p>
              <ul className="mt-3 space-y-3 text-sm text-ink/75">
                {topic.notes.map((item) => (
                  <li key={item} className="rounded-2xl border border-clay/50 bg-white/70 px-4 py-3">
                    {item}
                  </li>
                ))}
              </ul>
            </article>
            {topic.keyPoints?.length ? (
              <article className="rounded-3xl border border-clay/50 bg-cream p-5 shadow-[0_18px_34px_-28px_rgb(var(--cocoa)/0.35)]">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink/55">
                  Key points
                </p>
                <ul className="mt-3 space-y-3 text-sm text-cocoa">
                  {topic.keyPoints.map((item) => (
                    <li
                      key={item}
                      className="rounded-2xl border border-ocean/25 bg-ocean/10 px-4 py-3"
                    >
                      {item}
                    </li>
                  ))}
                </ul>
              </article>
            ) : null}
            <article className="rounded-3xl border border-clay/50 bg-cream p-5 shadow-[0_18px_34px_-28px_rgb(var(--cocoa)/0.35)]">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink/55">
                Common mistakes
              </p>
              <ul className="mt-3 space-y-3 text-sm text-ink/75">
                {topic.commonMistakes.map((item) => (
                  <li key={item} className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3">
                    {item}
                  </li>
                ))}
              </ul>
            </article>
          </div>
        </div>

        <aside className="space-y-5">
          <article className="rounded-3xl border border-clay/50 bg-cream p-5 text-center shadow-[0_18px_34px_-28px_rgb(var(--cocoa)/0.35)]">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink/55">
              Topic progress
            </p>
            <div className="mt-3 flex justify-center">
              <TopicProgressRing value={topicProgress} />
            </div>
            <div className="mt-4 grid gap-2.5 text-left">
              <div className="flex items-center justify-between rounded-2xl border border-clay/50 bg-white/70 px-4 py-3 text-sm text-ink/75">
                <span>Lesson</span>
                <span className={`font-semibold ${topicState.lessonCompleted ? "text-emerald-700" : "text-ink/50"}`}>
                  {topicState.lessonCompleted ? "Completed" : "Pending"}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-2xl border border-clay/50 bg-white/70 px-4 py-3 text-sm text-ink/75">
                <span>Quiz</span>
                <span className={`font-semibold ${topicState.quizPassed ? "text-emerald-700" : "text-ink/50"}`}>
                  {topicState.quizPassed ? "Passed" : "Not passed"}
                </span>
              </div>
            </div>
          </article>

          <article className="rounded-3xl border border-clay/50 bg-cream p-5 shadow-[0_18px_34px_-28px_rgb(var(--cocoa)/0.35)]">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink/55">
              Practice and quiz
            </p>
            <div className="mt-4 grid gap-3">
              <Link
                to={describeTopicRoute(basePath, topic) + "/practice"}
                className="rounded-2xl bg-linear-to-r from-cocoa to-ocean px-4 py-3 text-sm font-semibold text-white shadow-[0_10px_20px_-10px_rgb(var(--ocean)/0.5)] transition hover:-translate-y-0.5 hover:brightness-105"
              >
                {course.id === "html" ? "Open Practice Exercises" : "Open Practice Problems"}
              </Link>
              <Link
                to={describeTopicRoute(basePath, topic) + "/quiz"}
                className="rounded-2xl border border-clay/60 bg-white px-4 py-3 text-sm font-semibold text-ink/75 transition hover:border-ocean/40 hover:text-ink"
              >
                Open Topic Quiz
              </Link>
            </div>
          </article>

          <article className="rounded-3xl border border-clay/50 bg-cream p-5 shadow-[0_18px_34px_-28px_rgb(var(--cocoa)/0.35)]">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink/55">
              Navigation
            </p>
            <div className="mt-4 grid gap-3">
              <Link
                to={`${basePath}/learning/${course.id}`}
                className="rounded-2xl border border-clay/60 bg-white px-4 py-3 text-sm font-semibold text-ink/75 transition hover:border-ocean/40 hover:text-ink"
              >
                Back To {course.title}
              </Link>
              {previousTopic ? (
                <Link
                  to={describeTopicRoute(basePath, previousTopic)}
                  className="rounded-2xl border border-clay/60 bg-white px-4 py-3 text-sm font-semibold text-ink/75 transition hover:border-ocean/40 hover:text-ink"
                >
                  Previous Topic: {previousTopic.title}
                </Link>
              ) : null}
              {nextTopic ? (
                <Link
                  to={describeTopicRoute(basePath, nextTopic)}
                  className="rounded-2xl border border-clay/60 bg-white px-4 py-3 text-sm font-semibold text-ink/75 transition hover:border-ocean/40 hover:text-ink"
                >
                  Next Topic: {nextTopic.title}
                </Link>
              ) : null}
            </div>
          </article>
        </aside>
      </section>
    </LearningPageShell>
  );
}
