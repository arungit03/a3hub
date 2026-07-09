/**
 * Shared helpers for A3 Hub Netlify Functions.
 *
 * Provides a consistent JSON envelope, bearer-token extraction, Supabase-based
 * user verification (supporting both the Firebase-style `{ users: [...] }` and
 * GoTrue `{ id, user_metadata }` payloads), role gating, and a lightweight
 * per-process rate limiter keyed by function + caller.
 */

const toSafeText = (value) => String(value ?? "").trim();

const getEnv = (...keys) => {
  for (const key of keys) {
    const value = toSafeText(process.env[key]);
    if (value) return value;
  }
  return "";
};

const safeJsonParse = (value, fallback = null) => {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const json = (statusCode, body) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  },
  body: JSON.stringify(body),
});

const fail = (statusCode, code, message, extra = {}) =>
  json(statusCode, { ok: false, code, error: message, ...extra });

const getBearerToken = (event) => {
  const header = event?.headers?.authorization || event?.headers?.Authorization || "";
  const match = String(header).match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
};

const getClientIp = (event) => {
  const headers = event?.headers || {};
  const direct =
    headers["x-nf-client-connection-ip"] ||
    headers["X-Nf-Client-Connection-Ip"] ||
    "";
  const forwarded = String(headers["x-forwarded-for"] || headers["X-Forwarded-For"] || "")
    .split(",")[0]
    .trim();
  return toSafeText(direct) || forwarded || "unknown";
};

const normalizeRole = (value) => {
  const normalized = toSafeText(value).toLowerCase();
  if (normalized === "admin") return "admin";
  if (normalized === "staff") return "staff";
  if (normalized === "parent") return "parent";
  if (normalized.includes("canteen")) return "canteen_staff";
  return "student";
};

// Verify the caller's token against Supabase GoTrue. Returns { uid, email, role }
// or null when the token is missing/invalid. Supports both response shapes used
// across the app (Firebase identity-toolkit array and GoTrue single user).
const verifyUser = async (token) => {
  if (!token) return null;
  const supabaseUrl = getEnv("SUPABASE_URL", "VITE_SUPABASE_URL");
  const apiKey = getEnv(
    "SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_ANON_KEY",
    "VITE_SUPABASE_PUBLISHABLE_KEY",
    "VITE_SUPABASE_ANON_KEY"
  );

  let response;
  try {
    response = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: apiKey,
      },
    });
  } catch {
    return null;
  }
  if (!response.ok) return null;

  const data = await response.json().catch(() => null);
  if (!data) return null;

  // Shape 1: { users: [{ localId, email, customAttributes }] }
  if (Array.isArray(data.users) && data.users[0]) {
    const user = data.users[0];
    const attrs = user.customAttributes ? safeJsonParse(user.customAttributes, {}) : {};
    return {
      uid: toSafeText(user.localId || user.uid || user.id),
      email: toSafeText(user.email),
      role: normalizeRole(attrs?.role || user.role),
    };
  }

  // Shape 2: GoTrue single user { id, email, user_metadata: { role } }
  if (data.id || data.email) {
    const role =
      data.user_metadata?.role || data.app_metadata?.role || data.role || "";
    return {
      uid: toSafeText(data.id || data.sub),
      email: toSafeText(data.email),
      role: normalizeRole(role),
    };
  }

  return null;
};

const resolveAllowedRoles = (envValue, fallbackRoles) => {
  const raw = toSafeText(envValue);
  if (!raw) return fallbackRoles;
  const roles = raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map(normalizeRole);
  return roles.length > 0 ? roles : fallbackRoles;
};

// Per-process sliding-window rate limiter. Adequate for a single Lambda
// instance; returns true when the request is within budget.
const rateBuckets = new Map();
const enforceRateLimit = (name, key) => {
  const max = Number(getEnv(`${name}_RATE_LIMIT_MAX`));
  if (!Number.isFinite(max) || max <= 0) return true; // unlimited
  const windowMs = Number(getEnv(`${name}_RATE_LIMIT_WINDOW_MS`)) || 60000;
  const now = Date.now();
  const bucketKey = `${name}:${key}`;
  let bucket = rateBuckets.get(bucketKey);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs };
    rateBuckets.set(bucketKey, bucket);
  }
  bucket.count += 1;
  return bucket.count <= max;
};

/**
 * Authenticate the request, enforce the function's allowed roles, then apply
 * the rate limit. Returns { user } on success or { error } (a ready response).
 * The order matters: a missing token short-circuits before any network call.
 */
const authenticateAndAuthorize = async (event, { name, fallbackRoles }) => {
  const token = getBearerToken(event);
  if (!token) {
    return { error: fail(401, "auth/missing-token", "Authentication token is missing.") };
  }

  const user = await verifyUser(token);
  if (!user || !user.uid) {
    return { error: fail(401, "auth/invalid-token", "Authentication token is invalid.") };
  }

  const allowed = resolveAllowedRoles(getEnv(`${name}_ALLOWED_ROLES`), fallbackRoles);
  if (!allowed.includes(user.role)) {
    return {
      error: fail(403, "auth/forbidden-role", "Your role is not allowed to use this action."),
    };
  }

  if (!enforceRateLimit(name, user.uid || getClientIp(event))) {
    return { error: fail(429, "rate/limit-exceeded", "Too many requests. Please slow down.") };
  }

  return { user };
};

module.exports = {
  toSafeText,
  getEnv,
  safeJsonParse,
  json,
  fail,
  getBearerToken,
  getClientIp,
  normalizeRole,
  verifyUser,
  resolveAllowedRoles,
  enforceRateLimit,
  authenticateAndAuthorize,
};
