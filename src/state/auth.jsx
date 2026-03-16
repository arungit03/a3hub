/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from "firebase/auth";
import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { auth, db } from "../lib/firebase";
import { registerPushTokenForUser } from "../lib/pushNotifications";
import { extractNumericQrValue } from "../lib/qr";

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

const normalizeAccountRole = (value) => {
  const normalized = toSafeText(value).toLowerCase();
  if (!normalized) return "";

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

  if (safeSelectedRole === "admin") {
    return "admin";
  }

  if (safeSelectedRole === "staff") {
    return "staff";
  }

  if (safeSelectedRole === "parent") {
    return "parent";
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

const getAuthBootstrapRef = () =>
  doc(db, "systemSettings", AUTH_BOOTSTRAP_DOC_ID);

const sendVerificationEmailWithFallback = async (firebaseUser) => {
  if (!firebaseUser) {
    throw new Error("Unable to send verification email.");
  }

  const actionCodeSettings = buildVerificationActionCodeSettings();
  if (!actionCodeSettings) {
    await sendEmailVerification(firebaseUser);
    return;
  }

  try {
    await sendEmailVerification(firebaseUser, actionCodeSettings);
  } catch (error) {
    if (
      error?.code === "auth/unauthorized-continue-uri" ||
      error?.code === "auth/invalid-continue-uri"
    ) {
      await sendEmailVerification(firebaseUser);
      return;
    }

    throw error;
  }
};

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState("student");
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setLoading(true);

      if (currentUser) {
        try {
          await reload(currentUser);
        } catch {
          // Non-blocking: fall back to cached auth state if reload fails.
        }
      }

      if (!currentUser || !currentUser.emailVerified) {
        setUser(null);
        setRole(normalizeSessionRole(sessionStorage.getItem("roleSelection")));
        setProfile(null);
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
            setUser(null);
            setProfile(null);
            setRole(normalizeSessionRole(sessionStorage.getItem("roleSelection")));
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
          const selectedRole = normalizeSessionRole(
            sessionStorage.getItem("roleSelection")
          );
          const fallbackAccountRole = normalizeAccountRole(selectedRole) || "student";
          const effectiveRole = resolveEffectiveRole({
            accountRole: fallbackAccountRole,
            selectedRole,
          });
          const resolvedName = resolveProfileName({
            profileName: "",
            userName: currentUser.displayName,
            userEmail: currentUser.email,
          });
          setRole(effectiveRole);
          sessionStorage.setItem("roleSelection", effectiveRole);
          setProfile({
            email: currentUser.email,
            name: resolvedName,
            role: effectiveRole,
            accountRole: fallbackAccountRole,
            status: "active",
          });
        }
      } catch {
        const selectedRole = normalizeSessionRole(
          sessionStorage.getItem("roleSelection")
        );
        const fallbackAccountRole = normalizeAccountRole(selectedRole) || "student";
        const effectiveRole = resolveEffectiveRole({
          accountRole: fallbackAccountRole,
          selectedRole,
        });
        const resolvedName = resolveProfileName({
          profileName: "",
          userName: currentUser.displayName,
          userEmail: currentUser.email,
        });
        setRole(effectiveRole);
        sessionStorage.setItem("roleSelection", effectiveRole);
        setProfile({
          email: currentUser.email,
          name: resolvedName,
          role: effectiveRole,
          accountRole: fallbackAccountRole,
          status: "active",
        });
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user?.uid) return;
    void registerPushTokenForUser(user.uid);
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
    const safeEmail = toSafeText(email).toLowerCase();
    const safeRole = normalizeSessionRole(role);

    if (safeRole === "parent") {
      throw new Error("Parent signup is disabled. Use login credentials provided.");
    }

    if (!["student", "staff"].includes(safeRole)) {
      throw new Error("Invalid role selected.");
    }

    let credential = null;
    let profileStored = false;

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
            sampleVectors: normalizedFaceSamples,
            sampleCount: normalizedFaceSamples.length,
            algorithm: "face-api-128d",
            matchThreshold: FACE_MATCH_THRESHOLD,
            updatedAt: serverTimestamp(),
          };
        }
      } else {
        userProfile.designation = designation || "";
      }

      const userRef = doc(db, "users", credential.user.uid);
      await setDoc(userRef, userProfile);

      profileStored = true;

      try {
        await sendVerificationEmailWithFallback(credential.user);
      } catch (error) {
        if (error?.code !== "auth/too-many-requests") {
          throw error;
        }
        // Non-blocking: account is created; user can resend after cooldown.
      }
      await signOut(auth);

      return credential;
    } catch (error) {
      if (credential?.user && !profileStored) {
        try {
          await credential.user.delete();
        } catch {
          // Ignore cleanup failures; orphaned auth account can be handled by admin later.
        }
      }
      throw error;
    }
  };

  const login = async (email, password) => {
    const safeEmail = toSafeText(email).toLowerCase();
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
      if (
        profileSnapshot.exists() &&
        normalizeAccountStatus(profileSnapshot.data()?.status) === "blocked"
      ) {
        await signOut(auth);
        throw new Error(BLOCKED_ACCOUNT_MESSAGE);
      }
      if (
        profileSnapshot.exists() &&
        normalizeAccountStatus(profileSnapshot.data()?.status) === "pending"
      ) {
        await signOut(auth);
        throw new Error(STAFF_PENDING_APPROVAL_MESSAGE);
      }
    } catch (error) {
      if (
        error?.message === BLOCKED_ACCOUNT_MESSAGE ||
        error?.message === STAFF_PENDING_APPROVAL_MESSAGE
      ) {
        throw error;
      }
      // Non-blocking: avoid failing login if profile lookup has a transient issue.
    }

    return credential;
  };

  const resendVerificationEmail = async ({ email, password }) => {
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
        await sendVerificationEmailWithFallback(credential.user);
      } catch (error) {
        if (error?.code === "auth/too-many-requests") {
          throw new Error(
            "Too many verification attempts. Please wait 15 minutes and try again."
          );
        }
        throw error;
      }
      return { alreadyVerified: false };
    } finally {
      await signOut(auth).catch(() => {});
    }
  };

  const logout = () => {
    sessionStorage.removeItem("roleSelection");
    return signOut(auth);
  };

  const resetPassword = (email) => {
    const safeEmail = toSafeText(email).toLowerCase();

    if (!safeEmail) {
      return Promise.reject(new Error("Enter your email to reset password."));
    }

    const actionCodeSettings = buildResetActionCodeSettings();
    if (!actionCodeSettings) {
      return sendPasswordResetEmail(auth, safeEmail);
    }

    return sendPasswordResetEmail(auth, safeEmail, actionCodeSettings).catch(
      (error) => {
        if (
          error?.code === "auth/unauthorized-continue-uri" ||
          error?.code === "auth/invalid-continue-uri"
        ) {
          return sendPasswordResetEmail(auth, safeEmail);
        }

        throw error;
      }
    );
  };

  const value = {
    user,
    role,
    profile,
    loading,
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


