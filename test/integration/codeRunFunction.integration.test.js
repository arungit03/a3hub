/* global Buffer, process */
import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const codeRunFunction = require("../../netlify/functions/code-run.cjs");

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
    nonce: `code-run-${mockTokenCounter += 1}`,
  };
  const encodedHeader = Buffer.from(
    JSON.stringify({ alg: "none", typ: "JWT" })
  ).toString("base64url");
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
    "base64url"
  );
  return `${encodedHeader}.${encodedPayload}.sig`;
};

test("code-run handler rejects unauthenticated requests", async () => {
  const originalFetch = globalThis.fetch;
  let calledExternalFetch = false;
  globalThis.fetch = async () => {
    calledExternalFetch = true;
    return jsonResponse(500, {});
  };

  try {
    const result = await codeRunFunction.handler({
      httpMethod: "POST",
      headers: {},
      body: JSON.stringify({
        language: "c",
        sourceCode: "int main(){return 0;}",
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

test("code-run handler executes source for authenticated requests", async () => {
  const previousApiKey = process.env.FIREBASE_WEB_API_KEY;
  process.env.FIREBASE_WEB_API_KEY = "test-firebase-web-key";

  const token = createMockIdToken();
  const originalFetch = globalThis.fetch;
  const seenUrls = [];
  globalThis.fetch = async (url, options = {}) => {
    const resolvedUrl = String(url || "");
    seenUrls.push(resolvedUrl);

    if (resolvedUrl.includes("identitytoolkit.googleapis.com")) {
      const parsedBody = JSON.parse(String(options.body || "{}"));
      assert.equal(parsedBody.idToken, token);
      return jsonResponse(200, {
        users: [
          {
            localId: "uid-code-run",
            email: "staff@example.com",
            emailVerified: true,
            customAttributes: JSON.stringify({ role: "staff" }),
          },
        ],
      });
    }

    if (resolvedUrl.endsWith("/runtimes")) {
      return jsonResponse(200, [
        { language: "c", version: "13.2.0" },
        { language: "cpp", version: "17.0.1" },
      ]);
    }

    if (resolvedUrl.endsWith("/execute")) {
      const parsedBody = JSON.parse(String(options.body || "{}"));
      assert.equal(parsedBody.language, "c");
      assert.equal(parsedBody.files[0].name, "main.c");
      assert.equal(parsedBody.stdin, "2 3");
      return jsonResponse(200, {
        language: "c",
        version: "13.2.0",
        compile: { output: "", code: 0 },
        run: { output: "5\n", stdout: "5\n", stderr: "", code: 0 },
      });
    }

    return jsonResponse(404, { error: "unexpected_url" });
  };

  try {
    const result = await codeRunFunction.handler({
      httpMethod: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "x-nf-client-connection-ip": "10.10.10.10",
      },
      body: JSON.stringify({
        language: "c",
        sourceCode: "#include <stdio.h>\nint main(){int a,b;scanf(\"%d %d\",&a,&b);printf(\"%d\\n\",a+b);}",
        stdin: "2 3",
      }),
    });
    const payload = JSON.parse(result.body || "{}");

    assert.equal(result.statusCode, 200);
    assert.equal(payload.ok, true);
    assert.equal(payload.output, "5\n");
    assert.equal(payload.exitCode, 0);
    assert.ok(
      seenUrls.some((item) => item.includes("identitytoolkit.googleapis.com"))
    );
    assert.ok(seenUrls.some((item) => item.endsWith("/runtimes")));
    assert.ok(seenUrls.some((item) => item.endsWith("/execute")));
  } finally {
    globalThis.fetch = originalFetch;
    if (previousApiKey === undefined) {
      delete process.env.FIREBASE_WEB_API_KEY;
    } else {
      process.env.FIREBASE_WEB_API_KEY = previousApiKey;
    }
    delete process.env.CODE_RUN_RATE_LIMIT_MAX;
    delete process.env.CODE_RUN_RATE_LIMIT_WINDOW_MS;
  }
});

test("code-run handler enforces rate limits", async () => {
  const previousApiKey = process.env.FIREBASE_WEB_API_KEY;
  const previousRateLimitMax = process.env.CODE_RUN_RATE_LIMIT_MAX;
  const previousRateWindow = process.env.CODE_RUN_RATE_LIMIT_WINDOW_MS;

  process.env.FIREBASE_WEB_API_KEY = "test-firebase-web-key";
  process.env.CODE_RUN_RATE_LIMIT_MAX = "1";
  process.env.CODE_RUN_RATE_LIMIT_WINDOW_MS = "60000";

  const token = createMockIdToken();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    const resolvedUrl = String(url || "");

    if (resolvedUrl.includes("identitytoolkit.googleapis.com")) {
      const parsedBody = JSON.parse(String(options.body || "{}"));
      assert.equal(parsedBody.idToken, token);
      return jsonResponse(200, {
        users: [
          {
            localId: "uid-rate-limit",
            email: "student@example.com",
            emailVerified: true,
            customAttributes: JSON.stringify({ role: "student" }),
          },
        ],
      });
    }

    if (resolvedUrl.endsWith("/runtimes")) {
      return jsonResponse(200, [{ language: "c", version: "13.2.0" }]);
    }

    if (resolvedUrl.endsWith("/execute")) {
      return jsonResponse(200, {
        language: "c",
        version: "13.2.0",
        compile: { output: "", code: 0 },
        run: { output: "ok\n", stdout: "ok\n", stderr: "", code: 0 },
      });
    }

    return jsonResponse(404, { error: "unexpected_url" });
  };

  const baseEvent = {
    httpMethod: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "x-nf-client-connection-ip": "11.11.11.11",
    },
    body: JSON.stringify({
      language: "c",
      sourceCode: "int main(){return 0;}",
    }),
  };

  try {
    const first = await codeRunFunction.handler(baseEvent);
    const second = await codeRunFunction.handler(baseEvent);

    assert.equal(first.statusCode, 200);
    assert.equal(second.statusCode, 429);
    const payload = JSON.parse(second.body || "{}");
    assert.equal(payload.code, "rate/limit-exceeded");
  } finally {
    globalThis.fetch = originalFetch;
    if (previousApiKey === undefined) {
      delete process.env.FIREBASE_WEB_API_KEY;
    } else {
      process.env.FIREBASE_WEB_API_KEY = previousApiKey;
    }
    if (previousRateLimitMax === undefined) {
      delete process.env.CODE_RUN_RATE_LIMIT_MAX;
    } else {
      process.env.CODE_RUN_RATE_LIMIT_MAX = previousRateLimitMax;
    }
    if (previousRateWindow === undefined) {
      delete process.env.CODE_RUN_RATE_LIMIT_WINDOW_MS;
    } else {
      process.env.CODE_RUN_RATE_LIMIT_WINDOW_MS = previousRateWindow;
    }
  }
});

test("code-run falls back to webhook provider when piston fails", async () => {
  const previousEnv = {
    FIREBASE_WEB_API_KEY: process.env.FIREBASE_WEB_API_KEY,
    CODE_RUN_PROVIDER_ORDER: process.env.CODE_RUN_PROVIDER_ORDER,
    CODE_RUN_WEBHOOK_URL: process.env.CODE_RUN_WEBHOOK_URL,
    CODE_RUN_WEBHOOK_AUTH_TOKEN: process.env.CODE_RUN_WEBHOOK_AUTH_TOKEN,
  };

  process.env.FIREBASE_WEB_API_KEY = "test-firebase-web-key";
  process.env.CODE_RUN_PROVIDER_ORDER = "piston,webhook";
  process.env.CODE_RUN_WEBHOOK_URL = "https://example.com/code-run-fallback";
  process.env.CODE_RUN_WEBHOOK_AUTH_TOKEN = "code-fallback-token";

  const token = createMockIdToken();
  const originalFetch = globalThis.fetch;
  let webhookCalled = false;
  globalThis.fetch = async (url, options = {}) => {
    const resolvedUrl = String(url || "");

    if (resolvedUrl.includes("identitytoolkit.googleapis.com")) {
      return jsonResponse(200, {
        users: [
          {
            localId: "uid-code-run",
            email: "staff@example.com",
            emailVerified: true,
            customAttributes: JSON.stringify({ role: "staff" }),
          },
        ],
      });
    }

    if (resolvedUrl.endsWith("/runtimes")) {
      return jsonResponse(503, { error: "piston_unavailable" });
    }

    if (resolvedUrl === "https://example.com/code-run-fallback") {
      webhookCalled = true;
      assert.equal(options.headers.authorization, "Bearer code-fallback-token");
      const parsedBody = JSON.parse(String(options.body || "{}"));
      assert.equal(parsedBody.event, "code.run");
      assert.equal(parsedBody.language, "c");
      return jsonResponse(200, {
        language: "c",
        version: "fallback-1",
        runtime: "c@fallback-1",
        output: "fallback_output\n",
        compileOutput: "",
        runOutput: "fallback_output\n",
        stdout: "fallback_output\n",
        stderr: "",
        compileCode: 0,
        exitCode: 0,
      });
    }

    return jsonResponse(404, { error: "unexpected_url" });
  };

  try {
    const result = await codeRunFunction.handler({
      httpMethod: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "x-nf-client-connection-ip": "15.15.15.15",
      },
      body: JSON.stringify({
        language: "c",
        sourceCode: "int main(){return 0;}",
      }),
    });
    const payload = JSON.parse(result.body || "{}");

    assert.equal(result.statusCode, 200);
    assert.equal(payload.ok, true);
    assert.equal(payload.provider, "webhook");
    assert.equal(payload.output, "fallback_output\n");
    assert.equal(webhookCalled, true);
    assert.equal(Array.isArray(payload.providerAttempts), true);
    assert.equal(payload.providerAttempts.length, 2);
  } finally {
    globalThis.fetch = originalFetch;
    Object.entries(previousEnv).forEach(([key, value]) => {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    });
    delete process.env.CODE_RUN_RATE_LIMIT_MAX;
    delete process.env.CODE_RUN_RATE_LIMIT_WINDOW_MS;
  }
});
