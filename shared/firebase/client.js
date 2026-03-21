import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getFunctions } from "firebase/functions";
import {
  firebaseConfig,
  firebaseConfigured,
  firebaseFunctionsRegion,
  firebaseStartupMessage,
} from "./config";

const app =
  firebaseConfigured && getApps().length === 0
    ? initializeApp(firebaseConfig)
    : firebaseConfigured
    ? getApp()
    : null;

export const firebaseApp = app;
export const auth = app ? getAuth(app) : null;
export const db = app ? getFirestore(app) : null;
export const functions = app ? getFunctions(app, firebaseFunctionsRegion) : null;

export const assertFirebaseReady = () => {
  if (!firebaseConfigured || !app || !auth || !db || !functions) {
    throw new Error(
      firebaseStartupMessage ||
        "Firebase is not configured. Add the VITE_FIREBASE_* variables."
    );
  }
};
