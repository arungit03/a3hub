import { extractJsonPayload } from "../../../lib/gemini/normalize.js";
import { requestGeminiChat } from "../../../lib/geminiClient.js";

const normalizeText = (value) =>
  String(value || "")
    .replace(/\r/g, "")
    .trim();

const normalizeCodeForCompare = (value) =>
  normalizeText(value)
    .replace(/```[\w-]*\n?/g, "")
    .replace(/```/g, "")
    .replace(/\s+/g, " ")
    .trim();

const getReferenceAnswer = (question = {}) =>
  normalizeText(
    question.expectedAnswer ||
      question.referenceAnswer ||
      question.exampleAnswer ||
      question.solutionCode ||
      ""
  );

const buildEvaluationPrompt = ({ topic, question, answer }) => {
  const safeTopicTitle = normalizeText(topic?.title || topic?.lessonTitle || "Programming topic");
  const safeLanguage = normalizeText(question?.codeLanguage || "code");
  const safeQuestion = normalizeText(question?.question);
  const safePromptCode = normalizeText(question?.code);
  const safeStarterCode = normalizeText(question?.starterCode);
  const safeReferenceAnswer = getReferenceAnswer(question);
  const safeAnswer = normalizeText(answer);

  return [
    "You are checking a beginner programming quiz answer.",
    "Return strict JSON only with this schema:",
    '{"isCorrect": true, "score": 100, "feedback": "", "expectedAnswer": ""}',
    "Rules:",
    "- Accept short valid beginner solutions when they answer the question correctly.",
    "- Be flexible about spacing, variable names, and equivalent beginner syntax.",
    "- feedback must be 1 or 2 short student-friendly sentences.",
    "- If the answer is wrong or incomplete, expectedAnswer must contain a short correct answer or reference solution.",
    "- If the answer is correct, expectedAnswer should be an empty string.",
    `Topic: ${safeTopicTitle}`,
    `Language: ${safeLanguage}`,
    `Quiz question: ${safeQuestion}`,
    safePromptCode ? `Question code or context:\n${safePromptCode}` : "",
    safeStarterCode ? `Starter code:\n${safeStarterCode}` : "",
    safeReferenceAnswer ? `Teacher reference answer:\n${safeReferenceAnswer}` : "",
    `Student answer:\n${safeAnswer}`,
  ]
    .filter(Boolean)
    .join("\n\n");
};

export const evaluateLearningCodeQuizAnswer = async ({
  apiKey,
  topic,
  question,
  answer,
}) => {
  const safeAnswer = normalizeText(answer);
  if (!safeAnswer) {
    const error = new Error("Write your code answer before checking with AI.");
    error.code = "learning/code-answer-empty";
    throw error;
  }

  const referenceAnswer = getReferenceAnswer(question);
  const normalizedAnswer = normalizeCodeForCompare(safeAnswer);
  const normalizedReference = normalizeCodeForCompare(referenceAnswer);

  if (normalizedAnswer && normalizedReference && normalizedAnswer === normalizedReference) {
    return {
      answer: safeAnswer,
      isCorrect: true,
      score: 100,
      feedback: "Your answer matches the expected solution.",
      expectedAnswer: "",
      model: "local-exact-match",
    };
  }

  const { text, model } = await requestGeminiChat({
    apiKey,
    messages: [
      {
        role: "user",
        text: buildEvaluationPrompt({ topic, question, answer: safeAnswer }),
      },
    ],
  });

  const parsed = extractJsonPayload(text);
  if (!parsed || typeof parsed !== "object") {
    const error = new Error("AI returned an invalid code quiz review.");
    error.code = "learning/code-quiz-invalid-review";
    throw error;
  }

  const isCorrect = Boolean(parsed.isCorrect);
  const score = Number(parsed.score);
  const feedback = normalizeText(
    parsed.feedback ||
      (isCorrect
        ? "Correct answer. Nice work."
        : "This answer needs a small correction.")
  );
  const expectedAnswer = isCorrect
    ? ""
    : normalizeText(parsed.expectedAnswer || referenceAnswer);

  return {
    answer: safeAnswer,
    isCorrect,
    score: Number.isFinite(score) ? Math.max(0, Math.min(100, Math.round(score))) : isCorrect ? 100 : 0,
    feedback,
    expectedAnswer,
    model: normalizeText(model || "ai-review"),
  };
};
