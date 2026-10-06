"use client";
import { Access, BootScreen } from "@/components/campus/Access";
import type { Row } from "@/components/campus/context";
import { Button } from "@/components/campus/ui";
import { AdminDashboard } from "@/features/auth/AdminDashboard";
import { InstitutionForm } from "@/features/auth/InstitutionForm";
import { Institutions } from "@/features/auth/Institutions";
import { api, ClientError } from "@/lib/api-client";
import { useRouter } from "@/lib/browser-navigation";
import {
  Building2,
  ChartNoAxesCombined,
  CreditCard,
  Globe2,
  Layers3,
  LayoutDashboard,
  LogOut,
  Menu,
  Plus,
  ScrollText,
  Settings2,
  ShieldCheck,
} from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Toaster } from "sonner";
import { PlatformContext } from "./context";
import { InstitutionDetail } from "./InstitutionDetail";
import { Plans } from "./Plans";
import { Organizations } from "./Organizations";
import { PlatformRegister, PlatformSettings } from "./Registers";
const navigation = [
  { label: "Dashboard", href: "/admin", icon: LayoutDashboard },
  {
    label: "Organizations & Trusts",
    href: "/admin/organizations",
    icon: Building2,
  },
  { label: "Institutions", href: "/admin/institutions", icon: Building2 },
  {
    label: "Create Institution",
    href: "/admin/institutions/new",
    icon: Plus,
    child: true,
  },
  {
    label: "Plans",
    href: "/admin/plans",
    icon: Layers3,
    group: "Subscriptions",
  },
  {
    label: "Active Subscriptions",
    href: "/admin/subscriptions",
    icon: CreditCard,
  },
  { label: "Payments", href: "/admin/payments", icon: CreditCard },
  { label: "Domains", href: "/admin/domains", icon: Globe2 },
  { label: "Usage", href: "/admin/usage", icon: ChartNoAxesCombined },
  { label: "Audit Logs", href: "/admin/audit", icon: ScrollText },
  { label: "Platform Settings", href: "/admin/settings", icon: Settings2 },
];
export default function PlatformApp() {
  const path = usePathname(),
    router = useRouter(),
    [session, setSession] = useState<Row | null>(null),
    [error, setError] = useState<ClientError | null>(null),
    [retry, setRetry] = useState(0),
    [revision, setRevision] = useState(0),
    [menu, setMenu] = useState(false),
    [platformName, setPlatformName] = useState("Sohan Soft Tech");
  useEffect(() => {
    api("session")
      .then((s) => {
        if (!s.platform)
          throw new ClientError(
            "This dashboard is available to platform administrators. Open your institution portal to continue.",
            "PLATFORM_ACCESS_REQUIRED",
            403,
          );
        setSession(s);
      })
      .catch(setError);
  }, [retry]);
  useEffect(() => {
    if (session)
      api("platform/settings")
        .then((data) =>
          setPlatformName(data.settings.platformName || "Sohan Soft Tech"),
        )
        .catch(() => {});
  }, [session, revision]);
  useEffect(() => setMenu(false), [path]);
  if (error)
    return (
      <Access
        error={error}
        name="Sohan Soft Tech Platform"
        returnTo="/admin"
        retry={() => {
          setError(null);
          setRetry((v) => v + 1);
        }}
      />
    );
  if (!session) return <BootScreen />;
  const parts = path.split("/").filter(Boolean),
    current = parts[1] || "";
  let page: React.ReactNode;
  if (!current) page = <AdminDashboard />;
  else if (current === "institutions" && parts[2] && parts[2] !== "new")
    page = <InstitutionDetail id={parts[2]} />;
  else if (current === "institutions") page = <Institutions />;
  else if (current === "organizations") page = <Organizations />;
  else if (current === "plans") page = <Plans />;
  else if (current === "settings") page = <PlatformSettings />;
  else page = <PlatformRegister kind={current} />;
  return (
    <PlatformContext.Provider
      value={{
        user: session.user,
        revision,
        refresh: () => setRevision((v) => v + 1),
      }}
    >
      <div className="platform-shell">
        <aside className={"platform-sidebar " + (menu ? "open" : "")}>
          <a href="/admin" className="platform-brand">
            <span className="brand-symbol">S</span>
            <span>
              {platformName}
              <small>PLATFORM MANAGEMENT</small>
            </span>
          </a>
          <div className="platform-access">
            <ShieldCheck size={17} />
            Super Administrator
          </div>
          <nav>
            {navigation.map((n) => (
              <div key={n.href}>
                {n.group && <p className="platform-nav-group">{n.group}</p>}
                <a
                  href={n.href}
                  className={
                    (path === n.href ? "active " : "") +
                    (n.child ? "child" : "")
                  }
                >
                  <n.icon size={18} />
                  {n.label}
                </a>
              </div>
            ))}
          </nav>
          <div className="platform-sidebar-footer">
            <strong>{session.user.name}</strong>
            <small>{session.user.email}</small>
            <a
              href="/"
              onClick={(event) => {
                event.preventDefault();
                fetch("/api/auth/logout", { method: "POST" }).finally(() => {
                  window.location.href = "/";
                });
              }}
            >
              <LogOut size={15} />
              Sign out
            </a>
          </div>
        </aside>
        <div className="platform-body">
          <header className="platform-topbar">
            <Button
              variant="ghost"
              size="icon"
              className="platform-menu"
              onClick={() => setMenu((v) => !v)}
              aria-label="Open navigation"
            >
              <Menu size={20} />
            </Button>
            <span>{platformName} Platform Management</span>
            <span className="platform-topbar-badge">Platform Admin</span>
          </header>
          <main className="platform-main">
            {page}
            <footer className="workspace-footer">
              <span>Sohan Soft Tech Platform</span>
              <span>Institution management</span>
            </footer>
          </main>
        </div>
        {menu && (
          <button
            className="platform-backdrop"
            onClick={() => setMenu(false)}
            aria-label="Close navigation"
          />
        )}
      </div>
      <InstitutionForm
        open={path === "/admin/institutions/new"}
        onClose={() => router.push("/admin/institutions")}
        onCreated={async (id) => {
          setRevision((v) => v + 1);
          router.push("/admin/institutions/" + id);
        }}
      />
      <Toaster position="bottom-right" richColors theme="light" />
    </PlatformContext.Provider>
  );
}
