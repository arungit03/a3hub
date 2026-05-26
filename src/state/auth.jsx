/* eslint-disable react-refresh/only-export-components */
import {
  useCallback,
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";
import {
  createSupabaseUnavailableError,
  db,
  getAuthRedirectUrl,
  setSupabaseAuthUser,
  supabase,
  supabaseClientReady,
  supabaseStartupIssue,
  toSupabaseAppUser,
} from "../lib/supabase";
import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  writeBatch,
} from "../lib/supabaseData";
import { extractNumericQrValue } from "../lib/qr";

let pushNotificationsModulePromise = null;

const normalizeDepartment = (value) =>
  (value || "").trim().toLowerCase();

const toSafeText = (value) => String(value || "").trim();
const AUTH_BOOTSTRAP_DOC_ID = "authBootstrap";
const BLOCKED_ACCOUNT_MESSAGE = "Your account is blocked. Contact admin.";
const STAFF_PENDING_APPROVAL_MESSAGE =
  "Your staff account is pending admin approval.";

const loadPushNotificationsModule = () => {
  if (!pushNotificationsModulePromise) {
    pushNotificationsModulePromise = import("../lib/pushNotifications");
  }
  return pushNotificationsModulePromise;
};

const normalizeAccountRole = (value) => {
  const normalized = toSafeText(value).toLowerCase();
  if (!normalized) return "";

  if (
    normalized === "canteen_staff" ||
    normalized === "canteen staff" ||
    normalized.includes("canteen")
  ) {
    return "canteen_staff";
  }

  if (normalized === "admin" || normalized.includes("admin")) {
    return "admin";
  }

  if (
    normalized === "staff" ||
    normalized.includes("staff") ||
    normalized.includes("faculty") ||
    normalized.includes("teacher") ||
    normalized.includes("lecturer") ||
    normalized.includes("professor") ||
    normalized.includes("hod")
  ) {
    return "staff";
  }

  if (normalized === "student" || normalized.includes("student")) {
    return "student";
  }

  if (normalized === "parent" || normalized.includes("guardian")) {
    return "parent";
  }

  return "";
};

const normalizeSessionRole = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  if (
    normalized === "canteen" ||
    normalized === "canteen_staff" ||
    normalized === "food"
  ) {
    return "canteen";
  }
  if (normalized === "admin") return "admin";
  if (normalized === "staff") return "staff";
  if (normalized === "parent") return "parent";
  return "student";
};

const normalizeAccountStatus = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "blocked") return "blocked";
  if (normalized === "pending" || normalized === "pending_approval") {
    return "pending";
  }
  return "active";
};

const isPermissionDeniedError = (error) => {
  const code = String(error?.code || "").trim().toLowerCase();
  const message = String(error?.message || "").trim().toLowerCase();
  return (
    code.includes("permission-denied") ||
    message.includes("missing or insufficient permissions") ||
    message.includes("insufficient permissions")
  );
};

const inferAccountRoleFromProfile = (profile = {}, selectedRole = "student") => {
  const hasStaffSignals = [
    profile?.designation,
    profile?.employeeId,
    profile?.staffId,
    profile?.facultyId,
  ].some((value) => toSafeText(value).length > 0);

  const hasStudentSignals = [
    profile?.rollNo,
    profile?.registerNumber,
    profile?.year,
  ].some((value) => {
    if (typeof value === "number") {
      return Number.isFinite(value) && value > 0;
    }
    return toSafeText(value).length > 0;
  });

  if (hasStaffSignals && !hasStudentSignals) return "staff";
  if (hasStudentSignals && !hasStaffSignals) return "student";
  if (hasStaffSignals && selectedRole === "staff") return "staff";
  return "";
};

const resolveEffectiveRole = ({ accountRole, selectedRole }) => {
  const safeAccountRole = normalizeAccountRole(accountRole);
  const safeSelectedRole = normalizeSessionRole(selectedRole);

  if (
    safeSelectedRole === "canteen" &&
    (safeAccountRole === "admin" || safeAccountRole === "canteen_staff")
  ) {
    return "canteen";
  }

  if (safeAccountRole === "canteen_staff") {
    return "canteen";
  }

  if (safeAccountRole === "admin") {
    return "admin";
  }

  if (safeAccountRole === "staff") {
    return "staff";
  }

  if (safeAccountRole === "parent") {
    return "parent";
  }

  if (safeSelectedRole === "parent" && safeAccountRole === "student") {
    return "parent";
  }

  if (safeAccountRole === "student") {
    return "student";
  }

  return "student";
};

