/* eslint-disable react-refresh/only-export-components */
import {
  useCallback,
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut as signOutFirebase,
  updateProfile,
} from "firebase/auth";
import {
  createFirebaseUnavailableError,
  firebaseAuth,
  firebaseAuthReady,
  firebaseStartupIssue,
  getFirebaseAuthRedirectUrl,
  toFirebaseAppUser,
} from "../lib/firebase";
import {
  createSupabaseUnavailableError,
  db,
  setSupabaseAuthUser,
  supabaseClientReady,
  supabaseStartupIssue,
} from "../lib/supabase";
import { doc, getDoc, setDoc } from "../lib/supabaseData";
import { extractNumericQrValue } from "../lib/qr";

let pushNotificationsModulePromise = null;

const normalizeDepartment = (value) => (value || "").trim().toLowerCase();
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

  if (normalized === "admin" || normalized.includes("admin")) return "admin";

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
    if (typeof value === "number") return Number.isFinite(value) && value > 0;
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
  if (safeAccountRole === "canteen_staff") return "canteen";
  if (safeAccountRole === "admin") return "admin";
  if (safeAccountRole === "staff") return "staff";
  if (safeAccountRole === "parent") return "parent";
  if (safeSelectedRole === "parent" && safeAccountRole === "student") {
    return "parent";
  }
  if (safeAccountRole === "student") return "student";
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

const resolveProfileSessionState = ({
  currentUser,
  profileData = {},
  selectedRole = "student",
}) => {
  const data =
    profileData && typeof profileData === "object" ? profileData : {};
  const accountStatus = normalizeAccountStatus(data?.status);
  const resolvedName = resolveProfileName({
    profileName: data?.name,
    userName: currentUser?.displayName,
    userEmail: currentUser?.email,
  });
  const explicitAccountRole = normalizeAccountRole(data?.role);
  const inferredAccountRole = inferAccountRoleFromProfile(data, selectedRole);
  const accountRole =
    explicitAccountRole === "student" && inferredAccountRole === "staff"
      ? "staff"
      : explicitAccountRole || inferredAccountRole;
  const effectiveRole = resolveEffectiveRole({ accountRole, selectedRole });
  const canonicalAccountRole = normalizeAccountRole(accountRole || effectiveRole);
  const departmentKey =
    data.departmentKey || normalizeDepartment(data.department);

  const profileBackfill = {};
  const storedRole = String(data?.role || "").trim().toLowerCase();
  if (storedRole !== canonicalAccountRole) {
    profileBackfill.role = canonicalAccountRole;
  }
  if (!data.departmentKey && data.department) {
    profileBackfill.departmentKey = normalizeDepartment(data.department);
  }
  if (!String(data?.name || "").trim()) profileBackfill.name = resolvedName;
  if (!String(data?.status || "").trim()) profileBackfill.status = "active";

  return {
    accountStatus,
    effectiveRole,
    canonicalAccountRole,
    profileBackfill,
    profile: {
      ...data,
      name: resolvedName,
      role: effectiveRole,
      accountRole: canonicalAccountRole,
      status: accountStatus,
      departmentKey,
    },
  };
};

const buildAuthFunctionError = (code, message, details = {}) =>
  createAuthErrorWithCode(
    code || "auth/function-failed",
    message || "Authentication service failed.",
    details
  );

const isAuthFunctionUnavailableError = (error) =>
  error?.code === "auth/function-unavailable" ||
  error?.code === "auth/server-not-configured" ||
  error?.code === "auth/missing-firebase-config";

