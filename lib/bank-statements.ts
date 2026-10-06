import Papa from "papaparse";
import { parseMoney } from "./money";
export interface BankRow {
  date: string;
  reference: string;
  amount: string;
  direction: "Credit" | "Debit";
  narration: string;
  admissionNumber: string;
  invoiceNumber: string;
}
export type BankColumn =
  | "date"
  | "reference"
  | "amount"
  | "direction"
  | "narration"
  | "admissionNumber"
  | "invoiceNumber";
export function bankDate(value: string) {
  const v = value.trim();
  let result = v;
  if (/^\d{8,14}(?:\[.*\])?$/.test(v))
    result = `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`;
  else if (/^\d{2}[/.-]\d{2}[/.-]\d{4}$/.test(v)) {
    const [d, m, y] = v.split(/[/.-]/);
    result = `${y}-${m}-${d}`;
  }
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(result) ||
    !Number.isFinite(Date.parse(result)) ||
    new Date(result).toISOString().slice(0, 10) !== result
  )
    throw new Error("Use a valid YYYY-MM-DD or DD/MM/YYYY date.");
  return result;
}
function amount(value: string) {
  const s = value.replace(/[₹,\s]/g, "").replace(/^INR/i, "");
  const negative = s.startsWith("-") || /^\(.*\)$/.test(s),
    clean = s.replace(/^[-+(]|\)$/g, "");
  parseMoney(clean);
  return { amount: clean, negative };
}
export function csvBankRows(
  text: string,
  mapping: Partial<Record<BankColumn, string>>,
) {
  if (text.length > 2000000)
    throw new Error("Use a statement smaller than 2 MB.");
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim(),
  });
  if (parsed.errors.length)
    throw new Error("CSV format error: " + parsed.errors[0].message);
  if (parsed.data.length > 100)
    throw new Error("Import at most 100 statement rows per batch.");
  const errors: { row: number; message: string }[] = [],
    rows: BankRow[] = [],
    seen = new Set<string>();
  parsed.data.forEach((r, index) => {
    try {
      const get = (k: BankColumn) => r[mapping[k] || ""]?.trim() || "",
        a = amount(get("amount")),
        reference = get("reference");
      if (!reference || reference.length > 100)
        throw new Error(
          "A bank reference of up to 100 characters is required.",
        );
      if (seen.has(reference))
        throw new Error("Duplicate reference in this statement.");
      seen.add(reference);
      rows.push({
        date: bankDate(get("date")),
        reference,
        amount: a.amount,
        direction:
          a.negative || /^(dr|debit|withdrawal)$/i.test(get("direction"))
            ? "Debit"
            : "Credit",
        narration: get("narration").slice(0, 500),
        admissionNumber: get("admissionNumber").slice(0, 100),
        invoiceNumber: get("invoiceNumber").slice(0, 100),
      });
    } catch (e) {
      errors.push({ row: index + 2, message: (e as Error).message });
    }
  });
  return { rows, errors, headers: parsed.meta.fields || [] };
}
export function ofxBankRows(text: string) {
  if (text.length > 2000000 || /<!DOCTYPE|<!ENTITY/i.test(text))
    throw new Error("OFX is too large or contains unsupported declarations.");
  if (!/<CURDEF>\s*INR(?:\s|<|$)/i.test(text))
    throw new Error("Only INR bank statements are supported.");
  const blocks = [...text.matchAll(/<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi)];
  if (!blocks.length)
    throw new Error("No OFX statement transactions were found.");
  if (blocks.length > 100)
    throw new Error("Import at most 100 transactions per batch.");
  const rows: BankRow[] = [],
    errors: { row: number; message: string }[] = [],
    seen = new Set<string>();
  blocks.forEach(([, body], index) => {
    try {
      const field = (name: string) =>
          new RegExp(`<${name}>([^<\\r\\n]*)`, "i").exec(body)?.[1]?.trim() ||
          "",
        a = amount(field("TRNAMT")),
        reference = field("FITID");
      if (!reference || reference.length > 100 || seen.has(reference))
        throw new Error("Missing, oversized or duplicate OFX FITID.");
      seen.add(reference);
      rows.push({
        date: bankDate(field("DTPOSTED")),
        reference,
        amount: a.amount,
        direction: a.negative ? "Debit" : "Credit",
        narration: (field("NAME") + " " + field("MEMO")).trim().slice(0, 500),
        admissionNumber: "",
        invoiceNumber: "",
      });
    } catch (e) {
      errors.push({ row: index + 1, message: (e as Error).message });
    }
  });
  return { rows, errors };
}
