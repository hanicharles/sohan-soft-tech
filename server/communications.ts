import { env, waitUntil } from "cloudflare:workers";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db";
import { installments } from "../db/schema";
import { money } from "../lib/money";
import { all, batch, now, one, run, stamps, stmt, today, uuid } from "./db";
import { documentPdf } from "./reports";
import { Actor, ApiError, audit, permit } from "./security";
import { withTenantContext } from "./tenant-context";

const template = z.object({
  id: z.string().trim().min(1).max(100),
  body: z.string().trim().min(10).max(1000),
});
export const communicationSchema = z
  .object({
    enabled: z.boolean(),
    entityId: z.string().max(100),
    senderId: z.string().max(20),
    templates: z
      .record(
        z.enum([
          "before7",
          "before3",
          "before1",
          "due",
          "after1",
          "after3",
          "after7",
          "receipt",
        ]),
        template,
      )
      .default({}),
  })
  .superRefine((v, ctx) => {
    if (
      v.enabled &&
      (!v.entityId ||
        !v.senderId ||
        ["before7", "before3", "before1"].some(
          (k) => !v.templates[k as keyof typeof v.templates],
        ))
    )
      ctx.addIssue({
        code: "custom",
        message:
          "Enter the registered entity, sender and 7/3/1-day template IDs and exact approved content.",
      });
  });
