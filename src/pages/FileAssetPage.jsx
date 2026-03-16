import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { collection, doc, getDoc, getDocs, orderBy, query } from "firebase/firestore";
import { db } from "../lib/firebase";

const decodeName = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "downloaded-file";
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
};

const base64ToBlob = (base64Value, mimeType) => {
  const safeBase64 = String(base64Value || "");
  const binary = atob(safeBase64);
  const sliceSize = 1024;
  const byteArrays = [];

  for (let offset = 0; offset < binary.length; offset += sliceSize) {
    const slice = binary.slice(offset, offset + sliceSize);
    const byteNumbers = new Array(slice.length);
    for (let index = 0; index < slice.length; index += 1) {
      byteNumbers[index] = slice.charCodeAt(index);
    }
    byteArrays.push(new Uint8Array(byteNumbers));
  }

  return new Blob(byteArrays, {
    type: mimeType || "application/octet-stream",
  });
};

const formatFileSize = (bytes) => {
  const size = Number(bytes || 0);
  if (!Number.isFinite(size) || size <= 0) return "";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

const getFileExtension = (name) => {
  const safeName = String(name || "").trim();
  const dotIndex = safeName.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex === safeName.length - 1) return "";
  return safeName.slice(dotIndex + 1).toLowerCase();
};

const getFileTypeLabel = (mimeType, fileName) => {
  const safeMimeType = String(mimeType || "").toLowerCase();
  if (safeMimeType === "application/pdf") return "PDF";
  if (safeMimeType.startsWith("image/")) return "Image";
  if (safeMimeType.startsWith("video/")) return "Video";
  if (safeMimeType.startsWith("audio/")) return "Audio";
  if (safeMimeType.startsWith("text/")) return "Text";

  const extension = getFileExtension(fileName);
  if (extension) return extension.toUpperCase();
  return "File";
};

const getPreviewMode = (mimeType, fileName) => {
  const safeMimeType = String(mimeType || "").toLowerCase();
  const extension = getFileExtension(fileName);

  if (safeMimeType.startsWith("image/")) return "image";
  if (safeMimeType.startsWith("video/")) return "video";
  if (safeMimeType.startsWith("audio/")) return "audio";
  if (safeMimeType.startsWith("text/")) return "text";
  if (safeMimeType === "application/pdf") return "pdf";

  if (["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"].includes(extension)) {
    return "image";
  }
  if (["mp4", "webm", "mov", "m4v"].includes(extension)) {
    return "video";
  }
  if (["mp3", "wav", "ogg", "m4a"].includes(extension)) {
    return "audio";
  }
  if (["txt", "csv", "json", "xml", "md", "js", "ts", "html", "css"].includes(extension)) {
    return "text";
  }
  if (extension === "pdf") return "pdf";

  return "";
};

