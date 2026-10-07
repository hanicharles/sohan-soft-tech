import { all, batch, insert, now, one, Row, run, stamps, stmt, uuid } from "../db";
import { Actor, ApiError, hasPermission, permit } from "../security";
import { ok, RouteContext } from "./shared";

export async function academicsFacultyRoute(ctx: RouteContext): Promise<Response | null> {
  const { actor, path, method, body, p, requestId } = ctx;
  const k = path[0];

  // -------------------------------------------------------------
  // 1. DEPARTMENTS
  // -------------------------------------------------------------
  if (k === "departments") {
    if (method === "GET") {
      permit(actor, "academics.view");
      const rows = await all(
        `SELECT d.*, 
          (SELECT COUNT(*) FROM faculty f WHERE f.department_id = d.id AND f.institution_id = d.institution_id) as faculty_count,
          (SELECT COUNT(*) FROM subjects s WHERE s.department_id = d.id AND s.institution_id = d.institution_id) as subject_count
         FROM departments d 
         WHERE d.institution_id = ? 
         ORDER BY d.name ASC`,
        [actor.institutionId],
      );
      return ok({ rows, total: rows.length }, requestId);
    }

    if (method === "POST") {
      permit(actor, "academics.manage");
      const code = String(body.code || "").trim().toUpperCase();
      const name = String(body.name || "").trim();
      if (!code || !name) throw new ApiError(400, "VALIDATION_FAILED", "Code and name are required.");

      const existing = await one("SELECT id FROM departments WHERE institution_id = ? AND code = ?", [
        actor.institutionId,
        code,
      ]);
      if (existing) throw new ApiError(409, "DUPLICATE_CODE", `Department code '${code}' already exists.`);

      const id = uuid();
      await run(
        `INSERT INTO departments(id, institution_id, code, name, description, hod_id, hod_name, status, created_at, updated_at, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          actor.institutionId,
          code,
          name,
          body.description || "",
          body.hodId || null,
          body.hodName || "",
          body.status || "Active",
          now(),
          now(),
          actor.userId,
          actor.userId,
        ],
      );
      const created = await one("SELECT * FROM departments WHERE id = ?", [id]);
      return ok(created, requestId);
    }

    if (method === "PATCH" && path[1]) {
      permit(actor, "academics.manage");
      const id = path[1];
      const dep = await one("SELECT * FROM departments WHERE id = ? AND institution_id = ?", [
        id,
        actor.institutionId,
      ]);
      if (!dep) throw new ApiError(404, "NOT_FOUND", "Department not found.");

      await run(
        `UPDATE departments SET 
           name = COALESCE(?, name),
           description = COALESCE(?, description),
           hod_id = COALESCE(?, hod_id),
           hod_name = COALESCE(?, hod_name),
           status = COALESCE(?, status),
           updated_at = ?,
           updated_by = ?
         WHERE id = ? AND institution_id = ?`,
        [
          body.name !== undefined ? String(body.name).trim() : null,
          body.description !== undefined ? String(body.description) : null,
          body.hodId !== undefined ? body.hodId : null,
          body.hodName !== undefined ? body.hodName : null,
          body.status !== undefined ? body.status : null,
          now(),
          actor.userId,
          id,
          actor.institutionId,
        ],
      );
      const updated = await one("SELECT * FROM departments WHERE id = ?", [id]);
      return ok(updated, requestId);
    }

    if (method === "DELETE" && path[1]) {
      permit(actor, "academics.manage");
      const id = path[1];
      await run("DELETE FROM departments WHERE id = ? AND institution_id = ?", [id, actor.institutionId]);
      return ok({ success: true, id }, requestId);
    }
  }

  // -------------------------------------------------------------
  // 2. PROGRAMS
  // -------------------------------------------------------------
  if (k === "programs") {
    if (method === "GET") {
      permit(actor, "academics.view");
      const rows = await all(
        `SELECT p.*, d.name as department_name 
         FROM programs p
         LEFT JOIN departments d ON d.id = p.department_id AND d.institution_id = p.institution_id
         WHERE p.institution_id = ? 
         ORDER BY p.name ASC`,
        [actor.institutionId],
      );
      return ok({ rows, total: rows.length }, requestId);
    }

    if (method === "POST") {
      permit(actor, "academics.manage");
      const code = String(body.code || "").trim().toUpperCase();
      const name = String(body.name || "").trim();
      if (!code || !name) throw new ApiError(400, "VALIDATION_FAILED", "Code and name are required.");

      const existing = await one("SELECT id FROM programs WHERE institution_id = ? AND code = ?", [
        actor.institutionId,
        code,
      ]);
      if (existing) throw new ApiError(409, "DUPLICATE_CODE", `Program code '${code}' already exists.`);

      const id = uuid();
      await run(
        `INSERT INTO programs(id, institution_id, department_id, code, name, degree_level, duration_years, total_semesters, total_credits, coordinator_id, coordinator_name, status, created_at, updated_at, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          actor.institutionId,
          body.departmentId || null,
          code,
          name,
          body.degreeLevel || "Undergraduate",
          Number(body.durationYears) || 4,
          Number(body.totalSemesters) || 8,
          Number(body.totalCredits) || 160,
          body.coordinatorId || null,
          body.coordinatorName || "",
          body.status || "Active",
          now(),
          now(),
          actor.userId,
          actor.userId,
        ],
      );
      const created = await one("SELECT * FROM programs WHERE id = ?", [id]);
      return ok(created, requestId);
    }

    if (method === "PATCH" && path[1]) {
      permit(actor, "academics.manage");
      const id = path[1];
      await run(
        `UPDATE programs SET 
           name = COALESCE(?, name),
           department_id = COALESCE(?, department_id),
           degree_level = COALESCE(?, degree_level),
           duration_years = COALESCE(?, duration_years),
           total_semesters = COALESCE(?, total_semesters),
           total_credits = COALESCE(?, total_credits),
           coordinator_id = COALESCE(?, coordinator_id),
           coordinator_name = COALESCE(?, coordinator_name),
           status = COALESCE(?, status),
           updated_at = ?,
           updated_by = ?
         WHERE id = ? AND institution_id = ?`,
        [
          body.name !== undefined ? String(body.name).trim() : null,
          body.departmentId !== undefined ? body.departmentId : null,
          body.degreeLevel !== undefined ? body.degreeLevel : null,
          body.durationYears !== undefined ? Number(body.durationYears) : null,
          body.totalSemesters !== undefined ? Number(body.totalSemesters) : null,
          body.totalCredits !== undefined ? Number(body.totalCredits) : null,
          body.coordinatorId !== undefined ? body.coordinatorId : null,
          body.coordinatorName !== undefined ? body.coordinatorName : null,
          body.status !== undefined ? body.status : null,
          now(),
          actor.userId,
          id,
          actor.institutionId,
        ],
      );
      const updated = await one("SELECT * FROM programs WHERE id = ?", [id]);
      return ok(updated, requestId);
    }

    if (method === "DELETE" && path[1]) {
      permit(actor, "academics.manage");
      await run("DELETE FROM programs WHERE id = ? AND institution_id = ?", [path[1], actor.institutionId]);
      return ok({ success: true, id: path[1] }, requestId);
    }
  }

  // -------------------------------------------------------------
  // 3. SEMESTERS
  // -------------------------------------------------------------
  if (k === "semesters") {
    if (method === "GET") {
      permit(actor, "academics.view");
      const yearId = p.get("yearId");
      let query = `SELECT s.*, y.name as academic_year_name, p.name as program_name 
                   FROM academic_semesters s
                   JOIN academic_years y ON y.id = s.academic_year_id AND y.institution_id = s.institution_id
                   LEFT JOIN programs p ON p.id = s.program_id AND p.institution_id = s.institution_id
                   WHERE s.institution_id = ?`;
      const params: any[] = [actor.institutionId];
      if (yearId) {
        query += " AND s.academic_year_id = ?";
        params.push(yearId);
      }
      query += " ORDER BY s.start_date ASC";
      const rows = await all(query, params);
      return ok({ rows, total: rows.length }, requestId);
    }

    if (method === "POST") {
      permit(actor, "academics.manage");
      const yearId = body.academicYearId || p.get("yearId");
      const name = String(body.name || "").trim();
      const startDate = body.startDate;
      const endDate = body.endDate;
      if (!yearId || !name || !startDate || !endDate) {
        throw new ApiError(400, "VALIDATION_FAILED", "Academic year, semester name, and dates are required.");
      }

      const id = uuid();
      await run(
        `INSERT INTO academic_semesters(id, institution_id, academic_year_id, program_id, name, start_date, end_date, is_current, status, created_at, updated_at, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          actor.institutionId,
          yearId,
          body.programId || null,
          name,
          startDate,
          endDate,
          body.isCurrent ? 1 : 0,
          body.status || "Upcoming",
          now(),
          now(),
          actor.userId,
          actor.userId,
        ],
      );
      return ok(await one("SELECT * FROM academic_semesters WHERE id = ?", [id]), requestId);
    }

    if (method === "PATCH" && path[1]) {
      permit(actor, "academics.manage");
      const id = path[1];
      if (body.isCurrent) {
        await run("UPDATE academic_semesters SET is_current = 0 WHERE institution_id = ?", [actor.institutionId]);
      }
      await run(
        `UPDATE academic_semesters SET 
           name = COALESCE(?, name),
           start_date = COALESCE(?, start_date),
           end_date = COALESCE(?, end_date),
           is_current = COALESCE(?, is_current),
           status = COALESCE(?, status),
           updated_at = ?,
           updated_by = ?
         WHERE id = ? AND institution_id = ?`,
        [
          body.name !== undefined ? String(body.name).trim() : null,
          body.startDate !== undefined ? body.startDate : null,
          body.endDate !== undefined ? body.endDate : null,
          body.isCurrent !== undefined ? (body.isCurrent ? 1 : 0) : null,
          body.status !== undefined ? body.status : null,
          now(),
          actor.userId,
          id,
          actor.institutionId,
        ],
      );
      return ok(await one("SELECT * FROM academic_semesters WHERE id = ?", [id]), requestId);
    }

    if (method === "DELETE" && path[1]) {
      permit(actor, "academics.manage");
      await run("DELETE FROM academic_semesters WHERE id = ? AND institution_id = ?", [path[1], actor.institutionId]);
      return ok({ success: true, id: path[1] }, requestId);
    }
  }

  // -------------------------------------------------------------
  // 4. SUBJECTS
  // -------------------------------------------------------------
  if (k === "subjects") {
    if (method === "GET") {
      permit(actor, "academics.view");
      const classId = p.get("classId");
      const departmentId = p.get("departmentId");
      let query = `SELECT s.*, d.name as department_name, c.name as class_name, f.name as faculty_name
                   FROM subjects s
                   LEFT JOIN departments d ON d.id = s.department_id AND d.institution_id = s.institution_id
                   LEFT JOIN classes c ON c.id = s.class_id AND c.institution_id = s.institution_id
                   LEFT JOIN faculty f ON f.id = s.faculty_id AND f.institution_id = s.institution_id
                   WHERE s.institution_id = ?`;
      const params: any[] = [actor.institutionId];
      if (classId) {
        query += " AND s.class_id = ?";
        params.push(classId);
      }
      if (departmentId) {
        query += " AND s.department_id = ?";
        params.push(departmentId);
      }
      query += " ORDER BY s.name ASC";
      const rows = await all(query, params);
      return ok({ rows, total: rows.length }, requestId);
    }

    if (method === "POST") {
      permit(actor, "academics.manage");
      const code = String(body.code || "").trim().toUpperCase();
      const name = String(body.name || "").trim();
      if (!code || !name) throw new ApiError(400, "VALIDATION_FAILED", "Subject code and name are required.");

      const existing = await one("SELECT id FROM subjects WHERE institution_id = ? AND code = ?", [
        actor.institutionId,
        code,
      ]);
      if (existing) throw new ApiError(409, "DUPLICATE_CODE", `Subject code '${code}' already exists.`);

      const id = uuid();
      await run(
        `INSERT INTO subjects(id, institution_id, department_id, class_id, code, name, type, credits, faculty_id, status, created_at, updated_at, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          actor.institutionId,
          body.departmentId || null,
          body.classId || null,
          code,
          name,
          body.type || "Theory",
          Number(body.credits) || 3,
          body.facultyId || null,
          body.status || "Active",
          now(),
          now(),
          actor.userId,
          actor.userId,
        ],
      );
      return ok(await one("SELECT * FROM subjects WHERE id = ?", [id]), requestId);
    }

    if (method === "PATCH" && path[1]) {
      permit(actor, "academics.manage");
      const id = path[1];
      await run(
        `UPDATE subjects SET 
           name = COALESCE(?, name),
           department_id = COALESCE(?, department_id),
           class_id = COALESCE(?, class_id),
           type = COALESCE(?, type),
           credits = COALESCE(?, credits),
           faculty_id = COALESCE(?, faculty_id),
           status = COALESCE(?, status),
           updated_at = ?,
           updated_by = ?
         WHERE id = ? AND institution_id = ?`,
        [
          body.name !== undefined ? String(body.name).trim() : null,
          body.departmentId !== undefined ? body.departmentId : null,
          body.classId !== undefined ? body.classId : null,
          body.type !== undefined ? body.type : null,
          body.credits !== undefined ? Number(body.credits) : null,
          body.facultyId !== undefined ? body.facultyId : null,
          body.status !== undefined ? body.status : null,
          now(),
          actor.userId,
          id,
          actor.institutionId,
        ],
      );
      return ok(await one("SELECT * FROM subjects WHERE id = ?", [id]), requestId);
    }

    if (method === "DELETE" && path[1]) {
      permit(actor, "academics.manage");
      await run("DELETE FROM subjects WHERE id = ? AND institution_id = ?", [path[1], actor.institutionId]);
      return ok({ success: true, id: path[1] }, requestId);
    }
  }

  // -------------------------------------------------------------
  // 5. FACULTY DIRECTORY & PROFILE
  // -------------------------------------------------------------
  if (k === "faculty") {
    if (method === "GET") {
      permit(actor, "academics.view");
      if (path[1] && path[1] !== "documents") {
        const id = path[1];
        const fac = await one(
          `SELECT f.*, d.name as department_title
           FROM faculty f
           LEFT JOIN departments d ON d.id = f.department_id AND d.institution_id = f.institution_id
           WHERE f.id = ? AND f.institution_id = ?`,
          [id, actor.institutionId],
        );
        if (!fac) throw new ApiError(404, "NOT_FOUND", "Faculty member not found.");

        const subjectsList = await all(
          "SELECT s.*, c.name as class_name FROM subjects s LEFT JOIN classes c ON c.id = s.class_id WHERE s.faculty_id = ? AND s.institution_id = ?",
          [id, actor.institutionId],
        );
        const documents = await all(
          "SELECT * FROM faculty_documents WHERE faculty_id = ? AND institution_id = ? ORDER BY created_at DESC",
          [id, actor.institutionId],
        );
        const leaves = await all(
          "SELECT * FROM faculty_leaves WHERE faculty_id = ? AND institution_id = ? ORDER BY start_date DESC LIMIT 10",
          [id, actor.institutionId],
        );

        return ok({ ...fac, subjects: subjectsList, documents, leaves }, requestId);
      }

      const rows = await all(
        `SELECT f.*, d.name as department_title,
          (SELECT COUNT(*) FROM subjects s WHERE s.faculty_id = f.id AND s.institution_id = f.institution_id) as subjects_count
         FROM faculty f
         LEFT JOIN departments d ON d.id = f.department_id AND d.institution_id = f.institution_id
         WHERE f.institution_id = ?
         ORDER BY f.name ASC`,
        [actor.institutionId],
      );
      return ok({ rows, total: rows.length }, requestId);
    }

    if (method === "POST" && !path[1]) {
      permit(actor, "academics.manage");
      const employeeId = String(body.employeeId || "").trim().toUpperCase();
      const name = String(body.name || "").trim();
      const email = String(body.email || "").trim().toLowerCase();
      if (!employeeId || !name || !email) {
        throw new ApiError(400, "VALIDATION_FAILED", "Employee ID, name, and email are required.");
      }

      const existing = await one("SELECT id FROM faculty WHERE institution_id = ? AND employee_id = ?", [
        actor.institutionId,
        employeeId,
      ]);
      if (existing) throw new ApiError(409, "DUPLICATE_EMPLOYEE_ID", `Employee ID '${employeeId}' already exists.`);

      const id = uuid();
      await run(
        `INSERT INTO faculty(id, institution_id, user_id, employee_id, name, email, phone, department_id, department_name, designation, qualification, specialization, experience_years, joining_date, status, created_at, updated_at, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          actor.institutionId,
          body.userId || null,
          employeeId,
          name,
          email,
          body.phone || "",
          body.departmentId || null,
          body.departmentName || "",
          body.designation || "Assistant Professor",
          body.qualification || "Master's",
          body.specialization || "",
          Number(body.experienceYears) || 0,
          body.joiningDate || now().slice(0, 10),
          body.status || "Active",
          now(),
          now(),
          actor.userId,
          actor.userId,
        ],
      );
      return ok(await one("SELECT * FROM faculty WHERE id = ?", [id]), requestId);
    }

    if (method === "PATCH" && path[1]) {
      permit(actor, "academics.manage");
      const id = path[1];
      await run(
        `UPDATE faculty SET 
           name = COALESCE(?, name),
           email = COALESCE(?, email),
           phone = COALESCE(?, phone),
           department_id = COALESCE(?, department_id),
           department_name = COALESCE(?, department_name),
           designation = COALESCE(?, designation),
           qualification = COALESCE(?, qualification),
           specialization = COALESCE(?, specialization),
           experience_years = COALESCE(?, experience_years),
           joining_date = COALESCE(?, joining_date),
           status = COALESCE(?, status),
           updated_at = ?,
           updated_by = ?
         WHERE id = ? AND institution_id = ?`,
        [
          body.name !== undefined ? String(body.name).trim() : null,
          body.email !== undefined ? String(body.email).trim().toLowerCase() : null,
          body.phone !== undefined ? String(body.phone).trim() : null,
          body.departmentId !== undefined ? body.departmentId : null,
          body.departmentName !== undefined ? body.departmentName : null,
          body.designation !== undefined ? body.designation : null,
          body.qualification !== undefined ? body.qualification : null,
          body.specialization !== undefined ? body.specialization : null,
          body.experienceYears !== undefined ? Number(body.experienceYears) : null,
          body.joiningDate !== undefined ? body.joiningDate : null,
          body.status !== undefined ? body.status : null,
          now(),
          actor.userId,
          id,
          actor.institutionId,
        ],
      );
      return ok(await one("SELECT * FROM faculty WHERE id = ?", [id]), requestId);
    }

    if (method === "DELETE" && path[1]) {
      permit(actor, "academics.manage");
      await run("DELETE FROM faculty WHERE id = ? AND institution_id = ?", [path[1], actor.institutionId]);
      return ok({ success: true, id: path[1] }, requestId);
    }

    // Attach faculty documents: POST /faculty/:id/documents
    if (method === "POST" && path[1] && path[2] === "documents") {
      permit(actor, "academics.manage");
      const facultyId = path[1];
      const title = String(body.title || "").trim();
      const fileUrl = String(body.fileUrl || "").trim();
      if (!title || !fileUrl) throw new ApiError(400, "VALIDATION_FAILED", "Title and file URL are required.");

      const docId = uuid();
      await run(
        `INSERT INTO faculty_documents(id, institution_id, faculty_id, title, document_type, file_url, created_at, updated_at, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          docId,
          actor.institutionId,
          facultyId,
          title,
          body.documentType || "Resume",
          fileUrl,
          now(),
          now(),
          actor.userId,
          actor.userId,
        ],
      );
      return ok(await one("SELECT * FROM faculty_documents WHERE id = ?", [docId]), requestId);
    }

    // Delete faculty document: DELETE /faculty/:id/documents/:docId
    if (method === "DELETE" && path[1] && path[2] === "documents" && path[3]) {
      permit(actor, "academics.manage");
      await run("DELETE FROM faculty_documents WHERE id = ? AND institution_id = ?", [path[3], actor.institutionId]);
      return ok({ success: true, id: path[3] }, requestId);
    }
  }

  // -------------------------------------------------------------
  // 6. TIMETABLE & CONFLICT DETECTION
  // -------------------------------------------------------------
  if (k === "timetable") {
    if (method === "GET") {
      permit(actor, "academics.view");
      const classId = p.get("classId");
      const sectionId = p.get("sectionId");
      const facultyId = p.get("facultyId");
      const dayOfWeek = p.get("dayOfWeek");
      const academicYearId = p.get("academicYearId");

      let query = `SELECT t.*, 
                     c.name as class_name, 
                     sec.name as section_name, 
                     sub.name as subject_name, 
                     sub.code as subject_code, 
                     f.name as faculty_name,
                     f.employee_id as faculty_employee_id
                   FROM timetable_slots t
                   JOIN classes c ON c.id = t.class_id AND c.institution_id = t.institution_id
                   JOIN sections sec ON sec.id = t.section_id AND sec.institution_id = t.institution_id
                   JOIN subjects sub ON sub.id = t.subject_id AND sub.institution_id = t.institution_id
                   LEFT JOIN faculty f ON f.id = t.faculty_id AND f.institution_id = t.institution_id
                   WHERE t.institution_id = ?`;
      const params: any[] = [actor.institutionId];

      if (classId) {
        query += " AND t.class_id = ?";
        params.push(classId);
      }
      if (sectionId) {
        query += " AND t.section_id = ?";
        params.push(sectionId);
      }
      if (facultyId) {
        query += " AND t.faculty_id = ?";
        params.push(facultyId);
      }
      if (dayOfWeek) {
        query += " AND t.day_of_week = ?";
        params.push(dayOfWeek);
      }
      if (academicYearId) {
        query += " AND t.academic_year_id = ?";
        params.push(academicYearId);
      }

      query += " ORDER BY t.day_of_week ASC, t.period_number ASC";
      const rows = await all(query, params);
      return ok({ rows, total: rows.length }, requestId);
    }

    if (method === "POST" && !path[1]) {
      permit(actor, "academics.manage");
      const academicYearId = body.academicYearId;
      const classId = body.classId;
      const sectionId = body.sectionId;
      const subjectId = body.subjectId;
      const facultyId = body.facultyId || null;
      const dayOfWeek = body.dayOfWeek;
      const periodNumber = Number(body.periodNumber);
      const startTime = body.startTime;
      const endTime = body.endTime;
      const roomNumber = String(body.roomNumber || "").trim();

      if (!academicYearId || !classId || !sectionId || !subjectId || !dayOfWeek || !periodNumber || !startTime || !endTime) {
        throw new ApiError(400, "VALIDATION_FAILED", "All required timetable fields must be provided.");
      }

      // --- CONFLICT DETECTION 1: Section conflict (Slot already occupied in this section) ---
      const sectionConflict = await one(
        `SELECT t.id, sub.name as subject_name 
         FROM timetable_slots t 
         JOIN subjects sub ON sub.id = t.subject_id
         WHERE t.institution_id = ? AND t.academic_year_id = ? AND t.class_id = ? AND t.section_id = ? AND t.day_of_week = ? AND t.period_number = ?`,
        [actor.institutionId, academicYearId, classId, sectionId, dayOfWeek, periodNumber],
      );
      if (sectionConflict) {
        throw new ApiError(
          409,
          "SECTION_CONFLICT",
          `Period ${periodNumber} on ${dayOfWeek} is already assigned to '${sectionConflict.subject_name}' for this section.`,
        );
      }

      // --- CONFLICT DETECTION 2: Faculty conflict (Faculty already teaching elsewhere at this time) ---
      if (facultyId) {
        const facultyConflict = await one(
          `SELECT t.id, c.name as class_name, sec.name as section_name, sub.name as subject_name
           FROM timetable_slots t
           JOIN classes c ON c.id = t.class_id
           JOIN sections sec ON sec.id = t.section_id
           JOIN subjects sub ON sub.id = t.subject_id
           WHERE t.institution_id = ? AND t.academic_year_id = ? AND t.faculty_id = ? AND t.day_of_week = ? AND t.period_number = ?`,
          [actor.institutionId, academicYearId, facultyId, dayOfWeek, periodNumber],
        );
        if (facultyConflict) {
          throw new ApiError(
            409,
            "FACULTY_CONFLICT",
            `Selected faculty is already scheduled with Class ${facultyConflict.class_name} (${facultyConflict.section_name}) for '${facultyConflict.subject_name}' on ${dayOfWeek} Period ${periodNumber}.`,
          );
        }
      }

      // --- CONFLICT DETECTION 3: Room conflict (Room already booked by another class) ---
      if (roomNumber) {
        const roomConflict = await one(
          `SELECT t.id, c.name as class_name, sec.name as section_name 
           FROM timetable_slots t
           JOIN classes c ON c.id = t.class_id
           JOIN sections sec ON sec.id = t.section_id
           WHERE t.institution_id = ? AND t.academic_year_id = ? AND t.room_number = ? AND t.day_of_week = ? AND t.period_number = ?`,
          [actor.institutionId, academicYearId, roomNumber, dayOfWeek, periodNumber],
        );
        if (roomConflict) {
          throw new ApiError(
            409,
            "ROOM_CONFLICT",
            `Room '${roomNumber}' is already booked by Class ${roomConflict.class_name} (${roomConflict.section_name}) on ${dayOfWeek} Period ${periodNumber}.`,
          );
        }
      }

      const id = uuid();
      await run(
        `INSERT INTO timetable_slots(id, institution_id, academic_year_id, campus_id, class_id, section_id, subject_id, faculty_id, day_of_week, period_number, start_time, end_time, room_number, status, created_at, updated_at, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          actor.institutionId,
          academicYearId,
          body.campusId || null,
          classId,
          sectionId,
          subjectId,
          facultyId,
          dayOfWeek,
          periodNumber,
          startTime,
          endTime,
          roomNumber,
          body.status || "Published",
          now(),
          now(),
          actor.userId,
          actor.userId,
        ],
      );
      return ok(await one("SELECT * FROM timetable_slots WHERE id = ?", [id]), requestId);
    }

    if (method === "PATCH" && path[1] && path[1] !== "publish") {
      permit(actor, "academics.manage");
      const id = path[1];
      const slot = await one("SELECT * FROM timetable_slots WHERE id = ? AND institution_id = ?", [
        id,
        actor.institutionId,
      ]);
      if (!slot) throw new ApiError(404, "NOT_FOUND", "Timetable slot not found.");

      const targetFacultyId = body.facultyId !== undefined ? body.facultyId : slot.faculty_id;
      const targetRoom = body.roomNumber !== undefined ? String(body.roomNumber).trim() : slot.room_number;
      const targetDay = body.dayOfWeek || slot.day_of_week;
      const targetPeriod = body.periodNumber !== undefined ? Number(body.periodNumber) : slot.period_number;

      // Faculty conflict check on edit
      if (targetFacultyId) {
        const facConflict = await one(
          `SELECT id FROM timetable_slots 
           WHERE institution_id = ? AND academic_year_id = ? AND faculty_id = ? AND day_of_week = ? AND period_number = ? AND id != ?`,
          [actor.institutionId, slot.academic_year_id, targetFacultyId, targetDay, targetPeriod, id],
        );
        if (facConflict) throw new ApiError(409, "FACULTY_CONFLICT", "Faculty already has another slot at this period.");
      }

      // Room conflict check on edit
      if (targetRoom) {
        const rConflict = await one(
          `SELECT id FROM timetable_slots 
           WHERE institution_id = ? AND academic_year_id = ? AND room_number = ? AND day_of_week = ? AND period_number = ? AND id != ?`,
          [actor.institutionId, slot.academic_year_id, targetRoom, targetDay, targetPeriod, id],
        );
        if (rConflict) throw new ApiError(409, "ROOM_CONFLICT", `Room ${targetRoom} is already occupied at this period.`);
      }

      await run(
        `UPDATE timetable_slots SET 
           subject_id = COALESCE(?, subject_id),
           faculty_id = COALESCE(?, faculty_id),
           start_time = COALESCE(?, start_time),
           end_time = COALESCE(?, end_time),
           room_number = COALESCE(?, room_number),
           status = COALESCE(?, status),
           updated_at = ?,
           updated_by = ?
         WHERE id = ? AND institution_id = ?`,
        [
          body.subjectId || null,
          targetFacultyId,
          body.startTime || null,
          body.endTime || null,
          targetRoom,
          body.status || null,
          now(),
          actor.userId,
          id,
          actor.institutionId,
        ],
      );
      return ok(await one("SELECT * FROM timetable_slots WHERE id = ?", [id]), requestId);
    }

    if (method === "DELETE" && path[1]) {
      permit(actor, "academics.manage");
      await run("DELETE FROM timetable_slots WHERE id = ? AND institution_id = ?", [path[1], actor.institutionId]);
      return ok({ success: true, id: path[1] }, requestId);
    }

    if (method === "POST" && path[1] === "publish") {
      permit(actor, "academics.manage");
      const { classId, sectionId, status = "Published" } = body;
      await run(
        `UPDATE timetable_slots SET status = ?, updated_at = ?, updated_by = ?
         WHERE institution_id = ? AND class_id = ? AND section_id = ?`,
        [status, now(), actor.userId, actor.institutionId, classId, sectionId],
      );
      return ok({ success: true, status }, requestId);
    }
  }

  // -------------------------------------------------------------
  // 7. STUDENT ATTENDANCE & AUDIT CORRECTIONS
  // -------------------------------------------------------------
  if (k === "attendance" && path[1] === "students") {
    // List or get attendance
    if (method === "GET" && (!path[2] || path[2] === "list")) {
      permit(actor, "academics.view");
      const classId = p.get("classId");
      const sectionId = p.get("sectionId");
      const date = p.get("date");
      const studentId = p.get("studentId");

      let query = `SELECT a.*, s.name as student_name, s.admission_number, c.name as class_name, sec.name as section_name
                   FROM student_attendance a
                   JOIN students s ON s.id = a.student_id AND s.institution_id = a.institution_id
                   JOIN classes c ON c.id = a.class_id AND c.institution_id = a.institution_id
                   JOIN sections sec ON sec.id = a.section_id AND sec.institution_id = a.institution_id
                   WHERE a.institution_id = ?`;
      const params: any[] = [actor.institutionId];

      if (classId) {
        query += " AND a.class_id = ?";
        params.push(classId);
      }
      if (sectionId) {
        query += " AND a.section_id = ?";
        params.push(sectionId);
      }
      if (date) {
        query += " AND a.date = ?";
        params.push(date);
      }
      if (studentId) {
        query += " AND a.student_id = ?";
        params.push(studentId);
      }

      query += " ORDER BY a.date DESC, s.name ASC";
      const rows = await all(query, params);
      return ok({ rows, total: rows.length }, requestId);
    }

    // Bulk Record Attendance: POST /attendance/students/bulk
    if (method === "POST" && path[2] === "bulk") {
      // Allowed for faculty, teacher, staff, and admins
      const academicYearId = body.academicYearId;
      const classId = body.classId;
      const sectionId = body.sectionId;
      const date = body.date || now().slice(0, 10);
      const periodNumber = Number(body.periodNumber || 0);
      const records = Array.isArray(body.records) ? body.records : [];

      if (!academicYearId || !classId || !sectionId || !records.length) {
        throw new ApiError(400, "VALIDATION_FAILED", "Class, section, academic year and student records are required.");
      }

      const stmts: any[] = [];
      for (const rec of records) {
        const studentId = rec.studentId;
        const status = rec.status || "Present";
        const remarks = rec.remarks || "";
        const id = uuid();

        stmts.push(
          stmt(
            `INSERT INTO student_attendance(id, institution_id, academic_year_id, class_id, section_id, student_id, date, period_number, status, remarks, recorded_by, created_at, updated_at, created_by, updated_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(institution_id, student_id, date, period_number)
             DO UPDATE SET status=excluded.status, remarks=excluded.remarks, recorded_by=excluded.recorded_by, updated_at=excluded.updated_at, updated_by=excluded.updated_by`,
            [
              id,
              actor.institutionId,
              academicYearId,
              classId,
              sectionId,
              studentId,
              date,
              periodNumber,
              status,
              remarks,
              actor.name,
              now(),
              now(),
              actor.userId,
              actor.userId,
            ],
          ),
        );
      }

      await batch(stmts);
      return ok({ success: true, count: records.length, date }, requestId);
    }

    // Sensitive Correction with Audit Log: POST /attendance/students/correct
    if (method === "POST" && path[2] === "correct") {
      const attendanceId = body.attendanceId;
      const newStatus = body.newStatus;
      const correctionReason = String(body.correctionReason || "").trim();

      if (!attendanceId || !newStatus) {
        throw new ApiError(400, "VALIDATION_FAILED", "Attendance ID and new status are required.");
      }
      if (!correctionReason) {
        throw new ApiError(400, "REASON_REQUIRED", "Correction reason is mandatory for compliance auditing.");
      }

      const existing = await one(
        `SELECT a.*, s.name as student_name 
         FROM student_attendance a
         JOIN students s ON s.id = a.student_id
         WHERE a.id = ? AND a.institution_id = ?`,
        [attendanceId, actor.institutionId],
      );
      if (!existing) throw new ApiError(404, "NOT_FOUND", "Attendance record not found.");

      const oldStatus = existing.status;

      // 1. Update attendance entry with correction notes
      await run(
        `UPDATE student_attendance SET 
           status = ?, 
           correction_reason = ?, 
           corrected_by = ?, 
           updated_at = ?, 
           updated_by = ?
         WHERE id = ? AND institution_id = ?`,
        [newStatus, correctionReason, actor.name, now(), actor.userId, attendanceId, actor.institutionId],
      );

      // 2. Insert into immutable audit_logs table
      const auditId = uuid();
      await run(
        `INSERT INTO audit_logs(id, institution_id, user_id, user_name, action, entity, entity_id, old_value, new_value, ip, user_agent, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          auditId,
          actor.institutionId,
          actor.userId,
          actor.name,
          "ATTENDANCE_CORRECTION",
          "student_attendance",
          attendanceId,
          JSON.stringify({ status: oldStatus, studentName: existing.student_name, date: existing.date }),
          JSON.stringify({ status: newStatus, reason: correctionReason, correctedBy: actor.name }),
          ctx.request.headers.get("cf-connecting-ip") || "127.0.0.1",
          ctx.request.headers.get("user-agent") || "local",
          now(),
        ],
      );

      return ok(
        {
          success: true,
          attendanceId,
          oldStatus,
          newStatus,
          correctionReason,
          correctedBy: actor.name,
          audited: true,
        },
        requestId,
      );
    }

    // Monthly Reports & Low-Attendance Alerts: GET /attendance/students/report
    if (method === "GET" && path[2] === "report") {
      permit(actor, "academics.view");
      const classId = p.get("classId");
      const sectionId = p.get("sectionId");
      const month = p.get("month"); // YYYY-MM
      const academicYearId = p.get("academicYearId");

      let query = `SELECT s.id as student_id, s.name as student_name, s.admission_number,
                     COUNT(a.id) as total_recorded,
                     SUM(CASE WHEN a.status = 'Present' THEN 1 ELSE 0 END) as present_count,
                     SUM(CASE WHEN a.status = 'Absent' THEN 1 ELSE 0 END) as absent_count,
                     SUM(CASE WHEN a.status = 'Late' THEN 1 ELSE 0 END) as late_count,
                     SUM(CASE WHEN a.status = 'Excused' THEN 1 ELSE 0 END) as excused_count
                   FROM students s
                   LEFT JOIN student_attendance a ON a.student_id = s.id AND a.institution_id = s.institution_id`;

      const params: any[] = [];
      const conditions: string[] = ["s.institution_id = ?"];
      params.push(actor.institutionId);

      if (classId) {
        query += " JOIN enrollments e ON e.student_id = s.id AND e.institution_id = s.institution_id";
        conditions.push("e.section_id IN (SELECT id FROM sections WHERE class_id = ?)");
        params.push(classId);
      }
      if (sectionId) {
        conditions.push("a.section_id = ?");
        params.push(sectionId);
      }
      if (month) {
        conditions.push("a.date LIKE ?");
        params.push(month + "%");
      }
      if (academicYearId) {
        conditions.push("a.academic_year_id = ?");
        params.push(academicYearId);
      }

      query += ` WHERE ${conditions.join(" AND ")} GROUP BY s.id ORDER BY s.name ASC`;
      const rawRows = await all(query, params);

      const report = rawRows.map((r: any) => {
        const total = Number(r.total_recorded) || 0;
        const present = Number(r.present_count) || 0;
        const late = Number(r.late_count) || 0;
        const effectivePresent = present + late * 0.5;
        const percentage = total > 0 ? Math.round((effectivePresent / total) * 100) : 100;
        return {
          studentId: r.student_id,
          studentName: r.student_name,
          admissionNumber: r.admission_number,
          totalDays: total,
          presentDays: present,
          absentDays: Number(r.absent_count) || 0,
          lateDays: late,
          excusedDays: Number(r.excused_count) || 0,
          percentage,
          lowAttendanceAlert: total >= 5 && percentage < 75,
        };
      });

      const lowAttendanceCount = report.filter((r) => r.lowAttendanceAlert).length;
      return ok({ report, lowAttendanceCount, totalStudents: report.length }, requestId);
    }
  }

  // -------------------------------------------------------------
  // 8. FACULTY ATTENDANCE
  // -------------------------------------------------------------
  if (k === "attendance" && path[1] === "faculty") {
    if (method === "GET") {
      permit(actor, "academics.view");
      const facultyId = p.get("facultyId");
      const date = p.get("date");
      let query = `SELECT fa.*, f.name as faculty_name, f.employee_id, f.designation
                   FROM faculty_attendance fa
                   JOIN faculty f ON f.id = fa.faculty_id AND f.institution_id = fa.institution_id
                   WHERE fa.institution_id = ?`;
      const params: any[] = [actor.institutionId];
      if (facultyId) {
        query += " AND fa.faculty_id = ?";
        params.push(facultyId);
      }
      if (date) {
        query += " AND fa.date = ?";
        params.push(date);
      }
      query += " ORDER BY fa.date DESC, f.name ASC";
      const rows = await all(query, params);
      return ok({ rows, total: rows.length }, requestId);
    }

    if (method === "POST" && path[2] === "check-in") {
      const facultyId = body.facultyId;
      const todayDate = body.date || now().slice(0, 10);
      const timeStr = body.time || new Date().toTimeString().slice(0, 5);

      if (!facultyId) throw new ApiError(400, "VALIDATION_FAILED", "Faculty ID is required.");

      const id = uuid();
      await run(
        `INSERT INTO faculty_attendance(id, institution_id, faculty_id, date, check_in, status, notes, created_at, updated_at, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, 'Present', ?, ?, ?, ?, ?)
         ON CONFLICT(institution_id, faculty_id, date)
         DO UPDATE SET check_in=COALESCE(faculty_attendance.check_in, excluded.check_in), status='Present', updated_at=excluded.updated_at`,
        [id, actor.institutionId, facultyId, todayDate, timeStr, body.notes || "", now(), now(), actor.userId, actor.userId],
      );
      return ok({ success: true, facultyId, date: todayDate, checkIn: timeStr }, requestId);
    }

    if (method === "POST" && path[2] === "check-out") {
      const facultyId = body.facultyId;
      const todayDate = body.date || now().slice(0, 10);
      const timeStr = body.time || new Date().toTimeString().slice(0, 5);

      if (!facultyId) throw new ApiError(400, "VALIDATION_FAILED", "Faculty ID is required.");

      await run(
        `UPDATE faculty_attendance SET check_out = ?, updated_at = ?
         WHERE institution_id = ? AND faculty_id = ? AND date = ?`,
        [timeStr, now(), actor.institutionId, facultyId, todayDate],
      );
      return ok({ success: true, facultyId, date: todayDate, checkOut: timeStr }, requestId);
    }

    if (method === "POST" && path[2] === "record") {
      permit(actor, "academics.manage");
      const records = Array.isArray(body.records) ? body.records : [];
      const date = body.date || now().slice(0, 10);

      const stmts: any[] = [];
      for (const rec of records) {
        const id = uuid();
        stmts.push(
          stmt(
            `INSERT INTO faculty_attendance(id, institution_id, faculty_id, date, check_in, check_out, status, notes, created_at, updated_at, created_by, updated_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(institution_id, faculty_id, date)
             DO UPDATE SET status=excluded.status, check_in=excluded.check_in, check_out=excluded.check_out, notes=excluded.notes, updated_at=excluded.updated_at`,
            [
              id,
              actor.institutionId,
              rec.facultyId,
              date,
              rec.checkIn || null,
              rec.checkOut || null,
              rec.status || "Present",
              rec.notes || "",
              now(),
              now(),
              actor.userId,
              actor.userId,
            ],
          ),
        );
      }
      await batch(stmts);
      return ok({ success: true, count: records.length, date }, requestId);
    }
  }

  // -------------------------------------------------------------
  // 9. LEAVE MANAGEMENT WORKFLOW
  // -------------------------------------------------------------
  if (k === "leaves") {
    if (method === "GET") {
      permit(actor, "academics.view");
      const facultyId = p.get("facultyId");
      const status = p.get("status");

      let query = `SELECT l.*, f.name as faculty_name, f.employee_id, f.designation, sub.name as substitute_faculty_name
                   FROM faculty_leaves l
                   JOIN faculty f ON f.id = l.faculty_id AND f.institution_id = l.institution_id
                   LEFT JOIN faculty sub ON sub.id = l.substitute_faculty_id AND sub.institution_id = l.institution_id
                   WHERE l.institution_id = ?`;
      const params: any[] = [actor.institutionId];

      if (facultyId) {
        query += " AND l.faculty_id = ?";
        params.push(facultyId);
      }
      if (status) {
        query += " AND l.status = ?";
        params.push(status);
      }

      query += " ORDER BY l.start_date DESC";
      const rows = await all(query, params);
      return ok({ rows, total: rows.length }, requestId);
    }

    // Apply for leave: POST /leaves
    if (method === "POST" && !path[1]) {
      const facultyId = body.facultyId;
      const leaveType = body.leaveType || "Casual";
      const startDate = body.startDate;
      const endDate = body.endDate;
      const reason = String(body.reason || "").trim();

      if (!facultyId || !startDate || !endDate || !reason) {
        throw new ApiError(400, "VALIDATION_FAILED", "Faculty ID, dates, and reason are required.");
      }

      const daysCount = Number(body.daysCount) || 1;
      const id = uuid();
      await run(
        `INSERT INTO faculty_leaves(id, institution_id, faculty_id, leave_type, start_date, end_date, days_count, reason, substitute_faculty_id, substitute_name, status, created_at, updated_at, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending', ?, ?, ?, ?)`,
        [
          id,
          actor.institutionId,
          facultyId,
          leaveType,
          startDate,
          endDate,
          daysCount,
          reason,
          body.substituteFacultyId || null,
          body.substituteName || "",
          now(),
          now(),
          actor.userId,
          actor.userId,
        ],
      );
      return ok(await one("SELECT * FROM faculty_leaves WHERE id = ?", [id]), requestId);
    }

    // Review / Approve / Reject leave: POST /leaves/:id/review
    if (method === "POST" && path[1] && path[2] === "review") {
      permit(actor, "academics.manage");
      const id = path[1];
      const newStatus = body.status; // Approved | Rejected
      const reviewComments = String(body.reviewComments || "").trim();

      if (!["Approved", "Rejected", "Cancelled"].includes(newStatus)) {
        throw new ApiError(400, "INVALID_STATUS", "Status must be Approved, Rejected, or Cancelled.");
      }

      const leave = await one("SELECT * FROM faculty_leaves WHERE id = ? AND institution_id = ?", [
        id,
        actor.institutionId,
      ]);
      if (!leave) throw new ApiError(404, "NOT_FOUND", "Leave application not found.");

      await run(
        `UPDATE faculty_leaves SET 
           status = ?, 
           reviewed_by = ?, 
           reviewed_at = ?, 
           review_comments = ?, 
           updated_at = ?, 
           updated_by = ?
         WHERE id = ? AND institution_id = ?`,
        [newStatus, actor.name, now(), reviewComments, now(), actor.userId, id, actor.institutionId],
      );

      // If approved, mark faculty_attendance as 'OnLeave' for those dates
      if (newStatus === "Approved") {
        const attId = uuid();
        await run(
          `INSERT INTO faculty_attendance(id, institution_id, faculty_id, date, status, notes, created_at, updated_at, created_by, updated_by)
           VALUES (?, ?, ?, ?, 'OnLeave', ?, ?, ?, ?, ?)
           ON CONFLICT(institution_id, faculty_id, date)
           DO UPDATE SET status='OnLeave', notes=excluded.notes, updated_at=excluded.updated_at`,
          [
            attId,
            actor.institutionId,
            leave.faculty_id,
            leave.start_date,
            `Leave Approved: ${leave.leave_type} - ${leave.reason}`,
            now(),
            now(),
            actor.userId,
            actor.userId,
          ],
        );
      }

      return ok(await one("SELECT * FROM faculty_leaves WHERE id = ?", [id]), requestId);
    }
  }

  return null;
}
