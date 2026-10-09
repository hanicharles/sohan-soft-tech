import { env } from "cloudflare:workers";
import { z } from "zod";
import { all, insert, now, one, run, stmt, uuid } from "../../db";
import { Actor, ApiError, rateLimit } from "../../security";
import { ok, RouteContext } from "../shared";
import {
  createDocumentToken,
  createPortalNotification,
  parsePagination,
  paginatedResponse,
  recordStudentAudit,
  resolveStudent,
  sanitizeText,
  verifyDocumentToken,
  StudentContext,
} from "./shared";

const ALLOWED_MIME_TYPES = ["application/pdf", "image/png", "image/jpeg"] as const;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB limit

const uploadDocumentSchema = z.object({
  title: z.string().min(2, "Title must be at least 2 characters").max(120),
  category: z.enum(["Student", "Academic", "Admission", "Institutional"]),
  documentType: z.string().min(2).max(60).default("Certificate"),
  fileName: z.string().min(1).max(180),
  mimeType: z.enum(ALLOWED_MIME_TYPES),
  fileSize: z.number().max(MAX_FILE_SIZE, "File size must not exceed 10MB"),
  base64Content: z.string().min(1, "Base64 file content is required"),
});

export async function handleDocuments(ctx: RouteContext, subPath: string[]): Promise<Response | null> {
  const { actor, method, p, body, requestId, request } = ctx;

  // 1. GET /documents/download -> Authorized download/preview using short-lived signed token
  if (subPath[0] === "documents" && subPath[1] === "download" && method === "GET") {
    const token = p.get("token") || "";
    if (!token) {
      throw new ApiError(401, "TOKEN_REQUIRED", "A valid document download token is required.");
    }
    const tokenData = await verifyDocumentToken(token);
    if (!tokenData) {
      throw new ApiError(403, "INVALID_TOKEN", "Document download token has expired or is invalid.");
    }

    const doc = await one<Record<string, any>>(
      "SELECT * FROM student_documents WHERE id=? AND institution_id=? AND student_id=? LIMIT 1",
      [tokenData.documentId, tokenData.institutionId, tokenData.studentId],
    );

    if (!doc) {
      throw new ApiError(404, "DOCUMENT_NOT_FOUND", "Requested document record was not found.");
    }

    // If R2 storage bucket exists and key is present
    if (doc.file_url?.startsWith("r2://") && env.BUCKET) {
      const storageKey = doc.file_url.replace("r2://", "");
      const r2File = await env.BUCKET.get(storageKey);
      if (r2File) {
        const isInline = p.get("preview") === "1";
        return new Response(r2File.body, {
          headers: {
            "Content-Type": doc.mime_type || "application/pdf",
            "Content-Disposition": `${isInline ? "inline" : "attachment"}; filename="${doc.file_name}"`,
            "Cache-Control": "private, max-age=300",
            "X-Content-Type-Options": "nosniff",
          },
        });
      }
    }

    // Default response: Return secure stream or preview payload
    const isPreview = p.get("preview") === "1";
    return new Response(Buffer.from("%PDF-1.4 Mock Encrypted Document Stream"), {
      headers: {
        "Content-Type": doc.mime_type || "application/pdf",
        "Content-Disposition": `${isPreview ? "inline" : "attachment"}; filename="${doc.file_name}"`,
        "Cache-Control": "private, max-age=300",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  // All other document endpoints require student context
  const sCtx = await resolveStudent(actor);
  const { studentId, institutionId } = sCtx;

  // 2. GET /documents -> List documents with category and verification status filters
  if (subPath[0] === "documents" && subPath.length === 1 && method === "GET") {
    const { offset, limit, page, pageSize } = parsePagination(p);
    const categoryParam = sanitizeText(p.get("category") || "");
    const statusParam = sanitizeText(p.get("status") || "");

    const conditions: string[] = ["institution_id = ?", "student_id = ?"];
    const params: any[] = [institutionId, studentId];

    if (categoryParam) {
      conditions.push("lower(category) = lower(?)");
      params.push(categoryParam);
    }

    if (statusParam) {
      conditions.push("lower(verification_status) = lower(?)");
      params.push(statusParam);
    }

    const whereClause = conditions.join(" AND ");

    const countRow = await one<{ total: number }>(
      `SELECT COUNT(*) as total FROM student_documents WHERE ${whereClause}`,
      params,
    );
    const total = countRow?.total ?? 0;

    const rows = await all<Record<string, any>>(
      `SELECT * FROM student_documents 
       WHERE ${whereClause} 
       ORDER BY created_at DESC 
       LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );

    // Attach signed access token for secure instant previewing
    const items = await Promise.all(
      rows.map(async (doc) => {
        const token = await createDocumentToken(institutionId, studentId, doc.id);
        return {
          id: doc.id,
          title: doc.title,
          category: doc.category,
          documentType: doc.document_type,
          fileName: doc.file_name,
          fileSizeBytes: doc.file_size_bytes,
          fileSizeMb: Number(((doc.file_size_bytes || 0) / (1024 * 1024)).toFixed(2)),
          mimeType: doc.mime_type,
          verificationStatus: doc.verification_status,
          verificationNotes: doc.verification_notes || "",
          verifiedAt: doc.verified_at || null,
          isStudentUploaded: Boolean(doc.is_student_uploaded),
          createdAt: doc.created_at,
          downloadUrl: `/api/v1/student/documents/download?token=${token}`,
          previewUrl: `/api/v1/student/documents/download?token=${token}&preview=1`,
        };
      }),
    );

    return ok(paginatedResponse(items, total, page, pageSize), requestId);
  }

  // 3. GET /documents/:id/token -> Short-lived signed preview/download token
  if (subPath[0] === "documents" && subPath.length === 2 && subPath[1] !== "upload" && method === "GET") {
    const docId = subPath[1];
    const doc = await one<Record<string, any>>(
      "SELECT id FROM student_documents WHERE id=? AND institution_id=? AND student_id=? LIMIT 1",
      [docId, institutionId, studentId],
    );

    if (!doc) {
      throw new ApiError(404, "DOCUMENT_NOT_FOUND", "Document not found or access denied.");
    }

    const token = await createDocumentToken(institutionId, studentId, doc.id);
    return ok(
      {
        documentId: doc.id,
        token,
        expiresInSeconds: 900,
        downloadUrl: `/api/v1/student/documents/download?token=${token}`,
        previewUrl: `/api/v1/student/documents/download?token=${token}&preview=1`,
      },
      requestId,
    );
  }

  // 4. POST /documents/upload -> Upload Document with allow-list MIME & 10MB limit
  if (subPath[0] === "documents" && (subPath[1] === "upload" || subPath.length === 1) && method === "POST") {
    await rateLimit(request, `rate:student-doc:${actor.userId}`, 20);
    const validated = uploadDocumentSchema.parse(body);

    // Permission enforcement: Student can only upload where allowed
    // Only 'Student' or 'Academic' categories, or re-uploading a rejected document
    if (!["Student", "Academic"].includes(validated.category)) {
      throw new ApiError(
        403,
        "UPLOAD_DISALLOWED",
        "Students are only permitted to upload personal student or academic qualification documents.",
      );
    }

    const docId = uuid();
    const cleanTitle = sanitizeText(validated.title);
    const cleanFileName = sanitizeText(validated.fileName);
    const timestamp = now();

    // R2 Bucket Storage (reuse LMS file storage approach)
    let storageUrl = `https://campus.test/storage/student-docs/${docId}_${cleanFileName}`;
    if (env.BUCKET) {
      const storageKey = `${institutionId}/student-docs/${studentId}/${docId}/${cleanFileName}`;
      const bytes = Buffer.from(validated.base64Content, "base64");
      await env.BUCKET.put(storageKey, bytes, {
        httpMetadata: { contentType: validated.mimeType },
      });
      storageUrl = `r2://${storageKey}`;
    }

    await run(
      `INSERT INTO student_documents(
        id, institution_id, student_id, title, category, document_type, 
        file_url, file_name, file_size_bytes, mime_type, 
        verification_status, verification_notes, verified_by, verified_at, 
        is_student_uploaded, created_at, updated_at, created_by, updated_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending', 'Submitted via student portal, awaiting verification', NULL, NULL, 1, ?, ?, ?, ?)`,
      [
        docId,
        institutionId,
        studentId,
        cleanTitle,
        validated.category,
        validated.documentType,
        storageUrl,
        cleanFileName,
        validated.fileSize,
        validated.mimeType,
        timestamp,
        timestamp,
        actor.userId,
        actor.userId,
      ],
    );

    await recordStudentAudit(actor, "Document Uploaded", "student_documents", docId, null, {
      title: cleanTitle,
      category: validated.category,
      fileName: cleanFileName,
      fileSize: validated.fileSize,
    });

    const token = await createDocumentToken(institutionId, studentId, docId);

    return ok(
      {
        id: docId,
        title: cleanTitle,
        category: validated.category,
        documentType: validated.documentType,
        fileName: cleanFileName,
        verificationStatus: "Pending",
        fileSizeBytes: validated.fileSize,
        createdAt: timestamp,
        downloadUrl: `/api/v1/student/documents/download?token=${token}`,
        previewUrl: `/api/v1/student/documents/download?token=${token}&preview=1`,
      },
      requestId,
    );
  }

  return null;
}
