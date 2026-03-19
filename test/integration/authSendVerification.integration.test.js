/* global process */
import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { generateKeyPairSync } from "node:crypto";

const require = createRequire(import.meta.url);
const authSendVerificationFunction = require("../../netlify/functions/auth-send-verification.cjs");

const jsonResponse = (status, payload) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => JSON.stringify(payload),
  json: async () => payload,
});

const { privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
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
    if (requestedUrl.includes("accounts:lookup")) {
      const parsedBody = JSON.parse(String(options.body || "{}"));
      assert.equal(parsedBody.idToken, "test-id-token");
      return jsonResponse(200, {
        users: [
          {
            localId: "uid-student",
            email: "student@example.com",
            emailVerified: false,
          },
        ],
      });
    }
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

test("auth-send-verification sends a fresh link through configured email provider", async () => {
  const previousEnv = {
    FIREBASE_WEB_API_KEY: process.env.FIREBASE_WEB_API_KEY,
    FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID,
    FIREBASE_SERVICE_ACCOUNT_JSON: process.env.FIREBASE_SERVICE_ACCOUNT_JSON,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    EMAIL_FROM: process.env.EMAIL_FROM,
  };
  process.env.FIREBASE_WEB_API_KEY = "test-firebase-web-key";
  process.env.FIREBASE_PROJECT_ID = "test-project-id";
  process.env.FIREBASE_SERVICE_ACCOUNT_JSON = JSON.stringify({
    client_email: "service-account@test-project-id.iam.gserviceaccount.com",
    private_key: privateKey.export({ type: "pkcs8", format: "pem" }),
    token_uri: "https://oauth2.googleapis.com/token",
    project_id: "test-project-id",
  });
  process.env.RESEND_API_KEY = "test-resend-key";
  process.env.EMAIL_FROM = "A3 Hub <no-reply@example.com>";

  const originalFetch = globalThis.fetch;
  let oauthCalled = false;
  let customLinkRequested = false;
  let resendCalled = false;

  globalThis.fetch = async (url, options = {}) => {
    const requestedUrl = String(url || "");

    if (requestedUrl.includes("accounts:lookup")) {
      const parsedBody = JSON.parse(String(options.body || "{}"));
      assert.equal(parsedBody.idToken, "test-id-token");
      return jsonResponse(200, {
        users: [
          {
            localId: "uid-student",
            email: "student@example.com",
            emailVerified: false,
          },
        ],
      });
    }

    if (requestedUrl === "https://oauth2.googleapis.com/token") {
      oauthCalled = true;
      const params = new URLSearchParams(String(options.body || ""));
      assert.equal(
        params.get("grant_type"),
        "urn:ietf:params:oauth:grant-type:jwt-bearer"
      );
      assert.ok(params.get("assertion"));
      return jsonResponse(200, {
        access_token: "google-access-token",
      });
    }

    if (
      requestedUrl.includes(
        "identitytoolkit.googleapis.com/v1/projects/test-project-id/accounts:sendOobCode"
      )
    ) {
      customLinkRequested = true;
      const parsedBody = JSON.parse(String(options.body || "{}"));
      assert.equal(options.headers.authorization, "Bearer google-access-token");
      assert.equal(parsedBody.requestType, "VERIFY_EMAIL");
      assert.equal(parsedBody.email, "student@example.com");
      assert.equal(parsedBody.returnOobLink, true);
      assert.equal(parsedBody.continueUrl, "https://example.com/");
      return jsonResponse(200, {
        oobLink: "https://example.com/?mode=verifyEmail&oobCode=fresh-code",
      });
    }

    if (requestedUrl.includes("api.resend.com/emails")) {
      resendCalled = true;
      const parsedBody = JSON.parse(String(options.body || "{}"));
      assert.deepEqual(parsedBody.to, ["student@example.com"]);
      assert.equal(parsedBody.from, "A3 Hub <no-reply@example.com>");
      assert.equal(parsedBody.subject, "Verify your A3 Hub email");
      assert.match(
        parsedBody.html,
        /mode=verifyEmail&amp;oobCode=fresh-code/
      );
      return jsonResponse(200, {
        id: "re_verify_123",
      });
    }

    return jsonResponse(404, { error: "unexpected_url" });
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
    assert.equal(payload.delivery, "custom");
    assert.equal(payload.provider, "resend");
    assert.equal(oauthCalled, true);
    assert.equal(customLinkRequested, true);
    assert.equal(resendCalled, true);
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
  globalThis.fetch = async (url, options = {}) => {
    const requestedUrl = String(url || "");
    if (requestedUrl.includes("accounts:lookup")) {
      const parsedBody = JSON.parse(String(options.body || "{}"));
      assert.equal(parsedBody.idToken, "test-id-token");
      return jsonResponse(200, {
        users: [
          {
            localId: "uid-student",
            email: "student@example.com",
            emailVerified: false,
          },
        ],
      });
    }

    return jsonResponse(400, {
      error: {
        message: "TOO_MANY_ATTEMPTS_TRY_LATER",
      },
    });
  };

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
