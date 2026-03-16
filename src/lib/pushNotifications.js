import { arrayUnion, doc, serverTimestamp, setDoc } from "firebase/firestore";
import { getMessaging, getToken, isSupported } from "firebase/messaging";
import app, { db } from "./firebase";

const DEFAULT_SW_URL = "/firebase-messaging-sw.js";
const toSafeText = (value) => (typeof value === "string" ? value.trim() : "");
const toBoolean = (value) =>
  /^(1|true|yes|on)$/i.test(String(value || "").trim());

const resolvePushClientConfig = () => {
  const runtimeConfig =
    typeof window !== "undefined" && window.__A3HUB_PUSH_CONFIG__
      ? window.__A3HUB_PUSH_CONFIG__
      : {};

  const enabledFromEnv = toBoolean(import.meta.env.VITE_PUSH_NOTIFY_ENABLED);
  const vapidKeyFromEnv = toSafeText(import.meta.env.VITE_PUSH_VAPID_KEY);
  const endpointFromEnv = toSafeText(import.meta.env.VITE_PUSH_NOTIFY_ENDPOINT);
  const swUrlFromEnv = toSafeText(import.meta.env.VITE_PUSH_SW_URL);

  return {
    enabled:
      typeof runtimeConfig.enabled === "boolean"
        ? runtimeConfig.enabled
        : enabledFromEnv,
    vapidKey: toSafeText(runtimeConfig.vapidKey) || vapidKeyFromEnv,
    endpoint:
      toSafeText(runtimeConfig.endpoint) ||
      endpointFromEnv ||
      "/.netlify/functions/push-send",
    swUrl: toSafeText(runtimeConfig.swUrl) || swUrlFromEnv || DEFAULT_SW_URL,
  };
};

const ensureBrowserSupport = () => {
  if (typeof window === "undefined") return false;
  if (typeof Notification === "undefined") return false;
  if (!("serviceWorker" in navigator)) return false;
  return true;
};

const requestNotificationPermission = async () => {
  const currentPermission = Notification.permission;
  if (currentPermission === "granted") return "granted";
  if (currentPermission === "denied") return "denied";
  try {
    return await Notification.requestPermission();
  } catch {
    return "default";
  }
};

export async function registerPushTokenForUser(userId) {
  const safeUserId = toSafeText(userId);
  if (!safeUserId) return;
  if (!ensureBrowserSupport()) return;

  const config = resolvePushClientConfig();
  if (!config.enabled) return;
  if (!config.vapidKey) return;

  const messagingSupported = await isSupported().catch(() => false);
  if (!messagingSupported) return;

  const permission = await requestNotificationPermission();
  if (permission !== "granted") return;

  try {
    const registration = await navigator.serviceWorker.register(config.swUrl);
    const messaging = getMessaging(app);
    const pushToken = await getToken(messaging, {
      vapidKey: config.vapidKey,
      serviceWorkerRegistration: registration,
    });

    if (!toSafeText(pushToken)) return;

    await setDoc(
      doc(db, "users", safeUserId),
      {
        pushToken,
        pushTokens: arrayUnion(pushToken),
        pushTokenUpdatedAt: serverTimestamp(),
        pushConfig: {
          endpoint: config.endpoint,
          updatedAt: serverTimestamp(),
        },
      },
      { merge: true }
    );
  } catch (error) {
    console.warn("Unable to register push token", error?.message || error);
  }
}
