require("./load-env.cjs");

const TOKEN_CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_TOKEN_CACHE_SIZE = 3000;
const MAX_RATE_STORE_SIZE = 6000;

const tokenCache = new Map();
const rateLimitStore = new Map();

const toSafeText = (value) => (typeof value === "string" ? value.trim() : "");

const toPositiveInteger = (value, fallback) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return Number(fallback);
  return Math.floor(parsed);
};

const parseJsonSafe = (raw) => {
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

const buildJsonResponse = (statusCode, payload, extraHeaders = {}) => ({
  statusCode,
  headers: {
    "content-type": "application/json",
    ...extraHeaders,
  },
  body: JSON.stringify(payload),
});

const getHeaderValue = (headers, name) => {
  if (!headers || typeof headers !== "object") return "";
  const target = toSafeText(name).toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (String(key || "").toLowerCase() !== target) continue;
    return Array.isArray(value) ? toSafeText(value[0]) : toSafeText(value);
  }
  return "";
};

const extractBearerToken = (event) => {
  const authorization = getHeaderValue(event?.headers, "authorization");
  if (!authorization) return "";
  const match = authorization.match(/^bearer\s+(.+)$/i);
  return match ? toSafeText(match[1]) : "";
};

const getClientIp = (event) => {
  const headers = event?.headers || {};
  const fallback =
    toSafeText(event?.clientContext?.ip) ||
    toSafeText(event?.requestContext?.identity?.sourceIp) ||
    "unknown";
  const candidates = [
    toSafeText(headers["x-nf-client-connection-ip"]),
    toSafeText(headers["x-forwarded-for"]),
    toSafeText(headers["client-ip"]),
    fallback,
  ];
  const resolved = candidates.find((value) => value.length > 0) || "unknown";
  return resolved.includes(",") ? toSafeText(resolved.split(",")[0]) : resolved;
};

const decodeJwtPayload = (token) => {
  const encoded = String(token || "").split(".")[1];
  if (!encoded) return {};
  const normalized = encoded
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(encoded.length / 4) * 4, "=");
  try {
    return JSON.parse(Buffer.from(normalized, "base64").toString("utf8"));
  } catch {
    return {};
  }
};

const parseTokenExpiryMs = (token) => {
  const payload = decodeJwtPayload(token);
  const expSeconds = Number(payload?.exp);
  return Number.isFinite(expSeconds) && expSeconds > 0
    ? Math.floor(expSeconds * 1000)
    : 0;
};

const normalizeRoleList = (value) => {
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
    new Set(
      raw
        .split(",")
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean)
    )
  );
};

const normalizeAccountStatus = (value) => {
  const normalized = toSafeText(value).toLowerCase();
  if (normalized === "blocked") return "blocked";
  if (normalized === "pending" || normalized === "pending_approval") return "pending";
  return "active";
};

const resolveAllowedRoles = (allowedRoles, fallbackRoles = []) => {
  const resolved = normalizeRoleList(allowedRoles);
  return resolved.length > 0 ? resolved : normalizeRoleList(fallbackRoles);
};

const resolveSupabaseConfig = () => {
  const url = toSafeText(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL);
  const key = toSafeText(
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_SECRET_KEY ||
      process.env.SUPABASE_PUBLISHABLE_KEY ||
      process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
      process.env.VITE_SUPABASE_ANON_KEY
  );
  const documentsTable =
    toSafeText(
      process.env.SUPABASE_DOCUMENTS_TABLE ||
        process.env.VITE_SUPABASE_DOCUMENTS_TABLE
    ) || "app_documents";
  return {
    url: url.replace(/\/+$/, ""),
    key,
    documentsTable,
  };
};

const getSupabaseConfigOrThrow = () => {
  const config = resolveSupabaseConfig();
  if (!config.url || !config.key) {
    const error = new Error("Supabase server config is missing.");
    error.status = 500;
    error.code = "auth/missing-server-config";
    throw error;
  }
  return config;
};

const parseRolesFromClaims = (...sources) => {
  const roles = [];
  for (const claims of sources) {
    if (!claims || typeof claims !== "object" || Array.isArray(claims)) continue;
    const singleRole = toSafeText(claims.role).toLowerCase();
    if (singleRole) roles.push(singleRole);
    if (Array.isArray(claims.roles)) {
      claims.roles.forEach((role) => {
        const safeRole = toSafeText(role).toLowerCase();
        if (safeRole) roles.push(safeRole);
      });
    }
    if (claims.admin === true || claims.isAdmin === true) roles.push("admin");
    if (claims.staff === true) roles.push("staff");
    if (claims.student === true) roles.push("student");
    if (claims.parent === true) roles.push("parent");
  }
  return Array.from(new Set(roles));
};

