"use client";
import { api, ClientError } from "@/lib/api-client";
import {
  Building2,
  KeyRound,
  Loader2,
  Lock,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
} from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import type { Row } from "./context";
import { Button, FormDialog, Input, Picker } from "./ui";

export function InstitutionAccess({
  slug,
  error,
  retry,
}: {
  slug: string;
  error: ClientError;
  retry: () => void;
}) {
  const [portal, setPortal] = useState<Row | null>(null);
  const [platformAdmin, setPlatformAdmin] = useState(false);
  useEffect(() => {
    api("portal/" + slug)
      .then(setPortal)
      .catch(() => {});
  }, [slug]);
  useEffect(() => {
    if (error.status !== 403) return;
    api("session")
      .then((s) => setPlatformAdmin(!!s.platform))
      .catch(() => {});
  }, [error.status]);
  return (
    <Access
      slug={slug}
      error={error}
      retry={retry}
      name={portal?.name || "Institution portal"}
      logo={portal?.logoUrl}
      returnTo={"/campus/" + slug}
      color={portal?.primaryColor}
      supportHref={
        platformAdmin && portal
          ? "/admin/institutions/" + portal.id + "?support=1"
          : undefined
      }
    />
  );
}

export function Access({
  slug,
  error,
  retry,
  name = "Sohan Soft Tech",
  logo,
  returnTo = "/",
  color = "#3348d8",
  supportHref,
}: {
  slug?: string;
  error: ClientError;
  retry: () => void;
  name?: string;
  logo?: string;
  returnTo?: string;
  color?: string;
  supportHref?: string;
}) {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("Admin@123");
  const [loginError, setLoginError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);
  const [attemptsRemaining, setAttemptsRemaining] = useState<number | null>(
    null,
  );

  // Forgot / Reset Password state
  const [forgotModal, setForgotModal] = useState(false);
  const [resetModal, setResetModal] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [resetNewPassword, setResetNewPassword] = useState("");
  const [resetNotice, setResetNotice] = useState("");
  const [busyModal, setBusyModal] = useState(false);

  const demoAccounts = [
    {
      label: "Institution Admin (admin / Admin@123)",
      user: "admin",
      pass: "Admin@123",
      role: "INSTITUTION_ADMIN",
    },
    {
      label: "Principal (principal / Principal@123)",
      user: "principal",
      pass: "Principal@123",
      role: "PRINCIPAL",
    },
    {
      label: "Faculty / Teacher (faculty / Faculty@123)",
      user: "faculty",
      pass: "Faculty@123",
      role: "FACULTY",
    },
    {
      label: "Student (student / Student@123)",
      user: "student",
      pass: "Student@123",
      role: "STUDENT",
    },
    {
      label: "Parent (parent / Parent@123)",
      user: "parent",
      pass: "Parent@123",
      role: "PARENT",
    },
    {
      label: "Accountant (accountant / Accountant@123)",
      user: "accountant",
      pass: "Accountant@123",
      role: "ACCOUNTANT",
    },
    {
      label: "Staff / Admissions (staff / Staff@123)",
      user: "staff",
      pass: "Staff@123",
      role: "STAFF",
    },
    {
      label: "Super Admin (superadmin / SuperAdmin@123)",
      user: "superadmin",
      pass: "SuperAdmin@123",
      role: "SUPER_ADMIN",
    },
    {
      label: "Default Test Staff (test / tst@123)",
      user: "test",
      pass: "tst@123",
      role: "SUPER_ADMIN",
    },
  ];

  async function login(event: FormEvent) {
    event.preventDefault();
    setLoginError("");
    setLoggingIn(true);
    try {
      const targetSlug =
        slug || returnTo.replace(/^\/campus\/?/, "").split("/")[0];
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          password,
          institutionSlug: targetSlug,
        }),
      });
      const result = (await response.json()) as {
        success?: boolean;
        message?: string;
        attemptsRemaining?: number;
        redirectPath?: string;
      };
      if (!response.ok || !result.success) {
        if (result.attemptsRemaining !== undefined) {
          setAttemptsRemaining(result.attemptsRemaining);
        }
        throw new Error(result.message || "Invalid username or password.");
      }

      if (result.redirectPath) {
        window.location.href = result.redirectPath;
      } else {
        window.location.href = returnTo;
      }
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : "Login failed.");
    } finally {
      setLoggingIn(false);
    }
  }

  const handleForgotPassword = async (e: FormEvent) => {
    e.preventDefault();
    setBusyModal(true);
    setResetNotice("");
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: forgotEmail }),
      });
      const json = (await res.json()) as {
        message?: string;
        resetToken?: string;
      };
      if (!res.ok)
        throw new Error(json.message || "Unable to request password reset.");
      setResetNotice(
        json.resetToken
          ? `Reset token generated: ${json.resetToken}`
          : "Check your email for reset instructions.",
      );
      if (json.resetToken) {
        setResetToken(json.resetToken);
        setForgotModal(false);
        setResetModal(true);
      }
    } catch (err) {
      setResetNotice((err as Error).message);
    } finally {
      setBusyModal(false);
    }
  };

  const handleResetPassword = async (e: FormEvent) => {
    e.preventDefault();
    setBusyModal(true);
    setResetNotice("");
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: resetToken,
          newPassword: resetNewPassword,
        }),
      });
      const json = (await res.json()) as {
        message?: string;
        success?: boolean;
      };
      if (!res.ok || !json.success)
        throw new Error(json.message || "Invalid or expired token.");
      setResetModal(false);
      setLoginError("");
      setPassword(resetNewPassword);
      alert("Password reset successfully. You can now sign in.");
    } catch (err) {
      setResetNotice((err as Error).message);
    } finally {
      setBusyModal(false);
    }
  };

  return (
    <div
      className="login-page"
      style={{ "--primary-brand": color } as React.CSSProperties}
    >
      <div className="login-brand">
        <span className="brand-symbol">S</span>Sohan Soft Tech
      </div>
      <div className="login-card">
        {logo ? (
          <img className="portal-logo" src={logo} alt={name + " logo"} />
        ) : (
          <span className="login-icon">
            <Building2 size={30} />
          </span>
        )}
        <h1>{name}</h1>
        <p>Educational ERP · Role-Based Campus Sign In</p>

        {supportHref && (
          <div style={{ marginBottom: 16 }}>
            <a
              className="login-button"
              style={{
                display: "inline-block",
                textAlign: "center",
                textDecoration: "none",
                background: "#4338ca",
                marginBottom: 6,
              }}
              href={supportHref}
            >
              Access via Platform Admin Support Session
            </a>
            <div
              style={{
                textAlign: "center",
                fontSize: 11,
                color: "#6b7280",
                marginTop: 4,
              }}
            >
              — or sign in with your role credentials below —
            </div>
          </div>
        )}

        <form onSubmit={login} className="login-form">
          <div className="demo-accounts-selector" style={{ marginBottom: 12 }}>
            <label
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: "#374151",
                display: "block",
                marginBottom: 4,
              }}
            >
              Quick Role Sign In (Select Account)
            </label>
            <select
              style={{
                width: "100%",
                padding: "8px 10px",
                fontSize: 13,
                borderRadius: 6,
                border: "1px solid #d1d5db",
                background: "#f9fafb",
                fontWeight: 500,
              }}
              value={username}
              onChange={(e) => {
                const acc = demoAccounts.find((a) => a.user === e.target.value);
                if (acc) {
                  setUsername(acc.user);
                  setPassword(acc.pass);
                  setLoginError("");
                }
              }}
            >
              {demoAccounts.map((a) => (
                <option key={a.user} value={a.user}>
                  {a.label}
                </option>
              ))}
            </select>
          </div>

          <label>
            Username or Email
            <input
              className="login-input"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              required
            />
          </label>
          <label>
            Password
            <input
              className="login-input"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          </label>

          {loginError && (
            <div
              className="login-error"
              style={{ textAlign: "left", fontSize: 13, marginTop: 4 }}
            >
              <ShieldAlert
                size={15}
                style={{ display: "inline", marginRight: 4 }}
              />
              {loginError}
              {attemptsRemaining !== null && attemptsRemaining > 0 && (
                <div style={{ fontSize: 11, marginTop: 2 }}>
                  {attemptsRemaining} attempt
                  {attemptsRemaining > 1 ? "s" : ""} remaining before 15-minute
                  account lockout.
                </div>
              )}
            </div>
          )}

          <button className="login-button" type="submit" disabled={loggingIn}>
            {loggingIn ? "Signing in…" : "Sign in"}
          </button>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 12,
              marginTop: 10,
            }}
          >
            <button
              type="button"
              className="access-help"
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 0,
              }}
              onClick={() => {
                setForgotEmail(username.includes("@") ? username : "");
                setResetNotice("");
                setForgotModal(true);
              }}
            >
              Forgot Password?
            </button>
            <button
              type="button"
              className="access-help"
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 0,
              }}
              onClick={() => {
                setResetNotice("");
                setResetModal(true);
              }}
            >
              Have a Reset Token?
            </button>
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 12,
              marginTop: 14,
              paddingTop: 10,
              borderTop: "1px solid #f3f4f6",
            }}
          >
            <a className="access-help" href="/admin">
              Platform Admin sign in
            </a>
            <button
              type="button"
              className="access-help"
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 0,
              }}
              onClick={async () => {
                await fetch("/api/auth/logout", { method: "POST" });
                window.location.reload();
              }}
            >
              Sign out active session
            </button>
          </div>
        </form>
        <small>
          <ShieldCheck size={14} /> Sohan Soft Tech · Core Authentication & RBAC
        </small>
      </div>

      {/* FORGOT PASSWORD MODAL */}
      <FormDialog
        open={forgotModal}
        onClose={() => setForgotModal(false)}
        title="Forgot Password"
        description="Enter your registered account email to request a secure password reset token."
        busy={busyModal}
        onSubmit={handleForgotPassword}
      >
        <label style={{ display: "block", marginBottom: 12 }}>
          Account Email
          <Input
            required
            type="email"
            placeholder="e.g. user@institution.edu"
            value={forgotEmail}
            onChange={(e) => setForgotEmail(e.target.value)}
          />
        </label>
        {resetNotice && (
          <p style={{ fontSize: 12, color: resetNotice.includes("generated") ? "#16a34a" : "#dc2626" }}>
            {resetNotice}
          </p>
        )}
      </FormDialog>

      {/* RESET PASSWORD MODAL */}
      <FormDialog
        open={resetModal}
        onClose={() => setResetModal(false)}
        title="Reset Account Password"
        description="Enter your reset verification token and choose a new password."
        busy={busyModal}
        onSubmit={handleResetPassword}
      >
        <label style={{ display: "block", marginBottom: 10 }}>
          Reset Token
          <Input
            required
            placeholder="Paste reset token here"
            value={resetToken}
            onChange={(e) => setResetToken(e.target.value)}
          />
        </label>
        <label style={{ display: "block", marginBottom: 10 }}>
          New Password
          <Input
            required
            type="password"
            placeholder="Minimum 6 characters"
            value={resetNewPassword}
            onChange={(e) => setResetNewPassword(e.target.value)}
          />
        </label>
        {resetNotice && <p style={{ fontSize: 12, color: "#dc2626" }}>{resetNotice}</p>}
      </FormDialog>
    </div>
  );
}

export function BootScreen() {
  return (
    <div className="app-boot">
      <span className="brand-symbol">S</span>
      <strong>Sohan Soft Tech</strong>
      <Loader2 className="animate-spin" size={24} />
    </div>
  );
}
