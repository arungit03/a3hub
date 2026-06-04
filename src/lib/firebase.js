// @ts-nocheck
import { deleteApp, getApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const importMetaEnv =
  typeof import.meta !== "undefined" && import.meta?.env ? import.meta.env : {};
const processEnv =
  typeof globalThis !== "undefined" &&
  globalThis.process?.env &&
  typeof globalThis.process.env === "object"
    ? globalThis.process.env
    : {};
const runtimeRootConfig =
  typeof window !== "undefined" &&
  window.__A3HUB_RUNTIME_CONFIG__ &&
  typeof window.__A3HUB_RUNTIME_CONFIG__ === "object"
    ? window.__A3HUB_RUNTIME_CONFIG__
    : {};
const runtimeFirebaseConfig =
  typeof window !== "undefined" &&
  window.__A3HUB_FIREBASE_CONFIG__ &&
  typeof window.__A3HUB_FIREBASE_CONFIG__ === "object"
    ? window.__A3HUB_FIREBASE_CONFIG__
    : runtimeRootConfig.firebase &&
      typeof runtimeRootConfig.firebase === "object"
    ? runtimeRootConfig.firebase
    : {};

const defaultFirebaseConfig = Object.freeze({
  apiKey: "AIzaSyDMEUYNg4eNKnFfRCXOIkmJOzJ6eO1_qA8",
  authDomain: "a3hubb.firebaseapp.com",
  projectId: "a3hubb",
  storageBucket: "a3hubb.firebasestorage.app",
  messagingSenderId: "426395569818",
  appId: "1:426395569818:web:2c0c0814b3244a2cbb5923",
  measurementId: "G-FW6E8774N1",
});

const toSafeEnv = (value) => (typeof value === "string" ? value.trim() : "");

const getFirebaseEnvValue = (key, runtimeKey, fallback = "") =>
  toSafeEnv(
    importMetaEnv[key] ??
      processEnv[key] ??
      runtimeFirebaseConfig[runtimeKey] ??
      fallback
  );

export const firebaseConfig = Object.freeze({
  apiKey: getFirebaseEnvValue(
    "VITE_FIREBASE_API_KEY",
    "apiKey",
    defaultFirebaseConfig.apiKey
  ),
  authDomain: getFirebaseEnvValue(
    "VITE_FIREBASE_AUTH_DOMAIN",
    "authDomain",
    defaultFirebaseConfig.authDomain
  ),
  projectId: getFirebaseEnvValue(
    "VITE_FIREBASE_PROJECT_ID",
    "projectId",
    defaultFirebaseConfig.projectId
  ),
  storageBucket: getFirebaseEnvValue(
    "VITE_FIREBASE_STORAGE_BUCKET",
    "storageBucket",
    defaultFirebaseConfig.storageBucket
  ),
  messagingSenderId: getFirebaseEnvValue(
    "VITE_FIREBASE_MESSAGING_SENDER_ID",
    "messagingSenderId",
    defaultFirebaseConfig.messagingSenderId
  ),
  appId: getFirebaseEnvValue(
    "VITE_FIREBASE_APP_ID",
    "appId",
    defaultFirebaseConfig.appId
  ),
  measurementId: getFirebaseEnvValue(
    "VITE_FIREBASE_MEASUREMENT_ID",
    "measurementId",
    defaultFirebaseConfig.measurementId
  ),
});

export const missingFirebaseConfigKeys = Object.freeze(
  Object.entries({
    VITE_FIREBASE_API_KEY: firebaseConfig.apiKey,
    VITE_FIREBASE_AUTH_DOMAIN: firebaseConfig.authDomain,
    VITE_FIREBASE_PROJECT_ID: firebaseConfig.projectId,
    VITE_FIREBASE_APP_ID: firebaseConfig.appId,
  })
    .filter(([, value]) => !value)
    .map(([key]) => key)
);

export const firebaseConfigured = missingFirebaseConfigKeys.length === 0;
export const firebaseStartupIssue = firebaseConfigured
  ? ""
  : `Firebase Authentication is not configured. Missing values: ${missingFirebaseConfigKeys.join(", ")}.`;

export const createFirebaseUnavailableError = (
  feature = "Firebase Authentication"
) => {
  const safeFeature =
    String(feature || "Firebase Authentication").trim() ||
    "Firebase Authentication";
  const error = new Error(
    firebaseStartupIssue ||
      `${safeFeature} is unavailable because Firebase is not configured.`
  );
  error.code = "firebase/not-configured";
  error.feature = safeFeature;
  error.missingKeys = [...missingFirebaseConfigKeys];
  return error;
};

export const firebaseApp = firebaseConfigured
  ? getApps().length
    ? getApp()
    : initializeApp(firebaseConfig)
  : null;

export const firebaseAuth = firebaseApp ? getAuth(firebaseApp) : null;
export const firebaseAuthReady = Boolean(firebaseAuth);

export const createSecondaryFirebaseAuth = () => {
  if (!firebaseConfigured) {
    throw createFirebaseUnavailableError("Firebase account creation");
  }
  const appName = `a3hub-secondary-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}`;
  const app = initializeApp(firebaseConfig, appName);
  return {
    auth: getAuth(app),
    dispose: () => deleteApp(app),
  };
};

export const toFirebaseAppUser = (user) => {
  if (!user) return null;
  return {
    ...user,
    uid: user.uid,
    displayName:
      String(user.displayName || "").trim() ||
      String(user.email || "").split("@")[0] ||
      "",
    email: user.email || "",
    emailVerified: Boolean(user.emailVerified),
    getIdToken: async (forceRefresh = false) => user.getIdToken(forceRefresh),
    delete: async () => user.delete(),
  };
};

export const getFirebaseAuthRedirectUrl = (path = "/") => {
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

export default firebaseAuth;
