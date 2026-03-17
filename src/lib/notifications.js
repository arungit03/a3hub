import {
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  Timestamp,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { auth } from "./firebase";

const DEFAULT_CHANNELS = Object.freeze({
  inApp: true,
  email: false,
  whatsapp: true,
  push: true,
});

const MAX_BATCH_SIZE = 400;
const NOTIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_WHATSAPP_ENDPOINT = "/.netlify/functions/whatsapp-send";
const MAX_WHATSAPP_TEXT_LENGTH = 1024;
const MAX_WHATSAPP_BULK_RECIPIENTS = 120;
const WHATSAPP_SEND_CONCURRENCY = 12;
const DEFAULT_PUSH_ENDPOINT = "/.netlify/functions/push-send";
const MAX_PUSH_BULK_RECIPIENTS = 250;
const PUSH_SEND_CONCURRENCY = 16;
const DEFAULT_EMAIL_ENDPOINT = "/.netlify/functions/email-send";
const MAX_EMAIL_BULK_RECIPIENTS = 180;
const EMAIL_SEND_CONCURRENCY = 14;
const MAX_EMAIL_SUBJECT_LENGTH = 160;
const DELIVERY_RETRY_BACKOFF_MS = [0, 1200, 2800];
const MAX_DELIVERY_LOG_MESSAGE = 260;
const MAX_DELIVERY_FAILURE_ITEMS = 80;
const DELIVERY_MODE_AWAIT = "await";
const DELIVERY_MODE_BACKGROUND = "background";
const NOTIFICATION_PRIORITIES = Object.freeze([
  "low",
  "normal",
  "high",
  "urgent",
]);
const DEFAULT_QUIET_HOURS = Object.freeze({
  enabled: false,
  start: "22:00",
  end: "07:00",
  whatsapp: true,
  push: true,
  timezoneOffsetMinutes: null,
});

const normalizeDepartment = (value) => (value || "").trim().toLowerCase();

const normalizeChannels = (channels = {}) => ({
  ...DEFAULT_CHANNELS,
  ...(channels || {}),
});

const toSafeText = (value) => (typeof value === "string" ? value.trim() : "");
const toBoolean = (value) =>
  /^(1|true|yes|on)$/i.test(String(value || "").trim());
const toSafeEmail = (value) => {
  const email = toSafeText(value).toLowerCase();
  if (!email) return "";
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
};
const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const truncateMessage = (value, maxLength = MAX_DELIVERY_LOG_MESSAGE) =>
  toSafeText(value).slice(0, maxLength);

const wait = (ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, Math.max(0, toNumber(ms)));
  });

const normalizePriority = (value) => {
  const normalized = toSafeText(value).toLowerCase();
  if (NOTIFICATION_PRIORITIES.includes(normalized)) return normalized;
  return "normal";
};

