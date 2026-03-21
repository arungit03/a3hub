import {
  browserLocalPersistence,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { normalizeRole } from "../types/canteen";
import { auth, db, assertFirebaseReady } from "./client";

export const getUserProfile = async (uid) => {
  assertFirebaseReady();
  const snapshot = await getDoc(doc(db, "users", uid));

  if (!snapshot.exists()) {
    throw new Error("User profile not found in Firestore.");
  }

  return {
    uid: snapshot.id,
    ...snapshot.data(),
    role: normalizeRole(snapshot.data()?.role),
  };
};

export const createSessionSnapshot = async (user) => {
  if (!user) {
    return {
      user: null,
      profile: null,
    };
  }

  const profile = await getUserProfile(user.uid);
  return { user, profile };
};

export const subscribeToSession = (listener) => {
  assertFirebaseReady();

  return onAuthStateChanged(auth, async (user) => {
    try {
      const nextSession = await createSessionSnapshot(user);
      listener({
        ...nextSession,
        error: "",
      });
    } catch (error) {
      listener({
        user,
        profile: null,
        error: error?.message || "Unable to load session.",
      });
    }
  });
};

export const signInUser = async ({ email, password }) => {
  assertFirebaseReady();
  await setPersistence(auth, browserLocalPersistence);
  const credential = await signInWithEmailAndPassword(auth, email, password);
  return createSessionSnapshot(credential.user);
};

export const signOutUser = async () => {
  assertFirebaseReady();
  await signOut(auth);
};
