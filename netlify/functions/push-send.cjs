const FCM_LEGACY_ENDPOINT = "https://fcm.googleapis.com/fcm/send";
const MAX_BATCH_SIZE = 500;
const DEFAULT_TITLE = "CKCET Hub";
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

const parseEventBody = (event) => {
  const rawBody = toSafeText(event?.body);
  if (!rawBody) return {};
  try {
    return JSON.parse(rawBody);
  } catch {
    return {};
  }
};

const toTokenArray = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => toSafeText(item)).filter(Boolean);
  }
  const one = toSafeText(value);
  return one ? [one] : [];
};

const uniqueTokens = (tokens) => Array.from(new Set(tokens));

const toChunks = (items, size) => {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  return runWithCapacityGuard(
    {
      functionName: "push-send",
      maxConcurrent: toCapacityPositiveInteger(
        process.env.PUSH_SEND_MAX_CONCURRENCY,
        30
      ),
      maxQueueSize: toCapacityPositiveInteger(
        process.env.PUSH_SEND_MAX_QUEUE_SIZE,
        100
      ),
      maxQueueWaitMs: toCapacityPositiveInteger(
        process.env.PUSH_SEND_MAX_QUEUE_WAIT_MS,
        15000
      ),
      buildBusyResponse: (capacityError) => ({
        statusCode: 503,
        headers: {
          "content-type": "application/json",
          "retry-after": String(capacityError.retryAfterSeconds || 1),
        },
        body: JSON.stringify({
          error: "Push service is busy. Please retry shortly.",
          code: "capacity/overloaded",
          reason: capacityError.reason || "queue_full",
          retryAfterSeconds: capacityError.retryAfterSeconds || 1,
        }),
      }),
    },
    async () => {
      const guard = await enforceFunctionGuard(event, {
        functionName: "push-send",
        rateLimitMax: toPositiveInteger(
          process.env.PUSH_SEND_RATE_LIMIT_MAX,
          500
        ),
        rateLimitWindowMs: toPositiveInteger(
          process.env.PUSH_SEND_RATE_LIMIT_WINDOW_MS,
          10 * 60 * 1000
        ),
        allowedRoles: resolveAllowedRoles(process.env.PUSH_SEND_ALLOWED_ROLES, [
          "staff",
          "admin",
        ]),
      });
      if (!guard.ok) {
        return guard.response;
      }

      const serverKey = toSafeText(process.env.FCM_SERVER_KEY);
      const webhookUrl = toSafeText(
        process.env.PUSH_WEBHOOK_URL || process.env.PUSH_FALLBACK_WEBHOOK_URL
      );
      const webhookAuthToken = toSafeText(process.env.PUSH_WEBHOOK_AUTH_TOKEN);
      const providerOrder = selectProviderOrder({
        explicitOrder:
          toSafeText(process.env.PUSH_PROVIDER_ORDER) ||
          toSafeText(process.env.PUSH_PROVIDER),
        defaultOrder: ["fcm", "webhook"],
        supportedProviders: ["fcm", "webhook"],
      });

      const body = parseEventBody(event);
      const tokens = uniqueTokens(
        toTokenArray(body.tokens).concat(toTokenArray(body.to))
      );
      if (tokens.length === 0) {
        return {
          statusCode: 400,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            error: "Invalid payload. 'tokens' or 'to' is required.",
          }),
        };
      }

  const title = toSafeText(body.title) || DEFAULT_TITLE;
  const message = toSafeText(body.message || body.text);
  const link = toSafeText(body.link);
  const type = toSafeText(body.type);

  const sendWithFcm = async () => {
    if (!serverKey) {
      return {
        ok: false,
        status: 500,
        details: {
          error: "Server FCM config missing",
          missing: { FCM_SERVER_KEY: true },
        },
      };
    }

    const chunks = toChunks(tokens, MAX_BATCH_SIZE);
    const attempts = [];
    let totalSuccess = 0;
    let totalFailure = 0;

    for (const chunk of chunks) {
      const payload = {
        registration_ids: chunk,
        priority: "high",
        notification: {
          title,
          body: message,
        },
        data: {
          title,
          body: message,
          type,
          link,
        },
      };

      const response = await fetch(FCM_LEGACY_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `key=${serverKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const rawText = await response.text();
      const parsed = parseJsonSafe(rawText);

      attempts.push({
        status: response.status,
        success: Number(parsed?.success || 0),
        failure: Number(parsed?.failure || 0),
        canonical_ids: Number(parsed?.canonical_ids || 0),
        results: Array.isArray(parsed?.results) ? parsed.results : [],
      });

      if (!response.ok) {
        return {
          ok: false,
          status: response.status || 500,
          details: parsed,
          attempts,
        };
      }

      totalSuccess += Number(parsed?.success || 0);
      totalFailure += Number(parsed?.failure || 0);
    }

    return {
      ok: true,
      status: 200,
      success: totalSuccess,
      failure: totalFailure,
      attempts,
    };
  };

  const sendWithWebhook = async () => {
    const webhookResult = await invokeJsonWebhook({
      url: webhookUrl,
      authToken: webhookAuthToken,
      payload: {
        event: "notification.push",
        providerHint: "custom",
        tokens,
        title,
        message,
        type,
        link,
      },
    });
    if (!webhookResult.ok) {
      return webhookResult;
    }

    return {
      ...webhookResult,
      success: tokens.length,
      failure: 0,
      attempts: [
        {
          status: webhookResult.status,
          success: tokens.length,
          failure: 0,
          canonical_ids: 0,
          results: [],
        },
      ],
    };
  };

      const providerResult = await runProviderChain({
        providers: providerOrder,
        runProvider: async (provider) => {
          if (provider === "fcm") {
            return sendWithFcm();
          }
          if (provider === "webhook") {
            return sendWithWebhook();
          }
          return {
            ok: false,
            status: 500,
            details: { error: `Unsupported provider: ${provider}` },
          };
        },
      });

      if (!providerResult.ok) {
        return {
          statusCode: providerResult.statusCode || 500,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            error: "Push provider request failed",
            attempts: providerResult.attempts,
          }),
        };
      }

      const activeResult = providerResult.result || {};

      return {
        statusCode: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ok: true,
          provider: providerResult.provider,
          success: Number(activeResult.success || 0),
          failure: Number(activeResult.failure || 0),
          attempts: Array.isArray(activeResult.attempts)
            ? activeResult.attempts
            : [],
          providerAttempts: providerResult.attempts,
        }),
      };
    }
  );
};
