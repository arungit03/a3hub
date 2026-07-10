# A3 Hub 🚀

> An advanced campus operating system for academics, attendance, learning, assignments, AI assistance, notifications, canteen workflows, and administration.

A3 Hub brings student, staff, admin, parent, and canteen experiences into one modern React app. It is built for real campus operations: role-based dashboards, realtime data, file submissions, notification fan-out, AI chat, code-learning tools, and deploy profiles for smaller production surfaces. ✨

---

## 🌟 Platform Highlights

- 🎓 **Student workspace**: attendance, schedules, assignments, marks, events, AI chat, coding tools, learning paths, profile, and notifications.
- 🧑‍🏫 **Staff console**: attendance marking, assignment publishing, parent replies, class workflows, and student progress visibility.
- 🛡️ **Admin command center**: users, staff requests, academics, notices, tests, events, analytics, and operational dashboards.
- 🍽️ **Canteen ordering system**: food ordering inside the main app, plus dedicated canteen dashboard, menu, order, and analytics screens.
- 👨‍👩‍👧 **Parent access**: parent-facing assignment and communication flows.
- 🤖 **AI assistant**: Gemini or OpenAI-backed chat through server functions for safer production usage.
- 💻 **Code learning toolkit**: C/C++/Python tools, HTML editor, quizzes, practice flows, and progress tracking.
- 🔔 **Notification mesh**: in-app notifications with optional Email, WhatsApp, and Web Push delivery.
- 📦 **Portable deployment profiles**: ship only the feature surface needed for academic, learning, operations, lean, or full deployments.

---

## 🧱 Tech Stack

| Layer | Technology |
| --- | --- |
| Frontend | React 19, Vite 7, React Router 7 |
| Styling/UI | Tailwind CSS, custom CSS modules, lucide-react icons |
| Auth | Firebase Authentication |
| Data + Storage | Supabase client, Supabase tables/storage, shared helpers |
| Server Functions | Netlify Functions, Supabase Edge Functions |
| AI | Gemini or OpenAI via server endpoint |
| Testing | Node test runner, integration tests, E2E flow tests |
| Type Safety | Incremental TypeScript checker over JavaScript modules |

---

## 🗺️ Feature Map

### 🎒 Student Experience

- Home dashboard and menu grid
- Attendance viewing and QR-supported flows
- Today schedule, exam schedule, events, and notices
- Assignments download/upload
- Marks and progress tracking
- AI chat at `/student/ai`
- Learning dashboards, quizzes, practice, and code challenges
- C, C++, Python, HTML editor, and A3 CAD tools
- Profile, password change, notifications, and file access

### 🧑‍🏫 Staff Experience

- Staff dashboard and role-protected routes
- Manual and bulk attendance updates
- Assignment/quiz publishing
- Student assignment review
- Parent replies
- Staff AI chat at `/staff/ai`
- Notification creation with optional Email/WhatsApp/Push fan-out

### 🛡️ Admin Experience

- Admin dashboard
- User and staff request management
- Academics, notices, tests, and events management
- Admin analytics and audit-friendly utilities
- Shared access to operational modules

### 🍽️ Canteen Experience

The canteen system is fully integrated into the main A3 Hub app.

- Student/staff/admin ordering through the `Food` page
- Login portal support for `canteen_staff` and `admin`
- Canteen console routes:
  - `/canteen/dashboard`
  - `/canteen/menu`
  - `/canteen/orders`
  - `/canteen/analytics`
- Shared Supabase-backed menu items, orders, roles, and helper APIs

---

## ⚡ Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Then fill in your Firebase and Supabase values.

### 3. Start development

```bash
npm run dev
```

### 4. Build production

```bash
npm run build
```

### 5. Preview production build

```bash
npm run preview
```

---

## 🔐 Environment Variables

Use `.env.example` as the canonical template.

### Required browser build values

