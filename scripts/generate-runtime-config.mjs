import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { loadEnv } from "vite";

const rootDir = process.cwd();
const lifecycleEvent = String(process.env.npm_lifecycle_event || "").trim();
const inferredMode =
  lifecycleEvent === "prebuild" || lifecycleEvent === "build"
    ? "production"
    : "development";
const mode = process.env.MODE || process.env.NODE_ENV || inferredMode;
const env = loadEnv(mode, rootDir, "");

const outputPath = path.join(rootDir, "public", "runtime-config.js");
const firebaseSwConfigPath = path.join(
  rootDir,
  "public",
  "firebase-messaging-sw-config.js"
);

const DEFAULT_AI_PROXY_ENDPOINT = "/.netlify/functions/ai-generate";
const DEFAULT_PUSH_ENDPOINT = "/.netlify/functions/push-send";
const DEFAULT_PUSH_SW_URL = "/firebase-messaging-sw.js";
const DEFAULT_WHATSAPP_ENDPOINT = "/.netlify/functions/whatsapp-send";
const DEFAULT_EMAIL_ENDPOINT = "/.netlify/functions/email-send";

const FIREBASE_ENV_KEY_BY_CONFIG_KEY = Object.freeze({
  apiKey: "VITE_FIREBASE_API_KEY",
  authDomain: "VITE_FIREBASE_AUTH_DOMAIN",
  projectId: "VITE_FIREBASE_PROJECT_ID",
  storageBucket: "VITE_FIREBASE_STORAGE_BUCKET",
  messagingSenderId: "VITE_FIREBASE_MESSAGING_SENDER_ID",
  appId: "VITE_FIREBASE_APP_ID",
  measurementId: "VITE_FIREBASE_MEASUREMENT_ID",
  databaseURL: "VITE_FIREBASE_DATABASE_URL",
});

const REQUIRED_FIREBASE_KEYS = Object.freeze([
  "apiKey",
  "authDomain",
  "projectId",
  "storageBucket",
  "messagingSenderId",
  "appId",
]);

const getEnvValue = (...keys) => {
  for (const key of keys) {
    const value = process.env[key] || env[key];
    if (typeof value === "string") {
      return value.trim();
    }
  }
  return "";
};

const toSafeText = (value) => (typeof value === "string" ? value.trim() : "");
const toBoolean = (value) =>
  /^(1|true|yes|on)$/i.test(String(value || "").trim());

const pickFirstText = (...values) => {
  for (const value of values) {
    const safe = toSafeText(value);
    if (safe) return safe;
  }
  return "";
};

const pickFirstBoolean = (...values) => {
  for (const value of values) {
    if (typeof value === "boolean") return value;
    if (typeof value === "string" && value.trim()) {
      return toBoolean(value);
    }
  }
  return false;
};

