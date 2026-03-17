# a3hub

## Feature Scope Isolation

For onboarding and debugging in this multi-feature app (attendance, AI chat, compilers, notifications, admin), use the feature-module guide:
- `docs/feature-modules.md`

## Deploy Profiles

This repo can now ship smaller deployment profiles so every environment does not need the full feature surface.

- Profiles doc: `docs/deploy-profiles.md`
- Base env var: `VITE_DEPLOY_PROFILE=full|academic|learning|operations|lean`
- Local build shortcuts:
  - `npm run build:academic`
  - `npm run build:learning`
  - `npm run build:operations`
  - `npm run build:lean`

Profiles reduce visible routes, menu entries, route prefetch, and some dashboard listeners for disabled modules.

## Service Portability and Failover

To reduce external vendor lock-in and outage impact, notification and code-run functions support ordered provider fallback chains (primary + webhook fallback):
- `docs/service-portability.md`

## Capacity Controls (1,500 Concurrent Users)

For function backpressure, load shedding, monitoring checklist, and load-test commands:
- `docs/capacity-controls.md`

## Project Structure Sync

`project_structure.txt` is generated from repository files to prevent documentation drift.

- Regenerate: `npm run docs:structure`
- Verify drift: `npm run docs:structure:check`

## Incremental Type Safety (JavaScript + TypeScript Checker)

The app is still JavaScript-first, but strict static checks now run on critical modules:

- Run: `npm run typecheck`
- Config: `tsconfig.typecheck.json`
- Runtime/global declarations: `src/types/runtime-globals.d.ts`

Current strategy is incremental:

1. Keep strict checks green for selected modules.
2. Add more JS files to `tsconfig.typecheck.json` over time.
3. Use JSDoc types while migrating to `.ts`/`.tsx` where it provides clear value.

## Test Coverage Layers

The test suite now has explicit layers instead of utility-only tests:

- Unit tests: `test/*.test.js`
- Integration tests: `test/integration/*.test.js`
- E2E flow tests: `test/e2e/*.test.js`

Run commands:

- `npm run test:unit`
- `npm run test:integration`
- `npm run test:e2e`
- `npm run test:all`

## Firebase Client Config

Frontend Firebase values now load from `.env`, and the Firebase messaging service worker config is generated automatically before `npm run dev` and `npm run build`.

Required local keys:
- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`

Optional local keys:
- `VITE_FIREBASE_MEASUREMENT_ID`
- `VITE_FIREBASE_DATABASE_URL`
- `VITE_PUSH_VAPID_KEY`

Use `.env.example` as the template for local setup.

## Email Verification / Password Reset Inbox Placement

For Gmail `Primary` vs `Spam` behavior and Firebase setup steps, see:
- `docs/email-deliverability.md`

## Schedule Auto-Delete (24h)

Schedule docs now include an `expiresAt` timestamp.

To delete old schedules automatically from Firestore itself, enable a TTL policy:

1. Open Firebase Console -> Firestore Database.
2. Go to TTL policies.
3. Add policy for collection group `schedules` on field `expiresAt`.

## Leave Request Auto-Delete (24h)

Leave request docs now include an `expiresAt` timestamp.

To delete old leave requests automatically from Firestore itself, enable a TTL policy:

1. Open Firebase Console -> Firestore Database.
2. Go to TTL policies.
3. Add policy for collection group `leaveRequests` on field `expiresAt`.

## Assignment File Uploads (No Firebase Storage Billing)

Assignments and student answer files now upload with automatic fallback:
- Cloudinary (if configured)
- Firebase Storage
- Firestore chunk upload fallback (no Storage needed)
- Inline data URL fallback for small files (<= 700 KB)

1. Create an unsigned upload preset in Cloudinary.
2. Configure environment values (either local `.env` or Netlify UI):
   - `VITE_CLOUDINARY_CLOUD_NAME` (or `CLOUDINARY_CLOUD_NAME`)
   - `VITE_CLOUDINARY_UPLOAD_PRESET` (or `CLOUDINARY_UPLOAD_PRESET`)
3. Restart dev server locally, or redeploy in Netlify after setting values.
4. If you do not want env variables, set values directly in the generated browser runtime file:
   - `public/runtime-config.js`
   - `window.__A3HUB_CLOUDINARY_CONFIG__.cloudName`
   - `window.__A3HUB_CLOUDINARY_CONFIG__.uploadPreset`

If using Firebase Storage fallback, ensure Storage is enabled and rules allow signed-in users.

If Cloudinary and Firebase Storage fail, files are saved under:
- `/uploadedFiles/{fileId}`
- `/uploadedFiles/{fileId}/chunks/{chunkId}`
and served through:
- `/file-asset/:fileId`

Staff flow:
- Open `Menu -> Assignments`
- Upload assignment/quiz file and publish.

Student flow:
- Open `Menu -> Assignments`
- Download assignment file and upload answer file.

Submission data path:
- `/assignmentSubmissions/{assignmentId}_{studentId}`

## AI Chat (Gemini or OpenAI)

AI chat is available at:
- `/student/ai`
- `/staff/ai`

Configuration options:
1. Set Netlify environment key:
   - `GEMINI_API_KEY` (preferred) or `OPENAI_API_KEY`
2. Deploy with server function:
   - `netlify/functions/ai-generate.cjs`
3. Browser runtime config is generated into `public/runtime-config.js`:
   - `window.__A3HUB_GEMINI_CONFIG__.apiKey = ""`
   - `window.__A3HUB_GEMINI_CONFIG__.endpoint = "/.netlify/functions/ai-generate"`
4. Client-side AI keys are development-only:
   - keep `VITE_ALLOW_CLIENT_AI_KEY=false` for production
   - production builds now fail if `VITE_ALLOW_CLIENT_AI_KEY=true`
   - use Netlify server environment variables instead of exposing AI keys to the browser

## Student Mobile WhatsApp Notification (on in-app notification)

When app notifications are created through `createUserNotification` / `createBulkUserNotifications`,
the app can also send WhatsApp messages to each student's mobile number (`studentMobile` / `mobile`).

### 1) Configure Netlify server function secrets

Set in Netlify Site Settings -> Environment variables:
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_API_VERSION` (optional, default: `v23.0`)
- `WHATSAPP_TEMPLATE_NAME` (optional, for template fallback outside 24h)
- `WHATSAPP_TEMPLATE_LANGUAGE` (optional, default: `en_US`)
- `WHATSAPP_TEXT_FALLBACK_TO_TEMPLATE` (optional, default: `true`)

