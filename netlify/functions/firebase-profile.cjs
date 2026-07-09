const { createClient } = require("@supabase/supabase-js");
const { cert, getApps, initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");

const DEFAULT_DOCUMENTS_TABLE = "app_documents";
const USER_COLLECTION = "users";
const AUTH_BOOTSTRAP_PATH = "systemSettings/authBootstrap";

const toSafeText = (value) => String(value || "").trim();

const normalizeRole = (value) => {
  const normalized = toSafeText(value).toLowerCase();
  if (normalized === "admin") return "admin";
  if (normalized === "staff") return "staff";
  if (normalized === "parent") return "parent";
  if (normalized === "canteen_staff" || normalized.includes("canteen")) {
    return "canteen_staff";
  }
  return "student";
};

const normalizeStatus = (value, fallback = "active") => {
  const normalized = toSafeText(value).toLowerCase();
  if (normalized === "blocked") return "blocked";
  if (normalized === "pending" || normalized === "pending_approval") return "pending";
  return fallback;
};

const parseJson = (value, fallback = null) => {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const getEnv = (...keys) => {
  for (const key of keys) {
    const value = toSafeText(process.env[key]);
    if (value) return value;
  }
  return "";
};

const json = (statusCode, body) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  },
  body: JSON.stringify(body),
});

const fail = (statusCode, code, message, details = {}) =>
  json(statusCode, {
    ok: false,
    code,
    error: message,
    ...details,
  });

const clonePlain = (value) =>
  value && typeof value === "object" && !Array.isArray(value)
    ? JSON.parse(JSON.stringify(value))
    : {};

const deepMerge = (base, patch) => {
  const output = clonePlain(base);
  Object.entries(clonePlain(patch)).forEach(([key, value]) => {
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      output[key] &&
      typeof output[key] === "object" &&
      !Array.isArray(output[key])
    ) {
      output[key] = deepMerge(output[key], value);
      return;
    }
    output[key] = value;
  });
  return output;
};

const getBearerToken = (event) => {
  const header =
    event.headers?.authorization ||
    event.headers?.Authorization ||
    "";
  const match = String(header).match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
};

const getServerConfig = () => {
  const supabaseUrl = getEnv("SUPABASE_URL", "VITE_SUPABASE_URL");
  const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
  const documentsTable = getEnv(
    "SUPABASE_DOCUMENTS_TABLE",
    "VITE_SUPABASE_DOCUMENTS_TABLE"
  ) || DEFAULT_DOCUMENTS_TABLE;
  const firebaseProjectId = getEnv("FIREBASE_PROJECT_ID", "VITE_FIREBASE_PROJECT_ID");
  const serviceAccountJson = getEnv("FIREBASE_SERVICE_ACCOUNT_JSON");

  const missing = [];
  if (!supabaseUrl) missing.push("SUPABASE_URL");
  if (!serviceRoleKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!firebaseProjectId && !serviceAccountJson) {
    missing.push("FIREBASE_PROJECT_ID or FIREBASE_SERVICE_ACCOUNT_JSON");
  }

  if (missing.length > 0) {
    const error = new Error(
      `Profile service is not configured. Missing: ${missing.join(", ")}.`
    );
    error.code = "auth/server-not-configured";
    error.missing = missing;
    throw error;
  }

  return {
    supabaseUrl,
    serviceRoleKey,
    documentsTable,
    firebaseProjectId,
    serviceAccountJson,
  };
};

let firebaseAuthPromise = null;
const getFirebaseAdminAuth = async (config) => {
  if (!firebaseAuthPromise) {
    firebaseAuthPromise = Promise.resolve().then(() => {
      if (!getApps().length) {
        const serviceAccount = config.serviceAccountJson
          ? parseJson(config.serviceAccountJson)
          : null;
        const appConfig = serviceAccount
          ? {
              credential: cert({
                ...serviceAccount,
                private_key: String(serviceAccount.private_key || "").replace(/\\n/g, "\n"),
              }),
              projectId: serviceAccount.project_id || config.firebaseProjectId,
            }
          : { projectId: config.firebaseProjectId };
        initializeApp(appConfig);
      }
      return getAuth();
    });
  }
  return firebaseAuthPromise;
};

