require("./load-env.cjs");
const { getFirebaseAdminRuntime } = require("./firebase-admin.cjs");

const AUTH_LOOKUP_ENDPOINT =
  "https://identitytoolkit.googleapis.com/v1/accounts:lookup";
const FIRESTORE_DOCUMENT_BASE_ENDPOINT =
  "https://firestore.googleapis.com/v1/projects";
const TOKEN_CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_TOKEN_CACHE_SIZE = 3000;
const MAX_RATE_STORE_SIZE = 6000;

const tokenCache = new Map();
const rateLimitStore = new Map();

const toSafeText = (value) => (typeof value === "string" ? value.trim() : "");

const toPositiveInteger = (value, fallback) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return Number(fallback);
  }
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
  if (!target) return "";

  for (const [key, value] of Object.entries(headers)) {
    if (String(key || "").toLowerCase() !== target) continue;
    if (Array.isArray(value)) {
      return toSafeText(value[0]);
    }
    return toSafeText(value);
  }

  return "";
};

const extractBearerToken = (event) => {
  const authorization = getHeaderValue(event?.headers, "authorization");
  if (!authorization) return "";
  const match = authorization.match(/^bearer\s+(.+)$/i);
  return match ? toSafeText(match[1]) : "";
};

const extractAppCheckToken = (event) =>
  getHeaderValue(event?.headers, "x-firebase-appcheck") ||
  getHeaderValue(event?.headers, "x-firebase-app-check");

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
  if (!resolved.includes(",")) return resolved;
  return toSafeText(resolved.split(",")[0]) || "unknown";
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
  if (!Number.isFinite(expSeconds) || expSeconds <= 0) return 0;
  return Math.floor(expSeconds * 1000);
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
  if (normalized === "pending" || normalized === "pending_approval") {
    return "pending";
  }
  return "active";
};

const mapAdminVerificationError = (error) => {
  const code = toSafeText(error?.code).toLowerCase();
  if (!code) return null;

  if (
    code === "auth/id-token-expired" ||
    code === "auth/id-token-revoked" ||
    code === "auth/invalid-id-token" ||
    code === "auth/argument-error"
  ) {
    return {
      status: 401,
      code: "auth/invalid-token",
      message: "Invalid auth token.",
    };
  }

  if (code === "auth/user-disabled") {
    return {
      status: 403,
      code: "auth/user-disabled",
      message: "User account is disabled.",
    };
  }

  return null;
};

const isTrueLike = (value) => {
  const normalized = toSafeText(String(value || "")).toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
};

const shouldRequireAppCheck = (options = {}) => {
  if (typeof options?.requireAppCheck === "boolean") {
    return options.requireAppCheck;
  }
  return isTrueLike(process.env.REQUIRE_FIREBASE_APP_CHECK);
};

const shouldAllowMissingAppCheckToken = (options = {}) => {
  if (typeof options?.allowMissingAppCheckToken === "boolean") {
    return options.allowMissingAppCheckToken;
  }
  return isTrueLike(process.env.ALLOW_MISSING_FIREBASE_APP_CHECK);
};

const resolveAllowedRoles = (allowedRoles, fallbackRoles = []) => {
  const resolved = normalizeRoleList(allowedRoles);
  if (resolved.length > 0) return resolved;
  return normalizeRoleList(fallbackRoles);
};

const parseCustomClaims = (value) => {
  if (!value) return {};
  if (typeof value === "object" && !Array.isArray(value)) return value;
  const raw = toSafeText(String(value || ""));
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch {
    return {};
  }
};

const parseRolesFromClaims = (claims) => {
  const roles = [];

  const singleRole = toSafeText(claims?.role).toLowerCase();
  if (singleRole) roles.push(singleRole);

  if (Array.isArray(claims?.roles)) {
    for (const item of claims.roles) {
      const role = toSafeText(String(item || "")).toLowerCase();
      if (role) roles.push(role);
    }
  }

  if (claims?.admin === true || claims?.isAdmin === true) {
    roles.push("admin");
  }
  if (claims?.staff === true) {
    roles.push("staff");
  }
  if (claims?.student === true) {
    roles.push("student");
  }
  if (claims?.parent === true) {
    roles.push("parent");
  }

  return Array.from(new Set(roles));
};

