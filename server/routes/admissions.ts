import { z } from "zod";
import { all, batch, insert, now, one, Row, stamps, stmt, uuid, today } from "../db";
import { ApiError, audit, own, permit } from "../security";
import { ok, RouteContext } from "./shared";

export async function admissionsRoute(
  ctx: RouteContext,
): Promise<Response | null> {
  const { actor, path, p, method, body, requestId } = ctx;

  if (path[0] !== "admissions") return null;

  // 1. Enquiries
  if (path[1] === "enquiries") {
    permit(actor, "admissions.view");

    if (method === "GET") {
      const status = p.get("status");
      const q = (p.get("q") || "").trim();
      let sql = "SELECT * FROM admissions_enquiries WHERE institution_id=?";
      const params: any[] = [actor.institutionId];

      if (status && status !== "All") {
        sql += " AND status=?";
        params.push(status);
      }
      if (q) {
        sql += " AND (student_name LIKE ? OR parent_name LIKE ? OR phone LIKE ?)";
        params.push(`%${q}%`, `%${q}%`, `%${q}%`);
      }
      sql += " ORDER BY created_at DESC LIMIT 100";
      const rows = await all(sql, params);
      return ok({ rows, total: rows.length }, requestId);
    }

    if (method === "POST" && !path[2]) {
      permit(actor, "admissions.manage");
      const schema = z.object({
        studentName: z.string().trim().min(1),
        parentName: z.string().trim().min(1),
        email: z.string().optional().or(z.literal("")),
        phone: z.string().optional(),
        mobile: z.string().optional(),
        classApplied: z.string().optional(),
        applyingForGrade: z.string().optional(),
        source: z.string().default("Walk-in"),
        notes: z.string().optional().default(""),
        academicYearId: z.string().optional(),
        campusId: z.string().optional(),
      });
      const d = schema.parse(body);
      const phone = (d.phone || d.mobile || "").trim();
      const classApplied = (d.classApplied || d.applyingForGrade || "Grade 1").trim();
      if (!phone) {
        throw new ApiError(422, "VALIDATION_ERROR", "Phone number is required", { phone: ["Required"] });
      }

      const id = uuid();
      await stmt(
        `INSERT INTO admissions_enquiries(id, institution_id, academic_year_id, campus_id, student_name, parent_name, email, phone, class_applied, source, notes, status, created_at, updated_at, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'New', ?, ?, ?, ?)`,
        [
          id,
          actor.institutionId,
          d.academicYearId || null,
          d.campusId || null,
          d.studentName,
          d.parentName,
          d.email || "",
          phone,
          classApplied,
          d.source,
          d.notes,
          now(),
          now(),
          actor.userId,
          actor.userId,
        ],
      ).run();

      await audit(actor, "Created admission enquiry", "admissions_enquiries", id, null, d);
      return ok({ id, created: true }, requestId);
    }

    if (method === "PATCH" && path[2]) {
      permit(actor, "admissions.manage");
      const enquiry = await own(actor, "admissions_enquiries", path[2]);
      const schema = z.object({
        status: z.string().optional(),
        notes: z.string().optional(),
        studentName: z.string().optional(),
        parentName: z.string().optional(),
        phone: z.string().optional(),
        mobile: z.string().optional(),
      });
      const d = schema.parse(body);
      const updates: string[] = [];
      const values: any[] = [];

      const phone = d.phone || d.mobile;
      if (d.status) { updates.push("status=?"); values.push(d.status); }
      if (d.notes !== undefined) { updates.push("notes=?"); values.push(d.notes); }
      if (d.studentName) { updates.push("student_name=?"); values.push(d.studentName); }
      if (d.parentName) { updates.push("parent_name=?"); values.push(d.parentName); }
      if (phone) { updates.push("phone=?"); values.push(phone); }

      if (updates.length > 0) {
        updates.push("updated_at=?", "updated_by=?");
        values.push(now(), actor.userId, actor.institutionId, enquiry.id);
        await stmt(
          `UPDATE admissions_enquiries SET ${updates.join(", ")} WHERE institution_id=? AND id=?`,
          values,
        ).run();
      }

      await audit(actor, "Updated admission enquiry", "admissions_enquiries", enquiry.id, enquiry, d);
      return ok({ updated: true }, requestId);
    }

    if (method === "DELETE" && path[2]) {
      permit(actor, "admissions.manage");
      await own(actor, "admissions_enquiries", path[2]);
      await stmt("DELETE FROM admissions_enquiries WHERE institution_id=? AND id=?", [actor.institutionId, path[2]]).run();
      await audit(actor, "Deleted admission enquiry", "admissions_enquiries", path[2], null, null);
      return ok({ deleted: true }, requestId);
    }
  }

  // 2. Applications
  if (path[1] === "applications") {
    permit(actor, "admissions.view");

    // GET list or single
    if (method === "GET") {
      if (path[2]) {
        // Single application with documents
        const app = await own(actor, "admissions_applications", path[2]);
        const documents = await all(
          "SELECT * FROM admissions_documents WHERE institution_id=? AND application_id=? ORDER BY created_at ASC",
          [actor.institutionId, app.id],
        );
        return ok({ ...app, documents }, requestId);
      }

      const status = p.get("status");
      const yearId = p.get("year");
      const q = (p.get("q") || "").trim();
      let sql = "SELECT * FROM admissions_applications WHERE institution_id=?";
      const params: any[] = [actor.institutionId];

      if (status && status !== "All") {
        sql += " AND status=?";
        params.push(status);
      }
      if (yearId) {
        sql += " AND academic_year_id=?";
        params.push(yearId);
      }
      if (q) {
        sql += " AND (student_name LIKE ? OR application_number LIKE ? OR parent_name LIKE ? OR parent_phone LIKE ?)";
        params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
      }
      sql += " ORDER BY created_at DESC LIMIT 100";
      const rows = await all(sql, params);
      return ok({ rows, total: rows.length }, requestId);
    }

    // POST create application
    if (method === "POST" && !path[2]) {
      permit(actor, "admissions.manage");
      const schema = z.object({
        academicYearId: z.string().min(1),
        campusId: z.string().optional(),
        studentName: z.string().trim().optional(),
        firstName: z.string().trim().optional(),
        lastName: z.string().trim().optional(),
        dob: z.string().optional(),
        gender: z.string().default("Not specified"),
        bloodGroup: z.string().optional(),
        aadhaarLast4: z.string().optional(),
        studentEmail: z.string().optional(),
        studentPhone: z.string().optional(),
        address: z.string().optional().default(""),
        city: z.string().optional().default(""),
        state: z.string().optional().default(""),
        pincode: z.string().optional().default(""),
        parentName: z.string().trim().min(1),
        parentPhone: z.string().optional(),
        parentMobile: z.string().optional(),
        parentEmail: z.string().optional(),
        parentRelation: z.string().default("Father"),
        parentOccupation: z.string().optional().default(""),
        previousSchool: z.string().optional().default(""),
        previousGrade: z.string().optional().default(""),
        gradeApplying: z.string().optional().default(""),
        previousPercentage: z.string().optional().default(""),
      });

      const d = schema.parse(body);
      const studentName = (d.studentName || `${d.firstName || ""} ${d.lastName || ""}`.trim()) || "Applicant";
      const parentPhone = (d.parentPhone || d.parentMobile || "").trim();
      if (!parentPhone) {
        throw new ApiError(422, "VALIDATION_ERROR", "Parent phone is required", { parentPhone: ["Required"] });
      }

      const id = uuid();
      const countRow = await one<{ count: number }>(
        "SELECT COUNT(*) as count FROM admissions_applications WHERE institution_id=?",
        [actor.institutionId],
      );
      const appNum = `APP-${new Date().getFullYear()}-${String((countRow?.count || 0) + 1).padStart(4, "0")}`;

      await stmt(
        `INSERT INTO admissions_applications(
          id, institution_id, academic_year_id, campus_id, application_number,
          student_name, dob, gender, blood_group, aadhaar_last4,
          student_email, student_phone, address, city, state, pincode,
          parent_name, parent_phone, parent_email, parent_relation, parent_occupation,
          previous_school, previous_grade, previous_percentage,
          status, interview_result, created_at, updated_at, created_by, updated_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Applied', 'Pending', ?, ?, ?, ?)`,
        [
          id,
          actor.institutionId,
          d.academicYearId,
          d.campusId || null,
          appNum,
          studentName,
          d.dob || null,
          d.gender,
          d.bloodGroup || null,
          d.aadhaarLast4 || null,
          d.studentEmail || null,
          d.studentPhone || null,
          d.address,
          d.city,
          d.state,
          d.pincode,
          d.parentName,
          parentPhone,
          d.parentEmail || null,
          d.parentRelation,
          d.parentOccupation,
          d.previousSchool,
          d.previousGrade || d.gradeApplying,
          d.previousPercentage,
          now(),
          now(),
          actor.userId,
          actor.userId,
        ],
      ).run();

      await audit(actor, "Created admission application", "admissions_applications", id, null, { appNum, ...d });
      return ok({ id, applicationNumber: appNum, application_number: appNum }, requestId);
    }

    // Schedule / Score interview
    if (method === "POST" && path[2] && path[3] === "interview") {
      permit(actor, "admissions.manage");
      const app = await own(actor, "admissions_applications", path[2]);
      const schema = z.object({
        interviewDate: z.string().optional(),
        interviewTime: z.string().optional(),
        scheduledDate: z.string().optional(),
        interviewMode: z.string().optional(),
        interviewerName: z.string().optional(),
        score: z.number().optional(),
        notes: z.string().optional(),
        interviewNotes: z.string().optional(),
        status: z.string().optional(),
      });
      const d = schema.parse(body);

      const interviewDate = d.interviewDate || (d.scheduledDate ? d.scheduledDate.slice(0, 10) : today());
      const interviewTime = d.interviewTime || (d.scheduledDate ? d.scheduledDate.slice(11, 16) : "10:00");
      const notes = d.interviewNotes || d.notes || "";
      const result = d.score !== undefined && d.score >= 50 ? "Cleared" : "Pending";

      await stmt(
        `UPDATE admissions_applications SET
           interview_date=?, interview_time=?, interview_notes=?, interview_result=?,
           status='Interview Scheduled', updated_at=?, updated_by=?
         WHERE institution_id=? AND id=?`,
        [interviewDate, interviewTime, notes, result, now(), actor.userId, actor.institutionId, app.id],
      ).run();

      await audit(actor, "Scheduled/Scored interview", "admissions_applications", app.id, app, d);
      return ok({ scheduled: true, recorded: true }, requestId);
    }

    // Update interview result
    if (method === "PATCH" && path[2] && path[3] === "interview") {
      permit(actor, "admissions.manage");
      const app = await own(actor, "admissions_applications", path[2]);
      const schema = z.object({
        interviewResult: z.enum(["Pending", "Cleared", "Failed"]).optional(),
        selectionNotes: z.string().optional().default(""),
        status: z.string().optional(),
      });
      const d = schema.parse(body);
      const res = d.interviewResult || "Cleared";
      const nextStatus = d.status || (res === "Cleared" ? "Selected" : res === "Failed" ? "Rejected" : "Under Review");

      await stmt(
        `UPDATE admissions_applications SET
           interview_result=?, selection_notes=?, status=?, updated_at=?, updated_by=?
         WHERE institution_id=? AND id=?`,
        [res, d.selectionNotes, nextStatus, now(), actor.userId, actor.institutionId, app.id],
      ).run();

      await audit(actor, "Updated interview result", "admissions_applications", app.id, app, { ...d, nextStatus });
      return ok({ updated: true, status: nextStatus }, requestId);
    }

    // Update application status
    if ((method === "POST" || method === "PATCH") && path[2] && path[3] === "status") {
      permit(actor, "admissions.manage");
      const app = await own(actor, "admissions_applications", path[2]);
      const schema = z.object({
        status: z.string().min(1),
        selectionNotes: z.string().optional(),
      });
      const d = schema.parse(body);

      // Normalize status if e.g. "UnderReview" -> "Under Review"
      let normalizedStatus = d.status;
      if (normalizedStatus === "UnderReview") normalizedStatus = "Under Review";

      await stmt(
        "UPDATE admissions_applications SET status=?, selection_notes=coalesce(?, selection_notes), updated_at=?, updated_by=? WHERE institution_id=? AND id=?",
        [normalizedStatus, d.selectionNotes || null, now(), actor.userId, actor.institutionId, app.id],
      ).run();

      await audit(actor, "Changed application status", "admissions_applications", app.id, app, d);
      return ok({ updated: true, status: normalizedStatus }, requestId);
    }

    // Add document to application
    if (method === "POST" && path[2] && path[3] === "documents") {
      permit(actor, "admissions.manage");
      const app = await own(actor, "admissions_applications", path[2]);
      const schema = z.object({
        documentName: z.string().min(1),
        documentType: z.string().min(1),
        fileKey: z.string().optional(),
        fileUrl: z.string().optional(),
      });
      const d = schema.parse(body);
      const docId = uuid();
      const fileKey = d.fileKey || d.fileUrl || null;

      await stmt(
        `INSERT INTO admissions_documents(id, institution_id, application_id, document_name, document_type, file_key, verification_status, created_at, updated_at, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, 'Pending', ?, ?, ?, ?)`,
        [docId, actor.institutionId, app.id, d.documentName, d.documentType, fileKey, now(), now(), actor.userId, actor.userId],
      ).run();

      return ok(
        {
          id: docId,
          documentName: d.documentName,
          documentType: d.documentType,
          verificationStatus: "Pending",
          verification_status: "Pending",
          saved: true,
        },
        requestId,
      );
    }

    // Confirm & Enroll applicant into student table
    if (method === "POST" && path[2] && path[3] === "enroll") {
      permit(actor, "students.manage");
      const app = await own(actor, "admissions_applications", path[2]);
      if (app.status === "Enrolled") {
        throw new ApiError(409, "ALREADY_ENROLLED", "This applicant is already enrolled as a student.");
      }

      const schema = z.object({
        sectionId: z.string().min(1),
        admissionNumber: z.string().optional(),
        rollNumber: z.string().optional(),
      });
      const d = schema.parse(body);

      // Verify section
      const section = await own(actor, "sections", d.sectionId);

      // Auto generate admission number if not provided
      let admissionNumber = d.admissionNumber;
      if (!admissionNumber) {
        const studentCount = await one<{ count: number }>(
          "SELECT COUNT(*) as count FROM students WHERE institution_id=?",
          [actor.institutionId],
        );
        admissionNumber = `ADM-${new Date().getFullYear()}-${String((studentCount?.count || 0) + 1).padStart(4, "0")}`;
      }

      const studentId = uuid();
      const parentId = uuid();
      const enrollmentId = uuid();

      // 1. Create student
      const studentRecord = {
        id: studentId,
        institution_id: actor.institutionId,
        admission_number: admissionNumber,
        name: app.student_name,
        dob: app.dob || null,
        gender: app.gender || "Not specified",
        photo_key: null,
        aadhaar_last4: app.aadhaar_last4 || null,
        blood_group: app.blood_group || null,
        admission_date: today(),
        previous_school: app.previous_school || "",
        status: "Active",
        ...stamps(actor.userId),
      };

      // 2. Create parent
      const parentRecord = {
        id: parentId,
        institution_id: actor.institutionId,
        father_name: app.parent_relation === "Father" ? app.parent_name : "",
        mother_name: app.parent_relation === "Mother" ? app.parent_name : "",
        guardian_name: app.parent_name,
        mobile: app.parent_phone,
        alternate_mobile: null,
        email: app.parent_email || null,
        address: app.address || "",
        occupation: app.parent_occupation || "",
        relationship: app.parent_relation || "Father",
        sms_consent: 1,
        ...stamps(actor.userId),
      };

      // 3. Link parent and student
      const linkRecord = {
        id: uuid(),
        institution_id: actor.institutionId,
        student_id: studentId,
        parent_id: parentId,
        is_primary: 1,
      };

      // 4. Enroll in section
      const enrollmentRecord = {
        id: enrollmentId,
        institution_id: actor.institutionId,
        student_id: studentId,
        academic_year_id: app.academic_year_id,
        section_id: section.id,
        roll_number: d.rollNumber || null,
        clearance: "Pending",
        ...stamps(actor.userId),
      };

      // Run batch creation
      await batch([
        insert("students", studentRecord),
        insert("parents", parentRecord),
        insert("student_parents", linkRecord),
        insert("enrollments", enrollmentRecord),
        stmt(
          "UPDATE admissions_applications SET status='Enrolled', enrolled_student_id=?, updated_at=?, updated_by=? WHERE institution_id=? AND id=?",
          [studentId, now(), actor.userId, actor.institutionId, app.id],
        ),
        stmt(
          "INSERT INTO student_history(id, institution_id, student_id, action, details, actor_id, actor_name, created_at) VALUES (?, ?, ?, 'Enrolled', ?, ?, ?, ?)",
          [
            uuid(),
            actor.institutionId,
            studentId,
            JSON.stringify({ applicationId: app.id, admissionNumber, sectionId: section.id }),
            actor.userId,
            actor.name,
            now(),
          ],
        ),
      ]);

      await audit(actor, "Enrolled student from application", "admissions_applications", app.id, null, {
        studentId,
        admissionNumber,
        enrollmentId,
      });

      return ok(
        {
          enrolled: true,
          studentId,
          admissionNumber,
          parentId,
          sectionId: section.id,
        },
        requestId,
      );
    }
  }

  // Document verification
  if (path[1] === "documents" && path[2] && path[3] === "verify" && method === "PATCH") {
    permit(actor, "admissions.manage");
    const doc = await own(actor, "admissions_documents", path[2]);
    const schema = z.object({
      verificationStatus: z.string().optional(),
      status: z.string().optional(),
      verificationNotes: z.string().optional(),
      verificationRemarks: z.string().optional(),
    });
    const d = schema.parse(body);
    const verificationStatus = d.verificationStatus || d.status || "Verified";
    const verificationNotes = d.verificationRemarks || d.verificationNotes || null;

    await stmt(
      "UPDATE admissions_documents SET verification_status=?, verification_notes=?, updated_at=?, updated_by=? WHERE institution_id=? AND id=?",
      [verificationStatus, verificationNotes, now(), actor.userId, actor.institutionId, doc.id],
    ).run();

    await audit(actor, "Verified admission document", "admissions_documents", doc.id, doc, d);
    return ok({ verified: true, status: verificationStatus, verificationStatus }, requestId);
  }

  return null;
}
