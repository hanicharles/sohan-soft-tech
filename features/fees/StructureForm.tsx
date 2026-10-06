"use client";
import { Row, useApp } from "@/components/campus/context";
import { DraftNotice } from "@/components/campus/DraftNotice";
import {
  Button,
  Field,
  FormDialog,
  Input,
  Picker,
} from "@/components/campus/ui";
import { useLocalDraft } from "@/hooks/use-local-draft";
import { fieldErrors, structureFormSchema } from "@/lib/form-validation";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
export function StructureForm({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { boot, scope, request, refresh, institutionId } = useApp(),
    [busy, setBusy] = useState(false),
    [name, setName] = useState(""),
    [cls, setClass] = useState(""),
    [stream, setStream] = useState(""),
    [section, setSection] = useState(""),
    [frequency, setFrequency] = useState("Quarterly"),
    [items, setItems] = useState([{ componentId: "", amount: "" }]),
    [dates, setDates] = useState(["2026-06-10", "2026-09-10", "2026-12-10"]);
  const [submitted, setSubmitted] = useState(false);
  const form = { name, cls, stream, section, frequency, items, dates };
  const draft = useLocalDraft<typeof form>({
    storageKey: [
      boot.user.id || boot.user.email,
      institutionId,
      scope.year,
      "fee-structure",
    ].join(":"),
    open,
    value: form,
    restore: (v) => {
      if (
        typeof v.name !== "string" ||
        !Array.isArray(v.items) ||
        !Array.isArray(v.dates) ||
        v.items.some(
          (i) =>
            !i ||
            typeof i.componentId !== "string" ||
            typeof i.amount !== "string",
        ) ||
        v.dates.some((d) => typeof d !== "string")
      )
        return;
      setName(v.name);
      setClass(v.cls || "");
      setStream(v.stream || "");
      setSection(v.section || "");
      setFrequency(v.frequency || "Quarterly");
      setItems(v.items.slice(0, 30));
      setDates(v.dates.slice(0, 12));
    },
    reset: () => {
      setSubmitted(false);
      setName("");
      setClass(scope.class || boot.classes[0]?.id || "");
      setStream("");
      setSection("");
      setItems([
        {
          componentId: boot.components.find((c: Row) => c.active)?.id || "",
          amount: "",
        },
      ]);
      const year = boot.years.find((y: Row) => y.id === scope.year);
      const start = year?.start_date || "2026-06-01";
      setDates([start.slice(0, 8) + "10", shift(start, 3), shift(start, 6)]);
      setFrequency("Quarterly");
    },
  });
  const errors = fieldErrors(structureFormSchema, form);
  const year = boot.years.find((y: Row) => y.id === scope.year);
  if (
    year &&
    dates.some((d) => d && (d < year.start_date || d > year.end_date))
  )
    errors.dates = "Installments must be within the selected academic year";
  const shift = (start: string, months: number) => {
    const d = new Date(start + "T12:00:00Z");
    d.setUTCMonth(d.getUTCMonth() + months);
    d.setUTCDate(10);
    return d.toISOString().slice(0, 10);
  };
  const changeFrequency = (f: string) => {
    setFrequency(f);
    const start =
      boot.years.find((y: Row) => y.id === scope.year)?.start_date ||
      "2026-06-01";
    if (f === "Monthly")
      setDates(Array.from({ length: 12 }, (_, i) => shift(start, i)));
    else if (f === "Quarterly") setDates([0, 3, 6].map((i) => shift(start, i)));
    else if (f === "Half-yearly") setDates([0, 6].map((i) => shift(start, i)));
    else if (f === "Annual") setDates([shift(start, 0)]);
  };
  return (
    <FormDialog
      open={open}
      onClose={onClose}
      title="Create fee structure"
      description="Fees are calculated on the server and assigned to matching students."
      wide
      busy={busy}
      submitLabel="Create fee structure"
      onSubmit={async (e) => {
        e.preventDefault();
        setSubmitted(true);
        if (Object.keys(errors).length) {
          toast.error("Check the highlighted fee structure fields.");
          return;
        }
        setBusy(true);
        try {
          await request("catalog/structures", {
            method: "POST",
            body: {
              name,
              yearId: scope.year,
              classId: cls,
              streamId: stream || undefined,
              sectionId: section || undefined,
              frequency,
              dates,
              items,
            },
          });
          toast.success("Fee structure created.");
          draft.clear();
          refresh();
          onClose();
        } catch (e) {
          toast.error((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <DraftNotice status={draft.status} onDiscard={draft.discard} />
      {(submitted || name || items.some((i) => i.amount)) &&
        Object.keys(errors).length > 0 && (
          <div
            role="alert"
            className="rounded-lg bg-red-50 p-3 text-sm text-red-700"
          >
            {Object.entries(errors).map(([key, message]) => (
              <p key={key}>
                {key.startsWith("items.")
                  ? "Component " + (Number(key.split(".")[1]) + 1)
                  : key.startsWith("dates")
                    ? "Schedule"
                    : key}
                : {message}
              </p>
            ))}
          </div>
        )}
      <div className="form-grid">
        <Field
          label="Structure name"
          error={submitted || name ? errors.name : undefined}
          className="span-2"
          required
        >
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="10th annual fees · 2026–27"
          />
        </Field>
        <Field label="Class / program">
          <Picker
            value={cls}
            onChange={(v) => {
              setClass(v);
              setSection("");
            }}
            options={boot.classes.map((c: Row) => ({
              value: c.id,
              label: c.name,
            }))}
          />
        </Field>
        <Field label="Stream">
          <Picker
            value={stream}
            onChange={setStream}
            options={[
              { value: "", label: "All streams" },
              ...boot.streams.map((s: Row) => ({ value: s.id, label: s.name })),
            ]}
          />
        </Field>
        <Field label="Section">
          <Picker
            value={section}
            onChange={setSection}
            options={[
              { value: "", label: "All sections" },
              ...boot.sections
                .filter(
                  (s: Row) =>
                    s.class_id === cls && s.academic_year_id === scope.year,
                )
                .map((s: Row) => ({
                  value: s.id,
                  label: s.name + (s.stream_name ? " · " + s.stream_name : ""),
                })),
            ]}
          />
        </Field>
        <Field label="Installment plan">
          <Picker
            value={frequency}
            onChange={changeFrequency}
            options={[
              "Monthly",
              "Quarterly",
              "Half-yearly",
              "Annual",
              "Custom",
            ].map((v) => ({ value: v, label: v }))}
          />
        </Field>
      </div>
      <div className="form-section-heading">
        <h3>Fee components</h3>
        <span>Amount in INR</span>
      </div>
      {items.map((item, i) => (
        <div className="fee-item-row" key={i}>
          <Picker
            value={item.componentId}
            onChange={(v) =>
              setItems(
                items.map((r, j) => (j === i ? { ...r, componentId: v } : r)),
              )
            }
            options={[
              { value: "", label: "Select fee component" },
              ...boot.components
                .filter((c: Row) => c.active)
                .map((c: Row) => ({ value: c.id, label: c.name })),
            ]}
          />
          <Input
            placeholder="Amount (₹)"
            value={item.amount}
            onChange={(e) =>
              setItems(
                items.map((r, j) =>
                  j === i ? { ...r, amount: e.target.value } : r,
                ),
              )
            }
            inputMode="decimal"
            aria-label="Fee component amount"
            required
          />
          <Button
            variant="ghost"
            type="button"
            size="icon"
            aria-label="Remove component"
            disabled={items.length === 1}
            onClick={() => setItems(items.filter((_, j) => j !== i))}
          >
            <Trash2 size={15} />
          </Button>
        </div>
      ))}
      <Button
        variant="outline"
        type="button"
        onClick={() => setItems([...items, { componentId: "", amount: "" }])}
      >
        <Plus size={15} />
        Add component
      </Button>
      <div className="form-section-heading">
        <h3>Installment due dates</h3>
        <span>Fees split evenly to the nearest paise</span>
      </div>
      <div className="installment-date-grid">
        {dates.map((date, i) => (
          <Field key={i} label={"Installment " + (i + 1)}>
            <div className="date-remove">
              <Input
                required
                type="date"
                value={date}
                onChange={(e) =>
                  setDates(dates.map((r, j) => (j === i ? e.target.value : r)))
                }
              />
              {frequency === "Custom" && dates.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Remove installment"
                  onClick={() => setDates(dates.filter((_, j) => j !== i))}
                >
                  <Trash2 size={14} />
                </Button>
              )}
            </div>
          </Field>
        ))}
      </div>
      {frequency === "Custom" && dates.length < 12 && (
        <Button
          variant="outline"
          type="button"
          onClick={() => setDates([...dates, dates[dates.length - 1]])}
        >
          <Plus size={15} />
          Add installment
        </Button>
      )}
    </FormDialog>
  );
}