const fetchSupabaseUser = async ({ config, token }) => {
  const response = await fetch(`${config.url}/auth/v1/user`, {
    method: "GET",
    headers: {
      apikey: config.key,
      authorization: `Bearer ${token}`,
    },
  });
  const rawText = await response.text();
  const payload = parseJsonSafe(rawText);
  if (!response.ok) {
    const error = new Error(
      toSafeText(payload?.msg || payload?.message || payload?.error_description) ||
        "Invalid auth token."
    );
    error.status = response.status >= 500 ? 502 : 401;
    error.code = "auth/token-verification-failed";
    throw error;
  }
  if (Array.isArray(payload?.users) && payload.users[0]) {
    const legacyUser = payload.users[0];
    const parsedClaims =
      typeof legacyUser.customAttributes === "string"
        ? parseJsonSafe(legacyUser.customAttributes)
        : {};
    return {
      id: legacyUser.localId,
      email: legacyUser.email,
      email_confirmed_at: legacyUser.emailVerified
        ? new Date().toISOString()
        : null,
      user_metadata: parsedClaims,
      app_metadata: parsedClaims,
    };
  }
  return payload;
};

const fetchProfile = async ({ config, token, uid }) => {
  const safeUid = toSafeText(uid);
  if (!safeUid) return {};
  const encodedPath = encodeURIComponent(`users/${safeUid}`);
  const endpoint = `${config.url}/rest/v1/${encodeURIComponent(
    config.documentsTable
  )}?path=eq.${encodedPath}&select=data`;
  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        apikey: config.key,
        authorization: `Bearer ${token}`,
      },
    });
    if (!response.ok) return {};
    const payload = parseJsonSafe(await response.text());
    return Array.isArray(payload) ? payload[0]?.data || {} : {};
  } catch {
    return {};
  }
};

const pruneTokenCache = () => {
  if (tokenCache.size <= MAX_TOKEN_CACHE_SIZE) return;
  const now = Date.now();
  for (const [key, entry] of tokenCache.entries()) {
    if (entry?.expiresAt > now) continue;
    tokenCache.delete(key);
  }
  if (tokenCache.size <= MAX_TOKEN_CACHE_SIZE) return;

  const extra = tokenCache.size - MAX_TOKEN_CACHE_SIZE;
  let removed = 0;
  for (const key of tokenCache.keys()) {
    tokenCache.delete(key);
    removed += 1;
    if (removed >= extra) break;
  }
};

const pruneRateStore = () => {
  if (rateLimitStore.size <= MAX_RATE_STORE_SIZE) return;
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (Number(entry?.resetAt || 0) >= now) continue;
    rateLimitStore.delete(key);
  }
  if (rateLimitStore.size <= MAX_RATE_STORE_SIZE) return;

  const extra = rateLimitStore.size - MAX_RATE_STORE_SIZE;
  let removed = 0;
  for (const key of rateLimitStore.keys()) {
    rateLimitStore.delete(key);
    removed += 1;
    if (removed >= extra) break;
  }
};

const verifySupabaseAccessToken = async (token) => {
  const safeToken = toSafeText(token);
  if (!safeToken) {
    const error = new Error("Missing bearer token.");
    error.status = 401;
    error.code = "auth/missing-token";
    throw error;
  }

  const now = Date.now();
  const cached = tokenCache.get(safeToken);
  if (cached && Number(cached.expiresAt || 0) > now && cached.authContext) {
    return cached.authContext;
  }

  const config = getSupabaseConfigOrThrow();
  const user = await fetchSupabaseUser({ config, token: safeToken });
  const uid = toSafeText(user.id || user.sub);
  if (!uid) {
    const error = new Error("Invalid auth token.");
    error.status = 401;
    error.code = "auth/invalid-token";
    throw error;
  }

  const profile = await fetchProfile({ config, token: safeToken, uid });
  const metadataRoles = parseRolesFromClaims(user.app_metadata, user.user_metadata);
  const profileRole = toSafeText(profile?.role).toLowerCase();
  const roles = Array.from(new Set([...metadataRoles, ...normalizeRoleList(profileRole)]));
  const authContext = {
    uid,
    email: toSafeText(user.email).toLowerCase(),
    emailVerified: Boolean(user.email_confirmed_at || user.confirmed_at),
    claims: {
      app_metadata: user.app_metadata || {},
      user_metadata: user.user_metadata || {},
    },
    roles,
    profileRole,
    accountStatus: normalizeAccountStatus(profile?.status),
  };

  const tokenExpiryMs = parseTokenExpiryMs(safeToken);
  const ttlCandidates = [TOKEN_CACHE_TTL_MS];
  if (tokenExpiryMs > now) ttlCandidates.push(Math.max(1000, tokenExpiryMs - now));
  const ttl = Math.max(1000, Math.min(...ttlCandidates));
  tokenCache.set(safeToken, {
    authContext,
    expiresAt: now + ttl,
  });
  pruneTokenCache();

  return authContext;
};

