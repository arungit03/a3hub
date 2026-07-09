const fs = require("node:fs");
const path = require("node:path");

let loaded = false;

const toSafeText = (value) => (typeof value === "string" ? value.trim() : "");

const parseEnvLine = (line) => {
  const trimmed = toSafeText(line);
  if (!trimmed || trimmed.startsWith("#")) return null;

  const normalized = trimmed.startsWith("export ")
    ? trimmed.slice("export ".length)
    : trimmed;
  const separatorIndex = normalized.indexOf("=");
  if (separatorIndex <= 0) return null;

  const key = toSafeText(normalized.slice(0, separatorIndex));
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return null;

  let value = normalized.slice(separatorIndex + 1);
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }

  return {
    key,
    value: value.replace(/\\n/g, "\n"),
  };
};

const loadEnvFile = (filePath) => {
  if (!fs.existsSync(filePath)) return;

  const raw = fs.readFileSync(filePath, "utf8");
  raw.split(/\r?\n/).forEach((line) => {
    const entry = parseEnvLine(line);
    if (!entry || Object.prototype.hasOwnProperty.call(process.env, entry.key)) {
      return;
    }
    process.env[entry.key] = entry.value;
  });
};

const loadLocalEnv = () => {
  if (loaded) return;
  loaded = true;

  const rootDir = path.resolve(__dirname, "../../..");
  const nodeEnv = toSafeText(process.env.NODE_ENV);
  const candidates = [
    nodeEnv ? `.env.${nodeEnv}.local` : "",
    ".env.local",
    nodeEnv ? `.env.${nodeEnv}` : "",
    ".env",
  ].filter(Boolean);

  candidates.forEach((filename) => {
    loadEnvFile(path.join(rootDir, filename));
  });
};

loadLocalEnv();

module.exports = {
  loadLocalEnv,
};
