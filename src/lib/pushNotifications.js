import { arrayUnion, doc, serverTimestamp, setDoc } from "./supabaseData";
import { db } from "./supabase";

const DEFAULT_SW_URL = "/push-sw.js";
const toSafeText = (value) => (typeof value === "string" ? value.trim() : "");
const toBoolean = (value) =>
  /^(1|true|yes|on)$/i.test(String(value || "").trim());

const urlBase64ToUint8Array = (base64String) => {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = `${base64String}${padding}`.replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
};

const resolvePushClientConfig = () => {
  const runtimeRoot =
    typeof window !== "undefined" &&
    window.__A3HUB_RUNTIME_CONFIG__ &&
    typeof window.__A3HUB_RUNTIME_CONFIG__ === "object"
      ? window.__A3HUB_RUNTIME_CONFIG__
      : {};
  const runtimeConfig =
    typeof window !== "undefined" && window.__A3HUB_PUSH_CONFIG__
      ? window.__A3HUB_PUSH_CONFIG__
      : runtimeRoot.push && typeof runtimeRoot.push === "object"
      ? runtimeRoot.push
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

  const permission = await requestNotificationPermission();
  if (permission !== "granted") return;

  try {
    const registration = await navigator.serviceWorker.register(config.swUrl);
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(config.vapidKey),
    });
    const pushToken = JSON.stringify(subscription.toJSON());

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
