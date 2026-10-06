import { z } from "zod";
import { bankDate, BankRow } from "../lib/bank-statements";
import { parseMoney } from "../lib/money";
import { all, batch, insert, now, one, stamps, today, uuid } from "./db";
import { collectPayment, planPayment } from "./payments";
import { Actor, ApiError, audit, own, permit, sha256 } from "./security";

const rowSchema = z.object({
  date: z.string().transform(bankDate),
  reference: z.string().trim().min(1).max(100),
  amount: z.string().refine((v) => {
    try {
      return parseMoney(v) > 0;
    } catch {
      return false;
    }
  }, "Use a positive monetary amount"),
  direction: z.enum(["Credit", "Debit"]),
  narration: z.string().max(500).default(""),
  admissionNumber: z.string().max(100).default(""),
  invoiceNumber: z.string().max(100).default(""),
});
type Match = {
  row: BankRow;
  status:
    | "Matched"
    | "Ready"
    | "Unmatched"
    | "Duplicate"
    | "Debit"
    | "Under Review";
  studentId?: string;
  studentName?: string;
  paymentId?: string;
  invoiceId?: string;
  reason: string;
};
async function matchRow(
  actor: Actor,
  yearId: string,
  row: BankRow,
): Promise<Match> {
  if (row.direction === "Debit")
    return {
      row,
      status: "Debit",
      reason: "Withdrawal: excluded from fee receipts.",
    };
  if (
    await one(
      "SELECT id FROM bank_posted_rows WHERE institution_id=? AND transaction_id=?",
      [actor.institutionId, row.reference],
    )
  )
    return {
      row,
      status: "Duplicate",
      reason: "This bank reference was already imported.",
    };
  const amount = parseMoney(row.amount),
    payments = await all<{
      id: string;
      student_id: string;
      name: string;
      amount_paise: number;
      paid_at: string;
      academic_year_id: string;
    }>(
      "SELECT p.id,p.student_id,s.name,p.amount_paise,p.paid_at,p.academic_year_id FROM payments p JOIN students s ON s.id=p.student_id AND s.institution_id=p.institution_id WHERE p.institution_id=? AND (p.reference=? OR p.gateway_transaction_id=?) AND p.status IN ('Successful','Partially Refunded','Refunded') LIMIT 3",
      [actor.institutionId, row.reference, row.reference],
    );
  if (payments.length) {
    const payment = payments[0];
    if (
      payments.length !== 1 ||
      payment.amount_paise !== amount ||
      payment.academic_year_id !== yearId ||
      Math.abs(Date.parse(payment.paid_at) - Date.parse(row.date)) >
        8 * 86400000
    )
      return {
        row,
        status: "Under Review",
        reason:
          "The reference exists with a different amount, date, academic year or multiple payments.",
      };
    if (
      await one(
        "SELECT id FROM bank_posted_rows WHERE institution_id=? AND payment_id=?",
        [actor.institutionId, payment.id],
      )
    )
      return {
        row,
        status: "Under Review",
        reason: "This payment is already matched to another bank reference.",
      };
    return {
      row,
      status: "Matched",
      paymentId: payment.id,
      studentId: payment.student_id,
      studentName: payment.name,
      reason: "Exact bank reference, amount and compatible date.",
    };
  }
  let candidates: { id: string; name: string; invoice_id?: string }[] = [];
  if (row.invoiceNumber)
    candidates = await all(
      "SELECT s.id,s.name,i.id invoice_id FROM invoices i JOIN students s ON s.id=i.student_id AND s.institution_id=i.institution_id WHERE i.institution_id=? AND i.academic_year_id=? AND i.number=?",
      [actor.institutionId, yearId, row.invoiceNumber],
    );
  else if (row.admissionNumber)
    candidates = await all(
      "SELECT s.id,s.name FROM students s JOIN enrollments e ON e.student_id=s.id AND e.institution_id=s.institution_id WHERE s.institution_id=? AND e.academic_year_id=? AND s.admission_number=?",
      [actor.institutionId, yearId, row.admissionNumber],
    );
  else if (row.narration)
    candidates = await all(
      "SELECT s.id,s.name FROM students s JOIN enrollments e ON e.student_id=s.id AND e.institution_id=s.institution_id WHERE s.institution_id=? AND e.academic_year_id=? AND instr(' '||upper(?)||' ',' '||upper(s.admission_number)||' ')>0 LIMIT 2",
      [actor.institutionId, yearId, row.narration],
    );
  if (candidates.length !== 1)
    return {
      row,
      status: candidates.length ? "Under Review" : "Unmatched",
      reason:
        "No unique invoice/admission number match. Amount-only matching is not used.",
    };
  const student = candidates[0];
  try {
    const allocations = await allocationsFor(
      actor,
      student.id,
      yearId,
      amount,
      student.invoice_id,
    );
    await planPayment(actor, student.id, yearId, amount, allocations);
    return {
      row,
      status: "Ready",
      studentId: student.id,
      studentName: student.name,
      invoiceId: student.invoice_id,
      reason:
        "Unique student and sufficient open dues. Posting requires accountant confirmation.",
    };
  } catch {
    return {
      row,
      status: "Under Review",
      studentId: student.id,
      studentName: student.name,
      reason: "No sufficient open dues, or the year is closed.",
    };
  }
}
async function allocationsFor(
  actor: Actor,
  studentId: string,
  yearId: string,
  amount: number,
  invoiceId?: string,
) {
  if (!invoiceId) return undefined;
  const dues = await all<{ id: string; outstanding_paise: number }>(
    "SELECT id,outstanding_paise FROM installment_balances WHERE institution_id=? AND student_id=? AND academic_year_id=? AND invoice_id=? AND outstanding_paise>0 ORDER BY due_date,id",
    [actor.institutionId, studentId, yearId, invoiceId],
  );
  let left = amount;
  return dues.flatMap((d) => {
    const value = Math.min(left, d.outstanding_paise);
    left -= value;
    return value > 0 ? [{ installmentId: d.id, amountPaise: value }] : [];
  });
}
export async function previewBankImport(actor: Actor, input: unknown) {
  permit(actor, "payments.manage");
  const d = z
      .object({ yearId: z.string(), rows: z.array(rowSchema).min(1).max(100) })
      .parse(input),
    year = await own(actor, "academic_years", d.yearId);
  if (new Set(d.rows.map((r) => r.reference)).size !== d.rows.length)
    throw new ApiError(
      422,
      "DUPLICATE_REFERENCE",
      "Remove duplicate bank references from this upload.",
    );
  for (const row of d.rows)
    if (
      row.date < year.start_date ||
      row.date > year.end_date ||
      row.date > today()
    )
      throw new ApiError(
        422,
        "BANK_YEAR_MISMATCH",
        "Every transaction date must fall within the selected academic year and cannot be in the future.",
      );
  const fingerprint = await sha256(JSON.stringify(d.rows)),
    existing = await one<{ id: string }>(
      "SELECT id FROM bank_import_batches WHERE institution_id=? AND academic_year_id=? AND fingerprint=?",
      [actor.institutionId, d.yearId, fingerprint],
    ),
    id = existing?.id || uuid();
  if (!existing)
    await batch([
      insert("bank_import_batches", {
        id,
        institution_id: actor.institutionId,
        academic_year_id: d.yearId,
        fingerprint,
        rows: JSON.stringify(d.rows),
        created_at: now(),
        created_by: actor.userId,
      }),
      audit(
        actor,
        "Previewed bank statement import",
        "bank_import_batches",
        id,
        null,
        { rows: d.rows.length, yearId: d.yearId },
      ),
    ]);
  const matches: Match[] = [];
  for (const row of d.rows) matches.push(await matchRow(actor, d.yearId, row));
  return { id, rows: matches, fingerprint };
}
export async function commitBankImport(actor: Actor, input: unknown) {
  permit(actor, "payments.manage");
  permit(actor, "payments.collect");
  const d = z
      .object({
        batchId: z.string(),
        postMatchedDues: z.boolean(),
        reason: z.string().trim().min(10).max(300),
      })
      .parse(input),
    record = await own(actor, "bank_import_batches", d.batchId),
    rows = z.array(rowSchema).parse(JSON.parse(record.rows));
  const results: { reference: string; status: string; message?: string }[] = [];
  for (const row of rows) {
    try {
      const match = await matchRow(actor, record.academic_year_id, row);
      if (match.status === "Debit" || match.status === "Duplicate") {
        results.push({ reference: row.reference, status: match.status });
        continue;
      }
      const id = uuid(),
        bankRowId = uuid(),
        amount = parseMoney(row.amount);
      const statements = (paymentId?: string) => [
        insert("reconciliation_records", {
          id,
          institution_id: actor.institutionId,
          academic_year_id: record.academic_year_id,
          transaction_id: row.reference,
          amount_paise: amount,
          transaction_date: row.date,
          student_id: match.studentId || null,
          invoice_id: match.invoiceId || null,
          payment_id: paymentId || null,
          status: paymentId
            ? "Matched"
            : match.status === "Under Review"
              ? "Under Review"
              : "Unmatched",
          notes: d.reason + " | " + row.narration,
          import_batch: record.id,
          ...stamps(actor.userId),
        }),
        insert("bank_posted_rows", {
          id: bankRowId,
          institution_id: actor.institutionId,
          batch_id: record.id,
          row_key: row.reference,
          transaction_id: row.reference,
          payment_id: paymentId || null,
          reconciliation_id: id,
          created_at: now(),
        }),
        audit(
          actor,
          "Approved bank statement reconciliation",
          "reconciliation_records",
          id,
          null,
          {
            reference: row.reference,
            paymentId: paymentId || null,
            transactionDate: row.date,
            reason: d.reason,
          },
        ),
      ];
      if (match.status === "Ready" && d.postMatchedDues && match.studentId) {
        const keyHash = await sha256(actor.institutionId + ":" + row.reference),
          key = `${keyHash.slice(0, 8)}-${keyHash.slice(8, 12)}-4${keyHash.slice(13, 16)}-8${keyHash.slice(17, 20)}-${keyHash.slice(20, 32)}`;
        await collectPayment(
          actor,
          {
            studentId: match.studentId,
            yearId: record.academic_year_id,
            amountPaise: amount,
            method: "Bank Transfer",
            reference: row.reference,
            notes: d.reason,
            idempotencyKey: key,
            paidAt: row.date + "T06:30:00.000Z",
            allocations: await allocationsFor(
              actor,
              match.studentId,
              record.academic_year_id,
              amount,
              match.invoiceId,
            ),
          },
          statements,
        );
        results.push({ reference: row.reference, status: "Posted & matched" });
      } else {
        await batch(statements(match.paymentId));
        results.push({
          reference: row.reference,
          status: match.paymentId
            ? "Matched"
            : match.status === "Under Review"
              ? "Under Review"
              : "Unmatched",
        });
      }
    } catch (e) {
      results.push({
        reference: row.reference,
        status: "Failed",
        message:
          e instanceof ApiError
            ? e.message
            : "This row was not posted. Refresh and review the bank reference.",
      });
    }
  }
  return {
    rows: results,
    failed: results.filter((r) => r.status === "Failed").length,
  };
}
