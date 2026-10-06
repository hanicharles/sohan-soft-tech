import Papa from "papaparse";
import { z } from "zod";
import { realDate } from "./form-validation";
import { parseMoney } from "./money";
export const importFields: Record<
  string,
  { key: string; required?: boolean }[]
> = {
  students: [
    { key: "admissionNumber", required: true },
    { key: "name", required: true },
    { key: "className", required: true },
    { key: "sectionName" },
    { key: "streamName" },
    { key: "parentName", required: true },
    { key: "mobile", required: true },
    { key: "email" },
    { key: "dob" },
    { key: "gender" },
    { key: "rollNumber" },
  ],
  parents: [
    { key: "guardianName", required: true },
    { key: "fatherName" },
    { key: "motherName" },
    { key: "mobile", required: true },
    { key: "email" },
    { key: "relationship" },
    { key: "address" },
  ],
  structures: [
    { key: "name" },
    { key: "className", required: true },
    { key: "componentName", required: true },
    { key: "amount", required: true },
    { key: "dueDates", required: true },
  ],
  reconciliation: [
    { key: "transactionId", required: true },
    { key: "amount", required: true },
    { key: "date", required: true },
    { key: "notes" },
  ],
};
const normalize = (value: string) =>
  value
    .replace(/^\uFEFF/, "")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();
export function parseCsvPreflight(text: string) {
  const result = Papa.parse<string[]>(text, {
    header: false,
    skipEmptyLines: "greedy",
    dynamicTyping: false,
  });
  if (result.errors.length)
    throw new Error(
      "CSV row " +
        ((result.errors[0].row || 0) + 1) +
        ": " +
        result.errors[0].message,
    );
  const [rawHeaders, ...matrix] = result.data,
    headers = (rawHeaders || []).map((h) => h.trim().replace(/^\uFEFF/, ""));
  if (
    !headers.length ||
    headers.some((h) => !h) ||
    new Set(headers.map(normalize)).size !== headers.length
  )
    throw new Error("Use unique, non-empty column headings.");
  if (!matrix.length || matrix.length > 100)
    throw new Error("Choose 1–100 data rows per import.");
  if (matrix.some((row) => row.length !== headers.length))
    throw new Error(
      "Every CSV row must have the same number of columns as the header.",
    );
  return { headers, matrix };
}
export function initialMapping(kind: string, headers: string[]) {
  return Object.fromEntries(
    (importFields[kind] || []).map((field) => [
      field.key,
      headers.find((h) => normalize(h) === normalize(field.key)) || "",
    ]),
  );
}
export function preflightRows(
  kind: string,
  headers: string[],
  matrix: string[][],
  mapping: Record<string, string>,
) {
  const fields = importFields[kind] || [],
    seen = new Map<string, number>(),
    mapped = matrix.map((row) =>
      Object.fromEntries(
        fields.map((f) => [
          f.key,
          mapping[f.key]
            ? String(row[headers.indexOf(mapping[f.key])] || "").trim()
            : "",
        ]),
      ),
    );
  return mapped.map((row, index) => {
    const errors: string[] = [];
    for (const field of fields)
      if (field.required && !row[field.key])
        errors.push(field.key + " is required");
    if (row.mobile && !/^[6-9]\d{9}$/.test(row.mobile))
      errors.push("mobile must be a 10-digit Indian number");
    if (row.email && !z.string().email().safeParse(row.email).success)
      errors.push("email is invalid");
    for (const field of ["dob", "date"])
      if (row[field] && !realDate.safeParse(row[field]).success)
        errors.push(field + " must be a real YYYY-MM-DD date");
    if (
      row.gender &&
      !["Male", "Female", "Other", "Not specified"].includes(row.gender)
    )
      errors.push("gender must be Male, Female, Other or Not specified");
    if (row.amount) {
      try {
        if (parseMoney(row.amount) <= 0) errors.push("amount must be positive");
      } catch {
        errors.push("amount needs up to 2 decimal places");
      }
    }
    if (row.dueDates) {
      const dates = row.dueDates.split("|");
      if (
        dates.length > 12 ||
        dates.some((d) => !realDate.safeParse(d).success) ||
        new Set(dates).size !== dates.length
      )
        errors.push(
          "dueDates must contain unique YYYY-MM-DD dates separated by |",
        );
    }
    if (row.admissionNumber) {
      const admission = row.admissionNumber.toLowerCase();
      if (seen.has(admission))
        errors.push(
          "Duplicate admission_number; also on row " + seen.get(admission),
        );
      else seen.set(admission, index + 2);
    }
    return { row: index + 2, value: row, errors };
  });
}
