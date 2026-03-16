# Gmail Deliverability for Verification and Password Reset Emails

This app sends verification and password-reset emails through Firebase Authentication.
Gmail decides whether mail lands in `Primary` or `Spam`, so app code cannot force inbox placement.

## What you can improve

1. Firebase Console -> `Authentication` -> `Templates`.
2. Set a clear sender name and keep the templates short and transactional.
3. Configure the action URL to your production app domain.
4. If your Firebase project supports custom email sending/domain settings, enable it and add the DNS records shown by Firebase.
5. Add a DMARC record for the sender domain if you use a custom domain.

## User-side rule (one-time)

Ask users to do this once in Gmail:
- Open the verification/reset email in Spam.
- Click `Not spam`.
- Move it to `Primary`.

After this, Gmail usually places future security emails correctly.
