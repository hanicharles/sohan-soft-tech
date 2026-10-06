"use client";
import { Row, useApp, useResource } from "@/components/campus/context";
import {
  Button,
  Card,
  Field,
  FormDialog,
  Input,
  PageHead,
  Picker,
  Status,
} from "@/components/campus/ui";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  CheckCircle2,
  ExternalLink,
  KeyRound,
  MessageSquare,
  Save,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CommunicationSettings } from "./CommunicationSettings";
import { HardwareSettings } from "./HardwareSettings";
import { AccountingSettings } from "./AccountingSettings";
export function Settings() {
  const { boot, request, reload, refresh, t } = useApp("settings.manage"),
    r = useResource("providers"),
    [d, setD] = useState<Row>({
      ...boot.institution,
      settings: structuredClone(boot.institution.settings),
    }),
    [busy, setBusy] = useState(false),
    [provider, setProvider] = useState(""),
    [config, setConfig] = useState<Row>({
      keyId: "",
      keySecret: "",
      webhookSecret: "",
      url: "",
      token: "",
      mode: "sandbox",
    });
  useEffect(
    () =>
      setD({
        ...boot.institution,
        settings: structuredClone(boot.institution.settings),
      }),
    [boot.institution],
  );
  const field = (key: string) => (
    <Input
      value={d[key] || ""}
      onChange={(e) => setD({ ...d, [key]: e.target.value })}
    />
  );
  const settings = (section: string, key: string, value: any) =>
    setD({
      ...d,
      settings: {
        ...d.settings,
        [section]: { ...d.settings[section], [key]: value },
      },
    });
  const save = async () => {
    setBusy(true);
    try {
      await request("settings", {
        method: "PATCH",
        body: {
          name: d.name,
          address: d.address,
          email: d.email,
          phone: d.phone,
          gstin: d.gstin || undefined,
          settings: d.settings,
        },
      });
      toast.success("Institution settings saved.");
      await reload();
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <PageHead
        eyebrow="ADMINISTRATION / SETTINGS"
        title={t("Settings")}
        description={t("SettingsIntro")}
        actions={
          <Button disabled={busy} onClick={save}>
            <Save size={16} />
            {busy ? "Saving..." : "Save changes"}
          </Button>
        }
      />
      <Tabs defaultValue="institution">
        <TabsList className="page-tabs">
          <TabsTrigger value="institution">Institution</TabsTrigger>
          <TabsTrigger value="fees">Fee policies</TabsTrigger>
          <TabsTrigger value="gateway">Payment gateways</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="communication-rules">Reminders</TabsTrigger>
          <TabsTrigger value="hardware">RFID & daily fees</TabsTrigger>
          <TabsTrigger value="accounting">Tally mapping</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
        </TabsList>
        <TabsContent value="communication-rules">
          <CommunicationSettings />
        </TabsContent>
        <TabsContent value="hardware">
          <HardwareSettings />
        </TabsContent>
        <TabsContent value="accounting">
          <AccountingSettings />
        </TabsContent>
        <TabsContent value="institution">
          <Card title="Institution details">
            <div className="settings-form form-grid">
              <Field label="Institution name" className="span-2">
                {field("name")}
              </Field>
              <Field label="Email">{field("email")}</Field>
              <Field label="Phone">{field("phone")}</Field>
              <Field label="Address" className="span-2">
                {field("address")}
              </Field>
              <Field label="GSTIN (if applicable)">{field("gstin")}</Field>
              <Field label="Interface language">
                <Picker
                  value={d.settings.language || "en"}
                  onChange={(v) =>
                    setD({ ...d, settings: { ...d.settings, language: v } })
                  }
                  options={[
                    { value: "en", label: "English" },
                    { value: "kn", label: "ಕನ್ನಡ (navigation preview)" },
                    { value: "hi", label: "हिन्दी (navigation preview)" },
                  ]}
                />
              </Field>
              <Field
                label="Institution UPI ID"
                hint="Printed as a QR code on unpaid invoices."
              >
                <Input
                  placeholder="school@bank"
                  value={d.settings.upi?.payeeId || ""}
                  onChange={(e) =>
                    setD({
                      ...d,
                      settings: {
                        ...d.settings,
                        upi: {
                          payeeName: d.settings.upi?.payeeName || d.name,
                          payeeId: e.target.value,
                        },
                      },
                    })
                  }
                />
              </Field>
              <Field label="UPI payee name">
                <Input
                  value={d.settings.upi?.payeeName || d.name}
                  onChange={(e) =>
                    setD({
                      ...d,
                      settings: {
                        ...d.settings,
                        upi: {
                          payeeId: d.settings.upi?.payeeId || "",
                          payeeName: e.target.value,
                        },
                      },
                    })
                  }
                />
              </Field>
              <Field label="Receipt numbering">
                <Input readOnly value="REC / Academic year / Sequence" />
              </Field>
              <Field label="Invoice numbering">
                <Input readOnly value="INV / Academic year / Sequence" />
              </Field>
            </div>
          </Card>
        </TabsContent>
        <TabsContent value="fees">
          <Card title="Late fee policy">
            <div className="settings-form">
              <div className="setting-toggle">
                <div>
                  <strong>Automatic late fees</strong>
                  <p>
                    Post calculated charges as new, permanent ledger entries.
                  </p>
                </div>
                <Switch
                  checked={d.settings.lateFee.enabled}
                  onCheckedChange={(v) => settings("lateFee", "enabled", v)}
                />
              </div>
              <div className="form-grid">
                <Field label="Calculation">
                  <Picker
                    value={d.settings.lateFee.mode}
                    onChange={(v) => settings("lateFee", "mode", v)}
                    options={["Fixed", "Daily", "Percentage"].map((v) => ({
                      value: v,
                      label:
                        v === "Percentage"
                          ? "Percentage per month"
                          : v === "Daily"
                            ? "Per overdue day"
                            : "Fixed after due date",
                    }))}
                  />
                </Field>
                <Field
                  label={
                    d.settings.lateFee.mode === "Percentage"
                      ? "Rate (%)"
                      : "Charge (₹)"
                  }
                >
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={d.settings.lateFee.value / 100}
                    onChange={(e) =>
                      settings(
                        "lateFee",
                        "value",
                        Math.round(Number(e.target.value) * 100),
                      )
                    }
                  />
                </Field>
                <Field label="Grace period (days)">
                  <Input
                    type="number"
                    min="0"
                    value={d.settings.lateFee.graceDays}
                    onChange={(e) =>
                      settings("lateFee", "graceDays", Number(e.target.value))
                    }
                  />
                </Field>
                <Field label="Maximum per installment (₹)">
                  <Input
                    type="number"
                    min="0"
                    value={d.settings.lateFee.maxPaise / 100}
                    onChange={(e) =>
                      settings(
                        "lateFee",
                        "maxPaise",
                        Math.round(Number(e.target.value) * 100),
                      )
                    }
                  />
                </Field>
              </div>
              <p className="form-note">
                Saved policies apply to future job runs. Posted charges are
                retained in the audit history.
              </p>
              <Button
                variant="outline"
                onClick={async () => {
                  try {
                    const result = await request("jobs", {
                      method: "POST",
                      body: {},
                    });
                    toast.success(
                      `${result.lateFees} late fees posted, ${result.reminders} reminders queued.`,
                    );
                    refresh();
                  } catch (e) {
                    toast.error((e as Error).message);
                  }
                }}
              >
                Run financial jobs now
              </Button>
            </div>
          </Card>
        </TabsContent>
        <TabsContent value="gateway">
          <div className="provider-grid">
            {["Razorpay", "Cashfree"].map((name) => {
              const connected = r.data?.providers.find(
                (p: Row) => p.provider === name,
              );
              return (
                <Card key={name} className="provider-card">
                  <span className="provider-logo">
                    {name === "Razorpay" ? "R" : "C"}
                  </span>
                  <h2>{name}</h2>
                  <p>
                    Server-created orders, captured-payment verification and
                    duplicate protection.
                  </p>
                  <Status value={connected ? "Active" : "Not connected"} />
                  <div className="provider-card-footer">
                    <span>{connected?.mode || "Credentials required"}</span>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setProvider(name);
                        setConfig({
                          keyId: "",
                          keySecret: "",
                          webhookSecret: "",
                          url: "",
                          token: "",
                          mode: "sandbox",
                        });
                      }}
                    >
                      <KeyRound size={15} />
                      {connected ? "Update connection" : "Connect gateway"}
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
          <Card title="Payment preferences">
            <div className="settings-form">
              <Field label="Default payment gateway">
                <Picker
                  value={d.settings.gateway}
                  onChange={(v) =>
                    setD({ ...d, settings: { ...d.settings, gateway: v } })
                  }
                  options={["Razorpay", "Cashfree"].map((v) => ({
                    value: v,
                    label: v,
                  }))}
                />
              </Field>
              <p className="form-note">
                Staff can collect online payments after a provider is connected.
                External webhooks require a callback URL that the provider can
                reach.
              </p>
              <div className="webhook-path">
                <code>/api/payments/webhook</code>
                <span>Razorpay payment.captured</span>
              </div>
            </div>
          </Card>
        </TabsContent>
        <TabsContent value="notifications">
          <Card title="Payment receipt notifications">
            <div className="settings-form">
              <div className="setting-toggle">
                <div>
                  <strong>Send payment acknowledgements</strong>
                  <p>
                    Queue an acknowledgement after a verified payment. Configure
                    a provider below.
                  </p>
                </div>
                <Switch
                  checked={d.settings.receiptNotifications?.enabled || false}
                  onCheckedChange={(v) =>
                    setD({
                      ...d,
                      settings: {
                        ...d.settings,
                        receiptNotifications: {
                          channel:
                            d.settings.receiptNotifications?.channel || "Email",
                          enabled: v,
                        },
                      },
                    })
                  }
                />
              </div>
              <Field label="Receipt channel">
                <Picker
                  value={d.settings.receiptNotifications?.channel || "Email"}
                  onChange={(v) =>
                    setD({
                      ...d,
                      settings: {
                        ...d.settings,
                        receiptNotifications: {
                          enabled:
                            d.settings.receiptNotifications?.enabled || false,
                          channel: v,
                        },
                      },
                    })
                  }
                  options={["Email", "SMS", "WhatsApp"].map((value) => ({
                    value,
                    label: value,
                  }))}
                />
              </Field>
            </div>
          </Card>
          <Card title="Reminder schedule">
            <div className="settings-form form-grid">
              <Field label="Days before due date">
                <Input
                  type="number"
                  value={d.settings.reminders.beforeDays}
                  onChange={(e) =>
                    settings("reminders", "beforeDays", Number(e.target.value))
                  }
                />
              </Field>
              <Field label="Days after due date">
                <Input
                  type="number"
                  value={d.settings.reminders.afterDays}
                  onChange={(e) =>
                    settings("reminders", "afterDays", Number(e.target.value))
                  }
                />
              </Field>
              <Field label="Default channel">
                <Picker
                  value={d.settings.reminders.channel}
                  onChange={(v) => settings("reminders", "channel", v)}
                  options={["SMS", "WhatsApp", "Email"].map((v) => ({
                    value: v,
                    label: v,
                  }))}
                />
              </Field>
              <Field label="Upcoming fee template" className="span-2">
                <Textarea
                  value={d.settings.templates.upcoming}
                  onChange={(e) =>
                    settings("templates", "upcoming", e.target.value)
                  }
                  rows={3}
                />
              </Field>
              <Field label="Overdue fee template" className="span-2">
                <Textarea
                  value={d.settings.templates.overdue}
                  onChange={(e) =>
                    settings("templates", "overdue", e.target.value)
                  }
                  rows={3}
                />
              </Field>
              <p className="form-note span-2">
                Available variables: {"{parent}, {student}, {amount}, {date}"}
              </p>
            </div>
          </Card>
          <Card title="Delivery providers">
            <div className="notification-providers">
              {["SMS", "WhatsApp", "Email"].map((name) => {
                const connected = r.data?.providers.find(
                  (p: Row) => p.provider === name,
                );
                return (
                  <div key={name}>
                    <span className="notification-provider-icon">
                      <MessageSquare size={20} />
                    </span>
                    <div>
                      <strong>{name}</strong>
                      <small>
                        {connected
                          ? "Connected provider endpoint"
                          : "Connect a delivery provider"}
                      </small>
                    </div>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setProvider(name);
                        setConfig({ url: "", token: "", mode: "production" });
                      }}
                    >
                      {connected ? "Update" : "Connect"}
                    </Button>
                  </div>
                );
              })}
            </div>
            <p className="provider-help">
              Adapters accept HTTPS endpoints with bearer authentication. The
              delivery service receives the recipient, message and a stable
              idempotency key.
            </p>
          </Card>
        </TabsContent>
        <TabsContent value="security">
          <Card title="Security controls">
            <div className="security-controls">
              {[
                ["Sign-in", "Dispatch-owned authenticated sessions"],
                [
                  "Access control",
                  "Institution membership and server-enforced roles",
                ],
                [
                  "Financial integrity",
                  "Immutable ledger entries and transactional payment posting",
                ],
                [
                  "Duplicate protection",
                  "Idempotency keys, unique provider transactions and signed events",
                ],
                [
                  "Provider credentials",
                  "AES-256-GCM encryption with tenant-bound associated data",
                ],
                ["Aadhaar", "Only the last four digits are retained"],
                [
                  "Audit trail",
                  "Append-only financial and configuration history",
                ],
              ].map(([label, info]) => (
                <div key={label}>
                  <ShieldCheck size={20} />
                  <span>
                    <strong>{label}</strong>
                    <small>{info}</small>
                  </span>
                  <CheckCircle2 size={17} />
                </div>
              ))}
            </div>
            <a
              href="/api/openapi"
              className="api-docs-link"
              target="_blank"
              rel="noreferrer"
            >
              View OpenAPI specification <ExternalLink size={14} />
            </a>
          </Card>
        </TabsContent>
      </Tabs>
      <FormDialog
        open={!!provider}
        onClose={() => {
          setProvider("");
          setConfig({});
        }}
        title={"Connect " + provider}
        description="Credentials are encrypted on the server and never returned to the browser."
        busy={busy}
        submitLabel="Save connection"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await request("providers", {
              method: "POST",
              body: { provider, config, mode: config.mode || "production" },
            });
            toast.success("Provider connection saved.");
            setProvider("");
            setConfig({});
            refresh();
            await reload();
          } catch (e) {
            toast.error((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {["Razorpay", "Cashfree"].includes(provider) ? (
          <>
            <Field label={provider === "Cashfree" ? "App ID" : "Key ID"}>
              <Input
                value={config.keyId || ""}
                required
                onChange={(e) =>
                  setConfig({ ...config, keyId: e.target.value })
                }
                autoComplete="off"
              />
            </Field>
            <Field label="Key secret">
              <Input
                type="password"
                value={config.keySecret || ""}
                required
                onChange={(e) =>
                  setConfig({ ...config, keySecret: e.target.value })
                }
                autoComplete="new-password"
              />
            </Field>
            {provider === "Razorpay" && (
              <Field label="Webhook secret">
                <Input
                  type="password"
                  value={config.webhookSecret || ""}
                  onChange={(e) =>
                    setConfig({ ...config, webhookSecret: e.target.value })
                  }
                  autoComplete="new-password"
                />
              </Field>
            )}
            <Field label="Environment">
              <Picker
                value={config.mode || "sandbox"}
                onChange={(v) => setConfig({ ...config, mode: v })}
                options={[
                  { value: "sandbox", label: "Test / sandbox" },
                  { value: "production", label: "Live / production" },
                ]}
              />
            </Field>
          </>
        ) : (
          <>
            {provider === "WhatsApp" && (
              <>
                <Field label="WhatsApp adapter">
                  <Picker
                    value={config.adapter || "Webhook"}
                    onChange={(v) => setConfig({ ...config, adapter: v })}
                    options={[
                      { value: "Webhook", label: "Existing HTTPS adapter" },
                      { value: "Meta", label: "Meta WhatsApp Cloud API" },
                    ]}
                  />
                </Field>
                <Field label="Meta app secret (inbound signature)">
                  <Input
                    type="password"
                    value={config.appSecret || ""}
                    onChange={(e) =>
                      setConfig({ ...config, appSecret: e.target.value })
                    }
                  />
                </Field>
                <Field label="Webhook verification token">
                  <Input
                    type="password"
                    value={config.verifyToken || ""}
                    onChange={(e) =>
                      setConfig({ ...config, verifyToken: e.target.value })
                    }
                  />
                </Field>
                <Field label="Business phone number ID">
                  <Input
                    value={config.phoneNumberId || ""}
                    onChange={(e) =>
                      setConfig({ ...config, phoneNumberId: e.target.value })
                    }
                  />
                </Field>
                {config.adapter === "Meta" && (
                  <>
                    <Field label="Approved receipt template name">
                      <Input
                        value={config.receiptTemplateName || ""}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            receiptTemplateName: e.target.value,
                          })
                        }
                      />
                    </Field>
                    <Field label="Approved reminder template name">
                      <Input
                        value={config.reminderTemplateName || ""}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            reminderTemplateName: e.target.value,
                          })
                        }
                      />
                    </Field>
                    <Field label="Template language code">
                      <Input
                        value={config.templateLanguage || "en"}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            templateLanguage: e.target.value,
                          })
                        }
                      />
                    </Field>
                    <p className="text-sm text-slate-500">
                      The receipt template must have one body text variable
                      containing the receipt acknowledgement and portal link.
                    </p>
                  </>
                )}
                <p className="text-sm break-all">
                  Incoming webhook: /api/webhooks/whatsapp/{boot.institution.id}
                </p>
              </>
            )}
            <Field label="HTTPS provider endpoint">
              <Input
                type="url"
                required
                value={config.url || ""}
                onChange={(e) => setConfig({ ...config, url: e.target.value })}
                placeholder="https://your-provider.example/send"
              />
            </Field>
            <Field label="Bearer token">
              <Input
                type="password"
                required
                value={config.token || ""}
                onChange={(e) =>
                  setConfig({ ...config, token: e.target.value })
                }
              />
            </Field>
          </>
        )}
      </FormDialog>
    </>
  );
}
