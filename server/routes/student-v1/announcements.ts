import { all, insert, now, one, run, stmt, uuid } from "../../db";
import { Actor, ApiError, rateLimit } from "../../security";
import { ok, RouteContext } from "../shared";
import {
  parsePagination,
  paginatedResponse,
  resolveStudent,
  sanitizeText,
  StudentContext,
} from "./shared";

export async function handleAnnouncements(ctx: RouteContext, subPath: string[]): Promise<Response | null> {
  const { actor, method, p, requestId, request } = ctx;
  const sCtx = await resolveStudent(actor);
  const { studentId, institutionId, student } = sCtx;

  // Resolve student academic scope (enrollment, class, section, program, department)
  const enrollment = await one<Record<string, any>>(
    `SELECT e.class_id, e.section_id, sec.class_id as sec_class_id, p.id as program_id, d.id as department_id
     FROM enrollments e
     LEFT JOIN sections sec ON sec.id = e.section_id
     LEFT JOIN programs p ON p.id = (SELECT program_id FROM students WHERE id=e.student_id)
     LEFT JOIN departments d ON d.id = p.department_id
     WHERE e.institution_id=? AND e.student_id=?
     ORDER BY e.created_at DESC LIMIT 1`,
    [institutionId, studentId],
  );

  const studentClassId = enrollment?.class_id || enrollment?.sec_class_id || "";
  const studentSectionId = enrollment?.section_id || "";
  const studentProgId = enrollment?.program_id || "";
  const studentDeptId = enrollment?.department_id || "";

  // 1. GET /announcements -> List targeted announcements
  if (subPath[0] === "announcements" && subPath.length === 1 && method === "GET") {
    const { offset, limit, page, pageSize } = parsePagination(p);
    const search = sanitizeText(p.get("search") || p.get("q") || "");
    const scopeFilter = sanitizeText(p.get("scope") || "");
    const nowIso = now();

    // Hide expired announcements and target by institute, dept, program, class, section, group
    const conditions: string[] = [
      "a.institution_id = ?",
      "(a.expires_at IS NULL OR a.expires_at > ?)",
      `(
        a.target_scope IN ('Institute', 'All', '') OR
        (a.target_scope = 'Department' AND a.department_id = ?) OR
        (a.target_scope = 'Program' AND a.program_id = ?) OR
        (a.target_scope = 'Class' AND a.class_id = ?) OR
        (a.target_scope = 'Section' AND a.section_id = ?) OR
        (a.target_scope = 'StudentGroup' AND a.student_group IS NOT NULL AND a.student_group != '')
      )`,
    ];
    const params: any[] = [institutionId, nowIso, studentDeptId, studentProgId, studentClassId, studentSectionId];

    if (search) {
      conditions.push("(lower(a.title) LIKE ? OR lower(a.content) LIKE ?)");
      const term = `%${search.toLowerCase()}%`;
      params.push(term, term);
    }

    if (scopeFilter) {
      conditions.push("lower(a.target_scope) = lower(?)");
      params.push(scopeFilter);
    }

    const whereClause = conditions.join(" AND ");

    const countRow = await one<{ total: number }>(
      `SELECT COUNT(*) as total FROM campus_announcements a WHERE ${whereClause}`,
      params,
    );
    const total = countRow?.total ?? 0;

    const rows = await all<Record<string, any>>(
      `SELECT 
        a.*,
        EXISTS(
          SELECT 1 FROM student_announcement_reads r 
          WHERE r.announcement_id = a.id AND r.student_id = ?
        ) as is_read
       FROM campus_announcements a
       WHERE ${whereClause}
       ORDER BY a.is_pinned DESC, a.published_at DESC, a.created_at DESC
       LIMIT ? OFFSET ?`,
      [studentId, ...params, limit, offset],
    );

    const items = rows.map((r) => {
      let parsedAttachments: any[] = [];
      try {
        parsedAttachments = typeof r.attachments === "string" ? JSON.parse(r.attachments) : r.attachments || [];
      } catch {
        parsedAttachments = [];
      }

      return {
        id: r.id,
        title: r.title,
        content: r.content,
        category: r.category,
        priority: r.priority,
        targetScope: r.target_scope,
        studentGroup: r.student_group || null,
        isPinned: Boolean(r.is_pinned),
        publishedAt: r.published_at,
        expiresAt: r.expires_at || null,
        authorName: r.author_name || "Administration",
        attachments: parsedAttachments,
        isRead: Boolean(r.is_read),
        createdAt: r.created_at,
      };
    });

    return ok(paginatedResponse(items, total, page, pageSize), requestId);
  }

  // 2. GET /announcements/:id -> Details
  if (subPath[0] === "announcements" && subPath.length === 2 && subPath[1] !== "read" && method === "GET") {
    const annId = subPath[1];
    const ann = await one<Record<string, any>>(
      `SELECT 
        a.*,
        EXISTS(
          SELECT 1 FROM student_announcement_reads r 
          WHERE r.announcement_id = a.id AND r.student_id = ?
        ) as is_read,
        (
          SELECT r.read_at FROM student_announcement_reads r 
          WHERE r.announcement_id = a.id AND r.student_id = ? LIMIT 1
        ) as read_at
       FROM campus_announcements a
       WHERE a.id=? AND a.institution_id=?
       LIMIT 1`,
      [studentId, studentId, annId, institutionId],
    );

    if (!ann) {
      throw new ApiError(404, "ANNOUNCEMENT_NOT_FOUND", "Announcement not found.");
    }

    let parsedAttachments: any[] = [];
    try {
      parsedAttachments = typeof ann.attachments === "string" ? JSON.parse(ann.attachments) : ann.attachments || [];
    } catch {
      parsedAttachments = [];
    }

    return ok(
      {
        id: ann.id,
        title: ann.title,
        content: ann.content,
        category: ann.category,
        priority: ann.priority,
        targetScope: ann.target_scope,
        studentGroup: ann.student_group || null,
        isPinned: Boolean(ann.is_pinned),
        publishedAt: ann.published_at,
        expiresAt: ann.expires_at || null,
        authorName: ann.author_name,
        attachments: parsedAttachments,
        isRead: Boolean(ann.is_read),
        readAt: ann.read_at || null,
        createdAt: ann.created_at,
      },
      requestId,
    );
  }

  // 3. POST /announcements/:id/read -> Mark read
  if (subPath[0] === "announcements" && subPath.length === 3 && subPath[2] === "read" && method === "POST") {
    const annId = subPath[1];
    const ann = await one<{ id: string }>(
      "SELECT id FROM campus_announcements WHERE id=? AND institution_id=? LIMIT 1",
      [annId, institutionId],
    );

    if (!ann) {
      throw new ApiError(404, "ANNOUNCEMENT_NOT_FOUND", "Announcement not found.");
    }

    const readId = `ard-${uuid().slice(0, 12)}`;
    const readTimestamp = now();

    await run(
      `INSERT INTO student_announcement_reads(id, institution_id, announcement_id, student_id, read_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(institution_id, announcement_id, student_id) DO UPDATE SET read_at=excluded.read_at`,
      [readId, institutionId, annId, studentId, readTimestamp],
    );

    return ok({ success: true, announcementId: annId, isRead: true, readAt: readTimestamp }, requestId);
  }

  return null;
}
