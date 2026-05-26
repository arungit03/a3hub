// Optional runtime config for browser Web Push.
// Set enabled=true and paste your Web Push VAPID public key.
window.__A3HUB_PUSH_CONFIG__ = {
  enabled: false,
  vapidKey: "",
  endpoint: "/.netlify/functions/push-send",
  swUrl: "/push-sw.js",
};
