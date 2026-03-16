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

const AUTOCOMPLETE = [
  { word: "print", detail: "Output text" },
  { word: "import", detail: "Import module" },
  { word: "def", detail: "Define function" },
  { word: "for", detail: "Loop over items" },
  { word: "while", detail: "Repeat while true" },
  { word: "if", detail: "Conditional" },
  { word: "elif", detail: "Else-if" },
  { word: "else", detail: "Fallback branch" },
  { word: "return", detail: "Return value" },
  { word: "range", detail: "Number sequence" },
  { word: "input", detail: "Read user input" },
  { word: "len", detail: "Collection length" },
  { word: "list", detail: "List type" },
  { word: "tuple", detail: "Tuple type" },
  { word: "dict", detail: "Dictionary type" },
  { word: "int", detail: "Integer type" },
  { word: "float", detail: "Float type" },
  { word: "str", detail: "String type" },
  { word: "bool", detail: "Boolean type" },
];

const KEYWORDS = [
  "def",
  "return",
  "if",
  "elif",
  "else",
  "for",
  "while",
  "break",
  "continue",
  "in",
  "True",
  "False",
  "None",
  "and",
  "or",
  "not",
  "class",
  "import",
  "from",
  "as",
  "with",
  "pass",
  "range",
  "print",
];

const DEFAULT_CODE = `print("A3HUB")`;

const PYTHON_DRAFT_STORAGE_KEY = "a3hub_code_draft_python_v1";

const PYTHON_CORE_CONCEPTS = [
  {
    topic: "Variables",
    definition:
      "Variables act as containers to store data. In Python, assign a value using the = sign.",
    syntax: 'name = "Alice"',
    example: 'name = "Alice"\nage = 20\nprint(name)\nprint(age)',
    output: "Alice\n20",
  },
  {
    topic: "Data Types",
    definition:
      "Python has built-in data types: numeric (int, float), string (str), boolean (bool), and collections like list, tuple, and dictionary.",
    syntax:
      'age = 21\nprice = 99.5\nname = "Alice"\nis_active = True\nfruits = ["apple", "banana"]\ncoords = (10, 20)\nstudent = {"name": "Alice", "age": 21}',
    example:
      'age = 21\nprice = 99.5\nname = "Alice"\nis_active = True\nfruits = ["apple", "banana"]\ncoords = (10, 20)\nstudent = {"name": "Alice", "age": 21}\n\nprint(type(age).__name__, type(price).__name__, type(name).__name__)\nprint(type(is_active).__name__, type(fruits).__name__, type(coords).__name__, type(student).__name__)',
    output: "int float str\nbool list tuple dict",
  },
  {
    topic: "Operators",
    definition:
      "Operators are symbols used to perform arithmetic, logical, and comparison operations on values and variables.",
    syntax:
      "Arithmetic: +  -  *  /  //  **\nLogical: and  or  not\nComparison: ==  !=  >  <  >=  <=",
    example:
      "a = 10\nb = 3\n\nprint(a + b, a - b, a * b, a / b, a // b, a ** b)\nprint(a > b and b > 0)\nprint(a == b, a != b, a >= b)",
    output: "13 7 30 3.3333333333333335 3 1000\nTrue\nFalse True True",
  },
  {
    topic: "Control Flow",
    definition:
      "Control flow decides the execution order. Python uses indentation for code blocks and supports conditionals (if/elif/else) and loops (for/while).",
    syntax:
      "if condition:\n    # code block\nelif another_condition:\n    # code block\nelse:\n    # code block\n\nfor item in items:\n    # code block\n\nwhile condition:\n    # code block",
    example:
      'score = 72\n\nif score >= 90:\n    grade = "A"\nelif score >= 60:\n    grade = "B"\nelse:\n    grade = "C"\n\nprint("Grade:", grade)\n\nfor i in range(1, 4):\n    print("for", i)\n\ncount = 1\nwhile count <= 3:\n    print("while", count)\n    count += 1',
    output: "Grade: B\nfor 1\nfor 2\nfor 3\nwhile 1\nwhile 2\nwhile 3",
  },
];

