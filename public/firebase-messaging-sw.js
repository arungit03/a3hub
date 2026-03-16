/* global importScripts, firebase, clients */

importScripts("https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js");
importScripts(
  "https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging-compat.js"
);

firebase.initializeApp({
  apiKey: "AIzaSyChlLHW-VBMTG4k1-q77OplVPfiGZlvmk0",
  authDomain: "ckcethub.firebaseapp.com",
  projectId: "ckcethub",
  storageBucket: "ckcethub.firebasestorage.app",
  messagingSenderId: "937525565918",
  appId: "1:937525565918:web:7a52c2d793993745c2254f",
});

const messaging = firebase.messaging();

const toSafeText = (value) => (typeof value === "string" ? value.trim() : "");

messaging.onBackgroundMessage((payload) => {
  const title =
    toSafeText(payload?.notification?.title) ||
    toSafeText(payload?.data?.title) ||
    "CKCET Hub";
  const body =
    toSafeText(payload?.notification?.body) || toSafeText(payload?.data?.body);
  const link = toSafeText(payload?.data?.link || payload?.fcmOptions?.link);

  const notificationOptions = {
    body,
    data: {
      link,
    },
  };

  self.registration.showNotification(title, notificationOptions);
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = toSafeText(event.notification?.data?.link);
  if (!link) {
    event.waitUntil(clients.openWindow("/"));
    return;
  }
  event.waitUntil(clients.openWindow(link));
});
