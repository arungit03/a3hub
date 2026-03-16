/* global Buffer, process */
import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const aiGenerateFunction = require("../../netlify/functions/ai-generate.cjs");

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

test("ai-generate handler rejects unauthenticated requests", async () => {
  const originalFetch = globalThis.fetch;
  let calledExternalFetch = false;
  globalThis.fetch = async () => {
    calledExternalFetch = true;
    return jsonResponse(500, {});
  };

  try {
    const result = await aiGenerateFunction.handler({
      httpMethod: "POST",
      headers: {},
      body: JSON.stringify({
        action: "chat",
        payload: {
          messages: [{ role: "user", text: "Hello" }],
        },
      }),
    });
    const payload = JSON.parse(result.body || "{}");

    assert.equal(result.statusCode, 401);
    assert.equal(payload.code, "auth/missing-token");
    assert.equal(calledExternalFetch, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("ai-generate handler serves authenticated chat requests", async () => {
  const previousEnv = {
    FIREBASE_WEB_API_KEY: process.env.FIREBASE_WEB_API_KEY,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    AI_PROVIDER: process.env.AI_PROVIDER,
    AI_GENERATE_ALLOWED_ROLES: process.env.AI_GENERATE_ALLOWED_ROLES,
  };

  process.env.FIREBASE_WEB_API_KEY = "test-firebase-web-key";
  process.env.GEMINI_API_KEY = "test-gemini-server-key";
  delete process.env.OPENAI_API_KEY;
  process.env.AI_PROVIDER = "gemini";
  process.env.AI_GENERATE_ALLOWED_ROLES = "student,staff,parent,admin";

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
            localId: "uid-ai-student",
            email: "student@example.com",
            emailVerified: true,
            customAttributes: JSON.stringify({ role: "student" }),
          },
        ],
      });
    }

    if (resolvedUrl.includes("generativelanguage.googleapis.com")) {
      providerCalled = true;
      const parsedBody = JSON.parse(String(options.body || "{}"));
      assert.equal(Array.isArray(parsedBody.contents), true);
      return jsonResponse(200, {
        candidates: [
          {
            content: {
              parts: [{ text: "Hello from AI" }],
            },
          },
        ],
      });
    }

    return jsonResponse(404, { error: "unexpected_url" });
  };

  try {
    const result = await aiGenerateFunction.handler({
      httpMethod: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "x-nf-client-connection-ip": "16.16.16.16",
      },
      body: JSON.stringify({
        action: "chat",
        payload: {
          messages: [{ role: "user", text: "Say hello" }],
        },
      }),
    });
    const payload = JSON.parse(result.body || "{}");

    assert.equal(result.statusCode, 200);
    assert.equal(payload.ok, true);
    assert.equal(payload.text, "Hello from AI");
    assert.equal(payload.provider, "gemini");
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
    delete process.env.AI_GENERATE_RATE_LIMIT_MAX;
    delete process.env.AI_GENERATE_RATE_LIMIT_WINDOW_MS;
  }
});
