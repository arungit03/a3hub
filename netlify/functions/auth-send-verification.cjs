const DEFAULT_FIREBASE_OOB_ENDPOINT =
  "https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode";
const DEFAULT_FIREBASE_LOOKUP_ENDPOINT =
  "https://identitytoolkit.googleapis.com/v1/accounts:lookup";
const DEFAULT_FIREBASE_ADMIN_OOB_ENDPOINT =
  "https://identitytoolkit.googleapis.com/v1/projects";
const DEFAULT_GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const DEFAULT_GOOGLE_OAUTH_SCOPE =
  "https://www.googleapis.com/auth/identitytoolkit";

const { parseJsonSafe, toSafeText } = require("./_utils/provider-chain.cjs");
const {
  escapeHtml,
  hasConfiguredEmailProvider,
  sendEmailThroughConfiguredProvider,
} = require("./_utils/email-provider.cjs");
const { createSign } = require("node:crypto");

const mapFirebaseVerificationError = (firebaseCode) => {
  const safeCode = toSafeText(firebaseCode).toUpperCase();

  switch (safeCode) {
    case "TOO_MANY_ATTEMPTS_TRY_LATER":
      return {
        code: "auth/too-many-requests",
        message: "Too many requests right now. Please wait 15 minutes and try again.",
        status: 429,
      };
    case "INVALID_ID_TOKEN":
    case "TOKEN_EXPIRED":
      return {
        code: "auth/invalid-user-token",
        message: "Your session expired. Please sign in again and retry email verification.",
        status: 401,
      };
    case "USER_DISABLED":
      return {
        code: "auth/user-disabled",
        message: "This account has been disabled. Contact admin.",
        status: 403,
      };
    case "OPERATION_NOT_ALLOWED":
      return {
        code: "auth/operation-not-allowed",
        message:
          "Email verification is not enabled in Firebase Authentication. Enable Email/Password sign-in in Firebase Console.",
        status: 400,
      };
    case "INVALID_CONTINUE_URI":
      return {
        code: "auth/invalid-continue-uri",
        message:
          "Verification link configuration is invalid for this domain. Add the app domain to Firebase Authorized domains.",
        status: 400,
      };
    default:
      return {
        code: "auth/internal-error",
        message:
          "Firebase could not send the verification email right now. Check Firebase Authentication templates and authorized domains.",
        status: 502,
      };
  }
};

const resolveFirebaseApiKey = () =>
  toSafeText(
    process.env.FIREBASE_WEB_API_KEY ||
      process.env.VITE_FIREBASE_API_KEY ||
      process.env.FIREBASE_API_KEY
  );

const resolveFirebaseProjectId = (serviceAccount = null) =>
  toSafeText(
    process.env.FIREBASE_PROJECT_ID ||
      process.env.VITE_FIREBASE_PROJECT_ID ||
      serviceAccount?.project_id
  );

const normalizeContinueUrl = (value) => {
  const safeUrl = toSafeText(value);
  if (!safeUrl) return "";

  try {
    const parsed = new URL(safeUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return "";
    }
    return parsed.toString();
  } catch {
    return "";
  }
};

const resolveServiceAccountCredentials = () => {
  const rawJson = toSafeText(
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON ||
      process.env.FIREBASE_SERVICE_ACCOUNT ||
      process.env.GOOGLE_SERVICE_ACCOUNT_JSON ||
      process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON
  );

  if (rawJson) {
    try {
      const parsed = JSON.parse(rawJson);
      const clientEmail = toSafeText(parsed?.client_email);
      const privateKey = toSafeText(parsed?.private_key).replace(/\\n/g, "\n");
      const tokenUri =
        toSafeText(parsed?.token_uri) || DEFAULT_GOOGLE_TOKEN_ENDPOINT;

      if (clientEmail && privateKey) {
        return {
          client_email: clientEmail,
          private_key: privateKey,
          token_uri: tokenUri,
          project_id: toSafeText(parsed?.project_id),
        };
      }
    } catch {
      return null;
    }
  }

  const clientEmail = toSafeText(
    process.env.FIREBASE_CLIENT_EMAIL || process.env.GOOGLE_CLIENT_EMAIL
  );
  const privateKey = toSafeText(
    process.env.FIREBASE_PRIVATE_KEY || process.env.GOOGLE_PRIVATE_KEY
  ).replace(/\\n/g, "\n");
  if (!clientEmail || !privateKey) {
    return null;
  }

  return {
    client_email: clientEmail,
    private_key: privateKey,
    token_uri:
      toSafeText(process.env.GOOGLE_TOKEN_URI) || DEFAULT_GOOGLE_TOKEN_ENDPOINT,
    project_id: toSafeText(process.env.FIREBASE_PROJECT_ID),
  };
};

