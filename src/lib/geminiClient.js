import { auth } from "./firebase.js";
import {
  extractJsonPayload,
  normalizeInterviewQuizAndContactPlaces,
  normalizeTopTechnicalNews,
} from "./gemini/normalize.js";

const MODEL_PREFERENCE = [
  "gemini-2.5-flash",
  "gemini-2.0-flash-lite",
  "gemini-2.0-flash",
  "gemini-2.0-flash-001",
  "gemini-2.0-flash-lite-001",
  "gemini-2.5-pro",
];
const FALLBACK_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.0-flash-lite",
  "gemini-2.0-flash",
];
const OPENAI_MODEL_PREFERENCE = ["gpt-4.1-mini", "gpt-4o-mini", "gpt-4o"];
const OPENAI_FALLBACK_MODELS = ["gpt-4o-mini", "gpt-4o"];
const OPENAI_CHAT_ENDPOINT = "https://api.openai.com/v1/chat/completions";
const DEFAULT_AI_PROXY_ENDPOINT = "/.netlify/functions/ai-generate";
const SERVER_PROXY_API_KEY = "__A3HUB_SERVER_AI_PROXY__";
const CHAT_MAX_OUTPUT_TOKENS = 4096;
const CHAT_MAX_CONTINUATION_ROUNDS = 2;
const CHAT_CONTINUE_PROMPT =
  "Continue exactly from where you stopped. Do not restart or repeat prior text. If you are writing code, finish the same code block and close all tags, braces, and backticks.";
let discoveredModelsPromise = null;
let discoveredModelsForKey = "";

const isOpenAiKey = (apiKey) => String(apiKey || "").trim().startsWith("sk-");
const isLocalDevelopmentRuntime = () => {
  if (typeof window === "undefined") {
    return Boolean(import.meta.env.DEV);
  }

  const host = String(window.location.hostname || "").trim().toLowerCase();
  return (
    Boolean(import.meta.env.DEV) ||
    host === "localhost" ||
    host === "127.0.0.1" ||
    host.endsWith(".local")
  );
};

const getRuntimeApiKey = () => {
  if (!isLocalDevelopmentRuntime()) return "";
  if (typeof window === "undefined") return "";
  const runtimeRoot =
    window.__A3HUB_RUNTIME_CONFIG__ &&
    typeof window.__A3HUB_RUNTIME_CONFIG__ === "object"
      ? window.__A3HUB_RUNTIME_CONFIG__
      : {};
  const runtimeConfig =
    window.__A3HUB_GEMINI_CONFIG__ ||
    window.__GEMINI_CONFIG__ ||
    window.__A3HUB_OPENAI_CONFIG__ ||
    window.__OPENAI_CONFIG__ ||
    runtimeRoot.ai;
  if (!runtimeConfig || typeof runtimeConfig !== "object") return "";
  const key =
    runtimeConfig.apiKey ||
    runtimeConfig.geminiApiKey ||
    runtimeConfig.openaiApiKey ||
    runtimeConfig.openAiApiKey ||
    runtimeConfig.key ||
    "";
  return typeof key === "string" ? key.trim() : "";
};

const resolveAiProxyEndpoint = () => {
  const endpointFromBuild = String(
    import.meta.env.VITE_AI_PROXY_ENDPOINT || ""
  ).trim();

  if (typeof window === "undefined") {
    return endpointFromBuild || DEFAULT_AI_PROXY_ENDPOINT;
  }

  const runtimeRoot =
    window.__A3HUB_RUNTIME_CONFIG__ &&
    typeof window.__A3HUB_RUNTIME_CONFIG__ === "object"
      ? window.__A3HUB_RUNTIME_CONFIG__
      : {};
  const runtimeConfig =
    window.__A3HUB_GEMINI_CONFIG__ ||
    window.__GEMINI_CONFIG__ ||
    window.__A3HUB_OPENAI_CONFIG__ ||
    window.__OPENAI_CONFIG__ ||
    runtimeRoot.ai ||
    {};
  const endpointFromRuntime = String(
    runtimeConfig.endpoint ||
      runtimeConfig.aiEndpoint ||
      runtimeConfig.aiProxyEndpoint ||
      runtimeConfig.apiEndpoint ||
      ""
  ).trim();

  return endpointFromRuntime || endpointFromBuild || DEFAULT_AI_PROXY_ENDPOINT;
};

const normalizeApiKeyValue = (apiKey) => {
  const trimmedKey = String(apiKey || "").trim();
  if (!trimmedKey) return "";
  if (trimmedKey === SERVER_PROXY_API_KEY) return "";
  return trimmedKey;
};

const getAiProxyAuthHeaders = async () => {
  const headers = {
    "Content-Type": "application/json",
  };
  const currentUser = auth.currentUser;
  if (!currentUser) return headers;
  try {
    const token = await currentUser.getIdToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  } catch {
    // Backend guard will return auth errors when token refresh fails.
  }
  return headers;
};

const requestAiProxyAction = async ({ action, payload = {} }) => {
  const endpoint = resolveAiProxyEndpoint();
  if (!endpoint) {
    const error = new Error("AI proxy endpoint is not configured.");
    error.code = "ai/proxy-missing";
    throw error;
  }

  let response;
  let responsePayload = {};
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: await getAiProxyAuthHeaders(),
      body: JSON.stringify({
        action,
        payload,
      }),
    });
    responsePayload = await response.json().catch(() => ({}));
  } catch {
    const error = new Error("Network error while contacting AI server.");
    error.code = "ai/proxy-network-error";
    error.userMessage =
      "Unable to reach AI server right now. Please try again in a moment.";
    throw error;
  }

  if (!response.ok || responsePayload?.ok === false) {
    const detailsMessage =
      String(
        responsePayload?.error ||
          responsePayload?.details ||
          responsePayload?.message ||
          ""
      ).trim() ||
      `AI server request failed with status ${response.status}.`;
    const error = new Error(detailsMessage);
    error.code = String(responsePayload?.code || "ai/proxy-request-failed");
    error.status = response.status || 500;
    if (response.status === 401) {
      error.userMessage = "Please sign in again to use AI features.";
      throw error;
    }
    if (response.status === 403) {
      error.userMessage =
        "Your account is not allowed to use AI features. Contact admin.";
      throw error;
    }
    if (
      [404, 405].includes(response.status) &&
      endpoint.includes("/.netlify/functions/")
    ) {
      error.userMessage =
        "This deploy cannot reach the AI function. Rebuild locally and upload the dist folder, or deploy with Netlify Functions enabled.";
      throw error;
    }
    error.userMessage =
      responsePayload?.userMessage ||
      "AI service is temporarily unavailable. Please try again.";
    throw error;
  }

  return responsePayload;
};

