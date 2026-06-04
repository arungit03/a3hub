import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { doc, getDoc } from "../../src/lib/supabaseData.js";
import {
  firebaseAuth,
  firebaseAuthReady,
  firebaseStartupIssue,
  toFirebaseAppUser,
} from "../../src/lib/firebase.js";
import { normalizeRole } from "../types/canteen";
import {
  assertSupabaseReady,
  auth,
  db,
} from "./client";
import { setSupabaseAuthUser } from "../../src/lib/supabase.js";

const assertFirebaseReady = () => {
  if (!firebaseAuthReady || !firebaseAuth) {
    throw new Error(
      firebaseStartupIssue ||
        "Firebase Authentication is not configured. Add the VITE_FIREBASE_* variables."
    );
  }
};

export const getUserProfile = async (uid) => {
  assertSupabaseReady();
  const snapshot = await getDoc(doc(db, "users", uid));

  if (!snapshot.exists()) {
    throw new Error("User profile not found in Supabase.");
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
  assertSupabaseReady();
  assertFirebaseReady();

  const handleSession = async (firebaseUser) => {
    const user = toFirebaseAppUser(firebaseUser);
    setSupabaseAuthUser(user);
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
  };

  return onAuthStateChanged(firebaseAuth, (nextUser) => {
    void handleSession(nextUser);
  });
};

export const signInUser = async ({ email, password }) => {
  assertSupabaseReady();
  assertFirebaseReady();
  const result = await signInWithEmailAndPassword(firebaseAuth, email, password);
  const user = toFirebaseAppUser(result.user);
  setSupabaseAuthUser(user);
  return createSessionSnapshot(user);
};

export const signOutUser = async () => {
  assertSupabaseReady();
  assertFirebaseReady();
  setSupabaseAuthUser(null);
  auth.currentUser = null;
  await signOut(firebaseAuth);
};