const createAdminSupabase = (config) =>
  createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

const documentPath = (collectionPath, documentId) =>
  `${collectionPath}/${documentId}`;

const fetchDocument = async (client, table, path) => {
  const { data, error } = await client
    .from(table)
    .select("data")
    .eq("path", path)
    .maybeSingle();
  if (error) throw error;
  return clonePlain(data?.data);
};

const fetchUserProfile = async (client, table, uid) =>
  fetchDocument(client, table, documentPath(USER_COLLECTION, uid));

const hasAnyAdmin = async (client, table) => {
  const { count, error } = await client
    .from(table)
    .select("path", { count: "exact", head: true })
    .eq("collection_path", USER_COLLECTION)
    .eq("data->>role", "admin");
  if (error) throw error;
  return Number(count || 0) > 0;
};

const upsertDocument = async (client, table, { collectionPath, documentId, data }) => {
  const path = documentPath(collectionPath, documentId);
  const payload = {
    path,
    collection_path: collectionPath,
    document_id: documentId,
    data,
    updated_at: new Date().toISOString(),
  };
  const { error } = await client.from(table).upsert(payload, { onConflict: "path" });
  if (error) throw error;
  return { id: documentId, path, data };
};

const sanitizeSelfCreateProfile = async ({ client, table, profile, token }) => {
  const nextProfile = clonePlain(profile);
  const requestedRole = normalizeRole(nextProfile.role);
  const adminExists = await hasAnyAdmin(client, table);

  if (requestedRole === "admin" && adminExists) {
    const error = new Error(
      "Admin registration is available only for the first admin account."
    );
    error.code = "auth/admin-registration-closed";
    throw error;
  }
  if (requestedRole === "parent" || requestedRole === "canteen_staff") {
    const error = new Error("This role must be created by an admin.");
    error.code = "auth/forbidden-role";
    throw error;
  }

  const role = requestedRole;
  const defaultStatus = role === "staff" ? "pending" : "active";

  return {
    ...nextProfile,
    email: toSafeText(nextProfile.email) || toSafeText(token.email),
    name:
      toSafeText(nextProfile.name) ||
      toSafeText(token.name) ||
      toSafeText(token.email).split("@")[0] ||
      "Campus Member",
    role,
    status: normalizeStatus(nextProfile.status, defaultStatus),
    createdAt: nextProfile.createdAt || new Date().toISOString(),
  };
};