const extractTextFromResponse = (payload) => {
  const parts = payload?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return "";
  return parts
    .map((part) => (typeof part?.text === "string" ? part.text : ""))
    .join("")
    .trim();
};

const extractFinishReason = (payload) =>
  String(payload?.candidates?.[0]?.finishReason || "")
    .trim()
    .toUpperCase();

const extractOpenAiTextFromResponse = (payload) => {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (typeof part?.text === "string") return part.text;
      if (typeof part === "string") return part;
      return "";
    })
    .join("")
    .trim();
};

const extractOpenAiFinishReason = (payload) =>
  String(payload?.choices?.[0]?.finish_reason || "")
    .trim()
    .toLowerCase();

const mergeContinuationText = (existingText, nextText) => {
  const base = String(existingText || "");
  const addition = String(nextText || "");
  if (!addition) return base;
  if (!base) return addition;

  const maxOverlap = Math.min(base.length, addition.length, 280);
  for (let size = maxOverlap; size >= 18; size -= 1) {
    if (base.slice(-size) === addition.slice(0, size)) {
      return `${base}${addition.slice(size)}`;
    }
  }

  if (base.endsWith("\n") || addition.startsWith("\n")) {
    return `${base}${addition}`;
  }

  return `${base}\n${addition}`;
};

const normalizeModelName = (value) =>
  String(value || "")
    .trim()
    .replace(/^models\//, "");

const prioritizeModels = (models) => {
  const seen = new Set();
  const unique = models
    .map(normalizeModelName)
    .filter((model) => model && !seen.has(model) && seen.add(model));

  const prioritized = MODEL_PREFERENCE.filter((model) => unique.includes(model));
  const remaining = unique.filter((model) => !prioritized.includes(model));
  return [...prioritized, ...remaining];
};

const shouldRetryWithNextModel = (status, message) => {
  const normalized = String(message || "").toLowerCase();
  if (status === 429 && (normalized.includes("quota") || normalized.includes("rate"))) {
    return true;
  }
  if (status === 404) return true;
  if (status === 400 && normalized.includes("model")) return true;
  if (normalized.includes("model") && normalized.includes("not found")) return true;
  if (normalized.includes("unsupported") && normalized.includes("model")) return true;
  return false;
};

const parseRetryAfterSeconds = (message) => {
  const matched = String(message || "").match(/retry in\s+([\d.]+)s/i);
  if (!matched) return 0;
  const value = Number(matched[1]);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.ceil(value);
};

const buildGeminiHttpError = ({ status, payload, message }) => {
  const error = new Error(message);
  error.code = payload?.error?.status || `gemini/http-${status}`;
  error.status = status;

  if (status === 429 || /quota exceeded/i.test(message)) {
    const retryAfterSeconds = parseRetryAfterSeconds(message);
    error.code = "gemini/quota-exceeded";
    error.retryAfterSeconds = retryAfterSeconds;
    error.userMessage =
      retryAfterSeconds > 0
        ? `Gemini quota exceeded. Try again in about ${retryAfterSeconds}s, or enable billing and increase quota in Google AI Studio.`
        : "Gemini quota exceeded. Enable billing and increase quota in Google AI Studio, then try again.";
  } else if (status === 403) {
    error.userMessage =
      "Gemini access denied for this API key. Check API key restrictions and Gemini API enablement.";
  } else if (status === 401) {
    error.userMessage = "Gemini API key is invalid.";
  }

  return error;
};

const buildOpenAiHttpError = ({ status, payload, message }) => {
  const error = new Error(message);
  error.code = payload?.error?.code || `openai/http-${status}`;
  error.status = status;

  if (status === 429) {
    const retryAfterSeconds = parseRetryAfterSeconds(message);
    error.code = "openai/rate-limit";
    error.retryAfterSeconds = retryAfterSeconds;
    error.userMessage =
      retryAfterSeconds > 0
        ? `OpenAI rate limit reached. Try again in about ${retryAfterSeconds}s.`
        : "OpenAI rate limit reached. Try again shortly.";
  } else if (status === 403) {
    error.userMessage =
      "OpenAI access denied for this API key. Check project permissions and key restrictions.";
  } else if (status === 401) {
    error.userMessage = "OpenAI API key is invalid.";
  }

  return error;
};

const toConversationMessages = (messages) =>
  messages
    .map((item) => {
      const payloadText =
        typeof item?.payloadText === "string" && item.payloadText.trim()
          ? item.payloadText
          : item?.text;

      return {
        role: item?.role,
        payloadText,
      };
    })
    .filter((item) => typeof item?.payloadText === "string" && item.payloadText.trim());

const toGeminiContents = (messages) =>
  toConversationMessages(messages)
    .map((item) => ({
      role: item.role === "assistant" ? "model" : "user",
      parts: [{ text: item.payloadText.trim() }],
    }));

const toOpenAiMessages = (messages) =>
  toConversationMessages(messages).map((item) => ({
    role: item.role === "assistant" ? "assistant" : "user",
    content: item.payloadText.trim(),
  }));

const requestOpenAiChatCompletion = async ({
  apiKey,
  model,
  messages,
  temperature = 0.3,
  maxTokens = CHAT_MAX_OUTPUT_TOKENS,
}) => {
  const response = await fetch(OPENAI_CHAT_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
    }),
  });

  const payload = await response.json();
  return { response, payload };
};

export const getGeminiApiKey = () => {
  const runtimeKey = getRuntimeApiKey();
  if (runtimeKey) return runtimeKey;
  return resolveAiProxyEndpoint() ? SERVER_PROXY_API_KEY : "";
};

