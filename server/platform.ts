import { z } from "zod";
import { parseMoney } from "../lib/money";
import { modules } from "../lib/permissions";
import { saveLogo } from "./branding";
import { dateField } from "./catalog";
import { all, batch, insert, now, one, Row, stamps, stmt, uuid } from "./db";
import {
  configureDomain,
  domainInfo,
  portalOrigin,
  verifyDomain,
} from "./domains";
import {
  createInstitution,
  grantInstitutionAdmin,
  listInstitutions,
  platformDashboard,
} from "./institutions";
import { paging } from "./queries";
import { Actor, ApiError, audit, permit, sha256 } from "./security";
import { platformAudit, tenantSubscription, tenantUsage } from "./tenancy";
import { manageOrganizations } from "./organizations";

const planSchema = z.object({
  name: z.string().trim().min(2).max(80),
  code: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9-]{2,40}$/),
  price: z.string(),
  billingCycle: z.enum(["Monthly", "Quarterly", "Annual"]),
  studentLimit: z.number().int().min(1).max(1000000),
  userLimit: z.number().int().min(1).max(100000),
  modules: z.array(z.enum(modules)).min(1),
  status: z.enum(["Active", "Inactive"]),
});
export async function platformRoute(
  actor: Actor,
  path: string[],
  method: string,
  p: URLSearchParams,
  body: Row,
): Promise<any> {
  permit(actor, "system");
  if (path[0] === "organizations")
    return manageOrganizations(actor, path, method, body);
  const kind = path[0],
    id = path[1],
    action = path[2];
  if (method === "GET") {
    if (kind === "dashboard") return platformDashboard(actor);
    if (kind === "institutions") {
      if (!id) return listInstitutions(actor, p);
      const institution = await one("SELECT * FROM institutions WHERE id=?", [
        id,
      ]);
      if (!institution)
        throw new ApiError(404, "NOT_FOUND", "Institution not found.");
      return {
        institution: {
          ...institution,
          settings: JSON.parse(institution.settings),
        },
        subscription: await tenantSubscription(id),
        usage: await tenantUsage(id),
        domains: await domainInfo(id, actor.request),
        admins: await all(
          "SELECT u.email,COALESCE(NULLIF(m.display_name,''),u.name) name,m.mobile,m.active FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.institution_id=? AND m.role='INSTITUTION_ADMIN'",
          [id],
        ),
        pendingAdmins: await all(
          "SELECT email,display_name name,mobile,status FROM invitations WHERE institution_id=? AND role='INSTITUTION_ADMIN' AND status='Pending'",
          [id],
        ),
      };
    }
    if (kind === "plans")
      return {
        rows: await all("SELECT * FROM saas_plans ORDER BY price_paise,name"),
      };
    if (kind === "subscriptions" || kind === "usage" || kind === "domains") {
      const page = paging(p),
        q = "%" + (p.get("q") || "") + "%",
        status = p.get("status");
      const where =
          " WHERE i.name LIKE ?" +
          (status && kind === "subscriptions" ? " AND s.status=?" : ""),
        values: unknown[] =
          status && kind === "subscriptions" ? [q, status] : [q];
      const base =
        " FROM institutions i JOIN institution_subscriptions s ON s.institution_id=i.id JOIN saas_plans p ON p.id=s.plan_id LEFT JOIN institution_domains d ON d.institution_id=i.id";
      const rows = await all(
        `SELECT i.id,i.name,i.slug,i.status institution_status,s.id subscription_id,s.status,s.start_date,s.end_date,s.student_limit,s.user_limit,p.name plan_name,p.price_paise,p.billing_cycle,d.hostname,d.status domain_status,d.verification_status,d.ssl_status,(SELECT COUNT(*) FROM students st WHERE st.institution_id=i.id AND st.status='Active') students,(SELECT COUNT(*) FROM memberships m WHERE m.institution_id=i.id AND m.active=1 AND m.role NOT IN ('SUPER_ADMIN','PARENT','STUDENT')) users${base}${where} ORDER BY i.name LIMIT ? OFFSET ?`,
        [...values, page.size, page.offset],
      );
      const total = await one("SELECT COUNT(*) count" + base + where, values);
      return {
        rows,
        total: total!.count,
        ...page,
        origin: portalOrigin(actor.request),
      };
    }
    if (kind === "audit") {
      const page = paging(p),
        q = "%" + (p.get("q") || "") + "%";
      const total = await one(
        "SELECT COUNT(*) count FROM platform_audit_logs WHERE action LIKE ?",
        [q],
      );
      return {
        rows: await all(
          "SELECT a.*,i.name institution_name FROM platform_audit_logs a LEFT JOIN institutions i ON i.id=a.institution_id WHERE a.action LIKE ? ORDER BY a.created_at DESC LIMIT ? OFFSET ?",
          [q, page.size, page.offset],
        ),
        total: total!.count,
        ...page,
      };
    }
    if (kind === "payments") {
      const page = paging(p),
        q = "%" + (p.get("q") || "") + "%";
      return {
        rows: await all(
          "SELECT pay.*,i.name institution_name FROM subscription_payments pay JOIN institutions i ON i.id=pay.institution_id WHERE i.name LIKE ? ORDER BY pay.paid_date DESC LIMIT ? OFFSET ?",
          [q, page.size, page.offset],
        ),
        total: (await one(
          "SELECT COUNT(*) count FROM subscription_payments pay JOIN institutions i ON i.id=pay.institution_id WHERE i.name LIKE ?",
          [q],
        ))!.count,
        ...page,
      };
    }
    if (kind === "settings") {
      const settings = JSON.parse(
        (await one("SELECT value FROM platform WHERE key='settings'"))?.value ||
          "{}",
      );
      if (!settings.platformName || settings.platformName === "CampusLedger")
        settings.platformName = "Sohan Soft Tech";
      return {
        origin: portalOrigin(actor.request),
        loginMethod: "Local",
        owner: actor.email,
        settings,
      };
    }
  }
  if (kind === "institutions" && !id && method === "POST")
    return createInstitution(actor, body);
  if (kind === "institutions" && id) {
    const institution = await one("SELECT * FROM institutions WHERE id=?", [
      id,
    ]);
    if (!institution)
      throw new ApiError(404, "NOT_FOUND", "Institution not found.");
    if (action === "logo" && method === "POST")
      return saveLogo(actor, id, body);
    if (action === "admins" && method === "POST")
      return grantInstitutionAdmin(actor, id, body);
    if (action === "domain" && method === "POST")
      return configureDomain(actor, id, body);
    if (action === "verify-domain" && method === "POST")
      return verifyDomain(actor, id);
    if (action === "support" && method === "POST") {
      const d = z
        .object({ reason: z.string().trim().min(5).max(500) })
        .parse(body);
      const token = uuid() + uuid().replaceAll("-", ""),
        sessionId = uuid(),
        expires = new Date(Date.now() + 3600000).toISOString();
      await batch([
        stmt(
          "UPDATE support_sessions SET ended_at=? WHERE user_id=? AND ended_at IS NULL",
          [now(), actor.userId],
        ),
        insert("support_sessions", {
          id: sessionId,
          institution_id: id,
          user_id: actor.userId,
          token_hash: await sha256(token),
          reason: d.reason,
          expires_at: expires,
          created_at: now(),
        }),
        platformAudit(
          actor,
          "Started institution support access",
          "support_sessions",
          sessionId,
          null,
          { reason: d.reason, expiresAt: expires },
          id,
        ),
        audit(
          { ...actor, institutionId: id, supportSessionId: sessionId },
          "Platform administrator started support access",
          "support_sessions",
          sessionId,
          null,
          { reason: d.reason, expiresAt: expires },
        ),
      ]);
      return {
        data: { portalPath: "/campus/" + institution.slug, expiresAt: expires },
        cookie: `campusledger_support=${token}; Path=/api; Max-Age=3600; HttpOnly; Secure; SameSite=Strict`,
      };
    }
    if (action === "subscription" && method === "PATCH") {
      const d = z
        .object({
          planId: z.string(),
          status: z.enum([
            "Trial",
            "Active",
            "Past Due",
            "Suspended",
            "Expired",
            "Cancelled",
          ]),
          startDate: dateField,
          endDate: dateField,
          studentLimit: z.number().int().min(1).max(1000000),
          userLimit: z.number().int().min(1).max(100000),
          modules: z.array(z.enum(modules)).min(1),
        })
        .parse(body);
      if (d.startDate > d.endDate)
        throw new ApiError(
          422,
          "INVALID_DATES",
          "End date must follow start date.",
        );
      const plan = await one("SELECT * FROM saas_plans WHERE id=?", [d.planId]);
      if (!plan) throw new ApiError(422, "PLAN_REQUIRED", "Select a plan.");
      const old = await tenantSubscription(id),
        usage = await tenantUsage(id);
      if (
        d.studentLimit < usage.students ||
        d.userLimit < usage.users + usage.pendingUsers
      )
        throw new ApiError(
          409,
          "LIMIT_BELOW_USAGE",
          "Limits cannot be lower than current usage, including pending staff access.",
        );
      await batch([
        stmt(
          "UPDATE institution_subscriptions SET plan_id=?,status=?,start_date=?,end_date=?,student_limit=?,user_limit=?,modules=?,updated_at=?,updated_by=? WHERE institution_id=?",
          [
            d.planId,
            d.status,
            d.startDate,
            d.endDate,
            d.studentLimit,
            d.userLimit,
            JSON.stringify(d.modules),
            now(),
            actor.userId,
            id,
          ],
        ),
        stmt(
          "UPDATE institutions SET subscription=?,updated_at=?,updated_by=? WHERE id=?",
          [plan.name, now(), actor.userId, id],
        ),
        platformAudit(
          actor,
          "Updated institution subscription",
          "institution_subscriptions",
          old.id,
          old,
          d,
          id,
        ),
      ]);
      return { saved: true };
    }
    if (!action && method === "PATCH") {
      const d = z
        .object({
          name: z.string().trim().min(2).max(160),
          institutionType: z.enum([
            "School",
            "PU College",
            "College",
            "Academy",
            "Coaching Institute",
            "Other",
          ]),
          institutionCode: z
            .string()
            .trim()
            .regex(/^[A-Za-z0-9_-]{2,30}$/),
          email: z.string().trim().email().or(z.literal("")),
          phone: z.string().max(30),
          address: z.string().max(500),
          city: z.string().max(100),
          state: z.string().max(100),
          pincode: z
            .string()
            .regex(/^\d{6}$/)
            .or(z.literal("")),
          website: z.string().url().startsWith("https://").or(z.literal("")),
          primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
          status: z.enum(["Active", "Suspended", "Archived"]),
        })
        .parse(body);
      if (
        await one(
          "SELECT id FROM institutions WHERE upper(institution_code)=? AND id<>?",
          [d.institutionCode.toUpperCase(), id],
        )
      )
        throw new ApiError(
          409,
          "CODE_EXISTS",
          "Institution code is already in use.",
        );
      await batch([
        stmt(
          "UPDATE institutions SET name=?,institution_type=?,institution_code=?,email=?,phone=?,address=?,city=?,state=?,pincode=?,website=?,status=?,settings=?,updated_at=?,updated_by=? WHERE id=?",
          [
            d.name,
            d.institutionType,
            d.institutionCode.toUpperCase(),
            d.email.toLowerCase(),
            d.phone,
            d.address,
            d.city,
            d.state,
            d.pincode,
            d.website,
            d.status,
            JSON.stringify({
              ...JSON.parse(institution.settings),
              primaryColor: d.primaryColor,
            }),
            now(),
            actor.userId,
            id,
          ],
        ),
        platformAudit(
          actor,
          "Updated institution",
          "institutions",
          id,
          { name: institution.name, status: institution.status },
          d,
          id,
        ),
      ]);
      return { saved: true };
    }
  }
  if (kind === "support" && method === "POST") {
    const rows = await all(
      "SELECT id,institution_id FROM support_sessions WHERE user_id=? AND ended_at IS NULL",
      [actor.userId],
    );
    await batch([
      stmt(
        "UPDATE support_sessions SET ended_at=? WHERE user_id=? AND ended_at IS NULL",
        [now(), actor.userId],
      ),
      ...rows.map((s) =>
        platformAudit(
          actor,
          "Ended institution support access",
          "support_sessions",
          s.id,
          null,
          {},
          s.institution_id,
        ),
      ),
    ]);
    return {
      data: { ended: true },
      cookie:
        "campusledger_support=; Path=/api; Max-Age=0; HttpOnly; Secure; SameSite=Strict",
    };
  }
  if (kind === "plans" && (method === "POST" || method === "PATCH")) {
    const d = planSchema.parse(body),
      price = parseMoney(d.price),
      old = id ? await one("SELECT * FROM saas_plans WHERE id=?", [id]) : null,
      planId = id || uuid();
    if (id && !old) throw new ApiError(404, "NOT_FOUND", "Plan not found.");
    await batch([
      id
        ? stmt(
            "UPDATE saas_plans SET name=?,code=?,price_paise=?,billing_cycle=?,student_limit=?,user_limit=?,modules=?,status=?,updated_at=?,updated_by=? WHERE id=?",
            [
              d.name,
              d.code,
              price,
              d.billingCycle,
              d.studentLimit,
              d.userLimit,
              JSON.stringify(d.modules),
              d.status,
              now(),
              actor.userId,
              id,
            ],
          )
        : insert("saas_plans", {
            id: planId,
            name: d.name,
            code: d.code,
            price_paise: price,
            billing_cycle: d.billingCycle,
            student_limit: d.studentLimit,
            user_limit: d.userLimit,
            modules: JSON.stringify(d.modules),
            status: d.status,
            ...stamps(actor.userId),
          }),
      platformAudit(
        actor,
        id ? "Updated plan" : "Created plan",
        "saas_plans",
        planId,
        old,
        d,
      ),
    ]);
    return { id: planId };
  }
  if (kind === "payments" && method === "POST") {
    const d = z
      .object({
        institutionId: z.string(),
        amount: z.string(),
        method: z.enum(["Bank Transfer", "UPI", "Cash", "Card", "Cheque"]),
        reference: z.string().trim().min(2).max(160),
        paidDate: dateField,
        notes: z.string().max(500).default(""),
        idempotencyKey: z.string().min(16).max(80),
      })
      .parse(body);
    const amount = parseMoney(d.amount);
    if (amount <= 0)
      throw new ApiError(
        422,
        "INVALID_AMOUNT",
        "Amount must be greater than zero.",
      );
    const subscription = await tenantSubscription(d.institutionId),
      hash = await sha256(JSON.stringify({ ...d, idempotencyKey: undefined }));
    const existing = await one(
      "SELECT id,request_hash FROM subscription_payments WHERE institution_id=? AND idempotency_key=?",
      [d.institutionId, d.idempotencyKey],
    );
    if (existing) {
      if (existing.request_hash !== hash)
        throw new ApiError(
          409,
          "IDEMPOTENCY_CONFLICT",
          "This payment key was already used for another request.",
        );
      return { id: existing.id };
    }
    const paymentId = uuid();
    await batch([
      insert("subscription_payments", {
        id: paymentId,
        institution_id: d.institutionId,
        subscription_id: subscription.id,
        amount_paise: amount,
        method: d.method,
        reference: d.reference,
        paid_date: d.paidDate,
        notes: d.notes,
        idempotency_key: d.idempotencyKey,
        request_hash: hash,
        ...stamps(actor.userId),
      }),
      platformAudit(
        actor,
        "Recorded subscription payment",
        "subscription_payments",
        paymentId,
        null,
        { amountPaise: amount, reference: d.reference },
        d.institutionId,
      ),
    ]);
    return { id: paymentId };
  }
  if (kind === "settings" && method === "PATCH") {
    const d = z
        .object({
          supportEmail: z.string().email().or(z.literal("")),
          platformName: z.string().trim().min(2).max(80),
          expiryNoticeDays: z.number().int().min(1).max(90),
        })
        .parse(body),
      old = await one("SELECT value FROM platform WHERE key='settings'");
    await batch([
      stmt(
        "INSERT INTO platform(key,value) VALUES ('settings',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        [JSON.stringify(d)],
      ),
      platformAudit(
        actor,
        "Updated platform settings",
        "platform",
        "settings",
        old ? JSON.parse(old.value) : null,
        d,
      ),
    ]);
    return { saved: true };
  }
  throw new ApiError(404, "NOT_FOUND", "Platform route not found.");
}
