import test from "node:test";
import assert from "node:assert/strict";
import {
  LEARNING_CATALOG,
  getTopicByCourseAndSlug,
} from "../src/features/learning/data/catalog.js";
import {
  buildLearningProgressSummary,
  calculateQuizScorePercentage,
  createEmptyLearningProgress,
  markLessonCompletedState,
  recordQuizAnswerState,
  recordCodeQuizEvaluationState,
  recordQuizResultState,
  restartQuizAttemptState,
  toggleSolvedProblemState,
} from "../src/features/learning/lib/progress.js";
import { isCodeQuizQuestion } from "../src/features/learning/lib/quiz.js";
import {
  getStableQuizQuestions,
  migrateQuizAnswersToStableOrder,
} from "../src/features/learning/lib/quiz.js";

test("learning catalog includes required courses and sample topic content", () => {
  assert.equal(LEARNING_CATALOG.courses.length, 5);
  assert.equal(LEARNING_CATALOG.topics.length, 195);

  const topic = getTopicByCourseAndSlug("python", "variables");
  assert.ok(topic);
  assert.equal(topic.practiceProblems.length, 3);
  assert.equal(topic.quizQuestions.length, 5);
  assert.match(topic.explanation, /Variables store data/i);
  assert.equal(topic.quizQuestions.some((question) => question.code), true);
  assert.equal(topic.quizQuestions.some((question) => question.type === "code"), true);

  const htmlTopic = getTopicByCourseAndSlug("html", "introduction-to-html");
  assert.ok(htmlTopic);
  assert.equal(htmlTopic.practiceProblems.length, 3);
  assert.equal(htmlTopic.quizQuestions.length, 5);
  assert.match(htmlTopic.explanation, /HTML stands for/i);
  assert.equal(
    htmlTopic.quizQuestions.some((question) => question.codeLanguage === "html"),
    true
  );

  const pythonAdvancedTopic = getTopicByCourseAndSlug("python", "generators");
  assert.ok(pythonAdvancedTopic);
  assert.match(pythonAdvancedTopic.exampleCode, /yield start/);

  const cAdvancedTopic = getTopicByCourseAndSlug("c", "bitwise-operators");
  assert.ok(cAdvancedTopic);
  assert.match(cAdvancedTopic.exampleCode, /6 & 3/);

  const cppAdvancedTopic = getTopicByCourseAndSlug("cpp", "templates");
  assert.ok(cppAdvancedTopic);
  assert.match(cppAdvancedTopic.exampleCode, /template <typename T>/);

  const cssTopic = getTopicByCourseAndSlug("css", "css-flexbox");
  assert.ok(cssTopic);
  assert.equal(cssTopic.quizQuestions.length, 5);
  assert.equal(cssTopic.quizQuestions.some((question) => question.type === "code"), true);
  assert.equal(
    cssTopic.quizQuestions.some((question) => question.codeLanguage === "css"),
    true
  );
  assert.equal(cssTopic.level, "Advanced");
  assert.match(cssTopic.explanation, /layout system/i);
  assert.match(cssTopic.previewHtml, /display:\s*flex/i);
});

test("learning progress summary uses 50 percent lesson and 50 percent quiz", () => {
  const topic = getTopicByCourseAndSlug("python", "variables");
  assert.ok(topic);

  let progress = createEmptyLearningProgress("user-1");
  progress = markLessonCompletedState(progress, topic.id);
  progress = toggleSolvedProblemState(progress, topic.id, topic.practiceProblems[0].id);
  progress = recordQuizResultState(progress, topic.id, 80, true);

  const summary = buildLearningProgressSummary(progress, LEARNING_CATALOG);
  const topicProgress = summary.topicProgressById[topic.id];

  assert.equal(topicProgress, 100);
  assert.equal(summary.completedLessonsCount, 1);
  assert.equal(summary.passedQuizzesCount, 1);
  assert.equal(summary.solvedProblemsCount, 1);
});

