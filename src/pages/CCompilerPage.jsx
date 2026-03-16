import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Copy,
  Play,
  RotateCcw,
  TerminalSquare,
  Trash2,
  Code2,
} from "lucide-react";
import {
  applyIndentToText,
  applyOutdentToText,
  applyToggleLineComment,
  copyTextValue,
  readDraftValue,
  saveDraftValue,
} from "../lib/codingTools";
import {
  loadChallengeProgress,
  markChallengeSolvedState,
  saveChallengeProgress,
} from "../lib/codeChallengeProgress";
import { C_CHALLENGES } from "../lib/codeLearningChallenges";
import {
  isProgramOutputMatch,
  normalizeProgramOutput,
  runNativeCode,
} from "../lib/nativeCodeRunner";

const DEFAULT_C_CODE = `#include <stdio.h>

int main() {
    printf("Hello, World!\\n");
    return 0;
}
`;

const C_DRAFT_STORAGE_KEY = "ckcethub_code_draft_c_v1";
const C_CHALLENGE_PROGRESS_STORAGE_KEY =
  "ckcethub_challenge_progress_c_v1";

const CORE_CONCEPTS = [
  {
    topic: "Structure of a C Program",
    definition:
      "Every C program starts with preprocessor directives like #include <stdio.h>, then main() as the execution entry point. Code blocks use braces {} and statements end with semicolons (;).",
    syntax:
      "#include <stdio.h>\n\nint main(void) {\n    // statements;\n    return 0;\n}",
    example:
      "#include <stdio.h>\n\nint main(void) {\n    printf(\"Start\\n\");\n    return 0;\n}",
    output: "Start",
  },
  {
    topic: "Variables and Data Types",
    definition:
      "Variables are named storage locations. Data types define what value is stored and memory behavior. Common basics are int, float, and char.",
    syntax:
      "int count = 10;\nfloat price = 99.5f;\nchar grade = 'A';",
    example:
      "#include <stdio.h>\n\nint main(void) {\n    int count = 10;\n    float price = 99.5f;\n    char grade = 'A';\n    printf(\"%d %.1f %c\\n\", count, price, grade);\n    return 0;\n}",
    output: "10 99.5 A",
  },
  {
    topic: "Input/Output (I/O)",
    definition:
      "C uses standard library functions for console interaction: printf() for output and scanf() for input.",
    syntax:
      "printf(\"Hello\\n\");\nscanf(\"%d\", &value);",
    example:
      "#include <stdio.h>\n\nint main(void) {\n    int a, b;\n    scanf(\"%d %d\", &a, &b);\n    printf(\"Sum = %d\\n\", a + b);\n    return 0;\n}",
    output: "(Input) 4 5\nSum = 9",
  },
  {
    topic: "Operators",
    definition:
      "Operators perform arithmetic, relational, and logical operations.\nArithmetic: +, -, *, /, %\nRelational: ==, !=, >, <, >=, <=\nLogical: &&, ||, !",
    syntax:
      "int a = 10, b = 3;\nint sum = a + b;\nint isGreater = a > b;\nint logic = (a > 0 && b > 0);",
    example:
      "#include <stdio.h>\n\nint main(void) {\n    int a = 10, b = 3;\n    printf(\"Arithmetic: %d %d %d %d %d\\n\", a + b, a - b, a * b, a / b, a % b);\n    printf(\"Relational: %d %d\\n\", a > b, a == b);\n    printf(\"Logical: %d %d\\n\", (a > b && b > 0), !(a == b));\n    return 0;\n}",
    output: "Arithmetic: 13 7 30 3 1\nRelational: 1 0\nLogical: 1 1",
  },
  {
    topic: "Control Flow Statements",
    definition:
      "Control flow decides execution order, supports decision making with conditionals and repetition with loops.",
    syntax:
      "if (condition) { ... } else { ... }\nswitch (value) { case 1: ...; break; default: ...; }\nfor (init; condition; step) { ... }\nwhile (condition) { ... }\ndo { ... } while (condition);",
    example:
      "#include <stdio.h>\n\nint main(void) {\n    int n = 2;\n    if (n % 2 == 0) {\n        printf(\"even\\n\");\n    } else {\n        printf(\"odd\\n\");\n    }\n\n    for (int i = 1; i <= 3; i++) {\n        printf(\"%d \", i);\n    }\n    printf(\"\\n\");\n    return 0;\n}",
    output: "even\n1 2 3",
  },
  {
    topic: "Functions",
    definition:
      "Functions are reusable blocks of code for specific tasks. They improve modularity and code reuse.",
    syntax:
      "return_type function_name(parameters) {\n    // statements\n}",
    example:
      "#include <stdio.h>\n\nint add(int a, int b) {\n    return a + b;\n}\n\nint main(void) {\n    printf(\"%d\\n\", add(4, 5));\n    return 0;\n}",
    output: "9",
  },
  {
    topic: "Arrays",
    definition:
      "Arrays store multiple values of the same type in contiguous memory and are accessed with an index.",
    syntax:
      "int marks[3] = {78, 85, 91};\nint first = marks[0];",
    example:
      "#include <stdio.h>\n\nint main(void) {\n    int nums[4] = {2, 4, 6, 8};\n    printf(\"%d %d\\n\", nums[0], nums[3]);\n    return 0;\n}",
    output: "2 8",
  },
  {
    topic: "Pointers",
    definition:
      "Pointers are variables that store addresses of other variables, enabling low-level memory access and efficient data manipulation.",
    syntax:
      "int n = 10;\nint *ptr = &n;\nprintf(\"%d\", *ptr);",
    example:
      "#include <stdio.h>\n\nint main(void) {\n    int n = 10;\n    int *ptr = &n;\n    *ptr = 25;\n    printf(\"%d %d\\n\", n, *ptr);\n    return 0;\n}",
    output: "25 25",
  },
];

