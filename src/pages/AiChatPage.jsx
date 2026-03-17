import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ArrowUp,
  Bot,
  Check,
  Copy,
  MessageSquarePlus,
  Mic,
  Plus,
  Sparkles,
  UserRound,
} from "lucide-react";
import { useAuth } from "../state/auth";
import { getGeminiApiKey, requestGeminiChat } from "../lib/geminiClient";

const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const MODE_OPTIONS = Object.freeze([
  {
    id: "doubt",
    label: "Ask Doubt",
    promptLabel: "Tutor mode",
    placeholder: "Ask anything about your topic, code, or concept...",
  },
  {
    id: "quiz",
    label: "Create Quiz",
    promptLabel: "Quiz mode",
    placeholder: "Ask for MCQs, short questions, or practice tests...",
  },
]);

const QUICK_PROMPTS = Object.freeze([
  {
    id: "concept",
    title: "Explain a concept",
    description: "Get a topic broken into simple points.",
    mode: "doubt",
    prompt: "Explain this topic in 5 simple points with one real-world example.",
  },
  {
    id: "mcq",
    title: "Create MCQs",
    description: "Generate quiz questions without answers.",
    mode: "quiz",
    prompt: "Create 5 MCQ questions on this topic. Return only the questions.",
  },
  {
    id: "code",
    title: "Generate code",
    description: "Ask for complete runnable code output.",
    mode: "doubt",
    prompt: "Write clean runnable code for this problem and explain it briefly.",
  },
  {
    id: "summary",
    title: "Make short notes",
    description: "Turn long content into revision notes.",
    mode: "doubt",
    prompt: "Summarize this topic into short revision notes with headings.",
  },
]);

const makeMessage = ({
  role,
  text,
  payloadText,
  mode = "",
  model = "",
}) => ({
  id: makeId(),
  role,
  text: String(text || ""),
  payloadText: String(payloadText || text || ""),
  mode: String(mode || ""),
  model: String(model || ""),
  createdAt: Date.now(),
});

const buildRequest = (mode, prompt) => {
  const trimmedPrompt = String(prompt || "").trim();
  if (mode === "quiz") {
    return `${trimmedPrompt || "Create 5 quiz questions."}\n\nReturn only questions unless asked for answers.`;
  }
  return `${trimmedPrompt || "Explain clearly."}\n\nAnswer as a concise tutor.`;
};

const autosizeTextarea = (element, expanded = false) => {
  if (!element) return;
  const minimumHeight = expanded ? 104 : 56;
  element.style.height = "0px";
  const nextHeight = Math.min(Math.max(element.scrollHeight, minimumHeight), 220);
  element.style.height = `${nextHeight}px`;
};

const formatTimeLabel = (value) => {
  if (!value) return "Now";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Now";
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
};

const getTransportLabel = (apiKey) => {
  const trimmedKey = String(apiKey || "").trim();
  if (!trimmedKey) return "Secure Proxy";
  return trimmedKey.startsWith("sk-") ? "OpenAI Key" : "Gemini Key";
};

function MarkdownCode({ className, children }) {
  const [copyStatus, setCopyStatus] = useState("");
  const timeoutRef = useRef(0);
  const rawCode = String(children || "").replace(/\n$/, "");
  const languageMatch = /language-([\w-]+)/.exec(className || "");
  const language = languageMatch?.[1] || "text";

  useEffect(
    () => () => {
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
      }
    },
    []
  );

  const handleCopy = async () => {
    if (!rawCode) return;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(rawCode);
        setCopyStatus("Copied");
      } else {
        setCopyStatus("Unavailable");
      }
    } catch {
      setCopyStatus("Copy failed");
    }

    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = window.setTimeout(() => {
      setCopyStatus("");
    }, 1800);
  };

  return (
    <div className="ai-chat-markdown__code-wrap">
      <div className="ai-chat-markdown__code-head">
        <span>{language}</span>
        <button
          type="button"
          onClick={() => void handleCopy()}
          className="ai-chat-markdown__copy-btn"
        >
          <span className="inline-flex items-center gap-1.5">
            {copyStatus === "Copied" ? <Check size={13} /> : <Copy size={13} />}
            {copyStatus || "Copy"}
          </span>
        </button>
      </div>
      <pre className="ai-chat-markdown__pre">
        <code className={className}>{rawCode}</code>
      </pre>
    </div>
  );
}

