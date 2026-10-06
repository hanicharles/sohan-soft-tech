export { withTenantContext } from "./tenant-context";
import { modules } from "../lib/permissions";
import { all, batch, insert, now, one, Row, stmt, today, uuid } from "./db";
import { Actor, ApiError } from "./security";

// Data upgrades are bounded, idempotent operations; migrations remain schema-only.
export async function upgradeTenantData(userId: string) {
  const time = now(),
    moduleList = JSON.stringify(modules);
  const legacyAdmins = await all(
    "SELECT DISTINCT user_id FROM memberships WHERE role='SUPER_ADMIN' LIMIT 25",
  );
  await batch([
    ...legacyAdmins.map((a) =>
      stmt(
        "INSERT OR IGNORE INTO platform_admins(user_id,active,created_at,updated_at,created_by,updated_by) VALUES (?,1,?,?,?,?)",
        [a.user_id, time, time, userId, userId],
      ),
    ),
    stmt(
      "INSERT OR IGNORE INTO platform_admins(user_id,active,created_at,updated_at,created_by,updated_by) SELECT value,1,?,?,?,? FROM platform WHERE key='owner'",
      [time, time, userId, userId],
    ),
    ...[
      { id: "plan-starter", name: "Starter", limit: 500, users: 10 },
      { id: "plan-growth", name: "Growth", limit: 2000, users: 30 },
      { id: "plan-enterprise", name: "Enterprise", limit: 20000, users: 250 },
    ].map((p) =>
      stmt(
        "INSERT OR IGNORE INTO saas_plans(id,name,code,price_paise,billing_cycle,student_limit,user_limit,modules,status,created_at,updated_at,created_by,updated_by) VALUES (?,?,?,0,'Annual',?,? ,?,'Active',?,?,?,?)",
        [
          p.id,
          p.name,
          p.name.toLowerCase(),
          p.limit,
          p.users,
          moduleList,
          time,
          time,
          userId,
          userId,
        ],
      ),
    ),
    stmt(
      "UPDATE memberships SET active=0,updated_at=? WHERE role IN ('SUPER_ADMIN','PARENT','STUDENT') AND active=1",
      [time],
    ),
    stmt(
      "UPDATE invitations SET status='Revoked',updated_at=? WHERE role IN ('PARENT','STUDENT','SUPER_ADMIN') AND status='Pending'",
      [time],
    ),
  ]);
  const institutions = await all(
    "SELECT i.* FROM institutions i LEFT JOIN institution_subscriptions s ON s.institution_id=i.id WHERE s.id IS NULL LIMIT 25",
  );
  for (const i of institutions) {
    const plan = await one("SELECT * FROM saas_plans WHERE id=?", [
      i.subscription === "Starter"
        ? "plan-starter"
        : i.subscription === "Enterprise"
          ? "plan-enterprise"
          : "plan-growth",
    ]);
    const studentCount = await one(
      "SELECT COUNT(*) count FROM students WHERE institution_id=? AND status='Active'",
      [i.id],
    );
    const yearLater = new Date();
    yearLater.setUTCFullYear(yearLater.getUTCFullYear() + 1);
    await batch([
      stmt(
        "INSERT OR IGNORE INTO institution_subscriptions(id,institution_id,plan_id,status,start_date,end_date,student_limit,user_limit,modules,created_at,updated_at,created_by,updated_by) VALUES (?,?,?,'Active',?,?,?,?,?,?,?,?,?)",
        [
          uuid(),
          i.id,
          plan!.id,
          today(),
          yearLater.toISOString().slice(0, 10),
          Math.max(plan!.student_limit, studentCount?.count || 0),
          plan!.user_limit,
          plan!.modules,
          time,
          time,
          userId,
          userId,
        ],
      ),
      stmt(
        "UPDATE institutions SET slug=?,institution_code=CASE WHEN institution_code='' THEN ? ELSE institution_code END WHERE id=? AND slug=id",
        [
          i.name === "CampusLedger Test School"
            ? "campusledger-test-school"
            : i.name === "Chaitanya Shree Academy"
              ? "chaitanya-shree-academy"
              : i.id,
          i.name === "CampusLedger Test School"
            ? "CL-TEST"
            : i.name === "Chaitanya Shree Academy"
              ? "CSA"
              : i.id.slice(0, 20).toUpperCase(),
          i.id,
        ],
      ),
    ]);
  }
  return { upgraded: institutions.length, hasMore: institutions.length === 25 };
}

