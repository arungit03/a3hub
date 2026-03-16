import { auth } from "./firebase.js";
const DEFAULT_RUN_ENDPOINT = "/.netlify/functions/code-run";
const DEFAULT_TIMEOUT_MS = 20000;

/**
 * @typedef {{
 *   ok?: boolean,
 *   error?: unknown,
 *   details?: unknown,
 *   output?: unknown,
 *   compileOutput?: unknown,
 *   runOutput?: unknown,
 *   stdout?: unknown,
 *   stderr?: unknown,
 *   exitCode?: unknown,
 *   compileCode?: unknown,
 *   runtime?: unknown,
 *   signal?: unknown
 * }} RunPayload
 */

/**
 * @param {unknown} value
 * @returns {string}
 */
const toText = (value) => String(value ?? "");

/**
 * @param {unknown} value
 * @returns {string}
 */
export const normalizeProgramOutput = (value) =>
  toText(value)
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+$/gm, "")
    .trimEnd();

/**
 * @param {unknown} actual
 * @param {unknown} expected
 * @returns {boolean}
 */
export const isProgramOutputMatch = (actual, expected) =>
  normalizeProgramOutput(actual) === normalizeProgramOutput(expected);

/**
 * @param {RunPayload} payload
 * @param {string} fallback
 * @returns {string}
 */
const toErrorMessage = (payload, fallback) => {
  const fromPayload = toText(payload?.error || "").trim();
  if (fromPayload) return fromPayload;
  const fromDetails = toText(payload?.details || "").trim();
  if (fromDetails) return fromDetails;
  return fallback;
};

/**
 * @returns {Promise<Record<string, string>>}
 */
const buildRunHeaders = async () => {
  const headers = /** @type {Record<string, string>} */ ({
    "content-type": "application/json",
  });
  const currentUser = auth.currentUser;
  if (!currentUser) return headers;
  try {
    const token = await currentUser.getIdToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  } catch {
    // Ignore token lookup errors; backend will return auth errors when needed.
  }
  return headers;
};

/**
 * @param {{
 *   language: unknown,
 *   sourceCode: unknown,
 *   stdin?: unknown,
 *   endpoint?: string,
 *   timeoutMs?: number
 * }} params
 */
export async function runNativeCode({
  language,
  sourceCode,
  stdin = "",
  endpoint = DEFAULT_RUN_ENDPOINT,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  const safeLanguage = toText(language).trim().toLowerCase();
  if (!safeLanguage) {
    throw new Error("Language is required.");
  }

  const safeSourceCode = toText(sourceCode);
  if (!safeSourceCode.trim()) {
    throw new Error("Source code is empty.");
  }

  const timerApi = typeof window !== "undefined" ? window : globalThis;
  const controller = new AbortController();
  const timeoutId = timerApi.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: await buildRunHeaders(),
      body: JSON.stringify({
        language: safeLanguage,
        sourceCode: safeSourceCode,
        stdin: toText(stdin),
      }),
      signal: controller.signal,
    });

    const payload =
      /** @type {RunPayload} */ (await response.json().catch(() => ({})));
    if (!response.ok || !payload?.ok) {
      throw new Error(
        toErrorMessage(payload, "Compile service returned an error.")
      );
    }

    return {
      output: toText(payload.output),
      compileOutput: toText(payload.compileOutput),
      runOutput: toText(payload.runOutput),
      stdout: toText(payload.stdout),
      stderr: toText(payload.stderr),
      exitCode:
        typeof payload.exitCode === "number" ? payload.exitCode : null,
      compileCode:
        typeof payload.compileCode === "number" ? payload.compileCode : null,
      runtime: toText(payload.runtime),
      signal: payload.signal ?? null,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Compile request timed out. Try simpler code.");
    }
    throw error;
  } finally {
    timerApi.clearTimeout(timeoutId);
  }
}
