import {
  getDownloadURL,
  ref,
  uploadBytesResumable,
} from "firebase/storage";
import { uploadFileToCloudinary } from "./cloudinaryUpload";
import {
  ensureFirebaseStorage,
  getStorageForBucket,
  storageBuckets,
} from "./firebase";

const toSafeText = (value) => String(value || "").trim();
const IMAGE_QUALITY_STEPS = [0.9, 0.82, 0.74, 0.66];
const DEFAULT_IMAGE_TARGET_BYTES = 900 * 1024;
const DEFAULT_IMAGE_MAX_DIMENSION = 1600;
const INLINE_IMAGE_FALLBACK_TARGET_BYTES = 280 * 1024;
const INLINE_IMAGE_FALLBACK_MAX_DIMENSION = 1280;
const MAX_INLINE_IMAGE_DATA_URL_BYTES = 420 * 1024;
const STORAGE_UPLOAD_TIMEOUT_MS = 12000;
const STORAGE_DOWNLOAD_URL_TIMEOUT_MS = 8000;

const sanitizePathSegment = (value, fallback = "file") => {
  const safeValue = toSafeText(value)
    .replace(/[\\/:*?"<>|#%]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return safeValue || fallback;
};

const buildStoragePath = ({ folder, file }) => {
  const safeFolder = (toSafeText(folder) || "a3hub/uploads")
    .split("/")
    .map((segment) => sanitizePathSegment(segment, "uploads"))
    .filter(Boolean)
    .join("/");
  const safeName = sanitizePathSegment(file?.name || "upload");
  return `${safeFolder}/${Date.now()}_${safeName}`;
};

const shouldRetryWithNextBucket = (error) => {
  const code = error?.code || "";
  if (
    code === "storage/bucket-not-found" ||
    code === "storage/project-not-found" ||
    code === "storage/invalid-argument"
  ) {
    return true;
  }

  return /bucket/i.test(String(error?.message || ""));
};

const createUploadError = (message, code) => {
  const error = new Error(message || "Upload failed.");
  error.code = code;
  return error;
};

const withTimeout = (promise, timeoutMs, errorFactory) =>
  new Promise((resolve, reject) => {
    const timerId = setTimeout(() => {
      reject(errorFactory());
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timerId);
        resolve(value);
      },
      (error) => {
        clearTimeout(timerId);
        reject(error);
      }
    );
  });

const readFileAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Unable to read the selected image."));
    reader.readAsDataURL(file);
  });

const getDataUrlBytes = (dataUrl) => {
  const safeDataUrl = String(dataUrl || "");
  const commaIndex = safeDataUrl.indexOf(",");
  if (commaIndex < 0) return safeDataUrl.length;
  const base64Length = safeDataUrl.length - commaIndex - 1;
  return Math.ceil((base64Length * 3) / 4);
};

const isImageFile = (file) =>
  file instanceof File &&
  String(file.type || "").toLowerCase().startsWith("image/");

const loadImageFile = (file) =>
  new Promise((resolve, reject) => {
    if (typeof URL === "undefined") {
      reject(new Error("Image processing is not supported in this browser."));
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Unable to process the selected image."));
    };
    image.src = objectUrl;
  });

const fitImageDimensions = (width, height, maxDimension) => {
  if (!width || !height) {
    return {
      width: maxDimension,
      height: maxDimension,
    };
  }

  const ratio = Math.min(1, maxDimension / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  };
};

const canvasToBlob = (canvas, mimeType, quality) =>
  new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
          return;
        }
        reject(new Error("Unable to prepare the image for upload."));
      },
      mimeType,
      mimeType === "image/png" ? undefined : quality
    );
  });

const getFileExtensionForMimeType = (mimeType) => {
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/jpeg") return "jpg";
  return "";
};

const buildOptimizedImageName = (name, mimeType) => {
  const safeName = toSafeText(name) || "image";
  const extension = getFileExtensionForMimeType(mimeType);
  const baseName = safeName.replace(/\.[^.]+$/, "") || "image";
  return extension ? `${baseName}.${extension}` : safeName;
};

export const optimizeImageFileForUpload = async ({
  file,
  targetBytes = DEFAULT_IMAGE_TARGET_BYTES,
  maxDimension = DEFAULT_IMAGE_MAX_DIMENSION,
} = {}) => {
  if (
    !(file instanceof File) ||
    typeof document === "undefined" ||
    !String(file.type || "").toLowerCase().startsWith("image/")
  ) {
    return file;
  }

  const mimeType = String(file.type || "").toLowerCase();
  if (mimeType === "image/gif" || mimeType === "image/svg+xml") {
    return file;
  }

  if (Number(file.size || 0) <= targetBytes) {
    return file;
  }

  const image = await loadImageFile(file);
  const { width, height } = fitImageDimensions(
    image.naturalWidth,
    image.naturalHeight,
    maxDimension
  );

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Image processing is not supported in this browser.");
  }

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, 0, 0, width, height);

  const mimeCandidates = [
    mimeType === "image/png" ? "image/png" : "",
    "image/webp",
    "image/jpeg",
  ].filter((value, index, array) => value && array.indexOf(value) === index);

  let bestBlob = file;
  let bestMimeType = mimeType;

  for (const candidateMimeType of mimeCandidates) {
    for (const quality of IMAGE_QUALITY_STEPS) {
      const candidateBlob = await canvasToBlob(canvas, candidateMimeType, quality);
      if (candidateBlob.size < bestBlob.size) {
        bestBlob = candidateBlob;
        bestMimeType = candidateMimeType;
      }
      if (candidateBlob.size <= targetBytes) {
        return new File(
          [candidateBlob],
          buildOptimizedImageName(file.name, candidateMimeType),
          {
            type: candidateMimeType,
            lastModified: file.lastModified,
          }
        );
      }
    }
  }

  if (bestBlob === file) {
    return file;
  }

  return new File([bestBlob], buildOptimizedImageName(file.name, bestMimeType), {
    type: bestMimeType,
    lastModified: file.lastModified,
  });
};

