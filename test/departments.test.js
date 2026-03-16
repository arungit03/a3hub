import test from "node:test";
import assert from "node:assert/strict";
import { departments } from "../src/data/departments.js";

test("departments list has unique non-empty codes", () => {
  assert.ok(Array.isArray(departments), "departments must be an array");
  assert.ok(departments.length > 0, "departments must not be empty");

  const cleaned = departments.map((item) => String(item || "").trim());
  cleaned.forEach((item) => {
    assert.ok(item.length > 0, "department code must not be empty");
    assert.equal(item, item.toUpperCase(), "department code should be uppercase");
  });

  const uniqueCount = new Set(cleaned).size;
  assert.equal(
    uniqueCount,
    cleaned.length,
    "department list should not contain duplicates"
  );
});

test("departments include core campus programs", () => {
  const expected = ["AIDS", "CSE", "ECE", "EEE", "IT"];
  const values = new Set(departments.map((item) => String(item || "").trim()));

  expected.forEach((item) => {
    assert.ok(values.has(item), `expected department not found: ${item}`);
  });
});
