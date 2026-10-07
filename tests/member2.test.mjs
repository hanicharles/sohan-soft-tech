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
  if (result && result.errorCode && !result.error) {
    result.error = { code: result.errorCode, message: result.message };
  }
  return result.data ?? result;
}

try {
  console.log("Starting Member 2 (Manoj Kumar M) End-to-End Test Suite...\n");

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
  const adminEmail = "manoj.admin@institution.test";
  const create = await req("platform/institutions", {
    method: "POST",
    body: {
      name: "SST Member 2 Academy",
      institutionCode: "SST-M2",
      institutionType: "College",
      adminName: "Manoj Kumar Admin",
      adminEmail: adminEmail,
      adminMobile: "9876543220",
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
  check("Bootstrap provisions institution and initial academic metadata", () => {
    assert.ok(boot.institution.id);
    assert.ok(boot.years.length > 0);
    assert.ok(boot.departments !== undefined);
    assert.ok(boot.programs !== undefined);
  });
  const activeYearId = boot.years[0].id;
  const activeClassId = boot.classes[0].id;
  const activeSectionId = boot.sections[0].id;

  // 2. DEPARTMENTS CRUD & MAPPING
  console.log("\n--- Testing Departments Management & Mapping ---");
  const newDept = await req(campus + "departments", {
    email: adminEmail,
    method: "POST",
    body: {
      code: "AI-DS",
      name: "Artificial Intelligence & Data Science",
      description: "Machine learning, neural architectures, big data analytics",
      hodName: "Dr. K. S. Raman",
      status: "Active",
    },
  });
  check("Department created successfully with code and HOD", () => {
    assert.equal(newDept.code, "AI-DS");
    assert.equal(newDept.name, "Artificial Intelligence & Data Science");
  });

  const dupDept = await req(campus + "departments", {
    email: adminEmail,
    method: "POST",
    body: {
      code: "AI-DS",
      name: "Duplicate AI Dept",
    },
    status: 409,
  });
  check("Duplicate department code is rejected (409 DUPLICATE_CODE)", () => {
    assert.equal(dupDept.error?.code, "DUPLICATE_CODE");
  });

  const deptList = await req(campus + "departments", { email: adminEmail });
  check("Departments list returns records with faculty & subject counts", () => {
    assert.ok(deptList.rows.length >= 1);
    const found = deptList.rows.find((d) => d.code === "AI-DS");
    assert.ok(found);
  });

  const updatedDept = await req(campus + "departments/" + newDept.id, {
    email: adminEmail,
    method: "PATCH",
    body: {
      description: "Updated description for AI-DS",
      hodName: "Dr. K. S. Raman Ph.D",
    },
  });
  check("Department updated successfully", () => {
    assert.equal(updatedDept.hod_name, "Dr. K. S. Raman Ph.D");
  });

  // 3. PROGRAMS CRUD & CONFIGURATION
  console.log("\n--- Testing Degree Programs Configuration ---");
  const newProg = await req(campus + "programs", {
    email: adminEmail,
    method: "POST",
    body: {
      code: "BTECH-AIDS",
      name: "B.Tech in Artificial Intelligence & Data Science",
      departmentId: newDept.id,
      degreeLevel: "Undergraduate",
      durationYears: 4,
      totalSemesters: 8,
      totalCredits: 164,
      coordinatorName: "Prof. Ananya Sen",
      status: "Active",
    },
  });
  check("Academic program configured with duration, credits, coordinator", () => {
    assert.equal(newProg.code, "BTECH-AIDS");
    assert.equal(newProg.total_credits, 164);
  });

  const dupProg = await req(campus + "programs", {
    email: adminEmail,
    method: "POST",
    body: {
      code: "BTECH-AIDS",
      name: "Duplicate Program",
    },
    status: 409,
  });
  check("Duplicate program code rejected (409 DUPLICATE_CODE)", () => {
    assert.equal(dupProg.error?.code, "DUPLICATE_CODE");
  });

  const progList = await req(campus + "programs", { email: adminEmail });
  check("Programs list retrieves program with department join", () => {
    assert.ok(progList.rows.length >= 1);
  });

  // 4. ACADEMIC SEMESTERS
  console.log("\n--- Testing Academic Semesters ---");
  const newSem = await req(campus + "semesters", {
    email: adminEmail,
    method: "POST",
    body: {
      academicYearId: activeYearId,
      programId: newProg.id,
      name: "Semester 1 (Autumn 2026)",
      startDate: "2026-08-01",
      endDate: "2026-12-20",
      isCurrent: 1,
      status: "Active",
    },
  });
  check("Academic semester configured and activated", () => {
    assert.equal(newSem.name, "Semester 1 (Autumn 2026)");
    assert.equal(newSem.is_current, 1);
  });

  const semList = await req(campus + "semesters?yearId=" + activeYearId, { email: adminEmail });
  check("Semesters list filtered by academic year", () => {
    assert.ok(semList.rows.length >= 1);
  });

  // 5. SUBJECTS CRUD & MAPPING
  console.log("\n--- Testing Subjects Management & Credit Mapping ---");
  const newSub = await req(campus + "subjects", {
    email: adminEmail,
    method: "POST",
    body: {
      code: "AI201",
      name: "Foundations of Machine Learning",
      departmentId: newDept.id,
      classId: activeClassId,
      type: "Theory",
      credits: 4,
      status: "Active",
    },
  });
  check("Subject created with credits, type and department mapping", () => {
    assert.equal(newSub.code, "AI201");
    assert.equal(newSub.credits, 4);
  });

  const dupSub = await req(campus + "subjects", {
    email: adminEmail,
    method: "POST",
    body: {
      code: "AI201",
      name: "Duplicate Subject",
    },
    status: 409,
  });
  check("Duplicate subject code rejected (409 DUPLICATE_CODE)", () => {
    assert.equal(dupSub.error?.code, "DUPLICATE_CODE");
  });

  // 6. FACULTY DIRECTORY & PROFILE & DOCUMENTS
  console.log("\n--- Testing Faculty Directory, Qualifications & Documents ---");
  const newFaculty = await req(campus + "faculty", {
    email: adminEmail,
    method: "POST",
    body: {
      employeeId: "EMP-FAC-901",
      name: "Dr. Vikramaditya Roy",
      email: "v.roy@institution.test",
      phone: "9876543299",
      departmentId: newDept.id,
      departmentName: "Artificial Intelligence & Data Science",
      designation: "Associate Professor",
      qualification: "Ph.D in Machine Learning (IISc)",
      specialization: "Deep Neural Architectures",
      experienceYears: 14,
      joiningDate: "2024-01-10",
      status: "Active",
    },
  });
  check("Faculty member registered with qualification, experience & employee ID", () => {
    assert.equal(newFaculty.employee_id, "EMP-FAC-901");
    assert.equal(newFaculty.experience_years, 14);
  });

  const dupFaculty = await req(campus + "faculty", {
    email: adminEmail,
    method: "POST",
    body: {
      employeeId: "EMP-FAC-901",
      name: "Duplicate Faculty",
      email: "dup@institution.test",
    },
    status: 409,
  });
  check("Duplicate employee ID rejected (409 DUPLICATE_EMPLOYEE_ID)", () => {
    assert.equal(dupFaculty.error?.code, "DUPLICATE_EMPLOYEE_ID");
  });

  // Attach faculty document
  const doc = await req(campus + `faculty/${newFaculty.id}/documents`, {
    email: adminEmail,
    method: "POST",
    body: {
      title: "Doctoral Degree Certificate",
      documentType: "Qualification Certificate",
      fileUrl: "https://campus.test/docs/vroy-phd.pdf",
    },
  });
  check("Faculty qualification document uploaded and attached", () => {
    assert.equal(doc.title, "Doctoral Degree Certificate");
    assert.equal(doc.faculty_id, newFaculty.id);
  });

  const facProfile = await req(campus + `faculty/${newFaculty.id}`, { email: adminEmail });
  check("Faculty detailed profile returns documents and subject mappings", () => {
    assert.equal(facProfile.id, newFaculty.id);
    assert.ok(facProfile.documents.length >= 1);
  });

  // 7. TIMETABLE SCHEDULER & 3-WAY CONFLICT DETECTION
  console.log("\n--- Testing Timetable Scheduler & Conflict Detection ---");
  const slot1 = await req(campus + "timetable", {
    email: adminEmail,
    method: "POST",
    body: {
      academicYearId: activeYearId,
      classId: activeClassId,
      sectionId: activeSectionId,
      subjectId: newSub.id,
      facultyId: newFaculty.id,
      dayOfWeek: "Monday",
      periodNumber: 1,
      startTime: "09:00",
      endTime: "09:55",
      roomNumber: "Seminar-Hall-A",
      status: "Published",
    },
  });
  check("Timetable slot created successfully with room and faculty", () => {
    assert.equal(slot1.day_of_week, "Monday");
    assert.equal(slot1.period_number, 1);
    assert.equal(slot1.room_number, "Seminar-Hall-A");
  });

  // Conflict 1: Section conflict (Slot already occupied in this section)
  const conflictSection = await req(campus + "timetable", {
    email: adminEmail,
    method: "POST",
    body: {
      academicYearId: activeYearId,
      classId: activeClassId,
      sectionId: activeSectionId,
      subjectId: newSub.id,
      facultyId: null,
      dayOfWeek: "Monday",
      periodNumber: 1,
      startTime: "09:00",
      endTime: "09:55",
      roomNumber: "Room-202",
    },
    status: 409,
  });
  check("Conflict 1: Section already booked at same period rejected (409 SECTION_CONFLICT)", () => {
    assert.equal(conflictSection.error?.code, "SECTION_CONFLICT");
  });

  // Prepare a second section for overlap tests
  const secondSection = boot.sections.find((s) => s.id !== activeSectionId) || boot.sections[0];
  const secondSectionId = secondSection.id;

  // Conflict 2: Faculty conflict (Faculty already teaching in Section A at Monday Period 1)
  const conflictFaculty = await req(campus + "timetable", {
    email: adminEmail,
    method: "POST",
    body: {
      academicYearId: activeYearId,
      classId: boot.classes[1]?.id || activeClassId,
      sectionId: secondSectionId,
      subjectId: newSub.id,
      facultyId: newFaculty.id,
      dayOfWeek: "Monday",
      periodNumber: 1,
      startTime: "09:00",
      endTime: "09:55",
      roomNumber: "Room-303",
    },
    status: 409,
  });
  check("Conflict 2: Faculty double-booking rejected (409 FACULTY_CONFLICT)", () => {
    assert.equal(conflictFaculty.error?.code, "FACULTY_CONFLICT");
  });

  // Conflict 3: Room conflict (Seminar-Hall-A already occupied at Monday Period 1)
  const conflictRoom = await req(campus + "timetable", {
    email: adminEmail,
    method: "POST",
    body: {
      academicYearId: activeYearId,
      classId: boot.classes[1]?.id || activeClassId,
      sectionId: secondSectionId,
      subjectId: newSub.id,
      facultyId: null,
      dayOfWeek: "Monday",
      periodNumber: 1,
      startTime: "09:00",
      endTime: "09:55",
      roomNumber: "Seminar-Hall-A",
    },
    status: 409,
  });
  check("Conflict 3: Room collision rejected (409 ROOM_CONFLICT)", () => {
    assert.equal(conflictRoom.error?.code, "ROOM_CONFLICT");
  });

  // Publish timetable toggle
  const publishRes = await req(campus + "timetable/publish", {
    email: adminEmail,
    method: "POST",
    body: {
      classId: activeClassId,
      sectionId: activeSectionId,
      status: "Published",
    },
  });
  check("Timetable schedule published successfully", () => {
    assert.equal(publishRes.status, "Published");
  });

  // 8. STUDENT ATTENDANCE, BULK ENTRY & AUDITED CORRECTIONS
  console.log("\n--- Testing Student Attendance & Audited Corrections ---");
  // Register 3 students for testing attendance
  const s1 = await req(campus + "students", {
    email: adminEmail,
    method: "POST",
    body: {
      admissionNumber: "ADM-M2-001",
      name: "Dev Sharma",
      admissionDate: "2026-06-01",
      sectionId: activeSectionId,
      yearId: activeYearId,
    },
  });
  const s2 = await req(campus + "students", {
    email: adminEmail,
    method: "POST",
    body: {
      admissionNumber: "ADM-M2-002",
      name: "Isha Patel",
      admissionDate: "2026-06-01",
      sectionId: activeSectionId,
      yearId: activeYearId,
    },
  });
  const s3 = await req(campus + "students", {
    email: adminEmail,
    method: "POST",
    body: {
      admissionNumber: "ADM-M2-003",
      name: "Rohan Varma",
      admissionDate: "2026-06-01",
      sectionId: activeSectionId,
      yearId: activeYearId,
    },
  });

  // Bulk record attendance
  const attDate = "2026-10-07";
  const bulkAtt = await req(campus + "attendance/students/bulk", {
    email: adminEmail,
    method: "POST",
    body: {
      academicYearId: activeYearId,
      classId: activeClassId,
      sectionId: activeSectionId,
      date: attDate,
      records: [
        { studentId: s1.id, status: "Present", remarks: "On time" },
        { studentId: s2.id, status: "Absent", remarks: "Unexcused" },
        { studentId: s3.id, status: "Late", remarks: "Bus delay 15m" },
      ],
    },
  });
  check("Bulk attendance recorded for entire section", () => {
    assert.equal(bulkAtt.count, 3);
  });

  const attList = await req(campus + `attendance/students?date=${attDate}&sectionId=${activeSectionId}`, {
    email: adminEmail,
  });
  check("Attendance list returns daily section roster with statuses", () => {
    assert.ok(attList.rows.length >= 3);
  });

  const recordToCorrect = attList.rows.find((r) => r.student_id === s2.id);
  assert.ok(recordToCorrect, "Record for s2 must exist");

  // Attempt correction without mandatory justification -> 400 REASON_REQUIRED
  const missingReason = await req(campus + "attendance/students/correct", {
    email: adminEmail,
    method: "POST",
    body: {
      attendanceId: recordToCorrect.id,
      newStatus: "Excused",
      correctionReason: "",
    },
    status: 400,
  });
  check("Attendance correction without mandatory audit justification is rejected (400 REASON_REQUIRED)", () => {
    assert.equal(missingReason.error?.code, "REASON_REQUIRED");
  });

  // Execute audited correction
  const auditedCorrection = await req(campus + "attendance/students/correct", {
    email: adminEmail,
    method: "POST",
    body: {
      attendanceId: recordToCorrect.id,
      newStatus: "Excused",
      correctionReason: "Medical slip verified by principal's office",
    },
  });
  check("Attendance corrected with audit trail and justification", () => {
    assert.equal(auditedCorrection.oldStatus, "Absent");
    assert.equal(auditedCorrection.newStatus, "Excused");
    assert.equal(auditedCorrection.audited, true);
  });

  // Verify audit log entry in database
  const auditRow = await db
    .prepare("SELECT * FROM audit_logs WHERE action='ATTENDANCE_CORRECTION' AND entity_id=?")
    .bind(recordToCorrect.id)
    .first();
  check("Audit log entry safely persisted to audit_logs table", () => {
    assert.ok(auditRow);
    assert.equal(auditRow.action, "ATTENDANCE_CORRECTION");
  });

  // Monthly summary & low-attendance alerts
  const summaryReport = await req(campus + `attendance/students/report?classId=${activeClassId}`, {
    email: adminEmail,
  });
  check("Monthly attendance report calculates percentages and alerts", () => {
    assert.ok(summaryReport.report.length >= 1);
  });

  // 9. FACULTY ATTENDANCE
  console.log("\n--- Testing Faculty Daily Attendance & Check-In ---");
  const checkIn = await req(campus + "attendance/faculty/check-in", {
    email: adminEmail,
    method: "POST",
    body: {
      facultyId: newFaculty.id,
      date: attDate,
      time: "08:50",
      notes: "On-time arrival",
    },
  });
  check("Faculty check-in recorded with timestamp", () => {
    assert.equal(checkIn.checkIn, "08:50");
  });

  const checkOut = await req(campus + "attendance/faculty/check-out", {
    email: adminEmail,
    method: "POST",
    body: {
      facultyId: newFaculty.id,
      date: attDate,
      time: "16:45",
    },
  });
  check("Faculty check-out recorded with timestamp", () => {
    assert.equal(checkOut.checkOut, "16:45");
  });

  // 10. FACULTY LEAVE MANAGEMENT WORKFLOW
  console.log("\n--- Testing Faculty Leave Application & Review Workflow ---");
  const leaveApp = await req(campus + "leaves", {
    email: adminEmail,
    method: "POST",
    body: {
      facultyId: newFaculty.id,
      leaveType: "Casual",
      startDate: "2026-10-20",
      endDate: "2026-10-21",
      daysCount: 2,
      reason: "Family wedding and personal travel",
      substituteFacultyId: null,
      substituteName: "Prof. Ananya Sen",
    },
  });
  check("Faculty leave application submitted with status 'Pending'", () => {
    assert.equal(leaveApp.leave_type, "Casual");
    assert.equal(leaveApp.status, "Pending");
  });

  const leavesList = await req(campus + `leaves?facultyId=${newFaculty.id}`, { email: adminEmail });
  check("Leaves list retrieves pending leave applications", () => {
    assert.ok(leavesList.rows.length >= 1);
  });

  const reviewedLeave = await req(campus + `leaves/${leaveApp.id}/review`, {
    email: adminEmail,
    method: "POST",
    body: {
      status: "Approved",
      reviewComments: "Approved. Substitute arrangements confirmed.",
    },
  });
  check("Institution Admin approves leave with review comments", () => {
    assert.equal(reviewedLeave.status, "Approved");
    assert.equal(reviewedLeave.review_comments, "Approved. Substitute arrangements confirmed.");
  });

  console.log(`\nAll Member 2 (Manoj Kumar M) checks passed: ${checks} / ${checks}\n`);
} catch (err) {
  console.error("Test Suite Error:", err);
  process.exit(1);
}
