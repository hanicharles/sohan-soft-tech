// Uses a disposable D1/R2/Queue runtime and mocked provider responses only.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile, readdir } from "node:fs/promises";
import { randomBytes, randomUUID, createHmac } from "node:crypto";
import { resolve } from "node:path";
import { PDFDocument } from "pdf-lib";
const require = createRequire(import.meta.url),
  { Miniflare } = createRequire(require.resolve("wrangler"))("miniflare");
const files = (await readdir("dist/server", { recursive: true }))
  .filter((f) => f.endsWith(".js"))
  .sort((a, b) => (a === "index.js" ? -1 : b === "index.js" ? 1 : 0));
const owner = "tejomaya@mvdt.in",
  admin = "advanced-admin@example.test",
  jobSecret = randomBytes(32).toString("hex"),
  gatewaySecret = randomBytes(32).toString("hex"),
  webhookSecret = randomBytes(32).toString("hex");
const orders = new Map(),
  deliveries = [];
const mf = new Miniflare({
  modules: files.map((f) => ({
    type: "ESModule",
    path: resolve("dist/server", f),
  })),
  modulesRoot: resolve("dist/server"),
  compatibilityDate: "2026-05-15",
  compatibilityFlags: ["nodejs_compat"],
  d1Databases: { DB: "advanced" },
  r2Buckets: ["BUCKET"],
  queueProducers: { COMMUNICATION_QUEUE: "communications" },
  queueConsumers: { communications: { maxBatchSize: 1, maxBatchTimeout: 0 } },
  bindings: {
    PLATFORM_OWNER_EMAIL: owner,
    JOB_SECRET: jobSecret,
    PROVIDER_ENCRYPTION_KEY: randomBytes(32).toString("hex"),
  },
  outboundService: async (req) => {
    const u = new URL(req.url);
    if (u.hostname === "api.razorpay.com" && u.pathname === "/v1/orders") {
      const data = await req.json(),
        id = "order_" + randomUUID();
      orders.set(id, data);
      return Response.json({ id, amount: data.amount, currency: "INR" });
    }
    if (
      u.hostname === "api.razorpay.com" &&
      u.pathname.startsWith("/v1/payments/")
    ) {
      const id = u.pathname.split("/").at(-1),
        order = [...orders].find(([key]) => id === "captured_" + key);
      return Response.json({
        id,
        order_id: order?.[0],
        amount: order?.[1].amount,
        currency: "INR",
        status: "captured",
      });
    }
    if (
      u.hostname === "notify.example.test" ||
      u.hostname === "graph.facebook.com"
    ) {
      deliveries.push(await req.json());
      return Response.json({
        id: "mock-delivery",
        messages: [{ id: "meta-mock" }],
      });
    }
    throw new Error("Unexpected network request " + req.url);
  },
});
let tenant,
  checks = 0;
