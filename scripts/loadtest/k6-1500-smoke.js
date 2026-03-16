/* global __ENV */
import http from "k6/http";
import { check, sleep } from "k6";

const BASE_URL = (__ENV.BASE_URL || "http://localhost:5173").replace(/\/+$/, "");
const AUTH_TOKEN = __ENV.AUTH_TOKEN || "";
const ENABLE_FUNCTIONS = String(__ENV.ENABLE_FUNCTIONS || "false").toLowerCase() === "true";

export const options = {
  scenarios: {
    browse_home: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "2m", target: 500 },
        { duration: "2m", target: 1000 },
        { duration: "2m", target: 1500 },
        { duration: "2m", target: 1500 },
        { duration: "2m", target: 0 },
      ],
      gracefulRampDown: "30s",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.03"],
    http_req_duration: ["p(95)<1500", "p(99)<3000"],
  },
};

const maybeRunFunctionProbe = () => {
  if (!ENABLE_FUNCTIONS || !AUTH_TOKEN) return;
  if (Math.random() > 0.03) return;

  const payload = JSON.stringify({
    action: "chat",
    payload: {
      messages: [{ role: "user", text: "Say hello in one line." }],
    },
  });

  const response = http.post(`${BASE_URL}/.netlify/functions/ai-generate`, payload, {
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${AUTH_TOKEN}`,
    },
    tags: { name: "ai_generate_probe" },
    timeout: "40s",
  });

  check(response, {
    "ai probe healthy status": (res) => [200, 401, 403, 429, 503].includes(res.status),
  });
};

export default function () {
  const home = http.get(`${BASE_URL}/`, {
    tags: { name: "home" },
    timeout: "20s",
  });

  check(home, {
    "home status 2xx/3xx": (res) => res.status >= 200 && res.status < 400,
  });

  maybeRunFunctionProbe();
  sleep(Math.random() * 1.8 + 0.2);
}
