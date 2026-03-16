# Capacity Controls for 1,500 Concurrent Students

This project now includes server-side load shedding for heavy Netlify functions.
Use this guide before large production rollouts.

## Heavy Function Backpressure

Each heavy function supports three environment variables:

- `{FUNCTION}_MAX_CONCURRENCY`
- `{FUNCTION}_MAX_QUEUE_SIZE`
- `{FUNCTION}_MAX_QUEUE_WAIT_MS`

When limits are exceeded:

- function responds with `503`
- response code is `capacity/overloaded`
- `retry-after` header is returned

Current function prefixes:

- `AI_GENERATE_*`
- `CODE_RUN_*`
- `EMAIL_SEND_*`
- `PUSH_SEND_*`
- `WHATSAPP_SEND_*`

Recommended starting values:

- `AI_GENERATE_MAX_CONCURRENCY=40`
- `AI_GENERATE_MAX_QUEUE_SIZE=120`
- `AI_GENERATE_MAX_QUEUE_WAIT_MS=15000`
- `CODE_RUN_MAX_CONCURRENCY=30`
- `CODE_RUN_MAX_QUEUE_SIZE=90`
- `CODE_RUN_MAX_QUEUE_WAIT_MS=15000`
- `EMAIL_SEND_MAX_CONCURRENCY=25`
- `EMAIL_SEND_MAX_QUEUE_SIZE=80`
- `EMAIL_SEND_MAX_QUEUE_WAIT_MS=15000`
- `PUSH_SEND_MAX_CONCURRENCY=30`
- `PUSH_SEND_MAX_QUEUE_SIZE=100`
- `PUSH_SEND_MAX_QUEUE_WAIT_MS=15000`
- `WHATSAPP_SEND_MAX_CONCURRENCY=25`
- `WHATSAPP_SEND_MAX_QUEUE_SIZE=80`
- `WHATSAPP_SEND_MAX_QUEUE_WAIT_MS=15000`

Tune up or down based on function latency and provider quotas.

## Role and Rate Guarding

Keep these controls enabled in production:

- strict role allowlists for each function
- per-user/IP rate limits
- auth token verification enabled for all privileged function calls

## Frontend Load Reduction

- heavy face-attendance module is lazy loaded only when needed
- keep student home/dashboard screens read-optimized
- avoid opening many realtime listeners per page

## Monitoring Checklist

Track these metrics continuously:

1. Netlify Functions
- request count and p95/p99 duration per function
- `429`, `503`, and `5xx` rates
- provider fallback frequency (`providerAttempts`)

2. Firebase
- Firestore reads/writes per minute
- rejected rule writes
- auth sign-in errors

3. External providers
- Gemini/OpenAI quota and rate-limit errors
- Piston compile failures/timeouts
- Resend/WhatsApp/FCM provider error rates

Alert thresholds (starting point):

- function `5xx` > 2% for 5 minutes
- `capacity/overloaded` > 5% for 5 minutes
- p95 function latency > 4 seconds

## 1,500 User Load Test

Use k6 smoke test:

```bash
npm run loadtest:1500
```

With optional AI probe (authenticated):

```bash
npm run loadtest:1500:ai
```

Required env for load test command:

- `BASE_URL` (site URL)
- `AUTH_TOKEN` (only for `:ai` run)

Example:

```bash
BASE_URL=https://your-site.netlify.app npm run loadtest:1500
BASE_URL=https://your-site.netlify.app AUTH_TOKEN=<firebase_id_token> npm run loadtest:1500:ai
```
