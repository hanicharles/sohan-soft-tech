import { accountingReport } from "../reports";
import { csv, xlsx } from "../../lib/tabular";
import { templates } from "../imports";
import { platformDashboard } from "../institutions";
import { dashboard, listStudents } from "../queries";
import {
  attachment,
  documentPdf,
  downloadReport,
  reportData,
} from "../reports";
import { ApiError, permit } from "../security";
import { ok, RouteContext } from "./shared";
import { receiptDownload } from "../receipt-download";
import { tallyExport } from "../tally";

export async function reportsRoute(
  ctx: RouteContext,
): Promise<Response | null> {
  const { actor, path, p, method, body, request, url, requestId } = ctx;
  if (method === "GET") {
    if (path.join("/") === "admin/dashboard")
      return ok(await platformDashboard(actor), requestId);
  }
  if (method === "GET") {
    if (path[0] === "dashboard")
      return ok(await dashboard(actor, p), requestId);
  }
  if (method === "GET") {
    if (["outstanding", "defaulters"].includes(path[0])) {
      permit(actor, "finance");
      return ok(
        await listStudents(
          actor,
          new URLSearchParams({ ...Object.fromEntries(p), outstanding: "1" }),
          path[0] === "defaulters",
        ),
        requestId,
      );
    }
  }
  if (method === "GET") {
    if (path[0] === "reports") {
      if (path[1] === "tally") return tallyExport(actor, p);
      if (path[1] === "summary" && !p.get("format"))
        return ok(await accountingReport(actor, p), requestId);
      if (p.get("format"))
        return await downloadReport(
          actor,
          path[1] || p.get("report") || "collections",
          p,
        );
      return ok(
        await reportData(actor, path[1] || p.get("report") || "collections", p),
        requestId,
      );
    }
  }
  if (method === "GET") {
    if (path[0] === "documents" && path[1] === "receipt")
      return receiptDownload(actor, path[2], p.get("format") || "a4");
    if (path[0] === "documents")
      return await documentPdf(
        actor,
        path[1],
        path[2],
        p.get("format") || "a4",
      );
  }
  if (method === "GET") {
    if (path[0] === "template") {
      permit(
        actor,
        path[1] === "reconciliation"
          ? "payments.collect"
          : ["students", "parents"].includes(path[1])
            ? "students.manage"
            : "fees.manage",
      );
      const rows = templates[path[1]];
      if (!rows) throw new ApiError(404, "NOT_FOUND", "Template not found.");
      return p.get("format") === "xlsx"
        ? attachment(
            xlsx(rows),
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            path[1] + "-template.xlsx",
          )
        : attachment(
            csv(rows),
            "text/csv;charset=utf-8",
            path[1] + "-template.csv",
          );
    }
  }
  return null;
}