const parseFirestoreValue = (value) => {
  if (!value || typeof value !== "object") return null;

  if ("stringValue" in value) return toSafeText(value.stringValue);
  if ("integerValue" in value) {
    const parsed = Number(value.integerValue);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if ("doubleValue" in value) {
    const parsed = Number(value.doubleValue);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if ("booleanValue" in value) return Boolean(value.booleanValue);
  if ("timestampValue" in value) return toSafeText(value.timestampValue);
  if ("nullValue" in value) return null;
  if ("mapValue" in value) {
    const mapFields = value.mapValue?.fields;
    if (!mapFields || typeof mapFields !== "object") return {};
    const next = {};
    for (const [key, fieldValue] of Object.entries(mapFields)) {
      next[key] = parseFirestoreValue(fieldValue);
    }
    return next;
  }
  if ("arrayValue" in value) {
    const values = Array.isArray(value.arrayValue?.values)
      ? value.arrayValue.values
      : [];
    return values.map((entry) => parseFirestoreValue(entry));
  }
  return null;
};

const parseFirestoreDocumentFields = (payload) => {
  const fields =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? payload.fields
      : null;
  if (!fields || typeof fields !== "object") return {};
  const next = {};
  for (const [key, value] of Object.entries(fields)) {
    next[key] = parseFirestoreValue(value);
  }
  return next;
};

const resolveFirebaseProjectId = () => {
  const explicit = toSafeText(
    process.env.FIREBASE_PROJECT_ID ||
      process.env.GCLOUD_PROJECT ||
      process.env.GCP_PROJECT ||
      process.env.VITE_FIREBASE_PROJECT_ID
  );
  if (explicit) return explicit;

  const authDomain = toSafeText(process.env.FIREBASE_AUTH_DOMAIN);
  if (!authDomain) return "";
  const normalizedDomain = authDomain.replace(/^https?:\/\//i, "");
  const firstSegment = normalizedDomain.split(".")[0];
  return toSafeText(firstSegment);
};

const fetchRoleFromFirestoreProfile = async ({
  idToken,
  uid,
}) => {
  const safeToken = toSafeText(idToken);
  const safeUid = toSafeText(uid);
  if (!safeToken || !safeUid) {
    return {
      role: "",
      status: "",
    };
  }

  const projectId = resolveFirebaseProjectId();
  if (!projectId) {
    return {
      role: "",
      status: "",
    };
  }

  const encodedProjectId = encodeURIComponent(projectId);
  const encodedUid = encodeURIComponent(safeUid);
  const endpoint = `${FIRESTORE_DOCUMENT_BASE_ENDPOINT}/${encodedProjectId}/databases/(default)/documents/users/${encodedUid}`;

  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        authorization: `Bearer ${safeToken}`,
      },
    });

    if (!response.ok) {
      return {
        role: "",
        status: "",
      };
    }

    const raw = await response.text();
    const payload = parseJsonSafe(raw);
    const fields = parseFirestoreDocumentFields(payload);

    return {
      role: toSafeText(fields?.role).toLowerCase(),
      status: normalizeAccountStatus(fields?.status),
    };
  } catch {
    return {
      role: "",
      status: "",
    };
  }
};

