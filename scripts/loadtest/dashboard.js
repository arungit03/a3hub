/* global __VU */
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
    dashboard_simulation: {
      executor: "constant-vus",
      vus: 5,
      duration: "10s",
    },
  },
};

export default function () {
  const userIndex = (__VU - 1) % testUsers.length;
  const user = testUsers[userIndex];
  
  // 1. Authenticate to Firebase
  const loginRes = firebaseLogin(user.email, user.password);
  const token = loginRes ? loginRes.idToken : SUPABASE_ANON_KEY;
  const uid = loginRes ? loginRes.localId : `mock-user-${__VU}`;

  const headers = {
    "apikey": SUPABASE_ANON_KEY,
    "Authorization": `Bearer ${token}`,
  };

  // 2. Visit Dashboard Profile
  const profileUrl = `${SUPABASE_URL}/rest/v1/${SUPABASE_DOCUMENTS_TABLE}?select=path,collection_path,document_id,data&path=eq.${encodeURIComponent(`users/${uid}`)}`;
  const profileRes = http.get(profileUrl, { headers, tags: { name: "dashboard_load_profile" } });
  check(profileRes, {
    "profile loads successfully": (r) => r.status === 200,
  });

  sleep(randomSleep());

  // 3. Visit Notifications Widget
  const notifUrl = `${SUPABASE_URL}/rest/v1/${SUPABASE_DOCUMENTS_TABLE}?select=path,collection_path,document_id,data&collection_path=eq.${encodeURIComponent(`users/${uid}/notifications`)}&limit=10`;
  const notifRes = http.get(notifUrl, { headers, tags: { name: "dashboard_load_notifications" } });
  check(notifRes, {
    "notifications load successfully": (r) => r.status === 200,
  });

  sleep(randomSleep());

  // 4. Visit Timetable / Schedule Widget
  const scheduleUrl = `${SUPABASE_URL}/rest/v1/${SUPABASE_DOCUMENTS_TABLE}?select=path,collection_path,document_id,data&collection_path=eq.schedules&limit=20`;
  const scheduleRes = http.get(scheduleUrl, { headers, tags: { name: "dashboard_load_schedules" } });
  check(scheduleRes, {
    "schedules load successfully": (r) => r.status === 200,
  });

  sleep(randomSleep());

  // 5. Visit Attendance Widget
  const attendanceUrl = `${SUPABASE_URL}/rest/v1/${SUPABASE_DOCUMENTS_TABLE}?select=path,collection_path,document_id,data&collection_path=eq.attendance&limit=20`;
  const attendanceRes = http.get(attendanceUrl, { headers, tags: { name: "dashboard_load_attendance" } });
  check(attendanceRes, {
    "attendance loads successfully": (r) => r.status === 200,
  });

  sleep(randomSleep());

  // 6. Visit Marks Widget
  const marksUrl = `${SUPABASE_URL}/rest/v1/${SUPABASE_DOCUMENTS_TABLE}?select=path,collection_path,document_id,data&collection_path=eq.marks&limit=20`;
  const marksRes = http.get(marksUrl, { headers, tags: { name: "dashboard_load_marks" } });
  check(marksRes, {
    "marks load successfully": (r) => r.status === 200,
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
