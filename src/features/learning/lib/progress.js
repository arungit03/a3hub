import { LEARNING_CATALOG, getNextTopic } from "../data/catalog.js";
import { isCodeQuizQuestion } from "./quiz.js";

export const LEARNING_PROGRESS_STORAGE_PREFIX = "a3hub.learning-progress";
export const QUIZ_ANSWER_ORDER_VERSION = 2;
export const TOPIC_PROGRESS_WEIGHTS = Object.freeze({
  lesson: 50,
  quiz: 50,
});

const clampPercent = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(100, Math.round(numeric)));
};

const toSafeIdList = (value) =>
  Array.isArray(value)
    ? Array.from(new Set(value.map((item) => String(item || "").trim()).filter(Boolean)))
    : [];

const toSafeAnswerMap = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.entries(value).reduce((result, [questionId, answerIndex]) => {
    const safeQuestionId = String(questionId || "").trim();
    const safeAnswerIndex = Number(answerIndex);
    if (!safeQuestionId || !Number.isInteger(safeAnswerIndex) || safeAnswerIndex < 0) {
      return result;
    }
    result[safeQuestionId] = safeAnswerIndex;
    return result;
  }, {});
};

const toSafeCodeResponseMap = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.entries(value).reduce((result, [questionId, response]) => {
    const safeQuestionId = String(questionId || "").trim();
    if (!safeQuestionId || !response || typeof response !== "object") {
      return result;
    }

    const safeAnswer = String(response.answer || "").trim();
    const safeFeedback = String(response.feedback || "").trim();
    const safeExpectedAnswer = String(response.expectedAnswer || "").trim();
    const safeCheckedAt = String(response.checkedAt || "").trim();
    const safeModel = String(response.model || "").trim();

    if (
      !safeAnswer &&
      !safeFeedback &&
      !safeExpectedAnswer &&
      !safeCheckedAt &&
      !safeModel
    ) {
      return result;
    }

    result[safeQuestionId] = {
      answer: safeAnswer,
      isCorrect: Boolean(response.isCorrect),
      feedback: safeFeedback,
      expectedAnswer: safeExpectedAnswer,
      checkedAt: safeCheckedAt,
      model: safeModel,
    };
    return result;
  }, {});
};

const createEmptyTopicState = () => ({
  lessonCompleted: false,
  solvedProblemIds: [],
  quizAnswers: {},
  quizCodeResponses: {},
  quizAnswerOrderVersion: QUIZ_ANSWER_ORDER_VERSION,
  quizAttempts: 0,
  quizLastScore: 0,
  quizBestScore: 0,
  quizPassed: false,
  completedAt: "",
  quizCompletedAt: "",
  quizPassedAt: "",
});

const normalizeDateValue = (value) => {
  const raw = String(value || "").trim();
  return raw || "";
};

const toSafeRecentTopicIds = (value) =>
  Array.isArray(value)
    ? Array.from(new Set(value.map((item) => String(item || "").trim()).filter(Boolean))).slice(
        0,
        10
      )
    : [];

export const createEmptyLearningProgress = (userId = "") => ({
  userId: String(userId || "").trim(),
  topicStates: {},
  lastTopicId: "",
  recentTopicIds: [],
});

export const sanitizeLearningProgress = (value, userId = "") => {
  const raw =
    value && typeof value === "object"
      ? value
      : createEmptyLearningProgress(userId);

  const topicStates = Object.entries(raw.topicStates || {}).reduce(
    (result, [topicId, topicState]) => {
      const id = String(topicId || "").trim();
      if (!id) return result;
      const state =
        topicState && typeof topicState === "object" ? topicState : createEmptyTopicState();
      result[id] = {
        lessonCompleted: Boolean(state.lessonCompleted),
        solvedProblemIds: toSafeIdList(state.solvedProblemIds),
        quizAnswers: toSafeAnswerMap(state.quizAnswers),
        quizCodeResponses: toSafeCodeResponseMap(state.quizCodeResponses),
        quizAnswerOrderVersion: Math.max(
          0,
          Number(state.quizAnswerOrderVersion || 0) || 0
        ),
        quizAttempts: Math.max(0, Number(state.quizAttempts || 0) || 0),
        quizLastScore: clampPercent(state.quizLastScore),
        quizBestScore: clampPercent(state.quizBestScore),
        quizPassed: Boolean(state.quizPassed),
        completedAt: normalizeDateValue(state.completedAt),
        quizCompletedAt: normalizeDateValue(state.quizCompletedAt),
        quizPassedAt: normalizeDateValue(state.quizPassedAt),
      };
      return result;
    },
    {}
  );

  return {
    userId: String(raw.userId || userId || "").trim(),
    topicStates,
    lastTopicId: String(raw.lastTopicId || "").trim(),
    recentTopicIds: toSafeRecentTopicIds(raw.recentTopicIds),
  };
};

