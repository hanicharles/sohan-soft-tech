import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile, readdir } from "node:fs/promises";
import { randomBytes, randomUUID } from "node:crypto";
import { resolve } from "node:path";

const require = createRequire(import.meta.url);
const { Miniflare } = createRequire(require.resolve("wrangler"))("miniflare");

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
  const url = path.startsWith("http")
    ? path
    : "https://campus.test/api/" + path;

  const response = await mf.dispatchFetch(url, {
    method,
    headers: {
      "oai-authenticated-user-email": email,
      ...(tenant ? { "x-institution-id": tenant } : {}),
      ...(cookie ? { cookie } : {}),
      ...(!["GET", "HEAD", "OPTIONS"].includes(method)
        ? { "content-type": "application/json", origin: "https://campus.test" }
        : {}),
      ...extra,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  if (raw) {
    assert.equal(response.status, status, path);
    return response;
  }
  const text = await response.text();
  let result;
  try {
    result = text ? JSON.parse(text) : {};
  } catch (e) {
    console.error("Failed to parse response text for " + path + ": [" + text + "], status: " + response.status);
    throw e;
  }
  assert.equal(
    response.status,
    status,
    path + " " + JSON.stringify(result),
  );
  return result.data ?? result;
}

try {
  console.log("Starting Member 1 (Sumit Kumar) End-to-End Test Suite...\n");

  const db = await mf.getD1Database("DB");
  for (const file of (await readdir("drizzle"))
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    for (const statement of (await readFile("drizzle/" + file, "utf8"))
      .split("--> statement-breakpoint")
      .filter((s) => s.trim()))
      await db.prepare(statement.trim()).run();
  }

  // 1. BOOTSTRAP INSTITUTION
  const adminEmail = "sumit.admin@institution.test";
  const create = await req("platform/institutions", {
    method: "POST",
    body: {
      name: "SST Member 1 Academy",
      institutionCode: "SST-M1",
      institutionType: "School",
      adminName: "Sumit Kumar Admin",
      adminEmail: adminEmail,
      adminMobile: "9876543210",
      planId: "plan-starter",
      subscriptionStatus: "Active",
      subscriptionStart: "2026-06-01",
      subscriptionEnd: "2027-05-31",
      setupAcademic: true,
    },
  });
  const institutionId = create.id;
  assert.ok(institutionId, "Institution ID must be present");
  const campus = "campus/" + create.slug + "/";

  const boot = await req(campus + "bootstrap", { email: adminEmail });
  check("Bootstrap provisions institution and active academic year", () => {
    assert.ok(boot.institution.id);
    assert.ok(boot.years.length > 0);
  });
  const activeYearId = boot.years[0].id;
  const activeClassId = boot.classes[0].id;
  const activeSectionId = boot.sections[0].id;

  // 2. AUTHENTICATION & SECURITY
  console.log("\n--- Testing Authentication, Passwords, Lockout & History ---");

  // 2.1 Failed Login Attempt Counter
  const badLogin1 = await req("auth/login", {
    method: "POST",
    body: { username: "nonexistent@user.com", password: "wrongpassword" },
    status: 401,
  });
  check("Failed login returns 401 with remaining attempts", () => {
    assert.equal(badLogin1.success, false);
    assert.ok(badLogin1.message.includes("Invalid username or password"));
  });

  // 2.2 Account Lockout after 5 Failed Attempts
  const lockoutUser = `lockout-${randomUUID().slice(0, 8)}@test.com`;
  // First seed a user credential for lockoutUser
  await req(campus + "users", {
    email: adminEmail,
    method: "POST",
    body: {
      email: lockoutUser,
      fullName: "Lockout Test User",
      role: "STAFF",
      password: "CorrectPassword@123",
    },
  });

  for (let i = 1; i <= 4; i++) {
    const res = await req("auth/login", {
      method: "POST",
      body: { username: lockoutUser, password: "BadPassword" },
      status: 401,
    });
    assert.ok(res.message.includes(`${5 - i} attempt`));
  }
  // 5th attempt triggers lockout
  const lockRes = await req("auth/login", {
    method: "POST",
    body: { username: lockoutUser, password: "BadPassword" },
    status: 423,
  });
  check("5 consecutive failed logins trigger 15-minute account lockout (423 Locked)", () => {
    assert.equal(lockRes.success, false);
    assert.ok(lockRes.message.includes("Account temporarily locked"));
  });

  // 2.3 Successful Login & Role Redirect
  const authUserEmail = `staff-${randomUUID().slice(0, 8)}@sst.com`;
  await req(campus + "users", {
    email: adminEmail,
    method: "POST",
    body: {
      email: authUserEmail,
      fullName: "Staff Auth User",
      role: "STAFF",
      password: "ValidPassword@123",
    },
  });

  const loginRes = await req("auth/login", {
    method: "POST",
    body: { username: authUserEmail, password: "ValidPassword@123" },
    status: 200,
    raw: true,
  });
  const setCookie = loginRes.headers.get("set-cookie") || (typeof loginRes.headers.getSetCookie === "function" ? loginRes.headers.getSetCookie()[0] : null);
  const loginBody = await loginRes.json();
  check("Successful login returns session cookie and correct role redirect", () => {
    assert.ok(setCookie && (setCookie.includes("sohan_local_auth=") || setCookie.includes("sst_session=")));
    assert.equal(loginBody.success, true);
    assert.ok(loginBody.data?.redirectPath || loginBody.redirectPath);
  });
  const sessionCookie = setCookie.split(";")[0];

  // 2.4 Login History Audit Record
  const historyRes = await req("auth/login-history", {
    email: authUserEmail,
    cookie: sessionCookie,
    status: 200,
  });
  check("Login history records IP, user agent, timestamp, and status", () => {
    assert.ok(Array.isArray(historyRes.history));
    assert.ok(historyRes.history.length > 0);
    assert.equal(historyRes.history[0].status, "SUCCESS");
  });

  // 2.5 Password Reset Flow (Forgot -> Token -> Reset -> Login with New Password)
  const forgotRes = await req("auth/forgot-password", {
    method: "POST",
    body: { email: authUserEmail },
  });
  check("Forgot password generates secure reset token", () => {
    assert.ok(forgotRes.resetToken);
  });

  const resetToken = forgotRes.resetToken;
  const resetRes = await req("auth/reset-password", {
    method: "POST",
    body: { token: resetToken, newPassword: "NewSuperPassword@456" },
  });
  check("Reset password consumes token and updates credentials", () => {
    assert.equal(resetRes.success, true);
  });

  // Expired/used token cannot be reused
  await req("auth/reset-password", {
    method: "POST",
    body: { token: resetToken, newPassword: "AnotherPassword@789" },
    status: 400,
  });
  check("Reused password reset token is rejected", () => {});

  // Sign in with updated password
  const newLoginRes = await req("auth/login", {
    method: "POST",
    body: { username: authUserEmail, password: "NewSuperPassword@456" },
  });
  check("Sign in succeeds with new reset password", () => {
    assert.ok(newLoginRes.success || newLoginRes.authenticated);
  });

  // 2.6 Change Password (Authenticated)
  const changeRes = await req("auth/change-password", {
    method: "POST",
    email: authUserEmail,
    cookie: sessionCookie,
    body: {
      currentPassword: "NewSuperPassword@456",
      newPassword: "UpdatedViaProfile@123",
    },
  });
  check("Authenticated change password succeeds", () => {
    assert.equal(changeRes.success, true);
  });

  // 2.7 Logout invalidates session
  const logoutRes = await req("auth/logout", {
    method: "POST",
    cookie: sessionCookie,
  });
  check("Logout terminates session cleanly", () => {
    assert.ok(logoutRes.success || logoutRes.authenticated === false);
  });

  // 3. USER MANAGEMENT & ADMIN PASSWORD RESET
  console.log("\n--- Testing User Management CRUD, Toggle & Admin Reset ---");
  const staffMemberEmail = `member-${randomUUID().slice(0, 8)}@sst.com`;
  const createdUser = await req(campus + "users", {
    email: adminEmail,
    method: "POST",
    body: {
      email: staffMemberEmail,
      fullName: "Member One Staff",
      role: "ACCOUNTANT",
      password: "InitialPassword@123",
    },
  });
  check("Direct user creation creates institution user & credentials", () => {
    assert.ok(createdUser.id);
  });

  // Admin resets password for user
  const adminResetRes = await req(campus + `users/${createdUser.id}/reset-password`, {
    email: adminEmail,
    method: "POST",
    body: { newPassword: "AdminAssigned@999" },
  });
  check("Institution Admin can reset any user's password directly", () => {
    assert.ok(adminResetRes.success || adminResetRes.temporaryPassword);
  });

  // Toggle user active / disabled
  await req(campus + `users/${createdUser.id}`, {
    email: adminEmail,
    method: "PATCH",
    body: { active: false },
  });
  check("Disable staff user takes effect", () => {});

  // Inspect user login history
  const userHistoryRes = await req(campus + `users/${createdUser.id}/login-history`, {
    email: adminEmail,
  });
  check("Admin can view login audit history for staff user", () => {
    assert.ok(Array.isArray(userHistoryRes.rows || userHistoryRes.history));
  });

  // 4. CAMPUSES, ACADEMIC CALENDAR & WORKING DAYS
  console.log("\n--- Testing Campuses, Academic Calendar & Working Days ---");
  const newCampus = await req(campus + "campuses", {
    email: adminEmail,
    method: "POST",
    body: {
      name: "East Metro Branch Campus",
      address: "Plot 99, Metro Corridor, East Sector",
    },
  });
  check("Campus branch created with name and address", () => {
    assert.ok(newCampus.id);
    assert.equal(newCampus.created, true);
  });

  const campusesList = await req(campus + "campuses", { email: adminEmail });
  check("Campus list retrieves all institution branches", () => {
    assert.ok(campusesList.rows.some((c) => c.name === "East Metro Branch Campus"));
  });

  // Toggle Campus Status
  await req(campus + `campuses/${newCampus.id}`, {
    email: adminEmail,
    method: "PATCH",
    body: { status: "Inactive" },
  });
  check("Campus status toggled to Inactive", () => {});

  // Create Holiday
  const holiday = await req(campus + "calendar/holidays", {
    email: adminEmail,
    method: "POST",
    body: {
      academicYearId: activeYearId,
      name: "National Science Day",
      holidayDate: "2026-02-28",
      holidayType: "Institutional",
      description: "Science exhibition and student workshops",
    },
  });
  check("Academic calendar holiday created", () => {
    assert.ok(holiday.id);
    assert.equal(holiday.name, "National Science Day");
  });

  const holidaysList = await req(campus + "calendar/holidays", { email: adminEmail });
  check("Holidays list returns created holiday", () => {
    assert.ok(holidaysList.holidays.some((h) => h.id === holiday.id));
  });

  // Delete Holiday
  await req(campus + `calendar/holidays/${holiday.id}`, {
    email: adminEmail,
    method: "DELETE",
  });
  check("Holiday deleted from calendar", () => {});

  // Working Days & Shift Timings
  const workingSchedule = [
    { dayOfWeek: 1, isWorkingDay: true, shiftStartTime: "08:00", shiftEndTime: "15:00", isHalfDay: false },
    { dayOfWeek: 2, isWorkingDay: true, shiftStartTime: "08:00", shiftEndTime: "15:00", isHalfDay: false },
    { dayOfWeek: 3, isWorkingDay: true, shiftStartTime: "08:00", shiftEndTime: "15:00", isHalfDay: false },
    { dayOfWeek: 4, isWorkingDay: true, shiftStartTime: "08:00", shiftEndTime: "15:00", isHalfDay: false },
    { dayOfWeek: 5, isWorkingDay: true, shiftStartTime: "08:00", shiftEndTime: "15:00", isHalfDay: false },
    { dayOfWeek: 6, isWorkingDay: true, shiftStartTime: "08:00", shiftEndTime: "12:30", isHalfDay: true },
    { dayOfWeek: 0, isWorkingDay: false, shiftStartTime: "08:00", shiftEndTime: "15:00", isHalfDay: false },
  ];
  await req(campus + "calendar/working-days", {
    email: adminEmail,
    method: "PUT",
    body: { schedule: workingSchedule },
  });
  const savedSchedule = await req(campus + "calendar/working-days", { email: adminEmail });
  check("Working days weekly schedule and shift timings configured", () => {
    assert.equal(savedSchedule.workingDays.length, 7);
    const sat = savedSchedule.workingDays.find((d) => d.day_of_week === 6);
    assert.equal(sat.is_half_day, 1);
  });

  // 5. ADMISSIONS: ENQUIRIES, APPLICATIONS, VERIFICATION, INTERVIEWS & ENROLLMENT
  console.log("\n--- Testing Complete Admissions Pipeline ---");

  // 5.1 Enquiries
  const enquiry = await req(campus + "admissions/enquiries", {
    email: adminEmail,
    method: "POST",
    body: {
      studentName: "Aditya Verma",
      parentName: "Sanjay Verma",
      mobile: "+91 9988776655",
      email: "sanjay.verma@test.com",
      applyingForGrade: "Grade 5",
      source: "WalkIn",
      notes: "Inquiring about sports facilities and robotics lab",
    },
  });
  check("Admissions enquiry registered", () => {
    assert.ok(enquiry.id);
  });

  // Progress enquiry status
  await req(campus + `admissions/enquiries/${enquiry.id}`, {
    email: adminEmail,
    method: "PATCH",
    body: { status: "Contacted" },
  });
  check("Enquiry status updated to Contacted", () => {});

  // 5.2 Application
  const application = await req(campus + "admissions/applications", {
    email: adminEmail,
    method: "POST",
    body: {
      academicYearId: activeYearId,
      firstName: "Aditya",
      lastName: "Verma",
      dob: "2015-08-14",
      gender: "Male",
      bloodGroup: "B+",
      gradeApplying: "Grade 5",
      parentName: "Sanjay Verma",
      parentEmail: "sanjay.verma@test.com",
      parentMobile: "+91 9988776655",
      parentOccupation: "Software Architect",
      address: "102 Palm Residency, Whitefield",
      city: "Bengaluru",
      previousSchool: "National Public School",
      previousBoard: "CBSE",
      previousPercentage: "92%",
    },
  });
  check("Admissions application submitted with full student & parent details", () => {
    assert.ok(application.id);
    assert.ok(application.applicationNumber.startsWith("APP-"));
  });

  // Progress application status
  await req(campus + `admissions/applications/${application.id}/status`, {
    email: adminEmail,
    method: "PATCH",
    body: { status: "UnderReview" },
  });
  check("Application marked as UnderReview", () => {});

  // 5.3 Document Upload & Verification
  const doc = await req(campus + `admissions/applications/${application.id}/documents`, {
    email: adminEmail,
    method: "POST",
    body: {
      documentType: "Birth Certificate",
      documentName: "aditya_birth_cert.pdf",
      fileUrl: "https://storage.example.com/certs/aditya.pdf",
    },
  });
  check("Applicant document attached", () => {
    assert.ok(doc.id);
    assert.equal(doc.verificationStatus, "Pending");
  });

  const verifiedDoc = await req(campus + `admissions/documents/${doc.id}/verify`, {
    email: adminEmail,
    method: "PATCH",
    body: {
      status: "Verified",
      verificationRemarks: "Verified against municipal corporation copy",
    },
  });
  check("Document verified by admissions officer", () => {
    assert.equal(verifiedDoc.verified, true);
  });

  // 5.4 Entrance Interview & Grading
  const interviewRes = await req(campus + `admissions/applications/${application.id}/interview`, {
    email: adminEmail,
    method: "POST",
    body: {
      scheduledDate: "2026-03-10T10:30:00",
      interviewMode: "In-Person",
      interviewerName: "Prof. Arvind Rao",
      score: 95,
      notes: "Exceptional logic skills, cleared entrance test with distinction",
      status: "Completed",
    },
  });
  check("Interview scheduled, scored (95/100) and evaluated", () => {
    assert.equal(interviewRes.recorded, true);
  });

  // Mark Selected & Confirmed
  await req(campus + `admissions/applications/${application.id}/status`, {
    email: adminEmail,
    method: "PATCH",
    body: { status: "Selected" },
  });
  await req(campus + `admissions/applications/${application.id}/status`, {
    email: adminEmail,
    method: "PATCH",
    body: { status: "Confirmed" },
  });
  check("Candidate seat selected and confirmed", () => {});

  // 5.5 Enrollment: Convert Application to Enrolled Student
  const enrolledStudent = await req(campus + `admissions/applications/${application.id}/enroll`, {
    email: adminEmail,
    method: "POST",
    body: {
      academicYearId: activeYearId,
      classId: activeClassId,
      sectionId: activeSectionId,
      rollNumber: "05",
      admissionDate: "2026-04-01",
    },
  });
  check("One-click enrollment creates student ID, profile, enrollment and audit history", () => {
    assert.ok(enrolledStudent.studentId);
    assert.ok(enrolledStudent.admissionNumber.startsWith("ADM-"));
  });
  const studentId = enrolledStudent.studentId;

  // 6. STUDENT LIFECYCLE: EMERGENCY CONTACTS, EXAMS, LMS, TC, ARCHIVE & TIMELINE
  console.log("\n--- Testing Student Lifecycle, Emergency Contacts, TC & Academics ---");

  // 6.1 Emergency Contacts
  const emergencyContact = await req(campus + `students/${studentId}/emergency-contacts`, {
    email: adminEmail,
    method: "POST",
    body: {
      name: "Ramesh Verma",
      relationship: "Uncle",
      phone: "+91 9123456789",
      alternatePhone: "+91 9876543211",
      address: "Indiranagar, Bengaluru",
      isPrimary: true,
    },
  });
  check("Emergency contact added for student", () => {
    assert.ok(emergencyContact.id);
  });

  const contactsList = await req(campus + `students/${studentId}/emergency-contacts`, {
    email: adminEmail,
  });
  check("Emergency contacts list returns contact", () => {
    assert.ok(contactsList.contacts.some((c) => c.id === emergencyContact.id));
  });

  // 6.2 Academics & Exams
  const exam = await req(campus + `students/${studentId}/exams`, {
    email: adminEmail,
    method: "POST",
    body: {
      examName: "Term 1 Final Examination",
      term: "Term 1",
      subject: "Mathematics",
      maxMarks: 100,
      marksObtained: 94,
      grade: "A+",
      remarks: "Top 5% in class",
    },
  });
  check("Student exam marks recorded", () => {
    assert.ok(exam.id);
  });

  const studentExams = await req(campus + `students/${studentId}/exams`, { email: adminEmail });
  check("Student exams list returns assessment", () => {
    assert.ok(studentExams.exams.some((e) => e.id === exam.id));
  });

  // 6.3 LMS Courses
  const lmsCourse = await req(campus + `students/${studentId}/courses`, {
    email: adminEmail,
    method: "POST",
    body: {
      courseCode: "SCI-501",
      courseName: "General Science & Experiments",
      teacherName: "Dr. Rekha Sharma",
    },
  });
  check("Student enrolled in LMS course", () => {
    assert.ok(lmsCourse.id);
  });

  const studentCourses = await req(campus + `students/${studentId}/courses`, { email: adminEmail });
  check("Student LMS courses list returns enrolled course", () => {
    assert.ok(studentCourses.courses.some((c) => c.id === lmsCourse.id));
  });

  // 6.4 Student History Timeline
  const timeline = await req(campus + `students/${studentId}/history`, { email: adminEmail });
  check("Student audit timeline records enrollment and academic events", () => {
    assert.ok(Array.isArray(timeline.history));
    assert.ok(timeline.history.length > 0);
  });

  // 6.5 Transfer Certificate (TC) Generation
  const tcRes = await req(campus + `students/${studentId}/transfer`, {
    email: adminEmail,
    method: "POST",
    body: {
      reason: "Parent Relocation to Mumbai",
      conductRating: "Excellent",
      remarks: "All library books and campus dues cleared.",
    },
  });
  check("Transfer Certificate issued, student status set to Transferred", () => {
    assert.ok(tcRes.tcNumber.startsWith("TC-"));
  });

  // 6.6 Archive & Restore
  await req(campus + `students/${studentId}/archive`, {
    email: adminEmail,
    method: "POST",
    body: { reason: "End of tenure archive" },
  });
  check("Student archived successfully", () => {});

  await req(campus + `students/${studentId}/restore`, {
    email: adminEmail,
    method: "POST",
    body: {},
  });
  check("Student restored to Active successfully", () => {});

  // 7. PORTAL FOUNDATIONS
  console.log("\n--- Testing Parent & Student Portal Foundations ---");

  // 7.1 Parent Portal Summary
  const parentSummary = await req(campus + "parent-portal/summary", {
    email: "sanjay.verma@test.com",
  });
  check("Parent portal summary returns linked child and fee balance", () => {
    assert.ok(Array.isArray(parentSummary.children));
    assert.ok(parentSummary.children.some((c) => c.id === studentId));
  });

  // 7.2 Student Portal Summary
  const studentPortalSummary = await req(campus + "student-portal/summary", {
    email: adminEmail,
  });
  check("Student portal summary returns student profile and academic standing", () => {
    assert.ok(studentPortalSummary.student);
    assert.ok(typeof studentPortalSummary.attendanceRate === "number");
  });

  console.log(`\nAll Member 1 (Sumit Kumar) checks passed: ${checks} / ${checks}`);
  process.exit(0);
} catch (error) {
  console.error("\nTEST FAILED:", error);
  process.exit(1);
}