const parseClockMinutes = (value, fallback) => {
  const safe = toSafeText(value);
  const matched = safe.match(/^(\d{1,2}):(\d{2})$/);
  if (!matched) return fallback;
  const hours = Number(matched[1]);
  const minutes = Number(matched[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return fallback;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return fallback;
  return hours * 60 + minutes;
};

const resolveQuietHoursConfig = (profile = {}) => {
  const source = profile?.notificationPreferences?.quietHours || {};
  return {
    enabled:
      typeof source.enabled === "boolean"
        ? source.enabled
        : DEFAULT_QUIET_HOURS.enabled,
    start: toSafeText(source.start) || DEFAULT_QUIET_HOURS.start,
    end: toSafeText(source.end) || DEFAULT_QUIET_HOURS.end,
    whatsapp:
      typeof source.whatsapp === "boolean"
        ? source.whatsapp
        : DEFAULT_QUIET_HOURS.whatsapp,
    push:
      typeof source.push === "boolean" ? source.push : DEFAULT_QUIET_HOURS.push,
    timezoneOffsetMinutes:
      typeof source.timezoneOffsetMinutes === "number" &&
      Number.isFinite(source.timezoneOffsetMinutes)
        ? source.timezoneOffsetMinutes
        : DEFAULT_QUIET_HOURS.timezoneOffsetMinutes,
  };
};

const getCurrentMinutesForOffset = (timezoneOffsetMinutes) => {
  const now = new Date();
  if (
    typeof timezoneOffsetMinutes === "number" &&
    Number.isFinite(timezoneOffsetMinutes)
  ) {
    const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
    return (utcMinutes + timezoneOffsetMinutes + 1440) % 1440;
  }
  return now.getHours() * 60 + now.getMinutes();
};

const isWithinQuietWindow = (startMinutes, endMinutes, currentMinutes) => {
  if (startMinutes === endMinutes) return true;
  if (startMinutes < endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  }
  return currentMinutes >= startMinutes || currentMinutes < endMinutes;
};

const isChannelBlockedByQuietHours = (profile = {}, channel) => {
  const quietHours = resolveQuietHoursConfig(profile);
  if (!quietHours.enabled) return false;
  if (channel === "whatsapp" && !quietHours.whatsapp) return false;
  if (channel === "push" && !quietHours.push) return false;

  const startMinutes = parseClockMinutes(quietHours.start, 22 * 60);
  const endMinutes = parseClockMinutes(quietHours.end, 7 * 60);
  const currentMinutes = getCurrentMinutesForOffset(
    quietHours.timezoneOffsetMinutes
  );

  return isWithinQuietWindow(startMinutes, endMinutes, currentMinutes);
};

const parseJsonSafe = (value) => {
  try {
    return value ? JSON.parse(value) : {};
  } catch {
    return { raw: value || "" };
  }
};

const getNetlifyAuthHeaders = async () => {
  const currentUser = auth.currentUser;
  if (!currentUser) return {};
  try {
    const token = await currentUser.getIdToken();
    if (!token) return {};
    return { Authorization: `Bearer ${token}` };
  } catch {
    return {};
  }
};

const normalizePhoneForWhatsApp = (rawValue, defaultCountryCode = "") => {
  const raw = toSafeText(rawValue);
  if (!raw) return "";

  let digitsOnly = raw.replace(/\D+/g, "");
  if (!digitsOnly) return "";

  if (raw.startsWith("+")) {
    return digitsOnly;
  }

  if (digitsOnly.startsWith("00")) {
    return digitsOnly.slice(2);
  }

  const countryCodeDigits = toSafeText(defaultCountryCode).replace(/\D+/g, "");
  if (countryCodeDigits) {
    if (digitsOnly.startsWith(countryCodeDigits)) {
      return digitsOnly;
    }

    if (digitsOnly.length === 11 && digitsOnly.startsWith("0")) {
      digitsOnly = digitsOnly.slice(1);
    }

    if (digitsOnly.length === 10) {
      return `${countryCodeDigits}${digitsOnly}`;
    }
  }

  return digitsOnly;
};

const buildWhatsAppText = ({ title, message = "", link = "" }) => {
  const safeTitle = toSafeText(title);
  const safeMessage = toSafeText(message);
  const safeLink = toSafeText(link);

  const parts = [];
  if (safeTitle) parts.push(`A3 Hub: ${safeTitle}`);
  if (safeMessage) parts.push(safeMessage);
  if (safeLink) parts.push(safeLink);

  return parts.join("\n").slice(0, MAX_WHATSAPP_TEXT_LENGTH);
};

const resolveWhatsAppClientConfig = () => {
  const runtimeRoot =
    typeof window !== "undefined" &&
    window.__A3HUB_RUNTIME_CONFIG__ &&
    typeof window.__A3HUB_RUNTIME_CONFIG__ === "object"
      ? window.__A3HUB_RUNTIME_CONFIG__
      : {};
  const runtimeConfig =
    typeof window !== "undefined" && window.__A3HUB_WHATSAPP_CONFIG__
      ? window.__A3HUB_WHATSAPP_CONFIG__
      : runtimeRoot.whatsapp && typeof runtimeRoot.whatsapp === "object"
      ? runtimeRoot.whatsapp
      : {};

  const endpointFromBuild = toSafeText(
    import.meta.env.VITE_WHATSAPP_NOTIFY_ENDPOINT
  );
  const defaultCountryCodeFromBuild = toSafeText(
    import.meta.env.VITE_WHATSAPP_DEFAULT_COUNTRY_CODE
  );
  const enabledFromBuild = toBoolean(
    import.meta.env.VITE_WHATSAPP_NOTIFY_ENABLED
  );
  const modeFromBuild = toSafeText(import.meta.env.VITE_WHATSAPP_MODE);
  const templateNameFromBuild = toSafeText(
    import.meta.env.VITE_WHATSAPP_TEMPLATE_NAME
  );
  const templateLanguageFromBuild = toSafeText(
    import.meta.env.VITE_WHATSAPP_TEMPLATE_LANGUAGE
  );
  const fallbackFromBuild = toBoolean(
    import.meta.env.VITE_WHATSAPP_TEXT_FALLBACK_TO_TEMPLATE
  );

  return {
    enabled:
      typeof runtimeConfig.enabled === "boolean"
        ? runtimeConfig.enabled
        : enabledFromBuild,
    endpoint:
      toSafeText(runtimeConfig.endpoint) ||
      endpointFromBuild ||
      DEFAULT_WHATSAPP_ENDPOINT,
    defaultCountryCode:
      toSafeText(runtimeConfig.defaultCountryCode) ||
      defaultCountryCodeFromBuild,
    mode: toSafeText(runtimeConfig.mode) || modeFromBuild || "auto",
    templateName:
      toSafeText(runtimeConfig.templateName) || templateNameFromBuild,
    templateLanguage:
      toSafeText(runtimeConfig.templateLanguage) ||
      templateLanguageFromBuild ||
      "en_US",
    allowTemplateFallback:
      typeof runtimeConfig.allowTemplateFallback === "boolean"
        ? runtimeConfig.allowTemplateFallback
        : fallbackFromBuild,
  };
};

const isStudentRecipient = (profile = {}) =>
  (() => {
    const role = toSafeText(profile.role).toLowerCase();
    if (!role) return true;
    return role === "student";
  })();

const isWhatsAppAllowedByPreferences = (profile = {}) => {
  const whatsappPreference = profile?.notificationPreferences?.whatsapp;
  if (typeof whatsappPreference === "boolean") {
    return whatsappPreference;
  }
  return true;
};

const resolveStudentMobileNumber = (profile = {}) =>
  toSafeText(
    profile.studentMobile ||
      profile.mobile ||
      profile.phone ||
      profile.phoneNumber ||
      profile.studentPhone ||
      profile.whatsapp ||
      profile.whatsappNumber
  );

const resolvePushClientConfig = () => {
  const runtimeRoot =
    typeof window !== "undefined" &&
    window.__A3HUB_RUNTIME_CONFIG__ &&
    typeof window.__A3HUB_RUNTIME_CONFIG__ === "object"
      ? window.__A3HUB_RUNTIME_CONFIG__
      : {};
  const runtimeConfig =
    typeof window !== "undefined" && window.__A3HUB_PUSH_CONFIG__
      ? window.__A3HUB_PUSH_CONFIG__
      : runtimeRoot.push && typeof runtimeRoot.push === "object"
      ? runtimeRoot.push
      : {};

  const endpointFromBuild = toSafeText(import.meta.env.VITE_PUSH_NOTIFY_ENDPOINT);
  const enabledFromBuild = toBoolean(import.meta.env.VITE_PUSH_NOTIFY_ENABLED);

  return {
    enabled:
      typeof runtimeConfig.enabled === "boolean"
        ? runtimeConfig.enabled
        : enabledFromBuild,
    endpoint:
      toSafeText(runtimeConfig.endpoint) ||
      endpointFromBuild ||
      DEFAULT_PUSH_ENDPOINT,
  };
};

const resolveEmailClientConfig = () => {
  const runtimeRoot =
    typeof window !== "undefined" &&
    window.__A3HUB_RUNTIME_CONFIG__ &&
    typeof window.__A3HUB_RUNTIME_CONFIG__ === "object"
      ? window.__A3HUB_RUNTIME_CONFIG__
      : {};
  const runtimeConfig =
    typeof window !== "undefined" && window.__A3HUB_EMAIL_CONFIG__
      ? window.__A3HUB_EMAIL_CONFIG__
      : runtimeRoot.email && typeof runtimeRoot.email === "object"
      ? runtimeRoot.email
      : {};

  const endpointFromBuild = toSafeText(import.meta.env.VITE_EMAIL_NOTIFY_ENDPOINT);
  const enabledFromBuild = toBoolean(import.meta.env.VITE_EMAIL_NOTIFY_ENABLED);

  return {
    enabled:
      typeof runtimeConfig.enabled === "boolean"
        ? runtimeConfig.enabled
        : enabledFromBuild,
    endpoint:
      toSafeText(runtimeConfig.endpoint) ||
      endpointFromBuild ||
      DEFAULT_EMAIL_ENDPOINT,
  };
};

const isPushAllowedByPreferences = (profile = {}) => {
  const pushPreference = profile?.notificationPreferences?.push;
  if (typeof pushPreference === "boolean") {
    return pushPreference;
  }
  return true;
};

const isEmailAllowedByPreferences = (profile = {}) => {
  const emailPreference = profile?.notificationPreferences?.email;
  if (typeof emailPreference === "boolean") {
    return emailPreference;
  }
  return true;
};

const resolveRecipientEmailAddress = ({ profile = {}, payload = {} } = {}) =>
  toSafeEmail(
    payload.recipientEmail ||
      payload.email ||
      profile.email ||
      profile.studentEmail ||
      profile.emailId ||
      profile.emailID ||
      profile.userEmail ||
      profile?.details?.email ||
      profile?.details?.emailId ||
      profile?.details?.emailID ||
      profile?.details?.studentEmail ||
      profile?.studentDetails?.email ||
      profile?.studentDetails?.emailId ||
      profile?.studentDetails?.emailID
  );

const buildEmailText = ({ title, message = "", link = "" }) => {
  const safeTitle = toSafeText(title);
  const safeMessage = toSafeText(message);
  const safeLink = toSafeText(link);

  const parts = [];
  if (safeTitle) parts.push(`A3 Hub: ${safeTitle}`);
  if (safeMessage) parts.push(safeMessage);
  if (safeLink) parts.push(`Open in app: ${safeLink}`);
  return parts.join("\n\n");
};

const resolvePushTokens = (profile = {}) => {
  const fromArray = Array.isArray(profile.pushTokens)
    ? profile.pushTokens
    : [];
  const merged = fromArray.concat([
    profile.pushToken,
    profile.fcmToken,
    profile.deviceToken,
  ]);
  return Array.from(
    new Set(
      merged
        .map((value) => toSafeText(value))
        .filter((value) => value.length > 0)
    )
  );
};

const shouldDispatchPushForPayload = (payload = {}) => {
  if (payload?.channels && typeof payload.channels.push === "boolean") {
    return payload.channels.push;
  }
  return true;
};

const shouldDispatchEmailForPayload = (payload = {}) => {
  if (payload?.channels && typeof payload.channels.email === "boolean") {
    return payload.channels.email;
  }
  return true;
};

const shouldDispatchWhatsAppForPayload = (payload = {}) => {
  if (payload?.channels && typeof payload.channels.whatsapp === "boolean") {
    return payload.channels.whatsapp;
  }
  return true;
};

const isRetryableDeliveryError = (error) => {
  const status = Number(error?.status || 0);
  if ([408, 409, 425, 429].includes(status)) return true;
  if (status >= 500) return true;

  const message = `${error?.message || ""}`.toLowerCase();
  if (
    message.includes("network") ||
    message.includes("timeout") ||
    message.includes("temporarily") ||
    message.includes("rate limit")
  ) {
    return true;
  }

  return false;
};

const normalizeRecipientTargets = (targets = [], maxCount = 100) =>
  Array.from(
    new Map(
      (targets || [])
        .map((item) => {
          if (typeof item === "string") {
            const recipientId = toSafeText(item);
            if (!recipientId) return null;
            return [
              recipientId,
              { recipientId, notificationId: "", recipientEmail: "" },
            ];
          }
          const recipientId = toSafeText(item?.recipientId || item?.id);
          if (!recipientId) return null;
          return [
            recipientId,
            {
              recipientId,
              notificationId: toSafeText(item?.notificationId),
              recipientEmail: toSafeEmail(item?.recipientEmail || item?.email),
            },
          ];
        })
        .filter(Boolean)
    ).values()
  ).slice(0, maxCount);

const resolveDeliveryStateFromResult = (result) => {
  if (result?.status === "sent") return "sent";
  if (result?.status === "disabled") return "disabled";
  if (result?.status === "quiet_hours") return "quiet_hours";
  if (result?.status === "skipped") return "skipped";
  return "failed";
};

const updateDeliveryLog = async ({
  db,
  recipientId,
  notificationId,
  channel,
  state,
  attemptCount,
  responseStatus = null,
  reason = "",
  errorMessage = "",
}) => {
  if (!recipientId || !notificationId || !channel) return;

  const notificationRef = doc(
    db,
    "users",
    recipientId,
    "notifications",
    notificationId
  );

  const nowMs = Date.now();
  const logItem = {
    channel,
    state,
    attemptCount: toNumber(attemptCount, 0),
    responseStatus:
      typeof responseStatus === "number" && Number.isFinite(responseStatus)
        ? responseStatus
        : null,
    reason: truncateMessage(reason),
    error: truncateMessage(errorMessage),
    atMs: nowMs,
  };

  try {
    await updateDoc(notificationRef, {
      [`delivery.${channel}`]: state,
      [`deliveryAttempts.${channel}`]: toNumber(attemptCount, 0),
      [`deliveryLastStatus.${channel}`]:
        typeof responseStatus === "number" && Number.isFinite(responseStatus)
          ? responseStatus
          : null,
      [`deliveryLastError.${channel}`]: truncateMessage(errorMessage),
      [`deliveryLastReason.${channel}`]: truncateMessage(reason),
      [`deliveryUpdatedAt.${channel}`]: nowMs,
      deliveryLastTouchedAt: serverTimestamp(),
      deliveryLogs: arrayUnion(logItem),
    });
  } catch (error) {
    console.warn(
      "Unable to update notification delivery log",
      recipientId,
      notificationId,
      channel,
      error?.message || error
    );
  }
};

const markDeliveryAuthFailure = async ({ db, targets = [], channel }) => {
  const pending = targets.map((target) =>
    updateDeliveryLog({
      db,
      recipientId: target.recipientId,
      notificationId: target.notificationId,
      channel,
      state: "failed",
      attemptCount: 1,
      responseStatus: 401,
      reason: "missing_auth_token",
      errorMessage: "Authenticated session required for server delivery.",
    })
  );
  await Promise.allSettled(pending);
};

const normalizeDeliveryMode = (value) => {
  const mode = toSafeText(value).toLowerCase();
  if (mode === DELIVERY_MODE_BACKGROUND) return DELIVERY_MODE_BACKGROUND;
  return DELIVERY_MODE_AWAIT;
};

const createChannelDeliverySummary = (channel, targetCount = 0) => ({
  channel: toSafeText(channel),
  targetCount: Math.max(0, toNumber(targetCount, 0)),
  attempted: 0,
  sent: 0,
  failed: 0,
  skipped: 0,
  disabled: 0,
  quiet_hours: 0,
  unknown: 0,
  failures: [],
});

const appendDeliveryFailure = (summary, target, result) => {
  if (!summary || summary.failures.length >= MAX_DELIVERY_FAILURE_ITEMS) return;
  summary.failures.push({
    recipientId: toSafeText(target?.recipientId),
    notificationId: toSafeText(target?.notificationId),
    reason: toSafeText(result?.reason) || "delivery_failed",
    responseStatus:
      typeof result?.responseStatus === "number" ? result.responseStatus : null,
    errorMessage: truncateMessage(result?.errorMessage || ""),
  });
};

const recordChannelDeliveryResult = (summary, target, result) => {
  if (!summary) return;
  summary.attempted += 1;
  const state = toSafeText(result?.state).toLowerCase() || "failed";
  if (state === "sent") {
    summary.sent += 1;
    return;
  }
  if (state === "skipped") {
    summary.skipped += 1;
    return;
  }
  if (state === "disabled") {
    summary.disabled += 1;
    return;
  }
  if (state === "quiet_hours") {
    summary.quiet_hours += 1;
    return;
  }
  if (state === "failed") {
    summary.failed += 1;
    appendDeliveryFailure(summary, target, result);
    return;
  }
  summary.unknown += 1;
  appendDeliveryFailure(summary, target, {
    ...result,
    reason: toSafeText(result?.reason) || "unknown_state",
  });
};

const combineChannelDeliverySummaries = (left, right) => {
  const base = left || createChannelDeliverySummary(right?.channel || "", 0);
  const source = right || createChannelDeliverySummary(base.channel || "", 0);

  base.targetCount += toNumber(source.targetCount, 0);
  base.attempted += toNumber(source.attempted, 0);
  base.sent += toNumber(source.sent, 0);
  base.failed += toNumber(source.failed, 0);
  base.skipped += toNumber(source.skipped, 0);
  base.disabled += toNumber(source.disabled, 0);
  base.quiet_hours += toNumber(source.quiet_hours, 0);
  base.unknown += toNumber(source.unknown, 0);
  if (Array.isArray(source.failures)) {
    source.failures.forEach((item) => {
      if (base.failures.length >= MAX_DELIVERY_FAILURE_ITEMS) return;
      base.failures.push(item);
    });
  }
  return base;
};

const executeDeliveryWithRetry = async ({
  channel,
  sendOperation,
  maxAttempts = DELIVERY_RETRY_BACKOFF_MS.length,
}) => {
  const attempts = Math.max(1, toNumber(maxAttempts, 1));
  let lastError = null;

  for (let index = 0; index < attempts; index += 1) {
    const attemptNumber = index + 1;
    const backoff = toNumber(DELIVERY_RETRY_BACKOFF_MS[index] ?? 0, 0);
    if (backoff > 0) {
      await wait(backoff);
    }

    try {
      const result = await sendOperation();
      const state = resolveDeliveryStateFromResult(result);
      return {
        channel,
        state,
        attemptCount: attemptNumber,
        responseStatus:
          typeof result?.responseStatus === "number" ? result.responseStatus : null,
        reason: toSafeText(result?.reason),
        errorMessage: "",
      };
    } catch (error) {
      lastError = error;
      const canRetry = index < attempts - 1 && isRetryableDeliveryError(error);
      if (!canRetry) {
        break;
      }
    }
  }

  return {
    channel,
    state: "failed",
    attemptCount: attempts,
    responseStatus:
      typeof lastError?.status === "number" ? lastError.status : null,
    reason: "delivery_failed",
    errorMessage: truncateMessage(lastError?.message || "Delivery failed"),
  };
};

const loadRecipientProfile = async (db, recipientId, cache) => {
  if (!recipientId) return null;
  if (cache.has(recipientId)) {
    return cache.get(recipientId);
  }

  try {
    const recipientRef = doc(db, "users", recipientId);
    const recipientSnapshot = await getDoc(recipientRef);
    const profile = recipientSnapshot.exists() ? recipientSnapshot.data() || {} : null;
    cache.set(recipientId, profile);
    return profile;
  } catch {
    cache.set(recipientId, null);
    return null;
  }
};

const sendWhatsAppToRecipient = async ({
  db,
  payload,
  whatsappConfig,
  recipientProfileCache,
  authHeaders = {},
}) => {
  const recipientId = toSafeText(payload?.recipientId);
  if (!recipientId) return { status: "skipped", reason: "missing_recipient" };
  if (!shouldDispatchWhatsAppForPayload(payload)) {
    return { status: "disabled", reason: "disabled_by_payload" };
  }
  if (!whatsappConfig?.enabled || !whatsappConfig?.endpoint) {
    return { status: "disabled", reason: "channel_not_configured" };
  }

  const text = buildWhatsAppText(payload);
  if (!text) return { status: "skipped", reason: "empty_message" };

  const recipientProfile = await loadRecipientProfile(
    db,
    recipientId,
    recipientProfileCache
  );
  if (!recipientProfile) return { status: "skipped", reason: "recipient_not_found" };
  if (!isStudentRecipient(recipientProfile)) {
    return { status: "skipped", reason: "recipient_not_student" };
  }
  if (!isWhatsAppAllowedByPreferences(recipientProfile)) {
    return { status: "disabled", reason: "disabled_by_user_preferences" };
  }
  if (isChannelBlockedByQuietHours(recipientProfile, "whatsapp")) {
    return { status: "quiet_hours", reason: "quiet_hours_active" };
  }

  const normalizedPhone = normalizePhoneForWhatsApp(
    resolveStudentMobileNumber(recipientProfile),
    whatsappConfig.defaultCountryCode
  );
  if (!normalizedPhone) return { status: "skipped", reason: "missing_mobile_number" };

  const response = await fetch(whatsappConfig.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders,
    },
    body: JSON.stringify({
      to: normalizedPhone,
      text,
      type: payload?.type || "general",
      recipientId,
      mode: whatsappConfig.mode || "auto",
      templateName: whatsappConfig.templateName || "",
      templateLanguage: whatsappConfig.templateLanguage || "en_US",
      allowTemplateFallback:
        typeof whatsappConfig.allowTemplateFallback === "boolean"
          ? whatsappConfig.allowTemplateFallback
          : true,
    }),
  });

  const responseText = await response.text().catch(() => "");
  if (!response.ok) {
    const error = new Error(
      `WhatsApp send failed (${response.status})${responseText ? `: ${responseText}` : ""}`
    );
    error.status = response.status;
    throw error;
  }

  return {
    status: "sent",
    reason: "sent",
    responseStatus: response.status,
    responseBody: parseJsonSafe(responseText),
  };
};