export const getTopicState = (progress, topicId) =>
  sanitizeLearningProgress(progress).topicStates[topicId] || createEmptyTopicState();

export const calculateQuizScorePercentage = (questions = [], quizAnswers = {}) => {
  if (!Array.isArray(questions) || questions.length === 0) return 0;

  const correctAnswers = questions.reduce((total, question) => {
    if (isCodeQuizQuestion(question)) {
      return total + (quizAnswers?.[question.id]?.isCorrect ? 1 : 0);
    }

    return total + (quizAnswers[question.id] === question.answerIndex ? 1 : 0);
  }, 0);

  return clampPercent((correctAnswers / questions.length) * 100);
};

export const calculateTopicProgress = ({ topicState }) => {
  const safeState = topicState || createEmptyTopicState();

  const lessonScore = safeState.lessonCompleted ? TOPIC_PROGRESS_WEIGHTS.lesson : 0;
  const quizScore = safeState.quizPassed ? TOPIC_PROGRESS_WEIGHTS.quiz : 0;

  return clampPercent(lessonScore + quizScore);
};

export const buildLearningProgressSummary = (
  progress,
  catalog = LEARNING_CATALOG
) => {
  const safeProgress = sanitizeLearningProgress(progress);
  const topicProgressById = {};
  const courseProgress = {};
  let completedLessonsCount = 0;
  let passedQuizzesCount = 0;
  let solvedProblemsCount = 0;

  catalog.courses.forEach((course) => {
    const topics = catalog.topicsByCourse[course.id] || [];
    const progressValues = topics.map((topic) => {
      const topicState = getTopicState(safeProgress, topic.id);
      const progressValue = calculateTopicProgress({ topic, topicState });
      topicProgressById[topic.id] = progressValue;
      if (topicState.lessonCompleted) {
        completedLessonsCount += 1;
      }
      if (topicState.quizPassed) {
        passedQuizzesCount += 1;
      }
      solvedProblemsCount += topicState.solvedProblemIds.length;
      return progressValue;
    });

    const average =
      progressValues.length > 0
        ? progressValues.reduce((sum, value) => sum + value, 0) / progressValues.length
        : 0;

    courseProgress[course.id] = clampPercent(average);
  });

  const overallProgress =
    catalog.courses.length > 0
      ? clampPercent(
          catalog.courses.reduce(
            (sum, course) => sum + Number(courseProgress[course.id] || 0),
            0
          ) / catalog.courses.length
        )
      : 0;

  const orderedTopics = catalog.courses.flatMap(
    (course) => catalog.topicsByCourse[course.id] || []
  );
  const recommendedTopic =
    orderedTopics.find((topic) => (topicProgressById[topic.id] || 0) < 100) ||
    getNextTopic(safeProgress.lastTopicId, catalog) ||
    orderedTopics[0] ||
    null;

  return {
    topicProgressById,
    courseProgress,
    overallProgress,
    completedLessonsCount,
    passedQuizzesCount,
    solvedProblemsCount,
    recommendedTopic,
  };
};

export const markLessonCompletedState = (progress, topicId) => {
  const safeProgress = sanitizeLearningProgress(progress);
  const nextTopicState = {
    ...getTopicState(safeProgress, topicId),
    lessonCompleted: true,
    completedAt: new Date().toISOString(),
  };

  return {
    ...safeProgress,
    lastTopicId: topicId,
    topicStates: {
      ...safeProgress.topicStates,
      [topicId]: nextTopicState,
    },
  };
};

export const recordTopicVisitState = (progress, topicId) => {
  const safeProgress = sanitizeLearningProgress(progress);
  const safeTopicId = String(topicId || "").trim();

  if (!safeTopicId) {
    return safeProgress;
  }

  const nextRecentTopicIds = [
    safeTopicId,
    ...safeProgress.recentTopicIds.filter((item) => item !== safeTopicId),
  ].slice(0, 10);

  if (
    safeProgress.lastTopicId === safeTopicId &&
    safeProgress.recentTopicIds[0] === safeTopicId
  ) {
    return safeProgress;
  }

  return {
    ...safeProgress,
    lastTopicId: safeTopicId,
    recentTopicIds: nextRecentTopicIds,
  };
};

