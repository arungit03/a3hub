/* global Buffer, process */
import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const emailSendFunction = require("../../netlify/functions/email-send.cjs");

const jsonResponse = (status, payload) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => JSON.stringify(payload),
  json: async () => payload,
});

let mockTokenCounter = 0;

const createMockIdToken = ({ expSecondsFromNow = 3600 } = {}) => {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const payload = {
    iat: nowSeconds,
    exp: nowSeconds + expSecondsFromNow,
    nonce: `notification-${mockTokenCounter += 1}`,
  };
  const encodedHeader = Buffer.from(
    JSON.stringify({ alg: "none", typ: "JWT" })
  ).toString("base64url");
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
    "base64url"
  );
  return `${encodedHeader}.${encodedPayload}.sig`;
};

test("email-send handler sends via provider for authenticated requests", async () => {
  const previousEnv = {
    FIREBASE_WEB_API_KEY: process.env.FIREBASE_WEB_API_KEY,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    EMAIL_FROM: process.env.EMAIL_FROM,
    EMAIL_SEND_ALLOWED_ROLES: process.env.EMAIL_SEND_ALLOWED_ROLES,
  };

  process.env.FIREBASE_WEB_API_KEY = "test-firebase-web-key";
  process.env.RESEND_API_KEY = "test-resend-key";
  process.env.EMAIL_FROM = "A3 Hub <no-reply@example.com>";
  process.env.EMAIL_SEND_ALLOWED_ROLES = "staff,admin";

  const token = createMockIdToken();
  const originalFetch = globalThis.fetch;
  let providerCalled = false;
  globalThis.fetch = async (url, options = {}) => {
    const resolvedUrl = String(url || "");

    if (resolvedUrl.includes("identitytoolkit.googleapis.com")) {
      const parsedBody = JSON.parse(String(options.body || "{}"));
      assert.equal(parsedBody.idToken, token);
      return jsonResponse(200, {
        users: [
          {
            localId: "uid-staff-user",
            email: "staff@example.com",
            emailVerified: true,
            customAttributes: JSON.stringify({ role: "staff" }),
          },
        ],
      });
    }

    if (resolvedUrl.includes("api.resend.com/emails")) {
      providerCalled = true;
      const parsedBody = JSON.parse(String(options.body || "{}"));
      assert.deepEqual(parsedBody.to, ["student@example.com"]);
      assert.equal(parsedBody.subject, "Attendance update");
      assert.equal(parsedBody.from, "A3 Hub <no-reply@example.com>");
      return jsonResponse(200, {
        id: "re_test_123",
      });
    }

    return jsonResponse(404, { error: "unexpected_url" });
  };

  try {
    const result = await emailSendFunction.handler({
      httpMethod: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "x-nf-client-connection-ip": "12.12.12.12",
      },
      body: JSON.stringify({
        to: "student@example.com",
        subject: "Attendance update",
        message: "Your attendance is marked present.",
      }),
    });
    const payload = JSON.parse(result.body || "{}");

    assert.equal(result.statusCode, 200);
    assert.equal(payload.ok, true);
    assert.equal(payload.provider, "resend");
    assert.equal(payload.id, "re_test_123");
    assert.equal(providerCalled, true);
  } finally {
    globalThis.fetch = originalFetch;
    Object.entries(previousEnv).forEach(([key, value]) => {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    });
  }
});

test("email-send handler blocks unauthorized roles before provider call", async () => {
  const previousEnv = {
    FIREBASE_WEB_API_KEY: process.env.FIREBASE_WEB_API_KEY,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    EMAIL_FROM: process.env.EMAIL_FROM,
    EMAIL_SEND_ALLOWED_ROLES: process.env.EMAIL_SEND_ALLOWED_ROLES,
  };

  process.env.FIREBASE_WEB_API_KEY = "test-firebase-web-key";
  process.env.RESEND_API_KEY = "test-resend-key";
  process.env.EMAIL_FROM = "A3 Hub <no-reply@example.com>";
  process.env.EMAIL_SEND_ALLOWED_ROLES = "admin";

  const token = createMockIdToken();
  const originalFetch = globalThis.fetch;
  let providerCalled = false;
  globalThis.fetch = async (url, options = {}) => {
    const resolvedUrl = String(url || "");

    if (resolvedUrl.includes("identitytoolkit.googleapis.com")) {
      const parsedBody = JSON.parse(String(options.body || "{}"));
      assert.equal(parsedBody.idToken, token);
      return jsonResponse(200, {
        users: [
          {
            localId: "uid-staff-user",
            email: "staff@example.com",
            emailVerified: true,
            customAttributes: JSON.stringify({ role: "staff" }),
          },
        ],
      });
    }

    if (resolvedUrl.includes("api.resend.com/emails")) {
      providerCalled = true;
      return jsonResponse(200, { id: "should_not_be_called" });
    }

    return jsonResponse(404, { error: "unexpected_url" });
  };

  try {
    const result = await emailSendFunction.handler({
      httpMethod: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "x-nf-client-connection-ip": "13.13.13.13",
      },
      body: JSON.stringify({
        to: "student@example.com",
        subject: "Attendance update",
        message: "Your attendance is marked present.",
      }),
    });
    const payload = JSON.parse(result.body || "{}");

    assert.equal(result.statusCode, 403);
    assert.equal(payload.code, "auth/forbidden-role");
    assert.equal(providerCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
    Object.entries(previousEnv).forEach(([key, value]) => {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    });
  }
});

