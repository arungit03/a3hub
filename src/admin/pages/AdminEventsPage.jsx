import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpDown,
  CalendarDays,
  CircleDot,
  Gauge,
  Mail,
  MapPin,
  PanelsTopLeft,
  Phone,
  Plus,
  SlidersHorizontal,
  Trash2,
  Type,
  Upload,
  X,
} from "lucide-react";
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { RemoteImage } from "../../components/RemoteImage";
import {
  EVENT_FORM_QUESTION_TYPES,
  createEventQuestion,
  formatEventDate,
  formatEventDateTime,
  getEventImageUploadErrorMessage,
  getEventImageUrl,
  getEventStatusMeta,
  normalizeEventQuestions,
  sortEvents,
  toMillis,
  validateEventImageFile,
} from "../../lib/events";
import {
  optimizeImageFileForUpload,
  uploadFileWithFallbacks,
} from "../../lib/mediaUpload";
import { db } from "../../lib/firebase";
import { useAuth } from "../../state/auth";

const toSafeText = (value) => String(value || "").trim();
const formatFileSize = (value) => {
  const bytes = Number(value || 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
};

const emptyForm = () => ({
  title: "",
  venue: "",
  eventDate: "",
  registrationDeadline: "",
  description: "",
  imageFile: null,
  imageName: "",
  questions: [],
});

const normalizeDoc = (docItem) => ({ id: docItem.id, ...docItem.data() });

const formatValue = (value, fallback = "-") => toSafeText(value) || fallback;
const formatAnswerValue = (question, value) => {
  const text = toSafeText(value);
  if (!text) return "";

  if (question?.type === "date") {
    const parsed = new Date(text);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    }
  }

  return text;
};

const QUESTION_TYPE_ICONS = {
  choice: CircleDot,
  text: Type,
  rating: Gauge,
  date: CalendarDays,
  ranking: ArrowUpDown,
  likert: SlidersHorizontal,
  upload: Upload,
  nps: Gauge,
  section: PanelsTopLeft,
};

function FormsQuestionCard({ label, help, required = false, neutral = false, children }) {
  return (
    <section
      className={`forms-modal__question${neutral ? " forms-modal__question--neutral" : ""}`}
    >
      <div className="forms-modal__question-head">
        <p className="forms-modal__question-label">{label}</p>
        {required ? <span className="forms-modal__question-required">Required</span> : null}
      </div>
      {help ? <p className="forms-modal__question-help">{help}</p> : null}
      {children}
    </section>
  );
}

function QuestionTypeButton({ option, onPick }) {
  const Icon = QUESTION_TYPE_ICONS[option.type] || Plus;

  return (
    <button
      type="button"
      onClick={() => option.supported && onPick(option.type)}
      disabled={!option.supported}
      className={`event-builder-picker__type${
        option.supported ? "" : " event-builder-picker__type--disabled"
      }`}
    >
      <span className="event-builder-picker__type-badge">
        <Icon className="h-5 w-5" />
      </span>
      <span>
        <span className="event-builder-picker__type-label">{option.label}</span>
        <span className="event-builder-picker__type-meta">
          {option.supported ? "Add this question" : "Coming soon"}
        </span>
      </span>
    </button>
  );
}

