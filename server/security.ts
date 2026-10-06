import { env } from "cloudflare:workers";
import { normalizedPermissions, Permission } from "../lib/permissions";
import { all, insert, now, one, Row, stmt, uuid } from "./db";
export type Role =
  | "SUPER_ADMIN"
  | "INSTITUTION_ADMIN"
  | "ACCOUNTANT"
  | "FEE_COLLECTOR"
  | "FEE_COUNTER_CASHIER"
  | "AUDITOR"
  | "RECEPTIONIST"
  | "CUSTOM"
  | "TEACHER"
  | "PARENT"
  | "STUDENT";
export type Actor = {
  userId: string;
  name: string;
  email: string;
  institutionId: string;
  role: Role;
  parentId?: string;
  studentId?: string;
  sectionId?: string;
  feeVisibility: boolean;
  request: Request;
  permissions?: Permission[];
  platform?: boolean;
  supportSessionId?: string;
  portalGrantId?: string;
  organizationId?: string;
};
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export const deny = () => {
  throw new ApiError(
    403,
    "FORBIDDEN",
    "You do not have permission for this action.",
  );
};
export function permit(
  actor: Actor,
  permission:
    | "admin"
    | "collect"
    | "finance"
    | "students"
    | "refund"
    | "system"
    | Permission,
) {
  if (permission === "system") {
    if (actor.platform) return;
    deny();
  }
  const required: Permission =
    (
      {
        admin: "settings.manage",
        collect: "payments.collect",
        finance: "fees.view",
        students: "students.view",
        refund: "refunds.request",
      } as Record<string, Permission>
    )[permission] || (permission as Permission);
  if (!hasPermission(actor, required)) deny();
}
export function hasPermission(actor: Actor, permission: Permission) {
  return (actor.permissions || normalizedPermissions(actor.role)).includes(
    permission,
  );
}
export async function platformActor(request: Request): Promise<Actor> {
  const identity = await authenticate(request);
  if (
    !(await one(
      "SELECT user_id FROM platform_admins WHERE user_id=? AND active=1",
      [identity.userId],
    ))
  )
    deny();
  return {
    ...identity,
    institutionId: "",
    role: "SUPER_ADMIN",
    feeVisibility: false,
    permissions: [],
    platform: true,
    request,
  };
}
const LOCAL_AUTH_COOKIE = "sohan_local_auth";
const LOCAL_USERNAME = "test";
const LOCAL_EMAIL_FALLBACK = "test@sohan.local";

function localAuthSecret() {
  return (
    (env as typeof env & { LOCAL_AUTH_SECRET?: string }).LOCAL_AUTH_SECRET ||
    "sohan-soft-tech-local-auth-secret-change-me"
  );
}

function localOwnerEmail() {
  return (
    env.PLATFORM_OWNER_EMAIL?.trim().toLowerCase() || LOCAL_EMAIL_FALLBACK
  );
}

export async function createLocalSession(): Promise<string> {
  const payload = `${LOCAL_USERNAME}.${Date.now()}`;
  return payload + "." + (await hmac(localAuthSecret(), payload));
}

export async function verifyLocalSession(request: Request): Promise<boolean> {
  const cookie = request.headers
    .get("cookie")
    ?.split(";")
    .map((v) => v.trim())
    .find((v) => v.startsWith(LOCAL_AUTH_COOKIE + "="))
    ?.slice(LOCAL_AUTH_COOKIE.length + 1);
  if (!cookie) return false;
  const parts = cookie.split(".");
  if (parts.length !== 3 || parts[0] !== LOCAL_USERNAME) return false;
  const timestamp = Number(parts[1]);
  if (!Number.isFinite(timestamp) || Date.now() - timestamp > 1000 * 60 * 60 * 24 * 7)
    return false;
  return constantEqual(
    parts[2],
    await hmac(localAuthSecret(), `${parts[0]}.${parts[1]}`),
  );
}

