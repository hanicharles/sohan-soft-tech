import { z } from "zod";
import { all, batch, insert, now, one, stamps, stmt, uuid } from "./db";
import { Actor, ApiError, audit, own, permit, sha256 } from "./security";

const rolloverSchema = z.object({
  sourceYearId: z.string().min(1),
  targetYearId: z.string().min(1),
  mapping: z.record(z.string().min(1), z.string().min(1)),
  reason: z.string().trim().min(10).max(500),
});
interface Balance {
  id: string;
  invoice_id: string;
  outstanding_paise: number;
  title: string;
}
interface RolloverRecord {
  id: string;
  source_year_id: string;
  target_year_id: string;
  mapping: string;
  status: string;
  reason: string;
  approved_by: string;
}
async function scope(actor: Actor, input: unknown) {
  permit(actor, "settings.manage");
  permit(actor, "academics.manage");
  permit(actor, "fees.manage");
  const d = rolloverSchema.parse(input),
    source = await own(actor, "academic_years", d.sourceYearId),
    target = await own(actor, "academic_years", d.targetYearId);
  if (
    source.id === target.id ||
    target.start_date <= source.end_date ||
    !["Active", "Draft"].includes(target.status)
  )
    throw new ApiError(
      422,
      "INVALID_ROLLOVER",
      "Select a later, open academic year with no overlap.",
    );
  const sourceSections = await all<{ id: string }>(
    "SELECT DISTINCT e.section_id id FROM enrollments e JOIN students s ON s.id=e.student_id AND s.institution_id=e.institution_id WHERE e.institution_id=? AND e.academic_year_id=? AND s.status='Active'",
    [actor.institutionId, d.sourceYearId],
  );
  for (const s of sourceSections) {
    const destination = d.mapping[s.id];
    if (!destination)
      throw new ApiError(
        422,
        "PROMOTION_MAPPING_REQUIRED",
        "Map every source section to a destination section.",
      );
    const section = await own(actor, "sections", destination);
    if (section.academic_year_id !== target.id)
      throw new ApiError(
        422,
        "WRONG_TARGET_YEAR",
        "Each destination section must belong to the target year.",
      );
  }
  const conflict = await one(
    "SELECT e.id FROM enrollments e JOIN enrollments n ON n.institution_id=e.institution_id AND n.student_id=e.student_id AND n.academic_year_id=? JOIN students s ON s.id=e.student_id AND s.institution_id=e.institution_id WHERE e.institution_id=? AND e.academic_year_id=? AND s.status='Active' AND n.section_id<>json_extract(?, '$.\"' || e.section_id || '\"') LIMIT 1",
    [target.id, actor.institutionId, source.id, JSON.stringify(d.mapping)],
  );
  if (conflict)
    throw new ApiError(
      409,
      "PROMOTION_CONFLICT",
      "An existing destination enrollment conflicts with this mapping. Resolve it before freezing the year.",
    );
  const pending = await one<{ count: number }>(
    "SELECT (SELECT COUNT(*) FROM payments WHERE institution_id=? AND academic_year_id=? AND status IN ('Initiated','Processing','Pending'))+(SELECT COUNT(*) FROM refunds WHERE institution_id=? AND academic_year_id=? AND status IN ('Requested','Approved')) count",
    [actor.institutionId, source.id, actor.institutionId, source.id],
  );
  if (pending?.count)
    throw new ApiError(
      409,
      "PENDING_SETTLEMENT",
      "Confirm or cancel pending payments and complete refund requests before rollover.",
    );
  const inactive = await one<{ count: number }>(
    "SELECT COUNT(*) count FROM student_balances b JOIN students s ON s.id=b.student_id AND s.institution_id=b.institution_id WHERE b.institution_id=? AND b.academic_year_id=? AND b.outstanding_paise>0 AND s.status<>'Active'",
    [actor.institutionId, source.id],
  );
  if (inactive?.count)
    throw new ApiError(
      409,
      "INACTIVE_DUES",
      "Resolve transferred or inactive students’ outstanding dues before closing the year.",
    );
  const snapshot = await one<{
    students: number;
    outstanding: number;
    ledger_count: number;
  }>(
    "SELECT (SELECT COUNT(*) FROM enrollments e JOIN students s ON s.id=e.student_id AND s.institution_id=e.institution_id WHERE e.institution_id=? AND e.academic_year_id=? AND s.status='Active') students,(SELECT COALESCE(SUM(outstanding_paise),0) FROM student_balances WHERE institution_id=? AND academic_year_id=?) outstanding,(SELECT COUNT(*) FROM ledger_entries WHERE institution_id=? AND academic_year_id=?) ledger_count",
    [
      actor.institutionId,
      source.id,
      actor.institutionId,
      source.id,
      actor.institutionId,
      source.id,
    ],
  );
  const fingerprint = await sha256(JSON.stringify({ d, snapshot }));
  return { d, source, target, snapshot, fingerprint };
}
export async function previewRollover(actor: Actor, input: unknown) {
  const { source, target, snapshot, fingerprint } = await scope(actor, input);
  return { source: source.name, target: target.name, ...snapshot, fingerprint };
}
export async function startRollover(actor: Actor, input: unknown) {
  const reviewed = z
      .object({ fingerprint: z.string().length(64) })
      .parse(input),
    s = await scope(actor, input);
  if (reviewed.fingerprint !== s.fingerprint)
    throw new ApiError(
      409,
      "PREVIEW_STALE",
      "The year changed after preview. Review the refreshed figures before approving.",
    );
  const existing = await one<{ id: string }>(
    "SELECT id FROM year_rollovers WHERE institution_id=? AND source_year_id=?",
    [actor.institutionId, s.d.sourceYearId],
  );
  if (existing)
    throw new ApiError(
      409,
      "ROLLOVER_EXISTS",
      "This year already has a rollover. Resume that operation.",
    );
  const id = uuid();
  await batch([
    insert("year_rollovers", {
      id,
      institution_id: actor.institutionId,
      source_year_id: s.d.sourceYearId,
      target_year_id: s.d.targetYearId,
      mapping: JSON.stringify(s.d.mapping),
      reason: s.d.reason,
      approved_by: actor.userId,
      status: "Running",
      snapshot: JSON.stringify(s.snapshot),
      ...stamps(actor.userId),
    }),
    stmt(
      "UPDATE academic_years SET status='Closed',updated_at=?,updated_by=? WHERE institution_id=? AND id=?",
      [now(), actor.userId, actor.institutionId, s.d.sourceYearId],
    ),
    audit(
      actor,
      "Supervisor approved academic rollover and ledger freeze",
      "year_rollovers",
      id,
      s.snapshot,
      {
        source: s.d.sourceYearId,
        target: s.d.targetYearId,
        mapping: s.d.mapping,
        reason: s.d.reason,
        approvedBy: actor.userId,
      },
    ),
  ]);
  return { id, status: "Running" };
}
export async function processRollover(actor: Actor, id: string) {
  permit(actor, "settings.manage");
  permit(actor, "academics.manage");
  permit(actor, "fees.manage");
  const r = (await own(actor, "year_rollovers", id)) as RolloverRecord;
  if (r.status === "Completed") return { id, status: r.status, hasMore: false };
  const source = await own(actor, "academic_years", r.source_year_id);
  const mapping = z.record(z.string()).parse(JSON.parse(r.mapping)),
    target = await own(actor, "academic_years", r.target_year_id);
  if (!["Active", "Draft"].includes(target.status))
    throw new ApiError(
      409,
      "TARGET_YEAR_CLOSED",
      "Reopen the target year before resuming rollover.",
    );
  const students = await all<{
    student_id: string;
    section_id: string;
    roll_number: string | null;
  }>(
    "SELECT e.student_id,e.section_id,e.roll_number FROM enrollments e JOIN students s ON s.id=e.student_id AND s.institution_id=e.institution_id WHERE e.institution_id=? AND e.academic_year_id=? AND s.status='Active' AND NOT EXISTS(SELECT 1 FROM rollover_students rs WHERE rs.rollover_id=? AND rs.student_id=e.student_id) ORDER BY e.student_id LIMIT 5",
    [actor.institutionId, r.source_year_id, id],
  );
  let promoted = 0,
    carried = 0;
  for (const student of students) {
    const section = await own(actor, "sections", mapping[student.section_id]),
      prior = await one<{ section_id: string }>(
        "SELECT section_id FROM enrollments WHERE institution_id=? AND academic_year_id=? AND student_id=?",
        [actor.institutionId, r.target_year_id, student.student_id],
      );
    if (
      section.academic_year_id !== r.target_year_id ||
      (prior && prior.section_id !== section.id)
    )
      throw new ApiError(
        409,
        "PROMOTION_CONFLICT",
        "A student already has a different destination enrollment. Correct it before resuming.",
      );
    const dues = await all<Balance>(
      "SELECT id,invoice_id,outstanding_paise,title FROM installment_balances WHERE institution_id=? AND academic_year_id=? AND student_id=? AND outstanding_paise>0 ORDER BY due_date,id LIMIT 101",
      [actor.institutionId, r.source_year_id, student.student_id],
    );
    if (dues.length > 100)
      throw new ApiError(
        422,
        "ROLLOVER_BATCH_LIMIT",
        "This student has more than 100 unpaid installments. Contact accounts before continuing.",
      );
    const amount = dues.reduce((n, d) => n + d.outstanding_paise, 0),
      base = { institution_id: actor.institutionId, ...stamps(actor.userId) },
      invoiceId = amount ? uuid() : null,
      statements = [];
    if (!prior)
      statements.push(
        insert("enrollments", {
          id: uuid(),
          ...base,
          student_id: student.student_id,
          academic_year_id: r.target_year_id,
          section_id: section.id,
          roll_number: student.roll_number,
          clearance: "Pending",
        }),
      );
    // The immutable student checkpoint and all associated financial postings are
    // committed together. A resumed or concurrent batch cannot double-promote.
    statements.push(
      insert("rollover_students", {
        id: uuid(),
        institution_id: actor.institutionId,
        rollover_id: id,
        student_id: student.student_id,
        amount_paise: amount,
        target_invoice_id: invoiceId,
        source_snapshot: JSON.stringify(dues),
        created_at: now(),
      }),
    );
    if (amount && invoiceId) {
      const structureId = `rollover:${id}:${section.class_id}`,
        assignmentId = uuid(),
        installmentId = uuid();
      statements.push(
        stmt(
          "INSERT OR IGNORE INTO fee_structures(id,institution_id,academic_year_id,class_id,name,frequency,schedule,status,created_at,updated_at,created_by,updated_by) VALUES(?,?,?,?,?,'Annual',?,'System',?,?,?,?)",
          [
            structureId,
            actor.institutionId,
            r.target_year_id,
            section.class_id,
            "Opening dues · " + r.source_year_id,
            JSON.stringify([target.start_date]),
            now(),
            now(),
            actor.userId,
            actor.userId,
          ],
        ),
        insert("student_fee_assignments", {
          id: assignmentId,
          ...base,
          student_id: student.student_id,
          academic_year_id: r.target_year_id,
          structure_id: structureId,
          discount_paise: 0,
          scholarship_paise: 0,
          reason: "Approved balance carry-forward " + id,
        }),
        insert("invoices", {
          id: invoiceId,
          ...base,
          student_id: student.student_id,
          academic_year_id: r.target_year_id,
          assignment_id: assignmentId,
          gross_paise: amount,
          discount_paise: 0,
          scholarship_paise: 0,
          net_paise: amount,
          issued_date: target.start_date,
          due_date: target.start_date,
        }),
        insert("installments", {
          id: installmentId,
          ...base,
          invoice_id: invoiceId,
          student_id: student.student_id,
          academic_year_id: r.target_year_id,
          title: "Opening dues from previous year",
          amount_paise: amount,
          due_date: target.start_date,
          sort_order: 0,
        }),
      );
      for (const due of dues) {
        const adjustmentId = uuid();
        statements.push(
          insert("balance_carryforwards", {
            id: uuid(),
            institution_id: actor.institutionId,
            rollover_id: id,
            student_id: student.student_id,
            source_installment_id: due.id,
            target_invoice_id: invoiceId,
            amount_paise: due.outstanding_paise,
            created_at: now(),
          }),
          insert("fee_adjustments", {
            id: adjustmentId,
            ...base,
            student_id: student.student_id,
            academic_year_id: r.source_year_id,
            invoice_id: due.invoice_id,
            installment_id: due.id,
            kind: "Carry Forward",
            amount_paise: -due.outstanding_paise,
            reason: "Transferred to academic year " + r.target_year_id,
            approved_by: r.approved_by,
          }),
          insert("ledger_entries", {
            id: uuid(),
            ...base,
            student_id: student.student_id,
            academic_year_id: r.source_year_id,
            invoice_id: due.invoice_id,
            adjustment_id: adjustmentId,
            kind: "Rollover Out",
            description: "Receivable transferred to " + target.name,
            debit_paise: 0,
            credit_paise: due.outstanding_paise,
            entry_date: source.end_date,
          }),
        );
      }
      statements.push(
        insert("ledger_entries", {
          id: uuid(),
          ...base,
          student_id: student.student_id,
          academic_year_id: r.target_year_id,
          invoice_id: invoiceId,
          kind: "Opening Dues",
          description: "Opening receivable from previous academic year",
          debit_paise: amount,
          credit_paise: 0,
          entry_date: target.start_date,
        }),
      );
    }
    statements.push(
      audit(
        actor,
        "Promoted student and carried opening dues",
        "rollover_students",
        student.student_id,
        { yearId: r.source_year_id, sectionId: student.section_id },
        {
          yearId: r.target_year_id,
          sectionId: section.id,
          amountPaise: amount,
          rolloverId: id,
          approvedBy: r.approved_by,
        },
      ),
    );
    try {
      await batch(statements);
      promoted++;
      carried += amount;
    } catch (error) {
      if (
        !(await one(
          "SELECT id FROM rollover_students WHERE rollover_id=? AND student_id=?",
          [id, student.student_id],
        ))
      )
        throw error;
    }
  }
  const left = await one<{ count: number }>(
    "SELECT COUNT(*) count FROM enrollments e JOIN students s ON s.id=e.student_id AND s.institution_id=e.institution_id WHERE e.institution_id=? AND e.academic_year_id=? AND s.status='Active' AND NOT EXISTS(SELECT 1 FROM rollover_students rs WHERE rs.rollover_id=? AND rs.student_id=e.student_id)",
    [actor.institutionId, r.source_year_id, id],
  );
  if (!left?.count)
    await batch([
      stmt(
        "UPDATE year_rollovers SET status='Completed',updated_at=?,updated_by=? WHERE institution_id=? AND id=? AND status='Running'",
        [now(), actor.userId, actor.institutionId, id],
      ),
      audit(actor, "Completed academic rollover", "year_rollovers", id, null, {
        sourceYear: r.source_year_id,
        targetYear: r.target_year_id,
      }),
    ]);
  return {
    id,
    promoted,
    carriedPaise: carried,
    remaining: left?.count || 0,
    hasMore: !!left?.count,
    status: left?.count ? "Running" : "Completed",
  };
}
