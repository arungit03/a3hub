const DEFAULT_RESEND_ENDPOINT = "https://api.resend.com/emails";
const MAX_SUBJECT_LENGTH = 160;
const MAX_BODY_LENGTH = 12000;

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};

const toSafeText = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

const parseJsonSafe = (raw: string) => {
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

const normalizeEmail = (value: unknown) => {
  const email = toSafeText(value).toLowerCase();
  if (!email) return "";
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
};

const toEmailArray = (value: unknown) => {
  const values = Array.isArray(value) ? value : [value];
  return Array.from(new Set(values.map((item) => normalizeEmail(item)).filter(Boolean)));
};

const escapeHtml = (value: unknown) =>
  String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const jsonResponse = (status: number, payload: Record<string, unknown>) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "content-type": "application/json",
    },
  });

const getBearerToken = (request: Request) => {
  const authorization = toSafeText(request.headers.get("authorization"));
  const match = authorization.match(/^bearer\s+(.+)$/i);
  return match ? toSafeText(match[1]) : "";
};

const normalizeRoleList = (value: unknown) => {
  if (Array.isArray(value)) {
    return Array.from(
      new Set(
        value
          .map((item) => toSafeText(String(item || "")).toLowerCase())
          .filter(Boolean)
      )
    );
  }

  const raw = toSafeText(String(value || ""));
  if (!raw) return [];
  return Array.from(
    new Set(raw.split(",").map((item) => item.trim().toLowerCase()).filter(Boolean))
  );
};

const getServerConfig = () => {
  const supabaseUrl = toSafeText(Deno.env.get("SUPABASE_URL")).replace(/\/+$/, "");
  const serviceKey =
    toSafeText(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) ||
    toSafeText(Deno.env.get("SUPABASE_ANON_KEY"));
  const documentsTable =
    toSafeText(Deno.env.get("SUPABASE_DOCUMENTS_TABLE")) ||
    toSafeText(Deno.env.get("VITE_SUPABASE_DOCUMENTS_TABLE")) ||
    "app_documents";
  return { supabaseUrl, serviceKey, documentsTable };
};

const base64UrlToBytes = (value: string) => {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
};

const parseJwtPart = (value: string) => {
  try {
    return JSON.parse(new TextDecoder().decode(base64UrlToBytes(value)));
  } catch {
    return {};
  }
};

const getFirebaseProjectId = () =>
  toSafeText(Deno.env.get("FIREBASE_PROJECT_ID")) ||
  toSafeText(Deno.env.get("VITE_FIREBASE_PROJECT_ID")) ||
  "a3hubb";

const fetchFirebaseJwks = async () => {
  const response = await fetch(
    "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"
  );
  if (!response.ok) return {};
  const payload = parseJsonSafe(await response.text());
  return payload?.keys && typeof payload.keys === "object" ? payload.keys : {};
};

const verifyFirebaseAuthUser = async ({ token }: { token: string }) => {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return { ok: false, status: 401, error: "Invalid Firebase auth token." };
  }

  const header = parseJwtPart(parts[0]);
  const payload = parseJwtPart(parts[1]);
  const kid = toSafeText(header?.kid);
  const alg = toSafeText(header?.alg);
  if (!kid || alg !== "RS256") {
    return { ok: false, status: 401, error: "Invalid Firebase token header." };
  }

  const keys = await fetchFirebaseJwks();
  const key = Array.isArray(keys) ? keys.find((item) => item?.kid === kid) : null;
  if (!key) {
    return { ok: false, status: 401, error: "Firebase signing key not found." };
  }

  const cryptoKey = await crypto.subtle.importKey(
    "jwk",
    key,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"]
  );
  const verified = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    base64UrlToBytes(parts[2]),
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`)
  );
  if (!verified) {
    return { ok: false, status: 401, error: "Firebase token signature is invalid." };
  }

  const projectId = getFirebaseProjectId();
  const nowSeconds = Math.floor(Date.now() / 1000);
  const expectedIssuer = `https://securetoken.google.com/${projectId}`;
  const expiresAt = Number(payload?.exp || 0);
  const issuedAt = Number(payload?.iat || 0);
  const uid = toSafeText(payload?.sub || payload?.user_id);

  if (!uid || uid.length > 128) {
    return { ok: false, status: 401, error: "Firebase token subject is invalid." };
  }
  if (payload?.aud !== projectId || payload?.iss !== expectedIssuer) {
    return { ok: false, status: 401, error: "Firebase token project is invalid." };
  }
  if (!Number.isFinite(expiresAt) || expiresAt <= nowSeconds) {
    return { ok: false, status: 401, error: "Firebase token has expired." };
  }
  if (!Number.isFinite(issuedAt) || issuedAt > nowSeconds + 300) {
    return { ok: false, status: 401, error: "Firebase token issue time is invalid." };
  }

  return {
    ok: true,
    user: {
      id: uid,
      email: toSafeText(payload?.email).toLowerCase(),
      email_confirmed_at: payload?.email_verified ? new Date().toISOString() : null,
      app_metadata: payload,
      user_metadata: payload,
    },
  };
};