export const restartQuizAttemptState = (progress, topicId) => {
  const safeProgress = sanitizeLearningProgress(progress);
  const topicState = getTopicState(safeProgress, topicId);

  return {
    ...safeProgress,
    lastTopicId: topicId,
    topicStates: {
      ...safeProgress.topicStates,
      [topicId]: {
        ...topicState,
        quizAnswers: {},
        quizCodeResponses: {},
        quizAnswerOrderVersion: QUIZ_ANSWER_ORDER_VERSION,
        quizLastScore: 0,
        quizCompletedAt: "",
      },
    },
  };
};

export const toggleSolvedProblemState = (progress, topicId, problemId) => {
  const safeProgress = sanitizeLearningProgress(progress);
  const topicState = getTopicState(safeProgress, topicId);
  const solvedIds = new Set(topicState.solvedProblemIds);
  if (solvedIds.has(problemId)) {
    solvedIds.delete(problemId);
  } else {
    solvedIds.add(problemId);
  }

  return {
    ...safeProgress,
    lastTopicId: topicId,
    topicStates: {
      ...safeProgress.topicStates,
      [topicId]: {
        ...topicState,
        solvedProblemIds: Array.from(solvedIds),
      },
    },
  };
};

export const recordQuizAnswerState = ({
  progress,
  topicId,
  questionId,
  optionIndex,
  questions = [],
  passPercentage = 60,
}) => {
  const safeProgress = sanitizeLearningProgress(progress);
  const safeTopicId = String(topicId || "").trim();
  const safeQuestionId = String(questionId || "").trim();
  const safeOptionIndex = Number(optionIndex);

  if (
    !safeTopicId ||
    !safeQuestionId ||
    !Number.isInteger(safeOptionIndex) ||
    safeOptionIndex < 0
  ) {
    return safeProgress;
  }

  const topicState = getTopicState(safeProgress, safeTopicId);
  if (topicState.quizAnswers[safeQuestionId] !== undefined || topicState.quizCompletedAt) {
    return safeProgress;
  }

  const nextQuizAnswers = {
    ...topicState.quizAnswers,
    [safeQuestionId]: safeOptionIndex,
  };
  const safeQuestions = Array.isArray(questions) ? questions : [];
  const quizCompleted =
    safeQuestions.length > 0 &&
    safeQuestions.every((question) =>
      isCodeQuizQuestion(question)
        ? topicState.quizCodeResponses[question.id] !== undefined
        : nextQuizAnswers[question.id] !== undefined
    );
  const nextTopicState = {
    ...topicState,
    quizAnswers: nextQuizAnswers,
    quizAnswerOrderVersion: QUIZ_ANSWER_ORDER_VERSION,
  };

  if (quizCompleted) {
    const scorePercentage = calculateQuizScorePercentage(safeQuestions, {
      ...nextQuizAnswers,
      ...topicState.quizCodeResponses,
    });
    const passed = scorePercentage >= clampPercent(passPercentage);
    nextTopicState.quizAttempts = topicState.quizAttempts + 1;
    nextTopicState.quizLastScore = scorePercentage;
    nextTopicState.quizBestScore = Math.max(topicState.quizBestScore, scorePercentage);
    nextTopicState.quizPassed = passed || topicState.quizPassed;
    nextTopicState.quizCompletedAt =
      topicState.quizCompletedAt || new Date().toISOString();
    nextTopicState.quizPassedAt =
      passed && !topicState.quizPassed
        ? new Date().toISOString()
        : topicState.quizPassedAt;
  }

  return {
    ...safeProgress,
    lastTopicId: safeTopicId,
    topicStates: {
      ...safeProgress.topicStates,
      [safeTopicId]: nextTopicState,
    },
  };
};

