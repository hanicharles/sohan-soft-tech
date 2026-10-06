import { env } from "cloudflare:workers";
import { z } from "zod";
import { Permission } from "../../lib/permissions";
import { dateField } from "../catalog";
import { all, batch, now, one, Row, stmt } from "../db";
import { listInstitutions } from "../institutions";
import { providerStatus } from "../providers";
import { filters, listStudents, paging } from "../queries";
import { Actor, ApiError, audit, own, permit } from "../security";

export async function listResource(
  actor: Actor,
  kind: string,
  p: URLSearchParams,
) {
  const page = paging(p),
    f = filters(actor, p);
  let sql = "",
    values: unknown[] = [],
    countSql = "";
  if (kind === "parents") {
    permit(actor, "students");
    const w = ["par.institution_id=?"],
      v: unknown[] = [actor.institutionId];
    if (p.get("q")) {
      w.push(
        "(par.guardian_name LIKE ? OR par.mobile LIKE ? OR par.email LIKE ?)",
      );
      v.push(
        "%" + p.get("q") + "%",
        "%" + p.get("q") + "%",
        "%" + p.get("q") + "%",
      );
    }
    if (actor.role === "TEACHER") {
      w.push(
        "EXISTS(SELECT 1 FROM student_parents sp JOIN enrollments e ON e.student_id=sp.student_id WHERE sp.parent_id=par.id AND e.section_id=?)",
      );
      v.push(actor.sectionId);
    }
    sql = `SELECT par.*,(SELECT COUNT(*) FROM student_parents sp WHERE sp.parent_id=par.id) children,(SELECT GROUP_CONCAT(s.name, ', ') FROM student_parents sp JOIN students s ON s.id=sp.student_id WHERE sp.parent_id=par.id) children_names FROM parents par WHERE ${w.join(" AND ")} ORDER BY par.guardian_name`;
    values = v;
  } else if (kind === "structures") {
    permit(actor, "finance");
    sql = `SELECT fs.*,c.name class_name,st.name stream_name,sec.name section_name,(SELECT SUM(amount_paise) FROM fee_structure_items WHERE structure_id=fs.id) total_paise,(SELECT COUNT(*) FROM student_fee_assignments WHERE structure_id=fs.id) assigned FROM fee_structures fs JOIN classes c ON c.id=fs.class_id LEFT JOIN streams st ON st.id=fs.stream_id LEFT JOIN sections sec ON sec.id=fs.section_id WHERE fs.institution_id=? ${p.get("year") ? "AND fs.academic_year_id=?" : ""} ORDER BY c.sort_order,fs.created_at`;
    values = p.get("year")
      ? [actor.institutionId, p.get("year")]
      : [actor.institutionId];
  } else if (["payments", "receipts", "invoices", "refunds"].includes(kind)) {
    if (actor.role === "TEACHER" && !actor.feeVisibility)
      permit(actor, "finance");
    const w = [f.where],
      v = [...f.values],
      alias = kind === "invoices" ? "i" : kind === "refunds" ? "rf" : "pay";
    if (p.get("from")) {
      w.push(
        `date(${alias}.${kind === "payments" || kind === "receipts" ? "paid_at" : "created_at"},'+5 hours','+30 minutes')>=?`,
      );
      v.push(p.get("from"));
    }
    if (p.get("to")) {
      w.push(
        `date(${alias}.${kind === "payments" || kind === "receipts" ? "paid_at" : "created_at"},'+5 hours','+30 minutes')<=?`,
      );
      v.push(p.get("to"));
    }
    if (p.get("q")) {
      w.push(
        `(s.name LIKE ? OR s.admission_number LIKE ? OR ${kind === "invoices" ? "i.number" : kind === "receipts" ? "rec.number" : "COALESCE(" + alias + ".reference,'')"} LIKE ?)`,
      );
      v.push(
        "%" + p.get("q") + "%",
        "%" + p.get("q") + "%",
        "%" + p.get("q") + "%",
      );
    }
    if (p.get("status")) {
      w.push(`${alias}.status=?`);
      v.push(p.get("status"));
    }
    const joins = (al: string) =>
      `JOIN students s ON s.id=${al}.student_id JOIN enrollments e ON e.student_id=${al}.student_id AND e.academic_year_id=${al}.academic_year_id AND e.institution_id=${al}.institution_id JOIN sections sec ON sec.id=e.section_id JOIN classes c ON c.id=sec.class_id`;
    if (kind === "payments")
      sql = `SELECT pay.*,s.name student_name,s.admission_number,c.name class_name,sec.name section_name,rec.id receipt_id,rec.number receipt_number,COALESCE((SELECT SUM(amount_paise) FROM refunds rf WHERE rf.payment_id=pay.id AND rf.status='Processed'),0) refunded_paise FROM payments pay ${joins("pay")} LEFT JOIN receipts rec ON rec.payment_id=pay.id WHERE ${w.join(" AND ")} ORDER BY pay.paid_at DESC`;
    if (kind === "receipts")
      sql = `SELECT rec.*,pay.student_id,pay.amount_paise,pay.method,pay.reference,pay.paid_at,s.name student_name,s.admission_number,c.name class_name FROM receipts rec JOIN payments pay ON pay.id=rec.payment_id ${joins("pay")} WHERE ${w.join(" AND ")} ORDER BY pay.paid_at DESC`;
    if (kind === "invoices")
      sql = `SELECT i.*,s.name student_name,s.admission_number,c.name class_name FROM invoice_balances i ${joins("i")} WHERE ${w.join(" AND ")} ORDER BY i.created_at DESC`;
    if (kind === "refunds") {
      permit(actor, "refund");
      sql = `SELECT rf.*,s.name student_name,c.name class_name FROM refunds rf ${joins("rf")} WHERE ${w.join(" AND ")} ORDER BY rf.created_at DESC`;
    }
    values = v;
  } else if (kind === "notifications") {
    if (["PARENT", "STUDENT", "TEACHER"].includes(actor.role)) {
      if (actor.role === "TEACHER") permit(actor, "finance");
      const data = await listStudents(
        actor,
        new URLSearchParams({ ...Object.fromEntries(p), size: "100" }),
      );
      const ids = data.rows.map((r) => r.id);
      if (!ids.length) return { rows: [], total: 0, ...page };
      sql = `SELECT * FROM notifications WHERE institution_id=? AND student_id IN (${ids.map(() => "?").join(",")}) ORDER BY created_at DESC`;
      values = [actor.institutionId, ...ids];
    } else {
      permit(actor, "finance");
      sql =
        "SELECT n.*,s.name student_name FROM notifications n LEFT JOIN students s ON s.id=n.student_id WHERE n.institution_id=? ORDER BY n.created_at DESC";
      values = [actor.institutionId];
    }
  } else if (kind === "audit") {
    permit(actor, "admin");
    const where = ["institution_id=?"];
    values = [actor.institutionId];
    if (p.get("q")) {
      where.push("(action LIKE ? OR user_name LIKE ? OR entity_id LIKE ?)");
      const q = "%" + p.get("q") + "%";
      values.push(q, q, q);
    }
    const category = p.get("category");
    if (category === "approval")
      where.push(
        "(lower(action) LIKE '%approv%' OR lower(action) LIKE '%supervisor%')",
      );
    if (category === "waiver")
      where.push(
        "(lower(action) LIKE '%concession%' OR lower(action) LIKE '%waiv%' OR lower(new_value) LIKE '%waiv%' OR lower(new_value) LIKE '%concession%')",
      );
    if (category === "backdated")
      where.push(
        "(lower(action) LIKE '%backdat%' OR lower(action) LIKE '%due date%' OR lower(action) LIKE '%revers%')",
      );
    sql =
      "SELECT * FROM audit_logs WHERE " +
      where.join(" AND ") +
      " ORDER BY created_at DESC,id DESC";
  } else if (kind === "reconciliation") {
    permit(actor, "collect");
    sql = `SELECT r.*,s.name student_name FROM reconciliation_records r LEFT JOIN students s ON s.id=r.student_id WHERE r.institution_id=? ${p.get("year") ? "AND r.academic_year_id=?" : ""} ORDER BY r.created_at DESC`;
    values = p.get("year")
      ? [actor.institutionId, p.get("year")]
      : [actor.institutionId];
  } else if (kind === "users") {
    permit(actor, "users.view");
    const members = await all(
        "SELECT m.*,COALESCE(NULLIF(m.display_name,''),u.name) name,u.email FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.institution_id=? AND m.role NOT IN ('SUPER_ADMIN','PARENT','STUDENT') ORDER BY u.name",
        [actor.institutionId],
      ),
      invitations = await all(
        "SELECT * FROM invitations WHERE institution_id=? AND role NOT IN ('PARENT','STUDENT','SUPER_ADMIN') ORDER BY created_at DESC",
        [actor.institutionId],
      );
    return { members, invitations };
  } else if (kind === "providers") {
    permit(actor, "admin");
    return {
      providers: await providerStatus(actor.institutionId),
      encryptionReady: !!env.PROVIDER_ENCRYPTION_KEY,
    };
  } else if (kind === "institutions") {
    return listInstitutions(actor, p);
  } else if (kind === "jobs") {
    permit(actor, "admin");
    sql =
      "SELECT * FROM job_runs WHERE institution_id=? ORDER BY created_at DESC";
    values = [actor.institutionId];
  } else if (kind === "structure-items") {
    permit(actor, "finance");
    const id = p.get("structure") || "";
    await own(actor, "fee_structures", id);
    sql =
      "SELECT fi.*,fc.name FROM fee_structure_items fi JOIN fee_components fc ON fc.id=fi.component_id WHERE fi.institution_id=? AND fi.structure_id=?";
    values = [actor.institutionId, id];
  } else throw new ApiError(404, "NOT_FOUND", "Resource not found.");
  const total = await one(
      "SELECT COUNT(*) count FROM (" + sql + ") records",
      values,
    ),
    rows = await all(sql + " LIMIT ? OFFSET ?", [
      ...values,
      page.size,
      page.offset,
    ]);
  return { rows, total: total!.count, ...page };
}
export async function patchResource(actor: Actor, path: string[], body: Row) {
  permit(
    actor,
    (
      {
        students: "students.manage",
        years: "academics.manage",
        components: "fees.manage",
        installments: "fees.manage",
        settings: "settings.manage",
      } as Record<string, Permission>
    )[path[0]] || "settings.manage",
  );
  const kind = path[0],
    id = path[1];
  if (kind === "settings") {
    const current = (await one("SELECT * FROM institutions WHERE id=?", [
      actor.institutionId,
    ])) as Row;
    const d = z
      .object({
        name: z.string().min(2).max(160),
        address: z.string().max(500),
        email: z.string().email().or(z.literal("")),
        phone: z.string().max(20),
        gstin: z.string().max(15).optional(),
        settings: z.object({
          lateFee: z.object({
            enabled: z.boolean(),
            mode: z.enum(["Fixed", "Daily", "Percentage"]),
            value: z.number().int().min(0).max(10000000),
            graceDays: z.number().int().min(0).max(90),
            maxPaise: z.number().int().min(0).max(100000000),
          }),
          reminders: z.object({
            beforeDays: z.number().int().min(0).max(30),
            afterDays: z.number().int().min(0).max(90),
            channel: z.enum(["SMS", "WhatsApp", "Email"]),
          }),
          templates: z.object({
            upcoming: z.string().min(5).max(1500),
            overdue: z.string().min(5).max(1500),
          }),
          upi: z
            .object({
              payeeId: z
                .string()
                .regex(/^[a-zA-Z0-9._-]{2,256}@[a-zA-Z][a-zA-Z0-9.-]{1,64}$/)
                .or(z.literal("")),
              payeeName: z.string().max(100),
            })
            .optional(),
          receiptNotifications: z
            .object({
              enabled: z.boolean(),
              channel: z.enum(["Email", "SMS", "WhatsApp"]),
            })
            .optional(),
          gateway: z.enum(["Razorpay", "Cashfree"]),
          language: z.enum(["en", "kn", "hi"]),
        }),
      })
      .parse(body);
    const settings = { ...JSON.parse(current.settings), ...d.settings };
    await batch([
      stmt(
        "UPDATE institutions SET name=?,address=?,email=?,phone=?,gstin=?,settings=?,updated_at=?,updated_by=? WHERE id=?",
        [
          d.name,
          d.address,
          d.email,
          d.phone,
          d.gstin || null,
          JSON.stringify(settings),
          now(),
          actor.userId,
          actor.institutionId,
        ],
      ),
      audit(
        actor,
        "Updated institution settings",
        "institutions",
        actor.institutionId,
        { ...current, settings: JSON.parse(current.settings) },
        { ...d, settings },
      ),
    ]);
    return { saved: true };
  }
  if (kind === "students") {
    const current = await own(actor, "students", id),
      d = z
        .object({
          name: z.string().min(1).max(160).optional(),
          status: z
            .enum([
              "Active",
              "Inactive",
              "Transferred",
              "Graduated",
              "Left",
              "Suspended",
            ])
            .optional(),
          clearance: z.boolean().optional(),
          yearId: z.string().optional(),
          reason: z.string().min(3).max(500),
        })
        .parse(body);
    const statements = [];
    if (d.clearance) {
      if (!d.yearId)
        throw new ApiError(422, "YEAR_REQUIRED", "Select the academic year.");
      const balance = await one(
        "SELECT outstanding_paise FROM student_balances WHERE institution_id=? AND student_id=? AND academic_year_id=?",
        [actor.institutionId, id, d.yearId],
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
          [now(), actor.userId, actor.institutionId, id, d.yearId],
        ),
      );
    }
    if (d.name || d.status)
      statements.push(
        stmt(
          "UPDATE students SET name=COALESCE(?,name),status=COALESCE(?,status),updated_at=?,updated_by=? WHERE institution_id=? AND id=?",
          [
            d.name || null,
            d.status || null,
            now(),
            actor.userId,
            actor.institutionId,
            id,
          ],
        ),
      );
    statements.push(
      audit(
        actor,
        "Updated student / financial clearance",
        "students",
        id,
        { name: current.name, status: current.status },
        d,
      ),
    );
    await batch(statements);
    return { saved: true };
  }
  if (kind === "installments") {
    const current = await own(actor, "installments", id),
      d = z
        .object({ dueDate: dateField, reason: z.string().min(3).max(500) })
        .parse(body),
      year = await own(actor, "academic_years", current.academic_year_id);
    if (["Closed", "Archived"].includes(year.status))
      throw new ApiError(409, "YEAR_CLOSED", "This academic year is closed.");
    if (d.dueDate < year.start_date || d.dueDate > year.end_date)
      throw new ApiError(
        422,
        "INVALID_DUE_DATE",
        "Due date must fall within the academic year.",
      );
    await batch([
      stmt(
        "UPDATE installments SET due_date=?,updated_at=?,updated_by=? WHERE institution_id=? AND id=?",
        [d.dueDate, now(), actor.userId, actor.institutionId, id],
      ),
      audit(
        actor,
        "Overrode installment due date",
        "installments",
        id,
        { dueDate: current.due_date },
        d,
      ),
    ]);
    return { saved: true };
  }
  if (kind === "years") {
    const current = await own(actor, "academic_years", id),
      d = z
        .object({ status: z.enum(["Draft", "Active", "Closed", "Archived"]) })
        .parse(body);
    await batch([
      stmt(
        "UPDATE academic_years SET status=?,updated_at=?,updated_by=? WHERE institution_id=? AND id=?",
        [d.status, now(), actor.userId, actor.institutionId, id],
      ),
      audit(
        actor,
        "Changed academic year status",
        "academic_years",
        id,
        { status: current.status },
        d,
      ),
    ]);
    return { saved: true };
  }
  if (kind === "components") {
    const current = await own(actor, "fee_components", id),
      d = z
        .object({
          name: z.string().min(1).max(160),
          category: z.string().min(1).max(100),
          active: z.boolean(),
          sortOrder: z.number().int().min(0),
        })
        .parse(body);
    await batch([
      stmt(
        "UPDATE fee_components SET name=?,category=?,active=?,sort_order=?,updated_at=?,updated_by=? WHERE institution_id=? AND id=?",
        [
          d.name,
          d.category,
          +d.active,
          d.sortOrder,
          now(),
          actor.userId,
          actor.institutionId,
          id,
        ],
      ),
      audit(actor, "Updated fee component", "fee_components", id, current, d),
    ]);
    return { saved: true };
  }
  if (kind === "users") {
    const current = await own(actor, "memberships", id);
    if (current.role === "SUPER_ADMIN" && actor.role !== "SUPER_ADMIN")
      throw new ApiError(
        403,
        "FORBIDDEN",
        "Only a platform administrator can manage Super Admin access.",
      );
    if (current.user_id === actor.userId)
      throw new ApiError(
        422,
        "SELF_ROLE_CHANGE",
        "You cannot remove or change your own access.",
      );
    const d = z.object({ active: z.boolean() }).parse(body);
    await batch([
      stmt(
        "UPDATE memberships SET active=?,updated_at=?,updated_by=? WHERE institution_id=? AND id=?",
        [+d.active, now(), actor.userId, actor.institutionId, id],
      ),
      audit(
        actor,
        "Updated user access",
        "memberships",
        id,
        { active: current.active },
        d,
      ),
    ]);
    return { saved: true };
  }
  if (kind === "institutions") {
    permit(actor, "system");
    const current = await one(
      "SELECT id,status,subscription FROM institutions WHERE id=?",
      [id],
    );
    if (!current)
      throw new ApiError(404, "NOT_FOUND", "Institution not found.");
    const d = z
      .object({
        status: z.enum(["Active", "Suspended"]),
        subscription: z.enum(["Starter", "Professional", "Enterprise"]),
      })
      .parse(body);
    await batch([
      stmt(
        "UPDATE institutions SET status=?,subscription=?,updated_at=?,updated_by=? WHERE id=?",
        [d.status, d.subscription, now(), actor.userId, id],
      ),
      audit(
        { ...actor, institutionId: id },
        "Updated subscription",
        "institutions",
        id,
        current,
        d,
      ),
    ]);
    return { saved: true };
  }
  throw new ApiError(404, "NOT_FOUND", "Update route not found.");
}
