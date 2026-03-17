/* global process */
import assert from "node:assert/strict";
import test from "node:test";
import {
  DEPLOY_PROFILE_KEYS,
  FEATURE_KEYS,
  getDeployProfileDefinition,
  getFeatureToggleConfig,
  isFeatureEnabled,
} from "../src/config/features.js";

const withFeatureEnv = async ({ profile, only, disabled }, run) => {
  const previousProfile = process.env.VITE_DEPLOY_PROFILE;
  const previousOnly = process.env.VITE_FEATURES_ONLY;
  const previousDisabled = process.env.VITE_FEATURES_DISABLED;

  if (profile === undefined) {
    delete process.env.VITE_DEPLOY_PROFILE;
  } else {
    process.env.VITE_DEPLOY_PROFILE = String(profile);
  }

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
    if (previousProfile === undefined) {
      delete process.env.VITE_DEPLOY_PROFILE;
    } else {
      process.env.VITE_DEPLOY_PROFILE = previousProfile;
    }
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
  await withFeatureEnv(
    { profile: undefined, only: undefined, disabled: undefined },
    async () => {
      const config = getFeatureToggleConfig();
      assert.equal(config.profile, "full");
      assert.equal(config.only.size, 0);
      assert.equal(config.disabled.size, 0);

      FEATURE_KEYS.forEach((feature) => {
        assert.equal(isFeatureEnabled(feature), true, `${feature} should be enabled`);
      });
    }
  );
});

test("deploy profiles expose valid named bundles", () => {
  DEPLOY_PROFILE_KEYS.forEach((profileKey) => {
    const definition = getDeployProfileDefinition(profileKey);
    assert.equal(Boolean(definition), true);
    assert.equal(Array.isArray(definition?.features), true);
    assert.equal((definition?.features.length || 0) > 0, true);
  });
});

test("VITE_DEPLOY_PROFILE narrows scope before manual overrides", async () => {
  await withFeatureEnv(
    { profile: "academic", only: "", disabled: "" },
    async () => {
      const config = getFeatureToggleConfig();
      assert.equal(config.profile, "academic");
      assert.equal(config.only.size, 0);
      assert.equal(config.disabled.size, 0);

      assert.equal(isFeatureEnabled("attendance"), true);
      assert.equal(isFeatureEnabled("assignments"), true);
      assert.equal(isFeatureEnabled("ai-chat"), false);
      assert.equal(isFeatureEnabled("compilers"), false);
      assert.equal(isFeatureEnabled("a3cad"), false);
    }
  );
});

test("VITE_FEATURES_ONLY isolates selected features", async () => {
  await withFeatureEnv(
    { profile: "academic", only: "attendance, ai-chat", disabled: "" },
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
    { profile: "full", only: "", disabled: "notifications,compilers" },
    async () => {
      assert.equal(isFeatureEnabled("notifications"), false);
      assert.equal(isFeatureEnabled("compilers"), false);
      assert.equal(isFeatureEnabled("attendance"), true);
      assert.equal(isFeatureEnabled("ai-chat"), true);
      assert.equal(isFeatureEnabled("admin"), true);
    }
  );
});
