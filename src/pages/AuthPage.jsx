import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../state/auth";
import { supabase } from "../lib/supabase";
import { prefetchRoute } from "../lib/routePrefetch";
import { useToast } from "../hooks/useToast";
import { useAutosaveDraft } from "../hooks/useAutosaveDraft";
import { useDirtyPrompt } from "../hooks/useDirtyPrompt";

const AUTH_BACKGROUND_IMAGE = "/auth-campus.png";
const AUTH_DRAFT_KEY = "a3hub:draft:auth";
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SECURITY_EMAIL_INBOX_HINT =
  "Check Primary inbox first. If Gmail sends it to Spam, mark Not spam to move future emails to Primary.";
const TOO_MANY_REQUESTS_MESSAGE =
  "Too many requests right now. Please wait 15 minutes and try again.";
const PARENT_SIGNUP_DISABLED_MESSAGE =
  "Parent signup is disabled. Use login with student credentials.";
const CANTEEN_LOGIN_ONLY_MESSAGE =
  "Food console accounts are created by admin. Use login with a canteen staff or admin account.";

const resolveAuthTargetPath = (role) => {
  if (role === "canteen") return "/canteen/dashboard";
  if (role === "admin") return "/admin/dashboard";
  if (role === "staff") return "/staff/home";
  if (role === "parent") return "/parent/home";
  return "/student/home";
};

const resolveAuthErrorMessage = (err, fallback) => {
  if (err?.code === "auth/too-many-requests") {
    return TOO_MANY_REQUESTS_MESSAGE;
  }
  if (err?.code === "auth/verification-send-busy") {
    return "A fresh verification link could not be generated right now. Tap resend again in a moment.";
  }
  if (err?.code === "auth/operation-not-allowed") {
    return "Email/password sign-in is disabled in Supabase Auth. Enable it in the Supabase dashboard.";
  }
  if (
    err?.code === "auth/invalid-continue-uri" ||
    err?.code === "auth/unauthorized-continue-uri"
  ) {
    return "Verification link configuration is invalid for this domain. Add your app domain to Supabase Auth redirect URLs.";
  }
  if (err?.code === "auth/network-request-failed") {
    return "Network error while sending verification email. Check internet and try again.";
  }
  if (err?.code === "auth/internal-error") {
    return "Supabase could not send the verification email right now. Check Supabase Auth email templates and redirect URLs.";
  }
  if (err?.code === "auth/confirmation-email-failed") {
    return err?.message || "Unable to send confirmation email right now.";
  }
  if (err?.code === "auth/server-email-not-configured") {
    return "Verification email service is not configured. Set SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, and EMAIL_FROM in Netlify.";
  }
  if (err?.code === "auth/email-provider-failed") {
    return "Verification link was created, but the email provider could not send it. Check RESEND_API_KEY and EMAIL_FROM.";
  }
  if (err?.code === "supabase/not-configured") {
    return err?.message || "Supabase is not configured for this deploy.";
  }
  if (err?.code === "auth/email-not-verified") {
    return err?.message || "Verify your email before logging in.";
  }
  if (err?.code === "auth/quota-exceeded") {
    return "Service quota reached. Please try again later.";
  }
  return err?.message || fallback;
};

const resolveVerificationLinkErrorMessage = (err) => {
  if (
    err?.code === "auth/invalid-action-code" ||
    err?.code === "auth/expired-action-code"
  ) {
    return "This verification link is invalid, expired, or replaced by a newer email. If you requested multiple verification emails, open the latest email link only.";
  }
  return err?.message || "Unable to verify email right now.";
};

