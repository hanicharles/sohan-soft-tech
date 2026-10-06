import { z } from "zod";
import { all, batch, now, stmt } from "../db";
import { previewRollover, startRollover, processRollover } from "../rollover";
import { importRows } from "../imports";
import {
  processNotifications,
  queueReminder,
  runFinancialJobs,
} from "../notifications";
import { audit, own, permit } from "../security";
import { ok, RouteContext } from "./shared";

export async function operationsRoute(
  ctx: RouteContext,
): Promise<Response | null> {
  const { actor, path, p, method, body, request, url, requestId } = ctx;
  if (path[0] === "rollovers") {
    permit(actor, "settings.manage");
    if (method === "GET")
      return ok(
        {
          rows: await all(
            "SELECT * FROM year_rollovers WHERE institution_id=? ORDER BY created_at DESC LIMIT 20",
            [actor.institutionId],
          ),
          sections: await all(
            "SELECT s.id,s.name,s.academic_year_id,c.name class_name FROM sections s JOIN classes c ON c.id=s.class_id AND c.institution_id=s.institution_id WHERE s.institution_id=? ORDER BY s.academic_year_id,c.sort_order,s.name LIMIT 1000",
            [actor.institutionId],
          ),
        },
        requestId,
      );
    if (method === "POST" && path[1] === "preview")
      return ok(await previewRollover(actor, body), requestId);
    if (method === "POST" && path[1] === "start")
      return ok(await startRollover(actor, body), requestId);
    if (method === "POST" && path[2] === "process")
      return ok(await processRollover(actor, path[1]), requestId);
  }
  if (method === "POST") {
    if (path[0] === "notifications" && path[1] === "process")
      return ok(await processNotifications(actor), requestId);
  }
  if (method === "POST") {
    if (path[0] === "notifications" && path[2] === "retry") {
      permit(actor, "collect");
      const record = await own(actor, "notifications", path[1]);
      await batch([
        stmt(
          "UPDATE notifications SET status='Queued',attempts=0,updated_at=? WHERE id=? AND status='Failed'",
          [now(), record.id],
        ),
        audit(
          actor,
          "Retried notification",
          "notifications",
          record.id,
          null,
          null,
        ),
      ]);
      return ok({ queued: true }, requestId);
    }
  }
  if (method === "POST") {
    if (path[0] === "notifications") {
      const d = z
        .object({
          studentIds: z.array(z.string()).min(1).max(50),
          channel: z.enum(["SMS", "WhatsApp", "Email"]),
          template: z.string().max(1500).optional(),
        })
        .parse(body);
      return ok(
        await queueReminder(actor, d.studentIds, d.channel, d.template),
        requestId,
      );
    }
  }
  if (method === "POST") {
    if (path[0] === "jobs") return ok(await runFinancialJobs(actor), requestId);
  }
  if (method === "POST") {
    if (["import", "imports"].includes(path[0]))
      return ok(await importRows(actor, body), requestId);
  }
  return null;
}
