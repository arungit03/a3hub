import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, MessageSquare, Send, Sparkles, UserRound } from "lucide-react";
import { useAuth } from "../state/auth";
import { getGeminiApiKey, requestGeminiChat } from "../lib/geminiClient";

const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const makeMessage = (role, text, payloadText) => ({
  id: makeId(),
  role,
  text,
  payloadText,
  createdAt: Date.now(),
});

const buildRequest = (mode, prompt) => {
  const p = String(prompt || "").trim();
  if (mode === "quiz") {
    return `${p || "Create 5 quiz questions."}\n\nReturn only questions unless asked for answers.`;
  }
  return `${p || "Explain clearly."}\n\nAnswer as a concise tutor.`;
};

export default function AiChatPage() {
  const { profile, role } = useAuth();
  const roleLabel = role === "staff" ? "Staff" : role === "parent" ? "Parent" : "Student";
  const displayName = profile?.name?.trim() || roleLabel;
  const apiKey = useMemo(() => getGeminiApiKey(), []);

  const [messages, setMessages] = useState(() => [
    makeMessage("assistant", `Hi ${displayName}. I am your CKCET AI assistant.`),
  ]);
  const [mode, setMode] = useState("doubt");
  const [prompt, setPrompt] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, sending]);

  const send = async () => {
    const nextPrompt = prompt.trim();
    if (!nextPrompt || sending) return;
    if (!apiKey) {
      setError("AI is not configured. Set GEMINI_API_KEY / OPENAI_API_KEY on server.");
      return;
    }

    const payload = buildRequest(mode, nextPrompt);
    const userPreview = mode === "quiz" ? `[Mode: Quiz]\n${nextPrompt}` : `[Mode: Doubt]\n${nextPrompt}`;

    const userMessage = makeMessage("user", userPreview, payload);
    const outbound = [...messages, userMessage];

    setPrompt("");
    setError("");
    setSending(true);
    setMessages(outbound);

    try {
      const response = await requestGeminiChat({ apiKey, messages: outbound });
      setMessages((prev) => [...prev, makeMessage("assistant", response.text)]);
    } catch (e) {
      setError(e?.userMessage || e?.message || "Unable to get AI response now.");
    } finally {
      setSending(false);
    }
  };

  const clearChat = () => {
    setMessages([makeMessage("assistant", `Hi ${displayName}. I am your CKCET AI assistant.`)]);
    setPrompt("");
    setMode("doubt");
    setError("");
  };

  return (
    <section className="mx-auto w-full max-w-[1320px] space-y-4">
      <header className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">CKCET AI</p>
            <h2 className="mt-1 text-3xl font-bold text-slate-900">Campus Assistant</h2>
            <p className="mt-1 text-slate-600">Ask doubts or generate quiz questions.</p>
          </div>
          <button
            type="button"
            onClick={clearChat}
            className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700"
          >
            New Chat
          </button>
        </div>
      </header>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="max-h-[58vh] space-y-3 overflow-y-auto pr-1">
            {messages.map((m) => {
              const user = m.role === "user";
              return (
                <article
                  key={m.id}
                  className={`max-w-[95%] rounded-2xl border p-3 ${
                    user
                      ? "ml-auto border-blue-200 bg-blue-50"
                      : "mr-auto border-slate-200 bg-slate-50"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700">
                      {user ? <UserRound size={16} /> : <Sparkles size={16} />}
                    </span>
                    <div className="min-w-0 flex-1 whitespace-pre-wrap text-sm text-slate-700">
                      {m.text}
                    </div>
                  </div>
                </article>
              );
            })}
            {sending ? (
              <article className="mr-auto rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                AI Assistant is thinking...
              </article>
            ) : null}
            <div ref={endRef} />
          </div>

          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1">
              <button
                type="button"
                onClick={() => setMode("doubt")}
                className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
                  mode === "doubt" ? "bg-blue-600 text-white" : "text-slate-700"
                }`}
              >
                Ask Doubt
              </button>
              <button
                type="button"
                onClick={() => setMode("quiz")}
                className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
                  mode === "quiz" ? "bg-indigo-600 text-white" : "text-slate-700"
                }`}
              >
                Ask Quiz
              </button>
            </div>

            <div className="relative mt-3">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                placeholder={mode === "quiz" ? "Ask for quiz questions..." : "Type your doubt..."}
                className="min-h-[130px] w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-3 pr-14 text-sm text-slate-800 outline-none focus:border-blue-300"
              />
              <button
                type="button"
                onClick={send}
                disabled={sending || !prompt.trim()}
                className="absolute bottom-3 right-3 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600 text-white disabled:opacity-50"
                aria-label="Send"
              >
                <Send size={18} />
              </button>
            </div>
            {error ? <p className="mt-2 text-xs font-semibold text-red-600">{error}</p> : null}
          </div>
        </section>

        <aside className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">
            <Bot size={16} />
            Quick Start
          </p>
          <div className="mt-3 space-y-2">
            {["Explain this topic in 5 points.", "Create 5 MCQ questions.", "Give one practical example."]
              .map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setPrompt(item)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-left text-sm text-slate-700"
                >
                  <span className="inline-flex items-center gap-2"><MessageSquare size={14} />{item}</span>
                </button>
              ))}
          </div>
        </aside>
      </div>
    </section>
  );
}