const requestAuthFunction = async ({
  functionName,
  method = "POST",
  payload,
  currentUser,
  requireAuth = true,
}) => {
  if (typeof fetch !== "function") {
    throw buildAuthFunctionError(
      "auth/function-unavailable",
      "Authentication server function is not available in this browser."
    );
  }

  const headers = {};
  if (payload !== undefined) headers["Content-Type"] = "application/json";
  if (requireAuth) {
    const token = await currentUser?.getIdToken?.();
    if (!token) {
      throw buildAuthFunctionError(
        "auth/missing-token",
        "Firebase authentication token is unavailable."
      );
    }
    headers.Authorization = `Bearer ${token}`;
  }

  let response;
  try {
    response = await fetch(`/.netlify/functions/${functionName}`, {
      method,
      headers,
      body: payload === undefined ? undefined : JSON.stringify(payload || {}),
    });
  } catch (error) {
    throw buildAuthFunctionError(
      "auth/function-unavailable",
      "Authentication server function is not reachable.",
      { cause: error }
    );
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw buildAuthFunctionError(
      "auth/function-unavailable",
      "Authentication server function is not deployed."
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
      body?.error || body?.message || "Authentication server function failed.",
      { status: response.status, details: body }
    );
  }

  return body;
};

const ensureFirebaseConfigured = (feature = "Authentication") => {
  if (firebaseAuthReady && firebaseAuth) return;
  throw createFirebaseUnavailableError(feature);
};

const ensureProfileStorageConfigured = (feature = "Profile storage") => {
  if (supabaseClientReady && db) return;
  throw createSupabaseUnavailableError(feature);
};

const buildVerificationRedirectTo = () => getFirebaseAuthRedirectUrl("/");
const buildResetRedirectTo = () => getFirebaseAuthRedirectUrl("/password-change");
const getAuthBootstrapRef = () => doc(db, "systemSettings", AUTH_BOOTSTRAP_DOC_ID);

const resolveFirebaseError = (error, fallback = "Authentication failed.") => {
  if (!error) return null;
  const code = String(error.code || "").trim();
  const message = toSafeText(error.message) || fallback;

  if (
    code === "auth/invalid-credential" ||
    code === "auth/user-not-found" ||
    code === "auth/wrong-password"
  ) {
    return createAuthErrorWithCode(
      "auth/invalid-credential",
      "Invalid email or password."
    );
  }
  if (code === "auth/email-already-in-use") {
    return createAuthErrorWithCode(
      code,
      "This email is already registered. Login or reset the password."
    );
  }
  if (code === "auth/weak-password") {
    return createAuthErrorWithCode(code, "Password must be at least 6 characters.");
  }
  if (code === "auth/too-many-requests") {
    return createAuthErrorWithCode(code, "Too many requests right now. Try again later.");
  }
  if (code === "auth/network-request-failed") {
    return createAuthErrorWithCode(
      code,
      "Network error while contacting Firebase. Check internet and try again."
    );
  }
  if (code === "auth/operation-not-allowed") {
    return createAuthErrorWithCode(
      code,
      "Email/password sign-in is disabled in Firebase Authentication."
    );
  }
  if (code === "auth/invalid-email") {
    return createAuthErrorWithCode(code, "Enter a valid email address.");
  }
  if (code === "auth/user-disabled") {
    return createAuthErrorWithCode(code, "This Firebase account is disabled.");
  }

  return createAuthErrorWithCode(code || "auth/request-failed", message);
};

