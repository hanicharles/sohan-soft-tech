"use client";
import { useMemo, useState } from "react";
import { Row, useApp } from "@/components/campus/context";
import {
  Button,
  DataTable,
  Field,
  FormDialog,
  Input,
  Picker,
} from "@/components/campus/ui";
import { BankColumn, csvBankRows, ofxBankRows } from "@/lib/bank-statements";
import { toast } from "sonner";
const columns: { key: BankColumn; label: string; aliases: string[] }[] = [
  {
    key: "date",
    label: "Transaction date",
    aliases: ["date", "transaction date", "value date", "posted"],
  },
  {
    key: "reference",
    label: "UTR / bank reference",
    aliases: [
      "reference",
      "utr",
      "transaction_id",
      "transaction id",
      "ref no",
      "fitid",
    ],
  },
  {
    key: "amount",
    label: "Amount in INR",
    aliases: ["amount", "credit", "deposit", "amount_inr"],
  },
  {
    key: "direction",
    label: "Credit / debit",
    aliases: ["direction", "type", "dr/cr"],
  },
  {
    key: "narration",
    label: "Narration",
    aliases: ["narration", "description", "memo", "particulars"],
  },
  {
    key: "admissionNumber",
    label: "Admission number (optional)",
    aliases: ["admission_number", "admission number", "admission"],
  },
  {
    key: "invoiceNumber",
    label: "Invoice number (optional)",
    aliases: ["invoice_number", "invoice number", "invoice"],
  },
];
export function BankImportDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { request, scope, refresh } = useApp(),
    [text, setText] = useState(""),
    [format, setFormat] = useState("csv"),
    [headers, setHeaders] = useState<string[]>([]),
    [mapping, setMapping] = useState<Partial<Record<BankColumn, string>>>({}),
    [preview, setPreview] = useState<Row | null>(null),
    [post, setPost] = useState(false),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [done, setDone] = useState<Row | null>(null);
  const parsed = useMemo(() => {
    if (!text) return { rows: [], errors: [] };
    try {
      return format === "ofx" ? ofxBankRows(text) : csvBankRows(text, mapping);
    } catch (e) {
      return { rows: [], errors: [{ row: 0, message: (e as Error).message }] };
    }
  }, [text, format, mapping]);
  const close = () => {
    onClose();
    setText("");
    setPreview(null);
    setDone(null);
    setReason("");
    setPost(false);
  };
  return (
    <FormDialog
      open={open}
      onClose={close}
      title="Import bank statement"
      description="Upload up to 100 INR transactions. Exact references match existing payments; unique invoice/admission matches can be posted after your approval."
      busy={busy}
      submitLabel={
        done
          ? "Done"
          : preview
            ? "Confirm selected import"
            : "Check against database"
      }
      onSubmit={async (e) => {
        e.preventDefault();
        if (done) {
          close();
          return;
        }
        if (!scope.year) {
          toast.error("Select the academic year first.");
          return;
        }
        if (parsed.errors.length || !parsed.rows.length) {
          toast.error("Correct the pre-flight errors before continuing.");
          return;
        }
        setBusy(true);
        try {
          if (preview) {
            if (reason.trim().length < 10)
              throw new Error(
                "Enter an approval reason of at least 10 characters.",
              );
            const result = await request("reconciliation/bank-commit", {
              method: "POST",
              body: { batchId: preview.id, postMatchedDues: post, reason },
            });
            setDone(result);
            refresh();
          } else
            setPreview(
              await request("reconciliation/bank-preview", {
                method: "POST",
                body: { yearId: scope.year, rows: parsed.rows },
              }),
            );
        } catch (e) {
          toast.error((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      {done ? (
        <>
          <p role="status">
            Import completed. {done.failed} rows need review. Each posted
            payment, receipt, ledger and bank match committed atomically.
          </p>
          <DataTable
            rows={done.rows.map((r: Row, index: number) => ({
              ...r,
              id: index,
            }))}
            columns={[
              { key: "reference", label: "Reference" },
              { key: "status", label: "Result" },
              { key: "message", label: "Details" },
            ]}
          />
        </>
      ) : preview ? (
        <>
          <DataTable
            rows={preview.rows.map((m: Row, index: number) => ({
              ...m,
              id: index,
              reference: m.row.reference,
              amount: m.row.amount,
              date: m.row.date,
            }))}
            columns={[
              { key: "reference", label: "Bank reference" },
              { key: "amount", label: "INR" },
              { key: "studentName", label: "Student" },
              { key: "status", label: "Match" },
              { key: "reason", label: "Evidence" },
            ]}
          />
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={post}
              onChange={(e) => setPost(e.target.checked)}
            />
            <span>
              Create bank-transfer payments for rows marked Ready. Existing
              payments are only reconciled; unmatched rows remain for review.
            </span>
          </label>
          <Field label="Accountant approval / backdated entry reason">
            <Input
              required
              minLength={10}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
          <p className="text-sm text-slate-500">
            Each row is processed independently and reports its result. Retries
            cannot post the same bank reference twice.
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={() => setPreview(null)}
          >
            Back to mapping
          </Button>
        </>
      ) : (
        <>
          <Field label="CSV or OFX statement">
            <Input
              type="file"
              accept=".csv,.ofx,.qfx"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                if (file.size > 2000000) {
                  toast.error("Use a file under 2 MB.");
                  return;
                }
                const content = await file.text(),
                  kind = /\.(ofx|qfx)$/i.test(file.name) ? "ofx" : "csv";
                setFormat(kind);
                setText(content);
                setPreview(null);
                if (kind === "csv") {
                  try {
                    const info = csvBankRows(content, {});
                    setHeaders(info.headers);
                    setMapping(
                      Object.fromEntries(
                        columns.map((c) => [
                          c.key,
                          info.headers.find((h) =>
                            c.aliases.includes(h.toLowerCase()),
                          ) || "",
                        ]),
                      ),
                    );
                  } catch (e) {
                    toast.error((e as Error).message);
                  }
                }
              }}
            />
          </Field>
          {text && format === "csv" && (
            <div className="grid gap-3 sm:grid-cols-2">
              {columns.map((c) => (
                <Field key={c.key} label={c.label}>
                  <Picker
                    value={mapping[c.key] || ""}
                    onChange={(v) => setMapping({ ...mapping, [c.key]: v })}
                    options={[
                      { value: "", label: "Not mapped" },
                      ...headers.map((h) => ({ value: h, label: h })),
                    ]}
                  />
                </Field>
              ))}
            </div>
          )}
          {parsed.errors.length > 0 && (
            <div
              role="alert"
              className="rounded-lg bg-red-50 p-3 text-sm text-red-800"
            >
              {parsed.errors.slice(0, 15).map((e, i) => (
                <p key={i}>
                  Row {e.row}: {e.message}
                </p>
              ))}
            </div>
          )}
          {parsed.rows.length > 0 && (
            <DataTable
              rows={parsed.rows.map((r, index) => ({ ...r, id: index }))}
              columns={[
                { key: "date", label: "Date" },
                { key: "reference", label: "Reference" },
                { key: "amount", label: "INR" },
                { key: "direction", label: "Direction" },
                { key: "admissionNumber", label: "Admission number" },
              ]}
            />
          )}
        </>
      )}
    </FormDialog>
  );
}
