import { ok, RouteContext } from "../shared";
import { handleFees } from "./fees";
import { handleDocuments } from "./documents";
import { handleCertificates, verifyCertificateByCode } from "./certificates";
import { handleAnnouncements } from "./announcements";
import { handleNotifications } from "./notifications";

export async function studentV1Route(ctx: RouteContext): Promise<Response | null> {
  const { path, method, request, requestId } = ctx;

  // Intercept public certificate verification endpoint
  if (
    (path[0] === "v1" && path[1] === "student" && path[2] === "certificates" && path[3] === "verify") ||
    (path[0] === "certificates" && path[1] === "verify")
  ) {
    const code = path[path.length - 1] === "verify" ? ctx.p.get("code") || "" : path[path.length - 1];
    return await verifyCertificateByCode(code, request, requestId);
  }

  // Determine subPath for student portal requests:
  // Case A: /api/v1/student/* -> path is ["v1", "student", ...]
  // Case B: /api/campus/:slug/student-portal/* -> path is ["student-portal", ...] (after campus/:slug strip in api.ts)
  let subPath: string[] | null = null;

  if (path[0] === "v1" && path[1] === "student") {
    subPath = path.slice(2);
  } else if (path[0] === "student-portal") {
    // Member 1 owns dashboard and summary foundations in Section 11
    if (path[1] === "dashboard" || path[1] === "summary") {
      return null;
    }
    subPath = path.slice(1);
  }

  if (!subPath) {
    return null;
  }

  // Section 13: Fees, Payments, Receipts
  if (
    subPath.length === 0 ||
    subPath[0] === "fees" ||
    subPath[0] === "payments" ||
    subPath[0] === "receipts"
  ) {
    const res = await handleFees(ctx, subPath);
    if (res) return res;
  }

  // Section 14: Documents
  if (subPath[0] === "documents") {
    const res = await handleDocuments(ctx, subPath);
    if (res) return res;
  }

  // Section 15: Certificates
  if (subPath[0] === "certificates") {
    const res = await handleCertificates(ctx, subPath);
    if (res) return res;
  }

  // Section 16: Announcements
  if (subPath[0] === "announcements") {
    const res = await handleAnnouncements(ctx, subPath);
    if (res) return res;
  }

  // Section 17: Notifications
  if (subPath[0] === "notifications") {
    const res = await handleNotifications(ctx, subPath);
    if (res) return res;
  }

  return null;
}