export default function FileAssetPage() {
  const { fileId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [downloadUrl, setDownloadUrl] = useState("");
  const [fileName, setFileName] = useState("downloaded-file");
  const [fileType, setFileType] = useState("");
  const [fileSize, setFileSize] = useState(0);
  const [previewMode, setPreviewMode] = useState("");
  const [textPreview, setTextPreview] = useState("");

  useEffect(() => {
    if (!fileId) {
      setLoading(false);
      setError("Invalid file link.");
      return undefined;
    }

    let active = true;
    let objectUrl = "";

    const load = async () => {
      setLoading(true);
      setError("");

      try {
        const metadataRef = doc(db, "uploadedFiles", fileId);
        const metadataSnapshot = await getDoc(metadataRef);
        if (!metadataSnapshot.exists()) {
          throw new Error("File not found.");
        }

        const metadata = metadataSnapshot.data();
        const requestedName = decodeName(searchParams.get("name"));
        const resolvedName = requestedName || metadata?.name || "downloaded-file";

        const chunksSnapshot = await getDocs(
          query(
            collection(db, "uploadedFiles", fileId, "chunks"),
            orderBy("index", "asc")
          )
        );

        if (chunksSnapshot.empty) {
          throw new Error("File content is missing.");
        }

        const base64Payload = chunksSnapshot.docs
          .map((item) => String(item.data()?.data || ""))
          .join("");

        if (!base64Payload) {
          throw new Error("File content is empty.");
        }

        const blob = base64ToBlob(base64Payload, metadata?.mimeType || "");
        objectUrl = URL.createObjectURL(blob);

        if (!active) {
          URL.revokeObjectURL(objectUrl);
          return;
        }

        setFileName(resolvedName);
        setDownloadUrl(objectUrl);
        const resolvedMimeType = String(metadata?.mimeType || "");
        setFileType(resolvedMimeType);
        setFileSize(Number(metadata?.size || 0));
        const resolvedPreviewMode = getPreviewMode(resolvedMimeType, resolvedName);
        setPreviewMode(resolvedPreviewMode);
        if (resolvedPreviewMode === "text" && blob.size <= 350 * 1024) {
          const text = await blob.text();
          if (active) {
            setTextPreview(text);
          }
        } else {
          setTextPreview("");
        }
      } catch (loadError) {
        if (!active) return;
        setError(loadError?.message || "Unable to load file.");
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      active = false;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [fileId, searchParams]);

  return (
    <div className="inner-theme min-h-screen bg-gradient-to-br from-mist via-sand to-mist px-4 py-8">
      <div className="mx-auto w-full max-w-lg rounded-2xl border border-clay/30 bg-white/90 p-5 shadow-soft">
        <p className="text-xs uppercase tracking-[0.2em] text-ink/70">File Access</p>
        <h1 className="mt-2 text-xl font-semibold text-ink">Open / Download File</h1>

        {loading ? (
          <p className="mt-4 text-sm text-ink/75">Preparing file...</p>
        ) : error ? (
          <p className="mt-4 text-sm font-semibold text-ink/80">{error}</p>
        ) : (
          <div className="mt-4 grid gap-3">
            <p className="text-sm text-ink/80">
              File is ready: <span className="font-semibold">{fileName}</span>
            </p>
            <div className="flex flex-wrap items-center gap-2 text-xs text-ink/75">
              <span className="rounded-full border border-clay/30 bg-sand/70 px-2 py-1">
                Type: {getFileTypeLabel(fileType, fileName)}
              </span>
              {formatFileSize(fileSize) ? (
                <span className="rounded-full border border-clay/30 bg-sand/70 px-2 py-1">
                  Size: {formatFileSize(fileSize)}
                </span>
              ) : null}
            </div>

            {previewMode === "image" ? (
              <img
                src={downloadUrl}
                alt={fileName}
                className="max-h-[420px] w-full rounded-xl border border-clay/20 bg-white object-contain"
              />
            ) : null}
            {previewMode === "pdf" ? (
              <iframe
                title={fileName}
                src={downloadUrl}
                className="h-[420px] w-full rounded-xl border border-clay/20 bg-white"
              />
            ) : null}
            {previewMode === "video" ? (
              <video
                controls
                src={downloadUrl}
                className="max-h-[420px] w-full rounded-xl border border-clay/20 bg-black/80"
              />
            ) : null}
            {previewMode === "audio" ? (
              <audio controls src={downloadUrl} className="w-full" />
            ) : null}
            {previewMode === "text" ? (
              textPreview ? (
                <pre className="max-h-[420px] overflow-auto rounded-xl border border-clay/20 bg-cream/70 p-3 text-xs text-ink/85">
                  {textPreview}
                </pre>
              ) : (
                <a
                  href={downloadUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex justify-center rounded-xl border border-clay/35 bg-white px-4 py-2 text-sm font-semibold text-ink/80"
                >
                  Open text file
                </a>
              )
            ) : null}
            {!previewMode ? (
              <p className="text-sm text-ink/75">
                Preview not available for this file type. Use download or open in new tab.
              </p>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <a
                href={downloadUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex justify-center rounded-xl border border-clay/35 bg-white px-4 py-2 text-sm font-semibold text-ink/80"
              >
                Open
              </a>
              <a
                href={downloadUrl}
                download={fileName}
                className="inline-flex justify-center rounded-xl bg-clay px-4 py-2 text-sm font-semibold text-black shadow"
              >
                Download
              </a>
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={() => navigate(-1)}
          className="mt-4 rounded-xl border border-clay/35 bg-white px-4 py-2 text-sm font-semibold text-ink/80"
        >
          Back
        </button>
      </div>
    </div>
  );
}
