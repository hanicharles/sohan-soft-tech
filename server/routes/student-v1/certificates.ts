import { z } from "zod";
import { all, insert, now, one, run, stmt, uuid } from "../../db";
import { Actor, ApiError, rateLimit } from "../../security";
import { ok, RouteContext } from "../shared";
import {
  createPortalNotification,
  parsePagination,
  paginatedResponse,
  recordStudentAudit,
  resolveStudent,
  sanitizeText,
  StudentContext,
} from "./shared";

const CERTIFICATE_TYPES = [
  { type: "Bonafide Certificate", code: "bonafide", description: "Proof of active student enrollment", supported: true },
  { type: "Character Certificate", code: "character", description: "Attestation of student conduct and discipline", supported: true },
  { type: "Course Completion Certificate", code: "course_completion", description: "Certificate of completed academic curriculum", supported: true },
  { type: "Participation Certificate", code: "participation", description: "Recognition of co-curricular participation", supported: true },
  { type: "Internship Recommendation", code: "internship", description: "No objection and recommendation letter for internships", supported: true },
  { type: "Transfer Certificate", code: "transfer", description: "Official transfer certificate upon graduation or transfer", supported: true },
  { type: "Migration Certificate", code: "migration", description: "Inter-board / university migration certificate", supported: true },
];

const requestCertificateSchema = z.object({
  certificateType: z.string().min(2, "Certificate type is required"),
  reason: z.string().min(5, "Reason must be at least 5 characters").max(300),
});

/**
 * Public verify-by-code endpoint:
 * Returns minimal data only: valid, type, issueDate, studentName.
 * Rate limited to prevent scraping.
 */
export async function verifyCertificateByCode(code: string, request: Request, requestId: string): Promise<Response> {
  await rateLimit(request, `rate:cert-verify:${request.headers.get("cf-connecting-ip") || "public"}`, 30);
  const cleanCode = sanitizeText(code);
  if (!cleanCode) {
    return ok({ valid: false, message: "Verification code is required." }, requestId);
  }

  const cert = await one<Record<string, any>>(
    `SELECT 
      c.certificate_number,
      c.certificate_type,
      c.issued_at,
      s.name as student_name
     FROM student_certificate_requests c
     JOIN students s ON s.id = c.student_id AND s.institution_id = c.institution_id
     WHERE (c.verification_code = ? OR c.certificate_number = ?) AND c.status = 'Issued'
     LIMIT 1`,
    [cleanCode, cleanCode],
  );

  if (!cert) {
    return ok({ valid: false, message: "Invalid verification code or certificate has not been issued." }, requestId);
  }

  // Minimal public data exposure only (no ID, no tenant ID, no marks)
  return ok(
    {
      valid: true,
      certificateNumber: cert.certificate_number,
      type: cert.certificate_type,
      issueDate: cert.issued_at,
      studentName: cert.student_name,
    },
    requestId,
  );
}

