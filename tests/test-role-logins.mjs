import assert from "node:assert/strict";

const BASE = "http://127.0.0.1:5173";
const SLUG = "campusledger-test-school";

console.log("Starting End-to-End Role Login & Redirection Verification against dev server...");

const rolesToTest = [
  {
    roleName: "Student",
    username: "student",
    password: "Student@123",
    expectedPath: `/campus/${SLUG}/student-portal`,
  },
  {
    roleName: "Faculty",
    username: "faculty",
    password: "Faculty@123",
    expectedPath: `/campus/${SLUG}/academic`,
  },
  {
    roleName: "Accountant",
    username: "accountant",
    password: "Accountant@123",
    expectedPath: `/campus/${SLUG}/fees`,
  },
  {
    roleName: "Staff / Admissions",
    username: "staff",
    password: "Staff@123",
    expectedPath: `/campus/${SLUG}/admissions`,
  },
  {
    roleName: "Parent",
    username: "parent",
    password: "Parent@123",
    expectedPath: `/campus/${SLUG}/parent-portal`,
  },
  {
    roleName: "Institution Admin",
    username: "admin",
    password: "Admin@123",
    expectedPath: `/campus/${SLUG}`,
  },
  {
    roleName: "Principal",
    username: "principal",
    password: "Principal@123",
    expectedPath: `/campus/${SLUG}`,
  },
  {
    roleName: "Super Admin",
    username: "superadmin",
    password: "SuperAdmin@123",
    expectedPath: `/admin`,
  },
];

for (const tc of rolesToTest) {
  const loginRes = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: tc.username,
      password: tc.password,
      institutionSlug: SLUG,
    }),
  });

  const cookie = loginRes.headers.get("set-cookie") || "";
  const body = await loginRes.json();

  assert.equal(loginRes.status, 200, `Login status for ${tc.roleName} should be 200`);
  assert.equal(body.success, true, `Login success for ${tc.roleName}`);
  assert.equal(body.data.redirectPath, tc.expectedPath, `Redirect path for ${tc.roleName} should be ${tc.expectedPath}`);
  console.log(`PASS ${tc.roleName} login -> authenticated as ${body.data.user.role} and redirectPath is ${body.data.redirectPath}`);

  // Test authenticated request with session cookie
  const sessionToken = cookie.split(";")[0];
  if (tc.roleName === "Student") {
    const studentRes = await fetch(`${BASE}/api/campus/${SLUG}/student-portal/summary`, {
      headers: { Cookie: sessionToken },
    });
    const studentData = await studentRes.json();
    assert.equal(studentRes.status, 200, "Student summary status 200");
    assert.ok(studentData.data.student, "Student summary returned student profile");
    console.log(`PASS Student authenticated session accessed student-portal/summary successfully`);
  }
}

// Test institution portal public endpoint
const portalRes = await fetch(`${BASE}/api/portal/${SLUG}`);
const portalData = await portalRes.json();
assert.equal(portalRes.status, 200);
assert.equal(portalData.data.name, "CampusLedger Test School");
console.log(`PASS /api/portal/${SLUG} returns institution branding: ${portalData.data.name}`);

console.log("\nAll Role Login and Redirection checks PASSED perfectly!\n");