test("email-send falls back to webhook when primary provider fails", async () => {
  const previousEnv = {
    FIREBASE_WEB_API_KEY: process.env.FIREBASE_WEB_API_KEY,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    EMAIL_FROM: process.env.EMAIL_FROM,
    EMAIL_SEND_ALLOWED_ROLES: process.env.EMAIL_SEND_ALLOWED_ROLES,
    EMAIL_PROVIDER_ORDER: process.env.EMAIL_PROVIDER_ORDER,
    EMAIL_WEBHOOK_URL: process.env.EMAIL_WEBHOOK_URL,
    EMAIL_WEBHOOK_AUTH_TOKEN: process.env.EMAIL_WEBHOOK_AUTH_TOKEN,
  };

  process.env.FIREBASE_WEB_API_KEY = "test-firebase-web-key";
  process.env.RESEND_API_KEY = "test-resend-key";
  process.env.EMAIL_FROM = "A3 Hub <no-reply@example.com>";
  process.env.EMAIL_SEND_ALLOWED_ROLES = "staff,admin";
  process.env.EMAIL_PROVIDER_ORDER = "resend,webhook";
  process.env.EMAIL_WEBHOOK_URL = "https://example.com/email-fallback";
  process.env.EMAIL_WEBHOOK_AUTH_TOKEN = "fallback-token";

  const token = createMockIdToken();
  const originalFetch = globalThis.fetch;
  let resendCalled = false;
  let webhookCalled = false;
  globalThis.fetch = async (url, options = {}) => {
    const resolvedUrl = String(url || "");

    if (resolvedUrl.includes("identitytoolkit.googleapis.com")) {
      return jsonResponse(200, {
        users: [
          {
            localId: "uid-staff-user",
            email: "staff@example.com",
            emailVerified: true,
            customAttributes: JSON.stringify({ role: "staff" }),
          },
        ],
      });
    }

    if (resolvedUrl.includes("api.resend.com/emails")) {
      resendCalled = true;
      return jsonResponse(503, { error: "provider_unavailable" });
    }

    if (resolvedUrl === "https://example.com/email-fallback") {
      webhookCalled = true;
      assert.equal(options.headers.authorization, "Bearer fallback-token");
      const parsedBody = JSON.parse(String(options.body || "{}"));
      assert.equal(parsedBody.event, "notification.email");
      assert.deepEqual(parsedBody.to, ["student@example.com"]);
      return jsonResponse(200, { accepted: true, messageId: "fallback-1" });
    }

    return jsonResponse(404, { error: "unexpected_url" });
  };

  try {
    const result = await emailSendFunction.handler({
      httpMethod: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "x-nf-client-connection-ip": "14.14.14.14",
      },
      body: JSON.stringify({
        to: "student@example.com",
        subject: "Attendance update",
        message: "Your attendance is marked present.",
      }),
    });
    const payload = JSON.parse(result.body || "{}");

    assert.equal(result.statusCode, 200);
    assert.equal(payload.ok, true);
    assert.equal(payload.provider, "webhook");
    assert.equal(resendCalled, true);
    assert.equal(webhookCalled, true);
    assert.equal(Array.isArray(payload.attempts), true);
    assert.equal(payload.attempts.length, 2);
  } finally {
    globalThis.fetch = originalFetch;
    Object.entries(previousEnv).forEach(([key, value]) => {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    });
  }
});
