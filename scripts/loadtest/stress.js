/* global __VU, __ITER */
import http from "k6/http";
import { check, sleep } from "k6";
import { SharedArray } from "k6/data";
import papaparse from "https://jslib.k6.io/papaparse/5.1.1/index.js";
import { 
  BASE_URL, 
  SUPABASE_URL, 
  SUPABASE_ANON_KEY, 
  SUPABASE_DOCUMENTS_TABLE, 
  randomSleep 
} from "./config.js";
import { firebaseLogin } from "./login.js";
import { htmlReport } from "https://raw.githubusercontent.com/benc-uk/k6-reporter/main/dist/bundle.js";
import { textSummary } from "https://jslib.k6.io/k6-summary/0.0.1/index.js";

const testUsers = new SharedArray("users credentials", function () {
  return papaparse.parse(open("./test-users.csv"), { header: true, skipEmptyLines: true }).data;
});

export const options = {
  scenarios: {
    stress_test: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "30s", target: 100 },  // Ramp to 100 VUs
        { duration: "30s", target: 100 },  // Hold at 100 VUs
        { duration: "30s", target: 300 },  // Ramp to 300 VUs
        { duration: "30s", target: 300 },  // Hold at 300 VUs
        { duration: "30s", target: 500 },  // Ramp to 500 VUs
        { duration: "30s", target: 500 },  // Hold at 500 VUs
        { duration: "30s", target: 1000 }, // Ramp to 1000 VUs
        { duration: "30s", target: 1000 }, // Hold at 1000 VUs
        { duration: "30s", target: 2500 }, // Ramp to 2500 VUs
        { duration: "30s", target: 2500 }, // Hold at 2500 VUs
        { duration: "30s", target: 5000 }, // Ramp to 5000 VUs
        { duration: "30s", target: 5000 }, // Hold at 5000 VUs
        { duration: "30s", target: 0 },    // Ramp down to 0 VUs
      ],
    },
  },
  thresholds: {
    // If thresholds are failed, k6 will abort the test execution
    http_req_failed: [{ threshold: "rate<0.03", abortOnFail: true, delayAbortEval: "5s" }],
    http_req_duration: [
      { threshold: "p(95)<1500", abortOnFail: true, delayAbortEval: "5s" },
      { threshold: "p(99)<3000", abortOnFail: true, delayAbortEval: "5s" },
    ],
  },
};

export default function () {
  const userIndex = (__VU - 1) % testUsers.length;
  const user = testUsers[userIndex];
  
  // 1. Visit homepage
  const homeRes = http.get(BASE_URL, { tags: { name: "home_page" } });
  check(homeRes, {
    "homepage status is 200": (r) => r.status === 200,
  });

  sleep(randomSleep());

  // 2. Login
  const loginRes = firebaseLogin(user.email, user.password);
  const token = loginRes ? loginRes.idToken : SUPABASE_ANON_KEY;
  const uid = loginRes ? loginRes.localId : `mock-user-${__VU}`;

  const headers = {
    "apikey": SUPABASE_ANON_KEY,
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  // 3. Get profile
  const profileUrl = `${SUPABASE_URL}/rest/v1/${SUPABASE_DOCUMENTS_TABLE}?select=path,collection_path,document_id,data&path=eq.${encodeURIComponent(`users/${uid}`)}`;
  const profileRes = http.get(profileUrl, { headers, tags: { name: "profile_read" } });
  check(profileRes, {
    "profile status is 200": (r) => r.status === 200,
  });

  sleep(randomSleep());

  // 4. Query public schedules
  const scheduleUrl = `${SUPABASE_URL}/rest/v1/${SUPABASE_DOCUMENTS_TABLE}?select=path,collection_path,document_id,data&collection_path=eq.schedules&limit=5`;
  const scheduleRes = http.get(scheduleUrl, { headers, tags: { name: "schedules_read" } });
  check(scheduleRes, {
    "schedules status is 200": (r) => r.status === 200,
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
