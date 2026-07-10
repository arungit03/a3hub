import { db } from "./supabase.js";
import {
  collection,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
} from "./supabaseData.js";

export const QUIZ_PAPERS_COLLECTION = "quiz_papers";
export const GENERATED_QUIZ_COLLECTION = "generated_quiz";

const TWO_MARK_TYPE = "2mark";
const SIXTEEN_MARK_TYPE = "16mark";
const MIXED_FILTER = "mixed";

const toSafeText = (value) => String(value || "").trim();

const toNonNegativeInteger = (value, fallback = 0) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.trunc(numeric));
};

const normalizeQuestionText = (value) =>
  toSafeText(value).replace(/\s+/g, " ").toLowerCase();

const normalizeDifficulty = (value) => {
  const normalized = toSafeText(value).toLowerCase();
  if (["easy", "medium", "hard"].includes(normalized)) return normalized;
  return MIXED_FILTER;
};

const normalizeQuestionType = (value, marks = 0) => {
  const normalized = toSafeText(value).toLowerCase().replace(/[\s_-]+/g, "");
  if (normalized === TWO_MARK_TYPE || normalized === "2marks" || normalized === "2") {
    return TWO_MARK_TYPE;
  }
  if (
    normalized === SIXTEEN_MARK_TYPE ||
    normalized === "16marks" ||
    normalized === "sixteenmark" ||
    normalized === "sixteenmarks" ||
    normalized === "16"
  ) {
    return SIXTEEN_MARK_TYPE;
  }
  if (Number(marks) === 2) return TWO_MARK_TYPE;
  if (Number(marks) === 16) return SIXTEEN_MARK_TYPE;
  return "";
};

const getRandomFloat = () => {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.getRandomValues === "function") {
    const values = new Uint32Array(1);
    cryptoApi.getRandomValues(values);
    return values[0] / 0xffffffff;
  }
  return Math.random();
};

const normalizeQuestion = (question, paper) => {
  const questionText = toSafeText(question?.question || question?.prompt || question?.title);
  if (!questionText) return null;

  const marks = Number(question?.marks);

  // Determine type: explicit marks field (2 or 16) always wins over the type string.
  // This prevents a question stored as marks=2 but type="16mark" from leaking into
  // the 16-mark pool (and vice-versa).
  let type;
  if (marks === 2) {
    type = TWO_MARK_TYPE;
  } else if (marks === 16) {
    type = SIXTEEN_MARK_TYPE;
  } else {
    // marks field is missing / invalid — fall back to the type string
    const typeFromField = normalizeQuestionType(question?.type);
    type = typeFromField;
  }

  if (type !== TWO_MARK_TYPE && type !== SIXTEEN_MARK_TYPE) return null;

  return {
    ...question,
    id: toSafeText(question?.id),
    question: questionText,
    type,
    marks: type === TWO_MARK_TYPE ? 2 : 16,
    difficulty: normalizeDifficulty(question?.difficulty),
    parts: Array.isArray(question?.parts) ? question.parts : [],
    sourcePaperId: toSafeText(paper?.id),
    sourcePaperTitle: toSafeText(paper?.title) || "Untitled quiz paper",
    subject: toSafeText(paper?.subject),
  };
};

export async function fetchQuizPapers(ids, { database = db } = {}) {
  const paperIds = Array.from(new Set((ids || []).map(toSafeText).filter(Boolean)));
  if (paperIds.length === 0) return [];

  const snapshots = await Promise.all(
    paperIds.map(async (paperId) => {
      const snapshot = await getDoc(doc(database, QUIZ_PAPERS_COLLECTION, paperId));
      if (!snapshot.exists()) return null;
      return {
        id: snapshot.id,
        ...snapshot.data(),
      };
    })
  );

  return snapshots.filter(Boolean);
}

export function mergeQuestions(papers) {
  return (Array.isArray(papers) ? papers : [])
    .flatMap((paper) => {
      const questions = Array.isArray(paper?.questions) ? paper.questions : [];
      return questions.map((question) => normalizeQuestion(question, paper));
    })
    .filter(Boolean);
}

