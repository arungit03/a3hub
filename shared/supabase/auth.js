import { doc, getDoc } from "../../src/lib/supabaseData.js";
import { normalizeRole } from "../types/canteen";
import {
  assertSupabaseReady,
  auth,
  db,
  supabase,
} from "./client";
import { setSupabaseAuthUser, toSupabaseAppUser } from "../../src/lib/supabase.js";

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

  const handleSession = async (session) => {
    const user = toSupabaseAppUser(session?.user, session);
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

  void supabase.auth.getSession().then((result) => handleSession(result.data?.session));
  const subscription = supabase.auth.onAuthStateChange((_event, session) => {
    void handleSession(session);
  });

  return () => subscription.data.subscription.unsubscribe();
};

export const signInUser = async ({ email, password }) => {
  assertSupabaseReady();
  const result = await supabase.auth.signInWithPassword({ email, password });
  if (result.error) throw result.error;
  const user = toSupabaseAppUser(result.data?.user, result.data?.session);
  setSupabaseAuthUser(user);
  return createSessionSnapshot(user);
};

export const signOutUser = async () => {
  assertSupabaseReady();
  setSupabaseAuthUser(null);
  auth.currentUser = null;
  await supabase.auth.signOut();
};