```bash
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
VITE_SUPABASE_STORAGE_BUCKET=

VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

### Optional profile and runtime values

```bash
VITE_DEPLOY_PROFILE=full
VITE_PUSH_NOTIFY_ENABLED=false
VITE_PUSH_VAPID_KEY=
VITE_PUSH_SW_URL=/push-sw.js
VITE_EMAIL_NOTIFY_ENABLED=true
VITE_EMAIL_NOTIFY_ENDPOINT=supabase:functions:email-send
```

### Production server-only values

Keep these on Netlify, Supabase Functions, or your backend provider. Never expose service-role keys to the browser. 🔒

```bash
SUPABASE_URL=
SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
FIREBASE_PROJECT_ID=
FIREBASE_SERVICE_ACCOUNT_JSON=
RESEND_API_KEY=
EMAIL_FROM=
GEMINI_API_KEY=
OPENAI_API_KEY=
```

The `firebase-profile` Netlify function is required for Firebase login/signup to
save and load A3 Hub profiles when Supabase row-level security is enabled. Set
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `FIREBASE_PROJECT_ID`, and
`FIREBASE_SERVICE_ACCOUNT_JSON` in Netlify before deploying. For local testing
of this endpoint, run the app through Netlify Dev instead of plain Vite.

---

## 🧩 Deploy Profiles

A3 Hub can build smaller deployments by hiding routes, menu entries, route prefetch, and selected dashboard listeners.

| Profile | Best For |
| --- | --- |
| `full` | Complete campus platform |
| `academic` | Attendance, schedules, assignments, staff/student workflows |
| `learning` | Coding tools, quizzes, AI learning, progress |
| `operations` | Admin, canteen, notifications, campus services |
| `lean` | Lightweight production surface |

Build shortcuts:

```bash
npm run build:academic
npm run build:learning
npm run build:operations
npm run build:lean
```

More details: [`docs/deploy-profiles.md`](docs/deploy-profiles.md)

---

## 🔔 Notification System

A3 Hub creates in-app notifications first, then optionally fans out to external channels.

| Channel | Status | Key Config |
| --- | --- | --- |
| 📬 In-app | Built in | `createUserNotification`, `createBulkUserNotifications` |
| ✉️ Email | Optional | `RESEND_API_KEY`, `EMAIL_FROM`, `VITE_EMAIL_NOTIFY_ENABLED` |
| 💬 WhatsApp | Optional | `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` |
| 📲 Web Push | Optional | `VITE_PUSH_NOTIFY_ENABLED`, `VITE_PUSH_VAPID_KEY` |

Important behavior:

- External delivery is non-blocking.
- If Email, WhatsApp, or Push fails, the in-app notification still succeeds.
- Per-user preferences can control channels through `notificationPreferences`.

Docs:

- [`docs/notifications.md`](docs/notifications.md)
- [`docs/email-deliverability.md`](docs/email-deliverability.md)
- [`docs/service-portability.md`](docs/service-portability.md)

---

## 🤖 AI Chat

AI chat is available at:

- `/student/ai`
- `/staff/ai`

Production AI requests should go through a server-side proxy instead of exposing provider keys in the browser.

Default client endpoint:

```bash
/api/ai-generate
```

Keep the deployed serverless handler and the `public/_redirects` rewrite aligned with that endpoint.

Recommended production setup:

```bash
GEMINI_API_KEY=
# or
OPENAI_API_KEY=

VITE_ALLOW_CLIENT_AI_KEY=false
```

Client-side AI keys are for development only. Production builds are designed to fail if client AI keys are explicitly allowed. 🧠

---

## 📁 Assignment Upload Strategy

Assignment and student answer files use a resilient upload chain:

1. ☁️ Cloudinary, when configured
2. 🗄️ Supabase Storage
3. 🧱 Supabase chunk upload fallback
4. 🧾 Inline data URL fallback for small files up to `700 KB`

Cloudinary values:

```bash
VITE_CLOUDINARY_CLOUD_NAME=
VITE_CLOUDINARY_UPLOAD_PRESET=
```

Main flows:

- Staff: `Menu -> Assignments -> Upload file -> Publish`
- Student: `Menu -> Assignments -> Download -> Upload answer`
- Submission path: `/assignmentSubmissions/{assignmentId}_{studentId}`
- File asset route: `/file-asset/:fileId`

---

## 🧪 Quality Gates

Run focused checks while developing:

```bash
npm run lint
npm run typecheck
npm run test:unit
npm run test:integration
npm run test:e2e
```

Run the complete test stack:

```bash
npm run test:all
```

Coverage for utility-level tests:

```bash
npm run test:coverage
```

Capacity smoke test for high-concurrency planning:

```bash
npm run loadtest:1500
npm run loadtest:1500:ai
```

Capacity docs: [`docs/capacity-controls.md`](docs/capacity-controls.md)

---

## 🧠 Incremental Type Safety

The app is JavaScript-first, with strict static checks added to important modules through TypeScript.

```bash
npm run typecheck
```

Type config:

- `tsconfig.typecheck.json`
- `src/types/runtime-globals.d.ts`

Strategy:

1. Keep strict checks green for selected modules.
2. Add more JavaScript files to `tsconfig.typecheck.json` over time.
3. Use JSDoc types while migrating to `.ts` or `.tsx` only where it clearly helps.

---

## 🗂️ Project Structure

```text
src/
  admin/          Admin dashboards, hooks, and utilities
  canteen/        Canteen console, services, layouts, and components
  components/     Shared app and dashboard components
  config/         Feature flags and profile configuration
  features/       Learning, attendance, editor, menu grid, A3 CAD
  hooks/          Reusable React hooks
  lib/            Data, notifications, AI, storage, QR, coding helpers
  pages/          Student, staff, parent, public, and tool pages
  routes/         Role-aware route trees and route loaders
  state/          Auth and toast state
  types/          Runtime/global declarations