const readAssignedGlobal = async (filePath, globalKey) => {
  try {
    const file = await fs.readFile(filePath, "utf8");
    const sandbox = {
      window: {},
      self: {},
    };
    vm.runInNewContext(file, sandbox, {
      filename: filePath,
      timeout: 100,
    });
    const value = sandbox.window?.[globalKey] ?? sandbox.self?.[globalKey];
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
};

const existingRuntimeConfig = await readAssignedGlobal(
  outputPath,
  "__A3HUB_RUNTIME_CONFIG__"
);
const existingFirebaseConfig = await readAssignedGlobal(
  firebaseSwConfigPath,
  "__A3HUB_FIREBASE_CONFIG__"
);
const legacyCloudinaryConfig = await readAssignedGlobal(
  path.join(rootDir, "public", "cloudinary-config.js"),
  "__A3HUB_CLOUDINARY_CONFIG__"
);
const legacyGeminiConfig = await readAssignedGlobal(
  path.join(rootDir, "public", "gemini-config.js"),
  "__A3HUB_GEMINI_CONFIG__"
);
const legacyGeminiRuntimeConfig = await readAssignedGlobal(
  path.join(rootDir, "public", "gemini-runtime-config.js"),
  "__A3HUB_GEMINI_CONFIG__"
);
const legacyWhatsAppConfig = await readAssignedGlobal(
  path.join(rootDir, "public", "whatsapp-config.js"),
  "__A3HUB_WHATSAPP_CONFIG__"
);
const legacyPushConfig = await readAssignedGlobal(
  path.join(rootDir, "public", "push-config.js"),
  "__A3HUB_PUSH_CONFIG__"
);
const legacyEmailConfig = await readAssignedGlobal(
  path.join(rootDir, "public", "email-config.js"),
  "__A3HUB_EMAIL_CONFIG__"
);

const runtimeFirebaseConfig =
  existingRuntimeConfig.firebase &&
  typeof existingRuntimeConfig.firebase === "object"
    ? existingRuntimeConfig.firebase
    : {};
const runtimeAiConfig =
  existingRuntimeConfig.ai && typeof existingRuntimeConfig.ai === "object"
    ? existingRuntimeConfig.ai
    : {};
const runtimeCloudinaryConfig =
  existingRuntimeConfig.cloudinary &&
  typeof existingRuntimeConfig.cloudinary === "object"
    ? existingRuntimeConfig.cloudinary
    : {};
const runtimeWhatsAppConfig =
  existingRuntimeConfig.whatsapp &&
  typeof existingRuntimeConfig.whatsapp === "object"
    ? existingRuntimeConfig.whatsapp
    : {};
const runtimePushConfig =
  existingRuntimeConfig.push && typeof existingRuntimeConfig.push === "object"
    ? existingRuntimeConfig.push
    : {};
const runtimeEmailConfig =
  existingRuntimeConfig.email && typeof existingRuntimeConfig.email === "object"
    ? existingRuntimeConfig.email
    : {};

const firebaseConfig = Object.fromEntries(
  Object.entries(FIREBASE_ENV_KEY_BY_CONFIG_KEY).flatMap(([configKey, envKey]) => {
    const value = pickFirstText(
      getEnvValue(envKey),
      runtimeFirebaseConfig[configKey],
      existingFirebaseConfig[configKey]
    );
    return value ? [[configKey, value]] : [];
  })
);

const allowClientAiKey = toBoolean(getEnvValue("VITE_ALLOW_CLIENT_AI_KEY"));
const isProductionBuild = mode === "production";
if (allowClientAiKey && isProductionBuild) {
  throw new Error(
    "VITE_ALLOW_CLIENT_AI_KEY cannot be true for production builds. Use the server-side Netlify AI function with GEMINI_API_KEY or OPENAI_API_KEY instead."
  );
}

const aiConfig = {
  apiKey: allowClientAiKey
    ? pickFirstText(
        getEnvValue("VITE_GEMINI_API_KEY", "VITE_OPENAI_API_KEY"),
        runtimeAiConfig.apiKey,
        legacyGeminiRuntimeConfig.apiKey,
        legacyGeminiConfig.apiKey
      )
    : "",
  endpoint:
    pickFirstText(
      getEnvValue("VITE_AI_PROXY_ENDPOINT"),
      runtimeAiConfig.endpoint,
      legacyGeminiRuntimeConfig.endpoint,
      legacyGeminiConfig.endpoint
    ) || DEFAULT_AI_PROXY_ENDPOINT,
};

const cloudinaryConfig = {
  cloudName: pickFirstText(
    getEnvValue("VITE_CLOUDINARY_CLOUD_NAME", "CLOUDINARY_CLOUD_NAME"),
    runtimeCloudinaryConfig.cloudName,
    runtimeCloudinaryConfig.cloud_name,
    legacyCloudinaryConfig.cloudName,
    legacyCloudinaryConfig.cloud_name
  ),
  uploadPreset: pickFirstText(
    getEnvValue("VITE_CLOUDINARY_UPLOAD_PRESET", "CLOUDINARY_UPLOAD_PRESET"),
    runtimeCloudinaryConfig.uploadPreset,
    runtimeCloudinaryConfig.upload_preset,
    legacyCloudinaryConfig.uploadPreset,
    legacyCloudinaryConfig.upload_preset
  ),
};

const whatsappConfig = {
  enabled: pickFirstBoolean(
    getEnvValue("VITE_WHATSAPP_NOTIFY_ENABLED"),
    runtimeWhatsAppConfig.enabled,
    legacyWhatsAppConfig.enabled
  ),
  endpoint:
    pickFirstText(
      getEnvValue("VITE_WHATSAPP_NOTIFY_ENDPOINT"),
      runtimeWhatsAppConfig.endpoint,
      legacyWhatsAppConfig.endpoint
    ) || DEFAULT_WHATSAPP_ENDPOINT,
  defaultCountryCode: pickFirstText(
    getEnvValue("VITE_WHATSAPP_DEFAULT_COUNTRY_CODE"),
    runtimeWhatsAppConfig.defaultCountryCode,
    legacyWhatsAppConfig.defaultCountryCode
  ),
  mode:
    pickFirstText(
      getEnvValue("VITE_WHATSAPP_MODE"),
      runtimeWhatsAppConfig.mode,
      legacyWhatsAppConfig.mode
    ) || "auto",
  templateName: pickFirstText(
    getEnvValue("VITE_WHATSAPP_TEMPLATE_NAME"),
    runtimeWhatsAppConfig.templateName,
    legacyWhatsAppConfig.templateName
  ),
  templateLanguage:
    pickFirstText(
      getEnvValue("VITE_WHATSAPP_TEMPLATE_LANGUAGE"),
      runtimeWhatsAppConfig.templateLanguage,
      legacyWhatsAppConfig.templateLanguage
    ) || "en_US",
  allowTemplateFallback: pickFirstBoolean(
    getEnvValue("VITE_WHATSAPP_TEXT_FALLBACK_TO_TEMPLATE"),
    runtimeWhatsAppConfig.allowTemplateFallback,
    legacyWhatsAppConfig.allowTemplateFallback
  ),
};

const pushConfig = {
  enabled: pickFirstBoolean(
    getEnvValue("VITE_PUSH_NOTIFY_ENABLED"),
    runtimePushConfig.enabled,
    legacyPushConfig.enabled
  ),
  vapidKey: pickFirstText(
    getEnvValue("VITE_PUSH_VAPID_KEY"),
    runtimePushConfig.vapidKey,
    legacyPushConfig.vapidKey
  ),
  endpoint:
    pickFirstText(
      getEnvValue("VITE_PUSH_NOTIFY_ENDPOINT"),
      runtimePushConfig.endpoint,
      legacyPushConfig.endpoint
    ) || DEFAULT_PUSH_ENDPOINT,
  swUrl:
    pickFirstText(
      getEnvValue("VITE_PUSH_SW_URL"),
      runtimePushConfig.swUrl,
      legacyPushConfig.swUrl
    ) || DEFAULT_PUSH_SW_URL,
};

const emailConfig = {
  enabled: pickFirstBoolean(
    getEnvValue("VITE_EMAIL_NOTIFY_ENABLED"),
    runtimeEmailConfig.enabled,
    legacyEmailConfig.enabled
  ),
  endpoint:
    pickFirstText(
      getEnvValue("VITE_EMAIL_NOTIFY_ENDPOINT"),
      runtimeEmailConfig.endpoint,
      legacyEmailConfig.endpoint
    ) || DEFAULT_EMAIL_ENDPOINT,
};

const runtimeConfig = {
  firebase: firebaseConfig,
  ai: aiConfig,
  cloudinary: cloudinaryConfig,
  whatsapp: whatsappConfig,
  push: pushConfig,
  email: emailConfig,
};

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(
  outputPath,
  [
    "/* Auto-generated by scripts/generate-runtime-config.mjs */",
    "// Runtime config for browser boot. Keep this file uncached across deploys.",
    `window.__A3HUB_RUNTIME_CONFIG__ = ${JSON.stringify(runtimeConfig, null, 2)};`,
    "window.__A3HUB_FIREBASE_CONFIG__ = window.__A3HUB_RUNTIME_CONFIG__.firebase || {};",
    "window.__A3HUB_GEMINI_CONFIG__ = window.__A3HUB_RUNTIME_CONFIG__.ai || {};",
    "window.__A3HUB_OPENAI_CONFIG__ = window.__A3HUB_GEMINI_CONFIG__;",
    "window.__A3HUB_CLOUDINARY_CONFIG__ = window.__A3HUB_RUNTIME_CONFIG__.cloudinary || {};",
    "window.__A3HUB_WHATSAPP_CONFIG__ = window.__A3HUB_RUNTIME_CONFIG__.whatsapp || {};",
    "window.__A3HUB_PUSH_CONFIG__ = window.__A3HUB_RUNTIME_CONFIG__.push || {};",
    "window.__A3HUB_EMAIL_CONFIG__ = window.__A3HUB_RUNTIME_CONFIG__.email || {};",
    "window.__CLOUDINARY_CONFIG__ = window.__A3HUB_CLOUDINARY_CONFIG__;",
    "window.__GEMINI_CONFIG__ = window.__A3HUB_GEMINI_CONFIG__;",
    "window.__OPENAI_CONFIG__ = window.__A3HUB_GEMINI_CONFIG__;",
    "",
  ].join("\n"),
  "utf8"
);

const missingFirebaseKeys = REQUIRED_FIREBASE_KEYS.filter(
  (key) => !toSafeText(firebaseConfig[key])
);

if (missingFirebaseKeys.length > 0) {
  console.warn(
    `[runtime-config] Missing Firebase values: ${missingFirebaseKeys.join(", ")}`
  );
}

if (!aiConfig.apiKey && allowClientAiKey) {
  console.warn(
    "[runtime-config] VITE_ALLOW_CLIENT_AI_KEY is true but no VITE_GEMINI_API_KEY or VITE_OPENAI_API_KEY was found."
  );
}
