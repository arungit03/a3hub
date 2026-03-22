/**
 * @typedef {"attendance" | "assignments" | "books" | "marks" | "exams" | "tests" | "leave" | "todo" | "ai-chat" | "compilers" | "learning" | "a3cad" | "notifications" | "admin"} FeatureKey
 * @typedef {"full" | "academic" | "learning" | "operations" | "lean"} DeployProfileKey
 * @typedef {{ label: string, description: string }} FeatureDefinition
 * @typedef {{ label: string, description: string, features: readonly FeatureKey[] }} DeployProfileDefinition
 * @typedef {{ profile?: string | null, only?: string | readonly string[] | null, disabled?: string | readonly string[] | null }} FeatureToggleSource
 * @typedef {{ profile: DeployProfileKey, only: Set<FeatureKey>, disabled: Set<FeatureKey>, enabled: Set<FeatureKey> }} FeatureToggleConfig
 */

const FEATURE_DEFINITIONS = Object.freeze(
  /** @type {Record<FeatureKey, FeatureDefinition>} */ ({
  attendance: {
    label: "Attendance",
    description: "Attendance tracking and attendance views.",
  },
  assignments: {
    label: "Assignments",
    description: "Assignment publishing, submissions, and related staff workflows.",
  },
  books: {
    label: "Books",
    description: "Library, books, and subject reading flows.",
  },
  marks: {
    label: "Marks & Progress",
    description: "Marks, progress reporting, and academic performance views.",
  },
  exams: {
    label: "Exam Schedule",
    description: "Exam schedule planning and student/staff exam views.",
  },
  tests: {
    label: "Tests",
    description: "Tests, results, and lightweight assessment flows.",
  },
  leave: {
    label: "Leave",
    description: "Leave request and leave approval workflows.",
  },
  todo: {
    label: "To-Do",
    description: "Personal student task tracking and daily to-do items.",
  },
  "ai-chat": {
    label: "AI Chat",
    description: "AI assistant pages and AI-powered interactions.",
  },
  compilers: {
    label: "Compilers",
    description: "Code lab and compiler/interpreter tooling.",
  },
  learning: {
    label: "Code learning",
    description: "Programming learning portal with lessons, quizzes, practice, and progress tracking.",
  },
  a3cad: {
    label: "A3 CAD",
    description: "A3 CAD logic simulator and circuit design tooling.",
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
const DEFAULT_DEPLOY_PROFILE = "full";

const DEPLOY_PROFILE_DEFINITIONS = Object.freeze(
  /** @type {Record<DeployProfileKey, DeployProfileDefinition>} */ ({
    full: {
      label: "Full Suite",
      description: "Every product module is enabled.",
      features: FEATURE_KEYS,
    },
    academic: {
      label: "Academic Core",
      description: "Attendance and core academic workflows without AI/CAD extras.",
      features: [
        "attendance",
        "assignments",
        "books",
        "marks",
        "exams",
        "tests",
        "leave",
        "learning",
        "notifications",
      ],
    },
    learning: {
      label: "Learning Lab",
      description: "Learning-heavy deploy focused on coding, AI, CAD, and study tools.",
      features: [
        "books",
        "tests",
        "todo",
        "ai-chat",
        "compilers",
        "learning",
        "a3cad",
      ],
    },
    operations: {
      label: "Operations",
      description: "Staff/admin-focused operational workflows and notifications.",
      features: [
        "attendance",
        "assignments",
        "leave",
        "notifications",
        "admin",
      ],
    },
    lean: {
      label: "Lean Campus",
      description: "Low-complexity deploy with only the most common student/staff flows.",
      features: [
        "attendance",
        "assignments",
        "books",
        "marks",
        "exams",
        "leave",
        "learning",
      ],
    },
  })
);

export const DEPLOY_PROFILE_KEYS = Object.freeze(
  /** @type {DeployProfileKey[]} */ (Object.keys(DEPLOY_PROFILE_DEFINITIONS))
);

const KNOWN_DEPLOY_PROFILES = new Set(DEPLOY_PROFILE_KEYS);

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
 * @returns {string}
 */
const normalizeDeployProfileKey = (value) => toSafeText(value).toLowerCase();

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
 * @param {string} profileKey
 * @returns {profileKey is DeployProfileKey}
 */
const isKnownDeployProfileKey = (profileKey) =>
  KNOWN_DEPLOY_PROFILES.has(/** @type {DeployProfileKey} */ (profileKey));

/**
 * @param {unknown} value
 * @returns {DeployProfileKey}
 */
const resolveDeployProfileKey = (value) => {
  const normalized = normalizeDeployProfileKey(value);
  return isKnownDeployProfileKey(normalized) ? normalized : DEFAULT_DEPLOY_PROFILE;
};

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
    profile: env.VITE_DEPLOY_PROFILE,
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
    profile: env.VITE_DEPLOY_PROFILE,
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
  const profile = resolveDeployProfileKey(
    runtimeConfig.profile ?? buildEnv.profile ?? nodeEnv.profile
  );
  const profileDefinition = DEPLOY_PROFILE_DEFINITIONS[profile];

  const onlyList = parseFeatureList(
    runtimeConfig.only ?? buildEnv.only ?? nodeEnv.only
  ).filter(isKnownFeatureKey);

  const disabledList = parseFeatureList(
    runtimeConfig.disabled ?? buildEnv.disabled ?? nodeEnv.disabled
  ).filter(isKnownFeatureKey);

  const enabled = new Set(
    onlyList.length > 0 ? onlyList : profileDefinition.features
  );
  disabledList.forEach((featureKey) => {
    enabled.delete(featureKey);
  });

  return {
    profile,
    only: new Set(onlyList),
    disabled: new Set(disabledList),
    enabled,
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
  return config.enabled.has(normalized);
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
    profile: config.profile,
    mode:
      config.only.size > 0
        ? "only"
        : config.disabled.size > 0
        ? "disabled"
        : config.profile !== DEFAULT_DEPLOY_PROFILE
        ? "profile"
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

/**
 * @param {unknown} profileKey
 * @returns {DeployProfileDefinition | null}
 */
export function getDeployProfileDefinition(profileKey) {
  const normalized = normalizeDeployProfileKey(profileKey);
  if (!isKnownDeployProfileKey(normalized)) return null;
  return DEPLOY_PROFILE_DEFINITIONS[normalized] || null;
}