function MarkdownMessage({ text }) {
  return (
    <div className="ai-chat-markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: (props) => <p {...props} className="ai-chat-markdown__p" />,
          h1: (props) => <h1 {...props} className="ai-chat-markdown__h1" />,
          h2: (props) => <h2 {...props} className="ai-chat-markdown__h2" />,
          h3: (props) => <h3 {...props} className="ai-chat-markdown__h3" />,
          ul: (props) => <ul {...props} className="ai-chat-markdown__ul" />,
          ol: (props) => <ol {...props} className="ai-chat-markdown__ol" />,
          li: (props) => <li {...props} className="ai-chat-markdown__li" />,
          hr: (props) => <hr {...props} className="ai-chat-markdown__hr" />,
          a: (props) => (
            <a
              {...props}
              className="ai-chat-markdown__link"
              target="_blank"
              rel="noreferrer"
            />
          ),
          pre: ({ children }) => <>{children}</>,
          code: ({ inline, className, children }) =>
            inline ? (
              <code className="ai-chat-markdown__inline-code">
                {children}
              </code>
            ) : (
              <MarkdownCode className={className}>{children}</MarkdownCode>
            ),
        }}
      >
        {String(text || "").trim()}
      </ReactMarkdown>
    </div>
  );
}

export default function AiChatPage() {
  const { profile, role } = useAuth();
  const roleLabel =
    role === "staff" ? "Staff" : role === "parent" ? "Parent" : "Student";
  const displayName = String(profile?.name || "").trim() || roleLabel;
  const firstName = displayName.split(/\s+/)[0] || displayName;
  const apiKey = getGeminiApiKey();
  const transportLabel = useMemo(() => getTransportLabel(apiKey), [apiKey]);
  const emptyStateMode = useMemo(
    () => MODE_OPTIONS.find((item) => item.id === "doubt") || MODE_OPTIONS[0],
    []
  );

  const [messages, setMessages] = useState([]);
  const [mode, setMode] = useState("doubt");
  const [prompt, setPrompt] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [activeModel, setActiveModel] = useState("");

  const messagesRef = useRef(messages);
  const textareaRef = useRef(null);
  const endRef = useRef(null);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, sending]);

  useEffect(() => {
    autosizeTextarea(textareaRef.current, messages.length > 0);
  }, [messages.length, prompt]);

  const activeMode =
    MODE_OPTIONS.find((item) => item.id === mode) || emptyStateMode;
  const isEmptyState = messages.length === 0;
  const canSend = Boolean(prompt.trim()) && !sending;

  const focusComposer = () => {
    textareaRef.current?.focus();
  };

  const handlePromptChange = (event) => {
    setPrompt(event.target.value);
    if (error) setError("");
    autosizeTextarea(event.target, messages.length > 0);
  };

  const handleQuickPrompt = (item) => {
    setMode(item.mode);
    setPrompt(item.prompt);
    setError("");
    window.requestAnimationFrame(() => {
      focusComposer();
      autosizeTextarea(textareaRef.current, messages.length > 0);
    });
  };

  const handleSend = async () => {
    const nextPrompt = String(prompt || "").trim();
    if (!nextPrompt || sending) return;

    const currentMode = mode;
    const previousMessages = messagesRef.current;
    const payload = buildRequest(currentMode, nextPrompt);
    const userMessage = makeMessage({
      role: "user",
      text: nextPrompt,
      payloadText: payload,
      mode: currentMode,
    });
    const outbound = [...previousMessages, userMessage];

    setPrompt("");
    setError("");
    setSending(true);
    setMessages(outbound);
    messagesRef.current = outbound;

    try {
      const response = await requestGeminiChat({
        apiKey,
        messages: outbound,
      });

      const assistantMessage = makeMessage({
        role: "assistant",
        text: response?.text || "",
        payloadText: response?.text || "",
        model: response?.model || transportLabel,
      });

      setActiveModel(String(response?.model || transportLabel).trim());
      setMessages((prev) => {
        const next = [...prev, assistantMessage];
        messagesRef.current = next;
        return next;
      });
    } catch (requestError) {
      messagesRef.current = previousMessages;
      setMessages(previousMessages);
      setPrompt(nextPrompt);
      setError(
        requestError?.userMessage ||
          requestError?.message ||
          "Unable to get AI response right now."
      );
    } finally {
      setSending(false);
      window.requestAnimationFrame(() => {
        focusComposer();
        autosizeTextarea(textareaRef.current, messagesRef.current.length > 0);
      });
    }
  };

  const clearChat = () => {
    if (sending) return;
    messagesRef.current = [];
    setMessages([]);
    setPrompt("");
    setMode("doubt");
    setError("");
    setActiveModel("");
    window.requestAnimationFrame(() => {
      focusComposer();
      autosizeTextarea(textareaRef.current, false);
    });
  };

  const renderComposer = (compact = false) => (
    <div
      className={`mx-auto w-full ${compact ? "max-w-4xl" : "max-w-[64rem]"} rounded-[2rem] border border-zinc-200 bg-white shadow-[0_28px_60px_-42px_rgba(24,24,27,0.35)]`}
    >
      <div className="flex items-end gap-2 p-3 sm:gap-3 sm:p-4">
        <button
          type="button"
          onClick={focusComposer}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-zinc-200 bg-zinc-50 text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-100"
          aria-label="Focus prompt"
        >
          <Plus size={18} />
        </button>

        <textarea
          ref={textareaRef}
          value={prompt}
          onChange={handlePromptChange}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void handleSend();
            }
          }}
          disabled={sending}
          rows={1}
          placeholder={activeMode.placeholder}
          className={`ai-chat-composer__textarea min-h-[56px] flex-1 resize-none overflow-y-auto border-0 bg-transparent px-1 py-3 text-[15px] leading-7 text-zinc-900 placeholder:text-zinc-400 ${sending ? "cursor-wait opacity-70" : ""}`}
        />

        <button
          type="button"
          disabled
          title="Voice input coming soon"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-zinc-200 bg-zinc-50 text-zinc-500 opacity-60"
          aria-label="Voice input coming soon"
        >
          <Mic size={18} />
        </button>

        <button
          type="button"
          onClick={() => void handleSend()}
          disabled={!canSend}
          className={`grid h-12 w-12 shrink-0 place-items-center rounded-full text-white transition ${
            canSend
              ? "bg-zinc-900 shadow-[0_12px_28px_-18px_rgba(24,24,27,0.7)] hover:bg-black"
              : "bg-zinc-300"
          }`}
          aria-label="Send prompt"
        >
          <ArrowUp size={20} />
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-100 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          {MODE_OPTIONS.map((item) => {
            const active = item.id === mode;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setMode(item.id);
                  setError("");
                }}
                className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                  active
                    ? "bg-zinc-900 text-white"
                    : "border border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50"
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>

        <p className="text-xs text-zinc-500">
          {sending ? "Generating response..." : "Press Enter to send. Shift + Enter for a new line."}
        </p>
      </div>
    </div>
  );

  return (
    <section className="mx-auto w-full max-w-[1420px] px-1 pb-6 pt-2 sm:px-2">
      <div className="overflow-hidden rounded-[2.2rem] border border-zinc-200 bg-[linear-gradient(180deg,#fcfcfb_0%,#f7f7f4_100%)] shadow-[0_34px_90px_-56px_rgba(24,24,27,0.45)]">
        <header className="border-b border-zinc-200/80 bg-white/80 px-4 py-4 backdrop-blur sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-zinc-200 bg-zinc-50 text-zinc-900 shadow-sm">
                <Sparkles size={19} />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-zinc-500">
                  A3 Hub AI
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <h2 className="truncate text-lg font-semibold text-zinc-950 sm:text-xl">
                    Campus Assistant
                  </h2>
                  <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-[11px] font-semibold text-zinc-600">
                    {transportLabel}
                  </span>
                  {activeModel ? (
                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                      {activeModel}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-semibold text-zinc-600">
                {roleLabel}
              </span>
              <button
                type="button"
                onClick={clearChat}
                disabled={sending}
                className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3.5 py-2 text-sm font-semibold text-zinc-800 transition hover:border-zinc-300 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <MessageSquarePlus size={16} />
                New Chat
              </button>
            </div>
          </div>
        </header>

        {isEmptyState ? (
          <div className="px-4 py-10 sm:px-6 sm:py-14">
            <div className="mx-auto flex min-h-[72vh] w-full max-w-[70rem] flex-col items-center justify-center">
              <div className="max-w-3xl text-center">
                <p className="text-sm font-semibold uppercase tracking-[0.28em] text-zinc-500">
                  Welcome, {firstName}
                </p>
                <h1 className="mt-5 text-balance text-4xl font-semibold tracking-tight text-zinc-950 sm:text-5xl lg:text-6xl">
                  What's on your mind today?
                </h1>
                <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-zinc-600 sm:text-lg">
                  Ask doubts, generate quiz questions, or get clean code answers in a simpler
                  A3 Hub AI workspace.
                </p>
              </div>

              <div className="mt-8 w-full">
                {renderComposer(false)}
              </div>

              {error ? (
                <div className="mt-4 w-full max-w-[64rem] rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
                  {error}
                </div>
              ) : null}

              <div className="mt-6 grid w-full max-w-[64rem] gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {QUICK_PROMPTS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleQuickPrompt(item)}
                    className="rounded-[1.4rem] border border-zinc-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-md"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-zinc-900">
                        {item.title}
                      </p>
                      <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-600">
                        {item.mode === "quiz" ? "Quiz" : "Tutor"}
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-zinc-600">
                      {item.description}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="grid min-h-[78vh] xl:grid-cols-[minmax(0,1fr)_18rem]">
            <div className="flex min-h-0 flex-col">
              <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6 sm:py-6">
                <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
                  {messages.map((message) => {
                    const isUser = message.role === "user";
                    return (
                      <article
                        key={message.id}
                        className={`flex w-full ${isUser ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`w-full rounded-[1.65rem] border ${
                            isUser
                              ? "max-w-3xl border-zinc-200 bg-[#ececec]"
                              : "max-w-[58rem] border-zinc-200 bg-white shadow-sm"
                          }`}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 px-4 py-3">
                            <div className="flex min-w-0 items-center gap-3">
                              <span
                                className={`grid h-10 w-10 shrink-0 place-items-center rounded-2xl ${
                                  isUser
                                    ? "border border-zinc-300 bg-white text-zinc-800"
                                    : "border border-zinc-200 bg-zinc-50 text-zinc-900"
                                }`}
                              >
                                {isUser ? <UserRound size={17} /> : <Bot size={17} />}
                              </span>
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-zinc-900">
                                  {isUser ? displayName : "A3 Hub AI"}
                                </p>
                                <p className="text-xs text-zinc-500">
                                  {formatTimeLabel(message.createdAt)}
                                </p>
                              </div>
                            </div>

                            {isUser && message.mode ? (
                              <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-[11px] font-semibold text-zinc-600">
                                {message.mode === "quiz" ? "Quiz request" : "Tutor request"}
                              </span>
                            ) : null}
                            {!isUser && message.model ? (
                              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                                {message.model}
                              </span>
                            ) : null}
                          </div>

                          <div className="px-4 py-4 sm:px-5">
                            {isUser ? (
                              <p className="whitespace-pre-wrap text-[15px] leading-7 text-zinc-800">
                                {message.text}
                              </p>
                            ) : (
                              <MarkdownMessage text={message.text} />
                            )}
                          </div>
                        </div>
                      </article>
                    );
                  })}

                  {sending ? (
                    <article className="flex w-full justify-start">
                      <div className="w-full max-w-[58rem] rounded-[1.65rem] border border-zinc-200 bg-white px-4 py-4 shadow-sm">
                        <div className="flex items-center gap-3">
                          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-zinc-200 bg-zinc-50 text-zinc-900">
                            <Bot size={17} />
                          </span>
                          <div>
                            <p className="text-sm font-semibold text-zinc-900">
                              A3 Hub AI
                            </p>
                            <div className="ai-chat-typing">
                              <span className="ai-chat-typing__dot" />
                              <span className="ai-chat-typing__dot" />
                              <span className="ai-chat-typing__dot" />
                            </div>
                          </div>
                        </div>
                      </div>
                    </article>
                  ) : null}

                  <div ref={endRef} />
                </div>
              </div>

              <div className="border-t border-zinc-200 bg-white/86 px-4 py-4 backdrop-blur sm:px-6">
                {renderComposer(true)}
                {error ? (
                  <div className="mx-auto mt-3 w-full max-w-4xl rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
                    {error}
                  </div>
                ) : null}
              </div>
            </div>

            <aside className="hidden border-l border-zinc-200 bg-[#f7f7f4] xl:flex xl:flex-col">
              <div className="border-b border-zinc-200 px-5 py-5">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-zinc-500">
                  Quick Start
                </p>
                <h3 className="mt-2 text-lg font-semibold text-zinc-950">
                  Prompt ideas
                </h3>
                <p className="mt-2 text-sm leading-6 text-zinc-600">
                  Use one of these to start faster or switch between tutor and quiz mode.
                </p>
              </div>

              <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
                {QUICK_PROMPTS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleQuickPrompt(item)}
                    className="w-full rounded-[1.25rem] border border-zinc-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-md"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-zinc-900">
                        {item.title}
                      </p>
                      <Sparkles size={15} className="text-zinc-500" />
                    </div>
                    <p className="mt-2 text-sm leading-6 text-zinc-600">
                      {item.description}
                    </p>
                  </button>
                ))}
              </div>

              <div className="border-t border-zinc-200 px-5 py-4">
                <div className="rounded-[1.25rem] border border-zinc-200 bg-white p-4 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
                    Session
                  </p>
                  <div className="mt-3 space-y-2 text-sm text-zinc-700">
                    <p className="flex items-center justify-between gap-3">
                      <span>Messages</span>
                      <span className="font-semibold text-zinc-950">{messages.length}</span>
                    </p>
                    <p className="flex items-center justify-between gap-3">
                      <span>Mode</span>
                      <span className="font-semibold text-zinc-950">{activeMode.promptLabel}</span>
                    </p>
                    <p className="flex items-center justify-between gap-3">
                      <span>Connection</span>
                      <span className="font-semibold text-zinc-950">{transportLabel}</span>
                    </p>
                  </div>
                </div>
              </div>
            </aside>
          </div>
        )}
      </div>
    </section>
  );
}