const escapeHtml = (value) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const highlightCode = (value) => {
  const tokenRegex = new RegExp(
    [
      /#[^\n]*/.source,
      /"(?:\\.|[^"\\])*"/.source,
      /'(?:\\.|[^'\\])*'/.source,
      /\\b\\d+(?:\\.\\d+)?\\b/.source,
      `\\b(?:${KEYWORDS.join("|")})\\b`,
    ].join("|"),
    "g"
  );

  let result = "";
  let lastIndex = 0;
  let match;

  while ((match = tokenRegex.exec(value)) !== null) {
    const token = match[0];
    const index = match.index;
    if (index > lastIndex) {
      result += escapeHtml(value.slice(lastIndex, index));
    }

    let className = "token-keyword";
    if (token.startsWith("#")) {
      className = "token-comment";
    } else if (token.startsWith("\"") || token.startsWith("'")) {
      className = "token-string";
    } else if (/^\\d/.test(token)) {
      className = "token-number";
    }

    result += `<span class="${className}">${escapeHtml(token)}</span>`;
    lastIndex = index + token.length;
  }

  result += escapeHtml(value.slice(lastIndex));
  return result;
};

const getCurrentWord = (value, position) => {
  const before = value.slice(0, position);
  const match = before.match(/[A-Za-z_][A-Za-z_0-9]*$/);
  return match ? match[0] : "";
};

const PAIRS = {
  "(": ")",
  "[": "]",
  "{": "}",
  "\"": "\"",
  "'": "'",
};
const SKIP_OVER_KEYS = new Set([")", "]", "}", "\"", "'"]);
const SKULPT_ENGINE_SOURCES = [
  "/vendor/skulpt/skulpt.min.js",
  "https://cdn.jsdelivr.net/npm/skulpt@1.2.0/dist/skulpt.min.js",
  "https://unpkg.com/skulpt@1.2.0/dist/skulpt.min.js",
];
const SKULPT_STDLIB_SOURCES = [
  "/vendor/skulpt/skulpt-stdlib.js",
  "https://cdn.jsdelivr.net/npm/skulpt@1.2.0/dist/skulpt-stdlib.js",
  "https://unpkg.com/skulpt@1.2.0/dist/skulpt-stdlib.js",
];

const ensureScript = (src) =>
  new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      if (existing.dataset.loaded === "true") {
        resolve();
      } else {
        existing.addEventListener("load", resolve, { once: true });
        existing.addEventListener("error", reject, { once: true });
      }
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.dataset.loaded = "false";
    script.addEventListener("load", () => {
      script.dataset.loaded = "true";
      resolve();
    });
    script.addEventListener("error", reject);
    document.body.appendChild(script);
  });

