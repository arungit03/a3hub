import { useMemo, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  limit,
  query,
  serverTimestamp,
  setDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useAuth } from "../../state/auth";
import { useRealtimeCollection } from "../hooks/useRealtimeCollection";
import { AUDIT_ACTIONS, logAuditEvent } from "../lib/auditLogs";
import {
  LEARNING_COLLECTIONS,
  LEARNING_SEED_DATA,
  LEARNING_TOPICS,
  buildLearningCatalog,
} from "../../features/learning/data/catalog.js";

const EMPTY_FORM = Object.freeze({
  courseId: "python",
  slug: "",
  title: "",
  order: "",
  explanation: "",
  syntax: "",
  exampleCode: "",
  output: "",
  notesText: "",
  commonMistakesText: "",
  problemsJson: "[]",
  quizJson: "[]",
});

const toSafeText = (value) => String(value || "").trim();

const toPrettyJson = (value) => JSON.stringify(value || [], null, 2);

const splitLines = (value) =>
  String(value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

export default function AdminLearningPage() {
  const { user, profile } = useAuth();
  const [statusMessage, setStatusMessage] = useState("");
  const [busyKey, setBusyKey] = useState("");
  const [selectedTopicId, setSelectedTopicId] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);

  const courseQuery = useMemo(
    () => query(collection(db, LEARNING_COLLECTIONS.courses), limit(20)),
    []
  );
  const topicQuery = useMemo(
    () => query(collection(db, LEARNING_COLLECTIONS.topics), limit(300)),
    []
  );
  const quizQuery = useMemo(
    () => query(collection(db, LEARNING_COLLECTIONS.quizzes), limit(300)),
    []
  );
  const problemQuery = useMemo(
    () => query(collection(db, LEARNING_COLLECTIONS.problems), limit(300)),
    []
  );

  const coursesState = useRealtimeCollection(courseQuery, {
    map: (docItem) => ({ id: docItem.id, ...docItem.data() }),
    onErrorMessage: "Unable to load learning courses.",
  });
  const topicsState = useRealtimeCollection(topicQuery, {
    map: (docItem) => ({ id: docItem.id, ...docItem.data() }),
    onErrorMessage: "Unable to load learning topics.",
  });
  const quizzesState = useRealtimeCollection(quizQuery, {
    map: (docItem) => ({ id: docItem.id, ...docItem.data() }),
    onErrorMessage: "Unable to load learning quizzes.",
  });
  const problemsState = useRealtimeCollection(problemQuery, {
    map: (docItem) => ({ id: docItem.id, ...docItem.data() }),
    onErrorMessage: "Unable to load learning problems.",
  });

  const mergedCatalog = useMemo(
    () =>
      buildLearningCatalog({
        courseDocs: coursesState.data,
        topicDocs: topicsState.data,
        quizDocs: quizzesState.data,
        problemDocs: problemsState.data,
      }),
    [coursesState.data, problemsState.data, quizzesState.data, topicsState.data]
  );

  const performedBy = useMemo(
    () => ({
      uid: user?.uid || "",
      name: profile?.name || user?.displayName || user?.email || "Admin",
      email: user?.email || "",
      role: profile?.role || "admin",
    }),
    [profile?.name, profile?.role, user?.displayName, user?.email, user?.uid]
  );

  const topicOptions = useMemo(
    () =>
      mergedCatalog.topics
        .slice()
        .sort((left, right) =>
          left.courseId === right.courseId
            ? left.order - right.order
            : left.courseId.localeCompare(right.courseId)
        ),
    [mergedCatalog.topics]
  );

  const isBuiltInTopic = useMemo(
    () => LEARNING_TOPICS.some((topic) => topic.id === selectedTopicId),
    [selectedTopicId]
  );

  const resetForm = () => {
    setSelectedTopicId("");
    setForm(EMPTY_FORM);
    setStatusMessage("");
  };

  const handleLoadTopic = (topicId) => {
    setSelectedTopicId(topicId);
    const topic = mergedCatalog.topicsById[topicId];
    if (!topic) {
      resetForm();
      return;
    }

    setForm({
      courseId: topic.courseId,
      slug: topic.slug,
      title: topic.title,
      order: String(topic.order || ""),
      explanation: topic.explanation || "",
      syntax: topic.syntax || "",
      exampleCode: topic.exampleCode || "",
      output: topic.output || "",
      notesText: (topic.notes || []).join("\n"),
      commonMistakesText: (topic.commonMistakes || []).join("\n"),
      problemsJson: toPrettyJson(topic.practiceProblems),
      quizJson: toPrettyJson(topic.quizQuestions),
    });
    setStatusMessage("");
  };

  const handleSeedDefaultContent = async () => {
    if (busyKey) return;
    setBusyKey("seed");
    setStatusMessage("");

    try {
      const batch = writeBatch(db);
      LEARNING_SEED_DATA.courses.forEach((course) => {
        batch.set(
          doc(db, LEARNING_COLLECTIONS.courses, course.id),
          {
            ...course,
            updatedAt: serverTimestamp(),
            updatedBy: user?.uid || null,
          },
          { merge: true }
        );
      });
      LEARNING_SEED_DATA.topics.forEach((topic) => {
        batch.set(
          doc(db, LEARNING_COLLECTIONS.topics, topic.id),
          {
            ...topic,
            updatedAt: serverTimestamp(),
            updatedBy: user?.uid || null,
          },
          { merge: true }
        );
      });
      LEARNING_SEED_DATA.quizzes.forEach((quiz) => {
        batch.set(
          doc(db, LEARNING_COLLECTIONS.quizzes, quiz.id),
          {
            ...quiz,
            updatedAt: serverTimestamp(),
            updatedBy: user?.uid || null,
          },
          { merge: true }
        );
      });
      LEARNING_SEED_DATA.problems.forEach((problem) => {
        batch.set(
          doc(db, LEARNING_COLLECTIONS.problems, problem.id),
          {
            ...problem,
            updatedAt: serverTimestamp(),
            updatedBy: user?.uid || null,
          },
          { merge: true }
        );
      });
      await batch.commit();

      await logAuditEvent({
        db,
        action: AUDIT_ACTIONS.LEARNING_UPDATED,
        module: "learning",
        targetId: "seed-learning-content",
        performedBy,
        metadata: {
          coursesSeeded: LEARNING_SEED_DATA.courses.length,
          topicsSeeded: LEARNING_SEED_DATA.topics.length,
        },
      }).catch(() => {});

      setStatusMessage("Default learning content seeded to Firestore.");
    } catch {
      setStatusMessage("Unable to seed default learning content.");
    } finally {
      setBusyKey("");
    }
  };

  const handleSave = async (event) => {
    event.preventDefault();
    if (busyKey) return;

    const courseId = toSafeText(form.courseId).toLowerCase();
    const slug = toSafeText(form.slug).toLowerCase();
    const title = toSafeText(form.title);
    if (!courseId || !slug || !title) {
      setStatusMessage("Course, slug, and title are required.");
      return;
    }

    let parsedProblems = [];
    let parsedQuiz = [];

    try {
      parsedProblems = JSON.parse(form.problemsJson || "[]");
      parsedQuiz = JSON.parse(form.quizJson || "[]");
    } catch {
      setStatusMessage("Problems and quiz content must be valid JSON arrays.");
      return;
    }

    if (!Array.isArray(parsedProblems) || parsedProblems.length < 3) {
      setStatusMessage("Each topic needs at least 3 practice problems.");
      return;
    }

    if (!Array.isArray(parsedQuiz) || parsedQuiz.length < 5) {
      setStatusMessage("Each topic needs at least 5 quiz questions.");
      return;
    }

    const topicId = `${courseId}:${slug}`;
    setBusyKey("save");
    setStatusMessage("");

    try {
      await Promise.all([
        setDoc(
          doc(db, LEARNING_COLLECTIONS.topics, topicId),
          {
            topicId,
            courseId,
            slug,
            title,
            order: Number(form.order || 999),
            explanation: form.explanation.trim(),
            syntax: form.syntax.trim(),
            exampleCode: form.exampleCode.trim(),
            output: form.output.trim(),
            notes: splitLines(form.notesText),
            commonMistakes: splitLines(form.commonMistakesText),
            isArchived: false,
            updatedAt: serverTimestamp(),
            updatedBy: user?.uid || null,
          },
          { merge: true }
        ),
        setDoc(
          doc(db, LEARNING_COLLECTIONS.quizzes, topicId),
          {
            topicId,
            courseId,
            slug,
            questions: parsedQuiz,
            passPercentage: 60,
            isArchived: false,
            updatedAt: serverTimestamp(),
            updatedBy: user?.uid || null,
          },
          { merge: true }
        ),
        setDoc(
          doc(db, LEARNING_COLLECTIONS.problems, topicId),
          {
            topicId,
            courseId,
            slug,
            problems: parsedProblems,
            isArchived: false,
            updatedAt: serverTimestamp(),
            updatedBy: user?.uid || null,
          },
          { merge: true }
        ),
      ]);

      await logAuditEvent({
        db,
        action: AUDIT_ACTIONS.LEARNING_UPDATED,
        module: "learning",
        targetId: topicId,
        performedBy,
        metadata: {
          courseId,
          title,
          quizCount: parsedQuiz.length,
          problemCount: parsedProblems.length,
        },
      }).catch(() => {});

      setSelectedTopicId(topicId);
      setStatusMessage("Learning topic saved.");
    } catch {
      setStatusMessage("Unable to save learning topic.");
    } finally {
      setBusyKey("");
    }
  };

  const handleDeleteTopic = async () => {
    if (!selectedTopicId || busyKey) return;
    const confirmed = window.confirm(
      "Delete or archive this topic? This action updates the live learning module."
    );
    if (!confirmed) return;

    setBusyKey("delete");
    setStatusMessage("");

    try {
      if (isBuiltInTopic) {
        const topic = mergedCatalog.topicsById[selectedTopicId];
        await Promise.all([
          setDoc(
            doc(db, LEARNING_COLLECTIONS.topics, selectedTopicId),
            {
              topicId: selectedTopicId,
              courseId: topic.courseId,
              slug: topic.slug,
              title: topic.title,
              isArchived: true,
              updatedAt: serverTimestamp(),
              updatedBy: user?.uid || null,
            },
            { merge: true }
          ),
          setDoc(
            doc(db, LEARNING_COLLECTIONS.quizzes, selectedTopicId),
            {
              topicId: selectedTopicId,
              courseId: topic.courseId,
              slug: topic.slug,
              isArchived: true,
              updatedAt: serverTimestamp(),
              updatedBy: user?.uid || null,
            },
            { merge: true }
          ),
          setDoc(
            doc(db, LEARNING_COLLECTIONS.problems, selectedTopicId),
            {
              topicId: selectedTopicId,
              courseId: topic.courseId,
              slug: topic.slug,
              isArchived: true,
              updatedAt: serverTimestamp(),
              updatedBy: user?.uid || null,
            },
            { merge: true }
          ),
        ]);
      } else {
        await Promise.all([
          deleteDoc(doc(db, LEARNING_COLLECTIONS.topics, selectedTopicId)),
          deleteDoc(doc(db, LEARNING_COLLECTIONS.quizzes, selectedTopicId)),
          deleteDoc(doc(db, LEARNING_COLLECTIONS.problems, selectedTopicId)),
        ]);
      }

      await logAuditEvent({
        db,
        action: AUDIT_ACTIONS.LEARNING_UPDATED,
        module: "learning",
        targetId: selectedTopicId,
        performedBy,
        metadata: {
          deleted: true,
          builtInTopic: isBuiltInTopic,
        },
      }).catch(() => {});

      resetForm();
      setStatusMessage("Learning topic deleted or archived.");
    } catch {
      setStatusMessage("Unable to delete learning topic.");
    } finally {
      setBusyKey("");
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            Learning Control
          </p>
          <h2 className="text-2xl font-bold text-slate-900">
            Manage Programming Learning Module
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            Seed the default learning catalog or edit topic lessons, quizzes, and practice problems.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleSeedDefaultContent}
            disabled={busyKey === "seed"}
            className="rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {busyKey === "seed" ? "Seeding..." : "Seed Default Content"}
          </button>
          <button
            type="button"
            onClick={resetForm}
            className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700"
          >
            New Topic
          </button>
        </div>
      </header>

      <section className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            Existing topics
          </p>
          <div className="mt-4 space-y-2">
            {topicOptions.map((topic) => (
              <button
                key={topic.id}
                type="button"
                onClick={() => handleLoadTopic(topic.id)}
                className={`w-full rounded-2xl border px-3 py-3 text-left transition ${
                  selectedTopicId === topic.id
                    ? "border-blue-300 bg-blue-50"
                    : "border-slate-200 bg-slate-50 hover:bg-slate-100"
                }`}
              >
                <p className="text-sm font-semibold text-slate-900">
                  {topic.title}
                </p>
                <p className="mt-1 text-xs uppercase tracking-[0.12em] text-slate-500">
                  {topic.courseId} · topic {topic.order}
                </p>
              </button>
            ))}
          </div>
        </aside>

        <form
          onSubmit={handleSave}
          className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <div className="grid gap-4 md:grid-cols-4">
            <div>
              <label className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                Course
              </label>
              <select
                className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                value={form.courseId}
                disabled={Boolean(selectedTopicId)}
                onChange={(event) =>
                  setForm((previous) => ({ ...previous, courseId: event.target.value }))
                }
              >
                {mergedCatalog.courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.title}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                Slug
              </label>
              <input
                className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                value={form.slug}
                disabled={Boolean(selectedTopicId)}
                onChange={(event) =>
                  setForm((previous) => ({ ...previous, slug: event.target.value }))
                }
                placeholder="variables"
              />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                Order
              </label>
              <input
                className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                value={form.order}
                onChange={(event) =>
                  setForm((previous) => ({ ...previous, order: event.target.value }))
                }
                placeholder="3"
              />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                Title
              </label>
              <input
                className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                value={form.title}
                onChange={(event) =>
                  setForm((previous) => ({ ...previous, title: event.target.value }))
                }
                placeholder="Variables"
              />
            </div>
          </div>

          <div className="grid gap-4">
            <textarea
              className="min-h-28 rounded-2xl border border-slate-200 px-3 py-3 text-sm"
              value={form.explanation}
              onChange={(event) =>
                setForm((previous) => ({ ...previous, explanation: event.target.value }))
              }
              placeholder="Beginner-friendly explanation"
            />
            <textarea
              className="min-h-28 rounded-2xl border border-slate-200 px-3 py-3 font-mono text-sm"
              value={form.syntax}
              onChange={(event) =>
                setForm((previous) => ({ ...previous, syntax: event.target.value }))
              }
              placeholder="Syntax"
            />
            <textarea
              className="min-h-36 rounded-2xl border border-slate-200 px-3 py-3 font-mono text-sm"
              value={form.exampleCode}
              onChange={(event) =>
                setForm((previous) => ({ ...previous, exampleCode: event.target.value }))
              }
              placeholder="Example code"
            />
            <textarea
              className="min-h-24 rounded-2xl border border-slate-200 px-3 py-3 font-mono text-sm"
              value={form.output}
              onChange={(event) =>
                setForm((previous) => ({ ...previous, output: event.target.value }))
              }
              placeholder="Output"
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <textarea
              className="min-h-32 rounded-2xl border border-slate-200 px-3 py-3 text-sm"
              value={form.notesText}
              onChange={(event) =>
                setForm((previous) => ({ ...previous, notesText: event.target.value }))
              }
              placeholder={"Notes\nOne note per line"}
            />
            <textarea
              className="min-h-32 rounded-2xl border border-slate-200 px-3 py-3 text-sm"
              value={form.commonMistakesText}
              onChange={(event) =>
                setForm((previous) => ({
                  ...previous,
                  commonMistakesText: event.target.value,
                }))
              }
              placeholder={"Common mistakes\nOne mistake per line"}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <textarea
              className="min-h-72 rounded-2xl border border-slate-200 px-3 py-3 font-mono text-sm"
              value={form.problemsJson}
              onChange={(event) =>
                setForm((previous) => ({ ...previous, problemsJson: event.target.value }))
              }
              placeholder="Practice problems JSON array"
            />
            <textarea
              className="min-h-72 rounded-2xl border border-slate-200 px-3 py-3 font-mono text-sm"
              value={form.quizJson}
              onChange={(event) =>
                setForm((previous) => ({ ...previous, quizJson: event.target.value }))
              }
              placeholder="Quiz questions JSON array"
            />
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={busyKey === "save"}
              className="rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {busyKey === "save" ? "Saving..." : "Save Topic"}
            </button>
            {selectedTopicId ? (
              <button
                type="button"
                onClick={handleDeleteTopic}
                disabled={busyKey === "delete"}
                className="rounded-full border border-rose-300 px-4 py-2 text-sm font-semibold text-rose-700 disabled:opacity-60"
              >
                {busyKey === "delete"
                  ? "Deleting..."
                  : isBuiltInTopic
                  ? "Archive Built-in Topic"
                  : "Delete Topic"}
              </button>
            ) : null}
          </div>
        </form>
      </section>

      {statusMessage ? (
        <p className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
          {statusMessage}
        </p>
      ) : null}
      {coursesState.error || topicsState.error || quizzesState.error || problemsState.error ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          {coursesState.error || topicsState.error || quizzesState.error || problemsState.error}
        </p>
      ) : null}
    </div>
  );
}
