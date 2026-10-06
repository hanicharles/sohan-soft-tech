"use client";
import {
  importFields,
  initialMapping,
  parseCsvPreflight,
  preflightRows,
} from "@/lib/import-preflight";
import { parseXlsx } from "@/lib/tabular";
import { Download, FileSpreadsheet } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Row, useApp } from "./context";
import {
  Button,
  DataTable,
  Field,
  FormDialog,
  Input,
  Picker,
  Status,
} from "./ui";
export function ImportDialog({
  kind,
  open,
  onClose,
}: {
  kind: string;
  open: boolean;
  onClose: () => void;
}) {
  const { request, scope, refresh, institutionId } = useApp(),
    [file, setFile] = useState<File | null>(null),
    [source, setSource] = useState<{
      headers: string[];
      matrix: string[][];
    } | null>(null),
    [mapping, setMapping] = useState<Record<string, string>>({}),
    [preview, setPreview] = useState<Row | null>(null),
    [payload, setPayload] = useState<Row | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    generation = useRef(0);
  const rows = useMemo(
      () =>
        source
          ? preflightRows(kind, source.headers, source.matrix, mapping)
          : [],
      [source, mapping, kind],
    ),
    invalid = rows.filter((r) => r.errors.length),
    fields = importFields[kind] || [];
  const close = () => {
    generation.current++;
    setFile(null);
    setSource(null);
    setPreview(null);
    setPayload(null);
    setError("");
    onClose();
  };
  const template = async (format: string) => {
    try {
      const response = await fetch(`/api/template/${kind}?format=${format}`, {
        headers: { "X-Institution-ID": institutionId },
      });
      if (!response.ok) throw new Error("Template could not be downloaded");
      const url = URL.createObjectURL(await response.blob()),
        a = document.createElement("a");
      a.href = url;
      a.download = kind + "-template." + format;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const choose = async (selected: File | null) => {
    const current = ++generation.current;
    setFile(selected);
    setSource(null);
    setPreview(null);
    setPayload(null);
    setError("");
    if (!selected) return;
    setBusy(true);
    try {
      if (selected.size > 2000000) throw new Error("Choose a file under 2 MB.");
      let parsed: { headers: string[]; matrix: string[][] };
      if (selected.name.toLowerCase().endsWith(".xlsx")) {
        const data = parseXlsx(new Uint8Array(await selected.arrayBuffer()));
        if (data.length < 2 || data.length > 101)
          throw new Error("Choose 1–100 data rows.");
        parsed = {
          headers: data[0].map(String),
          matrix: data.slice(1).map((row) => row.map(String)),
        };
        if (new Set(parsed.headers).size !== parsed.headers.length)
          throw new Error("Column headings must be unique.");
      } else parsed = parseCsvPreflight(await selected.text());
      if (current === generation.current) {
        setSource(parsed);
        setMapping(initialMapping(kind, parsed.headers));
      }
    } catch (e) {
      if (current === generation.current) setError((e as Error).message);
    } finally {
      if (current === generation.current) setBusy(false);
    }
  };
  return (
    <FormDialog
      open={open}
      onClose={close}
      title={`Import ${kind}`}
      description="Map and check up to 100 rows on this device, then validate against the institution database. All rows import together."
      wide
    >
      <div className="import-templates">
        <Button variant="outline" onClick={() => template("csv")}>
          <Download size={16} />
          CSV template
        </Button>
        <Button variant="outline" onClick={() => template("xlsx")}>
          <Download size={16} />
          Excel template
        </Button>
      </div>
      <label className="upload-zone">
        <FileSpreadsheet size={26} />
        <strong>{file?.name || "Choose an Excel or CSV file"}</strong>
        <span>CSV / XLSX · 2 MB maximum</span>
        <Input
          type="file"
          accept=".csv,.xlsx"
          aria-label="Import file"
          disabled={busy}
          onChange={(e) => choose(e.target.files?.[0] || null)}
        />
      </label>
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-700">
          {error}
        </p>
      )}
      {source && !preview && (
        <>
          <h3 className="font-semibold">Map columns</h3>
          <div className="form-grid">
            {fields.map((field) => (
              <Field
                key={field.key}
                label={field.key}
                required={field.required}
              >
                <Picker
                  placeholder={`Map ${field.key}`}
                  value={mapping[field.key] || ""}
                  onChange={(v) => {
                    setMapping({ ...mapping, [field.key]: v });
                    setPreview(null);
                    setPayload(null);
                  }}
                  options={[
                    { value: "", label: "Not mapped" },
                    ...source.headers.map((h) => ({ value: h, label: h })),
                  ]}
                />
              </Field>
            ))}
          </div>
          <div className="my-3 text-sm" role="status">
            {rows.length - invalid.length} ready · {invalid.length} rows need
            correction. Existing database duplicates are checked next.
          </div>
          <DataTable
            virtualized
            rows={rows.map((r) => ({
              id: String(r.row),
              ...r.value,
              row: r.row,
              issues: r.errors.join("; "),
            }))}
            columns={[
              { key: "row", label: "CSV row" },
              ...fields
                .filter((f) => f.required)
                .slice(0, 4)
                .map((f) => ({ key: f.key, label: f.key })),
              {
                key: "issues",
                label: "Validation",
                render: (r) =>
                  r.issues ? (
                    <span className="text-red-600">{r.issues}</span>
                  ) : (
                    <Status value="Ready" />
                  ),
              },
            ]}
          />
          <Button
            className="mt-4 w-full"
            disabled={busy || !!invalid.length || !rows.length}
            onClick={async () => {
              setBusy(true);
              try {
                const body = {
                  kind,
                  yearId: scope.year,
                  rows: rows.map((r) => r.value),
                  commit: false,
                };
                const result = await request("import", {
                  method: "POST",
                  body,
                });
                setPayload(body);
                setPreview(result);
              } catch (e) {
                toast.error((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy
              ? "Checking database…"
              : "Validate against institution database"}
          </Button>
        </>
      )}
      {preview && (
        <>
          <div className="import-result">
            <span>{preview.valid} valid rows</span>
            <strong>{preview.errors.length} errors</strong>
          </div>
          {preview.errors.length > 0 ? (
            <div className="import-errors" role="alert">
              {preview.errors.map((e: Row, i: number) => (
                <p key={i}>
                  <b>Row {e.row}:</b> {e.message}
                </p>
              ))}
            </div>
          ) : (
            <p className="text-sm text-emerald-700">
              All rows passed server validation. Ready to import into the
              selected academic year.
            </p>
          )}
          <div className="import-footer">
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setPreview(null)}
            >
              Back to mapping
            </Button>
            <Button
              disabled={busy || !!preview.errors.length}
              onClick={async () => {
                setBusy(true);
                try {
                  await request("import", {
                    method: "POST",
                    body: { ...payload, commit: true },
                  });
                  toast.success(`${preview.total} records imported.`);
                  refresh();
                  close();
                } catch (e) {
                  toast.error((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Importing…" : `Import ${preview.valid} rows`}
            </Button>
          </div>
        </>
      )}
    </FormDialog>
  );
}
