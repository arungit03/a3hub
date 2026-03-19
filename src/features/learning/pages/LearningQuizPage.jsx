import { useMemo } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { useAuth } from "../../../state/auth.jsx";
import { getGeminiApiKey } from "../../../lib/geminiClient.js";
import LearningPageShell from "../components/LearningPageShell.jsx";
import LearningQuizPanel from "../components/LearningQuizPanel.jsx";
import { useLearningCatalog } from "../hooks/useLearningCatalog.js";
import { useLearningProgress } from "../hooks/useLearningProgress.js";
import { describeTopicRoute } from "../data/catalog.js";
import { getLearningBasePath, getLearningTabs } from "../lib/navigation.js";
import { getStableQuizQuestions } from "../lib/quiz.js";
import { evaluateLearningCodeQuizAnswer } from "../lib/codeQuiz.js";

export default function LearningQuizPage() {
  const { courseId, topicSlug } = useParams();
  const { role } = useAuth();
  const basePath = getLearningBasePath(role);
  const tabs = getLearningTabs(basePath);
  const { catalog } = useLearningCatalog();
  const { progress, recordQuizAnswer, recordCodeQuizEvaluation, restartQuizAttempt } =
    useLearningProgress(catalog);
  const apiKey = getGeminiApiKey();
  const topic = (catalog.topicsByCourse[courseId] || []).find(
    (item) => item.slug === topicSlug
  );
  const quizQuestions = useMemo(
    () => getStableQuizQuestions(topic?.quizQuestions || []),
    [topic?.quizQuestions]
  );

  if (!topic) {
    return <Navigate to={`${basePath}/learning`} replace />;
  }

  const topicState = progress.topicStates[topic.id] || {};
  const isCssQuiz = topic.courseId === "css";
  const pageBadge = isCssQuiz ? "CSS Mixed Quiz" : "Programming Quiz";
  const pageSubtitle = isCssQuiz
    ? "Answer the quick MCQs first, then open the focused CSS workspace for the code challenge. AI reviews and locks the code answer after checking."
    : "MCQ answers check instantly, final scores stay saved, and you can retry the quiz whenever you want. Code answers are still reviewed by AI and saved to progress.";

  return (
    <LearningPageShell
      badge={pageBadge}
      title={`${topic.title} Quiz`}
      subtitle={pageSubtitle}
      tabs={tabs}
      actions={
        <Link
          to={describeTopicRoute(basePath, topic)}
          className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-slate-100"
        >
          Back To Lesson
        </Link>
      }
    >
      <LearningQuizPanel
        key={`${topic.id}-${topicState.quizAttempts || 0}-${topicState.quizCompletedAt ? "done" : "open"}`}
        topic={topic}
        questions={quizQuestions}
        topicState={topicState}
        onAnswerQuestion={(questionId, optionIndex) =>
          recordQuizAnswer({
            topicId: topic.id,
            questionId,
            optionIndex,
            questions: quizQuestions,
            passPercentage: topic.passPercentage,
          })
        }
        onCheckCodeQuestion={async (question, answer) => {
          const evaluation = await evaluateLearningCodeQuizAnswer({
            apiKey,
            topic,
            question,
            answer,
          });

          await recordCodeQuizEvaluation({
            topicId: topic.id,
            questionId: question.id,
            answer: evaluation.answer,
            isCorrect: evaluation.isCorrect,
            feedback: evaluation.feedback,
            expectedAnswer: evaluation.expectedAnswer,
            model: evaluation.model,
            questions: quizQuestions,
            passPercentage: topic.passPercentage,
          });

          return evaluation;
        }}
        onRetryQuiz={() => restartQuizAttempt(topic.id)}
      />
    </LearningPageShell>
  );
}
