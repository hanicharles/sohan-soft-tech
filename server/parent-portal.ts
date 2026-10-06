import { env } from "cloudflare:workers";
import { z } from "zod";
import { all, batch, insert, now, one, stamps, uuid } from "./db";
import {
  Actor,
  ApiError,
  audit,
  constantEqual,
  hmac,
  own,
  permit,
  sha256,
} from "./security";

export interface ParentGrant {
  id: string;
  institution_id: string;
  parent_id: string;
  expires_at: string;
  token_hash: string;
  revoked_at: string | null;
}
async function signingKey() {
  const key = env.PARENT_PORTAL_SECRET || env.PROVIDER_ENCRYPTION_KEY;
  if (!key || key.length < 32)
    throw new ApiError(
      503,
      "PORTAL_NOT_CONFIGURED",
      "Parent links are not configured. Contact the accounts office.",
    );
  return hmac(key, "sohan-parent-portal:v1");
}
export async function issueParentGrant(
  actor: Actor,
  parentId: string,
  days = 7,
  purpose = "Parent self service",
) {
  permit(actor, "students.manage");
  await own(actor, "parents", parentId);
  z.number().int().min(1).max(30).parse(days);
  const id = uuid(),
    expiry = Math.floor(Date.now() / 1000) + days * 86400;
  const nonce = Array.from(crypto.getRandomValues(new Uint8Array(24)), (n) =>
    n.toString(16).padStart(2, "0"),
  ).join("");
  const payload = `v1.${id}.${expiry}.${nonce}`;
  const token = payload + "." + (await hmac(await signingKey(), payload));
  const expiresAt = new Date(expiry * 1000).toISOString();
  await batch([
    insert("parent_portal_grants", {
      id,
      institution_id: actor.institutionId,
      parent_id: parentId,
      token_hash: await sha256(token),
      expires_at: expiresAt,
      purpose,
      ...stamps(actor.userId),
    }),
    audit(
      actor,
      "Issued signed parent access",
      "parent_portal_grants",
      id,
      null,
      { parentId, expiresAt, purpose },
    ),
  ]);
  return {
    id,
    token,
    expiresAt,
    url:
      (env.PLATFORM_ORIGIN || new URL(actor.request.url).origin).replace(
        /\/$/,
        "",
      ) +
      "/portal/" +
      token,
  };
}
export async function parentActor(
  request: Request,
  token: string,
): Promise<Actor & { parentId: string; portalGrantId: string }> {
  if (!/^v1\.[a-f0-9-]{36}\.\d{10}\.[a-f0-9]{48}\.[a-f0-9]{64}$/.test(token))
    throw invalidLink();
  const parts = token.split("."),
    payload = parts.slice(0, 4).join(".");
  if (
    Number(parts[2]) <= Date.now() / 1000 ||
    !constantEqual(await hmac(await signingKey(), payload), parts[4])
  )
    throw invalidLink();
  const grant = await one<ParentGrant>(
    "SELECT g.* FROM parent_portal_grants g JOIN institutions i ON i.id=g.institution_id AND i.status='Active' JOIN parents p ON p.id=g.parent_id AND p.institution_id=g.institution_id WHERE g.id=? AND g.revoked_at IS NULL AND g.expires_at>?",
    [parts[1], now()],
  );
  if (!grant || !constantEqual(grant.token_hash, await sha256(token)))
    throw invalidLink();
  return {
    userId: "parent-link:" + grant.id,
    email: "",
    name: "Parent self service",
    institutionId: grant.institution_id,
    parentId: grant.parent_id,
    portalGrantId: grant.id,
    role: "CUSTOM",
    feeVisibility: true,
    permissions: [
      "students.view",
      "fees.view",
      "receipts.view",
      "payments.collect",
    ],
    request,
  };
}
function invalidLink() {
  return new ApiError(
    401,
    "INVALID_PARENT_LINK",
    "This private link is invalid, expired or revoked. Ask the institution for a new link.",
  );
}
export async function parentOverview(actor: Actor, params: URLSearchParams) {
  const children = await all<{
    id: string;
    name: string;
    admission_number: string;
  }>(
    "SELECT s.id,s.name,s.admission_number FROM students s JOIN student_parents sp ON sp.student_id=s.id AND sp.institution_id=s.institution_id WHERE sp.institution_id=? AND sp.parent_id=? ORDER BY s.name LIMIT 20",
    [actor.institutionId, actor.parentId],
  );
  const studentId = params.get("student") || children[0]?.id;
  if (studentId && !children.some((s) => s.id === studentId))
    throw new ApiError(404, "NOT_FOUND", "Student not found.");
  const institution = await one<{
    name: string;
    slug: string;
    settings: string;
  }>("SELECT name,slug,settings FROM institutions WHERE id=?", [
    actor.institutionId,
  ]);
  const years = studentId
    ? await all<{ id: string; name: string; status: string }>(
        "SELECT y.id,y.name,y.status FROM academic_years y JOIN enrollments e ON e.academic_year_id=y.id AND e.institution_id=y.institution_id WHERE e.institution_id=? AND e.student_id=? ORDER BY y.start_date DESC LIMIT 30",
        [actor.institutionId, studentId],
      )
    : [];
  const yearId = params.get("year") || years[0]?.id;
  if (yearId && !years.some((y) => y.id === yearId))
    throw new ApiError(404, "NOT_FOUND", "Academic year not found.");
  const page = Math.max(1, Math.min(10000, Number(params.get("page")) || 1));
  const scope = [actor.institutionId, studentId || "", yearId || ""];
  const [
    balance,
    invoices,
    installments,
    receipts,
    receiptCount,
    donations,
    items,
  ] = await Promise.all([
    one(
      "SELECT total_paise,paid_paise,outstanding_paise,overdue_paise,next_due_date FROM student_balances WHERE institution_id=? AND student_id=? AND academic_year_id=?",
      scope,
    ),
    all(
      "SELECT id,number,gross_paise,discount_paise,scholarship_paise,net_paise,total_paise,total_paise-net_paise adjustment_paise,paid_paise,outstanding_paise,due_date,status FROM invoice_balances WHERE institution_id=? AND student_id=? AND academic_year_id=? ORDER BY issued_date DESC LIMIT 100",
      scope,
    ),
    all(
      "SELECT id,title,due_date,total_paise,paid_paise,outstanding_paise,status FROM installment_balances WHERE institution_id=? AND student_id=? AND academic_year_id=? ORDER BY due_date LIMIT 100",
      scope,
    ),
    all(
      "SELECT r.id,r.number,p.amount_paise,p.paid_at,p.method,p.status FROM receipts r JOIN payments p ON p.id=r.payment_id AND p.institution_id=r.institution_id WHERE p.institution_id=? AND p.student_id=? AND p.academic_year_id=? ORDER BY p.paid_at DESC LIMIT 20 OFFSET ?",
      [...scope, (page - 1) * 20],
    ),
    one<{ count: number }>(
      "SELECT COUNT(*) count FROM receipts r JOIN payments p ON p.id=r.payment_id AND p.institution_id=r.institution_id WHERE p.institution_id=? AND p.student_id=? AND p.academic_year_id=?",
      scope,
    ),
    all(
      "SELECT id,financial_year,donation_reference,amount_paise FROM donation_certificates WHERE institution_id=? AND parent_id=? ORDER BY financial_year DESC LIMIT 50",
      [actor.institutionId, actor.parentId],
    ),
    all(
      "SELECT ii.id,ii.invoice_id,ii.name,ii.amount_paise FROM invoice_items ii JOIN invoices i ON i.id=ii.invoice_id AND i.institution_id=ii.institution_id WHERE i.institution_id=? AND i.student_id=? AND i.academic_year_id=? ORDER BY i.issued_date DESC,ii.name LIMIT 500",
      scope,
    ),
  ]);
  const settings = JSON.parse(institution?.settings || "{}");
  return {
    institution: {
      name: institution?.name,
      slug: institution?.slug,
      primaryColor: /^#[a-fA-F0-9]{6}$/.test(
        settings.branding?.primaryColor || "",
      )
        ? settings.branding.primaryColor
        : "#3157d5",
    },
    children,
    years,
    studentId,
    yearId,
    balance,
    invoices,
    installments,
    receipts,
    receiptCount: receiptCount?.count || 0,
    page,
    donations,
    items,
  };
}
