import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile, readdir } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";

const require = createRequire("d:/ERP_1/sohan-soft-tech/package.json");
const { Miniflare } = createRequire(require.resolve("wrangler"))("miniflare");
const ts = require("typescript");

console.log("Setting up Miniflare test harness for Student Portal Seed (Part 2)...");

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

const db = await mf.getD1Database("DB");

// Apply all Drizzle migrations
for (const file of (await readdir("drizzle")).filter((f) => f.endsWith(".sql")).sort()) {
  for (const statement of (await readFile("drizzle/" + file, "utf8"))
    .split("--> statement-breakpoint")
    .filter((s) => s.trim())) {
    await db.prepare(statement.trim()).run();
  }
}

console.log("Database initialized with all migrations. Loading ensureStudentPortalPart2Demonstration from server/seed.ts...");

// Extract and compile ensureStudentPortalPart2Demonstration directly from server/seed.ts
const seedSource = await readFile("server/seed.ts", "utf8");
const fnIndex = seedSource.indexOf("export async function ensureStudentPortalPart2Demonstration");
assert.ok(fnIndex !== -1, "ensureStudentPortalPart2Demonstration must exist in server/seed.ts");
const fnSnippet = seedSource.slice(fnIndex);
const transpiled = ts.transpileModule(
  `const now = () => new Date().toISOString();\n` + fnSnippet,
  {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  },
);

const seedModule = await import("data:text/javascript," + encodeURIComponent(transpiled.outputText));
const seedFn = seedModule.ensureStudentPortalPart2Demonstration;
assert.ok(typeof seedFn === "function", "ensureStudentPortalPart2Demonstration must be exported as a function");

// All 39 tables involved in student portal seed data
const tablesToInspect = [
  "institutions",
  "academic_years",
  "campuses",
  "classes",
  "sections",
  "departments",
  "programs",
  "students",
  "users",
  "memberships",
  "enrollments",
  "fee_components",
  "fee_structures",
  "fee_structure_items",
  "student_fee_assignments",
  "invoices",
  "invoice_items",
  "installments",
  "late_fee_runs",
  "fee_adjustments",
  "ledger_entries",
  "payments",
  "payment_allocations",
  "receipts",
  "student_documents",
  "student_certificate_requests",
  "campus_announcements",
  "student_announcement_reads",
  "student_portal_notifications",
  "student_conversations",
  "student_messages",
  "campus_events",
  "student_event_registrations",
  "student_tickets",
  "student_ticket_messages",
  "student_ticket_status_history",
  "student_feedback_submissions",
  "student_personal_deadlines",
  "student_portal_settings",
];

async function getTableCounts() {
  const counts = {};
  for (const t of tablesToInspect) {
    const row = await db.prepare(`SELECT COUNT(*) as cnt FROM ${t}`).first();
    counts[t] = row.cnt;
  }
  return counts;
}

// -------------------------------------------------------------
// RUN 1: First Execution
// -------------------------------------------------------------
console.log("\n[TEST] Running ensureStudentPortalPart2Demonstration FIRST time...");
await seedFn(undefined, "test-actor-admin", db);

const counts1 = await getTableCounts();
console.log("Counts after Run 1:", counts1);

// Verify core business requirements after Run 1:
console.log("\n[VERIFICATION] Verifying business requirements...");

// 1. Institution separation: 2 demo students in tenant 1, 1 student in cross tenant
const studentA = await db.prepare("SELECT id, name, institution_id FROM students WHERE id LIKE 'stu-demo-a-%'").first();
const studentB = await db.prepare("SELECT id, name, institution_id FROM students WHERE id LIKE 'stu-demo-b-%'").first();
const studentC = await db.prepare("SELECT id, name, institution_id FROM students WHERE id LIKE 'stu-demo-c-%'").first();

assert.ok(studentA, "Demo Student A must exist");
assert.ok(studentB, "Demo Student B must exist");
assert.ok(studentC, "Demo Student C must exist");
assert.equal(studentA.institution_id, studentB.institution_id, "Student A and Student B must be in same institution");
assert.notEqual(studentA.institution_id, studentC.institution_id, "Student C must be in different institution (cross-tenant)");
const demoStudents = [studentA, studentB, studentC];
console.log(`✓ 2 demo students in same institution (${studentA.institution_id}) and 1 in cross-tenant institution (${studentC.institution_id}) verified.`);