const requestOpenAiTopTechnicalNews = async ({ apiKey, dateKey, count = 3 }) => {
  const trimmedKey = String(apiKey || "").trim();
  if (!trimmedKey) {
    const error = new Error("OpenAI API key is missing.");
    error.code = "openai/missing-api-key";
    throw error;
  }

  const topicCount = Number.isFinite(count) ? Math.max(1, Math.min(5, count)) : 3;
  const modelCandidates = [...OPENAI_MODEL_PREFERENCE, ...OPENAI_FALLBACK_MODELS].filter(
    (model, index, list) => list.indexOf(model) === index
  );
  let lastRecoverableError = null;

  const userPrompt = [
    `Generate exactly ${topicCount} top technical news highlights for date ${dateKey}.`,
    "Focus on software engineering, AI, cloud, cybersecurity, semiconductors, and developer tooling.",
    "Return strict JSON only (no markdown) with this schema:",
    '{ "topics": [ { "title": "", "summary": "", "source": "", "sourceUrl": "" } ] }',
    "Rules:",
    "- topics length must be exactly requested count",
    "- each summary must have 3 to 5 short lines separated by \\n",
    "- keep title and summary concise and factual",
    "- source and sourceUrl may be empty when unavailable",
  ].join("\n");

  for (let index = 0; index < modelCandidates.length; index += 1) {
    const model = modelCandidates[index];
    let response;
    let payload = null;

    try {
      ({ response, payload } = await requestOpenAiChatCompletion({
        apiKey: trimmedKey,
        model,
        messages: [
          {
            role: "system",
            content:
              "You generate daily technical news highlights. Output strict JSON only with no markdown and no extra keys.",
          },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.35,
        maxTokens: 1800,
      }));
    } catch {
      const error = new Error("Network error while contacting OpenAI API.");
      error.code = "openai/network-error";
      throw error;
    }

    if (response.ok) {
      const text = extractOpenAiTextFromResponse(payload);
      const parsed = extractJsonPayload(text);
      const topics = normalizeTopTechnicalNews(parsed, topicCount);

      if (topics.length === 0) {
        const error = new Error("OpenAI returned invalid technical news JSON.");
        error.code = "openai/invalid-tech-news-json";
        throw error;
      }

      return { topics, model };
    }

    const status = response.status;
    const message = payload?.error?.message || `OpenAI request failed with status ${status}.`;
    const httpError = buildOpenAiHttpError({ status, payload, message });

    if (shouldRetryWithNextModel(status, message) && index < modelCandidates.length - 1) {
      lastRecoverableError = httpError;
      continue;
    }

    throw httpError;
  }

  if (lastRecoverableError) {
    throw lastRecoverableError;
  }

  const error = new Error("OpenAI request failed.");
  error.code = "openai/request-failed";
  throw error;
};

const requestOpenAiInterviewQuizAndContactPlaces = async ({
  apiKey,
  dateKey,
  companyCount = 5,
  placeCount = 10,
}) => {
  const trimmedKey = String(apiKey || "").trim();
  if (!trimmedKey) {
    const error = new Error("OpenAI API key is missing.");
    error.code = "openai/missing-api-key";
    throw error;
  }

  const safeCompanyCount = Number.isFinite(companyCount)
    ? Math.max(1, Math.min(8, companyCount))
    : 5;
  const safePlaceCount = Number.isFinite(placeCount)
    ? Math.max(5, Math.min(15, placeCount))
    : 10;

  const modelCandidates = [...OPENAI_MODEL_PREFERENCE, ...OPENAI_FALLBACK_MODELS].filter(
    (model, index, list) => list.indexOf(model) === index
  );
  let lastRecoverableError = null;

  const userPrompt = [
    `Generate interview preparation data for date ${dateKey}.`,
    `Return exactly ${safeCompanyCount} top companies for interview quiz topics.`,
    `For each company, provide exactly 3 to 5 question-answer pairs.`,
    `Return exactly ${safePlaceCount} interview contact places in Tamil Nadu.`,
    "Return strict JSON only (no markdown) with schema:",
    '{ "companies": [ { "company": "", "quizTopic": "", "qa": [ { "question": "", "answer": "" } ] } ], "contactPlaces": [ { "place": "", "city": "", "description": "" } ] }',
    "Rules:",
    "- companies length must match requested count",
    "- each qa array length must be between 3 and 5",
    "- answers should be concise interview-ready lines",
    "- contactPlaces should prioritize practical interview hubs/centers in Tamil Nadu",
  ].join("\n");

  for (let index = 0; index < modelCandidates.length; index += 1) {
    const model = modelCandidates[index];
    let response;
    let payload = null;

    try {
      ({ response, payload } = await requestOpenAiChatCompletion({
        apiKey: trimmedKey,
        model,
        messages: [
          {
            role: "system",
            content:
              "You generate structured interview prep data for students. Output strict JSON only with no markdown and no extra keys.",
          },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.35,
        maxTokens: 2600,
      }));
    } catch {
      const error = new Error("Network error while contacting OpenAI API.");
      error.code = "openai/network-error";
      throw error;
    }

    if (response.ok) {
      const text = extractOpenAiTextFromResponse(payload);
      const parsed = extractJsonPayload(text);
      const normalized = normalizeInterviewQuizAndContactPlaces({
        value: parsed,
        companyCount: safeCompanyCount,
        placeCount: safePlaceCount,
      });

      if (normalized.companies.length === 0 && normalized.contactPlaces.length === 0) {
        const error = new Error("OpenAI returned invalid interview quiz JSON.");
        error.code = "openai/invalid-interview-quiz-json";
        throw error;
      }

      return { ...normalized, model };
    }

    const status = response.status;
    const message = payload?.error?.message || `OpenAI request failed with status ${status}.`;
    const httpError = buildOpenAiHttpError({ status, payload, message });

    if (shouldRetryWithNextModel(status, message) && index < modelCandidates.length - 1) {
      lastRecoverableError = httpError;
      continue;
    }

    throw httpError;
  }

  if (lastRecoverableError) {
    throw lastRecoverableError;
  }

  const error = new Error("OpenAI request failed.");
  error.code = "openai/request-failed";
  throw error;
};

const requestOpenAiDailyPythonChallenges = async ({ apiKey, dateKey, count = 5 }) => {
  const trimmedKey = String(apiKey || "").trim();
  if (!trimmedKey) {
    const error = new Error("OpenAI API key is missing.");
    error.code = "openai/missing-api-key";
    throw error;
  }

  const challengeCount = Number.isFinite(count) ? Math.max(1, Math.min(5, count)) : 5;
  const modelCandidates = [...OPENAI_MODEL_PREFERENCE, ...OPENAI_FALLBACK_MODELS].filter(
    (model, index, list) => list.indexOf(model) === index
  );
  let lastRecoverableError = null;

  const userPrompt = [
    `Generate exactly ${challengeCount} unique daily Python coding challenges for date ${dateKey}.`,
    "Each challenge must be beginner to medium level and executable with stdin/stdout only.",
    "Return JSON only (no markdown) using this schema:",
    '{ "challenges": [ { "title": "", "topic": "", "difficulty": "", "statement": "", "inputFormat": "", "outputFormat": "", "sampleInput": "", "sampleOutput": "", "hint": "", "solutionCode": "" } ] }',
    "Rules:",
    "- challenges array length must be exactly requested count",
    "- sampleOutput must exactly match running solutionCode with sampleInput",
    "- solutionCode must be complete valid Python and should not use input prompts",
    "- solutionCode must be beginner-friendly and short (prefer 2-8 lines)",
    "- avoid advanced style like import sys, def solve(), and __name__ == '__main__'",
    "- prefer plain input() and print()",
    "- keep fields concise and non-empty strings",
  ].join("\n");

  for (let index = 0; index < modelCandidates.length; index += 1) {
    const model = modelCandidates[index];

    let response;
    let payload = null;

    try {
      ({ response, payload } = await requestOpenAiChatCompletion({
        apiKey: trimmedKey,
        model,
        messages: [
          {
            role: "system",
            content:
              "You create daily Python practice challenges for students. Keep solutionCode beginner-friendly and simple. Avoid import sys, def solve(), and __main__ wrappers unless absolutely necessary. Output strict JSON only with no extra keys and no markdown fences.",
          },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.55,
        maxTokens: 2200,
      }));
    } catch {
      const error = new Error("Network error while contacting OpenAI API.");
      error.code = "openai/network-error";
      throw error;
    }

    if (response.ok) {
      const text = extractOpenAiTextFromResponse(payload);
      const parsed = extractJsonPayload(text);
      const list = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.challenges)
        ? parsed.challenges
        : [];

      if (!Array.isArray(list) || list.length === 0) {
        const error = new Error("OpenAI returned invalid challenge JSON.");
        error.code = "openai/invalid-challenge-json";
        throw error;
      }

      const challenges = list.slice(0, challengeCount).map((item) => ({
        title: String(item?.title || "").trim(),
        topic: String(item?.topic || "").trim(),
        difficulty: String(item?.difficulty || "").trim(),
        statement: String(item?.statement || "").trim(),
        inputFormat: String(item?.inputFormat || "").trim(),
        outputFormat: String(item?.outputFormat || "").trim(),
        sampleInput: String(item?.sampleInput || "").trim(),
        sampleOutput: String(item?.sampleOutput || "").trim(),
        hint: String(item?.hint || "").trim(),
        solutionCode: String(item?.solutionCode || "").trim(),
      }));

      return { challenges, model };
    }

    const status = response.status;
    const message = payload?.error?.message || `OpenAI request failed with status ${status}.`;
    const httpError = buildOpenAiHttpError({ status, payload, message });

    if (shouldRetryWithNextModel(status, message) && index < modelCandidates.length - 1) {
      lastRecoverableError = httpError;
      continue;
    }

    throw httpError;
  }

  if (lastRecoverableError) {
    throw lastRecoverableError;
  }

  const error = new Error("OpenAI request failed.");
  error.code = "openai/request-failed";
  throw error;
};

const requestOpenAiDailyPythonSolution = async ({ apiKey, challenge }) => {
  const trimmedKey = String(apiKey || "").trim();
  if (!trimmedKey) {
    const error = new Error("OpenAI API key is missing.");
    error.code = "openai/missing-api-key";
    throw error;
  }

  const modelCandidates = [...OPENAI_MODEL_PREFERENCE, ...OPENAI_FALLBACK_MODELS].filter(
    (model, index, list) => list.indexOf(model) === index
  );
  let lastRecoverableError = null;

  const statement = String(challenge?.statement || "").trim();
  const inputFormat = String(challenge?.inputFormat || "").trim();
  const outputFormat = String(challenge?.outputFormat || "").trim();
  const sampleInput = String(challenge?.sampleInput || "").trim();
  const sampleOutput = String(challenge?.sampleOutput || "").trim();

  const userPrompt = [
    "Write the correct Python solution for this coding challenge.",
    "Return strict JSON only (no markdown) with this schema:",
    '{ "solutionCode": "" }',
    "",
    `Statement: ${statement}`,
    `Input format: ${inputFormat}`,
    `Output format: ${outputFormat}`,
    `Sample input: ${sampleInput}`,
    `Expected sample output: ${sampleOutput}`,
    "",
    "Rules:",
    "- solutionCode must be full executable Python",
    "- use stdin/stdout only, no input prompts",
    "- keep the code beginner-friendly and simple",
    "- avoid import sys, def solve(), and __name__ == '__main__'",
    "- prefer plain input() and print()",
    "- keep solution concise and correct",
  ].join("\n");

  for (let index = 0; index < modelCandidates.length; index += 1) {
    const model = modelCandidates[index];

    let response;
    let payload = null;

    try {
      ({ response, payload } = await requestOpenAiChatCompletion({
        apiKey: trimmedKey,
        model,
        messages: [
          {
            role: "system",
            content:
              "You generate beginner-friendly Python solutions for student coding tasks. Keep code short and simple; avoid import sys, def solve(), and __main__ wrappers. Output strict JSON only with no markdown.",
          },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.25,
        maxTokens: 1400,
      }));
    } catch {
      const error = new Error("Network error while contacting OpenAI API.");
      error.code = "openai/network-error";
      throw error;
    }

    if (response.ok) {
      const text = extractOpenAiTextFromResponse(payload);
      const parsed = extractJsonPayload(text);
      const solutionCode = String(parsed?.solutionCode || "").trim();

      if (!solutionCode) {
        const error = new Error("OpenAI returned invalid solution JSON.");
        error.code = "openai/invalid-solution-json";
        throw error;
      }

      return { solutionCode, model };
    }

    const status = response.status;
    const message = payload?.error?.message || `OpenAI request failed with status ${status}.`;
    const httpError = buildOpenAiHttpError({ status, payload, message });

    if (shouldRetryWithNextModel(status, message) && index < modelCandidates.length - 1) {
      lastRecoverableError = httpError;
      continue;
    }

    throw httpError;
  }

  if (lastRecoverableError) {
    throw lastRecoverableError;
  }

  const error = new Error("OpenAI request failed.");
  error.code = "openai/request-failed";
  throw error;
};

const requestOpenAiChat = async ({ apiKey, messages }) => {
  const trimmedKey = String(apiKey || "").trim();
  if (!trimmedKey) {
    const error = new Error("OpenAI API key is missing.");
    error.code = "openai/missing-api-key";
    throw error;
  }

  const conversationMessages = toOpenAiMessages(messages).slice(-20);
  if (conversationMessages.length === 0) {
    const error = new Error("Cannot send an empty conversation.");
    error.code = "openai/empty-conversation";
    throw error;
  }

  const systemInstructionText =
    "You are A3 Hub AI assistant for an in-app modal chat. Follow these strict rules: (1) Answer only what the user asked. Do not add unrelated sections, extra notes, or long introductions. (2) If the user asks for quiz/MCQ/test questions, return only the quiz questions; do not include answers, hints, or explanations unless the user explicitly asks. (3) If the user asks for code, return clean GitHub-flavored Markdown with a valid fenced code block; include explanation only when requested. (4) For code generation, always return complete runnable code with all required closing tags/braces/backticks and never a partial snippet unless the user explicitly asks for a partial snippet. (5) Keep output clear and well-formatted without malformed markdown.";

  const modelCandidates = [...OPENAI_MODEL_PREFERENCE, ...OPENAI_FALLBACK_MODELS].filter(
    (model, index, list) => list.indexOf(model) === index
  );
  let lastRecoverableError = null;

  const buildRequestMessages = (messagesList) => [
    { role: "system", content: systemInstructionText },
    ...messagesList,
  ];

  for (let index = 0; index < modelCandidates.length; index += 1) {
    const model = modelCandidates[index];
    let response = null;
    let payload = null;

    try {
      ({ response, payload } = await requestOpenAiChatCompletion({
        apiKey: trimmedKey,
        model,
        messages: buildRequestMessages(conversationMessages),
        temperature: 0.35,
        maxTokens: CHAT_MAX_OUTPUT_TOKENS,
      }));
    } catch {
      const error = new Error("Network error while contacting OpenAI API.");
      error.code = "openai/network-error";
      throw error;
    }

    if (response.ok) {
      let text = extractOpenAiTextFromResponse(payload);
      if (!text) {
        const error = new Error("OpenAI returned an empty answer.");
        error.code = "openai/empty-response";
        throw error;
      }

      let finishReason = extractOpenAiFinishReason(payload);
      if (finishReason !== "length") {
        return { text, model };
      }

      const lastUserPrompt = [...conversationMessages]
        .reverse()
        .find((item) => item?.role === "user" && typeof item?.content === "string")
        ?.content;

      for (let round = 0; round < CHAT_MAX_CONTINUATION_ROUNDS; round += 1) {
        const continuationMessages = [
          ...(lastUserPrompt ? [{ role: "user", content: String(lastUserPrompt).trim() }] : []),
          { role: "assistant", content: text },
          { role: "user", content: CHAT_CONTINUE_PROMPT },
        ];

        try {
          const continuationResult = await requestOpenAiChatCompletion({
            apiKey: trimmedKey,
            model,
            messages: buildRequestMessages(continuationMessages),
            temperature: 0.2,
            maxTokens: CHAT_MAX_OUTPUT_TOKENS,
          });

          if (!continuationResult.response.ok) {
            break;
          }

          const nextChunk = extractOpenAiTextFromResponse(continuationResult.payload);
          if (!nextChunk) {
            break;
          }

          text = mergeContinuationText(text, nextChunk);
          finishReason = extractOpenAiFinishReason(continuationResult.payload);

          if (finishReason !== "length") {
            break;
          }
        } catch {
          break;
        }
      }

      return { text, model };
    }

    const status = response.status;
    const message = payload?.error?.message || `OpenAI request failed with status ${status}.`;
    const httpError = buildOpenAiHttpError({ status, payload, message });

    if (shouldRetryWithNextModel(status, message) && index < modelCandidates.length - 1) {
      lastRecoverableError = httpError;
      continue;
    }

    throw httpError;
  }

  if (lastRecoverableError) {
    throw lastRecoverableError;
  }

  const error = new Error("OpenAI request failed.");
  error.code = "openai/request-failed";
  throw error;
};

const discoverSupportedModels = async (apiKey) => {
  const trimmedKey = String(apiKey || "").trim();
  if (!trimmedKey) return FALLBACK_MODELS;

  if (discoveredModelsPromise && discoveredModelsForKey === trimmedKey) {
    return discoveredModelsPromise;
  }

  discoveredModelsForKey = trimmedKey;
  discoveredModelsPromise = (async () => {
    try {
      const endpoint =
        `https://generativelanguage.googleapis.com/v1beta/models` +
        `?key=${encodeURIComponent(trimmedKey)}`;
      const response = await fetch(endpoint);
      const payload = await response.json();

      if (!response.ok) {
        return FALLBACK_MODELS;
      }

      const availableModels = Array.isArray(payload?.models)
        ? payload.models
            .filter((item) =>
              Array.isArray(item?.supportedGenerationMethods)
                ? item.supportedGenerationMethods.includes("generateContent")
                : false
            )
            .map((item) => item?.name)
        : [];

      const nextModels = prioritizeModels(availableModels);
      return nextModels.length > 0 ? nextModels : FALLBACK_MODELS;
    } catch {
      return FALLBACK_MODELS;
    }
  })();

  return discoveredModelsPromise;
};

export async function requestGeminiTopTechnicalNews({
  apiKey,
  dateKey,
  count = 3,
}) {
  const trimmedKey = normalizeApiKeyValue(apiKey);
  const topicCount = Number.isFinite(count) ? Math.max(1, Math.min(5, count)) : 3;

  if (!trimmedKey) {
    const proxyResult = await requestAiProxyAction({
      action: "topTechnicalNews",
      payload: {
        dateKey,
        count: topicCount,
      },
    });
    const topics = normalizeTopTechnicalNews(proxyResult?.topics, topicCount);
    if (topics.length === 0) {
      const error = new Error("AI server returned invalid technical news JSON.");
      error.code = "ai/invalid-tech-news-json";
      throw error;
    }
    return {
      topics,
      model: String(proxyResult?.model || "server-proxy").trim(),
    };
  }

  if (isOpenAiKey(trimmedKey)) {
    return requestOpenAiTopTechnicalNews({
      apiKey: trimmedKey,
      dateKey,
      count,
    });
  }

  const modelCandidates = await discoverSupportedModels(trimmedKey);
  let lastRecoverableError = null;

  const userPrompt = [
    `Generate exactly ${topicCount} top technical news highlights for date ${dateKey}.`,
    "Focus on software engineering, AI, cloud, cybersecurity, semiconductors, and developer tooling.",
    "Return strict JSON only (no markdown) with this schema:",
    '{ "topics": [ { "title": "", "summary": "", "source": "", "sourceUrl": "" } ] }',
    "Rules:",
    "- topics length must be exactly requested count",
    "- each summary must have 3 to 5 short lines separated by \\n",
    "- keep title and summary concise and factual",
    "- source and sourceUrl may be empty when unavailable",
  ].join("\n");

  for (let index = 0; index < modelCandidates.length; index += 1) {
    const model = modelCandidates[index];
    const endpoint =
      `https://generativelanguage.googleapis.com/v1beta/models/` +
      `${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(trimmedKey)}`;

    let response;
    let payload = null;

    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: userPrompt }],
            },
          ],
          systemInstruction: {
            parts: [
              {
                text:
                  "You generate daily technical news highlights. Output strict JSON only with no markdown and no extra keys.",
              },
            ],
          },
          generationConfig: {
            temperature: 0.35,
            topP: 0.9,
            maxOutputTokens: 1800,
          },
        }),
      });
      payload = await response.json();
    } catch {
      const error = new Error("Network error while contacting Gemini API.");
      error.code = "gemini/network-error";
      throw error;
    }

    if (response.ok) {
      const text = extractTextFromResponse(payload);
      const parsed = extractJsonPayload(text);
      const topics = normalizeTopTechnicalNews(parsed, topicCount);

      if (topics.length === 0) {
        const error = new Error("Gemini returned invalid technical news JSON.");
        error.code = "gemini/invalid-tech-news-json";
        throw error;
      }

      return { topics, model };
    }

    const status = response.status;
    const message =
      payload?.error?.message ||
      `Gemini request failed with status ${status}.`;
    const httpError = buildGeminiHttpError({ status, payload, message });

    if (shouldRetryWithNextModel(status, message) && index < modelCandidates.length - 1) {
      lastRecoverableError = httpError;
      continue;
    }

    throw httpError;
  }

  if (lastRecoverableError) {
    throw lastRecoverableError;
  }

  const error = new Error("Gemini request failed.");
  error.code = "gemini/request-failed";
  throw error;
}

