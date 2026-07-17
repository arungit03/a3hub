/* global __ENV */

export const BASE_URL = (__ENV.BASE_URL || "https://a3hubb.web.app").replace(/\/+$/, "");

// Firebase REST API configurations
export const FIREBASE_API_KEY = __ENV.FIREBASE_API_KEY || "AIzaSyDMEUYNg4eNKnFfRCXOIkmJOzJ6eO1_qA8";
export const FIREBASE_SIGNIN_URL = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`;

// Supabase REST configurations (mimicking Firestore document endpoints)
export const SUPABASE_URL = (__ENV.SUPABASE_URL || "https://rinygybimyrcfgekeveg.supabase.co").replace(/\/+$/, "");
export const SUPABASE_ANON_KEY = __ENV.SUPABASE_ANON_KEY || "sb_publishable_Dpic-sjV0o684QfADx6pRA_Mt6X_AXI";
export const SUPABASE_DOCUMENTS_TABLE = __ENV.SUPABASE_DOCUMENTS_TABLE || "app_documents";

// Load test thresholds
export const DEFAULT_THRESHOLDS = {
  http_req_failed: ["rate<0.03"], // Error rate must be less than 3%
  http_req_duration: ["p(95)<1500", "p(99)<3000"], // p95 < 1.5s, p99 < 3s
};

// Simulation sleep defaults
export const SLEEP_MIN = 0.5;
export const SLEEP_MAX = 2.0;

export function randomSleep() {
  return Math.random() * (SLEEP_MAX - SLEEP_MIN) + SLEEP_MIN;
}
