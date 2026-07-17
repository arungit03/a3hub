/* global __VU, __ITER */
import http from "k6/http";
import { check, sleep } from "k6";
import { SharedArray } from "k6/data";
import papaparse from "https://jslib.k6.io/papaparse/5.1.1/index.js";
import { 
  SUPABASE_URL, 
  SUPABASE_ANON_KEY, 
  SUPABASE_DOCUMENTS_TABLE, 
  DEFAULT_THRESHOLDS, 
  randomSleep 
} from "./config.js";
import { firebaseLogin } from "./login.js";
import { htmlReport } from "https://raw.githubusercontent.com/benc-uk/k6-reporter/main/dist/bundle.js";
import { textSummary } from "https://jslib.k6.io/k6-summary/0.0.1/index.js";

const testUsers = new SharedArray("users credentials", function () {
  return papaparse.parse(open("./test-users.csv"), { header: true, skipEmptyLines: true }).data;
});

export const options = {
  thresholds: DEFAULT_THRESHOLDS,
  scenarios: {
    notifications_simulation: {
      executor: "constant-vus",
      vus: 5,
      duration: "10s",
    },
  },
};

export default function () {
  const userIndex = (__VU - 1) % testUsers.length;
  const user = testUsers[userIndex];
  
  // Login
  const loginRes = firebaseLogin(user.email, user.password);
  const token = loginRes ? loginRes.idToken : SUPABASE_ANON_KEY;
  const uid = loginRes ? loginRes.localId : `mock-user-${__VU}`;

  const headers = {
    "apikey": SUPABASE_ANON_KEY,
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  // 1. Fetch user notifications
  const collectionPath = `users/${uid}/notifications`;
  const fetchUrl = `${SUPABASE_URL}/rest/v1/${SUPABASE_DOCUMENTS_TABLE}?select=path,collection_path,document_id,data&collection_path=eq.${encodeURIComponent(collectionPath)}&limit=20`;
  const fetchRes = http.get(fetchUrl, { headers, tags: { name: "notification_fetch" } });
  check(fetchRes, {
    "notifications fetch status is 200": (r) => r.status === 200,
  });

  sleep(randomSleep());

  // 2. Mark Notification as Read (Send an upsert for a mock/existing notification)
  const writeHeaders = Object.assign({}, headers, { "Prefer": "resolution=merge-duplicates" });
  const notificationId = `notif-${__VU}-${__ITER}`;
  const notificationPath = `users/${uid}/notifications/${notificationId}`;
  
  const payload = JSON.stringify({
    path: notificationPath,
    collection_path: collectionPath,
    document_id: notificationId,
    data: {
      id: notificationId,
      title: "Test System Notification",
      message: "This is a performance test notification alert.",
      isRead: true,
      timestamp: new Date().toISOString(),
      type: "loadtest",
    },
    updated_at: new Date().toISOString(),
  });

  const markRes = http.post(
    `${SUPABASE_URL}/rest/v1/${SUPABASE_DOCUMENTS_TABLE}`,
    payload,
    { headers: writeHeaders, tags: { name: "notification_read" } }
  );

  check(markRes, {
    "mark read status is 2xx": (r) => r.status >= 200 && r.status < 300,
  });

  sleep(randomSleep());
}

export function handleSummary(data) {
  return {
    "reports/report.html": htmlReport(data),
    "reports/report.json": JSON.stringify(data),
    "stdout": textSummary(data, { indent: " ", enableColors: true }),
  };
}