const sanitizeProfile = async ({
  client,
  table,
  actorUid,
  actorProfile,
  existingTargetProfile,
  targetUid,
  inputProfile,
  merge,
  token,
}) => {
  const actorRole = normalizeRole(actorProfile?.role);
  const actorIsAdmin = actorRole === "admin";
  const isSelf = actorUid === targetUid;
  const targetExists = Object.keys(existingTargetProfile || {}).length > 0;

  if (!isSelf && !actorIsAdmin) {
    const error = new Error("Only admins can update another user profile.");
    error.code = "auth/forbidden";
    throw error;
  }

  if (!actorIsAdmin && isSelf && !targetExists) {
    return sanitizeSelfCreateProfile({
      client,
      table,
      profile: inputProfile,
      token,
    });
  }

  const merged = merge
    ? deepMerge(existingTargetProfile, inputProfile)
    : clonePlain(inputProfile);

  if (actorIsAdmin) {
    return {
      ...merged,
      role: normalizeRole(merged.role),
      status: normalizeStatus(merged.status),
      updatedAt: new Date().toISOString(),
    };
  }

  const preservedRole = normalizeRole(existingTargetProfile.role || merged.role);
  const preservedStatus = normalizeStatus(existingTargetProfile.status || merged.status);
  return {
    ...merged,
    role: preservedRole,
    status: preservedStatus,
    updatedAt: new Date().toISOString(),
  };
};

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return json(204, {});
  }

  let config;
  try {
    config = getServerConfig();
  } catch (error) {
    return fail(500, error.code || "auth/server-not-configured", error.message, {
      missing: error.missing || [],
    });
  }

  const token = getBearerToken(event);
  if (!token) {
    return fail(401, "auth/missing-token", "Firebase authentication token is missing.");
  }

  let decodedToken;
  try {
    const auth = await getFirebaseAdminAuth(config);
    decodedToken = await auth.verifyIdToken(token);
  } catch {
    return fail(401, "auth/invalid-token", "Firebase authentication token is invalid.");
  }

  const actorUid = toSafeText(decodedToken.uid);
  if (!actorUid) {
    return fail(401, "auth/invalid-token", "Firebase authentication token is missing uid.");
  }

  const client = createAdminSupabase(config);

  try {
    const actorProfile = await fetchUserProfile(client, config.documentsTable, actorUid);

    if (event.httpMethod === "GET") {
      const params = new URLSearchParams(event.rawQuery || "");
      const targetUid = toSafeText(params.get("uid")) || actorUid;
      const actorIsAdmin = normalizeRole(actorProfile?.role) === "admin";

      if (targetUid !== actorUid && !actorIsAdmin) {
        return fail(403, "auth/forbidden", "Only admins can read another user profile.");
      }

      const targetProfile =
        targetUid === actorUid
          ? actorProfile
          : await fetchUserProfile(client, config.documentsTable, targetUid);
      return json(200, {
        ok: true,
        profile: Object.keys(targetProfile || {}).length > 0 ? targetProfile : null,
      });
    }

    if (event.httpMethod !== "POST") {
      return fail(405, "auth/method-not-allowed", "Use GET or POST.");
    }

    const body = parseJson(event.body || "{}", {});
    const targetUid = toSafeText(body.uid) || actorUid;
    const inputProfile = clonePlain(body.profile);
    const merge = Boolean(body.merge);

    if (!targetUid) {
      return fail(400, "auth/missing-uid", "Profile uid is required.");
    }
    if (Object.keys(inputProfile).length === 0) {
      return fail(400, "auth/invalid-profile", "Profile data is required.");
    }

    const existingTargetProfile = await fetchUserProfile(
      client,
      config.documentsTable,
      targetUid
    );
    const nextProfile = await sanitizeProfile({
      client,
      table: config.documentsTable,
      actorUid,
      actorProfile,
      existingTargetProfile,
      targetUid,
      inputProfile,
      merge,
      token: decodedToken,
    });

    await upsertDocument(client, config.documentsTable, {
      collectionPath: USER_COLLECTION,
      documentId: targetUid,
      data: nextProfile,
    });

    if (normalizeRole(nextProfile.role) === "admin") {
      await upsertDocument(client, config.documentsTable, {
        collectionPath: "systemSettings",
        documentId: "authBootstrap",
        data: {
          adminUid: targetUid,
          updatedAt: new Date().toISOString(),
        },
      }).catch(() => {});
    }

    return json(200, {
      ok: true,
      uid: targetUid,
      profile: nextProfile,
      bootstrapPath:
        normalizeRole(nextProfile.role) === "admin" ? AUTH_BOOTSTRAP_PATH : null,
    });
  } catch (error) {
    const code = error.code || "auth/profile-write-failed";
    const statusCode =
      code === "auth/admin-registration-closed" || code === "auth/forbidden-role"
        ? 403
        : code === "auth/forbidden"
          ? 403
          : 500;
    return fail(
      statusCode,
      code,
      error.message || "Unable to load or save Firebase profile."
    );
  }
};
