import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Code2,
  Copy,
  Play,
  RotateCcw,
  TerminalSquare,
  Trash2,
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
import { CPP_CHALLENGES } from "../lib/codeLearningChallenges";
import {
  isProgramOutputMatch,
  normalizeProgramOutput,
  runNativeCode,
} from "../lib/nativeCodeRunner";

const DEFAULT_CPP_CODE = `#include <iostream>
using namespace std;

int main() {
    int number;
    cout << "Enter an integer: ";
    cin >> number;

    if (number % 2 == 0) {
        cout << number << " is an even number." << endl;
    } else {
        cout << number << " is an odd number." << endl;
    }

    return 0;
}
`;

const CPP_DRAFT_STORAGE_KEY = "ckcethub_code_draft_cpp_v1";
const CPP_CHALLENGE_PROGRESS_STORAGE_KEY =
  "ckcethub_challenge_progress_cpp_v1";

const CPP_CORE_CONCEPTS = [
  {
    topic: "Variables and Data Types",
    definition:
      "Variables store data, and data types define the kind of value a variable can hold, such as int, double, char, bool, and std::string.",
    syntax:
      "int age = 20;\ndouble price = 99.5;\nchar grade = 'A';\nbool isActive = true;\nstd::string name = \"Alice\";",
    example:
      "#include <iostream>\n#include <string>\nusing namespace std;\n\nint main() {\n    int age = 20;\n    double price = 99.5;\n    char grade = 'A';\n    bool isActive = true;\n    string name = \"Alice\";\n\n    cout << name << \" \" << age << \" \" << price << \" \" << grade << \" \" << isActive << endl;\n    return 0;\n}",
    output: "Alice 20 99.5 A 1",
  },
  {
    topic: "Input and Output (I/O)",
    definition:
      "Use std::cin to read input from the keyboard and std::cout to print output to the console.",
    syntax:
      "std::cin >> variable;\nstd::cout << \"Text\" << variable << std::endl;",
    example:
      "#include <iostream>\nusing namespace std;\n\nint main() {\n    int number;\n    cin >> number;\n    cout << \"You entered: \" << number << endl;\n    return 0;\n}",
    output: "(Input) 7\nYou entered: 7",
  },
  {
    topic: "Operators",
    definition:
      "Operators are symbols used to perform mathematical and logical operations on values and variables, such as +, -, *, /, and %.",
    syntax:
      "int a = 10, b = 3;\nint sum = a + b;\nint diff = a - b;\nint prod = a * b;\nint quot = a / b;\nint rem = a % b;",
    example:
      "#include <iostream>\nusing namespace std;\n\nint main() {\n    int a = 10, b = 3;\n    cout << a + b << \" \" << a - b << \" \" << a * b << \" \" << a / b << \" \" << a % b << endl;\n    return 0;\n}",
    output: "13 7 30 3 1",
  },
  {
    topic: "Control Flow Statements",
    definition:
      "Control flow statements define the order of execution. They include conditionals and loops.",
    syntax:
      "if (condition) { ... } else if (condition) { ... } else { ... }\nfor (init; condition; step) { ... }\nwhile (condition) { ... }\ndo { ... } while (condition);",
    example:
      "#include <iostream>\nusing namespace std;\n\nint main() {\n    int n = 2;\n\n    if (n > 0) {\n        cout << \"positive\" << endl;\n    } else if (n == 0) {\n        cout << \"zero\" << endl;\n    } else {\n        cout << \"negative\" << endl;\n    }\n\n    for (int i = 1; i <= 3; i++) {\n        cout << i << \" \";\n    }\n    cout << endl;\n\n    return 0;\n}",
    output: "positive\n1 2 3",
  },
  {
    topic: "Conditional Statements",
    definition:
      "if, else if, and else allow different code paths to run depending on conditions.",
    syntax:
      "if (condition1) {\n    // block 1\n} else if (condition2) {\n    // block 2\n} else {\n    // default block\n}",
    example:
      "#include <iostream>\nusing namespace std;\n\nint main() {\n    int marks = 72;\n    if (marks >= 90) {\n        cout << \"Grade A\" << endl;\n    } else if (marks >= 60) {\n        cout << \"Grade B\" << endl;\n    } else {\n        cout << \"Grade C\" << endl;\n    }\n    return 0;\n}",
    output: "Grade B",
  },
  {
    topic: "Loops",
    definition:
      "for, while, and do-while loops execute a code block repeatedly based on a condition.",
    syntax:
      "for (int i = 0; i < n; i++) { ... }\nwhile (condition) { ... }\ndo { ... } while (condition);",
    example:
      "#include <iostream>\nusing namespace std;\n\nint main() {\n    int i = 1;\n    while (i <= 3) {\n        cout << i << \" \";\n        i++;\n    }\n    cout << endl;\n    return 0;\n}",
    output: "1 2 3",
  },
  {
    topic: "Functions",
    definition:
      "Functions are reusable blocks that perform a specific task, improving modularity, readability, and reuse.",
    syntax:
      "return_type function_name(parameters) {\n    // code\n    return value;\n}",
    example:
      "#include <iostream>\nusing namespace std;\n\nint add(int a, int b) {\n    return a + b;\n}\n\nint main() {\n    cout << add(4, 5) << endl;\n    return 0;\n}",
    output: "9",
  },
];

