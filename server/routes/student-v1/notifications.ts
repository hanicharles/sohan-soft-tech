import { all, insert, now, one, run, stmt, uuid } from "../../db";
import { Actor, ApiError, rateLimit } from "../../security";
import { ok, RouteContext } from "../shared";
import {
  createPortalNotification,
  parsePagination,
  paginatedResponse,
  resolveStudent,
  sanitizeText,
  validateInternalActionUrl,
  StudentContext,
} from "./shared";

export async function handleNotifications(ctx: RouteContext, subPath: string[]): Promise<Response | null> {
  const { actor, method, p, body, requestId, request } = ctx;
  const sCtx = await resolveStudent(actor);
  const { studentId, institutionId } = sCtx;

  // 1. POST /notifications/read-all -> Mark all as read
  if (subPath[0] === "notifications" && subPath.length === 2 && subPath[1] === "read-all" && method === "POST") {
    const timestamp = now();
    await run(
      `UPDATE student_portal_notifications 
       SET is_read = 1, read_at = ?, updated_at = ? 
       WHERE institution_id = ? AND student_id = ? AND is_read = 0`,
      [timestamp, timestamp, institutionId, studentId],
    );
    return ok({ success: true, markedAllRead: true, timestamp }, requestId);
  }

  // 2. POST /notifications/:id/read -> Mark single notification as read
  if (subPath[0] === "notifications" && subPath.length === 3 && subPath[2] === "read" && method === "POST") {
    const notifId = subPath[1];
    const notif = await one<{ id: string }>(
      "SELECT id FROM student_portal_notifications WHERE id=? AND institution_id=? AND student_id=? LIMIT 1",
      [notifId, institutionId, studentId],
    );

    if (!notif) {
      throw new ApiError(404, "NOTIFICATION_NOT_FOUND", "Notification not found.");
    }

    const timestamp = now();
    await run(
      `UPDATE student_portal_notifications 
       SET is_read = 1, read_at = ?, updated_at = ? 
       WHERE id = ? AND institution_id = ? AND student_id = ?`,
      [timestamp, timestamp, notifId, institutionId, studentId],
    );

    return ok({ success: true, id: notifId, isRead: true, readAt: timestamp }, requestId);
  }

  // 3. GET /notifications -> List with type filter and pagination
  if (subPath[0] === "notifications" && subPath.length === 1 && method === "GET") {
    const { offset, limit, page, pageSize } = parsePagination(p);
    const typeFilter = sanitizeText(p.get("type") || "");
    const unreadOnly = p.get("unread") === "1" || p.get("unread") === "true";

    const conditions: string[] = ["institution_id = ?", "student_id = ?"];
    const params: any[] = [institutionId, studentId];

    if (typeFilter) {
      conditions.push("lower(type) = lower(?)");
      params.push(typeFilter);
    }

    if (unreadOnly) {
      conditions.push("is_read = 0");
    }

    const whereClause = conditions.join(" AND ");

    // Count unread notifications
    const unreadCountRow = await one<{ cnt: number }>(
      "SELECT COUNT(*) as cnt FROM student_portal_notifications WHERE institution_id=? AND student_id=? AND is_read=0",
      [institutionId, studentId],
    );
    const unreadCount = unreadCountRow?.cnt ?? 0;

    // Total count for current filter
    const totalRow = await one<{ cnt: number }>(
      `SELECT COUNT(*) as cnt FROM student_portal_notifications WHERE ${whereClause}`,
      params,
    );
    const total = totalRow?.cnt ?? 0;

    const rows = await all<Record<string, any>>(
      `SELECT * FROM student_portal_notifications 
       WHERE ${whereClause} 
       ORDER BY created_at DESC 
       LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );

    const items = rows.map((r) => {
      // Validate actionUrl is safe internal route (throw error if external)
      const safeActionUrl = validateInternalActionUrl(r.action_url);

      return {
        id: r.id,
        type: r.type,
        title: r.title,
        message: r.message,
        actionUrl: safeActionUrl,
        isRead: Boolean(r.is_read),
        readAt: r.read_at || null,
        createdAt: r.created_at,
      };
    });

    const responseData = {
      ...paginatedResponse(items, total, page, pageSize),
      unreadCount,
    };

    return ok(responseData, requestId);
  }

  return null;
}