const buildInlineImageAsset = async (file) => {
  const fallbackFile = await optimizeImageFileForUpload({
    file,
    targetBytes: INLINE_IMAGE_FALLBACK_TARGET_BYTES,
    maxDimension: INLINE_IMAGE_FALLBACK_MAX_DIMENSION,
  });
  const dataUrl = await readFileAsDataUrl(fallbackFile);
  const dataUrlBytes = getDataUrlBytes(dataUrl);

  if (dataUrlBytes > MAX_INLINE_IMAGE_DATA_URL_BYTES) {
    throw createUploadError(
      "Image is still too large to save directly. Choose a smaller image.",
      "upload/inline-too-large"
    );
  }

  return {
    url: dataUrl,
    provider: "inline-data-url",
    bytes: Number(fallbackFile.size || 0),
    format: toSafeText(fallbackFile.name).split(".").pop()?.toLowerCase() || "",
    resourceType: "image",
  };
};

const uploadBytesWithTimeout = (storageRef, file, metadata) =>
  new Promise((resolve, reject) => {
    const uploadTask = uploadBytesResumable(storageRef, file, metadata);
    const timeoutId = setTimeout(() => {
      uploadTask.cancel();
      reject(
        createUploadError(
          "Firebase Storage upload timed out.",
          "storage/upload-timeout"
        )
      );
    }, STORAGE_UPLOAD_TIMEOUT_MS);

    uploadTask.on(
      "state_changed",
      undefined,
      (error) => {
        clearTimeout(timeoutId);
        if (error?.code === "storage/canceled") {
          reject(
            createUploadError(
              "Firebase Storage upload timed out.",
              "storage/upload-timeout"
            )
          );
          return;
        }
        reject(error);
      },
      () => {
        clearTimeout(timeoutId);
        resolve(uploadTask.snapshot);
      }
    );
  });

export const uploadFileToFirebaseStorage = async ({
  file,
  folder = "a3hub/uploads",
}) => {
  if (!file) {
    throw createUploadError("No file selected for upload.", "cloudinary/no-file");
  }

  const buckets = storageBuckets?.length ? storageBuckets : [];
  if (buckets.length === 0) {
    throw createUploadError(
      "Firebase Storage is not configured for uploads.",
      "storage/bucket-not-configured"
    );
  }

  const uploadPath = buildStoragePath({ folder, file });
  let lastError = null;

  for (let index = 0; index < buckets.length; index += 1) {
    const bucket = buckets[index];
    const bucketStorage =
      index === 0
        ? await ensureFirebaseStorage()
        : await getStorageForBucket(bucket);

    if (!bucketStorage) {
      throw createUploadError(
        "Firebase Storage is not configured for uploads.",
        "storage/bucket-not-configured"
      );
    }

    const storageRef = ref(bucketStorage, uploadPath);

    try {
      await uploadBytesWithTimeout(storageRef, file, {
        contentType: file.type || undefined,
        customMetadata: {
          originalName: toSafeText(file.name || uploadPath),
        },
      });
      const url = await withTimeout(
        getDownloadURL(storageRef),
        STORAGE_DOWNLOAD_URL_TIMEOUT_MS,
        () =>
          createUploadError(
            "Unable to finalize the image upload.",
            "storage/download-url-timeout"
          )
      );

      return {
        url,
        bucket,
        path: storageRef.fullPath,
        provider: "firebase-storage",
        bytes: Number(file.size || 0),
        format: toSafeText(file.name).split(".").pop()?.toLowerCase() || "",
        resourceType: toSafeText(file.type).split("/")[0] || "",
      };
    } catch (error) {
      lastError = error;
      if (!shouldRetryWithNextBucket(error)) {
        throw error;
      }
    }
  }

  throw lastError || createUploadError("Upload failed.", "storage/unknown");
};

export const uploadFileWithFallbacks = async ({
  file,
  folder = "a3hub/uploads",
  allowInlineImageFallback = false,
}) => {
  if (!file) {
    throw createUploadError("No file selected for upload.", "cloudinary/no-file");
  }

  let cloudinaryError = null;

  try {
    return await uploadFileToCloudinary({ file, folder });
  } catch (error) {
    cloudinaryError = error;
  }

  try {
    return await uploadFileToFirebaseStorage({ file, folder });
  } catch (storageError) {
    if (allowInlineImageFallback && isImageFile(file)) {
      return buildInlineImageAsset(file);
    }

    if (!cloudinaryError || cloudinaryError.code === "cloudinary/not-configured") {
      throw storageError;
    }

    const combinedError = createUploadError(
      storageError?.message || cloudinaryError?.message || "Upload failed.",
      storageError?.code || cloudinaryError?.code || "upload/no-provider"
    );
    combinedError.primaryError = storageError;
    combinedError.fallbackError = cloudinaryError;
    throw combinedError;
  }
};
