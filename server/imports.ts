import { z } from "zod";
import { parseMoney } from "../lib/money";
import { parseCsv, parseXlsx } from "../lib/tabular";
import { createStudent, emailField, mobileField } from "./catalog";
import { batch, insert, one, Row, stamps, uuid } from "./db";
import { Actor, ApiError, audit, own, permit } from "./security";
export async function importRows(actor: Actor, input: Row) {
  permit(
    actor,
    input.kind === "reconciliation"
      ? "payments.manage"
      : ["students", "parents"].includes(input.kind)
        ? "students.manage"
        : "fees.manage",
  );
  let rows: Row[];
  if (Array.isArray(input.rows)) rows = input.rows;
  else {
    const matrix =
      input.format === "xlsx"
        ? parseXlsx(
            Uint8Array.from(atob(input.content), (c) => c.charCodeAt(0)),
          )
        : parseCsv(String(input.content || ""));
    if (!matrix.length)
      throw new ApiError(422, "EMPTY_FILE", "This file has no rows.");
    const headers = matrix[0].map((h) => h.trim().replace(/^\uFEFF/, ""));
    rows = matrix
      .slice(1)
      .map((row) =>
        Object.fromEntries(headers.map((key, j) => [key, row[j] || ""])),
      );
  }
  if (!rows.length || rows.length > 100)
    throw new ApiError(
      422,
      "IMPORT_SIZE",
      "Import between 1 and 100 rows per batch.",
    );
  const errors: { row: number; message: string }[] = [],
    statements: D1PreparedStatement[] = [],
    preview: Row[] = [],
    seen = new Set<string>(),
    batchId = uuid();
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      if (input.kind === "students") {
        const section = await one(
          "SELECT sec.id FROM sections sec JOIN classes c ON c.id=sec.class_id LEFT JOIN streams st ON st.id=sec.stream_id WHERE sec.institution_id=? AND sec.academic_year_id=? AND c.name=? AND sec.name=? AND COALESCE(st.name,'')=?",
          [
            actor.institutionId,
            input.yearId,
            row.className,
            row.sectionName || "A",
            row.streamName || "",
          ],
        );
        if (!section)
          throw new Error(
            "Class, section or stream does not exist in this academic year.",
          );
        if (seen.has(row.admissionNumber))
          throw new Error("Duplicate admission number in the file.");
        seen.add(row.admissionNumber);
        const result = await createStudent(
          actor,
          {
            name: row.name,
            admissionNumber: row.admissionNumber,
            yearId: input.yearId,
            sectionId: section.id,
            parentName: row.parentName,
            mobile: row.mobile,
            email: row.email || undefined,
            dob: row.dob || undefined,
            gender: row.gender || "Not specified",
            rollNumber: row.rollNumber,
          },
          false,
        );
        statements.push(...result.statements);
        preview.push({ ...row, id: result.id });
      } else if (input.kind === "parents") {
        const d = z
          .object({
            guardianName: z.string().min(1).max(160),
            mobile: mobileField,
            email: emailField,
          })
          .parse(row);
        const id = uuid();
        statements.push(
          insert("parents", {
            id,
            institution_id: actor.institutionId,
            ...stamps(actor.userId),
            guardian_name: d.guardianName,
            mobile: d.mobile,
            email: d.email || null,
            father_name: row.fatherName || "",
            mother_name: row.motherName || "",
            relationship: row.relationship || "Guardian",
            address: row.address || "",
          }),
        );
        preview.push(row);
      } else if (input.kind === "structures") {
        const cls = await one(
            "SELECT id FROM classes WHERE institution_id=? AND name=?",
            [actor.institutionId, row.className],
          ),
          component = await one(
            "SELECT id FROM fee_components WHERE institution_id=? AND name=? AND active=1",
            [actor.institutionId, row.componentName],
          );
        await own(actor, "academic_years", input.yearId);
        if (!cls || !component)
          throw new Error("Class or fee component does not exist.");
        const amount = parseMoney(row.amount),
          dates = String(row.dueDates || "").split("|");
        if (dates.some((d) => !/^\d{4}-\d{2}-\d{2}$/.test(d)))
          throw new Error("Use YYYY-MM-DD dates separated by |.");
        const id = uuid();
        statements.push(
          insert("fee_structures", {
            id,
            institution_id: actor.institutionId,
            ...stamps(actor.userId),
            academic_year_id: input.yearId,
            class_id: cls.id,
            name: row.name || row.className + " fees",
            frequency: "Custom",
            schedule: JSON.stringify(dates),
          }),
          insert("fee_structure_items", {
            id: uuid(),
            institution_id: actor.institutionId,
            structure_id: id,
            component_id: component.id,
            amount_paise: amount,
          }),
        );
        preview.push(row);
      } else if (input.kind === "reconciliation") {
        await own(actor, "academic_years", input.yearId);
        if (!row.transactionId || !/^\d{4}-\d{2}-\d{2}$/.test(row.date))
          throw new Error("Transaction ID and YYYY-MM-DD date are required.");
        const amount = parseMoney(row.amount),
          existing = await one(
            "SELECT id FROM reconciliation_records WHERE institution_id=? AND transaction_id=?",
            [actor.institutionId, row.transactionId],
          ),
          payment = await one(
            "SELECT * FROM payments WHERE institution_id=? AND academic_year_id=? AND (reference=? OR gateway_transaction_id=?) AND status IN ('Successful','Partially Refunded','Refunded')",
            [
              actor.institutionId,
              input.yearId,
              row.transactionId,
              row.transactionId,
            ],
          );
        const status =
          existing || seen.has(row.transactionId)
            ? "Duplicate"
            : payment
              ? payment.amount_paise === amount
                ? "Matched"
                : "Partially Matched"
              : "Unmatched";
        seen.add(row.transactionId);
        const id = uuid();
        statements.push(
          insert("reconciliation_records", {
            id,
            institution_id: actor.institutionId,
            ...stamps(actor.userId),
            academic_year_id: input.yearId,
            transaction_id: row.transactionId,
            amount_paise: amount,
            transaction_date: row.date,
            payment_id: status === "Duplicate" ? null : payment?.id || null,
            student_id: payment?.student_id || null,
            status,
            notes: row.notes || "",
            import_batch: batchId,
          }),
        );
        preview.push({ ...row, status });
      } else throw new Error("Select a supported import type.");
    } catch (error) {
      errors.push({
        row: i + 2,
        message:
          error instanceof z.ZodError
            ? error.issues
                .map((i) => i.path.join(".") + ": " + i.message)
                .join("; ")
            : error instanceof Error
              ? error.message
              : "Invalid row",
      });
    }
  }
  if (input.commit) {
    if (errors.length)
      throw new ApiError(
        422,
        "IMPORT_VALIDATION_FAILED",
        "Correct all row errors before importing. No records have been saved.",
      );
    statements.push(
      audit(actor, "Imported " + input.kind, input.kind, batchId, null, {
        count: rows.length,
      }),
    );
    await batch(statements);
  }
  return {
    rows: preview,
    errors,
    total: rows.length,
    valid: rows.length - errors.length,
    committed: !!input.commit,
  };
}
export const templates: Record<string, string[][]> = {
  students: [
    [
      "name",
      "admissionNumber",
      "className",
      "sectionName",
      "streamName",
      "parentName",
      "mobile",
      "email",
      "dob",
      "gender",
      "rollNumber",
    ],
    [
      "Rahul Kumar",
      "CSA/26/0101",
      "10th",
      "A",
      "",
      "Ramesh Kumar",
      "9876543210",
      "parent@example.com",
      "2011-05-20",
      "Male",
      "12",
    ],
  ],
  parents: [
    [
      "guardianName",
      "fatherName",
      "motherName",
      "mobile",
      "email",
      "relationship",
      "address",
    ],
    [
      "Ramesh Kumar",
      "Ramesh Kumar",
      "Lakshmi Kumar",
      "9876543210",
      "parent@example.com",
      "Father",
      "Bengaluru",
    ],
  ],
  structures: [
    ["name", "className", "componentName", "amount", "dueDates"],
    [
      "10th tuition 2026-27",
      "10th",
      "Tuition Fee",
      "40000",
      "2026-06-10|2026-09-10|2026-12-10",
    ],
  ],
  reconciliation: [
    ["transactionId", "amount", "date", "notes"],
    ["BANKREF001", "10000", "2026-10-03", "Bank settlement"],
  ],
};
