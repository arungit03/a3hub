const toSafeText = (value) => (typeof value === "string" ? value.trim() : "");

const parseJsonSafe = (value) => {
  try {
    return value ? JSON.parse(value) : {};
  } catch {
    return { raw: value || "" };
  }
};

const normalizeProviderList = (value) =>
  Array.from(
    new Set(
      String(value || "")
        .split(",")
        .map((item) => toSafeText(item).toLowerCase())
        .filter(Boolean)
    )
  );

const selectProviderOrder = ({
  explicitOrder = "",
  defaultOrder = [],
  supportedProviders = [],
}) => {
  const allowed = new Set(
    (Array.isArray(supportedProviders) ? supportedProviders : [])
      .map((item) => toSafeText(item).toLowerCase())
      .filter(Boolean)
  );

  const fromEnv = normalizeProviderList(explicitOrder).filter((item) =>
    allowed.has(item)
  );
  const fromDefault = (Array.isArray(defaultOrder) ? defaultOrder : [])
    .map((item) => toSafeText(item).toLowerCase())
    .filter((item) => allowed.has(item));

  const merged = Array.from(new Set(fromEnv.concat(fromDefault)));
  return merged.length > 0 ? merged : fromDefault;
};

const pickFailureStatus = (attempts = []) => {
  const statuses = attempts
    .map((item) => Number(item?.status || 0))
    .filter((status) => status > 0);
  if (statuses.length === 0) return 502;
  const serverError = statuses.find((status) => status >= 500);
  if (serverError) return serverError;
  return statuses[statuses.length - 1];
};

const runProviderChain = async ({ providers = [], runProvider }) => {
  const attempts = [];

  for (const provider of providers) {
    try {
      const result = await runProvider(provider);
      const status = Number(result?.status || (result?.ok ? 200 : 500));
      const details = result?.details || {};

      attempts.push({
        provider,
        ok: Boolean(result?.ok),
        status,
        details,
      });

      if (result?.ok) {
        return {
          ok: true,
          provider,
          result,
          attempts,
        };
      }
    } catch (error) {
      attempts.push({
        provider,
        ok: false,
        status: Number(error?.status || 500),
        details: {
          error: toSafeText(error?.message) || "Provider execution failed.",
          code: toSafeText(error?.code),
        },
      });
    }
  }

  return {
    ok: false,
    statusCode: pickFailureStatus(attempts),
    attempts,
  };
};

const invokeJsonWebhook = async ({
  url,
  payload,
  authToken = "",
  method = "POST",
}) => {
  const targetUrl = toSafeText(url);
  if (!targetUrl) {
    return {
      ok: false,
      status: 500,
      details: { error: "Webhook URL is not configured." },
    };
  }

  const headers = {
    "content-type": "application/json",
  };
  const token = toSafeText(authToken);
  if (token) {
    headers.authorization = `Bearer ${token}`;
  }

  const response = await fetch(targetUrl, {
    method,
    headers,
    body: JSON.stringify(payload || {}),
  });
  const rawText = await response.text();
  const parsed = parseJsonSafe(rawText);

  return {
    ok: response.ok,
    status: response.status,
    details: parsed,
  };
};

module.exports = {
  parseJsonSafe,
  runProviderChain,
  selectProviderOrder,
  toSafeText,
  invokeJsonWebhook,
};
