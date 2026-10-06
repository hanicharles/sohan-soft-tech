"use client";
import type { Row } from "@/components/campus/context";
import {
  Button,
  Card,
  Failure,
  Field,
  FormDialog,
  Input,
  Loading,
  PageHead,
  Picker,
  Status,
} from "@/components/campus/ui";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { filePayload } from "@/features/auth/InstitutionForm";
import { useRouter } from "@/lib/browser-navigation";
import {
  Copy,
  ExternalLink,
  Pencil,
  Plus,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { usePlatform, usePlatformResource } from "./context";
import { ModulePicker } from "./Plans";
export function InstitutionDetail({ id }: { id: string }) {
  const params = useSearchParams();
  const router = useRouter(),
    { request, refresh } = usePlatform(),
    r = usePlatformResource("institutions/" + id),
    plans = usePlatformResource("plans"),
    [modal, setModal] = useState(
      params.get("support") === "1" ? "support" : "",
    ),
    [d, setD] = useState<Row>({}),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [reason, setReason] = useState(""),
    [hostname, setHostname] = useState(""),
    [checking, setChecking] = useState(false);
  const set = (k: string, v: unknown) => setD((v0) => ({ ...v0, [k]: v }));
  if (r.error) return <Failure message={r.error} retry={r.retry} />;
  if (!r.data) return <Loading />;
  const {
    institution: i,
    subscription: s,
    usage: u,
    domains: domain,
    admins,
    pendingAdmins,
  } = r.data;
  const editData = () => ({
    name: i.name,
    institutionType: i.institution_type,
    institutionCode: i.institution_code,
    email: i.email,
    phone: i.phone,
    address: i.address,
    city: i.city,
    state: i.state,
    pincode: i.pincode,
    website: i.website,
    status: i.status,
    primaryColor: i.settings.primaryColor || "#3348d8",
  });
  const open = (kind: string, data: Row = {}) => {
    setError("");
    setD(data);
    setModal(kind);
  };
  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success("Copied.");
    } catch {
      toast.error("Clipboard access is unavailable. Copy the displayed value.");
    }
  };
  const changeStatus = (status: string) =>
    open("status", { ...editData(), status });
  return (
    <>
      <PageHead
        eyebrow="PLATFORM / INSTITUTIONS"
        title={i.name}
        description={i.institution_code + " · " + i.institution_type}
        actions={
          <>
            <Button variant="outline" onClick={() => open("edit", editData())}>
              <Pencil size={16} />
              Edit Institution
            </Button>
            <Button
              onClick={() => {
                setReason("");
                open("support");
              }}
            >
              <ShieldCheck size={16} />
              Access as Institution Admin
            </Button>
          </>
        }
      />
      <div className="institution-summary">
        <Status value={i.status} />
        <Status value={s.effectiveStatus} />
        <span>{s.plan_name} plan</span>
        <span>
          Created {new Date(i.created_at).toLocaleDateString("en-IN")}
        </span>
      </div>
      <Card className="portal-link-card">
        <span>
          <small>Default institution portal</small>
          <a href={domain.defaultPortal} target="_blank" rel="noreferrer">
            {domain.defaultPortal}
          </a>
        </span>
        <Button variant="outline" onClick={() => copy(domain.defaultPortal)}>
          <Copy size={15} />
          Copy Portal Link
        </Button>
        <Button
          variant="outline"
          onClick={() =>
            window.open(domain.defaultPortal, "_blank", "noopener")
          }
        >
          <ExternalLink size={15} />
          Open Portal
        </Button>
      </Card>
      <Tabs defaultValue="overview" className="institution-tabs">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="administrators">Administrators</TabsTrigger>
          <TabsTrigger value="subscription">Subscription</TabsTrigger>
          <TabsTrigger value="domains">Domain Settings</TabsTrigger>
          <TabsTrigger value="usage">Usage</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <div className="platform-lower-grid">
            <Card title="Institution details">
              <dl className="detail-list">
                {[
                  ["Email", i.email],
                  ["Phone", i.phone],
                  ["Address", i.address],
                  ["City", i.city],
                  ["State", i.state],
                  ["Pincode", i.pincode],
                  ["Website", i.website],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value || "—"}</dd>
                  </div>
                ))}
              </dl>
            </Card>
            <Card title="Branding & institution access">
              <div className="branding-preview">
                <img
                  src={"/api/portal/" + i.slug + "/logo"}
                  alt={i.name + " logo"}
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                  }}
                />
                <span
                  className="branding-swatch"
                  style={{ background: i.settings.primaryColor || "#3348d8" }}
                />
                <strong>{i.name}</strong>
              </div>
              <div className="detail-actions">
                <label className="upload-logo-button">
                  <Upload size={16} />
                  Upload logo
                  <input
                    type="file"
                    accept="image/png,image/jpeg"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      try {
                        await request("institutions/" + id + "/logo", {
                          method: "POST",
                          body: await filePayload(file),
                        });
                        toast.success("Logo saved.");
                        refresh();
                      } catch (e) {
                        toast.error((e as Error).message);
                      }
                    }}
                  />
                </label>
                <p className="platform-help">
                  Staff sign in using their approved local account. Support
                  access expires after one hour and is recorded in both audit
                  logs.
                </p>
              </div>
            </Card>
          </div>
          <Card title="Institution status">
            <div className="status-actions">
              <p>
                Suspending or archiving blocks staff access and preserves all
                financial records.
              </p>
              {i.status !== "Active" && (
                <Button onClick={() => changeStatus("Active")}>
                  Activate Institution
                </Button>
              )}
              {i.status !== "Suspended" && (
                <Button
                  variant="outline"
                  onClick={() => changeStatus("Suspended")}
                >
                  Suspend Institution
                </Button>
              )}
              {i.status !== "Archived" && (
                <Button
                  variant="outline"
                  onClick={() => changeStatus("Archived")}
                >
                  Archive Institution
                </Button>
              )}
            </div>
          </Card>
        </TabsContent>
        <TabsContent value="administrators">
          <Card
            title="Institution administrators"
            action={
              <Button
                size="sm"
                onClick={() =>
                  open("admin", { fullName: "", email: "", mobile: "" })
                }
              >
                <Plus size={15} />
                Grant Admin Access
              </Button>
            }
          >
            <div className="admin-access-list">
              {admins.map((a: Row) => (
                <div key={a.email}>
                  <strong>{a.name}</strong>
                  <span>
                    {a.email} · {a.mobile || "No mobile"}
                  </span>
                  <Status value={a.active ? "Active" : "Inactive"} />
                </div>
              ))}
              {pendingAdmins.map((a: Row) => (
                <div key={a.email}>
                  <strong>{a.name || "Administrator"}</strong>
                  <span>
                    {a.email} · {a.mobile || "No mobile"}
                  </span>
                  <Status value="Pending" />
                </div>
              ))}
              {!admins.length && !pendingAdmins.length && (
                <p>No administrator access configured.</p>
              )}
            </div>
          </Card>
          <div className="access-note">
            Pending access is accepted when the administrator signs in with
            their account and opens this institution portal. Share the portal link
            with them. No email has been sent automatically.
          </div>
        </TabsContent>
        <TabsContent value="subscription">
          <Card
            title="Institution subscription"
            action={
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  open("subscription", {
                    planId: s.plan_id,
                    status: s.status,
                    startDate: s.start_date,
                    endDate: s.end_date,
                    studentLimit: s.student_limit,
                    userLimit: s.user_limit,
                    modules: s.modules,
                  })
                }
              >
                Manage Subscription
              </Button>
            }
          >
            <dl className="detail-list">
              {[
                ["Plan", s.plan_name],
                ["Status", s.effectiveStatus],
                ["Start date", s.start_date],
                ["End date", s.end_date],
                ["Student limit", s.student_limit],
                ["User limit", s.user_limit],
                ["Enabled modules", s.modules.join(", ")],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </Card>
          <p className="platform-help">
            Expiry prevents new activity while retaining records. Plan edits do
            not silently change this institution's agreed limits.
          </p>
        </TabsContent>
        <TabsContent value="domains">
          <Card title="Custom domain">
            <div className="domain-panel">
              <div className="domain-statuses">
                <span>
                  Domain <Status value={domain.status} />
                </span>
                <span>
                  Verification <Status value={domain.verificationStatus} />
                </span>
                <span>
                  SSL <Status value={domain.sslStatus} />
                </span>
              </div>
              <form
                className="domain-config"
                onSubmit={async (e) => {
                  e.preventDefault();
                  setChecking(true);
                  try {
                    await request("institutions/" + id + "/domain", {
                      method: "POST",
                      body: { hostname },
                    });
                    refresh();
                    toast.success("Domain configuration saved.");
                  } catch (e) {
                    toast.error((e as Error).message);
                  } finally {
                    setChecking(false);
                  }
                }}
              >
                <Field
                  label="Custom domain"
                  hint="Use a subdomain such as fees.yourschool.in"
                >
                  <Input
                    required
                    placeholder={
                      domain.domain?.hostname || "fees.yourschool.in"
                    }
                    value={hostname}
                    onChange={(e) => setHostname(e.target.value)}
                  />
                </Field>
                <Button type="submit" disabled={checking}>
                  Save Domain
                </Button>
              </form>
              {domain.domain && (
                <>
                  <h3>DNS records</h3>
                  <div className="dns-records">
                    {domain.dns.map((record: Row) => (
                      <div key={record.type}>
                        <strong>{record.type}</strong>
                        <code>{record.name}</code>
                        <code>{record.value}</code>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => copy(record.value)}
                          aria-label={"Copy " + record.type + " value"}
                        >
                          <Copy size={15} />
                        </Button>
                      </div>
                    ))}
                  </div>
                  <Button
                    variant="outline"
                    disabled={checking}
                    onClick={async () => {
                      setChecking(true);
                      try {
                        const result = await request(
                          "institutions/" + id + "/verify-domain",
                          { method: "POST", body: {} },
                        );
                        refresh();
                        toast(result.domain?.dns_message);
                      } catch (e) {
                        toast.error((e as Error).message);
                      } finally {
                        setChecking(false);
                      }
                    }}
                  >
                    {checking ? "Checking DNS..." : "Verify DNS"}
                  </Button>
                  {domain.domain.dns_message && (
                    <p className="platform-help">{domain.domain.dns_message}</p>
                  )}
                  {domain.domain.last_checked_at && (
                    <small>
                      Last checked{" "}
                      {new Date(domain.domain.last_checked_at).toLocaleString(
                        "en-IN",
                      )}
                    </small>
                  )}
                </>
              )}
              <div className="access-note">{domain.provisioningNote}</div>
            </div>
          </Card>
        </TabsContent>
        <TabsContent value="usage">
          <div className="usage-cards">
            {[
              { label: "Students", used: u.students, limit: s.student_limit },
              {
                label: "Staff users",
                used: u.users + u.pendingUsers,
                limit: s.user_limit,
              },
            ].map((v) => (
              <Card key={v.label}>
                <h2>{v.label}</h2>
                <strong className="usage-number">
                  {v.used} <small>/ {v.limit}</small>
                </strong>
                <div className="usage-track">
                  <i
                    style={{
                      width: Math.min(100, (v.used / v.limit) * 100) + "%",
                    }}
                  />
                </div>
              </Card>
            ))}
          </div>
          <p className="platform-help">
            Staff usage includes {u.pendingUsers} pending access grants.
            Platform support sessions do not consume institution user seats.
          </p>
        </TabsContent>
      </Tabs>
      <FormDialog
        open={!!modal}
        onClose={() => setModal("")}
        title={
          {
            edit: "Edit Institution",
            status: d.status + " Institution",
            admin: "Grant Administrator Access",
            subscription: "Manage Subscription",
            support: "Access as Institution Admin",
          }[modal] || "Institution"
        }
        wide={modal === "edit" || modal === "subscription"}
        busy={busy}
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            if (modal === "support") {
              const result = await request("institutions/" + id + "/support", {
                method: "POST",
                body: { reason },
              });
              router.push(result.portalPath);
              return;
            }
            const route =
              "institutions/" +
              id +
              (modal === "admin"
                ? "/admins"
                : modal === "subscription"
                  ? "/subscription"
                  : "");
            await request(route, {
              method: modal === "admin" ? "POST" : "PATCH",
              body: d,
            });
            refresh();
            toast.success("Institution updated.");
            setModal("");
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {modal === "support" && (
          <>
            <p>
              Actions will use your platform identity and be audited for this
              institution. Access expires in one hour.
            </p>
            <Field label="Reason for support access" required>
              <Input
                required
                minLength={5}
                maxLength={500}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </Field>
          </>
        )}
        {modal === "status" && (
          <p>
            Confirm {d.status.toLowerCase()} status for {i.name}. All student
            and financial records will be retained.
          </p>
        )}
        {modal === "admin" && (
          <div className="form-grid">
            {[
              ["fullName", "Full name"],
              ["email", "Email"],
              ["mobile", "Mobile number"],
            ].map(([k, label]) => (
              <Field key={k} label={label} required>
                <Input
                  required
                  type={k === "email" ? "email" : "text"}
                  value={d[k]}
                  onChange={(e) => set(k, e.target.value)}
                />
              </Field>
            ))}
          </div>
        )}
        {modal === "edit" && (
          <div className="form-grid">
            {[
              ["name", "Institution name"],
              ["institutionCode", "Institution code"],
              ["email", "Email"],
              ["phone", "Phone"],
              ["address", "Address"],
              ["city", "City"],
              ["state", "State"],
              ["pincode", "Pincode"],
              ["website", "Website"],
            ].map(([k, label]) => (
              <Field
                key={k}
                label={label}
                required={["name", "institutionCode"].includes(k)}
              >
                <Input
                  required={["name", "institutionCode"].includes(k)}
                  type={
                    k === "email" ? "email" : k === "website" ? "url" : "text"
                  }
                  value={d[k]}
                  onChange={(e) => set(k, e.target.value)}
                />
              </Field>
            ))}
            <Field label="Institution type">
              <Picker
                value={d.institutionType}
                onChange={(v) => set("institutionType", v)}
                options={[
                  "School",
                  "PU College",
                  "College",
                  "Academy",
                  "Coaching Institute",
                  "Other",
                ].map((v) => ({ value: v, label: v }))}
              />
            </Field>
            <Field label="Primary branding">
              <Input
                type="color"
                value={d.primaryColor}
                onChange={(e) => set("primaryColor", e.target.value)}
              />
            </Field>
          </div>
        )}
        {modal === "subscription" && (
          <>
            <div className="form-grid">
              <Field label="Plan">
                <Picker
                  value={d.planId}
                  onChange={(v) => {
                    const plan = plans.data?.rows.find((p: Row) => p.id === v);
                    if (plan)
                      setD((p) => ({
                        ...p,
                        planId: v,
                        studentLimit: plan.student_limit,
                        userLimit: plan.user_limit,
                        modules: JSON.parse(plan.modules),
                      }));
                  }}
                  options={(plans.data?.rows || []).map((p: Row) => ({
                    value: p.id,
                    label: p.name,
                  }))}
                />
              </Field>
              <Field label="Status">
                <Picker
                  value={d.status}
                  onChange={(v) => set("status", v)}
                  options={[
                    "Trial",
                    "Active",
                    "Past Due",
                    "Suspended",
                    "Expired",
                    "Cancelled",
                  ].map((v) => ({ value: v, label: v }))}
                />
              </Field>
              {[
                ["startDate", "Start date"],
                ["endDate", "End date"],
              ].map(([k, label]) => (
                <Field key={k} label={label} required>
                  <Input
                    required
                    type="date"
                    value={d[k]}
                    onChange={(e) => set(k, e.target.value)}
                  />
                </Field>
              ))}
              {[
                ["studentLimit", "Student limit"],
                ["userLimit", "User limit"],
              ].map(([k, label]) => (
                <Field key={k} label={label} required>
                  <Input
                    required
                    type="number"
                    min="1"
                    value={d[k]}
                    onChange={(e) => set(k, Number(e.target.value))}
                  />
                </Field>
              ))}
            </div>
            <Field label="Enabled modules">
              <ModulePicker
                value={d.modules}
                onChange={(v) => set("modules", v)}
              />
            </Field>
          </>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </FormDialog>
    </>
  );
}
