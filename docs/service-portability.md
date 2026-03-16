# Service Portability and Failover

This project integrates external providers (Firebase, Netlify Functions, Cloudinary, Piston, Resend, WhatsApp, FCM). To reduce outage impact and vendor lock-in, notification and code-execution functions now support ordered provider fallback.

## Provider Chain Strategy

Each Netlify function can try multiple providers in sequence:

- First provider: primary vendor
- Next providers: fallback(s), including generic webhook targets

If a provider fails, the function automatically tries the next configured provider.

## Email Send Function

Function: `netlify/functions/email-send.cjs`

Env variables:

- `EMAIL_PROVIDER_ORDER` (default: `resend,webhook`)
- `RESEND_API_KEY`
- `EMAIL_FROM`
- `EMAIL_WEBHOOK_URL` (or `EMAIL_FALLBACK_WEBHOOK_URL`)
- `EMAIL_WEBHOOK_AUTH_TOKEN` (optional)

## WhatsApp Send Function

Function: `netlify/functions/whatsapp-send.cjs`

Env variables:

- `WHATSAPP_PROVIDER_ORDER` (default: `meta,webhook`)
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_WEBHOOK_URL` (or `WHATSAPP_FALLBACK_WEBHOOK_URL`)
- `WHATSAPP_WEBHOOK_AUTH_TOKEN` (optional)

## Push Send Function

Function: `netlify/functions/push-send.cjs`

Env variables:

- `PUSH_PROVIDER_ORDER` (default: `fcm,webhook`)
- `FCM_SERVER_KEY`
- `PUSH_WEBHOOK_URL` (or `PUSH_FALLBACK_WEBHOOK_URL`)
- `PUSH_WEBHOOK_AUTH_TOKEN` (optional)

## Code Run Function

Function: `netlify/functions/code-run.cjs`

Env variables:

- `CODE_RUN_PROVIDER_ORDER` (default: `piston,webhook`)
- `PISTON_API_BASE_URL`
- `CODE_RUN_WEBHOOK_URL` (or `CODE_RUN_FALLBACK_WEBHOOK_URL`)
- `CODE_RUN_WEBHOOK_AUTH_TOKEN` (optional)

## Generic Webhook Contract

Webhook providers receive JSON payloads with:

- `event` (e.g., `notification.email`, `notification.push`, `code.run`)
- `providerHint` (`custom`)
- Request-specific fields (recipient, tokens, code input, etc.)

Webhook providers should return `2xx` on success and JSON response body.

## Migration Pattern

1. Keep current primary vendor as first provider.
2. Add new provider behind webhook fallback.
3. Validate fallback in staging by forcing primary failure.
4. Swap order in `*_PROVIDER_ORDER` to promote new provider.
5. Remove old provider when stable.