const verifySupabaseAuthUser = async ({ token }: { token: string }) => {
  const { supabaseUrl, serviceKey } = getServerConfig();
  if (!supabaseUrl || !serviceKey) {
    return { ok: false, status: 500, error: "Supabase function config is missing." };
  }

  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: serviceKey,
      authorization: `Bearer ${token}`,
    },
  });
  const payload = parseJsonSafe(await response.text());
  if (!response.ok) {
    return {
      ok: false,
      status: response.status === 401 ? 401 : 502,
      error: payload?.message || payload?.msg || "Invalid auth token.",
    };
  }

  return { ok: true, user: payload };
};

const fetchAuthUser = async ({ token }: { token: string }) => {
  const supabaseResult = await verifySupabaseAuthUser({ token });
  if (supabaseResult.ok) return supabaseResult;

  const firebaseResult = await verifyFirebaseAuthUser({ token }).catch((error) => ({
    ok: false,
    status: 401,
    error: error?.message || "Firebase token verification failed.",
  }));
  if (firebaseResult.ok) return firebaseResult;

  return firebaseResult.status === 500 ? firebaseResult : supabaseResult;
};

const fetchUserProfile = async (uid: string) => {
  const { supabaseUrl, serviceKey, documentsTable } = getServerConfig();
  if (!supabaseUrl || !serviceKey || !uid) return {};

  const encodedPath = encodeURIComponent(`users/${uid}`);
  const response = await fetch(
    `${supabaseUrl}/rest/v1/${encodeURIComponent(documentsTable)}?path=eq.${encodedPath}&select=data`,
    {
      headers: {
        apikey: serviceKey,
        authorization: `Bearer ${serviceKey}`,
      },
    }
  );
  if (!response.ok) return {};
  const payload = parseJsonSafe(await response.text());
  return Array.isArray(payload) ? payload[0]?.data || {} : {};
};

const assertCanSendEmail = async (request: Request) => {
  const token = getBearerToken(request);
  if (!token) {
    return { ok: false, response: jsonResponse(401, { error: "Authentication required." }) };
  }

  const authResult = await fetchAuthUser({ token });
  if (!authResult.ok) {
    return {
      ok: false,
      response: jsonResponse(Number(authResult.status || 401), {
        error: authResult.error || "Authentication failed.",
      }),
    };
  }

  const user = authResult.user || {};
  const uid = toSafeText(user.id || user.sub);
  const profile = await fetchUserProfile(uid);
  const profileRole = toSafeText(profile?.role).toLowerCase();
  const roles = Array.from(
    new Set([
      ...normalizeRoleList(user?.app_metadata?.roles),
      ...normalizeRoleList(user?.app_metadata?.role),
      ...normalizeRoleList(user?.user_metadata?.roles),
      ...normalizeRoleList(user?.user_metadata?.role),
      ...normalizeRoleList(profileRole),
    ])
  );
  const allowedRoles = normalizeRoleList(
    Deno.env.get("EMAIL_SEND_ALLOWED_ROLES") || "staff,admin"
  );
  const isAllowed = roles.some((role) => allowedRoles.includes(role));
  const status = toSafeText(profile?.status).toLowerCase();

  if (status === "blocked" || status === "pending" || status === "pending_approval") {
    return { ok: false, response: jsonResponse(403, { error: "Account is not active." }) };
  }
  if (!isAllowed) {
    return { ok: false, response: jsonResponse(403, { error: "Insufficient role permission." }) };
  }

  return { ok: true };
};

const buildHtmlFallback = ({
  title,
  message = "",
  link = "",
}: {
  title: string;
  message?: string;
  link?: string;
}) => {
  const safeTitle = escapeHtml(title || "A3 Hub Notification");
  const safeMessage = escapeHtml(message);
  const safeLink = toSafeText(link);
  const safeLinkHtml = safeLink ? escapeHtml(safeLink) : "";

  return `<!doctype html>
<html>
  <body style="margin:0;padding:16px;background:#f4f6fb;font-family:Arial,sans-serif;color:#10243f;">
    <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #d9e3f2;border-radius:12px;padding:20px;">
      <h2 style="margin:0 0 12px;font-size:18px;line-height:1.4;">${safeTitle}</h2>
      ${safeMessage ? `<p style="margin:0 0 14px;font-size:14px;line-height:1.6;">${safeMessage}</p>` : ""}
      ${safeLinkHtml ? `<p style="margin:0;font-size:13px;line-height:1.6;"><a href="${safeLinkHtml}" style="color:#2459d3;">Open in app</a></p>` : ""}
    </div>
  </body>
</html>`;
};