const sendWhatsAppForRecipients = async (db, recipientTargets, payload) => {
  const whatsappConfig = resolveWhatsAppClientConfig();
  const targets = normalizeRecipientTargets(
    recipientTargets,
    MAX_WHATSAPP_BULK_RECIPIENTS
  );
  const summary = createChannelDeliverySummary("whatsapp", targets.length);
  if (targets.length === 0) return summary;

  const authHeaders = await getNetlifyAuthHeaders();
  if (!authHeaders.Authorization) {
    await markDeliveryAuthFailure({
      db,
      targets,
      channel: "whatsapp",
    });
    targets.forEach((target) => {
      recordChannelDeliveryResult(summary, target, {
        state: "failed",
        reason: "missing_auth_token",
        responseStatus: 401,
        errorMessage: "Authenticated session required for server delivery.",
      });
    });
    return summary;
  }

  const recipientProfileCache = new Map();
  const chunks = toChunks(targets, WHATSAPP_SEND_CONCURRENCY);

  for (const chunk of chunks) {
    const pending = chunk.map(async (target) => {
      try {
        const result = await executeDeliveryWithRetry({
          channel: "whatsapp",
          sendOperation: () =>
            sendWhatsAppToRecipient({
              db,
              payload: { ...payload, recipientId: target.recipientId },
              whatsappConfig,
              recipientProfileCache,
              authHeaders,
            }),
        });

        await updateDeliveryLog({
          db,
          recipientId: target.recipientId,
          notificationId: target.notificationId,
          channel: "whatsapp",
          state: result.state,
          attemptCount: result.attemptCount,
          responseStatus: result.responseStatus,
          reason: result.reason,
          errorMessage: result.errorMessage,
        });

        if (result.state === "failed") {
          console.warn(
            "WhatsApp notification failed",
            target.recipientId,
            result.errorMessage || result.reason
          );
        }

        return { target, result };
      } catch (error) {
        return {
          target,
          result: {
            state: "failed",
            reason: "delivery_worker_error",
            responseStatus:
              typeof error?.status === "number" ? error.status : null,
            errorMessage: truncateMessage(
              error?.message || "Unexpected delivery worker error"
            ),
          },
        };
      }
    });
    const settled = await Promise.allSettled(pending);
    settled.forEach((item) => {
      if (item.status === "fulfilled") {
        recordChannelDeliveryResult(summary, item.value?.target, item.value?.result);
        return;
      }
      recordChannelDeliveryResult(summary, null, {
        state: "failed",
        reason: "delivery_worker_rejected",
        errorMessage: truncateMessage(item.reason?.message || "Promise rejected"),
      });
    });
  }

  return summary;
};

