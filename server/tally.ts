import { z } from "zod";
import { TallyPosting, TallyVoucher, tallyXml } from "../lib/tally";
import { all, one } from "./db";
import { attachment } from "./reports";
import { Actor, ApiError, permit, sha256 } from "./security";
interface Event {
  kind: string;
  id: string;
  event_type: string;
  entry_date: string;
  description: string;
  debit_account: string;
  credit_account: string;
  amount_paise: number;
  invoice_id: string | null;
  student_name: string;
  admission_number: string;
}
export async function tallyExport(actor: Actor, p: URLSearchParams) {
  permit(actor, "reports.export");
  const params = z
    .object({
      year: z.string().min(1),
      from: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
      to: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
    })
    .parse({
      year: p.get("year"),
      from: p.get("from") || undefined,
      to: p.get("to") || undefined,
    });
  const values = [
    actor.institutionId,
    params.year,
    params.from || "2000-01-01",
    params.to || "2100-12-31",
  ];
  const pending = await one<{ count: number }>(
    "SELECT COUNT(*) count FROM ledger_entries l WHERE l.institution_id=? AND l.academic_year_id=? AND l.entry_date BETWEEN ? AND ? AND l.debit_paise+l.credit_paise>0 AND NOT EXISTS(SELECT 1 FROM journal_events j WHERE j.ledger_entry_id=l.id)",
    values,
  );
  if (pending?.count)
    throw new ApiError(
      409,
      "JOURNAL_BACKFILL_REQUIRED",
      "Complete the journal backfill before exporting this period.",
    );
  const events = await all<Event>(
    "SELECT j.*,l.kind,l.invoice_id,s.name student_name,s.admission_number FROM journal_events j JOIN ledger_entries l ON l.id=j.ledger_entry_id AND l.institution_id=j.institution_id JOIN students s ON s.id=j.student_id AND s.institution_id=j.institution_id WHERE j.institution_id=? AND j.academic_year_id=? AND j.entry_date BETWEEN ? AND ? ORDER BY j.entry_date,j.id LIMIT 1001",
    values,
  );
  if (events.length > 1000)
    throw new ApiError(
      422,
      "EXPORT_LIMIT",
      "Choose a shorter date range; each balanced export supports 1,000 vouchers.",
    );
  const institution = await one<{ name: string; settings: string }>(
      "SELECT name,settings FROM institutions WHERE id=?",
      [actor.institutionId],
    ),
    settings = JSON.parse(institution!.settings),
    mapping = z
      .record(z.string().min(1).max(160))
      .parse(settings.tally?.ledgers || {});
  const defaults: Record<string, string> = {
    ACCOUNTS_RECEIVABLE: "Student Fees Receivable",
    CASH: "Cash",
    BANK_CLEARING: "Bank Receipts",
    CONCESSION_EXPENSE: "Fee Concessions",
    FEE_REVENUE: "Fee Income",
    LATE_FEE_REVENUE: "Late Fee Income",
    OPENING_BALANCE_CLEARING: "Academic Year Transfer",
  };
  const items = await all<{
    invoice_id: string;
    component_id: string;
    name: string;
    amount_paise: number;
  }>(
    "SELECT ii.invoice_id,ii.component_id,ii.name,ii.amount_paise FROM invoice_items ii JOIN invoices i ON i.id=ii.invoice_id AND i.institution_id=ii.institution_id WHERE i.institution_id=? AND i.academic_year_id=? AND EXISTS(SELECT 1 FROM journal_events j WHERE j.ledger_entry_id IN(SELECT l.id FROM ledger_entries l WHERE l.invoice_id=i.id AND l.institution_id=i.institution_id) AND j.event_type='INVOICE_GENERATED' AND j.entry_date BETWEEN ? AND ?) ORDER BY ii.invoice_id,ii.component_id LIMIT 20001",
    values,
  );
  if (items.length > 20000)
    throw new ApiError(
      422,
      "EXPORT_LIMIT",
      "Choose a shorter period containing fewer fee components.",
    );
  const byInvoice = new Map<string, typeof items>();
  for (const item of items) {
    const group = byInvoice.get(item.invoice_id) || [];
    group.push(item);
    byInvoice.set(item.invoice_id, group);
  }
  const vouchers: TallyVoucher[] = [];
  for (const event of events) {
    const postings: TallyPosting[] = [
      {
        ledger: mapping[event.debit_account] || defaults[event.debit_account],
        paise: event.amount_paise,
        side: "Debit",
      },
    ];
    if (event.event_type === "INVOICE_GENERATED" && event.invoice_id) {
      const components = byInvoice.get(event.invoice_id) || [];
      if (
        components.reduce((n, i) => n + i.amount_paise, 0) !==
        event.amount_paise
      )
        throw new ApiError(
          409,
          "COMPONENT_MISMATCH",
          "An invoice component total needs review before export.",
        );
      postings.push(
        ...components
          .filter((c) => c.amount_paise > 0)
          .map((c) => ({
            ledger: mapping["component:" + c.component_id] || c.name,
            paise: c.amount_paise,
            side: "Credit" as const,
          })),
      );
    } else {
      const service =
        event.kind === "Daily Transport"
          ? "Transport"
          : event.kind === "Daily Hostel"
            ? "Hostel"
            : null;
      postings.push({
        ledger: service
          ? mapping["service:" + service] || service + " Fee Income"
          : mapping[event.credit_account] || defaults[event.credit_account],
        paise: event.amount_paise,
        side: "Credit",
      });
    }
    const hash = await sha256(actor.institutionId + ":" + event.id),
      guid = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
    vouchers.push({
      id: guid,
      date: event.entry_date,
      number: "SST-" + event.id.replace("journal:", ""),
      type:
        event.event_type === "PAYMENT_RECEIVED"
          ? "Receipt"
          : event.event_type === "REVERSAL_ISSUED"
            ? "Payment"
            : "Journal",
      narration: `${event.student_name} (${event.admission_number}) | ${event.description}`,
      postings,
    });
  }
  return attachment(
    tallyXml(settings.tally?.company || institution!.name, vouchers),
    "application/xml;charset=utf-8",
    "Sohan-Soft-Tech-Tally-Vouchers.xml",
  );
}