shared/
  supabase/       Shared Supabase clients and domain APIs
  types/          Shared model samples/types
  utils/          Shared validation, formatting, media, canteen helpers

test/
  integration/    Function and cross-module tests
  e2e/            End-to-end flow tests
```

`project_structure.txt` is generated from repository files to avoid documentation drift.

```bash
npm run docs:structure
npm run docs:structure:check
```

---

## 🚀 Deployment Notes

### Netlify

This repo includes:

- `netlify.toml`
- Netlify function directory configuration for server-side integrations
- Browser runtime config generation through `scripts/generate-public-runtime-configs.mjs`

### Supabase

This repo includes:

- `supabase/schema.sql`
- `supabase/config.toml`
- `supabase/functions/email-send/index.ts`

Useful command:

```bash
supabase functions deploy email-send
```

### Runtime config files

Generated public runtime config files live in `public/`, including:

- `gemini-config.js`
- `email-config.js`
- `push-config.js`
- `whatsapp-config.js`
- `cloudinary-config.js`

---

## ⏱️ Auto-Delete Policies

Short-lived operational documents can carry an `expiresAt` timestamp.

Current examples:

- `leaveRequests` are created with a 24-hour expiry.
- Assignments and dashboard items can be filtered against `expiresAt` or `dueAt`.

Recommended production cleanup:

- Add a scheduled backend job or Supabase SQL job that deletes expired rows from `app_documents`.
- Keep client-side filtering in place so stale items do not block the user experience while cleanup runs.

This keeps short-lived operational data clean without depending on manual maintenance. 🧹

---

## 📚 Documentation Index

- [`docs/feature-modules.md`](docs/feature-modules.md) - feature boundaries and onboarding map
- [`docs/deploy-profiles.md`](docs/deploy-profiles.md) - profile-based builds
- [`docs/service-portability.md`](docs/service-portability.md) - provider fallback and failover
- [`docs/capacity-controls.md`](docs/capacity-controls.md) - backpressure, monitoring, load tests
- [`docs/notifications.md`](docs/notifications.md) - notification architecture
- [`docs/email-deliverability.md`](docs/email-deliverability.md) - Gmail inbox placement and sender setup
- [`docs/backend.json`](docs/backend.json) - backend reference data
- [`docs/blueprint.md`](docs/blueprint.md) - original product blueprint

---

## 🛠️ Useful Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start Vite development server |
| `npm run build` | Production build |
| `npm run preview` | Preview production build |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Run incremental TypeScript checks |
| `npm run test:unit` | Run unit tests |
| `npm run test:integration` | Run integration tests |
| `npm run test:e2e` | Run E2E flow tests |
| `npm run test:all` | Run all test layers |
| `npm run docs:structure` | Regenerate project structure doc |
| `npm run docs:structure:check` | Check structure doc drift |
| `npm run loadtest:1500` | Run 1,500-user smoke load test |

---

## 🧭 Production Checklist

- ✅ Firebase Authentication configured
- ✅ Supabase URL, publishable key, schema, and storage bucket configured
- ✅ Service-role keys stored only on server platforms
- ✅ `VITE_ALLOW_CLIENT_AI_KEY=false` for production
- ✅ Email sender domain verified before real student delivery
- ✅ WhatsApp template and Cloud API values configured before template fallback
- ✅ Web Push VAPID key and service worker configured before push rollout
- ✅ Deploy profile selected for the target environment
- ✅ `npm run lint`, `npm run typecheck`, and `npm run test:all` passing before release

---

## 💙 Project Identity

A3 Hub is designed as a practical, campus-first platform: fast enough for daily use, modular enough for different deployments, and resilient enough to keep core workflows working even when optional providers fail.

Build it carefully. Ship it confidently. Keep the campus moving. 🚀