export async function requestGeminiInterviewQuizAndContactPlaces({
  apiKey,
  dateKey,
  companyCount = 5,
  placeCount = 10,
}) {
  const trimmedKey = normalizeApiKeyValue(apiKey);
  const safeCompanyCount = Number.isFinite(companyCount)
    ? Math.max(1, Math.min(8, companyCount))
    : 5;
  const safePlaceCount = Number.isFinite(placeCount)
    ? Math.max(5, Math.min(15, placeCount))
    : 10;

  if (!trimmedKey) {
    const proxyResult = await requestAiProxyAction({
      action: "interviewQuizAndContactPlaces",
      payload: {
        dateKey,
        companyCount: safeCompanyCount,
        placeCount: safePlaceCount,
      },
    });
    const normalized = normalizeInterviewQuizAndContactPlaces({
      value: proxyResult,
      companyCount: safeCompanyCount,
      placeCount: safePlaceCount,
    });
    if (normalized.companies.length === 0 && normalized.contactPlaces.length === 0) {
      const error = new Error("AI server returned invalid interview quiz JSON.");
      error.code = "ai/invalid-interview-quiz-json";
      throw error;
    }
    return {
      ...normalized,
      model: String(proxyResult?.model || "server-proxy").trim(),
    };
  }

  if (isOpenAiKey(trimmedKey)) {
    return requestOpenAiInterviewQuizAndContactPlaces({
      apiKey: trimmedKey,
      dateKey,
      companyCount,
      placeCount,
    });
  }

  const modelCandidates = await discoverSupportedModels(trimmedKey);
  let lastRecoverableError = null;

  const userPrompt = [
    `Generate interview preparation data for date ${dateKey}.`,
    `Return exactly ${safeCompanyCount} top companies for interview quiz topics.`,
    `For each company, provide exactly 3 to 5 question-answer pairs.`,
    `Return exactly ${safePlaceCount} interview contact places in Tamil Nadu.`,
    "Return strict JSON only (no markdown) with schema:",
    '{ "companies": [ { "company": "", "quizTopic": "", "qa": [ { "question": "", "answer": "" } ] } ], "contactPlaces": [ { "place": "", "city": "", "description": "" } ] }',
    "Rules:",
    "- companies length must match requested count",
    "- each qa array length must be between 3 and 5",
    "- answers should be concise interview-ready lines",
    "- contactPlaces should prioritize practical interview hubs/centers in Tamil Nadu",
  ].join("\n");

  for (let index = 0; index < modelCandidates.length; index += 1) {
    const model = modelCandidates[index];
    const endpoint =
      `https://generativelanguage.googleapis.com/v1beta/models/` +
      `${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(trimmedKey)}`;

    let response;
    let payload = null;

    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: userPrompt }],
            },
          ],
          systemInstruction: {
            parts: [
              {
                text:
                  "You generate structured interview prep data for students. Output strict JSON only with no markdown and no extra keys.",
              },
            ],
          },
          generationConfig: {
            temperature: 0.35,
            topP: 0.9,
            maxOutputTokens: 2600,
          },
        }),
      });
      payload = await response.json();
    } catch {
      const error = new Error("Network error while contacting Gemini API.");
      error.code = "gemini/network-error";
      throw error;
    }

    if (response.ok) {
      const text = extractTextFromResponse(payload);
      const parsed = extractJsonPayload(text);
      const normalized = normalizeInterviewQuizAndContactPlaces({
        value: parsed,
        companyCount: safeCompanyCount,
        placeCount: safePlaceCount,
      });

      if (normalized.companies.length === 0 && normalized.contactPlaces.length === 0) {
        const error = new Error("Gemini returned invalid interview quiz JSON.");
        error.code = "gemini/invalid-interview-quiz-json";
        throw error;
      }

      return { ...normalized, model };
    }

    const status = response.status;
    const message =
      payload?.error?.message ||
      `Gemini request failed with status ${status}.`;
    const httpError = buildGeminiHttpError({ status, payload, message });

    if (shouldRetryWithNextModel(status, message) && index < modelCandidates.length - 1) {
      lastRecoverableError = httpError;
      continue;
    }

    throw httpError;
  }

  if (lastRecoverableError) {
    throw lastRecoverableError;
  }

  const error = new Error("Gemini request failed.");
  error.code = "gemini/request-failed";
  throw error;
}

