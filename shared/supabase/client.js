import {
  auth,
  db,
  supabase,
  supabaseClientReady,
  supabaseStartupIssue,
} from "../../src/lib/supabase.js";

export { auth, db, supabase };

export const assertSupabaseReady = () => {
  if (!supabaseClientReady || !supabase || !db) {
    throw new Error(
      supabaseStartupIssue ||
        "Supabase is not configured. Add the VITE_SUPABASE_* variables."
    );
  }
};
