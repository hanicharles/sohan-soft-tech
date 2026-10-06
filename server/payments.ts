import { safeMoney } from "../lib/money";
import {
  all,
  batch,
  insert,
  now,
  one,
  Row,
  stamps,
  stmt,
  today,
  uuid,
} from "./db";
import { validateIdempotencyKey } from "./idempotency";
import { scheduleNotifications } from "./notifications";
import {
  accessStudent,
  Actor,
  ApiError,
  audit,
  own,
  permit,
  sha256,
} from "./security";
export type Allocation = { installmentId: string; amountPaise: number };
const successes = ["Successful", "Partially Refunded", "Refunded"];
export async function planPayment(
  actor: Actor,
  studentId: string,
  yearId: string,
  amount: number,
  requested?: Allocation[],
) {
  await accessStudent(actor, studentId, yearId);
  const year = await own(actor, "academic_years", yearId);
  if (["Closed", "Archived"].includes(year.status))
    throw new ApiError(
      409,
      "YEAR_CLOSED",
      "Payments cannot be added to a closed academic year.",
    );
  if (amount <= 0)
    throw new ApiError(
      422,
      "INVALID_AMOUNT",
      "Enter a positive payment amount.",
    );
  safeMoney(amount);
  const installments = await all(
    "SELECT * FROM installment_balances WHERE institution_id=? AND student_id=? AND academic_year_id=? AND outstanding_paise>0 ORDER BY due_date,sort_order",
    [actor.institutionId, studentId, yearId],
  );
  const map = new Map(installments.map((i) => [i.id, i]));
  let remaining = amount;
  const allocations: Row[] = [];
  if (requested?.length) {
    if (
      new Set(requested.map((r) => r.installmentId)).size !== requested.length
    )
      throw new ApiError(
        422,
        "DUPLICATE_ALLOCATION",
        "An installment can only appear once.",
      );
    for (const a of requested) {
      const inst = map.get(a.installmentId);
      if (!inst || a.amountPaise <= 0 || a.amountPaise > inst.outstanding_paise)
        throw new ApiError(
          422,
          "INVALID_ALLOCATION",
          "The selected installment amount exceeds its unpaid balance.",
        );
      safeMoney(a.amountPaise);
      allocations.push({ ...a, invoiceId: inst.invoice_id });
      remaining -= a.amountPaise;
    }
  } else {
    for (const i of installments) {
      if (remaining <= 0) break;
      const value = Math.min(remaining, i.outstanding_paise);
      allocations.push({
        installmentId: i.id,
        invoiceId: i.invoice_id,
        amountPaise: value,
      });
      remaining -= value;
    }
  }
  if (remaining !== 0)
    throw new ApiError(
      422,
      "OVERPAYMENT",
      "Payment must match the selected installments and cannot exceed the outstanding amount.",
    );
  return allocations;
}
export async function collectPayment(
  actor: Actor,
  data: {
    studentId: string;
    yearId: string;
    amountPaise: number;
    method: string;
    reference?: string;
    notes?: string;
    idempotencyKey: string;
    allocations?: Allocation[];
    paidAt?: string;
  },
  extraStatements?: (paymentId: string) => D1PreparedStatement[],
) {
  permit(actor, "collect");
  validateIdempotencyKey(data.idempotencyKey);
  if (data.paidAt) {
    permit(actor, "payments.manage");
    if (
      data.method !== "Bank Transfer" ||
      !Number.isFinite(Date.parse(data.paidAt))
    )
      throw new ApiError(
        422,
        "INVALID_PAYMENT_DATE",
        "Backdated entries require a verified bank statement.",
      );
    const year = await own(actor, "academic_years", data.yearId),
      date = new Date(Date.parse(data.paidAt) + 19800000)
        .toISOString()
        .slice(0, 10);
    if (date < year.start_date || date > year.end_date)
      throw new ApiError(
        422,
        "BANK_YEAR_MISMATCH",
        "Transaction date is outside the academic year.",
      );
  }
  const hash = await sha256(
    JSON.stringify({ ...data, idempotencyKey: undefined }),
  );
  const existing = await one(
    "SELECT * FROM payments WHERE institution_id=? AND idempotency_key=?",
    [actor.institutionId, data.idempotencyKey],
  );
  if (existing) {
    if (existing.request_hash !== hash)
      throw new ApiError(
        409,
        "IDEMPOTENCY_CONFLICT",
        "This payment key was used for a different request.",
      );
    return {
      payment: existing,
      receipt: await one("SELECT * FROM receipts WHERE payment_id=?", [
        existing.id,
      ]),
      duplicate: true,
    };
  }
  if (
    !["Cash", "UPI", "Bank Transfer", "Cheque", "Card", "Net Banking"].includes(
      data.method,
    )
  )
    throw new ApiError(
      422,
      "INVALID_METHOD",
      "Select a supported payment method.",
    );
  if (data.method !== "Cash" && !data.reference?.trim())
    throw new ApiError(
      422,
      "REFERENCE_REQUIRED",
      "Enter the transaction or cheque reference.",
    );
  const allocations = await planPayment(
      actor,
      data.studentId,
      data.yearId,
      data.amountPaise,
      data.allocations,
    ),
    id = uuid(),
    base = { institution_id: actor.institutionId, ...stamps(actor.userId) },
    pending = data.method === "Cheque";
  const payment = {
    id,
    ...base,
    student_id: data.studentId,
    academic_year_id: data.yearId,
    amount_paise: data.amountPaise,
    method: data.method,
    status: pending ? "Pending" : "Successful",
    reference: data.reference || null,
    idempotency_key: data.idempotencyKey,
    request_hash: hash,
    paid_at: data.paidAt || now(),
    notes: data.notes || "",
  };
  const statements = [
    insert("payments", payment),
    insert("payment_intents", {
      id: uuid(),
      ...base,
      payment_id: id,
      allocations: JSON.stringify(allocations),
    }),
  ];
  let receiptId: string | undefined;
  if (!pending) {
    const recorded = recordStatements(actor, payment, allocations);
    statements.push(...recorded.statements);
    receiptId = recorded.receiptId;
  }
  statements.push(
    audit(
      actor,
      pending ? "Recorded cheque awaiting clearance" : "Collected payment",
      "payments",
      id,
      null,
      payment,
    ),
  );
  if (data.paidAt)
    statements.push(
      audit(
        actor,
        "Supervisor approved backdated bank entry",
        "payments",
        id,
        null,
        { paidAt: data.paidAt, reference: data.reference, reason: data.notes },
      ),
    );
  if (extraStatements) statements.push(...extraStatements(id));
  try {
    await batch(statements);
  } catch (error) {
    const retry = await one(
      "SELECT * FROM payments WHERE institution_id=? AND idempotency_key=?",
      [actor.institutionId, data.idempotencyKey],
    );
    if (retry && retry.request_hash === hash)
      return {
        payment: retry,
        receipt: await one("SELECT * FROM receipts WHERE payment_id=?", [
          retry.id,
        ]),
        duplicate: true,
      };
    throw error;
  }
  if (receiptId) scheduleNotifications(actor);
  return {
    payment,
    receipt: receiptId
      ? await one("SELECT * FROM receipts WHERE id=?", [receiptId])
      : null,
  };
}
export function recordStatements(
  actor: Actor,
  payment: Row,
  allocations: Row[],
) {
  const base = { institution_id: actor.institutionId, ...stamps(actor.userId) },
    receiptId = uuid(),
    statements: D1PreparedStatement[] = [];
  for (const a of allocations)
    statements.push(
      insert("payment_allocations", {
        id: uuid(),
        institution_id: actor.institutionId,
        payment_id: payment.id,
        invoice_id: a.invoiceId,
        installment_id: a.installmentId,
        amount_paise: a.amountPaise,
      }),
    );
  statements.push(
    insert("ledger_entries", {
      id: uuid(),
      ...base,
      student_id: payment.student_id,
      academic_year_id: payment.academic_year_id,
      payment_id: payment.id,
      kind: "Payment",
      description: `${payment.method} payment${payment.reference ? ` · ${payment.reference}` : ""}`,
      debit_paise: 0,
      credit_paise: payment.amount_paise,
      entry_date: new Date(Date.parse(payment.paid_at) + 19800000)
        .toISOString()
        .slice(0, 10),
    }),
  );
  statements.push(
    insert("receipts", {
      id: receiptId,
      ...base,
      payment_id: payment.id,
      academic_year_id: payment.academic_year_id,
    }),
  );
  statements.push(
    insert("document_jobs", {
      id: "pdf:" + receiptId,
      institution_id: actor.institutionId,
      receipt_id: receiptId,
      state: "Queued",
      attempts: 0,
      created_at: now(),
      updated_at: now(),
    }),
  );
  statements.push(
    insert("notification_outbox", {
      id: uuid(),
      institution_id: actor.institutionId,
      payment_id: payment.id,
      state: "Queued",
      attempts: 0,
      available_at: now(),
      created_at: now(),
      updated_at: now(),
    }),
  );
  return { receiptId, statements };
}
export async function confirmPayment(
  actor: Actor,
  paymentId: string,
  reference?: string,
  gatewayTransactionId?: string,
  extra: D1PreparedStatement[] = [],
) {
  const payment = await own(actor, "payments", paymentId);
  if (successes.includes(payment.status))
    return {
      payment,
      receipt: await one("SELECT * FROM receipts WHERE payment_id=?", [
        paymentId,
      ]),
      duplicate: true,
    };
  if (["Cancelled", "Failed"].includes(payment.status))
    throw new ApiError(
      409,
      "PAYMENT_CLOSED",
      "This payment cannot be confirmed.",
    );
  const intent = await one(
    "SELECT allocations FROM payment_intents WHERE institution_id=? AND payment_id=?",
    [actor.institutionId, paymentId],
  );
  if (!intent)
    throw new ApiError(
      409,
      "INTENT_MISSING",
      "Payment allocation details are unavailable.",
    );
  const allocations = JSON.parse(intent.allocations),
    updated = {
      ...payment,
      status: "Successful",
      reference: reference || payment.reference,
      paid_at: now(),
    };
  const recorded = recordStatements(actor, updated, allocations);
  await batch([
    stmt(
      "UPDATE payments SET status='Successful',reference=?,gateway_transaction_id=COALESCE(?,gateway_transaction_id),paid_at=?,updated_at=?,updated_by=? WHERE institution_id=? AND id=? AND status IN ('Initiated','Processing','Pending')",
      [
        updated.reference,
        gatewayTransactionId || null,
        updated.paid_at,
        now(),
        actor.userId,
        actor.institutionId,
        paymentId,
      ],
    ),
    ...recorded.statements,
    ...extra,
    audit(
      actor,
      "Confirmed payment",
      "payments",
      paymentId,
      { status: payment.status },
      { status: "Successful", gatewayTransactionId },
    ),
  ]);
  scheduleNotifications(actor);
  return {
    payment: updated,
    receipt: await one("SELECT * FROM receipts WHERE id=?", [
      recorded.receiptId,
    ]),
  };
}
export async function requestRefund(actor: Actor, data: Row) {
  permit(actor, "refund");
  validateIdempotencyKey(data.idempotencyKey);
  const existing = await one(
    "SELECT * FROM refunds WHERE institution_id=? AND idempotency_key=?",
    [actor.institutionId, data.idempotencyKey],
  );
  if (existing) {
    if (
      existing.payment_id !== data.paymentId ||
      existing.amount_paise !== data.amountPaise ||
      existing.reason !== data.reason ||
      existing.method !== data.method
    )
      throw new ApiError(
        409,
        "IDEMPOTENCY_CONFLICT",
        "This refund key was used for a different request.",
      );
    return { ...existing, duplicate: true };
  }
  const payment = await own(actor, "payments", data.paymentId);
  if (!successes.includes(payment.status))
    throw new ApiError(
      422,
      "PAYMENT_NOT_SETTLED",
      "Only successful payments can be refunded.",
    );
  if (payment.gateway)
    throw new ApiError(
      409,
      "GATEWAY_REFUND_REQUIRED",
      "Initiate this refund in the payment provider dashboard, then reconcile the confirmed refund.",
    );
  const sum = await one(
    "SELECT COALESCE(SUM(amount_paise),0) amount FROM refunds WHERE payment_id=? AND status IN ('Requested','Approved','Processed')",
    [payment.id],
  );
  if (
    data.amountPaise <= 0 ||
    data.amountPaise > payment.amount_paise - sum!.amount
  )
    throw new ApiError(
      422,
      "REFUND_TOO_LARGE",
      "Refund exceeds the remaining refundable amount.",
    );
  const id = uuid(),
    record = {
      id,
      institution_id: actor.institutionId,
      student_id: payment.student_id,
      academic_year_id: payment.academic_year_id,
      payment_id: payment.id,
      amount_paise: data.amountPaise,
      method: data.method || payment.method,
      reason: data.reason,
      status: "Requested",
      idempotency_key: data.idempotencyKey,
      ...stamps(actor.userId),
    };
  await batch([
    insert("refunds", record),
    audit(actor, "Requested refund", "refunds", id, null, record),
  ]);
  return record;
}
export async function approveRefund(
  actor: Actor,
  id: string,
  reference: string,
) {
  permit(actor, "refunds.approve");
  const refund = await own(actor, "refunds", id);
  if (refund.status === "Processed") return { ...refund, duplicate: true };
  if (refund.status !== "Requested")
    throw new ApiError(409, "REFUND_CLOSED", "Refund is already reviewed.");
  if (!reference.trim())
    throw new ApiError(
      422,
      "REFERENCE_REQUIRED",
      "Enter a refund reference to confirm that the money was returned.",
    );
  const allocations = await all(
    `SELECT a.*,a.amount_paise-COALESCE((SELECT SUM(ra.amount_paise) FROM refund_allocations ra JOIN refunds r ON r.id=ra.refund_id WHERE ra.allocation_id=a.id AND r.status='Processed'),0) remaining FROM payment_allocations a WHERE a.institution_id=? AND a.payment_id=? ORDER BY a.id DESC`,
    [actor.institutionId, refund.payment_id],
  );
  let remaining = refund.amount_paise;
  const statements = [
    stmt(
      "UPDATE refunds SET status='Processed',approved_by=?,refunded_at=?,reference=?,updated_at=?,updated_by=? WHERE institution_id=? AND id=? AND status='Requested'",
      [
        actor.userId,
        now(),
        reference,
        now(),
        actor.userId,
        actor.institutionId,
        id,
      ],
    ),
  ];
  for (const a of allocations) {
    if (remaining <= 0) break;
    const value = Math.min(remaining, a.remaining);
    if (value <= 0) continue;
    statements.push(
      insert("refund_allocations", {
        id: uuid(),
        institution_id: actor.institutionId,
        refund_id: id,
        allocation_id: a.id,
        installment_id: a.installment_id,
        amount_paise: value,
      }),
    );
    remaining -= value;
  }
  if (remaining > 0)
    throw new ApiError(
      409,
      "REFUND_ALLOCATION_ERROR",
      "The refundable allocation is no longer available.",
    );
  statements.push(
    insert("ledger_entries", {
      id: uuid(),
      institution_id: actor.institutionId,
      ...stamps(actor.userId),
      student_id: refund.student_id,
      academic_year_id: refund.academic_year_id,
      refund_id: id,
      payment_id: refund.payment_id,
      kind: "Refund",
      description: refund.reason,
      debit_paise: refund.amount_paise,
      credit_paise: 0,
      entry_date: today(),
    }),
    audit(actor, "Authorized and recorded refund", "refunds", id, refund, {
      status: "Processed",
      reference,
    }),
  );
  await batch(statements);
  return { id, status: "Processed" };
}
