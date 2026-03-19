import { useMemo } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "../../../state/auth.jsx";
import LearningPageShell from "../../learning/components/LearningPageShell.jsx";
import { useLearningCatalog } from "../../learning/hooks/useLearningCatalog.js";
import { useLearningProgress } from "../../learning/hooks/useLearningProgress.js";
import { describeTopicRoute } from "../../learning/data/catalog.js";
import { getLearningBasePath, getLearningTabs } from "../../learning/lib/navigation.js";
import HtmlEditorWorkspace from "../components/HtmlEditorWorkspace.jsx";
import {
  DEFAULT_HTML_TEMPLATE,
  HTML_EDITOR_EXAMPLES,
  getHtmlEditorExampleById,
} from "../data/examples.js";

export default function HtmlEditorPage() {
  const { exampleId = "" } = useParams();
  const [searchParams] = useSearchParams();
  const { role } = useAuth();
  const basePath = getLearningBasePath(role);
  const tabs = getLearningTabs(basePath);
  const { catalog } = useLearningCatalog();
  const { progress, toggleProblemSolved } = useLearningProgress(catalog);
  const topicIdFromQuery = searchParams.get("topicId") || "";
  const problemId = searchParams.get("problemId") || "";
  const requestedId = topicIdFromQuery || exampleId;
  const topic =
    catalog.topicsById[requestedId] ||
    Object.values(catalog.topicsById).find((item) => item.slug === requestedId) ||
    null;
  const builtInExample = getHtmlEditorExampleById(exampleId);
  const practiceProblem =
    topic && problemId
      ? (topic.practiceProblems || []).find((item) => item.id === problemId) || null
      : null;
  const topicState = topic ? progress.topicStates[topic.id] || {} : {};
  const isPracticeSolved = practiceProblem
    ? (topicState.solvedProblemIds || []).includes(practiceProblem.id)
    : false;

  const sourceExample = useMemo(() => {
    if (topic?.courseId === "html") {
      return {
        id: topic.id,
        title: `${topic.title} Example`,
        description: topic.summary,
        code: topic.exampleCode || DEFAULT_HTML_TEMPLATE,
      };
    }

    if (builtInExample) {
      return builtInExample;
    }

    return {
      id: "starter-template",
      title: "Starter Template",
      description: "Default HTML starter page",
      code: DEFAULT_HTML_TEMPLATE,
    };
  }, [builtInExample, topic]);

  const editorExamples = useMemo(() => {
    const baseExamples = HTML_EDITOR_EXAMPLES.filter((item) => item.id !== sourceExample.id);
    return sourceExample ? [sourceExample, ...baseExamples] : baseExamples;
  }, [sourceExample]);

  return (
    <LearningPageShell
      badge="HTML Editor Module"
      title="HTML Editor"
      subtitle="Write HTML on the left, run it instantly, preview the browser output, and save your practice snippets."
      tabs={tabs}
      actions={
        <>
          {topic ? (
            <Link
              to={describeTopicRoute(basePath, topic)}
              className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-slate-100"
            >
              Back To Topic
            </Link>
          ) : null}
          <Link
            to={`${basePath}/learning`}
            className="rounded-full border border-white/30 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/20"
          >
            Learning Home
          </Link>
        </>
      }
    >
      <HtmlEditorWorkspace
        key={`${topic?.id || sourceExample.id}:${problemId || "base"}`}
        heading={practiceProblem ? `${practiceProblem.title} Editor` : "HTML Try It Yourself"}
        description={
          practiceProblem
            ? "Edit the starter HTML, run it, and mark the linked practice exercise when you finish."
            : topic
            ? `Edit the ${topic.title} example and preview the output instantly.`
            : "Load an example or start from the default template."
        }
        initialCode={sourceExample.code}
        initialTitle={sourceExample.title}
        exampleOptions={editorExamples}
        allowSave
        sourceId={topic?.id || sourceExample.id}
        sourceTitle={topic?.title || sourceExample.title}
        practiceTopicId={topic?.id || ""}
        practiceProblemId={practiceProblem?.id || ""}
        isPracticeSolved={isPracticeSolved}
        onTogglePracticeSolved={toggleProblemSolved}
      />
    </LearningPageShell>
  );
}