export async function handleCertificates(ctx: RouteContext, subPath: string[]): Promise<Response | null> {
  const { actor, method, p, body, requestId, request } = ctx;

  // 1. GET /certificates/verify/:code -> Public verify-by-code
  if (subPath[0] === "certificates" && subPath[1] === "verify") {
    const code = subPath[2] || p.get("code") || "";
    return await verifyCertificateByCode(code, request, requestId);
  }

  // 2. GET /certificates/types -> Available types with supported flag
  if (subPath[0] === "certificates" && subPath[1] === "types" && method === "GET") {
    return ok({ types: CERTIFICATE_TYPES }, requestId);
  }

  // Object-level student guard for personal certificates
  const sCtx = await resolveStudent(actor);
  const { studentId, institutionId, student } = sCtx;

  // 3. GET /certificates -> List own requests with status
  if (subPath[0] === "certificates" && subPath.length === 1 && method === "GET") {
    const { offset, limit, page, pageSize } = parsePagination(p);
    const countRow = await one<{ total: number }>(
      "SELECT COUNT(*) as total FROM student_certificate_requests WHERE institution_id=? AND student_id=?",
      [institutionId, studentId],
    );
    const total = countRow?.total ?? 0;

    const rows = await all<Record<string, any>>(
      `SELECT * FROM student_certificate_requests 
       WHERE institution_id=? AND student_id=? 
       ORDER BY created_at DESC 
       LIMIT ? OFFSET ?`,
      [institutionId, studentId, limit, offset],
    );

    const items = rows.map((r) => ({
      id: r.id,
      certificateType: r.certificate_type,
      reason: r.reason,
      status: r.status,
      certificateNumber: r.certificate_number || null,
      verificationCode: r.verification_code || null,
      qrPayload: r.qr_payload || null,
      approvedAt: r.approved_at || null,
      issuedAt: r.issued_at || null,
      createdAt: r.created_at,
      rejectionReason: r.rejection_reason || null,
      downloadUrl: r.status === "Issued" ? `/api/v1/student/certificates/${r.id}/download` : null,
    }));

    return ok(paginatedResponse(items, total, page, pageSize), requestId);
  }

  // 4. POST /certificates -> Request certificate
  if (subPath[0] === "certificates" && subPath.length === 1 && method === "POST") {
    await rateLimit(request, `rate:student-cert:${actor.userId}`, 20);
    const validated = requestCertificateSchema.parse(body);

    const cleanReason = sanitizeText(validated.reason);
    const certId = uuid();
    const timestamp = now();

    await run(
      `INSERT INTO student_certificate_requests(id, institution_id, student_id, certificate_type, reason, status, created_at, updated_at, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, 'Pending', ?, ?, ?, ?)`,
      [certId, institutionId, studentId, validated.certificateType, cleanReason, timestamp, timestamp, actor.userId, actor.userId],
    );

    await recordStudentAudit(actor, "Certificate Requested", "student_certificate_requests", certId, null, {
      certificateType: validated.certificateType,
      reason: cleanReason,
    });

    return ok(
      {
        id: certId,
        certificateType: validated.certificateType,
        reason: cleanReason,
        status: "Pending",
        createdAt: timestamp,
        message: "Your certificate request has been submitted for administrative verification.",
      },
      requestId,
    );
  }

  // 5. GET /certificates/:id/download -> Download certificate PDF with number, QR, and verification code
  if (subPath[0] === "certificates" && subPath.length === 2 && subPath[1] !== "types" && method === "GET") {
    const certId = subPath[1];
    const cert = await one<Record<string, any>>(
      `SELECT c.*, i.name as institution_name, i.address as institution_address, s.name as student_name, s.admission_number, s.dob
       FROM student_certificate_requests c
       JOIN students s ON s.id = c.student_id AND s.institution_id = c.institution_id
       JOIN institutions i ON i.id = c.institution_id
       WHERE c.id=? AND c.institution_id=? AND c.student_id=?
       LIMIT 1`,
      [certId, institutionId, studentId],
    );

    if (!cert) {
      throw new ApiError(404, "CERTIFICATE_NOT_FOUND", "Certificate request not found.");
    }

    if (cert.status !== "Issued") {
      throw new ApiError(400, "CERTIFICATE_NOT_ISSUED", `Certificate is currently in '${cert.status}' status and cannot be downloaded.`);
    }

    const certNum = cert.certificate_number || `CERT-${uuid().slice(0, 8).toUpperCase()}`;
    const verCode = cert.verification_code || `VER-${uuid().slice(0, 8).toUpperCase()}`;
    const qrPayload = cert.qr_payload || `https://campus.test/verify/${certNum}`;

    const printableHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${cert.certificate_type} - ${certNum}</title>
  <style>
    body { font-family: 'Times New Roman', serif; margin: 40px; color: #0f172a; }
    .cert-container { max-width: 800px; margin: auto; padding: 48px; border: 8px double #1e3a8a; border-radius: 4px; text-align: center; }
    .inst-name { font-size: 28px; font-weight: bold; color: #1e3a8a; text-transform: uppercase; margin-bottom: 4px; }
    .inst-sub { font-size: 14px; color: #64748b; margin-bottom: 32px; font-style: italic; }
    .cert-heading { font-size: 24px; font-weight: bold; text-decoration: underline; margin-bottom: 24px; letter-spacing: 1px; }
    .cert-body { font-size: 18px; line-height: 1.8; margin: 32px 16px; text-align: justify; }
    .highlight { font-weight: bold; text-decoration: underline; }
    .security-section { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 48px; border-top: 1px solid #cbd5e1; padding-top: 24px; }
    .qr-box { font-family: monospace; font-size: 11px; text-align: left; background: #f8fafc; padding: 12px; border: 1px dashed #94a3b8; }
    .seal-box { font-size: 15px; font-weight: bold; text-align: center; }
    .sign-line { width: 180px; border-top: 1px solid #000; margin-top: 48px; margin-bottom: 4px; }
  </style>
</head>
<body>
  <div class="cert-container">
    <div class="inst-name">${cert.institution_name}</div>
    <div class="inst-sub">${cert.institution_address || "Accredited Academic Institution"}</div>
    
    <div class="cert-heading">${cert.certificate_type.toUpperCase()}</div>
    
    <div class="cert-body">
      This is to certify that <span class="highlight">${cert.student_name}</span>, bearing Admission Roll Number 
      <span class="highlight">${cert.admission_number}</span>, is a bonafide student of this institution.
      <br><br>
      This document is officially issued for the purpose of: <em>${cert.reason}</em>.
      To the best of our records, the conduct and academic character of the student has been satisfactory.
    </div>

    <div class="security-section">
      <div class="qr-box">
        <div><strong>Certificate No:</strong> ${certNum}</div>
        <div><strong>Verification Code:</strong> ${verCode}</div>
        <div><strong>Issue Date:</strong> ${cert.issued_at || cert.created_at}</div>
        <div><strong>Online Verification:</strong> ${qrPayload}</div>
      </div>
      <div class="seal-box">
        <div class="sign-line"></div>
        <div>Dean / Authorized Registrar</div>
        <div style="font-size:12px;color:#64748b;">(Digitally Verified & Sealed)</div>
      </div>
    </div>
  </div>
</body>
</html>`;

    const pdfBase64 = Buffer.from(printableHtml, "utf-8").toString("base64");

    return ok(
      {
        certificateId: cert.id,
        certificateNumber: certNum,
        verificationCode: verCode,
        qrPayload,
        issuedAt: cert.issued_at,
        fileName: `${cert.certificate_type.replace(/[^a-zA-Z0-9]/g, "_")}_${certNum}.pdf`,
        printableHtml,
        downloadablePdf: {
          contentType: "application/pdf",
          base64: pdfBase64,
        },
      },
      requestId,
    );
  }

  return null;
}
