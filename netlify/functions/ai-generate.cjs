const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const OPENAI_CHAT_ENDPOINT = "https://api.openai.com/v1/chat/completions";
const GEMINI_MODEL_PREFERENCE = [
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
  "gemini-1.5-flash",
  "gemini-1.5-flash-8b",
];
const OPENAI_MODEL_PREFERENCE = ["gpt-4.1-mini", "gpt-4o-mini", "gpt-4o"];
const REQUEST_TIMEOUT_MS = 25000;
const MAX_BODY_BYTES = 256000;
const {
  enforceFunctionGuard,
  resolveAllowedRoles,
  toPositiveInteger,
} = require("./_utils/request-guard.cjs");
const {
  runWithCapacityGuard,
  toPositiveInteger: toCapacityPositiveInteger,
} = require("./_utils/capacity-guard.cjs");

const toSafeText = (value) => (typeof value === "string" ? value.trim() : "");
const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const clamp = (value, min, max, fallback) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
};

const jsonResponse = (statusCode, payload) => ({
  statusCode,
  headers: {
    "content-type": "application/json",
    "cache-control": "no-store",
  },
  body: JSON.stringify(payload),
});

const parseEventBody = (event) => {
  const raw = toSafeText(event?.body);
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
};

const parseJsonSafe = (value) => {
  try {
    return value ? JSON.parse(value) : {};
  } catch {
    return {};
  }
};

const extractJsonPayload = (text) => {
  const raw = String(text || "").trim();
  if (!raw) return null;

  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() || raw;

  try {
    return JSON.parse(candidate);
  } catch {
    // Continue best-effort extraction.
  }

  const firstBrace = candidate.indexOf("{");
  const lastBrace = candidate.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    try {
      return JSON.parse(candidate.slice(firstBrace, lastBrace + 1));
    } catch {
      // Ignore and try array extraction.
    }
  }

  const firstBracket = candidate.indexOf("[");
  const lastBracket = candidate.lastIndexOf("]");
  if (firstBracket >= 0 && lastBracket > firstBracket) {
    try {
      return JSON.parse(candidate.slice(firstBracket, lastBracket + 1));
    } catch {
      return null;
    }
  }

  return null;
};

const normalizeModelName = (value) =>
  String(value || "")
    .trim()
    .replace(/^models\//, "");

const toConversationMessages = (messages) =>
  (Array.isArray(messages) ? messages : [])
    .map((item) => ({
      role: toSafeText(item?.role).toLowerCase() === "assistant" ? "assistant" : "user",
      text: toSafeText(item?.payloadText || item?.text),
    }))
    .filter((item) => item.text.length > 0)
    .slice(-20);

const toGeminiContents = (messages) =>
  toConversationMessages(messages).map((item) => ({
    role: item.role === "assistant" ? "model" : "user",
    parts: [{ text: item.text }],
  }));

const toOpenAiMessages = (messages) =>
  toConversationMessages(messages).map((item) => ({
    role: item.role,
    content: item.text,
  }));

const extractGeminiText = (payload) => {
  const parts = payload?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return "";
  return parts
    .map((part) => (typeof part?.text === "string" ? part.text : ""))
    .join("")
    .trim();
};

const extractOpenAiText = (payload) => {
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

const timeoutFetch = async (url, options = {}) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
};

const getConfiguredProvider = () => {
  const preferred = toSafeText(process.env.AI_PROVIDER).toLowerCase();
  const hasGemini = Boolean(toSafeText(process.env.GEMINI_API_KEY));
  const hasOpenAi = Boolean(toSafeText(process.env.OPENAI_API_KEY));

  if (preferred === "openai" && hasOpenAi) return "openai";
  if (preferred === "gemini" && hasGemini) return "gemini";
  if (hasGemini) return "gemini";
  if (hasOpenAi) return "openai";
  return "";
};

const shouldRetryWithNextModel = (status, message) => {
  const normalized = String(message || "").toLowerCase();
  if ([400, 404, 429].includes(Number(status || 0))) return true;
  if (normalized.includes("model") && normalized.includes("not found")) return true;
  if (normalized.includes("unsupported") && normalized.includes("model")) return true;
  return false;
};

const requestGeminiCompletion = async ({
  apiKey,
  systemInstruction = "",
  userPrompt = "",
  messages = [],
  temperature = 0.35,
  maxOutputTokens = 2048,
}) => {
  const messageContents = toGeminiContents(messages);
  const contents =
    messageContents.length > 0
      ? messageContents
      : [
          {
            role: "user",
            parts: [{ text: String(userPrompt || "").trim() }],
          },
        ];

  const models = Array.from(
    new Set(
      [toSafeText(process.env.GEMINI_MODEL), ...GEMINI_MODEL_PREFERENCE].filter(Boolean)
    )
  );

  let lastError = null;
  for (let index = 0; index < models.length; index += 1) {
    const model = normalizeModelName(models[index]);
    const endpoint =
      `${GEMINI_BASE_URL}/models/${encodeURIComponent(model)}:generateContent` +
      `?key=${encodeURIComponent(apiKey)}`;

    const response = await timeoutFetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        contents,
        ...(toSafeText(systemInstruction)
          ? {
              systemInstruction: {
                parts: [{ text: String(systemInstruction).trim() }],
              },
            }
          : {}),
        generationConfig: {
          temperature,
          topP: 0.9,
          maxOutputTokens,
        },
      }),
    });

    const rawText = await response.text();
    const payload = parseJsonSafe(rawText);
    if (response.ok) {
      const text = extractGeminiText(payload);
      if (!text) {
        lastError = new Error("Gemini returned empty content.");
        lastError.status = 502;
        lastError.code = "gemini/empty-response";
        continue;
      }
      return { text, model, provider: "gemini" };
    }

    const message =
      toSafeText(payload?.error?.message) ||
      `Gemini request failed with status ${response.status}.`;
    const error = new Error(message);
    error.status = response.status || 500;
    error.code = toSafeText(payload?.error?.status) || `gemini/http-${response.status}`;
    lastError = error;

    if (!shouldRetryWithNextModel(response.status, message)) {
      throw error;
    }
  }

  if (lastError) throw lastError;
  const error = new Error("Gemini request failed.");
  error.status = 502;
  error.code = "gemini/request-failed";
  throw error;
};

