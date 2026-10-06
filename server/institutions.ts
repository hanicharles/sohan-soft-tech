import { z } from "zod";
import { dateField, invite } from "./catalog";
import { all, batch, insert, one, Row, stamps, today, uuid } from "./db";
import { paging } from "./queries";
import { Actor, ApiError, permit } from "./security";
import { defaultSettings } from "./seed";
import { platformAudit } from "./tenancy";

export async function createInstitution(actor: Actor, input: unknown) {
  permit(actor, "system");
  const d = z
    .object({
      name: z.string().trim().min(2).max(160),
      address: z.string().trim().max(500).default(""),
      email: z.union([z.string().trim().email(), z.literal("")]).default(""),
      phone: z.string().trim().max(30).default(""),
      institutionType: z
        .enum([
          "School",
          "PU College",
          "College",
          "Academy",
          "Coaching Institute",
          "Other",
        ])
        .default("School"),
      institutionCode: z
        .string()
        .trim()
        .min(2)
        .max(30)
        .regex(/^[A-Za-z0-9_-]+$/),
      city: z.string().trim().max(100).default(""),
      state: z.string().trim().max(100).default(""),
      pincode: z
        .string()
        .regex(/^\d{6}$/)
        .or(z.literal(""))
        .default(""),
      website: z
        .string()
        .url()
        .startsWith("https://")
        .or(z.literal(""))
        .default(""),
      primaryColor: z
        .string()
        .regex(/^#[0-9a-fA-F]{6}$/)
        .default("#3348d8"),
      adminEmail: z.string().trim().email(),
      adminName: z.string().trim().min(2).max(160),
      adminMobile: z
        .string()
        .trim()
        .regex(/^(\+91[- ]?)?[6-9]\d{9}$/),
      planId: z.string(),
      subscriptionStatus: z.enum(["Trial", "Active"]).default("Trial"),
      subscriptionStart: dateField,
      subscriptionEnd: dateField,
      subscription: z
        .enum(["Starter", "Professional", "Enterprise"])
        .default("Professional"),
      setupAcademic: z.boolean().default(false),
      yearName: z.string().trim().min(2).max(30).default("2026–27"),
      startDate: dateField.default("2026-06-01"),
      endDate: dateField.default("2027-05-31"),
    })
    .parse(input);
  if (d.setupAcademic && d.startDate >= d.endDate)
    throw new ApiError(
      422,
      "INVALID_DATES",
      "The academic year must end after its start date.",
    );
  if (d.subscriptionStart > d.subscriptionEnd)
    throw new ApiError(
      422,
      "INVALID_DATES",
      "Subscription must end after its start date.",
    );
  const plan = await one(
    "SELECT * FROM saas_plans WHERE id=? AND status='Active'",
    [d.planId],
  );
  if (!plan) throw new ApiError(422, "PLAN_REQUIRED", "Select an active plan.");
  if (
    await one("SELECT id FROM institutions WHERE upper(institution_code)=?", [
      d.institutionCode.toUpperCase(),
    ])
  )
    throw new ApiError(
      409,
      "CODE_EXISTS",
      "This institution code is already in use.",
    );
  let slug =
    d.name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 70) || "institution";
  if (await one("SELECT id FROM institutions WHERE slug=?", [slug]))
    slug += "-" + uuid().slice(0, 8);
  const id = uuid(),
    campusId = uuid(),
    yearId = uuid(),
    base = { institution_id: id, ...stamps(actor.userId) };
  const statements = [
    insert("institutions", {
      id,
      name: d.name,
      slug,
      institution_type: d.institutionType,
      institution_code: d.institutionCode.toUpperCase(),
      city: d.city,
      state: d.state,
      pincode: d.pincode,
      website: d.website,
      address: d.address,
      email: d.email.toLowerCase(),
      phone: d.phone,
      subscription: plan.name,
      settings: JSON.stringify({
        ...defaultSettings,
        primaryColor: d.primaryColor,
      }),
      ...stamps(actor.userId),
    }),
    insert("institution_subscriptions", {
      id: uuid(),
      ...base,
      plan_id: plan.id,
      status: d.subscriptionStatus,
      start_date: d.subscriptionStart,
      end_date: d.subscriptionEnd,
      student_limit: plan.student_limit,
      user_limit: plan.user_limit,
      modules: plan.modules,
    }),
    insert("campuses", {
      id: campusId,
      ...base,
      name: "Main campus",
      address: d.address,
    }),
  ];
  if (d.adminEmail)
    statements.push(
      insert("invitations", {
        id: uuid(),
        ...base,
        email: d.adminEmail.toLowerCase(),
        role: "INSTITUTION_ADMIN",
        display_name: d.adminName,
        mobile: d.adminMobile,
        permissions: "[]",
      }),
    );
  if (d.setupAcademic) {
    statements.push(
      insert("academic_years", {
        id: yearId,
        ...base,
        name: d.yearName,
        start_date: d.startDate,
        end_date: d.endDate,
        status: "Active",
      }),
    );
    const streams = ["Science", "Commerce"].map((name) => ({
      id: uuid(),
      name,
    }));
    for (const stream of streams)
      statements.push(insert("streams", { ...stream, ...base }));
    const names = [
      "Pre-KG",
      "LKG",
      "UKG",
      "1st",
      "2nd",
      "3rd",
      "4th",
      "5th",
      "6th",
      "7th",
      "8th",
      "9th",
      "10th",
      "1st PUC",
      "2nd PUC",
    ];
    names.forEach((name, order) => {
      const classId = uuid();
      statements.push(
        insert("classes", {
          id: classId,
          ...base,
          name,
          level:
            order < 3 ? "Pre-Primary" : order < 13 ? "School" : "PU College",
          sort_order: order,
        }),
      );
      const sectionStreams = order < 13 ? [null] : streams;
      for (const stream of sectionStreams)
        statements.push(
          insert("sections", {
            id: uuid(),
            ...base,
            academic_year_id: yearId,
            class_id: classId,
            campus_id: campusId,
            stream_id: stream?.id || null,
            name: "A",
          }),
        );
    });
    [
      "Tuition Fee",
      "Admission Fee",
      "Development Fee",
      "Examination Fee",
      "Transport Fee",
      "Lab Fee",
      "Library Fee",
    ].forEach((name, sort_order) =>
      statements.push(
        insert("fee_components", {
          id: uuid(),
          ...base,
          name,
          category: name === "Transport Fee" ? "Services" : "Academic",
          sort_order,
        }),
      ),
    );
  }
  statements.push(
    platformAudit(
      actor,
      "Created institution and administrator access",
      "institutions",
      id,
      null,
      { ...d, loginMethod: "Local" },
      id,
    ),
  );
  await batch(statements);
  return {
    id,
    slug,
    portalPath: "/campus/" + slug,
    adminEmail: d.adminEmail.toLowerCase(),
    adminAccess: d.adminEmail ? "Pending" : null,
    academicYearId: d.setupAcademic ? yearId : null,
    loginMethod: "Local",
  };
}

