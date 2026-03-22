# Deploy Profiles

This project can now run in smaller deployment profiles so every environment does not have to ship the full attendance + AI + compilers + notifications + admin + CAD surface area.

Implementation sources:
- `src/config/features.js`
- `src/routes/*`
- `src/data/menuItems.js`
- `src/lib/routePrefetch.js`

## Profiles

- `full`
  - Every feature is enabled.
- `academic`
  - `attendance, assignments, books, marks, exams, tests, leave, notifications`
- `learning`
  - `books, tests, todo, ai-chat, compilers, a3cad`
- `operations`
  - `attendance, assignments, leave, notifications, admin`
- `lean`
  - `attendance, assignments, books, marks, exams, leave`

## Environment Variable

Use:

- `VITE_DEPLOY_PROFILE=academic`

Optional overrides still work:

- `VITE_FEATURES_ONLY=attendance,assignments`
- `VITE_FEATURES_DISABLED=notifications`

Precedence:

1. `VITE_FEATURES_ONLY` overrides the profile and enables only listed features.
2. `VITE_FEATURES_DISABLED` removes features from the active profile.
3. If neither override is set, the selected profile controls the scope.

## Local Build Shortcuts

- `npm run build:academic`
- `npm run build:learning`
- `npm run build:operations`
- `npm run build:lean`

## Runtime Override

Without rebuilding, you can override the browser runtime:

```js
window.__A3HUB_FEATURE_FLAGS__ = {
  profile: "academic",
  disabled: "notifications",
};
```

## What Gets Reduced

When a feature is disabled, the app now hides or skips:

- guarded routes
- matching menu items
- sidebar and bottom-nav entries
- route prefetch for disabled modules
- selected home dashboard subscriptions and cards

This helps reduce deploy complexity, background Firestore listeners, and accidental exposure of modules that are out of scope for a given environment.