const fetchRoleFromAdminProfile = async ({ runtime, uid }) => {
  const safeUid = toSafeText(uid);
  if (!runtime?.db || !safeUid) {
    return {
      role: "",
      status: "",
    };
  }

  try {
    const snapshot = await runtime.db.collection("users").doc(safeUid).get();
    if (!snapshot.exists) {
      return {
        role: "",
        status: "",
      };
    }

    const data = snapshot.data() || {};
    return {
      role: toSafeText(data?.role).toLowerCase(),
      status: normalizeAccountStatus(data?.status),
    };
  } catch {
    return {
      role: "",
      status: "",
    };
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

const verifyFirebaseIdToken = async (idToken) => {
  const safeToken = toSafeText(idToken);
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

  try {
    const adminRuntime = getFirebaseAdminRuntime();
    if (adminRuntime?.auth) {
      const decodedToken = await adminRuntime.auth.verifyIdToken(safeToken, true);
      const firestoreProfile = await fetchRoleFromAdminProfile({
        runtime: adminRuntime,
        uid: decodedToken.uid,
      });
      const claims = parseCustomClaims(decodedToken);
      const claimRoles = parseRolesFromClaims(claims);
      const firestoreRole = toSafeText(firestoreProfile?.role).toLowerCase();
      const firestoreRoles = normalizeRoleList(firestoreRole);
      const roles = Array.from(new Set([...claimRoles, ...firestoreRoles]));
      const authContext = {
        uid: toSafeText(decodedToken.uid),
        email: toSafeText(decodedToken.email).toLowerCase(),
        emailVerified: Boolean(decodedToken.email_verified),
        claims,
        roles,
        profileRole: firestoreRole,
        accountStatus: normalizeAccountStatus(firestoreProfile?.status),
      };

      const tokenExpiryMs = parseTokenExpiryMs(safeToken);
      const ttlCandidates = [TOKEN_CACHE_TTL_MS];
      if (tokenExpiryMs > now) {
        ttlCandidates.push(Math.max(1000, tokenExpiryMs - now));
      }
      const ttl = Math.max(1000, Math.min(...ttlCandidates));
      tokenCache.set(safeToken, {
        authContext,
        expiresAt: now + ttl,
      });
      pruneTokenCache();

      return authContext;
    }
  } catch (error) {
    const mappedError = mapAdminVerificationError(error);
    if (mappedError) {
      const authError = new Error(mappedError.message);
      authError.status = mappedError.status;
      authError.code = mappedError.code;
      throw authError;
    }
    // Fall back to the REST verifier if Admin SDK is unavailable or temporarily failing.
  }

  const firebaseApiKey = toSafeText(
    process.env.FIREBASE_WEB_API_KEY ||
      process.env.FIREBASE_API_KEY ||
      process.env.VITE_FIREBASE_API_KEY
  );
  if (!firebaseApiKey) {
    const error = new Error("FIREBASE_WEB_API_KEY is not configured.");
    error.status = 500;
    error.code = "auth/missing-server-config";
    throw error;
  }

  const response = await fetch(
    `${AUTH_LOOKUP_ENDPOINT}?key=${encodeURIComponent(firebaseApiKey)}`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ idToken: safeToken }),
    }
  );

  const raw = await response.text();
  const payload = parseJsonSafe(raw);

  if (!response.ok) {
    const message =
      toSafeText(payload?.error?.message) || "Unable to verify auth token.";
    const error = new Error(message);
    error.status = response.status >= 500 ? 502 : 401;
    error.code = "auth/token-verification-failed";
    throw error;
  }

  const user = payload?.users?.[0];
  if (!user?.localId) {
    const error = new Error("Invalid auth token.");
    error.status = 401;
    error.code = "auth/invalid-token";
    throw error;
  }

  if (user?.disabled) {
    const error = new Error("User account is disabled.");
    error.status = 403;
    error.code = "auth/user-disabled";
    throw error;
  }

  const claims = parseCustomClaims(user.customAttributes);
  const claimRoles = parseRolesFromClaims(claims);
  const firestoreProfile = await fetchRoleFromFirestoreProfile({
    idToken: safeToken,
    uid: user.localId,
  });
  const firestoreRole = toSafeText(firestoreProfile?.role).toLowerCase();
  const firestoreRoles = normalizeRoleList(firestoreRole);
  const roles = Array.from(new Set([...claimRoles, ...firestoreRoles]));
  const authContext = {
    uid: toSafeText(user.localId),
    email: toSafeText(user.email).toLowerCase(),
    emailVerified: Boolean(user.emailVerified),
    claims,
    roles,
    profileRole: firestoreRole,
    accountStatus: normalizeAccountStatus(firestoreProfile?.status),
  };

  const tokenExpiryMs = parseTokenExpiryMs(safeToken);
  const ttlCandidates = [TOKEN_CACHE_TTL_MS];
  if (tokenExpiryMs > now) {
    ttlCandidates.push(Math.max(1000, tokenExpiryMs - now));
  }
  const ttl = Math.max(1000, Math.min(...ttlCandidates));
  tokenCache.set(safeToken, {
    authContext,
    expiresAt: now + ttl,
  });
  pruneTokenCache();

  return authContext;
};

