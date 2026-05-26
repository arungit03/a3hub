const { sendEmailThroughConfiguredProvider } = require("./_utils/email-provider.cjs");
const {
  buildVerificationEmail,
  checkRateLimit,
  findUserProfileByEmail,
  getSupabaseAdminClient,
  jsonResponse,
  normalizeEmail,
  parseJsonBody,
  resolveRedirectTo,
} = require("./_utils/auth-email.cjs");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return jsonResponse(204, { ok: true });
  }
  if (event.httpMethod !== "POST") {
    return jsonResponse(405, {
      ok: false,
      error: "Method not allowed",
    });
  }

  const limited = checkRateLimit(event, {
    keyPrefix: "auth-send-verification",
    max: Number(process.env.AUTH_VERIFY_RATE_LIMIT_MAX) || 10,
    windowMs: Number(process.env.AUTH_VERIFY_RATE_LIMIT_WINDOW_MS) || 10 * 60 * 1000,
  });
  if (limited) return limited;

  const body = parseJsonBody(event);
  const email = normalizeEmail(body.email);
  if (!email) {
    return jsonResponse(400, {
      ok: false,
      code: "auth/invalid-email",
      error: "Enter a valid email address.",
    });
  }

  const { client: adminClient, response } = getSupabaseAdminClient();
  if (!adminClient) return response;

  try {
    const profileRow = await findUserProfileByEmail(adminClient, email);
    if (!profileRow) {
      return jsonResponse(200, {
        ok: true,
        emailStatus: "sent",
      });
    }

    const redirectTo = resolveRedirectTo(event, body.redirectTo);
    const linkResult = await adminClient.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: {
        data: profileRow.data || {},
        redirectTo,
      },
    });
    if (linkResult.error) throw linkResult.error;

    const actionLink = linkResult.data?.properties?.action_link || "";
    if (!actionLink) {
      return jsonResponse(500, {
        ok: false,
        code: "auth/link-generation-failed",
        error: "Unable to generate verification link.",
      });
    }

    const emailContent = buildVerificationEmail({
      actionLink,
      displayName: profileRow.data?.name,
    });
    const providerResult = await sendEmailThroughConfiguredProvider({
      to: email,
      subject: emailContent.subject,
      text: emailContent.text,
      html: emailContent.html,
      title: emailContent.subject,
      message: "Verify your A3 Hub email address.",
      link: actionLink,
      providerHint: "auth.verify",
    });

    if (!providerResult.ok) {
      return jsonResponse(providerResult.statusCode || 502, {
        ok: false,
        code: "auth/email-provider-failed",
        error: "Verification link was created, but the email provider could not send it.",
        attempts: providerResult.attempts,
      });
    }

    return jsonResponse(200, {
      ok: true,
      emailStatus: "sent",
      provider: providerResult.provider,
    });
  } catch (error) {
    return jsonResponse(500, {
      ok: false,
      code: error?.code || "auth/verification-email-failed",
      error: error?.message || "Unable to send verification email.",
    });
  }
};
