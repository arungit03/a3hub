import { useEffect, useRef, useState } from "react";
import { isCodeQuizQuestion } from "../lib/quiz.js";

const CODE_LANGUAGE_LABELS = Object.freeze({
  python: "Python",
  c: "C",
  cpp: "C++",
  css: "CSS",
  html: "HTML",
});

const getOptionClassName = ({
  isAnswered,
  isSelected,
  isCorrect,
  isWrongSelection,
}) => {
  if (isAnswered && isCorrect) {
    return "w-full rounded-2xl border border-emerald-300 bg-emerald-100 px-4 py-3 text-left text-sm font-semibold text-emerald-800 transition";
  }

  if (isAnswered && isWrongSelection) {
    return "w-full rounded-2xl border border-rose-300 bg-rose-100 px-4 py-3 text-left text-sm font-semibold text-rose-800 transition";
  }

  if (isAnswered) {
    return "w-full cursor-not-allowed rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-left text-sm text-slate-500 transition";
  }

  if (isSelected) {
    return "w-full rounded-2xl border border-slate-900 bg-slate-900 px-4 py-3 text-left text-sm text-white transition";
  }

  return "w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left text-sm text-slate-700 transition hover:border-slate-300";
};

const toSafeAnswerMap = (value) =>
  value && typeof value === "object" && !Array.isArray(value) ? value : {};

const toSafeCodeResponseMap = (value) =>
  value && typeof value === "object" && !Array.isArray(value) ? value : {};

const getCodeLanguageLabel = (codeLanguage) =>
  CODE_LANGUAGE_LABELS[String(codeLanguage || "").trim().toLowerCase()] || "Code";

const getCodeQuestionStatusMeta = ({
  response,
  isChecking,
  hasError,
  quizCompleted,
}) => {
  if (isChecking) {
    return {
      label: "Checking with AI",
      badgeClass: "border-sky-200 bg-sky-50 text-sky-700",
      helperText: "AI is reviewing the answer now.",
    };
  }

  if (response?.isCorrect) {
    return {
      label: "Accepted",
      badgeClass: "border-emerald-200 bg-emerald-50 text-emerald-700",
      helperText: "The answer is saved and locked for this attempt.",
    };
  }

  if (response) {
    return {
      label: "Needs correction",
      badgeClass: "border-rose-200 bg-rose-50 text-rose-700",
      helperText: "You can review the AI feedback and retry after restarting the quiz.",
    };
  }

  if (hasError) {
    return {
      label: "Fix required",
      badgeClass: "border-amber-200 bg-amber-50 text-amber-700",
      helperText: "There is a small problem to fix before checking.",
    };
  }

  if (quizCompleted) {
    return {
      label: "Locked",
      badgeClass: "border-slate-200 bg-slate-100 text-slate-700",
      helperText: "This quiz attempt is already complete.",
    };
  }

  return {
    label: "Ready to write",
    badgeClass: "border-indigo-200 bg-indigo-50 text-indigo-700",
    helperText: "Write a short answer and check it when you are ready.",
  };
};

