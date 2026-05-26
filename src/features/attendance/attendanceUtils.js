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

export const SCAN_QUEUE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const getTimestampMillis = (value) => {
  if (value?.toMillis) return value.toMillis();
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.getTime() : 0;
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