const resolveProfileName = ({ profileName, userName, userEmail }) => {
  const safeProfileName = String(profileName || "").trim();
  if (safeProfileName) return safeProfileName;

  const safeUserName = String(userName || "").trim();
  if (safeUserName) return safeUserName;

  const safeEmailPrefix = String(userEmail || "").trim().split("@")[0];
  if (safeEmailPrefix) return safeEmailPrefix;

  return "Campus Member";
};

const createAuthErrorWithCode = (code, message, details = {}) => {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, details);
  return error;
};

const isConfirmationEmailSendError = (error) => {
  const normalized = `${error?.code || ""} ${error?.message || ""}`
    .trim()
    .toLowerCase();
  return (
    normalized.includes("error sending confirmation email") ||
    normalized.includes("error sending verification email") ||
    normalized.includes("confirmation email") ||
    normalized.includes("verification email")
  );
};

const isAuthFunctionUnavailableError = (error) =>
  error?.code === "auth/function-unavailable" ||
  error?.code === "auth/server-email-not-configured" ||
  error?.code === "auth/server-not-configured";

const buildAuthFunctionError = (code, message, details = {}) =>
  createAuthErrorWithCode(
    code || "auth/function-failed",
    message || "Authentication email service failed.",
    details
  );

const postAuthFunction = async (functionName, payload) => {
  if (typeof fetch !== "function") {
    throw buildAuthFunctionError(
      "auth/function-unavailable",
      "Authentication email service is not available in this browser."
    );
  }

  let response;
  try {
    response = await fetch(`/.netlify/functions/${functionName}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload || {}),
    });
  } catch (error) {
    throw buildAuthFunctionError(
      "auth/function-unavailable",
      "Authentication email service is not reachable.",
      { cause: error }
    );
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw buildAuthFunctionError(
      "auth/function-unavailable",
      "Authentication email service is not deployed."
    );
  }

  let body = {};
  try {
    body = await response.json();
  } catch {
    body = {};
  }

  if (!response.ok || body?.ok === false) {
    throw buildAuthFunctionError(
      body?.code,
      body?.error || body?.message || "Authentication email service failed.",
      {
        status: response.status,
        details: body,
      }
    );
  }

  return body;
};

const ensureSupabaseConfigured = (feature = "Authentication") => {
  if (supabaseClientReady && supabase) return;
  throw createSupabaseUnavailableError(feature);
};

const getAuthBootstrapRef = () => doc(db, "systemSettings", AUTH_BOOTSTRAP_DOC_ID);

const buildVerificationRedirectTo = () => getAuthRedirectUrl("/");
const buildResetRedirectTo = () => getAuthRedirectUrl("/password-change");

const throwIfSupabaseError = (error, fallback = "Authentication failed.") => {
  if (!error) return;
  const message = toSafeText(error.message) || fallback;
  const normalized = message.toLowerCase();
  if (normalized.includes("email not confirmed")) {
    throw createAuthErrorWithCode(
      "auth/email-not-verified",
      "Verify your email before logging in."
    );
  }
  if (normalized.includes("invalid login credentials")) {
    throw createAuthErrorWithCode(
      "auth/invalid-credential",
      "Invalid email or password."
    );
  }
  if (normalized.includes("rate limit")) {
    throw createAuthErrorWithCode("auth/too-many-requests", message);
  }
  throw createAuthErrorWithCode(error.code || "auth/request-failed", message);
};

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState("student");
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const resetSignedOutState = useCallback(() => {
    setUser(null);
    setRole(normalizeSessionRole(sessionStorage.getItem("roleSelection")));
    setProfile(null);
  }, []);

  const applyFallbackProfile = useCallback((currentUser) => {
    const selectedRole = normalizeSessionRole(sessionStorage.getItem("roleSelection"));
    const fallbackAccountRole = "student";
    const effectiveRole = resolveEffectiveRole({
      accountRole: fallbackAccountRole,
      selectedRole,
    });
    const resolvedName = resolveProfileName({
      profileName: "",
      userName: currentUser?.displayName,
      userEmail: currentUser?.email,
    });

    setRole(effectiveRole);
    sessionStorage.setItem("roleSelection", effectiveRole);
    setProfile({
      email: currentUser?.email || "",
      name: resolvedName,
      role: effectiveRole,
      accountRole: fallbackAccountRole,
      status: "active",
    });
  }, []);

  useEffect(() => {
    if (!supabaseClientReady || !supabase) {
      resetSignedOutState();
      setLoading(false);
      return undefined;
    }

    let cancelled = false;
    let unsubscribe = () => {};

    const connectAuth = async () => {
      try {
        const handleSessionUser = async (session) => {
          const currentUser = toSupabaseAppUser(session?.user, session);
          setSupabaseAuthUser(currentUser);
          setLoading(true);

          if (!currentUser || !currentUser.emailVerified) {
            resetSignedOutState();
            setLoading(false);
            return;
          }

          setUser(currentUser);

          try {
            const userDoc = await getDoc(doc(db, "users", currentUser.uid));
            if (userDoc.exists()) {
              const data = userDoc.data();
              const accountStatus = normalizeAccountStatus(data?.status);
              if (accountStatus === "blocked" || accountStatus === "pending") {
                resetSignedOutState();
                try {
                  await supabase.auth.signOut();
                  setSupabaseAuthUser(null);
                } catch {
                  // Ignore sign-out race conditions; blocked accounts should still be cleared locally.
                }
                setLoading(false);
                return;
              }
              const resolvedName = resolveProfileName({
                profileName: data?.name,
                userName: currentUser.displayName,
                userEmail: currentUser.email,
              });
              const selectedRole = normalizeSessionRole(
                sessionStorage.getItem("roleSelection")
              );
              const explicitAccountRole = normalizeAccountRole(data?.role);
              const inferredAccountRole = inferAccountRoleFromProfile(
                data,
                selectedRole
              );
              const accountRole =
                explicitAccountRole === "student" && inferredAccountRole === "staff"
                  ? "staff"
                  : explicitAccountRole || inferredAccountRole;
              const effectiveRole = resolveEffectiveRole({
                accountRole,
                selectedRole,
              });
              const canonicalAccountRole = normalizeAccountRole(accountRole || effectiveRole);
              setRole(effectiveRole);
              sessionStorage.setItem("roleSelection", effectiveRole);

              const profileBackfill = {};
              const storedRole = String(data?.role || "").trim().toLowerCase();
              if (storedRole !== canonicalAccountRole) {
                profileBackfill.role = canonicalAccountRole;
              }
              if (!data.departmentKey && data.department) {
                profileBackfill.departmentKey = normalizeDepartment(data.department);
              }
              if (!String(data?.name || "").trim()) {
                profileBackfill.name = resolvedName;
              }
              if (!String(data?.status || "").trim()) {
                profileBackfill.status = "active";
              }

              if (Object.keys(profileBackfill).length > 0) {
                try {
                  await setDoc(
                    doc(db, "users", currentUser.uid),
                    profileBackfill,
                    { merge: true }
                  );
                } catch {
                  // Non-blocking: continue with local profile even if backfill fails.
                }
              }

              if (canonicalAccountRole === "admin") {
                try {
                  await setDoc(
                    getAuthBootstrapRef(),
                    {
                      adminUid: currentUser.uid,
                      updatedAt: serverTimestamp(),
                    },
                    { merge: true }
                  );
                } catch {
                  // Ignore bootstrap sync failures for legacy projects.
                }
              }
              setProfile({
                ...data,
                name: resolvedName,
                role: effectiveRole,
                accountRole: canonicalAccountRole,
                status: accountStatus,
                departmentKey:
                  data.departmentKey || normalizeDepartment(data.department),
              });
            } else {
              applyFallbackProfile(currentUser);
            }
          } catch {
            applyFallbackProfile(currentUser);
          } finally {
            setLoading(false);
          }
        };

        const sessionResult = await supabase.auth.getSession();
        throwIfSupabaseError(sessionResult.error, "Unable to load session.");
        if (!cancelled) {
          await handleSessionUser(sessionResult.data?.session || null);
        }

        const subscription = supabase.auth.onAuthStateChange((_event, session) => {
          if (!cancelled) {
            void handleSessionUser(session);
          }
        });
        unsubscribe = () => subscription.data.subscription.unsubscribe();
      } catch {
        if (cancelled) return;
        resetSignedOutState();
        setLoading(false);
      }
    };

    void connectAuth();

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [applyFallbackProfile, resetSignedOutState]);

  useEffect(() => {
    if (!user?.uid) return;
    let cancelled = false;

    const registerPushToken = async () => {
      try {
        const { registerPushTokenForUser } = await loadPushNotificationsModule();
        if (!cancelled) {
          void registerPushTokenForUser(user.uid);
        }
      } catch {
        // Ignore optional push registration failures during session bootstrap.
      }
    };

    void registerPushToken();

    return () => {
      cancelled = true;
    };
  }, [user?.uid]);

  const signup = async ({
    email,
    password,
    role,
    name,
    department,
    year,
    rollNo,
    qrNum,
    designation,
  }) => {
    ensureSupabaseConfigured("Account signup");

    const safeEmail = toSafeText(email).toLowerCase();
    const safeRole = normalizeSessionRole(role);

    if (safeRole === "parent") {
      throw new Error("Parent signup is disabled. Use login credentials provided.");
    }

    if (!["student", "staff", "admin"].includes(safeRole)) {
      throw new Error("Invalid role selected.");
    }

    let credential = null;
    let profileStored = false;
    let verificationEmailStatus = "sent";

    try {
      const normalizedDepartment = normalizeDepartment(department);
      const userProfile = {
        email: safeEmail,
        role: safeRole,
        status: safeRole === "staff" ? "pending" : "active",
        name: name || "New User",
        department: department || "",
        departmentKey: normalizedDepartment,
        notificationPreferences: {
          inApp: true,
          email: true,
          whatsapp: true,
          push: true,
          leaveDecision: true,
          notices: true,
          examUpdates: true,
          feeDue: true,
          quietHours: {
            enabled: false,
            start: "22:00",
            end: "07:00",
            whatsapp: true,
            push: true,
            timezoneOffsetMinutes: -new Date().getTimezoneOffset(),
          },
        },
        createdAt: serverTimestamp(),
      };

      if (safeRole === "student") {
        const safeRollNo = toSafeText(rollNo);
        const safeQrNum = toSafeText(qrNum);
        const rollNoNumber = extractNumericQrValue(safeRollNo);
        const qrNumNumber = extractNumericQrValue(safeQrNum);
        userProfile.year = year ? Number(year) : null;
        userProfile.rollNo = safeRollNo;
        userProfile.registerNumber = safeRollNo;
        userProfile.rollNoNumber = Number.isSafeInteger(rollNoNumber)
          ? rollNoNumber
          : null;
        userProfile.qrNum = safeQrNum;
        userProfile.qrNumNumber = Number.isSafeInteger(qrNumNumber)
          ? qrNumNumber
          : null;
      } else {
        userProfile.designation = designation || "";
      }

      const metadataProfile = JSON.parse(JSON.stringify(userProfile));
      metadataProfile.createdAt = new Date().toISOString();

      const signupWithCustomEmail = async () => {
        const result = await postAuthFunction("auth-signup", {
          email: safeEmail,
          password,
          role: safeRole,
          profile: userProfile,
          metadata: {
            ...metadataProfile,
            display_name: name || "New User",
          },
          redirectTo: buildVerificationRedirectTo(),
        });
        const appUser = toSupabaseAppUser(result.user, null);
        if (!appUser?.uid) {
          throw createAuthErrorWithCode(
            "auth/server-signup-invalid",
            "Account was created, but Supabase did not return the new account id."
          );
        }
        return {
          credential: { user: appUser },
          verificationEmailStatus: result.emailStatus || "sent",
        };
      };

      const signupResult = await supabase.auth.signUp({
        email: safeEmail,
        password,
        options: {
          data: {
            ...metadataProfile,
            display_name: name || "New User",
          },
          emailRedirectTo: buildVerificationRedirectTo(),
        },
      });
      if (signupResult.error && isConfirmationEmailSendError(signupResult.error)) {
        try {
          return await signupWithCustomEmail();
        } catch (customEmailError) {
          if (isAuthFunctionUnavailableError(customEmailError)) {
            throw createAuthErrorWithCode(
              "auth/confirmation-email-failed",
              "Supabase could not send the confirmation email. Configure Supabase Auth SMTP, or set SUPABASE_SERVICE_ROLE_KEY plus RESEND_API_KEY/EMAIL_FROM so A3 Hub can send verification emails."
            );
          }
          throw customEmailError;
        }
      }
      throwIfSupabaseError(signupResult.error, "Unable to create account.");

      const appUser = toSupabaseAppUser(
        signupResult.data?.user,
        signupResult.data?.session
      );
      if (!appUser?.uid) {
        throw new Error("Supabase did not return the new account id.");
      }

      credential = { user: appUser };
      sessionStorage.setItem("roleSelection", safeRole);
      setSupabaseAuthUser(appUser);

      const userRef = doc(db, "users", appUser.uid);

      try {
        if (safeRole === "admin") {
          const bootstrapRef = getAuthBootstrapRef();
          const batch = writeBatch(db);
          batch.set(userRef, userProfile);
          batch.set(
            bootstrapRef,
            {
              adminUid: appUser.uid,
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          );
          await batch.commit();
        } else {
          await setDoc(userRef, userProfile);
        }

        profileStored = true;
      } catch (profileError) {
        if (signupResult.data?.session) {
          throw profileError;
        }
        profileStored = true;
      }

      await supabase.auth.signOut().catch(() => {});
      setSupabaseAuthUser(null);

      return {
        credential,
        verificationEmailStatus,
      };
    } catch (error) {
      if (credential?.user && !profileStored) {
        // Supabase client-side signups cannot delete the auth account; the
        // database trigger in supabase/schema.sql keeps profile creation in sync.
      }
      if (
        safeRole === "admin" &&
        isPermissionDeniedError(error)
      ) {
        throw new Error(
          "Admin registration is available only for the first admin account. Login with an existing admin account and create extra admins from Admin Users."
        );
      }
      if (
        safeRole === "staff" &&
        isPermissionDeniedError(error)
      ) {
        throw new Error(
          "Staff signup could not be saved. Apply the Supabase schema and policies, then the account will be created in pending approval status."
        );
      }
      throw error;
    }
  };

  const login = async (email, password) => {
    ensureSupabaseConfigured("Login");

    const safeEmail = toSafeText(email).toLowerCase();
    const selectedRole = normalizeSessionRole(sessionStorage.getItem("roleSelection"));
    const signInResult = await supabase.auth.signInWithPassword({
      email: safeEmail,
      password,
    });
    throwIfSupabaseError(signInResult.error, "Login failed.");
    const currentUser = toSupabaseAppUser(
      signInResult.data?.user,
      signInResult.data?.session
    );
    if (!currentUser) {
      throw new Error("Unable to load the signed-in account.");
    }
    setSupabaseAuthUser(currentUser);
    const credential = { user: currentUser };

    try {
      const profileSnapshot = await getDoc(doc(db, "users", credential.user.uid));
      const profileData = profileSnapshot.exists() ? profileSnapshot.data() : null;
      const accountRole = normalizeAccountRole(profileData?.role);
      if (
        profileSnapshot.exists() &&
        normalizeAccountStatus(profileData?.status) === "blocked"
      ) {
        await supabase.auth.signOut();
        setSupabaseAuthUser(null);
        throw new Error(BLOCKED_ACCOUNT_MESSAGE);
      }
      if (
        profileSnapshot.exists() &&
        normalizeAccountStatus(profileData?.status) === "pending"
      ) {
        await supabase.auth.signOut();
        setSupabaseAuthUser(null);
        throw new Error(STAFF_PENDING_APPROVAL_MESSAGE);
      }
      if (selectedRole === "admin" && accountRole !== "admin") {
        await supabase.auth.signOut();
        setSupabaseAuthUser(null);
        throw new Error(
          "This account does not have admin access. Login with an existing admin account."
        );
      }
      if (
        selectedRole === "canteen" &&
        !["admin", "canteen_staff"].includes(accountRole)
      ) {
        await supabase.auth.signOut();
        setSupabaseAuthUser(null);
        throw new Error(
          "This account does not have food console access. Login with a canteen staff or admin account."
        );
      }
    } catch (error) {
      if (
        error?.message === BLOCKED_ACCOUNT_MESSAGE ||
        error?.message === STAFF_PENDING_APPROVAL_MESSAGE ||
        error?.message ===
          "This account does not have admin access. Login with an existing admin account." ||
        error?.message ===
          "This account does not have food console access. Login with a canteen staff or admin account."
      ) {
        throw error;
      }
      if (selectedRole === "canteen") {
        await supabase.auth.signOut().catch(() => {});
        setSupabaseAuthUser(null);
        if (isPermissionDeniedError(error)) {
          throw new Error(
            "Food console access could not be verified. This signed-in account is not recognized as an active canteen staff member or admin by Supabase."
          );
        }
        throw new Error(
          "Unable to verify food console access right now. Please try again."
        );
      }
      if (selectedRole === "admin") {
        await supabase.auth.signOut().catch(() => {});
        setSupabaseAuthUser(null);
        if (isPermissionDeniedError(error)) {
          throw new Error(
            "Admin access could not be verified. This signed-in account is not recognized as an active admin by Supabase."
          );
        }
        throw new Error("Unable to verify admin access right now. Please try again.");
      }
      // Non-blocking: avoid failing login if profile lookup has a transient issue.
    }

    return credential;
  };

  const resendVerificationEmail = async ({ email }) => {
    ensureSupabaseConfigured("Email verification");

    const safeEmail = toSafeText(email).toLowerCase();
    if (!safeEmail) {
      throw new Error("Enter email to resend verification email.");
    }

    try {
      const result = await postAuthFunction("auth-send-verification", {
        email: safeEmail,
        redirectTo: buildVerificationRedirectTo(),
      });
      return {
        alreadyVerified: Boolean(result?.alreadyVerified),
        provider: result?.provider || "custom",
      };
    } catch (customEmailError) {
      if (!isAuthFunctionUnavailableError(customEmailError)) {
        throw customEmailError;
      }
    }

    const result = await supabase.auth.resend({
      type: "signup",
      email: safeEmail,
      options: {
        emailRedirectTo: buildVerificationRedirectTo(),
      },
    });
    try {
      throwIfSupabaseError(result.error, "Unable to resend verification email.");
    } catch (error) {
      if (isConfirmationEmailSendError(error)) {
        throw createAuthErrorWithCode(
          "auth/confirmation-email-failed",
          "Supabase could not send the confirmation email. Configure Supabase Auth SMTP, or set SUPABASE_SERVICE_ROLE_KEY plus RESEND_API_KEY/EMAIL_FROM so A3 Hub can send verification emails."
        );
      }
      if (error?.code === "auth/too-many-requests") {
        throw createAuthErrorWithCode(
          "auth/verification-send-busy",
          "A fresh verification link could not be generated right now. Tap resend again in a moment."
        );
      }
      throw error;
    }
    return { alreadyVerified: false };
  };

  const logout = async () => {
    if (!supabaseClientReady || !supabase) {
      sessionStorage.removeItem("roleSelection");
      return;
    }
    sessionStorage.removeItem("roleSelection");
    setSupabaseAuthUser(null);
    return supabase.auth.signOut();
  };

  const resetPassword = async (email) => {
    ensureSupabaseConfigured("Password reset");

    const safeEmail = toSafeText(email).toLowerCase();

    if (!safeEmail) {
      throw new Error("Enter your email to reset password.");
    }

    const result = await supabase.auth.resetPasswordForEmail(safeEmail, {
      redirectTo: buildResetRedirectTo(),
    });
    throwIfSupabaseError(result.error, "Unable to send password reset email.");
  };

  const value = {
    user,
    role,
    profile,
    loading,
    supabaseReady: supabaseClientReady,
    startupIssue: supabaseStartupIssue,
    login,
    signup,
    logout,
    resetPassword,
    resendVerificationEmail,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}


