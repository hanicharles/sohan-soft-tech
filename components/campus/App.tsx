"use client";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Toaster } from "@/components/ui/sonner";
import { api, ClientError } from "@/lib/api-client";
import { useRouter } from "@/lib/browser-navigation";
import { en, Language, translate } from "@/lib/i18n";
import {
  readNavigationFilters,
  saveNavigationFilters,
} from "@/lib/navigation-filters";
import { Permission } from "@/lib/permissions";
import {
  Bell,
  BookOpen,
  Building2,
  CalendarDays,
  ChartNoAxesCombined,
  ChevronDown,
  Clock3,
  FileText,
  Filter,
  GitCompareArrows,
  GraduationCap,
  Landmark,
  Layers3,
  LayoutDashboard,
  Loader2,
  LogOut,
  Receipt,
  RotateCcw,
  ScrollText,
  Search,
  Settings2,
  ShieldCheck,
  UserRoundX,
  UsersRound,
  Wallet,
  X,
} from "lucide-react";
import { usePathname } from "next/navigation";
import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { InstitutionAccess } from "./Access";
import {
  AppContext,
  AppState,
  CampusLink as Link,
  Row,
  Scope,
  useCampusRouter,
  useApp as useContextValue,
} from "./context";
import {
  Button,
  Field,
  FormDialog,
  Initials,
  Input,
  Loading,
  PageHead,
  Picker,
} from "./ui";
const AuditLogs = lazy(() =>
  import("@/features/auth/AuditLogs").then((m) => ({ default: m.AuditLogs })),
);
const Dashboard = lazy(() =>
  import("@/features/reports/Dashboard").then((m) => ({
    default: m.Dashboard,
  })),
);
const Students = lazy(() =>
  import("@/features/students/Students").then((m) => ({ default: m.Students })),
);
const StudentProfile = lazy(() =>
  import("@/features/students/StudentProfile").then((m) => ({
    default: m.StudentProfile,
  })),
);
const Parents = lazy(() =>
  import("@/features/students/Parents").then((m) => ({ default: m.Parents })),
);
const Academic = lazy(() =>
  import("@/features/students/Academic").then((m) => ({ default: m.Academic })),
);
const Fees = lazy(() =>
  import("@/features/fees/Fees").then((m) => ({ default: m.Fees })),
);
const Registers = lazy(() =>
  import("@/features/payments/Registers").then((m) => ({
    default: m.Registers,
  })),
);
const Reports = lazy(() =>
  import("@/features/reports/Reports").then((m) => ({ default: m.Reports })),
);
const Reconciliation = lazy(() =>
  import("@/features/reports/Reconciliation").then((m) => ({
    default: m.Reconciliation,
  })),
);
const Cash = lazy(() =>
  import("@/features/reports/Cash").then((m) => ({ default: m.Cash })),
);
const Users = lazy(() =>
  import("@/features/auth/Users").then((m) => ({ default: m.Users })),
);
const Settings = lazy(() =>
  import("@/features/auth/Settings").then((m) => ({ default: m.Settings })),
);
const Notifications = lazy(() =>
  import("@/features/auth/Notifications").then((m) => ({
    default: m.Notifications,
  })),
);
const nav = [
  {
    label: "Dashboard",
    path: "/",
    icon: LayoutDashboard,
    group: "Workspace",
    permission: "finance",
  },
  {
    label: "Students",
    path: "/students",
    icon: GraduationCap,
    group: "Workspace",
    permission: "staff",
  },
  {
    label: "Parents",
    path: "/parents",
    icon: UsersRound,
    group: "Workspace",
    permission: "staff",
  },
  {
    label: "Academic",
    path: "/academic",
    icon: CalendarDays,
    group: "Workspace",
    permission: "staff",
  },
  {
    label: "AcademicYears",
    path: "/academic/years",
    icon: CalendarDays,
    group: "Workspace",
    permission: "staff",
    child: true,
  },
  {
    label: "Classes",
    path: "/academic/classes",
    icon: GraduationCap,
    group: "Workspace",
    permission: "staff",
    child: true,
  },
  {
    label: "Sections",
    path: "/academic/sections",
    icon: UsersRound,
    group: "Workspace",
    permission: "staff",
    child: true,
  },
  {
    label: "Fees",
    path: "/fees",
    icon: Layers3,
    group: "Finance",
    permission: "finance",
  },
  {
    label: "Invoices",
    path: "/invoices",
    icon: FileText,
    group: "Finance",
    permission: "finance",
  },
  {
    label: "CollectFees",
    path: "/collect-fees",
    icon: Wallet,
    group: "Finance",
    permission: "collect",
  },
  {
    label: "Payments",
    path: "/payments",
    icon: Wallet,
    group: "Finance",
    permission: "finance",
  },
  {
    label: "Receipts",
    path: "/receipts",
    icon: Receipt,
    group: "Finance",
    permission: "finance",
  },
  {
    label: "Outstanding",
    path: "/outstanding",
    icon: Clock3,
    group: "Finance",
    permission: "finance",
  },
  {
    label: "Defaulters",
    path: "/defaulters",
    icon: UserRoundX,
    group: "Finance",
    permission: "finance",
  },
  {
    label: "Refunds",
    path: "/refunds",
    icon: RotateCcw,
    group: "Finance",
    permission: "collect",
  },
  {
    label: "Reports",
    path: "/reports",
    icon: ChartNoAxesCombined,
    group: "Finance",
    permission: "finance",
  },
  {
    label: "Reconciliation",
    path: "/reconciliation",
    icon: GitCompareArrows,
    group: "Finance",
    permission: "collect",
  },
  {
    label: "Cash",
    path: "/cash",
    icon: Landmark,
    group: "Finance",
    permission: "collect",
  },
  {
    label: "Notifications",
    path: "/notifications",
    icon: Bell,
    group: "Administration",
    permission: "finance",
  },
  {
    label: "Users",
    path: "/users",
    icon: ShieldCheck,
    group: "Administration",
    permission: "admin",
  },
  {
    label: "Settings",
    path: "/settings",
    icon: Settings2,
    group: "Administration",
    permission: "admin",
  },
  {
    label: "Audit",
    path: "/audit",
    icon: ScrollText,
    group: "Administration",
    permission: "admin",
  },
  {
    label: "PlatformAdmin",
    path: "/admin",
    icon: Building2,
    group: "Administration",
    permission: "system",
  },
] as const;
export default function CampusApp({ slug }: { slug: string }) {
  const basePath = "/campus/" + slug;
  const pathname = usePathname().slice(basePath.length) || "/",
    router = useRouter(),
    [boot, setBoot] = useState<Row | null>(null),
    [error, setError] = useState<ClientError | null>(null),
    [institutionId, setInstitutionId] = useState(""),
    [revision, setRevision] = useState(0),
    [language, setLanguage] = useState<Language>("en"),
    [scope, setScope] = useState<Scope>({
      year: "",
      campus: "",
      class: "",
      section: "",
      stream: "",
      from: "",
      to: "",
    });
  const request = useCallback(
    <T,>(
      path: string,
      options: { method?: string; body?: unknown; signal?: AbortSignal } = {},
    ) => api<T>("campus/" + slug + "/" + path, { ...options }),
    [slug],
  );
  const reload = useCallback(async () => {
    const data = await request<Row>("bootstrap");
    setBoot(data);
    setLanguage(data.institution.settings.language || "en");
    setScope((previous) => {
      const selected = previous.year
        ? previous
        : readNavigationFilters(data.institution.id, data.user.userId) ||
          previous;
      const year =
        data.years.find((y: Row) => y.id === selected.year) ||
        data.years.find((y: Row) => y.status === "Active") ||
        data.years[0];
      if (!year) return { ...previous, year: "", from: "", to: "" };
      return year.id === selected.year
        ? selected
        : {
            year: year.id,
            campus: "",
            class: "",
            section: "",
            stream: "",
            from: year.start_date,
            to: year.end_date,
          };
    });
  }, [request]);
  useEffect(() => {
    setError(null);
    setBoot(null);
    reload().catch((e) => setError(e));
  }, [reload]);
  useEffect(() => {
    if (boot)
      saveNavigationFilters(boot.institution.id, boot.user.userId, scope);
  }, [boot, scope]);
  const query = useCallback(
    (extra: Record<string, string> = {}) =>
      new URLSearchParams(
        Object.fromEntries(
          Object.entries({ ...scope, ...extra }).filter(([_, v]) => v !== ""),
        ),
      ).toString(),
    [scope],
  );
  const refresh = useCallback(() => setRevision((v) => v + 1), []);
  const can = (p: Permission) =>
    !!boot?.user.permissions?.includes(p) &&
    (!boot?.subscription?.modules ||
      boot.subscription.modules.includes(
        p.startsWith("refunds.") ? "payments" : p.split(".")[0],
      ));
  const role = boot?.user.role,
    admin = role === "INSTITUTION_ADMIN",
    collect = can("payments.collect"),
    finance = can("fees.view"),
    parentRole = false;
  useEffect(() => {
    if (!boot) return;
    const context = (document as any).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const tools = [
      {
        name: "search_students",
        description:
          "Search institution students with the same academic filters as the visible table.",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string", minLength: 2, maxLength: 100 },
          },
          required: ["query"],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true, untrustedContentHint: true },
        execute: async (input: Row) => {
          if (
            typeof input.query !== "string" ||
            input.query.length < 2 ||
            input.query.length > 100
          )
            throw new Error("Provide a query of 2 to 100 characters.");
          const results = await request<Row>(
            "students?" + query({ q: input.query, size: "10" }),
          );
          return {
            students: results.rows.map((r: Row) => ({
              id: r.id,
              name: r.name,
              admissionNumber: r.admission_number,
              class: r.class_name,
            })),
            total: results.total,
          };
        },
      },
      {
        name: "open_student_profile",
        description:
          "Navigate to an authorized student financial profile. Does not create or modify records.",
        inputSchema: {
          type: "object",
          properties: { studentId: { type: "string" } },
          required: ["studentId"],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true, untrustedContentHint: false },
        execute: async (input: Row) => {
          if (
            typeof input.studentId !== "string" ||
            !/^[-a-zA-Z0-9_]{1,100}$/.test(input.studentId)
          )
            throw new Error("Invalid student ID");
          await request("students/" + input.studentId + "?" + query());
          router.push(basePath + "/students/" + input.studentId);
          return { opened: true, studentId: input.studentId };
        },
      },
    ];
    for (const tool of tools)
      Promise.resolve(
        context.registerTool(tool, { signal: lifecycle.signal }),
      ).catch(() => {});
    return () => lifecycle.abort();
  }, [boot, request, query, router]);
  if (error)
    return (
      <InstitutionAccess
        slug={slug}
        error={error}
        retry={() =>
          reload()
            .then(() => setError(null))
            .catch(setError)
        }
      />
    );
  if (!boot)
    return (
      <div className="app-boot">
        <span className="brand-symbol">S</span>
        <strong>Sohan Soft Tech</strong>
        <Loader2 className="animate-spin" size={24} />
        <span>Preparing your institution...</span>
      </div>
    );
  const state: AppState = {
    boot,
    scope,
    setScope,
    revision,
    refresh,
    reload,
    request,
    query,
    t: (key) => translate(language, key),
    admin,
    collect,
    finance,
    language,
    setLanguage,
    institutionId: boot.institution.id,
    setInstitutionId: (id) => {
      const m = boot.memberships.find((m: Row) => m.institution_id === id);
      if (m) router.push("/campus/" + m.slug);
    },
    basePath,
    can,
  };
  let page: React.ReactNode;
  const route = pathname.split("/").filter(Boolean),
    current = route[0] || "";
  if (!current)
    page = finance ? (
      <Dashboard />
    ) : can("reports.view") ? (
      <Reports />
    ) : can("students.view") ? (
      <Students />
    ) : (
      <PageHead
        title="Your institution"
        description="Your account has no enabled modules. Ask your institution administrator to assign permissions."
      />
    );
  else if (current === "students")
    page = route[1] ? <StudentProfile id={route[1]} /> : <Students />;
  else if (current === "parents") page = <Parents />;
  else if (current === "academic")
    page = (
      <Academic key={route[1] || "years"} initialTab={route[1] || "years"} />
    );
  else if (current === "collect-fees")
    page = <Registers kind="payments" collectOnOpen />;
  else if (current === "fees") page = <Fees />;
  else if (["payments", "receipts", "invoices", "refunds"].includes(current))
    page = <Registers kind={current} />;
  else if (["outstanding", "defaulters"].includes(current))
    page = <Students mode={current} />;
  else if (current === "reports") page = <Reports />;
  else if (current === "reconciliation") page = <Reconciliation />;
  else if (current === "cash") page = <Cash />;
  else if (current === "users") page = <Users />;
  else if (current === "settings") page = <Settings />;
  else if (current === "audit") page = <AuditLogs />;
  else if (current === "notifications") page = <Notifications />;
  else
    page = (
      <PageHead
        title="Page not found"
        description="Choose a section from the navigation."
      />
    );
  const required: Record<string, Permission> = {
    students: "students.view",
    parents: "students.view",
    academic: "academics.view",
    "collect-fees": "payments.collect",
    fees: "fees.view",
    invoices: "fees.view",
    payments: "payments.view",
    receipts: "receipts.view",
    outstanding: "fees.view",
    defaulters: "fees.view",
    refunds: "refunds.request",
    reports: "reports.view",
    users: "users.view",
    settings: "settings.view",
    reconciliation: "payments.manage",
    cash: "payments.collect",
    notifications: "payments.view",
    audit: "settings.view",
  };
  if (required[current] && !can(required[current]))
    page = (
      <PageHead
        title="Access restricted"
        description="Your role does not have permission to open this section."
      />
    );
  return (
    <AppContext.Provider value={state}>
      <SidebarProvider
        style={
          {
            "--sidebar-width": "244px",
            "--sidebar-width-mobile": "280px",
          } as React.CSSProperties
        }
      >
        <CampusSidebar pathname={pathname} parentRole={parentRole} />
        <SidebarInset className="campus-inset">
          <WorkspaceHeader pathname={pathname} parentRole={parentRole} />
          {boot.support && (
            <div className="support-banner">
              <ShieldCheck size={17} />
              <span>
                You are accessing this institution as Platform Administrator.
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  try {
                    await api("platform/support", { method: "POST", body: {} });
                    router.push("/admin/institutions");
                  } catch (e) {
                    toast.error((e as Error).message);
                  }
                }}
              >
                End support access
              </Button>
            </div>
          )}
          {!["Active", "Trial"].includes(boot.subscription.effectiveStatus) && (
            <div className="subscription-banner">
              Subscription: {boot.subscription.effectiveStatus}. Existing
              records remain available. Contact the platform administrator to
              renew access.
            </div>
          )}
          <main className="workspace-main">
            <Suspense fallback={<Loading />}>{page}</Suspense>
            <footer className="workspace-footer">
              <span>Sohan Soft Tech</span>
              <span>Amounts in INR · Asia/Kolkata</span>
            </footer>
          </main>
        </SidebarInset>
      </SidebarProvider>
      <Toaster position="bottom-right" richColors theme="light" />
    </AppContext.Provider>
  );
}
function CampusSidebar({
  pathname,
  parentRole,
}: {
  pathname: string;
  parentRole: boolean;
}) {
  const state = useContextValue(),
    { boot, t, admin, collect, finance } = state,
    role = boot.user.role;
  const permissions: Record<string, Permission> = {
    "/": "fees.view",
    "/students": "students.view",
    "/parents": "students.view",
    "/academic": "academics.view",
    "/academic/years": "academics.view",
    "/academic/classes": "academics.view",
    "/academic/sections": "academics.view",
    "/collect-fees": "payments.collect",
    "/fees": "fees.view",
    "/invoices": "fees.view",
    "/payments": "payments.view",
    "/receipts": "receipts.view",
    "/outstanding": "fees.view",
    "/defaulters": "fees.view",
    "/refunds": "refunds.request",
    "/reports": "reports.view",
    "/reconciliation": "payments.manage",
    "/cash": "payments.collect",
    "/notifications": "payments.view",
    "/users": "users.view",
    "/settings": "settings.view",
    "/audit": "settings.view",
  };
  const available = nav.filter(
    (n) =>
      n.path !== "/admin" &&
      permissions[n.path] &&
      state.can(permissions[n.path]),
  );
  return (
    <Sidebar className="campus-sidebar" collapsible="offcanvas">
      <SidebarHeader className="campus-sidebar-header">
        <Link href="/" className="brand">
          <span className="brand-symbol">S</span>
          <span>
            Sohan Soft Tech<small>FEES MANAGEMENT</small>
          </span>
        </Link>
        <div className="institution-card">
          {boot.institution.logo_key ? (
            <img
              className="school-monogram"
              src={"/api/portal/" + boot.institution.slug + "/logo"}
              alt={boot.institution.name + " logo"}
            />
          ) : (
            <span className="school-monogram">
              {boot.institution.name
                .split(" ")
                .map((w: string) => w[0])
                .slice(0, 3)
                .join("")}
            </span>
          )}
          <div>
            <strong>{boot.institution.name}</strong>
            <small>{boot.campuses[0]?.name || "Institution"}</small>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent className="campus-sidebar-content">
        {["Workspace", "Finance", "Administration"].map((group) => {
          const items = available.filter((n) => n.group === group);
          if (!items.length) return null;
          return (
            <SidebarGroup key={group}>
              <SidebarGroupLabel>
                {t(group as keyof typeof en)}
              </SidebarGroupLabel>
              <SidebarMenu>
                {items.map((item) => (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      asChild
                      isActive={
                        item.path === "/"
                          ? pathname === "/"
                          : pathname.startsWith(item.path)
                      }
                      className="campus-nav-button"
                    >
                      <Link href={item.path}>
                        <item.icon />
                        <span>{t(item.label as keyof typeof en)}</span>
                        {item.path === "/fees" && (
                          <span className="nav-new">MANAGE</span>
                        )}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroup>
          );
        })}
      </SidebarContent>
      <SidebarFooter>
        <div className="sidebar-footer-card">
          <BookOpen size={19} />
          <div>
            <strong>
              {boot.years.find((y: Row) => y.id === state.scope.year)?.name ||
                "Academic setup"}
            </strong>
            <small>
              {boot.subscription.plan_name} ·{" "}
              {boot.subscription.effectiveStatus}
            </small>
            <small>
              {boot.usage.students} / {boot.subscription.student_limit} students
              · {boot.usage.users + boot.usage.pendingUsers} /{" "}
              {boot.subscription.user_limit} users
            </small>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
function WorkspaceHeader({
  pathname,
  parentRole,
}: {
  pathname: string;
  parentRole: boolean;
}) {
  const {
      boot,
      scope,
      setScope,
      t,
      query,
      request,
      admin,
      institutionId,
      setInstitutionId,
    } = useContextValue(),
    router = useCampusRouter(),
    [command, setCommand] = useState(false),
    [q, setQ] = useState(""),
    [search, setSearch] = useState<Row | null>(null),
    [dateOpen, setDateOpen] = useState(false),
    [range, setRange] = useState({ from: scope.from, to: scope.to }),
    [moreFilters, setMoreFilters] = useState(false);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCommand((v) => !v);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  useEffect(() => {
    if (!command || q.length < 2) {
      setSearch(null);
      return;
    }
    const abort = new AbortController(),
      timer = setTimeout(
        () =>
          request<Row>("search?" + query({ q }), { signal: abort.signal })
            .then(setSearch)
            .catch((e) => {
              if (e.name !== "AbortError") toast.error(e.message);
            }),
        250,
      );
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [q, command, request, query]);
  const changeYear = (id: string) => {
    const year = boot.years.find((y: Row) => y.id === id);
    setScope({
      ...scope,
      year: id,
      section: "",
      from: year?.start_date || "",
      to: year?.end_date || "",
    });
  };
  const select = (key: keyof Scope, value: string) =>
    setScope({
      ...scope,
      [key]: value,
      ...(key === "class" ? { section: "", stream: "" } : {}),
    });
  const navigate = (path: string) => {
    router.push(path);
    setCommand(false);
    setQ("");
  };
  const format = (s: string) =>
    s
      ? new Date(s + "T12:00:00Z").toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short",
        })
      : "All dates";
  return (
    <>
      <header className="workspace-topbar">
        <div className="topbar-left">
          <SidebarTrigger className="mobile-menu" />
          <span className="topbar-title">
            <Building2 size={16} />
            {["/admin", "/institutions"].includes(pathname)
              ? t("PlatformAdmin")
              : boot.institution.name}
            <span className="topbar-divider" /> <strong>Fee management</strong>
          </span>
        </div>
        <div className="topbar-actions">
          <button className="global-search" onClick={() => setCommand(true)}>
            <Search size={17} />
            <span>{t("Search")}</span>
            <kbd>⌘ K</kbd>
          </button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Notification center"
            onClick={() => router.push("/notifications")}
          >
            <Bell size={19} />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="user-menu">
                <Initials name={boot.user.name} />
                <ChevronDown size={13} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="user-dropdown">
              <DropdownMenuLabel>
                {boot.user.name}
                <small>{boot.user.email}</small>
              </DropdownMenuLabel>
              {boot.memberships.length > 1 && (
                <>
                  <DropdownMenuSeparator />
                  {boot.memberships.map((m: Row) => (
                    <DropdownMenuItem
                      key={m.id}
                      onClick={() => setInstitutionId(m.institution_id)}
                    >
                      {m.institution_name}
                    </DropdownMenuItem>
                  ))}
                </>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
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
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
      {!["/admin", "/institutions"].includes(pathname) && (
        <div className="scope-bar">
          <div className="scope-primary">
            <span className="scope-label">
              <CalendarDays size={15} />
              Academic year
            </span>
            <Picker
              value={scope.year}
              onChange={changeYear}
              options={boot.years.map((y: Row) => ({
                value: y.id,
                label: y.name,
              }))}
              className="year-picker"
            />
            {!parentRole && (
              <>
                <span className="filter-divider" />
                <Picker
                  value={scope.campus}
                  onChange={(v) => select("campus", v)}
                  options={[
                    { value: "", label: t("AllCampuses") },
                    ...boot.campuses.map((r: Row) => ({
                      value: r.id,
                      label: r.name,
                    })),
                  ]}
                />
                <Picker
                  value={scope.class}
                  onChange={(v) => select("class", v)}
                  options={[
                    { value: "", label: t("AllClasses") },
                    ...boot.classes.map((r: Row) => ({
                      value: r.id,
                      label: r.name,
                    })),
                  ]}
                />
                <Button
                  variant="ghost"
                  onClick={() => setMoreFilters((v) => !v)}
                  className="more-filters"
                >
                  <Filter size={15} />
                  Filters
                  {(scope.section || scope.stream) && (
                    <span className="filter-dot" />
                  )}
                </Button>
              </>
            )}
          </div>
          {!parentRole && (
            <Button
              variant="outline"
              className="date-filter"
              onClick={() => {
                setRange({ from: scope.from, to: scope.to });
                setDateOpen(true);
              }}
            >
              <CalendarDays size={15} />
              {format(scope.from)} – {format(scope.to)}
              <ChevronDown size={14} />
            </Button>
          )}
        </div>
      )}
      {moreFilters &&
        !parentRole &&
        !["/admin", "/institutions"].includes(pathname) && (
          <div className="extended-filters">
            <Picker
              value={scope.section}
              onChange={(v) => select("section", v)}
              options={[
                { value: "", label: t("AllSections") },
                ...boot.sections
                  .filter(
                    (s: Row) =>
                      s.academic_year_id === scope.year &&
                      (!scope.class || s.class_id === scope.class),
                  )
                  .map((s: Row) => ({
                    value: s.id,
                    label:
                      s.class_name +
                      " " +
                      s.name +
                      (s.stream_name ? " · " + s.stream_name : ""),
                  })),
              ]}
            />
            <Picker
              value={scope.stream}
              onChange={(v) => select("stream", v)}
              options={[
                { value: "", label: t("AllStreams") },
                ...boot.streams.map((s: Row) => ({
                  value: s.id,
                  label: s.name,
                })),
              ]}
            />
            <Button
              variant="ghost"
              onClick={() =>
                setScope({
                  ...scope,
                  campus: "",
                  class: "",
                  section: "",
                  stream: "",
                })
              }
            >
              <X size={15} />
              Reset
            </Button>
          </div>
        )}
      <CommandDialog
        open={command}
        onOpenChange={setCommand}
        title="Global search"
        description="Search institution students, guardians, invoices and transactions."
      >
        <CommandInput
          placeholder="Name, admission, mobile, invoice or transaction..."
          value={q}
          onValueChange={setQ}
        />
        <CommandList>
          <CommandEmpty>
            {q.length < 2
              ? "Type at least two characters"
              : "No matching records"}
          </CommandEmpty>
          {search && (
            <>
              {search.students?.length > 0 && (
                <CommandGroup heading="Students">
                  {search.students.map((s: Row) => (
                    <CommandItem
                      key={s.id}
                      value={
                        s.name +
                        " " +
                        s.admission_number +
                        " " +
                        s.mobile +
                        " " +
                        q
                      }
                      onSelect={() => navigate("/students/" + s.id)}
                    >
                      <GraduationCap />
                      <span>
                        {s.name}
                        <small>
                          {s.admission_number} · {s.class_name} {s.section_name}
                        </small>
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {search.parents?.length > 0 && (
                <CommandGroup heading="Guardians">
                  {search.parents.map((p: Row) => (
                    <CommandItem
                      key={p.id}
                      value={p.guardian_name + " " + p.mobile + " " + q}
                      onSelect={() => navigate("/parents")}
                    >
                      <UsersRound />
                      <span>
                        {p.guardian_name}
                        <small>{p.mobile}</small>
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {search.invoices?.length > 0 && (
                <CommandGroup heading="Invoices">
                  {search.invoices.map((i: Row) => (
                    <CommandItem
                      key={i.id}
                      value={i.number + " " + q}
                      onSelect={() => navigate("/students/" + i.student_id)}
                    >
                      <FileText />
                      {i.number}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {search.payments?.length > 0 && (
                <CommandGroup heading="Transactions">
                  {search.payments.map((p: Row) => (
                    <CommandItem
                      key={p.id}
                      value={p.reference + " " + q}
                      onSelect={() => navigate("/students/" + p.student_id)}
                    >
                      <Wallet />
                      {p.reference || p.id}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </>
          )}
        </CommandList>
      </CommandDialog>
      <FormDialog
        open={dateOpen}
        onClose={() => setDateOpen(false)}
        title="Filter collection dates"
        description="Date filters apply to collection records and dated reports."
        submitLabel="Apply date range"
        onSubmit={(e) => {
          e.preventDefault();
          if (range.from > range.to) {
            toast.error("End date must follow start date.");
            return;
          }
          setScope({ ...scope, ...range });
          setDateOpen(false);
        }}
      >
        <div className="date-presets">
          <Button
            variant="outline"
            type="button"
            onClick={() => {
              const year = boot.years.find((y: Row) => y.id === scope.year);
              setRange({
                from: year?.start_date || "",
                to: year?.end_date || "",
              });
            }}
          >
            Academic year
          </Button>
          <Button
            variant="outline"
            type="button"
            onClick={() => {
              const today = new Intl.DateTimeFormat("en-CA", {
                timeZone: "Asia/Kolkata",
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
              }).format(new Date());
              setRange({ from: today.slice(0, 8) + "01", to: today });
            }}
          >
            This month
          </Button>
        </div>
        <div className="form-grid">
          <Field label="From">
            <Input
              type="date"
              value={range.from}
              onChange={(e) => setRange({ ...range, from: e.target.value })}
            />
          </Field>
          <Field label="To">
            <Input
              type="date"
              value={range.to}
              onChange={(e) => setRange({ ...range, to: e.target.value })}
            />
          </Field>
        </div>
      </FormDialog>
    </>
  );
}
