const {
  enforceFunctionGuard,
  resolveAllowedRoles,
  toPositiveInteger,
} = require("./_utils/request-guard.cjs");
const { toSafeText } = require("./_utils/provider-chain.cjs");
const {
  sendEmailThroughConfiguredProvider,
  toEmailArray,
} = require("./_utils/email-provider.cjs");
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
      functionName: "email-send",
      maxConcurrent: toCapacityPositiveInteger(
        process.env.EMAIL_SEND_MAX_CONCURRENCY,
        25
      ),
      maxQueueSize: toCapacityPositiveInteger(
        process.env.EMAIL_SEND_MAX_QUEUE_SIZE,
        80
      ),
      maxQueueWaitMs: toCapacityPositiveInteger(
        process.env.EMAIL_SEND_MAX_QUEUE_WAIT_MS,
        15000
      ),
      buildBusyResponse: (capacityError) => ({
        statusCode: 503,
        headers: {
          "content-type": "application/json",
          "retry-after": String(capacityError.retryAfterSeconds || 1),
        },
        body: JSON.stringify({
          error: "Email service is busy. Please retry shortly.",
          code: "capacity/overloaded",
          reason: capacityError.reason || "queue_full",
          retryAfterSeconds: capacityError.retryAfterSeconds || 1,
        }),
      }),
    },
    async () => {
      const guard = await enforceFunctionGuard(event, {
        functionName: "email-send",
        rateLimitMax: toPositiveInteger(
          process.env.EMAIL_SEND_RATE_LIMIT_MAX,
          400
        ),
        rateLimitWindowMs: toPositiveInteger(
          process.env.EMAIL_SEND_RATE_LIMIT_WINDOW_MS,
          10 * 60 * 1000
        ),
        allowedRoles: resolveAllowedRoles(process.env.EMAIL_SEND_ALLOWED_ROLES, [
          "staff",
          "admin",
        ]),
      });
      if (!guard.ok) {
        return guard.response;
      }

      const body = parseEventBody(event);
      const to = toEmailArray(body.to || body.email);
      if (to.length === 0) {
        return {
          statusCode: 400,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ error: "Invalid payload. 'to' is required." }),
        };
      }

      try {
        const providerResult = await sendEmailThroughConfiguredProvider({
          to,
          subject: body.subject || body.title,
          text: body.text || body.message,
          html: body.html,
          title: body.title,
          message: body.message,
          link: body.link,
          providerHint: "custom",
        });

        if (!providerResult.ok) {
          return {
            statusCode: providerResult.statusCode || 500,
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              error: "Email provider request failed",
              attempts: providerResult.attempts,
            }),
          };
        }

        return {
          statusCode: 200,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            ok: true,
            provider: providerResult.provider,
            id: toSafeText(providerResult.id),
            details: providerResult.details || {},
            attempts: providerResult.attempts,
          }),
        };
      } catch (error) {
        return {
          statusCode: 500,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            error: "Failed to call email provider",
            details: error?.message || "Unknown error",
          }),
        };
      }
    }
  );
};
