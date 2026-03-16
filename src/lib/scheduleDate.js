/**
 * @param {number} value
 * @returns {string}
 */
const pad2 = (value) => String(value).padStart(2, "0");

/**
 * @param {number} year
 * @param {number} month
 * @param {number} day
 * @returns {boolean}
 */
const isValidDateParts = (year, month, day) => {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return false;
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }
  const parsed = new Date(year, month - 1, day);
  return (
    parsed.getFullYear() === year &&
    parsed.getMonth() === month - 1 &&
    parsed.getDate() === day
  );
};

/**
 * @param {unknown} value
 * @returns {string}
 */
export const toDateKey = (value) => {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return "";
  return `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(
    value.getDate()
  )}`;
};

/**
 * @param {unknown} value
 * @returns {string}
 */
export const normalizeDateKey = (value) => {
  if (!value) return "";

  if (
    typeof value === "object" &&
    value !== null &&
    "toDate" in value &&
    typeof value.toDate === "function"
  ) {
    return toDateKey(value.toDate());
  }

  if (value instanceof Date) {
    return toDateKey(value);
  }

  const raw = String(value).trim();
  if (!raw) return "";

  const ymdMatch = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (ymdMatch) {
    const year = Number(ymdMatch[1]);
    const month = Number(ymdMatch[2]);
    const day = Number(ymdMatch[3]);
    if (isValidDateParts(year, month, day)) {
      return `${year}-${pad2(month)}-${pad2(day)}`;
    }
  }

  const dmyMatch = raw.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (dmyMatch) {
    const day = Number(dmyMatch[1]);
    const month = Number(dmyMatch[2]);
    const year = Number(dmyMatch[3]);
    if (isValidDateParts(year, month, day)) {
      return `${year}-${pad2(month)}-${pad2(day)}`;
    }
  }

  const isoPrefixMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})T/);
  if (isoPrefixMatch) {
    const year = Number(isoPrefixMatch[1]);
    const month = Number(isoPrefixMatch[2]);
    const day = Number(isoPrefixMatch[3]);
    if (isValidDateParts(year, month, day)) {
      return `${year}-${pad2(month)}-${pad2(day)}`;
    }
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return toDateKey(parsed);
  }

  return "";
};

/**
 * @param {unknown} entry
 * @returns {string}
 */
export const getScheduleEntryDateKey = (entry) => {
  if (!entry || typeof entry !== "object") return "";
  const safeEntry = /** @type {Record<string, unknown>} */ (entry);
  const explicitCandidates = [
    safeEntry.dateKey,
    safeEntry.date,
    safeEntry.scheduleDate,
    safeEntry.dayKey,
    safeEntry.forDate,
  ];

  for (const candidate of explicitCandidates) {
    const normalized = normalizeDateKey(candidate);
    if (normalized) return normalized;
  }

  return "";
};

/**
 * @param {unknown} entry
 * @returns {string}
 */
export const resolveScheduleEntryDateKey = (entry) => {
  const explicitKey = getScheduleEntryDateKey(entry);
  if (explicitKey) return explicitKey;

  const safeEntry =
    entry && typeof entry === "object"
      ? /** @type {Record<string, unknown>} */ (entry)
      : {};
  const fallbackCandidates = [safeEntry.createdAt, safeEntry.updatedAt];
  for (const candidate of fallbackCandidates) {
    const normalized = normalizeDateKey(candidate);
    if (normalized) return normalized;
  }

  return "";
};
