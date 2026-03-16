import { useCallback, useEffect, useMemo, useState } from "react";
import { applyActionCode } from "firebase/auth";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../state/auth";
import { auth } from "../lib/firebase";
import { prefetchRoute } from "../lib/routePrefetch";
import { useToast } from "../hooks/useToast";
import { useAutosaveDraft } from "../hooks/useAutosaveDraft";
import { useDirtyPrompt } from "../hooks/useDirtyPrompt";
import FaceAttendanceModal from "../components/FaceAttendanceModal";

const AUTH_BACKGROUND_IMAGE = "/auth-campus.png";
const AUTH_DRAFT_KEY = "a3hub:draft:auth";
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SECURITY_EMAIL_INBOX_HINT =
  "Check Primary inbox first. If Gmail sends it to Spam, mark Not spam to move future emails to Primary.";
const TOO_MANY_REQUESTS_MESSAGE =
  "Too many requests right now. Please wait 15 minutes and try again.";
const FACE_MATCH_THRESHOLD = 0.74;
const FACE_MIN_VECTOR_LENGTH = 64;

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

const resolveAuthErrorMessage = (err, fallback) => {
  if (err?.code === "auth/too-many-requests") {
    return TOO_MANY_REQUESTS_MESSAGE;
  }
  if (err?.code === "auth/quota-exceeded") {
    return "Service quota reached. Please try again later.";
  }
  return err?.message || fallback;
};

