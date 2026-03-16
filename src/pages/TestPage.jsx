import { useEffect, useMemo, useRef, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import Card from "../components/Card";
import GradientHeader from "../components/GradientHeader";
import { db } from "../lib/firebase";
import { useAuth } from "../state/auth";

const MIN_QUESTIONS = 1;
const MAX_QUESTIONS = 20;
const MAX_BATCH_SIZE = 400;
const PENDING_ATTEMPT_KEY_PREFIX = "ckcethub_pending_test_attempt_";
const TAB_SWITCH_DEBOUNCE_MS = 1200;

const createEmptyQuestion = () => ({
  prompt: "",
  options: ["", "", "", ""],
  correctOptionIndex: 0,
});

const getMillis = (value) => {
  if (!value) return 0;
  if (typeof value?.toMillis === "function") return value.toMillis();
  const asDate = new Date(value);
  const ms = asDate.getTime();
  return Number.isNaN(ms) ? 0 : ms;
};

const formatDateTime = (value) => {
  const ms = getMillis(value);
  if (!ms) return "";
  return new Date(ms).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const normalizeQuestion = (question) => {
  const sourceOptions = Array.isArray(question?.options) ? question.options : [];
  const optionValues = Array.from({ length: 4 }, (_, index) => {
    const value = sourceOptions[index];
    return typeof value === "string" ? value.trim() : "";
  });

  const rawCorrect = Number(question?.correctOptionIndex);
  const safeCorrect = Number.isInteger(rawCorrect) && rawCorrect >= 0 && rawCorrect < 4
    ? rawCorrect
    : 0;

  return {
    prompt: typeof question?.prompt === "string" ? question.prompt.trim() : "",
    options: optionValues,
    correctOptionIndex: safeCorrect,
  };
};

const normalizeTest = (docItem) => {
  const data = docItem.data();
  const rawQuestions = Array.isArray(data?.questions) ? data.questions : [];
  const questions = rawQuestions
    .map(normalizeQuestion)
    .filter((item) => item.prompt && item.options.every((option) => option.length > 0));

  return {
    id: docItem.id,
    subject: typeof data?.subject === "string" && data.subject.trim()
      ? data.subject.trim()
      : "Untitled Test",
    questionCount: questions.length,
    questions,
    createdAt: data?.createdAt,
    createdByName: data?.createdByName || "Staff",
  };
};

const normalizeStudent = (docItem) => {
  const data = docItem.data();
  const fallbackName = data?.email || "Student";
  return {
    id: docItem.id,
    name: data?.name || fallbackName,
    email: data?.email || "",
  };
};

const normalizeResult = (docItem) => {
  const data = docItem.data();
  const score = Number(data?.score || 0);
  const totalQuestions = Number(data?.totalQuestions || 0);
  const rawPercentage = Number(data?.percentage);
  const rawTabSwitchCount = Number(data?.tabSwitchCount);
  const percentage = Number.isFinite(rawPercentage)
    ? rawPercentage
    : totalQuestions > 0
    ? Math.round((score / totalQuestions) * 100)
    : 0;
  const tabSwitchCount = Number.isFinite(rawTabSwitchCount)
    ? Math.max(0, Math.trunc(rawTabSwitchCount))
    : 0;

  return {
    id: docItem.id,
    testId: data?.testId || "",
    studentId: data?.studentId || "",
    studentName: data?.studentName || "Student",
    studentEmail: data?.studentEmail || "",
    score,
    totalQuestions,
    percentage,
    tabSwitchCount,
    autoSubmitted: Boolean(data?.autoSubmitted),
    submittedAt: data?.submittedAt,
    updatedAt: data?.updatedAt,
  };
};

const clampQuestionCount = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return MIN_QUESTIONS;
  return Math.min(MAX_QUESTIONS, Math.max(MIN_QUESTIONS, Math.trunc(numeric)));
};

const createInitialForm = () => ({
  subject: "",
  questionCount: MIN_QUESTIONS,
  questions: [createEmptyQuestion()],
});

const shuffleArray = (items) => {
  const next = [...items];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }
  return next;
};

const createRandomizedAttempt = (testItem) => {
  const sourceQuestions = Array.isArray(testItem?.questions) ? testItem.questions : [];
  const randomizedQuestions = shuffleArray(
    sourceQuestions.map((question, questionIndex) => {
      const optionItems = question.options.map((value, optionIndex) => ({
        value,
        optionIndex,
      }));
      const shuffledOptions = shuffleArray(optionItems);
      const correctedIndex = shuffledOptions.findIndex(
        (item) => item.optionIndex === question.correctOptionIndex
      );

      return {
        id: questionIndex,
        prompt: question.prompt,
        options: shuffledOptions.map((item) => item.value),
        correctOptionIndex: correctedIndex >= 0 ? correctedIndex : 0,
      };
    })
  );

  return {
    id: testItem.id,
    subject: testItem.subject,
    questionCount: randomizedQuestions.length,
    questions: randomizedQuestions,
  };
};

