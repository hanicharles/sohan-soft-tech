import { z } from "zod";
import { countedCash } from "../../lib/cash";
import { parseMoney } from "../../lib/money";
import { dateField } from "../catalog";
import { all, batch, insert, one, stamps, today, uuid } from "../db";
import { Actor, ApiError, audit, own, permit } from "../security";
import { ok, RouteContext } from "./shared";

export async function cashRoute(ctx: RouteContext): Promise<Response | null> {
  const { actor, path, p, method, body, request, url, requestId } = ctx;
  if (method === "GET" && path[0] === "cash")
    return ok(await cashSummary(actor, p), requestId);
  if (method === "POST") {
    if (path[0] === "cash") {
      permit(actor, "cash.close");
      const d = z
        .object({
          campusId: z.string(),
          yearId: z.string(),
          date: dateField,
          kind: z.enum(["Opening", "Deposit", "Close"]),
          amount: z.string().default("0"),
          denominations: z
            .record(z.number().int().min(0).max(1000000))
            .optional(),
          expectedPaise: z.number().int().optional(),
          notes: z.string().max(500).default(""),
          reference: z.string().max(100).default(""),
        })
        .parse(body);
      if (d.kind !== "Close") permit(actor, "payments.manage");
      await own(actor, "campuses", d.campusId);
      await own(actor, "academic_years", d.yearId);
      if (
        await one(
          "SELECT id FROM cash_closings WHERE institution_id=? AND campus_id=? AND entry_date=?",
          [actor.institutionId, d.campusId, d.date],
        )
      )
        throw new ApiError(
          409,
          "CASH_CLOSED",
          "This cash day has already been closed.",
        );
      if (d.kind === "Close") {
        const data = await cashSummary(
          actor,
          new URLSearchParams({ date: d.date, campus: d.campusId }),
        );
        if (!d.denominations)
          throw new ApiError(
            422,
            "CURRENCY_COUNT_REQUIRED",
            "Count physical notes and coins before closing the day.",
          );
        let amount: number;
        try {
          amount = countedCash(d.denominations);
        } catch (error) {
          throw new ApiError(422, "INVALID_COUNT", (error as Error).message);
        }
        if (d.expectedPaise !== data.expected)
          throw new ApiError(
            409,
            "CASH_BALANCE_CHANGED",
            "New cash activity was recorded. Refresh and review the expected total.",
          );
        if (amount !== data.expected && d.notes.trim().length < 5)
          throw new ApiError(
            422,
            "VARIANCE_REASON_REQUIRED",
            "Explain the cash variance before closing.",
          );
        await batch([
          insert("cash_closings", {
            id: uuid(),
            institution_id: actor.institutionId,
            ...stamps(actor.userId),
            campus_id: d.campusId,
            entry_date: d.date,
            denominations: JSON.stringify(d.denominations),
            expected_paise: data.expected,
            counted_paise: amount,
            variance_paise: amount - data.expected,
            notes: d.notes,
          }),
          audit(actor, "Closed cash day", "cash_closings", d.date, null, {
            counted: amount,
            expected: data.expected,
          }),
        ]);
      } else
        await batch([
          insert("cash_entries", {
            id: uuid(),
            institution_id: actor.institutionId,
            ...stamps(actor.userId),
            campus_id: d.campusId,
            academic_year_id: d.yearId,
            kind: d.kind,
            amount_paise: parseMoney(d.amount),
            entry_date: d.date,
            reference: d.reference,
            notes: d.notes,
          }),
          audit(
            actor,
            "Recorded cash " + d.kind,
            "cash_entries",
            d.date,
            null,
            d,
          ),
        ]);
      return ok({ saved: true }, requestId);
    }
  }
  return null;
}

export async function cashSummary(actor: Actor, p: URLSearchParams) {
  permit(actor, "payments.view");
  const date = p.get("date") || today(),
    campus =
      p.get("campus") ||
      (await one("SELECT id FROM campuses WHERE institution_id=? LIMIT 1", [
        actor.institutionId,
      ]))!.id;
  await own(actor, "campuses", campus);
  const collection = await one(
      "SELECT COALESCE(SUM(p.amount_paise),0) amount FROM payments p JOIN enrollments e ON e.student_id=p.student_id AND e.academic_year_id=p.academic_year_id JOIN sections sec ON sec.id=e.section_id WHERE p.institution_id=? AND sec.campus_id=? AND p.method='Cash' AND p.status IN ('Successful','Partially Refunded','Refunded') AND date(p.paid_at,'+5 hours','+30 minutes')=?",
      [actor.institutionId, campus, date],
    ),
    refunds = await one(
      "SELECT COALESCE(SUM(r.amount_paise),0) amount FROM refunds r JOIN enrollments e ON e.student_id=r.student_id AND e.academic_year_id=r.academic_year_id JOIN sections sec ON sec.id=e.section_id WHERE r.institution_id=? AND sec.campus_id=? AND r.method='Cash' AND r.status='Processed' AND date(r.refunded_at,'+5 hours','+30 minutes')=?",
      [actor.institutionId, campus, date],
    ),
    entries = await all(
      "SELECT * FROM cash_entries WHERE institution_id=? AND campus_id=? AND entry_date=?",
      [actor.institutionId, campus, date],
    ),
    prev = await one(
      "SELECT counted_paise FROM cash_closings WHERE institution_id=? AND campus_id=? AND entry_date<? ORDER BY entry_date DESC LIMIT 1",
      [actor.institutionId, campus, date],
    ),
    closing = await one(
      "SELECT * FROM cash_closings WHERE institution_id=? AND campus_id=? AND entry_date=?",
      [actor.institutionId, campus, date],
    );
  const opening =
      prev?.counted_paise ??
      entries
        .filter((e) => e.kind === "Opening")
        .reduce((s, r) => s + r.amount_paise, 0),
    deposits = entries
      .filter((e) => e.kind === "Deposit")
      .reduce((s, r) => s + r.amount_paise, 0);
  return {
    date,
    campusId: campus,
    opening,
    collected: collection!.amount,
    refunds: refunds!.amount,
    deposits,
    expected: opening + collection!.amount - refunds!.amount - deposits,
    entries,
    closing,
  };
}