const sendEmailToRecipient = async ({
  db,
  payload,
  emailConfig,
  recipientProfileCache,
  authHeaders = {},
}) => {
  const recipientId = toSafeText(payload?.recipientId);
  if (!recipientId) return { status: "skipped", reason: "missing_recipient" };
  if (!shouldDispatchEmailForPayload(payload)) {
    return { status: "disabled", reason: "disabled_by_payload" };
  }
  if (!emailConfig?.enabled || !emailConfig?.endpoint) {
    return { status: "disabled", reason: "channel_not_configured" };
  }

  const recipientProfile = await loadRecipientProfile(
    db,
    recipientId,
    recipientProfileCache
  );
  if (!recipientProfile) return { status: "skipped", reason: "recipient_not_found" };
  if (!isEmailAllowedByPreferences(recipientProfile)) {
    return { status: "disabled", reason: "disabled_by_user_preferences" };
  }

  const to = resolveRecipientEmailAddress({
    profile: recipientProfile,
    payload,
  });
  if (!to) return { status: "skipped", reason: "missing_email_address" };

  const subject = (
    toSafeText(payload?.title) || "A3 Hub Notification"
  ).slice(0, MAX_EMAIL_SUBJECT_LENGTH);
  const text = buildEmailText(payload);
  if (!text) return { status: "skipped", reason: "empty_message" };

  const response = await fetch(emailConfig.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders,
    },
    body: JSON.stringify({
      to,
      subject,
      text,
      title: toSafeText(payload?.title),
      message: toSafeText(payload?.message),
      link: toSafeText(payload?.link),
      type: toSafeText(payload?.type),
      recipientId,
    }),
  });

  const responseText = await response.text().catch(() => "");
  const parsedResponse = parseJsonSafe(responseText);

  if (!response.ok || parsedResponse?.ok === false) {
    const error = new Error(
      `Email send failed (${response.status})${responseText ? `: ${responseText}` : ""}`
    );
    error.status = response.status || 500;
    throw error;
  }

  return {
    status: "sent",
    reason: "sent",
    responseStatus: response.status,
    responseBody: parsedResponse,
  };
};