export default function LearningQuizPanel({
  topic,
  questions = [],
  topicState = {},
  onAnswerQuestion,
  onCheckCodeQuestion,
  onRetryQuiz,
}) {
  const isCssQuiz = topic?.courseId === "css";
  const [pendingAnswers, setPendingAnswers] = useState({});
  const [pendingCodeResponses, setPendingCodeResponses] = useState({});
  const [draftCodeAnswers, setDraftCodeAnswers] = useState({});
  const [checkingQuestions, setCheckingQuestions] = useState({});
  const [questionErrors, setQuestionErrors] = useState({});
  const [openCodeQuestionId, setOpenCodeQuestionId] = useState("");
  const codeModalPanelRef = useRef(null);
  const passPercentage = Number(topic.passPercentage || 60);
  const savedAnswers = toSafeAnswerMap(topicState.quizAnswers);
  const savedCodeResponses = toSafeCodeResponseMap(topicState.quizCodeResponses);
  const answers = {
    ...pendingAnswers,
    ...savedAnswers,
  };
  const codeResponses = {
    ...pendingCodeResponses,
    ...savedCodeResponses,
  };
  const answeredCount = questions.reduce((total, question) => {
    if (isCodeQuizQuestion(question)) {
      return total + (codeResponses[question.id] ? 1 : 0);
    }

    return total + (answers[question.id] !== undefined ? 1 : 0);
  }, 0);
  const previousBestScore = Number(topicState.quizBestScore || 0);
  const quizAttempts = Number(topicState.quizAttempts || 0);
  const previousPassed = Boolean(topicState.quizPassed);
  const quizCompleted =
    Boolean(topicState.quizCompletedAt) ||
    (questions.length > 0 && answeredCount === questions.length);
  const quizScore = Number(topicState.quizLastScore || 0);

  const result = quizCompleted
    ? {
        status: previousPassed ? "success" : "error",
        message: previousPassed
          ? `Passed with ${quizScore}%. Great work.`
          : `Scored ${quizScore}%. Review the lesson before moving to the next topic.`,
        passed: previousPassed,
      }
    : null;

  const openCodeQuestion =
    questions.find(
      (question) =>
        question.id === openCodeQuestionId && isCodeQuizQuestion(question)
    ) || null;

  useEffect(() => {
    if (!openCodeQuestion) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.requestAnimationFrame(() => {
      codeModalPanelRef.current?.focus();
    });

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setOpenCodeQuestionId("");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [openCodeQuestion]);

  const getDraftCodeValue = (question) =>
    draftCodeAnswers[question.id] ??
    codeResponses[question.id]?.answer ??
    question.starterCode ??
    "";

  const getDraftMetrics = (question) => {
    const value = String(getDraftCodeValue(question)).replace(/\r/g, "");
    return {
      lineCount: value ? value.split("\n").length : 0,
      charCount: value.length,
    };
  };

  const getCodeQuestionTips = (question) =>
    topic?.courseId === "css"
      ? [
          "Start with a clear selector that matches the topic.",
          "Use only a few declarations that show the idea clearly.",
          "Keep the example short, readable, and easy to test.",
        ]
      : [
          `Write a short ${getCodeLanguageLabel(question.codeLanguage).toLowerCase()} answer.`,
          "Focus on the main concept instead of a long solution.",
          "Check the answer after you finish your final draft.",
        ];

  const handleSelectOption = async (question, optionIndex) => {
    if (!question?.id || answers[question.id] !== undefined || quizCompleted) {
      return;
    }

    setPendingAnswers((previous) => ({
      ...previous,
      [question.id]: optionIndex,
    }));
    await onAnswerQuestion(question.id, optionIndex);
  };

  const handleCheckCodeQuestion = async (question) => {
    if (!question?.id || codeResponses[question.id] || quizCompleted) {
      return;
    }

    const answer = String(
      draftCodeAnswers[question.id] ?? question.starterCode ?? ""
    ).trim();

    if (!answer) {
      setQuestionErrors((previous) => ({
        ...previous,
        [question.id]: "Write your code answer before checking with AI.",
      }));
      return;
    }

    setCheckingQuestions((previous) => ({
      ...previous,
      [question.id]: true,
    }));
    setQuestionErrors((previous) => ({
      ...previous,
      [question.id]: "",
    }));

    try {
      const evaluation = await onCheckCodeQuestion(question, answer);
      setPendingCodeResponses((previous) => ({
        ...previous,
        [question.id]: evaluation,
      }));
      setDraftCodeAnswers((previous) => ({
        ...previous,
        [question.id]: evaluation.answer || answer,
      }));
    } catch (error) {
      setQuestionErrors((previous) => ({
        ...previous,
        [question.id]:
          error?.message || "AI could not check this code answer right now.",
      }));
    } finally {
      setCheckingQuestions((previous) => ({
        ...previous,
        [question.id]: false,
      }));
    }
  };

  const handleResetCodeDraft = (question) => {
    if (!question?.id || codeResponses[question.id] || quizCompleted) {
      return;
    }

    setDraftCodeAnswers((previous) => ({
      ...previous,
      [question.id]: question.starterCode ?? "",
    }));
    setQuestionErrors((previous) => ({
      ...previous,
      [question.id]: "",
    }));
  };

  const renderCodeQuestionFeedback = (question) =>
    codeResponses[question.id] ? (
      <div
        className={`rounded-2xl border px-4 py-4 text-sm ${
          codeResponses[question.id].isCorrect
            ? "border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-emerald-100/70 text-emerald-800"
            : "border-rose-200 bg-gradient-to-br from-rose-50 via-white to-rose-100/70 text-rose-800"
        }`}
      >
        <p className="text-xs font-semibold uppercase tracking-[0.14em]">
          AI Review Result
        </p>
        <p className="mt-2 font-semibold">
          {codeResponses[question.id].isCorrect
            ? "Correct answer. AI accepted this code."
            : "This answer is not correct yet."}
        </p>
        <p className="mt-2 whitespace-pre-wrap leading-6">
          {codeResponses[question.id].feedback ||
            (codeResponses[question.id].isCorrect
              ? "Your code demonstrates the topic correctly."
              : "Review the correct answer below and compare it with your code.")}
        </p>
        {!codeResponses[question.id].isCorrect &&
        codeResponses[question.id].expectedAnswer ? (
          <div className="mt-4 overflow-hidden rounded-2xl border border-rose-200 bg-slate-950 shadow-inner">
            <div className="border-b border-slate-800 px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-300">
              AI reference answer
            </div>
            <pre className="overflow-x-auto px-4 py-4 text-sm leading-6 text-slate-100">
              <code>{codeResponses[question.id].expectedAnswer}</code>
            </pre>
          </div>
        ) : null}
      </div>
    ) : null;

  const renderCodeQuestionEditor = (question, { modal = false } = {}) => (
    <div className={modal ? "space-y-4" : "mt-4 space-y-4"}>
      {question.code ? (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-950 shadow-inner">
          <div className="border-b border-slate-800 px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-300">
            {getCodeLanguageLabel(question.codeLanguage)} code
          </div>
          <pre className="overflow-x-auto px-4 py-4 text-sm leading-6 text-slate-100">
            <code>{question.code}</code>
          </pre>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-[1.6rem] border border-slate-200/80 bg-white shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/90 px-4 py-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
              Your {getCodeLanguageLabel(question.codeLanguage)} answer
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Keep it short and focused on the lesson concept.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1">
              {getDraftMetrics(question).lineCount} lines
            </span>
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1">
              {getDraftMetrics(question).charCount} chars
            </span>
          </div>
        </div>
        <textarea
          value={getDraftCodeValue(question)}
          onChange={(event) => {
            const value = event.target.value;
            setDraftCodeAnswers((previous) => ({
              ...previous,
              [question.id]: value,
            }));
            if (questionErrors[question.id]) {
              setQuestionErrors((previous) => ({
                ...previous,
                [question.id]: "",
              }));
            }
          }}
          disabled={Boolean(codeResponses[question.id]) || quizCompleted}
          spellCheck="false"
          className={`w-full resize-y border-0 bg-[linear-gradient(180deg,#f8fbff_0%,#f2f6fd_100%)] px-4 py-4 font-mono text-[14px] leading-7 text-slate-900 outline-none ${
            modal ? "min-h-[340px]" : "min-h-[200px]"
          }`}
          placeholder={
            question.placeholder ||
            "Write your code answer here. AI will check it and lock it."
          }
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[1.4rem] border border-slate-200 bg-slate-50/80 px-4 py-3">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
            Review Flow
          </p>
          <p className="text-sm text-slate-600">
            {getCodeQuestionStatusMeta({
              response: codeResponses[question.id],
              isChecking: Boolean(checkingQuestions[question.id]),
              hasError: Boolean(questionErrors[question.id]),
              quizCompleted,
            }).helperText}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {!codeResponses[question.id] && !quizCompleted ? (
            <button
              type="button"
              onClick={() => handleResetCodeDraft(question)}
              className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-white"
            >
              Reset Draft
            </button>
          ) : null}
        <button
          type="button"
          disabled={
            Boolean(codeResponses[question.id]) ||
            Boolean(checkingQuestions[question.id]) ||
            quizCompleted
          }
          onClick={() => void handleCheckCodeQuestion(question)}
          className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {checkingQuestions[question.id] ? "Summit..." : "Summit"}
        </button>
        </div>
      </div>

      {questionErrors[question.id] ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          {questionErrors[question.id]}
        </div>
      ) : null}

      {renderCodeQuestionFeedback(question)}
    </div>
  );

  return (
    <section className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              Saved Answers
            </p>
            <h2 className="mt-1 text-xl font-bold text-slate-900">{topic.title} Quiz</h2>
          </div>
          <div className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700">
            Pass mark: {passPercentage}%
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
              Best score
            </p>
            <p className="mt-2 text-2xl font-bold text-slate-900">{previousBestScore}%</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
              Status
            </p>
            <p className="mt-2 text-sm font-semibold text-slate-900">
              {quizCompleted
                ? previousPassed
                  ? "Saved and passed"
                  : "Saved and locked"
                : `${answeredCount}/${questions.length} answered`}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Attempts saved: {quizAttempts}
            </p>
          </div>
        </div>
        {quizCompleted && onRetryQuiz ? (
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void onRetryQuiz()}
              className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Retry Quiz
            </button>
            <span className="inline-flex items-center text-xs font-medium uppercase tracking-[0.12em] text-slate-500">
              Best score stays saved even after a retry
            </span>
          </div>
        ) : null}
      </div>

      {questions.map((question, index) => (
        <article
          key={question.id}
          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
            Question {index + 1}
          </p>
          <h3 className="mt-2 text-lg font-semibold text-slate-900">{question.question}</h3>
          {question.code ? (
            <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-slate-950 shadow-inner">
              <div className="border-b border-slate-800 px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-300">
                {getCodeLanguageLabel(question.codeLanguage)} code
              </div>
              <pre className="overflow-x-auto px-4 py-4 text-sm leading-6 text-slate-100">
                <code>{question.code}</code>
              </pre>
            </div>
          ) : null}
          {isCodeQuizQuestion(question) ? (
            isCssQuiz ? (
              <div className="mt-4 space-y-4">
                <div className="rounded-[1.7rem] border border-sky-200 bg-gradient-to-br from-sky-50 via-white to-indigo-50 p-5 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="max-w-2xl">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">
                        Focused Code Challenge
                      </p>
                      <p className="mt-2 text-sm leading-6 text-slate-700">
                        Open a dedicated CSS workspace with a larger editor, quick guidance,
                        and AI review.
                      </p>
                    </div>
                    <span
                      className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${
                        getCodeQuestionStatusMeta({
                          response: codeResponses[question.id],
                          isChecking: Boolean(checkingQuestions[question.id]),
                          hasError: Boolean(questionErrors[question.id]),
                          quizCompleted,
                        }).badgeClass
                      }`}
                    >
                      {
                        getCodeQuestionStatusMeta({
                          response: codeResponses[question.id],
                          isChecking: Boolean(checkingQuestions[question.id]),
                          hasError: Boolean(questionErrors[question.id]),
                          quizCompleted,
                        }).label
                      }
                    </span>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {getCodeQuestionTips(question).map((tip) => (
                      <span
                        key={`${question.id}-${tip}`}
                        className="rounded-full border border-white/70 bg-white/90 px-3 py-1 text-xs font-medium text-slate-600 shadow-sm"
                      >
                        {tip}
                      </span>
                    ))}
                  </div>
                  <div className="mt-5 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setOpenCodeQuestionId(question.id)}
                      className="rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
                    >
                      {codeResponses[question.id]
                        ? "Open Code Workspace"
                        : "Write CSS Answer"}
                    </button>
                    <span className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">
                      Question {index + 1} uses a focused code workspace
                    </span>
                  </div>
                </div>
                {questionErrors[question.id] ? (
                  <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
                    {questionErrors[question.id]}
                  </div>
                ) : null}
                {renderCodeQuestionFeedback(question)}
              </div>
            ) : (
              renderCodeQuestionEditor(question)
            )
          ) : (
            <>
              <div className="mt-4 grid gap-3">
                {question.options.map((option, optionIndex) => {
                  const selectedIndex = answers[question.id];
                  const isAnswered = selectedIndex !== undefined;
                  const isSelected = selectedIndex === optionIndex;
                  const isCorrect = optionIndex === question.answerIndex;
                  const isWrongSelection = isAnswered && isSelected && !isCorrect;

                  return (
                    <button
                      key={`${question.id}-${optionIndex}`}
                      type="button"
                      disabled={isAnswered || quizCompleted}
                      onClick={() => void handleSelectOption(question, optionIndex)}
                      className={getOptionClassName({
                        isAnswered,
                        isSelected,
                        isCorrect,
                        isWrongSelection,
                      })}
                    >
                      {option}
                    </button>
                  );
                })}
              </div>
              {answers[question.id] !== undefined ? (
                <p className="mt-3 text-sm font-medium text-slate-600">
                  {question.explanation || "The correct answer is highlighted in green."}
                </p>
              ) : null}
            </>
          )}
        </article>
      ))}

      {result ? (
        <div
          className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${
            result.status === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-rose-200 bg-rose-50 text-rose-700"
          }`}
        >
          {result.message}
        </div>
      ) : null}

      {isCssQuiz && openCodeQuestion ? (
        <div className="ui-modal" role="dialog" aria-modal="true">
          <button
            type="button"
            aria-label="Close code input modal"
            className="ui-modal__scrim"
            onClick={() => setOpenCodeQuestionId("")}
          />
          <div
            ref={codeModalPanelRef}
            tabIndex={-1}
            className="ui-modal__panel max-h-[calc(100dvh-1.5rem)] w-full max-w-6xl rounded-[2rem] border-0 bg-transparent p-0 shadow-none outline-none"
          >
            <div className="relative overflow-hidden rounded-[2rem] border border-sky-200/70 bg-gradient-to-br from-white via-sky-50/80 to-indigo-100/70 shadow-[0_36px_120px_rgba(15,23,42,0.22)]">
              <div className="pointer-events-none absolute -left-16 top-0 h-48 w-48 rounded-full bg-sky-300/25 blur-3xl" />
              <div className="pointer-events-none absolute bottom-0 right-0 h-56 w-56 rounded-full bg-indigo-300/25 blur-3xl" />

              <div className="relative border-b border-white/70 bg-white/80 px-5 py-5 backdrop-blur sm:px-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="max-w-3xl">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
                      CSS Code Workspace
                    </p>
                    <h3 className="mt-3 text-2xl font-black tracking-tight text-slate-900 sm:text-[2rem]">
                      {openCodeQuestion.question}
                    </h3>
                    <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
                      Write a short CSS answer, check it with AI, and review the result
                      here before moving back to the quiz.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${
                        getCodeQuestionStatusMeta({
                          response: codeResponses[openCodeQuestion.id],
                          isChecking: Boolean(checkingQuestions[openCodeQuestion.id]),
                          hasError: Boolean(questionErrors[openCodeQuestion.id]),
                          quizCompleted,
                        }).badgeClass
                      }`}
                    >
                      {
                        getCodeQuestionStatusMeta({
                          response: codeResponses[openCodeQuestion.id],
                          isChecking: Boolean(checkingQuestions[openCodeQuestion.id]),
                          hasError: Boolean(questionErrors[openCodeQuestion.id]),
                          quizCompleted,
                        }).label
                      }
                    </span>
                    <span className="rounded-full border border-slate-200 bg-white/90 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">
                      Question {questions.findIndex((item) => item.id === openCodeQuestion.id) + 1} of{" "}
                      {questions.length}
                    </span>
                    <button
                      type="button"
                      aria-label="Close code input modal"
                      className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-sky-200 bg-white/90 text-sky-700 shadow-sm transition hover:border-sky-300 hover:bg-white"
                      onClick={() => setOpenCodeQuestionId("")}
                    >
                      <svg
                        viewBox="0 0 24 24"
                        className="h-5 w-5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.9"
                      >
                        <path d="M6 6 18 18" strokeLinecap="round" />
                        <path d="M18 6 6 18" strokeLinecap="round" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>

              <div className="relative grid gap-5 px-5 pb-5 pt-5 sm:px-6 sm:pb-6 lg:grid-cols-[minmax(0,1.7fr)_320px]">
                <div className="space-y-5">
                  <div className="rounded-[1.7rem] border border-slate-200/80 bg-white/92 p-5 shadow-sm backdrop-blur">
                    {renderCodeQuestionEditor(openCodeQuestion, { modal: true })}
                  </div>
                </div>

                <aside className="space-y-4">
                  <div className="rounded-[1.6rem] border border-slate-200/80 bg-white/92 p-4 shadow-sm backdrop-blur">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                      Quick Guide
                    </p>
                    <div className="mt-4 space-y-3">
                      {getCodeQuestionTips(openCodeQuestion).map((tip) => (
                        <div
                          key={`${openCodeQuestion.id}-tip-${tip}`}
                          className="flex items-start gap-3 rounded-2xl border border-slate-100 bg-slate-50/90 px-3 py-3"
                        >
                          <span className="mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-sky-100 text-[11px] font-bold text-sky-700">
                            +
                          </span>
                          <p className="text-sm leading-6 text-slate-700">{tip}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-[1.6rem] border border-slate-200/80 bg-white/92 p-4 shadow-sm backdrop-blur">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                      Workspace Details
                    </p>
                    <div className="mt-4 grid gap-3">
                      <div className="rounded-2xl border border-slate-100 bg-slate-50/90 px-3 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                          Language
                        </p>
                        <p className="mt-2 text-sm font-semibold text-slate-900">
                          {getCodeLanguageLabel(openCodeQuestion.codeLanguage)}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-slate-100 bg-slate-50/90 px-3 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                          Draft Size
                        </p>
                        <p className="mt-2 text-sm font-semibold text-slate-900">
                          {getDraftMetrics(openCodeQuestion).lineCount} lines and{" "}
                          {getDraftMetrics(openCodeQuestion).charCount} characters
                        </p>
                      </div>
                      <div className="rounded-2xl border border-slate-100 bg-slate-50/90 px-3 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                          Reminder
                        </p>
                        <p className="mt-2 text-sm leading-6 text-slate-700">
                          After AI review, the answer stays locked for this attempt. Press
                          `Esc` anytime to close the workspace.
                        </p>
                      </div>
                    </div>
                  </div>

                  {openCodeQuestion.code ? (
                    <div className="overflow-hidden rounded-[1.6rem] border border-slate-200/80 bg-slate-950 shadow-sm">
                      <div className="border-b border-slate-800 px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-300">
                        Question code
                      </div>
                      <pre className="overflow-x-auto px-4 py-4 text-sm leading-6 text-slate-100">
                        <code>{openCodeQuestion.code}</code>
                      </pre>
                    </div>
                  ) : null}
                </aside>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
