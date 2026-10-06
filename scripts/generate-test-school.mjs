// One-time, offline fixture generation. Runs the real APIs against an isolated
// database and appends their resulting rows to the new migration, never live SQL.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile, readdir, appendFile } from "node:fs/promises";
import { resolve } from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
const require = createRequire(import.meta.url);
const { Miniflare } = createRequire(require.resolve("wrangler"))("miniflare");
const migrations = (await readdir("drizzle"))
  .filter((f) => f.endsWith(".sql"))
  .sort();
const migration = migrations.at(-1);
assert.ok(
  migration.startsWith("0003_"),
  "Append only to the newly created 0003 migration before its first deployment.",
);
const existingSql = await readFile("drizzle/" + migration, "utf8");
assert.ok(
  !existingSql.includes("CampusLedger Test School"),
  "Fixture is already generated; do not rewrite applied migrations.",
);
const files = (await readdir("dist/server", { recursive: true }))
  .filter((f) => f.endsWith(".js"))
  .sort((a, b) => (a === "index.js" ? -1 : b === "index.js" ? 1 : 0));
const mf = new Miniflare({
  modules: files.map((f) => ({
    type: "ESModule",
    path: resolve("dist/server", f),
  })),
  modulesRoot: resolve("dist/server"),
  compatibilityDate: "2026-05-15",
  compatibilityFlags: ["nodejs_compat"],
  d1Databases: { DB: "test-school-fixture" },
  r2Buckets: ["BUCKET"],
  bindings: {
    PLATFORM_OWNER_EMAIL: "tejomaya@mvdt.in",
    PROVIDER_ENCRYPTION_KEY: randomBytes(32).toString("hex"),
  },
});
let institutionId;
let authCookie = "";
async function api(path, body) {
  if (!authCookie) {
    const login = await mf.dispatchFetch("https://campus.test/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://campus.test" },
      body: JSON.stringify({ username: "test", password: "tst@123" }),
    });
    assert.equal(login.status, 200, "local login " + (await login.text()));
    authCookie = login.headers.get("set-cookie")?.split(";")[0] || "";
  }
  const response = await mf.dispatchFetch("https://campus.test/api/" + path, {
    method: body ? "POST" : "GET",
    headers: {
      ...(authCookie ? { cookie: authCookie } : {}),
      ...(institutionId ? { "x-institution-id": institutionId } : {}),
      ...(body
        ? { "content-type": "application/json", origin: "https://campus.test" }
        : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const result = await response.json();
  assert.equal(response.status, 200, path + " " + JSON.stringify(result));
  return result.data;
}
try {
  const db = await mf.getD1Database("DB");
  for (const file of migrations)
    for (const statement of (await readFile("drizzle/" + file, "utf8"))
      .split("--> statement-breakpoint")
      .filter((s) => s.trim()))
      await db.prepare(statement.trim()).run();
  const owner = await api("bootstrap");
  const created = await api("institutions", {
    name: "CampusLedger Test School",
    address: "Demo campus, Bengaluru, Karnataka",
    email: "accounts@test-school.example",
    phone: "080-0000-0000",
    adminEmail: "test@sohan.local",
    subscription: "Professional",
    setupAcademic: true,
  });
  institutionId = created.id;
  const boot = await api("bootstrap");
  const yearId = boot.years[0].id;
  const parentId = (
    await api("catalog/parents", {
      guardianName: "Ramesh Kumar (Test)",
      mobile: "9800000001",
      email: "test-parent@example.test",
      relationship: "Father",
      address: "Demonstration address, Bengaluru",
    })
  ).id;
  const children = [
    {
      name: "Rahul Kumar (Test)",
      className: "10th",
      admissionNumber: "TEST/2026/0001",
      tuition: "30000",
      development: "5000",
      exam: "2000",
      transport: "15000",
      discount: "2000",
      scholarship: "0",
    },
    {
      name: "Ananya Kumar (Test)",
      className: "5th",
      admissionNumber: "TEST/2026/0002",
      tuition: "30000",
      development: "4000",
      exam: "2000",
      transport: "0",
      discount: "0",
      scholarship: "6000",
    },
  ];
  for (const child of children) {
    const clazz = boot.classes.find((c) => c.name === child.className),
      section = boot.sections.find((s) => s.class_id === clazz.id);
    const studentId = (
      await api("students", {
        name: child.name,
        admissionNumber: child.admissionNumber,
        yearId,
        sectionId: section.id,
        parentId,
      })
    ).id;
    const items = [
      ["Tuition Fee", child.tuition],
      ["Development Fee", child.development],
      ["Examination Fee", child.exam],
      ["Transport Fee", child.transport],
    ]
      .filter(([, amount]) => amount !== "0")
      .map(([name, amount]) => ({
        componentId: boot.components.find((c) => c.name === name).id,
        amount,
      }));
    const structureId = (
      await api("catalog/structures", {
        name: child.className + " annual fees (Test)",
        yearId,
        classId: clazz.id,
        sectionId: section.id,
        frequency: "Quarterly",
        dates: ["2026-06-10", "2026-09-10", "2026-12-10"],
        items,
      })
    ).id;
    await api("fees/assign", {
      studentId,
      structureId,
      discount: child.discount,
      scholarship: child.scholarship,
      reason: "Authorized demonstration concession / scholarship",
    });
    if (child.className === "10th")
      await api("payments", {
        studentId,
        yearId,
        amount: "8000",
        method: "UPI",
        reference: "TEST-UPI-0001",
        idempotencyKey: randomUUID(),
        notes: "Demonstration partial payment; no real money collected",
      });
  }
  const dash = await api("dashboard?year=" + yearId);
  assert.equal(dash.kpi.expected, 8000000);
  assert.equal(dash.kpi.collected, 800000);
  assert.equal(dash.kpi.outstanding, 7200000);
  const tables = [
    "institutions",
    "memberships",
    "invitations",
    "campuses",
    "academic_years",
    "classes",
    "streams",
    "sections",
    "fee_components",
    "parents",
    "students",
    "student_parents",
    "enrollments",
    "fee_structures",
    "fee_structure_items",
    "student_fee_assignments",
    "invoices",
    "invoice_items",
    "installments",
    "fee_adjustments",
    "payments",
    "payment_allocations",
    "ledger_entries",
    "receipts",
    "audit_logs",
  ];
  const literal = (value) => {
    if (value === null) return "NULL";
    if (typeof value === "number") {
      assert.ok(Number.isSafeInteger(value));
      return String(value);
    }
    return "'" + String(value).replaceAll("'", "''") + "'";
  };
  const encode = (table, row) =>
    "INSERT OR IGNORE INTO " +
    table +
    " (" +
    Object.keys(row).join(",") +
    ") VALUES (" +
    Object.values(row).map(literal).join(",") +
    ");";
  const ownerRow = await db
    .prepare("SELECT * FROM users WHERE id=?")
    .bind(owner.user.userId)
    .first();
  const statements = [
    "-- CampusLedger Test School: explicitly requested isolated financial demo.\n" +
      encode("users", ownerRow),
  ];
  let rowCount = 1;
  for (const table of tables) {
    const rows = (
      await db
        .prepare(
          "SELECT * FROM " +
            table +
            " WHERE " +
            (table === "institutions" ? "id" : "institution_id") +
            "=?",
        )
        .bind(institutionId)
        .all()
    ).results;
    for (const original of rows) {
      const row = { ...original };
      // Database triggers issue unique numbers and initialize counters.
      if (table === "invoices" || table === "receipts") delete row.number;
      statements.push(encode(table, row));
      rowCount++;
    }
  }
  await appendFile(
    "drizzle/" + migration,
    "\n--> statement-breakpoint\n" +
      statements.join("\n--> statement-breakpoint\n") +
      "\n",
  );
  console.log(
    JSON.stringify({
      migration,
      institutionId,
      students: 2,
      rows: rowCount,
      expectedPaise: 8000000,
      collectedPaise: 800000,
      outstandingPaise: 7200000,
    }),
  );
} finally {
  await mf.dispose();
}
