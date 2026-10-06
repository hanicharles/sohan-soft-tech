import { z } from "zod";
import { MoneyError } from "../../lib/money";
import { Permission } from "../../lib/permissions";
import { Row } from "../db";
import { Actor, ApiError, hasPermission, permit } from "../security";
export type RouteContext = {
  actor: Actor;
  path: string[];
  p: URLSearchParams;
  method: string;
  body: Row;
  request: Request;
  url: URL;
  requestId: string;
};
export function responseHeaders(id: string) {
  return {
    "Content-Type": "application/json",
    "Cache-Control": "private,no-store",
    "X-Content-Type-Options": "nosniff",
    "X-Request-ID": id,
    "Referrer-Policy": "strict-origin-when-cross-origin",
  };
}
export function ok(data: unknown, id: string) {
  return new Response(JSON.stringify({ success: true, data, requestId: id }), {
    headers: responseHeaders(id),
  });
}
export async function readBody(request: Request): Promise<Row> {
  const text = await request.text();
  if (text.length > 3500000)
    throw new ApiError(
      413,
      "PAYLOAD_TOO_LARGE",
      "Request exceeds the upload limit.",
    );
  try {
    return text.trim() ? JSON.parse(text) : {};
  } catch {
    throw new ApiError(400, "INVALID_JSON", "Enter valid JSON data.");
  }
}
export function routeArea(path: string[]) {
  const areas: Record<string, string> = {
    students: "students",
    parents: "students",
    years: "academics",
    catalog: ["components", "structures", "benefits"].includes(path[1])
      ? "fees"
      : "academics",
    structures: "fees",
    fees: "fees",
    installments: "fees",
    invoices: "fees",
    outstanding: "fees",
    defaulters: "fees",
    payments: "payments",
    refunds: "payments",
    cash: "payments",
    reconciliation: "payments",
    receipts: "receipts",
    documents: path[1] === "receipt" ? "receipts" : "fees",
    reports: "reports",
    users: "users",
    invitations: "users",
    settings: "settings",
    providers: "settings",
    hardware: "settings",
    communications: "settings",
    certificates: "fees",
    "parent-links": "students",
    rollovers: "academics",
  };
  return areas[path[0]];
}
export function guardRoute(
  actor: Actor,
  path: string[],
  method: string,
  p: URLSearchParams,
) {
  const k = path[0],
    read = method === "GET";
  let permission: Permission | undefined;
  if (["students", "parents", "uploads", "search"].includes(k))
    permission = read ? "students.view" : "students.manage";
  if (k === "catalog")
    permission =
      path[1] === "parents"
        ? "students.manage"
        : ["components", "structures", "benefits"].includes(path[1])
          ? "fees.manage"
          : "academics.manage";
  if (["years"].includes(k))
    permission = read ? "academics.view" : "academics.manage";
  if (
    [
      "fees",
      "structures",
      "structure-items",
      "components",
      "installments",
      "invoices",
      "outstanding",
      "defaulters",
    ].includes(k)
  )
    permission = read
      ? "fees.view"
      : k === "invoices"
        ? "fees.invoice"
        : "fees.manage";
  if (["payments", "reconciliation", "cash", "notifications"].includes(k))
    permission = read ? "payments.view" : "payments.collect";
  if (k === "payments" && !read && ["confirm", "cancel"].includes(path[2]))
    permission = "payments.manage";
  if (k === "reconciliation" && !read) permission = "payments.manage";
  if (k === "cash") permission = read ? "payments.view" : "cash.close";
  if (k === "refunds")
    permission = read || !path[1] ? "refunds.request" : "refunds.approve";
  if (k === "receipts") permission = "receipts.view";
  if (k === "reports")
    permission = p.get("format") ? "reports.export" : "reports.view";
  if (k === "users" || k === "invitations")
    permission = read ? "users.view" : "users.manage";
  if (["settings", "providers", "jobs", "audit"].includes(k))
    permission = read ? "settings.view" : "settings.manage";
  if (k === "documents")
    permission = path[1] === "receipt" ? "receipts.view" : "fees.view";
  if (permission) permit(actor, permission);
  if (k === "template")
    permit(
      actor,
      path[1] === "students" || path[1] === "parents"
        ? "students.manage"
        : path[1] === "reconciliation"
          ? "payments.manage"
          : "fees.manage",
    );
  if (k === "dashboard" && !hasPermission(actor, "fees.view"))
    throw new ApiError(
      403,
      "FORBIDDEN",
      "Your role cannot access financial dashboards.",
    );
}
export function errorResponse(error: unknown, requestId: string): Response {
  let status = 500,
    code = "INTERNAL_ERROR",
    message = "This operation could not be completed. Please try again.";
  let fields: unknown;
  if (error instanceof ApiError) {
    status = error.status;
    code = error.code;
    message = error.message;
  } else if (error instanceof MoneyError) {
    status = 422;
    code = "INVALID_AMOUNT";
    message = error.message;
  } else if (error instanceof z.ZodError) {
    status = 422;
    code = "VALIDATION_ERROR";
    message = error.issues
      .map((i) => i.path.join(".") + ": " + i.message)
      .join("; ");
    fields = error.flatten().fieldErrors;
  } else if (error instanceof Error) {
    if (/STUDENT_LIMIT_REACHED|USER_LIMIT_REACHED/.test(error.message)) {
      status = 409;
      code = error.message.includes("STUDENT_LIMIT_REACHED")
        ? "STUDENT_LIMIT_REACHED"
        : "USER_LIMIT_REACHED";
      message =
        "Your institution plan limit has been reached. Contact the platform administrator to upgrade.";
    } else if (/UNIQUE constraint|ALREADY|duplicate/i.test(error.message)) {
      status = 409;
      code = "DUPLICATE_RECORD";
      message =
        "This record already exists. Check existing records before trying again.";
    } else if (
      /ACADEMIC_YEAR_FROZEN|ROLLOVER_ROSTER_FROZEN|ROLLOVER_PREVIEW_CHANGED|INVALID_CARRY_FORWARD|CASH_BALANCE_CHANGED|UNBALANCED_JOURNAL|OVERPAYMENT|INVALID_ADJUSTMENT|REFUND_TOO_LARGE|IMMUTABLE|TENANT_ISOLATION|INVALID_ALLOCATION|INCOMPLETE_PAYMENT|ACADEMIC_YEAR_ISOLATION|CASH_DAY_CLOSED/.test(
        error.message,
      )
    ) {
      status = 409;
      code = "FINANCIAL_CONFLICT";
      message =
        "The balance or record changed. Refresh the page and try again.";
    } else if (
      /Enter an amount|supported range|Percentage|Installments/.test(
        error.message,
      )
    ) {
      status = 422;
      code = "INVALID_AMOUNT";
      message = error.message;
    } else
      console.error(
        "Sohan Soft Tech request failed",
        requestId,
        error.message.slice(0, 240),
      );
  }
  return new Response(
    JSON.stringify({
      success: false,
      message,
      errorCode: code,
      fields,
      requestId,
    }),
    { status, headers: responseHeaders(requestId) },
  );
}
