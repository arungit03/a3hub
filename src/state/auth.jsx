/* eslint-disable react-refresh/only-export-components */
import {
  useCallback,
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";
import {
  auth,
  createFirebaseUnavailableError,
  db,
  ensureFirebaseAuth,
  ensureFirestore,
  firebaseClientReady,
  firebaseStartupIssue,
} from "../lib/firebase";
import { extractNumericQrValue } from "../lib/qr";

let firebaseAuthModulePromise = null;
let firebaseFirestoreModulePromise = null;
let pushNotificationsModulePromise = null;

const normalizeDepartment = (value) =>
  (value || "").trim().toLowerCase();

const toSafeText = (value) => String(value || "").trim();
const AUTH_BOOTSTRAP_DOC_ID = "authBootstrap";
const BLOCKED_ACCOUNT_MESSAGE = "Your account is blocked. Contact admin.";
const STAFF_PENDING_APPROVAL_MESSAGE =
  "Your staff account is pending admin approval.";
const FACE_MIN_VECTOR_LENGTH = 64;
const FACE_REGISTRATION_SAMPLE_LIMIT = 6;
const FACE_MATCH_THRESHOLD = 0.74;

const loadFirebaseAuthModule = () => {
  if (!firebaseAuthModulePromise) {
    firebaseAuthModulePromise = import("firebase/auth");
  }
  return firebaseAuthModulePromise;
};

const loadFirebaseFirestoreModule = () => {
  if (!firebaseFirestoreModulePromise) {
    firebaseFirestoreModulePromise = import("firebase/firestore");
  }
  return firebaseFirestoreModulePromise;
};

const loadPushNotificationsModule = () => {
  if (!pushNotificationsModulePromise) {
    pushNotificationsModulePromise = import("../lib/pushNotifications");
  }
  return pushNotificationsModulePromise;
};

const normalizeFaceVector = (value) => {
  if (!Array.isArray(value)) return [];
  const vector = value
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item));
  if (vector.length < FACE_MIN_VECTOR_LENGTH) return [];

  let squaredNorm = 0;
  vector.forEach((item) => {
    squaredNorm += item * item;
  });
  if (squaredNorm <= 0) return [];

  const norm = Math.sqrt(squaredNorm);
  return vector.map((item) => Number((item / norm).toFixed(7)));
};

const cosineSimilarity = (vectorA, vectorB) => {
  if (!Array.isArray(vectorA) || !Array.isArray(vectorB)) return 0;
  if (vectorA.length === 0 || vectorB.length === 0) return 0;

  const dimensions = Math.min(vectorA.length, vectorB.length);
  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let index = 0; index < dimensions; index += 1) {
    const a = Number(vectorA[index]) || 0;
    const b = Number(vectorB[index]) || 0;
    dot += a * b;
    normA += a * a;
    normB += b * b;
  }

  if (normA <= 0 || normB <= 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
};

const dedupeFaceVectors = (vectors, duplicateSimilarity = 0.998) => {
  const next = [];
  const safeVectors = Array.isArray(vectors) ? vectors : [];
  safeVectors.forEach((vector) => {
    const normalizedVector = normalizeFaceVector(vector);
    if (normalizedVector.length < FACE_MIN_VECTOR_LENGTH) return;
    const duplicate = next.some(
      (existing) => cosineSimilarity(existing, normalizedVector) >= duplicateSimilarity
    );
    if (!duplicate) {
      next.push(normalizedVector);
    }
  });
  return next;
};

const averageFaceVector = (vectors) => {
  if (!Array.isArray(vectors) || vectors.length === 0) return [];
  const dimensions = vectors.reduce(
    (max, vector) => Math.max(max, Array.isArray(vector) ? vector.length : 0),
    0
  );
  if (dimensions < FACE_MIN_VECTOR_LENGTH) return [];

  const sums = new Array(dimensions).fill(0);
  const counts = new Array(dimensions).fill(0);
  vectors.forEach((vector) => {
    if (!Array.isArray(vector)) return;
    for (let index = 0; index < dimensions; index += 1) {
      const value = Number(vector[index]);
      if (!Number.isFinite(value)) continue;
      sums[index] += value;
      counts[index] += 1;
    }
  });

  const averaged = sums.map((sum, index) => {
    const count = counts[index];
    if (!count) return 0;
    return sum / count;
  });
  return normalizeFaceVector(averaged);
};

const serializeFaceSampleVectors = (vectors) =>
  (Array.isArray(vectors) ? vectors : [])
    .map((vector, index) => {
      const normalizedVector = normalizeFaceVector(vector);
      if (normalizedVector.length < FACE_MIN_VECTOR_LENGTH) return null;

      return {
        id: `sample_${index + 1}`,
        vector: normalizedVector,
      };
    })
    .filter(Boolean);

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