export async function platformDashboard(actor: Actor) {
  permit(actor, "system");
  const configured = JSON.parse(
    (await one("SELECT value FROM platform WHERE key='settings'"))?.value ||
      "{}",
  );
  const expiryNoticeDays = Math.min(
    90,
    Math.max(1, Number(configured.expiryNoticeDays) || 30),
  );
  const [stats, subscriptions, growth, distribution, usage, activity] =
    await Promise.all([
      one(
        "SELECT COUNT(*) institutions,SUM(status='Active') active,SUM(status='Suspended') suspended,(SELECT COUNT(*) FROM students WHERE status='Active') students,(SELECT COUNT(*) FROM memberships WHERE active=1 AND role NOT IN ('SUPER_ADMIN','PARENT','STUDENT')) users FROM institutions",
      ),
      one(
        "SELECT SUM(status='Trial' AND end_date>=?) trial,SUM(status='Active' AND start_date<=? AND end_date>=?) activeSubscriptions,SUM(status IN ('Active','Trial') AND end_date BETWEEN ? AND date(?,'+'||?||' days')) expiring FROM institution_subscriptions",
        [today(), today(), today(), today(), today(), expiryNoticeDays],
      ),
      all(
        "SELECT substr(created_at,1,7) month,COUNT(*) count FROM institutions GROUP BY month ORDER BY month DESC LIMIT 12",
      ),
      all(
        "SELECT CASE WHEN s.status IN ('Active','Trial','Past Due') AND s.end_date<? THEN 'Expired' ELSE s.status END status,COUNT(*) count FROM institution_subscriptions s GROUP BY 1",
        [today()],
      ),
      all(
        "SELECT i.name,(SELECT COUNT(*) FROM students st WHERE st.institution_id=i.id AND st.status='Active') students,s.student_limit FROM institutions i JOIN institution_subscriptions s ON s.institution_id=i.id ORDER BY students DESC LIMIT 10",
      ),
      all(
        "SELECT a.*,i.name institution_name FROM platform_audit_logs a LEFT JOIN institutions i ON i.id=a.institution_id ORDER BY a.created_at DESC LIMIT 8",
      ),
    ]);
  return {
    ...stats,
    ...subscriptions,
    expiryNoticeDays,
    growth: growth.reverse(),
    distribution,
    usage,
    activity,
  };
}