export const recordCodeQuizEvaluationState = ({
  progress,
  topicId,
  questionId,
  answer,
  isCorrect,
  feedback = "",
  expectedAnswer = "",
  model = "",
  questions = [],
  passPercentage = 60,
}) => {
  const safeProgress = sanitizeLearningProgress(progress);
  const safeTopicId = String(topicId || "").trim();
  const safeQuestionId = String(questionId || "").trim();
  const safeAnswer = String(answer || "").trim();

  if (!safeTopicId || !safeQuestionId || !safeAnswer) {
    return safeProgress;
  }

  const topicState = getTopicState(safeProgress, safeTopicId);
  if (topicState.quizCodeResponses[safeQuestionId] !== undefined || topicState.quizCompletedAt) {
    return safeProgress;
  }

  const nextQuizCodeResponses = {
    ...topicState.quizCodeResponses,
    [safeQuestionId]: {
      answer: safeAnswer,
      isCorrect: Boolean(isCorrect),
      feedback: String(feedback || "").trim(),
      expectedAnswer: String(expectedAnswer || "").trim(),
      checkedAt: new Date().toISOString(),
      model: String(model || "").trim(),
    },
  };
  const safeQuestions = Array.isArray(questions) ? questions : [];
  const quizCompleted =
    safeQuestions.length > 0 &&
    safeQuestions.every((question) =>
      isCodeQuizQuestion(question)
        ? nextQuizCodeResponses[question.id] !== undefined
        : topicState.quizAnswers[question.id] !== undefined
    );
  const nextTopicState = {
    ...topicState,
    quizCodeResponses: nextQuizCodeResponses,
  };

  if (quizCompleted) {
    const scorePercentage = calculateQuizScorePercentage(safeQuestions, {
      ...topicState.quizAnswers,
      ...nextQuizCodeResponses,
    });
    const passed = scorePercentage >= clampPercent(passPercentage);
    nextTopicState.quizAttempts = topicState.quizAttempts + 1;
    nextTopicState.quizLastScore = scorePercentage;
    nextTopicState.quizBestScore = Math.max(topicState.quizBestScore, scorePercentage);
    nextTopicState.quizPassed = passed || topicState.quizPassed;
    nextTopicState.quizCompletedAt =
      topicState.quizCompletedAt || new Date().toISOString();
    nextTopicState.quizPassedAt =
      passed && !topicState.quizPassed
        ? new Date().toISOString()
        : topicState.quizPassedAt;
  }

  return {
    ...safeProgress,
    lastTopicId: safeTopicId,
    topicStates: {
      ...safeProgress.topicStates,
      [safeTopicId]: nextTopicState,
    },
  };
};

export const recordQuizResultState = (
  progress,
  topicId,
  scorePercentage,
  passed
) => {
  const safeProgress = sanitizeLearningProgress(progress);
  const topicState = getTopicState(safeProgress, topicId);
  const nextBestScore = Math.max(topicState.quizBestScore, clampPercent(scorePercentage));
  return {
    ...safeProgress,
    lastTopicId: topicId,
    topicStates: {
      ...safeProgress.topicStates,
      [topicId]: {
        ...topicState,
        quizAnswers: topicState.quizAnswers,
        quizAnswerOrderVersion: QUIZ_ANSWER_ORDER_VERSION,
        quizAttempts: topicState.quizAttempts + 1,
        quizLastScore: clampPercent(scorePercentage),
        quizBestScore: nextBestScore,
        quizPassed: Boolean(passed) || topicState.quizPassed,
        quizCompletedAt:
          topicState.quizCompletedAt || new Date().toISOString(),
        quizPassedAt:
          Boolean(passed) && !topicState.quizPassed
            ? new Date().toISOString()
            : topicState.quizPassedAt,
      },
    },
  };
};

export const createProgressSavePayload = (
  progress,
  catalog = LEARNING_CATALOG
) => {
  const safeProgress = sanitizeLearningProgress(progress);
  const summary = buildLearningProgressSummary(safeProgress, catalog);
  return {
    ...safeProgress,
    courseProgress: summary.courseProgress,
    overallProgress: summary.overallProgress,
    completedLessonsCount: summary.completedLessonsCount,
    passedQuizzesCount: summary.passedQuizzesCount,
    solvedProblemsCount: summary.solvedProblemsCount,
    recommendedTopicId: summary.recommendedTopic?.id || "",
  };
};

export const getLearningProgressStorageKey = (userId) =>
  `${LEARNING_PROGRESS_STORAGE_PREFIX}.${String(userId || "guest").trim() || "guest"}`;

export const loadLearningProgressFromStorage = (userId) => {
  if (typeof window === "undefined") {
    return createEmptyLearningProgress(userId);
  }

  try {
    const raw = window.localStorage.getItem(getLearningProgressStorageKey(userId));
    if (!raw) return createEmptyLearningProgress(userId);
    return sanitizeLearningProgress(JSON.parse(raw), userId);
  } catch {
    return createEmptyLearningProgress(userId);
  }
};

export const saveLearningProgressToStorage = (userId, progress) => {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      getLearningProgressStorageKey(userId),
      JSON.stringify(createProgressSavePayload(progress))
    );
  } catch {
    // Ignore local storage write failures so learning pages remain usable.
  }
};
