import assert from "node:assert/strict";
import test from "node:test";
import {
  buildFaceRegistrationProfile,
  getRequiredFaceConfirmationCount,
  rankStudentFaceMatches,
  resolveReliableFaceMatches,
} from "../src/features/attendance/attendanceUtils.js";

const buildUnitVector = (index, length = 64) =>
  Array.from({ length }, (_, position) => (position === index ? 1 : 0));

const buildBlendVector = (leftIndex, rightIndex, leftWeight, rightWeight) => {
  const vector = new Array(64).fill(0);
  vector[leftIndex] = leftWeight;
  vector[rightIndex] = rightWeight;
  return vector;
};

const buildProfile = (id, vector) => ({
  student: { id, name: id },
  templates: [vector],
  templateCount: 1,
});

test("rankStudentFaceMatches returns the best match first", () => {
  const profiles = [
    buildProfile("alice", buildUnitVector(0)),
    buildProfile("bob", buildUnitVector(1)),
  ];

  const ranked = rankStudentFaceMatches(buildUnitVector(0), profiles);

  assert.equal(ranked[0]?.student?.id, "alice");
  assert.ok(ranked[0]?.similarity > ranked[1]?.similarity);
});

test("resolveReliableFaceMatches accepts unique students from one frame", () => {
  const profiles = [
    buildProfile("alice", buildUnitVector(0)),
    buildProfile("bob", buildUnitVector(1)),
  ];

  const result = resolveReliableFaceMatches(
    [{ vector: buildUnitVector(0) }, { vector: buildUnitVector(1) }],
    profiles
  );

  assert.deepEqual(
    result.accepted.map((item) => item.student.id).sort(),
    ["alice", "bob"]
  );
  assert.equal(result.rejected.length, 0);
});

test("resolveReliableFaceMatches rejects ambiguous detections", () => {
  const profiles = [
    buildProfile("alice", buildUnitVector(0)),
    buildProfile("bob", buildUnitVector(1)),
  ];

  const result = resolveReliableFaceMatches(
    [{ vector: buildBlendVector(0, 1, 0.85, 0.8) }],
    profiles,
    {
      threshold: 0.5,
      minMargin: 0.05,
    }
  );

  assert.equal(result.accepted.length, 0);
  assert.equal(result.rejected[0]?.status, "ambiguous");
});

test("resolveReliableFaceMatches keeps only the strongest detection per student", () => {
  const profiles = [
    buildProfile("alice", buildUnitVector(0)),
    buildProfile("bob", buildUnitVector(1)),
  ];

  const result = resolveReliableFaceMatches(
    [
      { vector: buildUnitVector(0) },
      { vector: buildBlendVector(0, 2, 1, 0.1) },
      { vector: buildUnitVector(1) },
    ],
    profiles
  );

  assert.deepEqual(
    result.accepted.map((item) => item.student.id).sort(),
    ["alice", "bob"]
  );
  assert.ok(result.rejected.some((item) => item.status === "duplicate_student"));
});

test("buildFaceRegistrationProfile summarizes multiple consistent samples", () => {
  const profile = buildFaceRegistrationProfile([
    buildUnitVector(0),
    buildBlendVector(0, 1, 1, 0.05),
    buildBlendVector(0, 2, 1, 0.04),
  ]);

  assert.equal(profile.sampleCount, 3);
  assert.equal(profile.sampleVectors.length, 3);
  assert.equal(profile.vectorLength, 64);
  assert.ok(profile.sampleConsistency > 0.99);
  assert.ok(profile.sampleMinSimilarity > 0.99);
});

test("buildFaceRegistrationProfile removes duplicate samples", () => {
  const vector = buildUnitVector(0);
  const profile = buildFaceRegistrationProfile([
    vector,
    [...vector],
    buildUnitVector(1),
  ]);

  assert.equal(profile.sampleCount, 2);
  assert.equal(profile.sampleVectors.length, 2);
});

test("getRequiredFaceConfirmationCount fast-tracks strong matches", () => {
  assert.equal(getRequiredFaceConfirmationCount(0.9), 1);
  assert.equal(getRequiredFaceConfirmationCount(0.8), 2);
});
