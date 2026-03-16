import assert from "node:assert/strict";
import test from "node:test";
import {
  getDateKey,
  getPreviousDateKey,
  markChallengeSolvedState,
  sanitizeChallengeProgress,
} from "../src/lib/codeChallengeProgress.js";

test("getDateKey and getPreviousDateKey provide stable day keys", () => {
  const day = getDateKey(new Date("2026-03-01T10:00:00Z"));
  assert.equal(day, "2026-03-01");
  assert.equal(getPreviousDateKey(day), "2026-02-28");
});

test("markChallengeSolvedState adds solved id and updates totals once", () => {
  const first = markChallengeSolvedState({
    progress: {},
    challengeId: "c-1",
    solvedAtDayKey: "2026-03-01",
  });
  assert.deepEqual(first.solvedIds, ["c-1"]);
  assert.equal(first.totalSolved, 1);
  assert.equal(first.dailyStreak, 1);
  assert.equal(first.bestStreak, 1);
  assert.equal(first.daysParticipated, 1);

  const duplicate = markChallengeSolvedState({
    progress: first,
    challengeId: "c-1",
    solvedAtDayKey: "2026-03-01",
  });
  assert.equal(duplicate.totalSolved, 1);
  assert.deepEqual(duplicate.solvedIds, ["c-1"]);
});

test("markChallengeSolvedState increases streak on consecutive days", () => {
  const dayOne = sanitizeChallengeProgress({
    solvedIds: ["x"],
    totalSolved: 1,
    daysParticipated: 1,
    dailyStreak: 1,
    bestStreak: 1,
    lastSolvedDayKey: "2026-03-01",
  });

  const dayTwo = markChallengeSolvedState({
    progress: dayOne,
    challengeId: "y",
    solvedAtDayKey: "2026-03-02",
  });

  assert.equal(dayTwo.dailyStreak, 2);
  assert.equal(dayTwo.bestStreak, 2);
  assert.equal(dayTwo.daysParticipated, 2);
});
