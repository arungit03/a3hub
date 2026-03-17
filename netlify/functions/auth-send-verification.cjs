const DEFAULT_FIREBASE_OOB_ENDPOINT =
  "https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode";

const { parseJsonSafe, toSafeText } = require("./_utils/provider-chain.cjs");

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

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  const firebaseApiKey = toSafeText(
    process.env.FIREBASE_WEB_API_KEY ||
      process.env.VITE_FIREBASE_API_KEY ||
      process.env.FIREBASE_API_KEY
  );
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
        email: toSafeText(parsedBody?.email),
      }),
    };
  } catch (error) {
    return {
      statusCode: 502,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        error:
          toSafeText(error?.message) ||
          "Unable to contact Firebase verification service.",
        code: "auth/network-request-failed",
      }),
    };
  }
};
