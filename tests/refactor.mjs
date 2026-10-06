import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile, readdir } from "node:fs/promises";
import { randomUUID, randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { PDFDocument } from "pdf-lib";
const require = createRequire(import.meta.url),
  { Miniflare } = createRequire(require.resolve("wrangler"))("miniflare");
const files = (await readdir("dist/server", { recursive: true }))
  .filter((f) => f.endsWith(".js"))
  .sort((a, b) => (a === "index.js" ? -1 : b === "index.js" ? 1 : 0));
const secret = randomBytes(32).toString("hex"),
  tenant = "70a45679-cbbd-48aa-a126-34c73d631853",
  owner = "tejomaya@mvdt.in";
let cookie = "",
  checks = 0,
  delivered = false,
  deliveryStarted = false;
const mf = new Miniflare({
  modules: files.map((f) => ({
    type: "ESModule",
    path: resolve("dist/server", f),
  })),
  modulesRoot: resolve("dist/server"),
  compatibilityDate: "2026-05-15",
  compatibilityFlags: ["nodejs_compat"],
  d1Databases: { DB: "refactor" },
  r2Buckets: ["BUCKET"],
  bindings: {
    PLATFORM_OWNER_EMAIL: owner,
    JOB_SECRET: secret,
    PROVIDER_ENCRYPTION_KEY: randomBytes(32).toString("hex"),
  },
  outboundService: async (request) => {
    if (new URL(request.url).hostname === "notify.example.test") {
      deliveryStarted = true;
      await new Promise((r) => setTimeout(r, 1500));
      delivered = true;
      return Response.json({ id: "mock-delivered" });
    }
    throw new Error("Unexpected outbound request " + request.url);
  },
});
const check = (name, fn) => {
  fn();
  checks++;
  console.log("PASS " + name);
};
async function req(
  path,
  {
    email = owner,
    method = "GET",
    body,
    status = 200,
    extra = {},
    raw = false,
    tenantId = tenant,
  } = {},
) {
  const response = await mf.dispatchFetch("https://campus.test/api/" + path, {
    method,
    headers: {
      "oai-authenticated-user-email": email,
      "x-institution-id": tenantId,
      ...(cookie && email === owner ? { cookie } : {}),
      ...(body
        ? { "Content-Type": "application/json", origin: "https://campus.test" }
        : {}),
      ...(method === "POST" &&
      /^(payments|fees|invoices|refunds|cash)(\/|$)/.test(path)
        ? { "Idempotency-Key": body?.idempotencyKey || randomUUID() }
        : {}),
      ...extra,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (raw && response.status === 202 && path.includes("documents/receipt/")) {
    await response.text();
    await new Promise((r) => setTimeout(r, 100));
    return req(path, { email, method, body, status, raw, tenantId, extra });
  }
  if (raw) {
    if (status !== null) assert.equal(response.status, status, path);
    return response;
  }
  const result = await response.json();
  assert.equal(response.status, status, path + " " + JSON.stringify(result));
  return result.data ?? result;
}
try {
  const db = await mf.getD1Database("DB");
  for (const file of (await readdir("drizzle"))
    .filter((f) => f.endsWith(".sql"))
    .sort())
    for (const statement of (await readFile("drizzle/" + file, "utf8"))
      .split("--> statement-breakpoint")
      .filter((s) => s.trim()))
      await db.prepare(statement).run();
  await req("session");
  const support = await req("platform/institutions/" + tenant + "/support", {
    method: "POST",
    body: { reason: "Architecture regression checks" },
    raw: true,
  });
  cookie = support.headers.get("set-cookie").split(";")[0];
  const boot = await req("bootstrap"),
    year = boot.years[0].id,
    students = await req("students?year=" + year),
    student = students.rows[0].id;
  const initial = await req("students/" + student + "?year=" + year);
  const upgrade = await req("jobs/saas-upgrade", {
    method: "POST",
    body: {},
    extra: { authorization: "Bearer " + secret },
  });
  const replayUpgrade = await req("jobs/saas-upgrade", {
    method: "POST",
    body: {},
    extra: { authorization: "Bearer " + secret },
  });
  check("journal backfill is repeatable and preserves student balances", () => {
    assert.ok(upgrade.journal.backfilled > 0);
    assert.equal(replayUpgrade.journal.backfilled, 0);
  });
  const after = await req("students/" + student + "?year=" + year);
  check("historical balance unchanged and old events have two entries", () => {
    assert.equal(
      after.student.outstanding_paise,
      initial.student.outstanding_paise,
    );
    assert.ok(after.journal.length > 0);
    assert.equal(
      after.journal.reduce((n, r) => n + r.debit_paise - r.credit_paise, 0),
      0,
    );
  });
  await assert.rejects(
    () => db.prepare("UPDATE journal_events SET amount_paise=1").run(),
    /IMMUTABLE/,
  );
  await assert.rejects(
    () => db.prepare("DELETE FROM journal_events").run(),
    /IMMUTABLE/,
  );
  checks++;
  console.log("PASS journal rows cannot be updated or deleted");
  const body = {
    studentId: student,
    yearId: year,
    amount: "0.29",
    method: "UPI",
    reference: "REFRACTOR-29",
    idempotencyKey: randomUUID(),
  };
  await req("payments", {
    method: "POST",
    body,
    extra: { "Idempotency-Key": "" },
    status: 400,
  });
  await req("payments", {
    method: "POST",
    body,
    extra: { "Idempotency-Key": "not-a-uuid" },
    status: 400,
  });
  await req("payments", {
    method: "POST",
    body,
    extra: { "Idempotency-Key": randomUUID() },
    status: 409,
  });
  checks++;
  console.log(
    "PASS financial routes reject missing, malformed and mismatched headers",
  );
  const results = await Promise.all(
    [0, 1].map(() =>
      req("payments", { method: "POST", body, raw: true, status: null }),
    ),
  );
  // Concurrent loser may return the completed cached response or an in-progress conflict.
  assert.ok(results.every((r) => [200, 409].includes(r.status)));
  const successful = results.filter((r) => r.status === 200);
  assert.ok(successful.length >= 1);
  const payment = await req("payments", { method: "POST", body });
  const count = await db
    .prepare(
      "SELECT COUNT(*) n FROM payments WHERE institution_id=? AND idempotency_key=?",
    )
    .bind(tenant, body.idempotencyKey)
    .first();
  check("concurrent retry commits one payment", () => assert.equal(count.n, 1));
  await req("payments", {
    method: "POST",
    body: { ...body, amount: "0.30" },
    status: 409,
  });
  checks++;
  console.log("PASS a reused key cannot change the amount");
  const refundBody = {
      paymentId: payment.payment.id,
      amount: "0.10",
      reason: "Regression partial reversal",
      method: "UPI",
      idempotencyKey: randomUUID(),
    },
    refund = await req("refunds", { method: "POST", body: refundBody }),
    repeatedRefund = await req("refunds", { method: "POST", body: refundBody });
  check("refund retries reuse the original request", () =>
    assert.equal(refund.id, repeatedRefund.id),
  );
  const approveKey = randomUUID();
  await req("refunds/" + refund.id + "/approve", {
    method: "POST",
    body: { reference: "REFUND-VERIFIED", idempotencyKey: approveKey },
  });
  await req("refunds/" + refund.id + "/approve", {
    method: "POST",
    body: { reference: "REFUND-VERIFIED", idempotencyKey: approveKey },
  });
  const reversal = await db
    .prepare(
      "SELECT * FROM journal_events WHERE institution_id=? AND event_type='REVERSAL_ISSUED' ORDER BY created_at DESC LIMIT 1",
    )
    .bind(tenant)
    .first();
  check(
    "refund appends a linked reversal without rewriting the payment",
    () => {
      assert.equal(reversal.amount_paise, 10);
      assert.ok(reversal.reversal_of.startsWith("journal:"));
    },
  );
  const pdfResponse = await req(
      "documents/receipt/" + payment.receipt.id + "?format=thermal",
      { raw: true },
    ),
    pdf = await PDFDocument.load(await pdfResponse.arrayBuffer());
  check("thermal receipt has an 80mm page width", () =>
    assert.ok(Math.abs(pdf.getPage(0).getWidth() - (80 * 72) / 25.4) < 0.01),
  );
  const settings = structuredClone(boot.institution.settings || {});
  settings.upi = { payeeId: "school@bank", payeeName: "Test School" };
  settings.receiptNotifications = { enabled: true, channel: "SMS" };
  await db
    .prepare("UPDATE institutions SET settings=? WHERE id=?")
    .bind(JSON.stringify(settings), tenant)
    .run();
  const invoice = initial.invoices[0].id;
  const demand = await req("documents/invoice/" + invoice, { raw: true });
  check("unpaid demand with UPI configuration generates a real PDF", () =>
    assert.equal(demand.headers.get("Content-Type"), "application/pdf"),
  );
  for (const [role, email] of [
    ["FEE_COUNTER_CASHIER", "cashier@example.test"],
    ["AUDITOR", "auditor@example.test"],
  ]) {
    await req("users/invite", {
      method: "POST",
      body: { role, email, fullName: role },
    });
    await req("bootstrap", { email });
  }
  await req("payments", {
    email: "cashier@example.test",
    method: "POST",
    body: {
      ...body,
      amount: "1",
      reference: "CASHIER-COLLECTION",
      idempotencyKey: randomUUID(),
    },
  });
  await req("payments/" + payment.payment.id + "/cancel", {
    email: "cashier@example.test",
    method: "POST",
    body: {},
    status: 403,
  });
  await req("fees/adjust", {
    email: "cashier@example.test",
    method: "POST",
    body: {},
    status: 403,
  });
  await req("reports/collections?year=" + year, {
    email: "auditor@example.test",
  });
  await req("reports/outstanding?year=" + year, {
    email: "auditor@example.test",
  });
  await req("reports/summary?year=" + year, { email: "auditor@example.test" });
  await req("students", { email: "auditor@example.test", status: 403 });
  await req("payments", {
    email: "auditor@example.test",
    method: "POST",
    body,
    status: 403,
  });
  checks++;
  console.log(
    "PASS cashier can collect and auditor can report without mutation privileges",
  );
  const report = await req("dashboard?year=" + year);
  check("aging buckets use persisted outstanding installments", () => {
    assert.equal(report.aging.length, 4);
    assert.equal(
      report.aging.reduce((n, r) => n + r.amount, 0),
      report.kpi.overdue,
    );
  });
  const closure = await req("cash?campus=" + boot.campuses[0].id),
    closureBody = {
      kind: "Close",
      campusId: closure.campusId,
      yearId: year,
      date: closure.date,
      denominations: { 500: 0 },
      expectedPaise: closure.expected,
      notes: "Counted in regression test",
      idempotencyKey: randomUUID(),
    };
  await req("cash", {
    method: "POST",
    body: { ...closureBody, denominations: { 500: 0.5 } },
    status: 422,
  });
  await req("cash", {
    method: "POST",
    body: {
      ...closureBody,
      expectedPaise: closure.expected + 100,
      idempotencyKey: randomUUID(),
    },
    status: 409,
  });
  await req("cash", {
    email: "cashier@example.test",
    method: "POST",
    body: closureBody,
  });
  checks++;
  console.log(
    "PASS closure validates counts and rejects stale register totals",
  );
  await assert.rejects(
    () =>
      db
        .prepare(
          "UPDATE cash_closings SET counted_paise=999 WHERE institution_id=?",
        )
        .bind(tenant)
        .run(),
    /IMMUTABLE/,
  );
  checks++;
  console.log("PASS counted cash and variance cannot be overwritten");
  await req("providers", {
    method: "POST",
    body: {
      provider: "SMS",
      mode: "test",
      config: { url: "https://notify.example.test/send", token: "local-test" },
    },
  });
  const start = performance.now();
  await req("payments", {
    method: "POST",
    body: {
      ...body,
      amount: "1",
      reference: "ASYNC",
      idempotencyKey: randomUUID(),
    },
  });
  const elapsed = performance.now() - start;
  check("payment response returns before notification delivery completes", () =>
    assert.equal(delivered, false),
  );
  console.log(
    "Payment response with delayed provider:",
    Math.round(elapsed),
    "ms",
  );
  const outbox = await db
    .prepare(
      "SELECT COUNT(*) n FROM notification_outbox WHERE institution_id=?",
    )
    .bind(tenant)
    .first();
  check("notification work is persisted with successful payments", () =>
    assert.ok(outbox.n >= 3),
  );
  const journal = await db
    .prepare(
      "SELECT SUM(debit_paise)-SUM(credit_paise) balance,COUNT(*) n FROM journal_postings WHERE institution_id=?",
    )
    .bind(tenant)
    .first();
  check("all financial postings remain double-entry balanced", () => {
    assert.equal(journal.balance, 0);
    assert.ok(journal.n > 10);
  });
  console.log("Architecture checks passed:", checks);
} finally {
  await mf.dispose();
}
