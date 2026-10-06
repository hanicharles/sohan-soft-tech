import { env } from "cloudflare:workers";
import { z } from "zod";
import { createStudent, promote } from "../catalog";
import { all, batch, insert, now, Row, stmt, uuid } from "../db";
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
  return null;
}
