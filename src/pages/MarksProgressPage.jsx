import { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";
import Card from "../components/Card";
import GradientHeader from "../components/GradientHeader";
import ProgressBar from "../components/ProgressBar";
import { db } from "../lib/firebase";
import { createUserNotification, notificationTypes } from "../lib/notifications";
import { useAuth } from "../state/auth";

const MIN_SUBJECTS = 1;
const MAX_SUBJECTS = 12;
const MARK_SCALE = 100;
const MAX_RECORDS = 120;

const createSubjectField = () => ({
  subject: "",
  mark: "",
});

const getMillis = (value) => {
  if (!value) return 0;
  if (typeof value?.toMillis === "function") return value.toMillis();
  const date = new Date(value);
  const millis = date.getTime();
  return Number.isNaN(millis) ? 0 : millis;
};

const formatDateTime = (value) => {
  const millis = getMillis(value);
  if (!millis) return "";
  return new Date(millis).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const clampSubjectCount = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return MIN_SUBJECTS;
  return Math.min(MAX_SUBJECTS, Math.max(MIN_SUBJECTS, Math.trunc(numeric)));
};

const roundToTwoDecimals = (value) =>
  Math.round((value + Number.EPSILON) * 100) / 100;

const formatMark = (value) => {
  const numeric = roundToTwoDecimals(Number(value));
  if (!Number.isFinite(numeric)) return "0";
  return Number.isInteger(numeric)
    ? String(numeric)
    : numeric.toFixed(2).replace(/\.?0+$/, "");
};

const getProgressLabel = (percentage) => {
  if (percentage >= 85) return "Excellent";
  if (percentage >= 70) return "Good";
  if (percentage >= 50) return "Average";
  return "Needs work";
};

const normalizeMarksRecord = (docItem) => {
  const data = docItem.data();
  const subjects = Array.isArray(data?.subjects)
    ? data.subjects
        .map((item) => {
          const subject = String(item?.subject || "").trim();
          const mark = Number(item?.mark);
          if (!subject || !Number.isFinite(mark)) return null;
          const safeMark = roundToTwoDecimals(
            Math.min(MARK_SCALE, Math.max(0, mark))
          );
          return {
            subject,
            mark: safeMark,
            percentage: Math.round((safeMark / MARK_SCALE) * 100),
          };
        })
        .filter(Boolean)
    : [];

  const storedTotalMarks = Number(data?.totalMarks);
  const totalMarks = Number.isFinite(storedTotalMarks)
    ? roundToTwoDecimals(storedTotalMarks)
    : roundToTwoDecimals(subjects.reduce((sum, item) => sum + item.mark, 0));

  const storedTotalMaxMarks = Number(data?.totalMaxMarks);
  const totalMaxMarks =
    Number.isFinite(storedTotalMaxMarks) && storedTotalMaxMarks > 0
      ? storedTotalMaxMarks
      : subjects.length * MARK_SCALE;

  const storedPercentage = Number(data?.percentage);
  const percentage = Number.isFinite(storedPercentage)
    ? Math.min(100, Math.max(0, Math.round(storedPercentage)))
    : totalMaxMarks > 0
    ? Math.round((totalMarks / totalMaxMarks) * 100)
    : 0;

  return {
    id: docItem.id,
    studentId: data?.studentId || "",
    studentName: data?.studentName || "Student",
    studentEmail: data?.studentEmail || "",
    examName: String(data?.examName || "").trim() || "Exam",
    subjects,
    totalMarks,
    totalMaxMarks,
    percentage,
    createdAt: data?.createdAt,
    updatedAt: data?.updatedAt,
    createdByName: data?.createdByName || "Staff",
  };
};

export default function MarksProgressPage({ forcedRole }) {
  const { role: contextRole, user, profile } = useAuth();
  const role = forcedRole || contextRole;
  const isStaff = role === "staff";
  const viewerRoleLabel = isStaff
    ? "Staff"
    : role === "parent"
    ? "Parent"
    : "Student";

  const [students, setStudents] = useState([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState("");

  const [marksRecords, setMarksRecords] = useState([]);
  const [loadingRecords, setLoadingRecords] = useState(true);
  const [recordsError, setRecordsError] = useState("");

  const [viewMode, setViewMode] = useState("marks");
  const [uploadingMarks, setUploadingMarks] = useState(false);
  const [removingRecordId, setRemovingRecordId] = useState("");
  const [formStatus, setFormStatus] = useState("");

  const [marksForm, setMarksForm] = useState({
    examName: "",
    subjectCount: 3,
    subjects: [createSubjectField(), createSubjectField(), createSubjectField()],
  });

  const targetStudentId = isStaff ? selectedStudentId : user?.uid || "";

  const selectedStudent = useMemo(
    () => students.find((item) => item.id === selectedStudentId) || null,
    [students, selectedStudentId]
  );

  const overallAverage = useMemo(() => {
    if (marksRecords.length === 0) return 0;
    const sum = marksRecords.reduce((total, item) => total + item.percentage, 0);
    return Math.round(sum / marksRecords.length);
  }, [marksRecords]);

  const highestScore = useMemo(() => {
    if (marksRecords.length === 0) return 0;
    return Math.max(...marksRecords.map((item) => item.percentage));
  }, [marksRecords]);

  useEffect(() => {
    if (!isStaff) {
      setStudents([]);
      setLoadingStudents(false);
      setSelectedStudentId("");
      return undefined;
    }

    setLoadingStudents(true);
    const studentsQuery = query(
      collection(db, "users"),
      where("role", "==", "student")
    );

    const unsubscribe = onSnapshot(
      studentsQuery,
      (snapshot) => {
        const nextStudents = snapshot.docs
          .map((item) => ({ id: item.id, ...item.data() }))
          .map((item) => ({
            id: item.id,
            name: item?.name || "Student",
            email: item?.email || "",
          }))
          .sort((a, b) => a.name.localeCompare(b.name));

        setStudents(nextStudents);
        setLoadingStudents(false);

        if (nextStudents.length === 0) {
          setSelectedStudentId("");
          return;
        }

        const hasSelectedStudent = nextStudents.some(
          (item) => item.id === selectedStudentId
        );
        if (!hasSelectedStudent) {
          setSelectedStudentId(nextStudents[0].id);
        }
      },
      () => {
        setStudents([]);
        setLoadingStudents(false);
      }
    );

    return () => unsubscribe();
  }, [isStaff, selectedStudentId]);

  useEffect(() => {
    if (!targetStudentId) {
      setMarksRecords([]);
      setLoadingRecords(false);
      setRecordsError("");
      return undefined;
    }

    setLoadingRecords(true);
    setRecordsError("");

    const recordsQuery = query(
      collection(db, "internalMarks"),
      where("studentId", "==", targetStudentId),
      limit(MAX_RECORDS)
    );

    const unsubscribe = onSnapshot(
      recordsQuery,
      (snapshot) => {
        const next = snapshot.docs
          .map(normalizeMarksRecord)
          .sort((a, b) => {
            const bMillis = getMillis(b.createdAt) || getMillis(b.updatedAt);
            const aMillis = getMillis(a.createdAt) || getMillis(a.updatedAt);
            return bMillis - aMillis;
          });

        setMarksRecords(next);
        setLoadingRecords(false);
        setRecordsError("");
      },
      () => {
        setMarksRecords([]);
        setLoadingRecords(false);
        setRecordsError("Unable to load marks.");
      }
    );

    return () => unsubscribe();
  }, [targetStudentId]);

  const handleSubjectCountChange = (value) => {
    const nextCount = clampSubjectCount(value);
    setMarksForm((prev) => {
      const nextSubjects = [...prev.subjects];
      while (nextSubjects.length < nextCount) {
        nextSubjects.push(createSubjectField());
      }
      if (nextSubjects.length > nextCount) {
        nextSubjects.length = nextCount;
      }
      return {
        ...prev,
        subjectCount: nextCount,
        subjects: nextSubjects,
      };
    });
    setFormStatus("");
  };

  const handleSubjectFieldChange = (index, field, value) => {
    setMarksForm((prev) => {
      const nextSubjects = [...prev.subjects];
      nextSubjects[index] = {
        ...nextSubjects[index],
        [field]: value,
      };
      return {
        ...prev,
        subjects: nextSubjects,
      };
    });
    setFormStatus("");
  };

  const handleUploadMarks = async (event) => {
    event.preventDefault();
    if (!isStaff || uploadingMarks) return;

    if (!selectedStudentId) {
      setFormStatus("Choose a student.");
      return;
    }

    const examName = marksForm.examName.trim();
    if (!examName) {
      setFormStatus("Enter exam name.");
      return;
    }

    const selected = students.find((item) => item.id === selectedStudentId);
    if (!selected) {
      setFormStatus("Choose a valid student.");
      return;
    }

    const preparedSubjects = marksForm.subjects
      .slice(0, marksForm.subjectCount)
      .map((item) => ({
        subject: String(item.subject || "").trim(),
        mark: roundToTwoDecimals(Number(item.mark)),
      }));

    const invalidSubjectIndex = preparedSubjects.findIndex((item) => {
      if (!item.subject) return true;
      if (!Number.isFinite(item.mark)) return true;
      if (item.mark < 0 || item.mark > MARK_SCALE) return true;
      return false;
    });

    if (invalidSubjectIndex >= 0) {
      setFormStatus(
        `Complete Subject ${invalidSubjectIndex + 1} with a valid mark.`
      );
      return;
    }

    const totalMarks = roundToTwoDecimals(
      preparedSubjects.reduce((sum, item) => sum + item.mark, 0)
    );
    const totalMaxMarks = preparedSubjects.length * MARK_SCALE;
    const percentage =
      totalMaxMarks > 0 ? Math.round((totalMarks / totalMaxMarks) * 100) : 0;

    setUploadingMarks(true);
    setFormStatus("");

    try {
      const marksRef = await addDoc(collection(db, "internalMarks"), {
        studentId: selected.id,
        studentName: selected.name,
        studentEmail: selected.email,
        examName,
        subjects: preparedSubjects,
        totalMarks,
        totalMaxMarks,
        percentage,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: user?.uid || null,
        createdByName: profile?.name || user?.email || "Staff",
      });

      let notificationStatus = "";
      try {
        await createUserNotification(db, {
          recipientId: selected.id,
          type: notificationTypes.MARKS_UPDATE,
          priority: "high",
          topic: notificationTypes.MARKS_UPDATE,
          title: `New marks uploaded: ${examName}`,
          message: `${preparedSubjects.length} subjects, ${percentage}% overall.`,
          link: "/student/menu/marks-progress",
          sourceType: "internalMarks",
          sourceId: marksRef.id,
        });
      } catch {
        notificationStatus = " Marks saved, but notification could not be sent.";
      }

      setMarksForm((prev) => ({
        ...prev,
        examName: "",
        subjects: Array.from(
          { length: prev.subjectCount },
          () => createSubjectField()
        ),
      }));
      setFormStatus(
        notificationStatus
          ? `Marks uploaded successfully.${notificationStatus}`
          : "Marks uploaded successfully and notification sent."
      );
    } catch {
      setFormStatus("Unable to upload marks.");
    } finally {
      setUploadingMarks(false);
    }
  };

  const handleDeleteRecord = async (recordId) => {
    if (!isStaff || !recordId || removingRecordId) return;

    const confirmed = window.confirm("Remove this exam marks record?");
    if (!confirmed) return;

    setRemovingRecordId(recordId);
    setFormStatus("");
    try {
      await deleteDoc(doc(db, "internalMarks", recordId));
      setFormStatus("Marks record removed.");
    } catch {
      setFormStatus("Unable to remove marks record.");
    } finally {
      setRemovingRecordId("");
    }
  };

  return (
    <>
      <GradientHeader
        title="Marks & Progress"
        subtitle={
          isStaff
            ? "Upload internal marks and track exam progress."
            : "View your internal marks and exam-wise progress."
        }
        rightSlot={
          <div className="rounded-full border border-clay/30 bg-white px-3 py-1 text-xs font-semibold text-black">
            {viewerRoleLabel}
          </div>
        }
      />

      <section className="mt-6 grid gap-8">
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-7">
            <div>
              <p className="text-sm uppercase tracking-[0.18em] text-ink/80">
                Overview
              </p>
              <h3 className="text-xl font-semibold text-ink">
                {marksRecords.length} exam{marksRecords.length === 1 ? "" : "s"}
              </h3>
              <p className="mt-1 text-xs text-ink/70">
                {isStaff
                  ? selectedStudent?.name || "Select a student to view records."
                  : profile?.name || "Student"}
              </p>
            </div>

            <div className="grid w-full gap-5 sm:w-auto sm:min-w-[440px] sm:grid-cols-3">
              <div className="rounded-xl border border-clay/25 bg-white/95 px-6 py-5 text-center">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink/65">
                  Average
                </p>
                <p className="mt-1 text-base font-bold text-ink">{overallAverage}%</p>
              </div>
              <div className="rounded-xl border border-clay/25 bg-white/95 px-6 py-5 text-center">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink/65">
                  Top
                </p>
                <p className="mt-1 text-base font-bold text-ink">{highestScore}%</p>
              </div>
              <div className="rounded-xl border border-clay/25 bg-white/95 px-6 py-5 text-center">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink/65">
                  Level
                </p>
                <p className="mt-1 text-base font-bold text-ink">
                  {getProgressLabel(overallAverage)}
                </p>
              </div>
            </div>
          </div>

          {isStaff ? (
            <div className="mt-6 grid gap-4 rounded-2xl border border-clay/25 bg-cream/70 p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-ink/75">
                Student Select
              </p>
              {loadingStudents ? (
                <p className="text-xs text-ink/75">Loading students...</p>
              ) : students.length === 0 ? (
                <p className="text-xs text-ink/75">No students found.</p>
              ) : (
                <select
                  value={selectedStudentId}
                  onChange={(event) => {
                    setSelectedStudentId(event.target.value);
                    setFormStatus("");
                  }}
                  className="w-full rounded-xl border border-clay/30 bg-white px-3 py-3 text-sm"
                >
                  {students.map((student) => (
                    <option key={student.id} value={student.id}>
                      {student.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          ) : null}
        </Card>

        {isStaff ? (
          <Card>
            <div>
              <p className="text-sm uppercase tracking-[0.18em] text-ink/80">
                Marks
              </p>
              <h3 className="text-xl font-semibold text-ink">Upload Internal Marks</h3>
              <p className="mt-1 text-xs text-ink/70">
                Students can view this directly in their menu.
              </p>
            </div>

            <form onSubmit={handleUploadMarks} className="mt-6 grid gap-6">
              <input
                type="text"
                value={marksForm.examName}
                onChange={(event) => {
                  setMarksForm((prev) => ({
                    ...prev,
                    examName: event.target.value,
                  }));
                  setFormStatus("");
                }}
                placeholder="Exam name (e.g. Internal 1)"
                className="w-full rounded-xl border border-clay/30 bg-white px-3 py-3 text-sm placeholder:text-ink/50"
              />

              <div className="grid gap-3">
                <label className="text-xs font-semibold uppercase tracking-[0.18em] text-ink/75">
                  Number of Subjects
                </label>
                <input
                  type="number"
                  min={MIN_SUBJECTS}
                  max={MAX_SUBJECTS}
                  value={marksForm.subjectCount}
                  onChange={(event) => handleSubjectCountChange(event.target.value)}
                  className="w-full rounded-xl border border-clay/30 bg-white px-3 py-3 text-sm"
                />
              </div>

              <div className="grid gap-5">
                {marksForm.subjects
                  .slice(0, marksForm.subjectCount)
                  .map((subjectItem, index) => (
                    <div
                      key={`subject-${index + 1}`}
                      className="grid gap-4 rounded-xl border border-clay/25 bg-white/95 p-5 sm:grid-cols-[1fr_180px]"
                    >
                      <input
                        type="text"
                        value={subjectItem.subject}
                        onChange={(event) =>
                          handleSubjectFieldChange(index, "subject", event.target.value)
                        }
                        placeholder={`Subject ${index + 1} Name`}
                        className="w-full rounded-lg border border-clay/25 bg-white px-3 py-2.5 text-sm placeholder:text-ink/50"
                      />
                      <input
                        type="number"
                        min="0"
                        max={MARK_SCALE}
                        step="0.01"
                        value={subjectItem.mark}
                        onChange={(event) =>
                          handleSubjectFieldChange(index, "mark", event.target.value)
                        }
                        placeholder="Mark"
                        className="w-full rounded-lg border border-clay/25 bg-white px-3 py-2.5 text-sm placeholder:text-ink/50"
                      />
                    </div>
                  ))}
              </div>

              {formStatus ? (
                <p className="text-xs font-semibold text-ink/80">{formStatus}</p>
              ) : null}

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={uploadingMarks || !selectedStudentId}
                  className="rounded-xl bg-clay px-4 py-2 text-sm font-semibold text-black shadow disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {uploadingMarks ? "Uploading..." : "Upload Marks"}
                </button>
              </div>
            </form>
          </Card>
        ) : null}

        <Card>
          <div className="flex flex-wrap items-center justify-between gap-5">
            <div>
              <p className="text-sm uppercase tracking-[0.18em] text-ink/80">
                View
              </p>
              <h3 className="text-xl font-semibold text-ink">Marks & Progress</h3>
            </div>

            <div className="flex items-center gap-2 rounded-full border border-clay/25 bg-white/90 p-1">
              <button
                type="button"
                onClick={() => setViewMode("marks")}
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  viewMode === "marks"
                    ? "bg-clay/80 text-ink"
                    : "text-ink/75 hover:bg-clay/25"
                }`}
              >
                Marks
              </button>
              <button
                type="button"
                onClick={() => setViewMode("progress")}
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  viewMode === "progress"
                    ? "bg-clay/80 text-ink"
                    : "text-ink/75 hover:bg-clay/25"
                }`}
              >
                Progress
              </button>
            </div>
          </div>

          {loadingRecords ? (
            <p className="mt-5 text-sm text-ink/75">Loading marks...</p>
          ) : recordsError ? (
            <p className="mt-5 text-sm text-ink/75">{recordsError}</p>
          ) : marksRecords.length === 0 ? (
            <p className="mt-5 text-sm text-ink/75">
              No marks uploaded yet.
            </p>
          ) : (
            <div className="mt-6 grid gap-5">
              {marksRecords.map((record) => (
                <div
                  key={record.id}
                  className="rounded-2xl border border-clay/30 bg-white/95 p-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-5">
                    <div>
                      <p className="text-sm font-semibold text-ink">{record.examName}</p>
                      <p className="mt-1 text-xs text-ink/70">{record.studentName}</p>
                      <p className="mt-1 text-[11px] text-ink/60">
                        {formatDateTime(record.createdAt || record.updatedAt) || "Recently updated"}
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="rounded-full border border-clay/30 bg-cream px-3 py-1 text-xs font-semibold text-ink/80">
                        {record.percentage}%
                      </span>
                      {isStaff ? (
                        <button
                          type="button"
                          onClick={() => handleDeleteRecord(record.id)}
                          disabled={removingRecordId === record.id}
                          className="rounded-full border border-clay/30 bg-white px-3 py-1 text-xs font-semibold text-ink/75 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {removingRecordId === record.id ? "Removing..." : "Remove"}
                        </button>
                      ) : null}
                    </div>
                  </div>

                  {viewMode === "marks" ? (
                    <div className="mt-5 grid gap-4">
                      {record.subjects.map((subjectItem) => (
                        <div
                          key={`${record.id}-${subjectItem.subject}`}
                          className="flex items-center justify-between rounded-xl border border-clay/25 bg-cream/65 px-5 py-4"
                        >
                          <p className="text-sm font-medium text-ink">
                            {subjectItem.subject}
                          </p>
                          <p className="text-sm font-semibold text-ink">
                            {formatMark(subjectItem.mark)}/{MARK_SCALE}
                          </p>
                        </div>
                      ))}
                      <div className="mt-3 flex items-center justify-between text-xs font-semibold text-ink/75">
                        <span>
                          Total: {formatMark(record.totalMarks)}/
                          {formatMark(record.totalMaxMarks)}
                        </span>
                        <span>{getProgressLabel(record.percentage)}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-5 grid gap-5">
                      <div className="rounded-xl border border-clay/25 bg-cream/65 px-5 py-5">
                        <div className="mb-3 flex items-center justify-between gap-2">
                          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-ink/70">
                            Exam Progress
                          </p>
                          <p className="text-xs font-semibold text-ink/75">
                            {record.percentage}%
                          </p>
                        </div>
                        <ProgressBar value={record.percentage} />
                      </div>

                      {record.subjects.map((subjectItem) => (
                        <div
                          key={`${record.id}-${subjectItem.subject}-progress`}
                          className="rounded-xl border border-clay/25 bg-cream/60 px-5 py-4"
                        >
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <p className="text-sm text-ink">{subjectItem.subject}</p>
                            <p className="text-xs font-semibold text-ink/75">
                              {subjectItem.percentage}%
                            </p>
                          </div>
                          <ProgressBar value={subjectItem.percentage} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      </section>
    </>
  );
}
