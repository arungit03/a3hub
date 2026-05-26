/* global Buffer, process */
import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { auth, setAuthForTesting } from "../../src/lib/supabase.js";
import { runNativeCode } from "../../src/lib/nativeCodeRunner.js";

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
    nonce: `code-run-e2e-${mockTokenCounter += 1}`,
  };
  const encodedHeader = Buffer.from(
    JSON.stringify({ alg: "none", typ: "JWT" })
  ).toString("base64url");
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
    "base64url"
  );
  return `${encodedHeader}.${encodedPayload}.sig`;
};

test("e2e flow: runNativeCode -> Netlify code-run -> provider mocks", async () => {
  const previousUrl = process.env.SUPABASE_URL;
  const previousKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  const previousAuth = auth;
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_PUBLISHABLE_KEY = "test-supabase-key";

  const token = createMockIdToken();
  setAuthForTesting({
    currentUser: {
      _stopProactiveRefresh: () => {},
      _startProactiveRefresh: () => {},
      getIdToken: async () => token,
    },
  });

  const originalFetch = globalThis.fetch;
  let sawAuthorizationHeader = false;

  globalThis.fetch = async (url, options = {}) => {
    const resolvedUrl = String(url || "");

    if (resolvedUrl === "/.netlify/functions/code-run") {
      const headers = options?.headers || {};
      sawAuthorizationHeader = Boolean(
        headers.Authorization || headers.authorization
      );
      const event = {
        httpMethod: "POST",
        headers: {
          ...headers,
          "x-nf-client-connection-ip": "14.14.14.14",
        },
        body: String(options?.body || ""),
      };
      const lambdaResponse = await codeRunFunction.handler(event);
      const parsedBody = JSON.parse(lambdaResponse.body || "{}");
      return jsonResponse(lambdaResponse.statusCode, parsedBody);
    }

    if (resolvedUrl.includes("/auth/v1/user")) {
      return jsonResponse(200, {
        id: "uid-e2e",
        email: "staff@example.com",
        email_confirmed_at: new Date().toISOString(),
        user_metadata: { role: "staff" },
      });
    }

    if (resolvedUrl.includes("/rest/v1/app_documents")) {
      return jsonResponse(200, [{ data: { role: "staff", status: "active" } }]);
    }

    if (resolvedUrl.endsWith("/runtimes")) {
      return jsonResponse(200, [{ language: "c", version: "13.2.0" }]);
    }

    if (resolvedUrl.endsWith("/execute")) {
      const parsed = JSON.parse(String(options?.body || "{}"));
      assert.equal(parsed.language, "c");
      return jsonResponse(200, {
        language: "c",
        version: "13.2.0",
        compile: { output: "", code: 0 },
        run: { output: "9\n", stdout: "9\n", stderr: "", code: 0 },
      });
    }

    return jsonResponse(404, { error: "unexpected_url" });
  };

  try {
    const result = await runNativeCode({
      language: "c",
      sourceCode:
        "#include <stdio.h>\nint main(){int a=4,b=5;printf(\"%d\\n\",a+b);return 0;}",
      stdin: "",
      endpoint: "/.netlify/functions/code-run",
    });

    assert.equal(result.output, "9\n");
    assert.equal(result.exitCode, 0);
    assert.equal(sawAuthorizationHeader, true);
  } finally {
    globalThis.fetch = originalFetch;
    setAuthForTesting(previousAuth);
    if (previousUrl === undefined) {
      delete process.env.SUPABASE_URL;
    } else {
      process.env.SUPABASE_URL = previousUrl;
    }
    if (previousKey === undefined) {
      delete process.env.SUPABASE_PUBLISHABLE_KEY;
    } else {
      process.env.SUPABASE_PUBLISHABLE_KEY = previousKey;
    }
    delete process.env.CODE_RUN_RATE_LIMIT_MAX;
    delete process.env.CODE_RUN_RATE_LIMIT_WINDOW_MS;
  }
});