function RegistrationQuestionEditor({
  question,
  index,
  onChange,
  onRemove,
  onAddOption,
  onOptionChange,
  onOptionRemove,
}) {
  const heading = question.type === "section" ? "Section" : `Question ${index + 1}`;
  const TypeIcon = QUESTION_TYPE_ICONS[question.type] || Type;

  return (
    <article className="event-builder__question">
      <div className="event-builder__question-head">
        <div>
          <p className="event-builder__question-kicker">{heading}</p>
          <p className="event-builder__question-type">
            <TypeIcon className="h-4 w-4" />
            {question.type === "choice"
              ? "Choice"
              : question.type === "date"
              ? "Date"
              : question.type === "rating"
              ? "Rating"
              : question.type === "section"
              ? "Section"
              : "Text"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onRemove(question.id)}
          className="event-builder__remove"
        >
          <Trash2 className="h-4 w-4" />
          Remove
        </button>
      </div>

      <div className="event-builder__field-grid">
        <label className="event-builder__field">
          <span className="event-builder__field-label">
            {question.type === "section" ? "Section title" : "Question title"}
          </span>
          <input
            type="text"
            value={question.title || ""}
            onChange={(event) =>
              onChange(question.id, { title: event.target.value })
            }
            className="event-builder__input"
            placeholder={
              question.type === "section"
                ? "About this event"
                : "Write your question"
            }
          />
        </label>

        {question.type === "section" ? (
          <label className="event-builder__field">
            <span className="event-builder__field-label">Section description</span>
            <textarea
              rows={3}
              value={question.description || ""}
              onChange={(event) =>
                onChange(question.id, { description: event.target.value })
              }
              className="event-builder__textarea"
              placeholder="Explain what this section is for."
            />
          </label>
        ) : null}

        {question.type === "text" ? (
          <>
            <label className="event-builder__field">
              <span className="event-builder__field-label">Placeholder</span>
              <input
                type="text"
                value={question.placeholder || ""}
                onChange={(event) =>
                  onChange(question.id, { placeholder: event.target.value })
                }
                className="event-builder__input"
                placeholder="Enter your answer"
              />
            </label>
            <label className="event-builder__toggle">
              <input
                type="checkbox"
                checked={Boolean(question.multiline)}
                onChange={(event) =>
                  onChange(question.id, { multiline: event.target.checked })
                }
              />
              Paragraph answer
            </label>
          </>
        ) : null}

        {question.type === "choice" ? (
          <div className="event-builder__field event-builder__field--full">
            <div className="flex items-center justify-between gap-3">
              <span className="event-builder__field-label">Options</span>
              <button
                type="button"
                onClick={() => onAddOption(question.id)}
                className="event-builder__inline-button"
              >
                <Plus className="h-4 w-4" />
                Add option
              </button>
            </div>
            <div className="mt-3 space-y-2">
              {(Array.isArray(question.options) ? question.options : []).map((option, optionIndex) => (
                <div key={`${question.id}_${optionIndex}`} className="event-builder__option-row">
                  <span className="event-builder__option-dot" />
                  <input
                    type="text"
                    value={option}
                    onChange={(event) =>
                      onOptionChange(question.id, optionIndex, event.target.value)
                    }
                    className="event-builder__input"
                    placeholder={`Option ${optionIndex + 1}`}
                  />
                  <button
                    type="button"
                    onClick={() => onOptionRemove(question.id, optionIndex)}
                    className="event-builder__option-remove"
                    disabled={(question.options || []).length <= 2}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
            <label className="event-builder__toggle mt-3">
              <input
                type="checkbox"
                checked={Boolean(question.allowOther)}
                onChange={(event) =>
                onChange(question.id, { allowOther: event.target.checked })
              }
              />
              Allow "Other" answer
            </label>
          </div>
        ) : null}

        {question.type === "rating" ? (
          <div className="event-builder__field">
            <span className="event-builder__field-label">Scale</span>
            <select
              value={question.scale || 5}
              onChange={(event) =>
                onChange(question.id, { scale: Number(event.target.value) || 5 })
              }
              className="event-builder__input"
            >
              {[3, 4, 5, 6, 7, 8, 9, 10].map((scale) => (
                <option key={scale} value={scale}>
                  {scale} points
                </option>
              ))}
            </select>
          </div>
        ) : null}

        {question.type !== "section" ? (
          <label className="event-builder__toggle">
            <input
              type="checkbox"
              checked={Boolean(question.required)}
              onChange={(event) =>
                onChange(question.id, { required: event.target.checked })
              }
            />
            Required question
          </label>
        ) : null}
      </div>
    </article>
  );
}

export default function AdminEventsPage() {
  const { user, profile } = useAuth();
  const [events, setEvents] = useState([]);
  const [eventsError, setEventsError] = useState("");
  const [eventsLoading, setEventsLoading] = useState(true);
  const [submissions, setSubmissions] = useState([]);
  const [submissionsError, setSubmissionsError] = useState("");
  const [submissionsLoading, setSubmissionsLoading] = useState(true);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [questionPickerOpen, setQuestionPickerOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [statusMessage, setStatusMessage] = useState("");
  const [createStatus, setCreateStatus] = useState("");
  const [imagePreparing, setImagePreparing] = useState(false);
  const [savingEvent, setSavingEvent] = useState(false);
  const [savingStage, setSavingStage] = useState("");
  const [removingEvent, setRemovingEvent] = useState(false);
  const imagePickRequestRef = useRef(0);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      query(collection(db, "events")),
      (snapshot) => {
        const nextEvents = sortEvents(snapshot.docs.map(normalizeDoc));
        setEvents(nextEvents);
        setEventsLoading(false);
        setEventsError("");
        setSelectedEventId((previous) =>
          previous && nextEvents.some((item) => item.id === previous)
            ? previous
            : nextEvents[0]?.id || ""
        );
      },
      () => {
        setEvents([]);
        setEventsLoading(false);
        setEventsError("Unable to load events.");
      }
    );
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      query(collection(db, "eventSubmissions")),
      (snapshot) => {
        const nextSubmissions = snapshot.docs
          .map(normalizeDoc)
          .sort(
            (a, b) =>
              toMillis(b?.updatedAt || b?.createdAt) -
              toMillis(a?.updatedAt || a?.createdAt)
          );
        setSubmissions(nextSubmissions);
        setSubmissionsLoading(false);
        setSubmissionsError("");
      },
      () => {
        setSubmissions([]);
        setSubmissionsLoading(false);
        setSubmissionsError("Unable to load event submissions.");
      }
    );
    return () => unsubscribe();
  }, []);

  const submissionCounts = useMemo(() => {
    const map = new Map();
    submissions.forEach((submission) => {
      const eventId = toSafeText(submission.eventId);
      if (!eventId) return;
      map.set(eventId, (map.get(eventId) || 0) + 1);
    });
    return map;
  }, [submissions]);

  const selectedEvent = useMemo(
    () => events.find((item) => item.id === selectedEventId) || null,
    [events, selectedEventId]
  );

  const selectedSubmissions = useMemo(
    () => submissions.filter((item) => item.eventId === selectedEventId),
    [selectedEventId, submissions]
  );

  const selectedEventQuestions = useMemo(
    () => normalizeEventQuestions(selectedEvent?.registrationForm?.questions),
    [selectedEvent]
  );

  const closeCreateModal = () => {
    if (savingEvent || imagePreparing) return;
    imagePickRequestRef.current += 1;
    setCreateModalOpen(false);
    setQuestionPickerOpen(false);
    setCreateStatus("");
    setSavingStage("");
    setForm(emptyForm());
  };

  const updateQuestion = (questionId, updates) => {
    setForm((previous) => ({
      ...previous,
      questions: previous.questions.map((question) =>
        question.id === questionId ? { ...question, ...updates } : question
      ),
    }));
    setCreateStatus("");
  };

  const removeQuestion = (questionId) => {
    setForm((previous) => ({
      ...previous,
      questions: previous.questions.filter((question) => question.id !== questionId),
    }));
    setCreateStatus("");
  };

  const addQuestion = (type) => {
    setForm((previous) => ({
      ...previous,
      questions: [...previous.questions, createEventQuestion(type)],
    }));
    setQuestionPickerOpen(false);
    setCreateStatus("");
  };

  const addChoiceOption = (questionId) => {
    setForm((previous) => ({
      ...previous,
      questions: previous.questions.map((question) =>
        question.id === questionId
          ? {
              ...question,
              options: [...(Array.isArray(question.options) ? question.options : []), ""],
            }
          : question
      ),
    }));
  };

  const updateChoiceOption = (questionId, optionIndex, value) => {
    setForm((previous) => ({
      ...previous,
      questions: previous.questions.map((question) => {
        if (question.id !== questionId) return question;
        const nextOptions = [...(Array.isArray(question.options) ? question.options : [])];
        nextOptions[optionIndex] = value;
        return { ...question, options: nextOptions };
      }),
    }));
    setCreateStatus("");
  };

  const removeChoiceOption = (questionId, optionIndex) => {
    setForm((previous) => ({
      ...previous,
      questions: previous.questions.map((question) => {
        if (question.id !== questionId) return question;
        const nextOptions = [...(Array.isArray(question.options) ? question.options : [])];
        if (nextOptions.length <= 2) return question;
        nextOptions.splice(optionIndex, 1);
        return { ...question, options: nextOptions };
      }),
    }));
  };

  const handleImagePick = async (file) => {
    const requestId = imagePickRequestRef.current + 1;
    imagePickRequestRef.current = requestId;

    if (!file) {
      setImagePreparing(false);
      setForm((prev) => ({ ...prev, imageFile: null, imageName: "" }));
      setCreateStatus("");
      return;
    }

    try {
      validateEventImageFile(file);
      setImagePreparing(true);
      setCreateStatus("");
      setForm((prev) => ({
        ...prev,
        imageFile: null,
        imageName: file?.name || "",
      }));
      const preparedFile = await optimizeImageFileForUpload({ file });
      if (imagePickRequestRef.current !== requestId) return;
      setForm((prev) => ({
        ...prev,
        imageFile: preparedFile,
        imageName: file?.name || "",
      }));
    } catch (error) {
      if (imagePickRequestRef.current !== requestId) return;
      setForm((prev) => ({ ...prev, imageFile: null, imageName: "" }));
      setCreateStatus(error?.message || "Unable to use this image.");
    } finally {
      if (imagePickRequestRef.current === requestId) {
        setImagePreparing(false);
      }
    }
  };

  const handleCreateEvent = async (event) => {
    event.preventDefault();
    const title = toSafeText(form.title);
    const venue = toSafeText(form.venue);
    const description = toSafeText(form.description);
    const questions = normalizeEventQuestions(form.questions);

    if (!title) return setCreateStatus("Enter event title.");
    if (!form.eventDate) return setCreateStatus("Choose event date and time.");
    if (imagePreparing) return setCreateStatus("Please wait. The event image is still preparing.");
    if (!form.imageFile) return setCreateStatus("Upload an event image.");

    for (let index = 0; index < questions.length; index += 1) {
      const question = questions[index];
      if (question.type === "section") {
        if (!question.title) {
          return setCreateStatus(`Enter a title for section ${index + 1}.`);
        }
        continue;
      }

      if (!question.title) {
        return setCreateStatus(`Enter a title for question ${index + 1}.`);
      }

      if (question.type === "choice" && question.options.length < 2) {
        return setCreateStatus(`Question ${index + 1} needs at least two options.`);
      }
    }

    const eventDate = new Date(form.eventDate);
    if (Number.isNaN(eventDate.getTime())) {
      return setCreateStatus("Event date is invalid.");
    }

    let registrationDeadline = null;
    if (form.registrationDeadline) {
      registrationDeadline = new Date(form.registrationDeadline);
      if (Number.isNaN(registrationDeadline.getTime())) {
        return setCreateStatus("Registration deadline is invalid.");
      }
      if (registrationDeadline.getTime() > eventDate.getTime()) {
        return setCreateStatus("Registration deadline must be before event date.");
      }
    }

    setSavingEvent(true);
    setCreateStatus("");
    setSavingStage("uploading");
    try {
      validateEventImageFile(form.imageFile);
      const uploaded = await uploadFileWithFallbacks({
        file: form.imageFile,
        folder: "a3hub/events",
        allowInlineImageFallback: true,
      });
      setSavingStage("saving");
      const eventRef = doc(collection(db, "events"));
      await setDoc(eventRef, {
        title,
        venue,
        description,
        eventDate,
        registrationDeadline: registrationDeadline || null,
        image: { ...uploaded, name: form.imageName || form.imageFile.name || "event" },
        registrationForm: {
          questions,
        },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: user?.uid || "",
        createdByName:
          profile?.name || user?.displayName || user?.email || "Admin",
      });
      setSelectedEventId(eventRef.id);
      setStatusMessage("Event created successfully.");
      setCreateModalOpen(false);
      setQuestionPickerOpen(false);
      setForm(emptyForm());
      setSavingStage("");
    } catch (error) {
      setSavingStage("");
      setCreateStatus(getEventImageUploadErrorMessage(error));
    } finally {
      setSavingEvent(false);
      setSavingStage("");
    }
  };

  const createButtonLabel = imagePreparing
    ? "Preparing image..."
    : savingStage === "uploading"
    ? "Uploading image..."
    : savingStage === "saving"
    ? "Saving event..."
    : "Create Event";

  const eventImageHelpCopy = imagePreparing
    ? "Optimizing the image for faster upload..."
    : form.imageFile
    ? `Ready to upload: ${formatFileSize(form.imageFile.size)} processed image.`
    : "Recommended: one clear landscape image, maximum file size 5 MB.";

  const handleRemoveEvent = async () => {
    if (!removeTarget?.id) return;
    setRemovingEvent(true);
    setStatusMessage("");
    try {
      const snapshot = await getDocs(
        query(collection(db, "eventSubmissions"), where("eventId", "==", removeTarget.id))
      );
      const refs = [doc(db, "events", removeTarget.id), ...snapshot.docs.map((item) => item.ref)];
      for (let index = 0; index < refs.length; index += 450) {
        const batch = writeBatch(db);
        refs.slice(index, index + 450).forEach((refItem) => batch.delete(refItem));
        await batch.commit();
      }
      setRemoveTarget(null);
      setStatusMessage("Event removed successfully.");
    } catch {
      setStatusMessage("Unable to remove event.");
    } finally {
      setRemovingEvent(false);
    }
  };

  return (
    <div className="space-y-6">
      <header className="rounded-3xl border border-slate-200 bg-white px-5 py-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              Event Console
            </p>
            <h2 className="mt-1 text-2xl font-bold text-slate-900">
              Create, Remove, and Review Event Registrations
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              Students submit from campus services and staff can review the same list.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              imagePickRequestRef.current += 1;
              setCreateModalOpen(true);
              setQuestionPickerOpen(false);
              setCreateStatus("");
              setImagePreparing(false);
              setSavingStage("");
              setForm(emptyForm());
            }}
            className="inline-flex items-center gap-2 rounded-full bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            Create Event
          </button>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              Events
            </p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{events.length}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              Submissions
            </p>
            <p className="mt-1 text-2xl font-bold text-slate-900">
              {submissions.length}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              Selected Event
            </p>
            <p className="mt-1 truncate text-base font-semibold text-slate-900">
              {selectedEvent?.title || "None"}
            </p>
          </div>
        </div>

        {statusMessage ? (
          <p className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
            {statusMessage}
          </p>
        ) : null}
      </header>

      <div className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
        <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="text-xl font-semibold text-slate-900">All Events</h3>
          {eventsLoading ? <p className="mt-4 text-sm text-slate-500">Loading events...</p> : null}
          {eventsError ? (
            <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {eventsError}
            </p>
          ) : null}
          <div className="mt-4 space-y-3">
            {events.map((item) => {
              const status = getEventStatusMeta(item);
              const count = submissionCounts.get(item.id) || 0;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedEventId(item.id)}
                  className={`w-full rounded-2xl border p-3 text-left transition ${
                    item.id === selectedEventId
                      ? "border-blue-300 bg-blue-50/70"
                      : "border-slate-200 bg-white hover:border-blue-200 hover:bg-slate-50"
                  }`}
                >
                  <div className="flex gap-3">
                    <div className="h-16 w-16 overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
                      <RemoteImage
                        src={getEventImageUrl(item)}
                        alt={item.title || "Event"}
                        className="h-full w-full object-cover"
                        fallbackClassName="flex h-full w-full items-center justify-center bg-gradient-to-br from-blue-100 via-white to-cyan-100 text-sm font-semibold text-slate-700"
                        fallbackLabel={item.title || "Event"}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-semibold text-slate-900">
                          {item.title || "Campus Event"}
                        </p>
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${status.chipClass}`}>
                          {status.label}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">{formatEventDate(item.eventDate)}</p>
                      <p className="mt-2 text-xs font-semibold text-slate-700">
                        {count} submission{count === 1 ? "" : "s"}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}
            {!eventsLoading && events.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-500">
                No events created yet.
              </div>
            ) : null}
          </div>
        </section>

        <section className="space-y-6">
          {selectedEvent ? (
            <>
              <article className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
                <div className="grid gap-0 lg:grid-cols-[300px_minmax(0,1fr)]">
                  <div className="min-h-[220px] bg-slate-100">
                    <RemoteImage
                      src={getEventImageUrl(selectedEvent)}
                      alt={selectedEvent.title || "Event"}
                      className="h-full w-full object-cover"
                      fallbackClassName="flex h-full min-h-[220px] w-full items-center justify-center bg-gradient-to-br from-blue-100 via-white to-cyan-100 text-3xl font-semibold text-slate-700"
                      fallbackLabel={selectedEvent.title || "Event"}
                    />
                  </div>
                  <div className="p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                          Event Preview
                        </p>
                        <h3 className="mt-1 text-2xl font-bold text-slate-900">
                          {selectedEvent.title || "Campus Event"}
                        </h3>
                      </div>
                      <button
                        type="button"
                        onClick={() => setRemoveTarget(selectedEvent)}
                        className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-100"
                      >
                        <Trash2 className="h-4 w-4" />
                        Remove
                      </button>
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                        <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                          <CalendarDays className="h-4 w-4" />
                          Event Date
                        </p>
                        <p className="mt-2 text-sm font-semibold text-slate-900">
                          {formatEventDateTime(selectedEvent.eventDate)}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                          Registration Deadline
                        </p>
                        <p className="mt-2 text-sm font-semibold text-slate-900">
                          {selectedEvent.registrationDeadline
                            ? formatEventDateTime(selectedEvent.registrationDeadline)
                            : "Follows event schedule"}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 sm:col-span-2">
                        <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                          <MapPin className="h-4 w-4" />
                          Venue
                        </p>
                        <p className="mt-2 text-sm font-semibold text-slate-900">
                          {formatValue(selectedEvent.venue, "Venue will be announced soon")}
                        </p>
                      </div>
                    </div>
                    {selectedEvent.description ? (
                      <p className="mt-4 whitespace-pre-wrap text-sm text-slate-700">
                        {selectedEvent.description}
                      </p>
                    ) : null}
                    {selectedEventQuestions.length ? (
                      <div className="mt-4 rounded-2xl border border-slate-200 bg-white px-4 py-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                          Registration Form
                        </p>
                        <div className="mt-3 space-y-2">
                          {selectedEventQuestions.map((question, index) => (
                            <div key={question.id} className="rounded-xl bg-slate-50 px-3 py-3">
                              <p className="text-sm font-semibold text-slate-900">
                                {question.type === "section"
                                  ? `Section: ${question.title || `Section ${index + 1}`}`
                                  : `${index + 1}. ${question.title || "Untitled question"}`}
                              </p>
                              <p className="mt-1 text-xs text-slate-500">
                                {question.type === "choice"
                                  ? `${question.options.length} option${question.options.length === 1 ? "" : "s"}`
                                  : question.type === "rating"
                                  ? `${question.scale || 5}-point rating`
                                  : question.type === "date"
                                  ? "Date question"
                                  : question.type === "section"
                                  ? question.description || "Section divider"
                                  : question.multiline
                                  ? "Paragraph answer"
                                  : "Short answer"}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              </article>

              <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-xl font-semibold text-slate-900">Student Submissions</h3>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
                    {selectedSubmissions.length} student{selectedSubmissions.length === 1 ? "" : "s"}
                  </span>
                </div>
                {submissionsLoading ? (
                  <p className="mt-4 text-sm text-slate-500">Loading submissions...</p>
                ) : null}
                {submissionsError ? (
                  <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                    {submissionsError}
                  </p>
                ) : null}
                <div className="mt-4 space-y-3">
                  {selectedSubmissions.map((item) => (
                    <article key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h4 className="text-base font-semibold text-slate-900">
                            {formatValue(item.studentName, "Student")}
                          </h4>
                          <p className="mt-1 text-xs text-slate-500">
                            Submitted {formatEventDateTime(item.updatedAt || item.createdAt)}
                          </p>
                        </div>
                        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-700">
                          Submitted
                        </span>
                      </div>
                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        <p className="text-sm text-slate-700">Roll No: {formatValue(item.rollNo, "Not shared")}</p>
                        <p className="flex items-center gap-2 text-sm text-slate-700">
                          <MapPin className="h-4 w-4 text-slate-500" />
                          {formatValue(item.department, "Department not shared")}
                        </p>
                        <p className="flex items-center gap-2 text-sm text-slate-700">
                          <Mail className="h-4 w-4 text-slate-500" />
                          {formatValue(item.studentEmail, "Email not shared")}
                        </p>
                        <p className="flex items-center gap-2 text-sm text-slate-700">
                          <Phone className="h-4 w-4 text-slate-500" />
                          {formatValue(item.phone, "Phone not shared")}
                        </p>
                      </div>
                      {item.year ? (
                        <p className="mt-3 text-sm text-slate-700">Year: {item.year}</p>
                      ) : null}
                      {item.note ? (
                        <div className="mt-3 rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700">
                          {item.note}
                        </div>
                      ) : null}
                      {selectedEventQuestions.filter((question) => question.type !== "section").length ? (
                        <div className="mt-4 space-y-3 rounded-2xl border border-slate-200 bg-white px-3 py-3">
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                            Event Form Answers
                          </p>
                          {selectedEventQuestions.map((question) => {
                            if (question.type === "section") {
                              return question.title ? (
                                <div key={question.id} className="rounded-xl bg-slate-50 px-3 py-2">
                                  <p className="text-sm font-semibold text-slate-900">
                                    {question.title}
                                  </p>
                                  {question.description ? (
                                    <p className="mt-1 text-xs text-slate-500">
                                      {question.description}
                                    </p>
                                  ) : null}
                                </div>
                              ) : null;
                            }

                            const answer = formatAnswerValue(
                              question,
                              item.responses?.[question.id]
                            );

                            if (!answer) return null;

                            return (
                              <div key={question.id} className="rounded-xl bg-slate-50 px-3 py-3">
                                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                                  {question.title}
                                </p>
                                <p className="mt-1 text-sm text-slate-700">{answer}</p>
                              </div>
                            );
                          })}
                        </div>
                      ) : null}
                    </article>
                  ))}
                  {!submissionsLoading && selectedSubmissions.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-500">
                      No students have submitted this event form yet.
                    </div>
                  ) : null}
                </div>
              </article>
            </>
          ) : (
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="text-xl font-semibold text-slate-900">Select An Event</h3>
              <p className="mt-2 text-sm text-slate-600">
                Pick an event from the left to review details and submissions.
              </p>
            </section>
          )}
        </section>
      </div>

      {createModalOpen ? (
        <div className="forms-modal">
          <button type="button" className="forms-modal__scrim" onClick={closeCreateModal} />
          <div className="forms-modal__panel">
            <button type="button" onClick={closeCreateModal} className="forms-modal__close">
              <X className="h-5 w-5" />
            </button>

            <form onSubmit={handleCreateEvent}>
              <div className="forms-modal__hero">
                <p className="forms-modal__eyebrow">New Event</p>
                <h3 className="forms-modal__title">Create Event</h3>
                <p className="forms-modal__subtitle">
                  Build the event in a clean form-builder style so students get a clear,
                  polished registration experience from campus services.
                </p>
                <div className="forms-modal__meta">
                  <span className="forms-modal__meta-chip">
                    <CalendarDays className="h-4 w-4" />
                    Event schedule
                  </span>
                  <span className="forms-modal__meta-chip">
                    <MapPin className="h-4 w-4" />
                    Venue and details
                  </span>
                  <span className="forms-modal__meta-chip">Image up to 5 MB</span>
                </div>
              </div>

              <div className="forms-modal__body">
                <div className="forms-modal__intro">
                  <p className="forms-modal__intro-title">What this creates</p>
                  <p className="forms-modal__intro-copy">
                    This event becomes the card students open, register from, and staff
                    review submissions against. Student identity questions are included
                    automatically, and you can add Microsoft Forms-style event questions
                    below.
                  </p>
                </div>

                <FormsQuestionCard
                  label="Event title"
                  help="Use the name students and staff will recognize right away."
                  required
                >
                  <input
                    value={form.title}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, title: event.target.value }))
                    }
                    className="forms-modal__input"
                    placeholder="Annual Innovation Expo 2026"
                  />
                </FormsQuestionCard>

                <div className="forms-modal__grid forms-modal__grid--two">
                  <FormsQuestionCard
                    label="Event date and time"
                    help="Choose when the event starts."
                    required
                  >
                    <input
                      type="datetime-local"
                      value={form.eventDate}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, eventDate: event.target.value }))
                      }
                      className="forms-modal__input"
                    />
                  </FormsQuestionCard>

                  <FormsQuestionCard
                    label="Registration deadline"
                    help="Optional, but useful when the last date is earlier than the event."
                  >
                    <input
                      type="datetime-local"
                      value={form.registrationDeadline}
                      onChange={(event) =>
                        setForm((prev) => ({
                          ...prev,
                          registrationDeadline: event.target.value,
                        }))
                      }
                      className="forms-modal__input"
                    />
                  </FormsQuestionCard>
                </div>

                <FormsQuestionCard
                  label="Venue"
                  help="Mention the hall, lab, auditorium, or online location."
                >
                  <input
                    value={form.venue}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, venue: event.target.value }))
                    }
                    className="forms-modal__input"
                    placeholder="Main Seminar Hall"
                  />
                </FormsQuestionCard>

                <FormsQuestionCard
                  label="Description"
                  help="Share the key event purpose, who should join, and anything students should prepare."
                >
                  <textarea
                    rows={5}
                    value={form.description}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, description: event.target.value }))
                    }
                    className="forms-modal__textarea"
                    placeholder="Add the event overview, agenda highlights, participation details, and anything important before registration."
                  />
                </FormsQuestionCard>

                <FormsQuestionCard
                  label="Event image"
                  help="Upload a banner or poster image. PNG, JPG, and WEBP are supported."
                  required
                >
                  <label
                    className={`forms-modal__upload flex cursor-pointer flex-col items-center justify-center${
                      imagePreparing ? " opacity-80" : ""
                    }`}
                  >
                    <p className="forms-modal__upload-title">
                      {form.imageName || "Choose event image"}
                    </p>
                    <p className="forms-modal__upload-help">
                      {eventImageHelpCopy}
                    </p>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(event) => handleImagePick(event.target.files?.[0] || null)}
                    />
                  </label>
                </FormsQuestionCard>

                <section className="event-builder">
                  <div className="event-builder__header">
                    <div>
                      <p className="event-builder__kicker">Event Registration Form</p>
                      <h4 className="event-builder__title">Insert new question</h4>
                      <p className="event-builder__copy">
                        These questions appear after the student identity details in the
                        registration modal.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setQuestionPickerOpen(true)}
                      className="event-builder__insert"
                    >
                      <Plus className="h-5 w-5" />
                      Insert new question
                    </button>
                  </div>

                  <div className="event-builder__system-note">
                    Default questions already included:
                    <span className="event-builder__system-pill">Name</span>
                    <span className="event-builder__system-pill">Email</span>
                    <span className="event-builder__system-pill">Roll number</span>
                    <span className="event-builder__system-pill">Department</span>
                    <span className="event-builder__system-pill">Year</span>
                    <span className="event-builder__system-pill">Phone</span>
                  </div>

                  {form.questions.length ? (
                    <div className="event-builder__list">
                      {form.questions.map((question, index) => (
                        <RegistrationQuestionEditor
                          key={question.id}
                          question={question}
                          index={index}
                          onChange={updateQuestion}
                          onRemove={removeQuestion}
                          onAddOption={addChoiceOption}
                          onOptionChange={updateChoiceOption}
                          onOptionRemove={removeChoiceOption}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="event-builder__empty">
                      <p className="event-builder__empty-title">No extra event questions yet</p>
                      <p className="event-builder__empty-copy">
                        Add text, choice, rating, date, or section blocks to make the
                        registration feel like Microsoft Forms.
                      </p>
                    </div>
                  )}
                </section>

                {createStatus ? (
                  <p className="rounded-[1.35rem] border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-700">
                    {createStatus}
                  </p>
                ) : null}
              </div>

              <div className="forms-modal__footer">
                <button
                  type="button"
                  onClick={closeCreateModal}
                  disabled={savingEvent || imagePreparing}
                  className="forms-modal__button forms-modal__button--secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEvent || imagePreparing}
                  className="forms-modal__button forms-modal__button--primary"
                >
                  {createButtonLabel}
                </button>
              </div>
            </form>

            {questionPickerOpen ? (
              <div className="event-builder-picker">
                <button
                  type="button"
                  className="event-builder-picker__scrim"
                  onClick={() => setQuestionPickerOpen(false)}
                />
                <div className="event-builder-picker__panel">
                  <div className="event-builder-picker__head">
                    <div>
                      <p className="event-builder__kicker">Microsoft Forms Style</p>
                      <h4 className="event-builder__title">Add new question</h4>
                    </div>
                    <button
                      type="button"
                      onClick={() => setQuestionPickerOpen(false)}
                      className="forms-modal__close"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>

                  <div className="event-builder-picker__grid">
                    {EVENT_FORM_QUESTION_TYPES.map((option) => (
                      <QuestionTypeButton key={option.type} option={option} onPick={addQuestion} />
                    ))}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {removeTarget ? (
        <div className="forms-modal">
          <button
            type="button"
            className="forms-modal__scrim"
            onClick={() => {
              if (!removingEvent) setRemoveTarget(null);
            }}
          />
          <div className="forms-modal__panel" style={{ width: "min(100%, 560px)" }}>
            <button
              type="button"
              onClick={() => {
                if (!removingEvent) setRemoveTarget(null);
              }}
              className="forms-modal__close"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="forms-modal__hero">
              <p className="forms-modal__eyebrow">Remove Event</p>
              <h3 className="forms-modal__title">Delete This Event?</h3>
              <p className="forms-modal__subtitle">
                This action removes the event card and every related student submission from
                the event console.
              </p>
            </div>

            <div className="forms-modal__body">
              <FormsQuestionCard
                label={removeTarget.title || "Selected event"}
                help="This delete action cannot be undone after it finishes."
                neutral
              >
                <p className="mt-4 text-sm text-slate-700">
                  All registrations linked to this event will also be deleted for admin and
                  staff views.
                </p>
              </FormsQuestionCard>
            </div>

            <div className="forms-modal__footer">
              <button
                type="button"
                onClick={() => setRemoveTarget(null)}
                disabled={removingEvent}
                className="forms-modal__button forms-modal__button--secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRemoveEvent}
                disabled={removingEvent}
                className="forms-modal__button rounded-full border border-rose-600 bg-rose-600 text-white transition hover:bg-rose-700 disabled:opacity-65"
              >
                {removingEvent ? "Removing..." : "Remove Event"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
