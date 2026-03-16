const DEFAULT_API_VERSION = "v23.0";
const MAX_TEXT_LENGTH = 1024;
const DEFAULT_TEMPLATE_LANGUAGE = "en_US";
const DEFAULT_TEMPLATE_NAME = "hello_world";
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
const toBoolean = (value) => /^(1|true|yes|on)$/i.test(String(value || "").trim());

const normalizePhone = (value) => {
  const raw = toSafeText(value);
  if (!raw) return "";
  let digits = raw.replace(/\D+/g, "");
  if (!digits) return "";
  if (digits.startsWith("00")) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) {
    digits = digits.slice(1);
  }
  return digits;
};

const parseEventBody = (event) => {
  const rawBody = toSafeText(event?.body);
  if (!rawBody) return {};
  try {
    return JSON.parse(rawBody);
  } catch {
    return {};
  }
};

const callWhatsAppApi = async ({
  accessToken,
  apiVersion,
  phoneNumberId,
  payload,
}) => {
  const response = await fetch(
    `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }
  );

  const rawText = await response.text();
  const parsedBody = parseJsonSafe(rawText);

  return {
    ok: response.ok,
    status: response.status,
    body: parsedBody,
  };
};

const buildTextPayload = ({ to, text }) => ({
  messaging_product: "whatsapp",
  recipient_type: "individual",
  to,
  type: "text",
  text: {
    preview_url: true,
    body: text,
  },
});

const buildTemplatePayload = ({ to, templateName, templateLanguage, text }) => {
  const safeTemplateName = toSafeText(templateName);
  const safeLanguage = toSafeText(templateLanguage) || DEFAULT_TEMPLATE_LANGUAGE;
  const safeText = toSafeText(text);

  const template = {
    name: safeTemplateName,
    language: {
      code: safeLanguage,
    },
  };

  if (safeText) {
    template.components = [
      {
        type: "body",
        parameters: [
          {
            type: "text",
            text: safeText,
          },
        ],
      },
    ];
  }

  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "template",
    template,
  };
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
      functionName: "whatsapp-send",
      maxConcurrent: toCapacityPositiveInteger(
        process.env.WHATSAPP_SEND_MAX_CONCURRENCY,
        25
      ),
      maxQueueSize: toCapacityPositiveInteger(
        process.env.WHATSAPP_SEND_MAX_QUEUE_SIZE,
        80
      ),
      maxQueueWaitMs: toCapacityPositiveInteger(
        process.env.WHATSAPP_SEND_MAX_QUEUE_WAIT_MS,
        15000
      ),
      buildBusyResponse: (capacityError) => ({
        statusCode: 503,
        headers: {
          "content-type": "application/json",
          "retry-after": String(capacityError.retryAfterSeconds || 1),
        },
        body: JSON.stringify({
          error: "WhatsApp service is busy. Please retry shortly.",
          code: "capacity/overloaded",
          reason: capacityError.reason || "queue_full",
          retryAfterSeconds: capacityError.retryAfterSeconds || 1,
        }),
      }),
    },
    async () => {
      const guard = await enforceFunctionGuard(event, {
        functionName: "whatsapp-send",
        rateLimitMax: toPositiveInteger(
          process.env.WHATSAPP_SEND_RATE_LIMIT_MAX,
          300
        ),
        rateLimitWindowMs: toPositiveInteger(
          process.env.WHATSAPP_SEND_RATE_LIMIT_WINDOW_MS,
          10 * 60 * 1000
        ),
        allowedRoles: resolveAllowedRoles(process.env.WHATSAPP_SEND_ALLOWED_ROLES, [
          "staff",
          "admin",
        ]),
      });
      if (!guard.ok) {
        return guard.response;
      }

      const accessToken = toSafeText(process.env.WHATSAPP_ACCESS_TOKEN);
      const phoneNumberId = toSafeText(process.env.WHATSAPP_PHONE_NUMBER_ID);
      const apiVersion =
        toSafeText(process.env.WHATSAPP_API_VERSION) || DEFAULT_API_VERSION;

  const body = parseEventBody(event);
  const to = normalizePhone(body.to);
  const text = toSafeText(body.text).slice(0, MAX_TEXT_LENGTH);
  const requestMode = toSafeText(body.mode).toLowerCase() || "auto";
  const templateLanguage =
    toSafeText(body.templateLanguage) ||
    toSafeText(process.env.WHATSAPP_TEMPLATE_LANGUAGE) ||
    DEFAULT_TEMPLATE_LANGUAGE;
  const allowTemplateFallback =
    typeof body.allowTemplateFallback === "boolean"
      ? body.allowTemplateFallback
      : toBoolean(
          toSafeText(process.env.WHATSAPP_TEXT_FALLBACK_TO_TEMPLATE) || "true"
        );
  const configuredTemplateName =
    toSafeText(body.templateName) || toSafeText(process.env.WHATSAPP_TEMPLATE_NAME);
  const templateName =
    configuredTemplateName ||
    (requestMode === "template" || allowTemplateFallback
      ? DEFAULT_TEMPLATE_NAME
      : "");
  const webhookUrl = toSafeText(
    process.env.WHATSAPP_WEBHOOK_URL || process.env.WHATSAPP_FALLBACK_WEBHOOK_URL
  );
  const webhookAuthToken = toSafeText(process.env.WHATSAPP_WEBHOOK_AUTH_TOKEN);
  const providerOrder = selectProviderOrder({
    explicitOrder:
      toSafeText(process.env.WHATSAPP_PROVIDER_ORDER) ||
      toSafeText(process.env.WHATSAPP_PROVIDER),
    defaultOrder: ["meta", "webhook"],
    supportedProviders: ["meta", "webhook"],
  });

      if (!to) {
        return {
          statusCode: 400,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ error: "Invalid payload. 'to' is required." }),
        };
      }

  const sendWithMeta = async () => {
    if (!accessToken || !phoneNumberId) {
      return {
        ok: false,
        status: 500,
        details: {
          error: "Server WhatsApp config missing",
          missing: {
            WHATSAPP_ACCESS_TOKEN: !accessToken,
            WHATSAPP_PHONE_NUMBER_ID: !phoneNumberId,
          },
        },
      };
    }

    const attempts = [];
    const sendText = async () => {
      if (!text) {
        return {
          ok: false,
          status: 400,
          body: { error: { message: "Text body is empty." } },
        };
      }
      const result = await callWhatsAppApi({
        accessToken,
        apiVersion,
        phoneNumberId,
        payload: buildTextPayload({ to, text }),
      });
      attempts.push({ mode: "text", result });
      return result;
    };

    const sendTemplate = async (withBodyText) => {
      if (!templateName) {
        return {
          ok: false,
          status: 400,
          body: { error: { message: "Template name not configured." } },
        };
      }

      const result = await callWhatsAppApi({
        accessToken,
        apiVersion,
        phoneNumberId,
        payload: buildTemplatePayload({
          to,
          templateName,
          templateLanguage,
          text: withBodyText ? text : "",
        }),
      });
      attempts.push({
        mode: withBodyText ? "template_with_body_param" : "template",
        result,
      });
      return result;
    };

    let finalResult = null;

    if (requestMode === "template") {
      finalResult = await sendTemplate(true);
      if (!finalResult.ok && text) {
        finalResult = await sendTemplate(false);
      }
    } else if (requestMode === "text") {
      finalResult = await sendText();
    } else {
      finalResult = await sendText();
      if (!finalResult.ok && allowTemplateFallback && templateName) {
        const withBody = await sendTemplate(true);
        if (withBody.ok) {
          finalResult = withBody;
        } else {
          finalResult = await sendTemplate(false);
        }
      }
    }

    if (!finalResult || !finalResult.ok) {
      const statusCode =
        finalResult?.status ||
        attempts.find((item) => item.result?.status)?.result?.status ||
        500;
      return {
        ok: false,
        status: statusCode,
        details: {
          error: "WhatsApp API request failed",
          details: finalResult?.body || {},
          attempts: attempts.map((item) => ({
            mode: item.mode,
            status: item.result?.status,
            body: item.result?.body,
          })),
        },
      };
    }

    return {
      ok: true,
      status: 200,
      mode: attempts[attempts.length - 1]?.mode || requestMode || "auto",
      details: finalResult.body,
      attempts: attempts.map((item) => ({
        mode: item.mode,
        status: item.result?.status,
        body: item.result?.body,
      })),
    };
  };

  const sendWithWebhook = async () => {
    const webhookResult = await invokeJsonWebhook({
      url: webhookUrl,
      authToken: webhookAuthToken,
      payload: {
        event: "notification.whatsapp",
        providerHint: "custom",
        to,
        text,
        type: toSafeText(body.type || "general"),
        mode: requestMode,
        templateName,
        templateLanguage,
        allowTemplateFallback,
      },
    });
    return {
      ...webhookResult,
      mode: requestMode || "auto",
    };
  };

      try {
        const providerResult = await runProviderChain({
          providers: providerOrder,
          runProvider: async (provider) => {
            if (provider === "meta") {
              return sendWithMeta();
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
              error: "WhatsApp provider request failed",
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
            mode: activeResult.mode || requestMode || "auto",
            details: activeResult.details || {},
            attempts: providerResult.attempts,
          }),
        };
      } catch (error) {
        return {
          statusCode: 500,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            error: "Failed to call WhatsApp API",
            details: error?.message || "Unknown error",
          }),
        };
      }
    }
  );
};
