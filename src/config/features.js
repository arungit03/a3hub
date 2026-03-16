/**
 * @typedef {"attendance" | "ai-chat" | "compilers" | "notifications" | "admin"} FeatureKey
 * @typedef {{ label: string, description: string }} FeatureDefinition
 * @typedef {{ only?: string | readonly string[] | null, disabled?: string | readonly string[] | null }} FeatureToggleSource
 * @typedef {{ only: Set<FeatureKey>, disabled: Set<FeatureKey> }} FeatureToggleConfig
 */

const FEATURE_DEFINITIONS = Object.freeze(
  /** @type {Record<FeatureKey, FeatureDefinition>} */ ({
  attendance: {
    label: "Attendance",
    description: "Attendance tracking and attendance views.",
  },
  "ai-chat": {
    label: "AI Chat",
    description: "AI assistant pages and AI-powered interactions.",
  },
  compilers: {
    label: "Compilers",
    description: "Code lab and compiler/interpreter tooling.",
  },
  notifications: {
    label: "Notifications",
    description: "In-app notification center and real-time notification UI.",
  },
  admin: {
    label: "Admin",
    description: "Admin dashboard and management routes.",
  },
})
);

export const FEATURE_KEYS = Object.freeze(
  /** @type {FeatureKey[]} */ (Object.keys(FEATURE_DEFINITIONS))
);

const KNOWN_FEATURES = new Set(FEATURE_KEYS);

/**
 * @param {unknown} value
 * @returns {string}
 */
const toSafeText = (value) => (typeof value === "string" ? value.trim() : "");

/**
 * @param {unknown} value
 * @returns {string}
 */
const normalizeFeatureKey = (value) => toSafeText(value).toLowerCase();

/**
 * @param {unknown} value
 * @returns {string[]}
 */
const parseFeatureList = (value) => {
  if (Array.isArray(value)) {
    return Array.from(
      new Set(value.map((item) => normalizeFeatureKey(item)).filter(Boolean))
    );
  }

  const text = toSafeText(value);
  if (!text) return [];

  return Array.from(
    new Set(
      text
        .split(",")
        .map((item) => normalizeFeatureKey(item))
        .filter(Boolean)
    )
  );
};

/**
 * @param {string} featureKey
 * @returns {featureKey is FeatureKey}
 */
const isKnownFeatureKey = (featureKey) =>
  KNOWN_FEATURES.has(/** @type {FeatureKey} */ (featureKey));

/**
 * @returns {FeatureToggleSource}
 */
const readRuntimeFeatureConfig = () => {
  if (typeof window === "undefined") {
    return {};
  }
  const config = window.__A3HUB_FEATURE_FLAGS__;
  if (!config || typeof config !== "object") {
    return {};
  }
  return config;
};

/**
 * @returns {FeatureToggleSource}
 */
const readBuildEnv = () => {
  const env = /** @type {Partial<ImportMetaEnv>} */ (
    typeof import.meta !== "undefined" && import.meta?.env
      ? import.meta.env
      : {}
  );
  return {
    only: env.VITE_FEATURES_ONLY,
    disabled: env.VITE_FEATURES_DISABLED,
  };
};

/**
 * @returns {FeatureToggleSource}
 */
const readNodeEnv = () => {
  const maybeProcess =
    typeof globalThis !== "undefined" ? globalThis.process : undefined;
  const env =
    maybeProcess?.env && typeof maybeProcess.env === "object"
      ? maybeProcess.env
      : {};
  return {
    only: env.VITE_FEATURES_ONLY,
    disabled: env.VITE_FEATURES_DISABLED,
  };
};

/**
 * @returns {FeatureToggleConfig}
 */
export function getFeatureToggleConfig() {
  const runtimeConfig = readRuntimeFeatureConfig();
  const buildEnv = readBuildEnv();
  const nodeEnv = readNodeEnv();

  const onlyList = parseFeatureList(
    runtimeConfig.only ?? buildEnv.only ?? nodeEnv.only
  ).filter(isKnownFeatureKey);

  const disabledList = parseFeatureList(
    runtimeConfig.disabled ?? buildEnv.disabled ?? nodeEnv.disabled
  ).filter(isKnownFeatureKey);

  return {
    only: new Set(onlyList),
    disabled: new Set(disabledList),
  };
}

/**
 * @param {unknown} featureKey
 * @returns {boolean}
 */
export function isFeatureEnabled(featureKey) {
  const normalized = normalizeFeatureKey(featureKey);
  if (!normalized || !isKnownFeatureKey(normalized)) {
    return true;
  }

  const config = getFeatureToggleConfig();
  if (config.only.size > 0) {
    return config.only.has(normalized);
  }
  return !config.disabled.has(normalized);
}

/**
 * @param {unknown} item
 * @returns {string | undefined}
 */
const defaultFeatureSelector = (item) => {
  if (!item || typeof item !== "object") return undefined;
  const maybeFeature = /** @type {{ feature?: unknown }} */ (item).feature;
  return typeof maybeFeature === "string" ? maybeFeature : undefined;
};

/**
 * @param {unknown[]} [items]
 * @param {(item: unknown) => string | null | undefined} [keySelector]
 * @returns {unknown[]}
 */
export function filterByFeature(items = [], keySelector = defaultFeatureSelector) {
  return (items || []).filter((item) => {
    const feature = keySelector(item);
    return !feature || isFeatureEnabled(feature);
  });
}

export function getFeatureDebugSummary() {
  const config = getFeatureToggleConfig();
  return FEATURE_KEYS.map((key) => ({
    key,
    label: FEATURE_DEFINITIONS[key]?.label || key,
    enabled: isFeatureEnabled(key),
    mode:
      config.only.size > 0
        ? "only"
        : config.disabled.size > 0
        ? "disabled"
        : "default",
  }));
}

/**
 * @param {unknown} featureKey
 * @returns {FeatureDefinition | null}
 */
export function getFeatureDefinition(featureKey) {
  const normalized = normalizeFeatureKey(featureKey);
  if (!isKnownFeatureKey(normalized)) return null;
  return FEATURE_DEFINITIONS[normalized] || null;
}
