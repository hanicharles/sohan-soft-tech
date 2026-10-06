import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile, readdir } from "node:fs/promises";
import { randomBytes, randomUUID } from "node:crypto";
import { resolve } from "node:path";
const require = createRequire(import.meta.url),
  { Miniflare } = createRequire(require.resolve("wrangler"))("miniflare");
const files = (await readdir("dist/server", { recursive: true }))
  .filter((f) => f.endsWith(".js"))
  .sort((a, b) => (a === "index.js" ? -1 : b === "index.js" ? 1 : 0));
const secret = randomBytes(32).toString("hex");
const mf = new Miniflare({
  modules: files.map((f) => ({
    type: "ESModule",
    path: resolve("dist/server", f),
  })),
  modulesRoot: resolve("dist/server"),
  compatibilityDate: "2026-05-15",
  compatibilityFlags: ["nodejs_compat"],
  d1Databases: { DB: "saas" },
  r2Buckets: ["BUCKET"],
  bindings: {
    PLATFORM_OWNER_EMAIL: "tejomaya@mvdt.in",
    PLATFORM_ORIGIN: "https://campus.test",
    JOB_SECRET: secret,
    PROVIDER_ENCRYPTION_KEY: randomBytes(32).toString("hex"),
  },
});
let checks = 0;
const check = (name, fn) => {
  fn();
  checks++;
  console.log("PASS " + name);
};
async function req(
  path,
  {
    email = "tejomaya@mvdt.in",
    method = "GET",
    body,
    tenant,
    cookie,
    status = 200,
    extra = {},
    raw = false,
  } = {},
) {
  const response = await mf.dispatchFetch("https://campus.test/api/" + path, {
    method,
    headers: {
      ...(method === "POST" &&
      /^(payments|refunds|cash|fees|invoices)(\/|$)/.test(
        path.replace(/^campus\/[^/]+\//, ""),
      ) &&
      path !== "payments/webhook"
        ? { "Idempotency-Key": body?.idempotencyKey || randomUUID() }
        : {}),
      "oai-authenticated-user-email": email,
      ...(tenant ? { "x-institution-id": tenant } : {}),
      ...(cookie ? { cookie } : {}),
      ...(body
        ? { "content-type": "application/json", origin: "https://campus.test" }
        : {}),
      ...extra,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (raw && response.status === 202 && path.includes("documents/receipt/")) {
    await response.text();
    await new Promise((r) => setTimeout(r, 100));
    return req(path, {
      email,
      method,
      body,
      status,
      raw,
      tenant,
      cookie,
      extra,
    });
  }
  if (raw) {
    assert.equal(response.status, status, path);
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
    .sort()) {
    for (const statement of (await readFile("drizzle/" + file, "utf8"))
      .split("--> statement-breakpoint")
      .filter((s) => s.trim()))
      await db.prepare(statement.trim()).run();
  }
  const test = "70a45679-cbbd-48aa-a126-34c73d631853",
    snapshot = await db
      .prepare(
        "SELECT id,net_paise FROM invoices WHERE institution_id=? ORDER BY id",
      )
      .bind(test)
      .all();
  const login = await req("session");
  check("existing canonical Super Admin becomes platform admin", () => {
    assert.equal(login.platform, true);
    assert.equal(login.user.email, "tejomaya@mvdt.in");
    assert.equal(login.memberships.length, 0);
  });
  const subject = await req("session", {
    extra: { "oai-authenticated-user-id": "a-changed-chatgpt-subject" },
  });
  check("ChatGPT subject changes preserve the owner account", () =>
    assert.equal(subject.user.userId, login.user.userId),
  );
  await req("students", { tenant: test, status: 403 });
  checks++;
  console.log("PASS platform role alone cannot read institution data");
  await req("students", { status: 400 });
  checks++;
  console.log("PASS requests require explicit tenant identification");
  const publicPortal = await req("portal/campusledger-test-school", {
    email: "",
  });
  check("public branding contains no financial or user records", () => {
    assert.equal(publicPortal.name, "CampusLedger Test School");
    assert.equal(publicPortal.portalPath, "/campus/campusledger-test-school");
    assert.equal(publicPortal.students, undefined);
    assert.equal(publicPortal.email, undefined);
  });
  const create = await req("platform/institutions", {
    method: "POST",
    body: {
      name: "Green Valley Test School",
      institutionCode: "GV-TEST",
      institutionType: "School",
      adminName: "Green Valley Administrator",
      adminEmail: "admin@green-valley.example.test",
      adminMobile: "9876543210",
      planId: "plan-starter",
      subscriptionStatus: "Active",
      subscriptionStart: "2026-06-01",
      subscriptionEnd: "2027-05-31",
      setupAcademic: true,
    },
  });
  const campus = "campus/" + create.slug + "/",
    admin = "admin@green-valley.example.test";
  check("onboarding creates a unique readable institution URL", () =>
    assert.equal(create.portalPath, "/campus/green-valley-test-school"),
  );
  const boot = await req(campus + "bootstrap", { email: admin });
  check(
    "first administrator and academics are provisioned for this tenant",
    () => {
      assert.equal(boot.user.role, "INSTITUTION_ADMIN");
      assert.equal(boot.classes.length, 15);
      assert.equal(boot.sections.length, 17);
      assert.equal(boot.institution.id, create.id);
    },
  );
  await req("platform/dashboard", { email: admin, status: 403 });
  checks++;
  console.log("PASS institution admin cannot open platform API");
  await req(campus + "students", { email: admin, tenant: test, status: 403 });
  await req("students", { email: admin, tenant: test, status: 403 });
  checks++;
  console.log(
    "PASS changing portal or tenant header cannot switch an institution user",
  );
  const student = await req(campus + "students", {
    email: admin,
    method: "POST",
    body: {
      name: "Green Valley Student",
      admissionNumber: "GV/2026/0001",
      yearId: boot.years[0].id,
      sectionId: boot.sections[0].id,
      parentName: "Guardian Contact",
      mobile: "9876543210",
    },
  });
  const component = await req(campus + "catalog/components", {
    email: admin,
    method: "POST",
    body: { name: "QA Tuition", category: "Academic" },
  });
  const structure = await req(campus + "catalog/structures", {
    email: admin,
    method: "POST",
    body: {
      name: "Green Valley annual fee",
      yearId: boot.years[0].id,
      classId: boot.sections[0].class_id,
      sectionId: boot.sections[0].id,
      frequency: "Quarterly",
      dates: ["2026-06-10", "2026-09-10", "2026-12-10"],
      items: [{ componentId: component.id, amount: "60000" }],
    },
  });
  const assignment = await req(campus + "fees/assign", {
    email: admin,
    method: "POST",
    body: { studentId: student.id, structureId: structure.id },
  });
  await req(campus + "users/invite", {
    email: admin,
    method: "POST",
    body: {
      email: "collector@green-valley.example.test",
      fullName: "Fee Collector",
      role: "FEE_COLLECTOR",
    },
  });
  const collector = "collector@green-valley.example.test";
  await req(campus + "bootstrap", { email: collector });
  const paid = await req(campus + "payments", {
    email: collector,
    method: "POST",
    body: {
      studentId: student.id,
      yearId: boot.years[0].id,
      amount: "8000",
      method: "UPI",
      reference: "GV-TEST-PARTIAL",
      idempotencyKey: randomUUID(),
    },
  });
  const receipt = await req(campus + "documents/receipt/" + paid.receipt.id, {
    email: collector,
    raw: true,
  });
  check("collector receives a real receipt for an atomic partial payment", () =>
    assert.equal(receipt.headers.get("content-type"), "application/pdf"),
  );
  const profile = await req(campus + "students/" + student.id, {
    email: admin,
  });
  check("partial payment retains the correct installment balance", () => {
    assert.equal(profile.student.outstanding_paise, 5200000);
    assert.equal(profile.installments[0].outstanding_paise, 1200000);
    assert.equal(profile.installments[0].paid_paise, 800000);
  });
  await req(campus + "catalog/components", {
    email: collector,
    method: "POST",
    body: { name: "Forbidden", category: "Academic" },
    status: 403,
  });
  await req(campus + "users", { email: collector, status: 403 });
  await req(campus + "reports/collections", { email: collector, status: 403 });
  checks++;
  console.log("PASS fee collector cannot configure fees, users or reports");
  await req(campus + "users/invite", {
    email: admin,
    method: "POST",
    body: {
      email: "teacher@green-valley.example.test",
      fullName: "Class Teacher",
      role: "TEACHER",
      sectionId: boot.sections[0].id,
    },
  });
  const teacher = "teacher@green-valley.example.test";
  await req(campus + "bootstrap", { email: teacher });
  const teacherStudents = await req(campus + "students", { email: teacher }),
    teacherProfile = await req(campus + "students/" + student.id, {
      email: teacher,
    });
  check("teacher sees assigned students without financial data", () => {
    assert.equal(teacherStudents.rows.length, 1);
    assert.equal(teacherStudents.rows[0].outstanding_paise, undefined);
    assert.equal(teacherProfile.payments.length, 0);
  });
  for (const target of [
    "dashboard",
    "payments",
    "receipts",
    "reports/collections",
    "documents/receipt/" + paid.receipt.id,
  ])
    await req(campus + target, { email: teacher, status: 403 });
  checks++;
  console.log("PASS teacher cannot access financial APIs or receipts");
  await req(campus + "users/invite", {
    email: admin,
    method: "POST",
    body: {
      email: "custom@green-valley.example.test",
      fullName: "Custom User",
      role: "CUSTOM",
      permissions: ["students.view"],
    },
  });
  const custom = "custom@green-valley.example.test";
  await req(campus + "bootstrap", { email: custom });
  await req(campus + "students", { email: custom });
  await req(campus + "payments", { email: custom, status: 403 });
  await req(campus + "students", {
    email: custom,
    method: "POST",
    body: { name: "Forbidden" },
    status: 403,
  });
  checks++;
  console.log("PASS custom permissions remain limited to selected areas");
  for (const target of ["parent", "pay/token", "payment-links"])
    await req(target, {
      email: admin,
      method: target === "payment-links" ? "POST" : "GET",
      body: target === "payment-links" ? {} : undefined,
      tenant: create.id,
      status: 410,
    });
  await req(campus + "users/invite", {
    email: admin,
    method: "POST",
    body: {
      email: "parent@green-valley.example.test",
      fullName: "Parent",
      role: "PARENT",
    },
    status: 422,
  });
  checks++;
  console.log("PASS parent login and payment portal are removed");
  const supportResponse = await req(
    "platform/institutions/" + test + "/support",
    {
      method: "POST",
      body: {
        reason: "Verify tenant isolation and preserve existing Test School",
      },
      raw: true,
    },
  );
  const cookie = supportResponse.headers.get("set-cookie").split(";")[0];
  check("support access uses a secure HttpOnly cookie", () => {
    assert.ok(
      supportResponse.headers
        .get("set-cookie")
        .includes("HttpOnly; Secure; SameSite=Strict"),
    );
  });
  const tb = await req("campus/campusledger-test-school/bootstrap", { cookie }),
    year = tb.years[0].id;
  const td = await req(
    "campus/campusledger-test-school/dashboard?year=" + year,
    { cookie },
  );
  check("existing Test School financial totals are unchanged", () => {
    assert.equal(td.kpi.expected, 8000000);
    assert.equal(td.kpi.collected, 800000);
    assert.equal(td.kpi.outstanding, 7200000);
  });
  await req("students/" + student.id, { tenant: test, cookie, status: 404 });
  await req(campus + "students/" + student.id, { cookie, status: 403 });
  await req(campus + "documents/receipt/" + paid.receipt.id, {
    tenant: test,
    cookie,
    status: 403,
  });
  checks++;
  console.log("PASS support cookie is bound to user and institution");
  const testStudent = (
    await req("students?year=" + year, { tenant: test, cookie })
  ).rows[0];
  await req(campus + "students/" + testStudent.id, {
    email: admin,
    status: 404,
  });
  const testReceipt = (
    await req("receipts?year=" + year, { tenant: test, cookie })
  ).rows[0];
  await req(campus + "documents/receipt/" + testReceipt.id, {
    email: admin,
    status: 404,
  });
  await req(campus + "payments", {
    email: admin,
    method: "POST",
    body: {
      studentId: testStudent.id,
      yearId: year,
      amount: "1",
      method: "Cash",
      idempotencyKey: randomUUID(),
    },
    status: 404,
  });
  checks++;
  console.log(
    "PASS foreign student, receipt, year and payment IDs cannot be used",
  );
  await req("platform/support", { method: "POST", body: {} });
  await req("students", { tenant: test, cookie, status: 403 });
  checks++;
  console.log("PASS ending support access invalidates the cookie immediately");
  const users = await req(campus + "users", { email: admin });
  const customMember = users.members.find((v) => v.email === custom);
  await req(campus + "users/" + customMember.id, {
    email: admin,
    method: "PATCH",
    body: { active: false },
  });
  await req(campus + "students", { email: custom, status: 403 });
  await req(campus + "users/" + customMember.id, {
    email: admin,
    method: "PATCH",
    body: { active: true },
  });
  await req(campus + "students", { email: custom });
  checks++;
  console.log(
    "PASS disabling and re-enabling staff takes effect on every API request",
  );
  await req(campus + "users/" + customMember.id, {
    email: admin,
    method: "PATCH",
    body: {
      role: "TEACHER",
      sectionId: boot.sections[0].id,
      permissions: ["students.view", "academics.view"],
    },
  });
  await req(campus + "payments", { email: custom, status: 403 });
  checks++;
  console.log("PASS edits immediately update staff roles and permissions");
  await req(campus + "users/" + customMember.id + "/reset-access", {
    email: admin,
    method: "POST",
    body: {},
  });
  const reset = await req(campus + "bootstrap", { email: custom });
  check("reset access creates and accepts a fresh scoped email grant", () =>
    assert.equal(reset.user.role, "TEACHER"),
  );
  const billingKey = randomUUID(),
    billing = {
      institutionId: create.id,
      amount: "2500.00",
      method: "Bank Transfer",
      reference: "QA-SUBSCRIPTION",
      paidDate: "2026-10-03",
      notes: "Test confirmation only",
      idempotencyKey: billingKey,
    };
  const bill = await req("platform/payments", {
      method: "POST",
      body: billing,
    }),
    repeatBill = await req("platform/payments", {
      method: "POST",
      body: billing,
    });
  check("subscription payment recording is persisted and idempotent", () =>
    assert.equal(bill.id, repeatBill.id),
  );
  await req("platform/payments", {
    method: "POST",
    body: { ...billing, amount: "2501" },
    status: 409,
  });
  checks++;
  console.log("PASS changed subscription payment replays are rejected");
  await assert.rejects(
    () =>
      db
        .prepare("UPDATE subscription_payments SET amount_paise=1 WHERE id=?")
        .bind(bill.id)
        .run(),
    /IMMUTABLE/,
  );
  checks++;
  console.log("PASS subscription payments cannot be overwritten");
  const planInput = {
    name: "QA Custom Plan",
    code: "qa-custom",
    price: "2500.50",
    billingCycle: "Monthly",
    studentLimit: 300,
    userLimit: 12,
    modules: [
      "students",
      "academics",
      "fees",
      "payments",
      "receipts",
      "reports",
      "users",
      "settings",
    ],
    status: "Active",
  };
  const createdPlan = await req("platform/plans", {
    method: "POST",
    body: planInput,
  });
  await req("platform/plans/" + createdPlan.id, {
    method: "PATCH",
    body: { ...planInput, name: "QA Edited Plan" },
  });
  const savedPlan = (await req("platform/plans")).rows.find(
    (v) => v.id === createdPlan.id,
  );
  check("plans can be created and edited with exact monetary prices", () => {
    assert.equal(savedPlan.name, "QA Edited Plan");
    assert.equal(savedPlan.price_paise, 250050);
  });
  const details = await req("platform/institutions/" + create.id),
    sub = {
      planId: details.subscription.plan_id,
      status: "Active",
      startDate: details.subscription.start_date,
      endDate: details.subscription.end_date,
      studentLimit: 1,
      userLimit: details.usage.users + details.usage.pendingUsers,
      modules: details.subscription.modules,
    };
  await req("platform/institutions/" + create.id + "/subscription", {
    method: "PATCH",
    body: sub,
  });
  await req(campus + "students", {
    email: admin,
    method: "POST",
    body: {
      name: "Over quota",
      admissionNumber: "GV/2026/0002",
      yearId: boot.years[0].id,
      sectionId: boot.sections[0].id,
      parentName: "Guardian",
      mobile: "9876543210",
    },
    status: 409,
  });
  await req(campus + "users/invite", {
    email: admin,
    method: "POST",
    body: {
      email: "extra@green-valley.example.test",
      fullName: "Extra User",
      role: "ACCOUNTANT",
    },
    status: 409,
  });
  checks++;
  console.log("PASS student and staff limits are enforced on API writes");
  await assert.rejects(
    () =>
      db
        .prepare(
          "INSERT INTO students(id,institution_id,admission_number,name,admission_date,status,created_at,updated_at,created_by,updated_by) VALUES (?,?,?,'Direct quota attempt','2026-06-01','Active',?,?,?,?)",
        )
        .bind(
          randomUUID(),
          create.id,
          "DIRECT/OVER",
          new Date().toISOString(),
          new Date().toISOString(),
          login.user.userId,
          login.user.userId,
        )
        .run(),
    /STUDENT_LIMIT_REACHED/,
  );
  checks++;
  console.log("PASS database quota guard prevents bypass and bulk overrun");
  await req("platform/institutions/" + create.id + "/subscription", {
    method: "PATCH",
    body: { ...sub, studentLimit: 2 },
  });
  const bulkRows = [1, 2].map((n) => ({
    name: "Bulk quota " + n,
    admissionNumber: "GV/BULK/" + n,
    className: boot.sections[0].class_name,
    sectionName: boot.sections[0].name,
    streamName: boot.sections[0].stream_name || "",
    parentName: "Guardian",
    mobile: "9876543210",
  }));
  await req(campus + "imports", {
    email: admin,
    method: "POST",
    body: {
      kind: "students",
      yearId: boot.years[0].id,
      rows: bulkRows,
      commit: true,
    },
    status: 409,
  });
  const afterBulk = await req(campus + "students", { email: admin });
  check("bulk imports exceeding capacity roll back every row", () =>
    assert.equal(afterBulk.total, 1),
  );
  await req("platform/institutions/" + create.id + "/subscription", {
    method: "PATCH",
    body: { ...sub, status: "Expired" },
  });
  await req(campus + "students", { email: admin });
  await req(campus + "students", {
    email: admin,
    method: "POST",
    body: { name: "Expired write" },
    status: 403,
  });
  checks++;
  console.log(
    "PASS expired subscriptions retain readable history and reject new activity",
  );
  const scheduledExpired = await req("jobs/scheduled", {
    method: "POST",
    body: { institutionId: create.id },
    extra: { authorization: "Bearer " + secret },
  });
  check(
    "scheduled jobs skip expired subscriptions without posting charges",
    () => assert.equal(scheduledExpired.skipped, true),
  );

  await req("platform/institutions/" + create.id + "/subscription", {
    method: "PATCH",
    body: { ...sub, modules: sub.modules.filter((v) => v !== "reports") },
  });
  await req(campus + "reports/collections", { email: admin, status: 403 });
  checks++;
  console.log("PASS plan modules are enforced at the backend");
  const domain = await req("platform/institutions/" + create.id + "/domain", {
    method: "POST",
    body: { hostname: "fees.greenvalley.invalid" },
  });
  check("custom domains stay pending with exact DNS instructions", () => {
    assert.equal(domain.status, "Pending Verification");
    assert.equal(domain.sslStatus, "Pending Provisioning");
    assert.equal(domain.dns.length, 2);
    assert.equal(domain.provisioningAvailable, false);
  });
  await req("platform/institutions/" + create.id + "/domain", {
    method: "POST",
    body: { hostname: "https://127.0.0.1/private" },
    status: 422,
  });
  checks++;
  console.log(
    "PASS domain input cannot contain protocols, paths or private IP targets",
  );
  const pa = await req("platform/audit");
  check("support actions are recorded in platform audit history", () =>
    assert.ok(
      pa.rows.some((v) => v.action === "Started institution support access"),
    ),
  );
  await assert.rejects(
    () => db.prepare("UPDATE platform_audit_logs SET action='Tampered'").run(),
    /IMMUTABLE/,
  );
  checks++;
  console.log("PASS platform audit records are immutable");
  const expiring = await req("platform/institutions/" + test + "/support", {
      method: "POST",
      body: { reason: "Verify support expiration" },
      raw: true,
    }),
    expiredCookie = expiring.headers.get("set-cookie").split(";")[0];
  await db
    .prepare(
      "UPDATE support_sessions SET expires_at='2000-01-01T00:00:00.000Z' WHERE user_id=? AND ended_at IS NULL",
    )
    .bind(login.user.userId)
    .run();
  await req("students", { tenant: test, cookie: expiredCookie, status: 403 });
  checks++;
  console.log("PASS expired support sessions cannot read institution data");
  await db
    .prepare(
      "UPDATE institutions SET institution_code='GV-ORIGINAL-TEST' WHERE id=?",
    )
    .bind(create.id)
    .run();
  const serviceUpgrade = await req("jobs/saas-upgrade", {
    method: "POST",
    body: { createValidationInstitution: true },
    extra: { authorization: "Bearer " + secret },
  });
  check(
    "bounded service upgrade provisions validation data through real fee operations",
    () => {
      assert.notEqual(serviceUpgrade.validation.id, create.id);
      assert.ok(serviceUpgrade.validation.receiptId);
    },
  );
  const serviceReplay = await req("jobs/saas-upgrade", {
    method: "POST",
    body: { createValidationInstitution: true },
    extra: { authorization: "Bearer " + secret },
  });
  check(
    "repeating the validation provisioner does not duplicate institutions",
    () =>
      assert.equal(serviceReplay.validation.id, serviceUpgrade.validation.id),
  );
  const after = await db
    .prepare(
      "SELECT id,net_paise FROM invoices WHERE institution_id=? ORDER BY id",
    )
    .bind(test)
    .all();
  check(
    "migration and second-tenant operations preserve original invoice IDs and amounts",
    () => assert.deepEqual(after.results, snapshot.results),
  );
  const createdPlans = await req("platform/plans");
  check("platform plan management persists normalized configuration", () =>
    assert.equal(createdPlans.rows.length, 4),
  );
  const platformBrand = await req("platform/settings");
  check("platform settings use Sohan Soft Tech branding", () =>
    assert.equal(platformBrand.settings.platformName, "Sohan Soft Tech"),
  );
  // The section links now load complete documents instead of catch-all RSC
  // transitions. Exercise every destination against the built Worker.
  const routes = [
    "/admin",
    "/admin/institutions",
    "/admin/institutions/new",
    "/admin/institutions/" + test,
    ...[
      "plans",
      "subscriptions",
      "payments",
      "domains",
      "usage",
      "audit",
      "settings",
    ].map((p) => "/admin/" + p),
    ...[
      "",
      "students",
      "academic/years",
      "academic/classes",
      "academic/sections",
      "fees",
      "collect-fees",
      "invoices",
      "payments",
      "receipts",
      "outstanding",
      "reports",
      "users",
      "settings",
    ].map((p) => "/campus/campusledger-test-school/" + p),
  ];
  for (const path of routes) {
    const response = await mf.dispatchFetch("https://campus.test" + path);
    const html = await response.text();
    check("direct section navigation renders " + path, () => {
      assert.equal(response.status, 200);
      assert.match(response.headers.get("content-type"), /text\/html/);
      assert.match(html, /Sohan Soft Tech/);
      assert.doesNotMatch(html, /parent portal/);
    });
  }
  console.log("SaaS checks passed:", checks);
} finally {
  await mf.dispose();
}
