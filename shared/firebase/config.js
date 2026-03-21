const env =
  typeof import.meta !== "undefined" && import.meta?.env ? import.meta.env : {};

const toSafeEnv = (value) => (typeof value === "string" ? value.trim() : "");

export const firebaseConfig = Object.freeze({
  apiKey: toSafeEnv(env.VITE_FIREBASE_API_KEY),
  authDomain: toSafeEnv(env.VITE_FIREBASE_AUTH_DOMAIN),
  projectId: toSafeEnv(env.VITE_FIREBASE_PROJECT_ID),
  storageBucket: toSafeEnv(env.VITE_FIREBASE_STORAGE_BUCKET),
  messagingSenderId: toSafeEnv(env.VITE_FIREBASE_MESSAGING_SENDER_ID),
  appId: toSafeEnv(env.VITE_FIREBASE_APP_ID),
});

export const firebaseFunctionsRegion =
  toSafeEnv(env.VITE_FIREBASE_FUNCTIONS_REGION) || "us-central1";

export const missingFirebaseConfig = Object.entries(firebaseConfig)
  .filter(([, value]) => !value)
  .map(([key]) => key);

export const firebaseConfigured = missingFirebaseConfig.length === 0;

export const firebaseStartupMessage = firebaseConfigured
  ? ""
  : `Missing Firebase env values: ${missingFirebaseConfig.join(", ")}.`;
