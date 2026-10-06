"use client";
import type { Row } from "@/components/campus/context";
import {
  Button,
  Field,
  FormDialog,
  Input,
  Picker,
} from "@/components/campus/ui";
import { usePlatform, usePlatformResource } from "@/features/platform/context";
import { useState } from "react";
import { toast } from "sonner";
const today = new Date().toISOString().slice(0, 10),
  end = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
const blank = () => ({
  name: "",
  institutionType: "School",
  institutionCode: "",
  email: "",
  phone: "",
  address: "",
  city: "",
  state: "",
  pincode: "",
  website: "",
  primaryColor: "#3348d8",
  adminName: "",
  adminEmail: "",
  adminMobile: "",
  planId: "plan-starter",
  subscriptionStatus: "Trial",
  subscriptionStart: today,
  subscriptionEnd: end,
  setupAcademic: true,
  yearName: "2026–27",
  startDate: "2026-06-01",
  endDate: "2027-05-31",
});
export async function filePayload(file: File) {
  if (!["image/png", "image/jpeg"].includes(file.type) || file.size > 1048576)
    throw new Error("Choose a PNG or JPEG under 1 MB.");
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  return { type: file.type, data };
}
export function InstitutionForm({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (id: string) => Promise<void>;
}) {
  const { request } = usePlatform(),
    plans = usePlatformResource("plans"),
    [step, setStep] = useState(0),
    [d, setD] = useState<Row>(blank()),
    [busy, setBusy] = useState(false),
    [logo, setLogo] = useState<File | null>(null),
    [issue, setIssue] = useState("");
  const set = (k: string, v: unknown) => setD((p) => ({ ...p, [k]: v }));
  const text = (
    key: string,
    label: string,
    required = false,
    type = "text",
    span = false,
  ) => (
    <Field
      key={key}
      label={label}
      required={required}
      className={span ? "span-2" : ""}
    >
      <Input
        required={required}
        type={type}
        value={d[key]}
        maxLength={key === "address" ? 500 : 160}
        onChange={(e) => set(key, e.target.value)}
      />
    </Field>
  );
  return (
    <FormDialog
      open={open}
      onClose={onClose}
      title="Create Institution"
      description="Create a portal and grant access to its first administrator."
      wide
      busy={busy}
      submitLabel={step < 2 ? "Continue" : "Create Institution"}
      onSubmit={async (e) => {
        e.preventDefault();
        setIssue("");
        if (step < 2) {
          setStep((v) => v + 1);
          return;
        }
        setBusy(true);
        try {
          if (!d.planId) throw new Error("Select a plan.");
          const created = await request("institutions", {
            method: "POST",
            body: d,
          });
          if (logo) {
            try {
              await request("institutions/" + created.id + "/logo", {
                method: "POST",
                body: await filePayload(logo),
              });
            } catch (e) {
              toast.error(
                "Institution created. Logo upload failed: " +
                  (e as Error).message,
              );
            }
          }
          toast.success("Institution and administrator access created.");
          await onCreated(created.id);
          setD(blank());
          setStep(0);
          setLogo(null);
        } catch (e) {
          setIssue((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="onboarding-steps">
        {["Institution details", "Administrator", "Plan & academic setup"].map(
          (label, i) => (
            <span key={label} className={step === i ? "active" : ""}>
              <b>{i + 1}</b>
              {label}
            </span>
          ),
        )}
      </div>
      {step === 0 && (
        <div className="form-grid">
          {text("name", "Institution name", true)}
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
          {text("institutionCode", "Institution code", true)}
          <Field label="Logo" hint="PNG or JPEG · maximum 1 MB">
            <Input
              type="file"
              accept="image/png,image/jpeg"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f)
                  filePayload(f)
                    .then(() => setLogo(f))
                    .catch((e) => setIssue(e.message));
                else setLogo(null);
              }}
            />
          </Field>
          {text("email", "Institution email", false, "email")}
          {text("phone", "Phone", false, "tel")}
          {text("address", "Address", false, "text", true)}
          {text("city", "City")}
          {text("state", "State")}
          {text("pincode", "Pincode")}
          {text("website", "Website", false, "url")}
          <Field label="Primary branding">
            <Input
              type="color"
              value={d.primaryColor}
              onChange={(e) => set("primaryColor", e.target.value)}
            />
          </Field>
          <p className="form-help">
            A unique portal address is generated from the institution name.
          </p>
        </div>
      )}
      {step === 1 && (
        <>
          <div className="form-grid">
            {text("adminName", "Administrator full name", true, "text", true)}
            {text("adminEmail", "Administrator email", true, "email")}
            {text("adminMobile", "Mobile number", true, "tel")}
          </div>
          <div className="access-note">
            The administrator signs in using their local account. Access is
            granted to this institution only. No password or parent account is
            created.
          </div>
        </>
      )}
      {step === 2 && (
        <>
          <div className="form-grid">
            <Field label="Plan" required>
              <Picker
                value={d.planId}
                onChange={(v) => set("planId", v)}
                options={(plans.data?.rows || [])
                  .filter((p: Row) => p.status === "Active")
                  .map((p: Row) => ({
                    value: p.id,
                    label:
                      p.name +
                      ` · ${p.student_limit} students / ${p.user_limit} users`,
                  }))}
              />
            </Field>
            <Field label="Subscription status">
              <Picker
                value={d.subscriptionStatus}
                onChange={(v) => set("subscriptionStatus", v)}
                options={["Trial", "Active"].map((v) => ({
                  value: v,
                  label: v,
                }))}
              />
            </Field>
            {text("subscriptionStart", "Subscription start", true, "date")}
            {text("subscriptionEnd", "Subscription end", true, "date")}
          </div>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={d.setupAcademic}
              onChange={(e) => set("setupAcademic", e.target.checked)}
            />
            Set up default school and PU classes, streams, sections and fee
            components
          </label>
          {d.setupAcademic && (
            <div className="form-grid">
              {text("yearName", "Academic year", true, "text", true)}
              {text("startDate", "Academic start", true, "date")}
              {text("endDate", "Academic end", true, "date")}
            </div>
          )}
          <div className="onboarding-review">
            <strong>{d.name}</strong>
            <span>
              {d.institutionType} · {d.institutionCode}
            </span>
            <span>
              First administrator: {d.adminName} · {d.adminEmail}
            </span>
          </div>
        </>
      )}
      {issue && (
        <p className="form-error" role="alert">
          {issue}
        </p>
      )}
      {step > 0 && (
        <Button
          type="button"
          variant="ghost"
          onClick={() => setStep((v) => v - 1)}
        >
          Back
        </Button>
      )}
    </FormDialog>
  );
}
