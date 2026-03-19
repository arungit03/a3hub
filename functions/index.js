const { onRequest } = require("firebase-functions/v2/https");
const { handler: aiGenerateHandler } = require("./netlify/functions/ai-generate.cjs");

const toHeaderValue = (value) => {
  if (Array.isArray(value)) return value.join(", ");
  if (value === undefined || value === null) return "";
  return String(value);
};

const getRawBody = (req) => {
  if (Buffer.isBuffer(req.rawBody)) {
    return req.rawBody.toString("utf8");
  }
  if (typeof req.rawBody === "string") {
    return req.rawBody;
  }
  if (typeof req.body === "string") {
    return req.body;
  }
  if (req.body === undefined || req.body === null) {
    return "";
  }
  try {
    return JSON.stringify(req.body);
  } catch {
    return "";
  }
};

const buildNetlifyEventFromRequest = (req) => ({
  httpMethod: toHeaderValue(req.method) || "GET",
  headers: Object.fromEntries(
    Object.entries(req.headers || {}).map(([key, value]) => [key, toHeaderValue(value)])
  ),
  body: getRawBody(req),
  path: toHeaderValue(req.path),
  rawUrl: toHeaderValue(req.originalUrl || req.url),
  queryStringParameters:
    req.query && typeof req.query === "object" ? req.query : {},
  clientContext: {
    ip: toHeaderValue(req.ip),
  },
  requestContext: {
    identity: {
      sourceIp: toHeaderValue(req.ip),
    },
  },
});

const applyNetlifyResponse = (res, response) => {
  const statusCode = Number(response?.statusCode) || 200;
  const headers =
    response?.headers && typeof response.headers === "object"
      ? response.headers
      : {};

  Object.entries(headers).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    res.setHeader(key, toHeaderValue(value));
  });

  res.status(statusCode).send(response?.body ?? "");
};

exports.aiGenerate = onRequest(
  {
    region: "us-central1",
    cors: true,
  },
  async (req, res) => {
    const event = buildNetlifyEventFromRequest(req);
    const response = await aiGenerateHandler(event);
    applyNetlifyResponse(res, response);
  }
);