export async function listInstitutions(actor: Actor, p: URLSearchParams) {
  permit(actor, "system");
  const page = paging(p),
    query = p.get("q")?.trim() || "",
    status = p.get("status") || "";
  const clauses: string[] = [],
    values: unknown[] = [];
  if (query) {
    clauses.push("(i.name LIKE ? OR i.email LIKE ? OR i.address LIKE ?)");
    values.push(...Array(3).fill("%" + query + "%"));
  }
  if (status) {
    clauses.push("i.status=?");
    values.push(status);
  }
  const where = clauses.length ? " WHERE " + clauses.join(" AND ") : "";
  const total = await one(
    "SELECT COUNT(*) count FROM institutions i" + where,
    values,
  );
  const rows = await all(
    `SELECT i.id,i.name,i.slug,i.institution_type,i.institution_code,i.city,i.state,i.address,i.email,i.phone,i.status,i.subscription,i.created_at,s.status subscription_status,s.end_date,s.student_limit,s.user_limit,p.name plan_name,
    (SELECT COUNT(*) FROM memberships m WHERE m.institution_id=i.id AND m.active=1 AND m.role NOT IN ('SUPER_ADMIN','PARENT','STUDENT')) user_count,
    (SELECT COUNT(*) FROM students s WHERE s.institution_id=i.id AND s.status='Active') student_count,
    (SELECT GROUP_CONCAT(u.email, ', ') FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.institution_id=i.id AND m.role='INSTITUTION_ADMIN' AND m.active=1) admin_emails,
    (SELECT GROUP_CONCAT(v.email, ', ') FROM invitations v WHERE v.institution_id=i.id AND v.role='INSTITUTION_ADMIN' AND v.status='Pending') pending_admin_emails
    FROM institutions i LEFT JOIN institution_subscriptions s ON s.institution_id=i.id LEFT JOIN saas_plans p ON p.id=s.plan_id${where} ORDER BY i.created_at DESC,i.name LIMIT ? OFFSET ?`,
    [...values, page.size, page.offset],
  );
  return { rows, total: total?.count || 0, ...page };
}

export async function grantInstitutionAdmin(
  actor: Actor,
  institutionId: string,
  input: Row,
) {
  permit(actor, "system");
  if (!(await one("SELECT id FROM institutions WHERE id=?", [institutionId])))
    throw new ApiError(404, "NOT_FOUND", "Institution not found.");
  // A platform grant is always scoped to this institution; it cannot mint a
  // Super Admin role or reuse caller-supplied parent/student identities.
  return invite(
    {
      ...actor,
      platform: false,
      institutionId,
      role: "INSTITUTION_ADMIN",
      permissions: undefined,
    },
    {
      email: input.email,
      fullName: input.fullName,
      mobile: input.mobile,
      role: "INSTITUTION_ADMIN",
    },
  );
}
