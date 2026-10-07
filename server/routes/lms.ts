import { all, batch, insert, now, one, Row, run, stamps, stmt, uuid } from "../db";
import { Actor, ApiError, hasPermission, permit } from "../security";
import { ok, RouteContext } from "./shared";

export async function lmsRoute(ctx: RouteContext): Promise<Response | null> {
  const { actor, path, method, body, p, requestId } = ctx;
  if (path[0] !== "lms") return null;

  const sub = path[1] || "";

  // -------------------------------------------------------------
  // 1. LMS COURSES
  // -------------------------------------------------------------
  if (sub === "courses") {
    if (method === "GET" && (!path[2] || path[2].length > 10)) {
      permit(actor, "academics.view");
      const id = path[2];
      if (id) {
        // Detailed course view with syllabus
        const course = await one(
          `SELECT c.*, d.name as department_name, s.name as subject_name
           FROM lms_courses c
           LEFT JOIN departments d ON d.id = c.department_id AND d.institution_id = c.institution_id
           LEFT JOIN subjects s ON s.id = c.subject_id AND s.institution_id = c.institution_id
           WHERE c.id = ? AND c.institution_id = ?`,
          [id, actor.institutionId],
        );
        if (!course) throw new ApiError(404, "NOT_FOUND", "Course not found.");

        const modulesList = await all(
          "SELECT * FROM lms_modules WHERE course_id = ? AND institution_id = ? ORDER BY sort_order ASC",
          [id, actor.institutionId],
        );
        const lessonsList = await all(
          "SELECT * FROM lms_lessons WHERE course_id = ? AND institution_id = ? ORDER BY sort_order ASC",
          [id, actor.institutionId],
        );
        const resourcesList = await all(
          "SELECT * FROM lms_resources WHERE course_id = ? AND institution_id = ? ORDER BY created_at DESC",
          [id, actor.institutionId],
        );
        const quizzesList = await all(
          "SELECT * FROM lms_quizzes WHERE course_id = ? AND institution_id = ? ORDER BY created_at DESC",
          [id, actor.institutionId],
        );

        // Map lessons into modules
        const structuredModules = modulesList.map((m: any) => ({
          ...m,
          lessons: lessonsList.filter((l: any) => l.module_id === m.id),
        }));

        return ok(
          {
            ...course,
            modules: structuredModules,
            resources: resourcesList,
            quizzes: quizzesList,
          },
          requestId,
        );
      }

      // Course listing
      const status = p.get("status");
      const departmentId = p.get("departmentId");
      const facultyId = p.get("facultyId");
      const classId = p.get("classId");

      let query = `SELECT c.*, 
                     d.name as department_name,
                     (SELECT COUNT(*) FROM lms_modules m WHERE m.course_id = c.id) as modules_count,
                     (SELECT COUNT(*) FROM lms_lessons l WHERE l.course_id = c.id) as lessons_count,
                     (SELECT COUNT(*) FROM lms_enrollments e WHERE e.course_id = c.id) as enrolled_count
                   FROM lms_courses c
                   LEFT JOIN departments d ON d.id = c.department_id AND d.institution_id = c.institution_id
                   WHERE c.institution_id = ?`;
      const params: any[] = [actor.institutionId];

      if (status) {
        query += " AND c.status = ?";
        params.push(status);
      }
      if (departmentId) {
        query += " AND c.department_id = ?";
        params.push(departmentId);
      }
      if (facultyId) {
        query += " AND c.faculty_id = ?";
        params.push(facultyId);
      }
      if (classId) {
        query += " AND c.class_id = ?";
        params.push(classId);
      }

      query += " ORDER BY c.created_at DESC";
      const rows = await all(query, params);
      return ok({ rows, total: rows.length }, requestId);
    }

    if (method === "POST" && !path[2]) {
      permit(actor, "academics.view");
      const code = String(body.code || "").trim().toUpperCase();
      const title = String(body.title || "").trim();
      if (!code || !title) throw new ApiError(400, "VALIDATION_FAILED", "Course code and title are required.");

      const existing = await one("SELECT id FROM lms_courses WHERE institution_id = ? AND code = ?", [
        actor.institutionId,
        code,
      ]);
      if (existing) throw new ApiError(409, "DUPLICATE_CODE", `Course code '${code}' already exists.`);

      const id = uuid();
      await run(
        `INSERT INTO lms_courses(id, institution_id, code, title, description, thumbnail_url, department_id, subject_id, faculty_id, faculty_name, class_id, section_id, level, status, created_at, updated_at, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          actor.institutionId,
          code,
          title,
          body.description || "",
          body.thumbnailUrl || "",
          body.departmentId || null,
          body.subjectId || null,
          body.facultyId || actor.userId,
          body.facultyName || actor.name,
          body.classId || null,
          body.sectionId || null,
          body.level || "Beginner",
          body.status || "Draft",
          now(),
          now(),
          actor.userId,
          actor.userId,
        ],
      );
      return ok(await one("SELECT * FROM lms_courses WHERE id = ?", [id]), requestId);
    }

    if (method === "PATCH" && path[2]) {
      permit(actor, "academics.view");
      const id = path[2];
      await run(
        `UPDATE lms_courses SET 
           title = COALESCE(?, title),
           description = COALESCE(?, description),
           thumbnail_url = COALESCE(?, thumbnail_url),
           department_id = COALESCE(?, department_id),
           subject_id = COALESCE(?, subject_id),
           faculty_id = COALESCE(?, faculty_id),
           faculty_name = COALESCE(?, faculty_name),
           class_id = COALESCE(?, class_id),
           section_id = COALESCE(?, section_id),
           level = COALESCE(?, level),
           status = COALESCE(?, status),
           updated_at = ?,
           updated_by = ?
         WHERE id = ? AND institution_id = ?`,
        [
          body.title !== undefined ? String(body.title).trim() : null,
          body.description !== undefined ? String(body.description) : null,
          body.thumbnailUrl !== undefined ? body.thumbnailUrl : null,
          body.departmentId !== undefined ? body.departmentId : null,
          body.subjectId !== undefined ? body.subjectId : null,
          body.facultyId !== undefined ? body.facultyId : null,
          body.facultyName !== undefined ? body.facultyName : null,
          body.classId !== undefined ? body.classId : null,
          body.sectionId !== undefined ? body.sectionId : null,
          body.level !== undefined ? body.level : null,
          body.status !== undefined ? body.status : null,
          now(),
          actor.userId,
          id,
          actor.institutionId,
        ],
      );
      return ok(await one("SELECT * FROM lms_courses WHERE id = ?", [id]), requestId);
    }

    if (method === "DELETE" && path[2]) {
      permit(actor, "academics.view");
      await run("DELETE FROM lms_courses WHERE id = ? AND institution_id = ?", [path[2], actor.institutionId]);
      return ok({ success: true, id: path[2] }, requestId);
    }
  }

  // -------------------------------------------------------------
  // 2. MODULES
  // -------------------------------------------------------------
  if (sub === "modules") {
    if (method === "POST" && !path[2]) {
      permit(actor, "academics.view");
      const courseId = body.courseId;
      const title = String(body.title || "").trim();
      if (!courseId || !title) throw new ApiError(400, "VALIDATION_FAILED", "Course ID and title are required.");

      const id = uuid();
      await run(
        `INSERT INTO lms_modules(id, institution_id, course_id, title, description, sort_order, status, created_at, updated_at, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          actor.institutionId,
          courseId,
          title,
          body.description || "",
          Number(body.sortOrder) || 1,
          body.status || "Published",
          now(),
          now(),
          actor.userId,
          actor.userId,
        ],
      );
      return ok(await one("SELECT * FROM lms_modules WHERE id = ?", [id]), requestId);
    }

    if (method === "PATCH" && path[2]) {
      permit(actor, "academics.view");
      const id = path[2];
      await run(
        `UPDATE lms_modules SET 
           title = COALESCE(?, title),
           description = COALESCE(?, description),
           sort_order = COALESCE(?, sort_order),
           status = COALESCE(?, status),
           updated_at = ?,
           updated_by = ?
         WHERE id = ? AND institution_id = ?`,
        [
          body.title !== undefined ? String(body.title).trim() : null,
          body.description !== undefined ? body.description : null,
          body.sortOrder !== undefined ? Number(body.sortOrder) : null,
          body.status !== undefined ? body.status : null,
          now(),
          actor.userId,
          id,
          actor.institutionId,
        ],
      );
      return ok(await one("SELECT * FROM lms_modules WHERE id = ?", [id]), requestId);
    }

    if (method === "DELETE" && path[2]) {
      permit(actor, "academics.view");
      await run("DELETE FROM lms_modules WHERE id = ? AND institution_id = ?", [path[2], actor.institutionId]);
      return ok({ success: true, id: path[2] }, requestId);
    }
  }

  // -------------------------------------------------------------
  // 3. LESSONS
  // -------------------------------------------------------------
  if (sub === "lessons") {
    if (method === "GET" && path[2]) {
      permit(actor, "academics.view");
      const lesson = await one("SELECT * FROM lms_lessons WHERE id = ? AND institution_id = ?", [
        path[2],
        actor.institutionId,
      ]);
      if (!lesson) throw new ApiError(404, "NOT_FOUND", "Lesson not found.");
      return ok(lesson, requestId);
    }

    if (method === "POST" && !path[2]) {
      permit(actor, "academics.view");
      const { courseId, moduleId, title } = body;
      if (!courseId || !moduleId || !title) {
        throw new ApiError(400, "VALIDATION_FAILED", "Course ID, module ID, and title are required.");
      }

      const id = uuid();
      await run(
        `INSERT INTO lms_lessons(id, institution_id, course_id, module_id, title, content, duration_minutes, video_url, sort_order, status, created_at, updated_at, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          actor.institutionId,
          courseId,
          moduleId,
          String(title).trim(),
          body.content || "",
          Number(body.durationMinutes) || 15,
          body.videoUrl || "",
          Number(body.sortOrder) || 1,
          body.status || "Published",
          now(),
          now(),
          actor.userId,
          actor.userId,
        ],
      );
      return ok(await one("SELECT * FROM lms_lessons WHERE id = ?", [id]), requestId);
    }

    if (method === "PATCH" && path[2]) {
      permit(actor, "academics.view");
      const id = path[2];
      await run(
        `UPDATE lms_lessons SET 
           title = COALESCE(?, title),
           content = COALESCE(?, content),
           duration_minutes = COALESCE(?, duration_minutes),
           video_url = COALESCE(?, video_url),
           sort_order = COALESCE(?, sort_order),
           status = COALESCE(?, status),
           updated_at = ?,
           updated_by = ?
         WHERE id = ? AND institution_id = ?`,
        [
          body.title !== undefined ? String(body.title).trim() : null,
          body.content !== undefined ? body.content : null,
          body.durationMinutes !== undefined ? Number(body.durationMinutes) : null,
          body.videoUrl !== undefined ? body.videoUrl : null,
          body.sortOrder !== undefined ? Number(body.sortOrder) : null,
          body.status !== undefined ? body.status : null,
          now(),
          actor.userId,
          id,
          actor.institutionId,
        ],
      );
      return ok(await one("SELECT * FROM lms_lessons WHERE id = ?", [id]), requestId);
    }

    if (method === "DELETE" && path[2]) {
      permit(actor, "academics.view");
      await run("DELETE FROM lms_lessons WHERE id = ? AND institution_id = ?", [path[2], actor.institutionId]);
      return ok({ success: true, id: path[2] }, requestId);
    }
  }

  // -------------------------------------------------------------
  // 4. RESOURCES (SECURE DOWNLOAD/UPLOAD)
  // -------------------------------------------------------------
  if (sub === "resources") {
    if (method === "GET") {
      permit(actor, "academics.view");
      const courseId = p.get("courseId");
      const rows = await all(
        "SELECT * FROM lms_resources WHERE institution_id = ? AND (course_id = ? OR ? IS NULL) ORDER BY created_at DESC",
        [actor.institutionId, courseId, courseId],
      );
      return ok({ rows, total: rows.length }, requestId);
    }

    if (method === "POST" && !path[2]) {
      permit(actor, "academics.view");
      const { courseId, title, fileUrl } = body;
      if (!courseId || !title || !fileUrl) {
        throw new ApiError(400, "VALIDATION_FAILED", "Course ID, title, and file URL are required.");
      }

      const id = uuid();
      await run(
        `INSERT INTO lms_resources(id, institution_id, course_id, lesson_id, title, type, file_url, file_size_bytes, is_downloadable, created_at, updated_at, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          actor.institutionId,
          courseId,
          body.lessonId || null,
          String(title).trim(),
          body.type || "PDF",
          fileUrl,
          Number(body.fileSizeBytes) || 0,
          body.isDownloadable !== undefined ? (body.isDownloadable ? 1 : 0) : 1,
          now(),
          now(),
          actor.userId,
          actor.userId,
        ],
      );
      return ok(await one("SELECT * FROM lms_resources WHERE id = ?", [id]), requestId);
    }

    if (method === "DELETE" && path[2]) {
      permit(actor, "academics.view");
      await run("DELETE FROM lms_resources WHERE id = ? AND institution_id = ?", [path[2], actor.institutionId]);
      return ok({ success: true, id: path[2] }, requestId);
    }
  }

  // -------------------------------------------------------------
  // 5. STUDENT COURSE PLAYER, ENROLLMENTS & PROGRESS TRACKER
  // -------------------------------------------------------------
  if (sub === "enrollments") {
    if (method === "GET") {
      permit(actor, "academics.view");
      const studentId = p.get("studentId");
      const courseId = p.get("courseId");
      let query = `SELECT e.*, c.title as course_title, c.code as course_code, c.thumbnail_url, c.faculty_name, s.name as student_name
                   FROM lms_enrollments e
                   JOIN lms_courses c ON c.id = e.course_id AND c.institution_id = e.institution_id
                   JOIN students s ON s.id = e.student_id AND s.institution_id = e.institution_id
                   WHERE e.institution_id = ?`;
      const params: any[] = [actor.institutionId];
      if (studentId) {
        query += " AND e.student_id = ?";
        params.push(studentId);
      }
      if (courseId) {
        query += " AND e.course_id = ?";
        params.push(courseId);
      }
      const rows = await all(query, params);
      return ok({ rows, total: rows.length }, requestId);
    }

    // Enroll student: POST /lms/enrollments/enroll
    if (method === "POST" && path[2] === "enroll") {
      permit(actor, "academics.view");
      const courseId = body.courseId;
      const studentId = body.studentId || (actor.role === "STUDENT" ? (await one("SELECT id FROM students WHERE institution_id=? ORDER BY created_at LIMIT 1", [actor.institutionId]))?.id : null);
      if (!courseId || !studentId) throw new ApiError(400, "VALIDATION_FAILED", "Course ID and Student ID are required.");

      const existing = await one(
        "SELECT * FROM lms_enrollments WHERE institution_id = ? AND course_id = ? AND student_id = ?",
        [actor.institutionId, courseId, studentId],
      );
      if (existing) return ok(existing, requestId);

      const id = uuid();
      await run(
        `INSERT INTO lms_enrollments(id, institution_id, course_id, student_id, enrolled_date, progress_percent, completed_lessons, status, created_at, updated_at, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, 0, '[]', 'Active', ?, ?, ?, ?)`,
        [id, actor.institutionId, courseId, studentId, now().slice(0, 10), now(), now(), actor.userId, actor.userId],
      );
      return ok(await one("SELECT * FROM lms_enrollments WHERE id = ?", [id]), requestId);
    }

    // Progress update: POST /lms/enrollments/progress
    if (method === "POST" && path[2] === "progress") {
      permit(actor, "academics.view");
      const { courseId, studentId, completedLessonId } = body;
      if (!courseId || !studentId || !completedLessonId) {
        throw new ApiError(400, "VALIDATION_FAILED", "courseId, studentId, and completedLessonId are required.");
      }

      const enrollment = await one(
        "SELECT * FROM lms_enrollments WHERE institution_id = ? AND course_id = ? AND student_id = ?",
        [actor.institutionId, courseId, studentId],
      );
      if (!enrollment) throw new ApiError(404, "NOT_FOUND", "Student is not enrolled in this course.");

      let completedArr: string[] = [];
      try {
        completedArr = JSON.parse(enrollment.completed_lessons || "[]");
      } catch {
        completedArr = [];
      }

      if (!completedArr.includes(completedLessonId)) {
        completedArr.push(completedLessonId);
      }

      // Calculate new progress percentage
      const totalLessonsRow = await one(
        "SELECT COUNT(*) as count FROM lms_lessons WHERE course_id = ? AND institution_id = ?",
        [courseId, actor.institutionId],
      );
      const totalLessons = Math.max(1, totalLessonsRow?.count || 1);
      const progressPercent = Math.min(100, Math.round((completedArr.length / totalLessons) * 100));
      const status = progressPercent >= 100 ? "Completed" : "Active";

      await run(
        `UPDATE lms_enrollments SET 
           progress_percent = ?,
           completed_lessons = ?,
           last_accessed_lesson_id = ?,
           last_accessed_at = ?,
           status = ?,
           updated_at = ?,
           updated_by = ?
         WHERE id = ? AND institution_id = ?`,
        [
          progressPercent,
          JSON.stringify(completedArr),
          completedLessonId,
          now(),
          status,
          now(),
          actor.userId,
          enrollment.id,
          actor.institutionId,
        ],
      );

      return ok(
        {
          success: true,
          enrollmentId: enrollment.id,
          progressPercent,
          completedCount: completedArr.length,
          totalLessons,
          status,
        },
        requestId,
      );
    }
  }

  // -------------------------------------------------------------
  // 6. TEACHER ASSIGNMENTS & STUDENT SUBMISSIONS
  // -------------------------------------------------------------
  if (sub === "assignments") {
    if (method === "GET") {
      permit(actor, "academics.view");
      const id = path[2];
      if (id) {
        const assignment = await one(
          `SELECT a.*, c.title as course_title, sub.name as subject_name, cl.name as class_name, sec.name as section_name
           FROM lms_assignments a
           LEFT JOIN lms_courses c ON c.id = a.course_id AND c.institution_id = a.institution_id
           LEFT JOIN subjects sub ON sub.id = a.subject_id AND sub.institution_id = a.institution_id
           LEFT JOIN classes cl ON cl.id = a.class_id AND cl.institution_id = a.institution_id
           LEFT JOIN sections sec ON sec.id = a.section_id AND sec.institution_id = a.institution_id
           WHERE a.id = ? AND a.institution_id = ?`,
          [id, actor.institutionId],
        );
        if (!assignment) throw new ApiError(404, "NOT_FOUND", "Assignment not found.");

        const submissions = await all(
          "SELECT * FROM lms_submissions WHERE assignment_id = ? AND institution_id = ? ORDER BY submitted_at DESC",
          [id, actor.institutionId],
        );

        return ok({ ...assignment, submissions }, requestId);
      }

      const courseId = p.get("courseId");
      const classId = p.get("classId");
      const facultyId = p.get("facultyId");

      let query = `SELECT a.*, 
                     c.title as course_title,
                     (SELECT COUNT(*) FROM lms_submissions sub WHERE sub.assignment_id = a.id) as submissions_count
                   FROM lms_assignments a
                   LEFT JOIN lms_courses c ON c.id = a.course_id AND c.institution_id = a.institution_id
                   WHERE a.institution_id = ?`;
      const params: any[] = [actor.institutionId];
      if (courseId) {
        query += " AND a.course_id = ?";
        params.push(courseId);
      }
      if (classId) {
        query += " AND a.class_id = ?";
        params.push(classId);
      }
      if (facultyId) {
        query += " AND a.faculty_id = ?";
        params.push(facultyId);
      }
      query += " ORDER BY a.due_date ASC";
      const rows = await all(query, params);
      return ok({ rows, total: rows.length }, requestId);
    }

    if (method === "POST" && !path[2]) {
      permit(actor, "academics.view");
      const title = String(body.title || "").trim();
      const dueDate = body.dueDate;
      if (!title || !dueDate) throw new ApiError(400, "VALIDATION_FAILED", "Title and due date are required.");

      const id = uuid();
      await run(
        `INSERT INTO lms_assignments(id, institution_id, course_id, subject_id, class_id, section_id, faculty_id, title, instructions, attachment_url, max_marks, due_date, allow_late, status, created_at, updated_at, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          actor.institutionId,
          body.courseId || null,
          body.subjectId || null,
          body.classId || null,
          body.sectionId || null,
          body.facultyId || actor.userId,
          title,
          body.instructions || "",
          body.attachmentUrl || "",
          Number(body.maxMarks) || 100,
          dueDate,
          body.allowLate ? 1 : 0,
          body.status || "Published",
          now(),
          now(),
          actor.userId,
          actor.userId,
        ],
      );
      return ok(await one("SELECT * FROM lms_assignments WHERE id = ?", [id]), requestId);
    }

    // Student Submit Assignment: POST /lms/assignments/:id/submit
    if (method === "POST" && path[2] && path[3] === "submit") {
      permit(actor, "academics.view");
      const assignmentId = path[2];
      const studentId = body.studentId || (actor.role === "STUDENT" ? (await one("SELECT id, name FROM students WHERE institution_id=? ORDER BY created_at LIMIT 1", [actor.institutionId]))?.id : null);
      const studentName = body.studentName || actor.name;
      const content = String(body.content || "").trim();
      const attachmentUrl = body.attachmentUrl || "";

      if (!studentId) throw new ApiError(400, "VALIDATION_FAILED", "Student ID is required.");

      const subId = uuid();
      await run(
        `INSERT INTO lms_submissions(id, institution_id, assignment_id, student_id, student_name, content, attachment_url, submitted_at, status, created_at, updated_at, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Submitted', ?, ?, ?, ?)
         ON CONFLICT(institution_id, assignment_id, student_id)
         DO UPDATE SET content=excluded.content, attachment_url=excluded.attachment_url, submitted_at=excluded.submitted_at, status='Resubmitted', updated_at=excluded.updated_at`,
        [subId, actor.institutionId, assignmentId, studentId, studentName, content, attachmentUrl, now(), now(), now(), actor.userId, actor.userId],
      );
      return ok(await one("SELECT * FROM lms_submissions WHERE assignment_id = ? AND student_id = ?", [assignmentId, studentId]), requestId);
    }

    if (method === "PATCH" && path[2]) {
      permit(actor, "academics.view");
      const id = path[2];
      await run(
        `UPDATE lms_assignments SET 
           title = COALESCE(?, title),
           instructions = COALESCE(?, instructions),
           attachment_url = COALESCE(?, attachment_url),
           max_marks = COALESCE(?, max_marks),
           due_date = COALESCE(?, due_date),
           allow_late = COALESCE(?, allow_late),
           status = COALESCE(?, status),
           updated_at = ?,
           updated_by = ?
         WHERE id = ? AND institution_id = ?`,
        [
          body.title !== undefined ? String(body.title).trim() : null,
          body.instructions !== undefined ? body.instructions : null,
          body.attachmentUrl !== undefined ? body.attachmentUrl : null,
          body.maxMarks !== undefined ? Number(body.maxMarks) : null,
          body.dueDate !== undefined ? body.dueDate : null,
          body.allowLate !== undefined ? (body.allowLate ? 1 : 0) : null,
          body.status !== undefined ? body.status : null,
          now(),
          actor.userId,
          id,
          actor.institutionId,
        ],
      );
      return ok(await one("SELECT * FROM lms_assignments WHERE id = ?", [id]), requestId);
    }

    if (method === "DELETE" && path[2]) {
      permit(actor, "academics.view");
      await run("DELETE FROM lms_assignments WHERE id = ? AND institution_id = ?", [path[2], actor.institutionId]);
      return ok({ success: true, id: path[2] }, requestId);
    }
  }

  // Grade Submissions: POST /lms/submissions/:id/grade
  if (sub === "submissions" && path[2] && path[3] === "grade") {
    permit(actor, "academics.view");
    const subId = path[2];
    const marksObtained = Number(body.marksObtained);
    const feedback = String(body.feedback || "").trim();

    if (isNaN(marksObtained)) throw new ApiError(400, "VALIDATION_FAILED", "Valid marks are required.");

    await run(
      `UPDATE lms_submissions SET 
         marks_obtained = ?,
         feedback = ?,
         graded_by = ?,
         graded_at = ?,
         status = 'Graded',
         updated_at = ?,
         updated_by = ?
       WHERE id = ? AND institution_id = ?`,
      [marksObtained, feedback, actor.name, now(), now(), actor.userId, subId, actor.institutionId],
    );
    return ok(await one("SELECT * FROM lms_submissions WHERE id = ?", [subId]), requestId);
  }

  // -------------------------------------------------------------
  // 7. QUIZZES & AUTO-EVALUATION
  // -------------------------------------------------------------
  if (sub === "quizzes") {
    if (method === "GET") {
      permit(actor, "academics.view");
      const id = path[2];
      if (id) {
        const quiz = await one("SELECT * FROM lms_quizzes WHERE id = ? AND institution_id = ?", [
          id,
          actor.institutionId,
        ]);
        if (!quiz) throw new ApiError(404, "NOT_FOUND", "Quiz not found.");

        const isStudent = actor.role === "STUDENT";
        let questions = await all(
          "SELECT * FROM lms_quiz_questions WHERE quiz_id = ? AND institution_id = ? ORDER BY sort_order ASC",
          [id, actor.institutionId],
        );

        // Sanitize correct answers if student is taking the quiz
        if (isStudent) {
          questions = questions.map((q: any) => ({
            ...q,
            correct_answer: undefined,
            explanation: undefined,
            options: JSON.parse(q.options || "[]"),
          }));
        } else {
          questions = questions.map((q: any) => ({
            ...q,
            options: JSON.parse(q.options || "[]"),
          }));
        }

        const attempts = await all(
          "SELECT * FROM lms_quiz_attempts WHERE quiz_id = ? AND institution_id = ? ORDER BY completed_at DESC",
          [id, actor.institutionId],
        );

        return ok({ ...quiz, questions, attempts }, requestId);
      }

      const courseId = p.get("courseId");
      const rows = await all(
        `SELECT q.*, 
           (SELECT COUNT(*) FROM lms_quiz_questions qq WHERE qq.quiz_id = q.id) as question_count,
           (SELECT COUNT(*) FROM lms_quiz_attempts qa WHERE qa.quiz_id = q.id) as attempts_count
         FROM lms_quizzes q
         WHERE q.institution_id = ? AND (q.course_id = ? OR ? IS NULL)
         ORDER BY q.created_at DESC`,
        [actor.institutionId, courseId, courseId],
      );
      return ok({ rows, total: rows.length }, requestId);
    }

    if (method === "POST" && !path[2]) {
      permit(actor, "academics.view");
      const title = String(body.title || "").trim();
      if (!title) throw new ApiError(400, "VALIDATION_FAILED", "Quiz title is required.");

      const id = uuid();
      await run(
        `INSERT INTO lms_quizzes(id, institution_id, course_id, faculty_id, title, description, time_limit_minutes, total_marks, passing_marks, due_date, status, created_at, updated_at, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          actor.institutionId,
          body.courseId || null,
          body.facultyId || actor.userId,
          title,
          body.description || "",
          Number(body.timeLimitMinutes) || 30,
          Number(body.totalMarks) || 100,
          Number(body.passingMarks) || 40,
          body.dueDate || null,
          body.status || "Published",
          now(),
          now(),
          actor.userId,
          actor.userId,
        ],
      );
      return ok(await one("SELECT * FROM lms_quizzes WHERE id = ?", [id]), requestId);
    }

    // Add Question to Quiz: POST /lms/quizzes/:id/questions
    if (method === "POST" && path[2] && path[3] === "questions") {
      permit(actor, "academics.view");
      const quizId = path[2];
      const question = String(body.question || "").trim();
      const correctAnswer = String(body.correctAnswer || "").trim();
      if (!question || !correctAnswer) {
        throw new ApiError(400, "VALIDATION_FAILED", "Question text and correct answer are required.");
      }

      const qId = uuid();
      const optionsJson = JSON.stringify(body.options || []);
      await run(
        `INSERT INTO lms_quiz_questions(id, institution_id, quiz_id, question, type, options, correct_answer, explanation, marks, sort_order, created_at, updated_at, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          qId,
          actor.institutionId,
          quizId,
          question,
          body.type || "MCQ",
          optionsJson,
          correctAnswer,
          body.explanation || "",
          Number(body.marks) || 10,
          Number(body.sortOrder) || 1,
          now(),
          now(),
          actor.userId,
          actor.userId,
        ],
      );
      return ok(await one("SELECT * FROM lms_quiz_questions WHERE id = ?", [qId]), requestId);
    }

    // Submit Quiz & AUTO-EVALUATE: POST /lms/quizzes/:id/submit
    if (method === "POST" && path[2] && path[3] === "submit") {
      permit(actor, "academics.view");
      const quizId = path[2];
      const quiz = await one("SELECT * FROM lms_quizzes WHERE id = ? AND institution_id = ?", [
        quizId,
        actor.institutionId,
      ]);
      if (!quiz) throw new ApiError(404, "NOT_FOUND", "Quiz not found.");

      const questions = await all(
        "SELECT * FROM lms_quiz_questions WHERE quiz_id = ? AND institution_id = ?",
        [quizId, actor.institutionId],
      );

      const studentAnswers = body.answers || {}; // { [qId]: "Answer" }
      const studentId = body.studentId || (actor.role === "STUDENT" ? (await one("SELECT id, name FROM students WHERE institution_id=? ORDER BY created_at LIMIT 1", [actor.institutionId]))?.id : null);
      const studentName = body.studentName || actor.name;

      let score = 0;
      let maxScore = 0;
      const evaluationDetails: any[] = [];

      for (const q of questions) {
        const qMarks = Number(q.marks) || 10;
        maxScore += qMarks;

        const givenAnswer = String(studentAnswers[q.id] || "").trim().toLowerCase();
        const correctAnswer = String(q.correct_answer || "").trim().toLowerCase();
        const isCorrect = givenAnswer === correctAnswer;

        if (isCorrect) score += qMarks;

        evaluationDetails.push({
          questionId: q.id,
          question: q.question,
          givenAnswer: studentAnswers[q.id] || null,
          correctAnswer: q.correct_answer,
          explanation: q.explanation,
          isCorrect,
          marksEarned: isCorrect ? qMarks : 0,
        });
      }

      if (maxScore === 0) maxScore = Number(quiz.total_marks) || 100;
      const percentage = Math.round((score / maxScore) * 100);
      const passed = score >= Number(quiz.passing_marks || 40) ? 1 : 0;
      const timeSpent = Number(body.timeSpentSeconds) || 60;

      const attemptId = uuid();
      await run(
        `INSERT INTO lms_quiz_attempts(id, institution_id, quiz_id, student_id, student_name, answers, score, max_score, percentage, passed, time_spent_seconds, completed_at, created_at, updated_at, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          attemptId,
          actor.institutionId,
          quizId,
          studentId,
          studentName,
          JSON.stringify(studentAnswers),
          score,
          maxScore,
          percentage,
          passed,
          timeSpent,
          now(),
          now(),
          now(),
          actor.userId,
          actor.userId,
        ],
      );

      return ok(
        {
          attemptId,
          quizTitle: quiz.title,
          studentName,
          score,
          maxScore,
          percentage,
          passed: Boolean(passed),
          timeSpentSeconds: timeSpent,
          evaluation: evaluationDetails,
        },
        requestId,
      );
    }
  }

  // -------------------------------------------------------------
  // 8. LMS ANALYTICS
  // -------------------------------------------------------------
  if (sub === "analytics") {
    permit(actor, "academics.view");
    const instId = actor.institutionId;

    const [coursesCount, enrollmentsCount, assignmentsCount, submissionsCount, quizzesCount, attemptsCount] =
      await Promise.all([
        one("SELECT COUNT(*) as c FROM lms_courses WHERE institution_id = ?", [instId]),
        one("SELECT COUNT(*) as c, AVG(progress_percent) as avg_prog FROM lms_enrollments WHERE institution_id = ?", [instId]),
        one("SELECT COUNT(*) as c FROM lms_assignments WHERE institution_id = ?", [instId]),
        one("SELECT COUNT(*) as c, SUM(CASE WHEN status='Graded' THEN 1 ELSE 0 END) as graded FROM lms_submissions WHERE institution_id = ?", [instId]),
        one("SELECT COUNT(*) as c FROM lms_quizzes WHERE institution_id = ?", [instId]),
        one("SELECT COUNT(*) as c, AVG(score) as avg_score, AVG(percentage) as avg_pct, SUM(passed) as total_passed FROM lms_quiz_attempts WHERE institution_id = ?", [instId]),
      ]);

    const topCourses = await all(
      `SELECT c.id, c.title, c.code, COUNT(e.id) as enrolled_students, AVG(e.progress_percent) as avg_progress
       FROM lms_courses c
       LEFT JOIN lms_enrollments e ON e.course_id = c.id
       WHERE c.institution_id = ?
       GROUP BY c.id
       ORDER BY enrolled_students DESC LIMIT 5`,
      [instId],
    );

    return ok(
      {
        totalCourses: coursesCount?.c || 0,
        totalEnrollments: enrollmentsCount?.c || 0,
        averageCourseProgress: Math.round(Number(enrollmentsCount?.avg_prog) || 0),
        totalAssignments: assignmentsCount?.c || 0,
        totalSubmissions: submissionsCount?.c || 0,
        gradedSubmissions: submissionsCount?.graded || 0,
        totalQuizzes: quizzesCount?.c || 0,
        totalQuizAttempts: attemptsCount?.c || 0,
        averageQuizPercentage: Math.round(Number(attemptsCount?.avg_pct) || 0),
        totalQuizzesPassed: attemptsCount?.total_passed || 0,
        topCourses,
      },
      requestId,
    );
  }

  return null;
}
