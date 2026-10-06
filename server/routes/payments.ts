import { z } from "zod";
import { parseMoney } from "../../lib/money";
import { batch, now, stmt } from "../db";
import { initiatePayment, verifyPayment } from "../gateway";
import {
  approveRefund,
  collectPayment,
  confirmPayment,
  requestRefund,
} from "../payments";
import { ApiError, audit, own, permit } from "../security";
import { ok, RouteContext } from "./shared";

export async function paymentsRoute(
  ctx: RouteContext,
): Promise<Response | null> {
  const { actor, path, p, method, body, request, url, requestId } = ctx;
  if (method === "POST") {
    if (path[0] === "payments" && path[1] === "initiate") {
      const d = z
        .object({
          studentId: z.string(),
          yearId: z.string(),
          amount: z.string(),
          gateway: z.enum(["Razorpay", "Cashfree"]),
          idempotencyKey: z.string().uuid(),
        })
        .parse(body);
      return ok(
        await initiatePayment(actor, {
          ...d,
          amountPaise: parseMoney(d.amount),
        }),
        requestId,
      );
    }
  }
  if (method === "POST") {
    if (path[0] === "payments" && path[1] === "verify")
      return ok(await verifyPayment(actor, body), requestId);
  }
  if (method === "POST") {
    if (path[0] === "payments" && path[2] === "confirm") {
      permit(actor, "collect");
      const payment = await own(actor, "payments", path[1]);
      if (payment.gateway)
        throw new ApiError(
          403,
          "GATEWAY_VERIFICATION_REQUIRED",
          "Online payments require provider verification.",
        );
      return ok(
        await confirmPayment(actor, path[1], body.reference),
        requestId,
      );
    }
  }
  if (method === "POST") {
    if (path[0] === "payments" && path[2] === "cancel") {
      permit(actor, "collect");
      const payment = await own(actor, "payments", path[1]);
      if (payment.status !== "Pending" || payment.gateway)
        throw new ApiError(
          409,
          "INVALID_PAYMENT_STATE",
          "Only uncleared offline payments can be cancelled.",
        );
      await batch([
        stmt(
          "UPDATE payments SET status='Cancelled',updated_at=?,updated_by=? WHERE institution_id=? AND id=? AND status='Pending'",
          [now(), actor.userId, actor.institutionId, payment.id],
        ),
        audit(
          actor,
          "Cancelled pending payment",
          "payments",
          payment.id,
          payment,
          { status: "Cancelled" },
        ),
      ]);
      return ok({ cancelled: true }, requestId);
    }
  }
  if (method === "POST") {
    if (path[0] === "payments" && path.length === 1) {
      const d = z
        .object({
          studentId: z.string(),
          yearId: z.string(),
          amount: z.string(),
          method: z.string(),
          reference: z.string().max(100).optional(),
          notes: z.string().max(500).optional(),
          idempotencyKey: z.string().uuid(),
          allocations: z
            .array(z.object({ installmentId: z.string(), amount: z.string() }))
            .max(30)
            .optional(),
        })
        .parse(body);
      return ok(
        await collectPayment(actor, {
          ...d,
          amountPaise: parseMoney(d.amount),
          allocations: d.allocations?.map((a) => ({
            installmentId: a.installmentId,
            amountPaise: parseMoney(a.amount),
          })),
        }),
        requestId,
      );
    }
  }
  if (method === "POST") {
    if (path[0] === "refunds" && path[2] === "approve")
      return ok(
        await approveRefund(actor, path[1], String(body.reference || "")),
        requestId,
      );
  }
  if (method === "POST") {
    if (path[0] === "refunds" && path[2] === "reject") {
      permit(actor, "refunds.approve");
      const record = await own(actor, "refunds", path[1]);
      await batch([
        stmt(
          "UPDATE refunds SET status='Rejected',approved_by=?,updated_at=?,updated_by=? WHERE id=? AND institution_id=? AND status='Requested'",
          [actor.userId, now(), actor.userId, record.id, actor.institutionId],
        ),
        audit(actor, "Rejected refund", "refunds", record.id, record, {
          status: "Rejected",
        }),
      ]);
      return ok({ rejected: true }, requestId);
    }
  }
  if (method === "POST") {
    if (path[0] === "refunds" && path.length === 1) {
      const d = z
        .object({
          paymentId: z.string(),
          amount: z.string(),
          reason: z.string().trim().min(3).max(500),
          method: z
            .enum(["Cash", "UPI", "Bank Transfer", "Cheque"])
            .default("Bank Transfer"),
          idempotencyKey: z.string().uuid(),
        })
        .parse(body);
      return ok(
        await requestRefund(actor, {
          ...d,
          amountPaise: parseMoney(d.amount),
        }),
        requestId,
      );
    }
  }
  if (method === "POST") {
    if (path[0] === "reconciliation" && path[2] === "match") {
      permit(actor, "collect");
      const record = await own(actor, "reconciliation_records", path[1]),
        payment = await own(
          actor,
          "payments",
          body.paymentId,
          record.academic_year_id,
        );
      if (
        !["Successful", "Partially Refunded", "Refunded"].includes(
          payment.status,
        )
      )
        throw new ApiError(
          422,
          "PAYMENT_PENDING",
          "Only successful payments can be matched.",
        );
      const status =
        record.amount_paise === payment.amount_paise
          ? "Matched"
          : "Partially Matched";
      await batch([
        stmt(
          "UPDATE reconciliation_records SET payment_id=?,student_id=?,status=?,notes=?,updated_at=?,updated_by=? WHERE id=? AND institution_id=?",
          [
            payment.id,
            payment.student_id,
            status,
            String(body.notes || ""),
            now(),
            actor.userId,
            record.id,
            actor.institutionId,
          ],
        ),
        audit(
          actor,
          "Reconciled transaction",
          "reconciliation_records",
          record.id,
          record,
          { paymentId: payment.id, status },
        ),
      ]);
      return ok({ status }, requestId);
    }
  }
  return null;
}