const sendEmailForRecipients = async (db, recipientTargets, payload) => {
  const emailConfig = resolveEmailClientConfig();
  const targets = normalizeRecipientTargets(recipientTargets, MAX_EMAIL_BULK_RECIPIENTS);
  const summary = createChannelDeliverySummary("email", targets.length);
  if (targets.length === 0) return summary;

  const authHeaders = await getNetlifyAuthHeaders();
  if (!authHeaders.Authorization) {
    await markDeliveryAuthFailure({
      db,
      targets,
      channel: "email",
    });
    targets.forEach((target) => {
      recordChannelDeliveryResult(summary, target, {
        state: "failed",
        reason: "missing_auth_token",
        responseStatus: 401,
        errorMessage: "Authenticated session required for server delivery.",
      });
    });
    return summary;
  }

  const recipientProfileCache = new Map();
  const chunks = toChunks(targets, EMAIL_SEND_CONCURRENCY);

  for (const chunk of chunks) {
    const pending = chunk.map(async (target) => {
      try {
        const result = await executeDeliveryWithRetry({
          channel: "email",
          sendOperation: () =>
            sendEmailToRecipient({
              db,
              payload: {
                ...payload,
                recipientId: target.recipientId,
                recipientEmail:
                  target.recipientEmail || payload?.recipientEmail || "",
              },
              emailConfig,
              recipientProfileCache,
              authHeaders,
            }),
        });

        await updateDeliveryLog({
          db,
          recipientId: target.recipientId,
          notificationId: target.notificationId,
          channel: "email",
          state: result.state,
          attemptCount: result.attemptCount,
          responseStatus: result.responseStatus,
          reason: result.reason,
          errorMessage: result.errorMessage,
        });

        if (result.state === "failed") {
          console.warn(
            "Email notification failed",
            target.recipientId,
            result.errorMessage || result.reason
          );
        }

        return { target, result };
      } catch (error) {
        return {
          target,
          result: {
            state: "failed",
            reason: "delivery_worker_error",
            responseStatus:
              typeof error?.status === "number" ? error.status : null,
            errorMessage: truncateMessage(
              error?.message || "Unexpected delivery worker error"
            ),
          },
        };
      }
    });
    const settled = await Promise.allSettled(pending);
    settled.forEach((item) => {
      if (item.status === "fulfilled") {
        recordChannelDeliveryResult(summary, item.value?.target, item.value?.result);
        return;
      }
      recordChannelDeliveryResult(summary, null, {
        state: "failed",
        reason: "delivery_worker_rejected",
        errorMessage: truncateMessage(item.reason?.message || "Promise rejected"),
      });
    });
  }

  return summary;
};

