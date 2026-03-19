const DEFAULT_RESEND_ENDPOINT = "https://api.resend.com/emails";
const MAX_SUBJECT_LENGTH = 160;
const MAX_BODY_LENGTH = 12000;

const {
  invokeJsonWebhook,
  parseJsonSafe,
  runProviderChain,
  selectProviderOrder,
  toSafeText,
} = require("./provider-chain.cjs");

const escapeHtml = (value) =>
  String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const normalizeEmail = (value) => {
  const email = toSafeText(value).toLowerCase();
  if (!email) return "";
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
};

const toEmailArray = (value) => {
  const fromArray = Array.isArray(value) ? value : [value];
  return Array.from(
    new Set(fromArray.map((item) => normalizeEmail(item)).filter(Boolean))
  );
};

const buildHtmlFallback = ({ title, message = "", link = "" }) => {
  const safeTitle = escapeHtml(title || "A3 Hub Notification");
  const safeMessage = escapeHtml(message);
  const safeLink = toSafeText(link);
  const safeLinkHtml = safeLink ? escapeHtml(safeLink) : "";

  return `<!doctype html>
<html>
  <body style="margin:0;padding:16px;background:#f4f6fb;font-family:Arial,sans-serif;color:#10243f;">
    <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #d9e3f2;border-radius:12px;padding:20px;">
      <h2 style="margin:0 0 12px;font-size:18px;line-height:1.4;">${safeTitle}</h2>
      ${
        safeMessage
          ? `<p style="margin:0 0 14px;font-size:14px;line-height:1.6;">${safeMessage}</p>`
          : ""
      }
      ${
        safeLinkHtml
          ? `<p style="margin:0;font-size:13px;line-height:1.6;"><a href="${safeLinkHtml}" style="color:#2459d3;">Open in app</a></p>`
          : ""
      }
    </div>
  </body>
</html>`;
};

const hasConfiguredEmailProvider = () =>
  Boolean(
    toSafeText(process.env.RESEND_API_KEY) ||
      toSafeText(
        process.env.EMAIL_WEBHOOK_URL || process.env.EMAIL_FALLBACK_WEBHOOK_URL
      )
  );

const sendEmailThroughConfiguredProvider = async ({
  to,
  subject = "",
  text = "",
  html = "",
  title = "",
  message = "",
  link = "",
  providerHint = "custom",
} = {}) => {
  const recipients = toEmailArray(to);
  if (recipients.length === 0) {
    return {
      ok: false,
      statusCode: 400,
      error: "Invalid payload. 'to' is required.",
      attempts: [],
    };
  }

  const resolvedSubject = (
    toSafeText(subject || title) || "A3 Hub Notification"
  ).slice(0, MAX_SUBJECT_LENGTH);
  const resolvedText = toSafeText(text || message).slice(0, MAX_BODY_LENGTH);
  const resolvedHtml =
    toSafeText(html).slice(0, MAX_BODY_LENGTH) ||
    buildHtmlFallback({
      title: title || resolvedSubject,
      message: message || resolvedText,
      link,
    });

  const resendApiKey = toSafeText(process.env.RESEND_API_KEY);
  const fromAddress = toSafeText(
    process.env.EMAIL_FROM ||
      process.env.RESEND_FROM_EMAIL ||
      process.env.RESEND_FROM ||
      "A3 Hub <onboarding@resend.dev>"
  );
  const resendEndpoint =
    toSafeText(process.env.RESEND_API_ENDPOINT) || DEFAULT_RESEND_ENDPOINT;
  const webhookUrl = toSafeText(
    process.env.EMAIL_WEBHOOK_URL || process.env.EMAIL_FALLBACK_WEBHOOK_URL
  );
  const webhookAuthToken = toSafeText(process.env.EMAIL_WEBHOOK_AUTH_TOKEN);
  const providerOrder = selectProviderOrder({
    explicitOrder:
      toSafeText(process.env.EMAIL_PROVIDER_ORDER) ||
      toSafeText(process.env.EMAIL_PROVIDER),
    defaultOrder: ["resend", "webhook"],
    supportedProviders: ["resend", "webhook"],
  });

  const sendWithResend = async () => {
    if (!resendApiKey || !fromAddress) {
      return {
        ok: false,
        status: 500,
        details: {
          error: "Server email config missing",
          missing: {
            RESEND_API_KEY: !resendApiKey,
            EMAIL_FROM: !fromAddress,
          },
        },
      };
    }

    const response = await fetch(resendEndpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromAddress,
        to: recipients,
        subject: resolvedSubject,
        text: resolvedText,
        html: resolvedHtml,
      }),
    });

    const rawText = await response.text();
    const parsedBody = parseJsonSafe(rawText);

    return {
      ok: response.ok,
      status: response.status || (response.ok ? 200 : 500),
      details: parsedBody,
      id: parsedBody?.id || "",
    };
  };

  const sendWithWebhook = async () =>
    invokeJsonWebhook({
      url: webhookUrl,
      authToken: webhookAuthToken,
      payload: {
        event: "notification.email",
        providerHint,
        to: recipients,
        subject: resolvedSubject,
        text: resolvedText,
        html: resolvedHtml,
        title: toSafeText(title || resolvedSubject),
        message: toSafeText(message || resolvedText),
        link: toSafeText(link),
      },
    });

  try {
    const providerResult = await runProviderChain({
      providers: providerOrder,
      runProvider: async (provider) => {
        if (provider === "resend") {
          return sendWithResend();
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
        ok: false,
        statusCode: providerResult.statusCode || 500,
        attempts: providerResult.attempts,
      };
    }

    const activeResult = providerResult.result || {};
    return {
      ok: true,
      provider: providerResult.provider,
      id: toSafeText(activeResult.id),
      details: activeResult.details || {},
      attempts: providerResult.attempts,
    };
  } catch (error) {
    return {
      ok: false,
      statusCode: 500,
      error: "Failed to call email provider",
      details: error?.message || "Unknown error",
    };
  }
};

module.exports = {
  buildHtmlFallback,
  escapeHtml,
  hasConfiguredEmailProvider,
  sendEmailThroughConfiguredProvider,
  toEmailArray,
};