export async function tenantUsage(institutionId: string) {
  const row = await one(
    `SELECT
    (SELECT COUNT(*) FROM students WHERE institution_id=? AND status='Active') students,
    (SELECT COUNT(*) FROM memberships WHERE institution_id=? AND active=1 AND role NOT IN ('SUPER_ADMIN','PARENT','STUDENT')) users,
    (SELECT COUNT(*) FROM invitations v WHERE v.institution_id=? AND v.status='Pending' AND v.role NOT IN ('SUPER_ADMIN','PARENT','STUDENT') AND NOT EXISTS(SELECT 1 FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.institution_id=v.institution_id AND m.active=1 AND lower(u.email)=lower(v.email))) pendingUsers`,
    [institutionId, institutionId, institutionId],
  );
  return row!;
}
export async function tenantSubscription(institutionId: string): Promise<Row> {
  const s = await one(
    "SELECT s.*,p.name plan_name,p.price_paise,p.billing_cycle FROM institution_subscriptions s JOIN saas_plans p ON p.id=s.plan_id WHERE s.institution_id=?",
    [institutionId],
  );
  if (!s)
    throw new ApiError(
      503,
      "SUBSCRIPTION_UNAVAILABLE",
      "Subscription settings are being updated. Try again shortly.",
    );
  return {
    ...s,
    modules: JSON.parse(s.modules),
    effectiveStatus:
      ["Active", "Trial", "Past Due"].includes(s.status) && s.end_date < today()
        ? "Expired"
        : s.status,
  };
}
export async function enforceSubscription(
  actor: Actor,
  method: string,
  area?: string,
) {
  const s = await tenantSubscription(actor.institutionId);
  if (area && modules.includes(area as any) && !s.modules.includes(area))
    throw new ApiError(
      403,
      "MODULE_DISABLED",
      "This module is not enabled in your institution's plan. Contact the platform administrator.",
    );
  if (
    method !== "GET" &&
    !actor.supportSessionId &&
    (!["Active", "Trial"].includes(s.effectiveStatus) || s.start_date > today())
  )
    throw new ApiError(
      403,
      "SUBSCRIPTION_READ_ONLY",
      "Your subscription does not allow new activity. Contact the platform administrator. Existing records remain available.",
    );
  return s;
}
export async function checkCapacity(
  actor: Actor,
  kind: "students" | "users",
  email?: string,
) {
  const s = await tenantSubscription(actor.institutionId),
    u = await tenantUsage(actor.institutionId);
  if (
    kind === "users" &&
    email &&
    (await one(
      "SELECT m.id FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.institution_id=? AND m.active=1 AND lower(u.email)=?",
      [actor.institutionId, email],
    ))
  )
    return;
  const used = kind === "students" ? u.students : u.users + u.pendingUsers;
  if (used >= (kind === "students" ? s.student_limit : s.user_limit))
    throw new ApiError(
      409,
      kind === "students" ? "STUDENT_LIMIT_REACHED" : "USER_LIMIT_REACHED",
      `Your ${kind === "students" ? "student" : "user"} limit has been reached. Contact the platform administrator to upgrade your plan.`,
    );
}
export async function portalInfo(slug: string) {
  const i = await one(
    "SELECT id,name,slug,logo_key,institution_type,settings,status FROM institutions WHERE slug=? OR id=?",
    [slug, slug],
  );
  if (!i) throw new ApiError(404, "NOT_FOUND", "Institution portal not found.");
  return {
    id: i.id,
    name: i.name,
    slug: i.slug,
    type: i.institution_type,
    logoUrl: i.logo_key ? "/api/portal/" + i.slug + "/logo" : null,
    primaryColor: JSON.parse(i.settings || "{}").primaryColor || "#3348d8",
    status: i.status,
    portalPath: "/campus/" + i.slug,
  };
}
export function platformAudit(
  actor: Actor,
  action: string,
  entity: string,
  id: string,
  oldValue: unknown,
  newValue: unknown,
  institutionId: string | null = null,
) {
  return insert("platform_audit_logs", {
    id: uuid(),
    institution_id: institutionId,
    user_id: actor.userId,
    user_name: actor.name,
    action,
    entity,
    entity_id: id,
    old_value: oldValue == null ? null : JSON.stringify(oldValue),
    new_value: newValue == null ? null : JSON.stringify(newValue),
    ip: actor.request.headers.get("cf-connecting-ip"),
    user_agent: actor.request.headers.get("user-agent")?.slice(0, 256),
    created_at: now(),
  });
}
