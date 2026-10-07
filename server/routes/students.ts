import { env } from "cloudflare:workers";
import { z } from "zod";
import { createStudent, promote } from "../catalog";
import { all, batch, insert, now, one, Row, stmt, uuid } from "../db";
import { financialProfile, listStudents } from "../queries";
import { accessStudent, ApiError, audit, own, permit } from "../security";
import { ok, RouteContext } from "./shared";

export async function studentsRoute(
  ctx: RouteContext,
): Promise<Response | null> {
  const { actor, path, p, method, body, request, url, requestId } = ctx;
  if (method === "GET") {
    if (path[0] === "students") {
      if (path[1]) {
        await accessStudent(actor, path[1], p.get("year") || undefined);
        return ok(await financialProfile(actor, path[1], p), requestId);
      }
      return ok(await listStudents(actor, p), requestId);
    }
  }
  if (method === "GET") {
    if (path[0] === "search") {
      const q = (p.get("q") || "").trim();
      if (q.length < 2)
        return ok(
          { students: [], parents: [], invoices: [], payments: [] },
          requestId,
        );
      const students = await listStudents(
        actor,
        new URLSearchParams({ ...Object.fromEntries(p), q, size: "6" }),
      );
      let parents: Row[] = [],
        invoices: Row[] = [],
        payments: Row[] = [];
      if (
        ["SUPER_ADMIN", "INSTITUTION_ADMIN", "ACCOUNTANT"].includes(actor.role)
      ) {
        parents = await all(
          "SELECT id,guardian_name,mobile FROM parents WHERE institution_id=? AND (guardian_name LIKE ? OR mobile LIKE ?) LIMIT 5",
          [actor.institutionId, "%" + q + "%", "%" + q + "%"],
        );
        invoices = await all(
          "SELECT id,student_id,number FROM invoices WHERE institution_id=? AND number LIKE ? LIMIT 5",
          [actor.institutionId, "%" + q + "%"],
        );
        payments = await all(
          "SELECT id,student_id,reference,amount_paise FROM payments WHERE institution_id=? AND (reference LIKE ? OR gateway_transaction_id LIKE ?) LIMIT 5",
          [actor.institutionId, "%" + q + "%", "%" + q + "%"],
        );
      }
      return ok(
        { students: students.rows, parents, invoices, payments },
        requestId,
      );
    }
  }
  if (method === "GET") {
    if (path[0] === "uploads" && path[1]) {
      const record = await own(actor, "students", path[1]);
      await accessStudent(actor, path[1]);
      if (!record.photo_key || !env.BUCKET)
        throw new ApiError(404, "NOT_FOUND", "No student photo available.");
      const file = await env.BUCKET.get(record.photo_key);
      if (!file) throw new ApiError(404, "NOT_FOUND", "Photo not found.");
      return new Response(file.body, {
        headers: {
          "Content-Type": file.httpMetadata?.contentType || "image/png",
          "Cache-Control": "private,max-age=600",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
  }
  if (method === "POST") {
    if (path[0] === "students" && path[1] === "promote")
      return ok(await promote(actor, body), requestId);
  }
  if (method === "POST") {
    if (path[0] === "students" && path[1] === "link-parent") {
      permit(actor, "students.manage");
      await own(actor, "students", body.studentId);
      await own(actor, "parents", body.parentId);
      await batch([
        insert("student_parents", {
          id: uuid(),
          institution_id: actor.institutionId,
          student_id: body.studentId,
          parent_id: body.parentId,
          is_primary: 0,
        }),
        audit(actor, "Linked guardian", "students", body.studentId, null, body),
      ]);
      return ok({ linked: true }, requestId);
    }
  }
  if (method === "POST") {
    if (path[0] === "students" && path.length === 1) {
      const r = await createStudent(actor, body);
      return ok({ id: r.id }, requestId);
    }
  }
  if (method === "POST") {
    if (path[0] === "uploads") {
      permit(actor, "students.manage");
      const d = z
          .object({
            studentId: z.string(),
            type: z.enum(["image/png", "image/jpeg"]),
            content: z.string().max(1500000),
          })
          .parse(body),
        student = await own(actor, "students", d.studentId),
        bytes = Uint8Array.from(atob(d.content), (c) => c.charCodeAt(0));
      if (
        bytes.length > 1000000 ||
        (d.type === "image/png" &&
          !(
            bytes[0] === 137 &&
            bytes[1] === 80 &&
            bytes[2] === 78 &&
            bytes[3] === 71
          )) ||
        (d.type === "image/jpeg" &&
          !(bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255))
      )
        throw new ApiError(
          422,
          "INVALID_IMAGE",
          "Upload a PNG or JPEG under 1 MB.",
        );
      if (!env.BUCKET)
        throw new ApiError(
          503,
          "UPLOAD_UNAVAILABLE",
          "Photo uploads are currently unavailable.",
        );
      const key = `${actor.institutionId}/students/${student.id}/${uuid()}`;
      await env.BUCKET.put(key, bytes, {
        httpMetadata: { contentType: d.type },
      });
      await batch([
        stmt(
          "UPDATE students SET photo_key=?,updated_at=?,updated_by=? WHERE institution_id=? AND id=?",
          [key, now(), actor.userId, actor.institutionId, student.id],
        ),
        audit(actor, "Updated student photo", "students", student.id, null, {
          photo: true,
        }),
      ]);
      return ok({ saved: true }, requestId);
    }
  }
  if (method === "PATCH" && path[0] === "students" && path[1]) {
    permit(actor, "students.manage");
    const student = await own(actor, "students", path[1]);
    const schema = z.object({
      name: z.string().trim().min(1).optional(),
      dob: z.string().optional().or(z.literal("")),
      gender: z.enum(["Male", "Female", "Other", "Not specified"]).optional(),
      bloodGroup: z.string().optional(),
      aadhaarLast4: z.string().optional(),
      previousSchool: z.string().optional(),
      status: z.enum(["Active", "Inactive", "Transferred", "Graduated", "Left", "Suspended", "Archived"]).optional(),
      clearance: z.boolean().optional(),
      yearId: z.string().optional(),
      reason: z.string().optional(),
    });
    const d = schema.parse(body);
    const statements: any[] = [];

    if (d.clearance) {
      if (!d.yearId)
        throw new ApiError(422, "YEAR_REQUIRED", "Select the academic year.");
      const balance = await one(
        "SELECT outstanding_paise FROM student_balances WHERE institution_id=? AND student_id=? AND academic_year_id=?",
        [actor.institutionId, student.id, d.yearId],
      );
      if ((balance?.outstanding_paise || 0) > 0)
        throw new ApiError(
          409,
          "FEES_OUTSTANDING",
          "Clear outstanding fees before marking financial clearance.",
        );
      statements.push(
        stmt(
          "UPDATE enrollments SET clearance='Cleared',updated_at=?,updated_by=? WHERE institution_id=? AND student_id=? AND academic_year_id=?",
          [now(), actor.userId, actor.institutionId, student.id, d.yearId],
        ),
      );
    }

    const updates: string[] = [];
    const values: any[] = [];

    if (d.name) { updates.push("name=?"); values.push(d.name); }
    if (d.dob !== undefined) { updates.push("dob=?"); values.push(d.dob || null); }
    if (d.gender) { updates.push("gender=?"); values.push(d.gender); }
    if (d.bloodGroup !== undefined) { updates.push("blood_group=?"); values.push(d.bloodGroup || null); }
    if (d.aadhaarLast4 !== undefined) { updates.push("aadhaar_last4=?"); values.push(d.aadhaarLast4 || null); }
    if (d.previousSchool !== undefined) { updates.push("previous_school=?"); values.push(d.previousSchool); }
    if (d.status) { updates.push("status=?"); values.push(d.status); }

    if (updates.length > 0) {
      updates.push("updated_at=?", "updated_by=?");
      values.push(now(), actor.userId, actor.institutionId, student.id);
      statements.push(
        stmt(`UPDATE students SET ${updates.join(", ")} WHERE institution_id=? AND id=?`, values),
      );

      if (d.status && d.status !== student.status) {
        statements.push(
          stmt(
            "INSERT INTO student_history(id, institution_id, student_id, action, details, actor_id, actor_name, created_at) VALUES (?, ?, ?, 'Status Changed', ?, ?, ?, ?)",
            [uuid(), actor.institutionId, student.id, JSON.stringify({ oldStatus: student.status, newStatus: d.status }), actor.userId, actor.name, now()],
          ),
        );
      }
    }

    statements.push(
      audit(actor, "Updated student details / clearance", "students", student.id, student, d),
    );
    await batch(statements);
    return ok({ updated: true, saved: true }, requestId);
  }
  return null;
}