const verifyFirebaseAppCheckToken = async (event, options = {}) => {
  if (!shouldRequireAppCheck(options)) {
    return {
      appId: "",
      enforced: false,
      verified: false,
    };
  }

  const token = extractAppCheckToken(event);
  if (!token) {
    if (shouldAllowMissingAppCheckToken(options)) {
      return {
        appId: "",
        enforced: true,
        verified: false,
      };
    }

    const error = new Error("Missing App Check token.");
    error.status = 401;
    error.code = "app-check/missing-token";
    throw error;
  }

  let adminRuntime;
  try {
    adminRuntime = getFirebaseAdminRuntime();
  } catch (error) {
    const appCheckError = new Error(
      "App Check verification is configured but Firebase Admin is unavailable."
    );
    appCheckError.status = 500;
    appCheckError.code =
      error?.code === "firebase-admin/init-failed"
        ? "app-check/server-config-error"
        : "app-check/verification-unavailable";
    throw appCheckError;
  }

  if (!adminRuntime?.appCheck) {
    const error = new Error(
      "App Check verification is configured but Firebase Admin is unavailable."
    );
    error.status = 500;
    error.code = "app-check/server-config-error";
    throw error;
  }

  try {
    const decodedToken = await adminRuntime.appCheck.verifyToken(token);
    return {
      appId: toSafeText(decodedToken?.app_id),
      enforced: true,
      verified: true,
    };
  } catch {
    const error = new Error("Invalid App Check token.");
    error.status = 403;
    error.code = "app-check/invalid-token";
    throw error;
  }
};

const checkRateLimit = ({
  key,
  maxRequests = 60,
  windowMs = 60 * 1000,
}) => {
  const safeKey = toSafeText(key) || "unknown";
  const safeWindowMs = toPositiveInteger(windowMs, 60 * 1000);
  const safeMaxRequests = toPositiveInteger(maxRequests, 60);
  const now = Date.now();

  let state = rateLimitStore.get(safeKey);
  if (!state || now >= Number(state.resetAt || 0)) {
    state = {
      count: 0,
      resetAt: now + safeWindowMs,
    };
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
    authContext = await verifyFirebaseIdToken(token);
  } catch (error) {
    return {
      ok: false,
      response: buildJsonResponse(
        toPositiveInteger(error?.status, 401),
        {
          error: toSafeText(error?.message) || "Authentication failed.",
          code: toSafeText(error?.code) || "auth/failed",
        }
      ),
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

  try {
    const appCheck = await verifyFirebaseAppCheckToken(event, options);
    authContext = {
      ...authContext,
      appCheck,
    };
  } catch (error) {
    return {
      ok: false,
      response: buildJsonResponse(
        toPositiveInteger(error?.status, 403),
        {
          error: toSafeText(error?.message) || "App Check verification failed.",
          code: toSafeText(error?.code) || "app-check/failed",
        }
      ),
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
        {
          "retry-after": String(rateLimit.retryAfterSeconds),
        }
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