export async function requestGeminiDailyPythonChallenges({
  apiKey,
  dateKey,
  count = 5,
}) {
  const trimmedKey = normalizeApiKeyValue(apiKey);
  const challengeCount = Number.isFinite(count) ? Math.max(1, Math.min(5, count)) : 5;

  if (!trimmedKey) {
    const proxyResult = await requestAiProxyAction({
      action: "dailyPythonChallenges",
      payload: {
        dateKey,
        count: challengeCount,
      },
    });
    const list = Array.isArray(proxyResult?.challenges)
      ? proxyResult.challenges
      : Array.isArray(proxyResult)
      ? proxyResult
      : [];
    if (list.length === 0) {
      const error = new Error("AI server returned invalid challenge JSON.");
      error.code = "ai/invalid-challenge-json";
      throw error;
    }
    const challenges = list.slice(0, challengeCount).map((item) => ({
      title: String(item?.title || "").trim(),
      topic: String(item?.topic || "").trim(),
      difficulty: String(item?.difficulty || "").trim(),
      statement: String(item?.statement || "").trim(),
      inputFormat: String(item?.inputFormat || "").trim(),
      outputFormat: String(item?.outputFormat || "").trim(),
      sampleInput: String(item?.sampleInput || "").trim(),
      sampleOutput: String(item?.sampleOutput || "").trim(),
      hint: String(item?.hint || "").trim(),
      solutionCode: String(item?.solutionCode || "").trim(),
    }));
    return {
      challenges,
      model: String(proxyResult?.model || "server-proxy").trim(),
    };
  }

  if (isOpenAiKey(trimmedKey)) {
    return requestOpenAiDailyPythonChallenges({
      apiKey: trimmedKey,
      dateKey,
      count,
    });
  }

  const modelCandidates = await discoverSupportedModels(trimmedKey);
  let lastRecoverableError = null;

  const userPrompt = [
    `Generate exactly ${challengeCount} unique daily Python coding challenges for date ${dateKey}.`,
    "Each challenge must be beginner to medium level and executable with stdin/stdout only.",
    "Return JSON only (no markdown) using this schema:",
    '{ "challenges": [ { "title": "", "topic": "", "difficulty": "", "statement": "", "inputFormat": "", "outputFormat": "", "sampleInput": "", "sampleOutput": "", "hint": "", "solutionCode": "" } ] }',
    "Rules:",
    "- challenges array length must be exactly requested count",
    "- sampleOutput must exactly match running solutionCode with sampleInput",
    "- solutionCode must be complete valid Python and should not use input prompts",
    "- solutionCode must be beginner-friendly and short (prefer 2-8 lines)",
    "- avoid advanced style like import sys, def solve(), and __name__ == '__main__'",
    "- prefer plain input() and print()",
    "- keep fields concise and non-empty strings",
  ].join("\n");

  for (let index = 0; index < modelCandidates.length; index += 1) {
    const model = modelCandidates[index];
    const endpoint =
      `https://generativelanguage.googleapis.com/v1beta/models/` +
      `${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(trimmedKey)}`;

    let response;
    let payload = null;

    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: userPrompt }],
            },
          ],
          systemInstruction: {
            parts: [
              {
                text:
                  "You create daily Python practice challenges for students. Keep solutionCode beginner-friendly and simple. Avoid import sys, def solve(), and __main__ wrappers unless absolutely necessary. Output strict JSON only with no extra keys and no markdown fences.",
              },
            ],
          },
          generationConfig: {
            temperature: 0.55,
            topP: 0.9,
            maxOutputTokens: 2200,
          },
        }),
      });
      payload = await response.json();
    } catch {
      const error = new Error("Network error while contacting Gemini API.");
      error.code = "gemini/network-error";
      throw error;
    }

    if (response.ok) {
      const text = extractTextFromResponse(payload);
      const parsed = extractJsonPayload(text);
      const list = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.challenges)
        ? parsed.challenges
        : [];

      if (!Array.isArray(list) || list.length === 0) {
        const error = new Error("Gemini returned invalid challenge JSON.");
        error.code = "gemini/invalid-challenge-json";
        throw error;
      }

      const challenges = list.slice(0, challengeCount).map((item) => ({
        title: String(item?.title || "").trim(),
        topic: String(item?.topic || "").trim(),
        difficulty: String(item?.difficulty || "").trim(),
        statement: String(item?.statement || "").trim(),
        inputFormat: String(item?.inputFormat || "").trim(),
        outputFormat: String(item?.outputFormat || "").trim(),
        sampleInput: String(item?.sampleInput || "").trim(),
        sampleOutput: String(item?.sampleOutput || "").trim(),
        hint: String(item?.hint || "").trim(),
        solutionCode: String(item?.solutionCode || "").trim(),
      }));

      return { challenges, model };
    }

    const status = response.status;
    const message =
      payload?.error?.message ||
      `Gemini request failed with status ${status}.`;
    const httpError = buildGeminiHttpError({ status, payload, message });

    if (shouldRetryWithNextModel(status, message) && index < modelCandidates.length - 1) {
      lastRecoverableError = httpError;
      continue;
    }

    throw httpError;
  }

  if (lastRecoverableError) {
    throw lastRecoverableError;
  }

  const error = new Error("Gemini request failed.");
  error.code = "gemini/request-failed";
  throw error;
}

