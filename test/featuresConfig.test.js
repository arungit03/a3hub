/* global process */
import assert from "node:assert/strict";
import test from "node:test";
import {
  FEATURE_KEYS,
  getFeatureToggleConfig,
  isFeatureEnabled,
} from "../src/config/features.js";

const withFeatureEnv = async ({ only, disabled }, run) => {
  const previousOnly = process.env.VITE_FEATURES_ONLY;
  const previousDisabled = process.env.VITE_FEATURES_DISABLED;

  if (only === undefined) {
    delete process.env.VITE_FEATURES_ONLY;
  } else {
    process.env.VITE_FEATURES_ONLY = String(only);
  }

  if (disabled === undefined) {
    delete process.env.VITE_FEATURES_DISABLED;
  } else {
    process.env.VITE_FEATURES_DISABLED = String(disabled);
  }

  try {
    await run();
  } finally {
    if (previousOnly === undefined) {
      delete process.env.VITE_FEATURES_ONLY;
    } else {
      process.env.VITE_FEATURES_ONLY = previousOnly;
    }
    if (previousDisabled === undefined) {
      delete process.env.VITE_FEATURES_DISABLED;
    } else {
      process.env.VITE_FEATURES_DISABLED = previousDisabled;
    }
  }
};

test("feature toggles default to enabled", async () => {
  await withFeatureEnv({ only: undefined, disabled: undefined }, async () => {
    const config = getFeatureToggleConfig();
    assert.equal(config.only.size, 0);
    assert.equal(config.disabled.size, 0);

    FEATURE_KEYS.forEach((feature) => {
      assert.equal(isFeatureEnabled(feature), true, `${feature} should be enabled`);
    });
  });
});

test("VITE_FEATURES_ONLY isolates selected features", async () => {
  await withFeatureEnv(
    { only: "attendance, ai-chat", disabled: "" },
    async () => {
      assert.equal(isFeatureEnabled("attendance"), true);
      assert.equal(isFeatureEnabled("ai-chat"), true);
      assert.equal(isFeatureEnabled("compilers"), false);
      assert.equal(isFeatureEnabled("admin"), false);
      assert.equal(isFeatureEnabled("notifications"), false);
    }
  );
});

test("VITE_FEATURES_DISABLED turns off listed features", async () => {
  await withFeatureEnv(
    { only: "", disabled: "notifications,compilers" },
    async () => {
      assert.equal(isFeatureEnabled("notifications"), false);
      assert.equal(isFeatureEnabled("compilers"), false);
      assert.equal(isFeatureEnabled("attendance"), true);
      assert.equal(isFeatureEnabled("ai-chat"), true);
      assert.equal(isFeatureEnabled("admin"), true);
    }
  );
});