const ensureAnyScript = async (sources) => {
  let lastError = null;
  for (const src of sources) {
    try {
      await ensureScript(src);
      return src;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("Unable to load script.");
};

export default function PythonInterpreterPage() {
  const isWindowsPlatform =
    typeof navigator !== "undefined" &&
    /win/i.test(navigator.platform || navigator.userAgent);
  const [code, setCode] = useState(() =>
    readDraftValue(PYTHON_DRAFT_STORAGE_KEY, DEFAULT_CODE)
  );
  const [output, setOutput] = useState("Ready. Click Run \u25B6 to execute.");
  const [engineReady, setEngineReady] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [isAwaitingInput, setIsAwaitingInput] = useState(false);
  const [stdinPrompt, setStdinPrompt] = useState("");
  const [stdinValue, setStdinValue] = useState("");
  const [copyCodeStatus, setCopyCodeStatus] = useState("");
  const [copyOutputStatus, setCopyOutputStatus] = useState("");
  const [matches, setMatches] = useState([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [suggestionPos, setSuggestionPos] = useState({ top: 0, left: 0 });
  const textareaRef = useRef(null);
  const lineNumbersRef = useRef(null);
  const stdinRef = useRef(null);
  const highlightRef = useRef(null);
  const mirrorRef = useRef(null);
  const editorRef = useRef(null);
  const outputRef = useRef(null);
  const outputBufferRef = useRef("");
  const pendingInputResolveRef = useRef(null);
  const copyCodeTimerRef = useRef(0);
  const copyOutputTimerRef = useRef(0);

  const highlighted = useMemo(() => highlightCode(code), [code]);
  const pythonLineNumbers = useMemo(
    () =>
      Array.from({ length: Math.max(1, code.split("\n").length) }, (_, index) => index + 1),
    [code]
  );
  const codeCharacterCount = code.length;

  useEffect(() => {
    let alive = true;
    if (window.Sk) {
      setEngineReady(true);
      return undefined;
    }

    const load = async () => {
      try {
        await ensureAnyScript(SKULPT_ENGINE_SOURCES);
        await ensureAnyScript(SKULPT_STDLIB_SOURCES);
        if (alive) setEngineReady(true);
      } catch {
        if (alive) {
          setEngineReady(false);
          setOutput("Unable to load Python engine from local/CDN sources.");
        }
      }
    };

    load();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (isAwaitingInput && stdinRef.current) {
      stdinRef.current.focus();
    }
  }, [isAwaitingInput]);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output, isAwaitingInput]);

  useEffect(() => {
    saveDraftValue(PYTHON_DRAFT_STORAGE_KEY, code);
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

  const appendOutput = (text) => {
    outputBufferRef.current += text;
    setOutput(outputBufferRef.current);
  };

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
    if (isRunning) return;
    setCode(DEFAULT_CODE);
    setMatches([]);
    setCopyCodeStatus("");
  };

  const handleClearOutput = () => {
    if (isRunning) return;
    outputBufferRef.current = "";
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

  const syncScroll = (target) => {
    if (lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = target.scrollTop;
    }
    if (highlightRef.current) {
      highlightRef.current.scrollTop = target.scrollTop;
      highlightRef.current.scrollLeft = target.scrollLeft;
    }
    if (mirrorRef.current) {
      mirrorRef.current.scrollTop = target.scrollTop;
      mirrorRef.current.scrollLeft = target.scrollLeft;
    }
    if (matches.length > 0) {
      updateSuggestionPosition(target.value, target.selectionStart);
    }
  };

  const updateSuggestionPosition = (value, position) => {
    const textarea = textareaRef.current;
    const mirror = mirrorRef.current;
    const editor = editorRef.current;
    if (!textarea || !mirror || !editor) return;

    const escaped = escapeHtml(value.slice(0, position)).replace(/\n$/g, "\n ");
    mirror.innerHTML = `${escaped}<span id="caret-marker">|</span>`;
    const marker = mirror.querySelector("#caret-marker");
    if (!marker) return;

    const lineHeight =
      parseFloat(window.getComputedStyle(textarea).lineHeight) || 20;
    const rawTop = marker.offsetTop - textarea.scrollTop + lineHeight;
    const rawLeft = marker.offsetLeft - textarea.scrollLeft;
    const maxLeft = editor.clientWidth - 220;
    const left = Math.max(12, Math.min(rawLeft, maxLeft));

    setSuggestionPos({ top: rawTop, left });
  };

  const updateAutocomplete = (value, position) => {
    const current = getCurrentWord(value, position);
    if (!current) {
      setMatches([]);
      return;
    }
    const nextMatches = AUTOCOMPLETE.filter(
      (item) =>
        item.word.startsWith(current) && item.word.toLowerCase() !== current
    ).slice(0, 6);

    if (nextMatches.length === 0) {
      setMatches([]);
      return;
    }

    setMatches(nextMatches);
    setActiveIndex(0);
    updateSuggestionPosition(value, position);
  };

  const applySuggestion = (word) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const currentValue = textarea.value;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const before = currentValue.slice(0, start);
    const match = before.match(/[A-Za-z_][A-Za-z_0-9]*$/);
    const replaceStart = match ? start - match[0].length : start;
    const nextValue = `${currentValue.slice(0, replaceStart)}${word}${currentValue.slice(
      end
    )}`;
    setCode(nextValue);
    setMatches([]);

    requestAnimationFrame(() => {
      textarea.focus();
      const cursor = replaceStart + word.length;
      textarea.setSelectionRange(cursor, cursor);
      updateSuggestionPosition(nextValue, cursor);
    });
  };

  const handleChange = (event) => {
    const nextValue = event.target.value;
    setCode(nextValue);
    updateAutocomplete(nextValue, event.target.selectionStart);
  };

  const handleKeyDown = (event) => {
    if (event.nativeEvent?.isComposing) {
      return;
    }

    const usesModifier = event.ctrlKey || event.metaKey;
    const key = String(event.key || "").toLowerCase();

    if (usesModifier && key === "enter") {
      event.preventDefault();
      handleRun();
      return;
    }

    if (usesModifier && key === "s") {
      event.preventDefault();
      handleRun();
      return;
    }

    if (usesModifier && key === "/") {
      event.preventDefault();
      const textarea = textareaRef.current;
      if (!textarea) return;
      const edit = applyToggleLineComment({
        value: textarea.value,
        selectionStart: textarea.selectionStart,
        selectionEnd: textarea.selectionEnd,
        commentToken: "#",
      });
      setCode(edit.value);
      setMatches([]);
      requestAnimationFrame(() => {
        textarea.focus();
        textarea.setSelectionRange(edit.selectionStart, edit.selectionEnd);
        updateSuggestionPosition(edit.value, edit.selectionStart);
        updateAutocomplete(edit.value, edit.selectionStart);
      });
      return;
    }

    if (matches.length > 0) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex((prev) => (prev + 1) % matches.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((prev) => (prev - 1 + matches.length) % matches.length);
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        applySuggestion(matches[activeIndex].word);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setMatches([]);
        return;
      }
    }

    if (event.key === "Tab" && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      const textarea = textareaRef.current;
      if (!textarea) return;
      const edit = event.shiftKey
        ? applyOutdentToText({
            value: textarea.value,
            selectionStart: textarea.selectionStart,
            selectionEnd: textarea.selectionEnd,
          })
        : applyIndentToText({
            value: textarea.value,
            selectionStart: textarea.selectionStart,
            selectionEnd: textarea.selectionEnd,
          });
      setCode(edit.value);
      setMatches([]);
      requestAnimationFrame(() => {
        textarea.focus();
        textarea.setSelectionRange(edit.selectionStart, edit.selectionEnd);
        updateSuggestionPosition(edit.value, edit.selectionStart);
        updateAutocomplete(edit.value, edit.selectionStart);
      });
      return;
    }

    if (!event.ctrlKey && !event.metaKey && !event.altKey) {
      const key = event.key;
      const textarea = textareaRef.current;
      if (textarea) {
        const currentValue = textarea.value;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const before = currentValue.slice(0, start);
        const after = currentValue.slice(end);

        if (after.startsWith(key) && start === end && SKIP_OVER_KEYS.has(key)) {
          event.preventDefault();
          const cursor = start + 1;
          textarea.setSelectionRange(cursor, cursor);
          updateSuggestionPosition(code, cursor);
          return;
        }

        if (Object.prototype.hasOwnProperty.call(PAIRS, key)) {
          event.preventDefault();
          const closing = PAIRS[key];
          const selected = currentValue.slice(start, end);
          const nextValue = `${before}${key}${selected}${closing}${after}`;
          setCode(nextValue);
          setMatches([]);
          requestAnimationFrame(() => {
            textarea.focus();
            if (selected.length > 0) {
              textarea.setSelectionRange(start + 1, end + 1);
            } else {
              textarea.setSelectionRange(start + 1, start + 1);
            }
            updateSuggestionPosition(nextValue, textarea.selectionStart);
          });
          return;
        }

        if (key === "Enter") {
          event.preventDefault();
          const lineStart = before.lastIndexOf("\n") + 1;
          const line = before.slice(lineStart);
          const indentMatch = line.match(/^[ \t]*/);
          const indent = indentMatch ? indentMatch[0] : "";
          const extra = line.trim().endsWith(":") ? "    " : "";
          const insert = `\n${indent}${extra}`;
          const nextValue = `${before}${insert}${after}`;
          setCode(nextValue);
          setMatches([]);
          requestAnimationFrame(() => {
            textarea.focus();
            const cursor = start + insert.length;
            textarea.setSelectionRange(cursor, cursor);
            updateSuggestionPosition(nextValue, cursor);
          });
        }
      }
    }
  };

  const handleCursorUpdate = (event) => {
    const target = event.target;
    updateAutocomplete(target.value, target.selectionStart);
  };

  const handleStdinSubmit = (event) => {
    event.preventDefault();
    if (!pendingInputResolveRef.current) return;
    const value = stdinValue;
    appendOutput(`${value}\n`);
    const resolve = pendingInputResolveRef.current;
    pendingInputResolveRef.current = null;
    setIsAwaitingInput(false);
    setStdinPrompt("");
    setStdinValue("");
    resolve(value);
  };

  const handleRun = async () => {
    if (isRunning) return;
    if (!engineReady || !window.Sk) {
      setOutput("Python engine is still loading. Please try again.");
      return;
    }

    setIsRunning(true);
    setIsAwaitingInput(false);
    setStdinPrompt("");
    setStdinValue("");
    pendingInputResolveRef.current = null;
    outputBufferRef.current = "";
    setOutput("");
    const Sk = window.Sk;
    const builtinRead = (x) => {
      if (!Sk.builtinFiles || !Sk.builtinFiles.files[x]) {
        throw new Error(`File not found: '${x}'`);
      }
      return Sk.builtinFiles.files[x];
    };

    Sk.configure({
      output: (text) => {
        appendOutput(text);
      },
      read: builtinRead,
      inputfun: (promptText) =>
        new Promise((resolve) => {
          const prompt = typeof promptText === "string" ? promptText : "";
          if (prompt) {
            appendOutput(prompt);
          }
          setStdinPrompt(prompt || "Input:");
          setStdinValue("");
          setIsAwaitingInput(true);
          pendingInputResolveRef.current = resolve;
        }),
      inputfunTakesPrompt: true,
    });

    try {
      await Sk.misceval.asyncToPromise(() =>
        Sk.importMainWithBody("<stdin>", false, code, true)
      );
      setOutput(
        outputBufferRef.current.trim()
          ? outputBufferRef.current
          : "Program finished with no output."
      );
    } catch (error) {
      setOutput((outputBufferRef.current || "") + String(error));
    } finally {
      pendingInputResolveRef.current = null;
      setIsAwaitingInput(false);
      setStdinPrompt("");
      setStdinValue("");
      setIsRunning(false);
    }
  };

  return (
    <div className="python-ide-shell c-compiler-shell--modern">
      <div className="ide-topbar cc-topbar">
        <div className="ide-brand">
          <span className="ide-brand-icon cc-brand-icon" aria-hidden="true">
            <Code2 size={32} strokeWidth={2.2} />
          </span>
          <div>
            <h1 className="ide-brand-title">Python Interpreter</h1>
            <p className="ide-brand-subtitle">
              Learn Python with topic-wise definitions, syntax, examples, and output.
            </p>
          </div>
        </div>
        <div className="ide-actions cc-actions">
          <button
            type="button"
            className="ide-run"
            onClick={handleRun}
            disabled={isRunning}
          >
            <Play size={16} aria-hidden="true" />
            {isRunning ? "Running..." : "Run \u25B6"}
          </button>
          <button
            type="button"
            className="ide-ghost-btn"
            onClick={handleResetCode}
            disabled={isRunning}
          >
            <RotateCcw size={16} aria-hidden="true" />
            Reset
          </button>
          <button
            type="button"
            className="ide-ghost-btn"
            onClick={handleClearOutput}
            disabled={isRunning}
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
        <span className="ide-toolbar-chip">Lines: {pythonLineNumbers.length}</span>
        <span className="ide-toolbar-chip">Chars: {codeCharacterCount}</span>
        <span className="ide-toolbar-chip">Run: Ctrl+Enter / Ctrl+S</span>
        <span className="ide-toolbar-chip">Edit: Ctrl+/ Tab Shift+Tab</span>
        <span className="ide-toolbar-chip">
          {engineReady ? "Engine Ready" : "Loading Engine"}
        </span>
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
              <strong>Main.py</strong>
            </div>
            <span className="cc-syntax-pill">
              {engineReady ? "Python Ready" : "Loading Engine..."}
            </span>
          </div>
          <div className="ide-editor-surface" ref={editorRef}>
            <div ref={lineNumbersRef} className="editor-line-numbers" aria-hidden="true">
              {pythonLineNumbers.map((line) => (
                <span key={line}>{line}</span>
              ))}
            </div>
            {!isWindowsPlatform ? (
              <pre
                ref={highlightRef}
                className="ide-highlight"
                aria-hidden="true"
                dangerouslySetInnerHTML={{
                  __html: `${highlighted}\n`,
                }}
              />
            ) : null}
            <textarea
              ref={textareaRef}
              value={code}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              onKeyUp={handleCursorUpdate}
              onClick={handleCursorUpdate}
              onScroll={(event) => syncScroll(event.target)}
              spellCheck="false"
              autoCapitalize="off"
              autoCorrect="off"
              className={`ide-input${isWindowsPlatform ? " ide-input-plain" : ""}`}
            />
            <div ref={mirrorRef} className="ide-mirror" aria-hidden="true" />
            {matches.length > 0 ? (
              <div
                className="ide-suggestions"
                style={{ top: suggestionPos.top, left: suggestionPos.left }}
              >
                {matches.map((item, index) => (
                  <div
                    key={item.word}
                    className={`ide-suggestion${
                      index === activeIndex ? " is-active" : ""
                    }`}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      applySuggestion(item.word);
                    }}
                  >
                    <span>{item.word}</span>
                    <small>{item.detail}</small>
                  </div>
                ))}
              </div>
            ) : null}
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
          {isAwaitingInput ? (
            <form className="ide-console-input-row" onSubmit={handleStdinSubmit}>
              <span className="ide-console-input-prompt">
                {stdinPrompt || "Input:"}
              </span>
              <input
                ref={stdinRef}
                className="ide-console-input"
                type="text"
                value={stdinValue}
                onChange={(event) => setStdinValue(event.target.value)}
                placeholder="Type value and press Enter"
              />
              <button type="submit" className="ide-console-submit">
                Submit
              </button>
            </form>
          ) : null}
        </div>

        <div className="ide-panel cc-basics-panel">
          <div className="ide-console-header cc-basics-header">Core Concepts</div>
          <div className="mt-3 grid gap-3 px-3 pb-4 sm:px-4">
            {PYTHON_CORE_CONCEPTS.map((concept, index) => (
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
