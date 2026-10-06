import { dashboard } from "./queries";
import { normalizedPermissions } from "../lib/permissions";
import { env } from "cloudflare:workers";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import QRCode from "qrcode";
import { apportionMoney, money } from "../lib/money";
import { csv, xlsx } from "../lib/tabular";
import { upiPaymentUri } from "../lib/upi";
import { all, one, Row } from "./db";
import { filters, financialProfile, listStudents, paging } from "./queries";
import { accessStudent, Actor, ApiError, own, permit } from "./security";
// Reporting grants read access only inside this report operation; it never
// widens a membership or authorizes a write/student API endpoint.
function reportReader(actor: Actor): Actor {
  permit(actor, "reports.view");
  return {
    ...actor,
    permissions: [
      ...new Set([
        ...(actor.permissions || normalizedPermissions(actor.role)),
        "students.view" as const,
        "fees.view" as const,
      ]),
    ],
  };
}
export async function accountingReport(actor: Actor, p: URLSearchParams) {
  return dashboard(reportReader(actor), p);
}
export async function reportData(
  actor: Actor,
  kind: string,
  p: URLSearchParams,
) {
  if (!(["PARENT", "STUDENT"].includes(actor.role) && kind === "ledger"))
    permit(actor, "reports.view");
  actor = reportReader(actor);
  const f = filters(actor, p),
    page = paging(p),
    w = [f.where],
    v = [...f.values];
  const dateRange = (alias: string, column: string) => {
    if (p.get("from")) {
      w.push(`date(${alias}.${column},'+5 hours','+30 minutes')>=?`);
      v.push(p.get("from"));
    }
    if (p.get("to")) {
      w.push(`date(${alias}.${column},'+5 hours','+30 minutes')<=?`);
      v.push(p.get("to"));
    }
  };
  let rows: Row[] = [],
    columns: { key: string; label: string; money?: boolean }[] = [];
  if (["outstanding", "defaulters"].includes(kind)) {
    const data = await listStudents(
      actor,
      new URLSearchParams({
        ...Object.fromEntries(p),
        outstanding: "1",
        page: "1",
        size: p.get("format") ? "10000" : "100",
      }),
      kind === "defaulters",
      p.get("format") ? 10000 : 100,
    );
    rows = data.rows;
    columns = [
      { key: "name", label: "Student" },
      { key: "admission_number", label: "Admission number" },
      { key: "class_name", label: "Class" },
      { key: "section_name", label: "Section" },
      { key: "parent_name", label: "Parent" },
      { key: "mobile", label: "Mobile" },
      { key: "total_paise", label: "Total fee", money: true },
      { key: "paid_paise", label: "Paid", money: true },
      { key: "outstanding_paise", label: "Outstanding", money: true },
      { key: "next_due_date", label: "Due date" },
    ];
    return {
      title: kind === "outstanding" ? "Outstanding fees" : "Defaulter report",
      rows,
      columns,
      total: data.total,
    };
  }
  const paymentBase = `FROM payments p JOIN students s ON s.id=p.student_id JOIN enrollments e ON e.student_id=p.student_id AND e.academic_year_id=p.academic_year_id AND e.institution_id=p.institution_id JOIN sections sec ON sec.id=e.section_id JOIN classes c ON c.id=sec.class_id LEFT JOIN streams st ON st.id=sec.stream_id`;
  if (
    [
      "collections",
      "cash",
      "online",
      "methods",
      "class",
      "section",
      "stream",
      "receipts",
    ].includes(kind)
  ) {
    dateRange("p", "paid_at");
    w.push("p.status IN ('Successful','Partially Refunded','Refunded')");
    if (kind === "cash") w.push("p.method='Cash'");
    if (kind === "online")
      w.push("p.method IN ('Payment Gateway','UPI','Card','Net Banking')");
    if (["methods", "class", "section", "stream"].includes(kind)) {
      const expr =
        kind === "methods"
          ? "p.method"
          : kind === "class"
            ? "c.name"
            : kind === "section"
              ? "c.name||' / '||sec.name"
              : "COALESCE(st.name,'School')";
      rows = await all(
        `SELECT ${expr} name,COUNT(*) transactions,SUM(p.amount_paise) amount_paise ${paymentBase} WHERE ${w.join(" AND ")} GROUP BY name ORDER BY amount_paise DESC`,
        v,
      );
      columns = [
        { key: "name", label: kind },
        { key: "transactions", label: "Transactions" },
        { key: "amount_paise", label: "Collected", money: true },
      ];
    } else {
      rows = await all(
        `SELECT p.*,s.name student_name,s.admission_number,c.name class_name,sec.name section_name,r.number receipt_number ${paymentBase} LEFT JOIN receipts r ON r.payment_id=p.id WHERE ${w.join(" AND ")} ORDER BY p.paid_at DESC LIMIT 5000`,
        v,
      );
      columns = [
        { key: "paid_at", label: "Payment date" },
        { key: "student_name", label: "Student" },
        { key: "class_name", label: "Class" },
        { key: "method", label: "Method" },
        { key: "reference", label: "Transaction reference" },
        { key: "receipt_number", label: "Receipt" },
        { key: "amount_paise", label: "Amount", money: true },
      ];
    }
  } else if (
    ["discounts", "scholarships", "latefees", "waivers"].includes(kind)
  ) {
    const k =
      kind === "discounts"
        ? "Discount"
        : kind === "scholarships"
          ? "Scholarship"
          : kind === "latefees"
            ? "Late Fee"
            : "Waiver";
    dateRange("a", "created_at");
    w.push("a.kind=?");
    v.push(k);
    rows = await all(
      `SELECT a.*,s.name student_name,c.name class_name FROM fee_adjustments a JOIN students s ON s.id=a.student_id JOIN enrollments e ON e.student_id=a.student_id AND e.academic_year_id=a.academic_year_id AND e.institution_id=a.institution_id JOIN sections sec ON sec.id=e.section_id JOIN classes c ON c.id=sec.class_id WHERE ${w.join(" AND ")} ORDER BY a.created_at DESC LIMIT 5000`,
      v,
    );
    if (kind === "discounts" || kind === "scholarships") {
      const col = kind === "discounts" ? "discount_paise" : "scholarship_paise";
      const inv = await all(
        `SELECT i.created_at,s.name student_name,c.name class_name,i.${col} amount_paise,'Initial approved benefit' reason FROM invoices i JOIN students s ON s.id=i.student_id JOIN enrollments e ON e.student_id=i.student_id AND e.academic_year_id=i.academic_year_id AND e.institution_id=i.institution_id JOIN sections sec ON sec.id=e.section_id JOIN classes c ON c.id=sec.class_id WHERE ${f.where} AND i.${col}>0 ${p.get("from") ? "AND substr(i.created_at,1,10)>=?" : ""} ${p.get("to") ? "AND substr(i.created_at,1,10)<=?" : ""}`,
        [
          ...f.values,
          ...(p.get("from") ? [p.get("from")] : []),
          ...(p.get("to") ? [p.get("to")] : []),
        ],
      );
      rows = [
        ...inv,
        ...rows.map((r) => ({ ...r, amount_paise: Math.abs(r.amount_paise) })),
      ];
    }
    columns = [
      { key: "created_at", label: "Date" },
      { key: "student_name", label: "Student" },
      { key: "class_name", label: "Class" },
      { key: "reason", label: "Reason" },
      { key: "amount_paise", label: "Amount", money: true },
    ];
  } else if (kind === "refunds") {
    dateRange("r", "created_at");
    rows = await all(
      `SELECT r.*,s.name student_name FROM refunds r JOIN students s ON s.id=r.student_id JOIN enrollments e ON e.student_id=r.student_id AND e.academic_year_id=r.academic_year_id AND e.institution_id=r.institution_id JOIN sections sec ON sec.id=e.section_id WHERE ${w.join(" AND ")} ORDER BY r.created_at DESC LIMIT 5000`,
      v,
    );
    columns = [
      { key: "created_at", label: "Date" },
      { key: "student_name", label: "Student" },
      { key: "reason", label: "Reason" },
      { key: "status", label: "Status" },
      { key: "amount_paise", label: "Amount", money: true },
    ];
  } else if (kind === "reconciliation") {
    const rw = ["r.institution_id=?"],
      rv: unknown[] = [actor.institutionId];
    if (p.get("year")) {
      rw.push("r.academic_year_id=?");
      rv.push(p.get("year"));
    }
    for (const [key, col] of [
      ["class", "class_id"],
      ["section", "id"],
      ["stream", "stream_id"],
      ["campus", "campus_id"],
    ]) {
      if (p.get(key)) {
        rw.push(`sec.${col}=?`);
        rv.push(p.get(key));
      }
    }
    if (p.get("from")) {
      rw.push("r.transaction_date>=?");
      rv.push(p.get("from"));
    }
    if (p.get("to")) {
      rw.push("r.transaction_date<=?");
      rv.push(p.get("to"));
    }
    rows = await all(
      `SELECT r.* FROM reconciliation_records r LEFT JOIN enrollments e ON e.student_id=r.student_id AND e.academic_year_id=r.academic_year_id AND e.institution_id=r.institution_id LEFT JOIN sections sec ON sec.id=e.section_id WHERE ${rw.join(" AND ")} ORDER BY r.transaction_date DESC LIMIT 5000`,
      rv,
    );
    columns = [
      { key: "transaction_date", label: "Date" },
      { key: "transaction_id", label: "Transaction" },
      { key: "amount_paise", label: "Amount", money: true },
      { key: "status", label: "Status" },
      { key: "notes", label: "Notes" },
    ];
  } else if (kind === "ledger") {
    const id = p.get("student");
    if (!id)
      throw new ApiError(
        422,
        "STUDENT_REQUIRED",
        "Select a student for the ledger report.",
      );
    await accessStudent(actor, id, p.get("year") || undefined);
    const profile = await financialProfile(actor, id, p);
    rows = profile.ledger.filter(
      (r) =>
        (!p.get("from") || r.entry_date >= p.get("from")!) &&
        (!p.get("to") || r.entry_date <= p.get("to")!),
    );
    columns = [
      { key: "entry_date", label: "Date" },
      { key: "description", label: "Description" },
      { key: "debit_paise", label: "Debit", money: true },
      { key: "credit_paise", label: "Credit", money: true },
      { key: "balance_paise", label: "Balance", money: true },
    ];
  } else if (kind === "components") {
    const items = await all(
      `SELECT it.invoice_id,it.name,it.amount_paise FROM invoice_items it JOIN invoices i ON i.id=it.invoice_id JOIN enrollments e ON e.student_id=i.student_id AND e.academic_year_id=i.academic_year_id AND e.institution_id=i.institution_id JOIN sections sec ON sec.id=e.section_id WHERE ${f.where} ORDER BY it.invoice_id,it.name,it.id`,
      f.values,
    );
    dateRange("p", "paid_at");
    const paid = await all(
        `SELECT pa.invoice_id,SUM(pa.amount_paise) amount_paise FROM payment_allocations pa JOIN payments p ON p.id=pa.payment_id JOIN enrollments e ON e.student_id=p.student_id AND e.academic_year_id=p.academic_year_id AND e.institution_id=p.institution_id JOIN sections sec ON sec.id=e.section_id WHERE ${w.join(" AND ")} AND p.status IN ('Successful','Partially Refunded','Refunded') GROUP BY pa.invoice_id`,
        v,
      ),
      paidMap = new Map(paid.map((r) => [r.invoice_id, r.amount_paise])),
      invoices = new Map<string, Row[]>(),
      groups = new Map<string, Row>();
    for (const item of items) {
      const list = invoices.get(item.invoice_id) || [];
      list.push(item);
      invoices.set(item.invoice_id, list);
    }
    for (const [id, list] of invoices) {
      const amount = paidMap.get(id) || 0,
        shares = amount
          ? apportionMoney(
              amount,
              list.map((r) => r.amount_paise),
            )
          : list.map(() => 0);
      list.forEach((item, index) => {
        const group = groups.get(item.name) || {
          name: item.name,
          expected_paise: 0,
          collected_paise: 0,
        };
        group.expected_paise += item.amount_paise;
        group.collected_paise += shares[index];
        groups.set(item.name, group);
      });
    }
    rows = [...groups.values()];
    columns = [
      { key: "name", label: "Fee component" },
      { key: "expected_paise", label: "Gross billed", money: true },
      { key: "collected_paise", label: "Allocated collections", money: true },
    ];
  } else
    throw new ApiError(404, "REPORT_NOT_FOUND", "Select a supported report.");
  return {
    title: (
      {
        collections: "Fee collection report",
        cash: "Cash collection report",
        online: "Online collection report",
        methods: "Payment methods",
        class: "Class-wise collection",
        section: "Section-wise collection",
        stream: "Stream-wise collection",
        receipts: "Receipt register",
        discounts: "Discount register",
        scholarships: "Scholarship register",
        latefees: "Late fee register",
        waivers: "Fee waiver register",
        refunds: "Refund report",
        reconciliation: "Reconciliation report",
        ledger: "Student ledger",
        components: "Fee components",
      } as Record<string, string>
    )[kind],
    rows: p.get("format")
      ? rows
      : rows.slice(page.offset, page.offset + page.size),
    columns,
    total: rows.length,
  };
}
export async function downloadReport(
  actor: Actor,
  kind: string,
  p: URLSearchParams,
) {
  permit(actor, "reports.export");
  const data = await reportData(actor, kind, p),
    format = p.get("format") || "csv",
    institution = await one("SELECT * FROM institutions WHERE id=?", [
      actor.institutionId,
    ]);
  const table = [
    data.columns.map((c) => c.label),
    ...data.rows.map((row) =>
      data.columns.map((c) =>
        c.money ? money(row[c.key], true) : (row[c.key] ?? ""),
      ),
    ),
  ];
  if (format === "csv")
    return attachment(csv(table), "text/csv;charset=utf-8", kind + ".csv");
  if (format === "xlsx")
    return attachment(
      xlsx(table),
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      kind + ".xlsx",
    );
  if (format === "pdf")
    return attachment(
      await renderPdf(institution!, data.title, table, [
        `Generated: ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}`,
        `Filters: ${
          [...p]
            .filter(([k]) => !["format", "size", "page"].includes(k))
            .map(([k, v]) => k + ": " + v)
            .join(" | ") || "All records"
        }`,
        `Records: ${data.total}`,
      ]),
      "application/pdf",
      kind + ".pdf",
    );
  throw new ApiError(422, "INVALID_FORMAT", "Select CSV, Excel or PDF.");
}
export function attachment(
  body: BodyInit | Uint8Array,
  type: string,
  name: string,
) {
  return new Response(body as BodyInit, {
    headers: {
      "Content-Type": type,
      "Content-Disposition": `attachment; filename="${name.replace(/[^a-zA-Z0-9._-]/g, "_")}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
const printable = (s: unknown) =>
  String(s ?? "")
    .replaceAll("₹", "Rs. ")
    .replaceAll("–", "-")
    .replaceAll("—", "-")
    .replaceAll("·", " | ")
    .replace(/[^\x20-\x7e\xa0-\xff]/g, "");
export async function renderPdf(
  institution: Row,
  title: string,
  table: unknown[][],
  details: string[],
  summary: string[] = [],
  upi?: string,
) {
  const pdf = await PDFDocument.create(),
    font = await pdf.embedFont(StandardFonts.Helvetica),
    bold = await pdf.embedFont(StandardFonts.HelveticaBold),
    navy = rgb(0.08, 0.13, 0.23),
    blue = rgb(0.2, 0.36, 0.95),
    muted = rgb(0.42, 0.47, 0.55);
  let page = pdf.addPage([595.28, 841.89]),
    y = 0,
    pageIndex = 0;
  let logo: any;
  if (institution.logo_key && env.BUCKET) {
    try {
      const object = await env.BUCKET.get(institution.logo_key);
      if (object)
        logo =
          object.httpMetadata?.contentType === "image/jpeg"
            ? await pdf.embedJpg(await object.arrayBuffer())
            : await pdf.embedPng(await object.arrayBuffer());
    } catch {}
  }
  const draw = (
    text: unknown,
    x: number,
    py: number,
    size = 10,
    b = false,
    color = navy,
    max = 510,
  ) => {
    let s = printable(text);
    while (s.length && font.widthOfTextAtSize(s, size) > max)
      s = s.slice(0, -1);
    page.drawText(s, { x, y: py, size, font: b ? bold : font, color });
  };
  const header = () => {
    pageIndex++;
    page.drawRectangle({ x: 0, y: 830, width: 595, height: 12, color: blue });
    if (logo) page.drawImage(logo, { x: 42, y: 748, width: 46, height: 46 });
    else {
      page.drawRectangle({ x: 42, y: 748, width: 44, height: 44, color: blue });
      draw(
        institution.name
          .split(" ")
          .map((w: string) => w[0])
          .join("")
          .slice(0, 3),
        48,
        765,
        14,
        true,
        rgb(1, 1, 1),
        36,
      );
    }
    draw(institution.name, 100, 780, 16, true);
    draw(institution.address, 100, 762, 9, false, muted, 445);
    draw(
      [institution.email, institution.phone].filter(Boolean).join(" | "),
      100,
      747,
      9,
      false,
      muted,
      445,
    );
    draw(title, 42, 704, 21, true);
    y = 680;
    for (const detail of details) {
      draw(detail, 42, y, 10, false, muted);
      y -= 17;
    }
    y -= 16;
    page.drawLine({
      start: { x: 42, y },
      end: { x: 553, y },
      thickness: 1,
      color: rgb(0.85, 0.88, 0.92),
    });
    y -= 24;
  };
  const footer = () => {
    draw("Sohan Soft Tech | " + institution.name, 42, 30, 8, false, muted);
    draw("Page " + pageIndex, 507, 30, 8, false, muted, 50);
  };
  header();
  const cols = table[0]?.length || 1,
    colWidth = 511 / cols;
  const headers = () => {
    page.drawRectangle({
      x: 42,
      y: y - 6,
      width: 511,
      height: 26,
      color: rgb(0.94, 0.96, 0.99),
    });
    (table[0] || []).forEach((v, i) =>
      draw(
        v,
        48 + i * colWidth,
        y + 3,
        Math.min(10, cols > 6 ? 8 : 10),
        true,
        navy,
        colWidth - 10,
      ),
    );
    y -= 34;
  };
  headers();
  for (let i = 1; i < table.length; i++) {
    if (y < 100) {
      footer();
      page = pdf.addPage([595.28, 841.89]);
      header();
      headers();
    }
    if (i % 2 === 0)
      page.drawRectangle({
        x: 42,
        y: y - 5,
        width: 511,
        height: 25,
        color: rgb(0.98, 0.985, 0.99),
      });
    table[i].forEach((v, j) =>
      draw(
        v,
        48 + j * colWidth,
        y + 3,
        cols > 6 ? 8 : 10,
        false,
        navy,
        colWidth - 10,
      ),
    );
    y -= 26;
  }
  y -= 20;
  for (const line of summary) {
    if (y < 90) {
      footer();
      page = pdf.addPage([595.28, 841.89]);
      header();
    }
    draw(line, 42, y, 12, true);
    y -= 23;
  }
  if (upi) {
    if (y < 215) {
      footer();
      page = pdf.addPage([595.28, 841.89]);
      header();
    }
    const matrix = QRCode.create(upi, { errorCorrectionLevel: "M" }).modules,
      unit = 124 / (matrix.size + 8),
      left = 42,
      bottom = y - 140;
    page.drawRectangle({
      x: left,
      y: bottom,
      width: 124,
      height: 124,
      color: rgb(1, 1, 1),
    });
    for (let r = 0; r < matrix.size; r++)
      for (let c = 0; c < matrix.size; c++)
        if (matrix.get(r, c))
          page.drawRectangle({
            x: left + (c + 4) * unit,
            y: bottom + (matrix.size + 3 - r) * unit,
            width: unit,
            height: unit,
            color: rgb(0, 0, 0),
          });
    draw("Scan to pay the outstanding demand", 182, y - 35, 11, true);
    draw("UPI payment request | INR", 182, y - 55, 9, false, muted, 360);
    draw(
      "Share the bank reference with the accounts office.",
      182,
      y - 75,
      9,
      false,
      muted,
      360,
    );
    draw(
      "Payment is recorded only after verification.",
      182,
      y - 92,
      9,
      false,
      muted,
      360,
    );
    y -= 155;
  }
  footer();
  pdf.setTitle(title);
  pdf.setAuthor(institution.name);
  return pdf.save();
}
export async function documentPdf(
  actor: Actor,
  kind: string,
  id: string,
  format = "a4",
) {
  let record: Row,
    student: Row,
    table: unknown[][],
    details: string[],
    summary: string[];
  const institution = await one("SELECT * FROM institutions WHERE id=?", [
    actor.institutionId,
  ]);
  if (kind === "invoice") {
    record = await own(actor, "invoice_balances", id);
    await accessStudent(actor, record.student_id, record.academic_year_id);
    student = (await one(
      "SELECT name,admission_number FROM students WHERE id=?",
      [record.student_id],
    )) as Row;
    const year = await one("SELECT name FROM academic_years WHERE id=?", [
        record.academic_year_id,
      ]),
      items = await all(
        "SELECT name,amount_paise FROM invoice_items WHERE institution_id=? AND invoice_id=?",
        [actor.institutionId, id],
      ),
      adjustments = await all(
        "SELECT kind,amount_paise FROM fee_adjustments WHERE institution_id=? AND invoice_id=?",
        [actor.institutionId, id],
      );
    table = [
      ["Fee component", "Amount (INR)"],
      ...items.map((i) => [i.name, money(i.amount_paise, true)]),
      ["Discount", money(-record.discount_paise, true)],
      ["Scholarship", money(-record.scholarship_paise, true)],
      ...adjustments.map((a) => [a.kind, money(a.amount_paise, true)]),
    ];
    details = [
      record.number,
      "Student: " + student.name + " | Admission: " + student.admission_number,
      "Academic year: " +
        year!.name +
        " | Invoice date: " +
        record.issued_date +
        " | Due: " +
        record.due_date,
    ];
    summary = [
      "Total: " + money(record.total_paise, true),
      "Paid: " + money(record.paid_paise, true),
      "Balance: " + money(record.outstanding_paise, true),
    ];
  } else if (kind === "receipt") {
    record = await own(actor, "receipts", id);
    const payment = await own(actor, "payments", record.payment_id);
    await accessStudent(actor, payment.student_id, payment.academic_year_id);
    student = (await one(
      "SELECT name,admission_number FROM students WHERE id=?",
      [payment.student_id],
    )) as Row;
    const year = await one("SELECT name FROM academic_years WHERE id=?", [
        payment.academic_year_id,
      ]),
      alloc = await all(
        "SELECT i.title,a.amount_paise,i.due_date FROM payment_allocations a JOIN installments i ON i.id=a.installment_id WHERE a.institution_id=? AND a.payment_id=?",
        [actor.institutionId, payment.id],
      ),
      balance = await one(
        "SELECT outstanding_paise FROM student_balances WHERE institution_id=? AND student_id=? AND academic_year_id=?",
        [actor.institutionId, payment.student_id, payment.academic_year_id],
      ),
      collector = await one("SELECT name FROM users WHERE id=?", [
        record.created_by,
      ]);
    table = [
      ["Installment", "Due date", "Paid (INR)"],
      ...alloc.map((a) => [a.title, a.due_date, money(a.amount_paise, true)]),
    ];
    details = [
      record.number,
      "Student: " + student.name + " | Admission: " + student.admission_number,
      "Academic year: " +
        year!.name +
        " | Payment date: " +
        payment.paid_at.slice(0, 10),
      "Method: " +
        payment.method +
        " | Reference: " +
        (payment.reference || payment.gateway_transaction_id || payment.id),
      "Collected by: " + (collector?.name || record.created_by),
    ];
    summary = [
      "Amount received: " + money(payment.amount_paise, true),
      "Current balance: " + money(balance?.outstanding_paise, true),
    ];
  } else throw new ApiError(404, "NOT_FOUND", "Document not found.");
  const enrollment = await one(
    "SELECT c.name class_name,sec.name section_name,st.name stream_name,par.guardian_name parent_name FROM enrollments e JOIN sections sec ON sec.id=e.section_id JOIN classes c ON c.id=sec.class_id LEFT JOIN streams st ON st.id=sec.stream_id LEFT JOIN student_parents sp ON sp.student_id=e.student_id AND sp.is_primary=1 LEFT JOIN parents par ON par.id=sp.parent_id WHERE e.institution_id=? AND e.student_id=? AND e.academic_year_id=?",
    [
      actor.institutionId,
      student === undefined
        ? ""
        : kind === "invoice"
          ? record.student_id
          : (await own(actor, "payments", record.payment_id)).student_id,
      record.academic_year_id,
    ],
  );
  if (enrollment)
    details.push(
      "Class: " +
        enrollment.class_name +
        " " +
        enrollment.section_name +
        (enrollment.stream_name ? " | " + enrollment.stream_name : "") +
        " | Parent: " +
        (enrollment.parent_name || ""),
    );
  if (institution!.gstin) details.push("GSTIN: " + institution!.gstin);
  if (
    !["a4", "thermal"].includes(format) ||
    (format === "thermal" && kind !== "receipt")
  )
    throw new ApiError(422, "INVALID_FORMAT", "Choose A4 or an 80mm receipt.");
  const settings = JSON.parse(institution!.settings || "{}");
  const upi =
    kind === "invoice" && record.outstanding_paise > 0 && settings.upi?.payeeId
      ? upiPaymentUri(
          settings.upi.payeeId,
          settings.upi.payeeName || institution!.name,
          record.outstanding_paise,
          record.number,
        )
      : undefined;
  const content =
    format === "thermal"
      ? await thermalReceiptPdf(institution!, table, details, summary)
      : await renderPdf(
          institution!,
          kind === "invoice" ? "Fee invoice" : "Payment receipt",
          table,
          details,
          summary,
          upi,
        );
  return attachment(
    content,
    "application/pdf",
    record.number + (format === "thermal" ? "-80mm" : "") + ".pdf",
  );
}

export async function thermalReceiptPdf(
  institution: Row,
  table: unknown[][],
  details: string[],
  summary: string[],
) {
  const pdf = await PDFDocument.create(),
    font = await pdf.embedFont(StandardFonts.Helvetica),
    bold = await pdf.embedFont(StandardFonts.HelveticaBold),
    width = (80 * 72) / 25.4;
  const wrap = (value: unknown, size = 9) => {
    let text = printable(value),
      lines: string[] = [];
    while (text.length) {
      let length = text.length;
      while (
        length > 1 &&
        font.widthOfTextAtSize(text.slice(0, length), size) > width - 24
      )
        length--;
      lines.push(text.slice(0, length));
      text = text.slice(length);
    }
    return lines;
  };
  const lines: { text: string; bold?: boolean; size?: number }[] = [
    ...wrap(institution.name, 12).map((text) => ({
      text,
      bold: true,
      size: 12,
    })),
    ...wrap(institution.address).map((text) => ({ text })),
    { text: "PAYMENT RECEIPT", bold: true },
    { text: "" },
    ...details.flatMap((d) => wrap(d).map((text) => ({ text }))),
    { text: "------------------------------------------" },
    ...table
      .slice(1)
      .flatMap((row) => wrap(row.join(" | ")).map((text) => ({ text }))),
    { text: "------------------------------------------" },
    ...summary.flatMap((d) => wrap(d).map((text) => ({ text, bold: true }))),
    { text: "" },
    { text: "Sohan Soft Tech | Retain for your records" },
  ];
  const height = Math.max(
      280,
      lines.reduce((n, l) => n + (l.size || 9) + 5, 36),
    ),
    page = pdf.addPage([width, height]);
  let y = height - 20;
  for (const line of lines) {
    page.drawText(line.text, {
      x: 12,
      y,
      font: line.bold ? bold : font,
      size: line.size || 9,
    });
    y -= (line.size || 9) + 5;
  }
  pdf.setTitle("80mm payment receipt");
  pdf.setAuthor(institution.name);
  return pdf.save();
}
