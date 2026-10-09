import { z } from "zod";
import { all, insert, now, one, run, stmt, uuid } from "../../db";
import {
  Actor,
  ApiError,
  audit,
  constantEqual,
  hmac,
  localAuthSecret,
  rateLimit,
} from "../../security";

export type StudentContext = {
  studentId: string;
  institutionId: string;
  student: Record<string, any>;
  actor: Actor;
};

/**
 * Object-level authorization guard for Student Portal:
 * - Requires actor.role === 'STUDENT'
 * - Resolves studentId and institutionId ONLY from actor (never from request body/query/params)
 * - Verifies the student is active in the database
 * - Throws 403 FORBIDDEN for non-students
 */
export async function resolveStudent(actor: Actor): Promise<StudentContext> {
  if (actor.role !== "STUDENT") {
    throw new ApiError(403, "FORBIDDEN", "Only students can access the student portal.");
  }

  const institutionId = actor.institutionId;
  let studentId = actor.studentId;

  if (!studentId) {
    const mem = await one<{ student_id: string }>(
      "SELECT student_id FROM memberships WHERE institution_id=? AND user_id=? AND active=1 AND student_id IS NOT NULL LIMIT 1",
      [institutionId, actor.userId],
    );
    studentId = mem?.student_id;
  }

  if (!studentId) {
    throw new ApiError(403, "STUDENT_REQUIRED", "No student profile is associated with this account.");
  }

  const student = await one<Record<string, any>>(
    "SELECT * FROM students WHERE id=? AND institution_id=? AND status='Active' LIMIT 1",
    [studentId, institutionId],
  );

  if (!student) {
    throw new ApiError(404, "STUDENT_NOT_FOUND", "Active student record not found.");
  }

  return { studentId, institutionId, student, actor };
}

/**
 * Text sanitizer: trims text, strips dangerous HTML tags & scripts to prevent XSS.
 */
export function sanitizeText(text: unknown): string {
  if (typeof text !== "string") return "";
  return text
    .trim()
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<[^>]*>/g, "");
}

/**
 * Validates and extracts pagination parameters.
 */
export function parsePagination(p: URLSearchParams, defaultPageSize = 20, maxPageSize = 100) {
  const page = Math.max(1, parseInt(p.get("page") || "1", 10) || 1);
  const requestedSize = parseInt(p.get("pageSize") || p.get("limit") || String(defaultPageSize), 10);
  const pageSize = Math.min(maxPageSize, Math.max(1, isNaN(requestedSize) ? defaultPageSize : requestedSize));
  const offset = (page - 1) * pageSize;
  const sort = sanitizeText(p.get("sort") || "");
  const order = (p.get("order") || "desc").toLowerCase() === "asc" ? "ASC" : "DESC";
  return { page, pageSize, offset, limit: pageSize, sort, order };
}

/**
 * Formats a paginated list response with standard metadata.
 */
export function paginatedResponse<T>(items: T[], total: number, page: number, pageSize: number) {
  return {
    items,
    rows: items, // alias for backwards compatibility
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize) || 1,
    hasMore: page * pageSize < total,
  };
}

/**
 * Creates short-lived signed HMAC token for authorized document viewing/downloads.
 */
export async function createDocumentToken(
  institutionId: string,
  studentId: string,
  documentId: string,
  expiresInSeconds = 900, // 15 minutes
): Promise<string> {
  const exp = Date.now() + expiresInSeconds * 1000;
  const payload = `${institutionId}:${studentId}:${documentId}:${exp}`;
  const sig = await hmac(localAuthSecret(), payload);
  return `${Buffer.from(payload).toString("base64url")}.${sig}`;
}

/**
 * Verifies short-lived signed document token.
 */
export async function verifyDocumentToken(
  token: string,
): Promise<{ institutionId: string; studentId: string; documentId: string } | null> {
  try {
    const parts = token.split(".");
    if (parts.length !== 2) return null;
    const [b64Payload, sig] = parts;
    const payload = Buffer.from(b64Payload, "base64url").toString("utf8");
    const [institutionId, studentId, documentId, expStr] = payload.split(":");
    if (!institutionId || !studentId || !documentId || !expStr) return null;
    const exp = parseInt(expStr, 10);
    if (!Number.isFinite(exp) || Date.now() > exp) return null;

    const expectedSig = await hmac(localAuthSecret(), payload);
    if (!constantEqual(sig, expectedSig)) return null;

    return { institutionId, studentId, documentId };
  } catch {
    return null;
  }
}

/**
 * Internal route validator for notification action URLs (reject external protocols / hosts).
 */
export function validateInternalActionUrl(url: string | null | undefined): string {
  if (!url) return "/portal";
  const clean = url.trim();
  if (
    clean.startsWith("http:") ||
    clean.startsWith("https:") ||
    clean.startsWith("//") ||
    clean.startsWith("javascript:") ||
    clean.startsWith("data:")
  ) {
    throw new ApiError(400, "INVALID_ACTION_URL", "Action URL must be an internal portal route.");
  }
  return clean.startsWith("/") ? clean : `/${clean}`;
}

/**
 * Creates an in-app portal notification automatically on system actions.
 */
export async function createPortalNotification(opts: {
  institutionId: string;
  studentId: string;
  type: string;
  title: string;
  message: string;
  actionUrl: string;
  actorId?: string;
}) {
  const safeActionUrl = validateInternalActionUrl(opts.actionUrl);
  const id = uuid();
  const createdBy = opts.actorId || "system";
  await run(
    `INSERT INTO student_portal_notifications(id, institution_id, student_id, type, title, message, action_url, is_read, read_at, created_at, updated_at, created_by, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, NULL, ?, ?, ?, ?)`,
    [
      id,
      opts.institutionId,
      opts.studentId,
      opts.type,
      opts.title,
      opts.message,
      safeActionUrl,
      now(),
      now(),
      createdBy,
      createdBy,
    ],
  );
  return id;
}

/**
 * Logs an audit trail entry for critical student actions (payments, certificates, tickets).
 */
export async function recordStudentAudit(
  actor: Actor,
  action: string,
  entity: string,
  entityId: string,
  oldValue: unknown = null,
  newValue: unknown = null,
) {
  try {
    await run(
      `INSERT INTO audit_logs(id, institution_id, user_id, user_name, action, entity, entity_id, old_value, new_value, ip, user_agent, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uuid(),
        actor.institutionId,
        actor.userId,
        actor.name || "Student",
        action,
        entity,
        entityId,
        oldValue == null ? null : JSON.stringify(oldValue),
        newValue == null ? null : JSON.stringify(newValue),
        actor.request.headers.get("cf-connecting-ip") || "127.0.0.1",
        actor.request.headers.get("user-agent")?.slice(0, 256) || "Portal Browser",
        now(),
      ],
    );
  } catch (err) {
    console.warn("Audit logging notice:", err);
  }
}