export function localSessionCookie(token: string, maxAge = 60 * 60 * 24 * 7) {
  return `${LOCAL_AUTH_COOKIE}=${token}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax`;
}

export function clearedLocalSessionCookie() {
  return `${LOCAL_AUTH_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`;
}

export async function authenticate(
  request: Request,
): Promise<{ userId: string; name: string; email: string }> {
  if (await verifyLocalSession(request)) {
    const email = localOwnerEmail();
    const userId = await accountIdForEmail(email);
    return { userId, name: "Test Administrator", email };
  }

  throw new ApiError(
    401,
    "AUTH_REQUIRED",
    "Sign in to access Sohan Soft Tech.",
  );
}
export async function accountIdForEmail(email: string): Promise<string> {
  const accounts = await all<{
    id: string;
    is_owner: number;
    has_membership: number;
  }>(
    `SELECT u.id,CASE WHEN u.id=(SELECT value FROM platform WHERE key='owner') THEN 1 ELSE 0 END is_owner,
      EXISTS(SELECT 1 FROM memberships m WHERE m.user_id=u.id) has_membership
     FROM users u WHERE u.email=? ORDER BY is_owner DESC,has_membership DESC,u.created_at,u.id LIMIT 3`,
    [email],
  );
  const owner = accounts.find((account) => account.is_owner);
  const members = accounts.filter((account) => account.has_membership);
  if (!owner && members.length > 1)
    throw new ApiError(
      403,
      "ACCOUNT_AMBIGUOUS",
      "Your account could not be matched. Contact your institution administrator.",
    );
  // Keep the account that owns memberships and financial history. Legacy empty
  // duplicate rows remain intact; they never acquire permissions from a subject.
  return (
    owner?.id ||
    members[0]?.id ||
    accounts[0]?.id ||
    "email-" + (await sha256(email))
  );
}
export async function actorFor(request: Request): Promise<Actor> {
  const identity = await authenticate(request),
    institutionId = request.headers.get("x-institution-id");
  if (!institutionId)
    throw new ApiError(
      400,
      "TENANT_REQUIRED",
      "Open your institution portal to continue.",
    );
  const institution = await one(
    "SELECT id,status,organization_id FROM institutions WHERE id=?",
    [institutionId],
  );
  if (!institution)
    throw new ApiError(404, "NOT_FOUND", "Institution not found.");
  const isPlatform = !!(await one(
    "SELECT user_id FROM platform_admins WHERE user_id=? AND active=1",
    [identity.userId],
  ));
  const cookie = request.headers
    .get("cookie")
    ?.split(";")
    .map((v) => v.trim())
    .find((v) => v.startsWith("campusledger_support="))
    ?.slice("campusledger_support=".length);
  if (isPlatform && cookie) {
    const support = await one(
      "SELECT id FROM support_sessions WHERE token_hash=? AND user_id=? AND institution_id=? AND ended_at IS NULL AND expires_at>?",
      [await sha256(cookie), identity.userId, institutionId, now()],
    );
    if (support)
      return {
        ...identity,
        institutionId,
        organizationId: institution.organization_id || undefined,
        role: "INSTITUTION_ADMIN",
        feeVisibility: true,
        permissions: normalizedPermissions("INSTITUTION_ADMIN"),
        platform: false,
        supportSessionId: support.id,
        request,
      };
  }
  if (institution.status !== "Active")
    throw new ApiError(
      403,
      "INSTITUTION_UNAVAILABLE",
      "This institution is suspended or archived. Contact the platform administrator.",
    );
  const members = await all(
    "SELECT m.* FROM memberships m WHERE m.user_id=? AND m.active=1 AND m.institution_id=? AND m.role NOT IN ('SUPER_ADMIN','PARENT','STUDENT')",
    [identity.userId, institutionId],
  );
  const m = members[0];
  if (!m)
    throw new ApiError(
      403,
      "MEMBERSHIP_REQUIRED",
      isPlatform
        ? "Start an audited support session from Platform → Institutions."
        : "Ask your institution administrator to grant staff access to your email address.",
    );
  return {
    ...identity,
    institutionId: m.institution_id,
    organizationId: institution.organization_id || undefined,
    role: m.role,
    parentId: m.parent_id,
    studentId: m.student_id,
    sectionId: m.section_id,
    feeVisibility: !!m.fee_visibility,
    permissions: normalizedPermissions(
      m.role,
      JSON.parse(m.permissions || "[]"),
    ),
    request,
  };
}
export async function own(
  actor: Actor,
  table: string,
  id: string,
  yearId?: string,
): Promise<Row> {
  if (!/^[a-z_]+$/.test(table)) throw new Error("Invalid identifier");
  const record = await one(
    `SELECT * FROM ${table} WHERE institution_id=? AND id=? ${yearId ? "AND academic_year_id=?" : ""}`,
    yearId ? [actor.institutionId, id, yearId] : [actor.institutionId, id],
  );
  if (!record)
    throw new ApiError(
      404,
      "NOT_FOUND",
      "The requested record could not be found.",
    );
  return record;
}
export async function accessStudent(
  actor: Actor,
  studentId: string,
  yearId?: string,
) {
  await own(actor, "students", studentId);
  permit(actor, "students.view");
  if (
    actor.portalGrantId &&
    !(await one(
      "SELECT id FROM student_parents WHERE institution_id=? AND student_id=? AND parent_id=?",
      [actor.institutionId, studentId, actor.parentId],
    ))
  )
    throw new ApiError(404, "NOT_FOUND", "Student not found.");
  if (actor.role !== "TEACHER") return;
  if (
    actor.role === "TEACHER" &&
    actor.sectionId &&
    (await one(
      `SELECT id FROM enrollments WHERE institution_id=? AND section_id=? AND student_id=? ${yearId ? "AND academic_year_id=?" : ""}`,
      yearId
        ? [actor.institutionId, actor.sectionId, studentId, yearId]
        : [actor.institutionId, actor.sectionId, studentId],
    ))
  )
    return;
  deny();
}
export function audit(
  actor: Actor,
  action: string,
  entity: string,
  entityId: string,
  oldValue: unknown,
  newValue: unknown,
) {
  return insert("audit_logs", {
    id: uuid(),
    institution_id: actor.institutionId,
    user_id: actor.userId,
    user_name: actor.name,
    action,
    entity,
    entity_id: entityId,
    old_value: oldValue == null ? null : JSON.stringify(oldValue),
    new_value: newValue == null ? null : JSON.stringify(newValue),
    ip: actor.request.headers.get("cf-connecting-ip"),
    user_agent: actor.request.headers.get("user-agent")?.slice(0, 256),
    created_at: now(),
    support_session_id: actor.supportSessionId || null,
  });
}
export function csrf(request: Request) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return;
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    throw new ApiError(403, "CSRF_REJECTED", "Request origin is not allowed.");
  if (request.headers.get("sec-fetch-site") === "cross-site")
    throw new ApiError(
      403,
      "CSRF_REJECTED",
      "Cross-site requests are not allowed.",
    );
  if (!request.headers.get("content-type")?.includes("application/json"))
    throw new ApiError(
      415,
      "JSON_REQUIRED",
      "Use an application/json request.",
    );
}
export async function rateLimit(
  request: Request,
  identity: string,
  limit = 180,
) {
  const window = Math.floor(Date.now() / 60000),
    key = `${identity}:${window}`;
  const result = await stmt(
    "INSERT INTO rate_limits(key,count,window) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count",
    [key, window],
  ).first<{ count: number }>();
  if ((result?.count ?? 0) > limit)
    throw new ApiError(
      429,
      "RATE_LIMITED",
      "Too many requests. Please try again in a minute.",
    );
}
export async function sha256(value: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
}
export async function hmac(secret: string, value: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return Array.from(
    new Uint8Array(
      await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)),
    ),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
}
export function constantEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
