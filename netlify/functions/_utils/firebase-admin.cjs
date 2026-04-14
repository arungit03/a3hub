const { cert, getApp, getApps, initializeApp } = require("firebase-admin/app");
const { getAppCheck } = require("firebase-admin/app-check");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore } = require("firebase-admin/firestore");

const APP_NAME = "a3hub-netlify-functions";

const toSafeText = (value) => (typeof value === "string" ? value.trim() : "");

const resolveServiceAccountCredentials = () => {
  const rawJson = toSafeText(
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON ||
      process.env.FIREBASE_SERVICE_ACCOUNT ||
      process.env.GOOGLE_SERVICE_ACCOUNT_JSON ||
      process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON
  );

  if (rawJson) {
    try {
      const parsed = JSON.parse(rawJson);
      const clientEmail = toSafeText(parsed?.client_email);
      const privateKey = toSafeText(parsed?.private_key).replace(/\\n/g, "\n");
      if (clientEmail && privateKey) {
        return {
          projectId: toSafeText(parsed?.project_id),
          clientEmail,
          privateKey,
        };
      }
    } catch {
      return null;
    }
  }

  const clientEmail = toSafeText(
    process.env.FIREBASE_CLIENT_EMAIL || process.env.GOOGLE_CLIENT_EMAIL
  );
  const privateKey = toSafeText(
    process.env.FIREBASE_PRIVATE_KEY || process.env.GOOGLE_PRIVATE_KEY
  ).replace(/\\n/g, "\n");
  const projectId = toSafeText(process.env.FIREBASE_PROJECT_ID);

  if (!clientEmail || !privateKey) {
    return null;
  }

  return {
    projectId,
    clientEmail,
    privateKey,
  };
};

let runtimeCache;

const createRuntime = () => {
  const credentials = resolveServiceAccountCredentials();
  if (!credentials) {
    return null;
  }

  const existingApp = getApps().find((app) => app.name === APP_NAME);
  const app =
    existingApp ||
    initializeApp(
      {
        credential: cert({
          projectId: credentials.projectId || undefined,
          clientEmail: credentials.clientEmail,
          privateKey: credentials.privateKey,
        }),
        ...(credentials.projectId ? { projectId: credentials.projectId } : {}),
      },
      APP_NAME
    );

  return {
    app: existingApp ? getApp(APP_NAME) : app,
    auth: getAuth(existingApp ? getApp(APP_NAME) : app),
    appCheck: getAppCheck(existingApp ? getApp(APP_NAME) : app),
    db: getFirestore(existingApp ? getApp(APP_NAME) : app),
  };
};

const getFirebaseAdminRuntime = () => {
  if (runtimeCache !== undefined) {
    return runtimeCache;
  }

  try {
    runtimeCache = createRuntime();
    return runtimeCache;
  } catch (error) {
    error.code = "firebase-admin/init-failed";
    throw error;
  }
};

module.exports = {
  getFirebaseAdminRuntime,
};
