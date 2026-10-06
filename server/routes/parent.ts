import QRCode from "qrcode";
import { z } from "zod";
import { parseMoney } from "../../lib/money";
import { upiPaymentUri } from "../../lib/upi";
import { annualTuitionCertificate, donationCertificate } from "../certificates";
import { receiptDownload } from "../receipt-download";
import { one } from "../db";
import { initiatePayment, verifyPayment } from "../gateway";
import { idempotent } from "../idempotency";
import { parentActor, parentOverview } from "../parent-portal";
import { accessStudent, ApiError, csrf, own, rateLimit } from "../security";
import { enforceSubscription } from "../tenancy";
import { withTenantContext } from "../tenant-context";
import { ok, readBody } from "./shared";

export async function parentRoute(
  request: Request,
  path: string[],
  requestId: string,
) {
  if (path[0] !== "parent-access") return null;
  const actor = await parentActor(request, path[1] || "");
  await rateLimit(request, "parent:" + actor.portalGrantId, 90);
  const method = request.method,
    p = new URL(request.url).searchParams;
  csrf(request);
  return withTenantContext(actor, async () => {
    if (method === "GET" && path.length === 2)
      return ok(await parentOverview(actor, p), requestId);
    if (method === "GET" && path[2] === "receipts")
      return receiptDownload(actor, path[3]);
    if (method === "GET" && path[2] === "certificates") {
      if (path[3] === "tuition")
        return annualTuitionCertificate(
          actor,
          p.get("student") || "",
          Number(p.get("financialYear")),
        );
      if (path[3] === "80g") return donationCertificate(actor, path[4]);
    }
    if (method === "GET" && path[2] === "upi") {
      const studentId = p.get("student") || "",
        yearId = p.get("year") || "";
      await accessStudent(actor, studentId, yearId);
      const balance = await one<{ outstanding_paise: number }>(
        "SELECT outstanding_paise FROM student_balances WHERE institution_id=? AND student_id=? AND academic_year_id=?",
        [actor.institutionId, studentId, yearId],
      );
      const institution = await one<{ name: string; settings: string }>(
        "SELECT name,settings FROM institutions WHERE id=?",
        [actor.institutionId],
      );
      const settings = JSON.parse(institution?.settings || "{}");
      if (!balance?.outstanding_paise || !settings.upi?.payeeId)
        throw new ApiError(
          409,
          "UPI_UNAVAILABLE",
          "No unpaid demand or institution UPI address is available.",
        );
      const uri = upiPaymentUri(
        settings.upi.payeeId,
        settings.upi.payeeName || institution!.name,
        balance.outstanding_paise,
        "School fees",
      );
      return new Response(
        await QRCode.toString(uri, { type: "svg", width: 360, margin: 3 }),
        {
          headers: {
            "Content-Type": "image/svg+xml",
            "Cache-Control": "private,no-store",
            "Content-Security-Policy":
              "default-src 'none'; style-src 'unsafe-inline'; sandbox",
          },
        },
      );
    }
    if (method === "POST" && path[2] === "checkout") {
      await enforceSubscription(actor, "POST", "payments");
      const body = await readBody(request);
      return idempotent(
        actor,
        "parent-checkout:" + actor.parentId,
        body,
        async () => {
          const d = z
            .object({
              studentId: z.string().min(1),
              yearId: z.string().min(1),
              amount: z.string(),
            })
            .parse(body);
          await accessStudent(actor, d.studentId, d.yearId);
          return ok(
            await initiatePayment(actor, {
              ...d,
              gateway: "Razorpay",
              amountPaise: parseMoney(d.amount),
              idempotencyKey: body.idempotencyKey,
            }),
            requestId,
          );
        },
      );
    }
    if (method === "POST" && path[2] === "verify") {
      const body = await readBody(request);
      return idempotent(
        actor,
        "parent-verify:" + actor.parentId,
        body,
        async () =>
          ok(
            await verifyPayment(
              actor,
              z
                .object({
                  paymentId: z.string(),
                  razorpay_order_id: z.string(),
                  razorpay_payment_id: z.string(),
                  razorpay_signature: z.string().regex(/^[0-9a-f]{64}$/),
                })
                .parse(body),
            ),
            requestId,
          ),
      );
    }
    throw new ApiError(404, "NOT_FOUND", "Parent service not found.");
  });
}
