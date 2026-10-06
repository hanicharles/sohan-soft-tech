"use client";
import { api, ClientError } from "@/lib/api-client";
import { Building2, Loader2, ShieldCheck } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import type { Row } from "./context";
import { Button } from "./ui";
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
  error,
  retry,
  name = "Sohan Soft Tech",
  logo,
  returnTo = "/",
  color = "#3348d8",
  supportHref,
}: {
  error: ClientError;
  retry: () => void;
  name?: string;
  logo?: string;
  returnTo?: string;
  color?: string;
  supportHref?: string;
}) {
  const [username, setUsername] = useState("test");
  const [password, setPassword] = useState("tst@123");
  const [loginError, setLoginError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);

  async function login(event: FormEvent) {
    event.preventDefault();
    setLoginError("");
    setLoggingIn(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const result = await response.json();
      if (!response.ok || !result.success)
        throw new Error(result.message || "Invalid username or password.");
      retry();
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : "Login failed.");
    } finally {
      setLoggingIn(false);
    }
  }

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
        <p>
          {error.status === 401
            ? "Fees management · Staff sign in"
            : supportHref
              ? "Open this institution using your audited Platform Administrator access."
              : error.message}
        </p>
        {error.status === 401 ? (
          <form onSubmit={login} className="login-form">
            <label>
              Username
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
            {loginError && <p className="login-error">{loginError}</p>}
            <button className="login-button" type="submit" disabled={loggingIn}>
              {loggingIn ? "Signing in…" : "Sign in"}
            </button>
            <small>Default login: test / tst@123</small>
          </form>
        ) : (
          <>
            {supportHref && (
              <a className="login-button" href={supportHref}>
                Access as Institution Admin
              </a>
            )}
            <Button onClick={retry}>Check access again</Button>
            <a className="access-help" href="/admin">
              Platform administrator sign in
            </a>
            <button
              className="access-help"
              type="button"
              onClick={async () => {
                await fetch("/api/auth/logout", { method: "POST" });
                window.location.href = returnTo;
              }}
            >
              Sign out
            </button>
          </>
        )}
        <small>
          <ShieldCheck size={14} /> Sohan Soft Tech · Secure institution access
        </small>
      </div>
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