const calculateAttemptResult = (questions, answers) => {
  const safeQuestions = Array.isArray(questions) ? questions : [];
  const safeAnswers = Array.isArray(answers) ? answers : [];
  const totalQuestions = safeQuestions.length;
  const score = safeQuestions.reduce((sum, question, index) => {
    if (safeAnswers[index] === question.correctOptionIndex) {
      return sum + 1;
    }
    return sum;
  }, 0);
  const percentage = totalQuestions > 0
    ? Math.round((score / totalQuestions) * 100)
    : 0;

  return { score, totalQuestions, percentage };
};

const getPendingAttemptKey = (userId) => `${PENDING_ATTEMPT_KEY_PREFIX}${userId}`;

const readPendingAttempt = (userId) => {
  if (typeof window === "undefined" || !userId) return null;
  try {
    const raw = window.localStorage.getItem(getPendingAttemptKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
};

const savePendingAttempt = (userId, payload) => {
  if (typeof window === "undefined" || !userId) return;
  try {
    window.localStorage.setItem(getPendingAttemptKey(userId), JSON.stringify(payload));
  } catch {
    // Ignore storage quota and private mode failures.
  }
};

const clearPendingAttempt = (userId) => {
  if (typeof window === "undefined" || !userId) return;
  try {
    window.localStorage.removeItem(getPendingAttemptKey(userId));
  } catch {
    // Ignore storage cleanup failures.
  }
};

export default function TestPage() {
  const { role, user, profile } = useAuth();
  const isStaff = role === "staff";
  const [tests, setTests] = useState([]);
  const [loadingTests, setLoadingTests] = useState(true);
  const [testsError, setTestsError] = useState("");

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [testForm, setTestForm] = useState(createInitialForm);
  const [createStatus, setCreateStatus] = useState("");
  const [creatingTest, setCreatingTest] = useState(false);

  const [activeAttempt, setActiveAttempt] = useState(null);
  const [attemptAnswers, setAttemptAnswers] = useState([]);
  const [attemptStatus, setAttemptStatus] = useState("");
  const [submittingAttempt, setSubmittingAttempt] = useState(false);
  const [tabSwitchCount, setTabSwitchCount] = useState(0);

  const [studentStatus, setStudentStatus] = useState("");
  const [latestResult, setLatestResult] = useState(null);
  const [studentResultsByTestId, setStudentResultsByTestId] = useState({});

  const [staffResults, setStaffResults] = useState([]);
  const [staffStudents, setStaffStudents] = useState([]);
  const [resultModalTest, setResultModalTest] = useState(null);
  const [deletingTestId, setDeletingTestId] = useState("");
  const lastFocusViolationAtRef = useRef(0);
  const autoSubmittingRef = useRef(false);

  useEffect(() => {
    const canAccess = role === "staff" || role === "student";
    if (!canAccess) {
      setTests([]);
      setLoadingTests(false);
      setTestsError("");
      return undefined;
    }

    setLoadingTests(true);
    setTestsError("");

    const testsQuery = query(collection(db, "tests"));
    const unsubscribe = onSnapshot(
      testsQuery,
      (snapshot) => {
        const next = snapshot.docs
          .map(normalizeTest)
          .filter((item) => item.questionCount > 0)
          .sort((a, b) => getMillis(b.createdAt) - getMillis(a.createdAt));
        setTests(next);
        setLoadingTests(false);
        setTestsError("");
      },
      () => {
        setTests([]);
        setLoadingTests(false);
        setTestsError("Unable to load tests.");
      }
    );

    return () => unsubscribe();
  }, [role]);

  useEffect(() => {
    if (role !== "student" || !user?.uid) {
      setStudentResultsByTestId({});
      return undefined;
    }

    const resultsQuery = query(
      collection(db, "testResults"),
      where("studentId", "==", user.uid)
    );

    const unsubscribe = onSnapshot(
      resultsQuery,
      (snapshot) => {
        const nextByTestId = {};
        snapshot.docs
          .map(normalizeResult)
          .forEach((result) => {
            if (!result.testId) return;
            const existing = nextByTestId[result.testId];
            const existingMs = existing
              ? getMillis(existing.submittedAt) || getMillis(existing.updatedAt)
              : 0;
            const resultMs = getMillis(result.submittedAt) || getMillis(result.updatedAt);
            if (!existing || resultMs >= existingMs) {
              nextByTestId[result.testId] = result;
            }
          });
        setStudentResultsByTestId(nextByTestId);
      },
      () => {
        setStudentResultsByTestId({});
      }
    );

    return () => unsubscribe();
  }, [role, user?.uid]);

  useEffect(() => {
    if (!isStaff) {
      setStaffResults([]);
      setStaffStudents([]);
      setResultModalTest(null);
      return undefined;
    }

    const resultsUnsubscribe = onSnapshot(
      query(collection(db, "testResults")),
      (snapshot) => {
        setStaffResults(snapshot.docs.map(normalizeResult));
      },
      () => {
        setStaffResults([]);
      }
    );

    const studentsUnsubscribe = onSnapshot(
      query(collection(db, "users"), where("role", "==", "student")),
      (snapshot) => {
        const nextStudents = snapshot.docs
          .map(normalizeStudent)
          .sort((a, b) => a.name.localeCompare(b.name));
        setStaffStudents(nextStudents);
      },
      () => {
        setStaffStudents([]);
      }
    );

    return () => {
      resultsUnsubscribe();
      studentsUnsubscribe();
    };
  }, [isStaff]);

  useEffect(() => {
    if (role !== "student" || !user?.uid || autoSubmittingRef.current) {
      return undefined;
    }

    const pendingAttempt = readPendingAttempt(user.uid);
    if (!pendingAttempt?.autoSubmitPending || !pendingAttempt?.testId) {
      return undefined;
    }

    if (studentResultsByTestId[pendingAttempt.testId]) {
      clearPendingAttempt(user.uid);
      return undefined;
    }

    const safeQuestions = Array.isArray(pendingAttempt.questions)
      ? pendingAttempt.questions
      : [];
    if (safeQuestions.length === 0) {
      clearPendingAttempt(user.uid);
      return undefined;
    }

    const safeAnswers = Array.isArray(pendingAttempt.answers)
      ? pendingAttempt.answers
      : Array(safeQuestions.length).fill(-1);
    const pendingTabSwitchCount = Number.isFinite(Number(pendingAttempt.tabSwitchCount))
      ? Math.max(0, Math.trunc(Number(pendingAttempt.tabSwitchCount)))
      : 0;
    const { score, totalQuestions, percentage } = calculateAttemptResult(
      safeQuestions,
      safeAnswers
    );
    const safeSubject = typeof pendingAttempt.testSubject === "string"
      && pendingAttempt.testSubject.trim()
      ? pendingAttempt.testSubject.trim()
      : "Untitled Test";

    autoSubmittingRef.current = true;
    (async () => {
      try {
        const resultId = `${pendingAttempt.testId}_${user.uid}`;
        const resultRef = doc(db, "testResults", resultId);
        await setDoc(resultRef, {
          testId: pendingAttempt.testId,
          testSubject: safeSubject,
          studentId: user.uid,
          studentName: profile?.name || user?.displayName || user?.email || "Student",
          studentEmail: user?.email || "",
          score,
          totalQuestions,
          percentage,
          answers: safeAnswers,
          tabSwitchCount: pendingTabSwitchCount,
          autoSubmitted: true,
          antiCheatEnabled: true,
          submittedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        const submittedAt = new Date();
        setLatestResult({
          testId: pendingAttempt.testId,
          testSubject: safeSubject,
          score,
          totalQuestions,
          percentage,
          submittedAt,
        });
        setStudentResultsByTestId((prev) => ({
          ...prev,
          [pendingAttempt.testId]: {
            testId: pendingAttempt.testId,
            score,
            totalQuestions,
            percentage,
            tabSwitchCount: pendingTabSwitchCount,
            autoSubmitted: true,
            submittedAt,
            updatedAt: submittedAt,
          },
        }));
        setStudentStatus(
          `Browser was closed. Auto-submitted: ${score}/${totalQuestions} (${percentage}%).`
        );
        clearPendingAttempt(user.uid);
      } catch {
        setStudentStatus(
          "A pending attempt was found, but auto-submit failed. Please open the test and submit manually."
        );
      } finally {
        autoSubmittingRef.current = false;
      }
    })();

    return undefined;
  }, [
    profile?.name,
    role,
    studentResultsByTestId,
    user?.displayName,
    user?.email,
    user?.uid,
  ]);

  useEffect(() => {
    if (role !== "student" || !user?.uid || !activeAttempt) return undefined;

    savePendingAttempt(user.uid, {
      testId: activeAttempt.id,
      testSubject: activeAttempt.subject,
      questions: activeAttempt.questions,
      answers: attemptAnswers,
      tabSwitchCount,
      autoSubmitPending: false,
      updatedAt: Date.now(),
    });

    return undefined;
  }, [activeAttempt, attemptAnswers, role, tabSwitchCount, user?.uid]);

  useEffect(() => {
    if (role !== "student" || !user?.uid || !activeAttempt) return undefined;

    const markPendingForAutoSubmit = () => {
      savePendingAttempt(user.uid, {
        testId: activeAttempt.id,
        testSubject: activeAttempt.subject,
        questions: activeAttempt.questions,
        answers: attemptAnswers,
        tabSwitchCount,
        autoSubmitPending: true,
        closedAt: Date.now(),
      });
    };

    const handleBeforeUnload = () => {
      markPendingForAutoSubmit();
    };
    const handlePageHide = () => {
      markPendingForAutoSubmit();
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("pagehide", handlePageHide);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("pagehide", handlePageHide);
    };
  }, [activeAttempt, attemptAnswers, role, tabSwitchCount, user?.uid]);

  useEffect(() => {
    if (!activeAttempt) return undefined;

    const registerTabSwitch = (message) => {
      const now = Date.now();
      if (now - lastFocusViolationAtRef.current < TAB_SWITCH_DEBOUNCE_MS) {
        return;
      }
      lastFocusViolationAtRef.current = now;
      setTabSwitchCount((prev) => prev + 1);
      setAttemptStatus(message);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        registerTabSwitch("Tab switching detected. Stay on this page while taking the test.");
      }
    };

    const handleWindowBlur = () => {
      if (document.visibilityState === "visible") {
        registerTabSwitch("Window focus lost. Tab switching detected.");
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", handleWindowBlur);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", handleWindowBlur);
    };
  }, [activeAttempt]);

  useEffect(() => {
    if (!activeAttempt) return undefined;

    const blockClipboardEvent = (event) => {
      event.preventDefault();
      setAttemptStatus("Copy / paste is disabled while attending this test.");
    };

    const handleKeydown = (event) => {
      const key = event.key?.toLowerCase();
      const isClipboardShortcut = (event.ctrlKey || event.metaKey)
        && (key === "c" || key === "v" || key === "x");
      if (!isClipboardShortcut) return;
      event.preventDefault();
      setAttemptStatus("Copy / paste is disabled while attending this test.");
    };

    document.addEventListener("copy", blockClipboardEvent);
    document.addEventListener("cut", blockClipboardEvent);
    document.addEventListener("paste", blockClipboardEvent);
    document.addEventListener("contextmenu", blockClipboardEvent);
    document.addEventListener("keydown", handleKeydown);

    return () => {
      document.removeEventListener("copy", blockClipboardEvent);
      document.removeEventListener("cut", blockClipboardEvent);
      document.removeEventListener("paste", blockClipboardEvent);
      document.removeEventListener("contextmenu", blockClipboardEvent);
      document.removeEventListener("keydown", handleKeydown);
    };
  }, [activeAttempt]);

  const selectedTestId = resultModalTest?.id || "";

  const selectedTestResults = useMemo(() => {
    if (!selectedTestId) return [];

    return staffResults
      .filter((result) => result.testId === selectedTestId)
      .sort((a, b) => {
        if (b.percentage !== a.percentage) return b.percentage - a.percentage;
        if (b.score !== a.score) return b.score - a.score;
        return a.studentName.localeCompare(b.studentName);
      });
  }, [selectedTestId, staffResults]);

  const absentStudents = useMemo(() => {
    if (!selectedTestId || staffStudents.length === 0) return [];

    const attendedStudentIds = new Set(
      selectedTestResults
        .map((result) => result.studentId)
        .filter((studentId) => !!studentId)
    );

    return staffStudents.filter((student) => !attendedStudentIds.has(student.id));
  }, [selectedTestId, selectedTestResults, staffStudents]);

  const closeCreateModal = () => {
    setCreateModalOpen(false);
    setCreateStatus("");
  };

  const openCreateModal = () => {
    setCreateModalOpen(true);
    setCreateStatus("");
  };

  const handleQuestionCountChange = (value) => {
    const nextCount = clampQuestionCount(value);
    setTestForm((prev) => {
      const nextQuestions = [...prev.questions];
      while (nextQuestions.length < nextCount) {
        nextQuestions.push(createEmptyQuestion());
      }
      if (nextQuestions.length > nextCount) {
        nextQuestions.length = nextCount;
      }
      return {
        ...prev,
        questionCount: nextCount,
        questions: nextQuestions,
      };
    });
    setCreateStatus("");
  };

  const handleQuestionPromptChange = (questionIndex, value) => {
    setTestForm((prev) => {
      const nextQuestions = prev.questions.map((question, index) => {
        if (index !== questionIndex) return question;
        return {
          ...question,
          prompt: value,
        };
      });
      return { ...prev, questions: nextQuestions };
    });
    setCreateStatus("");
  };

  const handleQuestionOptionChange = (questionIndex, optionIndex, value) => {
    setTestForm((prev) => {
      const nextQuestions = prev.questions.map((question, index) => {
        if (index !== questionIndex) return question;
        const nextOptions = [...question.options];
        nextOptions[optionIndex] = value;
        return {
          ...question,
          options: nextOptions,
        };
      });
      return { ...prev, questions: nextQuestions };
    });
    setCreateStatus("");
  };

  const handleCorrectOptionChange = (questionIndex, optionIndex) => {
    setTestForm((prev) => {
      const nextQuestions = prev.questions.map((question, index) => {
        if (index !== questionIndex) return question;
        return {
          ...question,
          correctOptionIndex: optionIndex,
        };
      });
      return { ...prev, questions: nextQuestions };
    });
    setCreateStatus("");
  };

  const handleCreateTest = async (event) => {
    event.preventDefault();
    if (!isStaff || creatingTest) return;

    const subject = testForm.subject.trim();
    if (!subject) {
      setCreateStatus("Enter test subject.");
      return;
    }

    const preparedQuestions = testForm.questions.map((question) => ({
      prompt: question.prompt.trim(),
      options: question.options.map((option) => option.trim()),
      correctOptionIndex: question.correctOptionIndex,
    }));

    const invalidQuestionIndex = preparedQuestions.findIndex((question) => {
      if (!question.prompt) return true;
      if (question.options.some((option) => !option)) return true;
      return !Number.isInteger(question.correctOptionIndex)
        || question.correctOptionIndex < 0
        || question.correctOptionIndex > 3;
    });

    if (invalidQuestionIndex >= 0) {
      setCreateStatus(`Complete Question ${invalidQuestionIndex + 1} (quiz + 4 options + one correct answer).`);
      return;
    }

    setCreatingTest(true);
    setCreateStatus("");

    try {
      await addDoc(collection(db, "tests"), {
        subject,
        questionCount: preparedQuestions.length,
        questions: preparedQuestions,
        createdAt: serverTimestamp(),
        createdBy: user?.uid || null,
        createdByName: profile?.name || "Staff",
      });

      setTestForm(createInitialForm());
      setCreateModalOpen(false);
      setCreateStatus("Test added.");
    } catch {
      setCreateStatus("Unable to add test.");
    } finally {
      setCreatingTest(false);
    }
  };

  const handleRemoveTest = async (testItem) => {
    if (!isStaff || !testItem?.id || deletingTestId) return;

    const safeSubject = testItem.subject || "this test";
    const confirmed = window.confirm(
      `Remove "${safeSubject}"? This will also delete all student results for this test.`
    );
    if (!confirmed) return;

    setDeletingTestId(testItem.id);
    setCreateStatus("");

    try {
      const testResultsSnapshot = await getDocs(
        query(collection(db, "testResults"), where("testId", "==", testItem.id))
      );

      const docsToDelete = testResultsSnapshot.docs;
      for (let index = 0; index < docsToDelete.length; index += MAX_BATCH_SIZE) {
        const batch = writeBatch(db);
        docsToDelete
          .slice(index, index + MAX_BATCH_SIZE)
          .forEach((resultDoc) => batch.delete(resultDoc.ref));
        await batch.commit();
      }

      await deleteDoc(doc(db, "tests", testItem.id));
      if (resultModalTest?.id === testItem.id) {
        setResultModalTest(null);
      }
      setCreateStatus("Test and related student results removed from Firebase.");
    } catch {
      setCreateStatus("Unable to remove test.");
    } finally {
      setDeletingTestId("");
    }
  };

  const closeAttemptModal = () => {
    if (user?.uid) {
      clearPendingAttempt(user.uid);
    }
    setActiveAttempt(null);
    setAttemptAnswers([]);
    setAttemptStatus("");
    setTabSwitchCount(0);
    lastFocusViolationAtRef.current = 0;
  };

  const startAttempt = (testItem) => {
    const safeQuestions = Array.isArray(testItem?.questions) ? testItem.questions : [];
    const existingResult = studentResultsByTestId[testItem?.id];
    if (existingResult) {
      setStudentStatus(
        `Already attended. Score: ${existingResult.score}/${existingResult.totalQuestions} (${existingResult.percentage}%).`
      );
      return;
    }

    if (safeQuestions.length === 0) {
      setStudentStatus("This test is empty.");
      return;
    }

    const randomizedAttempt = createRandomizedAttempt(testItem);
    if (user?.uid) {
      clearPendingAttempt(user.uid);
    }

    setActiveAttempt(randomizedAttempt);
    setAttemptAnswers(Array(randomizedAttempt.questions.length).fill(-1));
    setAttemptStatus("");
    setTabSwitchCount(0);
    lastFocusViolationAtRef.current = 0;
    setStudentStatus("");
  };

  const handleAttemptAnswerChange = (questionIndex, optionIndex) => {
    setAttemptAnswers((prev) => {
      const next = [...prev];
      next[questionIndex] = optionIndex;
      return next;
    });
    setAttemptStatus("");
  };

  const handleSubmitAttempt = async (event) => {
    event.preventDefault();
    if (!activeAttempt || !user?.uid || submittingAttempt) return;

    const unanswered = attemptAnswers.findIndex((answer) => answer < 0);
    if (unanswered >= 0) {
      setAttemptStatus(`Answer Question ${unanswered + 1} before submit.`);
      return;
    }

    const { score, totalQuestions, percentage } = calculateAttemptResult(
      activeAttempt.questions,
      attemptAnswers
    );

    setSubmittingAttempt(true);
    setStudentStatus(`Result: ${score}/${totalQuestions} (${percentage}%).`);

    try {
      if (studentResultsByTestId[activeAttempt.id]) {
        setStudentStatus("You already attended this test. Status: Attended.");
        closeAttemptModal();
        return;
      }

      const resultId = `${activeAttempt.id}_${user.uid}`;
      const resultRef = doc(db, "testResults", resultId);
      const submittedAt = new Date();
      const resultPayload = {
        testId: activeAttempt.id,
        testSubject: activeAttempt.subject,
        studentId: user.uid,
        studentName: profile?.name || user?.displayName || user?.email || "Student",
        studentEmail: user?.email || "",
        score,
        totalQuestions,
        percentage,
        answers: attemptAnswers,
        tabSwitchCount,
        autoSubmitted: false,
        antiCheatEnabled: true,
        submittedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      await setDoc(resultRef, resultPayload);
      clearPendingAttempt(user.uid);

      setLatestResult({
        testId: activeAttempt.id,
        testSubject: activeAttempt.subject,
        score,
        totalQuestions,
        percentage,
        submittedAt,
      });
      setStudentResultsByTestId((prev) => ({
        ...prev,
        [activeAttempt.id]: {
          testId: activeAttempt.id,
          score,
          totalQuestions,
          percentage,
          tabSwitchCount,
          autoSubmitted: false,
          submittedAt,
          updatedAt: submittedAt,
        },
      }));
      setStudentStatus(`Result: ${score}/${totalQuestions} (${percentage}%). Saved to Results page.`);
      closeAttemptModal();
    } catch (error) {
      if (error?.code === "permission-denied" || error?.code === "already-exists") {
        setStudentStatus("You already attended this test. Status: Attended.");
        closeAttemptModal();
      } else {
        setStudentStatus(`Result: ${score}/${totalQuestions} (${percentage}%). Could not save result.`);
      }
    } finally {
      setSubmittingAttempt(false);
    }
  };

  return (
    <>
      <GradientHeader
        title="Test"
        subtitle={isStaff ? "Create quiz tests for students" : "Attend tests and get instant score"}
        rightSlot={
          <div className="rounded-full border border-clay/30 bg-white px-3 py-1 text-xs font-semibold text-black">
            {isStaff ? "Staff" : "Student"}
          </div>
        }
      />

      <section className="mt-5 grid gap-5">
        <Card>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm uppercase tracking-[0.18em] text-ink/80">
                Test Center
              </p>
              <h3 className="text-xl font-semibold text-ink">
                {tests.length} test{tests.length === 1 ? "" : "s"}
              </h3>
            </div>
            {isStaff ? (
              <button
                type="button"
                onClick={openCreateModal}
                className="rounded-xl bg-clay px-4 py-2 text-sm font-semibold text-black shadow"
              >
                Create Test
              </button>
            ) : null}
          </div>

          {createStatus ? (
            <p className="mt-3 text-xs font-semibold text-ink/80">{createStatus}</p>
          ) : null}
          {!isStaff && studentStatus ? (
            <p className="mt-3 text-xs font-semibold text-ink/80">{studentStatus}</p>
          ) : null}

          {loadingTests ? (
            <p className="mt-4 text-sm text-ink/75">Loading tests...</p>
          ) : testsError ? (
            <p className="mt-4 text-sm text-ink/75">{testsError}</p>
          ) : tests.length === 0 ? (
            <p className="mt-4 text-sm text-ink/75">No tests available yet.</p>
          ) : (
            <div className="mt-5 grid gap-4">
              {tests.map((testItem) => {
                const attendedResult = !isStaff ? studentResultsByTestId[testItem.id] : null;
                const isAttended = Boolean(attendedResult);

                return (
                  <div
                    key={testItem.id}
                    className="rounded-2xl border border-clay/20 bg-white/90 p-4 sm:p-5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold text-ink">{testItem.subject}</p>
                        <p className="mt-1 text-xs text-ink/75">
                          Questions: {testItem.questionCount}
                        </p>
                        <p className="mt-1 text-xs text-ink/70">
                          {isStaff
                            ? `Created by: ${testItem.createdByName}`
                            : isAttended
                            ? "Status: Attended"
                            : "Choose one answer in each question."}
                        </p>
                        {!isStaff && isAttended ? (
                          <p className="mt-1 text-xs font-semibold text-ink/75">
                            Score: {attendedResult.score}/{attendedResult.totalQuestions} ({attendedResult.percentage}%)
                          </p>
                        ) : null}
                        {testItem.createdAt ? (
                          <p className="mt-1 text-[11px] text-ink/60">
                            {formatDateTime(testItem.createdAt)}
                          </p>
                        ) : null}
                      </div>
                      {isStaff ? (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setResultModalTest(testItem)}
                            className="rounded-full border border-clay/25 bg-cream px-4 py-1.5 text-xs font-semibold text-ink/80"
                          >
                            Result
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveTest(testItem)}
                            disabled={deletingTestId === testItem.id}
                            className="rounded-full border border-rose/25 bg-rose/20 px-4 py-1.5 text-xs font-semibold text-ink/80 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {deletingTestId === testItem.id ? "Removing..." : "Remove"}
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => startAttempt(testItem)}
                          disabled={isAttended}
                          className="rounded-full border border-clay/25 bg-cream px-4 py-1.5 text-xs font-semibold text-ink/80 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isAttended ? "Attended" : "Attend Test"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {!isStaff && latestResult ? (
          <Card className="bg-cream">
            <p className="text-sm uppercase tracking-[0.18em] text-ink/80">Latest Result</p>
            <h3 className="mt-1 text-xl font-semibold text-ink">{latestResult.testSubject}</h3>
            <p className="mt-2 text-sm text-ink/80">
              Score: {latestResult.score}/{latestResult.totalQuestions} ({latestResult.percentage}%)
            </p>
            <p className="mt-1 text-xs text-ink/70">
              {formatDateTime(latestResult.submittedAt)}
            </p>
          </Card>
        ) : null}
        {isStaff && createModalOpen ? (
          <Card className="border-ocean/30">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-ink/75">Test Page</p>
                <h3 className="text-xl font-semibold text-ink">Create Test</h3>
              </div>
              <button
                type="button"
                onClick={closeCreateModal}
                className="rounded-xl border border-clay/25 bg-cream px-3 py-1 text-xs font-semibold text-ink/80"
              >
                Close
              </button>
            </div>

            <form onSubmit={handleCreateTest} className="mt-4 grid gap-4">
              <label className="grid gap-1 text-sm font-semibold text-ink/80">
                Test Subject
                <input
                  type="text"
                  value={testForm.subject}
                  onChange={(event) => {
                    setTestForm((prev) => ({ ...prev, subject: event.target.value }));
                    setCreateStatus("");
                  }}
                  placeholder="Enter subject"
                  className="w-full rounded-xl border border-clay/25 bg-white px-3 py-2 text-sm placeholder:text-ink/50"
                />
              </label>

              <label className="grid gap-1 text-sm font-semibold text-ink/80">
                How many questions
                <input
                  type="number"
                  min={MIN_QUESTIONS}
                  max={MAX_QUESTIONS}
                  value={testForm.questionCount}
                  onChange={(event) => handleQuestionCountChange(event.target.value)}
                  className="w-full rounded-xl border border-clay/25 bg-white px-3 py-2 text-sm"
                />
              </label>

              <div className="grid gap-3">
                {testForm.questions.map((question, questionIndex) => (
                  <div
                    key={`q-${questionIndex}`}
                    className="rounded-2xl border border-clay/25 bg-cream/60 p-3"
                  >
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-ink">Q{questionIndex + 1}</p>
                      <p className="text-xs font-semibold text-ink/70">1 point</p>
                    </div>

                    <input
                      type="text"
                      value={question.prompt}
                      onChange={(event) =>
                        handleQuestionPromptChange(questionIndex, event.target.value)
                      }
                      placeholder="Enter quiz question"
                      className="w-full rounded-xl border border-clay/25 bg-white px-3 py-2 text-sm placeholder:text-ink/50"
                    />

                    <div className="mt-3 grid gap-2">
                      {question.options.map((option, optionIndex) => (
                        <div key={`q-${questionIndex}-opt-${optionIndex}`} className="flex items-center gap-2">
                          <input
                            type="radio"
                            name={`correct-option-${questionIndex}`}
                            checked={question.correctOptionIndex === optionIndex}
                            onChange={() =>
                              handleCorrectOptionChange(questionIndex, optionIndex)
                            }
                            className="h-4 w-4"
                          />
                          <input
                            type="text"
                            value={option}
                            onChange={(event) =>
                              handleQuestionOptionChange(
                                questionIndex,
                                optionIndex,
                                event.target.value
                              )
                            }
                            placeholder={`Option ${optionIndex + 1}`}
                            className="w-full rounded-xl border border-clay/25 bg-white px-3 py-2 text-sm placeholder:text-ink/50"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {createStatus ? (
                <p className="text-xs font-semibold text-ink/80">{createStatus}</p>
              ) : null}

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={closeCreateModal}
                  className="rounded-xl border border-clay/25 bg-white px-4 py-2 text-sm font-semibold text-ink/80"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingTest}
                  className="rounded-xl bg-clay px-4 py-2 text-sm font-semibold text-black shadow disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {creatingTest ? "Adding..." : "Add Test"}
                </button>
              </div>
            </form>
          </Card>
        ) : null}

        {isStaff && resultModalTest ? (
          <Card className="border-ocean/30">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-ink/75">Result</p>
                <h3 className="text-xl font-semibold text-ink">{resultModalTest.subject}</h3>
                <p className="mt-1 text-xs text-ink/75">
                  Attended: {selectedTestResults.length}/{staffStudents.length}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setResultModalTest(null)}
                className="rounded-xl border border-clay/25 bg-cream px-3 py-1 text-xs font-semibold text-ink/80"
              >
                Close
              </button>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <section className="rounded-2xl border border-clay/25 bg-cream/50 p-3">
                <p className="text-xs uppercase tracking-[0.16em] text-ink/70">Student Marks</p>
                {selectedTestResults.length === 0 ? (
                  <p className="mt-3 text-sm text-ink/75">No students attended this test yet.</p>
                ) : (
                  <div className="mt-3 grid gap-2">
                    {selectedTestResults.map((result) => (
                      <div
                        key={result.id}
                        className="rounded-xl border border-clay/20 bg-white px-4 py-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-ink">{result.studentName}</p>
                            {result.studentEmail ? (
                              <p className="text-[11px] text-ink/65">{result.studentEmail}</p>
                            ) : null}
                            {result.submittedAt || result.updatedAt ? (
                              <p className="mt-1 text-[11px] text-ink/60">
                                {formatDateTime(result.submittedAt || result.updatedAt)}
                              </p>
                            ) : null}
                            <p className="mt-1 text-[11px] text-ink/65">
                              Tab switches: {result.tabSwitchCount}
                              {result.autoSubmitted ? " | Auto-submitted" : ""}
                            </p>
                          </div>
                          <div className="rounded-lg border border-clay/25 bg-cream px-2 py-1 text-right">
                            <p className="text-xs font-semibold text-ink">
                              {result.score}/{result.totalQuestions}
                            </p>
                            <p className="text-[11px] font-semibold text-ink/75">{result.percentage}%</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="rounded-2xl border border-clay/25 bg-cream/50 p-3">
                <p className="text-xs uppercase tracking-[0.16em] text-ink/70">Not Attended</p>
                {absentStudents.length === 0 ? (
                  <p className="mt-3 text-sm text-ink/75">All students attended this test.</p>
                ) : (
                  <div className="mt-3 grid gap-2">
                    {absentStudents.map((student) => (
                      <div
                        key={student.id}
                        className="rounded-xl border border-clay/20 bg-white px-4 py-3"
                      >
                        <p className="text-sm font-semibold text-ink">{student.name}</p>
                        {student.email ? (
                          <p className="text-[11px] text-ink/65">{student.email}</p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </Card>
        ) : null}

        {!isStaff && activeAttempt ? (
          <Card className="border-ocean/30">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-ink/75">Attend Test</p>
                <h3 className="text-xl font-semibold text-ink">{activeAttempt.subject}</h3>
                <p className="text-xs text-ink/75">
                  {activeAttempt.questionCount} question{activeAttempt.questionCount === 1 ? "" : "s"}
                </p>
                <p className="mt-1 text-xs font-semibold text-ink/80">
                  Tab switches detected: {tabSwitchCount}
                </p>
                <p className="text-[11px] text-ink/70">
                  Copy, paste and right-click are disabled during this test.
                </p>
                <p className="text-[11px] text-ink/70">
                  Questions and options are randomized for each attempt.
                </p>
              </div>
              <button
                type="button"
                onClick={closeAttemptModal}
                className="rounded-xl border border-clay/25 bg-cream px-3 py-1 text-xs font-semibold text-ink/80"
              >
                Close
              </button>
            </div>

            <form onSubmit={handleSubmitAttempt} className="mt-4 grid gap-3">
              {activeAttempt.questions.map((question, questionIndex) => (
                <div
                  key={`attempt-q-${questionIndex}`}
                  className="rounded-2xl border border-clay/25 bg-cream/60 p-3"
                >
                  <p className="text-sm font-semibold text-ink">
                    Q{questionIndex + 1}. {question.prompt}
                  </p>
                  <div className="mt-2 grid gap-2">
                    {question.options.map((option, optionIndex) => (
                      <label
                        key={`attempt-q-${questionIndex}-opt-${optionIndex}`}
                        className="flex cursor-pointer items-center gap-2 rounded-xl border border-clay/20 bg-white px-3 py-2 text-sm text-ink/80"
                      >
                        <input
                          type="radio"
                          name={`attempt-answer-${questionIndex}`}
                          checked={attemptAnswers[questionIndex] === optionIndex}
                          onChange={() =>
                            handleAttemptAnswerChange(questionIndex, optionIndex)
                          }
                          className="h-4 w-4"
                        />
                        <span>{option}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}

              {attemptStatus ? (
                <p className="text-xs font-semibold text-ink/80">{attemptStatus}</p>
              ) : null}

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={closeAttemptModal}
                  className="rounded-xl border border-clay/25 bg-white px-4 py-2 text-sm font-semibold text-ink/80"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingAttempt}
                  className="rounded-xl bg-clay px-4 py-2 text-sm font-semibold text-black shadow disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {submittingAttempt ? "Submitting..." : "Submit Test"}
                </button>
              </div>
            </form>
          </Card>
        ) : null}
      </section>
    </>
  );
}


