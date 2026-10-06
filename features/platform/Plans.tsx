"use client";
import type { Row } from "@/components/campus/context";
import {
  Button,
  Card,
  Failure,
  Field,
  FormDialog,
  Input,
  PageHead,
  Picker,
  Status,
  money,
} from "@/components/campus/ui";
import { modules } from "@/lib/permissions";
import { Check, Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { usePlatform, usePlatformResource } from "./context";
export function ModulePicker({
  value,
  onChange,
}: {
  value: string[];
  onChange: (v: string[]) => void;
}) {
  return (
    <div className="permission-grid">
      {modules.map((m) => (
        <label key={m}>
          <input
            type="checkbox"
            checked={value.includes(m)}
            onChange={(e) =>
              onChange(
                e.target.checked ? [...value, m] : value.filter((v) => v !== m),
              )
            }
          />
          {m[0].toUpperCase() + m.slice(1)}
        </label>
      ))}
    </div>
  );
}
export function Plans() {
  const { request, refresh } = usePlatform(),
    r = usePlatformResource("plans"),
    [d, setD] = useState<Row | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const set = (k: string, v: unknown) => setD((p) => ({ ...p, [k]: v }));
  return (
    <>
      <PageHead
        eyebrow="PLATFORM / SUBSCRIPTIONS"
        title="Plans"
        description="Set pricing, capacity and enabled modules. Changes apply to new subscriptions; existing limits are edited per institution."
        actions={
          <Button
            onClick={() => {
              setError("");
              setD({
                name: "",
                code: "",
                price: "0",
                billingCycle: "Annual",
                studentLimit: 500,
                userLimit: 10,
                modules: [...modules],
                status: "Active",
              });
            }}
          >
            <Plus size={17} />
            Create Plan
          </Button>
        }
      />
      {r.error ? (
        <Failure message={r.error} retry={r.retry} />
      ) : (
        <div className="plan-grid">
          {(r.data?.rows || []).map((p: Row) => (
            <Card key={p.id} className="plan-card">
              <div className="plan-card-head">
                <h2>{p.name}</h2>
                <Status value={p.status} />
              </div>
              <strong className="plan-price">
                {money(p.price_paise)}
                <small> / {p.billing_cycle.toLowerCase()}</small>
              </strong>
              <p>
                {p.student_limit.toLocaleString("en-IN")} students ·{" "}
                {p.user_limit} staff users
              </p>
              <ul>
                {JSON.parse(p.modules).map((m: string) => (
                  <li key={m}>
                    <Check size={15} />
                    {m[0].toUpperCase() + m.slice(1)}
                  </li>
                ))}
              </ul>
              <Button
                variant="outline"
                onClick={() => {
                  setError("");
                  setD({
                    id: p.id,
                    name: p.name,
                    code: p.code,
                    price: (p.price_paise / 100).toFixed(2),
                    billingCycle: p.billing_cycle,
                    studentLimit: p.student_limit,
                    userLimit: p.user_limit,
                    modules: JSON.parse(p.modules),
                    status: p.status,
                  });
                }}
              >
                <Pencil size={15} />
                Edit Plan
              </Button>
            </Card>
          ))}
        </div>
      )}
      <p className="platform-help">
        Seeded plans start at ₹0. Configure commercial pricing before onboarding
        paying institutions. Recording a payment does not charge a card or renew
        a subscription automatically.
      </p>
      <FormDialog
        open={!!d}
        onClose={() => setD(null)}
        title={d?.id ? "Edit Plan" : "Create Plan"}
        wide
        busy={busy}
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await request("plans" + (d!.id ? "/" + d!.id : ""), {
              method: d!.id ? "PATCH" : "POST",
              body: d,
            });
            refresh();
            toast.success("Plan saved.");
            setD(null);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {d && (
          <>
            <div className="form-grid">
              {[
                ["name", "Plan name"],
                ["code", "Plan code"],
                ["price", "Price (₹)"],
              ].map(([k, label]) => (
                <Field key={k} label={label} required>
                  <Input
                    required
                    value={d[k]}
                    onChange={(e) => set(k, e.target.value)}
                  />
                </Field>
              ))}
              <Field label="Billing cycle">
                <Picker
                  value={d.billingCycle}
                  onChange={(v) => set("billingCycle", v)}
                  options={["Monthly", "Quarterly", "Annual"].map((v) => ({
                    value: v,
                    label: v,
                  }))}
                />
              </Field>
              {[
                ["studentLimit", "Maximum students"],
                ["userLimit", "Maximum users"],
              ].map(([k, label]) => (
                <Field key={k} label={label} required>
                  <Input
                    type="number"
                    min="1"
                    max={k === "studentLimit" ? 1000000 : 100000}
                    required
                    value={d[k]}
                    onChange={(e) => set(k, Number(e.target.value))}
                  />
                </Field>
              ))}
              <Field label="Status">
                <Picker
                  value={d.status}
                  onChange={(v) => set("status", v)}
                  options={["Active", "Inactive"].map((v) => ({
                    value: v,
                    label: v,
                  }))}
                />
              </Field>
            </div>
            <Field label="Enabled modules">
              <ModulePicker
                value={d.modules}
                onChange={(v) => set("modules", v)}
              />
            </Field>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
          </>
        )}
      </FormDialog>
    </>
  );
}
