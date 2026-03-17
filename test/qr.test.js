import assert from "node:assert/strict";
import test from "node:test";
import {
  collectIdentifierTokens,
  extractNumericQrValue,
} from "../src/lib/qr.js";

test("extractNumericQrValue pulls a safe integer out of mixed QR strings", () => {
  assert.equal(extractNumericQrValue("Student ID: 2026-0042"), 20260042);
  assert.equal(extractNumericQrValue("no digits here"), null);
  assert.equal(extractNumericQrValue(""), null);
});

test("collectIdentifierTokens keeps unique raw and numeric tokens", () => {
  const tokens = collectIdentifierTokens(" ID-42 ", 42, "A/42", null, undefined);

  assert.deepEqual(tokens, ["ID-42", "42", "A/42"]);
});
