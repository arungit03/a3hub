const DEFAULT_PISTON_BASE_URL = "https://emkc.org/api/v2/piston";
const REQUEST_TIMEOUT_MS = 20000;
const MAX_SOURCE_LENGTH = 120000;
const MAX_STDIN_LENGTH = 24000;
const {
  enforceFunctionGuard,
  resolveAllowedRoles,
  toPositiveInteger,
} = require("./_utils/request-guard.cjs");
const {
  invokeJsonWebhook,
  parseJsonSafe,
  runProviderChain,
  selectProviderOrder,
  toSafeText,
} = require("./_utils/provider-chain.cjs");
const {
  runWithCapacityGuard,
  toPositiveInteger: toCapacityPositiveInteger,
} = require("./_utils/capacity-guard.cjs");

const LANGUAGE_CONFIG = {
  c: {
    aliases: new Set(["c"]),
    fileName: "main.c",
    fallbackVersions: ["10.2.0", "11.1.0"],
  },
  cpp: {
    aliases: new Set(["cpp", "c++", "cxx"]),
    fileName: "main.cpp",
    fallbackVersions: ["10.2.0", "17.0.1"],
  },
};

const parseEventBody = (event) => {
  const bodyText = toSafeText(event?.body);
  if (!bodyText) return {};
  try {
    return JSON.parse(bodyText);
  } catch {
    return {};
  }
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

const compareVersions = (a, b) => {
  const left = String(a || "").split(".").map((part) => Number(part) || 0);
  const right = String(b || "").split(".").map((part) => Number(part) || 0);
  const maxLength = Math.max(left.length, right.length);
  for (let index = 0; index < maxLength; index += 1) {
    const l = left[index] || 0;
    const r = right[index] || 0;
    if (l !== r) return l - r;
  }
  return 0;
};

const selectRuntime = (runtimes, languageKey) => {
  const config = LANGUAGE_CONFIG[languageKey];
  if (!config) return null;

  const filtered = Array.isArray(runtimes)
    ? runtimes.filter((entry) =>
        config.aliases.has(String(entry?.language || "").toLowerCase())
      )
    : [];

  if (filtered.length > 0) {
    const sorted = [...filtered].sort((a, b) =>
      compareVersions(String(b?.version || ""), String(a?.version || ""))
    );
    return sorted[0];
  }

  if (config.fallbackVersions.length === 0) return null;
  return {
    language: languageKey,
    version: config.fallbackVersions[0],
  };
};

const buildResponse = (statusCode, payload) => ({
  statusCode,
  headers: {
    "content-type": "application/json",
  },
  body: JSON.stringify(payload),
});

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return buildResponse(405, { error: "Method not allowed" });
  }

  return runWithCapacityGuard(
    {
      functionName: "code-run",
      maxConcurrent: toCapacityPositiveInteger(
        process.env.CODE_RUN_MAX_CONCURRENCY,
        30
      ),
      maxQueueSize: toCapacityPositiveInteger(
        process.env.CODE_RUN_MAX_QUEUE_SIZE,
        90
      ),
      maxQueueWaitMs: toCapacityPositiveInteger(
        process.env.CODE_RUN_MAX_QUEUE_WAIT_MS,
        15000
      ),
      buildBusyResponse: (capacityError) => ({
        statusCode: 503,
        headers: {
          "content-type": "application/json",
          "retry-after": String(capacityError.retryAfterSeconds || 1),
        },
        body: JSON.stringify({
          error: "Compile service is busy. Please retry shortly.",
          code: "capacity/overloaded",
          reason: capacityError.reason || "queue_full",
          retryAfterSeconds: capacityError.retryAfterSeconds || 1,
        }),
      }),
    },
    async () => {
      const guard = await enforceFunctionGuard(event, {
        functionName: "code-run",
        rateLimitMax: toPositiveInteger(process.env.CODE_RUN_RATE_LIMIT_MAX, 60),
        rateLimitWindowMs: toPositiveInteger(
          process.env.CODE_RUN_RATE_LIMIT_WINDOW_MS,
          5 * 60 * 1000
        ),
        allowedRoles: resolveAllowedRoles(process.env.CODE_RUN_ALLOWED_ROLES, [
          "student",
          "staff",
          "admin",
        ]),
      });
      if (!guard.ok) {
        return guard.response;
      }

      const body = parseEventBody(event);
      const languageKey = toSafeText(body.language).toLowerCase();
      const sourceCode = String(body.sourceCode || "");
      const stdin = String(body.stdin || "");

      if (!LANGUAGE_CONFIG[languageKey]) {
        return buildResponse(400, {
          error: "Unsupported language. Use 'c' or 'cpp'.",
        });
      }

      if (!sourceCode.trim()) {
        return buildResponse(400, { error: "sourceCode is required." });
      }

      if (sourceCode.length > MAX_SOURCE_LENGTH) {
        return buildResponse(400, {
          error: `sourceCode exceeds ${MAX_SOURCE_LENGTH} characters.`,
        });
      }

      if (stdin.length > MAX_STDIN_LENGTH) {
        return buildResponse(400, {
          error: `stdin exceeds ${MAX_STDIN_LENGTH} characters.`,
        });
      }

      const pistonBaseUrl =
        toSafeText(process.env.PISTON_API_BASE_URL) || DEFAULT_PISTON_BASE_URL;
      const webhookUrl = toSafeText(
        process.env.CODE_RUN_WEBHOOK_URL || process.env.CODE_RUN_FALLBACK_WEBHOOK_URL
      );
      const webhookAuthToken = toSafeText(process.env.CODE_RUN_WEBHOOK_AUTH_TOKEN);
      const providerOrder = selectProviderOrder({
        explicitOrder:
          toSafeText(process.env.CODE_RUN_PROVIDER_ORDER) ||
          toSafeText(process.env.CODE_RUN_PROVIDER),
        defaultOrder: ["piston", "webhook"],
        supportedProviders: ["piston", "webhook"],
      });

  const executeWithPiston = async () => {
    const runtimesResponse = await timeoutFetch(`${pistonBaseUrl}/runtimes`, {
      method: "GET",
      headers: {
        accept: "application/json",
      },
    });
    const runtimesRaw = await runtimesResponse.text();
    const runtimesPayload = parseJsonSafe(runtimesRaw);
    const runtime = selectRuntime(runtimesPayload, languageKey);

    if (!runtime) {
      return {
        ok: false,
        status: 502,
        details: {
          error: `No runtime found for ${languageKey}.`,
        },
      };
    }

    const executePayload = {
      language: String(runtime.language || languageKey),
      version: String(runtime.version || ""),
      files: [
        {
          name: LANGUAGE_CONFIG[languageKey].fileName,
          content: sourceCode,
        },
      ],
      stdin,
      compile_timeout: 10000,
      run_timeout: 10000,
    };

    const executeResponse = await timeoutFetch(`${pistonBaseUrl}/execute`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify(executePayload),
    });
    const executeRaw = await executeResponse.text();
    const execute = parseJsonSafe(executeRaw);

    if (!executeResponse.ok) {
      return {
        ok: false,
        status: executeResponse.status,
        details: {
          error: "Code execution request failed.",
          providerResponse: execute,
        },
      };
    }

    const compileOut = String(execute?.compile?.output || "");
    const runOut = String(execute?.run?.output || "");
    const combinedOutput = `${compileOut}${runOut}`;

    return {
      ok: true,
      status: 200,
      details: {
        ok: true,
        provider: "piston",
        language: execute?.language || executePayload.language,
        version: execute?.version || executePayload.version,
        runtime: `${execute?.language || executePayload.language}@${
          execute?.version || executePayload.version
        }`,
        output: combinedOutput,
        compileOutput: compileOut,
        runOutput: runOut,
        stdout: String(execute?.run?.stdout || ""),
        stderr: String(execute?.run?.stderr || ""),
        compileCode:
          typeof execute?.compile?.code === "number" ? execute.compile.code : null,
        exitCode: typeof execute?.run?.code === "number" ? execute.run.code : null,
        signal:
          execute?.run?.signal ||
          execute?.compile?.signal ||
          null,
      },
    };
  };

  const executeWithWebhook = async () => {
    const webhookResult = await invokeJsonWebhook({
      url: webhookUrl,
      authToken: webhookAuthToken,
      payload: {
        event: "code.run",
        providerHint: "custom",
        language: languageKey,
        sourceCode,
        stdin,
      },
    });
    if (!webhookResult.ok) {
      return webhookResult;
    }

    const details =
      webhookResult.details && typeof webhookResult.details === "object"
        ? webhookResult.details
        : {};
    const runtimeText = toSafeText(details.runtime);

    return {
      ok: true,
      status: webhookResult.status || 200,
      details: {
        ok: true,
        provider: "webhook",
        language: toSafeText(details.language || languageKey) || languageKey,
        version: toSafeText(details.version),
        runtime:
          runtimeText ||
          `${toSafeText(details.language || languageKey) || languageKey}@${
            toSafeText(details.version)
          }`,
        output: String(details.output || ""),
        compileOutput: String(details.compileOutput || ""),
        runOutput: String(details.runOutput || ""),
        stdout: String(details.stdout || ""),
        stderr: String(details.stderr || ""),
        compileCode:
          typeof details.compileCode === "number" ? details.compileCode : null,
        exitCode: typeof details.exitCode === "number" ? details.exitCode : null,
        signal: details.signal || null,
      },
    };
  };

      try {
        const providerResult = await runProviderChain({
          providers: providerOrder,
          runProvider: async (provider) => {
            if (provider === "piston") {
              return executeWithPiston();
            }
            if (provider === "webhook") {
              return executeWithWebhook();
            }
            return {
              ok: false,
              status: 500,
              details: { error: `Unsupported provider: ${provider}` },
            };
          },
        });

        if (!providerResult.ok) {
          return buildResponse(providerResult.statusCode || 502, {
            error: "Unable to reach compile service.",
            providerAttempts: providerResult.attempts,
          });
        }

        const resolved = providerResult.result?.details || {};
        return buildResponse(200, {
          ok: true,
          provider: providerResult.provider,
          language: resolved.language || languageKey,
          version: resolved.version || "",
          runtime: resolved.runtime || "",
          output: String(resolved.output || ""),
          compileOutput: String(resolved.compileOutput || ""),
          runOutput: String(resolved.runOutput || ""),
          stdout: String(resolved.stdout || ""),
          stderr: String(resolved.stderr || ""),
          compileCode:
            typeof resolved.compileCode === "number" ? resolved.compileCode : null,
          exitCode: typeof resolved.exitCode === "number" ? resolved.exitCode : null,
          signal: resolved.signal || null,
          providerAttempts: providerResult.attempts,
        });
      } catch (error) {
        return buildResponse(502, {
          error: "Unable to reach compile service.",
          details: error?.message || "Unknown error",
        });
      }
    }
  );
};
