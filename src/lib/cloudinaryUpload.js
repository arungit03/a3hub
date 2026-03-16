const getRequiredEnv = (key) => {
  const value = import.meta.env[key];
  return typeof value === "string" ? value.trim() : "";
};

const pickFirstNonEmpty = (...values) => {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
};

const getDefinedCloudName = () =>
  typeof __CLOUDINARY_CLOUD_NAME__ === "string"
    ? __CLOUDINARY_CLOUD_NAME__.trim()
    : "";

const getDefinedUploadPreset = () =>
  typeof __CLOUDINARY_UPLOAD_PRESET__ === "string"
    ? __CLOUDINARY_UPLOAD_PRESET__.trim()
    : "";

const getRuntimeConfig = () => {
  if (typeof window === "undefined") return {};
  const config =
    window.__CKCET_CLOUDINARY_CONFIG__ || window.__CLOUDINARY_CONFIG__;
  if (!config || typeof config !== "object") return {};
  return config;
};

const resolveCloudinaryConfig = () => {
  const runtimeConfig = getRuntimeConfig();
  const cloudName = pickFirstNonEmpty(
    getRequiredEnv("VITE_CLOUDINARY_CLOUD_NAME"),
    getDefinedCloudName(),
    runtimeConfig.cloudName,
    runtimeConfig.cloud_name
  );

  const uploadPreset = pickFirstNonEmpty(
    getRequiredEnv("VITE_CLOUDINARY_UPLOAD_PRESET"),
    getDefinedUploadPreset(),
    runtimeConfig.uploadPreset,
    runtimeConfig.upload_preset
  );

  return { cloudName, uploadPreset };
};

const ensureConfigured = () => {
  const config = resolveCloudinaryConfig();
  if (config.cloudName && config.uploadPreset) return config;

  const error = new Error(
    "Cloud upload is not configured. Set Cloudinary values in Netlify env and redeploy, or set them in public/cloudinary-config.js."
  );
  error.code = "cloudinary/not-configured";
  throw error;
};

const buildUploadEndpoint = (cloudName) =>
  `https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`;

const buildUploadError = (message, code = "cloudinary/upload-failed") => {
  const error = new Error(message || "Unable to upload file.");
  error.code = code;
  return error;
};

export async function uploadFileToCloudinary({
  file,
  folder = "ckcethub/assignments",
}) {
  const config = ensureConfigured();

  if (!file) {
    throw buildUploadError("No file selected for upload.", "cloudinary/no-file");
  }

  const payload = new FormData();
  payload.append("file", file);
  payload.append("upload_preset", config.uploadPreset);
  if (folder) {
    payload.append("folder", folder);
  }

  let response;
  try {
    response = await fetch(buildUploadEndpoint(config.cloudName), {
      method: "POST",
      body: payload,
    });
  } catch {
    throw buildUploadError(
      "Network issue while uploading file. Please try again.",
      "cloudinary/network-error"
    );
  }

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok || !data?.secure_url) {
    const message =
      data?.error?.message ||
      "Upload failed. Check Cloudinary unsigned upload preset settings.";
    throw buildUploadError(message);
  }

  return {
    url: data.secure_url,
    publicId: data.public_id || "",
    provider: "cloudinary",
    bytes: Number.isFinite(data.bytes) ? data.bytes : file.size,
    format: data.format || "",
    resourceType: data.resource_type || "",
  };
}