const sendPushToRecipient = async ({
  db,
  payload,
  pushConfig,
  recipientProfileCache,
  authHeaders = {},
}) => {
  const recipientId = toSafeText(payload?.recipientId);
  if (!recipientId) return { status: "skipped", reason: "missing_recipient" };
  if (!shouldDispatchPushForPayload(payload)) {
    return { status: "disabled", reason: "disabled_by_payload" };
  }
  if (!pushConfig?.enabled || !pushConfig?.endpoint) {
    return { status: "disabled", reason: "channel_not_configured" };
  }

  const recipientProfile = await loadRecipientProfile(
    db,
    recipientId,
    recipientProfileCache
  );
  if (!recipientProfile) return { status: "skipped", reason: "recipient_not_found" };
  if (!isPushAllowedByPreferences(recipientProfile)) {
    return { status: "disabled", reason: "disabled_by_user_preferences" };
  }
  if (isChannelBlockedByQuietHours(recipientProfile, "push")) {
    return { status: "quiet_hours", reason: "quiet_hours_active" };
  }

  const pushTokens = resolvePushTokens(recipientProfile);
  if (pushTokens.length === 0) return { status: "skipped", reason: "missing_push_token" };

  const response = await fetch(pushConfig.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders,
    },
    body: JSON.stringify({
      tokens: pushTokens,
      title: toSafeText(payload?.title) || "Notification",
      message: toSafeText(payload?.message),
      link: toSafeText(payload?.link),
      type: toSafeText(payload?.type),
      recipientId,
    }),
  });

  const responseText = await response.text().catch(() => "");
  const parsedResponse = parseJsonSafe(responseText);

  if (!response.ok) {
    const error = new Error(
      `Push send failed (${response.status})${responseText ? `: ${responseText}` : ""}`
    );
    error.status = response.status;
    throw error;
  }

  if (Number(parsedResponse?.success || 0) <= 0) {
    const error = new Error(
      `Push send returned no success${responseText ? `: ${responseText}` : ""}`
    );
    error.status = response.status || 500;
    throw error;
  }

  return {
    status: "sent",
    reason: "sent",
    responseStatus: response.status,
    responseBody: parsedResponse,
  };
};

