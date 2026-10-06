"use client";
import { Switch } from "@/components/ui/switch";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Row, useApp } from "./context";
import { Field, FormDialog, Input, Picker } from "./ui";
export function CatalogDialog({
  kind,
  open,
  onClose,
}: {
  kind: string;
  open: boolean;
  onClose: () => void;
}) {
  const { boot, scope, request, reload, refresh } = useApp(),
    [d, setD] = useState<Row>({}),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open)
      setD({
        name: "",
        level: "School",
        classId: boot.classes[0]?.id || "",
        campusId: boot.campuses[0]?.id || "",
        yearId: scope.year,
        streamId: "",
        capacity: 40,
        status: "Draft",
        startDate: "2027-06-01",
        endDate: "2028-05-31",
        guardianName: "",
        fatherName: "",
        motherName: "",
        mobile: "",
        email: "",
        address: "",
        relationship: "Father",
        category: "Academic",
        active: true,
        sortOrder: boot.components.length,
        kind: "Discount",
        calculation: "Percentage",
        value: "10",
        eligibility: "",
        componentId: "",
        autoApply: false,
        recurring: false,
        validUntil: "",
      });
  }, [open, kind]);
  const input = (key: string, type = "text", required = false) => (
    <Input
      value={d[key] ?? ""}
      type={type}
      required={required}
      onChange={(e) => setD({ ...d, [key]: e.target.value })}
    />
  );
  const pick = (key: string, options: { value: string; label: string }[]) => (
    <Picker
      value={d[key] ?? ""}
      onChange={(v) => setD({ ...d, [key]: v })}
      options={options}
    />
  );
  const choices = (items: string[]) =>
    items.map((v) => ({ value: v, label: v }));
  const title = (
    {
      years: "academic year",
      classes: "class / program",
      sections: "section",
      streams: "stream",
      campuses: "campus",
      parents: "parent / guardian",
      components: "fee component",
      benefits: "discount or scholarship",
    } as Row
  )[kind];
  return (
    <FormDialog
      open={open}
      onClose={onClose}
      title={"Add " + title}
      busy={busy}
      submitLabel="Create"
      wide={["parents", "benefits", "sections"].includes(kind)}
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          const fields: Record<string, string[]> = {
            years: ["name", "startDate", "endDate", "status"],
            classes: ["name", "level", "department"],
            sections: [
              "name",
              "yearId",
              "classId",
              "campusId",
              "streamId",
              "capacity",
            ],
            streams: ["name"],
            campuses: ["name", "address"],
            parents: [
              "guardianName",
              "fatherName",
              "motherName",
              "mobile",
              "email",
              "address",
              "relationship",
              "occupation",
            ],
            components: ["name", "category", "active", "sortOrder"],
            benefits: [
              "name",
              "kind",
              "calculation",
              "value",
              "eligibility",
              "componentId",
              "recurring",
              "autoApply",
              "validUntil",
            ],
          };
          const body = Object.fromEntries(
            fields[kind]
              .filter((k) => d[k] !== undefined && d[k] !== "")
              .map((k) => [k, d[k]]),
          );
          await request("catalog/" + kind, { method: "POST", body });
          toast.success("Record created.");
          await reload();
          refresh();
          onClose();
        } catch (e) {
          toast.error((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="form-grid">
        {kind === "parents" ? (
          <>
            <Field label="Guardian name" required className="span-2">
              {input("guardianName", "text", true)}
            </Field>
            <Field label="Father name">{input("fatherName")}</Field>
            <Field label="Mother name">{input("motherName")}</Field>
            <Field label="Mobile number" required>
              {input("mobile", "tel", true)}
            </Field>
            <Field label="Email">{input("email", "email")}</Field>
            <Field label="Relationship">
              {pick("relationship", choices(["Father", "Mother", "Guardian"]))}
            </Field>
            <Field label="Occupation">{input("occupation")}</Field>
            <Field label="Address" className="span-2">
              {input("address")}
            </Field>
          </>
        ) : (
          <Field label="Name" required className="span-2">
            {input("name", "text", true)}
          </Field>
        )}
        {kind === "years" && (
          <>
            <Field label="Start date" required>
              {input("startDate", "date", true)}
            </Field>
            <Field label="End date" required>
              {input("endDate", "date", true)}
            </Field>
            <Field label="Status" className="span-2">
              {pick(
                "status",
                choices(["Draft", "Active", "Closed", "Archived"]),
              )}
            </Field>
          </>
        )}
        {kind === "classes" && (
          <>
            <Field label="Education level">
              {pick(
                "level",
                choices([
                  "Pre-Primary",
                  "School",
                  "PU College",
                  "Degree",
                  "Course",
                ]),
              )}
            </Field>
            <Field label="Department / course">{input("department")}</Field>
          </>
        )}
        {kind === "sections" && (
          <>
            <Field label="Class / program">
              {pick(
                "classId",
                boot.classes.map((r: Row) => ({ value: r.id, label: r.name })),
              )}
            </Field>
            <Field label="Campus">
              {pick(
                "campusId",
                boot.campuses.map((r: Row) => ({ value: r.id, label: r.name })),
              )}
            </Field>
            <Field label="Stream">
              {pick("streamId", [
                { value: "", label: "No stream" },
                ...boot.streams.map((r: Row) => ({
                  value: r.id,
                  label: r.name,
                })),
              ])}
            </Field>
            <Field label="Capacity">{input("capacity", "number", true)}</Field>
          </>
        )}
        {kind === "campuses" && (
          <Field label="Address" className="span-2">
            {input("address")}
          </Field>
        )}
        {kind === "components" && (
          <>
            <Field label="Category">{input("category", "text", true)}</Field>
            <Field label="Display order">
              {input("sortOrder", "number", true)}
            </Field>
            <Field label="Enabled">
              <Switch
                checked={d.active}
                onCheckedChange={(v) => setD({ ...d, active: v })}
              />
            </Field>
          </>
        )}
        {kind === "benefits" && (
          <>
            <Field label="Benefit type">
              {pick("kind", choices(["Discount", "Scholarship", "Concession"]))}
            </Field>
            <Field label="Calculation">
              {pick("calculation", choices(["Fixed", "Percentage"]))}
            </Field>
            <Field
              label={
                d.calculation === "Percentage" ? "Percentage (%)" : "Amount (₹)"
              }
            >
              {input("value", "text", true)}
            </Field>
            <Field label="Applies to component">
              {pick("componentId", [
                { value: "", label: "All components" },
                ...boot.components.map((r: Row) => ({
                  value: r.id,
                  label: r.name,
                })),
              ])}
            </Field>
            <Field label="Eligibility" className="span-2">
              {input("eligibility")}
            </Field>
            <Field label="Valid until">{input("validUntil", "date")}</Field>
            <Field label="Recurring">
              <Switch
                checked={!!d.recurring}
                onCheckedChange={(v) => setD({ ...d, recurring: v })}
              />
            </Field>
            <Field label="Automatic application">
              <Switch
                checked={!!d.autoApply}
                onCheckedChange={(v) => setD({ ...d, autoApply: v })}
              />
            </Field>
            <p className="form-note span-2">
              Approved benefits become permanent entries in the student’s
              ledger.
            </p>
          </>
        )}
      </div>
    </FormDialog>
  );
}
