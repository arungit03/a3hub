# Feature Modules and Isolation

This project includes multiple product areas in one codebase. To reduce onboarding/debugging friction, core scope-heavy areas are now isolated as feature modules with route/UI gating.

## Feature Keys

- `attendance`
- `ai-chat`
- `compilers`
- `notifications`
- `admin`

Implementation source:
- `src/config/features.js`

## What Gets Gated

- `attendance`:
  - Student/staff/parent attendance routes
  - Attendance quick navigation entries
- `ai-chat`:
  - Student/staff AI chat routes
  - AI-related menu/sidebar entries
- `compilers`:
  - Student/staff code lab + compilers/interpreter routes
  - Coding quick navigation entries
- `notifications`:
  - Navbar notification center trigger
- `admin`:
  - `/admin/*` route tree

## Isolation Workflow

Use either variable in your environment (for local use `.env.local`):

- `VITE_FEATURES_ONLY=attendance`
- `VITE_FEATURES_DISABLED=ai-chat,compilers`

Rules:

- If `VITE_FEATURES_ONLY` is set, only listed features are enabled.
- If `VITE_FEATURES_ONLY` is empty, all features are enabled except those in `VITE_FEATURES_DISABLED`.

Optional runtime override (without rebuild):

- `window.__A3HUB_FEATURE_FLAGS__ = { only: \"attendance\", disabled: \"\" }`
- `window.__A3HUB_FEATURE_FLAGS__ = { disabled: \"ai-chat,compilers\" }`

## Debugging Pattern

1. Reproduce issue with all features enabled.
2. Disable unrelated features using `VITE_FEATURES_DISABLED`.
3. Re-test with narrowed scope.
4. Re-enable one feature at a time until issue returns.
5. Trace only matching route/module chain.
