/* global __VU */
import http from "k6/http";
import { check, sleep } from "k6";
import { SharedArray } from "k6/data";
import papaparse from "https://jslib.k6.io/papaparse/5.1.1/index.js";
import { 
  BASE_URL, 
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
    soak_test: {
      executor: "constant-vus",
      vus: 100,
      duration: "30m",
    },
  },
};

export default function () {
  const userIndex = (__VU - 1) % testUsers.length;
  const user = testUsers[userIndex];
  
  // 1. Load Homepage
  const homeRes = http.get(BASE_URL, { tags: { name: "home_page" } });
  check(homeRes, {
    "homepage status is 200": (r) => r.status === 200,
  });

  sleep(randomSleep());

  // 2. Authenticate
  const loginRes = firebaseLogin(user.email, user.password);
  const token = loginRes ? loginRes.idToken : SUPABASE_ANON_KEY;
  const uid = loginRes ? loginRes.localId : `mock-user-${__VU}`;

  const headers = {
    "apikey": SUPABASE_ANON_KEY,
    "Authorization": `Bearer ${token}`,
  };

  // 3. Load user dashboard details
  const profileUrl = `${SUPABASE_URL}/rest/v1/${SUPABASE_DOCUMENTS_TABLE}?select=path,collection_path,document_id,data&path=eq.${encodeURIComponent(`users/${uid}`)}`;
  const profileRes = http.get(profileUrl, { headers, tags: { name: "profile_read" } });
  check(profileRes, {
    "profile loads successfully": (r) => r.status === 200,
  });

  sleep(randomSleep());

  // 4. Read schedules
  const scheduleUrl = `${SUPABASE_URL}/rest/v1/${SUPABASE_DOCUMENTS_TABLE}?select=path,collection_path,document_id,data&collection_path=eq.schedules&limit=5`;
  const scheduleRes = http.get(scheduleUrl, { headers, tags: { name: "schedules_read" } });
  check(scheduleRes, {
    "schedules load successfully": (r) => r.status === 200,
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