const checkRateLimit = ({ key, maxRequests = 60, windowMs = 60 * 1000 }) => {
  const safeKey = toSafeText(key) || "unknown";
  const safeWindowMs = toPositiveInteger(windowMs, 60 * 1000);
  const safeMaxRequests = toPositiveInteger(maxRequests, 60);
  const now = Date.now();

  let state = rateLimitStore.get(safeKey);
  if (!state || now >= Number(state.resetAt || 0)) {
    state = { count: 0, resetAt: now + safeWindowMs };
  }

  state.count += 1;
  rateLimitStore.set(safeKey, state);
  pruneRateStore();

  const limited = state.count > safeMaxRequests;
  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((Number(state.resetAt || now) - now) / 1000)
  );

  return {
    ok: !limited,
    retryAfterSeconds,
    remaining: Math.max(0, safeMaxRequests - state.count),
    limit: safeMaxRequests,
  };
};

const enforceFunctionGuard = async (event, options = {}) => {
  const functionName = toSafeText(options?.functionName) || "function";
  const allowedRoles = normalizeRoleList(options?.allowedRoles);
  const requireEmailVerified = options?.requireEmailVerified !== false;
  const rateLimitMax = toPositiveInteger(options?.rateLimitMax, 60);
  const rateLimitWindowMs = toPositiveInteger(
    options?.rateLimitWindowMs,
    60 * 1000
  );

  const token = extractBearerToken(event);
  if (!token) {
    return {
      ok: false,
      response: buildJsonResponse(401, {
        error: "Authentication required.",
        code: "auth/missing-token",
      }),
    };
  }

  let authContext;
  try {
    authContext = await verifySupabaseAccessToken(token);
  } catch (error) {
    return {
      ok: false,
      response: buildJsonResponse(toPositiveInteger(error?.status, 401), {
        error: toSafeText(error?.message) || "Authentication failed.",
        code: toSafeText(error?.code) || "auth/failed",
      }),
    };
  }

  const accountStatus = normalizeAccountStatus(authContext?.accountStatus);
  if (accountStatus !== "active") {
    return {
      ok: false,
      response: buildJsonResponse(403, {
        error: "Account is not active for this action.",
        code: "auth/account-inactive",
      }),
    };
  }

  if (requireEmailVerified && authContext?.email && !authContext?.emailVerified) {
    return {
      ok: false,
      response: buildJsonResponse(403, {
        error: "Email verification is required.",
        code: "auth/email-not-verified",
      }),
    };
  }

  if (allowedRoles.length > 0) {
    const userRoles = normalizeRoleList(authContext?.roles);
    const isAllowed = userRoles.some((role) => allowedRoles.includes(role));
    if (!isAllowed) {
      return {
        ok: false,
        response: buildJsonResponse(403, {
          error: "Insufficient role permission.",
          code: "auth/forbidden-role",
        }),
      };
    }
  }

  const clientIp = getClientIp(event);
  const rateKey = `${functionName}:${authContext.uid || "unknown"}:${clientIp}`;
  const rateLimit = checkRateLimit({
    key: rateKey,
    maxRequests: rateLimitMax,
    windowMs: rateLimitWindowMs,
  });

  if (!rateLimit.ok) {
    return {
      ok: false,
      response: buildJsonResponse(
        429,
        {
          error: "Rate limit exceeded. Please retry later.",
          code: "rate/limit-exceeded",
          retryAfterSeconds: rateLimit.retryAfterSeconds,
        },
        { "retry-after": String(rateLimit.retryAfterSeconds) }
      ),
    };
  }

  return {
    ok: true,
    auth: authContext,
    clientIp,
    rateLimit,
  };
};

module.exports = {
  buildJsonResponse,
  enforceFunctionGuard,
  normalizeRoleList,
  resolveAllowedRoles,
  toPositiveInteger,
};
