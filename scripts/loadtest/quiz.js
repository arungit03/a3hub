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
    learning_simulation: {
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

  // 1. Fetch Learning Catalog Courses
  const catalogUrl = `${SUPABASE_URL}/rest/v1/${SUPABASE_DOCUMENTS_TABLE}?select=path,collection_path,document_id,data&collection_path=eq.learningCourses&limit=10`;
  const catalogRes = http.get(catalogUrl, { headers, tags: { name: "quiz_get_catalog" } });
  check(catalogRes, {
    "catalog fetch status is 200": (r) => r.status === 200,
  });

  sleep(randomSleep());

  // 2. Submit Quiz Results
  const writeHeaders = Object.assign({}, headers, { "Prefer": "resolution=merge-duplicates" });
  const courseId = "python_basics";
  const progressPath = `users/${uid}/learningProgress/${courseId}`;
  
  const payload = JSON.stringify({
    path: progressPath,
    collection_path: `users/${uid}/learningProgress`,
    document_id: courseId,
    data: {
      courseId,
      score: Math.floor(Math.random() * 40) + 60, // 60 to 100
      completedAt: new Date().toISOString(),
      status: "passed",
      answers: { q1: "correct", q2: "correct" },
    },
    updated_at: new Date().toISOString(),
  });

  const progressRes = http.post(
    `${SUPABASE_URL}/rest/v1/${SUPABASE_DOCUMENTS_TABLE}`,
    payload,
    { headers: writeHeaders, tags: { name: "quiz_submit_progress" } }
  );

  check(progressRes, {
    "submit progress status is 2xx": (r) => r.status >= 200 && r.status < 300,
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
