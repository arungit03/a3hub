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
    read_performance: {
      executor: "constant-vus",
      vus: 5,
      duration: "10s",
    },
  },
};

export default function () {
  const userIndex = (__VU - 1) % testUsers.length;
  const user = testUsers[userIndex];
  
  // Try logging in to get authentic JWT. Fallback to using anon key if credentials are placeholder/fail.
  const loginRes = firebaseLogin(user.email, user.password);
  const token = loginRes ? loginRes.idToken : SUPABASE_ANON_KEY;
  const uid = loginRes ? loginRes.localId : `mock-user-${__VU}`;

  const headers = {
    "apikey": SUPABASE_ANON_KEY,
    "Authorization": `Bearer ${token}`,
  };

  // 1. Read single document (User profile)
  const docPath = `users/${uid}`;
  const docUrl = `${SUPABASE_URL}/rest/v1/${SUPABASE_DOCUMENTS_TABLE}?select=path,collection_path,document_id,data&path=eq.${encodeURIComponent(docPath)}`;
  
  const docRes = http.get(docUrl, { headers, tags: { name: "db_read_document" } });
  check(docRes, {
    "single read status is 200": (r) => r.status === 200,
  });

  sleep(randomSleep());

  // 2. Query Collection (Public schedules or general content)
  const queryUrl = `${SUPABASE_URL}/rest/v1/${SUPABASE_DOCUMENTS_TABLE}?select=path,collection_path,document_id,data&collection_path=eq.schedules&limit=10`;
  
  const queryRes = http.get(queryUrl, { headers, tags: { name: "db_query_collection" } });
  check(queryRes, {
    "query status is 200": (r) => r.status === 200,
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