export function removeDuplicates(questions) {
  const seenIds = new Set();
  const seenTexts = new Set();

  return (Array.isArray(questions) ? questions : []).filter((question) => {
    const idKey = toSafeText(question?.id).toLowerCase();
    const textKey = normalizeQuestionText(question?.question);

    if (idKey && seenIds.has(idKey)) return false;
    if (textKey && seenTexts.has(textKey)) return false;

    if (idKey) seenIds.add(idKey);
    if (textKey) seenTexts.add(textKey);
    return true;
  });
}

export function shuffleArray(array) {
  const next = Array.isArray(array) ? [...array] : [];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(getRandomFloat() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }
  return next;
}

export function splitQuestion(question, type = "2parts") {
  const partMarks =
    type === "3parts" || type === "3"
      ? [5, 5, 6]
      : [8, 8];
  const existingParts = Array.isArray(question?.parts) ? question.parts : [];
  const baseQuestion = toSafeText(question?.question);
  const baseId = toSafeText(question?.id) || normalizeQuestionText(baseQuestion) || "question";

  return partMarks.map((marks, index) => {
    const existingPart = existingParts[index] || {};
    const partQuestion =
      toSafeText(existingPart.question) ||
      toSafeText(existingPart.prompt) ||
      `Part ${index + 1}: ${baseQuestion}`;

    return {
      id: `${baseId}-part-${index + 1}`,
      label: String.fromCharCode(97 + index),
      question: partQuestion,
      marks,
    };
  });
}

const buildGeneratedQuestion = (question, number, marks, parts = [], orOption = "") => {
  const sourceQuestionId = toSafeText(question?.id);
  return {
    id:
      sourceQuestionId ||
      `${toSafeText(question?.sourcePaperId) || "source"}-${number}${orOption}`,
    sourceQuestionId,
    sourcePaperId: toSafeText(question?.sourcePaperId),
    sourcePaperTitle: toSafeText(question?.sourcePaperTitle),
    subject: toSafeText(question?.subject),
    question: toSafeText(question?.question),
    type: marks === 2 ? TWO_MARK_TYPE : SIXTEEN_MARK_TYPE,
    marks,
    difficulty: normalizeDifficulty(question?.difficulty),
    // orGroup = Part B question number (11, 12…); orOption = "a" | "b" (OR choice)
    ...(orOption ? { orGroup: number, orOption } : {}),
    ...(parts.length > 0 ? { parts } : {}),
  };
};

