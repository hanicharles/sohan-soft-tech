import { z } from "zod";
import { all, batch, insert, now, one, stamps, stmt, uuid } from "./db";
import { Actor, ApiError, authenticate, permit } from "./security";
import { platformAudit } from "./tenancy";
import { currentOrganization, withOrganizationContext } from "./tenant-context";

export async function organizationReport(
  request: Request,
  id: string,
  p: URLSearchParams,
) {
  const user = await authenticate(request);
  const organization = await one<{ id: string; name: string }>(
    "SELECT o.id,o.name FROM organizations o JOIN organization_members m ON m.organization_id=o.id WHERE o.id=? AND o.status='Active' AND m.email=? AND m.active=1",
    [id, user.email],
  );
  if (!organization)
    throw new ApiError(
      403,
      "ORGANIZATION_ACCESS_REQUIRED",
      "An organization administrator must grant access to this group.",
    );
  const dates = z
    .object({
      from: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
      to: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
    })
    .parse({ from: p.get("from") || undefined, to: p.get("to") || undefined });
  return withOrganizationContext(
    { userId: user.userId, organizationId: id },
    async () => {
      const scope = currentOrganization();
      const from = dates.from || "2000-01-01",
        to = dates.to || "2100-12-31";
      if (from > to)
        throw new ApiError(
          422,
          "INVALID_DATE_RANGE",
          "Start date must be before end date.",
        );
      const page = Math.max(1, Math.min(100000, Number(p.get("page")) || 1)),
        limit = 50;
      const rows = await all(
        `SELECT i.id,i.name,i.slug,(SELECT COUNT(*) FROM students s WHERE s.institution_id=i.id AND s.status='Active') students,COALESCE((SELECT SUM(j.amount_paise) FROM journal_events j WHERE j.institution_id=i.id AND j.event_type='PAYMENT_RECEIVED' AND j.entry_date BETWEEN ? AND ?),0) collected_paise,COALESCE((SELECT SUM(j.amount_paise) FROM journal_events j WHERE j.institution_id=i.id AND j.event_type='REVERSAL_ISSUED' AND j.entry_date BETWEEN ? AND ?),0) refunded_paise,COALESCE((SELECT SUM(l.debit_paise-l.credit_paise) FROM ledger_entries l WHERE l.institution_id=i.id AND l.entry_date<=?),0) outstanding_paise FROM institutions i JOIN organizations o ON o.id=i.organization_id WHERE i.organization_id=? AND o.status='Active' ORDER BY i.name,i.id LIMIT ? OFFSET ?`,
        [
          from,
          to,
          from,
          to,
          to,
          scope.organizationId,
          limit,
          (page - 1) * limit,
        ],
      );
      const count = await one<{ count: number }>(
        "SELECT COUNT(*) count FROM institutions WHERE organization_id=?",
        [scope.organizationId],
      );
      const totals = await one(
        `SELECT (SELECT COUNT(*) FROM students s JOIN institutions i ON i.id=s.institution_id WHERE i.organization_id=? AND s.status='Active') students,(SELECT COALESCE(SUM(j.amount_paise),0) FROM journal_events j JOIN institutions i ON i.id=j.institution_id WHERE i.organization_id=? AND j.event_type='PAYMENT_RECEIVED' AND j.entry_date BETWEEN ? AND ?) collected_paise,(SELECT COALESCE(SUM(j.amount_paise),0) FROM journal_events j JOIN institutions i ON i.id=j.institution_id WHERE i.organization_id=? AND j.event_type='REVERSAL_ISSUED' AND j.entry_date BETWEEN ? AND ?) refunded_paise,(SELECT COALESCE(SUM(l.debit_paise-l.credit_paise),0) FROM ledger_entries l JOIN institutions i ON i.id=l.institution_id WHERE i.organization_id=? AND l.entry_date<=?) outstanding_paise`,
        [id, id, from, to, id, from, to, id, to],
      );
      return {
        organization,
        rows,
        totals,
        from,
        to,
        page,
        total: count?.count || 0,
        limit,
      };
    },
  );
}
export async function manageOrganizations(
  actor: Actor,
  path: string[],
  method: string,
  input: unknown,
) {
  permit(actor, "system");
  if (method === "GET")
    return {
      rows: await all(
        "SELECT o.*,(SELECT COUNT(*) FROM institutions i WHERE i.organization_id=o.id) institutions,(SELECT group_concat(m.email,', ') FROM organization_members m WHERE m.organization_id=o.id AND m.active=1) administrators FROM organizations o ORDER BY o.name LIMIT 100",
      ),
      institutions: await all(
        "SELECT id,name,organization_id FROM institutions ORDER BY name LIMIT 100",
      ),
    };
  if (method === "POST" && !path[1]) {
    const d = z
        .object({
          name: z.string().trim().min(2).max(160),
          adminEmail: z
            .string()
            .email()
            .transform((s) => s.toLowerCase()),
          institutionIds: z.array(z.string()).max(100),
        })
        .parse(input),
      id = uuid();
    const statements = [
      insert("organizations", { id, name: d.name, ...stamps(actor.userId) }),
      insert("organization_members", {
        id: uuid(),
        organization_id: id,
        email: d.adminEmail,
        ...stamps(actor.userId),
      }),
    ];
    for (const institutionId of [...new Set(d.institutionIds)]) {
      const i = await one(
        "SELECT id,organization_id FROM institutions WHERE id=?",
        [institutionId],
      );
      if (!i || i.organization_id)
        throw new ApiError(
          409,
          "GROUP_CONFLICT",
          "An institution is missing or already assigned to a group.",
        );
      statements.push(
        stmt(
          "UPDATE institutions SET organization_id=?,updated_at=?,updated_by=? WHERE id=? AND organization_id IS NULL",
          [id, now(), actor.userId, institutionId],
        ),
      );
    }
    statements.push(
      platformAudit(
        actor,
        "Created trust and approved organization administrator",
        "organizations",
        id,
        null,
        d,
      ),
    );
    await batch(statements);
    return { id, url: "/organization/" + id };
  }
  if (method === "PATCH" && path[1]) {
    const d = z
      .object({
        institutionId: z.string().optional(),
        email: z.string().email().optional(),
        active: z.boolean().optional(),
        reason: z.string().min(5).max(500),
      })
      .parse(input);
    if (!(await one("SELECT id FROM organizations WHERE id=?", [path[1]])))
      throw new ApiError(404, "NOT_FOUND", "Organization not found.");
    const statements = [];
    if (d.institutionId) {
      const old = await one(
        "SELECT organization_id FROM institutions WHERE id=?",
        [d.institutionId],
      );
      if (!old) throw new ApiError(404, "NOT_FOUND", "Institution not found.");
      statements.push(
        stmt(
          "UPDATE institutions SET organization_id=?,updated_at=?,updated_by=? WHERE id=?",
          [path[1], now(), actor.userId, d.institutionId],
        ),
        platformAudit(
          actor,
          "Moved institution to organization",
          "institutions",
          d.institutionId,
          old,
          { organizationId: path[1], reason: d.reason },
        ),
      );
    }
    if (d.email)
      statements.push(
        stmt(
          "INSERT INTO organization_members(id,organization_id,email,active,created_at,updated_at,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(organization_id,email) DO UPDATE SET active=excluded.active,updated_at=excluded.updated_at,updated_by=excluded.updated_by",
          [
            uuid(),
            path[1],
            d.email.toLowerCase(),
            +(d.active ?? true),
            now(),
            now(),
            actor.userId,
            actor.userId,
          ],
        ),
        platformAudit(
          actor,
          "Changed organization report access",
          "organizations",
          path[1],
          null,
          { email: d.email, active: d.active, reason: d.reason },
        ),
      );
    if (statements.length) await batch(statements);
    return { saved: true };
  }
  throw new ApiError(
    405,
    "METHOD_NOT_ALLOWED",
    "Organization operation is not available.",
  );
}