const base64UrlEncodeJson = (value) =>
  Buffer.from(JSON.stringify(value)).toString("base64url");

const createServiceAccountAssertion = (credentials) => {
  const issuedAt = Math.floor(Date.now() / 1000);
  const tokenUri =
    toSafeText(credentials?.token_uri) || DEFAULT_GOOGLE_TOKEN_ENDPOINT;
  const unsignedToken = `${base64UrlEncodeJson({
    alg: "RS256",
    typ: "JWT",
  })}.${base64UrlEncodeJson({
    iss: credentials.client_email,
    sub: credentials.client_email,
    aud: tokenUri,
    scope: DEFAULT_GOOGLE_OAUTH_SCOPE,
    iat: issuedAt,
    exp: issuedAt + 3600,
  })}`;

  const signer = createSign("RSA-SHA256");
  signer.update(unsignedToken);
  signer.end();
  const signature = signer.sign(credentials.private_key).toString("base64url");
  return `${unsignedToken}.${signature}`;
};

const fetchGoogleAccessToken = async (credentials) => {
  const tokenUri =
    toSafeText(credentials?.token_uri) || DEFAULT_GOOGLE_TOKEN_ENDPOINT;
  const response = await fetch(tokenUri, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: createServiceAccountAssertion(credentials),
    }).toString(),
  });
  const rawText = await response.text();
  const payload = parseJsonSafe(rawText);

  if (!response.ok) {
    const error = new Error(
      toSafeText(payload?.error_description) ||
        toSafeText(payload?.error) ||
        "Unable to fetch Google OAuth access token."
    );
    error.code = "auth/google-oauth-failed";
    throw error;
  }

  const accessToken = toSafeText(payload?.access_token);
  if (!accessToken) {
    const error = new Error("Google OAuth response did not include an access token.");
    error.code = "auth/google-oauth-failed";
    throw error;
  }

  return accessToken;
};

