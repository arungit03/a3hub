const encodeBase64Url = (value) => {
  if (typeof globalThis.btoa !== "function") return "";

  const utf8Value = encodeURIComponent(String(value)).replace(
    /%([0-9A-F]{2})/g,
    (_, hex) => String.fromCharCode(Number.parseInt(hex, 16))
  );

  return globalThis
    .btoa(utf8Value)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
};

const extractGoogleDriveId = (url) => {
  const directId = url.searchParams.get("id");
  if (directId) return directId;

  const pathMatch =
    url.pathname.match(/\/file\/d\/([^/]+)/) ||
    url.pathname.match(/\/d\/([^/]+)/);

  return pathMatch?.[1] || "";
};

const buildGithubRawUrl = (url) => {
  if (url.hostname.toLowerCase() !== "github.com") return "";
  const pathMatch = url.pathname.match(/^\/([^/]+)\/([^/]+)\/blob\/(.+)$/);
  if (!pathMatch) return "";

  const [, owner, repo, rest] = pathMatch;
  return `https://raw.githubusercontent.com/${owner}/${repo}/${rest}`;
};

const buildDropboxRawUrl = (url) => {
  if (!url.hostname.toLowerCase().includes("dropbox.com")) return "";
  const nextUrl = new URL(url.toString());
  nextUrl.searchParams.delete("dl");
  nextUrl.searchParams.set("raw", "1");
  return nextUrl.toString();
};

const buildGoogleDriveCandidates = (url) => {
  const driveId = extractGoogleDriveId(url);
  if (!driveId) return [];

  return [
    `https://drive.google.com/thumbnail?id=${driveId}&sz=w1600`,
    `https://drive.google.com/uc?export=view&id=${driveId}`,
    `https://lh3.googleusercontent.com/d/${driveId}=w1600`,
  ];
};

const buildOneDriveCandidate = (rawValue, url) => {
  const host = url.hostname.toLowerCase();
  if (
    host !== "1drv.ms" &&
    !host.endsWith(".1drv.ms") &&
    !host.includes("onedrive.live.com")
  ) {
    return "";
  }

  const shareToken = encodeBase64Url(rawValue);
  if (!shareToken) return "";
  return `https://api.onedrive.com/v1.0/shares/u!${shareToken}/root/content`;
};

const dedupeCandidates = (items) => [...new Set(items.filter(Boolean))];

export const buildRemoteImageCandidates = (value) => {
  const rawValue = String(value || "").trim();
  if (!rawValue) return [];

  if (/^(data|blob):/i.test(rawValue)) {
    return [rawValue];
  }

  try {
    const parsedUrl = new URL(rawValue);

    return dedupeCandidates([
      parsedUrl.toString(),
      ...buildGoogleDriveCandidates(parsedUrl),
      buildDropboxRawUrl(parsedUrl),
      buildOneDriveCandidate(rawValue, parsedUrl),
      buildGithubRawUrl(parsedUrl),
    ]);
  } catch {
    return [rawValue];
  }
};

export const normalizeRemoteImageUrl = (value) =>
  buildRemoteImageCandidates(value)[0] || "";