const buildAuthActionCodeSettings = (path = "/") => {
  if (typeof window === "undefined") return undefined;

  try {
    const { origin, protocol } = window.location;
    if (protocol !== "http:" && protocol !== "https:") {
      return undefined;
    }

    const safePath = String(path || "/").trim();
    const normalizedPath = safePath.startsWith("/") ? safePath : `/${safePath}`;

    return { url: `${origin}${normalizedPath}` };
  } catch {
    return undefined;
  }
};

const buildVerificationActionCodeSettings = () =>
  buildAuthActionCodeSettings("/");

const buildResetActionCodeSettings = () => {
  return buildAuthActionCodeSettings("/password-change");
};

const DEFAULT_VERIFICATION_EMAIL_PROXY_ENDPOINT =
  "/.netlify/functions/auth-send-verification";

const shouldTryVerificationEmailProxy = (error) => {
  const code = toSafeText(error?.code).toLowerCase();
  return (
    code !== "auth/operation-not-allowed" &&
    code !== "auth/user-disabled" &&
    code !== "auth/invalid-user-token"
  );
};

const requestVerificationEmailViaProxy = async (
  firebaseUser,
  actionCodeSettings
) => {
  if (!firebaseUser?.getIdToken || typeof fetch !== "function") {
    throw new Error("Unable to send verification email.");
  }

  const idToken = await firebaseUser.getIdToken();
  if (!idToken) {
    throw new Error("Unable to authorize verification email request.");
  }

  const response = await fetch(DEFAULT_VERIFICATION_EMAIL_PROXY_ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      idToken,
      continueUrl: actionCodeSettings?.url || "",
    }),
  });

  const rawText = await response.text();
  let payload = {};
  try {
    payload = rawText ? JSON.parse(rawText) : {};
  } catch {
    payload = {};
  }

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error("Verification email fallback endpoint unavailable.");
    }
    throw createAuthErrorWithCode(
      payload?.code || "auth/internal-error",
      payload?.error || "Unable to send verification email."
    );
  }
};

const ensureFirebaseConfigured = (feature = "Authentication") => {
  if (firebaseClientReady) return;
  throw createFirebaseUnavailableError(feature);
};

const loadFirebaseAuthRuntime = async (feature = "Authentication") => {
  ensureFirebaseConfigured(feature);
  const [authModule] = await Promise.all([
    loadFirebaseAuthModule(),
    ensureFirebaseAuth(),
  ]);
  return { authModule, auth };
};

const loadFirebaseSessionRuntime = async (feature = "Authentication") => {
  ensureFirebaseConfigured(feature);
  const [authModule, firestoreModule] = await Promise.all([
    loadFirebaseAuthModule(),
    loadFirebaseFirestoreModule(),
    ensureFirebaseAuth(),
    ensureFirestore(),
  ]);
  return {
    authModule,
    firestoreModule,
    auth,
    db,
  };
};

const getAuthBootstrapRef = (docRef) =>
  docRef(db, "systemSettings", AUTH_BOOTSTRAP_DOC_ID);

const sendVerificationEmailWithFallback = async (
  firebaseUser,
  sendEmailVerificationFn
) => {
  if (!firebaseUser) {
    throw new Error("Unable to send verification email.");
  }

  const actionCodeSettings = buildVerificationActionCodeSettings();
  try {
    if (!actionCodeSettings) {
      await sendEmailVerificationFn(firebaseUser);
      return;
    }

    await sendEmailVerificationFn(firebaseUser, actionCodeSettings);
  } catch (error) {
    if (
      error?.code === "auth/unauthorized-continue-uri" ||
      error?.code === "auth/invalid-continue-uri"
    ) {
      try {
        await sendEmailVerificationFn(firebaseUser);
        return;
      } catch (fallbackError) {
        if (!shouldTryVerificationEmailProxy(fallbackError)) {
          throw fallbackError;
        }

        try {
          await requestVerificationEmailViaProxy(firebaseUser);
          return;
        } catch (proxyError) {
          throw proxyError?.code ? proxyError : fallbackError;
        }
      }
    }

    if (!shouldTryVerificationEmailProxy(error)) {
      throw error;
    }

    try {
      await requestVerificationEmailViaProxy(firebaseUser, actionCodeSettings);
      return;
    } catch (proxyError) {
      throw proxyError?.code ? proxyError : error;
    }
  }
};

