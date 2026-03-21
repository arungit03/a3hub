import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  Clock3,
  Mail,
  MapPin,
  Phone,
  Send,
  Users,
  X,
} from "lucide-react";
import {
  collection,
  doc,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import Card from "../components/Card";
import GradientHeader from "../components/GradientHeader";
import { RemoteImage } from "../components/RemoteImage";
import { buildStudentDetails } from "../features/menuGrid/menuGridHelpers.js";
import {
  formatEventDate,
  formatEventDateTime,
  getEventImageUrl,
  getEventStatusMeta,
  getEventSubmissionId,
  isRegistrationClosed,
  normalizeEventQuestions,
  sortEvents,
  toMillis,
} from "../lib/events";
import { db } from "../lib/firebase";
import { useAuth } from "../state/auth";

const toSafeText = (value) => String(value || "").trim();

const pickFirstText = (...values) => {
  for (const value of values) {
    const normalized = toSafeText(value);
    if (normalized) return normalized;
  }
  return "";
};

const formatValue = (value, fallback = "-") => {
  const normalized = toSafeText(value);
  return normalized || fallback;
};

const getSubmissionTime = (submission) =>
  formatEventDateTime(submission?.updatedAt || submission?.createdAt);

const buildDefaultStudentForm = ({ profile, user }) => {
  const details = buildStudentDetails(profile || {});

  return {
    name: pickFirstText(profile?.name, user?.displayName),
    email: pickFirstText(user?.email, details.email, profile?.email),
    rollNo: details.rollNo,
    department: pickFirstText(profile?.department, details.department),
    year: pickFirstText(profile?.year, profile?.currentYear, profile?.semester),
    phone: pickFirstText(
      details.studentMobile,
      profile?.studentMobile,
      profile?.mobile,
      profile?.phone
    ),
    note: "",
    responses: {},
  };
};

const normalizeEvent = (docItem) => ({
  id: docItem.id,
  ...docItem.data(),
});

const normalizeSubmission = (docItem) => ({
  id: docItem.id,
  ...docItem.data(),
});

function MicrosoftQuestion({ number, label, required = false, hint, children }) {
  return (
    <section className="ms-form-question">
      <div className="ms-form-question__head">
        <h4 className="ms-form-question__title">
          {number}. {label}
          {required ? <span className="ms-form-question__required"> *</span> : null}
        </h4>
        {hint ? <p className="ms-form-question__hint">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}

const getResponseMap = (submission) =>
  submission && submission.responses && typeof submission.responses === "object"
    ? submission.responses
    : {};

const formatDynamicAnswer = (question, value) => {
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

export default function EventsPage({ forcedRole }) {
  const { role: contextRole, profile, user } = useAuth();
  const role = forcedRole || contextRole || "student";
  const isStudent = role === "student";
  const isStaff = role === "staff";

  const [events, setEvents] = useState([]);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [eventsError, setEventsError] = useState("");
  const [selectedEventId, setSelectedEventId] = useState("");

  const [studentSubmissions, setStudentSubmissions] = useState([]);
  const [loadingStudentSubmissions, setLoadingStudentSubmissions] = useState(false);
  const [staffSubmissions, setStaffSubmissions] = useState([]);
  const [loadingStaffSubmissions, setLoadingStaffSubmissions] = useState(false);
  const [submissionsError, setSubmissionsError] = useState("");

  const [form, setForm] = useState(() =>
    buildDefaultStudentForm({ profile, user })
  );
  const [registrationModalOpen, setRegistrationModalOpen] = useState(false);
  const [submitStatus, setSubmitStatus] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const eventsQuery = query(collection(db, "events"), limit(300));

    const unsubscribe = onSnapshot(
      eventsQuery,
      (snapshot) => {
        const nextEvents = sortEvents(snapshot.docs.map(normalizeEvent));
        setEvents(nextEvents);
        setLoadingEvents(false);
        setEventsError("");
        setSelectedEventId((previous) => {
          if (previous && nextEvents.some((item) => item.id === previous)) {
            return previous;
          }
          return nextEvents[0]?.id || "";
        });
      },
      () => {
        setEvents([]);
        setLoadingEvents(false);
        setEventsError("Unable to load events.");
        setSelectedEventId("");
      }
    );

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!isStudent || !user?.uid) {
      setStudentSubmissions([]);
      setLoadingStudentSubmissions(false);
      return undefined;
    }

    setLoadingStudentSubmissions(true);

    const submissionsQuery = query(
      collection(db, "eventSubmissions"),
      where("studentId", "==", user.uid),
      limit(400)
    );

    const unsubscribe = onSnapshot(
      submissionsQuery,
      (snapshot) => {
        setStudentSubmissions(snapshot.docs.map(normalizeSubmission));
        setLoadingStudentSubmissions(false);
        setSubmissionsError("");
      },
      () => {
        setStudentSubmissions([]);
        setLoadingStudentSubmissions(false);
        setSubmissionsError("Unable to load your submissions.");
      }
    );

    return () => unsubscribe();
  }, [isStudent, user?.uid]);

  useEffect(() => {
    if (!isStaff || !selectedEventId) {
      setStaffSubmissions([]);
      setLoadingStaffSubmissions(false);
      return undefined;
    }

    setLoadingStaffSubmissions(true);

    const submissionsQuery = query(
      collection(db, "eventSubmissions"),
      where("eventId", "==", selectedEventId),
      limit(600)
    );

    const unsubscribe = onSnapshot(
      submissionsQuery,
      (snapshot) => {
        const nextSubmissions = snapshot.docs
          .map(normalizeSubmission)
          .sort((a, b) => {
            const aMillis = toMillis(a?.updatedAt || a?.createdAt);
            const bMillis = toMillis(b?.updatedAt || b?.createdAt);
            return bMillis - aMillis;
          });
        setStaffSubmissions(nextSubmissions);
        setLoadingStaffSubmissions(false);
        setSubmissionsError("");
      },
      () => {
        setStaffSubmissions([]);
        setLoadingStaffSubmissions(false);
        setSubmissionsError("Unable to load student submissions.");
      }
    );

    return () => unsubscribe();
  }, [isStaff, selectedEventId]);

  const submissionsByEventId = useMemo(() => {
    const map = new Map();
    studentSubmissions.forEach((submission) => {
      const eventId = toSafeText(submission?.eventId);
      if (!eventId) return;
      map.set(eventId, submission);
    });
    return map;
  }, [studentSubmissions]);

  const selectedEvent = useMemo(
    () => events.find((item) => item.id === selectedEventId) || null,
    [events, selectedEventId]
  );

  const selectedSubmission = useMemo(
    () => submissionsByEventId.get(selectedEventId) || null,
    [selectedEventId, submissionsByEventId]
  );

  const selectedEventQuestions = useMemo(
    () => normalizeEventQuestions(selectedEvent?.registrationForm?.questions),
    [selectedEvent]
  );

  const selectedEventAnswerQuestions = useMemo(
    () => selectedEventQuestions.filter((question) => question.type !== "section"),
    [selectedEventQuestions]
  );

  useEffect(() => {
    if (!isStudent) return;
    const defaults = buildDefaultStudentForm({ profile, user });
    const responseDefaults = {};
    selectedEventQuestions.forEach((question) => {
      if (question.type !== "section") {
        responseDefaults[question.id] = "";
      }
    });

    if (selectedSubmission) {
      setForm({
        name: pickFirstText(selectedSubmission.studentName, defaults.name),
        email: pickFirstText(selectedSubmission.studentEmail, defaults.email),
        rollNo: pickFirstText(selectedSubmission.rollNo, defaults.rollNo),
        department: pickFirstText(selectedSubmission.department, defaults.department),
        year: pickFirstText(selectedSubmission.year, defaults.year),
        phone: pickFirstText(selectedSubmission.phone, defaults.phone),
        note: toSafeText(selectedSubmission.note),
        responses: {
          ...responseDefaults,
          ...getResponseMap(selectedSubmission),
        },
      });
      return;
    }

    setForm({
      ...defaults,
      responses: responseDefaults,
    });
  }, [isStudent, profile, selectedEventQuestions, selectedSubmission, user]);

  useEffect(() => {
    if (!isStudent || !selectedEvent) {
      setRegistrationModalOpen(false);
    }
  }, [isStudent, selectedEvent]);

  const registrationClosed = selectedEvent
    ? isRegistrationClosed(selectedEvent)
    : false;
  const selectedEventStatus = selectedEvent
    ? getEventStatusMeta(selectedEvent)
    : null;
  const canOpenRegistrationModal =
    Boolean(selectedEvent) && (!registrationClosed || Boolean(selectedSubmission));

  const closeRegistrationModal = () => {
    if (submitting) return;
    setRegistrationModalOpen(false);
  };

  const handleFieldChange = (field, value) => {
    setForm((previous) => ({
      ...previous,
      [field]: value,
    }));
    setSubmitStatus("");
  };

  const handleResponseChange = (questionId, value) => {
    setForm((previous) => ({
      ...previous,
      responses: {
        ...(previous.responses || {}),
        [questionId]: value,
      },
    }));
    setSubmitStatus("");
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!selectedEvent || !user?.uid) {
      setSubmitStatus("Choose an event first.");
      return;
    }
    if (registrationClosed) {
      setSubmitStatus("This event is closed for new submissions.");
      return;
    }

    const payload = {
      name: toSafeText(form.name),
      email: toSafeText(form.email),
      rollNo: toSafeText(form.rollNo),
      department: toSafeText(form.department),
      year: toSafeText(form.year),
      phone: toSafeText(form.phone),
      note: toSafeText(form.note),
      responses: selectedEventQuestions.reduce((accumulator, question) => {
        if (question.type === "section") return accumulator;
        accumulator[question.id] = toSafeText(form.responses?.[question.id]);
        return accumulator;
      }, {}),
    };

    if (!payload.name || !payload.email || !payload.rollNo || !payload.department) {
      setSubmitStatus(
        "Fill name, email, roll number, and department before submitting."
      );
      return;
    }

    for (const question of selectedEventQuestions) {
      if (question.type === "section" || !question.required) continue;
      if (!toSafeText(payload.responses[question.id])) {
        setSubmitStatus(`Answer "${question.title}" before submitting.`);
        return;
      }
    }

    const submissionId = getEventSubmissionId(selectedEvent.id, user.uid);
    const existingSubmission = submissionsByEventId.get(selectedEvent.id);

    setSubmitting(true);
    setSubmitStatus("");
    try {
      await setDoc(
        doc(db, "eventSubmissions", submissionId),
        {
          eventId: selectedEvent.id,
          eventTitle: selectedEvent.title || "Event",
          eventDate: selectedEvent.eventDate || null,
          studentId: user.uid,
          studentName: payload.name,
          studentEmail: payload.email,
          rollNo: payload.rollNo,
          department: payload.department,
          year: payload.year,
          phone: payload.phone,
          note: payload.note,
          responses: payload.responses,
          createdAt: existingSubmission?.createdAt || serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      setSubmitStatus(
        existingSubmission
          ? "Event submission updated and shared with admin."
          : "Event submission sent to admin."
      );
    } catch {
      setSubmitStatus("Unable to submit event form right now.");
    } finally {
      setSubmitting(false);
    }
  };

  const headerSummary = isStaff
    ? `${staffSubmissions.length} submitted student${
        staffSubmissions.length === 1 ? "" : "s"
      }`
    : `${studentSubmissions.length} event submission${
        studentSubmissions.length === 1 ? "" : "s"
      }`;

  return (
    <div className="space-y-6">
      <GradientHeader
        title="Event Center"
        subtitle={
          isStaff
            ? "Review active campus events and the students who already submitted."
            : "Browse campus events and send your registration details to admin."
        }
        rightSlot={
          <div className="rounded-2xl border border-white/35 bg-white/15 px-4 py-3 text-white shadow-lg shadow-slate-900/10 backdrop-blur">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/80">
              Snapshot
            </p>
            <p className="mt-1 text-xl font-semibold">{headerSummary}</p>
          </div>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
        <Card className="p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink/65">
                Campus Services
              </p>
              <h2 className="mt-1 text-xl font-semibold text-ink">Events</h2>
            </div>
            <span className="rounded-full border border-ocean/15 bg-white px-3 py-1 text-xs font-semibold text-ink/70">
              {events.length}
            </span>
          </div>

          {loadingEvents ? (
            <p className="mt-4 text-sm text-ink/70">Loading events...</p>
          ) : null}
          {eventsError ? (
            <p className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {eventsError}
            </p>
          ) : null}

          <div className="mt-4 space-y-3">
            {events.map((item) => {
              const isSelected = item.id === selectedEventId;
              const statusMeta = getEventStatusMeta(item);
              const studentSubmission = submissionsByEventId.get(item.id);

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedEventId(item.id)}
                  className={`w-full rounded-2xl border p-3 text-left transition ${
                    isSelected
                      ? "border-ocean/45 bg-ocean/5 shadow-sm"
                      : "border-clay/20 bg-white hover:border-ocean/25 hover:bg-ocean/5"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="h-16 w-16 overflow-hidden rounded-2xl border border-clay/15 bg-sand/45">
                      <RemoteImage
                        src={getEventImageUrl(item)}
                        alt={item.title || "Event"}
                        className="h-full w-full object-cover"
                        fallbackClassName="flex h-full w-full items-center justify-center bg-gradient-to-br from-ocean/10 via-white to-aurora/15 text-sm font-semibold text-ink/65"
                        fallbackLabel={item.title || "Event"}
                      />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-semibold text-ink">
                          {item.title || "Campus Event"}
                        </p>
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusMeta.chipClass}`}
                        >
                          {statusMeta.label}
                        </span>
                        {isStudent && studentSubmission ? (
                          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                            Submitted
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-xs text-ink/65">
                        {formatEventDate(item.eventDate)}
                      </p>
                      <p className="mt-1 truncate text-xs text-ink/70">
                        {formatValue(item.venue, "Venue will be shared soon")}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}

            {!loadingEvents && events.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-clay/30 bg-sand/35 px-4 py-5 text-sm text-ink/70">
                No events available right now.
              </div>
            ) : null}
          </div>
        </Card>

        <div className="space-y-6">
          {selectedEvent ? (
            <>
              <Card className="overflow-hidden p-0">
                <div className="grid gap-0 lg:grid-cols-[320px_minmax(0,1fr)]">
                  <div className="min-h-[220px] bg-sand/50">
                    <RemoteImage
                      src={getEventImageUrl(selectedEvent)}
                      alt={selectedEvent.title || "Event"}
                      className="h-full w-full object-cover"
                      fallbackClassName="flex h-full min-h-[220px] w-full items-center justify-center bg-gradient-to-br from-ocean/15 via-white to-aurora/20 text-3xl font-semibold text-ink/60"
                      fallbackLabel={selectedEvent.title || "Event"}
                    />
                  </div>

                  <div className="p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink/60">
                          Event Details
                        </p>
                        <h2 className="mt-1 text-2xl font-semibold text-ink">
                          {selectedEvent.title || "Campus Event"}
                        </h2>
                      </div>
                      {selectedEventStatus ? (
                        <span
                          className={`rounded-full border px-3 py-1 text-xs font-semibold ${selectedEventStatus.chipClass}`}
                        >
                          {selectedEventStatus.label}
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-2xl border border-clay/20 bg-sand/35 px-4 py-3">
                        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-ink/55">
                          <CalendarDays className="h-4 w-4" />
                          Event Date
                        </p>
                        <p className="mt-2 text-sm font-semibold text-ink">
                          {formatEventDateTime(selectedEvent.eventDate)}
                        </p>
                      </div>

                      <div className="rounded-2xl border border-clay/20 bg-sand/35 px-4 py-3">
                        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-ink/55">
                          <Clock3 className="h-4 w-4" />
                          Registration Deadline
                        </p>
                        <p className="mt-2 text-sm font-semibold text-ink">
                          {selectedEvent.registrationDeadline
                            ? formatEventDateTime(selectedEvent.registrationDeadline)
                            : "Follows event schedule"}
                        </p>
                      </div>

                      <div className="rounded-2xl border border-clay/20 bg-sand/35 px-4 py-3 sm:col-span-2">
                        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-ink/55">
                          <MapPin className="h-4 w-4" />
                          Venue
                        </p>
                        <p className="mt-2 text-sm font-semibold text-ink">
                          {formatValue(selectedEvent.venue, "Venue will be announced soon")}
                        </p>
                      </div>
                    </div>

                    {selectedEvent.description ? (
                      <div className="mt-4 rounded-2xl border border-clay/20 bg-white px-4 py-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink/60">
                          About This Event
                        </p>
                        <p className="mt-2 whitespace-pre-wrap text-sm text-ink/80">
                          {selectedEvent.description}
                        </p>
                      </div>
                    ) : null}
                  </div>
                </div>
              </Card>

              {isStudent ? (
                <Card className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink/60">
                        Student Form
                      </p>
                      <h3 className="mt-1 text-xl font-semibold text-ink">
                        Event Registration
                      </h3>
                    </div>
                    {selectedSubmission ? (
                      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                        Submitted {getSubmissionTime(selectedSubmission)}
                      </span>
                    ) : null}
                  </div>

                  {loadingStudentSubmissions ? (
                    <p className="mt-4 text-sm text-ink/70">Loading your submissions...</p>
                  ) : null}

                  <div className="mt-4 rounded-[1.6rem] border border-clay/20 bg-sand/35 p-4">
                    <p className="text-sm text-ink/75">
                      Open the registration modal to fill your event form in the new
                      Microsoft Forms-style layout. Your response goes to admin and is also
                      visible in staff review.
                    </p>
                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                      <div className="rounded-2xl border border-clay/20 bg-white px-4 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink/55">
                          Event
                        </p>
                        <p className="mt-2 text-sm font-semibold text-ink">
                          {selectedEvent.title || "Campus Event"}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-clay/20 bg-white px-4 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink/55">
                          Deadline
                        </p>
                        <p className="mt-2 text-sm font-semibold text-ink">
                          {selectedEvent.registrationDeadline
                            ? formatEventDateTime(selectedEvent.registrationDeadline)
                            : "Open until event starts"}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-clay/20 bg-white px-4 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink/55">
                          Status
                        </p>
                        <p className="mt-2 text-sm font-semibold text-ink">
                          {selectedSubmission
                            ? "Already submitted"
                            : registrationClosed
                            ? "Registration closed"
                            : "Ready to submit"}
                        </p>
                      </div>
                    </div>
                  </div>

                  {submitStatus ? (
                    <p className="mt-4 rounded-2xl border border-clay/20 bg-white px-4 py-3 text-sm font-medium text-ink/80">
                      {submitStatus}
                    </p>
                  ) : null}
                  {submissionsError ? (
                    <p className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
                      {submissionsError}
                    </p>
                  ) : null}
                  {registrationClosed && !selectedSubmission ? (
                    <p className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
                      Registration is closed for this event.
                    </p>
                  ) : null}

                  <div className="mt-5 flex justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        setSubmitStatus("");
                        setRegistrationModalOpen(true);
                      }}
                      disabled={!canOpenRegistrationModal || loadingStudentSubmissions}
                      className="inline-flex items-center gap-2 rounded-full bg-[linear-gradient(135deg,rgb(var(--ocean))_0%,rgb(var(--aurora))_100%)] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_16px_28px_-18px_rgb(var(--cocoa)_/_0.45)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-65"
                    >
                      <Send className="h-4 w-4" />
                      {selectedSubmission
                        ? registrationClosed
                          ? "View Submitted Form"
                          : "Review / Update Form"
                        : registrationClosed
                        ? "Registration Closed"
                        : "Open Registration Form"}
                    </button>
                  </div>
                </Card>
              ) : null}

              {isStaff ? (
                <Card className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink/60">
                        Staff View
                      </p>
                      <h3 className="mt-1 text-xl font-semibold text-ink">
                        Submitted Students
                      </h3>
                    </div>
                    <span className="rounded-full border border-ocean/15 bg-ocean/5 px-3 py-1 text-xs font-semibold text-ink/75">
                      {staffSubmissions.length} student
                      {staffSubmissions.length === 1 ? "" : "s"}
                    </span>
                  </div>

                  {loadingStaffSubmissions ? (
                    <p className="mt-4 text-sm text-ink/70">Loading submissions...</p>
                  ) : null}
                  {submissionsError ? (
                    <p className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                      {submissionsError}
                    </p>
                  ) : null}

                  <div className="mt-4 space-y-3">
                    {staffSubmissions.map((submission) => (
                      <article
                        key={submission.id}
                        className="rounded-2xl border border-clay/20 bg-white px-4 py-4"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <h4 className="text-base font-semibold text-ink">
                              {formatValue(submission.studentName, "Student")}
                            </h4>
                            <p className="mt-1 text-xs text-ink/65">
                              Submitted {getSubmissionTime(submission)}
                            </p>
                          </div>
                          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-700">
                            Submitted
                          </span>
                        </div>

                        <div className="mt-4 grid gap-3 sm:grid-cols-2">
                          <p className="flex items-center gap-2 text-sm text-ink/78">
                            <Users className="h-4 w-4 text-ink/55" />
                            {formatValue(submission.rollNo, "Roll not shared")}
                          </p>
                          <p className="flex items-center gap-2 text-sm text-ink/78">
                            <MapPin className="h-4 w-4 text-ink/55" />
                            {formatValue(submission.department, "Department not shared")}
                          </p>
                          <p className="flex items-center gap-2 text-sm text-ink/78">
                            <Mail className="h-4 w-4 text-ink/55" />
                            {formatValue(submission.studentEmail, "Email not shared")}
                          </p>
                          <p className="flex items-center gap-2 text-sm text-ink/78">
                            <Phone className="h-4 w-4 text-ink/55" />
                            {formatValue(submission.phone, "Phone not shared")}
                          </p>
                        </div>

                        {submission.year ? (
                          <p className="mt-3 text-sm text-ink/78">
                            <span className="font-semibold text-ink">Year:</span>{" "}
                            {submission.year}
                          </p>
                        ) : null}

                        {submission.note ? (
                          <div className="mt-3 rounded-2xl border border-clay/15 bg-sand/35 px-3 py-3">
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink/55">
                              Student Note
                            </p>
                            <p className="mt-2 whitespace-pre-wrap text-sm text-ink/78">
                              {submission.note}
                            </p>
                          </div>
                        ) : null}

                        {selectedEventAnswerQuestions.length ? (
                          <div className="mt-3 rounded-2xl border border-clay/15 bg-sand/20 px-3 py-3">
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink/55">
                              Event Form Answers
                            </p>
                            <div className="mt-3 space-y-2">
                              {selectedEventQuestions.map((question) => {
                                if (question.type === "section") {
                                  return question.title ? (
                                    <div key={question.id} className="rounded-xl bg-white px-3 py-2">
                                      <p className="text-sm font-semibold text-ink">
                                        {question.title}
                                      </p>
                                      {question.description ? (
                                        <p className="mt-1 text-xs text-ink/65">
                                          {question.description}
                                        </p>
                                      ) : null}
                                    </div>
                                  ) : null;
                                }

                                const answer = formatDynamicAnswer(
                                  question,
                                  submission.responses?.[question.id]
                                );

                                if (!answer) return null;

                                return (
                                  <div key={question.id} className="rounded-xl bg-white px-3 py-3">
                                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ink/55">
                                      {question.title}
                                    </p>
                                    <p className="mt-1 text-sm text-ink/78">{answer}</p>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ) : null}
                      </article>
                    ))}

                    {!loadingStaffSubmissions && staffSubmissions.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-clay/30 bg-sand/35 px-4 py-5 text-sm text-ink/70">
                        No student submissions for this event yet.
                      </div>
                    ) : null}
                  </div>
                </Card>
              ) : null}
            </>
          ) : (
            <Card className="p-6">
              <h2 className="text-xl font-semibold text-ink">No Event Selected</h2>
              <p className="mt-2 text-sm text-ink/75">
                Choose an event from the left to view details.
              </p>
            </Card>
          )}
        </div>
      </div>

      {isStudent && registrationModalOpen && selectedEvent ? (
        <div className="forms-modal">
          <button
            type="button"
            className="forms-modal__scrim"
            onClick={closeRegistrationModal}
          />
          <div className="ms-form-modal__panel">
            <button
              type="button"
              onClick={closeRegistrationModal}
              className="forms-modal__close"
            >
              <X className="h-5 w-5" />
            </button>

            <form onSubmit={handleSubmit}>
              <div className="ms-form-modal__header">
                <p className="ms-form-modal__eyebrow">Event Registration</p>
                <h3 className="ms-form-modal__title">
                  {selectedEvent.title || "Campus Event"}
                </h3>
                <p className="ms-form-modal__subtitle">
                  {formatEventDateTime(selectedEvent.eventDate)}
                  {selectedEvent.venue
                    ? ` | ${formatValue(selectedEvent.venue, "Venue will be shared soon")}`
                    : ""}
                </p>
              </div>

              <div className="ms-form-modal__body">
                <div className="ms-form-modal__note">
                  This response is submitted to admin and staff can review the same student
                  list for this event.
                </div>

                {selectedSubmission ? (
                  <p className="ms-form-modal__notice">
                    Your previous response is loaded here. Last updated{" "}
                    {getSubmissionTime(selectedSubmission)}.
                  </p>
                ) : null}

                <MicrosoftQuestion
                  number="1"
                  label="Your name"
                  required
                  hint="Enter the name admin should see."
                >
                  <input
                    type="text"
                    value={form.name}
                    onChange={(event) => handleFieldChange("name", event.target.value)}
                    className="ms-form-question__input"
                    placeholder="Enter your answer"
                  />
                </MicrosoftQuestion>

                <MicrosoftQuestion
                  number="2"
                  label="Your email"
                  required
                  hint="Use the email where event updates can reach you."
                >
                  <input
                    type="email"
                    value={form.email}
                    onChange={(event) => handleFieldChange("email", event.target.value)}
                    className="ms-form-question__input"
                    placeholder="Enter your answer"
                  />
                </MicrosoftQuestion>

                <MicrosoftQuestion
                  number="3"
                  label="Your roll number"
                  required
                  hint="This helps staff identify your submission."
                >
                  <input
                    type="text"
                    value={form.rollNo}
                    onChange={(event) => handleFieldChange("rollNo", event.target.value)}
                    className="ms-form-question__input"
                    placeholder="Enter your answer"
                  />
                </MicrosoftQuestion>

                <MicrosoftQuestion
                  number="4"
                  label="Your department"
                  required
                  hint="Mention your course, branch, or department."
                >
                  <input
                    type="text"
                    value={form.department}
                    onChange={(event) => handleFieldChange("department", event.target.value)}
                    className="ms-form-question__input"
                    placeholder="Enter your answer"
                  />
                </MicrosoftQuestion>

                <MicrosoftQuestion
                  number="5"
                  label="Your year or semester"
                  hint="Optional, but useful for planning and attendance."
                >
                  <input
                    type="text"
                    value={form.year}
                    onChange={(event) => handleFieldChange("year", event.target.value)}
                    className="ms-form-question__input"
                    placeholder="Enter your answer"
                  />
                </MicrosoftQuestion>

                <MicrosoftQuestion
                  number="6"
                  label="Your phone number"
                  hint="Optional, for quick event communication if needed."
                >
                  <input
                    type="text"
                    value={form.phone}
                    onChange={(event) => handleFieldChange("phone", event.target.value)}
                    className="ms-form-question__input"
                    placeholder="Enter your answer"
                  />
                </MicrosoftQuestion>

                <MicrosoftQuestion
                  number="7"
                  label="Message to admin"
                  hint="Add interest, teammate details, or anything important about this registration."
                >
                  <textarea
                    rows={5}
                    value={form.note}
                    onChange={(event) => handleFieldChange("note", event.target.value)}
                    className="ms-form-question__textarea"
                    placeholder="Enter your answer"
                  />
                </MicrosoftQuestion>

                {selectedEventQuestions.length ? (
                  <div className="ms-form-section">
                    <p className="ms-form-section__eyebrow">Event questions</p>
                    <h4 className="ms-form-section__title">
                      Questions created for this event
                    </h4>
                  </div>
                ) : null}

                {selectedEventQuestions.map((question, index) => {
                  if (question.type === "section") {
                    return (
                      <section key={question.id} className="ms-form-section">
                        <p className="ms-form-section__eyebrow">Section</p>
                        <h4 className="ms-form-section__title">{question.title}</h4>
                        {question.description ? (
                          <p className="ms-form-section__copy">{question.description}</p>
                        ) : null}
                      </section>
                    );
                  }

                  const answerNumber =
                    8 +
                    selectedEventQuestions
                      .slice(0, index)
                      .filter((item) => item.type !== "section").length;
                  const currentValue = toSafeText(form.responses?.[question.id]);

                  if (question.type === "choice") {
                    const usingOther =
                      question.allowOther &&
                      currentValue &&
                      !question.options.includes(currentValue);

                    return (
                      <MicrosoftQuestion
                        key={question.id}
                        number={String(answerNumber)}
                        label={question.title}
                        required={question.required}
                      >
                        <div className="ms-form-choice-list">
                          {question.options.map((option) => (
                            <label key={`${question.id}_${option}`} className="ms-form-choice-row">
                              <input
                                type="radio"
                                name={question.id}
                                checked={currentValue === option}
                                onChange={() => handleResponseChange(question.id, option)}
                              />
                              <span>{option}</span>
                            </label>
                          ))}
                          {question.allowOther ? (
                            <label className="ms-form-choice-row ms-form-choice-row--other">
                              <input
                                type="radio"
                                name={question.id}
                                checked={usingOther}
                                onChange={() => handleResponseChange(question.id, currentValue)}
                              />
                              <input
                                type="text"
                                value={usingOther ? currentValue : ""}
                                onFocus={() => {
                                  if (!usingOther) handleResponseChange(question.id, "");
                                }}
                                onChange={(event) =>
                                  handleResponseChange(question.id, event.target.value)
                                }
                                className="ms-form-choice-row__input"
                                placeholder="Other"
                              />
                            </label>
                          ) : null}
                        </div>
                      </MicrosoftQuestion>
                    );
                  }

                  if (question.type === "date") {
                    return (
                      <MicrosoftQuestion
                        key={question.id}
                        number={String(answerNumber)}
                        label={question.title}
                        required={question.required}
                      >
                        <input
                          type="date"
                          value={currentValue}
                          onChange={(event) =>
                            handleResponseChange(question.id, event.target.value)
                          }
                          className="ms-form-question__input"
                        />
                      </MicrosoftQuestion>
                    );
                  }

                  if (question.type === "rating") {
                    const scale = Number(question.scale) || 5;
                    return (
                      <MicrosoftQuestion
                        key={question.id}
                        number={String(answerNumber)}
                        label={question.title}
                        required={question.required}
                      >
                        <div className="ms-form-rating">
                          {Array.from({ length: scale }, (_, ratingIndex) => {
                            const value = String(ratingIndex + 1);
                            return (
                              <label key={`${question.id}_${value}`} className="ms-form-rating__option">
                                <input
                                  type="radio"
                                  name={question.id}
                                  checked={currentValue === value}
                                  onChange={() => handleResponseChange(question.id, value)}
                                />
                                <span>{value}</span>
                              </label>
                            );
                          })}
                        </div>
                      </MicrosoftQuestion>
                    );
                  }

                  return (
                    <MicrosoftQuestion
                      key={question.id}
                      number={String(answerNumber)}
                      label={question.title}
                      required={question.required}
                    >
                      {question.multiline ? (
                        <textarea
                          rows={5}
                          value={currentValue}
                          onChange={(event) =>
                            handleResponseChange(question.id, event.target.value)
                          }
                          className="ms-form-question__textarea"
                          placeholder={question.placeholder || "Enter your answer"}
                        />
                      ) : (
                        <input
                          type="text"
                          value={currentValue}
                          onChange={(event) =>
                            handleResponseChange(question.id, event.target.value)
                          }
                          className="ms-form-question__input"
                          placeholder={question.placeholder || "Enter your answer"}
                        />
                      )}
                    </MicrosoftQuestion>
                  );
                })}

                {submitStatus ? (
                  <p className="ms-form-modal__notice">
                    {submitStatus}
                  </p>
                ) : null}
                {submissionsError ? (
                  <p className="ms-form-modal__notice ms-form-modal__notice--error">
                    {submissionsError}
                  </p>
                ) : null}
                {registrationClosed ? (
                  <p className="ms-form-modal__notice ms-form-modal__notice--error">
                    Registration is closed for this event. You can review your response, but
                    new changes cannot be submitted now.
                  </p>
                ) : null}
              </div>

              <div className="ms-form-modal__footer">
                <button
                  type="button"
                  onClick={closeRegistrationModal}
                  className="forms-modal__button forms-modal__button--secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || registrationClosed}
                  className="forms-modal__button forms-modal__button--primary"
                >
                  <Send className="h-4 w-4" />
                  {submitting
                    ? "Submitting..."
                    : registrationClosed
                    ? "Registration Closed"
                    : selectedSubmission
                    ? "Update Submission"
                    : "Submit To Admin"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