const requestOpenAiCompletion = async ({
  apiKey,
  systemInstruction = "",
  userPrompt = "",
  messages = [],
  temperature = 0.35,
  maxOutputTokens = 2048,
}) => {
  const contentMessages = toOpenAiMessages(messages);
  const baseMessages =
    contentMessages.length > 0
      ? contentMessages
      : [{ role: "user", content: String(userPrompt || "").trim() }];
  const openAiMessages = toSafeText(systemInstruction)
    ? [{ role: "system", content: String(systemInstruction).trim() }, ...baseMessages]
    : baseMessages;

  const models = Array.from(
    new Set(
      [toSafeText(process.env.OPENAI_MODEL), ...OPENAI_MODEL_PREFERENCE].filter(Boolean)
    )
  );

  let lastError = null;
  for (let index = 0; index < models.length; index += 1) {
    const model = models[index];
    const response = await timeoutFetch(OPENAI_CHAT_ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: openAiMessages,
        temperature,
        max_tokens: maxOutputTokens,
      }),
    });

    const rawText = await response.text();
    const payload = parseJsonSafe(rawText);
    if (response.ok) {
      const text = extractOpenAiText(payload);
      if (!text) {
        lastError = new Error("OpenAI returned empty content.");
        lastError.status = 502;
        lastError.code = "openai/empty-response";
        continue;
      }
      return { text, model, provider: "openai" };
    }

    const message =
      toSafeText(payload?.error?.message) ||
      `OpenAI request failed with status ${response.status}.`;
    const error = new Error(message);
    error.status = response.status || 500;
    error.code = toSafeText(payload?.error?.code) || `openai/http-${response.status}`;
    lastError = error;

    if (!shouldRetryWithNextModel(response.status, message)) {
      throw error;
    }
  }

  if (lastError) throw lastError;
  const error = new Error("OpenAI request failed.");
  error.status = 502;
  error.code = "openai/request-failed";
  throw error;
};

const requestModelText = async (options) => {
  const provider = getConfiguredProvider();
  if (!provider) {
    const error = new Error("AI server keys are not configured.");
    error.status = 500;
    error.code = "ai/missing-server-config";
    error.userMessage =
      "AI server is not configured. Set GEMINI_API_KEY or OPENAI_API_KEY in Netlify environment.";
    throw error;
  }

  if (provider === "gemini") {
    return requestGeminiCompletion({
      ...options,
      apiKey: toSafeText(process.env.GEMINI_API_KEY),
    });
  }

  return requestOpenAiCompletion({
    ...options,
    apiKey: toSafeText(process.env.OPENAI_API_KEY),
  });
};