const createAuthErrorWithCode = (code, message) => {
  const error = new Error(message);
  error.code = code;
  return error;
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
    if (!firebaseClientReady) {
      resetSignedOutState();
      setLoading(false);
      return undefined;
    }

    let cancelled = false;
    let unsubscribe = () => {};

    const connectAuth = async () => {
      try {
        const {
          authModule: { onAuthStateChanged, reload, signOut },
        } = await loadFirebaseAuthRuntime("Authentication");

        if (cancelled) return;

        unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
          setLoading(true);

          if (currentUser) {
            try {
              await reload(currentUser);
            } catch {
              // Non-blocking: fall back to cached auth state if reload fails.
            }
          }

          if (!currentUser || !currentUser.emailVerified) {
            resetSignedOutState();
            setLoading(false);
            return;
          }

          setUser(currentUser);

          try {
            const {
              firestoreModule: { doc, getDoc, serverTimestamp, setDoc },
            } = await loadFirebaseSessionRuntime("User profile");
            const userDoc = await getDoc(doc(db, "users", currentUser.uid));
            if (userDoc.exists()) {
              const data = userDoc.data();
              const accountStatus = normalizeAccountStatus(data?.status);
              if (accountStatus === "blocked" || accountStatus === "pending") {
                resetSignedOutState();
                try {
                  await signOut(auth);
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
                    getAuthBootstrapRef(doc),
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
        });
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
    faceVector,
    faceSamples,
    faceVectorLength,
    designation,
  }) => {
    const {
      authModule: {
        createUserWithEmailAndPassword,
        sendEmailVerification,
        signOut,
        updateProfile,
      },
      firestoreModule: { doc, serverTimestamp, setDoc, writeBatch },
    } = await loadFirebaseSessionRuntime("Account signup");

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
      credential = await createUserWithEmailAndPassword(auth, safeEmail, password);
      sessionStorage.setItem("roleSelection", safeRole);

      if (name) {
        await updateProfile(credential.user, { displayName: name });
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
        createdAt: serverTimestamp(),
      };

      if (safeRole === "student") {
        const safeRollNo = toSafeText(rollNo);
        const safeQrNum = toSafeText(qrNum);
        const rollNoNumber = extractNumericQrValue(safeRollNo);
        const qrNumNumber = extractNumericQrValue(safeQrNum);
        const normalizedFaceVector = normalizeFaceVector(faceVector);
        const normalizedFaceSamples = dedupeFaceVectors(faceSamples).slice(
          -FACE_REGISTRATION_SAMPLE_LIMIT
        );
        const serializedFaceSamples =
          serializeFaceSampleVectors(normalizedFaceSamples);
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
        const stableFaceVector = averageFaceVector([
          ...normalizedFaceSamples,
          normalizedFaceVector,
        ]);
        const resolvedFaceVector =
          stableFaceVector.length >= FACE_MIN_VECTOR_LENGTH
            ? stableFaceVector
            : normalizedFaceVector;
        if (resolvedFaceVector.length >= FACE_MIN_VECTOR_LENGTH) {
          userProfile.faceAttendance = {
            vector: resolvedFaceVector,
            vectorLength: Number.isFinite(faceVectorLength)
              ? Number(faceVectorLength)
              : resolvedFaceVector.length,
            sampleVectors: serializedFaceSamples,
            sampleCount: serializedFaceSamples.length,
            algorithm: "face-api-128d",
            matchThreshold: FACE_MATCH_THRESHOLD,
            updatedAt: serverTimestamp(),
          };
        }
      } else {
        userProfile.designation = designation || "";
      }

      const userRef = doc(db, "users", credential.user.uid);

      if (safeRole === "admin") {
        const bootstrapRef = getAuthBootstrapRef(doc);
        const batch = writeBatch(db);
        batch.set(userRef, userProfile);
        batch.set(
          bootstrapRef,
          {
            adminUid: credential.user.uid,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
        await batch.commit();
      } else {
        await setDoc(userRef, userProfile);
      }

      profileStored = true;

      try {
        await sendVerificationEmailWithFallback(
          credential.user,
          sendEmailVerification
        );
      } catch {
        verificationEmailStatus = "cooldown";
      }
      await signOut(auth);

      return {
        credential,
        verificationEmailStatus,
      };
    } catch (error) {
      if (credential?.user && !profileStored) {
        try {
          await credential.user.delete();
        } catch {
          // Ignore cleanup failures; orphaned auth account can be handled by admin later.
        }
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
          "Staff signup could not be saved. Publish the latest Firestore rules, then the account will be created in pending approval status."
        );
      }
      throw error;
    }
  };

  const login = async (email, password) => {
    const {
      authModule: { reload, signInWithEmailAndPassword, signOut },
      firestoreModule: { doc, getDoc },
    } = await loadFirebaseSessionRuntime("Login");

    const safeEmail = toSafeText(email).toLowerCase();
    const selectedRole = normalizeSessionRole(sessionStorage.getItem("roleSelection"));
    const credential = await signInWithEmailAndPassword(
      auth,
      safeEmail,
      password
    );
    try {
      await reload(credential.user);
    } catch {
      // Non-blocking: continue with current auth state if reload fails.
    }

    try {
      const profileSnapshot = await getDoc(doc(db, "users", credential.user.uid));
      const profileData = profileSnapshot.exists() ? profileSnapshot.data() : null;
      const accountRole = normalizeAccountRole(profileData?.role);
      if (
        profileSnapshot.exists() &&
        normalizeAccountStatus(profileData?.status) === "blocked"
      ) {
        await signOut(auth);
        throw new Error(BLOCKED_ACCOUNT_MESSAGE);
      }
      if (
        profileSnapshot.exists() &&
        normalizeAccountStatus(profileData?.status) === "pending"
      ) {
        await signOut(auth);
        throw new Error(STAFF_PENDING_APPROVAL_MESSAGE);
      }
      if (selectedRole === "admin" && accountRole !== "admin") {
        await signOut(auth);
        throw new Error(
          "This account does not have admin access. Login with an existing admin account."
        );
      }
      if (
        selectedRole === "canteen" &&
        !["admin", "canteen_staff"].includes(accountRole)
      ) {
        await signOut(auth);
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
        await signOut(auth).catch(() => {});
        if (isPermissionDeniedError(error)) {
          throw new Error(
            "Food console access could not be verified. This signed-in account is not recognized as an active canteen staff member or admin by Firestore."
          );
        }
        throw new Error(
          "Unable to verify food console access right now. Please try again."
        );
      }
      if (selectedRole === "admin") {
        await signOut(auth).catch(() => {});
        if (isPermissionDeniedError(error)) {
          throw new Error(
            "Admin access could not be verified. This signed-in account is not recognized as an active admin by Firestore."
          );
        }
        throw new Error("Unable to verify admin access right now. Please try again.");
      }
      // Non-blocking: avoid failing login if profile lookup has a transient issue.
    }

    return credential;
  };

  const resendVerificationEmail = async ({ email, password }) => {
    const {
      authModule: {
        reload,
        sendEmailVerification,
        signInWithEmailAndPassword,
        signOut,
      },
      firestoreModule: { doc, getDoc },
    } = await loadFirebaseSessionRuntime("Email verification");

    const safeEmail = toSafeText(email).toLowerCase();
    const safePassword = String(password || "");
    if (!safeEmail || !safePassword) {
      throw new Error("Enter email and password to resend verification email.");
    }

    const credential = await signInWithEmailAndPassword(
      auth,
      safeEmail,
      safePassword
    );

    try {
      const profileSnapshot = await getDoc(doc(db, "users", credential.user.uid));
      if (
        profileSnapshot.exists() &&
        normalizeAccountStatus(profileSnapshot.data()?.status) === "blocked"
      ) {
        throw new Error(BLOCKED_ACCOUNT_MESSAGE);
      }
      if (
        profileSnapshot.exists() &&
        normalizeAccountStatus(profileSnapshot.data()?.status) === "pending"
      ) {
        throw new Error(STAFF_PENDING_APPROVAL_MESSAGE);
      }

      try {
        await reload(credential.user);
      } catch {
        // Non-blocking: continue if reload fails.
      }

      if (credential.user.emailVerified) {
        return { alreadyVerified: true };
      }

      try {
        await sendVerificationEmailWithFallback(
          credential.user,
          sendEmailVerification
        );
      } catch (error) {
        if (error?.code === "auth/too-many-requests") {
          throw createAuthErrorWithCode(
            "auth/verification-send-busy",
            "A fresh verification link could not be generated right now. Tap resend again in a moment."
          );
        }
        throw error;
      }
      return { alreadyVerified: false };
    } finally {
      await signOut(auth).catch(() => {});
    }
  };

  const logout = async () => {
    if (!firebaseClientReady) {
      sessionStorage.removeItem("roleSelection");
      return;
    }
    const {
      authModule: { signOut },
    } = await loadFirebaseAuthRuntime("Logout");
    sessionStorage.removeItem("roleSelection");
    return signOut(auth);
  };

  const resetPassword = async (email) => {
    const {
      authModule: { sendPasswordResetEmail },
    } = await loadFirebaseAuthRuntime("Password reset");

    const safeEmail = toSafeText(email).toLowerCase();

    if (!safeEmail) {
      throw new Error("Enter your email to reset password.");
    }

    const actionCodeSettings = buildResetActionCodeSettings();
    if (!actionCodeSettings) {
      await sendPasswordResetEmail(auth, safeEmail);
      return;
    }

    try {
      await sendPasswordResetEmail(auth, safeEmail, actionCodeSettings);
    } catch (error) {
      if (
        error?.code === "auth/unauthorized-continue-uri" ||
        error?.code === "auth/invalid-continue-uri"
      ) {
        await sendPasswordResetEmail(auth, safeEmail);
        return;
      }

      throw error;
    }
  };

  const value = {
    user,
    role,
    profile,
    loading,
    firebaseReady: firebaseClientReady,
    startupIssue: firebaseStartupIssue,
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


