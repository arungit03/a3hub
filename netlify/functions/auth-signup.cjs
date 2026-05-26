const { sendEmailThroughConfiguredProvider } = require("./_utils/email-provider.cjs");
const {
  buildVerificationEmail,
  checkRateLimit,
  findUserProfileByEmail,
  getSupabaseAdminClient,
  isExistingUserError,
  jsonResponse,
  normalizeEmail,
  normalizeRole,
  parseJsonBody,
  resolveRedirectTo,
  upsertDocument,
} = require("./_utils/auth-email.cjs");
const { toSafeText } = require("./_utils/provider-chain.cjs");

const toProfileObject = (value) =>
  value && typeof value === "object" && !Array.isArray(value) ? value : {};

const resolveSignupProfile = ({ body, email, role }) => {
  const incomingProfile = toProfileObject(body.profile);
  const name = toSafeText(incomingProfile.name || body.name) || "New User";
  const nowIso = new Date().toISOString();

  return {
    ...incomingProfile,
    email,
    role,
    status: role === "staff" ? "pending" : "active",
    name,
    createdAt: incomingProfile.createdAt || nowIso,
  };
};

const buildMetadata = ({ body, profile }) => {
  const incomingMetadata = toProfileObject(body.metadata);
  return {
    ...profile,
    ...incomingMetadata,
    email: profile.email,
    role: profile.role,
    status: profile.status,
    name: profile.name,
    display_name: toSafeText(incomingMetadata.display_name || profile.name),
    createdAt:
      typeof incomingMetadata.createdAt === "string"
        ? incomingMetadata.createdAt
        : new Date().toISOString(),
  };
};

const hasExistingBootstrapAdmin = async (adminClient) => {
  const { data, error } = await adminClient
    .from(process.env.SUPABASE_DOCUMENTS_TABLE || process.env.VITE_SUPABASE_DOCUMENTS_TABLE || "app_documents")
    .select("data")
    .eq("path", "systemSettings/authBootstrap")
    .maybeSingle();
  if (error) throw error;
  return Boolean(toSafeText(data?.data?.adminUid));
};

const generateSignupOrVerificationLink = async ({
  adminClient,
  email,
  password,
  metadata,
  redirectTo,
}) => {
  const signupResult = await adminClient.auth.admin.generateLink({
    type: "signup",
    email,
    password,
    options: {
      data: metadata,
      redirectTo,
    },
  });

  if (!signupResult.error) {
    return {
      actionLink: signupResult.data?.properties?.action_link || "",
      user: signupResult.data?.user || null,
      createdNewUser: true,
    };
  }

  if (!isExistingUserError(signupResult.error)) {
    throw signupResult.error;
  }

  const existingProfile = await findUserProfileByEmail(adminClient, email);
  const magicResult = await adminClient.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: {
      data: metadata,
      redirectTo,
    },
  });
  if (magicResult.error) throw magicResult.error;

  return {
    actionLink: magicResult.data?.properties?.action_link || "",
    user:
      magicResult.data?.user ||
      (existingProfile
        ? {
            id: existingProfile.document_id,
            email,
            user_metadata: existingProfile.data || metadata,
          }
        : null),
    createdNewUser: false,
  };
};

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
    keyPrefix: "auth-signup",
    max: Number(process.env.AUTH_SIGNUP_RATE_LIMIT_MAX) || 8,
    windowMs: Number(process.env.AUTH_SIGNUP_RATE_LIMIT_WINDOW_MS) || 10 * 60 * 1000,
  });
  if (limited) return limited;

  const body = parseJsonBody(event);
  const email = normalizeEmail(body.email);
  const password = toSafeText(body.password);
  const role = normalizeRole(body.role);
  if (!email) {
    return jsonResponse(400, {
      ok: false,
      code: "auth/invalid-email",
      error: "Enter a valid email address.",
    });
  }
  if (password.length < 6) {
    return jsonResponse(400, {
      ok: false,
      code: "auth/weak-password",
      error: "Password must be at least 6 characters.",
    });
  }
  if (!["student", "staff", "admin"].includes(role)) {
    return jsonResponse(400, {
      ok: false,
      code: "auth/invalid-role",
      error: "Invalid role selected.",
    });
  }

  const { client: adminClient, response } = getSupabaseAdminClient();
  if (!adminClient) return response;

  try {
    if (role === "admin" && (await hasExistingBootstrapAdmin(adminClient))) {
      return jsonResponse(403, {
        ok: false,
        code: "auth/admin-registration-closed",
        error:
          "Admin registration is available only for the first admin account. Login with an existing admin account and create extra admins from Admin Users.",
      });
    }

    const profile = resolveSignupProfile({ body, email, role });
    const metadata = buildMetadata({ body, profile });
    const redirectTo = resolveRedirectTo(event, body.redirectTo);
    const { actionLink, user, createdNewUser } =
      await generateSignupOrVerificationLink({
        adminClient,
        email,
        password,
        metadata,
        redirectTo,
      });

    if (!actionLink || !user?.id) {
      return jsonResponse(500, {
        ok: false,
        code: "auth/link-generation-failed",
        error: "Unable to generate verification link.",
      });
    }

    const nextProfile = {
      ...profile,
      email,
      role,
      status: role === "staff" ? "pending" : "active",
    };
    await upsertDocument(adminClient, `users/${user.id}`, nextProfile);
    if (role === "admin") {
      await upsertDocument(adminClient, "systemSettings/authBootstrap", {
        adminUid: user.id,
        updatedAt: new Date().toISOString(),
      });
    }

    const emailContent = buildVerificationEmail({
      actionLink,
      displayName: nextProfile.name,
    });
    const providerResult = await sendEmailThroughConfiguredProvider({
      to: email,
      subject: emailContent.subject,
      text: emailContent.text,
      html: emailContent.html,
      title: emailContent.subject,
      message: "Verify your A3 Hub email address.",
      link: actionLink,
      providerHint: "auth.signup",
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
      createdNewUser,
      provider: providerResult.provider,
      user: {
        ...user,
        uid: user.id,
        email,
        user_metadata: metadata,
      },
    });
  } catch (error) {
    return jsonResponse(500, {
      ok: false,
      code: error?.code || "auth/server-signup-failed",
      error: error?.message || "Unable to create account or send verification email.",
    });
  }
};
