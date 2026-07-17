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
    attendance_simulation: {
      executor: "constant-vus",
      vus: 5,
      duration: "10s",
    },
  },
};

export default function () {
  const userIndex = (__VU - 1) % testUsers.length;
  const user = testUsers[userIndex];
  const isStaffOrAdmin = user.role === "staff" || user.role === "admin";
  
  // Login
  const loginRes = firebaseLogin(user.email, user.password);
  const token = loginRes ? loginRes.idToken : SUPABASE_ANON_KEY;
  const uid = loginRes ? loginRes.localId : `mock-user-${__VU}`;

  const headers = {
    "apikey": SUPABASE_ANON_KEY,
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  // 1. Read Attendance Records (All users view attendance)
  const attendanceQueryUrl = `${SUPABASE_URL}/rest/v1/${SUPABASE_DOCUMENTS_TABLE}?select=path,collection_path,document_id,data&collection_path=eq.attendance&limit=20`;
  const viewRes = http.get(attendanceQueryUrl, { headers, tags: { name: "attendance_view" } });
  check(viewRes, {
    "view attendance status is 200": (r) => r.status === 200,
  });

  sleep(randomSleep());

  // 2. Write Attendance Record (Only Staff or Admin can mark attendance)
  if (isStaffOrAdmin) {
    const writeHeaders = Object.assign({}, headers, { "Prefer": "resolution=merge-duplicates" });
    const recordId = `att-${uid}-${Date.now()}`;
    const payload = JSON.stringify({
      path: `attendance/${recordId}`,
      collection_path: "attendance",
      document_id: recordId,
      data: {
        staffUid: uid,
        class: "CS-101",
        date: new Date().toISOString().split("T")[0],
        studentsPresent: ["student1", "student2"],
        markedAt: new Date().toISOString(),
      },
      updated_at: new Date().toISOString(),
    });

    const markRes = http.post(
      `${SUPABASE_URL}/rest/v1/${SUPABASE_DOCUMENTS_TABLE}`,
      payload,
      { headers: writeHeaders, tags: { name: "attendance_mark" } }
    );
    
    check(markRes, {
      "mark attendance status is 2xx": (r) => r.status >= 200 && r.status < 300,
    });

    sleep(randomSleep());
  }
}

export function handleSummary(data) {
  return {
    "reports/report.html": htmlReport(data),
    "reports/report.json": JSON.stringify(data),
    "stdout": textSummary(data, { indent: " ", enableColors: true }),
  };
}
