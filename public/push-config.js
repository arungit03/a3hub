// Optional runtime config for Firebase Cloud Messaging (web push).
// Set enabled=true and paste Web Push certificate VAPID key from Firebase console.
window.__A3HUB_PUSH_CONFIG__ = {
  enabled: false,
  vapidKey: "",
  endpoint: "/.netlify/functions/push-send",
  swUrl: "/firebase-messaging-sw.js",
};