const sendPushForRecipients = async (db, recipientTargets, payload) => {
  const pushConfig = resolvePushClientConfig();
  const targets = normalizeRecipientTargets(recipientTargets, MAX_PUSH_BULK_RECIPIENTS);
  const summary = createChannelDeliverySummary("push", targets.length);
  if (targets.length === 0) return summary;

  const authHeaders = await getNetlifyAuthHeaders();
  if (!authHeaders.Authorization) {
    await markDeliveryAuthFailure({
      db,
      targets,
      channel: "push",
    });
    targets.forEach((target) => {
      recordChannelDeliveryResult(summary, target, {
        state: "failed",
        reason: "missing_auth_token",
        responseStatus: 401,
        errorMessage: "Authenticated session required for server delivery.",
      });
    });
    return summary;
  }

  const recipientProfileCache = new Map();
  const chunks = toChunks(targets, PUSH_SEND_CONCURRENCY);

  for (const chunk of chunks) {
    const pending = chunk.map(async (target) => {
      try {
        const result = await executeDeliveryWithRetry({
          channel: "push",
          sendOperation: () =>
            sendPushToRecipient({
              db,
              payload: { ...payload, recipientId: target.recipientId },
              pushConfig,
              recipientProfileCache,
              authHeaders,
            }),
        });

        await updateDeliveryLog({
          db,
          recipientId: target.recipientId,
          notificationId: target.notificationId,
          channel: "push",
          state: result.state,
          attemptCount: result.attemptCount,
          responseStatus: result.responseStatus,
          reason: result.reason,
          errorMessage: result.errorMessage,
        });

        if (result.state === "failed") {
          console.warn(
            "Push notification failed",
            target.recipientId,
            result.errorMessage || result.reason
          );
        }

        return { target, result };
      } catch (error) {
        return {
          target,
          result: {
            state: "failed",
            reason: "delivery_worker_error",
            responseStatus:
              typeof error?.status === "number" ? error.status : null,
            errorMessage: truncateMessage(
              error?.message || "Unexpected delivery worker error"
            ),
          },
        };
      }
    });
    const settled = await Promise.allSettled(pending);
    settled.forEach((item) => {
      if (item.status === "fulfilled") {
        recordChannelDeliveryResult(summary, item.value?.target, item.value?.result);
        return;
      }
      recordChannelDeliveryResult(summary, null, {
        state: "failed",
        reason: "delivery_worker_rejected",
        errorMessage: truncateMessage(item.reason?.message || "Promise rejected"),
      });
    });
  }

  return summary;
};

const buildDeliveryState = (channels) => ({
  inApp: channels.inApp ? "sent" : "disabled",
  email: channels.email ? "pending" : "disabled",
  whatsapp: channels.whatsapp ? "pending" : "disabled",
  push: channels.push ? "pending" : "disabled",
});

const buildNotificationPayload = ({
  recipientId,
  type,
  title,
  message = "",
  link = "",
  sourceType = "",
  sourceId = "",
  topic = "",
  channels,
  priority = "normal",
}) => {
  const safeChannels = normalizeChannels(channels);
  const safeTitle = (title || "").trim() || "Notification";
  const safeMessage = (message || "").trim();
  const safePriority = normalizePriority(priority);

  return {
    recipientId,
    type: type || "general",
    topic: topic || type || "general",
    priority: safePriority,
    title: safeTitle,
    message: safeMessage,
    link: link || "",
    sourceType: sourceType || "",
    sourceId: sourceId || "",
    channels: safeChannels,
    delivery: buildDeliveryState(safeChannels),
    deliveryAttempts: {
      email: 0,
      whatsapp: 0,
      push: 0,
    },
    deliveryLastError: {
      email: "",
      whatsapp: "",
      push: "",
    },
    deliveryLastStatus: {
      email: null,
      whatsapp: null,
      push: null,
    },
    deliveryUpdatedAt: {
      email: null,
      whatsapp: null,
      push: null,
    },
    deliveryLogs: [],
    read: false,
    readAt: null,
    createdAt: serverTimestamp(),
    expiresAt: Timestamp.fromDate(new Date(Date.now() + NOTIFICATION_TTL_MS)),
  };
};

const toChunks = (items, chunkSize) => {
  const chunks = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }
  return chunks;
};

const buildDispatchSummary = (recipientCount = 0, channelSummaries = []) => {
  const byChannel = {};
  (channelSummaries || []).forEach((summary) => {
    const channel = toSafeText(summary?.channel);
    if (!channel) return;
    byChannel[channel] = summary;
  });
  const failedChannels = Object.values(byChannel)
    .filter(
      (summary) => toNumber(summary?.failed, 0) > 0 || toNumber(summary?.unknown, 0) > 0
    )
    .map((summary) => summary.channel);

  return {
    recipientCount: Math.max(0, toNumber(recipientCount, 0)),
    byChannel,
    failedChannels,
    hasFailures: failedChannels.length > 0,
    generatedAt: Date.now(),
  };
};

const mergeDispatchSummaries = (left, right) => {
  const merged = {
    recipientCount:
      toNumber(left?.recipientCount, 0) + toNumber(right?.recipientCount, 0),
    byChannel: {},
    failedChannels: [],
    hasFailures: false,
    generatedAt: Date.now(),
  };

  const channelKeys = new Set(
    Object.keys(left?.byChannel || {}).concat(Object.keys(right?.byChannel || {}))
  );
  channelKeys.forEach((channel) => {
    merged.byChannel[channel] = combineChannelDeliverySummaries(
      left?.byChannel?.[channel]
        ? { ...left.byChannel[channel], failures: [...(left.byChannel[channel].failures || [])] }
        : createChannelDeliverySummary(channel, 0),
      right?.byChannel?.[channel]
        ? {
            ...right.byChannel[channel],
            failures: [...(right.byChannel[channel].failures || [])],
          }
        : createChannelDeliverySummary(channel, 0)
    );
  });

  merged.failedChannels = Object.values(merged.byChannel)
    .filter(
      (summary) => toNumber(summary?.failed, 0) > 0 || toNumber(summary?.unknown, 0) > 0
    )
    .map((summary) => summary.channel);
  merged.hasFailures = merged.failedChannels.length > 0;

  return merged;
};

const dispatchNotificationDeliveries = async ({
  db,
  recipientTargets = [],
  payload = {},
}) => {
  const safeTargets = normalizeRecipientTargets(recipientTargets, MAX_BATCH_SIZE);
  if (safeTargets.length === 0) {
    return buildDispatchSummary(0, []);
  }

  const channelSummaries = await Promise.all([
    sendEmailForRecipients(db, safeTargets, payload),
    sendWhatsAppForRecipients(db, safeTargets, payload),
    sendPushForRecipients(db, safeTargets, payload),
  ]);

  return buildDispatchSummary(safeTargets.length, channelSummaries);
};

