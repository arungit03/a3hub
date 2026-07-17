import http from "k6/http";
import { check, sleep } from "k6";
import { BASE_URL, DEFAULT_THRESHOLDS, randomSleep } from "./config.js";
import { htmlReport } from "https://raw.githubusercontent.com/benc-uk/k6-reporter/main/dist/bundle.js";
import { textSummary } from "https://jslib.k6.io/k6-summary/0.0.1/index.js";

export const options = {
  thresholds: DEFAULT_THRESHOLDS,
  scenarios: {
    smoke_test: {
      executor: "constant-vus",
      vus: 5,
      duration: "10s",
    },
  },
};

export default function () {
  const params = {
    tags: { name: "homepage_load" },
  };
  const res = http.get(BASE_URL, params);
  
  check(res, {
    "status is 200": (r) => r.status === 200,
    "homepage has content": (r) => r.body && r.body.length > 100,
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
