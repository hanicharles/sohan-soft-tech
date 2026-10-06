"use client";
import type { Row } from "@/components/campus/context";
import {
  Button,
  Card,
  DataTable,
  Failure,
  Field,
  FormDialog,
  Input,
  Loading,
  money,
  PageHead,
  Picker,
  SearchBox,
  Status,
} from "@/components/campus/ui";
import { useRouter } from "@/lib/browser-navigation";
import { Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { usePlatform, usePlatformResource } from "./context";
export function PlatformRegister({ kind }: { kind: string }) {
  const router = useRouter(),
    { request, refresh } = usePlatform(),
    [q, setQ] = useState(""),
    [status, setStatus] = useState(""),
    [page, setPage] = useState(1),
    [open, setOpen] = useState(false),
    [selection, setSelection] = useState<Row | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [institutionSearch, setInstitutionSearch] = useState(""),
    [d, setD] = useState<Row>({
      institutionId: "",
      amount: "",
      method: "Bank Transfer",
      reference: "",
      paidDate: new Date().toISOString().slice(0, 10),
      notes: "",
      idempotencyKey: crypto.randomUUID(),
    });
  const r = usePlatformResource(
      kind +
        "?" +
        new URLSearchParams({ q, status, page: String(page), size: "15" }),
    ),
    institutions = usePlatformResource(
      "institutions?size=30&q=" + encodeURIComponent(institutionSearch),
    );
  const set = (k: string, v: unknown) => setD((p) => ({ ...p, [k]: v }));
  const titles: Record<string, string> = {
    subscriptions: "Institution subscriptions",
    payments: "Subscription payments",
    domains: "Domains",
    usage: "Platform usage",
    audit: "Platform audit logs",
  };
  const manage = (v: Row) => (
    <Button
      size="sm"
      variant="outline"
      onClick={() => router.push("/admin/institutions/" + v.id)}
    >
      Manage
    </Button>
  );
  const columns: Record<string, any[]> = {
    subscriptions: [
      { key: "name", label: "Institution" },
      { key: "plan_name", label: "Plan" },
      {
        key: "status",
        label: "Status",
        render: (v: Row) => (
          <Status
            value={
              ["Active", "Trial", "Past Due"].includes(v.status) &&
              v.end_date < new Date().toISOString().slice(0, 10)
                ? "Expired"
                : v.status
            }
          />
        ),
      },
      { key: "start_date", label: "Start" },
      { key: "end_date", label: "End" },
      { key: "student_limit", label: "Student limit" },
      { key: "user_limit", label: "User limit" },
      { key: "actions", label: "", render: manage },
    ],
    usage: [
      { key: "name", label: "Institution" },
      { key: "plan_name", label: "Plan" },
      {
        key: "students",
        label: "Students",
        render: (v: Row) => (
          <UsageMeter used={v.students} limit={v.student_limit} />
        ),
      },
      {
        key: "users",
        label: "Staff users",
        render: (v: Row) => <UsageMeter used={v.users} limit={v.user_limit} />,
      },
      { key: "actions", label: "", render: manage },
    ],
    domains: [
      { key: "name", label: "Institution" },
      {
        key: "slug",
        label: "Default portal",
        render: (v: Row) => (
          <a
            className="table-link"
            href={"/campus/" + v.slug}
            target="_blank"
            rel="noreferrer"
          >
            /campus/{v.slug}
          </a>
        ),
      },
      { key: "hostname", label: "Custom domain" },
      {
        key: "domain_status",
        label: "Domain status",
        render: (v: Row) => (
          <Status value={v.domain_status || "Not Configured"} />
        ),
      },
      {
        key: "verification_status",
        label: "Verification",
        render: (v: Row) => v.verification_status || "Not Configured",
      },
      {
        key: "ssl_status",
        label: "SSL",
        render: (v: Row) => v.ssl_status || "Not Configured",
      },
      { key: "actions", label: "", render: manage },
    ],
    payments: [
      { key: "paid_date", label: "Date" },
      { key: "institution_name", label: "Institution" },
      {
        key: "amount_paise",
        label: "Amount",
        align: "right",
        render: (v: Row) => money(v.amount_paise),
      },
      { key: "method", label: "Method" },
      { key: "reference", label: "Reference" },
      { key: "notes", label: "Notes" },
    ],
    audit: [
      {
        key: "created_at",
        label: "When",
        render: (v: Row) => new Date(v.created_at).toLocaleString("en-IN"),
      },
      { key: "user_name", label: "User" },
      { key: "action", label: "Action" },
      {
        key: "institution_name",
        label: "Institution",
        render: (v: Row) => v.institution_name || "Platform",
      },
      { key: "entity", label: "Entity" },
      {
        key: "actions",
        label: "",
        render: (v: Row) => (
          <Button size="sm" variant="ghost" onClick={() => setSelection(v)}>
            Details
          </Button>
        ),
      },
    ],
  };
  if (!titles[kind])
    return (
      <PageHead
        title="Page not found"
        description="Choose a section from the platform navigation."
      />
    );
  return (
    <>
      <PageHead
        eyebrow={"PLATFORM / " + kind.toUpperCase()}
        title={titles[kind]}
        description={
          kind === "payments"
            ? "Record confirmed institution subscription payments. Staff fee payments remain inside each institution."
            : kind === "usage"
              ? "Capacity across institution subscriptions. Pending access also reserves user seats."
              : kind === "audit"
                ? "Platform management and support access history."
                : "Manage institutions from their detail page."
        }
        actions={
          kind === "payments" ? (
            <Button
              onClick={() => {
                setError("");
                setD({
                  institutionId: "",
                  amount: "",
                  method: "Bank Transfer",
                  reference: "",
                  paidDate: new Date().toISOString().slice(0, 10),
                  notes: "",
                  idempotencyKey: crypto.randomUUID(),
                });
                setOpen(true);
              }}
            >
              <Plus size={16} />
              Record Payment
            </Button>
          ) : undefined
        }
      />
      <Card>
        <div className="table-toolbar">
          <SearchBox
            value={q}
            onChange={(v) => {
              setQ(v);
              setPage(1);
            }}
            placeholder={
              kind === "audit"
                ? "Search audit actions..."
                : "Search institution..."
            }
          />
          {kind === "subscriptions" && (
            <Picker
              value={status}
              onChange={(v) => {
                setStatus(v);
                setPage(1);
              }}
              options={[
                "",
                "Trial",
                "Active",
                "Past Due",
                "Suspended",
                "Expired",
                "Cancelled",
              ].map((v) => ({ value: v, label: v || "All statuses" }))}
            />
          )}
        </div>
        {r.error ? (
          <Failure message={r.error} retry={r.retry} />
        ) : (
          <DataTable
            loading={r.loading}
            columns={columns[kind]}
            rows={r.data?.rows || []}
            total={r.data?.total}
            page={page}
            size={15}
            onPage={setPage}
          />
        )}
      </Card>
      <FormDialog
        open={open}
        onClose={() => setOpen(false)}
        title="Record Subscription Payment"
        wide
        busy={busy}
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await request("payments", { method: "POST", body: d });
            refresh();
            toast.success("Subscription payment recorded.");
            setOpen(false);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="form-grid">
          <Field label="Search institutions" className="span-2">
            <Input
              value={institutionSearch}
              onChange={(e) => setInstitutionSearch(e.target.value)}
              placeholder="Search by name"
            />
          </Field>
          <Field label="Institution" required className="span-2">
            <Picker
              value={d.institutionId}
              onChange={(v) => set("institutionId", v)}
              options={(institutions.data?.rows || []).map((v: Row) => ({
                value: v.id,
                label: v.name,
              }))}
              placeholder="Choose institution"
            />
          </Field>
          {[
            ["amount", "Amount (₹)"],
            ["reference", "Bank / transaction reference"],
            ["paidDate", "Payment date"],
            ["notes", "Notes"],
          ].map(([k, label]) => (
            <Field key={k} label={label} required={k !== "notes"}>
              <Input
                required={k !== "notes"}
                type={k === "paidDate" ? "date" : "text"}
                value={d[k]}
                onChange={(e) => set(k, e.target.value)}
              />
            </Field>
          ))}
          <Field label="Payment method">
            <Picker
              value={d.method}
              onChange={(v) => set("method", v)}
              options={["Bank Transfer", "UPI", "Cash", "Card", "Cheque"].map(
                (v) => ({ value: v, label: v }),
              )}
            />
          </Field>
        </div>
        <p className="platform-help">
          Record only a confirmed payment. Subscription dates and status are
          updated separately.
        </p>
        {error && <p className="form-error">{error}</p>}
      </FormDialog>
      <FormDialog
        open={!!selection}
        onClose={() => setSelection(null)}
        title="Audit details"
        wide
      >
        {selection && (
          <>
            <dl className="detail-list">
              <div>
                <dt>Action</dt>
                <dd>{selection.action}</dd>
              </div>
              <div>
                <dt>User</dt>
                <dd>{selection.user_name}</dd>
              </div>
              <div>
                <dt>IP</dt>
                <dd>{selection.ip || "Unavailable"}</dd>
              </div>
              <div>
                <dt>Device</dt>
                <dd>{selection.user_agent || "Unavailable"}</dd>
              </div>
            </dl>
            <h3>Previous value</h3>
            <pre className="audit-json">
              {JSON.stringify(
                selection.old_value ? JSON.parse(selection.old_value) : null,
                null,
                2,
              )}
            </pre>
            <h3>New value</h3>
            <pre className="audit-json">
              {JSON.stringify(
                selection.new_value ? JSON.parse(selection.new_value) : null,
                null,
                2,
              )}
            </pre>
          </>
        )}
      </FormDialog>
    </>
  );
}
function UsageMeter({ used, limit }: { used: number; limit: number }) {
  return (
    <div className="table-usage">
      <span>
        {used} / {limit}
      </span>
      <div className="usage-track">
        <i style={{ width: Math.min(100, (used / limit) * 100) + "%" }} />
      </div>
    </div>
  );
}
export function PlatformSettings() {
  const { request, refresh } = usePlatform(),
    r = usePlatformResource("settings"),
    [d, setD] = useState<Row | null>(null),
    [busy, setBusy] = useState(false);
  if (r.error) return <Failure message={r.error} retry={r.retry} />;
  if (!r.data) return <Loading />;
  const values = d || {
    supportEmail: r.data.settings.supportEmail || "",
    platformName: r.data.settings.platformName || "Sohan Soft Tech",
    expiryNoticeDays: r.data.settings.expiryNoticeDays || 30,
  };
  return (
    <>
      <PageHead
        eyebrow="PLATFORM / SETTINGS"
        title="Platform settings"
        description="Platform identity and support preferences."
      />
      <Card title="General settings">
        <form
          className="settings-form"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              await request("settings", { method: "PATCH", body: values });
              refresh();
              toast.success("Settings saved.");
            } catch (e) {
              toast.error((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="form-grid">
            {[
              ["platformName", "Platform name"],
              ["supportEmail", "Support email"],
              ["expiryNoticeDays", "Expiry notice window (days)"],
            ].map(([k, label]) => (
              <Field key={k} label={label}>
                <Input
                  type={
                    k === "supportEmail"
                      ? "email"
                      : k === "expiryNoticeDays"
                        ? "number"
                        : "text"
                  }
                  min={1}
                  max={90}
                  value={values[k]}
                  onChange={(e) =>
                    setD({
                      ...values,
                      [k]:
                        k === "expiryNoticeDays"
                          ? Number(e.target.value)
                          : e.target.value,
                    })
                  }
                />
              </Field>
            ))}
          </div>
          <Button type="submit" disabled={busy}>
            Save Settings
          </Button>
        </form>
      </Card>
      <Card title="Authentication & hosting">
        <dl className="detail-list">
          <div>
            <dt>Platform owner</dt>
            <dd>{r.data.owner}</dd>
          </div>
          <div>
            <dt>Sign in</dt>
            <dd>{r.data.loginMethod}</dd>
          </div>
          <div>
            <dt>Default portal origin</dt>
            <dd>{r.data.origin}</dd>
          </div>
          <div>
            <dt>Custom domains</dt>
            <dd>
              DNS verification supported. Hosting, HTTPS and sign-in
              provisioning require deployment configuration.
            </dd>
          </div>
        </dl>
      </Card>
    </>
  );
}