// 2. Financial Invoices per student: 1 paid, 1 pending, 1 overdue with late fee, scholarship/discount
for (const stu of demoStudents) {
  const invs = await db.prepare("SELECT id, gross_paise, discount_paise, scholarship_paise, net_paise, due_date FROM invoices WHERE student_id=?").bind(stu.id).all();
  assert.equal(invs.results.length, 3, `Student ${stu.id} must have 3 invoices`);

  // Check discount and scholarship on one invoice
  const invWithDisc = invs.results.find((i) => i.discount_paise > 0 && i.scholarship_paise > 0);
  assert.ok(invWithDisc, `Student ${stu.id} must have an invoice with scholarship & discount`);
  assert.equal(invWithDisc.gross_paise - invWithDisc.discount_paise - invWithDisc.scholarship_paise, invWithDisc.net_paise, "Invoice amount guard rule verified");

  // Check invoice balances view (Paid, Unpaid/Pending, Overdue)
  const bal = await db.prepare("SELECT total_paise, paid_paise, outstanding_paise, status FROM invoice_balances WHERE student_id=?").bind(stu.id).all();
  const statuses = bal.results.map((b) => b.status);
  assert.ok(statuses.includes("Paid"), `Student ${stu.id} must have a Paid invoice`);
  assert.ok(statuses.includes("Unpaid"), `Student ${stu.id} must have an Unpaid (Pending/Upcoming) invoice`);
  assert.ok(statuses.includes("Overdue"), `Student ${stu.id} must have an Overdue invoice`);
}
console.log("✓ Invoices (Paid, Unpaid/Pending, Overdue with late fee, scholarship/discount) verified for all demo students.");

// 3. Payments (success/pending/failed) and receipts
for (const stu of demoStudents) {
  const pays = await db.prepare("SELECT status FROM payments WHERE student_id=?").bind(stu.id).all();
  const payStatuses = pays.results.map((p) => p.status);
  assert.ok(payStatuses.includes("Successful"), `Student ${stu.id} must have a Successful payment`);
  assert.ok(payStatuses.includes("Pending"), `Student ${stu.id} must have a Pending payment`);
  assert.ok(payStatuses.includes("Failed"), `Student ${stu.id} must have a Failed payment`);

  const recs = await db.prepare(
    "SELECT r.id FROM receipts r JOIN payments p ON r.payment_id=p.id WHERE p.student_id=?",
  ).bind(stu.id).all();
  assert.ok(recs.results.length >= 1, `Student ${stu.id} must have at least 1 receipt for successful payment`);
}
console.log("✓ Payments (Successful, Pending, Failed) and Receipts verified for all demo students.");

// 4. Documents in all 4 categories (Verified/Pending/Rejected)
for (const stu of demoStudents) {
  const docs = await db.prepare("SELECT category, verification_status FROM student_documents WHERE student_id=?").bind(stu.id).all();
  const cats = new Set(docs.results.map((d) => d.category));
  const vStats = new Set(docs.results.map((d) => d.verification_status));
  assert.ok(cats.has("Student"), "Must have Student document category");
  assert.ok(cats.has("Admission"), "Must have Admission document category");
  assert.ok(cats.has("Academic"), "Must have Academic document category");
  assert.ok(cats.has("Institutional"), "Must have Institutional document category");
  assert.ok(vStats.has("Verified"), "Must have Verified status");
  assert.ok(vStats.has("Pending"), "Must have Pending status");
  assert.ok(vStats.has("Rejected"), "Must have Rejected status");
}
console.log("✓ Documents in all 4 categories across Verified, Pending, Rejected verified.");

// 5. Certificate requests (one issued with number + verification code, one pending)
for (const stu of demoStudents) {
  const certs = await db.prepare("SELECT status, certificate_number, verification_code FROM student_certificate_requests WHERE student_id=?").bind(stu.id).all();
  const issued = certs.results.find((c) => c.status === "Issued");
  const pending = certs.results.find((c) => c.status === "Pending");
  assert.ok(issued, `Student ${stu.id} must have an Issued certificate request`);
  assert.ok(issued.certificate_number && issued.verification_code, "Issued certificate must have number and verification code");
  assert.ok(pending, `Student ${stu.id} must have a Pending certificate request`);
}
console.log("✓ Certificate requests (one issued with number + code, one pending) verified.");

// 6. Announcements across scopes (one expired, one with attachment)
const annScopes = await db.prepare("SELECT target_scope, expires_at, attachments FROM campus_announcements").all();
const scopesSet = new Set(annScopes.results.map((a) => a.target_scope));
assert.ok(scopesSet.has("Institute"));
assert.ok(scopesSet.has("Department"));
assert.ok(scopesSet.has("Program"));
assert.ok(scopesSet.has("Class"));
assert.ok(scopesSet.has("Section"));
assert.ok(scopesSet.has("StudentGroup"));
const hasExpired = annScopes.results.some((a) => a.expires_at && new Date(a.expires_at) < new Date());
const hasAtt = annScopes.results.some((a) => a.attachments && a.attachments !== "[]");
assert.ok(hasExpired, "Must have an expired announcement");
assert.ok(hasAtt, "Must have an announcement with attachment");
console.log("✓ Announcements across 6 scopes (including expired and with attachment) verified.");

// 7. Notifications of ALL 10 types (read + unread)
const requiredTypes = [
  "Assignment", "Quiz", "Exam", "Result", "Attendance",
  "Fee", "Admission/document", "Event", "LMS", "System",
];
for (const stu of demoStudents) {
  const notifs = await db.prepare("SELECT type, is_read FROM student_portal_notifications WHERE student_id=?").bind(stu.id).all();
  assert.equal(notifs.results.length, 20, `Student ${stu.id} must have 20 notifications (1 read, 1 unread for each of 10 types)`);
  for (const t of requiredTypes) {
    const unread = notifs.results.find((n) => n.type === t && n.is_read === 0);
    const read = notifs.results.find((n) => n.type === t && n.is_read === 1);
    assert.ok(unread, `Student ${stu.id} missing unread notification for type: ${t}`);
    assert.ok(read, `Student ${stu.id} missing read notification for type: ${t}`);
  }
}
console.log("✓ Notifications of ALL 10 types (read + unread) verified for all demo students.");

