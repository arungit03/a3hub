import { collectIdentifierTokens } from "../../lib/qr.js";

export const formatDateLabel = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

export const formatDateTimeLabel = (value) => {
  if (!value) return "";
  const date = value?.toDate ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

export const FACE_MATCH_THRESHOLD = 0.74;
export const FACE_MATCH_MIN_MARGIN = 0.035;
export const FACE_MATCH_CONFIRMATION_COUNT = 2;
export const FACE_MATCH_CONFIRMATION_WINDOW_MS = 2600;
export const FACE_MATCH_COOLDOWN_MS = 4200;
export const FACE_MATCH_FAST_TRACK_THRESHOLD = 0.84;
export const FACE_MIN_VECTOR_LENGTH = 64;
export const FACE_REGISTRATION_REQUIRED_SAMPLE_COUNT = 3;
export const FACE_REGISTRATION_MIN_SAMPLE_SIMILARITY = 0.88;
export const FACE_REGISTRATION_DUPLICATE_SIMILARITY = 0.9995;
const OFFLINE_SCAN_QUEUE_KEY = "a3hub_attendance_scan_queue_v1";
const MAX_OFFLINE_SCAN_QUEUE_ITEMS = 240;
export const SCAN_QUEUE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
export const SCAN_QUEUE_TOKEN_PATTERN = /^[A-Za-z0-9:_-]{1,160}$/;
const RETRYABLE_SCAN_ERROR_CODES = new Set([
  "aborted",
  "cancelled",
  "deadline-exceeded",
  "internal",
  "resource-exhausted",
  "unavailable",
]);

export const normalizeFirestoreErrorCode = (value) =>
  String(value || "")
    .replace(/^firestore\//i, "")
    .trim()
    .toLowerCase();

export const isRetryableScanError = (code) =>
  RETRYABLE_SCAN_ERROR_CODES.has(normalizeFirestoreErrorCode(code));

export const getTimestampMillis = (value) => {
  if (value?.toMillis) return value.toMillis();
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.getTime() : 0;
};

const normalizeOfflineScanQueueItem = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const date = String(value.date || "").trim();
  const qrToken = String(value.qrToken || "").trim();
  const queuedAt = getTimestampMillis(value.queuedAt);

  if (!SCAN_QUEUE_DATE_PATTERN.test(date)) return null;
  if (!SCAN_QUEUE_TOKEN_PATTERN.test(qrToken)) return null;
  if (!queuedAt) return null;

  const parsedSimilarity = Number(value.matchSimilarity);

  return {
    id:
      String(value.id || "").trim() ||
      `${date}:${qrToken}:${queuedAt}:${Math.random().toString(36).slice(2, 7)}`,
    date,
    qrToken,
    queuedAt,
    studentId: String(value.studentId || "").trim(),
    studentName: String(value.studentName || "").trim(),
    source: String(value.source || "face").trim() || "face",
    matchSimilarity: Number.isFinite(parsedSimilarity) ? parsedSimilarity : null,
  };
};

export const readOfflineScanQueue = () => {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(OFFLINE_SCAN_QUEUE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((item) => normalizeOfflineScanQueueItem(item))
      .filter(Boolean)
      .slice(-MAX_OFFLINE_SCAN_QUEUE_ITEMS);
  } catch {
    return [];
  }
};

export const writeOfflineScanQueue = (items) => {
  if (typeof window === "undefined") return;

  try {
    const safeItems = Array.isArray(items)
      ? items
          .map((item) => normalizeOfflineScanQueueItem(item))
          .filter(Boolean)
          .slice(-MAX_OFFLINE_SCAN_QUEUE_ITEMS)
      : [];
    window.localStorage.setItem(
      OFFLINE_SCAN_QUEUE_KEY,
      JSON.stringify(safeItems)
    );
  } catch {
    // Ignore storage failures so scan flow keeps working.
  }
};

export const mergeOfflineScanQueueItem = (queue, incoming) => {
  const safeQueue = Array.isArray(queue) ? queue : [];
  const normalizedIncoming = normalizeOfflineScanQueueItem(incoming);
  if (!normalizedIncoming) return safeQueue;

  const duplicateIndex = safeQueue.findIndex(
    (item) =>
      item.date === normalizedIncoming.date &&
      item.qrToken === normalizedIncoming.qrToken
  );

  if (duplicateIndex >= 0) {
    const next = [...safeQueue];
    next[duplicateIndex] = {
      ...next[duplicateIndex],
      studentId:
        normalizedIncoming.studentId || next[duplicateIndex].studentId || "",
      studentName:
        normalizedIncoming.studentName || next[duplicateIndex].studentName || "",
      source: normalizedIncoming.source || next[duplicateIndex].source || "face",
      matchSimilarity:
        normalizedIncoming.matchSimilarity ??
        next[duplicateIndex].matchSimilarity ??
        null,
    };
    return next.slice(-MAX_OFFLINE_SCAN_QUEUE_ITEMS);
  }

  return [...safeQueue, normalizedIncoming].slice(-MAX_OFFLINE_SCAN_QUEUE_ITEMS);
};

export const getPeriodNumber = (value) => {
  const match = String(value || "").match(/\d+/);
  return match ? Number(match[0]) : Number.NaN;
};

export const getCreatedAtMillis = (value) => {
  if (value?.toMillis) {
    return value.toMillis();
  }
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.getTime() : 0;
};

export const normalizeDailyQrScanEntry = (value) => {
  if (value === null || value === undefined || value === false) return null;

  if (value && typeof value === "object" && !Array.isArray(value)) {
    return {
      scannedAtMillis: getTimestampMillis(
        value.scannedAt ?? value.timestamp ?? value.at
      ),
      scannedBy: String(value.scannedBy || ""),
      scannedByName: String(value.scannedByName || ""),
      qrNum: String(value.qrNum || value.qrNumber || ""),
    };
  }

  return {
    scannedAtMillis: getTimestampMillis(value),
    scannedBy: "",
    scannedByName: "",
    qrNum: "",
  };
};

export const formatTimeLabel = (value) => {
  const millis = getTimestampMillis(value);
  if (!millis) return "";
  return new Date(millis).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
};

export const getStudentScanTokens = (student) =>
  collectIdentifierTokens(
    student?.id,
    student?.qrNum,
    student?.qrNumber,
    student?.qr_num,
    student?.qrNumNumber,
    student?.qrNumberNumeric
  );

export const getStudentScanToken = (student) => {
  const tokens = getStudentScanTokens(student);
  return tokens[0] || String(student?.id || "").trim();
};

export const resolveStudentEmail = (student = {}) =>
  String(
    student?.email ||
      student?.studentEmail ||
      student?.emailId ||
      student?.emailID ||
      student?.userEmail ||
      student?.details?.email ||
      student?.details?.emailId ||
      student?.details?.emailID ||
      student?.details?.studentEmail ||
      student?.studentDetails?.email ||
      student?.studentDetails?.emailId ||
      student?.studentDetails?.emailID ||
      ""
  )
    .trim()
    .toLowerCase();

export const normalizeFaceVector = (value) => {
  if (!Array.isArray(value)) return [];
  const vector = value
    .map((entry) => Number(entry))
    .filter((entry) => Number.isFinite(entry));
  if (vector.length < FACE_MIN_VECTOR_LENGTH) return [];

  let squaredNorm = 0;
  vector.forEach((entry) => {
    squaredNorm += entry * entry;
  });
  if (squaredNorm <= 0) return [];

  const norm = Math.sqrt(squaredNorm);
  return vector.map((entry) => Number((entry / norm).toFixed(7)));
};

export const cosineSimilarity = (vectorA, vectorB) => {
  if (!Array.isArray(vectorA) || !Array.isArray(vectorB)) return 0;
  if (vectorA.length === 0 || vectorB.length === 0) return 0;

  const dimensions = Math.min(vectorA.length, vectorB.length);
  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let index = 0; index < dimensions; index += 1) {
    const a = Number(vectorA[index]) || 0;
    const b = Number(vectorB[index]) || 0;
    dot += a * b;
    normA += a * a;
    normB += b * b;
  }

  if (normA <= 0 || normB <= 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
};

export const rankStudentFaceMatches = (inputVector, studentFaceProfiles = []) => {
  const normalizedInput = normalizeFaceVector(inputVector);
  if (normalizedInput.length < FACE_MIN_VECTOR_LENGTH) return [];

  return (Array.isArray(studentFaceProfiles) ? studentFaceProfiles : [])
    .map((entry) => {
      const templateSimilarities = (Array.isArray(entry?.templates)
        ? entry.templates
        : []
      )
        .map((template) => cosineSimilarity(normalizedInput, template))
        .filter((value) => Number.isFinite(value))
        .sort((a, b) => b - a);

      if (templateSimilarities.length === 0) return null;

      const bestTemplateSimilarity = templateSimilarities[0];
      const consensusSlice = templateSimilarities.slice(
        0,
        Math.min(3, templateSimilarities.length)
      );
      const consensusSimilarity =
        consensusSlice.reduce((sum, value) => sum + value, 0) /
        consensusSlice.length;
      const weightedSimilarity =
        bestTemplateSimilarity * 0.85 + consensusSimilarity * 0.15;

      return {
        student: entry.student,
        similarity: weightedSimilarity,
        bestTemplateSimilarity,
        consensusSimilarity,
        templateCount: Number(entry?.templateCount) || templateSimilarities.length,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.similarity - a.similarity);
};

export const resolveReliableFaceMatches = (
  detections,
  studentFaceProfiles,
  {
    threshold = FACE_MATCH_THRESHOLD,
    minMargin = FACE_MATCH_MIN_MARGIN,
  } = {}
) => {
  const safeDetections = Array.isArray(detections) ? detections : [];
  const candidates = [];
  const rejected = [];

  safeDetections.forEach((detection, detectionIndex) => {
    const rankedMatches = rankStudentFaceMatches(
      detection?.vector ?? detection,
      studentFaceProfiles
    );
    const bestMatch = rankedMatches[0] || null;
    const secondBestMatch = rankedMatches[1] || null;
    const normalizedVector = normalizeFaceVector(detection?.vector ?? detection);

    if (normalizedVector.length < FACE_MIN_VECTOR_LENGTH) {
      rejected.push({
        detectionIndex,
        status: "invalid_vector",
        rankedMatches,
        bestMatch,
        secondBestMatch,
        detection,
      });
      return;
    }

    if (!bestMatch) {
      rejected.push({
        detectionIndex,
        status: "no_match",
        rankedMatches,
        bestMatch,
        secondBestMatch,
        detection,
      });
      return;
    }

    if (bestMatch.similarity < threshold) {
      rejected.push({
        detectionIndex,
        status: "below_threshold",
        rankedMatches,
        bestMatch,
        secondBestMatch,
        detection,
      });
      return;
    }

    if (
      secondBestMatch &&
      bestMatch.similarity - secondBestMatch.similarity < minMargin
    ) {
      rejected.push({
        detectionIndex,
        status: "ambiguous",
        rankedMatches,
        bestMatch,
        secondBestMatch,
        detection,
      });
      return;
    }

    candidates.push({
      detectionIndex,
      rankedMatches,
      bestMatch,
      secondBestMatch,
      detection,
      student: bestMatch.student,
      similarity: bestMatch.similarity,
    });
  });

  const accepted = [];
  const assignedStudentIds = new Set();

  candidates
    .sort((a, b) => b.similarity - a.similarity)
    .forEach((candidate) => {
      const studentId = String(candidate?.student?.id || "").trim();
      if (!studentId || assignedStudentIds.has(studentId)) {
        rejected.push({
          ...candidate,
          status: "duplicate_student",
        });
        return;
      }

      assignedStudentIds.add(studentId);
      accepted.push(candidate);
    });

  return {
    accepted,
    rejected,
  };
};

export const dedupeFaceVectors = (vectors, duplicateSimilarity = 0.998) => {
  const next = [];
  const safeVectors = Array.isArray(vectors) ? vectors : [];
  safeVectors.forEach((candidate) => {
    if (!Array.isArray(candidate) || candidate.length < FACE_MIN_VECTOR_LENGTH) {
      return;
    }
    const duplicate = next.some(
      (existing) => cosineSimilarity(existing, candidate) >= duplicateSimilarity
    );
    if (!duplicate) {
      next.push(candidate);
    }
  });
  return next;
};

export const getRequiredFaceConfirmationCount = (similarity) =>
  Number(similarity) >= FACE_MATCH_FAST_TRACK_THRESHOLD
    ? 1
    : FACE_MATCH_CONFIRMATION_COUNT;

const averageFaceVector = (vectors) => {
  if (!Array.isArray(vectors) || vectors.length === 0) return [];
  const dimensions = vectors.reduce(
    (max, vector) => Math.max(max, Array.isArray(vector) ? vector.length : 0),
    0
  );
  if (dimensions < FACE_MIN_VECTOR_LENGTH) return [];

  const sums = new Array(dimensions).fill(0);
  const counts = new Array(dimensions).fill(0);

  vectors.forEach((vector) => {
    if (!Array.isArray(vector)) return;
    for (let index = 0; index < dimensions; index += 1) {
      const value = Number(vector[index]);
      if (!Number.isFinite(value)) continue;
      sums[index] += value;
      counts[index] += 1;
    }
  });

  const averaged = sums.map((sum, index) => {
    const count = counts[index];
    if (!count) return 0;
    return sum / count;
  });

  return normalizeFaceVector(averaged);
};

const getFaceVectorSimilarityStats = (vectors) => {
  const safeVectors = Array.isArray(vectors)
    ? vectors.filter((vector) => vector.length >= FACE_MIN_VECTOR_LENGTH)
    : [];

  if (safeVectors.length <= 1) {
    return {
      averageSimilarity: safeVectors.length === 1 ? 1 : 0,
      minSimilarity: safeVectors.length === 1 ? 1 : 0,
      pairCount: 0,
    };
  }

  let similaritySum = 0;
  let pairCount = 0;
  let minSimilarity = 1;

  for (let leftIndex = 0; leftIndex < safeVectors.length; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < safeVectors.length;
      rightIndex += 1
    ) {
      const similarity = cosineSimilarity(
        safeVectors[leftIndex],
        safeVectors[rightIndex]
      );
      if (!Number.isFinite(similarity)) continue;
      similaritySum += similarity;
      pairCount += 1;
      minSimilarity = Math.min(minSimilarity, similarity);
    }
  }

  if (pairCount === 0) {
    return {
      averageSimilarity: 1,
      minSimilarity: 1,
      pairCount: 0,
    };
  }

  return {
    averageSimilarity: similaritySum / pairCount,
    minSimilarity,
    pairCount,
  };
};

export const serializeFaceSampleVectors = (vectors) =>
  (Array.isArray(vectors) ? vectors : [])
    .map((vector, index) => {
      const normalizedVector = normalizeFaceVector(vector);
      if (normalizedVector.length < FACE_MIN_VECTOR_LENGTH) return null;

      return {
        id: `sample_${index + 1}`,
        vector: normalizedVector,
      };
    })
    .filter(Boolean);

export const buildFaceRegistrationProfile = (
  vectors,
  {
    duplicateSimilarity = FACE_REGISTRATION_DUPLICATE_SIMILARITY,
  } = {}
) => {
  const normalizedVectors = dedupeFaceVectors(
    (Array.isArray(vectors) ? vectors : [])
      .map((vector) => normalizeFaceVector(vector))
      .filter((vector) => vector.length >= FACE_MIN_VECTOR_LENGTH),
    duplicateSimilarity
  );
  const centroidVector = averageFaceVector(normalizedVectors);
  const { averageSimilarity, minSimilarity } =
    getFaceVectorSimilarityStats(normalizedVectors);
  const serializedSampleVectors = serializeFaceSampleVectors(normalizedVectors);
  const profileVector =
    centroidVector.length >= FACE_MIN_VECTOR_LENGTH
      ? centroidVector
      : normalizedVectors[0] || [];

  return {
    vectors: normalizedVectors,
    vector: profileVector,
    vectorLength: profileVector.length,
    sampleVectors: serializedSampleVectors,
    sampleCount: serializedSampleVectors.length,
    sampleConsistency:
      normalizedVectors.length > 0
        ? Number(averageSimilarity.toFixed(4))
        : 0,
    sampleMinSimilarity:
      normalizedVectors.length > 0
        ? Number(minSimilarity.toFixed(4))
        : 0,
  };
};

export const collectFaceSampleVectors = (student) => {
  const faceAttendance = student?.faceAttendance;
  const rawSampleCandidates = [
    faceAttendance?.sampleVectors,
    faceAttendance?.samples,
    student?.faceSamples,
  ];

  const collected = [];
  rawSampleCandidates.forEach((candidate) => {
    if (!Array.isArray(candidate)) return;
    candidate.forEach((entry) => {
      if (Array.isArray(entry)) {
        collected.push(entry);
        return;
      }
      if (!entry || typeof entry !== "object") return;
      if (Array.isArray(entry.vector)) {
        collected.push(entry.vector);
        return;
      }
      if (Array.isArray(entry.descriptor)) {
        collected.push(entry.descriptor);
        return;
      }
      if (Array.isArray(entry.embedding)) {
        collected.push(entry.embedding);
      }
    });
  });

  return dedupeFaceVectors(
    collected
      .map((value) => normalizeFaceVector(value))
      .filter((value) => value.length >= FACE_MIN_VECTOR_LENGTH)
  );
};

export const getStudentFaceTemplates = (student) => {
  if (!student || typeof student !== "object") return [];

  const directCandidates = [
    student?.faceAttendance?.vector,
    student?.faceAttendance?.descriptor,
    student?.faceAttendance?.embedding,
    student?.faceVector,
    student?.faceDescriptor,
    student?.faceEmbedding,
    student?.faceAttendanceVector,
  ]
    .map((candidate) => normalizeFaceVector(candidate))
    .filter((candidate) => candidate.length >= FACE_MIN_VECTOR_LENGTH);

  const sampleVectors = collectFaceSampleVectors(student);
  const merged = dedupeFaceVectors([...directCandidates, ...sampleVectors]);
  if (merged.length === 0) return [];

  const centroidVector = averageFaceVector(merged);
  if (centroidVector.length >= FACE_MIN_VECTOR_LENGTH) {
    return dedupeFaceVectors([centroidVector, ...merged]);
  }
  return merged;
};

export const getStudentFaceVector = (student) => {
  const templates = getStudentFaceTemplates(student);
  return templates[0] || [];
};

export const toSimilarityPercentLabel = (value) => {
  const percent = Math.max(0, Math.min(100, Number(value) * 100));
  return `${Math.round(percent)}%`;
};

export const normalizeAttendanceStatus = (value) => {
  if (value === true || value === "present") return "present";
  if (value === false || value === "absent") return "absent";
  return "unmarked";
};

export const statusLabelMap = {
  present: "Present",
  absent: "Absent",
  unmarked: "Not marked",
};

export const statusChipClassMap = {
  present: "border border-emerald-200 bg-emerald-100 text-emerald-900",
  absent: "border border-rose-200 bg-rose-100 text-rose-900",
  unmarked: "border border-clay/35 bg-white/90 text-ink/75",
};
