import { initializeApp } from "firebase/app";

/** @type {Partial<ImportMetaEnv>} */
const importMetaEnv =
  typeof import.meta !== "undefined" && import.meta?.env
    ? import.meta.env
    : {};
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
const runtimeFirebaseConfig =
  typeof window !== "undefined" &&
  window.__A3HUB_FIREBASE_CONFIG__ &&
  typeof window.__A3HUB_FIREBASE_CONFIG__ === "object"
    ? /** @type {Record<string, unknown>} */ (window.__A3HUB_FIREBASE_CONFIG__)
    : runtimeRootConfig.firebase &&
      typeof runtimeRootConfig.firebase === "object"
    ? /** @type {Record<string, unknown>} */ (runtimeRootConfig.firebase)
    : {};
const isBrowserRuntime =
  typeof window !== "undefined" && typeof document !== "undefined";
/** @type {Readonly<Record<string, string>>} */
const FIREBASE_RUNTIME_KEY_BY_ENV_KEY = Object.freeze({
  VITE_FIREBASE_API_KEY: "apiKey",
  VITE_FIREBASE_AUTH_DOMAIN: "authDomain",
  VITE_FIREBASE_PROJECT_ID: "projectId",
  VITE_FIREBASE_STORAGE_BUCKET: "storageBucket",
  VITE_FIREBASE_MESSAGING_SENDER_ID: "messagingSenderId",
  VITE_FIREBASE_APP_ID: "appId",
  VITE_FIREBASE_MEASUREMENT_ID: "measurementId",
  VITE_FIREBASE_DATABASE_URL: "databaseURL",
});

/**
 * @param {unknown} value
 * @returns {string}
 */
const toSafeEnv = (value) => (typeof value === "string" ? value.trim() : "");

/**
 * @param {keyof ImportMetaEnv} key
 * @returns {string}
 */
const getRuntimeFirebaseValue = (key) => {
  const runtimeKey = FIREBASE_RUNTIME_KEY_BY_ENV_KEY[key];
  return runtimeKey ? toSafeEnv(runtimeFirebaseConfig[runtimeKey]) : "";
};

/**
 * @param {keyof ImportMetaEnv} key
 * @returns {string}
 */
const getFirebaseEnvValue = (key) =>
  toSafeEnv(importMetaEnv[key] ?? processEnv[key] ?? getRuntimeFirebaseValue(key));

const firebaseMeasurementId = getFirebaseEnvValue(
  "VITE_FIREBASE_MEASUREMENT_ID"
);
const firebaseDatabaseUrl = getFirebaseEnvValue("VITE_FIREBASE_DATABASE_URL");

const firebaseBaseConfig = {
  apiKey: getFirebaseEnvValue("VITE_FIREBASE_API_KEY"),
  authDomain: getFirebaseEnvValue("VITE_FIREBASE_AUTH_DOMAIN"),
  projectId: getFirebaseEnvValue("VITE_FIREBASE_PROJECT_ID"),
  storageBucket: getFirebaseEnvValue("VITE_FIREBASE_STORAGE_BUCKET"),
  messagingSenderId: getFirebaseEnvValue("VITE_FIREBASE_MESSAGING_SENDER_ID"),
  appId: getFirebaseEnvValue("VITE_FIREBASE_APP_ID"),
};

const missingFirebaseEnv = Object.entries(firebaseBaseConfig)
  .filter(([, value]) => !value)
  .map(([key]) => key);

export const firebaseConfig = Object.freeze({
  ...firebaseBaseConfig,
  ...(firebaseDatabaseUrl ? { databaseURL: firebaseDatabaseUrl } : {}),
  ...(firebaseMeasurementId ? { measurementId: firebaseMeasurementId } : {}),
});

export const missingFirebaseConfigKeys = Object.freeze([...missingFirebaseEnv]);
export const firebaseConfigured = missingFirebaseConfigKeys.length === 0;
export const firebaseStartupIssue = firebaseConfigured
  ? ""
  : `Firebase is not configured for this deploy. Missing values: ${missingFirebaseConfigKeys.join(", ")}. Set the VITE_FIREBASE_* variables in Netlify and redeploy.`;

export const createFirebaseUnavailableError = (feature = "Firebase") => {
  const safeFeature = String(feature || "Firebase").trim() || "Firebase";
  /** @type {Error & { code?: string, feature?: string, missingKeys?: string[] }} */
  const error = new Error(
    firebaseStartupIssue ||
      `${safeFeature} is unavailable because Firebase is not configured for this deploy.`
  );
  error.code = "firebase/not-configured";
  error.feature = safeFeature;
  error.missingKeys = [...missingFirebaseConfigKeys];
  return error;
};

/**
 * @param {unknown} value
 * @returns {string}
 */