export default function AuthPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    login,
    signup,
    resetPassword,
    user,
    logout,
    resendVerificationEmail,
  } = useAuth();
  const { success, error: toastError, info } = useToast();
  const [mode, setMode] = useState("login");
  const [selectedRole, setSelectedRole] = useState(() => {
    return sessionStorage.getItem("roleSelection") || "student";
  });
  const [form, setForm] = useState({
    name: "",
    department: "",
    year: "",
    rollNo: "",
    designation: "",
    email: "",
    password: "",
  });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [awaitingVerification, setAwaitingVerification] = useState(false);
  const [isFaceRegisterModalOpen, setIsFaceRegisterModalOpen] = useState(false);
  const [registeredFaceSamples, setRegisteredFaceSamples] = useState([]);
  const [registeredFaceVector, setRegisteredFaceVector] = useState([]);
  const [registeredFaceVectorLength, setRegisteredFaceVectorLength] = useState(0);
  const [faceRegisterStatus, setFaceRegisterStatus] = useState("");
  const [faceRegisterError, setFaceRegisterError] = useState("");
  const [resendingVerification, setResendingVerification] = useState(false);
  const [processingVerificationLink, setProcessingVerificationLink] = useState(false);

  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const modeParam = searchParams.get("mode");
    const oobCode = searchParams.get("oobCode");

    if (modeParam === "resetPassword" && oobCode) {
      navigate(`/password-change${location.search}`, { replace: true });
      return;
    }

    if (modeParam === "verifyEmail" && oobCode) {
      let cancelled = false;
      const verifyEmailCode = async () => {
        setProcessingVerificationLink(true);
        setError("");
        setMessage("");

        try {
          await applyActionCode(auth, oobCode);
          if (cancelled) return;
          setAwaitingVerification(false);
          setMode("login");
          setMessage("Email verified successfully. You can login now.");
          success("Email verified successfully.");
        } catch (err) {
          if (cancelled) return;
          const nextError =
            err?.code === "auth/invalid-action-code" ||
            err?.code === "auth/expired-action-code"
              ? "Verification link is invalid or expired. Resend verification email."
              : err?.message || "Unable to verify email right now.";
          setError(nextError);
          toastError(nextError);
        } finally {
          if (!cancelled) {
            setProcessingVerificationLink(false);
            navigate("/", { replace: true });
          }
        }
      };

      void verifyEmailCode();
      return () => {
        cancelled = true;
      };
    }

    if (user) {
      navigate("/home");
    }
  }, [location.search, navigate, success, toastError, user]);

  const clearFieldError = useCallback((field) => {
    setFieldErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }, []);

  const onChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    clearFieldError(name);
  };

  const handleRegisterFaceDescriptor = useCallback(({ vector, vectorLength }) => {
    const normalizedVector = normalizeFaceVector(vector);
    if (normalizedVector.length < FACE_MIN_VECTOR_LENGTH) {
      const message = "Unable to capture a valid front-facing face. Try again.";
      setFaceRegisterStatus("");
      setFaceRegisterError(message);
      return {
        tone: "error",
        message,
      };
    }

    const resolvedLength = Number.isFinite(vectorLength)
      ? Number(vectorLength)
      : normalizedVector.length;
    const message =
      `Face profile ready (${resolvedLength}D). Front-facing auto capture completed.`;

    setRegisteredFaceSamples([normalizedVector]);
    setRegisteredFaceVector(normalizedVector);
    setRegisteredFaceVectorLength(resolvedLength);
    setFaceRegisterError("");
    setFaceRegisterStatus(message);
    clearFieldError("faceScan");

    return {
      tone: "success",
      message,
    };
  }, [clearFieldError]);

  useEffect(() => {
    if (mode === "signup" && selectedRole === "student") {
      return;
    }
    setRegisteredFaceSamples([]);
    setRegisteredFaceVector([]);
    setRegisteredFaceVectorLength(0);
    setFaceRegisterStatus("");
    setFaceRegisterError("");
  }, [mode, selectedRole]);

  const restoreDraft = useCallback((draftValue) => {
    if (!draftValue || typeof draftValue !== "object") return;
    const draftMode = draftValue.mode === "signup" ? "signup" : "login";
    const rawRole = String(draftValue.selectedRole || "").toLowerCase();
    const draftRole =
      rawRole === "staff" || rawRole === "parent" || rawRole === "admin"
        ? rawRole
        : "student";
    const draftForm =
      draftValue.form && typeof draftValue.form === "object"
        ? draftValue.form
        : {};

    setMode(
      (draftRole === "parent" || draftRole === "admin") && draftMode === "signup"
        ? "login"
        : draftMode
    );
    setSelectedRole(draftRole);
    sessionStorage.setItem("roleSelection", draftRole);
    setForm((prev) => ({
      ...prev,
      ...draftForm,
      password: "",
    }));
    info("Restored saved authentication draft.");
  }, [info]);

  const draftPayload = useMemo(
    () => ({
      mode,
      selectedRole,
      form: {
        ...form,
        password: "",
      },
    }),
    [form, mode, selectedRole]
  );

  const { clearDraft } = useAutosaveDraft({
    key: AUTH_DRAFT_KEY,
    value: draftPayload,
    onRestore: restoreDraft,
    enabled: !awaitingVerification,
  });

  useEffect(() => {
    setFieldErrors((prev) => {
      const next = { ...prev };

      if (mode === "login") {
        delete next.name;
        delete next.department;
        delete next.year;
        delete next.rollNo;
        delete next.faceScan;
        delete next.designation;
      }

      if (selectedRole !== "student") {
        delete next.year;
        delete next.rollNo;
        delete next.faceScan;
      }
      if (selectedRole === "admin") {
        delete next.department;
      }
      if (selectedRole === "student") {
        delete next.designation;
      }

      return next;
    });

    if (mode === "login" || selectedRole !== "student") {
      setIsFaceRegisterModalOpen(false);
      setRegisteredFaceVector([]);
      setRegisteredFaceVectorLength(0);
      setFaceRegisterStatus("");
      setFaceRegisterError("");
    }
  }, [mode, selectedRole]);

  const handleRoleSelect = (value) => {
    setSelectedRole(value);
    sessionStorage.setItem("roleSelection", value);
    if (value === "parent" && mode === "signup") {
      setMode("login");
      setAwaitingVerification(false);
      setError("");
      setMessage("Parent signup is disabled. Use login with student credentials.");
      info("Parent signup is disabled. Use login with student credentials.");
      return;
    }
    if (value === "admin" && mode === "signup") {
      setMode("login");
      setAwaitingVerification(false);
      setError("");
      setMessage("Admin signup is disabled. Login with existing admin account.");
      info("Admin signup is disabled. Login with existing admin account.");
      return;
    }
    setFieldErrors({});
    setError("");
    setMessage("");
  };

  const handleToggleMode = () => {
    if (selectedRole === "parent") {
      setMode("login");
      setAwaitingVerification(false);
      setError("");
      setMessage("Parent signup is disabled. Use login with student credentials.");
      info("Parent signup is disabled. Use login with student credentials.");
      return;
    }
    if (selectedRole === "admin") {
      setMode("login");
      setAwaitingVerification(false);
      setError("");
      setMessage("Admin signup is disabled. Login with existing admin account.");
      info("Admin signup is disabled. Login with existing admin account.");
      return;
    }
    setMode((prev) => (prev === "login" ? "signup" : "login"));
    setAwaitingVerification(false);
    setFieldErrors({});
    setError("");
    setMessage("");
  };

  const handleShowLogin = () => {
    setAwaitingVerification(false);
    setMode("login");
    setError("");
    setMessage("");
  };

  const roleLabel =
    selectedRole === "staff"
      ? "Staff"
      : selectedRole === "parent"
      ? "Parent"
      : selectedRole === "admin"
      ? "Admin"
      : "Student";
  const isLoginMode = mode === "login";
  const isParentRole = selectedRole === "parent";
  const hasRegisteredFace = registeredFaceVector.length >= FACE_MIN_VECTOR_LENGTH;
  const isDirty = useMemo(() => {
    const hasFieldContent = Object.values(form).some((value) =>
      String(value || "").trim()
    );
    return hasFieldContent || mode !== "login" || selectedRole !== "student";
  }, [form, mode, selectedRole]);

  useDirtyPrompt(
    isDirty && !loading && !awaitingVerification,
    "You have unsaved auth form changes. Leave this page?"
  );

  const validateForm = useCallback(() => {
    const nextErrors = {};
    const email = form.email.trim();
    const password = form.password.trim();

    if (!email) {
      nextErrors.email = "Email is required.";
    } else if (!EMAIL_REGEX.test(email)) {
      nextErrors.email = "Enter a valid email address.";
    }

    if (!password) {
      nextErrors.password = "Password is required.";
    } else if (!isLoginMode && password.length < 6) {
      nextErrors.password = "Password must be at least 6 characters.";
    }

    if (!isLoginMode) {
      if (!form.name.trim()) nextErrors.name = "Name is required.";
      if (selectedRole !== "admin" && !form.department.trim()) {
        nextErrors.department = "Department is required.";
      }

      if (selectedRole === "student") {
        if (!String(form.year).trim()) {
          nextErrors.year = "Year is required.";
        } else {
          const yearNumber = Number(form.year);
          if (!Number.isInteger(yearNumber) || yearNumber < 1 || yearNumber > 6) {
            nextErrors.year = "Year must be between 1 and 6.";
          }
        }

        if (!form.rollNo.trim()) {
          nextErrors.rollNo = "Roll number is required.";
        }

        if (registeredFaceVector.length < FACE_MIN_VECTOR_LENGTH) {
          nextErrors.faceScan =
            "Capture one clear front-facing face for student attendance recognition.";
        }
      } else if (selectedRole === "staff" && !form.designation.trim()) {
        nextErrors.designation = "Designation is required.";
      }
    }

    return nextErrors;
  }, [form, isLoginMode, registeredFaceVector.length, selectedRole]);

  const renderFieldError = (fieldName) =>
    fieldErrors[fieldName] ? (
      <p className="text-xs font-semibold text-rose-700">{fieldErrors[fieldName]}</p>
    ) : null;

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const targetPath =
      selectedRole === "staff"
        ? "/staff/home"
        : selectedRole === "parent"
        ? "/parent/home"
        : selectedRole === "admin"
        ? "/admin/dashboard"
        : "/student/home";

    const runPrefetch = () => {
      void prefetchRoute(targetPath);
    };

    if (typeof window.requestIdleCallback === "function") {
      const idleId = window.requestIdleCallback(runPrefetch, { timeout: 1400 });
      return () => window.cancelIdleCallback?.(idleId);
    }

    const timeoutId = window.setTimeout(runPrefetch, 600);
    return () => window.clearTimeout(timeoutId);
  }, [selectedRole]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");
    const validationErrors = validateForm();
    if (Object.keys(validationErrors).length > 0) {
      setFieldErrors(validationErrors);
      setError("Please fix the highlighted fields.");
      toastError("Please fix the highlighted form fields.");
      return;
    }

    setLoading(true);

    try {
      if (mode !== "login" && selectedRole === "parent") {
        setMode("login");
        setMessage("Parent signup is disabled. Use login with student credentials.");
        info("Parent signup is disabled. Use login with student credentials.");
        return;
      }
      if (mode !== "login" && selectedRole === "admin") {
        setMode("login");
        setMessage("Admin signup is disabled. Login with existing admin account.");
        info("Admin signup is disabled. Login with existing admin account.");
        return;
      }
      if (mode === "login") {
        sessionStorage.setItem("roleSelection", selectedRole);
        const credential = await login(form.email, form.password);
        if (!credential.user.emailVerified) {
          await logout();
          setAwaitingVerification(true);
          setMode("login");
          info(
            "Check your verification email. If not received, use Resend Verification Email after a short wait."
          );
          return;
        }

        sessionStorage.setItem("roleSelection", selectedRole);
        clearDraft();
        navigate("/home");
        return;
      }

      await signup({
        email: form.email,
        password: form.password,
        role: selectedRole,
        name: form.name,
        department: form.department,
        year: form.year,
        rollNo: form.rollNo,
        faceVector: selectedRole === "student" ? registeredFaceVector : [],
        faceSamples: selectedRole === "student" ? registeredFaceSamples : [],
        faceVectorLength:
          selectedRole === "student" ? registeredFaceVectorLength : 0,
        designation: form.designation,
      });

      setAwaitingVerification(true);
      setMode("login");
      clearDraft();
      success("Account created. Security verification email sent.");
      info(SECURITY_EMAIL_INBOX_HINT);
    } catch (err) {
      const nextError = resolveAuthErrorMessage(
        err,
        "Authentication failed. Please try again."
      );
      setError(nextError);
      toastError(nextError);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    setError("");
    setMessage("");
    const resetEmail = form.email.trim();

    if (!resetEmail) {
      setFieldErrors((prev) => ({
        ...prev,
        email: "Email is required.",
      }));
      setError("Enter your email to reset your password.");
      toastError("Enter your email to reset your password.");
      return;
    }
    if (!EMAIL_REGEX.test(resetEmail)) {
      setFieldErrors((prev) => ({
        ...prev,
        email: "Enter a valid email address.",
      }));
      setError("Enter a valid email address.");
      toastError("Enter a valid email address.");
      return;
    }

    try {
      await resetPassword(resetEmail);
      clearFieldError("email");
      setMessage(
        "Password reset security email sent. Check Primary inbox to continue."
      );
      success("Password reset security email sent.");
      info(SECURITY_EMAIL_INBOX_HINT);
    } catch (err) {
      const nextError = resolveAuthErrorMessage(
        err,
        "Unable to send reset email."
      );
      setError(nextError);
      toastError(nextError);
    }
  };

  const handleResendVerification = async () => {
    if (resendingVerification) return;
    setError("");
    setMessage("");

    const safeEmail = form.email.trim();
    const safePassword = form.password.trim();

    if (!safeEmail || !safePassword) {
      const nextMessage =
        "Enter email and password on login screen, then tap Resend verification email.";
      setMessage(nextMessage);
      info(nextMessage);
      return;
    }

    setResendingVerification(true);
    try {
      const result = await resendVerificationEmail({
        email: safeEmail,
        password: safePassword,
      });
      if (result?.alreadyVerified) {
        setMessage("Email already verified. You can login now.");
        success("Email already verified.");
      } else {
        setMessage("Verification email sent again. Check inbox/spam.");
        success("Verification email resent.");
        info(SECURITY_EMAIL_INBOX_HINT);
      }
    } catch (err) {
      const nextError = resolveAuthErrorMessage(
        err,
        "Unable to resend verification email right now."
      );
      setError(nextError);
      toastError(nextError);
    } finally {
      setResendingVerification(false);
    }
  };

  const panelClassName =
    "relative w-full rounded-[2rem] border border-ocean/45 bg-[linear-gradient(160deg,rgb(var(--cream)_/_0.88)_0%,rgb(var(--sand)_/_0.8)_62%,rgb(var(--clay)_/_0.62)_100%)] px-5 pb-6 pt-6 text-ink shadow-[0_28px_52px_-40px_rgb(var(--cocoa)_/_0.34)] backdrop-blur-[6px] sm:px-8 sm:pb-8 sm:pt-8";

  const authImageClassName =
    "absolute inset-0 bg-cover bg-center bg-no-repeat contrast-105 saturate-[1.08]";

  const authOverlayClassName =
    "pointer-events-none absolute inset-0 bg-[linear-gradient(145deg,rgb(var(--sand)_/_0.36)_0%,rgb(var(--mist)_/_0.2)_58%,rgb(var(--cream)_/_0.32)_100%)]";

  const authGlowClassName =
    "pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_17%_14%,rgb(var(--ocean)_/_0.16),transparent_44%),radial-gradient(circle_at_80%_78%,rgb(var(--aurora)_/_0.2),transparent_54%)]";

  const inputClassName =
    "w-full border-0 border-b border-ocean/52 bg-transparent px-1 py-2.5 text-sm text-ink placeholder:text-ink/55 focus:border-aurora focus:outline-none";

  if (processingVerificationLink) {
    return (
      <div className="relative flex min-h-screen items-start justify-center overflow-x-hidden overflow-y-auto px-4 py-8 sm:items-center">
        <div
          className={authImageClassName}
          style={{ backgroundImage: `url(${AUTH_BACKGROUND_IMAGE})` }}
          aria-hidden="true"
        />
        <div className={authOverlayClassName} />
        <div className={authGlowClassName} />

        <div className={`${panelClassName} max-w-[430px]`}>
          <div className="text-center">
            <p className="text-[0.7rem] font-semibold uppercase tracking-[0.26em] text-ink/72">
              Account Security
            </p>
            <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
              Verifying Email
            </h1>
            <p className="mt-3 text-sm text-ink/80">
              Please wait while we verify your email link.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (awaitingVerification) {
    return (
      <div className="relative flex min-h-screen items-start justify-center overflow-x-hidden overflow-y-auto px-4 py-8 sm:items-center">
        <div
          className={authImageClassName}
          style={{ backgroundImage: `url(${AUTH_BACKGROUND_IMAGE})` }}
          aria-hidden="true"
        />
        <div className={authOverlayClassName} />
        <div className={authGlowClassName} />

        <div className={`${panelClassName} max-w-[430px]`}>
          <div className="mb-6 text-center">
            <p className="text-[0.7rem] font-semibold uppercase tracking-[0.26em] text-ink/72">
              Account Security
            </p>
            <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
              Verify Email
            </h1>
            <p className="mt-3 text-sm text-ink/80">
              Check Primary inbox for your security verification email.
              If Gmail places it in Spam, tap Not spam and move it to Primary.
            </p>
          </div>

          <div className="grid gap-3">
            <button
              type="button"
              onClick={handleResendVerification}
              disabled={resendingVerification}
              className="w-full rounded-full bg-[linear-gradient(135deg,rgb(var(--ocean))_0%,rgb(var(--aurora))_100%)] px-4 py-3 text-sm font-semibold text-white shadow-[0_14px_28px_-18px_rgb(var(--cocoa)_/_0.42)] transition-all hover:-translate-y-0.5 hover:brightness-105 active:translate-y-0 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-75"
            >
              {resendingVerification
                ? "Resending verification..."
                : "Resend Verification Email"}
            </button>
            <button
              type="button"
              onClick={handleShowLogin}
              className="w-full rounded-full border border-ocean/45 bg-white/80 px-4 py-3 text-sm font-semibold text-ink transition-all hover:bg-white"
            >
              Back to Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen items-start justify-center overflow-x-hidden overflow-y-auto px-4 py-8 sm:items-center">
      <div
        className={authImageClassName}
        style={{ backgroundImage: `url(${AUTH_BACKGROUND_IMAGE})` }}
        aria-hidden="true"
      />
      <div className={authOverlayClassName} />
      <div className={authGlowClassName} />

      <div className={`${panelClassName} max-w-[470px]`}>
        <div className="mb-6 text-center">
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.26em] text-ink/72">
            {roleLabel} Portal
          </p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">
            {isLoginMode ? "Login" : "Sign Up"}
          </h1>
          <p className="mt-2 text-sm text-ink/80">
            {isLoginMode
              ? "Login to continue to your A3 Hub dashboard"
              : `Create your ${roleLabel.toLowerCase()} account`}
          </p>
        </div>

        <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
          <div className="grid gap-2">
            <label className="text-xs font-semibold uppercase tracking-[0.2em] text-ink/72">
              Role
            </label>
            <div className="grid grid-cols-4 rounded-full border border-ocean/45 bg-white/86 p-1.5">
              {[
                { label: "Student", value: "student" },
                { label: "Staff", value: "staff" },
                { label: "Parent", value: "parent" },
                { label: "Admin", value: "admin" },
              ].map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => handleRoleSelect(item.value)}
                  className={`rounded-full px-3 py-1.5 text-sm font-semibold transition-all duration-200 ${
                    selectedRole === item.value
                      ? "bg-[linear-gradient(135deg,rgb(var(--ocean))_0%,rgb(var(--aurora))_100%)] text-white shadow-[0_12px_20px_-14px_rgb(var(--cocoa)_/_0.42)]"
                      : "text-ink/78 hover:bg-sand/70 hover:text-ink"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {mode === "signup" ? (
            <>
              <div
                className={`grid gap-4 ${
                  selectedRole === "admin" ? "sm:grid-cols-1" : "sm:grid-cols-2"
                }`}
              >
                <div className="grid gap-1.5">
                  <label className="text-sm font-semibold text-ink/80">Name</label>
                  <input
                    className={inputClassName}
                    name="name"
                    value={form.name}
                    onChange={onChange}
                    placeholder="Enter Name"
                  />
                  {renderFieldError("name")}
                </div>
                {selectedRole !== "admin" ? (
                  <div className="grid gap-1.5">
                    <label className="text-sm font-semibold text-ink/80">
                      Department
                    </label>
                    <input
                      className={inputClassName}
                      name="department"
                      value={form.department}
                      onChange={onChange}
                      placeholder="AI & DS"
                    />
                    {renderFieldError("department")}
                  </div>
                ) : null}
              </div>

              {selectedRole === "student" ? (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="grid gap-1.5">
                      <label className="text-sm font-semibold text-ink/80">Year</label>
                      <input
                        className={inputClassName}
                        type="number"
                        name="year"
                        min="1"
                        max="6"
                        value={form.year}
                        onChange={onChange}
                        placeholder="1"
                      />
                      {renderFieldError("year")}
                    </div>
                    <div className="grid gap-1.5">
                      <label className="text-sm font-semibold text-ink/80">Roll No</label>
                      <input
                        className={inputClassName}
                        name="rollNo"
                        value={form.rollNo}
                        onChange={onChange}
                        placeholder="4207..."
                      />
                      {renderFieldError("rollNo")}
                    </div>
                  </div>
                  <div className="grid gap-1.5">
                    <label className="text-sm font-semibold text-ink/80">
                      Attendance Setup
                    </label>
                    <div className="rounded-2xl border border-ocean/25 bg-[linear-gradient(145deg,rgb(var(--cream)_/_0.92)_0%,rgb(var(--sand)_/_0.8)_58%,rgb(var(--mist)_/_0.72)_100%)] px-3.5 py-3 text-xs text-ink/76 shadow-[inset_0_1px_0_rgb(var(--cream)_/_0.9),0_12px_22px_-18px_rgb(var(--ocean)_/_0.38)]">
                      <p className="font-medium text-ink/82">
                        Look straight at the camera. Face capture happens automatically when your face is centered and front-facing.
                      </p>
                      <div className="mt-2.5 flex flex-wrap items-center gap-2.5">
                        <button
                          type="button"
                          onClick={() => {
                            setFaceRegisterError("");
                            setIsFaceRegisterModalOpen(true);
                          }}
                          className="inline-flex min-h-[34px] items-center rounded-full border border-ocean/65 bg-[linear-gradient(140deg,rgb(var(--ocean))_0%,rgb(var(--aurora))_58%,rgb(var(--cocoa))_100%)] px-4 py-1.5 text-[11px] font-semibold text-white shadow-[0_14px_24px_-16px_rgb(var(--cocoa)_/_0.62)] transition-all duration-200 hover:-translate-y-0.5 hover:brightness-105 active:translate-y-0 active:scale-[0.985]"
                        >
                          {hasRegisteredFace ? "Re-Capture Face" : "Open Face Capture"}
                        </button>
                        <span
                          className={`inline-flex min-h-[34px] items-center rounded-full px-3 py-1.5 text-[11px] font-semibold tracking-[0.01em] shadow-[inset_0_1px_0_rgb(var(--cream)_/_0.9)] ${
                            hasRegisteredFace
                              ? "border border-emerald-300/85 bg-[linear-gradient(135deg,rgb(211_248_227)_0%,rgb(187_242_211)_100%)] text-emerald-900"
                              : "border border-amber-300/85 bg-[linear-gradient(135deg,rgb(255_240_204)_0%,rgb(255_228_173)_100%)] text-amber-900"
                          }`}
                        >
                          {hasRegisteredFace ? "Face Ready" : "Front Face Required"}
                        </span>
                      </div>
                    </div>
                    {renderFieldError("faceScan")}
                    {faceRegisterStatus ? (
                      <p className="text-xs font-semibold text-emerald-700">
                        {faceRegisterStatus}
                      </p>
                    ) : null}
                    {faceRegisterError ? (
                      <p className="text-xs font-semibold text-rose-700">
                        {faceRegisterError}
                      </p>
                    ) : null}
                  </div>
                </>
              ) : (
                <div className="grid gap-1.5">
                  <label className="text-sm font-semibold text-ink/80">
                    Designation
                  </label>
                  <input
                    className={inputClassName}
                    name="designation"
                    value={form.designation}
                    onChange={onChange}
                    placeholder={selectedRole === "admin" ? "Administrator" : "Professor"}
                  />
                  {renderFieldError("designation")}
                </div>
              )}
            </>
          ) : null}

          <div className="grid gap-1.5">
            <label className="text-sm font-semibold text-ink/80">Email</label>
            <input
              className={inputClassName}
              type="email"
              name="email"
              autoComplete="username"
              value={form.email}
              onChange={onChange}
              placeholder="Enter Email"
            />
            {renderFieldError("email")}
          </div>

          <div className="grid gap-1.5">
            <label className="text-sm font-semibold text-ink/80">Password</label>
            <input
              className={inputClassName}
              type="password"
              name="password"
              autoComplete={isLoginMode ? "current-password" : "new-password"}
              value={form.password}
              onChange={onChange}
              placeholder="Enter Password"
            />
            {renderFieldError("password")}
          </div>

          {isLoginMode ? (
            <div className="flex justify-end text-sm">
              <button
                type="button"
                onClick={handleReset}
                className="font-semibold text-ink/80 transition-colors hover:text-ocean"
              >
                Forget Password
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleReset}
              className="self-start text-sm font-semibold text-ink/80 transition-colors hover:text-ocean"
            >
              Forgot / Change password?
            </button>
          )}

          {error ? (
            <div className="rounded-xl border border-red-200/[0.55] bg-red-500/[0.22] px-3 py-2 text-xs font-medium text-red-50">
              {error}
            </div>
          ) : null}
          {message ? (
            <div className="rounded-xl border border-ocean/45 bg-sand/88 px-3 py-2 text-xs font-medium text-ink/85">
              {message}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            className="mt-1 rounded-full bg-[linear-gradient(135deg,rgb(var(--ocean))_0%,rgb(var(--aurora))_100%)] px-4 py-3 text-base font-semibold text-white shadow-[0_14px_28px_-18px_rgb(var(--cocoa)_/_0.42)] transition-all hover:-translate-y-0.5 hover:brightness-105 active:translate-y-0 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-80"
          >
            {loading
              ? "Securing access..."
              : mode === "login"
              ? "Log in"
              : "Create Account"}
          </button>
        </form>

        {isParentRole && isLoginMode ? (
          <div className="mt-6 text-center text-sm text-ink/84">
            Parent signup is disabled. Use student email and password to login.
          </div>
        ) : (
          <div className="mt-6 text-center text-sm text-ink/84">
            {isLoginMode ? "Don't have a account?" : "Already have an account?"}
            <button
              type="button"
              onClick={handleToggleMode}
              className="ml-1 font-semibold text-ink/84 underline underline-offset-4 transition-colors hover:text-ocean"
            >
              {isLoginMode ? "Register" : "Login"}
            </button>
          </div>
        )}
      </div>

      {mode === "signup" && selectedRole === "student" ? (
        <FaceAttendanceModal
          open={isFaceRegisterModalOpen}
          mode="register"
          title="Student Face Registration"
          description="Look straight at the camera. A single front-facing face profile will be captured automatically for your student account."
          thresholdPercent={Math.round(FACE_MATCH_THRESHOLD * 100)}
          onClose={() => setIsFaceRegisterModalOpen(false)}
          onDescriptor={handleRegisterFaceDescriptor}
        />
      ) : null}
    </div>
  );
}





