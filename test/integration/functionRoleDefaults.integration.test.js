/* global Buffer, process */
import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const emailSendFunction = require("../../netlify/functions/email-send.cjs");
const pushSendFunction = require("../../netlify/functions/push-send.cjs");
const whatsappSendFunction = require("../../netlify/functions/whatsapp-send.cjs");

const jsonResponse = (status, payload) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => JSON.stringify(payload),
  json: async () => payload,
});

const createMockIdToken = ({ expSecondsFromNow = 3600 } = {}) => {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const payload = {
    exp: nowSeconds + expSecondsFromNow,
  };
  const encodedHeader = Buffer.from(
    JSON.stringify({ alg: "none", typ: "JWT" })
  ).toString("base64url");
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
    "base64url"
  );
  return `${encodedHeader}.${encodedPayload}.sig`;
};

const installStudentAuthFetchMock = (token, onUnexpectedProviderCall) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    const resolvedUrl = String(url || "");

    if (resolvedUrl.includes("identitytoolkit.googleapis.com")) {
      const parsedBody = JSON.parse(String(options.body || "{}"));
      assert.equal(parsedBody.idToken, token);
      return jsonResponse(200, {
        users: [
          {
            localId: "uid-student-default-role-check",
            email: "student@example.com",
            emailVerified: true,
            customAttributes: JSON.stringify({ role: "student" }),
          },
        ],
      });
    }

    onUnexpectedProviderCall(resolvedUrl);
    return jsonResponse(500, { error: "unexpected_provider_call" });
  };
  return () => {
    globalThis.fetch = originalFetch;
  };
};

test("email-send enforces secure default roles when env is blank", async () => {
  const previousEnv = {
    FIREBASE_WEB_API_KEY: process.env.FIREBASE_WEB_API_KEY,
    EMAIL_SEND_ALLOWED_ROLES: process.env.EMAIL_SEND_ALLOWED_ROLES,
  };
  process.env.FIREBASE_WEB_API_KEY = "test-firebase-web-key";
  process.env.EMAIL_SEND_ALLOWED_ROLES = "   ";

  const token = createMockIdToken();
  let providerCalled = false;
  const restoreFetch = installStudentAuthFetchMock(token, () => {
    providerCalled = true;
  });

  try {
    const result = await emailSendFunction.handler({
      httpMethod: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "x-nf-client-connection-ip": "21.21.21.21",
      },
      body: JSON.stringify({
        to: "student@example.com",
        subject: "test",
        message: "test",
      }),
    });
    const payload = JSON.parse(result.body || "{}");

    assert.equal(result.statusCode, 403);
    assert.equal(payload.code, "auth/forbidden-role");
    assert.equal(providerCalled, false);
  } finally {
    restoreFetch();
    Object.entries(previousEnv).forEach(([key, value]) => {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    });
  }
});

test("push-send enforces secure default roles when env is unset", async () => {
  const previousEnv = {
    FIREBASE_WEB_API_KEY: process.env.FIREBASE_WEB_API_KEY,
    PUSH_SEND_ALLOWED_ROLES: process.env.PUSH_SEND_ALLOWED_ROLES,
  };
  process.env.FIREBASE_WEB_API_KEY = "test-firebase-web-key";
  delete process.env.PUSH_SEND_ALLOWED_ROLES;

  const token = createMockIdToken();
  let providerCalled = false;
  const restoreFetch = installStudentAuthFetchMock(token, () => {
    providerCalled = true;
  });

  try {
    const result = await pushSendFunction.handler({
      httpMethod: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "x-nf-client-connection-ip": "22.22.22.22",
      },
      body: JSON.stringify({
        tokens: ["token-1"],
        title: "test",
        message: "test",
      }),
    });
    const payload = JSON.parse(result.body || "{}");

    assert.equal(result.statusCode, 403);
    assert.equal(payload.code, "auth/forbidden-role");
    assert.equal(providerCalled, false);
  } finally {
    restoreFetch();
    Object.entries(previousEnv).forEach(([key, value]) => {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    });
  }
});

test("whatsapp-send enforces secure default roles when env is unset", async () => {
  const previousEnv = {
    FIREBASE_WEB_API_KEY: process.env.FIREBASE_WEB_API_KEY,
    WHATSAPP_SEND_ALLOWED_ROLES: process.env.WHATSAPP_SEND_ALLOWED_ROLES,
  };
  process.env.FIREBASE_WEB_API_KEY = "test-firebase-web-key";
  delete process.env.WHATSAPP_SEND_ALLOWED_ROLES;

  const token = createMockIdToken();
  let providerCalled = false;
  const restoreFetch = installStudentAuthFetchMock(token, () => {
    providerCalled = true;
  });

  try {
    const result = await whatsappSendFunction.handler({
      httpMethod: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "x-nf-client-connection-ip": "23.23.23.23",
      },
      body: JSON.stringify({
        to: "+911234567890",
        text: "test",
      }),
    });
    const payload = JSON.parse(result.body || "{}");

    assert.equal(result.statusCode, 403);
    assert.equal(payload.code, "auth/forbidden-role");
    assert.equal(providerCalled, false);
  } finally {
    restoreFetch();
    Object.entries(previousEnv).forEach(([key, value]) => {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    });
  }
});
