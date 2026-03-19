import { useMemo, useState } from "react";
import {
  DEFAULT_HTML_TEMPLATE,
  HTML_EDITOR_EXAMPLES,
} from "../data/examples.js";
import { useHtmlEditorPersistence } from "../hooks/useHtmlEditorPersistence.js";
import {
  downloadHtmlCode,
  getHtmlLineNumbers,
  getHtmlValidationHints,
} from "../lib/htmlEditor.js";

const baseButtonClass =
  "rounded-full px-4 py-2 text-sm font-semibold transition";

const primaryButtonClass = `${baseButtonClass} bg-slate-900 text-white hover:bg-slate-700`;
const secondaryButtonClass =
  `${baseButtonClass} border border-slate-300 bg-white text-slate-700 hover:bg-slate-50`;

const getEditorShellClassName = (fullscreen, compact) =>
  fullscreen
    ? "fixed inset-4 z-50 overflow-auto rounded-[1.6rem] border border-slate-200 bg-white p-5 shadow-2xl"
    : compact
    ? "rounded-[1.6rem] border border-slate-200 bg-white p-5 shadow-sm"
    : "rounded-[1.6rem] border border-slate-200 bg-white p-5 shadow-sm";

export default function HtmlEditorWorkspace({
  heading = "HTML Editor",
  description = "Write HTML on the left, run it, and preview the result on the right.",
  initialCode = DEFAULT_HTML_TEMPLATE,
  initialTitle = "HTML Practice Snippet",
  exampleOptions = HTML_EDITOR_EXAMPLES,
  allowSave = true,
  compact = false,
  sourceId = "",
  sourceTitle = "",
  practiceTopicId = "",
  practiceProblemId = "",
  isPracticeSolved = false,
  onTogglePracticeSolved = null,
}) {
  const [code, setCode] = useState(initialCode);
  const [previewCode, setPreviewCode] = useState(initialCode);
  const [snippetTitle, setSnippetTitle] = useState(initialTitle);
  const [currentSnippetId, setCurrentSnippetId] = useState("");
  const [selectedSnippetId, setSelectedSnippetId] = useState("");
  const [selectedExampleId, setSelectedExampleId] = useState("");
  const [recentExampleIds, setRecentExampleIds] = useState([]);
  const [autoRun, setAutoRun] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [editorTheme, setEditorTheme] = useState("dark");
  const {
    snippets,
    loading,
    error,
    saveSnippet,
    saveEditorHistory,
    savePracticeProgress,
  } = useHtmlEditorPersistence();
  const showSnippetControls = allowSave && !compact;

  const availableExamples = useMemo(
    () => (Array.isArray(exampleOptions) && exampleOptions.length ? exampleOptions : HTML_EDITOR_EXAMPLES),
    [exampleOptions]
  );
  const lineNumbers = useMemo(() => getHtmlLineNumbers(code), [code]);
  const validationHints = useMemo(() => getHtmlValidationHints(code), [code]);
  const activePreviewCode = autoRun ? code : previewCode;

  const handleRun = async () => {
    setPreviewCode(code);
    setStatusMessage("Preview updated.");
    await saveEditorHistory({
      lastSnippetId: currentSnippetId,
      lastExampleId: selectedExampleId || sourceId,
      recentExampleIds,
    });
  };

  const handleReset = () => {
    setCode(initialCode);
    setPreviewCode(initialCode);
    setCurrentSnippetId("");
    setSelectedSnippetId("");
    setStatusMessage("Editor reset to the starter template.");
  };

  const handleClear = () => {
    setCode("");
    setPreviewCode("");
    setCurrentSnippetId("");
    setSelectedSnippetId("");
    setStatusMessage("Editor cleared.");
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setStatusMessage("Code copied.");
    } catch {
      setStatusMessage("Unable to copy code on this device.");
    }
  };

  const handleSave = async () => {
    if (!allowSave) {
      return;
    }

    const saved = await saveSnippet({
      id: currentSnippetId,
      title: snippetTitle,
      code,
      sourceId,
      sourceTitle,
    });

    setCurrentSnippetId(saved.id);
    setSelectedSnippetId(saved.id);
    setStatusMessage("HTML snippet saved.");
    await saveEditorHistory({
      lastSnippetId: saved.id,
      lastExampleId: selectedExampleId || sourceId,
      recentExampleIds,
    });
  };

  const handleLoadExample = async (exampleId) => {
    setSelectedExampleId(exampleId);
    const nextExample = availableExamples.find((item) => item.id === exampleId);
    if (!nextExample) {
      return;
    }

    setCode(nextExample.code);
    setPreviewCode(nextExample.code);
    setSnippetTitle(nextExample.title);
    setCurrentSnippetId("");
    setSelectedSnippetId("");
    const nextRecent = [exampleId, ...recentExampleIds.filter((item) => item !== exampleId)].slice(
      0,
      8
    );
    setRecentExampleIds(nextRecent);
    setStatusMessage(`${nextExample.title} loaded.`);
    await saveEditorHistory({
      lastSnippetId: "",
      lastExampleId: exampleId,
      recentExampleIds: nextRecent,
    });
  };

  const handleLoadSnippet = async (snippetId) => {
    setSelectedSnippetId(snippetId);
    const nextSnippet = snippets.find((item) => item.id === snippetId);
    if (!nextSnippet) {
      return;
    }

    setCode(nextSnippet.code);
    setPreviewCode(nextSnippet.code);
    setSnippetTitle(nextSnippet.title);
    setCurrentSnippetId(nextSnippet.id);
    setStatusMessage("Saved snippet loaded.");
    await saveEditorHistory({
      lastSnippetId: nextSnippet.id,
      lastExampleId: selectedExampleId || sourceId,
      recentExampleIds,
    });
  };

  const handleDownload = () => {
    downloadHtmlCode({ code, title: snippetTitle || sourceTitle || "html-practice" });
    setStatusMessage("HTML file downloaded.");
  };

  const handleTogglePractice = async () => {
    if (!onTogglePracticeSolved || !practiceTopicId) {
      return;
    }

    await onTogglePracticeSolved(practiceTopicId, practiceProblemId);
    await savePracticeProgress({
      topicId: practiceTopicId,
      problemId: practiceProblemId,
      snippetId: currentSnippetId,
    });
    setStatusMessage(
      isPracticeSolved ? "Practice marked as pending." : "Practice marked as completed."
    );
  };

  const editorToneClass =
    editorTheme === "light"
      ? "bg-slate-50 text-slate-800"
      : "bg-slate-950 text-slate-100";

  return (
    <section className={getEditorShellClassName(fullscreen, compact)}>
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              Try It Yourself
            </p>
            <h2 className="mt-1 text-2xl font-bold text-slate-900">{heading}</h2>
            <p className="mt-2 text-sm text-slate-600">{description}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void handleRun()} className={primaryButtonClass}>
              Run Code
            </button>
            <button type="button" onClick={handleReset} className={secondaryButtonClass}>
              Reset
            </button>
            <button type="button" onClick={() => void handleCopy()} className={secondaryButtonClass}>
              Copy Code
            </button>
            <button type="button" onClick={handleClear} className={secondaryButtonClass}>
              Clear
            </button>
            {allowSave ? (
              <button type="button" onClick={() => void handleSave()} className={secondaryButtonClass}>
                Save
              </button>
            ) : null}
            <button type="button" onClick={handleDownload} className={secondaryButtonClass}>
              Download
            </button>
            <button
              type="button"
              onClick={() => setFullscreen((value) => !value)}
              className={secondaryButtonClass}
            >
              {fullscreen ? "Exit Full Screen" : "Full Screen"}
            </button>
          </div>
        </div>

        <div
          className={`grid gap-3 ${
            showSnippetControls
              ? "lg:grid-cols-[minmax(0,1fr)_220px_220px]"
              : "lg:grid-cols-[minmax(0,1fr)_220px]"
          }`}
        >
          {allowSave ? (
            <label className="grid gap-2 text-sm font-medium text-slate-700">
              Snippet title
              <input
                value={snippetTitle}
                onChange={(event) => setSnippetTitle(event.target.value)}
                className="rounded-2xl border border-slate-300 px-4 py-2.5 outline-none transition focus:border-slate-900"
                placeholder="HTML practice snippet"
              />
            </label>
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              {sourceTitle || "Topic example loaded"}
            </div>
          )}

          <label className="grid gap-2 text-sm font-medium text-slate-700">
            Load example
            <select
              value={selectedExampleId}
              onChange={(event) => void handleLoadExample(event.target.value)}
              className="rounded-2xl border border-slate-300 px-4 py-2.5 outline-none transition focus:border-slate-900"
            >
              <option value="">Choose example</option>
              {availableExamples.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </select>
          </label>

          {showSnippetControls ? (
            <label className="grid gap-2 text-sm font-medium text-slate-700">
              Saved snippets
              <select
                value={selectedSnippetId}
                onChange={(event) => void handleLoadSnippet(event.target.value)}
                className="rounded-2xl border border-slate-300 px-4 py-2.5 outline-none transition focus:border-slate-900"
              >
                <option value="">{loading ? "Loading..." : "Choose saved snippet"}</option>
                {snippets.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
          <label className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-2">
            <input
              type="checkbox"
              checked={autoRun}
              onChange={(event) => setAutoRun(event.target.checked)}
            />
            Auto-run preview
          </label>
          <label className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-2">
            <input
              type="checkbox"
              checked={editorTheme === "dark"}
              onChange={(event) => setEditorTheme(event.target.checked ? "dark" : "light")}
            />
            Dark editor
          </label>
          {practiceTopicId && onTogglePracticeSolved ? (
            <button type="button" onClick={() => void handleTogglePractice()} className={secondaryButtonClass}>
              {isPracticeSolved ? "Mark Practice Pending" : "Mark Practice Completed"}
            </button>
          ) : null}
        </div>
      </div>

      {(statusMessage || error) && (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          {statusMessage || error}
        </div>
      )}

      <div className={`mt-5 grid gap-5 ${compact ? "" : "xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"}`}>
        <article className="overflow-hidden rounded-[1.4rem] border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
              HTML Code
            </p>
          </div>
          <div className={`grid min-h-[360px] grid-cols-[48px_minmax(0,1fr)] ${editorToneClass}`}>
            <pre className="border-r border-white/10 px-3 py-4 text-right text-xs leading-6 text-slate-400">
              {lineNumbers}
            </pre>
            <textarea
              value={code}
              onChange={(event) => setCode(event.target.value)}
              spellCheck={false}
              className={`min-h-[360px] w-full resize-y border-0 bg-transparent px-4 py-4 font-mono text-sm leading-6 outline-none ${
                editorTheme === "light" ? "text-slate-800" : "text-slate-100"
              }`}
            />
          </div>
        </article>

        <div className="space-y-5">
          <article className="overflow-hidden rounded-[1.4rem] border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                Live Preview
              </p>
            </div>
            <iframe
              title="HTML Preview"
              sandbox="allow-same-origin"
              srcDoc={activePreviewCode}
              className="min-h-[360px] w-full bg-white"
            />
          </article>

          <article className="rounded-[1.4rem] border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
              Beginner Hints
            </p>
            <div className="mt-3 grid gap-3">
              {validationHints.map((hint) => (
                <div
                  key={hint}
                  className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700"
                >
                  {hint}
                </div>
              ))}
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}
