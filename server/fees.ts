import { evaluateFeeRules, FeeRule } from "../lib/fee-rules";
import { safeMoney, splitMoney } from "../lib/money";
import { all, batch, insert, one, Row, stamps, today, uuid } from "./db";
import { Actor, ApiError, audit, own, permit } from "./security";
export { accrueLateFee, evaluateFeeRules } from "../lib/fee-rules";
export async function makeAssignment(
  actor: Actor,
  studentId: string,
  structureId: string,
  discount = 0,
  scholarship = 0,
  reason = "",
) {
  const structure = await own(actor, "fee_structures", structureId);
  const year = await own(actor, "academic_years", structure.academic_year_id);
  if (["Closed", "Archived"].includes(year.status))
    throw new ApiError(
      409,
      "YEAR_CLOSED",
      "Financial records cannot be added to a closed academic year.",
    );
  const enrollment = await one(
    "SELECT e.*,sec.class_id,sec.stream_id FROM enrollments e JOIN sections sec ON sec.id=e.section_id WHERE e.institution_id=? AND e.student_id=? AND e.academic_year_id=?",
    [actor.institutionId, studentId, structure.academic_year_id],
  );
  if (
    !enrollment ||
    enrollment.class_id !== structure.class_id ||
    (structure.section_id && enrollment.section_id !== structure.section_id) ||
    (structure.stream_id && enrollment.stream_id !== structure.stream_id)
  )
    throw new ApiError(
      409,
      "STRUCTURE_MISMATCH",
      "This fee structure does not apply to the student’s class or stream.",
    );
  if (
    await one(
      "SELECT id FROM student_fee_assignments WHERE institution_id=? AND student_id=? AND structure_id=?",
      [actor.institutionId, studentId, structureId],
    )
  )
    throw new ApiError(
      409,
      "ALREADY_ASSIGNED",
      "This fee structure has already been assigned.",
    );
  const items = await all(
    "SELECT si.*,c.name FROM fee_structure_items si JOIN fee_components c ON c.id=si.component_id WHERE si.institution_id=? AND si.structure_id=?",
    [actor.institutionId, structureId],
  );
  const gross = safeMoney(items.reduce((s, r) => s + r.amount_paise, 0));
  if (discount === 0 && scholarship === 0) {
    const automatic = await all(
      "SELECT * FROM benefits WHERE institution_id=? AND auto_apply=1 AND status='Active' AND (valid_until IS NULL OR valid_until>=?)",
      [actor.institutionId, today()],
    );
    const siblings = await one(
      "SELECT COUNT(DISTINCT sp2.student_id) count FROM student_parents sp JOIN student_parents sp2 ON sp2.parent_id=sp.parent_id AND sp2.institution_id=sp.institution_id JOIN enrollments e ON e.student_id=sp2.student_id AND e.institution_id=sp2.institution_id AND e.academic_year_id=? JOIN students s ON s.id=e.student_id AND s.institution_id=e.institution_id AND s.status='Active' WHERE sp.institution_id=? AND sp.student_id=?",
      [structure.academic_year_id, actor.institutionId, studentId],
    );
    const rules: FeeRule[] = automatic
      .sort((a, b) => a.id.localeCompare(b.id))
      .flatMap((b) => {
        const eligibility = /sibling/i.test(b.name + " " + b.eligibility)
          ? "Sibling"
          : /all enrolled students/i.test(b.eligibility)
            ? "All"
            : null;
        return eligibility
          ? [
              {
                id: b.id,
                name: b.name,
                kind: b.kind,
                eligibility,
                calculation: b.calculation,
                value: b.value,
                componentId: b.component_id,
              },
            ]
          : [];
      });
    const result = evaluateFeeRules(
      {
        items: items.map((i) => ({
          componentId: i.component_id,
          amountPaise: i.amount_paise,
        })),
        siblingCount: siblings?.count || 0,
      },
      rules,
    );
    discount = result.discount;
    scholarship = result.scholarship;
    if (result.applied.length)
      reason =
        "Automatic eligibility approved: " +
        result.applied.map((r) => r.name).join(", ");
  }
  if (discount + scholarship > gross)
    throw new ApiError(
      422,
      "DISCOUNT_TOO_LARGE",
      "Discounts and scholarships cannot exceed the fee.",
    );
  if ((discount > 0 || scholarship > 0) && reason.trim().length < 3)
    throw new ApiError(
      422,
      "REASON_REQUIRED",
      "Add an approval reason for the concession.",
    );
  const assignmentId = uuid(),
    invoiceId = uuid(),
    base = { institution_id: actor.institutionId, ...stamps(actor.userId) },
    academic_year_id = structure.academic_year_id,
    net = gross - discount - scholarship,
    schedule = JSON.parse(structure.schedule) as string[],
    amounts = splitMoney(net, schedule.length);
  const statements = [
    insert("student_fee_assignments", {
      id: assignmentId,
      ...base,
      student_id: studentId,
      academic_year_id,
      structure_id: structureId,
      discount_paise: discount,
      scholarship_paise: scholarship,
      reason,
    }),
    insert("invoices", {
      id: invoiceId,
      ...base,
      student_id: studentId,
      academic_year_id,
      assignment_id: assignmentId,
      gross_paise: gross,
      discount_paise: discount,
      scholarship_paise: scholarship,
      net_paise: net,
      issued_date: today(),
      due_date: schedule[0],
    }),
  ];
  for (const item of items)
    statements.push(
      insert("invoice_items", {
        id: uuid(),
        institution_id: actor.institutionId,
        invoice_id: invoiceId,
        component_id: item.component_id,
        name: item.name,
        amount_paise: item.amount_paise,
      }),
    );
  const installments = schedule.map((date, i) => ({
    id: uuid(),
    ...base,
    invoice_id: invoiceId,
    student_id: studentId,
    academic_year_id,
    title: `Installment ${i + 1}`,
    amount_paise: amounts[i],
    due_date: date,
    sort_order: i,
  }));
  installments.forEach((r) => statements.push(insert("installments", r)));
  const le = {
    ...base,
    student_id: studentId,
    academic_year_id,
    invoice_id: invoiceId,
    entry_date: today(),
  };
  statements.push(
    insert("ledger_entries", {
      id: uuid(),
      ...le,
      kind: "Fee",
      description: structure.name,
      debit_paise: gross,
      credit_paise: 0,
    }),
  );
  if (discount)
    statements.push(
      insert("ledger_entries", {
        id: uuid(),
        ...le,
        kind: "Discount",
        description: `Approved discount: ${reason}`,
        debit_paise: 0,
        credit_paise: discount,
      }),
    );
  if (scholarship)
    statements.push(
      insert("ledger_entries", {
        id: uuid(),
        ...le,
        kind: "Scholarship",
        description: `Approved scholarship: ${reason}`,
        debit_paise: 0,
        credit_paise: scholarship,
      }),
    );
  statements.push(
    audit(
      actor,
      "Assigned fees and generated invoice",
      "invoices",
      invoiceId,
      null,
      { structureId, studentId, gross, discount, scholarship, net },
    ),
  );
  return {
    statements,
    invoiceId,
    studentId,
    gross,
    discount,
    scholarship,
    net,
    installments,
  };
}
export async function applyAdjustment(actor: Actor, data: Row) {
  permit(actor, "fees.manage");
  const installment = await own(
      actor,
      "installment_balances",
      data.installmentId,
    ),
    year = await own(actor, "academic_years", installment.academic_year_id);
  if (["Closed", "Archived"].includes(year.status))
    throw new ApiError(409, "YEAR_CLOSED", "This academic year is closed.");
  const signed = safeMoney(data.amountPaise);
  if (!signed)
    throw new ApiError(422, "AMOUNT_REQUIRED", "Enter a nonzero adjustment.");
  if (signed < 0 && -signed > installment.outstanding_paise)
    throw new ApiError(
      422,
      "ADJUSTMENT_TOO_LARGE",
      "A concession cannot exceed the unpaid installment balance.",
    );
  const base = { institution_id: actor.institutionId, ...stamps(actor.userId) },
    id = uuid(),
    adjustment = {
      id,
      ...base,
      student_id: installment.student_id,
      academic_year_id: installment.academic_year_id,
      invoice_id: installment.invoice_id,
      installment_id: installment.id,
      component_id: data.componentId || null,
      benefit_id: data.benefitId || null,
      kind: data.kind,
      amount_paise: signed,
      reason: data.reason,
      approved_by: actor.userId,
    };
  if (data.componentId) await own(actor, "fee_components", data.componentId);
  if (data.benefitId) await own(actor, "benefits", data.benefitId);
  await batch([
    insert("fee_adjustments", adjustment),
    insert("ledger_entries", {
      id: uuid(),
      ...base,
      student_id: installment.student_id,
      academic_year_id: installment.academic_year_id,
      invoice_id: installment.invoice_id,
      adjustment_id: id,
      kind: data.kind,
      description: data.reason,
      debit_paise: Math.max(signed, 0),
      credit_paise: Math.max(-signed, 0),
      entry_date: today(),
    }),
    audit(
      actor,
      "Approved fee adjustment",
      "fee_adjustments",
      id,
      null,
      adjustment,
    ),
  ]);
  return { id };
}