const normalizeBucket = (value) => {
  if (!value) return "";
  return String(value).replace(/^gs:\/\//, "").trim();
};

const bucketCandidates = [
  normalizeBucket(firebaseConfig.storageBucket),
  normalizeBucket(`${firebaseConfig.projectId}.firebasestorage.app`),
  normalizeBucket(`${firebaseConfig.projectId}.appspot.com`),
].filter(Boolean);

export const storageBuckets = [...new Set(bucketCandidates)];
const shouldInitializeFirebase =
  firebaseConfigured && isBrowserRuntime;
export const firebaseClientReady = shouldInitializeFirebase;
const defaultStorageBucket =
  storageBuckets.length > 0 ? `gs://${storageBuckets[0]}` : undefined;

/** @type {import("firebase/app").FirebaseApp | null} */
const app = shouldInitializeFirebase ? initializeApp(firebaseConfig) : null;
const DEFAULT_EMPTY_AUTH = Object.freeze({ currentUser: null });

/** @type {import("firebase/auth").Auth | { currentUser: null }} */
export let auth = DEFAULT_EMPTY_AUTH;
/** @type {import("firebase/firestore").Firestore | null} */
export let db = null;
/** @type {import("firebase/storage").FirebaseStorage | null} */
export let storage = null;
/** @type {Promise<import("firebase/analytics").Analytics | null> | null} */
export let analyticsPromise = null;

/** @type {Promise<import("firebase/auth").Auth | { currentUser: null }> | null} */
let authInitPromise = null;
/** @type {Promise<import("firebase/firestore").Firestore | null> | null} */
let firestoreInitPromise = null;
/** @type {Promise<import("firebase/storage").FirebaseStorage | null> | null} */
let storageInitPromise = null;

export { app };

/**
 * Test helper for swapping the auth singleton without mutating Firebase Auth internals.
 *
 * @param {import("firebase/auth").Auth | { currentUser: null } | null | undefined} nextAuth
 * @returns {import("firebase/auth").Auth | { currentUser: null }}
 */
export const setAuthForTesting = (nextAuth) => {
  auth = nextAuth && typeof nextAuth === "object" ? nextAuth : DEFAULT_EMPTY_AUTH;
  return auth;
};

/**
 * @returns {import("firebase/app").FirebaseApp | null}
 */
export const ensureFirebaseApp = () =>
  shouldInitializeFirebase && app ? app : null;

/**
 * @returns {Promise<import("firebase/auth").Auth | { currentUser: null }>}
 */
export const ensureFirebaseAuth = async () => {
  if (!shouldInitializeFirebase || !app) {
    return auth;
  }
  if (auth !== DEFAULT_EMPTY_AUTH) {
    return auth;
  }
  if (!authInitPromise) {
    authInitPromise = import("firebase/auth")
      .then(({ browserSessionPersistence, initializeAuth }) => {
        auth = initializeAuth(app, {
          persistence: browserSessionPersistence,
        });
        return auth;
      })
      .catch((error) => {
        authInitPromise = null;
        throw error;
      });
  }
  return authInitPromise;
};

/**
 * @returns {Promise<import("firebase/firestore").Firestore | null>}
 */
export const ensureFirestore = async () => {
  if (!shouldInitializeFirebase || !app) {
    return null;
  }
  if (db) {
    return db;
  }
  if (!firestoreInitPromise) {
    firestoreInitPromise = import("firebase/firestore")
      .then(({ getFirestore }) => {
        db = getFirestore(app);
        return db;
      })
      .catch((error) => {
        firestoreInitPromise = null;
        throw error;
      });
  }
  return firestoreInitPromise;
};

/**
 * @returns {Promise<import("firebase/storage").FirebaseStorage | null>}
 */
export const ensureFirebaseStorage = async () => {
  if (!shouldInitializeFirebase || !app) {
    return null;
  }
  if (storage) {
    return storage;
  }
  if (!storageInitPromise) {
    storageInitPromise = import("firebase/storage")
      .then(({ getStorage }) => {
        storage = getStorage(app, defaultStorageBucket);
        return storage;
      })
      .catch((error) => {
        storageInitPromise = null;
        throw error;
      });
  }
  return storageInitPromise;
};

/**
 * @param {string | undefined | null} bucket
 * @returns {Promise<import("firebase/storage").FirebaseStorage | null>}
 */
export const getStorageForBucket = async (bucket) => {
  if (!shouldInitializeFirebase || !app) {
    return null;
  }

  const { getStorage } = await import("firebase/storage");
  return getStorage(app, bucket ? `gs://${normalizeBucket(bucket)}` : undefined);
};

/**
 * @returns {Promise<import("firebase/analytics").Analytics | null>}
 */
export const loadAnalytics = () => {
  if (analyticsPromise) {
    return analyticsPromise;
  }
  if (!shouldInitializeFirebase || !app) {
    analyticsPromise = Promise.resolve(null);
    return analyticsPromise;
  }

  analyticsPromise = import("firebase/analytics")
    .then(async ({ getAnalytics, isSupported }) => {
      const supported = await isSupported();
      return supported ? getAnalytics(app) : null;
    })
    .catch((error) => {
      analyticsPromise = null;
      throw error;
    });
  return analyticsPromise;
};

export default app;
