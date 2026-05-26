// @ts-nocheck
import { createClient } from "@supabase/supabase-js";

/** @type {Partial<ImportMetaEnv>} */
const importMetaEnv =
  typeof import.meta !== "undefined" && import.meta?.env ? import.meta.env : {};
const processEnv =
  typeof globalThis !== "undefined" &&
  globalThis.process?.env &&
  typeof globalThis.process.env === "object"
    ? globalThis.process.env
    : {};
/** @type {Record<string, unknown>} */
const runtimeRootConfig =
  typeof window !== "undefined" &&
  window.__A3HUB_RUNTIME_CONFIG__ &&
  typeof window.__A3HUB_RUNTIME_CONFIG__ === "object"
    ? /** @type {Record<string, unknown>} */ (window.__A3HUB_RUNTIME_CONFIG__)
    : {};
/** @type {Record<string, unknown>} */
const runtimeSupabaseConfig =
  typeof window !== "undefined" &&
  window.__A3HUB_SUPABASE_CONFIG__ &&
  typeof window.__A3HUB_SUPABASE_CONFIG__ === "object"
    ? /** @type {Record<string, unknown>} */ (window.__A3HUB_SUPABASE_CONFIG__)
    : runtimeRootConfig.supabase &&
      typeof runtimeRootConfig.supabase === "object"
    ? /** @type {Record<string, unknown>} */ (runtimeRootConfig.supabase)
    : {};

const toSafeEnv = (value) => (typeof value === "string" ? value.trim() : "");

/**
 * @param {keyof ImportMetaEnv | string} key
 * @param {string} runtimeKey
 * @returns {string}
 */
const getSupabaseEnvValue = (key, runtimeKey) =>
  toSafeEnv(
    importMetaEnv[key] ??
      processEnv[key] ??
      runtimeSupabaseConfig[runtimeKey] ??
      ""
  );

export const supabaseConfig = Object.freeze({
  url: getSupabaseEnvValue("VITE_SUPABASE_URL", "url"),
  publishableKey:
    getSupabaseEnvValue("VITE_SUPABASE_PUBLISHABLE_KEY", "publishableKey") ||
    getSupabaseEnvValue("VITE_SUPABASE_ANON_KEY", "anonKey"),
  documentsTable:
    getSupabaseEnvValue("VITE_SUPABASE_DOCUMENTS_TABLE", "documentsTable") ||
    "app_documents",
  storageBucket:
    getSupabaseEnvValue("VITE_SUPABASE_STORAGE_BUCKET", "storageBucket") ||
    "a3hub",
});

export const missingSupabaseConfigKeys = Object.freeze(
  Object.entries({
    VITE_SUPABASE_URL: supabaseConfig.url,
    VITE_SUPABASE_PUBLISHABLE_KEY: supabaseConfig.publishableKey,
  })
    .filter(([, value]) => !value)
    .map(([key]) => key)
);

export const supabaseConfigured = missingSupabaseConfigKeys.length === 0;
export const supabaseStartupIssue = supabaseConfigured
  ? ""
  : `Supabase is not configured for this deploy. Missing values: ${missingSupabaseConfigKeys.join(", ")}. Set the VITE_SUPABASE_* variables and redeploy.`;

export const createSupabaseUnavailableError = (feature = "Supabase") => {
  const safeFeature = String(feature || "Supabase").trim() || "Supabase";
  /** @type {Error & { code?: string, feature?: string, missingKeys?: string[] }} */
  const error = new Error(
    supabaseStartupIssue ||
      `${safeFeature} is unavailable because Supabase is not configured for this deploy.`
  );
  error.code = "supabase/not-configured";
  error.feature = safeFeature;
  error.missingKeys = [...missingSupabaseConfigKeys];
  return error;
};

export const supabase = supabaseConfigured
  ? createClient(supabaseConfig.url, supabaseConfig.publishableKey, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: true,
        persistSession: true,
      },
      realtime: {
        params: {
          eventsPerSecond: 8,
        },
      },
    })
  : null;

export const supabaseClientReady = Boolean(supabase);

export const db = supabase;
export const storage = supabase
  ? Object.freeze({
      client: supabase,
      bucket: supabaseConfig.storageBucket,
    })
  : null;
export const storageBuckets = Object.freeze(
  [supabaseConfig.storageBucket].filter(Boolean)
);

/** @type {{ currentUser: any }} */
export const auth = {
  currentUser: null,
};

/**
 * @param {import("@supabase/supabase-js").User | null | undefined} user
 * @param {import("@supabase/supabase-js").Session | null | undefined} session
 */
export const toSupabaseAppUser = (user, session = null) => {
  if (!user) return null;
  const metadata = user.user_metadata && typeof user.user_metadata === "object"
    ? user.user_metadata
    : {};
  const displayName =
    String(metadata.name || metadata.display_name || metadata.full_name || "")
      .trim() || String(user.email || "").split("@")[0] || "";
  const emailVerified = Boolean(
    user.email_confirmed_at || user.confirmed_at || session?.user?.email_confirmed_at
  );

  return {
    ...user,
    uid: user.id,
    displayName,
    email: user.email || "",
    emailVerified,
    getIdToken: async () => {
      if (session?.access_token) return session.access_token;
      const result = await supabase?.auth.getSession();
      return result?.data?.session?.access_token || "";
    },
    delete: async () => {
      throw new Error("Account deletion requires a Supabase service-role backend.");
    },
  };
};

export const setSupabaseAuthUser = (user) => {
  auth.currentUser = user || null;
  return auth.currentUser;
};

export const setAuthForTesting = (nextAuth) => {
  auth.currentUser =
    nextAuth && typeof nextAuth === "object"
      ? nextAuth.currentUser || nextAuth
      : null;
  return auth;
};

export const ensureSupabase = () => {
  if (!supabase) {
    throw createSupabaseUnavailableError("Supabase");
  }
  return supabase;
};

export const ensureSupabaseAuth = async () => ensureSupabase().auth;
export const ensureSupabaseData = async () => ensureSupabase();
export const ensureSupabaseStorage = async () => storage;

export const getStorageForBucket = async (bucket) => {
  const client = ensureSupabase();
  return {
    client,
    bucket: String(bucket || supabaseConfig.storageBucket || "a3hub").trim(),
  };
};

export const createEphemeralSupabaseClient = () => {
  if (!supabaseConfigured) {
    throw createSupabaseUnavailableError("Supabase authentication");
  }
  return createClient(supabaseConfig.url, supabaseConfig.publishableKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
      storageKey: `a3hub-ephemeral-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2)}`,
    },
  });
};

export const getAuthRedirectUrl = (path = "/") => {
  if (typeof window === "undefined") return undefined;
  try {
    const { origin, protocol } = window.location;
    if (protocol !== "http:" && protocol !== "https:") return undefined;
    const safePath = String(path || "/").trim();
    return `${origin}${safePath.startsWith("/") ? safePath : `/${safePath}`}`;
  } catch {
    return undefined;
  }
};

export const loadAnalytics = () => Promise.resolve(null);

export default supabase;
