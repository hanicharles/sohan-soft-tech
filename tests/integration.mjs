import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile, readdir } from "node:fs/promises";
import { randomBytes, randomUUID, createHmac } from "node:crypto";
import { resolve } from "node:path";
const require = createRequire(import.meta.url);
const { Miniflare } = createRequire(require.resolve("wrangler"))("miniflare");
const files = (await readdir("dist/server", { recursive: true }))
  .filter((f) => f.endsWith(".js"))
  .sort((a, b) => (a === "index.js" ? -1 : b === "index.js" ? 1 : 0));
const jobSecret = randomBytes(32).toString("hex");
const mf = new Miniflare({
  modules: files.map((f) => ({
    type: "ESModule",
    path: resolve("dist/server", f),
  })),
  modulesRoot: resolve("dist/server"),
  compatibilityDate: "2026-05-15",
  compatibilityFlags: ["nodejs_compat"],
  d1Databases: { DB: "integration" },
  r2Buckets: ["BUCKET"],
  bindings: {
    PROVIDER_ENCRYPTION_KEY: randomBytes(32).toString("hex"),
    JOB_SECRET: jobSecret,
    PLATFORM_OWNER_EMAIL: "owner@example.test",
  },
});
let checks = 0;
const check = (name, fn) => {
  fn();
  checks++;
  console.log("PASS " + name);
};
const identities = {
  // Production dispatch supplies a verified email without an account-ID header.
  admin: ["", "owner@example.test"],
  parent: ["qa-parent", "qa-parent@example.test"],
  accountant: ["qa-accountant", "qa-accountant@example.test"],
  teacher: ["qa-teacher", "qa-teacher@example.test"],
  stranger: ["qa-stranger", "stranger@example.test"],
  schoolAdmin: ["qa-school-admin", "qa-school-admin@example.test"],
  testOwner: ["current-test-owner-subject", "tejomaya@mvdt.in"],
};
let tenant;
const supportCookies = {};
async function request(
  path,
  {
    role = "admin",
    method = "GET",
    body,
    tenantId = tenant,
    headers = {},
    status = 200,
    raw = false,
  } = {},
) {
  const identity = identities[role];
  if (
    tenantId &&
    ["admin", "testOwner"].includes(role) &&
    !path.startsWith("platform/") &&
    !path.startsWith("jobs/") &&
    headers["oai-authenticated-user-email"] !== ""
  ) {
    const current = supportCookies[role];
    if (!current || current.tenant !== tenantId) {
      const support = await mf.dispatchFetch(
        "https://campus.test/api/platform/institutions/" +
          tenantId +
          "/support",
        {
          method: "POST",
          headers: {
            "oai-authenticated-user-email": identity[1],
            "content-type": "application/json",
            origin: "https://campus.test",
          },
          body: JSON.stringify({ reason: "Financial regression verification" }),
        },
      );
      assert.equal(
        support.status,
        200,
        "start audited regression support session",
      );
      supportCookies[role] = {
        tenant: tenantId,
        cookie: support.headers.get("set-cookie").split(";")[0],
      };
    }
    headers = { cookie: supportCookies[role].cookie, ...headers };
  }
  const response = await mf.dispatchFetch("https://campus.test/api/" + path, {
    method,
    headers: {
      ...(method === "POST" &&
      /^(payments|refunds|cash|fees|invoices)(\/|$)/.test(path) &&
      path !== "payments/webhook"
        ? { "Idempotency-Key": body?.idempotencyKey || randomUUID() }
        : {}),
      "oai-authenticated-user-id": identity[0],
      "oai-authenticated-user-email": identity[1],
      ...(tenantId ? { "x-institution-id": tenantId } : {}),
      ...(body
        ? { "content-type": "application/json", origin: "https://campus.test" }
        : {}),
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (raw && response.status === 202 && path.includes("documents/receipt/")) {
    await response.text();
    await new Promise((r) => setTimeout(r, 100));
    return request(path, {
      role,
      method,
      body,
      tenantId,
      headers,
      status,
      raw,
    });
  }
  if (raw) {
    assert.equal(response.status, status, path);
    return response;
  }
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(
      path +
        " returned " +
        response.status +
        " " +
        JSON.stringify([...response.headers]) +
        " " +
        text.slice(0, 1200),
    );
  }
  assert.equal(response.status, status, path + " " + JSON.stringify(data));
  if (status === 200) assert.equal(data.success, true, path);
  return data.data ?? data;
}
try {
  const db = await mf.getD1Database("DB");
  for (const file of (await readdir("drizzle"))
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    const sql = await readFile("drizzle/" + file, "utf8");
    for (const statement of sql
      .split("--> statement-breakpoint")
      .filter((s) => s.trim()))
      await db.prepare(statement.trim()).run();
  }
  console.log("PASS all database migrations");
  checks++;
  await request("bootstrap", {
    headers: {
      "oai-authenticated-user-id": "",
      "oai-authenticated-user-email": "",
    },
    status: 401,
  });
  checks++;
  console.log("PASS anonymous requests still require sign-in");
  await request("bootstrap", {
    role: "stranger",
    tenantId: "70a45679-cbbd-48aa-a126-34c73d631853",
    status: 403,
  });
  const beforeOwner = await db
    .prepare("SELECT value FROM platform WHERE key='owner'")
    .first();
  check("an uninvited first visitor cannot claim the platform", () =>
    assert.equal(beforeOwner, null),
  );
  await request("session");
  const initialInstitution = await db
    .prepare("SELECT id FROM institutions WHERE name='Chaitanya Shree Academy'")
    .first();
  tenant = initialInstitution.id;
  const boot = await request("bootstrap");
  tenant = boot.institution.id;
  const repeatedLogin = await request("bootstrap", {
    headers: { "oai-authenticated-user-email": " OWNER@EXAMPLE.TEST " },
  });
  check(
    "verified email-only sessions retain the same account and institution",
    () => {
      assert.ok(boot.user.userId.startsWith("email-"));
      assert.equal(repeatedLogin.user.userId, boot.user.userId);
      assert.equal(repeatedLogin.institution.id, boot.institution.id);
    },
  );
  await db
    .prepare(
      "INSERT INTO users(id,email,name,created_at,updated_at,created_by,updated_by) VALUES (?,?,?,?,?,?,?)",
    )
    .bind(
      "legacy-native-owner",
      identities.admin[1],
      "Legacy session",
      new Date().toISOString(),
      new Date().toISOString(),
      "legacy-native-owner",
      "legacy-native-owner",
    )
    .run();
  const subjectLogin = await request("bootstrap", {
    headers: { "oai-authenticated-user-id": "legacy-native-owner" },
  });
  const changedSubject = await request("bootstrap", {
    headers: { "oai-authenticated-user-id": "a-new-native-subject" },
  });
  check(
    "ChatGPT subject changes retain owner access despite a legacy duplicate",
    () => {
      assert.equal(subjectLogin.user.userId, boot.user.userId);
      assert.equal(changedSubject.user.userId, boot.user.userId);
      assert.equal(subjectLogin.user.role, "INSTITUTION_ADMIN");
      assert.equal(changedSubject.institution.id, tenant);
    },
  );
  check("bootstrap creates normalized demo data", () => {
    assert.equal(boot.classes.length, 15);
    assert.equal(boot.sections.length, 17);
    assert.equal(boot.user.role, "INSTITUTION_ADMIN");
  });
  const testBoot = await request("bootstrap", {
    role: "testOwner",
    tenantId: "70a45679-cbbd-48aa-a126-34c73d631853",
  });
  const testYear = testBoot.years[0].id;
  const testDashboard = await request("dashboard?year=" + testYear, {
    role: "testOwner",
    tenantId: testBoot.institution.id,
  });
  check(
    "persisted test school has accurate invoices, concessions, scholarship and partial payment",
    () => {
      assert.equal(testBoot.institution.name, "CampusLedger Test School");
      assert.equal(testBoot.user.role, "INSTITUTION_ADMIN");
      assert.equal(testDashboard.kpi.students, 2);
      assert.equal(testDashboard.kpi.expected, 8000000);
      assert.equal(testDashboard.kpi.collected, 800000);
      assert.equal(testDashboard.kpi.outstanding, 7200000);
    },
  );
  const testReceipts = await request("receipts?year=" + testYear, {
    role: "testOwner",
    tenantId: testBoot.institution.id,
  });
  const testPdf = await request(
    "documents/receipt/" + testReceipts.rows[0].id,
    { role: "testOwner", tenantId: testBoot.institution.id, raw: true },
  );
  check("test-school receipt is downloadable from the persisted payment", () =>
    assert.equal(testPdf.headers.get("content-type"), "application/pdf"),
  );
  const demo = await request("students?year=" + boot.years[0].id + "&size=100");
  check("demo student database queries", () => assert.equal(demo.total, 34));
  const dashboard = await request("dashboard?year=" + boot.years[0].id);
  check("dashboard returns server analytics", () => assert.ok(dashboard));
  const year = (
    await request("catalog/years", {
      method: "POST",
      body: {
        name: "QA 2026–27",
        startDate: "2026-06-01",
        endDate: "2027-05-31",
        status: "Active",
      },
    })
  ).id;
  const clazz = (
    await request("catalog/classes", {
      method: "POST",
      body: { name: "QA 10th", level: "School" },
    })
  ).id;
  const section = (
    await request("catalog/sections", {
      method: "POST",
      body: {
        name: "QA-A",
        yearId: year,
        classId: clazz,
        campusId: boot.campuses[0].id,
      },
    })
  ).id;
  const parent = (
    await request("catalog/parents", {
      method: "POST",
      body: {
        guardianName: "QA Ramesh Kumar",
        mobile: "9876543210",
        email: identities.parent[1],
        relationship: "Father",
      },
    })
  ).id;
  const student = (
    await request("students", {
      method: "POST",
      body: {
        name: "QA Rahul Kumar",
        admissionNumber: "QA/2026/0001",
        yearId: year,
        sectionId: section,
        parentId: parent,
      },
    })
  ).id;
  const sibling = (
    await request("students", {
      method: "POST",
      body: {
        name: "QA Ananya Kumar",
        admissionNumber: "QA/2026/0002",
        yearId: year,
        sectionId: section,
        parentId: parent,
      },
    })
  ).id;
  const component = (
    await request("catalog/components", {
      method: "POST",
      body: { name: "QA Tuition", category: "Academic" },
    })
  ).id;
  const structure = (
    await request("catalog/structures", {
      method: "POST",
      body: {
        name: "QA annual fees",
        yearId: year,
        classId: clazz,
        sectionId: section,
        frequency: "Quarterly",
        dates: ["2026-06-10", "2026-09-10", "2026-12-10"],
        items: [{ componentId: component, amount: "60000" }],
      },
    })
  ).id;
  const invoice = (
    await request("fees/assign", {
      method: "POST",
      body: {
        studentId: student,
        structureId: structure,
        discount: "3000",
        scholarship: "0",
        reason: "QA concession approval",
      },
    })
  ).invoiceId;
  let profile = await request("students/" + student + "?year=" + year);
  check("net fees and installments are exact", () => {
    assert.equal(profile.student.total_paise, 5700000);
    assert.deepEqual(
      profile.installments.map((i) => i.total_paise),
      [1900000, 1900000, 1900000],
    );
  });
  check("academic and fee workflow persists", () => {
    assert.ok(profile.installments.length === 3);
    assert.ok(invoice);
  });
  await db
    .prepare(
      "INSERT INTO users(id,email,name,created_at,updated_at,created_by,updated_by) VALUES (?,?,?,?,?,?,?)",
    )
    .bind(
      identities.parent[0],
      identities.parent[1],
      "Existing parent",
      new Date().toISOString(),
      new Date().toISOString(),
      identities.parent[0],
      identities.parent[0],
    )
    .run();
  for (const [role, data] of [
    ["accountant", {}],
    ["teacher", { sectionId: section, feeVisibility: false }],
  ]) {
    await request("users/invite", {
      method: "POST",
      body: {
        email: identities[role][1],
        fullName: "QA " + role,
        role:
          role === "parent"
            ? "PARENT"
            : role === "teacher"
              ? "TEACHER"
              : "ACCOUNTANT",
        ...data,
      },
    });
    await request("bootstrap", { role });
  }
  await request("users/invite", {
    method: "POST",
    body: { email: identities.parent[1], fullName: "Guardian", role: "PARENT" },
    status: 422,
  });
  await request("bootstrap", { role: "parent", status: 403 });
  await request("parent?year=" + year, { role: "parent", status: 410 });
  check("parent accounts and portal endpoints are unavailable", () =>
    assert.ok(true),
  );
  await request("students?year=" + year, {
    role: "accountant",
    tenantId: "not-a-tenant",
    status: 404,
  });
  checks++;
  console.log("PASS tenant header cannot grant access");
  const key = randomUUID(),
    body = {
      studentId: student,
      yearId: year,
      amount: "8000",
      method: "UPI",
      reference: "QA-PARTIAL",
      idempotencyKey: key,
    };
  const payment = await request("payments", {
    role: "accountant",
    method: "POST",
    body,
  });
  const repeated = await request("payments", {
    role: "accountant",
    method: "POST",
    body,
  });
  check("duplicate payment requests return the original transaction", () =>
    assert.equal(payment.payment.id, repeated.payment.id),
  );
  await request("payments", {
    role: "accountant",
    method: "POST",
    body: { ...body, amount: "8001" },
    status: 409,
  });
  checks++;
  console.log("PASS reused key with different amount is rejected");
  profile = await request("students/" + student + "?year=" + year);
  check("partial installment stays unpaid until complete", () => {
    assert.equal(profile.installments[0].outstanding_paise, 1100000);
    assert.equal(profile.student.paid_paise, 800000);
    assert.notEqual(profile.installments[0].status, "Paid");
  });
  await request("payments", {
    role: "accountant",
    method: "POST",
    body: {
      ...body,
      amount: "10999.99",
      reference: "QA-NEXT",
      idempotencyKey: randomUUID(),
    },
  });
  profile = await request("students/" + student + "?year=" + year);
  check("one paise balance remains outstanding", () =>
    assert.equal(profile.installments[0].outstanding_paise, 1),
  );
  await request("payments", {
    role: "accountant",
    method: "POST",
    body: {
      ...body,
      amount: "0.01",
      reference: "QA-FINAL",
      idempotencyKey: randomUUID(),
    },
  });
  profile = await request("students/" + student + "?year=" + year);
  check("complete installment is paid", () => {
    assert.equal(profile.installments[0].outstanding_paise, 0);
    assert.equal(profile.installments[0].status, "Paid");
    assert.equal(profile.student.outstanding_paise, 3800000);
  });
  await request("payments", {
    role: "accountant",
    method: "POST",
    body: { ...body, amount: "999999", idempotencyKey: randomUUID() },
    status: 422,
  });
  checks++;
  console.log("PASS overpayment is rejected");
  const pending = await request("payments", {
    role: "accountant",
    method: "POST",
    body: {
      ...body,
      amount: "1000",
      method: "Cheque",
      reference: "QA-CHEQUE",
      idempotencyKey: randomUUID(),
    },
  });
  check("cheque creates no receipt before clearance", () => {
    assert.equal(pending.payment.status, "Pending");
    assert.equal(pending.receipt, null);
  });
  const cleared = await request("payments/" + pending.payment.id + "/confirm", {
    role: "accountant",
    method: "POST",
    body: { reference: "QA-CLEARED" },
  });
  check("cleared cheque gets a receipt", () =>
    assert.ok(cleared.receipt.number),
  );
  const refund = await request("refunds", {
    role: "accountant",
    method: "POST",
    body: {
      paymentId: payment.payment.id,
      amount: "500",
      method: "Bank Transfer",
      reason: "QA partial refund",
      idempotencyKey: randomUUID(),
    },
  });
  await request("refunds/" + refund.id + "/approve", {
    role: "accountant",
    method: "POST",
    body: { reference: "QA-REFUND" },
    status: 403,
  });
  checks++;
  console.log("PASS accountant cannot authorize own refund");
  await request("refunds/" + refund.id + "/approve", {
    method: "POST",
    body: { reference: "QA-REFUND" },
  });
  await request("refunds/" + refund.id + "/approve", {
    method: "POST",
    body: { reference: "QA-REFUND" },
  });
  profile = await request("students/" + student + "?year=" + year);
  check("refund reverses paid amount exactly once", () => {
    assert.equal(profile.student.outstanding_paise, 3750000);
    assert.equal(profile.ledger.filter((l) => l.kind === "Refund").length, 1);
  });
  await request("fees/adjust", {
    method: "POST",
    body: {
      installmentId: profile.installments[0].id,
      kind: "Concession",
      amount: "250",
      direction: "Credit",
      reason: "QA authorized concession",
    },
  });
  profile = await request("students/" + student + "?year=" + year);
  check("concession appends ledger and agrees with balance", () => {
    assert.equal(profile.student.outstanding_paise, 3725000);
    assert.equal(profile.ledger.at(-1).balance_paise, 3725000);
  });
  const teacher = await request("students/" + student + "?year=" + year, {
    role: "teacher",
  });
  check("teacher fee permission masks financial profile", () => {
    assert.equal(teacher.student.outstanding_paise, undefined);
    assert.equal(teacher.ledger.length, 0);
  });
  await request("catalog/components", {
    role: "accountant",
    method: "POST",
    body: { name: "Forbidden", category: "Academic" },
    status: 403,
  });
  checks++;
  console.log("PASS accountant cannot change critical configuration");
  await request("students/" + student, {
    method: "PATCH",
    body: { clearance: true, yearId: year, reason: "QA clearance request" },
    status: 409,
  });
  checks++;
  console.log("PASS financial clearance requires zero balance");
  await request("fees/assign", {
    method: "POST",
    body: { studentId: sibling, structureId: structure },
  });
  const siblingProfile = await request("students/" + sibling + "?year=" + year);
  check("automatic sibling concession uses server eligibility", () =>
    assert.equal(siblingProfile.student.total_paise, 5400000),
  );
  const pdf = await request("documents/receipt/" + payment.receipt.id, {
    role: "accountant",
    raw: true,
  });
  check("staff downloads a real PDF receipt", () =>
    assert.equal(pdf.headers.get("content-type"), "application/pdf"),
  );
  assert.equal(
    new TextDecoder().decode(
      new Uint8Array(await pdf.arrayBuffer()).slice(0, 5),
    ),
    "%PDF-",
  );
  await request("documents/invoice/" + demo.rows[0].id, {
    role: "accountant",
    raw: true,
    status: 404,
  });
  for (const format of ["csv", "xlsx", "pdf"]) {
    const result = await request(
      "reports/collections?year=" + year + "&format=" + format,
      { raw: true },
    );
    const bytes = new Uint8Array(await result.arrayBuffer());
    check(format + " report contains actual records", () =>
      assert.ok(bytes.length > 100),
    );
  }
  const report = await request("reports/collections?year=" + year);
  check("collection report uses persisted transactions", () =>
    assert.equal(report.rows.length, 4),
  );
  const invalidRows = [
    {
      name: "QA Valid import",
      admissionNumber: "QA-IMPORT-1",
      className: "QA 10th",
      sectionName: "QA-A",
      parentName: "QA Guardian",
      mobile: "9876543210",
    },
    {
      name: "Invalid mobile",
      admissionNumber: "QA-IMPORT-2",
      className: "QA 10th",
      sectionName: "QA-A",
      parentName: "QA Guardian",
      mobile: "123",
    },
  ];
  const preview = await request("import", {
    method: "POST",
    body: { kind: "students", yearId: year, rows: invalidRows },
  });
  check("import shows invalid row number", () =>
    assert.equal(preview.errors[0].row, 3),
  );
  await request("import", {
    method: "POST",
    body: { kind: "students", yearId: year, rows: invalidRows, commit: true },
    status: 422,
  });
  const afterImport = await request("students?year=" + year + "&q=QA-IMPORT");
  check("invalid import saves no partial records", () =>
    assert.equal(afterImport.total, 0),
  );
  await request("import", {
    method: "POST",
    body: {
      kind: "reconciliation",
      yearId: year,
      rows: [
        { transactionId: "QA-PARTIAL", amount: "8000", date: "2026-10-03" },
      ],
      commit: true,
    },
  });
  const reconciliation = await request("reconciliation?year=" + year);
  check("bank import matches reference and amount", () =>
    assert.equal(reconciliation.rows[0].status, "Matched"),
  );
  await request("communications", {
    method: "POST",
    body: {
      enabled: true,
      entityId: "QA-ENTITY",
      senderId: "QAFEES",
      templates: Object.fromEntries(
        ["before7", "before3", "before1", "after1"].map((key) => [
          key,
          {
            id: "QA-" + key,
            body: "{student} fees of {amount} are due on {date}.",
          },
        ]),
      ),
    },
  });
  await request("communications/consent", {
    method: "POST",
    body: {
      parentId: parent,
      consent: true,
      reason: "Guardian opted in during test setup",
    },
  });
  await request("notifications", {
    method: "POST",
    body: { studentIds: [student], channel: "SMS" },
  });
  const queue = await request("notifications/process", {
    method: "POST",
    body: {},
  });
  check("unconfigured providers leave messages queued", () =>
    assert.equal(queue.queued, true),
  );
  const secret = "qa-webhook-secret";
  await request("providers", {
    method: "POST",
    body: {
      provider: "Razorpay",
      mode: "test",
      config: {
        keyId: "qa-key",
        keySecret: "qa-secret",
        webhookSecret: secret,
      },
    },
  });
  const provider = await db
    .prepare("SELECT ciphertext FROM provider_configs WHERE institution_id=?")
    .bind(tenant)
    .first();
  check("gateway credentials are encrypted at rest", () =>
    assert.ok(!provider.ciphertext.includes(secret)),
  );
  const fixture = await request("payments", {
    role: "accountant",
    method: "POST",
    body: {
      ...body,
      amount: "2000",
      method: "Cheque",
      reference: "QA-GATEWAY-FIXTURE",
      idempotencyKey: randomUUID(),
    },
  });
  await db
    .prepare(
      "UPDATE payments SET gateway='Razorpay',gateway_order_id='qa_order_signed',status='Initiated' WHERE id=?",
    )
    .bind(fixture.payment.id)
    .run();
  const event = {
    event: "payment.captured",
    payload: {
      payment: {
        entity: {
          id: "qa_gateway_payment",
          order_id: "qa_order_signed",
          status: "captured",
          currency: "INR",
          amount: 200000,
        },
      },
    },
  };
  const signature = createHmac("sha256", secret)
    .update(JSON.stringify(event))
    .digest("hex");
  await request("payments/webhook", {
    method: "POST",
    body: event,
    headers: {
      "x-razorpay-signature": "invalid",
      "x-razorpay-event-id": "qa_event",
    },
    status: 400,
  });
  checks++;
  console.log("PASS invalid webhook signature rejected");
  const wrong = {
    ...event,
    payload: {
      payment: { entity: { ...event.payload.payment.entity, amount: 200001 } },
    },
  };
  await request("payments/webhook", {
    method: "POST",
    body: wrong,
    headers: {
      "x-razorpay-signature": createHmac("sha256", secret)
        .update(JSON.stringify(wrong))
        .digest("hex"),
      "x-razorpay-event-id": "qa_wrong",
    },
    status: 422,
  });
  checks++;
  console.log("PASS signed wrong amount webhook rejected");
  await request("payments/webhook", {
    method: "POST",
    body: event,
    headers: {
      "x-razorpay-signature": signature,
      "x-razorpay-event-id": "qa_event",
    },
  });
  const duplicateEvent = await request("payments/webhook", {
    method: "POST",
    body: event,
    headers: {
      "x-razorpay-signature": signature,
      "x-razorpay-event-id": "qa_event",
    },
  });
  check("signed captured webhook is idempotent", () =>
    assert.equal(duplicateEvent.duplicate, true),
  );
  const confirmed = await request("students/" + student + "?year=" + year, {
    role: "accountant",
  });
  check(
    "gateway confirmation updates ledger, invoice and institution balance",
    () => {
      assert.equal(confirmed.student.outstanding_paise, 3525000);
      assert.ok(
        confirmed.payments.find((p) => p.id === fixture.payment.id).receipt_id,
      );
      assert.equal(confirmed.ledger.at(-1).balance_paise, 3525000);
    },
  );
  const fresh = await request("dashboard?year=" + year);
  check("dashboard and reports update after gateway confirmation", () => {
    assert.equal(fresh.kpi.collected, 2150000);
    assert.equal(fresh.kpi.refunds, 50000);
  });
  const components = await request("reports/components?year=" + year);
  check("component collections conserve the receipt total", () =>
    assert.equal(
      components.rows.reduce((s, r) => s + r.collected_paise, 0),
      2200000,
    ),
  );
  await request("payments", {
    role: "accountant",
    method: "POST",
    body: { ...body, amount: "1.001", idempotencyKey: randomUUID() },
    status: 422,
  });
  checks++;
  console.log("PASS invalid financial precision gives a validation error");
  const races = await Promise.all(
    [0, 1].map(async (index) => {
      const idempotencyKey = randomUUID();
      const response = await mf.dispatchFetch(
        "https://campus.test/api/payments",
        {
          method: "POST",
          headers: {
            "Idempotency-Key": idempotencyKey,
            "oai-authenticated-user-id": identities.accountant[0],
            "oai-authenticated-user-email": identities.accountant[1],
            "x-institution-id": tenant,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            studentId: sibling,
            yearId: year,
            amount: "40000",
            method: "Bank Transfer",
            reference: "QA-RACE-" + index,
            idempotencyKey,
          }),
        },
      );
      return { status: response.status, data: await response.json() };
    }),
  );
  check("concurrent payments cannot overdraw installments", () => {
    assert.equal(races.filter((r) => r.status === 200).length, 1);
    assert.ok(races.some((r) => [409, 422].includes(r.status)));
  });
  await request("jobs/scheduled", { status: 401 });
  checks++;
  console.log("PASS scheduler endpoint requires service authorization");
  const settings = {
    ...boot.institution.settings,
    lateFee: { ...boot.institution.settings.lateFee, enabled: true },
  };
  await request("settings", {
    method: "PATCH",
    body: {
      name: boot.institution.name,
      address: boot.institution.address,
      email: boot.institution.email,
      phone: boot.institution.phone,
      settings,
    },
  });
  const firstJobs = await request("jobs/scheduled", {
    method: "POST",
    body: { institutionId: tenant },
    headers: { authorization: "Bearer " + jobSecret },
  });
  const repeatedJobs = await request("jobs/scheduled", {
    method: "POST",
    body: { institutionId: tenant },
    headers: { authorization: "Bearer " + jobSecret },
  });
  check("maintenance posts configured late fees once", () => {
    assert.ok(firstJobs.lateFees > 0);
    assert.equal(repeatedJobs.lateFees, 0);
  });
  const serviceRead = await request("jobs/scheduled", {
    headers: { authorization: "Bearer " + jobSecret },
  });
  check("scheduler can read persisted maintenance history", () => {
    assert.ok(serviceRead.lastRun);
    assert.ok(serviceRead.runs.length > 0);
  });
  await assert.rejects(() =>
    db
      .prepare("UPDATE ledger_entries SET credit_paise=1 WHERE payment_id=?")
      .bind(payment.payment.id)
      .run(),
  );
  checks++;
  console.log("PASS historical ledger updates are blocked by database");
  const newTenant = (
    await request("platform/institutions", {
      method: "POST",
      body: {
        name: "QA Independent College",
        institutionCode: "QA-INDEPENDENT",
        adminName: "QA Administrator",
        adminMobile: "9876543210",
        planId: "plan-enterprise",
        subscriptionStart: "2026-06-01",
        subscriptionEnd: "2027-05-31",
        subscriptionStatus: "Active",
        subscription: "Enterprise",
        adminEmail: identities.schoolAdmin[1],
        setupAcademic: true,
      },
    })
  ).id;
  const newData = await request("students", { tenantId: newTenant });
  check("second institution has no first-tenant data", () =>
    assert.equal(newData.total, 0),
  );
  const newSchool = await request("bootstrap", {
    role: "schoolAdmin",
    tenantId: newTenant,
  });
  check(
    "institution creation atomically provisions academics and ChatGPT administrator access",
    () => {
      assert.equal(newSchool.user.role, "INSTITUTION_ADMIN");
      assert.equal(newSchool.institution.id, newTenant);
      assert.equal(newSchool.classes.length, 15);
      assert.equal(newSchool.sections.length, 17);
      assert.equal(newSchool.streams.length, 2);
      assert.equal(newSchool.years[0].name, "2026–27");
    },
  );
  const schoolStudents = await request("students", {
    role: "schoolAdmin",
    tenantId: newTenant,
  });
  check("new institution administrator sees only their institution", () =>
    assert.equal(schoolStudents.total, 0),
  );
  await request("platform/dashboard", {
    role: "schoolAdmin",
    tenantId: newTenant,
    status: 403,
  });
  await request("platform/institutions", {
    role: "schoolAdmin",
    tenantId: newTenant,
    method: "POST",
    body: { name: "Unauthorized school" },
    status: 403,
  });
  checks++;
  console.log(
    "PASS institution administrator cannot use platform administration",
  );
  const schoolUsers = await request("users", {
    role: "schoolAdmin",
    tenantId: newTenant,
  });
  check("platform administrator is not an institution staff member", () =>
    assert.ok(!schoolUsers.members.some((m) => m.role === "SUPER_ADMIN")),
  );
  const platformStats = await request("platform/dashboard");
  check(
    "platform dashboard uses persisted institution and financial totals",
    () => {
      assert.ok(platformStats.institutions >= 2);
      assert.ok(platformStats.students >= 36);
      assert.ok(platformStats.activeSubscriptions > 0);
    },
  );
  await request("platform/institutions/" + newTenant + "/admins", {
    method: "POST",
    body: {
      email: identities.schoolAdmin[1],
      fullName: "QA Administrator",
      mobile: "9876543210",
    },
  });
  await request("platform/institutions/" + newTenant + "/admins", {
    method: "POST",
    body: {
      email: identities.schoolAdmin[1],
      fullName: "QA Administrator",
      mobile: "9876543210",
    },
  });
  const reGranted = await request("bootstrap", {
    role: "schoolAdmin",
    tenantId: newTenant,
    headers: { "oai-authenticated-user-id": "another-school-admin-subject" },
  });
  check(
    "repeated administrator grants retain a single account and membership",
    () => {
      assert.equal(reGranted.user.userId, newSchool.user.userId);
      assert.equal(reGranted.memberships.length, 1);
      assert.equal(reGranted.user.role, "INSTITUTION_ADMIN");
    },
  );
  await request("platform/institutions/" + newTenant + "/admins", {
    role: "parent",
    method: "POST",
    body: { email: identities.parent[1] },
    status: 403,
  });
  checks++;
  console.log("PASS parent cannot grant institution access");
  await request("students/" + student + "?year=" + year, {
    tenantId: newTenant,
    status: 404,
  });
  checks++;
  console.log("PASS cross-tenant entity IDs cannot be read");
  await request("students", {
    role: "parent",
    tenantId: newTenant,
    status: 403,
  });
  checks++;
  console.log("PASS parents cannot switch to an unauthorized tenant");
  await request("bootstrap", { role: "stranger", status: 403 });
  checks++;
  console.log("PASS uninvited account cannot join institution");
  await request("catalog/components", {
    method: "POST",
    body: { name: "CSRF", category: "Academic" },
    headers: { origin: "https://attacker.test" },
    status: 403,
  });
  checks++;
  console.log("PASS cross-origin mutation rejected");
  await request("years/" + year, {
    method: "PATCH",
    body: { status: "Closed" },
  });
  await request("payments", {
    role: "accountant",
    method: "POST",
    body: { ...body, amount: "1", idempotencyKey: randomUUID() },
    status: 409,
  });
  checks++;
  console.log("PASS closed academic year rejects financial writes");
  await request("installments/" + profile.installments[0].id, {
    method: "PATCH",
    body: { dueDate: "2026-12-01", reason: "QA closed-year check" },
    status: 409,
  });
  checks++;
  console.log("PASS closed academic year rejects due-date edits");
  const preserved = await request("students/" + student + "?year=" + year, {
    role: "accountant",
  });
  check("closed academic year retains history", () =>
    assert.ok(preserved.ledger.length > 5),
  );

  console.log("Integration checks passed:", checks);
} finally {
  await mf.dispose();
}