const check = (name, fn = () => {}) => {
  fn();
  checks++;
  console.log("PASS " + name);
};
async function req(
  path,
  {
    email = admin,
    method = "GET",
    body,
    status = 200,
    raw = false,
    headers = {},
    tenantId = tenant,
  } = {},
) {
  const response = await mf.dispatchFetch("https://campus.test/api/" + path, {
    method,
    headers: {
      "oai-authenticated-user-email": email,
      ...(tenantId ? { "x-institution-id": tenantId } : {}),
      ...(body
        ? { "content-type": "application/json", origin: "https://campus.test" }
        : {}),
      ...(method === "POST"
        ? { "Idempotency-Key": body?.idempotencyKey || randomUUID() }
        : {}),
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (raw) {
    assert.equal(
      response.status,
      status,
      path + " " + (response.status === status ? "" : await response.text()),
    );
    return response;
  }
  const result = await response.json();
  assert.equal(response.status, status, path + " " + JSON.stringify(result));
  return result.data ?? result;
}
const post = (path, body, extra = {}) =>
  req(path, { method: "POST", body, ...extra });
const sign = (secret, raw) =>
  createHmac("sha256", secret).update(raw).digest("hex");
const eventually = async (fn) => {
  for (let i = 0; i < 50; i++) {
    const value = await fn();
    if (value) return value;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("Background operation did not complete");
};
try {
  const db = await mf.getD1Database("DB");
  for (const file of (await readdir("drizzle"))
    .filter((f) => f.endsWith(".sql"))
    .sort())
    for (const sql of (await readFile("drizzle/" + file, "utf8"))
      .split("--> statement-breakpoint")
      .filter((s) => s.trim()))
      await db.prepare(sql).run();
  await req("session", { email: owner });
  const testSchool = "70a45679-cbbd-48aa-a126-34c73d631853",
    original = await db
      .prepare("SELECT COUNT(*) count FROM students WHERE institution_id=?")
      .bind(testSchool)
      .first();
  const institution = await post(
    "platform/institutions",
    {
      name: "Advanced Integration School",
      institutionCode: "ADV-QA",
      institutionType: "School",
      adminName: "Advanced Admin",
      adminEmail: admin,
      adminMobile: "9876543210",
      planId: "plan-starter",
      subscriptionStatus: "Active",
      subscriptionStart: "2026-06-01",
      subscriptionEnd: "2027-05-31",
      setupAcademic: true,
    },
    { email: owner },
  );
  tenant = institution.id;
  const second = await post(
    "platform/institutions",
    {
      name: "Isolated Integration School",
      institutionCode: "ISO-QA",
      institutionType: "School",
      adminName: "Isolated Admin",
      adminEmail: "isolated@example.test",
      adminMobile: "9876543210",
      planId: "plan-starter",
      subscriptionStatus: "Active",
      subscriptionStart: "2026-06-01",
      subscriptionEnd: "2027-05-31",
      setupAcademic: true,
    },
    { email: owner },
  );
  await req("bootstrap", {
    email: "isolated@example.test",
    tenantId: second.id,
  });
  const boot = await req("bootstrap"),
    year = boot.years[0].id,
    section = boot.sections[0];
  const student = await post("students", {
    name: "Portal Student",
    admissionNumber: "ADV-001",
    yearId: year,
    sectionId: section.id,
    parentName: "Portal Guardian",
    mobile: "9876543201",
    email: "parent@example.test",
  });
  const sibling = await post("students", {
    name: "Other Family Student",
    admissionNumber: "ADV-002",
    yearId: year,
    sectionId: section.id,
    parentName: "Other Guardian",
    mobile: "9876543202",
  });
  const profile = await req("students/" + student.id + "?year=" + year),
    parentId = profile.student.parent_id;
  const component = await post("catalog/components", {
    name: "Tuition QA",
    category: "Academic",
  });
  const structure = await post("catalog/structures", {
    name: "Annual QA tuition",
    yearId: year,
    classId: section.class_id,
    sectionId: section.id,
    frequency: "Annual",
    dates: ["2026-10-10"],
    items: [{ componentId: component.id, amount: "10000" }],
  });
  await post("fees/assign", {
    studentId: student.id,
    structureId: structure.id,
  });
  const grant = await post("parent-links", { parentId, days: 1 }),
    portal = "parent-access/" + grant.token;
  const view = await req(portal, { email: "" });
  check(
    "signed portal exposes only the linked child and persisted fee breakdown",
    () => {
      assert.equal(view.children.length, 1);
      assert.equal(view.children[0].id, student.id);
      assert.equal(view.items[0].name, "Tuition QA");
      assert.equal(view.balance.outstanding_paise, 1000000);
    },
  );
  await req(portal + "?student=" + sibling.id, { email: "", status: 404 });
  await req(
    "parent-access/" +
      grant.token.slice(0, -1) +
      (grant.token.endsWith("0") ? "1" : "0"),
    { email: "", status: 401 },
  );
  check("parent cannot switch to another guardian child or tamper with token");
  const portalPage = await mf.dispatchFetch(
    "https://campus.test/portal/" + grant.token,
  );
  check("token page routes securely without authentication", () => {
    assert.equal(portalPage.status, 200);
    assert.equal(portalPage.headers.get("referrer-policy"), "no-referrer");
    assert.match(portalPage.headers.get("cache-control"), /no-store/);
  });
  await post("providers", {
    provider: "Razorpay",
    mode: "test",
    config: { keyId: "rzp_test_mock", keySecret: gatewaySecret, webhookSecret },
  });
  const key = randomUUID(),
    checkoutBody = {
      studentId: student.id,
      yearId: year,
      amount: "800.01",
      idempotencyKey: key,
    };
  await post(portal + "/checkout", checkoutBody, {
    email: "",
    headers: { "Idempotency-Key": "" },
    status: 400,
  });
  const order = await post(portal + "/checkout", checkoutBody, { email: "" }),
    replayOrder = await post(portal + "/checkout", checkoutBody, { email: "" });
  check(
    "checkout idempotency reuses one real server intent and mocked gateway order",
    () => {
      assert.equal(order.paymentId, replayOrder.paymentId);
      assert.equal(orders.size, 1);
      assert.equal(orders.get(order.id).amount, 80001);
    },
  );
  const capturedId = "captured_" + order.id;
  await post(
    portal + "/verify",
    {
      paymentId: order.paymentId,
      razorpay_order_id: order.id,
      razorpay_payment_id: capturedId,
      razorpay_signature: "0".repeat(64),
    },
    { email: "", status: 400 },
  );
  const event = {
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: capturedId,
            order_id: order.id,
            amount: 80001,
            currency: "INR",
            status: "captured",
          },
        },
      },
    },
    eventRaw = JSON.stringify(event),
    eventHeaders = {
      "x-razorpay-signature": sign(webhookSecret, eventRaw),
      "x-razorpay-event-id": "adv-captured",
    };
  await post("payments/webhook", event, {
    email: "",
    headers: { ...eventHeaders, "x-razorpay-signature": "0".repeat(64) },
    status: 400,
  });
  await post("payments/webhook", event, { email: "", headers: eventHeaders });
  await post("payments/webhook", event, { email: "", headers: eventHeaders });
  await post(
    portal + "/verify",
    {
      paymentId: order.paymentId,
      razorpay_order_id: order.id,
      razorpay_payment_id: capturedId,
      razorpay_signature: sign(gatewaySecret, order.id + "|" + capturedId),
    },
    { email: "" },
  );
  const paid = await req(portal, { email: "" }),
    receipt = paid.receipts[0];
  check(
    "verified capture and repeated callbacks produce one receipt and balanced journal",
    () => {
      assert.equal(paid.balance.outstanding_paise, 919999);
      assert.equal(paid.receipts.length, 1);
    },
  );
  const postings = await db
    .prepare(
      "SELECT COUNT(*) count,SUM(p.debit_paise-p.credit_paise) balance FROM journal_postings p JOIN journal_events e ON e.id=p.event_id WHERE e.institution_id=? AND e.event_type='PAYMENT_RECEIVED'",
    )
    .bind(tenant)
    .first();
  check("gateway confirmation creates both ledger legs atomically", () => {
    assert.equal(postings.count, 2);
    assert.equal(postings.balance, 0);
  });
  await eventually(() =>
    db
      .prepare(
        "SELECT id FROM document_artifacts WHERE institution_id=? AND receipt_id=?",
      )
      .bind(tenant, receipt.id)
      .first(),
  );
  const pdf = await req(portal + "/receipts/" + receipt.id, {
    email: "",
    raw: true,
  });
  check("Queue consumer produces a parent-downloadable receipt PDF", () =>
    assert.equal(pdf.headers.get("content-type"), "application/pdf"),
  );
  assert.ok(
    (await PDFDocument.load(await pdf.arrayBuffer())).getPageCount() > 0,
  );
  await req(
    portal +
      "/certificates/tuition?student=" +
      student.id +
      "&financialYear=2026",
    { email: "", status: 409 },
  );
  await post("certificates/tuition-allocations", {
    paymentId: order.paymentId,
    amount: "700.01",
    reason: "Tuition component evidence checked by supervisor",
  });
  const certificate = await req(
    portal +
      "/certificates/tuition?student=" +
      student.id +
      "&financialYear=2026",
    { email: "", raw: true },
  );
  assert.ok(
    (await PDFDocument.load(await certificate.arrayBuffer())).getPageCount() >
      0,
  );
  check("annual tuition requires approved amounts and produces a real PDF");
  await req(
    portal +
      "/certificates/tuition?student=" +
      sibling.id +
      "&financialYear=2026",
    { email: "", status: 404 },
  );
  await assert.rejects(
    () =>
      db
        .prepare(
          "UPDATE tuition_allocations SET amount_paise=1 WHERE institution_id=?",
        )
        .bind(tenant)
        .run(),
    /IMMUTABLE/,
  );
  check("tuition approval cannot be overwritten");
  const donationPdf = await PDFDocument.create();
  donationPdf
    .addPage()
    .drawText("Official certificate fixture, not a legal certificate");
  const donation = await post("certificates/donations", {
    parentId,
    financialYear: 2026,
    donationReference: "DON-TEST",
    amount: "100",
    urn: "URN-TEST",
    doneePan: "ABCDE1234F",
    form10bdAcknowledgement: "ACK-TEST",
    approved: true,
    pdfBase64: Buffer.from(await donationPdf.save()).toString("base64"),
  });
  await req(portal + "/certificates/80g/" + donation.id, {
    email: "",
    raw: true,
  });
  check("official donation documents are separate from tuition receipts");
  await post("parent-links/" + grant.id + "/revoke", {});
  await req(portal, { email: "", status: 401 });
  const expired = await post("parent-links", { parentId, days: 1 });
  await db
    .prepare(
      "UPDATE parent_portal_grants SET expires_at='2000-01-01' WHERE id=?",
    )
    .bind(expired.id)
    .run();
  await req("parent-access/" + expired.token, { email: "", status: 401 });
  check("revoked and expired grants fail closed");
  const org = await post(
    "platform/organizations",
    {
      name: "QA Education Trust",
      adminEmail: "trust@example.test",
      institutionIds: [tenant],
    },
    { email: owner },
  );
  await req("session", { email: "trust@example.test" });
  const report = await req("organizations/" + org.id + "/reports", {
    email: "trust@example.test",
  });
  check("trust report consolidates only explicitly assigned campuses", () => {
    assert.equal(report.rows.length, 1);
    assert.equal(report.rows[0].id, tenant);
    assert.equal(report.totals.collected_paise, 80001);
  });
  await req("organizations/" + org.id + "/reports", {
    email: "isolated@example.test",
    status: 403,
  });
  await req("students", { email: "trust@example.test", status: 403 });
  check(
    "trust reporting membership grants no campus write or foreign trust access",
  );
  const install = await db
    .prepare(
      "SELECT id FROM installments WHERE institution_id=? AND student_id=?",
    )
    .bind(tenant, student.id)
    .first();
  const device = await post("hardware/devices", { name: "QA Bus Reader" });
  await post("hardware/cards", { studentId: student.id, uid: "A1B2C3D4" });
  await post("hardware/rules", {
    studentId: student.id,
    installmentId: install.id,
    service: "Transport",
    amount: "25.25",
    active: true,
  });
  const payload = {
      eventId: "rfid-event-001",
      uid: "A1B2C3D4",
      punchedAt: new Date().toISOString(),
      direction: "IN",
    },
    ts = String(Math.floor(Date.now() / 1000)),
    nonce = randomUUID().replaceAll("-", ""),
    rfidHeaders = {
      "x-device-id": device.id,
      "x-timestamp": ts,
      "x-nonce": nonce,
      "x-signature": sign(
        device.secret,
        ts + "." + nonce + "." + JSON.stringify(payload),
      ),
    };
  await post("hardware/rfid-punch", payload, {
    email: "",
    headers: { ...rfidHeaders, "x-signature": "invalid" },
    status: 401,
  });
  const punch = await post("hardware/rfid-punch", payload, {
    email: "",
    headers: rfidHeaders,
  });
  await post("hardware/rfid-punch", payload, {
    email: "",
    headers: rfidHeaders,
  });
  const payload2 = { ...payload, eventId: "rfid-event-002" },
    nonce2 = randomUUID().replaceAll("-", "");
  await post("hardware/rfid-punch", payload2, {
    email: "",
    headers: {
      ...rfidHeaders,
      "x-nonce": nonce2,
      "x-signature": sign(
        device.secret,
        ts + "." + nonce2 + "." + JSON.stringify(payload2),
      ),
    },
  });
  const charged = await db
    .prepare(
      "SELECT COUNT(*) count,SUM(amount_paise) amount FROM daily_fee_charges WHERE institution_id=?",
    )
    .bind(tenant)
    .first();
  check(
    "RFID HMAC and replay protection charge a daily service exactly once",
    () => {
      assert.equal(punch.chargedPaise, 2525);
      assert.equal(charged.count, 1);
      assert.equal(charged.amount, 2525);
    },
  );
  const changed = { ...payload, direction: "OUT" };
  await post("hardware/rfid-punch", changed, {
    email: "",
    headers: {
      ...rfidHeaders,
      "x-signature": sign(
        device.secret,
        ts + "." + nonce + "." + JSON.stringify(changed),
      ),
    },
    status: 409,
  });
  check("same hardware event with different content is rejected");
  const date = new Date(Date.now() + 19800000).toISOString().slice(0, 10),
    bankRows = [
      {
        date,
        reference: "NEFT-ADV-001",
        amount: "100.01",
        direction: "Credit",
        admissionNumber: "ADV-001",
        narration: "NEFT deposit",
      },
      {
        date,
        reference: "NEFT-UNKNOWN",
        amount: "10",
        direction: "Credit",
        narration: "Unknown payer",
      },
    ];
  const preview = await post("reconciliation/bank-preview", {
    yearId: year,
    rows: bankRows,
  });
  check(
    "bank matching requires a unique identity and does not guess by amount",
    () => {
      assert.equal(preview.rows[0].status, "Ready");
      assert.equal(preview.rows[1].status, "Unmatched");
    },
  );
  const committed = await post("reconciliation/bank-commit", {
    batchId: preview.id,
    postMatchedDues: true,
    reason: "Bank statement manually verified by accountant",
  });
  check(
    "approved bank imports post receipts while unmatched rows remain reviewable",
    () => {
      assert.equal(committed.rows[0].status, "Posted & matched");
      assert.equal(committed.rows[1].status, "Unmatched");
      assert.equal(committed.failed, 0);
    },
  );
  const duplicate = await post("reconciliation/bank-commit", {
    batchId: preview.id,
    postMatchedDues: true,
    reason: "Retry after browser connection interruption",
  });
  check("bank reference deduplication prevents double posting on retries", () =>
    assert.ok(duplicate.rows.every((r) => r.status === "Duplicate")),
  );
  await post(
    "reconciliation/bank-preview",
    { yearId: year, rows: [bankRows[0], bankRows[0]] },
    { status: 422 },
  );
  await post(
    "reconciliation/bank-commit",
    {
      batchId: preview.id,
      postMatchedDues: true,
      reason: "Attempting another campus batch",
    },
    { email: "isolated@example.test", tenantId: second.id, status: 404 },
  );
  check("bank batches reject duplicated rows and foreign institution IDs");
  const tally = await req("reports/tally?year=" + year, { raw: true }),
    xml = await tally.text();
  check(
    "Tally export includes balanced financial vouchers and transport income",
    () => {
      assert.match(xml, /<TALLYREQUEST>Import Data/);
      assert.match(xml, /Tuition QA/);
      assert.match(xml, /Transport Fee Income/);
      assert.match(xml, /<AMOUNT>-100.01<\/AMOUNT>/);
    },
  );
  const smsConfig = {
    enabled: true,
    entityId: "ENTITY-REGISTERED",
    senderId: "SSTFEES",
    templates: Object.fromEntries(
      ["before7", "before3", "before1", "after1"].map((k) => [
        k,
        {
          id: "DLT-" + k,
          body: "{institution}: {student} fee {amount} is due on {date}.",
        },
      ]),
    ),
  };
  await post("communications", smsConfig);
  await post("communications/consent", {
    parentId,
    consent: true,
    reason: "Guardian opted in via signed admission form",
  });
  await post("providers", {
    provider: "SMS",
    mode: "test",
    config: { url: "https://notify.example.test/sms", token: "mock-token" },
  });
  const due = new Date(Date.parse(date) + 7 * 86400000)
    .toISOString()
    .slice(0, 10);
  await db
    .prepare("UPDATE installments SET due_date=? WHERE id=?")
    .bind(due, install.id)
    .run();
  await post("jobs", {});
  await post("jobs", {});
  const reminder = await eventually(() =>
    db
      .prepare(
        "SELECT * FROM notifications WHERE institution_id=? AND dedupe_key LIKE 'dlt:%:before7'",
      )
      .bind(tenant)
      .first(),
  );
  await eventually(() =>
    db
      .prepare("SELECT id FROM notifications WHERE id=? AND status='Sent'")
      .bind(reminder.id)
      .first(),
  );
  check(
    "7-day reminders retain DLT IDs, consent and dedupe across repeated jobs",
    () => {
      assert.equal(JSON.parse(reminder.metadata).dlt.templateId, "DLT-before7");
      assert.ok(
        deliveries.some((d) => d.dlt?.entityId === "ENTITY-REGISTERED"),
      );
    },
  );
  for (const days of [3, 1]) {
    const dueDate = new Date(Date.parse(date) + days * 86400000)
      .toISOString()
      .slice(0, 10);
    await db
      .prepare("UPDATE installments SET due_date=? WHERE id=?")
      .bind(dueDate, install.id)
      .run();
    await post("jobs", {});
    const row = await db
      .prepare(
        "SELECT metadata FROM notifications WHERE institution_id=? AND dedupe_key=?",
      )
      .bind(tenant, `dlt:${install.id}:${dueDate}:before${days}`)
      .first();
    check(`${days}-day reminder uses its registered stage template`, () =>
      assert.equal(
        JSON.parse(row.metadata).dlt.templateId,
        `DLT-before${days}`,
      ),
    );
  }
  await post("communications/consent", {
    parentId,
    consent: false,
    reason: "Guardian withdrew SMS consent",
  });
  const overdueDate = new Date(Date.parse(date) - 86400000)
    .toISOString()
    .slice(0, 10);
  await db
    .prepare("UPDATE installments SET due_date=? WHERE id=?")
    .bind(overdueDate, install.id)
    .run();
  await post("jobs", {});
  const blocked = await db
    .prepare(
      "SELECT id FROM notifications WHERE institution_id=? AND dedupe_key=?",
    )
    .bind(tenant, `dlt:${install.id}:${overdueDate}:after1`)
    .first();
  check("withdrawn SMS consent prevents new automatic dispatch", () =>
    assert.equal(blocked, null),
  );
  const waSecret = randomBytes(32).toString("hex");
  await post("providers", {
    provider: "WhatsApp",
    mode: "test",
    config: {
      adapter: "Meta",
      url: "https://graph.facebook.com/v23.0/123456/messages",
      token: "mock-wa-token",
      phoneNumberId: "123456",
      appSecret: waSecret,
      verifyToken: "verify-test",
    },
  });
  const wa = {
      object: "whatsapp_business_account",
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: "123456" },
                messages: [
                  {
                    id: "wa-adv-1",
                    from: "919876543201",
                    timestamp: ts,
                    type: "text",
                    text: { body: "FEES" },
                  },
                ],
              },
            },
          ],
        },
      ],
    },
    waRaw = JSON.stringify(wa);
  await post("webhooks/whatsapp/" + tenant, wa, {
    email: "",
    headers: { "x-hub-signature-256": "sha256=" + sign(waSecret, waRaw) },
  });
  await post("webhooks/whatsapp/" + tenant, wa, {
    email: "",
    headers: { "x-hub-signature-256": "sha256=" + sign(waSecret, waRaw) },
  });
  await post("webhooks/whatsapp/" + tenant, wa, {
    email: "",
    status: 401,
    headers: { "x-hub-signature-256": "sha256=" + "0".repeat(64) },
  });
  const wrongPhone = structuredClone(wa);
  wrongPhone.entry[0].changes[0].value.metadata.phone_number_id = "999999";
  await post("webhooks/whatsapp/" + tenant, wrongPhone, {
    email: "",
    status: 403,
    headers: {
      "x-hub-signature-256":
        "sha256=" + sign(waSecret, JSON.stringify(wrongPhone)),
    },
  });
  check("WhatsApp rejects forged signatures and another campus business phone");
  const bot = await db
    .prepare(
      "SELECT message FROM notifications WHERE institution_id=? AND dedupe_key='wa-reply:wa-adv-1'",
    )
    .bind(tenant)
    .first();
  check(
    "signed WhatsApp FEES request returns only the sender guardian children",
    () => {
      assert.match(bot.message, /ADV-001/);
      assert.doesNotMatch(bot.message, /ADV-002/);
      assert.match(bot.message, /UPI QR/);
    },
  );
  const foreign = structuredClone(wa);
  foreign.entry[0].changes[0].value.messages[0] = {
    id: "wa-adv-2",
    from: "919876543202",
    timestamp: ts,
    type: "text",
    text: { body: "ADV-001" },
  };
  await post("webhooks/whatsapp/" + tenant, foreign, {
    email: "",
    headers: {
      "x-hub-signature-256":
        "sha256=" + sign(waSecret, JSON.stringify(foreign)),
    },
  });
  const hidden = await db
    .prepare(
      "SELECT message FROM notifications WHERE institution_id=? AND dedupe_key='wa-reply:wa-adv-2'",
    )
    .bind(tenant)
    .first();
  check("admission number alone never reveals another family fees", () =>
    assert.doesNotMatch(hidden.message, /ADV-001|800|portal\//),
  );
  const target = await post("catalog/years", {
      name: "2027–28",
      startDate: "2027-06-01",
      endDate: "2028-05-31",
      status: "Draft",
    }),
    nextClass = await post("catalog/classes", {
      name: "QA Next Grade",
      level: "School",
    }),
    nextSection = await post("catalog/sections", {
      name: "Next A",
      yearId: target.id,
      classId: nextClass.id,
      campusId: boot.campuses[0].id,
    });
  const rollBody = {
    sourceYearId: year,
    targetYearId: target.id,
    mapping: { [section.id]: nextSection.id },
    reason: "Approved annual promotion and balance transfer",
  };
  const review = await post("rollovers/preview", rollBody);
  await post(
    "rollovers/start",
    { ...rollBody, fingerprint: "0".repeat(64) },
    { status: 409 },
  );
  const rollover = await post("rollovers/start", {
    ...rollBody,
    fingerprint: review.fingerprint,
  });
  await post(
    "payments",
    {
      studentId: student.id,
      yearId: year,
      amount: "1",
      method: "Cash",
      idempotencyKey: randomUUID(),
    },
    { status: 409 },
  );
  await assert.rejects(
    () =>
      db
        .prepare("UPDATE academic_years SET status='Active' WHERE id=?")
        .bind(year)
        .run(),
    /FROZEN/,
  );
  check(
    "rollover freezes source year and rejects stale previews or new payments",
  );
  const before = await db
    .prepare(
      "SELECT COALESCE(SUM(debit_paise-credit_paise),0) balance FROM ledger_entries WHERE institution_id=?",
    )
    .bind(tenant)
    .first();
  const processed = await post("rollovers/" + rollover.id + "/process", {});
  await post("rollovers/" + rollover.id + "/process", {});
  const after = await db
    .prepare(
      "SELECT COALESCE(SUM(debit_paise-credit_paise),0) balance FROM ledger_entries WHERE institution_id=?",
    )
    .bind(tenant)
    .first();
  const next = await req("students/" + student.id + "?year=" + target.id);
  check(
    "resumable rollover transfers dues without duplicate income or balances",
    () => {
      assert.equal(processed.status, "Completed");
      assert.equal(before.balance, after.balance);
      assert.equal(next.student.outstanding_paise, review.outstanding);
    },
  );
  const carry = await db
    .prepare(
      "SELECT COUNT(*) count FROM journal_events WHERE institution_id=? AND event_type='BALANCE_TRANSFERRED'",
    )
    .bind(tenant)
    .first();
  assert.equal(carry.count, 2);
  check("carry-forward uses explicit clearing-account double entries");
  await assert.rejects(
    () =>
      db
        .prepare("DELETE FROM audit_logs WHERE institution_id=?")
        .bind(tenant)
        .run(),
    /IMMUTABLE/,
  );
  await assert.rejects(
    () =>
      db
        .prepare("DELETE FROM year_rollovers WHERE institution_id=?")
        .bind(tenant)
        .run(),
    /IMMUTABLE/,
  );
  check("supervisor evidence and rollover history remain immutable");
  const oldSchool = await db
    .prepare("SELECT COUNT(*) count FROM students WHERE institution_id=?")
    .bind(testSchool)
    .first();
  check("existing CampusLedger Test School data remains unchanged", () =>
    assert.equal(oldSchool.count, original.count),
  );
  console.log(`\n${checks} advanced checks passed.`);
} finally {
  await mf.dispose();
}
