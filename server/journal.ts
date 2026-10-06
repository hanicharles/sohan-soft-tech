import { all, batch, stmt } from "./db";
import { Actor, permit } from "./security";

// Schema migration stays bounded. Copy historical append-only ledger rows in
// deterministic pages; the unique source key makes repeated runs harmless.
export async function backfillJournal(institutionId?: string, limit = 100) {
  const rows = await all(
    "SELECT l.id FROM ledger_entries l LEFT JOIN journal_events j ON j.ledger_entry_id=l.id WHERE j.id IS NULL AND l.debit_paise+l.credit_paise>0" +
      (institutionId ? " AND l.institution_id=?" : "") +
      " ORDER BY l.created_at,l.id LIMIT ?",
    [...(institutionId ? [institutionId] : []), limit],
  );
  if (rows.length)
    await batch(
      rows.map((r) =>
        stmt(
          "INSERT OR IGNORE INTO journal_events SELECT * FROM journal_legacy_projection WHERE ledger_entry_id=?",
          [r.id],
        ),
      ),
    );
  return { backfilled: rows.length, hasMore: rows.length === limit };
}
export async function journalForStudent(
  actor: Actor,
  studentId: string,
  year: string,
) {
  permit(actor, "fees.view");
  return all(
    "SELECT * FROM journal_postings WHERE institution_id=? AND student_id=? AND academic_year_id=? ORDER BY created_at,event_id,id LIMIT 1000",
    [actor.institutionId, studentId, year],
  );
}
