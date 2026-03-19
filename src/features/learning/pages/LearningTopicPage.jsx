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

const CodeBlock = ({ children }) => (
  <pre className="overflow-x-auto rounded-2xl bg-slate-950 p-4 text-sm text-slate-100 shadow-inner">
    <code>{children}</code>
  </pre>
);

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
            className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-slate-100"
          >
            {topicState.lessonCompleted ? "Lesson Completed" : "Mark As Completed"}
          </button>
          {canOpenTool && topicToolPath ? (
            <Link
              to={topicToolPath}
              className="rounded-full border border-white/30 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/20"
            >
              {course.toolLabel || course.compilerLabel}
            </Link>
          ) : null}
        </>
      }
    >
      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          <article className="rounded-[1.6rem] border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              Easy explanation
            </p>
            <p className="mt-3 text-sm leading-7 text-slate-700">{topic.explanation}</p>
          </article>

          <article className="rounded-[1.6rem] border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              Syntax
            </p>
            <div className="mt-3">
              <CodeBlock>{topic.syntax}</CodeBlock>
            </div>
          </article>

          <article className="rounded-[1.6rem] border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              {isCssCourse ? "Example HTML and CSS" : "Example code"}
            </p>
            {isCssCourse && topic.exampleHtml ? (
              <>
                <p className="mt-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                  Example HTML
                </p>
                <div className="mt-2">
                  <CodeBlock>{topic.exampleHtml}</CodeBlock>
                </div>
                <p className="mt-4 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                  Example CSS
                </p>
                <div className="mt-2">
                  <CodeBlock>{topic.exampleCode}</CodeBlock>
                </div>
              </>
            ) : (
              <div className="mt-3">
                <CodeBlock>{topic.exampleCode}</CodeBlock>
              </div>
            )}
            <p className="mt-4 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              {showRenderedPreview ? "Rendered preview" : "Output"}
            </p>
            <div className="mt-3">
              {showRenderedPreview ? (
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                  <iframe
                    title={`${topic.title} preview`}
                    sandbox="allow-same-origin"
                    srcDoc={previewSource}
                    className="min-h-[220px] w-full bg-white"
                  />
                </div>
              ) : (
                <CodeBlock>{topic.output}</CodeBlock>
              )}
            </div>
            {showRenderedPreview ? (
              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                  Preview note
                </p>
                <p className="mt-2 text-sm text-slate-700">{topic.output}</p>
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
            <article className="rounded-[1.6rem] border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                Notes
              </p>
              <ul className="mt-3 space-y-3 text-sm text-slate-700">
                {topic.notes.map((item) => (
                  <li key={item} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    {item}
                  </li>
                ))}
              </ul>
            </article>
            {topic.keyPoints?.length ? (
              <article className="rounded-[1.6rem] border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Key points
                </p>
                <ul className="mt-3 space-y-3 text-sm text-slate-700">
                  {topic.keyPoints.map((item) => (
                    <li
                      key={item}
                      className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3"
                    >
                      {item}
                    </li>
                  ))}
                </ul>
              </article>
            ) : null}
            <article className="rounded-[1.6rem] border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                Common mistakes
              </p>
              <ul className="mt-3 space-y-3 text-sm text-slate-700">
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
          <article className="rounded-[1.6rem] border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              Topic progress
            </p>
            <p className="mt-2 text-3xl font-bold text-slate-900">{topicProgress}%</p>
            <div className="mt-4 h-3 rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-slate-900 transition-all"
                style={{ width: `${topicProgress}%` }}
              />
            </div>
            <div className="mt-4 grid gap-3">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                Lesson: {topicState.lessonCompleted ? "Completed" : "Pending"}
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                Quiz: {topicState.quizPassed ? "Passed" : "Not passed"}
              </div>
            </div>
          </article>

          <article className="rounded-[1.6rem] border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              Practice and quiz
            </p>
            <div className="mt-4 grid gap-3">
              <Link
                to={describeTopicRoute(basePath, topic) + "/practice"}
                className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-700"
              >
                {course.id === "html" ? "Open Practice Exercises" : "Open Practice Problems"}
              </Link>
              <Link
                to={describeTopicRoute(basePath, topic) + "/quiz"}
                className="rounded-2xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Open Topic Quiz
              </Link>
            </div>
          </article>

          <article className="rounded-[1.6rem] border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              Navigation
            </p>
            <div className="mt-4 grid gap-3">
              <Link
                to={`${basePath}/learning/${course.id}`}
                className="rounded-2xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Back To {course.title}
              </Link>
              {previousTopic ? (
                <Link
                  to={describeTopicRoute(basePath, previousTopic)}
                  className="rounded-2xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Previous Topic: {previousTopic.title}
                </Link>
              ) : null}
              {nextTopic ? (
                <Link
                  to={describeTopicRoute(basePath, nextTopic)}
                  className="rounded-2xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
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
