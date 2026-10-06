import { env } from "cloudflare:workers";
import { parseMoney } from "../lib/money";
import { batch, insert, now, one, Row, run, stamps, stmt, uuid } from "./db";
import { validateIdempotencyKey } from "./idempotency";
import { confirmPayment, planPayment } from "./payments";
import { readProvider } from "./providers";
import {
  accessStudent,
  Actor,
  ApiError,
  audit,
  constantEqual,
  hmac,
  own,
  permit,
  sha256,
} from "./security";
interface Order {
  id: string;
  amount: number;
  keyId?: string;
  sessionId?: string;
  mode?: string;
}
interface Gateway {
  create(actor: Actor, payment: Row): Promise<Order>;
  verify(actor: Actor, payment: Row, data: Row): Promise<string>;
}
async function config(institutionId: string, provider: string) {
  const saved = await readProvider(institutionId, provider);
  if (saved) return saved;
  if (provider === "Razorpay" && env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET)
    return {
      keyId: env.RAZORPAY_KEY_ID,
      keySecret: env.RAZORPAY_KEY_SECRET,
      webhookSecret: env.RAZORPAY_WEBHOOK_SECRET || "",
    };
  if (provider === "Cashfree" && env.CASHFREE_APP_ID && env.CASHFREE_SECRET_KEY)
    return {
      keyId: env.CASHFREE_APP_ID,
      keySecret: env.CASHFREE_SECRET_KEY,
      mode: env.CASHFREE_ENV || "sandbox",
    };
  throw new ApiError(
    503,
    "GATEWAY_NOT_CONFIGURED",
    "Your institution has not connected a payment gateway. Please contact the accounts office.",
  );
}
async function gatewayFetch(
  url: string,
  headers: Record<string, string>,
  body?: unknown,
) {
  const response = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json", ...headers },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok)
    throw new ApiError(
      502,
      "GATEWAY_UNAVAILABLE",
      "The payment provider could not process this request. Try again later.",
    );
  return response.json() as Promise<Row>;
}
const razorpay: Gateway = {
  async create(actor, payment) {
    const c = await config(actor.institutionId, "Razorpay"),
      order = await gatewayFetch(
        "https://api.razorpay.com/v1/orders",
        { Authorization: "Basic " + btoa(c.keyId + ":" + c.keySecret) },
        {
          amount: payment.amount_paise,
          currency: "INR",
          receipt: payment.id,
          notes: {
            payment_id: payment.id,
            institution_id: actor.institutionId,
          },
        },
      );
    return { id: order.id, amount: payment.amount_paise, keyId: c.keyId };
  },
  async verify(actor, payment, data) {
    const c = await config(actor.institutionId, "Razorpay");
    if (
      data.razorpay_order_id !== payment.gateway_order_id ||
      !constantEqual(
        await hmac(
          c.keySecret,
          payment.gateway_order_id + "|" + data.razorpay_payment_id,
        ),
        data.razorpay_signature || "",
      )
    )
      throw new ApiError(
        400,
        "INVALID_SIGNATURE",
        "Payment verification failed.",
      );
    const p = await gatewayFetch(
      "https://api.razorpay.com/v1/payments/" +
        encodeURIComponent(data.razorpay_payment_id),
      { Authorization: "Basic " + btoa(c.keyId + ":" + c.keySecret) },
    );
    if (
      p.status !== "captured" ||
      p.amount !== payment.amount_paise ||
      p.currency !== "INR" ||
      p.order_id !== payment.gateway_order_id
    )
      throw new ApiError(
        409,
        "PAYMENT_NOT_CAPTURED",
        "Payment is awaiting confirmation from the provider.",
      );
    return p.id;
  },
};
const cashfree: Gateway = {
  async create(actor, payment) {
    const c = await config(actor.institutionId, "Cashfree"),
      parent = await one(
        "SELECT par.mobile,par.email FROM student_parents sp JOIN parents par ON par.id=sp.parent_id WHERE sp.institution_id=? AND sp.student_id=? LIMIT 1",
        [actor.institutionId, payment.student_id],
      );
    if (!parent?.mobile)
      throw new ApiError(
        422,
        "MOBILE_REQUIRED",
        "A parent mobile number is required for online payment.",
      );
    const mode = c.mode === "production" ? "production" : "sandbox",
      order = await gatewayFetch(
        mode === "production"
          ? "https://api.cashfree.com/pg/orders"
          : "https://sandbox.cashfree.com/pg/orders",
        {
          "x-client-id": c.keyId,
          "x-client-secret": c.keySecret,
          "x-api-version": "2025-01-01",
          "x-idempotency-key": payment.id,
        },
        {
          order_id: payment.id,
          order_amount: payment.amount_paise / 100,
          order_currency: "INR",
          customer_details: {
            customer_id: payment.student_id,
            customer_phone: parent.mobile,
            customer_email: parent.email || actor.email,
          },
        },
      );
    return {
      id: order.order_id,
      amount: payment.amount_paise,
      sessionId: order.payment_session_id,
      mode,
    };
  },
  async verify(actor, payment) {
    const c = await config(actor.institutionId, "Cashfree"),
      url =
        (c.mode === "production"
          ? "https://api.cashfree.com"
          : "https://sandbox.cashfree.com") +
        "/pg/orders/" +
        encodeURIComponent(payment.gateway_order_id) +
        "/payments",
      list = await gatewayFetch(url, {
        "x-client-id": c.keyId,
        "x-client-secret": c.keySecret,
        "x-api-version": "2025-01-01",
      });
    const result = (list as unknown as Row[]).find(
      (r) =>
        r.payment_status === "SUCCESS" &&
        parseMoney(String(r.payment_amount)) === payment.amount_paise &&
        r.payment_currency === "INR",
    );
    if (!result)
      throw new ApiError(
        409,
        "PAYMENT_NOT_CAPTURED",
        "Payment is awaiting provider confirmation.",
      );
    return String(result.cf_payment_id);
  },
};
const gateways: Record<string, Gateway> = {
  Razorpay: razorpay,
  Cashfree: cashfree,
};
export async function initiatePayment(actor: Actor, data: Row) {
  permit(actor, "payments.collect");
  validateIdempotencyKey(data.idempotencyKey);
  const allocations = await planPayment(
      actor,
      data.studentId,
      data.yearId,
      data.amountPaise,
    ),
    hash = await sha256(
      JSON.stringify({
        studentId: data.studentId,
        yearId: data.yearId,
        amountPaise: data.amountPaise,
        gateway: data.gateway,
      }),
    ),
    existing = await one(
      "SELECT * FROM payments WHERE institution_id=? AND idempotency_key=?",
      [actor.institutionId, data.idempotencyKey],
    );
  if (existing) {
    if (existing.request_hash !== hash)
      throw new ApiError(
        409,
        "IDEMPOTENCY_CONFLICT",
        "Payment request key has already been used.",
      );
    throw new ApiError(
      409,
      "PAYMENT_ALREADY_INITIATED",
      "This payment has already been initiated. Check payment history before trying again.",
    );
  }
  const gateway = gateways[data.gateway];
  if (!gateway)
    throw new ApiError(
      422,
      "INVALID_GATEWAY",
      "Choose a configured payment gateway.",
    );
  const payment = {
    id: uuid(),
    institution_id: actor.institutionId,
    ...stamps(actor.userId),
    student_id: data.studentId,
    academic_year_id: data.yearId,
    amount_paise: data.amountPaise,
    method: "Payment Gateway",
    gateway: data.gateway,
    status: "Initiated",
    idempotency_key: data.idempotencyKey,
    request_hash: hash,
    paid_at: now(),
  };
  // Persist the intent before contacting a provider; failure remains visible.
  await batch([
    insert("payments", payment),
    insert("payment_intents", {
      id: uuid(),
      institution_id: actor.institutionId,
      ...stamps(actor.userId),
      payment_id: payment.id,
      allocations: JSON.stringify(allocations),
    }),
  ]);
  try {
    const order = await gateway.create(actor, payment);
    await batch([
      stmt("UPDATE payments SET gateway_order_id=?,updated_at=? WHERE id=?", [
        order.id,
        now(),
        payment.id,
      ]),
      audit(actor, "Initiated online payment", "payments", payment.id, null, {
        gateway: data.gateway,
        amountPaise: payment.amount_paise,
        orderId: order.id,
      }),
    ]);
    return { paymentId: payment.id, gateway: data.gateway, ...order };
  } catch (error) {
    await run("UPDATE payments SET status='Failed',updated_at=? WHERE id=?", [
      now(),
      payment.id,
    ]);
    throw error;
  }
}
export async function verifyPayment(actor: Actor, data: Row) {
  const payment = await own(actor, "payments", data.paymentId);
  await accessStudent(actor, payment.student_id, payment.academic_year_id);
  const gateway = gateways[payment.gateway];
  if (!gateway)
    throw new ApiError(
      400,
      "INVALID_GATEWAY",
      "Payment provider is unavailable.",
    );
  const transactionId = await gateway.verify(actor, payment, data);
  return confirmPayment(actor, payment.id, transactionId, transactionId);
}
export async function webhook(request: Request) {
  const raw = await request.text();
  if (raw.length > 128000)
    throw new ApiError(
      413,
      "PAYLOAD_TOO_LARGE",
      "Webhook payload exceeds the limit.",
    );
  let event: Row;
  try {
    event = JSON.parse(raw);
  } catch {
    throw new ApiError(400, "INVALID_JSON", "Invalid webhook payload.");
  }
  const entity = event.payload?.payment?.entity,
    orderId = entity?.order_id;
  if (!orderId)
    throw new ApiError(
      400,
      "INVALID_WEBHOOK",
      "Expected a Razorpay payment event.",
    );
  const payment = await one(
    "SELECT * FROM payments WHERE gateway='Razorpay' AND gateway_order_id=?",
    [orderId],
  );
  if (!payment)
    throw new ApiError(
      404,
      "PAYMENT_NOT_FOUND",
      "No payment intent matches this order.",
    );
  const c = await config(payment.institution_id, "Razorpay");
  if (
    !c.webhookSecret ||
    !constantEqual(
      await hmac(c.webhookSecret, raw),
      request.headers.get("x-razorpay-signature") || "",
    )
  )
    throw new ApiError(
      400,
      "INVALID_SIGNATURE",
      "Webhook signature verification failed.",
    );
  const eventId =
      request.headers.get("x-razorpay-event-id") || (await sha256(raw)),
    hash = await sha256(raw),
    seen = await one(
      "SELECT * FROM gateway_events WHERE gateway='Razorpay' AND event_id=?",
      [eventId],
    );
  if (seen) {
    if (seen.payload_hash !== hash)
      throw new ApiError(
        409,
        "EVENT_CONFLICT",
        "Webhook event hash does not match.",
      );
    return { received: true, duplicate: true };
  }
  if (event.event !== "payment.captured")
    return { received: true, ignored: true };
  if (
    entity.status !== "captured" ||
    entity.currency !== "INR" ||
    entity.amount !== payment.amount_paise
  )
    throw new ApiError(
      422,
      "PAYMENT_MISMATCH",
      "Payment amount, currency or capture status does not match.",
    );
  const actor: Actor = {
    userId: "gateway:Razorpay",
    name: "Razorpay webhook",
    email: "",
    institutionId: payment.institution_id,
    role: "INSTITUTION_ADMIN",
    feeVisibility: true,
    request,
  };
  const eventStatement = insert("gateway_events", {
    id: uuid(),
    institution_id: actor.institutionId,
    ...stamps(actor.userId),
    gateway: "Razorpay",
    event_id: eventId,
    payload_hash: hash,
    status: "Processed",
  });
  try {
    const result = await confirmPayment(
      actor,
      payment.id,
      entity.id,
      entity.id,
      [eventStatement],
    );
    if (result.duplicate) await batch([eventStatement]);
    return { received: true, paymentId: payment.id };
  } catch (error) {
    if (
      await one(
        "SELECT id FROM gateway_events WHERE gateway='Razorpay' AND event_id=?",
        [eventId],
      )
    )
      return { received: true, duplicate: true };
    throw error;
  }
}
