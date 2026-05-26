require("./load-env.cjs");

const { createClient } = require("@supabase/supabase-js");
const { toSafeText } = require("./provider-chain.cjs");
const { escapeHtml } = require("./email-provider.cjs");

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const rateLimitStore = new Map();

const jsonResponse = (statusCode, payload) => ({
  statusCode,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(payload),
});

const parseJsonBody = (event) => {
  const rawBody = toSafeText(event?.body);
  if (!rawBody) return {};
  try {
    return JSON.parse(rawBody);
  } catch {
    return {};
  }
};

const normalizeEmail = (value) => {
  const email = toSafeText(value).toLowerCase();
  return EMAIL_REGEX.test(email) ? email : "";
};

const normalizeRole = (value) => {
  const role = toSafeText(value).toLowerCase();
  if (role === "admin") return "admin";
  if (role === "staff") return "staff";
  return "student";
};

const getHeaderValue = (headers, name) => {
  if (!headers || typeof headers !== "object") return "";
  const target = toSafeText(name).toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (String(key || "").toLowerCase() !== target) continue;
    return Array.isArray(value) ? toSafeText(value[0]) : toSafeText(value);
  }
  return "";
};

const getRequestOrigin = (event) => {
  const origin = getHeaderValue(event?.headers, "origin");
  if (origin) return origin.replace(/\/+$/, "");

  const host =
    getHeaderValue(event?.headers, "x-forwarded-host") ||
    getHeaderValue(event?.headers, "host");
  if (!host) return toSafeText(process.env.URL).replace(/\/+$/, "");

  const proto = getHeaderValue(event?.headers, "x-forwarded-proto") || "https";
  return `${proto}://${host}`.replace(/\/+$/, "");
};

const resolveRedirectTo = (event, value) => {
  const requestOrigin = getRequestOrigin(event);
  const fallback =
    requestOrigin || toSafeText(process.env.URL).replace(/\/+$/, "") || "";
  const fallbackUrl = fallback ? `${fallback}/` : undefined;
  const rawValue = toSafeText(value);
  if (!rawValue) return fallbackUrl;

  try {
    const parsed = new URL(rawValue, fallbackUrl);
    if (!requestOrigin || parsed.origin === requestOrigin) {
      return parsed.toString();
    }
  } catch {
    // Fall through to the safe same-origin fallback.
  }
  return fallbackUrl;
};

const getClientIp = (event) => {
  const headers = event?.headers || {};
  const candidates = [
    getHeaderValue(headers, "x-nf-client-connection-ip"),
    getHeaderValue(headers, "x-forwarded-for"),
    getHeaderValue(headers, "client-ip"),
    toSafeText(event?.requestContext?.identity?.sourceIp),
    "unknown",
  ];
  const resolved = candidates.find(Boolean) || "unknown";
  return resolved.includes(",") ? toSafeText(resolved.split(",")[0]) : resolved;
};

const checkRateLimit = (
  event,
  {
    keyPrefix,
    max = 12,
    windowMs = 10 * 60 * 1000,
  } = {}
) => {
  const now = Date.now();
  const key = `${keyPrefix || "auth-email"}:${getClientIp(event)}`;
  const bucket = rateLimitStore.get(key) || { count: 0, resetAt: now + windowMs };
  if (now > bucket.resetAt) {
    bucket.count = 0;
    bucket.resetAt = now + windowMs;
  }
  bucket.count += 1;
  rateLimitStore.set(key, bucket);

  for (const [entryKey, entry] of rateLimitStore.entries()) {
    if (now > entry.resetAt + windowMs) {
      rateLimitStore.delete(entryKey);
    }
  }

  if (bucket.count <= max) return null;
  return jsonResponse(429, {
    ok: false,
    code: "auth/too-many-requests",
    error: "Too many verification email requests. Please try again shortly.",
    retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
  });
};

const getSupabaseAdminClient = () => {
  const url = toSafeText(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL);
  const serviceRoleKey = toSafeText(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!url || !serviceRoleKey) {
    return {
      client: null,
      response: jsonResponse(501, {
        ok: false,
        code: "auth/server-not-configured",
        error:
          "Server auth email is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
      }),
    };
  }

  return {
    client: createClient(url, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    }),
    response: null,
  };
};

const getDocumentsTable = () =>
  toSafeText(
    process.env.SUPABASE_DOCUMENTS_TABLE ||
      process.env.VITE_SUPABASE_DOCUMENTS_TABLE
  ) || "app_documents";

const findUserProfileByEmail = async (adminClient, email) => {
  const { data, error } = await adminClient
    .from(getDocumentsTable())
    .select("path, document_id, data")
    .eq("collection_path", "users")
    .filter("data->>email", "eq", email)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data || null;
};

const upsertDocument = async (adminClient, path, data) => {
  const segments = toSafeText(path).split("/").filter(Boolean);
  const documentId = segments[segments.length - 1] || "";
  const collectionPath = segments.slice(0, -1).join("/");
  const { error } = await adminClient.from(getDocumentsTable()).upsert(
    {
      path,
      collection_path: collectionPath,
      document_id: documentId,
      data,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "path" }
  );
  if (error) throw error;
};

const buildVerificationEmail = ({ actionLink, displayName = "there" }) => {
  const safeName = escapeHtml(toSafeText(displayName) || "there");
  const safeActionLink = escapeHtml(actionLink);
  const subject = "Verify your A3 Hub email";
  const text = [
    `Hi ${toSafeText(displayName) || "there"},`,
    "",
    "Use this secure link to verify your A3 Hub email address:",
    actionLink,
    "",
    "If you did not request this, you can ignore this email.",
  ].join("\n");
  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:16px;background:#f4f6fb;font-family:Arial,sans-serif;color:#10243f;">
    <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #d9e3f2;border-radius:14px;padding:24px;">
      <h2 style="margin:0 0 12px;font-size:20px;line-height:1.35;">Verify your A3 Hub email</h2>
      <p style="margin:0 0 16px;font-size:14px;line-height:1.6;">Hi ${safeName}, use the secure button below to finish setting up your account.</p>
      <p style="margin:0 0 18px;">
        <a href="${safeActionLink}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:999px;padding:11px 18px;font-size:14px;font-weight:700;">Verify Email</a>
      </p>
      <p style="margin:0;font-size:12px;line-height:1.6;color:#52647a;">If the button does not work, copy and paste this link into your browser:<br>${safeActionLink}</p>
    </div>
  </body>
</html>`;
  return { subject, text, html };
};

const isExistingUserError = (error) => {
  const normalized = `${error?.code || ""} ${error?.message || ""}`.toLowerCase();
  return (
    normalized.includes("user already") ||
    normalized.includes("already registered") ||
    normalized.includes("already exists")
  );
};

module.exports = {
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
};
