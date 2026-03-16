import { useCallback, useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
} from "firebase/firestore";
import Card from "../components/Card";
import GradientHeader from "../components/GradientHeader";
import { db } from "../lib/firebase";
import {
  createBulkUserNotifications,
  getStudentRecipientIds,
  notificationTypes,
} from "../lib/notifications";
import { useToast } from "../hooks/useToast";
import { useAutosaveDraft } from "../hooks/useAutosaveDraft";
import { useDirtyPrompt } from "../hooks/useDirtyPrompt";
import { useAuth } from "../state/auth";

const formatDate = (value) => {
  if (!value) return "";
  if (typeof value === "string") {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match) {
      const [, year, month, day] = match;
      const localDate = new Date(
        Number(year),
        Number(month) - 1,
        Number(day)
      );
      if (!Number.isNaN(localDate.getTime())) {
        return localDate.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        });
      }
    }
  }

  const date = value?.toDate ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const trimValue = (value) => (value || "").trim();

export default function ExamSchedulePage({ forcedRole }) {
  const { role: contextRole, user } = useAuth();
  const { success, error: toastError, info } = useToast();
  const role = forcedRole || contextRole;
  const isStaff = role === "staff";
  const [examItems, setExamItems] = useState([]);
  const [loadingExams, setLoadingExams] = useState(true);
  const [examError, setExamError] = useState("");
  const [examForm, setExamForm] = useState({
    examType: "",
    label: "",
    subject: "",
    examDate: "",
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [examStatus, setExamStatus] = useState("");
  const [creatingExam, setCreatingExam] = useState(false);

  const examDraftKey = useMemo(
    () => (user?.uid ? `a3hub:draft:exam-schedule:${user.uid}` : ""),
    [user?.uid]
  );

  const restoreExamDraft = useCallback((draftValue) => {
    if (!draftValue || typeof draftValue !== "object") return;
    setExamForm((prev) => ({
      ...prev,
      ...draftValue,
    }));
    info("Restored saved exam schedule draft.");
  }, [info]);

  const { clearDraft } = useAutosaveDraft({
    key: examDraftKey,
    value: examForm,
    onRestore: restoreExamDraft,
    enabled: isStaff && Boolean(user?.uid),
  });

  const isExamFormDirty = useMemo(
    () => Object.values(examForm).some((value) => trimValue(value)),
    [examForm]
  );

  useDirtyPrompt(
    isStaff && isExamFormDirty && !creatingExam,
    "You have unsaved exam form changes. Leave this page?"
  );

  const clearFieldError = useCallback((field) => {
    setFieldErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }, []);

  const handleExamFormChange = useCallback(
    (field, value) => {
      setExamForm((prev) => ({
        ...prev,
        [field]: value,
      }));
      clearFieldError(field);
      setExamStatus("");
    },
    [clearFieldError]
  );

  const validateExamForm = useCallback(() => {
    const nextErrors = {};

    if (!trimValue(examForm.examType)) {
      nextErrors.examType = "Exam type is required.";
    }
    if (!trimValue(examForm.label)) {
      nextErrors.label = "Label is required.";
    }
    if (!trimValue(examForm.subject)) {
      nextErrors.subject = "Subject is required.";
    }
    if (!trimValue(examForm.examDate)) {
      nextErrors.examDate = "Exam date is required.";
    }

    return nextErrors;
  }, [examForm]);

  useEffect(() => {
    const canViewExams = role === "staff" || role === "student" || role === "parent";
    if (!canViewExams) {
      setExamItems([]);
      setLoadingExams(false);
      setExamError("");
      return undefined;
    }

    setLoadingExams(true);
    setExamError("");

    const examQuery = query(
      collection(db, "examSchedules"),
      orderBy("examDate", "asc"),
      limit(50)
    );

    const unsubscribe = onSnapshot(
      examQuery,
      (snapshot) => {
        const next = snapshot.docs.map((docItem) => ({
          id: docItem.id,
          ...docItem.data(),
        }));
        setExamItems(next);
        setLoadingExams(false);
        setExamError("");
      },
      () => {
        setExamError("Unable to load exam schedule.");
        setLoadingExams(false);
      }
    );

    return () => unsubscribe();
  }, [role]);

  const handleAddExam = async (event) => {
    event.preventDefault();
    if (!isStaff || creatingExam) return;

    const examType = trimValue(examForm.examType);
    const label = trimValue(examForm.label);
    const subject = trimValue(examForm.subject);
    const examDate = trimValue(examForm.examDate);

    const validationErrors = validateExamForm();
    if (Object.keys(validationErrors).length > 0) {
      setFieldErrors(validationErrors);
      setExamStatus("Please correct the highlighted fields.");
      toastError("Please correct the highlighted exam form fields.");
      return;
    }

    setCreatingExam(true);
    setExamStatus("");

    try {
      const examRef = await addDoc(collection(db, "examSchedules"), {
        examType,
        label,
        subject,
        examDate,
        createdAt: serverTimestamp(),
        createdBy: user?.uid || null,
      });

      try {
        const recipients = await getStudentRecipientIds(db);
        if (recipients.length > 0) {
          await createBulkUserNotifications(db, {
            recipientIds: recipients,
            type: notificationTypes.EXAM_UPDATE,
            priority: "high",
            topic: notificationTypes.EXAM_UPDATE,
            title: `${label || "Exam"} schedule updated`,
            message: `${subject || "Exam"} on ${formatDate(examDate) || examDate}.`,
            link: "/student/exam-schedule",
            sourceType: "examSchedules",
            sourceId: examRef.id,
          });
        }
      } catch {
        setExamStatus("Exam schedule added, but notifications could not be sent.");
        toastError("Exam added, but notifications could not be sent.");
      }

      setExamForm({
        examType: "",
        label: "",
        subject: "",
        examDate: "",
      });
      setFieldErrors({});
      clearDraft();
      setExamStatus((prev) =>
        prev || "Exam schedule added and notifications sent."
      );
      success("Exam schedule added.");
    } catch {
      setExamStatus("Unable to add exam schedule.");
      toastError("Unable to add exam schedule.");
    } finally {
      setCreatingExam(false);
    }
  };

  const handleDeleteExam = async (examItem) => {
    const examId = examItem?.id || "";
    if (!isStaff || !examId) return;

    const ok = window.confirm("This remove to directly remove in database");
    if (!ok) return;

    try {
      await deleteDoc(doc(db, "examSchedules", examId));

      let statusMessage = "Exam schedule removed.";
      try {
        const recipients = await getStudentRecipientIds(db);
        if (recipients.length > 0) {
          await createBulkUserNotifications(db, {
            recipientIds: recipients,
            type: notificationTypes.EXAM_UPDATE,
            priority: "high",
            topic: notificationTypes.EXAM_UPDATE,
            title: "Exam schedule updated",
            message: `${examItem?.subject || examItem?.label || "An exam"} was removed from the schedule.`,
            link: "/student/exam-schedule",
            sourceType: "examSchedules",
            sourceId: examId,
          });
          statusMessage = "Exam schedule removed and notifications sent.";
        }
      } catch {
        statusMessage =
          "Exam schedule removed, but notifications could not be sent.";
      }

      setExamStatus(statusMessage);
      success(statusMessage);
    } catch {
      setExamStatus("Unable to remove exam schedule.");
      toastError("Unable to remove exam schedule.");
    }
  };

  return (
    <>
      <GradientHeader
        title="Exam Schedule"
        subtitle="Plan your exam timeline and subjects"
        rightSlot={
          <div className="rounded-full border border-clay/30 bg-white px-3 py-1 text-xs font-semibold text-black">
            {isStaff ? "Staff" : role === "parent" ? "Parent" : "Student"}
          </div>
        }
      />

      <section className="mt-6 grid gap-7">
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.18em] text-ink/80">
                Upcoming Exams
              </p>
              <h3 className="text-xl font-semibold text-ink">
                {examItems.length} entries
              </h3>
            </div>
          </div>

          {loadingExams ? (
            <p className="mt-5 text-sm text-ink/75">Loading exam schedule...</p>
          ) : examError ? (
            <p className="mt-5 text-sm text-ink/75">{examError}</p>
          ) : examItems.length === 0 ? (
            <p className="mt-5 text-sm text-ink/75">No exams scheduled yet.</p>
          ) : (
            <div className="mt-6 grid gap-6">
              {examItems.map((exam) => {
                const label = exam.label ? exam.label.trim() : "";
                const subject = exam.subject ? exam.subject.trim() : "";
                const headline =
                  label && subject ? `${label} - ${subject}` : label || subject;
                return (
                  <div
                    key={exam.id || `${exam.label}-${exam.examDate}`}
                    className="rounded-2xl border border-clay/15 bg-white/95 px-6 py-5 text-sm"
                  >
                    <div className="grid gap-5 md:grid-cols-[1fr_auto] md:items-start">
                      <div>
                        <p className="text-[1.15rem] font-semibold text-ink">
                          {headline || "Exam"}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-ink/75">
                          {exam.examType ? (
                            <span className="rounded-full bg-clay/15 px-3 py-1 text-[11px] font-semibold text-ink/80">
                              {exam.examType}
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <div className="flex items-center gap-4 md:flex-col md:items-end">
                        {exam.examDate ? (
                          <span className="rounded-full bg-ink/5 px-4 py-2 text-sm font-semibold text-ink/80">
                            Exam date: {formatDate(exam.examDate)}
                          </span>
                        ) : null}
                        {isStaff ? (
                          <button
                            type="button"
                            onClick={() => handleDeleteExam(exam)}
                            className="rounded-full border border-clay/20 bg-white px-3 py-1.5 text-[11px] font-semibold text-ink/80 hover:border-clay/40"
                          >
                            Remove
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {isStaff ? (
          <Card className="bg-cream">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.18em] text-ink/80">
                  Staff Control
                </p>
                <h3 className="text-xl font-semibold text-ink">
                  Add exam schedule
                </h3>
              </div>
            </div>

            <form onSubmit={handleAddExam} className="mt-6 grid gap-6">
              <div className="grid gap-4">
                <div className="grid gap-3 md:grid-cols-[150px_1fr] md:items-center">
                  <label
                    htmlFor="exam-type"
                    className="text-xs font-semibold uppercase tracking-[0.2em] text-ink/70"
                  >
                    Exam type
                  </label>
                  <input
                    id="exam-type"
                    type="text"
                    value={examForm.examType}
                    onChange={(event) =>
                      handleExamFormChange("examType", event.target.value)
                    }
                    placeholder="Eg : DCA - 1"
                    className="w-full rounded-xl border border-clay/20 bg-white px-3 py-2 text-sm placeholder:text-ink/50"
                  />
                  {fieldErrors.examType ? (
                    <p className="text-xs font-semibold text-rose-700">
                      {fieldErrors.examType}
                    </p>
                  ) : null}
                </div>
                <div className="grid gap-3 md:grid-cols-[150px_1fr] md:items-center">
                  <label
                    htmlFor="exam-label"
                    className="text-xs font-semibold uppercase tracking-[0.2em] text-ink/70"
                  >
                    Label
                  </label>
                  <input
                    id="exam-label"
                    type="text"
                    value={examForm.label}
                    onChange={(event) =>
                      handleExamFormChange("label", event.target.value)
                    }
                    placeholder="Eg : 1st Exam"
                    className="w-full rounded-xl border border-clay/20 bg-white px-3 py-2 text-sm placeholder:text-ink/50"
                  />
                  {fieldErrors.label ? (
                    <p className="text-xs font-semibold text-rose-700">
                      {fieldErrors.label}
                    </p>
                  ) : null}
                </div>
                <div className="grid gap-3 md:grid-cols-[150px_1fr] md:items-center">
                  <label
                    htmlFor="exam-subject"
                    className="text-xs font-semibold uppercase tracking-[0.2em] text-ink/70"
                  >
                    Subject
                  </label>
                  <input
                    id="exam-subject"
                    type="text"
                    value={examForm.subject}
                    onChange={(event) =>
                      handleExamFormChange("subject", event.target.value)
                    }
                    placeholder="Subject name"
                    className="w-full rounded-xl border border-clay/20 bg-white px-3 py-2 text-sm placeholder:text-ink/50"
                  />
                  {fieldErrors.subject ? (
                    <p className="text-xs font-semibold text-rose-700">
                      {fieldErrors.subject}
                    </p>
                  ) : null}
                </div>
                <div className="grid gap-3 md:grid-cols-[150px_1fr] md:items-center">
                  <label
                    htmlFor="exam-date"
                    className="text-xs font-semibold uppercase tracking-[0.2em] text-ink/70"
                  >
                    Exam date
                  </label>
                  <input
                    id="exam-date"
                    type="date"
                    value={examForm.examDate}
                    onChange={(event) =>
                      handleExamFormChange("examDate", event.target.value)
                    }
                    className="w-full rounded-xl border border-clay/20 bg-white px-3 py-2 text-sm text-ink/80"
                  />
                  {fieldErrors.examDate ? (
                    <p className="text-xs font-semibold text-rose-700">
                      {fieldErrors.examDate}
                    </p>
                  ) : null}
                </div>
              </div>

              {examStatus ? (
                <p className="text-xs font-semibold text-ink/80">
                  {examStatus}
                </p>
              ) : null}
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={creatingExam}
                  className="rounded-xl bg-clay px-4 py-2 text-sm font-semibold text-black shadow"
                >
                  {creatingExam ? "Adding..." : "Add Exam"}
                </button>
              </div>
            </form>
          </Card>
        ) : null}
      </section>
    </>
  );
}

