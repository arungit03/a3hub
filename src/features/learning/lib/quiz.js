const MAX_RANDOM_UINT = 4294967296;

const hashString = (value) => {
  const text = String(value || "");
  let hash = 2166136261;

  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
};

const createSeededRandom = (seedValue) => {
  let seed = hashString(seedValue) || 1;

  return () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return (seed >>> 0) / MAX_RANDOM_UINT;
  };
};

const normalizeOptions = (options) =>
  Array.isArray(options)
    ? options.map((option) => String(option || "").trim()).filter(Boolean)
    : [];

export const isCodeQuizQuestion = (question = {}) =>
  String(question?.type || "")
    .trim()
    .toLowerCase() === "code";

export const getStableQuizQuestions = (questions = []) => {
  if (!Array.isArray(questions)) {
    return [];
  }

  return questions.map((question, questionIndex) => {
    const id = String(question?.id || `question-${questionIndex + 1}`).trim();
    if (isCodeQuizQuestion(question)) {
      return {
        ...question,
        id,
        type: "code",
        options: [],
        answerIndex: -1,
      };
    }

    const options = normalizeOptions(question?.options);
    const answerIndex = Number(question?.answerIndex);

    if (
      options.length < 2 ||
      !Number.isInteger(answerIndex) ||
      answerIndex < 0 ||
      answerIndex >= options.length
    ) {
      return {
        ...question,
        id,
        options,
        answerIndex: 0,
      };
    }

    const shuffledEntries = options.map((option, optionIndex) => ({
      option,
      originalIndex: optionIndex,
    }));
    const random = createSeededRandom(id);

    for (let index = shuffledEntries.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(random() * (index + 1));
      [shuffledEntries[index], shuffledEntries[swapIndex]] = [
        shuffledEntries[swapIndex],
        shuffledEntries[index],
      ];
    }

    return {
      ...question,
      id,
      options: shuffledEntries.map((entry) => entry.option),
      answerIndex: shuffledEntries.findIndex(
        (entry) => entry.originalIndex === answerIndex
      ),
    };
  });
};

export const migrateQuizAnswersToStableOrder = (questions = [], quizAnswers = {}) => {
  if (!quizAnswers || typeof quizAnswers !== "object" || Array.isArray(quizAnswers)) {
    return {};
  }

  const stableQuestions = getStableQuizQuestions(questions);

  return stableQuestions.reduce((result, stableQuestion, questionIndex) => {
    const rawQuestion = questions[questionIndex];
    if (isCodeQuizQuestion(stableQuestion) || isCodeQuizQuestion(rawQuestion)) {
      return result;
    }
    const savedAnswerIndex = Number(quizAnswers[stableQuestion.id]);

    if (
      !rawQuestion ||
      !Array.isArray(rawQuestion.options) ||
      !Number.isInteger(savedAnswerIndex) ||
      savedAnswerIndex < 0 ||
      savedAnswerIndex >= rawQuestion.options.length
    ) {
      return result;
    }

    const selectedOption = rawQuestion.options[savedAnswerIndex];
    const stableAnswerIndex = stableQuestion.options.findIndex(
      (option) => option === selectedOption
    );

    if (stableAnswerIndex === -1) {
      return result;
    }

    result[stableQuestion.id] = stableAnswerIndex;
    return result;
  }, {});
};
