import { z } from "zod";
import { all, insert, now, one, run, stmt, uuid } from "../../db";
import { Actor, ApiError, rateLimit } from "../../security";
import { ok, RouteContext } from "../shared";
import {
  createPortalNotification,
  parsePagination,
  paginatedResponse,
  recordStudentAudit,
  resolveStudent,
  sanitizeText,
  StudentContext,
} from "./shared";

const paymentSchema = z.object({
  amount: z.number().positive("Payment amount must be greater than zero"),
  method: z.enum(["UPI", "Card", "Net Banking", "Cash", "Cheque", "Demand Draft"]).default("UPI"),
  idempotencyKey: z.string().min(1, "Idempotency key is required").max(100),
  invoiceId: z.string().optional(),
  notes: z.string().max(250).optional(),
});

export async function handleFees(ctx: RouteContext, subPath: string[]): Promise<Response | null> {
  const { actor, method, p, body, requestId, request } = ctx;
  const sCtx = await resolveStudent(actor);
  const { studentId, institutionId, student } = sCtx;

  // 1. GET /fees -> Dashboard + Invoices
  if (subPath.length === 0 || (subPath.length === 1 && subPath[0] === "fees")) {
    if (method === "GET") {
      // Aggregate Dashboard from student_balances view
      const balance = await one<{
        total_paise: number;
        paid_paise: number;
        outstanding_paise: number;
        overdue_paise: number;
        next_due_date: string | null;
      }>(
        `SELECT 
          COALESCE(total_paise, 0) as total_paise,
          COALESCE(paid_paise, 0) as paid_paise,
          COALESCE(outstanding_paise, 0) as outstanding_paise,
          COALESCE(overdue_paise, 0) as overdue_paise,
          next_due_date
        FROM student_balances 
        WHERE institution_id=? AND student_id=? 
        ORDER BY academic_year_id DESC LIMIT 1`,
        [institutionId, studentId],
      );

      const dashboard = {
        totalFeesPaise: balance?.total_paise ?? 0,
        totalFees: (balance?.total_paise ?? 0) / 100,
        paidAmountPaise: balance?.paid_paise ?? 0,
        paidAmount: (balance?.paid_paise ?? 0) / 100,
        outstandingAmountPaise: balance?.outstanding_paise ?? 0,
        outstandingAmount: (balance?.outstanding_paise ?? 0) / 100,
        overdueAmountPaise: balance?.overdue_paise ?? 0,
        overdueAmount: (balance?.overdue_paise ?? 0) / 100,
        nextDueDate: balance?.next_due_date ?? null,
      };

      // Retrieve Student Invoices
      const rawInvoices = await all<Record<string, any>>(
        `SELECT 
          i.id,
          i.institution_id,
          i.student_id,
          i.academic_year_id,
          i.gross_paise,
          i.discount_paise,
          i.scholarship_paise,
          i.net_paise,
          i.issued_date,
          i.due_date,
          i.created_at,
          (
            SELECT COALESCE(SUM(pa.amount_paise), 0)
            FROM payment_allocations pa
            JOIN payments p ON p.id = pa.payment_id
            WHERE pa.invoice_id = i.id AND p.status = 'Successful'
          ) as paid_paise,
          (
            SELECT COALESCE(SUM(fa.amount_paise), 0)
            FROM fee_adjustments fa
            WHERE fa.invoice_id = i.id AND fa.kind = 'Late Fee'
          ) as late_fee_paise,
          (
            SELECT ii.name
            FROM invoice_items ii
            WHERE ii.invoice_id = i.id
            LIMIT 1
          ) as category_name
        FROM invoices i
        WHERE i.institution_id=? AND i.student_id=?
        ORDER BY i.due_date ASC, i.created_at DESC`,
        [institutionId, studentId],
      );

      const todayStr = new Date().toISOString().slice(0, 10);

      const invoices = rawInvoices.map((inv) => {
        const gross = Number(inv.gross_paise) || 0;
        const discount = Number(inv.discount_paise) || 0;
        const scholarship = Number(inv.scholarship_paise) || 0;
        const lateFee = Number(inv.late_fee_paise) || 0;
        const totalPayable = gross - discount - scholarship + lateFee;
        const paid = Number(inv.paid_paise) || 0;
        const balanceRemaining = Math.max(0, totalPayable - paid);

        let status = "Pending";
        if (balanceRemaining <= 0) {
          status = "Paid";
        } else if (inv.due_date && inv.due_date < todayStr) {
          status = "Overdue";
        }

        return {
          id: inv.id,
          invoiceNumber: inv.id,
          category: inv.category_name || "Academic Fee",
          amountPaise: gross,
          amount: gross / 100,
          discountPaise: discount,
          discount: discount / 100,
          scholarshipPaise: scholarship,
          scholarship: scholarship / 100,
          lateFeePaise: lateFee,
          lateFee: lateFee / 100,
          netPayablePaise: totalPayable,
          netPayable: totalPayable / 100,
          paidPaise: paid,
          paidAmount: paid / 100,
          balancePaise: balanceRemaining,
          balance: balanceRemaining / 100,
          dueDate: inv.due_date,
          issuedDate: inv.issued_date,
          status,
        };
      });

      return ok({ dashboard, invoices }, requestId);
    }
  }

  // 2. POST /payments -> Process Online Payment (simulated gateway)
  if (subPath[0] === "payments" && subPath.length === 1 && method === "POST") {
    await rateLimit(request, `rate:student-pay:${actor.userId}`, 30);
    const validated = paymentSchema.parse(body);
    const amountPaise = Math.round(validated.amount * 100);

    // Idempotency check: prevent duplicate payments
    const existing = await one<Record<string, any>>(
      `SELECT p.*, r.id as receipt_id 
       FROM payments p 
       LEFT JOIN receipts r ON r.payment_id = p.id 
       WHERE p.institution_id=? AND p.student_id=? AND p.idempotency_key=? 
       LIMIT 1`,
      [institutionId, studentId, validated.idempotencyKey],
    );

    if (existing) {
      return ok(
        {
          id: existing.id,
          paymentId: existing.id,
          transactionReference: existing.reference,
          status: existing.status,
          amount: existing.amount_paise / 100,
          amountPaise: existing.amount_paise,
          method: existing.method,
          receiptId: existing.receipt_id,
          isDuplicate: true,
          message: "Payment with this idempotency key was previously processed.",
        },
        requestId,
      );
    }

    // Verify amount does not exceed total outstanding
    const curBalance = await one<{ outstanding_paise: number }>(
      "SELECT COALESCE(outstanding_paise, 0) as outstanding_paise FROM student_balances WHERE institution_id=? AND student_id=?",
      [institutionId, studentId],
    );
    const maxAllowed = curBalance?.outstanding_paise ?? 0;
    if (maxAllowed <= 0) {
      throw new ApiError(422, "NO_OUTSTANDING_BALANCE", "Student has no outstanding fees to pay.");
    }
    if (amountPaise > maxAllowed) {
      throw new ApiError(
        422,
        "AMOUNT_EXCEEDS_OUTSTANDING",
        `Payment amount of ₹${validated.amount} exceeds total outstanding dues of ₹${maxAllowed / 100}.`,
      );
    }

    // Determine target academic year and installment/invoice
    const targetInvoice = validated.invoiceId
      ? await one<Record<string, any>>(
          "SELECT * FROM invoices WHERE id=? AND institution_id=? AND student_id=?",
          [validated.invoiceId, institutionId, studentId],
        )
      : await one<Record<string, any>>(
          `SELECT i.* FROM invoices i 
           WHERE i.institution_id=? AND i.student_id=? 
           ORDER BY i.due_date ASC LIMIT 1`,
          [institutionId, studentId],
        );

    const yearId = targetInvoice?.academic_year_id || (
      await one<{ id: string }>(
        "SELECT academic_year_id as id FROM enrollments WHERE institution_id=? AND student_id=? LIMIT 1",
        [institutionId, studentId],
      )
    )?.id;

    if (!yearId) {
      throw new ApiError(400, "MISSING_ACADEMIC_YEAR", "Cannot find active enrollment academic year.");
    }

    const paymentId = uuid();
    const ref = `TXN-${uuid().slice(0, 8).toUpperCase()}`;
    const paymentTimestamp = now();

    // 1. Insert Payment
    await run(
      `INSERT INTO payments(id, institution_id, student_id, academic_year_id, amount_paise, method, status, reference, idempotency_key, request_hash, paid_at, notes, created_at, updated_at, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, 'Successful', ?, ?, 'portal_checkout', ?, ?, ?, ?, ?, ?)`,
      [
        paymentId,
        institutionId,
        studentId,
        yearId,
        amountPaise,
        validated.method,
        ref,
        validated.idempotencyKey,
        paymentTimestamp,
        validated.notes || "Online student portal payment",
        paymentTimestamp,
        paymentTimestamp,
        actor.userId,
        actor.userId,
      ],
    );

    // 2. Allocate payment to invoice / installment
    if (targetInvoice) {
      const inst = await one<{ id: string }>(
        "SELECT id FROM installments WHERE invoice_id=? AND institution_id=? LIMIT 1",
        [targetInvoice.id, institutionId],
      );
      await run(
        `INSERT INTO payment_allocations(id, institution_id, payment_id, invoice_id, installment_id, amount_paise)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [uuid(), institutionId, paymentId, targetInvoice.id, inst?.id || null, amountPaise],
      );
    }

    // 3. Insert Ledger Payment Credit
    await run(
      `INSERT INTO ledger_entries(id, institution_id, student_id, academic_year_id, payment_id, invoice_id, kind, description, debit_paise, credit_paise, entry_date, created_at, updated_at, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, 'Payment', ?, 0, ?, ?, ?, ?, ?, ?)`,
      [
        uuid(),
        institutionId,
        studentId,
        yearId,
        paymentId,
        targetInvoice?.id || null,
        `Online payment received via ${validated.method} (Ref: ${ref})`,
        amountPaise,
        paymentTimestamp.slice(0, 10),
        paymentTimestamp,
        paymentTimestamp,
        actor.userId,
        actor.userId,
      ],
    );

    // 4. Create Receipt
    const receiptId = `rec-${uuid().slice(0, 12)}`;
    await run(
      `INSERT INTO receipts(id, institution_id, payment_id, academic_year_id, created_at, updated_at, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [receiptId, institutionId, paymentId, yearId, paymentTimestamp, paymentTimestamp, actor.userId, actor.userId],
    );

    // 5. Audit Log
    await recordStudentAudit(actor, "Payment Completed", "payments", paymentId, null, {
      amountPaise,
      method: validated.method,
      reference: ref,
      receiptId,
    });

    // 6. Automatic Notification
    await createPortalNotification({
      institutionId,
      studentId,
      type: "Fee",
      title: "Fee Payment Successful",
      message: `Your payment of ₹${validated.amount.toFixed(2)} via ${validated.method} (Ref: ${ref}) was successfully processed.`,
      actionUrl: "/portal/fees",
      actorId: actor.userId,
    });

    return ok(
      {
        id: paymentId,
        paymentId,
        receiptId,
        transactionReference: ref,
        status: "Successful",
        amount: validated.amount,
        amountPaise,
        method: validated.method,
        paidAt: paymentTimestamp,
        receiptUrl: `/api/v1/student/receipts/${receiptId}`,
      },
      requestId,
    );
  }

  // 3. GET /payments -> Payment History
  if (subPath[0] === "payments" && subPath.length === 1 && method === "GET") {
    const { offset, limit, page, pageSize } = parsePagination(p);
    const countRow = await one<{ total: number }>(
      "SELECT COUNT(*) as total FROM payments WHERE institution_id=? AND student_id=?",
      [institutionId, studentId],
    );
    const total = countRow?.total ?? 0;

    const rows = await all<Record<string, any>>(
      `SELECT 
        p.id,
        p.amount_paise,
        p.method,
        p.status,
        p.reference as transaction_id,
        p.idempotency_key,
        p.paid_at,
        p.created_at,
        r.id as receipt_id
      FROM payments p
      LEFT JOIN receipts r ON r.payment_id = p.id
      WHERE p.institution_id=? AND p.student_id=?
      ORDER BY p.created_at DESC
      LIMIT ? OFFSET ?`,
      [institutionId, studentId, limit, offset],
    );

    const formatted = rows.map((r) => ({
      id: r.id,
      date: r.paid_at || r.created_at,
      amountPaise: r.amount_paise,
      amount: r.amount_paise / 100,
      method: r.method,
      transactionId: r.transaction_id,
      status: r.status,
      receiptId: r.receipt_id || null,
      idempotencyKey: r.idempotency_key,
    }));

    return ok(paginatedResponse(formatted, total, page, pageSize), requestId);
  }

  // 4. GET /receipts -> List Receipts
  if (subPath[0] === "receipts" && subPath.length === 1 && method === "GET") {
    const { offset, limit, page, pageSize } = parsePagination(p);
    const countRow = await one<{ total: number }>(
      `SELECT COUNT(*) as total 
       FROM receipts r
       JOIN payments p ON p.id = r.payment_id
       WHERE r.institution_id=? AND p.student_id=?`,
      [institutionId, studentId],
    );
    const total = countRow?.total ?? 0;

    const rows = await all<Record<string, any>>(
      `SELECT 
        r.id,
        r.created_at,
        p.id as payment_id,
        p.amount_paise,
        p.method,
        p.reference,
        p.paid_at
      FROM receipts r
      JOIN payments p ON p.id = r.payment_id
      WHERE r.institution_id=? AND p.student_id=?
      ORDER BY r.created_at DESC
      LIMIT ? OFFSET ?`,
      [institutionId, studentId, limit, offset],
    );

    const items = rows.map((r) => ({
      id: r.id,
      receiptNumber: r.id,
      paymentId: r.payment_id,
      amountPaise: r.amount_paise,
      amount: r.amount_paise / 100,
      method: r.method,
      transactionReference: r.reference,
      date: r.paid_at || r.created_at,
      viewUrl: `/api/v1/student/receipts/${r.id}`,
    }));

    return ok(paginatedResponse(items, total, page, pageSize), requestId);
  }

  // 5. GET /receipts/:id -> Receipt View with Printable HTML & PDF Download info
  if (subPath[0] === "receipts" && subPath.length === 2 && method === "GET") {
    const receiptId = subPath[1];
    const receipt = await one<Record<string, any>>(
      `SELECT 
        r.id,
        r.created_at as receipt_date,
        p.id as payment_id,
        p.amount_paise,
        p.method,
        p.reference,
        p.paid_at,
        p.notes,
        i.name as institution_name,
        i.address as institution_address,
        i.phone as institution_phone,
        i.email as institution_email,
        s.name as student_name,
        s.admission_number
      FROM receipts r
      JOIN payments p ON p.id = r.payment_id
      JOIN students s ON s.id = p.student_id
      JOIN institutions i ON i.id = r.institution_id
      WHERE r.id=? AND r.institution_id=? AND p.student_id=?
      LIMIT 1`,
      [receiptId, institutionId, studentId],
    );

    if (!receipt) {
      throw new ApiError(404, "RECEIPT_NOT_FOUND", "Official fee receipt not found.");
    }

    const amountFormatted = (receipt.amount_paise / 100).toFixed(2);
    const dateFormatted = new Date(receipt.paid_at || receipt.receipt_date).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });

    const printableHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Fee Receipt - ${receipt.id}</title>
  <style>
    body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; margin: 40px; color: #1e293b; }
    .receipt-box { max-width: 650px; margin: auto; padding: 32px; border: 1px solid #e2e8f0; border-radius: 8px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
    .header { text-align: center; border-bottom: 2px solid #3b82f6; padding-bottom: 16px; margin-bottom: 24px; }
    .header h1 { margin: 0; font-size: 24px; color: #1e3a8a; }
    .header p { margin: 4px 0 0 0; font-size: 13px; color: #64748b; }
    .receipt-title { display: flex; justify-content: space-between; margin-bottom: 20px; font-size: 14px; font-weight: 600; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; }
    .label { font-size: 12px; color: #64748b; text-transform: uppercase; margin-bottom: 2px; }
    .value { font-size: 15px; font-weight: 500; }
    .table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
    .table th, .table td { border-bottom: 1px solid #e2e8f0; padding: 12px 8px; text-align: left; }
    .table th { background: #f8fafc; font-size: 13px; color: #475569; }
    .table td.amount { text-align: right; font-weight: 600; }
    .total-box { text-align: right; margin-top: 16px; font-size: 18px; font-weight: 700; color: #047857; }
    .footer { text-align: center; margin-top: 32px; font-size: 12px; color: #94a3b8; border-top: 1px dashed #cbd5e1; padding-top: 16px; }
    @media print { body { margin: 0; } .receipt-box { border: none; box-shadow: none; } }
  </style>
</head>
<body>
  <div class="receipt-box">
    <div class="header">
      <h1>${receipt.institution_name}</h1>
      <p>${receipt.institution_address || ""} | Tel: ${receipt.institution_phone || ""}</p>
    </div>
    <div class="receipt-title">
      <span>OFFICIAL FEE RECEIPT</span>
      <span>No: ${receipt.id}</span>
    </div>
    <div class="grid">
      <div>
        <div class="label">Student Name</div>
        <div class="value">${receipt.student_name}</div>
      </div>
      <div>
        <div class="label">Admission Number</div>
        <div class="value">${receipt.admission_number}</div>
      </div>
      <div>
        <div class="label">Payment Date</div>
        <div class="value">${dateFormatted}</div>
      </div>
      <div>
        <div class="label">Payment Method</div>
        <div class="value">${receipt.method}</div>
      </div>
      <div>
        <div class="label">Transaction Reference</div>
        <div class="value">${receipt.reference}</div>
      </div>
      <div>
        <div class="label">Payment Status</div>
        <div class="value" style="color:#059669;">Successful (Verified)</div>
      </div>
    </div>
    <table class="table">
      <thead>
        <tr>
          <th>Description</th>
          <th style="text-align:right;">Amount (INR)</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Institutional Academic Fee / Tuition Installment</td>
          <td class="amount">₹${amountFormatted}</td>
        </tr>
      </tbody>
    </table>
    <div class="total-box">
      Total Paid: ₹${amountFormatted}
    </div>
    <div class="footer">
      This is a computer generated official electronic fee receipt valid without physical signature.
    </div>
  </div>
</body>
</html>`;

    // Downloadable PDF data representation
    const pdfBase64 = Buffer.from(printableHtml, "utf-8").toString("base64");

    return ok(
      {
        receipt: {
          id: receipt.id,
          receiptNumber: receipt.id,
          paymentId: receipt.payment_id,
          studentName: receipt.student_name,
          admissionNumber: receipt.admission_number,
          institutionName: receipt.institution_name,
          amountPaise: receipt.amount_paise,
          amount: receipt.amount_paise / 100,
          method: receipt.method,
          transactionReference: receipt.reference,
          date: receipt.paid_at || receipt.receipt_date,
          status: "Successful",
        },
        printableHtml,
        downloadablePdf: {
          contentType: "application/pdf",
          fileName: `Receipt_${receipt.id}.pdf`,
          base64: pdfBase64,
        },
      },
      requestId,
    );
  }

  return null;
}
