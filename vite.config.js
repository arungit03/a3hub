import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import process from "node:process";

const toBoolean = (value) =>
  /^(1|true|yes|on)$/i.test(String(value || "").trim());

const createGetEnvValue = (envMap) =>
  (...keys) => {
    for (const key of keys) {
      const value = process.env[key] || envMap[key];
      if (typeof value === "string" && value.trim()) {
        return value.trim();
      }
    }
    return "";
  };

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const getEnvValue = createGetEnvValue(env);

  const cloudinaryCloudName = getEnvValue(
    "VITE_CLOUDINARY_CLOUD_NAME",
    "CLOUDINARY_CLOUD_NAME"
  );
  const cloudinaryUploadPreset = getEnvValue(
    "VITE_CLOUDINARY_UPLOAD_PRESET",
    "CLOUDINARY_UPLOAD_PRESET"
  );
  const whatsappNotifyEndpoint = getEnvValue(
    "VITE_WHATSAPP_NOTIFY_ENDPOINT",
    "WHATSAPP_NOTIFY_ENDPOINT"
  );
  const whatsappDefaultCountryCode = getEnvValue(
    "VITE_WHATSAPP_DEFAULT_COUNTRY_CODE",
    "WHATSAPP_DEFAULT_COUNTRY_CODE"
  );
  const whatsappNotifyEnabled = toBoolean(
    getEnvValue("VITE_WHATSAPP_NOTIFY_ENABLED", "WHATSAPP_NOTIFY_ENABLED")
  );

  return {
    plugins: [react()],
    define: {
      __CLOUDINARY_CLOUD_NAME__: JSON.stringify(cloudinaryCloudName),
      __CLOUDINARY_UPLOAD_PRESET__: JSON.stringify(cloudinaryUploadPreset),
      __WHATSAPP_NOTIFY_ENABLED__: JSON.stringify(whatsappNotifyEnabled),
      __WHATSAPP_NOTIFY_ENDPOINT__: JSON.stringify(whatsappNotifyEndpoint),
      __WHATSAPP_DEFAULT_COUNTRY_CODE__: JSON.stringify(
        whatsappDefaultCountryCode
      ),
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes("node_modules")) return undefined;
            const normalizedId = id.replaceAll("\\", "/");

            if (
              normalizedId.includes("/node_modules/react/") ||
              normalizedId.includes("/node_modules/react-dom/") ||
              normalizedId.includes("/node_modules/scheduler/")
            ) {
              return "react-core";
            }

            if (normalizedId.includes("/node_modules/react-router")) {
              return "router";
            }

            if (
              normalizedId.includes("/node_modules/firebase/") ||
              normalizedId.includes("/node_modules/@firebase/")
            ) {
              return "firebase";
            }

            if (
              normalizedId.includes("/node_modules/react-markdown/") ||
              normalizedId.includes("/node_modules/remark-gfm/") ||
              normalizedId.includes("/node_modules/micromark") ||
              normalizedId.includes("/node_modules/mdast-util-") ||
              normalizedId.includes("/node_modules/unist-util-")
            ) {
              return "markdown";
            }

            if (normalizedId.includes("/node_modules/jspdf/")) {
              return "pdf-jspdf";
            }

            if (normalizedId.includes("/node_modules/html2canvas/")) {
              return "pdf-html2canvas";
            }

            return undefined;
          },
        },
      },
    },
  };
});
