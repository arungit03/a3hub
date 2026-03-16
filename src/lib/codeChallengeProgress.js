/**
 * @typedef {{
 *   solvedIds: string[],
 *   totalSolved: number,
 *   daysParticipated: number,
 *   dailyStreak: number,
 *   bestStreak: number,
 *   lastSolvedDayKey: string
 * }} ChallengeProgress
 */

const DEFAULT_PROGRESS = Object.freeze({
  solvedIds: [],
  totalSolved: 0,
  daysParticipated: 0,
  dailyStreak: 0,
  bestStreak: 0,
  lastSolvedDayKey: "",
});

/**
 * @param {unknown} value
 * @returns {string[]}
 */
const toSafeArray = (value) =>
  Array.isArray(value)
    ? value.map((item) => String(item || "").trim()).filter(Boolean)
    : [];

/**
 * @param {Date | string | number} [dateValue]
 * @returns {string}
 */
export const getDateKey = (dateValue = new Date()) => {
  const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

/**
 * @param {unknown} dateKey
 * @returns {string}
 */
export const getPreviousDateKey = (dateKey) => {
  const safeKey = String(dateKey || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(safeKey)) return "";
  const [year, month, day] = safeKey.split("-").map((part) => Number(part));
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return "";
  date.setDate(date.getDate() - 1);
  return getDateKey(date);
};

/**
 * @param {unknown} value
 * @returns {ChallengeProgress}
 */
export const sanitizeChallengeProgress = (value) => {
  const raw =
    value && typeof value === "object"
      ? /** @type {Partial<ChallengeProgress>} */ (value)
      : {};
  const solvedIds = Array.from(new Set(toSafeArray(raw.solvedIds)));
  const totalSolved = Number(raw.totalSolved || 0);
  const daysParticipated = Number(raw.daysParticipated || 0);
  const dailyStreak = Number(raw.dailyStreak || 0);
  const bestStreak = Number(raw.bestStreak || 0);
  const lastSolvedDayKey = String(raw.lastSolvedDayKey || "").trim();

  return {
    solvedIds,
    totalSolved: Number.isFinite(totalSolved) ? Math.max(totalSolved, solvedIds.length) : solvedIds.length,
    daysParticipated: Number.isFinite(daysParticipated) ? Math.max(daysParticipated, 0) : 0,
    dailyStreak: Number.isFinite(dailyStreak) ? Math.max(dailyStreak, 0) : 0,
    bestStreak: Number.isFinite(bestStreak) ? Math.max(bestStreak, 0) : 0,
    lastSolvedDayKey:
      /^\d{4}-\d{2}-\d{2}$/.test(lastSolvedDayKey) ? lastSolvedDayKey : "",
  };
};

/**
 * @param {{
 *   progress?: unknown,
 *   challengeId?: unknown,
 *   solvedAtDayKey?: string
 * }} args
 * @returns {ChallengeProgress}
 */
export const markChallengeSolvedState = ({
  progress,
  challengeId,
  solvedAtDayKey = getDateKey(),
}) => {
  const base = sanitizeChallengeProgress(progress || DEFAULT_PROGRESS);
  const id = String(challengeId || "").trim();
  if (!id) return base;

  if (base.solvedIds.includes(id)) {
    return base;
  }

  const next = {
    ...base,
    solvedIds: [...base.solvedIds, id],
    totalSolved: base.totalSolved + 1,
  };

  if (!/^\d{4}-\d{2}-\d{2}$/.test(solvedAtDayKey)) {
    return next;
  }

  if (base.lastSolvedDayKey !== solvedAtDayKey) {
    next.daysParticipated += 1;
    const previousDayKey = getPreviousDateKey(solvedAtDayKey);
    if (base.lastSolvedDayKey && base.lastSolvedDayKey === previousDayKey) {
      next.dailyStreak = base.dailyStreak + 1;
    } else {
      next.dailyStreak = 1;
    }
    next.bestStreak = Math.max(base.bestStreak, next.dailyStreak);
    next.lastSolvedDayKey = solvedAtDayKey;
  }

  return next;
};

/**
 * @param {string} storageKey
 * @returns {ChallengeProgress}
 */
export const loadChallengeProgress = (storageKey) => {
  if (typeof window === "undefined") {
    return sanitizeChallengeProgress(DEFAULT_PROGRESS);
  }

  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      return sanitizeChallengeProgress(DEFAULT_PROGRESS);
    }
    return sanitizeChallengeProgress(JSON.parse(raw));
  } catch {
    return sanitizeChallengeProgress(DEFAULT_PROGRESS);
  }
};

/**
 * @param {string} storageKey
 * @param {unknown} progress
 */
export const saveChallengeProgress = (storageKey, progress) => {
  if (typeof window === "undefined") return;
  try {
    const sanitized = sanitizeChallengeProgress(progress);
    window.localStorage.setItem(storageKey, JSON.stringify(sanitized));
  } catch {
    // Ignore storage errors to keep page functional.
  }
};