### 2) Enable client forwarding

Set build env values:
- `VITE_WHATSAPP_NOTIFY_ENABLED=true`
- `VITE_WHATSAPP_DEFAULT_COUNTRY_CODE=91` (optional, used when number is 10 digits)
- `VITE_WHATSAPP_NOTIFY_ENDPOINT=/.netlify/functions/whatsapp-send` (optional)

If you do not use `.env` / build env vars, set runtime config in:
- `public/runtime-config.js`
- `window.__A3HUB_WHATSAPP_CONFIG__.enabled = true`
- `window.__A3HUB_WHATSAPP_CONFIG__.defaultCountryCode = "91"` (or your country code)
- `window.__A3HUB_WHATSAPP_CONFIG__.endpoint = "/.netlify/functions/whatsapp-send"`
- `window.__A3HUB_WHATSAPP_CONFIG__.mode = "auto"`
- `window.__A3HUB_WHATSAPP_CONFIG__.templateName = "hello_world"` (or your approved template)
- `window.__A3HUB_WHATSAPP_CONFIG__.templateLanguage = "en_US"`
- `window.__A3HUB_WHATSAPP_CONFIG__.allowTemplateFallback = true`

### 3) Deploy

This repo now includes:
- `netlify/functions/whatsapp-send.cjs`
- `netlify.toml` with functions directory config

So after deploy, app notification creation will also attempt WhatsApp send (non-blocking).

Notes:
- WhatsApp Cloud API enforces conversation/template policies; text sends may fail outside allowed window.
- If WhatsApp send fails, in-app notification still succeeds.
- You can control per-user WhatsApp send using `notificationPreferences.whatsapp` on each `users/{uid}` doc.

## Attendance Email Notification (Present / Absent)

Attendance status updates now trigger email delivery when notifications are created with `channels.email = true`.
This is already wired for:
- Face-marked daily present
- Staff manual present/absent updates per session
- Staff bulk `Select All Present`

### 1) Configure Netlify server function secrets

Set in Netlify Site Settings -> Environment variables:
- `RESEND_API_KEY`
- `EMAIL_FROM` (example: `A3 Hub <no-reply@yourdomain.com>`)
- `RESEND_API_ENDPOINT` (optional, default: `https://api.resend.com/emails`)

### 2) Enable client forwarding

Set build env values:
- `VITE_EMAIL_NOTIFY_ENABLED=true`
- `VITE_EMAIL_NOTIFY_ENDPOINT=/.netlify/functions/email-send` (optional)

If you do not use `.env` / build env vars, set runtime config in:
- `public/runtime-config.js`
- `window.__A3HUB_EMAIL_CONFIG__.enabled = true`
- `window.__A3HUB_EMAIL_CONFIG__.endpoint = "/.netlify/functions/email-send"`

### 3) Deploy

This repo now includes:
- `netlify/functions/email-send.cjs`
- generated browser runtime config in `public/runtime-config.js`

Notes:
- If email send fails, attendance save and in-app notification still succeed.
- You can control per-user email send using `notificationPreferences.email` on each `users/{uid}` doc.
- With Resend test sender (`onboarding@resend.dev`), delivery is limited; use a verified sender domain to deliver to student emails.

## Firebase Push Notification (FCM Web Push)

App notifications can also fan out as browser/mobile push via Firebase Cloud Messaging.

### 1) Firebase setup

In Firebase Console -> Project settings -> Cloud Messaging:
- Create Web Push certificate key pair and copy VAPID public key.
- Copy Legacy server key (for Netlify function `push-send`).

### 2) Netlify server secret

Set in Netlify Environment Variables:
- `FCM_SERVER_KEY`

### 3) Client build config

Set these values in local `.env` or your Netlify environment variables:
- `VITE_PUSH_NOTIFY_ENABLED=true`
- `VITE_PUSH_VAPID_KEY="<YOUR_FIREBASE_VAPID_PUBLIC_KEY>"`
- `VITE_PUSH_NOTIFY_ENDPOINT=/.netlify/functions/push-send` (optional)
- `VITE_PUSH_SW_URL=/firebase-messaging-sw.js` (optional)

If you still prefer runtime config, edit `public/runtime-config.js`:
- `enabled: true`
- `endpoint: "/.netlify/functions/push-send"`
- `swUrl: "/firebase-messaging-sw.js"`

### 4) Deploy and test

- Redeploy Netlify.
- Login as student once and allow browser notification permission.
- This stores `pushToken` / `pushTokens` in `users/{uid}`.
- Any `createUserNotification` / `createBulkUserNotifications` call now sends:
  - In-app inbox notification
  - FCM push notification (if token exists)
