"use client";
import { useEffect, useState } from "react";
import { useApp, useResource } from "@/components/campus/context";
import { Button, Card, Field, Input, Picker } from "@/components/campus/ui";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
type Configuration = {
  enabled: boolean;
  entityId: string;
  senderId: string;
  templates: Record<string, { id: string; body: string }>;
};
export function CommunicationSettings() {
  const { request, refresh } = useApp(),
    r = useResource<Configuration>("communications"),
    [d, setD] = useState<Configuration>({
      enabled: false,
      entityId: "",
      senderId: "",
      templates: {},
    }),
    [stage, setStage] = useState("before7"),
    [busy, setBusy] = useState(false),
    [q, setQ] = useState(""),
    [parent, setParent] = useState(""),
    [consent, setConsent] = useState(false),
    [reason, setReason] = useState(""),
    contacts = useResource("parents?size=25&q=" + encodeURIComponent(q));
  useEffect(() => {
    if (r.data) setD(r.data);
  }, [r.data]);
  const change = (key: "id" | "body", value: string) =>
    setD({
      ...d,
      templates: {
        ...d.templates,
        [stage]: {
          id: d.templates[stage]?.id || "",
          body: d.templates[stage]?.body || "",
          [key]: value,
        },
      },
    });
  return (
    <div className="space-y-6">
      <Card title="Registered SMS reminders">
        <div className="mb-5 flex items-center justify-between">
          <label htmlFor="reminders-enabled">Enable automatic reminders</label>
          <Switch
            id="reminders-enabled"
            checked={d.enabled}
            onCheckedChange={(v) => setD({ ...d, enabled: v })}
          />
        </div>
        <div className="settings-fields">
          <Field label="DLT principal entity ID">
            <Input
              value={d.entityId}
              onChange={(e) => setD({ ...d, entityId: e.target.value })}
            />
          </Field>
          <Field label="Registered sender / header">
            <Input
              value={d.senderId}
              onChange={(e) => setD({ ...d, senderId: e.target.value })}
            />
          </Field>
          <Field label="Reminder stage">
            <Picker
              value={stage}
              onChange={setStage}
              options={[
                { value: "before7", label: "7 days before" },
                { value: "before3", label: "3 days before" },
                { value: "before1", label: "1 day before" },
                { value: "due", label: "Due date" },
                { value: "after1", label: "1 day overdue" },
                { value: "after3", label: "3 days overdue" },
                { value: "after7", label: "7 days overdue" },
                { value: "receipt", label: "Payment receipt" },
              ]}
            />
          </Field>
          <Field label="Registered template ID">
            <Input
              value={d.templates[stage]?.id || ""}
              onChange={(e) => change("id", e.target.value)}
            />
          </Field>
          <Field label="Exact registered template text">
            <Textarea
              value={d.templates[stage]?.body || ""}
              onChange={(e) => change("body", e.target.value)}
              placeholder="Use {student}, {amount}, {date}, {institution}, {receipt} in the approved variable positions."
            />
          </Field>
        </div>
        <p className="my-4 text-sm text-slate-500">
          Use IDs and text approved by your DLT operator. Delivery also requires
          an SMS provider and recorded guardian consent. The system does not
          register templates with the operator.
        </p>
        <Button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await request("communications", { method: "POST", body: d });
              refresh();
              toast.success("Reminder settings saved.");
            } catch (e) {
              toast.error((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Save communication rules
        </Button>
        {r.error && <p role="alert">{r.error}</p>}
      </Card>
      <Card title="Guardian SMS consent">
        <div className="settings-fields">
          <Field label="Find guardian">
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Name or mobile"
            />
          </Field>
          <Field label="Guardian">
            <Picker
              value={parent}
              onChange={(v) => {
                setParent(v);
                setConsent(
                  !!contacts.data?.rows.find(
                    (p: { id: string; sms_consent: number }) => p.id === v,
                  )?.sms_consent,
                );
              }}
              options={[
                { value: "", label: "Choose guardian" },
                ...(contacts.data?.rows || []).map(
                  (p: {
                    id: string;
                    guardian_name: string;
                    mobile: string;
                  }) => ({
                    value: p.id,
                    label: p.guardian_name + " · " + p.mobile,
                  }),
                ),
              ]}
            />
          </Field>
          <div className="flex items-center gap-3">
            <Switch checked={consent} onCheckedChange={setConsent} />
            <span>SMS consent recorded</span>
          </div>
          <Field label="Consent evidence / withdrawal reason">
            <Input value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
        </div>
        <Button
          className="mt-4"
          disabled={!parent || reason.length < 5}
          onClick={async () => {
            try {
              await request("communications/consent", {
                method: "POST",
                body: { parentId: parent, consent, reason },
              });
              refresh();
              toast.success("Consent record updated.");
            } catch (e) {
              toast.error((e as Error).message);
            }
          }}
        >
          Record consent
        </Button>
      </Card>
    </div>
  );
}
