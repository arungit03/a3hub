import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { confirmPasswordReset, verifyPasswordResetCode } from "firebase/auth";
import Card from "../components/Card";
import GradientHeader from "../components/GradientHeader";
import { auth } from "../lib/firebase";

export default function PasswordChangePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [linkError, setLinkError] = useState("");
  const [formError, setFormError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [checkingLink, setCheckingLink] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const mode = searchParams.get("mode");
  const oobCode = searchParams.get("oobCode") || "";
  const hasResetCode = mode === "resetPassword" && Boolean(oobCode);

  useEffect(() => {
    let cancelled = false;

    const validateResetLink = async () => {
      setCheckingLink(true);
      setLinkError("");
      setFormError("");
      setSuccessMessage("");

      if (!hasResetCode) {
        setLinkError("Invalid password reset link. Request a new email.");
        setCheckingLink(false);
        return;
      }

      try {
        const verifiedEmail = await verifyPasswordResetCode(auth, oobCode);
        if (!cancelled) {
          setEmail(verifiedEmail);
        }
      } catch {
        if (!cancelled) {
          setLinkError(
            "This reset link is invalid or expired. Request a new one."
          );
        }
      } finally {
        if (!cancelled) {
          setCheckingLink(false);
        }
      }
    };

    validateResetLink();

    return () => {
      cancelled = true;
    };
  }, [hasResetCode, oobCode]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setFormError("");
    setSuccessMessage("");

    if (password.length < 6) {
      setFormError("Password must be at least 6 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setFormError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      await confirmPasswordReset(auth, oobCode, password);
      setSuccessMessage(
        "Password updated successfully in Firebase. Login with your new password."
      );
      setPassword("");
      setConfirmPassword("");
    } catch (error) {
      if (
        error?.code === "auth/expired-action-code" ||
        error?.code === "auth/invalid-action-code"
      ) {
        setLinkError("This reset link expired. Request another reset email.");
      } else {
        setFormError(error?.message || "Unable to update password right now.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative min-h-screen bg-gradient-to-br from-mist via-sand to-mist px-4 pb-12 pt-8">
      <div className="pointer-events-none absolute -left-10 top-10 h-40 w-40 rounded-full bg-clay/20 blur-3xl" />
      <div className="pointer-events-none absolute -right-10 bottom-10 h-40 w-40 rounded-full bg-ocean/20 blur-3xl" />

      <div className="mx-auto flex max-w-[480px] flex-col gap-6">
        <GradientHeader
          title="Change Password"
          subtitle="Secure your account with a new password"
        />

        <Card className="glass">
          {checkingLink ? (
            <p className="text-sm text-ink/80">Verifying reset link...</p>
          ) : linkError ? (
            <div className="grid gap-4">
              <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                {linkError}
              </p>
              <button
                type="button"
                onClick={() => navigate("/", { replace: true })}
                className="rounded-xl bg-gradient-to-r from-clay to-rose px-4 py-2.5 text-sm font-semibold text-black shadow-glow transition-all hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98]"
              >
                Back to Login
              </button>
            </div>
          ) : successMessage ? (
            <div className="grid gap-4">
              <p className="rounded-xl border border-ink/10 bg-sand/80 px-3 py-2 text-xs font-medium text-ink/80">
                {successMessage}
              </p>
              <button
                type="button"
                onClick={() => navigate("/", { replace: true })}
                className="rounded-xl bg-gradient-to-r from-clay to-rose px-4 py-2.5 text-sm font-semibold text-black shadow-glow transition-all hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98]"
              >
                Login
              </button>
            </div>
          ) : (
            <form className="grid gap-4" onSubmit={handleSubmit} noValidate>
              <p className="text-sm text-ink/80">
                Resetting password for <span className="font-semibold">{email}</span>
              </p>

              <div className="grid gap-2">
                <label className="text-xs font-semibold uppercase tracking-[0.2em] text-ink/75">
                  New Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="w-full rounded-xl border border-ink/10 bg-white/95 px-3 py-2 text-sm text-ink placeholder:text-ink/50 shadow-sm focus-visible:border-clay/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-clay/25 dark:border-white/10 dark:bg-cream/80 dark:text-ink dark:placeholder:text-ink/75 dark:focus-visible:border-clay/50 dark:focus-visible:ring-clay/40"
                  placeholder="Enter new password"
                />
              </div>

              <div className="grid gap-2">
                <label className="text-xs font-semibold uppercase tracking-[0.2em] text-ink/75">
                  Confirm New Password
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  className="w-full rounded-xl border border-ink/10 bg-white/95 px-3 py-2 text-sm text-ink placeholder:text-ink/50 shadow-sm focus-visible:border-clay/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-clay/25 dark:border-white/10 dark:bg-cream/80 dark:text-ink dark:placeholder:text-ink/75 dark:focus-visible:border-clay/50 dark:focus-visible:ring-clay/40"
                  placeholder="Re-enter new password"
                />
              </div>

              {formError ? (
                <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                  {formError}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={submitting}
                className="rounded-2xl bg-gradient-to-r from-clay via-ocean to-rose px-4 py-3 text-sm font-bold text-ink dark:text-white shadow-[0_12px_30px_-12px_rgb(var(--ocean)_/_0.45)] shadow-glow transition-all hover:-translate-y-0.5 hover:shadow-float focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-clay/40 active:translate-y-0 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70"
              >
                {submitting ? "Updating password..." : "Update Password"}
              </button>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
}

