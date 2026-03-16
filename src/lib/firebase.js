import { initializeApp } from "firebase/app";
import { getAnalytics, isSupported } from "firebase/analytics";
import { browserSessionPersistence, initializeAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

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
const isBrowserRuntime =
  typeof window !== "undefined" && typeof document !== "undefined";

/**
 * @param {unknown} value
 * @returns {string}
 */
const toSafeEnv = (value) => (typeof value === "string" ? value.trim() : "");

/**
 * @param {keyof ImportMetaEnv} key
 * @returns {string}
 */
const getFirebaseEnvValue = (key) =>
  toSafeEnv(importMetaEnv[key] ?? processEnv[key]);

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

if (missingFirebaseEnv.length > 0 && isBrowserRuntime) {
  throw new Error(
    `Missing Firebase environment values: ${missingFirebaseEnv.join(", ")}`
  );
}

export const firebaseConfig = Object.freeze({
  ...firebaseBaseConfig,
  ...(firebaseDatabaseUrl ? { databaseURL: firebaseDatabaseUrl } : {}),
  ...(firebaseMeasurementId ? { measurementId: firebaseMeasurementId } : {}),
});

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
  missingFirebaseEnv.length === 0 && isBrowserRuntime;

/** @type {import("firebase/app").FirebaseApp | null} */
let app = null;
/** @type {import("firebase/auth").Auth | { currentUser: null }} */
let authInstance = { currentUser: null };
/** @type {import("firebase/firestore").Firestore | null} */
let dbInstance = null;
/** @type {import("firebase/storage").FirebaseStorage | null} */
let storageInstance = null;

if (shouldInitializeFirebase) {
  const initializedApp = initializeApp(firebaseConfig);
  app = initializedApp;
  authInstance = initializeAuth(initializedApp, {
    persistence: browserSessionPersistence,
  });
  dbInstance = getFirestore(initializedApp);
  storageInstance = getStorage(
    initializedApp,
    storageBuckets.length > 0 ? `gs://${storageBuckets[0]}` : undefined
  );
}

export { app };
export const auth = authInstance;
export const db = dbInstance;
export const storage = storageInstance;

/**
 * @param {string | undefined | null} bucket
 * @returns {import("firebase/storage").FirebaseStorage | null}
 */
export const getStorageForBucket = (bucket) => {
  if (!shouldInitializeFirebase || !app) {
    return null;
  }

  return getStorage(app, bucket ? `gs://${normalizeBucket(bucket)}` : undefined);
};

export const analyticsPromise = (() => {
  if (!shouldInitializeFirebase || !app) {
    return Promise.resolve(null);
  }

  const initializedApp = app;
  return isSupported().then((supported) =>
    supported ? getAnalytics(initializedApp) : null
  );
})();

export default app;