export async function requestGeminiDailyPythonSolution({
  apiKey,
  challenge,
}) {
  const trimmedKey = normalizeApiKeyValue(apiKey);

  if (!trimmedKey) {
    const proxyResult = await requestAiProxyAction({
      action: "dailyPythonSolution",
      payload: {
        challenge,
      },
    });
    const solutionCode = String(proxyResult?.solutionCode || "").trim();
    if (!solutionCode) {
      const error = new Error("AI server returned invalid solution JSON.");
      error.code = "ai/invalid-solution-json";
      throw error;
    }
    return {
      solutionCode,
      model: String(proxyResult?.model || "server-proxy").trim(),
    };
  }

  if (isOpenAiKey(trimmedKey)) {
    return requestOpenAiDailyPythonSolution({
      apiKey: trimmedKey,
      challenge,
    });
  }

  const modelCandidates = await discoverSupportedModels(trimmedKey);
  let lastRecoverableError = null;

  const statement = String(challenge?.statement || "").trim();
  const inputFormat = String(challenge?.inputFormat || "").trim();
  const outputFormat = String(challenge?.outputFormat || "").trim();
  const sampleInput = String(challenge?.sampleInput || "").trim();
  const sampleOutput = String(challenge?.sampleOutput || "").trim();

  const userPrompt = [
    "Write the correct Python solution for this coding challenge.",
    "Return strict JSON only (no markdown) with this schema:",
    '{ "solutionCode": "" }',
    "",
    `Statement: ${statement}`,
    `Input format: ${inputFormat}`,
    `Output format: ${outputFormat}`,
    `Sample input: ${sampleInput}`,
    `Expected sample output: ${sampleOutput}`,
    "",
    "Rules:",
    "- solutionCode must be full executable Python",
    "- use stdin/stdout only, no input prompts",
    "- keep the code beginner-friendly and simple",
    "- avoid import sys, def solve(), and __name__ == '__main__'",
    "- prefer plain input() and print()",
    "- keep solution concise and correct",
  ].join("\n");

  for (let index = 0; index < modelCandidates.length; index += 1) {
    const model = modelCandidates[index];
    const endpoint =
      `https://generativelanguage.googleapis.com/v1beta/models/` +
      `${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(trimmedKey)}`;

    let response;
    let payload = null;

    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: userPrompt }],
            },
          ],
          systemInstruction: {
            parts: [
              {
                text:
                  "You generate beginner-friendly Python solutions for student coding tasks. Keep code short and simple; avoid import sys, def solve(), and __main__ wrappers. Output strict JSON only with no markdown.",
              },
            ],
          },
          generationConfig: {
            temperature: 0.25,
            topP: 0.9,
            maxOutputTokens: 1400,
          },
        }),
      });
      payload = await response.json();
    } catch {
      const error = new Error("Network error while contacting Gemini API.");
      error.code = "gemini/network-error";
      throw error;
    }

    if (response.ok) {
      const text = extractTextFromResponse(payload);
      const parsed = extractJsonPayload(text);
      const solutionCode = String(parsed?.solutionCode || "").trim();

      if (!solutionCode) {
        const error = new Error("Gemini returned invalid solution JSON.");
        error.code = "gemini/invalid-solution-json";
        throw error;
      }

      return { solutionCode, model };
    }

    const status = response.status;
    const message =
      payload?.error?.message ||
      `Gemini request failed with status ${status}.`;
    const httpError = buildGeminiHttpError({ status, payload, message });

    if (shouldRetryWithNextModel(status, message) && index < modelCandidates.length - 1) {
      lastRecoverableError = httpError;
      continue;
    }

    throw httpError;
  }

  if (lastRecoverableError) {
    throw lastRecoverableError;
  }

  const error = new Error("Gemini request failed.");
  error.code = "gemini/request-failed";
  throw error;
}