const throwFirebaseError = (error, fallback) => {
  const resolved = resolveFirebaseError(error, fallback);
  if (resolved) throw resolved;
};

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState("student");
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const lastAppliedSessionRef = useRef(null);

  const appAuthReady = firebaseAuthReady && supabaseClientReady;
  const startupIssue =
    firebaseStartupIssue ||
    supabaseStartupIssue ||
    "";

  const resetSignedOutState = useCallback(() => {
    lastAppliedSessionRef.current = null;
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
    const fallbackProfile = {
      email: currentUser?.email || "",
      name: resolvedName,
      role: effectiveRole,
      accountRole: fallbackAccountRole,
      status: "active",
    };

    setUser(currentUser || null);
    setRole(effectiveRole);
    sessionStorage.setItem("roleSelection", effectiveRole);
    setProfile(fallbackProfile);
    lastAppliedSessionRef.current = currentUser?.uid
      ? {
          uid: currentUser.uid,
          role: effectiveRole,
          profile: fallbackProfile,
          appliedAt: Date.now(),
        }
      : null;

    return { role: effectiveRole, profile: fallbackProfile };
  }, []);

  const loadUserProfile = useCallback(async (currentUser) => {
    try {
      const body = await requestAuthFunction({
        functionName: "firebase-profile",
        method: "GET",
        currentUser,
      });
      return body?.profile
        ? { exists: true, data: body.profile }
        : { exists: false, data: null };
    } catch (error) {
      if (!isAuthFunctionUnavailableError(error)) throw error;
    }

    const userDoc = await getDoc(doc(db, "users", currentUser.uid));
    return userDoc.exists()
      ? { exists: true, data: userDoc.data() }
      : { exists: false, data: null };
  }, []);

  const writeUserProfile = useCallback(
    async ({ actingUser, uid, profile: nextProfile, merge = false }) => {
      let functionError = null;
      try {
        await requestAuthFunction({
          functionName: "firebase-profile",
          method: "POST",
          currentUser: actingUser,
          payload: {
            uid,
            profile: nextProfile,
            merge,
          },
        });
        return;
      } catch (error) {
        functionError = error;
        if (!isAuthFunctionUnavailableError(error)) throw error;
      }

      try {
        await setDoc(doc(db, "users", uid), nextProfile, merge ? { merge: true } : {});
        if (normalizeAccountRole(nextProfile?.role) === "admin") {
          await setDoc(
            getAuthBootstrapRef(),
            {
              adminUid: uid,
              updatedAt: new Date().toISOString(),
            },
            { merge: true }
          );
        }
      } catch (error) {
        if (functionError && isPermissionDeniedError(error)) {
          throw createAuthErrorWithCode(
            "auth/profile-write-unavailable",
            "Firebase account was created, but the profile could not be saved. Deploy Netlify functions with SUPABASE_SERVICE_ROLE_KEY or update Supabase policies."
          );
        }
        throw error;
      }
    },
    []
  );

  useEffect(() => {
    if (!firebaseAuthReady || !firebaseAuth) {
      resetSignedOutState();
      setSupabaseAuthUser(null);
      setLoading(false);
      return undefined;
    }

    let cancelled = false;

    const handleFirebaseUser = async (firebaseUser) => {
      const currentUser = toFirebaseAppUser(firebaseUser);
      setSupabaseAuthUser(currentUser);
      setLoading(true);

      if (!currentUser || !currentUser.emailVerified) {
        resetSignedOutState();
        if (currentUser) {
          await signOutFirebase(firebaseAuth).catch(() => {});
          setSupabaseAuthUser(null);
        }
        setLoading(false);
        return;
      }

      setUser(currentUser);

      const recentSession = lastAppliedSessionRef.current;
      if (
        recentSession?.uid === currentUser.uid &&
        Date.now() - Number(recentSession.appliedAt || 0) < 2500
      ) {
        setRole(recentSession.role);
        sessionStorage.setItem("roleSelection", recentSession.role);
        setProfile(recentSession.profile);
        setLoading(false);
        return;
      }

      try {
        const profileSnapshot = await loadUserProfile(currentUser);
        if (profileSnapshot.exists) {
          const selectedRole = normalizeSessionRole(
            sessionStorage.getItem("roleSelection")
          );
          const {
            accountStatus,
            effectiveRole,
            canonicalAccountRole,
            profileBackfill,
            profile: resolvedProfile,
          } = resolveProfileSessionState({
            currentUser,
            profileData: profileSnapshot.data,
            selectedRole,
          });

          if (accountStatus === "blocked" || accountStatus === "pending") {
            resetSignedOutState();
            await signOutFirebase(firebaseAuth).catch(() => {});
            setSupabaseAuthUser(null);
            setLoading(false);
            return;
          }

          setRole(effectiveRole);
          sessionStorage.setItem("roleSelection", effectiveRole);
          setProfile(resolvedProfile);
          lastAppliedSessionRef.current = {
            uid: currentUser.uid,
            role: effectiveRole,
            profile: resolvedProfile,
            appliedAt: Date.now(),
          };

          if (Object.keys(profileBackfill).length > 0) {
            void writeUserProfile({
              actingUser: currentUser,
              uid: currentUser.uid,
              profile: profileBackfill,
              merge: true,
            }).catch(() => {});
          }

          if (canonicalAccountRole === "admin") {
            void setDoc(
              getAuthBootstrapRef(),
              {
                adminUid: currentUser.uid,
                updatedAt: new Date().toISOString(),
              },
              { merge: true }
            ).catch(() => {});
          }
        } else {
          applyFallbackProfile(currentUser);
        }
      } catch {
        applyFallbackProfile(currentUser);
      } finally {
        setLoading(false);
      }
    };

    const unsubscribe = onAuthStateChanged(firebaseAuth, (nextUser) => {
      if (!cancelled) void handleFirebaseUser(nextUser);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [applyFallbackProfile, loadUserProfile, resetSignedOutState, writeUserProfile]);

  useEffect(() => {
    if (!user?.uid) return;
    let cancelled = false;

    const registerPushToken = async () => {
      try {
        const { registerPushTokenForUser } = await loadPushNotificationsModule();
        if (!cancelled) void registerPushTokenForUser(user.uid);
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
    ensureFirebaseConfigured("Account signup");
    ensureProfileStorageConfigured("Account profile storage");

    const safeEmail = toSafeText(email).toLowerCase();
    const safeRole = normalizeSessionRole(role);

    if (safeRole === "parent") {
      throw new Error("Parent signup is disabled. Use login credentials provided.");
    }
    if (!["student", "staff", "admin"].includes(safeRole)) {
      throw new Error("Invalid role selected.");
    }

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
      createdAt: new Date().toISOString(),
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

    let credential = null;
    try {
      credential = await createUserWithEmailAndPassword(
        firebaseAuth,
        safeEmail,
        password
      );
      if (name) {
        await updateProfile(credential.user, { displayName: name });
      }
      const appUser = toFirebaseAppUser(credential.user);
      sessionStorage.setItem("roleSelection", safeRole);
      setSupabaseAuthUser(appUser);

      await writeUserProfile({
        actingUser: appUser,
        uid: appUser.uid,
        profile: userProfile,
      });

      let verificationEmailStatus = "sent";
      try {
        await sendEmailVerification(credential.user, {
          url: buildVerificationRedirectTo(),
        });
      } catch {
        verificationEmailStatus = "cooldown";
      }

      await signOutFirebase(firebaseAuth).catch(() => {});
      setSupabaseAuthUser(null);
      resetSignedOutState();

      return {
        credential: { user: appUser },
        verificationEmailStatus,
      };
    } catch (error) {
      if (
        safeRole === "admin" &&
        (error?.code === "auth/admin-registration-closed" ||
          error?.code === "auth/forbidden-role")
      ) {
        throw new Error(
          "Admin registration is available only for the first admin account. Login with an existing admin account and create extra admins from Admin Users."
        );
      }
      throwFirebaseError(error, "Unable to create account.");
      throw error;
    }
  };

  const login = async (email, password) => {
    ensureFirebaseConfigured("Login");
    ensureProfileStorageConfigured("Login profile storage");

    const safeEmail = toSafeText(email).toLowerCase();
    const selectedRole = normalizeSessionRole(sessionStorage.getItem("roleSelection"));

    setLoading(true);

    try {
      const firebaseCredential = await signInWithEmailAndPassword(
        firebaseAuth,
        safeEmail,
        password
      );
      await firebaseCredential.user.reload();
      const currentUser = toFirebaseAppUser(firebaseCredential.user);

      if (!currentUser?.emailVerified) {
        await signOutFirebase(firebaseAuth).catch(() => {});
        setSupabaseAuthUser(null);
        resetSignedOutState();
        throw createAuthErrorWithCode(
          "auth/email-not-verified",
          "Verify your email before logging in."
        );
      }

      setSupabaseAuthUser(currentUser);
      setUser(currentUser);
      const credential = { user: currentUser, role: selectedRole };

      try {
        const profileSnapshot = await loadUserProfile(currentUser);
        if (profileSnapshot.exists) {
          const profileData = profileSnapshot.data;
          const {
            accountStatus,
            effectiveRole,
            canonicalAccountRole,
            profile: resolvedProfile,
          } = resolveProfileSessionState({
            currentUser,
            profileData,
            selectedRole,
          });

          if (accountStatus === "blocked") {
            await logout();
            throw new Error(BLOCKED_ACCOUNT_MESSAGE);
          }
          if (accountStatus === "pending") {
            await logout();
            throw new Error(STAFF_PENDING_APPROVAL_MESSAGE);
          }
          if (selectedRole === "admin" && canonicalAccountRole !== "admin") {
            await logout();
            throw new Error(
              "This account does not have admin access. Login with an existing admin account."
            );
          }
          if (
            selectedRole === "canteen" &&
            !["admin", "canteen_staff"].includes(canonicalAccountRole)
          ) {
            await logout();
            throw new Error(
              "This account does not have food console access. Login with a canteen staff or admin account."
            );
          }

          setRole(effectiveRole);
          sessionStorage.setItem("roleSelection", effectiveRole);
          setProfile(resolvedProfile);
          lastAppliedSessionRef.current = {
            uid: currentUser.uid,
            role: effectiveRole,
            profile: resolvedProfile,
            appliedAt: Date.now(),
          };
          credential.role = effectiveRole;
        } else {
          const fallback = applyFallbackProfile(currentUser);
          credential.role = fallback.role;
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
          await logout();
          throw new Error(
            "Unable to verify food console access right now. Please try again."
          );
        }
        if (selectedRole === "admin") {
          await logout();
          throw new Error("Unable to verify admin access right now. Please try again.");
        }
        const fallback = applyFallbackProfile(currentUser);
        credential.role = fallback.role;
      }

      return credential;
    } catch (error) {
      if (error?.code === "auth/email-not-verified") throw error;
      throwFirebaseError(error, "Login failed.");
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const resendVerificationEmail = async ({ email }) => {
    ensureFirebaseConfigured("Email verification");

    const safeEmail = toSafeText(email).toLowerCase();
    if (!safeEmail) throw new Error("Enter email to resend verification email.");

    try {
      const result = await requestAuthFunction({
        functionName: "firebase-send-verification",
        payload: {
          email: safeEmail,
          redirectTo: buildVerificationRedirectTo(),
        },
        requireAuth: false,
      });
      return {
        alreadyVerified: Boolean(result?.alreadyVerified),
        provider: result?.provider || "firebase",
      };
    } catch (error) {
      if (firebaseAuth.currentUser?.email === safeEmail) {
        await sendEmailVerification(firebaseAuth.currentUser, {
          url: buildVerificationRedirectTo(),
        });
        return { alreadyVerified: false, provider: "firebase" };
      }
      if (isAuthFunctionUnavailableError(error)) {
        throw createAuthErrorWithCode(
          "auth/function-unavailable",
          "Resend verification requires the Firebase verification function to be deployed."
        );
      }
      throwFirebaseError(error, "Unable to resend verification email.");
      throw error;
    }
  };

  const logout = async () => {
    sessionStorage.removeItem("roleSelection");
    setSupabaseAuthUser(null);
    resetSignedOutState();
    if (!firebaseAuthReady || !firebaseAuth) return;
    return signOutFirebase(firebaseAuth);
  };

  const resetPassword = async (email) => {
    ensureFirebaseConfigured("Password reset");

    const safeEmail = toSafeText(email).toLowerCase();
    if (!safeEmail) throw new Error("Enter your email to reset password.");

    try {
      await sendPasswordResetEmail(firebaseAuth, safeEmail, {
        url: buildResetRedirectTo(),
      });
    } catch (error) {
      throwFirebaseError(error, "Unable to send password reset email.");
    }
  };

  const value = {
    user,
    role,
    profile,
    loading,
    supabaseReady: appAuthReady,
    startupIssue,
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