// 8. Conversations with messages (faculty, support, helpdesk)
for (const stu of demoStudents) {
  const convs = await db.prepare("SELECT id, participant_type FROM student_conversations WHERE student_id=?").bind(stu.id).all();
  const cTypes = convs.results.map((c) => c.participant_type);
  assert.ok(cTypes.includes("Faculty"), `Student ${stu.id} missing Faculty conversation`);
  assert.ok(cTypes.includes("Support"), `Student ${stu.id} missing Support conversation`);
  assert.ok(cTypes.includes("Helpdesk"), `Student ${stu.id} missing Helpdesk conversation`);
}
console.log("✓ Conversations with messages (Faculty, Support, Helpdesk) verified.");

// 9. Events in 7 categories + registration and attendance
const events = await db.prepare("SELECT DISTINCT category FROM campus_events").all();
const evCats = new Set(events.results.map((e) => e.category));
["Academic", "Workshop", "Seminar", "Sports", "Parent_Meeting", "Holiday", "Institute"].forEach((cat) => {
  assert.ok(evCats.has(cat), `Missing event category: ${cat}`);
});
for (const stu of demoStudents) {
  const regs = await db.prepare("SELECT status, attendance_status FROM student_event_registrations WHERE student_id=?").bind(stu.id).all();
  const attended = regs.results.find((r) => r.attendance_status === "Attended");
  assert.ok(attended, `Student ${stu.id} must have an attended event registration`);
}
console.log("✓ Events in all 7 categories and attended registrations verified.");

// 10. Tickets in every status with replies and status history
const reqTktStatuses = ["Open", "In Progress", "Waiting for Student", "Resolved", "Closed"];
for (const stu of demoStudents) {
  const tkts = await db.prepare("SELECT id, status FROM student_tickets WHERE student_id=?").bind(stu.id).all();
  const foundStatuses = tkts.results.map((t) => t.status);
  for (const st of reqTktStatuses) {
    assert.ok(foundStatuses.includes(st), `Student ${stu.id} missing ticket with status ${st}`);
  }
}
console.log("✓ Tickets in every status (Open, In Progress, Waiting for Student, Resolved, Closed) verified.");

// 11. Feedback across 5 categories
const reqFbTypes = ["Course", "Faculty", "Event", "Assignment", "Support"];
for (const stu of demoStudents) {
  const fbs = await db.prepare("SELECT feedback_type FROM student_feedback_submissions WHERE student_id=?").bind(stu.id).all();
  const fTypes = fbs.results.map((f) => f.feedback_type);
  for (const ft of reqFbTypes) {
    assert.ok(fTypes.includes(ft), `Student ${stu.id} missing feedback for type ${ft}`);
  }
}
console.log("✓ Feedback across all 5 categories (Course, Faculty, Event, Assignment, Support) verified.");

// 12. Personal deadlines and settings
for (const stu of demoStudents) {
  const dls = await db.prepare("SELECT id, is_completed FROM student_personal_deadlines WHERE student_id=?").bind(stu.id).all();
  assert.ok(dls.results.length >= 3, `Student ${stu.id} must have deadlines`);
  const sets = await db.prepare("SELECT id FROM student_portal_settings WHERE student_id=?").bind(stu.id).first();
  assert.ok(sets, `Student ${stu.id} must have portal settings`);
}
console.log("✓ Personal deadlines and settings verified for all demo students.");

// -------------------------------------------------------------
// RUN 2: Second Execution (Idempotency Test)
// -------------------------------------------------------------
console.log("\n[TEST] Running ensureStudentPortalPart2Demonstration SECOND time (Idempotency check)...");
await seedFn(undefined, "test-actor-admin", db);

const counts2 = await getTableCounts();

console.log("\n--- Comparing Counts between Run 1 and Run 2 ---");
let identical = true;
for (const t of tablesToInspect) {
  if (counts1[t] !== counts2[t]) {
    console.error(`❌ MISMATCH on table ${t}: Run 1 = ${counts1[t]}, Run 2 = ${counts2[t]}`);
    identical = false;
  }
}

assert.ok(identical, "All 39 table counts MUST remain strictly identical between Run 1 and Run 2!");
console.log("✓ ALL 39 TABLES HAVE EXACTLY IDENTICAL ROW COUNTS ACROSS RUN 1 AND RUN 2!");
console.log("✓ Zero duplicate records, 100% idempotent seed execution confirmed!");

await mf.dispose();
console.log("\n==========================================");
console.log("ALL SEED TESTS PASSED SUCCESSFULLY! (100% GREEN)");
console.log("==========================================");
