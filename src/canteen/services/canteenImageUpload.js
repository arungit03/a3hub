const MAX_MENU_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
const MAX_PROCESSED_IMAGE_BYTES = 380 * 1024;
const MAX_IMAGE_DIMENSION = 1200;
const PROCESS_QUALITY_STEPS = [0.9, 0.82, 0.74, 0.66, 0.58];

export const validateMenuImageFile = (file) => {
  if (!(file instanceof File)) {
    throw new Error("Choose an image file first.");
  }
  if (!String(file.type || "").toLowerCase().startsWith("image/")) {
    throw new Error("Only image files are allowed.");
  }
  if (Number(file.size || 0) > MAX_MENU_IMAGE_SIZE_BYTES) {
    throw new Error("Image must be 5 MB or smaller.");
  }
};

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

const loadBitmapImage = (dataUrl) =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Unable to process the selected image."));
    image.src = dataUrl;
  });

const fitDimensions = (width, height) => {
  if (!width || !height) {
    return { width: MAX_IMAGE_DIMENSION, height: MAX_IMAGE_DIMENSION };
  }

  const ratio = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  };
};

const canvasToDataUrl = (canvas, mimeType, quality) => {
  if (mimeType === "image/png") {
    return canvas.toDataURL(mimeType);
  }
  return canvas.toDataURL(mimeType, quality);
};

export const prepareMenuItemImage = async (file) => {
  validateMenuImageFile(file);

  const sourceDataUrl = await readFileAsDataUrl(file);
  const mimeType = String(file.type || "").toLowerCase();

  if (mimeType === "image/gif" || mimeType === "image/svg+xml") {
    if (getDataUrlBytes(sourceDataUrl) > MAX_PROCESSED_IMAGE_BYTES) {
      throw new Error("GIF or SVG image is too large. Choose a smaller file.");
    }
    return sourceDataUrl;
  }

  const image = await loadBitmapImage(sourceDataUrl);
  const { width, height } = fitDimensions(image.naturalWidth, image.naturalHeight);
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

  const mimeCandidates =
    mimeType === "image/png" ? ["image/webp", "image/png"] : ["image/webp", "image/jpeg"];

  let bestDataUrl = sourceDataUrl;
  let bestBytes = getDataUrlBytes(sourceDataUrl);

  for (const candidateMimeType of mimeCandidates) {
    for (const quality of PROCESS_QUALITY_STEPS) {
      const nextDataUrl = canvasToDataUrl(canvas, candidateMimeType, quality);
      const nextBytes = getDataUrlBytes(nextDataUrl);
      if (nextBytes < bestBytes) {
        bestDataUrl = nextDataUrl;
        bestBytes = nextBytes;
      }
      if (nextBytes <= MAX_PROCESSED_IMAGE_BYTES) {
        return nextDataUrl;
      }
    }
  }

  if (bestBytes > MAX_PROCESSED_IMAGE_BYTES) {
    throw new Error("Image is too large after processing. Choose a smaller image.");
  }

  return bestDataUrl;
};