export default function CppCompilerPage() {
  const [code, setCode] = useState(() =>
    readDraftValue(CPP_DRAFT_STORAGE_KEY, DEFAULT_CPP_CODE)
  );
  const [output, setOutput] = useState("Ready. Click Compile \u25B6 to run.");
  const [isCompiling, setIsCompiling] = useState(false);
  const [stdinValue, setStdinValue] = useState("");
  const [copyCodeStatus, setCopyCodeStatus] = useState("");
  const [copyOutputStatus, setCopyOutputStatus] = useState("");
  const [selectedChallengeId, setSelectedChallengeId] = useState(
    CPP_CHALLENGES[0]?.id || ""
  );
  const [challengeReview, setChallengeReview] = useState(null);
  const [challengeProgress, setChallengeProgress] = useState(() =>
    loadChallengeProgress(CPP_CHALLENGE_PROGRESS_STORAGE_KEY)
  );

  const textareaRef = useRef(null);
  const lineNumbersRef = useRef(null);
  const outputRef = useRef(null);
  const copyCodeTimerRef = useRef(0);
  const copyOutputTimerRef = useRef(0);
  const cppLineNumbers = useMemo(
    () =>
      Array.from({ length: Math.max(1, code.split("\n").length) }, (_, index) => index + 1),
    [code]
  );
  const codeCharacterCount = code.length;
  const selectedChallenge = useMemo(
    () =>
      CPP_CHALLENGES.find((challenge) => challenge.id === selectedChallengeId) ||
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
    saveDraftValue(CPP_DRAFT_STORAGE_KEY, code);
  }, [code]);

  useEffect(
    () => () => {
      if (copyCodeTimerRef.current) {
        window.clearTimeout(copyCodeTimerRef.current);
      }
      if (copyOutputTimerRef.current) {
        window.clearTimeout(copyOutputTimerRef.current);
      }
    },
    []
  );

  const setTransientStatus = (setter, timerRef, value) => {
    setter(value);
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
    }
    timerRef.current = window.setTimeout(() => {
      setter("");
    }, 1200);
  };

  const handleResetCode = () => {
    if (isCompiling) return;
    setCode(DEFAULT_CPP_CODE);
    setCopyCodeStatus("");
  };

  const handleClearOutput = () => {
    if (isCompiling) return;
    setOutput("Output cleared.");
    setCopyOutputStatus("");
  };

  const handleCopyCode = async () => {
    try {
      const copied = await copyTextValue(code);
      setTransientStatus(
        setCopyCodeStatus,
        copyCodeTimerRef,
        copied ? "Copied" : "Copy failed"
      );
    } catch {
      setTransientStatus(setCopyCodeStatus, copyCodeTimerRef, "Copy failed");
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
    } catch {
      setTransientStatus(setCopyOutputStatus, copyOutputTimerRef, "Copy failed");
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

  const handleCompile = async () => {
    if (isCompiling) return;

    setIsCompiling(true);
    setOutput("");

    try {
      const result = await runNativeCode({
        language: "cpp",
        sourceCode: code,
        stdin: stdinValue,
      });
      const text = String(result.output || "");
      setOutput(text.trim() ? text : "Program finished with no output.");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setOutput(`runtime error: ${message}`);
    } finally {
      setIsCompiling(false);
    }
  };

  const handleLoadChallengeStarter = () => {
    if (!selectedChallenge) return;
    setCode(selectedChallenge.starterCode);
    setChallengeReview(null);
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
          language: "cpp",
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
          return;
        }
      }

      const nextProgress = markChallengeSolvedState({
        progress: challengeProgress,
        challengeId: selectedChallenge.id,
      });
      setChallengeProgress(nextProgress);
      saveChallengeProgress(CPP_CHALLENGE_PROGRESS_STORAGE_KEY, nextProgress);
      setChallengeReview({
        status: "pass",
        message: `All ${tests.length} tests passed.`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setChallengeReview({
        status: "error",
        message: `Unable to evaluate challenge: ${message}`,
      });
    } finally {
      setIsCompiling(false);
    }
  };

  return (
    <div className="c-compiler-shell c-compiler-shell--modern">
      <div className="ide-topbar cc-topbar">
        <div className="ide-brand">
          <span className="ide-brand-icon cc-brand-icon" aria-hidden="true">
            <Code2 size={32} strokeWidth={2.2} />
          </span>
          <div>
            <h1 className="ide-brand-title">C++ Compiler</h1>
            <p className="ide-brand-subtitle">
              Native G++ sandbox runtime with C++17-compatible behavior.
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
      </div>
      <div className="ide-toolbar-info cc-toolbar">
        <span className="ide-toolbar-chip">Lines: {cppLineNumbers.length}</span>
        <span className="ide-toolbar-chip">Chars: {codeCharacterCount}</span>
        <span className="ide-toolbar-chip">Runtime: G++</span>
        <span className="ide-toolbar-chip">Run: Ctrl+Enter / Ctrl+S</span>
        <span className="ide-toolbar-chip">Edit: Ctrl+/ Tab Shift+Tab</span>
        <span className="ide-toolbar-chip cc-autosave-chip">
          <Check size={14} aria-hidden="true" />
          Draft Auto-saved
        </span>
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
              <strong>main.cpp</strong>
            </div>
            <span className="cc-syntax-pill">C++17 Syntax</span>
          </div>
          <div className="c-editor-surface">
            <div ref={lineNumbersRef} className="editor-line-numbers" aria-hidden="true">
              {cppLineNumbers.map((line) => (
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
          <div className="ide-console-header cc-basics-header">Key C++ Basics</div>
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
                    {solvedCount}/{CPP_CHALLENGES.length}
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
                  {CPP_CHALLENGES.map((challenge, index) => (
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
            {CPP_CORE_CONCEPTS.map((concept, index) => (
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
    </div>
  );
}