const selectProviderOrder = () => {
  const raw =
    toSafeText(Deno.env.get("EMAIL_PROVIDER_ORDER")) ||
    toSafeText(Deno.env.get("EMAIL_PROVIDER")) ||
    "resend,webhook";
  return raw
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter((item) => item === "resend" || item === "webhook");
};

const sendWithResend = async ({
  recipients,
  subject,
  text,
  html,
}: {
  recipients: string[];
  subject: string;
  text: string;
  html: string;
}) => {
  const resendApiKey = toSafeText(Deno.env.get("RESEND_API_KEY"));
  const fromAddress =
    toSafeText(Deno.env.get("EMAIL_FROM")) ||
    toSafeText(Deno.env.get("RESEND_FROM_EMAIL")) ||
    toSafeText(Deno.env.get("RESEND_FROM")) ||
    "A3 Hub <onboarding@resend.dev>";
  const resendEndpoint =
    toSafeText(Deno.env.get("RESEND_API_ENDPOINT")) || DEFAULT_RESEND_ENDPOINT;

  if (!resendApiKey || !fromAddress) {
    return {
      ok: false,
      status: 500,
      provider: "resend",
      details: { error: "Server email config missing." },
    };
  }

  const response = await fetch(resendEndpoint, {
    method: "POST",
    headers: {
      authorization: `Bearer ${resendApiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: fromAddress,
      to: recipients,
      subject,
      text,
      html,
    }),
  });
  const details = parseJsonSafe(await response.text());

  return {
    ok: response.ok,
    status: response.status,
    provider: "resend",
    id: details?.id || "",
    details,
  };
};

const sendWithWebhook = async ({
  recipients,
  subject,
  text,
  html,
  title,
  message,
  link,
}: {
  recipients: string[];
  subject: string;
  text: string;
  html: string;
  title: string;
  message: string;
  link: string;
}) => {
  const webhookUrl =
    toSafeText(Deno.env.get("EMAIL_WEBHOOK_URL")) ||
    toSafeText(Deno.env.get("EMAIL_FALLBACK_WEBHOOK_URL"));
  const authToken = toSafeText(Deno.env.get("EMAIL_WEBHOOK_AUTH_TOKEN"));
  if (!webhookUrl) {
    return {
      ok: false,
      status: 500,
      provider: "webhook",
      details: { error: "Webhook email config missing." },
    };
  }

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(authToken ? { authorization: `Bearer ${authToken}` } : {}),
    },
    body: JSON.stringify({
      event: "notification.email",
      providerHint: "custom",
      to: recipients,
      subject,
      text,
      html,
      title,
      message,
      link,
    }),
  });
  const details = parseJsonSafe(await response.text());

  return {
    ok: response.ok,
    status: response.status,
    provider: "webhook",
    details,
  };
};

const sendEmailThroughConfiguredProvider = async (body: Record<string, unknown>) => {
  const recipients = toEmailArray(body.to || body.email);
  if (recipients.length === 0) {
    return { ok: false, statusCode: 400, error: "Invalid payload. 'to' is required." };
  }

  const subject = (toSafeText(body.subject || body.title) || "A3 Hub Notification").slice(
    0,
    MAX_SUBJECT_LENGTH
  );
  const text = toSafeText(body.text || body.message).slice(0, MAX_BODY_LENGTH);
  const title = toSafeText(body.title || subject);
  const message = toSafeText(body.message || text);
  const link = toSafeText(body.link);
  const html =
    toSafeText(body.html).slice(0, MAX_BODY_LENGTH) ||
    buildHtmlFallback({ title, message, link });

  const attempts = [];
  for (const provider of selectProviderOrder()) {
    const result =
      provider === "resend"
        ? await sendWithResend({ recipients, subject, text, html })
        : await sendWithWebhook({ recipients, subject, text, html, title, message, link });
    attempts.push(result);
    if (result.ok) {
      return {
        ok: true,
        statusCode: 200,
        provider: result.provider,
        id: result.id || "",
        details: result.details || {},
        attempts,
      };
    }
  }

  return {
    ok: false,
    statusCode: 502,
    error: "Email provider request failed.",
    attempts,
  };
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed." });
  }

  const authResult = await assertCanSendEmail(request);
  if (!authResult.ok) {
    return authResult.response || jsonResponse(401, { error: "Authentication failed." });
  }

  const body = parseJsonSafe(await request.text());
  const result = await sendEmailThroughConfiguredProvider(body);
  return jsonResponse(Number(result.statusCode || (result.ok ? 200 : 502)), result);
});
