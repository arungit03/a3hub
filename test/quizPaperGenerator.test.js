import assert from "node:assert/strict";
import test from "node:test";
import {
  generateQuizPaper,
  removeDuplicates,
  splitQuestion,
} from "../src/lib/quizPaperGenerator.js";

const samplePapers = [
  {
    id: "paper-a",
    title: "Paper A",
    subject: "Math",
    questions: [
      {
        id: "q1",
        question: "Define matrix rank.",
        type: "2mark",
        marks: 2,
        difficulty: "easy",
      },
      {
        id: "q2",
        question: "Explain Cayley Hamilton theorem.",
        type: "16mark",
        marks: 16,
        difficulty: "medium",
      },
    ],
  },
  {
    id: "paper-b",
    title: "Paper B",
    subject: "Math",
    questions: [
      {
        id: "q3",
        question: "State Eigen value.",
        type: "2mark",
        marks: 2,
        difficulty: "easy",
      },
      {
        id: "q4",
        question: "Solve a system using Gauss elimination.",
        type: "16mark",
        marks: 16,
        difficulty: "hard",
      },
    ],
  },
  {
    id: "paper-c",
    title: "Paper C",
    subject: "Math",
    questions: [
      {
        id: "q1",
        question: "Define matrix rank.",
        type: "2mark",
        marks: 2,
        difficulty: "easy",
      },
      {
        id: "q5",
        question: "Find inverse using adjoint method.",
        type: "16mark",
        marks: 16,
        difficulty: "medium",
      },
      {
        id: "q6",
        question: "Diagonalize the given matrix.",
        type: "16mark",
        marks: 16,
        difficulty: "hard",
      },
    ],
  },
];

test("removeDuplicates drops repeated question ids or text", () => {
  const uniqueQuestions = removeDuplicates([
    { id: "one", question: "What is DBMS?" },
    { id: "one", question: "Different text" },
    { id: "two", question: "What is DBMS?" },
    { id: "three", question: "What is SQL?" },
  ]);

  assert.deepEqual(
    uniqueQuestions.map((question) => question.id),
    ["one", "three"]
  );
});

test("splitQuestion creates expected sixteen-mark part totals", () => {
  const twoPartSplit = splitQuestion({ id: "q", question: "Discuss arrays." }, "2parts");
  const threePartSplit = splitQuestion({ id: "q", question: "Discuss arrays." }, "3parts");

  assert.deepEqual(
    twoPartSplit.map((part) => part.marks),
    [8, 8]
  );
  assert.deepEqual(
    threePartSplit.map((part) => part.marks),
    [5, 5, 6]
  );
});

test("generateQuizPaper enforces distribution and avoids duplicate questions", async () => {
  const generated = await generateQuizPaper({
    papers: samplePapers,
    totalMarks: 36,
    twoMarkCount: 2,
    sixteenMarkCount: 2,
    splitEnabled: true,
    splitType: "3parts",
    difficulty: "mixed",
    questionType: "mixed",
    shuffle: false,
  });

  assert.equal(generated.totalMarks, 36);
  assert.equal(generated.sections.sectionA.length, 2);
  // Part B carries an (a) and a (b) OR-option per number → 2 numbers × 2 = 4.
  assert.equal(generated.sections.sectionB.length, 4);
  assert.equal(generated.sections.sectionB[0].parts.length, 3);

  // Each Part B number has exactly an (a) and (b) option.
  assert.deepEqual(
    generated.sections.sectionB.map((q) => `${q.orGroup}${q.orOption}`),
    ["3a", "3b", "4a", "4b"]
  );

  // Marks: Part A (2×2) + Part B numbers counted once (2×16) = 36.
  const sectionAMarks = generated.sections.sectionA.reduce(
    (sum, question) => sum + question.marks,
    0
  );
  const sixteenGroups = new Set(
    generated.sections.sectionB.map((q) => q.orGroup)
  ).size;
  assert.equal(sectionAMarks + sixteenGroups * 16, 36);

  const questionTexts = [
    ...generated.sections.sectionA,
    ...generated.sections.sectionB,
  ].map((question) => question.question.toLowerCase());
  assert.equal(new Set(questionTexts).size, questionTexts.length);
});

test("generateQuizPaper rejects mismatched total marks", async () => {
  await assert.rejects(
    generateQuizPaper({
      papers: samplePapers,
      totalMarks: 100,
      twoMarkCount: 2,
      sixteenMarkCount: 2,
      shuffle: false,
    }),
    /Marks distribution totals 36/
  );
});
