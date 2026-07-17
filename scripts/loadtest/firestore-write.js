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
    write_performance: {
      executor: "constant-vus",
      vus: 5,
      duration: "10s",
    },
  },
};

export default function () {
  const userIndex = (__VU - 1) % testUsers.length;
  const user = testUsers[userIndex];
  
  // Login to Firebase
  const loginRes = firebaseLogin(user.email, user.password);
  const token = loginRes ? loginRes.idToken : SUPABASE_ANON_KEY;
  const uid = loginRes ? loginRes.localId : `mock-user-${__VU}`;

  const headers = {
    "apikey": SUPABASE_ANON_KEY,
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates",
  };

  const timestamp = Date.now();
  const recordId = `record-${__VU}-${__ITER}-${timestamp}`;
  const docPath = `users/${uid}/loadtest_records/${recordId}`;
  const collectionPath = `users/${uid}/loadtest_records`;

  const payload = JSON.stringify({
    path: docPath,
    collection_path: collectionPath,
    document_id: recordId,
    data: {
      testRun: "k6-loadtest",
      virtualUser: __VU,
      iteration: __ITER,
      timestamp: timestamp,
      status: "completed",
    },
    updated_at: new Date().toISOString(),
  });

  const url = `${SUPABASE_URL}/rest/v1/${SUPABASE_DOCUMENTS_TABLE}`;
  
  const res = http.post(url, payload, { headers, tags: { name: "db_write_document" } });
  
  check(res, {
    "write status is 2xx (created/ok)": (r) => r.status >= 200 && r.status < 300,
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