export type CommunicationSettings = z.infer<typeof communicationSchema>;
export async function communicationConfig(actor: Actor) {
  const r = await one<{ configuration: string }>(
    "SELECT configuration FROM communication_settings WHERE institution_id=?",
    [actor.institutionId],
  );
  return r
    ? communicationSchema.parse(JSON.parse(r.configuration))
    : ({
        enabled: false,
        entityId: "",
        senderId: "",
        templates: {},
      } satisfies CommunicationSettings);
}
export async function saveCommunicationConfig(actor: Actor, input: unknown) {
  permit(actor, "settings.manage");
  const d = communicationSchema.parse(input);
  for (const t of Object.values(d.templates))
    if (
      /\{(?!student\}|amount\}|date\}|institution\}|receipt\})[^}]+\}/.test(
        t.body,
      )
    )
      throw new ApiError(
        422,
        "INVALID_TEMPLATE",
        "Allowed template variables: {student}, {amount}, {date}, {institution}, {receipt}.",
      );
  await batch([
    stmt(
      "INSERT INTO communication_settings(id,institution_id,configuration,created_at,updated_at,created_by,updated_by) VALUES(?,?,?,?,?,?,?) ON CONFLICT(institution_id) DO UPDATE SET configuration=excluded.configuration,updated_at=excluded.updated_at,updated_by=excluded.updated_by",
      [
        uuid(),
        actor.institutionId,
        JSON.stringify(d),
        now(),
        now(),
        actor.userId,
        actor.userId,
      ],
    ),
    audit(
      actor,
      "Updated registered SMS templates",
      "communication_settings",
      actor.institutionId,
      null,
      { enabled: d.enabled, templates: Object.keys(d.templates) },
    ),
  ]);
  return { saved: true };
}
export function serviceActor(institutionId: string): Actor {
  return {
    institutionId,
    userId: "communications-worker",
    name: "Communication worker",
    email: "",
    role: "INSTITUTION_ADMIN",
    feeVisibility: true,
    request: new Request("https://internal.invalid/worker"),
  };
}
export function scheduleCommunications(institutionId: string) {
  waitUntil(
    dispatchCommunications(institutionId).catch(() =>
      console.error("Communication job remains pending", institutionId),
    ),
  );
}
export async function dispatchCommunications(institutionId: string) {
  if (env.COMMUNICATION_QUEUE) {
    await env.COMMUNICATION_QUEUE.send({ institutionId });
    return;
  }
  // Sites currently exposes D1/R2 but no Queue binding. Retain recoverable work
  // and run the identical consumer off the HTTP response in that deployment.
  await consumeCommunications(institutionId);
}
export async function consumeCommunications(institutionId: string) {
  const institution = await one(
    "SELECT id FROM institutions WHERE id=? AND status='Active'",
    [institutionId],
  );
  if (!institution) return;
  const actor = serviceActor(institutionId);
  return withTenantContext(actor, async () => {
    await renderReceiptJobs(actor);
    const { flushNotifications } = await import("./notifications");
    const delivered = await flushNotifications(actor);
    if (delivered.failed && env.COMMUNICATION_QUEUE)
      throw new Error("Delivery requires retry");
    const remaining = await one<{ count: number }>(
      "SELECT COUNT(*) count FROM document_jobs WHERE institution_id=? AND state='Queued' AND attempts<5",
      [institutionId],
    );
    const messages = await one<{ count: number }>(
      "SELECT COUNT(*) count FROM notifications n JOIN provider_configs p ON p.institution_id=n.institution_id AND p.provider=n.channel WHERE n.institution_id=? AND n.status='Queued' AND n.attempts<5",
      [institutionId],
    );
    if ((remaining?.count || messages?.count) && env.COMMUNICATION_QUEUE)
      await env.COMMUNICATION_QUEUE.send(
        { institutionId },
        { delaySeconds: 5 },
      );
  });
}
export type CommunicationJob = {
  institutionId: string;
  kind?: "delivery" | "financial";
};
export async function communicationQueue(
  batch: MessageBatch<CommunicationJob>,
) {
  for (const message of batch.messages) {
    try {
      const d = z
        .object({
          institutionId: z.string().min(1).max(100),
          kind: z.enum(["delivery", "financial"]).optional(),
        })
        .parse(message.body);
      if (d.kind === "financial") {
        const actor = serviceActor(d.institutionId),
          { runFinancialJobs } = await import("./notifications");
        const institution = await one(
          "SELECT i.id FROM institutions i JOIN institution_subscriptions s ON s.institution_id=i.id WHERE i.id=? AND i.status='Active' AND s.status IN ('Trial','Active') AND s.start_date<=? AND s.end_date>=?",
          [d.institutionId, today(), today()],
        );
        if (institution) {
          const result = await withTenantContext(actor, () =>
            runFinancialJobs(actor),
          );
          if (result.scanHasMore && env.COMMUNICATION_QUEUE)
            await env.COMMUNICATION_QUEUE.send(d, { delaySeconds: 1 });
        }
      } else await consumeCommunications(d.institutionId);
      message.ack();
    } catch {
      message.retry({ delaySeconds: 300 });
    }
  }
}
export async function queueReceipt(actor: Actor, receiptId: string) {
  await run(
    "INSERT OR IGNORE INTO document_jobs(id,institution_id,receipt_id,state,attempts,created_at,updated_at) VALUES(?,?,?,'Queued',0,?,?)",
    ["pdf:" + receiptId, actor.institutionId, receiptId, now(), now()],
  );
  scheduleCommunications(actor.institutionId);
}
async function renderReceiptJobs(actor: Actor) {
  if (!env.BUCKET) return;
  await run(
    "UPDATE document_jobs SET state='Queued' WHERE institution_id=? AND state='Processing' AND updated_at<? AND attempts<5",
    [actor.institutionId, new Date(Date.now() - 600000).toISOString()],
  );
  const jobs = await all<{ id: string; receipt_id: string }>(
    "SELECT id,receipt_id FROM document_jobs WHERE institution_id=? AND state='Queued' AND attempts<5 ORDER BY created_at LIMIT 5",
    [actor.institutionId],
  );
  for (const job of jobs) {
    const claim = await stmt(
      "UPDATE document_jobs SET state='Processing',attempts=attempts+1,updated_at=? WHERE id=? AND institution_id=? AND state='Queued' RETURNING id",
      [now(), job.id, actor.institutionId],
    ).first();
    if (!claim) continue;
    try {
      const response = await documentPdf(actor, "receipt", job.receipt_id),
        key = `${actor.institutionId}/receipts/${job.receipt_id}.pdf`;
      await env.BUCKET.put(key, await response.arrayBuffer(), {
        httpMetadata: { contentType: "application/pdf" },
      });
      const thermal = await documentPdf(
        actor,
        "receipt",
        job.receipt_id,
        "thermal",
      );
      await env.BUCKET.put(
        key.replace(/\.pdf$/, "-80mm.pdf"),
        await thermal.arrayBuffer(),
        { httpMetadata: { contentType: "application/pdf" } },
      );
      await batch([
        stmt(
          "INSERT OR IGNORE INTO document_artifacts(id,institution_id,receipt_id,object_key,created_at) VALUES(?,?,?,?,?)",
          [
            "artifact:" + job.receipt_id,
            actor.institutionId,
            job.receipt_id,
            key,
            now(),
          ],
        ),
        stmt(
          "UPDATE document_jobs SET state='Completed',last_error=NULL,updated_at=? WHERE id=? AND institution_id=?",
          [now(), job.id, actor.institutionId],
        ),
      ]);
    } catch {
      await run(
        "UPDATE document_jobs SET state=CASE WHEN attempts>=5 THEN 'Failed' ELSE 'Queued' END,last_error='Receipt generation needs retry',updated_at=? WHERE id=? AND institution_id=?",
        [now(), job.id, actor.institutionId],
      );
    }
  }
}
export async function queueScheduledReminders(actor: Actor) {
  const config = await communicationConfig(actor);
  if (!config.enabled) return { queued: 0 };
  const date = today(),
    institution = await one<{ name: string }>(
      "SELECT name FROM institutions WHERE id=?",
      [actor.institutionId],
    );
  const dates = [-7, -3, -1, 0, 1, 3, 7].map((n) =>
    new Date(Date.parse(date) + n * 86400000).toISOString().slice(0, 10),
  );
  const cursorKey = "dlt-cursor:" + actor.institutionId + ":" + date;
  const cursor =
    (
      await one<{ value: string }>("SELECT value FROM platform WHERE key=?", [
        cursorKey,
      ])
    )?.value || "";
  const due = await getDb().select(installments, {
    limit: 100,
    orderBy: sql`${installments.id}`,
    where: sql`${installments.id}>${cursor} AND ${installments.dueDate} IN (${sql.join(
      dates.map((d) => sql`${d}`),
      sql`,`,
    )}) AND EXISTS(SELECT 1 FROM academic_years y WHERE y.id=${installments.academicYearId} AND y.status IN ('Active','Draft'))`,
  });
  let queued = 0;
  for (const candidate of due) {
    const i = await one<{
      id: string;
      student_id: string;
      academic_year_id: string;
      outstanding_paise: number;
      due_date: string;
    }>(
      "SELECT id,student_id,academic_year_id,outstanding_paise,due_date FROM installment_balances WHERE institution_id=? AND id=? AND outstanding_paise>0",
      [actor.institutionId, candidate.id],
    );
    if (!i) continue;
    const days = Math.round(
      (Date.parse(i.due_date) - Date.parse(date)) / 86400000,
    );
    const key =
        days === 0 ? "due" : days > 0 ? "before" + days : "after" + -days,
      t = config.templates[key as keyof typeof config.templates];
    if (!t) continue;
    const parent = await one<{
      id: string;
      mobile: string;
      student_name: string;
    }>(
      "SELECT p.id,p.mobile,s.name student_name FROM parents p JOIN student_parents sp ON sp.parent_id=p.id AND sp.institution_id=p.institution_id JOIN students s ON s.id=sp.student_id AND s.institution_id=sp.institution_id WHERE p.institution_id=? AND sp.student_id=? AND sp.is_primary=1 AND p.sms_consent=1",
      [actor.institutionId, i.student_id],
    );
    if (!parent) continue;
    const variables = {
      student: parent.student_name,
      amount: money(i.outstanding_paise, true),
      date: i.due_date,
      institution: institution!.name,
    };
    let message = t.body;
    for (const [k, v] of Object.entries(variables))
      message = message.replaceAll("{" + k + "}", v.replace(/[\r\n]/g, " "));
    const result = await run(
      "INSERT OR IGNORE INTO notifications(id,institution_id,academic_year_id,parent_id,student_id,recipient,channel,message,status,dedupe_key,metadata,created_at,updated_at,created_by,updated_by) VALUES(?,?,?,?,?,?,'SMS',?,'Queued',?,?,?,?,?,?)",
      [
        uuid(),
        actor.institutionId,
        i.academic_year_id,
        parent.id,
        i.student_id,
        parent.mobile,
        message,
        `dlt:${i.id}:${i.due_date}:${key}`,
        JSON.stringify({
          dlt: {
            entityId: config.entityId,
            senderId: config.senderId,
            templateId: t.id,
          },
          variables,
        }),
        now(),
        now(),
        actor.userId,
        actor.userId,
      ],
    );
    queued += result.meta.changes;
  }
  await run(
    "INSERT INTO platform(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
    [cursorKey, due.length === 100 ? String(due.at(-1)!.id) : ""],
  );
  return { queued, hasMore: due.length === 100 };
}
export async function scheduledMaintenance() {
  const key = "cron:institution-cursor",
    cursor =
      (
        await one<{ value: string }>("SELECT value FROM platform WHERE key=?", [
          key,
        ])
      )?.value || "";
  const institutions = await all<{ id: string }>(
    "SELECT i.id FROM institutions i JOIN institution_subscriptions s ON s.institution_id=i.id WHERE i.status='Active' AND s.status IN ('Trial','Active') AND s.start_date<=? AND s.end_date>=? AND i.id>? ORDER BY i.id LIMIT 10",
    [today(), today(), cursor],
  );
  const { runFinancialJobs } = await import("./notifications");
  for (const i of institutions) {
    if (env.COMMUNICATION_QUEUE)
      await env.COMMUNICATION_QUEUE.send({
        institutionId: i.id,
        kind: "financial",
      });
    else {
      const actor = serviceActor(i.id);
      await withTenantContext(actor, () => runFinancialJobs(actor));
    }
  }
  await run(
    "INSERT INTO platform(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
    [key, institutions.length === 10 ? institutions.at(-1)!.id : ""],
  );
}