export default function CCompilerPage() {
  const [code, setCode] = useState(() =>
    readDraftValue(C_DRAFT_STORAGE_KEY, DEFAULT_C_CODE)
  );
  const [output, setOutput] = useState("Ready. Click Compile \u25B6 to run.");
  const [isCompiling, setIsCompiling] = useState(false);
  const [stdinValue, setStdinValue] = useState("");
  const [copyCodeStatus, setCopyCodeStatus] = useState("");
  const [copyOutputStatus, setCopyOutputStatus] = useState("");
  const [toast, setToast] = useState(null);
  const [selectedChallengeId, setSelectedChallengeId] = useState(
    C_CHALLENGES[0]?.id || ""
  );
  const [challengeReview, setChallengeReview] = useState(null);
  const [challengeProgress, setChallengeProgress] = useState(() =>
    loadChallengeProgress(C_CHALLENGE_PROGRESS_STORAGE_KEY)
  );

  const textareaRef = useRef(null);
  const lineNumbersRef = useRef(null);
  const outputRef = useRef(null);
  const copyCodeTimerRef = useRef(0);
  const copyOutputTimerRef = useRef(0);
  const toastTimerRef = useRef(0);
  const cLineNumbers = useMemo(
    () =>
      Array.from({ length: Math.max(1, code.split("\n").length) }, (_, index) => index + 1),
    [code]
  );
  const codeCharacterCount = code.length;
  const selectedChallenge = useMemo(
    () =>
      C_CHALLENGES.find((challenge) => challenge.id === selectedChallengeId) ||
      null,
    [selectedChallengeId]
  );
  const solvedCount = challengeProgress.solvedIds.length;
  const isSelectedChallengeSolved = selectedChallenge
    ? challengeProgress.solvedIds.includes(selectedChallenge.id)
    : false;

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output]);

  useEffect(() => {
    setChallengeReview(null);
  }, [selectedChallengeId]);

  useEffect(() => {
    saveDraftValue(C_DRAFT_STORAGE_KEY, code);
  }, [code]);

  useEffect(
    () => () => {
      if (copyCodeTimerRef.current) {
        window.clearTimeout(copyCodeTimerRef.current);
      }
      if (copyOutputTimerRef.current) {
        window.clearTimeout(copyOutputTimerRef.current);
      }
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
      }
    },
    []
  );

  useEffect(() => {
    if (!toast) return;
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
    }, 2000);

    return () => {
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, [toast]);

  const setTransientStatus = (setter, timerRef, value) => {
    setter(value);
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
    }
    timerRef.current = window.setTimeout(() => {
      setter("");
    }, 1200);
  };

  const showToast = (message, tone = "info") => {
    setToast({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      message,
      tone,
    });
  };

  const handleResetCode = () => {
    if (isCompiling) return;
    setCode(DEFAULT_C_CODE);
    setCopyCodeStatus("");
    showToast("Starter code restored.", "info");
  };

  const handleClearOutput = () => {
    if (isCompiling) return;
    setOutput("Output cleared.");
    setCopyOutputStatus("");
    showToast("Output cleared.", "info");
  };

  const handleCopyCode = async () => {
    try {
      const copied = await copyTextValue(code);
      setTransientStatus(
        setCopyCodeStatus,
        copyCodeTimerRef,
        copied ? "Copied" : "Copy failed"
      );
      showToast(
        copied ? "Code copied to clipboard." : "Unable to copy code.",
        copied ? "success" : "error"
      );
    } catch {
      setTransientStatus(setCopyCodeStatus, copyCodeTimerRef, "Copy failed");
      showToast("Unable to copy code.", "error");
    }
  };

  const handleCopyOutput = async () => {
    try {
      const copied = await copyTextValue(output);
      setTransientStatus(
        setCopyOutputStatus,
        copyOutputTimerRef,
        copied ? "Copied" : "Copy failed"
      );
      showToast(
        copied ? "Output copied to clipboard." : "Unable to copy output.",
        copied ? "success" : "error"
      );
    } catch {
      setTransientStatus(setCopyOutputStatus, copyOutputTimerRef, "Copy failed");
      showToast("Unable to copy output.", "error");
    }
  };

  const handleCompile = async () => {
    if (isCompiling) return;

    setIsCompiling(true);
    setOutput("");

    try {
      const result = await runNativeCode({
        language: "c",
        sourceCode: code,
        stdin: stdinValue,
      });
      const text = String(result.output || "");
      setOutput(text.trim() ? text : "Program finished with no output.");
      showToast("Executed using native GCC sandbox.", "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setOutput(`runtime error: ${message}`);
      showToast("Compile or runtime error occurred.", "error");
    } finally {
      setIsCompiling(false);
    }
  };

  const handleLoadChallengeStarter = () => {
    if (!selectedChallenge) return;
    setCode(selectedChallenge.starterCode);
    setChallengeReview(null);
    showToast(`Loaded starter for ${selectedChallenge.title}.`, "info");
  };

  const handleCheckChallenge = async () => {
    if (!selectedChallenge || isCompiling) return;
    setIsCompiling(true);
    setChallengeReview(null);

    try {
      const tests = Array.isArray(selectedChallenge.tests)
        ? selectedChallenge.tests
        : [];
      for (let index = 0; index < tests.length; index += 1) {
        const test = tests[index];
        const result = await runNativeCode({
          language: "c",
          sourceCode: code,
          stdin: String(test.stdin || ""),
        });

        if (
          !isProgramOutputMatch(result.output, String(test.expectedOutput || ""))
        ) {
          setChallengeReview({
            status: "fail",
            message: `Failed test ${index + 1}/${tests.length}.`,
            expectedOutput: normalizeProgramOutput(test.expectedOutput),
            actualOutput: normalizeProgramOutput(result.output),
          });
          showToast("Challenge failed on one or more tests.", "error");
          return;
        }
      }

      const nextProgress = markChallengeSolvedState({
        progress: challengeProgress,
        challengeId: selectedChallenge.id,
      });
      setChallengeProgress(nextProgress);
      saveChallengeProgress(C_CHALLENGE_PROGRESS_STORAGE_KEY, nextProgress);
      setChallengeReview({
        status: "pass",
        message: `All ${tests.length} tests passed.`,
      });
      showToast("Challenge solved and progress updated.", "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setChallengeReview({
        status: "error",
        message: `Unable to evaluate challenge: ${message}`,
      });
      showToast("Challenge check failed.", "error");
    } finally {
      setIsCompiling(false);
    }
  };

  const handleEditorScroll = (event) => {
    if (lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = event.target.scrollTop;
    }
  };

  const handleEditorKeyDown = (event) => {
    const usesModifier = event.ctrlKey || event.metaKey;
    const key = String(event.key || "").toLowerCase();

    if (usesModifier && key === "enter") {
      event.preventDefault();
      handleCompile();
      return;
    }

    if (usesModifier && key === "s") {
      event.preventDefault();
      handleCompile();
      return;
    }

    if (usesModifier && key === "/") {
      event.preventDefault();
      const target = event.currentTarget;
      const edit = applyToggleLineComment({
        value: code,
        selectionStart: target.selectionStart,
        selectionEnd: target.selectionEnd,
        commentToken: "//",
      });
      setCode(edit.value);
      window.requestAnimationFrame(() => {
        target.focus();
        target.setSelectionRange(edit.selectionStart, edit.selectionEnd);
      });
      return;
    }

    if (event.key !== "Tab") return;

    event.preventDefault();
    const target = event.currentTarget;
    const edit = event.shiftKey
      ? applyOutdentToText({
          value: code,
          selectionStart: target.selectionStart,
          selectionEnd: target.selectionEnd,
        })
      : applyIndentToText({
          value: code,
          selectionStart: target.selectionStart,
          selectionEnd: target.selectionEnd,
        });
    setCode(edit.value);

    window.requestAnimationFrame(() => {
      target.focus();
      target.setSelectionRange(edit.selectionStart, edit.selectionEnd);
    });
  };

  return (
    <div className="c-compiler-shell c-compiler-shell--modern">
      <div className="ide-topbar cc-topbar">
        <div className="ide-brand">
          <span className="ide-brand-icon cc-brand-icon" aria-hidden="true">
            <Code2 size={32} strokeWidth={2.2} />
          </span>
          <div>
            <h1 className="ide-brand-title">C Compiler</h1>
            <p className="ide-brand-subtitle">
              Native GCC sandbox runtime with C11-compatible behavior.
            </p>
          </div>
        </div>
        <div className="ide-actions cc-actions">
          <button
            type="button"
            className="ide-run"
            onClick={handleCompile}
            disabled={isCompiling}
          >
            <Play size={16} aria-hidden="true" />
            {isCompiling ? "Compiling..." : "Compile \u25B6"}
          </button>
          <button
            type="button"
            className="ide-ghost-btn"
            onClick={handleResetCode}
            disabled={isCompiling}
          >
            <RotateCcw size={16} aria-hidden="true" />
            Reset
          </button>
          <button
            type="button"
            className="ide-ghost-btn"
            onClick={handleClearOutput}
            disabled={isCompiling}
          >
            <Trash2 size={16} aria-hidden="true" />
            Clear Output
          </button>
          <button
            type="button"
            className="ide-ghost-btn"
            onClick={handleCopyCode}
          >
            <Copy size={16} aria-hidden="true" />
            {copyCodeStatus || "Copy Code"}
          </button>
        </div>

        <div className="cc-divider" />
        <div className="ide-toolbar-info cc-toolbar">
        <span className="ide-toolbar-chip">Lines: {cLineNumbers.length}</span>
        <span className="ide-toolbar-chip">Chars: {codeCharacterCount}</span>
          <span className="ide-toolbar-chip">Runtime: GCC</span>
          <span className="ide-toolbar-chip">Run: Ctrl+Enter / Ctrl+S</span>
          <span className="ide-toolbar-chip">Edit: Ctrl+/ Tab Shift+Tab</span>
          <span className="ide-toolbar-chip cc-autosave-chip">
            <Check size={14} aria-hidden="true" />
            Draft Auto-saved
          </span>
        </div>
      </div>

      <div className="ide-main cc-workspace">
        <div className="ide-panel cc-editor-panel">
          <div className="ide-panel-header cc-panel-header">
            <div className="cc-panel-meta">
              <span className="cc-traffic" aria-hidden="true">
                <span className="cc-dot cc-dot--red" />
                <span className="cc-dot cc-dot--amber" />
                <span className="cc-dot cc-dot--green" />
              </span>
              <strong>main.c</strong>
            </div>
            <span className="cc-syntax-pill">C11 Syntax</span>
          </div>
          <div className="c-editor-surface">
            <div ref={lineNumbersRef} className="editor-line-numbers" aria-hidden="true">
              {cLineNumbers.map((line) => (
                <span key={line}>{line}</span>
              ))}
            </div>
            <textarea
              ref={textareaRef}
              value={code}
              onChange={(event) => setCode(event.target.value)}
              onKeyDown={handleEditorKeyDown}
              onScroll={handleEditorScroll}
              spellCheck="false"
              autoCapitalize="off"
              autoCorrect="off"
              className="c-editor-input"
            />
          </div>
        </div>

        <div className="ide-panel cc-output-panel">
          <div className="ide-panel-header cc-panel-header">
            <div className="cc-output-title">
              <TerminalSquare size={18} aria-hidden="true" />
              <span>Output</span>
            </div>
            <button
              type="button"
              className="ide-ghost-btn cc-inline-copy-btn"
              onClick={handleCopyOutput}
            >
              <Copy size={15} aria-hidden="true" />
              {copyOutputStatus || "Copy Output"}
            </button>
          </div>
          <pre ref={outputRef} className="ide-console cc-console">
            {output}
          </pre>
          <div className="ide-console-input-row">
            <span className="ide-console-input-prompt">Stdin:</span>
            <input
              className="ide-console-input"
              type="text"
              value={stdinValue}
              onChange={(event) => setStdinValue(event.target.value)}
              placeholder="Optional input for this run"
            />
          </div>
        </div>

        <div className="ide-panel cc-basics-panel">
          <div className="ide-console-header cc-basics-header">Key C Basics</div>
          <div className="mt-3 px-3 sm:px-4">
            <section className="cc-concept-card">
              <h2 className="text-sm font-semibold text-slate-50">
                Challenge Mode
              </h2>
              <p className="mt-1 text-xs text-slate-200/90">
                Run automated test cases and track solved progress locally.
              </p>

              <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-100 sm:grid-cols-4">
                <div className="rounded-md border border-white/15 bg-slate-900/30 p-2">
                  <p className="text-slate-300">Solved</p>
                  <p className="font-semibold">
                    {solvedCount}/{C_CHALLENGES.length}
                  </p>
                </div>
                <div className="rounded-md border border-white/15 bg-slate-900/30 p-2">
                  <p className="text-slate-300">Streak</p>
                  <p className="font-semibold">{challengeProgress.dailyStreak}</p>
                </div>
                <div className="rounded-md border border-white/15 bg-slate-900/30 p-2">
                  <p className="text-slate-300">Best</p>
                  <p className="font-semibold">{challengeProgress.bestStreak}</p>
                </div>
                <div className="rounded-md border border-white/15 bg-slate-900/30 p-2">
                  <p className="text-slate-300">Total</p>
                  <p className="font-semibold">{challengeProgress.totalSolved}</p>
                </div>
              </div>

              <label className="mt-3 block text-xs text-slate-100">
                <span className="font-semibold">Select challenge</span>
                <select
                  className="mt-1 w-full rounded-md border border-white/20 bg-slate-900/40 px-2 py-2 text-xs text-slate-100"
                  value={selectedChallengeId}
                  onChange={(event) => setSelectedChallengeId(event.target.value)}
                >
                  {C_CHALLENGES.map((challenge, index) => (
                    <option key={challenge.id} value={challenge.id}>
                      {index + 1}. {challenge.title} ({challenge.difficulty})
                    </option>
                  ))}
                </select>
              </label>

              {selectedChallenge ? (
                <div className="mt-3 text-xs text-slate-200/90">
                  <p className="font-semibold text-slate-100">
                    {selectedChallenge.title}
                  </p>
                  <p className="mt-1">{selectedChallenge.statement}</p>
                  <p className="mt-2">
                    <span className="font-semibold text-slate-100">Input: </span>
                    {selectedChallenge.inputFormat}
                  </p>
                  <p className="mt-1">
                    <span className="font-semibold text-slate-100">Output: </span>
                    {selectedChallenge.outputFormat}
                  </p>
                  <p className="mt-1">
                    <span className="font-semibold text-slate-100">Hint: </span>
                    {selectedChallenge.hint}
                  </p>
                  <p className="mt-1 text-emerald-300">
                    {isSelectedChallengeSolved
                      ? "Status: Solved"
                      : "Status: Not solved"}
                  </p>
                </div>
              ) : null}

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="ide-ghost-btn"
                  onClick={handleLoadChallengeStarter}
                  disabled={isCompiling || !selectedChallenge}
                >
                  Load Starter
                </button>
                <button
                  type="button"
                  className="ide-run"
                  onClick={handleCheckChallenge}
                  disabled={isCompiling || !selectedChallenge}
                >
                  {isCompiling ? "Checking..." : "Check Tests"}
                </button>
              </div>

              {challengeReview ? (
                <div
                  className={`mt-3 rounded-md border p-2 text-xs ${
                    challengeReview.status === "pass"
                      ? "border-emerald-300/60 bg-emerald-50/10 text-emerald-100"
                      : challengeReview.status === "fail"
                      ? "border-amber-300/60 bg-amber-50/10 text-amber-100"
                      : "border-rose-300/60 bg-rose-50/10 text-rose-100"
                  }`}
                >
                  <p className="font-semibold">{challengeReview.message}</p>
                  {challengeReview.expectedOutput !== undefined ? (
                    <div className="mt-2">
                      <p className="font-semibold">Expected:</p>
                      <pre className="cc-concept-pre cc-concept-pre--output">
                        {challengeReview.expectedOutput}
                      </pre>
                    </div>
                  ) : null}
                  {challengeReview.actualOutput !== undefined ? (
                    <div className="mt-2">
                      <p className="font-semibold">Actual:</p>
                      <pre className="cc-concept-pre cc-concept-pre--output">
                        {challengeReview.actualOutput}
                      </pre>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </section>
          </div>
          <div className="mt-3 grid gap-3 px-3 pb-4 sm:px-4">
            {CORE_CONCEPTS.map((concept, index) => (
              <section
                key={concept.topic}
                className="cc-concept-card"
              >
                <h2 className="text-sm font-semibold text-slate-50">
                  {index + 1}. {concept.topic}
                </h2>
                <div className="mt-2 grid gap-2 text-xs text-slate-200/90">
                  <p>
                    <span className="font-semibold text-slate-100">Definition: </span>
                    {concept.definition}
                  </p>
                  <div>
                    <p className="font-semibold text-slate-100">Syntax:</p>
                    <pre className="cc-concept-pre">
                      {concept.syntax}
                    </pre>
                  </div>
                  <div>
                    <p className="font-semibold text-slate-100">Example:</p>
                    <pre className="cc-concept-pre">
                      {concept.example}
                    </pre>
                  </div>
                  <div>
                    <p className="font-semibold text-slate-100">Output:</p>
                    <pre className="cc-concept-pre cc-concept-pre--output">
                      {concept.output}
                    </pre>
                  </div>
                </div>
              </section>
            ))}
          </div>
        </div>
      </div>

      {toast ? (
        <div
          key={toast.id}
          role="status"
          aria-live="polite"
          className={`cc-toast cc-toast--${toast.tone || "info"}`}
        >
          {toast.message}
        </div>
      ) : null}
    </div>
  );
}
