const DEFAULT_TITLE = "A3 Hub";
const {
  enforceFunctionGuard,
  resolveAllowedRoles,
  toPositiveInteger,
} = require("./_utils/request-guard.cjs");
const {
  invokeJsonWebhook,
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
  if (Array.isArray(value)) return value.map((item) => toSafeText(item)).filter(Boolean);
  const one = toSafeText(value);
  return one ? [one] : [];
};

const uniqueTokens = (tokens) => Array.from(new Set(tokens));

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
      if (!guard.ok) return guard.response;

      const webhookUrl = toSafeText(
        process.env.PUSH_WEBHOOK_URL || process.env.PUSH_FALLBACK_WEBHOOK_URL
      );
      const webhookAuthToken = toSafeText(process.env.PUSH_WEBHOOK_AUTH_TOKEN);
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

      const webhookResult = await invokeJsonWebhook({
        url: webhookUrl,
        authToken: webhookAuthToken,
        payload: {
          event: "notification.push",
          providerHint: "webhook",
          tokens,
          title,
          message,
          type,
          link,
        },
      });

      if (!webhookResult.ok) {
        return {
          statusCode: webhookResult.status || 500,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            error: "Push webhook request failed",
            details: webhookResult.details,
          }),
        };
      }

      return {
        statusCode: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ok: true,
          provider: "webhook",
          success: tokens.length,
          failure: 0,
          attempts: [
            {
              status: webhookResult.status,
              success: tokens.length,
              failure: 0,
              results: [],
            },
          ],
        }),
      };
    }
  );
};