const toSingleLine = (value) =>
  String(value || "")
    .replace(/\r/g, "")
    .replace(/\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const toLineList = (value) =>
  String(value || "")
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

const normalizeInterviewQa = (value, fallbackPrefix = "Question") => {
  const list = Array.isArray(value)
    ? value
    : value && typeof value === "object"
    ? Object.entries(value).map(([question, answer]) => ({ question, answer }))
    : [];

  return list
    .map((item, index) => {
      if (typeof item === "string") {
        const line = toSingleLine(item);
        if (!line) return null;
        return {
          question: `${fallbackPrefix} ${index + 1}`,
          answer: line,
        };
      }
      const question = toSingleLine(item?.question || item?.q || `Question ${index + 1}`);
      const answer = toSingleLine(item?.answer || item?.a || item?.details || item?.solution);
      if (!answer) return null;
      return {
        question: question || `Question ${index + 1}`,
        answer,
      };
    })
    .filter(Boolean)
    .slice(0, 5);
};

const handleChatAction = async (payload) => {
  const messages = toConversationMessages(payload?.messages);
  if (messages.length === 0) {
    const error = new Error("Cannot send an empty conversation.");
    error.status = 400;
    error.code = "ai/empty-conversation";
    throw error;
  }

  const systemInstruction =
    "You are CKCET Hub AI assistant for an in-app modal chat. Follow these strict rules: (1) Answer only what the user asked. Do not add unrelated sections, extra notes, or long introductions. (2) If the user asks for quiz/MCQ/test questions, return only the quiz questions; do not include answers, hints, or explanations unless the user explicitly asks. (3) If the user asks for code, return clean GitHub-flavored Markdown with a valid fenced code block; include explanation only when requested. (4) For code generation, always return complete runnable code with all required closing tags/braces/backticks and never a partial snippet unless the user explicitly asks for a partial snippet. (5) Keep output clear and well-formatted without malformed markdown.";

  const result = await requestModelText({
    messages,
    systemInstruction,
    temperature: 0.35,
    maxOutputTokens: 4096,
  });

  return {
    text: String(result.text || "").trim(),
    model: result.model,
    provider: result.provider,
  };
};

const handleTopTechnicalNewsAction = async (payload) => {
  const topicCount = clamp(payload?.count, 1, 5, 3);
  const dateKey = toSafeText(payload?.dateKey) || new Date().toISOString().slice(0, 10);

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

  const result = await requestModelText({
    userPrompt,
    systemInstruction:
      "You generate daily technical news highlights. Output strict JSON only with no markdown and no extra keys.",
    temperature: 0.35,
    maxOutputTokens: 1800,
  });

  const parsed = extractJsonPayload(result.text);
  const list = Array.isArray(parsed?.topics)
    ? parsed.topics
    : Array.isArray(parsed)
    ? parsed
    : [];

  const topics = list
    .map((item) => ({
      title: toSingleLine(item?.title || item?.headline),
      summary: toLineList(item?.summary || item?.description || item?.details)
        .slice(0, 5)
        .join("\n"),
      source: toSingleLine(item?.source || item?.publisher),
      sourceUrl: toSafeText(item?.sourceUrl || item?.url || item?.link),
    }))
    .filter((item) => item.title && item.summary)
    .slice(0, topicCount);

  if (topics.length === 0) {
    const error = new Error("AI server returned invalid technical news JSON.");
    error.status = 502;
    error.code = "ai/invalid-tech-news-json";
    throw error;
  }

  return {
    topics,
    model: result.model,
    provider: result.provider,
  };
};

const handleInterviewQuizAction = async (payload) => {
  const dateKey = toSafeText(payload?.dateKey) || new Date().toISOString().slice(0, 10);
  const companyCount = clamp(payload?.companyCount, 1, 8, 5);
  const placeCount = clamp(payload?.placeCount, 5, 15, 10);

  const userPrompt = [
    `Generate interview preparation data for date ${dateKey}.`,
    `Return exactly ${companyCount} top companies for interview quiz topics.`,
    "For each company, provide exactly 3 to 5 question-answer pairs.",
    `Return exactly ${placeCount} interview contact places in Tamil Nadu.`,
    "Return strict JSON only (no markdown) with schema:",
    '{ "companies": [ { "company": "", "quizTopic": "", "qa": [ { "question": "", "answer": "" } ] } ], "contactPlaces": [ { "place": "", "city": "", "description": "" } ] }',
    "Rules:",
    "- companies length must match requested count",
    "- each qa array length must be between 3 and 5",
    "- answers should be concise interview-ready lines",
    "- contactPlaces should prioritize practical interview hubs/centers in Tamil Nadu",
  ].join("\n");

  const result = await requestModelText({
    userPrompt,
    systemInstruction:
      "You generate structured interview prep data for students. Output strict JSON only with no markdown and no extra keys.",
    temperature: 0.35,
    maxOutputTokens: 2600,
  });

  const parsed = extractJsonPayload(result.text) || {};
  const companiesRaw = Array.isArray(parsed?.companies) ? parsed.companies : [];
  const placesRaw = Array.isArray(parsed?.contactPlaces) ? parsed.contactPlaces : [];

  const companies = companiesRaw
    .map((item) => ({
      company: toSingleLine(item?.company || item?.name || item?.organization),
      quizTopic: toSingleLine(item?.quizTopic || item?.topic || "Interview fundamentals"),
      qa: normalizeInterviewQa(item?.qa || item?.questions || item?.answers),
    }))
    .filter((item) => item.company && item.qa.length > 0)
    .slice(0, companyCount);

  const contactPlaces = placesRaw
    .map((item) => ({
      place: toSingleLine(item?.place || item?.name || item?.venue),
      city: toSingleLine(item?.city || item?.location || "Tamil Nadu"),
      description: toSingleLine(item?.description || item?.about || item?.details),
    }))
    .filter((item) => item.place)
    .slice(0, placeCount);

  if (companies.length === 0 && contactPlaces.length === 0) {
    const error = new Error("AI server returned invalid interview quiz JSON.");
    error.status = 502;
    error.code = "ai/invalid-interview-quiz-json";
    throw error;
  }

  return {
    companies,
    contactPlaces,
    model: result.model,
    provider: result.provider,
  };
};

const normalizeChallengeItem = (item) => ({
  title: toSingleLine(item?.title),
  topic: toSingleLine(item?.topic || "Python"),
  difficulty: toSingleLine(item?.difficulty || "Medium"),
  statement: toSafeText(item?.statement),
  inputFormat: toSafeText(item?.inputFormat),
  outputFormat: toSafeText(item?.outputFormat),
  sampleInput: toSafeText(item?.sampleInput),
  sampleOutput: toSafeText(item?.sampleOutput),
  hint: toSafeText(item?.hint),
  solutionCode: toSafeText(item?.solutionCode),
});

const handleDailyPythonChallengesAction = async (payload) => {
  const dateKey = toSafeText(payload?.dateKey) || new Date().toISOString().slice(0, 10);
  const count = clamp(payload?.count, 1, 5, 5);

  const userPrompt = [
    `Generate exactly ${count} unique daily Python coding challenges for date ${dateKey}.`,
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

  const result = await requestModelText({
    userPrompt,
    systemInstruction:
      "You create daily Python practice challenges for students. Keep solutionCode beginner-friendly and simple. Avoid import sys, def solve(), and __main__ wrappers unless absolutely necessary. Output strict JSON only with no extra keys and no markdown fences.",
    temperature: 0.55,
    maxOutputTokens: 2200,
  });

  const parsed = extractJsonPayload(result.text) || {};
  const list = Array.isArray(parsed?.challenges)
    ? parsed.challenges
    : Array.isArray(parsed)
    ? parsed
    : [];

  const challenges = list
    .map(normalizeChallengeItem)
    .filter((item) => item.title && item.statement && item.solutionCode)
    .slice(0, count);

  if (challenges.length === 0) {
    const error = new Error("AI server returned invalid challenge JSON.");
    error.status = 502;
    error.code = "ai/invalid-challenge-json";
    throw error;
  }

  return {
    challenges,
    model: result.model,
    provider: result.provider,
  };
};

const handleDailyPythonSolutionAction = async (payload) => {
  const challenge = payload?.challenge || {};
  const statement = toSafeText(challenge?.statement);
  const inputFormat = toSafeText(challenge?.inputFormat);
  const outputFormat = toSafeText(challenge?.outputFormat);
  const sampleInput = toSafeText(challenge?.sampleInput);
  const sampleOutput = toSafeText(challenge?.sampleOutput);

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

  const result = await requestModelText({
    userPrompt,
    systemInstruction:
      "You generate beginner-friendly Python solutions for student coding tasks. Keep code short and simple; avoid import sys, def solve(), and __main__ wrappers. Output strict JSON only with no markdown.",
    temperature: 0.25,
    maxOutputTokens: 1400,
  });

  const parsed = extractJsonPayload(result.text);
  const solutionCode = toSafeText(parsed?.solutionCode || result.text);
  if (!solutionCode) {
    const error = new Error("AI server returned invalid solution JSON.");
    error.status = 502;
    error.code = "ai/invalid-solution-json";
    throw error;
  }

  return {
    solutionCode,
    model: result.model,
    provider: result.provider,
  };
};

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { ok: false, error: "Method not allowed" });
  }

  return runWithCapacityGuard(
    {
      functionName: "ai-generate",
      maxConcurrent: toCapacityPositiveInteger(
        process.env.AI_GENERATE_MAX_CONCURRENCY,
        40
      ),
      maxQueueSize: toCapacityPositiveInteger(
        process.env.AI_GENERATE_MAX_QUEUE_SIZE,
        120
      ),
      maxQueueWaitMs: toCapacityPositiveInteger(
        process.env.AI_GENERATE_MAX_QUEUE_WAIT_MS,
        15000
      ),
      buildBusyResponse: (capacityError) =>
        jsonResponse(503, {
          ok: false,
          error: "AI service is busy. Please retry shortly.",
          code: "capacity/overloaded",
          reason: capacityError.reason || "queue_full",
          retryAfterSeconds: capacityError.retryAfterSeconds || 1,
        }),
    },
    async () => {
      const bodySize = String(event?.body || "").length;
      if (bodySize > MAX_BODY_BYTES) {
        return jsonResponse(413, {
          ok: false,
          error: "Request payload too large.",
          code: "ai/request-too-large",
        });
      }

      const guard = await enforceFunctionGuard(event, {
        functionName: "ai-generate",
        rateLimitMax: toPositiveInteger(
          process.env.AI_GENERATE_RATE_LIMIT_MAX,
          45
        ),
        rateLimitWindowMs: toPositiveInteger(
          process.env.AI_GENERATE_RATE_LIMIT_WINDOW_MS,
          60 * 1000
        ),
        allowedRoles: resolveAllowedRoles(process.env.AI_GENERATE_ALLOWED_ROLES, [
          "student",
          "staff",
          "parent",
          "admin",
        ]),
      });
      if (!guard.ok) {
        return guard.response;
      }

      const body = parseEventBody(event);
      const action = toSafeText(body?.action);
      const payload =
        body?.payload && typeof body.payload === "object" && !Array.isArray(body.payload)
          ? body.payload
          : {};

      if (!action) {
        return jsonResponse(400, {
          ok: false,
          error: "Invalid payload. 'action' is required.",
          code: "ai/missing-action",
        });
      }

      try {
        let result = null;

        if (action === "chat") {
          result = await handleChatAction(payload);
        } else if (action === "topTechnicalNews") {
          result = await handleTopTechnicalNewsAction(payload);
        } else if (action === "interviewQuizAndContactPlaces") {
          result = await handleInterviewQuizAction(payload);
        } else if (action === "dailyPythonChallenges") {
          result = await handleDailyPythonChallengesAction(payload);
        } else if (action === "dailyPythonSolution") {
          result = await handleDailyPythonSolutionAction(payload);
        } else {
          return jsonResponse(400, {
            ok: false,
            error: `Unsupported action: ${action}`,
            code: "ai/unsupported-action",
          });
        }

        return jsonResponse(200, {
          ok: true,
          ...result,
        });
      } catch (error) {
        return jsonResponse(toNumber(error?.status, 500), {
          ok: false,
          error: toSafeText(error?.message) || "AI request failed.",
          code: toSafeText(error?.code) || "ai/request-failed",
          userMessage: toSafeText(error?.userMessage),
        });
      }
    }
  );
};
