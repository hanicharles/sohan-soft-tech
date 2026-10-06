"use client";
import { useEffect, useState } from "react";
import { Row, useApp } from "@/components/campus/context";
import {
  Button,
  Field,
  FormDialog,
  Input,
  Picker,
  money,
} from "@/components/campus/ui";
import { toast } from "sonner";
export function RolloverWizard({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { boot, scope, request, reload, refresh } = useApp(),
    [source, setSource] = useState(scope.year || ""),
    [target, setTarget] = useState(""),
    [mapping, setMapping] = useState<Record<string, string>>({}),
    [reason, setReason] = useState(""),
    [preview, setPreview] = useState<Row | null>(null),
    [run, setRun] = useState<Row | null>(null),
    [busy, setBusy] = useState(false),
    [sections, setSections] = useState<Row[]>([]),
    [existing, setExisting] = useState<Row[]>([]);
  useEffect(() => {
    if (open) {
      request("rollovers")
        .then((d) => {
          setSections(d.sections);
          setExisting(d.rows);
        })
        .catch((e) => toast.error(e.message));
    }
  }, [open, request]);
  const reset = () => {
    setPreview(null);
    setRun(null);
  };
  return (
    <FormDialog
      open={open}
      onClose={onClose}
      title="Academic year rollover"
      description="Review section mappings and opening dues. Approval freezes the source year; processing resumes in small, atomic student batches."
      busy={busy}
      submitLabel={
        run
          ? run.status === "Completed"
            ? "Done"
            : "Process next batch"
          : preview
            ? "Approve & freeze source year"
            : "Preview rollover"
      }
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          const body = {
            sourceYearId: source,
            targetYearId: target,
            mapping,
            reason,
          };
          if (run) {
            if (run.status === "Completed") {
              onClose();
              return;
            }
            const result = await request("rollovers/" + run.id + "/process", {
              method: "POST",
              body: {},
            });
            setRun(result);
            await reload();
            refresh();
          } else if (preview) {
            const result = await request("rollovers/start", {
              method: "POST",
              body: { ...body, fingerprint: preview.fingerprint },
            });
            setRun(result);
            await reload();
            refresh();
          } else
            setPreview(
              await request("rollovers/preview", { method: "POST", body }),
            );
        } catch (e) {
          toast.error((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      {!run && (
        <>
          {existing
            .filter((r) => r.status === "Running")
            .map((r) => (
              <Button
                key={r.id}
                type="button"
                variant="outline"
                onClick={() => setRun(r)}
              >
                Resume pending rollover · {r.source_year_id}
              </Button>
            ))}
          <Field label="Source academic year">
            <Picker
              value={source}
              onChange={(v) => {
                setSource(v);
                setMapping({});
                reset();
              }}
              options={[
                { value: "", label: "Choose year" },
                ...boot.years.map((y: Row) => ({ value: y.id, label: y.name })),
              ]}
            />
          </Field>
          <Field label="Destination academic year">
            <Picker
              value={target}
              onChange={(v) => {
                setTarget(v);
                setMapping({});
                reset();
              }}
              options={[
                { value: "", label: "Choose year" },
                ...boot.years
                  .filter((y: Row) => y.id !== source)
                  .map((y: Row) => ({ value: y.id, label: y.name })),
              ]}
            />
          </Field>
          {sections
            .filter((s) => s.academic_year_id === source)
            .map((s) => (
              <Field key={s.id} label={s.class_name + " · " + s.name}>
                <Picker
                  value={mapping[s.id] || ""}
                  onChange={(v) => {
                    setMapping({ ...mapping, [s.id]: v });
                    reset();
                  }}
                  options={[
                    { value: "", label: "Choose next grade / section" },
                    ...sections
                      .filter((s) => s.academic_year_id === target)
                      .map((s) => ({
                        value: s.id,
                        label: s.class_name + " · " + s.name,
                      })),
                  ]}
                />
              </Field>
            ))}
          <Field label="Supervisor approval reason">
            <Input
              required
              minLength={10}
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                reset();
              }}
            />
          </Field>
          {preview && (
            <div className="rounded-lg bg-blue-50 p-4">
              <p>{preview.students} students</p>
              <p>{money(preview.outstanding)} opening dues</p>
              <p>
                {preview.source} → {preview.target}
              </p>
              <p className="mt-2 text-sm">
                Existing transactions remain immutable. Pending payments/refunds
                must be resolved. Confirming locks new financial posting to the
                source year.
              </p>
            </div>
          )}
        </>
      )}
      {run && (
        <div role="status" className="space-y-2">
          <strong>{run.status}</strong>
          <p>Processed this batch: {run.promoted || 0}</p>
          <p>Carried this batch: {money(run.carriedPaise || 0)}</p>
          <p>
            {run.remaining === undefined
              ? "Ready to process the first batch."
              : `${run.remaining} students remaining.`}
          </p>
          <p className="text-sm text-slate-500">
            You can close this window and resume the same operation from
            Academics.
          </p>
        </div>
      )}
    </FormDialog>
  );
}