export async function requestGeminiChat({ apiKey, messages }) {
  const trimmedKey = normalizeApiKeyValue(apiKey);

  if (!trimmedKey) {
    const proxyResult = await requestAiProxyAction({
      action: "chat",
      payload: {
        messages,
      },
    });
    const text = String(proxyResult?.text || "").trim();
    if (!text) {
      const error = new Error("AI server returned an empty answer.");
      error.code = "ai/empty-response";
      throw error;
    }
    return {
      text,
      model: String(proxyResult?.model || "server-proxy").trim(),
    };
  }

  if (isOpenAiKey(trimmedKey)) {
    return requestOpenAiChat({
      apiKey: trimmedKey,
      messages,
    });
  }

  const contents = toGeminiContents(messages).slice(-20);
  if (contents.length === 0) {
    const error = new Error("Cannot send an empty conversation.");
    error.code = "gemini/empty-conversation";
    throw error;
  }

  const modelCandidates = await discoverSupportedModels(trimmedKey);
  let lastRecoverableError = null;
  const systemInstructionText =
    "You are A3 Hub AI assistant for an in-app modal chat. Follow these strict rules: (1) Answer only what the user asked. Do not add unrelated sections, extra notes, or long introductions. (2) If the user asks for quiz/MCQ/test questions, return only the quiz questions; do not include answers, hints, or explanations unless the user explicitly asks. (3) If the user asks for code, return clean GitHub-flavored Markdown with a valid fenced code block; include explanation only when requested. (4) For code generation, always return complete runnable code with all required closing tags/braces/backticks and never a partial snippet unless the user explicitly asks for a partial snippet. (5) Keep output clear and well-formatted without malformed markdown.";

  const requestChatChunk = async (endpoint, requestContents, temperature = 0.35) => {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: requestContents,
        systemInstruction: {
          parts: [
            {
              text: systemInstructionText,
            },
          ],
        },
        generationConfig: {
          temperature,
          topP: 0.9,
          maxOutputTokens: CHAT_MAX_OUTPUT_TOKENS,
        },
      }),
    });
    const payload = await response.json();
    return { response, payload };
  };

  for (let index = 0; index < modelCandidates.length; index += 1) {
    const model = modelCandidates[index];
    const endpoint =
      `https://generativelanguage.googleapis.com/v1beta/models/` +
      `${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(trimmedKey)}`;

    let response = null;
    let payload = null;

    try {
      ({ response, payload } = await requestChatChunk(endpoint, contents, 0.35));
    } catch {
      const error = new Error("Network error while contacting Gemini API.");
      error.code = "gemini/network-error";
      throw error;
    }

    if (response.ok) {
      let text = extractTextFromResponse(payload);
      if (!text) {
        const error = new Error("Gemini returned an empty answer.");
        error.code = "gemini/empty-response";
        throw error;
      }

      let finishReason = extractFinishReason(payload);
      if (finishReason !== "MAX_TOKENS") {
        return { text, model };
      }

      const lastUserPrompt = [...contents]
        .reverse()
        .find((item) => item?.role === "user" && typeof item?.parts?.[0]?.text === "string")
        ?.parts?.[0]?.text;

      for (let round = 0; round < CHAT_MAX_CONTINUATION_ROUNDS; round += 1) {
        const continuationContents = [
          ...(lastUserPrompt
            ? [{ role: "user", parts: [{ text: String(lastUserPrompt).trim() }] }]
            : []),
          { role: "model", parts: [{ text }] },
          { role: "user", parts: [{ text: CHAT_CONTINUE_PROMPT }] },
        ];

        try {
          const continuationResult = await requestChatChunk(
            endpoint,
            continuationContents,
            0.2
          );

          if (!continuationResult.response.ok) {
            break;
          }

          const nextChunk = extractTextFromResponse(continuationResult.payload);
          if (!nextChunk) {
            break;
          }

          text = mergeContinuationText(text, nextChunk);
          finishReason = extractFinishReason(continuationResult.payload);

          if (finishReason !== "MAX_TOKENS") {
            break;
          }
        } catch {
          break;
        }
      }

      return { text, model };
    }

    const status = response.status;
    const message =
      payload?.error?.message ||
      `Gemini request failed with status ${status}.`;

    const httpError = buildGeminiHttpError({ status, payload, message });

    if (shouldRetryWithNextModel(status, message) && index < modelCandidates.length - 1) {
      lastRecoverableError = httpError;
      continue;
    }

    throw httpError;
  }

  if (lastRecoverableError) {
    throw lastRecoverableError;
  }

  const error = new Error("Gemini request failed.");
  error.code = "gemini/request-failed";
  throw error;
}