export default function AuthPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    supabaseReady,
    login,
    signup,
    startupIssue,
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
  const [resendingVerification, setResendingVerification] = useState(false);
  const [processingVerificationLink, setProcessingVerificationLink] = useState(false);
  const authUnavailableMessage =
    startupIssue ||
    "Authentication is unavailable for this deploy. Set Supabase environment variables and redeploy.";

  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const modeParam = searchParams.get("mode");
    const code = searchParams.get("code");
    const legacyCode = searchParams.get("oobCode");

    if ((modeParam === "resetPassword" && legacyCode) || searchParams.get("type") === "recovery") {
      navigate(`/password-change${location.search}`, { replace: true });
      return;
    }

    if (code) {
      let cancelled = false;
      const verifyEmailCode = async () => {
        setProcessingVerificationLink(true);
        setError("");
        setMessage("");

        if (!supabaseReady || !supabase) {
          if (!cancelled) {
            setError(authUnavailableMessage);
            toastError(authUnavailableMessage);
            setProcessingVerificationLink(false);
            navigate("/", { replace: true });
          }
          return;
        }

        try {
          const result = await supabase.auth.exchangeCodeForSession(code);
          if (result.error) throw result.error;
          if (cancelled) return;
          const verifiedEmail = String(result.data?.user?.email || "")
            .trim()
            .toLowerCase();
          if (verifiedEmail) {
            setForm((prev) => ({
              ...prev,
              email: verifiedEmail,
            }));
          }
          setAwaitingVerification(false);
          setMode("login");
          setMessage("Email verified successfully. You can login now.");
          success("Email verified successfully.");
        } catch (err) {
          if (cancelled) return;
          const nextError = resolveVerificationLinkErrorMessage(err);
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
  }, [
    authUnavailableMessage,
    location.search,
    navigate,
    success,
    supabaseReady,
    toastError,
    user,
  ]);

  const clearFieldError = useCallback((field) => {
    setFieldErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }, []);

  const resetAuthFeedback = useCallback(() => {
    setFieldErrors({});
    setError("");
    setMessage("");
  }, []);

  const switchToLogin = useCallback(
    (nextMessage = "", { announce = false } = {}) => {
      setAwaitingVerification(false);
      setMode("login");
      setError("");
      setMessage(nextMessage);
      if (announce && nextMessage) {
        info(nextMessage);
      }
    },
    [info]
  );

  const onChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    clearFieldError(name);
  };

  const restoreDraft = useCallback((draftValue) => {
    if (!draftValue || typeof draftValue !== "object") return;
    const draftMode = draftValue.mode === "signup" ? "signup" : "login";
    const rawRole = String(draftValue.selectedRole || "").toLowerCase();
    const draftRole =
      rawRole === "staff" ||
      rawRole === "parent" ||
      rawRole === "admin" ||
      rawRole === "canteen"
        ? rawRole
        : "student";
    const draftForm =
      draftValue.form && typeof draftValue.form === "object"
        ? draftValue.form
        : {};

    setMode(
      (draftRole === "parent" || draftRole === "canteen") &&
        draftMode === "signup"
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
        delete next.designation;
      }

      if (selectedRole !== "student") {
        delete next.year;
        delete next.rollNo;
      }
      if (selectedRole === "admin") {
        delete next.department;
      }
      if (selectedRole === "student") {
        delete next.designation;
      }

      return next;
    });
  }, [mode, selectedRole]);

  const handleRoleSelect = (value) => {
    setSelectedRole(value);
    sessionStorage.setItem("roleSelection", value);
    if (mode === "signup" && value === "parent") {
      switchToLogin(PARENT_SIGNUP_DISABLED_MESSAGE, { announce: true });
      return;
    }
    if (mode === "signup" && value === "canteen") {
      switchToLogin(CANTEEN_LOGIN_ONLY_MESSAGE, { announce: true });
      return;
    }
    resetAuthFeedback();
  };

  const handleToggleMode = () => {
    if (selectedRole === "parent") {
      switchToLogin(PARENT_SIGNUP_DISABLED_MESSAGE, { announce: true });
      return;
    }
    if (selectedRole === "canteen") {
      switchToLogin(CANTEEN_LOGIN_ONLY_MESSAGE, { announce: true });
      return;
    }
    setMode((prev) => (prev === "login" ? "signup" : "login"));
    setAwaitingVerification(false);
    resetAuthFeedback();
  };

  const handleShowLogin = () => switchToLogin();

  const roleLabel =
    selectedRole === "staff"
      ? "Staff"
      : selectedRole === "canteen"
      ? "Food"
      : selectedRole === "parent"
      ? "Parent"
      : selectedRole === "admin"
      ? "Admin"
      : "Student";
  const isLoginMode = mode === "login";
  const isParentRole = selectedRole === "parent";
  const isCanteenRole = selectedRole === "canteen";
  const isAdminRole = selectedRole === "admin";
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

      } else if (selectedRole === "staff" && !form.designation.trim()) {
        nextErrors.designation = "Designation is required.";
      }
    }

    return nextErrors;
  }, [form, isLoginMode, selectedRole]);

  const renderFieldError = (fieldName) =>
    fieldErrors[fieldName] ? (
      <p className="text-xs font-semibold text-rose-700">{fieldErrors[fieldName]}</p>
    ) : null;

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const targetPath = resolveAuthTargetPath(selectedRole);

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
    if (!supabaseReady) {
      setError(authUnavailableMessage);
      toastError(authUnavailableMessage);
      return;
    }
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
        switchToLogin(PARENT_SIGNUP_DISABLED_MESSAGE, { announce: true });
        return;
      }
      if (mode !== "login" && selectedRole === "canteen") {
        switchToLogin(CANTEEN_LOGIN_ONLY_MESSAGE, { announce: true });
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
            "Check your verification email. If not received, use Resend Verification Email to generate a fresh link."
          );
          return;
        }

        sessionStorage.setItem("roleSelection", selectedRole);
        clearDraft();
        navigate(resolveAuthTargetPath(selectedRole));
        return;
      }

      const signupResult = await signup({
        email: form.email,
        password: form.password,
        role: selectedRole,
        name: form.name,
        department: form.department,
        year: form.year,
        rollNo: form.rollNo,
        designation: form.designation,
      });

      setAwaitingVerification(true);
      setMode("login");
      clearDraft();
      if (signupResult?.verificationEmailStatus === "cooldown") {
        const nextMessage =
          "Account created, but the verification email was not sent automatically. Tap Resend Verification Email to generate a fresh link.";
        setMessage(nextMessage);
        info(nextMessage);
      } else {
        setMessage("Verification email sent. Check inbox/spam and use the latest email link.");
        success("Account created. Security verification email sent.");
        info(SECURITY_EMAIL_INBOX_HINT);
      }
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
    if (!supabaseReady) {
      setError(authUnavailableMessage);
      toastError(authUnavailableMessage);
      return;
    }
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

    if (!supabaseReady) {
      setError(authUnavailableMessage);
      toastError(authUnavailableMessage);
      return;
    }

    const safeEmail = form.email.trim();

    if (!safeEmail) {
      const nextMessage =
        "Enter your email on the login screen, then tap Resend verification email.";
      setMessage(nextMessage);
      info(nextMessage);
      return;
    }

    setResendingVerification(true);
    try {
      const result = await resendVerificationEmail({
        email: safeEmail,
      });
      if (result?.alreadyVerified) {
        switchToLogin("Email already verified. You can login now.");
        success("Email already verified.");
      } else {
        setMessage("Fresh verification email sent. Check inbox/spam and open the latest email link.");
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
      <div className="relative flex min-h-screen items-center justify-center overflow-x-hidden overflow-y-auto px-4 py-8">
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
      <div className="relative flex min-h-screen items-center justify-center overflow-x-hidden overflow-y-auto px-4 py-8">
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

          {error ? (
            <div className="mb-3 rounded-xl border border-red-200/[0.55] bg-red-500/[0.22] px-3 py-2 text-xs font-medium text-red-50">
              {error}
            </div>
          ) : null}
          {message ? (
            <div className="mb-3 rounded-xl border border-ocean/45 bg-sand/88 px-3 py-2 text-xs font-medium text-ink/85">
              {message}
            </div>
          ) : null}

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

          <p className="mt-3 text-center text-xs font-semibold text-ink/72">
            Repeated resend clicks request a fresh verification email. Open the latest email link.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-x-hidden overflow-y-auto px-4 py-8">
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

          {!supabaseReady ? (
            <div className="mb-4 rounded-2xl border border-amber-300/80 bg-amber-100/90 px-4 py-3 text-sm font-medium text-amber-950">
              {authUnavailableMessage}
            </div>
          ) : null}

          <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
          <div className="grid gap-2">
            <label className="text-xs font-semibold uppercase tracking-[0.2em] text-ink/72">
              Role
            </label>
            <div className="grid grid-cols-5 rounded-full border border-ocean/45 bg-white/86 p-1.5">
              {[
                { label: "Student", value: "student" },
                { label: "Staff", value: "staff" },
                { label: "Food", value: "canteen" },
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
              disabled={!supabaseReady}
              className="font-semibold text-ink/80 transition-colors hover:text-ocean"
            >
              Forget Password
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleReset}
              disabled={!supabaseReady}
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
            disabled={loading || !supabaseReady}
            className="mt-1 rounded-full bg-[linear-gradient(135deg,rgb(var(--ocean))_0%,rgb(var(--aurora))_100%)] px-4 py-3 text-base font-semibold text-white shadow-[0_14px_28px_-18px_rgb(var(--cocoa)_/_0.42)] transition-all hover:-translate-y-0.5 hover:brightness-105 active:translate-y-0 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-80"
          >
            {loading
              ? "Securing access..."
              : mode === "login"
              ? isCanteenRole
                ? "Enter Food Console"
                : "Log in"
              : "Create Account"}
          </button>
        </form>

        {isParentRole && isLoginMode ? (
          <div className="mt-6 text-center text-sm text-ink/84">
            Parent signup is disabled. Use student email and password to login.
          </div>
        ) : isCanteenRole && isLoginMode ? (
          <div className="mt-6 text-center text-sm text-ink/84">
            Food console login is for canteen staff and admin accounts only.
          </div>
        ) : (
          <div className="mt-6 text-center text-sm text-ink/84">
            {isLoginMode ? "Don't have a account?" : "Already have an account?"}
            <button
              type="button"
              onClick={handleToggleMode}
              className="ml-1 font-semibold text-ink/84 underline underline-offset-4 transition-colors hover:text-ocean"
            >
              {isLoginMode && isAdminRole ? "Register Admin" : isLoginMode ? "Register" : "Login"}
            </button>
            {isAdminRole ? (
              <p className="mt-2 text-xs text-ink/68">
                Public admin registration is only for the first admin account. After
                that, create extra admins from the Admin Users panel.
              </p>
            ) : null}
          </div>
        )}
      </div>

    </div>
  );
}