export async function createUserNotification(db, payload) {
  const recipientId = payload?.recipientId || "";
  if (!recipientId) {
    return buildDispatchSummary(0, []);
  }

  const deliveryMode = normalizeDeliveryMode(payload?.deliveryMode);
  const failOnDeliveryFailure =
    typeof payload?.failOnDeliveryFailure === "boolean"
      ? payload.failOnDeliveryFailure
      : false;

  const normalizedPayload = {
    ...payload,
    channels: normalizeChannels(payload?.channels),
    priority: normalizePriority(payload?.priority),
  };

  const notificationRef = doc(
    collection(db, "users", recipientId, "notifications")
  );
  await setDoc(notificationRef, buildNotificationPayload(normalizedPayload));

  const recipientTargets = [
    {
      recipientId,
      notificationId: notificationRef.id,
      recipientEmail: toSafeEmail(payload?.recipientEmail || payload?.email),
    },
  ];

  if (deliveryMode === DELIVERY_MODE_BACKGROUND) {
    void dispatchNotificationDeliveries({
      db,
      recipientTargets,
      payload: normalizedPayload,
    }).catch((error) => {
      console.warn(
        "Notification background delivery failed",
        recipientId,
        error?.message || error
      );
    });
    return {
      notificationId: notificationRef.id,
      deliveryMode,
      pending: true,
    };
  }

  const delivery = await dispatchNotificationDeliveries({
    db,
    recipientTargets,
    payload: normalizedPayload,
  });

  if (failOnDeliveryFailure && delivery.hasFailures) {
    const error = new Error("Notification delivery failed.");
    error.code = "notification/delivery-failed";
    error.delivery = delivery;
    throw error;
  }

  return {
    notificationId: notificationRef.id,
    deliveryMode,
    pending: false,
    delivery,
  };
}

export async function createBulkUserNotifications(
  db,
  {
    recipientIds = [],
    recipientContactById = {},
    type,
    title,
    message = "",
    link = "",
    sourceType = "",
    sourceId = "",
    topic = "",
    channels,
    priority = "normal",
    deliveryMode = DELIVERY_MODE_AWAIT,
    failOnDeliveryFailure = false,
  }
) {
  const uniqueRecipientIds = Array.from(
    new Set(
      recipientIds
        .map((id) => (id || "").trim())
        .filter((id) => id.length > 0)
    )
  );

  if (uniqueRecipientIds.length === 0) {
    return buildDispatchSummary(0, []);
  }

  const chunks = toChunks(uniqueRecipientIds, MAX_BATCH_SIZE);
  const normalizedDeliveryMode = normalizeDeliveryMode(deliveryMode);
  let combinedDelivery = buildDispatchSummary(0, []);
  const backgroundDispatchJobs = [];

  for (const chunk of chunks) {
    const batch = writeBatch(db);
    const recipientTargets = [];
    const normalizedChannels = normalizeChannels(channels);
    const normalizedPriority = normalizePriority(priority);
    chunk.forEach((recipientId) => {
      const notificationRef = doc(
        collection(db, "users", recipientId, "notifications")
      );
      const contactValue = recipientContactById?.[recipientId];
      const contactEmail =
        typeof contactValue === "string"
          ? contactValue
          : contactValue && typeof contactValue === "object"
          ? contactValue.email || contactValue.recipientEmail
          : "";
      recipientTargets.push({
        recipientId,
        notificationId: notificationRef.id,
        recipientEmail: toSafeEmail(contactEmail),
      });
      batch.set(
        notificationRef,
        buildNotificationPayload({
          recipientId,
          type,
          title,
          message,
          link,
          sourceType,
          sourceId,
          topic,
          channels: normalizedChannels,
          priority: normalizedPriority,
        })
      );
    });
    await batch.commit();

    const deliveryPayload = {
      type,
      title,
      message,
      link,
      sourceType,
      sourceId,
      topic,
      channels: normalizedChannels,
      priority: normalizedPriority,
    };

    if (normalizedDeliveryMode === DELIVERY_MODE_BACKGROUND) {
      const backgroundJob = dispatchNotificationDeliveries({
        db,
        recipientTargets,
        payload: deliveryPayload,
      }).catch((error) => {
        console.warn(
          "Bulk notification background delivery failed",
          error?.message || error
        );
        return buildDispatchSummary(recipientTargets.length, []);
      });
      backgroundDispatchJobs.push(backgroundJob);
      continue;
    }

    const chunkSummary = await dispatchNotificationDeliveries({
      db,
      recipientTargets,
      payload: deliveryPayload,
    });
    combinedDelivery = mergeDispatchSummaries(combinedDelivery, chunkSummary);
  }

  if (normalizedDeliveryMode === DELIVERY_MODE_BACKGROUND) {
    void Promise.allSettled(backgroundDispatchJobs);
    return {
      deliveryMode: normalizedDeliveryMode,
      pending: true,
      chunkCount: chunks.length,
      recipientCount: uniqueRecipientIds.length,
    };
  }

  if (failOnDeliveryFailure && combinedDelivery.hasFailures) {
    const error = new Error("Bulk notification delivery failed.");
    error.code = "notification/bulk-delivery-failed";
    error.delivery = combinedDelivery;
    throw error;
  }

  return {
    deliveryMode: normalizedDeliveryMode,
    pending: false,
    chunkCount: chunks.length,
    delivery: combinedDelivery,
  };
}

export async function getStudentRecipientIds(db, { departmentKey = "" } = {}) {
  const normalizedTarget = normalizeDepartment(departmentKey);

  const studentsSnapshot = await getDocs(
    query(collection(db, "users"), where("role", "==", "student"))
  );

  return studentsSnapshot.docs
    .filter((item) => {
      if (!normalizedTarget || normalizedTarget === "all") {
        return true;
      }
      const data = item.data();
      const studentDepartment = normalizeDepartment(
        data?.departmentKey || data?.department
      );
      return studentDepartment === normalizedTarget;
    })
    .map((item) => item.id);
}

export const notificationTypes = Object.freeze({
  LEAVE_DECISION: "leave_decision",
  NOTICE: "new_notice",
  EXAM_UPDATE: "exam_update",
  FEE_DUE: "fee_due",
  ATTENDANCE_STATUS: "attendance_status",
  MARKS_UPDATE: "marks_update",
  ATTENDANCE_REASON_REPLY: "attendance_reason_reply",
});
