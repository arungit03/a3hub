const toSafeText = (value) => String(value || "").trim();

export const EVENT_IMAGE_MAX_SIZE_BYTES = 5 * 1024 * 1024;

export const EVENT_FORM_QUESTION_TYPES = [
  { type: "choice", label: "Choice", supported: true },
  { type: "text", label: "Text", supported: true },
  { type: "rating", label: "Rating", supported: true },
  { type: "date", label: "Date", supported: true },
  { type: "ranking", label: "Ranking", supported: false },
  { type: "likert", label: "Likert", supported: false },
  { type: "upload", label: "Upload File", supported: false },
  { type: "nps", label: "Net Promoter Score", supported: false },
  { type: "section", label: "Section", supported: true },
];

const normalizeQuestionId = (value) => {
  const text = toSafeText(value);
  return text || `question_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
};

export const createEventQuestion = (type) => {
  const id = normalizeQuestionId("");

  if (type === "choice") {
    return {
      id,
      type: "choice",
      title: "",
      required: false,
      options: ["Option 1", "Option 2"],
      allowOther: false,
    };
  }

  if (type === "date") {
    return {
      id,
      type: "date",
      title: "",
      required: false,
    };
  }

  if (type === "rating") {
    return {
      id,
      type: "rating",
      title: "",
      required: false,
      scale: 5,
    };
  }

  if (type === "section") {
    return {
      id,
      type: "section",
      title: "",
      description: "",
    };
  }

  return {
    id,
    type: "text",
    title: "",
    required: false,
    placeholder: "Enter your answer",
    multiline: false,
  };
};

export const normalizeEventQuestions = (questions) =>
  (Array.isArray(questions) ? questions : [])
    .map((question) => {
      const type = toSafeText(question?.type).toLowerCase();
      const id = normalizeQuestionId(question?.id);
      const title = toSafeText(question?.title);

      if (type === "choice") {
        const options = (Array.isArray(question?.options) ? question.options : [])
          .map((option) => toSafeText(option))
          .filter(Boolean);

        return {
          id,
          type,
          title,
          required: Boolean(question?.required),
          options,
          allowOther: Boolean(question?.allowOther),
        };
      }

      if (type === "date") {
        return {
          id,
          type,
          title,
          required: Boolean(question?.required),
        };
      }

      if (type === "rating") {
        const scale = Number(question?.scale);
        return {
          id,
          type,
          title,
          required: Boolean(question?.required),
          scale: Number.isFinite(scale) && scale >= 3 && scale <= 10 ? Math.round(scale) : 5,
        };
      }

      if (type === "section") {
        return {
          id,
          type,
          title,
          description: toSafeText(question?.description),
        };
      }

      return {
        id,
        type: "text",
        title,
        required: Boolean(question?.required),
        placeholder: toSafeText(question?.placeholder) || "Enter your answer",
        multiline: Boolean(question?.multiline),
      };
    });

export const toMillis = (value) => {
  if (!value) return 0;
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = new Date(value);
  const millis = parsed.getTime();
  return Number.isNaN(millis) ? 0 : millis;
};

export const formatEventDate = (value) => {
  const millis = toMillis(value);
  if (!millis) return "Date not set";
  return new Date(millis).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
};

export const formatEventDateTime = (value) => {
  const millis = toMillis(value);
  if (!millis) return "Not scheduled";
  return new Date(millis).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

export const getEventImageUrl = (event) =>
  toSafeText(event?.image?.url || event?.imageUrl || event?.posterUrl);

export const getEventSubmissionId = (eventId, studentId) =>
  `${toSafeText(eventId)}_${toSafeText(studentId)}`;

export const isRegistrationClosed = (event) => {
  const deadlineMillis = toMillis(
    event?.registrationDeadline || event?.registrationClosesAt
  );
  if (deadlineMillis) return deadlineMillis < Date.now();
  const eventMillis = toMillis(event?.eventDate);
  if (eventMillis) return eventMillis < Date.now();
  return false;
};

export const getEventStatusMeta = (event) => {
  if (isRegistrationClosed(event)) {
    return {
      label: "Closed",
      chipClass: "border-rose-200 bg-rose-50 text-rose-700",
    };
  }

  return {
    label: "Open",
    chipClass: "border-emerald-200 bg-emerald-50 text-emerald-700",
  };
};

export const sortEvents = (events) =>
  [...(Array.isArray(events) ? events : [])].sort((a, b) => {
    const now = Date.now();
    const aMillis = toMillis(a?.eventDate) || toMillis(a?.createdAt);
    const bMillis = toMillis(b?.eventDate) || toMillis(b?.createdAt);
    const aPast = aMillis > 0 && aMillis < now;
    const bPast = bMillis > 0 && bMillis < now;

    if (aPast !== bPast) {
      return aPast ? 1 : -1;
    }

    if (aMillis !== bMillis) {
      if (!aMillis) return 1;
      if (!bMillis) return -1;
      return aMillis - bMillis;
    }

    return toMillis(b?.createdAt) - toMillis(a?.createdAt);
  });

export const validateEventImageFile = (file) => {
  const isFileLike =
    file &&
    typeof file === "object" &&
    typeof file.size === "number" &&
    typeof file.type === "string";

  if (!isFileLike) {
    throw new Error("Choose an event image first.");
  }

  if (!String(file.type || "").toLowerCase().startsWith("image/")) {
    throw new Error("Only image files are allowed.");
  }

  if (Number(file.size || 0) > EVENT_IMAGE_MAX_SIZE_BYTES) {
    throw new Error("Image must be 5 MB or smaller.");
  }
};

export const getEventImageUploadErrorMessage = (error) => {
  const code = String(error?.code || "").trim();

  if (code === "cloudinary/no-file") {
    return "Upload an event image.";
  }

  if (code === "cloudinary/network-error") {
    return "Network issue while uploading the event image.";
  }

  if (code === "storage/upload-timeout" || code === "storage/download-url-timeout") {
    return "Image upload took too long, so the event image was saved using the built-in fallback.";
  }

  if (code === "storage/unauthenticated") {
    return "Please sign in again before uploading the event image.";
  }

  if (code === "storage/unauthorized") {
    return "Image upload is blocked by Firebase Storage rules.";
  }

  if (
    code === "storage/bucket-not-found" ||
    code === "storage/project-not-found" ||
    code === "storage/bucket-not-configured"
  ) {
    return "Image upload is not configured yet. Enable Firebase Storage or Cloudinary.";
  }

  if (code === "storage/retry-limit-exceeded" || code === "storage/unknown") {
    return "Unable to upload the event image right now. Please try again.";
  }

  if (code === "upload/no-provider") {
    return "Image upload is unavailable right now. Configure Cloudinary or Firebase Storage.";
  }

  if (code === "upload/inline-too-large") {
    return "Image is too large to save right now. Choose a smaller image.";
  }

  return toSafeText(error?.message) || "Unable to upload the event image.";
};
