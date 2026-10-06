import { env } from "cloudflare:workers";
import { PDFDocument } from "pdf-lib";
import { z } from "zod";
import { money, parseMoney } from "../lib/money";
import { all, batch, insert, one, stamps, uuid } from "./db";
import { attachment, renderPdf } from "./reports";
import {
  accessStudent,
  Actor,
  ApiError,
  audit,
  own,
  permit,
  sha256,
} from "./security";

export async function approveTuitionAllocation(actor: Actor, input: unknown) {
  permit(actor, "settings.manage");
  const d = z
    .object({
      paymentId: z.string().min(1),
      amount: z.string(),
      reason: z.string().trim().min(10).max(500),
    })
    .parse(input);
  const p = await own(actor, "payments", d.paymentId),
    amount = parseMoney(d.amount);
  if (
    !["Successful", "Partially Refunded"].includes(p.status) ||
    amount <= 0 ||
    amount > p.amount_paise
  )
    throw new ApiError(
      422,
      "INVALID_TUITION",
      "Approved tuition must be positive and within the settled payment. Verify the fee component evidence before approving.",
    );
  const id = uuid();
  await batch([
    insert("tuition_allocations", {
      id,
      institution_id: actor.institutionId,
      payment_id: p.id,
      amount_paise: amount,
      reason: d.reason,
      approved_by: actor.userId,
      ...stamps(actor.userId),
    }),
    audit(
      actor,
      "Approved tuition certificate allocation",
      "tuition_allocations",
      id,
      null,
      d,
    ),
  ]);
  return { id };
}
export async function annualTuitionCertificate(
  actor: Actor,
  studentId: string,
  financialYear: number,
) {
  z.number().int().min(2000).max(2100).parse(financialYear);
  await accessStudent(actor, studentId);
  const from = `${financialYear}-04-01`,
    to = `${financialYear + 1}-04-01`;
  const student = await own(actor, "students", studentId),
    institution = await one("SELECT * FROM institutions WHERE id=?", [
      actor.institutionId,
    ]);
  const rows = await all<{
    number: string;
    paid_date: string;
    amount: number;
    approved_by: string;
  }>(
    `SELECT r.number,date(p.paid_at,'+5 hours','+30 minutes') paid_date,MAX(0,t.amount_paise-COALESCE((SELECT SUM(f.amount_paise) FROM refunds f WHERE f.institution_id=p.institution_id AND f.payment_id=p.id AND f.status='Processed' AND date(f.refunded_at,'+5 hours','+30 minutes')<?),0)) amount,t.approved_by FROM tuition_allocations t JOIN payments p ON p.id=t.payment_id AND p.institution_id=t.institution_id JOIN receipts r ON r.payment_id=p.id AND r.institution_id=p.institution_id WHERE p.institution_id=? AND p.student_id=? AND p.status IN ('Successful','Partially Refunded','Refunded') AND date(p.paid_at,'+5 hours','+30 minutes')>=? AND date(p.paid_at,'+5 hours','+30 minutes')<? ORDER BY p.paid_at LIMIT 501`,
    [to, actor.institutionId, studentId, from, to],
  );
  if (rows.length > 500)
    throw new ApiError(
      422,
      "CERTIFICATE_LIMIT",
      "Contact accounts for a consolidated certificate.",
    );
  if (!rows.length)
    throw new ApiError(
      409,
      "TUITION_REVIEW_REQUIRED",
      "Accounts must approve the tuition portion of your payments before a certificate can be issued.",
    );
  const total = rows.reduce((sum, r) => sum + r.amount, 0);
  const content = await renderPdf(
    institution!,
    "Annual tuition payment certificate",
    [
      ["Receipt", "Paid date", "Tuition paid (INR)"],
      ...rows.map((r) => [r.number, r.paid_date, money(r.amount, true)]),
    ],
    [
      `Financial year: ${financialYear}-${String(financialYear + 1).slice(-2)}`,
      `Student: ${student.name} | Admission: ${student.admission_number}`,
      "Includes institution-approved tuition allocations only; development fees and donations are excluded.",
      "Processed refunds up to year end reduce tuition first. This document does not determine tax eligibility.",
    ],
    ["Approved tuition paid: " + money(total, true)],
  );
  return attachment(
    content,
    "application/pdf",
    `Tuition-${student.admission_number}-${financialYear}.pdf`,
  );
}
export async function registerDonationCertificate(
  actor: Actor,
  input: unknown,
) {
  permit(actor, "settings.manage");
  const d = z
    .object({
      parentId: z.string().min(1),
      financialYear: z.number().int().min(2000).max(2100),
      donationReference: z.string().trim().min(1).max(120),
      amount: z.string(),
      urn: z.string().trim().min(5).max(100),
      doneePan: z.string().regex(/^[A-Z]{5}\d{4}[A-Z]$/),
      form10bdAcknowledgement: z.string().trim().min(5).max(100),
      approved: z.literal(true),
      pdfBase64: z.string().max(2800000),
    })
    .parse(input);
  await own(actor, "parents", d.parentId);
  const amount = parseMoney(d.amount);
  if (amount <= 0 || !env.BUCKET)
    throw new ApiError(
      422,
      "INVALID_CERTIFICATE",
      "Enter a positive donation and configure document storage.",
    );
  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(atob(d.pdfBase64), (c) => c.charCodeAt(0));
    if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-")
      throw new Error();
    const pdf = await PDFDocument.load(bytes);
    if (pdf.getPageCount() > 20 || bytes.byteLength > 2000000)
      throw new Error();
  } catch {
    throw new ApiError(
      422,
      "INVALID_PDF",
      "Upload the official Form 10BE PDF, up to 2 MB and 20 pages.",
    );
  }
  const id = uuid(),
    key = `${actor.institutionId}/tax/${id}.pdf`;
  await env.BUCKET.put(key, bytes, {
    httpMetadata: { contentType: "application/pdf" },
  });
  try {
    await batch([
      insert("donation_certificates", {
        id,
        institution_id: actor.institutionId,
        parent_id: d.parentId,
        financial_year: d.financialYear,
        donation_reference: d.donationReference,
        amount_paise: amount,
        urn: d.urn,
        donee_pan: d.doneePan,
        form10bd_acknowledgement: d.form10bdAcknowledgement,
        object_key: key,
        file_hash: await sha256(d.pdfBase64),
        ...stamps(actor.userId),
      }),
      audit(
        actor,
        "Approved official donation Form 10BE",
        "donation_certificates",
        id,
        null,
        {
          parentId: d.parentId,
          donationReference: d.donationReference,
          financialYear: d.financialYear,
        },
      ),
    ]);
  } catch (e) {
    await env.BUCKET.delete(key);
    throw e;
  }
  return { id };
}
export async function donationCertificate(actor: Actor, id: string) {
  const doc = await own(actor, "donation_certificates", id);
  if (actor.portalGrantId && doc.parent_id !== actor.parentId)
    throw new ApiError(404, "NOT_FOUND", "Certificate not found.");
  const object = await env.BUCKET?.get(doc.object_key);
  if (!object)
    throw new ApiError(404, "NOT_FOUND", "Certificate file not found.");
  return attachment(
    new Uint8Array(await object.arrayBuffer()),
    "application/pdf",
    `Form-10BE-${doc.financial_year}.pdf`,
  );
}
