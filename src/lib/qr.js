/**
 * @param {unknown} value
 * @returns {number | null}
 */
export const extractNumericQrValue = (value) => {
  const rawValue = String(value ?? "").trim();
  if (!rawValue) return null;

  const digitGroups = rawValue.match(/\d+/g);
  if (!digitGroups) return null;

  const digits = digitGroups.join("");
  if (!digits) return null;

  const parsed = Number.parseInt(digits, 10);
  return Number.isSafeInteger(parsed) ? parsed : null;
};

/**
 * @param {unknown} value
 * @returns {string}
 */
const normalizeIdentifierToken = (value) => {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") {
    return Number.isSafeInteger(value) ? String(value) : "";
  }
  return String(value).trim();
};

/**
 * @param {...unknown} values
 * @returns {string[]}
 */
export const collectIdentifierTokens = (...values) => {
  const tokens = new Set();

  values.forEach((value) => {
    const rawToken = normalizeIdentifierToken(value);
    if (!rawToken) return;

    tokens.add(rawToken);
    const numericToken = extractNumericQrValue(rawToken);
    if (Number.isSafeInteger(numericToken)) {
      tokens.add(String(numericToken));
    }
  });

  return Array.from(tokens);
};
