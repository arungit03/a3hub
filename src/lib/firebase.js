import { initializeApp } from "firebase/app";
import { getAnalytics, isSupported } from "firebase/analytics";
import { browserSessionPersistence, initializeAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

export const firebaseConfig = {
  apiKey: "AIzaSyChlLHW-VBMTG4k1-q77OplVPfiGZlvmk0",
  authDomain: "ckcethub.firebaseapp.com",
  databaseURL: "https://ckcethub-default-rtdb.firebaseio.com",
  projectId: "ckcethub",
  storageBucket: "ckcethub.firebasestorage.app",
  messagingSenderId: "937525565918",
  appId: "1:937525565918:web:7a52c2d793993745c2254f",
  measurementId: "G-JZWFRVHNJ3",
};

/**
 * @param {unknown} value
 * @returns {string}
 */
const normalizeBucket = (value) => {
  if (!value) return "";
  return String(value).replace(/^gs:\/\//, "").trim();
};

const bucketCandidates = [
  normalizeBucket(firebaseConfig.storageBucket),
  normalizeBucket(`${firebaseConfig.projectId}.firebasestorage.app`),
  normalizeBucket(`${firebaseConfig.projectId}.appspot.com`),
].filter(Boolean);

export const storageBuckets = [...new Set(bucketCandidates)];

const app = initializeApp(firebaseConfig);

export const auth = initializeAuth(app, {
  persistence: browserSessionPersistence,
});
export const db = getFirestore(app);
export const storage = getStorage(
  app,
  storageBuckets.length > 0 ? `gs://${storageBuckets[0]}` : undefined
);
/**
 * @param {string | undefined | null} bucket
 */
export const getStorageForBucket = (bucket) =>
  getStorage(app, bucket ? `gs://${normalizeBucket(bucket)}` : undefined);

export const analyticsPromise = isSupported().then((supported) =>
  supported ? getAnalytics(app) : null
);

export default app;
