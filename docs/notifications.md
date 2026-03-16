# Notifications Build Notes

## Implemented (Phase 1)
- In-app notification inbox is live in `AppShell` via `src/components/NotificationCenter.jsx`.
- Notifications are created for:
  - Leave decision updates
  - New notices
  - Exam schedule additions
  - Fee due alerts
- Notification records are stored under:
  - `/users/{userId}/notifications/{notificationId}`

## Delivery Model
Each notification stores channel intent and delivery state:
- `channels.inApp`, `channels.email`, `channels.whatsapp`, `channels.push`
- `delivery.inApp`, `delivery.email`, `delivery.whatsapp`, `delivery.push`

Current behavior:
- In-app: marked as `sent` immediately.
- Email/WhatsApp/Push: client orchestration with retries, per-recipient logs, and
  summary reporting from `createUserNotification` / `createBulkUserNotifications`.

Delivery control options:
- `deliveryMode: "await"` (default): waits for channel delivery summaries and returns results.
- `deliveryMode: "background"`: dispatches in background and returns immediately.
- `failOnDeliveryFailure: true`: throws after dispatch if any channel failures are detected.

Recommended delivery state progression:
- `pending` -> `sent`
- `pending` -> `failed` (with retry counter + error field)
