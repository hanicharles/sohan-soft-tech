import { z } from "zod";
import { parseMoney, percentage } from "../../lib/money";
import { all, batch, one, Row, today } from "../db";
import { applyAdjustment, makeAssignment } from "../fees";
import { listStudents } from "../queries";
import { Actor, ApiError, own, permit } from "../security";
import { ok, RouteContext } from "./shared";

export async function feesRoute(ctx: RouteContext): Promise<Response | null> {
  const { actor, path, p, method, body, request, url, requestId } = ctx;
  if (method === "POST") {
    if (
      (path[0] === "fees" && path[1] === "assign") ||
      path[0] === "invoices"
    ) {
      permit(actor, path[0] === "invoices" ? "fees.invoice" : "fees.manage");
      const d = z
          .object({
            studentId: z.string(),
            structureId: z.string(),
            discount: z.string().default("0"),
            scholarship: z.string().default("0"),
            reason: z.string().max(500).default(""),
          })
          .parse(body),
        r = await makeAssignment(
          actor,
          d.studentId,
          d.structureId,
          parseMoney(d.discount),
          parseMoney(d.scholarship),
          d.reason,
        );
      if (parseMoney(d.discount) > 0 || parseMoney(d.scholarship) > 0)
        permit(actor, "fees.manage");
      await batch(r.statements);
      return ok({ invoiceId: r.invoiceId }, requestId);
    }
  }
  if (method === "POST") {
    if (path[0] === "fees" && path[1] === "bulk")
      return ok(await bulkFees(actor, body), requestId);
  }
  if (method === "POST") {
    if (path[0] === "fees" && path[1] === "adjust") {
      const d = z
        .object({
          installmentId: z.string(),
          kind: z.enum([
            "Discount",
            "Scholarship",
            "Concession",
            "Waiver",
            "Adjustment",
            "Late Fee",
          ]),
          amount: z.string(),
          direction: z.enum(["Credit", "Debit"]).default("Credit"),
          reason: z.string().trim().min(3).max(500),
          componentId: z.string().optional(),
          benefitId: z.string().optional(),
        })
        .parse(body);
      return ok(
        await applyAdjustment(actor, {
          ...d,
          amountPaise:
            parseMoney(d.amount) * (d.direction === "Credit" ? -1 : 1),
        }),
        requestId,
      );
    }
  }
  return null;
}
async function bulkFees(actor: Actor, input: Row) {
  permit(actor, "fees.manage");
  const d = z
      .object({
        structureId: z.string(),
        studentIds: z.array(z.string()).max(50).optional(),
        commit: z.boolean().default(false),
        benefitId: z.string().optional(),
      })
      .parse(input),
    structure = await own(actor, "fee_structures", d.structureId),
    p = new URLSearchParams({
      year: structure.academic_year_id,
      class: structure.class_id,
      size: "100",
    });
  if (structure.section_id) p.set("section", structure.section_id);
  if (structure.stream_id) p.set("stream", structure.stream_id);
  const students = (await listStudents(actor, p)).rows.filter(
    (s) =>
      s.status === "Active" && (!d.studentIds || d.studentIds.includes(s.id)),
  );
  if (students.length > 50)
    throw new ApiError(
      422,
      "BATCH_LIMIT",
      "Select up to 50 students per fee generation batch.",
    );
  const items = await all(
      "SELECT * FROM fee_structure_items WHERE institution_id=? AND structure_id=?",
      [actor.institutionId, structure.id],
    ),
    gross = items.reduce((s, i) => s + i.amount_paise, 0),
    benefit = d.benefitId ? await own(actor, "benefits", d.benefitId) : null;
  const rows = [],
    statements = [];
  for (const s of students) {
    const existing = await one(
      "SELECT id FROM student_fee_assignments WHERE institution_id=? AND student_id=? AND structure_id=?",
      [actor.institutionId, s.id, structure.id],
    );
    if (existing) {
      rows.push({
        id: s.id,
        name: s.name,
        status: "Already assigned",
        amount: gross,
      });
      continue;
    }
    let discount = 0,
      scholarship = 0;
    if (benefit) {
      if (benefit.valid_until && benefit.valid_until < today())
        throw new ApiError(422, "BENEFIT_EXPIRED", "This benefit has expired.");
      const eligible = benefit.component_id
          ? items
              .filter((i) => i.component_id === benefit.component_id)
              .reduce((s, i) => s + i.amount_paise, 0)
          : gross,
        value =
          benefit.calculation === "Percentage"
            ? percentage(eligible, benefit.value)
            : Math.min(benefit.value, eligible);
      if (benefit.kind === "Scholarship") scholarship = value;
      else discount = value;
    }
    const r = await makeAssignment(
      actor,
      s.id,
      structure.id,
      discount,
      scholarship,
      benefit ? "Bulk approval: " + benefit.name : "",
    );
    rows.push({
      id: s.id,
      name: s.name,
      status: "Ready",
      gross,
      discount: r.discount,
      scholarship: r.scholarship,
      amount: r.net,
    });
    if (d.commit) statements.push(...r.statements);
  }
  if (d.commit && statements.length) await batch(statements);
  return {
    rows,
    count: rows.filter((r) => r.status === "Ready").length,
    total: rows.reduce((s, r) => s + r.amount, 0),
    committed: d.commit,
  };
}