const lookupUserByIdToken = async ({ firebaseApiKey, idToken }) => {
  const response = await fetch(
    `${DEFAULT_FIREBASE_LOOKUP_ENDPOINT}?key=${encodeURIComponent(firebaseApiKey)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idToken }),
    }
  );
  const rawText = await response.text();
  const payload = parseJsonSafe(rawText);

  if (!response.ok) {
    const firebaseCode = toSafeText(payload?.error?.message);
    const mapped = mapFirebaseVerificationError(firebaseCode);
    const error = new Error(mapped.message);
    error.code = mapped.code;
    error.status = mapped.status;
    throw error;
  }

  const user = payload?.users?.[0];
  const email = toSafeText(user?.email).toLowerCase();
  if (!email) {
    const error = new Error("Unable to resolve the email for this verification request.");
    error.code = "auth/internal-error";
    throw error;
  }

  return {
    email,
    emailVerified: Boolean(user?.emailVerified),
  };
};

const buildVerificationEmailText = ({ verificationLink }) =>
  [
    "Verify your A3 Hub email to activate your account.",
    "",
    "Open the latest verification link below:",
    verificationLink,
    "",
    "If you requested multiple emails, only the newest link will work.",
  ].join("\n");

const buildVerificationEmailHtml = ({ email, verificationLink }) => {
  const safeEmail = escapeHtml(email);
  const safeLink = escapeHtml(verificationLink);

  return `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f4f6fb;font-family:Arial,sans-serif;color:#10243f;">
    <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #d9e3f2;border-radius:18px;padding:28px;">
      <p style="margin:0 0 8px;font-size:12px;letter-spacing:0.18em;text-transform:uppercase;color:#5a6b85;font-weight:700;">A3 Hub Security</p>
      <h1 style="margin:0 0 14px;font-size:28px;line-height:1.2;color:#10243f;">Verify your email</h1>
      <p style="margin:0 0 12px;font-size:15px;line-height:1.7;">Complete your account setup for <strong>${safeEmail}</strong> with a fresh verification link.</p>
      <p style="margin:0 0 20px;font-size:15px;line-height:1.7;">If you requested multiple emails, open only the newest link.</p>
      <p style="margin:0 0 20px;">
        <a href="${safeLink}" style="display:inline-block;border-radius:999px;background:#0f4c81;color:#ffffff;font-size:15px;font-weight:700;line-height:1;padding:14px 22px;text-decoration:none;">Verify Email</a>
      </p>
      <p style="margin:0 0 10px;font-size:13px;line-height:1.6;color:#4e6079;">If the button does not open, paste this link into your browser:</p>
      <p style="margin:0;font-size:13px;line-height:1.7;word-break:break-word;"><a href="${safeLink}" style="color:#2459d3;">${safeLink}</a></p>
    </div>
  </body>
</html>`;
};

const requestVerificationLinkViaAdmin = async ({
  email,
  continueUrl,
  projectId,
  serviceAccount,
}) => {
  const accessToken = await fetchGoogleAccessToken(serviceAccount);
  const response = await fetch(
    `${DEFAULT_FIREBASE_ADMIN_OOB_ENDPOINT}/${encodeURIComponent(
      projectId
    )}/accounts:sendOobCode`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        requestType: "VERIFY_EMAIL",
        email,
        ...(continueUrl ? { continueUrl } : {}),
        canHandleCodeInApp: false,
        returnOobLink: true,
      }),
    }
  );
  const rawText = await response.text();
  const payload = parseJsonSafe(rawText);

  if (!response.ok) {
    const firebaseCode =
      toSafeText(payload?.error?.message) || toSafeText(payload?.error?.status);
    const mapped = mapFirebaseVerificationError(firebaseCode);
    const error = new Error(mapped.message);
    error.code = mapped.code;
    error.status = mapped.status;
    throw error;
  }

  const verificationLink = toSafeText(payload?.oobLink);
  if (!verificationLink) {
    const error = new Error("Firebase did not return a verification link.");
    error.code = "auth/internal-error";
    throw error;
  }

  return verificationLink;
};

const sendVerificationEmailViaCustomProvider = async ({
  email,
  verificationLink,
}) => {
  const providerResult = await sendEmailThroughConfiguredProvider({
    to: email,
    subject: "Verify your A3 Hub email",
    text: buildVerificationEmailText({ verificationLink }),
    html: buildVerificationEmailHtml({ email, verificationLink }),
    title: "Verify your A3 Hub email",
    message: "Complete your email verification with the latest secure link.",
    link: verificationLink,
    providerHint: "auth.verification",
  });

  if (!providerResult.ok) {
    const error = new Error("Verification email provider request failed.");
    error.code = "auth/email-provider-failed";
    error.details = providerResult;
    throw error;
  }

  return providerResult;
};

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  const firebaseApiKey = resolveFirebaseApiKey();
  if (!firebaseApiKey) {
    return {
      statusCode: 500,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        error: "Firebase Web API key is missing on the server.",
        code: "firebase/not-configured",
      }),
    };
  }

  const body = parseJsonSafe(event.body);
  const idToken = toSafeText(body.idToken);
  if (!idToken) {
    return {
      statusCode: 400,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        error: "Invalid payload. 'idToken' is required.",
        code: "auth/invalid-user-token",
      }),
    };
  }

  const continueUrl = normalizeContinueUrl(body.continueUrl);
  const payload = {
    requestType: "VERIFY_EMAIL",
    idToken,
    ...(continueUrl ? { continueUrl } : {}),
  };

  try {
    const currentUser = await lookupUserByIdToken({ firebaseApiKey, idToken });
    if (currentUser.emailVerified) {
      return {
        statusCode: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ok: true,
          email: currentUser.email,
          alreadyVerified: true,
        }),
      };
    }

    const serviceAccount = resolveServiceAccountCredentials();
    const projectId = resolveFirebaseProjectId(serviceAccount);
    if (serviceAccount && projectId && hasConfiguredEmailProvider()) {
      try {
        const verificationLink = await requestVerificationLinkViaAdmin({
          email: currentUser.email,
          continueUrl,
          projectId,
          serviceAccount,
        });
        const deliveryResult = await sendVerificationEmailViaCustomProvider({
          email: currentUser.email,
          verificationLink,
        });

        return {
          statusCode: 200,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            ok: true,
            email: currentUser.email,
            delivery: "custom",
            provider: toSafeText(deliveryResult.provider),
          }),
        };
      } catch {
        // Fall back to Firebase's built-in email sender when custom delivery is unavailable.
      }
    }

    const response = await fetch(
      `${DEFAULT_FIREBASE_OOB_ENDPOINT}?key=${encodeURIComponent(firebaseApiKey)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      }
    );
    const rawText = await response.text();
    const parsedBody = parseJsonSafe(rawText);

    if (!response.ok) {
      const firebaseCode = toSafeText(parsedBody?.error?.message);
      const mapped = mapFirebaseVerificationError(firebaseCode);
      return {
        statusCode: mapped.status,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          error: mapped.message,
          code: mapped.code,
          firebaseCode,
        }),
      };
    }

    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ok: true,
        email: toSafeText(parsedBody?.email) || currentUser.email,
        delivery: "firebase",
      }),
    };
  } catch (error) {
    return {
      statusCode: Number(error?.status || 502),
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        error:
          toSafeText(error?.message) ||
          "Unable to contact Firebase verification service.",
        code: toSafeText(error?.code) || "auth/network-request-failed",
      }),
    };
  }
};