test("quiz answers are stored and locked once selected", () => {
  const topic = getTopicByCourseAndSlug("python", "variables");
  assert.ok(topic);
  const mcqQuestions = topic.quizQuestions.filter(
    (question) => !isCodeQuizQuestion(question)
  );
  const codeQuestion = topic.quizQuestions.find((question) => isCodeQuizQuestion(question));
  assert.ok(codeQuestion);

  let progress = createEmptyLearningProgress("user-2");
  progress = recordQuizAnswerState({
    progress,
    topicId: topic.id,
    questionId: mcqQuestions[0].id,
    optionIndex: 1,
    questions: topic.quizQuestions,
    passPercentage: topic.passPercentage,
  });

  assert.equal(progress.topicStates[topic.id].quizAnswers[mcqQuestions[0].id], 1);
  assert.equal(progress.topicStates[topic.id].quizCompletedAt, "");

  progress = recordQuizAnswerState({
    progress,
    topicId: topic.id,
    questionId: mcqQuestions[0].id,
    optionIndex: 0,
    questions: topic.quizQuestions,
    passPercentage: topic.passPercentage,
  });

  assert.equal(progress.topicStates[topic.id].quizAnswers[mcqQuestions[0].id], 1);

  mcqQuestions.slice(1).forEach((question) => {
    progress = recordQuizAnswerState({
      progress,
      topicId: topic.id,
      questionId: question.id,
      optionIndex: question.answerIndex,
      questions: topic.quizQuestions,
      passPercentage: topic.passPercentage,
    });
  });

  progress = recordCodeQuizEvaluationState({
    progress,
    topicId: topic.id,
    questionId: codeQuestion.id,
    answer: "marks = 25",
    isCorrect: true,
    feedback: "Correct answer.",
    expectedAnswer: "",
    model: "test-ai",
    questions: topic.quizQuestions,
    passPercentage: topic.passPercentage,
  });

  const topicState = progress.topicStates[topic.id];
  const calculatedScore = calculateQuizScorePercentage(topic.quizQuestions, {
    ...topicState.quizAnswers,
    ...topicState.quizCodeResponses,
  });

  assert.ok(topicState.quizCompletedAt);
  assert.equal(topicState.quizAttempts, 1);
  assert.equal(topicState.quizLastScore, calculatedScore);
  assert.equal(topicState.quizCodeResponses[codeQuestion.id].isCorrect, true);
});

test("code quiz answers are stored and stay locked after AI review", () => {
  const topic = getTopicByCourseAndSlug("cpp", "constructors");
  assert.ok(topic);
  const codeQuestion = topic.quizQuestions.find((question) => isCodeQuizQuestion(question));
  assert.ok(codeQuestion);

  let progress = createEmptyLearningProgress("user-3");
  progress = recordCodeQuizEvaluationState({
    progress,
    topicId: topic.id,
    questionId: codeQuestion.id,
    answer: "Box box;",
    isCorrect: false,
    feedback: "Use the correct object creation line.",
    expectedAnswer: "Box box;",
    model: "test-ai",
    questions: topic.quizQuestions,
    passPercentage: topic.passPercentage,
  });

  progress = recordCodeQuizEvaluationState({
    progress,
    topicId: topic.id,
    questionId: codeQuestion.id,
    answer: "Another answer",
    isCorrect: true,
    feedback: "Changed answer",
    expectedAnswer: "",
    model: "test-ai",
    questions: topic.quizQuestions,
    passPercentage: topic.passPercentage,
  });

  assert.equal(
    progress.topicStates[topic.id].quizCodeResponses[codeQuestion.id].answer,
    "Box box;"
  );
  assert.equal(
    progress.topicStates[topic.id].quizCodeResponses[codeQuestion.id].isCorrect,
    false
  );
});

test("quiz retries preserve best score and reopen the attempt", () => {
  const topic = getTopicByCourseAndSlug("css", "css-colors");
  assert.ok(topic);

  let progress = createEmptyLearningProgress("user-4");
  progress = recordQuizResultState(progress, topic.id, 80, true);
  progress = restartQuizAttemptState(progress, topic.id);

  assert.deepEqual(progress.topicStates[topic.id].quizAnswers, {});
  assert.equal(progress.topicStates[topic.id].quizCompletedAt, "");
  assert.equal(progress.topicStates[topic.id].quizBestScore, 80);
  assert.equal(progress.topicStates[topic.id].quizPassed, true);

  progress = recordQuizResultState(progress, topic.id, 40, false);

  assert.equal(progress.topicStates[topic.id].quizAttempts, 2);
  assert.equal(progress.topicStates[topic.id].quizBestScore, 80);
  assert.equal(progress.topicStates[topic.id].quizPassed, true);
});

test("quiz options use a stable shuffled order", () => {
  const topic = getTopicByCourseAndSlug("python", "introduction");
  assert.ok(topic);

  const shuffledQuestions = getStableQuizQuestions(topic.quizQuestions);
  const shuffledAgain = getStableQuizQuestions(topic.quizQuestions);

  assert.deepEqual(shuffledQuestions, shuffledAgain);
  assert.equal(
    shuffledQuestions.every((question) => question.answerIndex === 0),
    false
  );
});

test("stored raw-order answers can migrate to the shuffled quiz order", () => {
  const topic = getTopicByCourseAndSlug("python", "introduction");
  assert.ok(topic);

  const migratedAnswers = migrateQuizAnswersToStableOrder(topic.quizQuestions, {
    [topic.quizQuestions[0].id]: 0,
  });
  const shuffledQuestions = getStableQuizQuestions(topic.quizQuestions);
  const originalCorrectOption = topic.quizQuestions[0].options[0];
  const migratedQuestion = shuffledQuestions[0];

  assert.equal(
    migratedQuestion.options[migratedAnswers[migratedQuestion.id]],
    originalCorrectOption
  );
});
