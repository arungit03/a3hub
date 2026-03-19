import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../../../state/auth.jsx";
import { ensureFirestore } from "../../../lib/firebase.js";
import { LEARNING_CATALOG, LEARNING_COLLECTIONS } from "../data/catalog.js";
import {
  buildLearningProgressSummary,
  createEmptyLearningProgress,
  createProgressSavePayload,
  loadLearningProgressFromStorage,
  markLessonCompletedState,
  QUIZ_ANSWER_ORDER_VERSION,
  recordTopicVisitState,
  recordQuizAnswerState,
  recordCodeQuizEvaluationState,
  recordQuizResultState,
  restartQuizAttemptState,
  sanitizeLearningProgress,
  saveLearningProgressToStorage,
  toggleSolvedProblemState,
} from "../lib/progress.js";
import { migrateQuizAnswersToStableOrder } from "../lib/quiz.js";

export function useLearningProgress(catalog = LEARNING_CATALOG) {
  const { user } = useAuth();
  const [progress, setProgress] = useState(() => createEmptyLearningProgress());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const progressRef = useRef(createEmptyLearningProgress());
  const firestoreRef = useRef(null);
  const docRef = useRef(null);

  const saveProgress = useCallback(
    async (nextProgress) => {
      const safeProgress = sanitizeLearningProgress(nextProgress, user?.uid || "");
      progressRef.current = safeProgress;
      setProgress(safeProgress);
      saveLearningProgressToStorage(user?.uid || "guest", safeProgress);

      try {
        const firestore = firestoreRef.current || (await ensureFirestore());
        if (!firestore || !user?.uid) return;

        firestoreRef.current = firestore;
        const { doc, serverTimestamp, setDoc } = await import("firebase/firestore");
        const reference =
          docRef.current || doc(firestore, LEARNING_COLLECTIONS.progress, user.uid);
        docRef.current = reference;
        await setDoc(
          reference,
          {
            ...createProgressSavePayload(safeProgress, catalog),
            userId: user.uid,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      } catch {
        setError("Saved locally. Firestore sync is not available right now.");
      }
    },
    [catalog, user?.uid]
  );

  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);

  useEffect(() => {
    const currentProgress = progressRef.current;
    const topics = Array.isArray(catalog?.topics) ? catalog.topics : [];

    if (!topics.length) {
      return;
    }

    const nextTopicStates = {};
    let hasChanges = false;

    topics.forEach((topic) => {
      const topicState = currentProgress.topicStates?.[topic.id];
      const quizAnswers =
        topicState && typeof topicState.quizAnswers === "object"
          ? topicState.quizAnswers
          : {};

      if (
        !topicState ||
        !Object.keys(quizAnswers).length ||
        Number(topicState.quizAnswerOrderVersion || 0) >= QUIZ_ANSWER_ORDER_VERSION
      ) {
        return;
      }

      nextTopicStates[topic.id] = {
        ...topicState,
        quizAnswers: migrateQuizAnswersToStableOrder(topic.quizQuestions || [], quizAnswers),
        quizAnswerOrderVersion: QUIZ_ANSWER_ORDER_VERSION,
      };
      hasChanges = true;
    });

    if (!hasChanges) {
      return;
    }

    void saveProgress({
      ...currentProgress,
      topicStates: {
        ...currentProgress.topicStates,
        ...nextTopicStates,
      },
    });
  }, [catalog, saveProgress]);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe = () => {};

    const connect = async () => {
      setLoading(true);
      setError("");

      if (!user?.uid) {
        const local = loadLearningProgressFromStorage("guest");
        if (!cancelled) {
          progressRef.current = local;
          setProgress(local);
          setLoading(false);
        }
        return;
      }

      const local = loadLearningProgressFromStorage(user.uid);
      if (!cancelled) {
        progressRef.current = local;
        setProgress(local);
      }

      try {
        const firestore = await ensureFirestore();
        if (!firestore) {
          if (!cancelled) {
            setLoading(false);
          }
          return;
        }

        firestoreRef.current = firestore;
        const { doc, onSnapshot } = await import("firebase/firestore");
        const reference = doc(firestore, LEARNING_COLLECTIONS.progress, user.uid);
        docRef.current = reference;

        unsubscribe = onSnapshot(
          reference,
          (snapshot) => {
            if (cancelled) return;
            const nextProgress = snapshot.exists()
              ? sanitizeLearningProgress(snapshot.data(), user.uid)
              : local;
            progressRef.current = nextProgress;
            setProgress(nextProgress);
            saveLearningProgressToStorage(user.uid, nextProgress);
            setLoading(false);
            setError("");
          },
          () => {
            if (cancelled) return;
            progressRef.current = local;
            setProgress(local);
            setLoading(false);
            setError("Using local learning progress because Firestore is unavailable.");
          }
        );
      } catch {
        if (!cancelled) {
          progressRef.current = local;
          setProgress(local);
          setLoading(false);
          setError("Using local learning progress because Firestore is unavailable.");
        }
      }
    };

    void connect();

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [user?.uid]);

  const summary = useMemo(
    () => buildLearningProgressSummary(progress, catalog),
    [catalog, progress]
  );

  const markLessonCompleted = useCallback(
    async (topicId) => {
      const nextProgress = markLessonCompletedState(progressRef.current, topicId);
      await saveProgress(nextProgress);
    },
    [saveProgress]
  );

  const toggleProblemSolved = useCallback(
    async (topicId, problemId) => {
      const nextProgress = toggleSolvedProblemState(
        progressRef.current,
        topicId,
        problemId
      );
      await saveProgress(nextProgress);
    },
    [saveProgress]
  );

  const recordTopicVisit = useCallback(
    async (topicId) => {
      const nextProgress = recordTopicVisitState(progressRef.current, topicId);
      if (nextProgress === progressRef.current) {
        return;
      }
      await saveProgress(nextProgress);
    },
    [saveProgress]
  );

  const recordQuizResult = useCallback(
    async (topicId, scorePercentage, passed) => {
      const nextProgress = recordQuizResultState(
        progressRef.current,
        topicId,
        scorePercentage,
        passed
      );
      await saveProgress(nextProgress);
    },
    [saveProgress]
  );

  const restartQuizAttempt = useCallback(
    async (topicId) => {
      const nextProgress = restartQuizAttemptState(progressRef.current, topicId);
      await saveProgress(nextProgress);
    },
    [saveProgress]
  );

  const recordQuizAnswer = useCallback(
    async ({ topicId, questionId, optionIndex, questions, passPercentage }) => {
      const nextProgress = recordQuizAnswerState({
        progress: progressRef.current,
        topicId,
        questionId,
        optionIndex,
        questions,
        passPercentage,
      });
      await saveProgress(nextProgress);
    },
    [saveProgress]
  );

  const recordCodeQuizEvaluation = useCallback(
    async ({
      topicId,
      questionId,
      answer,
      isCorrect,
      feedback,
      expectedAnswer,
      model,
      questions,
      passPercentage,
    }) => {
      const nextProgress = recordCodeQuizEvaluationState({
        progress: progressRef.current,
        topicId,
        questionId,
        answer,
        isCorrect,
        feedback,
        expectedAnswer,
        model,
        questions,
        passPercentage,
      });
      await saveProgress(nextProgress);
    },
    [saveProgress]
  );

  return {
    progress,
    summary,
    loading,
    error,
    markLessonCompleted,
    toggleProblemSolved,
    recordTopicVisit,
    recordQuizAnswer,
    recordCodeQuizEvaluation,
    recordQuizResult,
    restartQuizAttempt,
  };
}
