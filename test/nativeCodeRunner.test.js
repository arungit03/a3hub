import assert from "node:assert/strict";
import test from "node:test";
import {
  isProgramOutputMatch,
  normalizeProgramOutput,
  runNativeCode,
} from "../src/lib/nativeCodeRunner.js";

test("normalizeProgramOutput trims line endings and trailing spaces", () => {
  const raw = "hello  \r\nworld\t \r\n";
  const normalized = normalizeProgramOutput(raw);
  assert.equal(normalized, "hello\nworld");
});

test("isProgramOutputMatch ignores trailing whitespace differences", () => {
  assert.equal(isProgramOutputMatch("42 \n", "42"), true);
  assert.equal(isProgramOutputMatch("A\nB", "A\nC"), false);
});

test("runNativeCode sends request and returns normalized payload", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, options) => {
    const parsed = JSON.parse(String(options?.body || "{}"));
    assert.equal(parsed.language, "c");
    assert.equal(parsed.sourceCode.includes("main"), true);
    assert.equal(parsed.stdin, "1 2");

    return {
      ok: true,
      json: async () => ({
        ok: true,
        output: "3\n",
        compileOutput: "",
        runOutput: "3\n",
        runtime: "c@13.2.0",
        exitCode: 0,
        compileCode: 0,
      }),
    };
  };

  try {
    const result = await runNativeCode({
      language: "c",
      sourceCode: "int main() { return 0; }",
      stdin: "1 2",
      timeoutMs: 3000,
    });
    assert.equal(result.output, "3\n");
    assert.equal(result.runtime, "c@13.2.0");
    assert.equal(result.exitCode, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
