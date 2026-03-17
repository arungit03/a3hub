import assert from "node:assert/strict";
import test from "node:test";
import {
  getScheduleEntryDateKey,
  normalizeDateKey,
  resolveScheduleEntryDateKey,
  toDateKey,
} from "../src/lib/scheduleDate.js";

test("normalizeDateKey supports ymd, dmy, iso and Firestore-style date objects", () => {
  assert.equal(normalizeDateKey("2026-03-17"), "2026-03-17");
  assert.equal(normalizeDateKey("17/03/2026"), "2026-03-17");
  assert.equal(normalizeDateKey("2026-03-17T09:30:00.000Z"), "2026-03-17");
  assert.equal(
    normalizeDateKey({
      toDate() {
        return new Date("2026-03-17T00:00:00.000Z");
      },
    }),
    "2026-03-17"
  );
  assert.equal(normalizeDateKey("31/02/2026"), "");
});

test("getScheduleEntryDateKey prefers explicit schedule fields", () => {
  assert.equal(
    getScheduleEntryDateKey({
      scheduleDate: "2026/03/17",
      createdAt: "2026-03-01T12:00:00.000Z",
    }),
    "2026-03-17"
  );
});

test("resolveScheduleEntryDateKey falls back to timestamps when explicit fields are missing", () => {
  assert.equal(
    resolveScheduleEntryDateKey({
      createdAt: "2026-03-15T12:00:00.000Z",
    }),
    "2026-03-15"
  );
  assert.equal(toDateKey(new Date("2026-03-17T00:00:00.000Z")), "2026-03-17");
});