export async function generateQuizPaper(config = {}) {
  const totalMarks = toNonNegativeInteger(config.totalMarks, 100);
  const twoMarkCount = toNonNegativeInteger(config.twoMarkCount, 0);
  const sixteenMarkCount = toNonNegativeInteger(config.sixteenMarkCount, 0);
  const expectedTotal = twoMarkCount * 2 + sixteenMarkCount * 16;

  if (totalMarks <= 0) {
    throw new Error("Total marks must be greater than zero.");
  }
  if (expectedTotal !== totalMarks) {
    throw new Error(
      `Marks distribution totals ${expectedTotal}. It must equal ${totalMarks}.`
    );
  }

  const papers = Array.isArray(config.papers)
    ? config.papers
    : await fetchQuizPapers(config.paperIds, { database: config.database || db });
  const sourcePaperIds = Array.from(
    new Set(
      (Array.isArray(config.paperIds) && config.paperIds.length > 0
        ? config.paperIds
        : papers.map((paper) => paper?.id)
      )
        .map(toSafeText)
        .filter(Boolean)
    )
  );

  if (papers.length < 2) {
    throw new Error("Select at least 2 quiz papers before generating.");
  }

  const difficulty = normalizeDifficulty(config.difficulty);
  const questionType = normalizeQuestionType(config.questionType) || MIXED_FILTER;
  const splitType = config.splitType === "3parts" ? "3parts" : "2parts";
  const shouldShuffle = config.shuffle !== false;

  const mergedQuestions = removeDuplicates(mergeQuestions(papers));
  const filteredQuestions = mergedQuestions.filter((question) => {
    const matchesDifficulty =
      difficulty === MIXED_FILTER || question.difficulty === difficulty;
    const matchesType =
      questionType === MIXED_FILTER || question.type === questionType;
    return matchesDifficulty && matchesType;
  });
  const workingQuestions = shouldShuffle
    ? shuffleArray(filteredQuestions)
    : [...filteredQuestions];
  // Double-guard: both type AND marks must match to prevent cross-pool contamination
  const twoMarkPool = workingQuestions.filter(
    (q) => q.type === TWO_MARK_TYPE && Number(q.marks) === 2
  );
  const sixteenMarkPool = workingQuestions.filter(
    (q) => q.type === SIXTEEN_MARK_TYPE && Number(q.marks) === 16
  );

  if (twoMarkPool.length < twoMarkCount) {
    throw new Error(
      `Need ${twoMarkCount} two-mark questions, but only ${twoMarkPool.length} are available.`
    );
  }
  // Part B presents every 16-mark question as an (a)/(b) OR choice, so each Part B
  // number needs TWO distinct questions. Marks still count each pair only once.
  const sixteenSlotsNeeded = sixteenMarkCount * 2;
  if (sixteenMarkPool.length < sixteenSlotsNeeded) {
    throw new Error(
      `Need ${sixteenSlotsNeeded} sixteen-mark questions for the (a) & (b) options of ${sixteenMarkCount} Part B question(s), but only ${sixteenMarkPool.length} are available.`
    );
  }

  const sectionA = twoMarkPool
    .slice(0, twoMarkCount)
    .map((question, index) => buildGeneratedQuestion(question, index + 1, 2));

  const selectedSixteen = sixteenMarkPool.slice(0, sixteenSlotsNeeded);
  const sectionB = [];
  for (let groupIndex = 0; groupIndex < sixteenMarkCount; groupIndex += 1) {
    const groupNumber = sectionA.length + groupIndex + 1; // 11, 12, 13 …
    ["a", "b"].forEach((option, optionIndex) => {
      const question = selectedSixteen[groupIndex * 2 + optionIndex];
      const parts = config.splitEnabled ? splitQuestion(question, splitType) : [];
      sectionB.push(
        buildGeneratedQuestion(question, groupNumber, 16, parts, option)
      );
    });
  }

  const sectionAMarks = sectionA.reduce(
    (total, question) => total + Number(question.marks || 0),
    0
  );
  // (a) and (b) are alternatives, so 16 marks per Part B number — not per question.
  const sectionBMarks = sixteenMarkCount * 16;
  const computedTotal = sectionAMarks + sectionBMarks;

  if (computedTotal !== totalMarks) {
    throw new Error(
      `Generated total is ${computedTotal}. Update the marks distribution and try again.`
    );
  }

  return {
    sourcePapers: sourcePaperIds,
    totalMarks,
    sections: {
      sectionA,
      sectionB,
    },
    config: {
      twoMarkCount,
      sixteenMarkCount,
      difficulty,
      questionType,
      shuffle: shouldShuffle,
      splitEnabled: Boolean(config.splitEnabled),
      splitType,
    },
    generatedAt: new Date().toISOString(),
  };
}

export async function saveGeneratedQuizPaper(
  generatedQuiz,
  { createdBy = "", createdByName = "", database = db } = {}
) {
  if (!generatedQuiz?.sections) {
    throw new Error("Generate a quiz preview before saving.");
  }

  const quizRef = doc(collection(database, GENERATED_QUIZ_COLLECTION));
  const payload = {
    sourcePapers: Array.isArray(generatedQuiz.sourcePapers)
      ? generatedQuiz.sourcePapers
      : [],
    totalMarks: Number(generatedQuiz.totalMarks || 0),
    sections: generatedQuiz.sections,
    createdBy: toSafeText(createdBy) || null,
    createdAt: serverTimestamp(),
    ...(toSafeText(createdByName) ? { createdByName: toSafeText(createdByName) } : {}),
    ...(generatedQuiz.config ? { config: generatedQuiz.config } : {}),
  };

  await setDoc(quizRef, payload);

  return {
    id: quizRef.id,
    ...payload,
  };
}
