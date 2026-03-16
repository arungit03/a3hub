/* global importScripts, firebase, clients */

importScripts("https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js");
importScripts(
  "https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging-compat.js"
);
try {
  importScripts("/firebase-messaging-sw-config.js");
} catch {
  self.__A3HUB_FIREBASE_CONFIG__ = {};
}

const toSafeText = (value) => (typeof value === "string" ? value.trim() : "");
const firebaseConfig =
  self.__A3HUB_FIREBASE_CONFIG__ &&
  typeof self.__A3HUB_FIREBASE_CONFIG__ === "object"
    ? self.__A3HUB_FIREBASE_CONFIG__
    : {};
const isFirebaseConfigured = ["apiKey", "projectId", "messagingSenderId", "appId"]
  .every((key) => toSafeText(firebaseConfig[key]).length > 0);

let messaging = null;

if (isFirebaseConfigured) {
  firebase.initializeApp(firebaseConfig);
  messaging = firebase.messaging();
}

if (messaging) {
  messaging.onBackgroundMessage((payload) => {
    const title =
      toSafeText(payload?.notification?.title) ||
      toSafeText(payload?.data?.title) ||
      "A3 Hub";
    const body =
      toSafeText(payload?.notification?.body) ||
      toSafeText(payload?.data?.body);
    const link = toSafeText(payload?.data?.link || payload?.fcmOptions?.link);

    const notificationOptions = {
      body,
      data: {
        link,
      },
    };

    self.registration.showNotification(title, notificationOptions);
  });
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = toSafeText(event.notification?.data?.link);
  if (!link) {
    event.waitUntil(clients.openWindow("/"));
    return;
  }
  event.waitUntil(clients.openWindow(link));
});
