# A3Hub k6 Load Testing Suite

This folder contains a complete load-testing suite configured for k6, simulating different aspects of the A3Hub campus ecosystem.

## File Structure

*   `config.js`: Central configurations, public API endpoints, API keys, and default thresholds.
*   `login.js`: Helper function to sign VUs into Firebase Authentication.
*   `test-users.csv`: CSV template of credentials for multiple concurrent VUs.
*   `homepage.js`: Homepage smoke/performance test.
*   `dashboard.js`: User dashboard navigation flow.
*   `firestore-read.js`: Measures Supabase document/collection read latency.
*   `firestore-write.js`: Measures document insertion/upsert performance.
*   `attendance.js`: Simulates marking and viewing class attendance.
*   `quiz.js`: Simulates learning subject catalog reading and quiz submissions.
*   `notification.js`: Simulates reading user notifications and marking them as read.
*   `stress.js`: Ramping load test up to 5,000 users with auto-abort gates.
*   `soak.js`: Stability soak test simulating 100 users for 30 minutes.

---

## Configuration

Before running, update `config.js` or specify the env variables to point to the correct test target:

*   `BASE_URL`: The URL of the application to test (defaults to `https://a3hubb.web.app`).
*   `FIREBASE_API_KEY`: The API key for Firebase Authentication.
*   `SUPABASE_URL`: The API URL of Supabase.
*   `SUPABASE_ANON_KEY`: The anon/publishable client key of Supabase.

To supply different credentials for VUs, update [test-users.csv](./test-users.csv) with actual emails, passwords, and roles:
```csv
email,password,role
student1@example.com,password123,student
staff1@example.com,password123,staff
```

---

## How to Run

Install [k6](https://k6.io/docs/getting-started/installation/) locally, then execute scripts using your terminal:

### Smoke / Homepage Test
```bash
k6 run scripts/loadtest/homepage.js
```

### Database Read Test
```bash
k6 run scripts/loadtest/firestore-read.js
```

### Database Write Test
```bash
k6 run scripts/loadtest/firestore-write.js
```

### Complete Dashboard Flow Simulation
```bash
k6 run scripts/loadtest/dashboard.js
```

### Stress Test
```bash
k6 run scripts/loadtest/stress.js
```

### Soak Test
```bash
k6 run scripts/loadtest/soak.js
```

---

## Customizing Load Options
You can override the scenarios defined inside scripts directly from the CLI. For example, to run the dashboard simulation with 50 concurrent users for 30 seconds:
```bash
k6 run --vus 50 --duration 30s scripts/loadtest/dashboard.js
```

## HTML and JSON Reports
After every run, reports will be saved to:
*   `reports/report.html`: Interactive web page with performance charts, percentiles, throughput, and error graphs.
*   `reports/report.json`: Detailed raw metric report.
