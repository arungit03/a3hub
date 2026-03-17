/* global process */
import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const authSendVerificationFunction = require("../../netlify/functions/auth-send-verification.cjs");

const jsonResponse = (status, payload) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => JSON.stringify(payload),
  json: async () => payload,
});

test("auth-send-verification sends verify-email request to Firebase", async () => {
  const previousEnv = {
    FIREBASE_WEB_API_KEY: process.env.FIREBASE_WEB_API_KEY,
  };
  process.env.FIREBASE_WEB_API_KEY = "test-firebase-web-key";

  const originalFetch = globalThis.fetch;
  let requestedUrl = "";
  globalThis.fetch = async (url, options = {}) => {
    requestedUrl = String(url || "");
    const parsedBody = JSON.parse(String(options.body || "{}"));
    assert.equal(parsedBody.requestType, "VERIFY_EMAIL");
    assert.equal(parsedBody.idToken, "test-id-token");
    assert.equal(parsedBody.continueUrl, "https://example.com/");
    return jsonResponse(200, {
      email: "student@example.com",
    });
  };

  try {
    const result = await authSendVerificationFunction.handler({
      httpMethod: "POST",
      body: JSON.stringify({
        idToken: "test-id-token",
        continueUrl: "https://example.com/",
      }),
    });
    const payload = JSON.parse(result.body || "{}");

    assert.equal(result.statusCode, 200);
    assert.equal(payload.ok, true);
    assert.equal(payload.email, "student@example.com");
    assert.match(
      requestedUrl,
      /identitytoolkit\.googleapis\.com\/v1\/accounts:sendOobCode\?key=test-firebase-web-key/
    );
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

test("auth-send-verification maps Firebase rate-limit errors", async () => {
  const previousEnv = {
    FIREBASE_WEB_API_KEY: process.env.FIREBASE_WEB_API_KEY,
  };
  process.env.FIREBASE_WEB_API_KEY = "test-firebase-web-key";

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    jsonResponse(400, {
      error: {
        message: "TOO_MANY_ATTEMPTS_TRY_LATER",
      },
    });

  try {
    const result = await authSendVerificationFunction.handler({
      httpMethod: "POST",
      body: JSON.stringify({
        idToken: "test-id-token",
      }),
    });
    const payload = JSON.parse(result.body || "{}");

    assert.equal(result.statusCode, 429);
    assert.equal(payload.code, "auth/too-many-requests");
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
