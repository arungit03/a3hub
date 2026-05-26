// @ts-nocheck
import { ensureSupabase, supabaseConfig } from "./supabase.js";

const toSafeText = (value) => String(value || "").trim();

const normalizeBucket = (storageOrBucket) => {
  if (typeof storageOrBucket === "string") return toSafeText(storageOrBucket);
  return toSafeText(storageOrBucket?.bucket) || supabaseConfig.storageBucket || "a3hub";
};

export const ref = (storageOrBucket, path = "") => ({
  bucket: normalizeBucket(storageOrBucket),
  fullPath: toSafeText(path).replace(/^\/+/, ""),
});

export const uploadBytes = async (storageRef, file, metadata = {}) => {
  const client = ensureSupabase();
  const contentType = metadata?.contentType || file?.type || undefined;
  const { data, error } = await client.storage
    .from(storageRef.bucket)
    .upload(storageRef.fullPath, file, {
      contentType,
      upsert: true,
    });
  if (error) throw error;
  return {
    metadata,
    ref: storageRef,
    totalBytes: Number(file?.size || 0),
    data,
  };
};

export const getDownloadURL = async (storageRef) => {
  const client = ensureSupabase();
  const { data } = client.storage
    .from(storageRef.bucket)
    .getPublicUrl(storageRef.fullPath);
  if (!data?.publicUrl) {
    const error = new Error("Unable to resolve Supabase Storage public URL.");
    error.code = "storage/public-url-unavailable";
    throw error;
  }
  return data.publicUrl;
};

export const uploadBytesResumable = (storageRef, file, metadata = {}) => {
  let cancelled = false;
  const task = {
    snapshot: {
      ref: storageRef,
      bytesTransferred: 0,
      totalBytes: Number(file?.size || 0),
      state: "running",
      metadata,
    },
    cancel: () => {
      cancelled = true;
      task.snapshot.state = "canceled";
    },
    on: (_eventName, onProgress, onError, onComplete) => {
      queueMicrotask(() => {
        if (cancelled) {
          const error = new Error("Upload cancelled.");
          error.code = "storage/canceled";
          onError?.(error);
          return;
        }

        onProgress?.(task.snapshot);
        uploadBytes(storageRef, file, metadata)
          .then((snapshot) => {
            if (cancelled) {
              const error = new Error("Upload cancelled.");
              error.code = "storage/canceled";
              throw error;
            }
            task.snapshot = {
              ...task.snapshot,
              ...snapshot,
              bytesTransferred: Number(file?.size || 0),
              state: "success",
            };
            onProgress?.(task.snapshot);
            onComplete?.();
          })
          .catch((error) => {
            task.snapshot.state = "error";
            onError?.(error);
          });
      });

      return () => {
        cancelled = true;
      };
    },
  };

  return task;
};
