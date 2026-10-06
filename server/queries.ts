import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../db";
import {
  adjustments as feeAdjustments,
  notifications as notificationTable,
} from "../db/schema";
import { all, one, Row, today } from "./db";
import { journalForStudent } from "./journal";
import { Actor, ApiError, hasPermission, permit } from "./security";
import { tenantIdFor } from "./tenant-context";
const toSqlRow = (r: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(r).map(([k, v]) => [
      k.replace(/[A-Z]/g, (c) => "_" + c.toLowerCase()),
      v,
    ]),
  );
export function filters(actor: Actor, params: URLSearchParams, alias = "e") {
  const where = [`${alias}.institution_id=?`],
    values: unknown[] = [tenantIdFor(actor)];
  for (const [query, column] of [
    ["year", "academic_year_id"],
    ["section", "section_id"],
  ] as const) {
    const v = params.get(query);
    if (v) {
      where.push(`${alias}.${column}=?`);
      values.push(v);
    }
  }
  if (params.get("class")) {
    where.push("sec.class_id=?");
    values.push(params.get("class"));
  }
  if (params.get("stream")) {
    where.push("sec.stream_id=?");
    values.push(params.get("stream"));
  }
  if (params.get("campus")) {
    where.push("sec.campus_id=?");
    values.push(params.get("campus"));
  }
  if (params.get("parent")) {
    where.push(
      `EXISTS(SELECT 1 FROM student_parents sp WHERE sp.institution_id=${alias}.institution_id AND sp.student_id=${alias}.student_id AND sp.parent_id=?)`,
    );
    values.push(params.get("parent"));
  }
  if (actor.role === "TEACHER") {
    where.push(`${alias}.section_id=?`);
    values.push(actor.sectionId || "no-section");
  }
  if (actor.role === "PARENT") {
    where.push(
      `EXISTS (SELECT 1 FROM student_parents sp WHERE sp.institution_id=${alias}.institution_id AND sp.student_id=${alias}.student_id AND sp.parent_id=?)`,
    );
    values.push(actor.parentId || "no-parent");
  }
  if (actor.role === "STUDENT") {
    where.push(`${alias}.student_id=?`);
    values.push(actor.studentId || "no-student");
  }
  return { where: where.join(" AND "), values };
}
export function paging(p: URLSearchParams) {
  const page = Math.max(1, parseInt(p.get("page") || "1") || 1),
    size = Math.min(100, Math.max(1, parseInt(p.get("size") || "15") || 15));
  return { page, size, offset: (page - 1) * size };
}
export const studentJoin = `FROM students s JOIN enrollments e ON e.student_id=s.id AND e.institution_id=s.institution_id JOIN sections sec ON sec.id=e.section_id AND sec.institution_id=e.institution_id JOIN classes c ON c.id=sec.class_id LEFT JOIN streams st ON st.id=sec.stream_id JOIN academic_years ay ON ay.id=e.academic_year_id LEFT JOIN student_parents sp ON sp.student_id=s.id AND sp.institution_id=s.institution_id AND sp.is_primary=1 LEFT JOIN parents par ON par.id=sp.parent_id`;
export const studentCols = `s.*,e.id enrollment_id,e.roll_number,e.clearance,e.academic_year_id,ay.name academic_year,sec.id section_id,sec.name section_name,sec.campus_id,c.id class_id,c.name class_name,st.name stream_name,st.id stream_id,par.id parent_id,par.guardian_name parent_name,par.mobile,par.email parent_email,COALESCE(fs.total_paise,0) total_paise,COALESCE(fs.paid_paise,0) paid_paise,COALESCE(fs.outstanding_paise,0) outstanding_paise,COALESCE(fs.overdue_paise,0) overdue_paise,fs.next_due_date`;
export const financialJoin = `LEFT JOIN student_balances fs ON fs.student_id=s.id AND fs.institution_id=s.institution_id AND fs.academic_year_id=e.academic_year_id`;
export async function listStudents(
  actor: Actor,
  p: URLSearchParams,
  overdue = false,
  maximumSize = 100,
) {
  permit(actor, "students.view");
  const f = filters(actor, p),
    page = paging(p),
    w = [f.where],
    v = [...f.values];
  if (maximumSize > 100) {
    page.size = Math.min(
      maximumSize,
      Math.max(1, parseInt(p.get("size") || "100") || 100),
    );
    page.offset = (page.page - 1) * page.size;
  }
  if (p.get("q")) {
    w.push(
      "(s.name LIKE ? OR s.admission_number LIKE ? OR s.id=? OR par.mobile LIKE ?)",
    );
    v.push(`%${p.get("q")}%`, `%${p.get("q")}%`, p.get("q"), `%${p.get("q")}%`);
  }
  if (p.get("status")) {
    w.push("s.status=?");
    v.push(p.get("status"));
  }
  if (
    !hasPermission(actor, "fees.view") &&
    (overdue || p.get("outstanding") || p.get("minAmount"))
  )
    permit(actor, "fees.view");
  if (overdue) w.push("fs.overdue_paise>0");
  else if (p.get("outstanding") === "1") w.push("fs.outstanding_paise>0");
  if (p.get("minAmount")) {
    w.push("fs.outstanding_paise>=?");
    v.push(Number(p.get("minAmount")) * 100);
  }
  if (p.has("minDays")) {
    permit(actor, "fees.view");
    const minimum = Number(p.get("minDays")),
      maximum = p.has("maxDays") ? Number(p.get("maxDays")) : 100000;
    if (
      !Number.isInteger(minimum) ||
      !Number.isInteger(maximum) ||
      minimum < 0 ||
      maximum < minimum ||
      maximum > 100000
    )
      throw new ApiError(
        422,
        "INVALID_AGING_RANGE",
        "Choose a valid overdue age range.",
      );
    w.push(
      "EXISTS(SELECT 1 FROM installment_balances ib WHERE ib.institution_id=e.institution_id AND ib.student_id=e.student_id AND ib.academic_year_id=e.academic_year_id AND ib.outstanding_paise>0 AND ib.due_date<? AND CAST(julianday(?)-julianday(ib.due_date) AS INTEGER) BETWEEN ? AND ?)",
    );
    v.push(today(), today(), minimum, maximum);
  }
  const sqlWhere = w.join(" AND ");
  const total = await one(
    `SELECT COUNT(*) total ${studentJoin} ${financialJoin} WHERE ${sqlWhere}`,
    v,
  );
  const rows = await all(
    `SELECT ${studentCols} ${studentJoin} ${financialJoin} WHERE ${sqlWhere} ORDER BY ${overdue ? "fs.overdue_paise DESC," : "s.name,"} s.id LIMIT ? OFFSET ?`,
    [...v, page.size, page.offset],
  );
  if (!hasPermission(actor, "fees.view"))
    rows.forEach((r) => {
      for (const k of [
        "total_paise",
        "paid_paise",
        "outstanding_paise",
        "overdue_paise",
        "next_due_date",
      ])
        delete r[k];
    });
  return { rows, total: total?.total || 0, ...page };
}
export async function dashboard(actor: Actor, p: URLSearchParams) {
  permit(actor, "finance");
  const f = filters(actor, p),
    v = [...f.values];
  const base = `FROM enrollments e JOIN sections sec ON sec.id=e.section_id LEFT JOIN student_balances fs ON fs.student_id=e.student_id AND fs.academic_year_id=e.academic_year_id AND fs.institution_id=e.institution_id WHERE ${f.where}`;
  const kpi = await one(
    `SELECT COUNT(*) students,COALESCE(SUM(fs.total_paise),0) expected,COALESCE(SUM(fs.paid_paise),0) collected,COALESCE(SUM(fs.outstanding_paise),0) outstanding,COALESCE(SUM(fs.overdue_paise),0) overdue,SUM(CASE WHEN fs.overdue_paise>0 THEN 1 ELSE 0 END) defaulters ${base}`,
    v,
  );
  const payWhere = [
      f.where,
      `p.status IN ('Successful','Partially Refunded','Refunded')`,
    ],
    pv = [...v];
  if (p.get("from")) {
    payWhere.push("date(p.paid_at,'+5 hours','+30 minutes')>=?");
    pv.push(p.get("from"));
  }
  if (p.get("to")) {
    payWhere.push("date(p.paid_at,'+5 hours','+30 minutes')<=?");
    pv.push(p.get("to"));
  }
  const payBase = `FROM payments p JOIN enrollments e ON e.student_id=p.student_id AND e.academic_year_id=p.academic_year_id AND e.institution_id=p.institution_id JOIN sections sec ON sec.id=e.section_id WHERE ${payWhere.join(" AND ")}`;
  const day = today();
  const totals = await one(
    `SELECT COALESCE(SUM(CASE WHEN date(p.paid_at,'+5 hours','+30 minutes')=? THEN p.amount_paise ELSE 0 END),0) today,COALESCE(SUM(CASE WHEN strftime('%Y-%m',p.paid_at,'+5 hours','+30 minutes')=? THEN p.amount_paise ELSE 0 END),0) month,COUNT(*) payment_count ${payBase}`,
    [day, day.slice(0, 7), ...pv],
  );
  const refunds = await one(
    `SELECT COALESCE(SUM(r.amount_paise),0) refunds FROM refunds r JOIN enrollments e ON e.student_id=r.student_id AND e.academic_year_id=r.academic_year_id AND e.institution_id=r.institution_id JOIN sections sec ON sec.id=e.section_id WHERE ${f.where} AND r.status='Processed'`,
    v,
  );
  const pending = await one(
    `SELECT COUNT(*) pending FROM payments p JOIN enrollments e ON e.student_id=p.student_id AND e.academic_year_id=p.academic_year_id AND e.institution_id=p.institution_id JOIN sections sec ON sec.id=e.section_id WHERE ${f.where} AND p.status IN ('Pending','Initiated','Processing')`,
    v,
  );
  const group = p.get("group") || "month",
    expr =
      group === "day"
        ? "date(p.paid_at,'+5 hours','+30 minutes')"
        : group === "week"
          ? "strftime('%Y-W%W',p.paid_at,'+5 hours','+30 minutes')"
          : "strftime('%Y-%m',p.paid_at,'+5 hours','+30 minutes')";
  const collection = await all(
    `SELECT ${expr} period,SUM(p.amount_paise) amount ${payBase} GROUP BY period ORDER BY period`,
    pv,
  );
  const methods = await all(
    `SELECT p.method name,SUM(p.amount_paise) value,COUNT(*) count ${payBase} GROUP BY p.method ORDER BY value DESC`,
    pv,
  );
  const byClass = await all(
    `SELECT c.name name,COUNT(*) students,COALESCE(SUM(fs.total_paise),0) expected,COALESCE(SUM(fs.paid_paise),0) collected FROM enrollments e JOIN sections sec ON sec.id=e.section_id JOIN classes c ON c.id=sec.class_id LEFT JOIN student_balances fs ON fs.student_id=e.student_id AND fs.academic_year_id=e.academic_year_id AND fs.institution_id=e.institution_id WHERE ${f.where} GROUP BY c.id ORDER BY c.sort_order`,
    v,
  );
  const recent = await all(
    `SELECT p.*,s.name student_name,s.admission_number,c.name class_name,sec.name section_name,r.number receipt_number,r.id receipt_id FROM payments p JOIN students s ON s.id=p.student_id JOIN enrollments e ON e.student_id=p.student_id AND e.academic_year_id=p.academic_year_id AND e.institution_id=p.institution_id JOIN sections sec ON sec.id=e.section_id JOIN classes c ON c.id=sec.class_id LEFT JOIN receipts r ON r.payment_id=p.id WHERE ${f.where} ORDER BY p.paid_at DESC LIMIT 6`,
    v,
  );
  const attention = await listStudents(
    actor,
    new URLSearchParams({ ...Object.fromEntries(p), size: "5" }),
    true,
  );
  const discounts = await one(
    `SELECT COALESCE(SUM(i.discount_paise),0) discounts,COALESCE(SUM(i.scholarship_paise),0) scholarships FROM invoices i JOIN enrollments e ON e.student_id=i.student_id AND e.academic_year_id=i.academic_year_id AND e.institution_id=i.institution_id JOIN sections sec ON sec.id=e.section_id WHERE ${f.where}`,
    v,
  );
  const adjustments = await all(
    `SELECT a.kind,COALESCE(SUM(a.amount_paise),0) amount FROM fee_adjustments a JOIN enrollments e ON e.student_id=a.student_id AND e.academic_year_id=a.academic_year_id AND e.institution_id=a.institution_id JOIN sections sec ON sec.id=e.section_id WHERE ${f.where} GROUP BY a.kind`,
    v,
  );
  const agingFilters = [f.where, "ib.outstanding_paise>0", "ib.due_date<?"],
    agingValues = [...v, day];
  if (p.get("from")) {
    agingFilters.push("ib.due_date>=?");
    agingValues.push(p.get("from")!);
  }
  if (p.get("to")) {
    agingFilters.push("ib.due_date<=?");
    agingValues.push(p.get("to")!);
  }
  const ages = await all(
    `SELECT CAST(julianday(?)-julianday(ib.due_date) AS INTEGER) days,SUM(ib.outstanding_paise) amount FROM installment_balances ib JOIN enrollments e ON e.student_id=ib.student_id AND e.academic_year_id=ib.academic_year_id AND e.institution_id=ib.institution_id JOIN sections sec ON sec.id=e.section_id WHERE ${agingFilters.join(" AND ")} GROUP BY days`,
    [day, ...agingValues],
  );
  const aging = [
    { name: "0–30 days", minDays: 0, maxDays: 30 },
    { name: "31–60 days", minDays: 31, maxDays: 60 },
    { name: "61–90 days", minDays: 61, maxDays: 90 },
    { name: "91+ days", minDays: 91, maxDays: 100000 },
  ].map((bucket) => ({
    ...bucket,
    amount: ages
      .filter((r) => r.days >= bucket.minDays && r.days <= bucket.maxDays)
      .reduce((sum, r) => sum + r.amount, 0),
  }));
  const currentYear = p.get("year")
    ? await one(
        "SELECT * FROM academic_years WHERE institution_id=? AND id=?",
        [actor.institutionId, p.get("year")],
      )
    : null;
  const previousYear = currentYear
    ? await one(
        "SELECT * FROM academic_years WHERE institution_id=? AND start_date<? ORDER BY start_date DESC LIMIT 1",
        [actor.institutionId, currentYear.start_date],
      )
    : null;
  let comparison: Row | null = null;
  if (previousYear) {
    const previousParams = new URLSearchParams(p);
    previousParams.set("year", previousYear.id);
    if (p.get("section")) {
      const sec = await one(
        "SELECT * FROM sections WHERE institution_id=? AND id=?",
        [actor.institutionId, p.get("section")],
      );
      const previousSection = sec
        ? await one(
            "SELECT id FROM sections WHERE institution_id=? AND academic_year_id=? AND class_id=? AND name=? AND campus_id=? AND COALESCE(stream_id,'')=COALESCE(?,'')",
            [
              actor.institutionId,
              previousYear.id,
              sec.class_id,
              sec.name,
              sec.campus_id,
              sec.stream_id,
            ],
          )
        : null;
      previousParams.set(
        "section",
        previousSection?.id || "no-matching-section",
      );
    }
    const prior = filters(actor, previousParams);
    const previous = await one(
      `SELECT COUNT(*) students,COALESCE(SUM(fs.total_paise),0) expected,COALESCE(SUM(fs.paid_paise),0) collected,COALESCE(SUM(fs.outstanding_paise),0) outstanding,COALESCE(SUM(fs.overdue_paise),0) overdue FROM enrollments e JOIN sections sec ON sec.id=e.section_id LEFT JOIN student_balances fs ON fs.student_id=e.student_id AND fs.academic_year_id=e.academic_year_id AND fs.institution_id=e.institution_id WHERE ${prior.where}`,
      prior.values,
    );
    comparison = {
      label: previousYear.name,
      previous,
      deltas: Object.fromEntries(
        ["expected", "collected", "outstanding", "overdue"].map((key) => [
          key,
          previous?.[key]
            ? Math.round(
                (((kpi?.[key] || 0) - previous[key]) * 10000) / previous[key],
              ) / 100
            : null,
        ]),
      ),
    };
  }
  return {
    kpi: {
      ...kpi,
      ...totals,
      ...refunds,
      ...pending,
      ...discounts,
      collection_rate: kpi?.expected
        ? Math.round((kpi.collected / kpi.expected) * 10000) / 100
        : 0,
    },
    aging,
    comparison,
    collection,
    methods,
    byClass,
    recent,
    attention: attention.rows,
    adjustments,
  };
}
export async function financialProfile(
  actor: Actor,
  id: string,
  p: URLSearchParams,
) {
  const f = filters(actor, p);
  const record = await one(
    `SELECT ${studentCols} ${studentJoin} ${financialJoin} WHERE ${f.where} AND s.id=? ORDER BY ay.start_date DESC LIMIT 1`,
    [...f.values, id],
  );
  if (!record)
    throw new ApiError(
      404,
      "NOT_FOUND",
      "Student could not be found in the selected academic year.",
    );
  const v = [actor.institutionId, id, record.academic_year_id];
  if (!hasPermission(actor, "fees.view")) {
    for (const k of [
      "total_paise",
      "paid_paise",
      "outstanding_paise",
      "overdue_paise",
      "next_due_date",
    ])
      delete record[k];
    return {
      student: record,
      installments: [],
      payments: [],
      invoices: [],
      ledger: [],
      adjustments: [],
      notifications: [],
    };
  }
  const installments = await all(
    "SELECT * FROM installment_balances WHERE institution_id=? AND student_id=? AND academic_year_id=? ORDER BY due_date,sort_order",
    v,
  );
  const payments = await all(
    "SELECT p.*,r.id receipt_id,r.number receipt_number,COALESCE((SELECT SUM(amount_paise) FROM refunds rf WHERE rf.payment_id=p.id AND rf.status='Processed'),0) refunded_paise FROM payments p LEFT JOIN receipts r ON r.payment_id=p.id WHERE p.institution_id=? AND p.student_id=? AND p.academic_year_id=? ORDER BY p.paid_at DESC LIMIT 100",
    v,
  );
  const invoices = await all(
    "SELECT * FROM invoice_balances WHERE institution_id=? AND student_id=? AND academic_year_id=? ORDER BY created_at",
    v,
  );
  const ledger = await all(
    "SELECT *,SUM(debit_paise-credit_paise) OVER(ORDER BY entry_date,created_at,rowid ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) balance_paise FROM ledger_entries WHERE institution_id=? AND student_id=? AND academic_year_id=? ORDER BY entry_date,created_at,rowid LIMIT 500",
    v,
  );
  const items = await all(
    "SELECT it.* FROM invoice_items it JOIN invoices i ON i.id=it.invoice_id WHERE i.institution_id=? AND i.student_id=? AND i.academic_year_id=?",
    v,
  );
  const adjustments = (
    await getDb().select(feeAdjustments, {
      where: and(
        eq(feeAdjustments.studentId, id),
        eq(feeAdjustments.academicYearId, record.academic_year_id),
      ),
      orderBy: desc(feeAdjustments.createdAt),
      limit: 100,
    })
  ).map(toSqlRow);
  const notifications = (
    await getDb().select(notificationTable, {
      where: and(
        eq(notificationTable.studentId, id),
        eq(notificationTable.academicYearId, record.academic_year_id),
      ),
      orderBy: desc(notificationTable.createdAt),
      limit: 50,
    })
  ).map(toSqlRow);
  return {
    student: record,
    installments,
    payments,
    invoices,
    ledger,
    journal: await journalForStudent(actor, id, record.academic_year_id),
    items,
    adjustments,
    notifications,
  };
}
