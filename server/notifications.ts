import { env } from "cloudflare:workers";
import {
  communicationConfig,
  queueScheduledReminders,
  scheduleCommunications,
} from "./communications";
import { issueParentGrant } from "./parent-portal";
import { money } from "../lib/money";
import {
  all,
  batch,
  insert,
  now,
  one,
  Row,
  run,
  stamps,
  stmt,
  today,
  uuid,
} from "./db";
import { accrueLateFee } from "./fees";
import { readProvider } from "./providers";
import { Actor, ApiError, audit, own, permit } from "./security";
export async function queueReminder(
  actor: Actor,
  studentIds: string[],
  channel: string,
  template?: string,
) {
  permit(actor, "collect");
  if (!["SMS", "WhatsApp", "Email"].includes(channel))
    throw new ApiError(
      422,
      "INVALID_CHANNEL",
      "Select SMS, WhatsApp or Email.",
    );
  const institution = await one(
      "SELECT name,settings FROM institutions WHERE id=?",
      [actor.institutionId],
    ),
    settings = JSON.parse(institution!.settings);
  const dlt = channel === "SMS" ? await communicationConfig(actor) : null;
  if (dlt && (!dlt.enabled || !dlt.templates.after1))
    throw new ApiError(
      422,
      "DLT_TEMPLATE_REQUIRED",
      "Configure a registered after1 template and consent before sending SMS reminders.",
    );
  const statements = [];
  for (const studentId of studentIds) {
    await own(actor, "students", studentId);
    const parent = await one(
      `SELECT par.*,s.name student_name,fs.outstanding_paise,fs.next_due_date,fs.academic_year_id FROM students s JOIN student_parents sp ON sp.student_id=s.id AND sp.institution_id=s.institution_id JOIN parents par ON par.id=sp.parent_id JOIN student_balances fs ON fs.student_id=s.id AND fs.institution_id=s.institution_id WHERE s.institution_id=? AND s.id=? AND sp.is_primary=1 ORDER BY fs.academic_year_id DESC LIMIT 1`,
      [actor.institutionId, studentId],
    );
    if (!parent)
      throw new ApiError(
        422,
        "PARENT_REQUIRED",
        "The selected student needs a parent contact.",
      );
    const recipient = channel === "Email" ? parent.email : parent.mobile;
    if (!recipient)
      throw new ApiError(
        422,
        "CONTACT_REQUIRED",
        "The parent has no contact for the selected channel.",
      );
    const values = {
      parent: parent.guardian_name,
      student: parent.student_name,
      amount: money(parent.outstanding_paise, true),
      date: parent.next_due_date || "",
    };
    let message =
      template ||
      settings.templates?.overdue ||
      "Dear {parent}, {student} has an outstanding fee of {amount}.";
    for (const [k, v] of Object.entries(values))
      message = message.replaceAll("{" + k + "}", String(v));
    let metadata = {};
    if (dlt) {
      if (!parent.sms_consent)
        throw new ApiError(
          422,
          "SMS_CONSENT_REQUIRED",
          "Record guardian SMS consent first.",
        );
      const approved = dlt.templates.after1!;
      const variables = {
        student: parent.student_name,
        amount: money(parent.outstanding_paise, true),
        date: parent.next_due_date || "",
        institution: institution!.name,
      };
      message = approved.body;
      for (const [key, value] of Object.entries(variables))
        message = message.replaceAll(
          "{" + key + "}",
          String(value).replace(/[\r\n]/g, " "),
        );
      metadata = {
        dlt: {
          entityId: dlt.entityId,
          senderId: dlt.senderId,
          templateId: approved.id,
        },
        variables,
      };
    }
    const id = uuid();
    statements.push(
      insert("notifications", {
        id,
        institution_id: actor.institutionId,
        ...stamps(actor.userId),
        academic_year_id: parent.academic_year_id,
        student_id: studentId,
        parent_id: parent.id,
        recipient,
        channel,
        message,
        metadata: JSON.stringify(metadata),
        status: "Queued",
      }),
      audit(actor, "Queued payment reminder", "notifications", id, null, {
        studentId,
        channel,
        recipient,
      }),
    );
  }
  await batch(statements);
  return { queued: studentIds.length };
}
export async function processNotifications(actor: Actor) {
  permit(actor, "admin");
  scheduleNotifications(actor);
  return { queued: true, sent: 0, failed: 0, waiting: 0 };
}
async function deliverNotifications(actor: Actor) {
  await run(
    "UPDATE notifications SET status='Queued' WHERE institution_id=? AND status='Processing' AND updated_at<?",
    [actor.institutionId, new Date(Date.now() - 600000).toISOString()],
  );
  const queued = await all(
    "SELECT * FROM notifications WHERE institution_id=? AND (status='Queued' OR (status='Failed' AND datetime(updated_at)<datetime('now','-5 minutes'))) AND attempts<5 ORDER BY created_at LIMIT 5",
    [actor.institutionId],
  );
  let sent = 0,
    failed = 0,
    waiting = 0;
  for (const n of queued) {
    const provider = await readProvider(actor.institutionId, n.channel);
    if (!provider) {
      waiting++;
      continue;
    }
    const metadata = JSON.parse(n.metadata || "{}");
    if (n.channel === "SMS") {
      const parent = n.parent_id
        ? await one(
            "SELECT sms_consent FROM parents WHERE institution_id=? AND id=?",
            [actor.institutionId, n.parent_id],
          )
        : null;
      if (
        !parent?.sms_consent ||
        !metadata.dlt?.entityId ||
        !metadata.dlt?.templateId ||
        !metadata.dlt?.senderId
      ) {
        await run(
          "UPDATE notifications SET status='Failed',attempts=5,last_error='SMS requires guardian consent and a registered DLT template',updated_at=? WHERE institution_id=? AND id=?",
          [now(), actor.institutionId, n.id],
        );
        failed++;
        continue;
      }
    }
    if (metadata.sessionExpiresAt && metadata.sessionExpiresAt < now()) {
      await run(
        "UPDATE notifications SET status='Failed',attempts=5,last_error='WhatsApp reply window expired',updated_at=? WHERE institution_id=? AND id=?",
        [now(), actor.institutionId, n.id],
      );
      failed++;
      continue;
    }
    // Claim work once. Provider receives the stable ID as its idempotency key.
    const claimed = await stmt(
      "UPDATE notifications SET status='Processing',attempts=attempts+1,updated_at=? WHERE id=? AND status IN ('Queued','Failed') RETURNING id",
      [now(), n.id],
    ).first();
    if (!claimed) continue;
    try {
      const attachments = [];
      if (metadata.receiptId && n.channel === "Email") {
        const artifact = await one(
          "SELECT object_key FROM document_artifacts WHERE institution_id=? AND receipt_id=?",
          [actor.institutionId, metadata.receiptId],
        );
        const file = artifact
          ? await env.BUCKET?.get(artifact.object_key)
          : null;
        if (!file) throw new Error("Receipt is not ready");
        const bytes = new Uint8Array(await file.arrayBuffer());
        let binary = "";
        for (let offset = 0; offset < bytes.length; offset += 8192)
          binary += String.fromCharCode(
            ...bytes.subarray(offset, offset + 8192),
          );
        attachments.push({
          filename: "receipt.pdf",
          contentType: "application/pdf",
          contentBase64: btoa(binary),
        });
      }
      const meta = n.channel === "WhatsApp" && provider.adapter === "Meta";
      const templateName = metadata.receiptId
        ? provider.receiptTemplateName
        : provider.reminderTemplateName;
      if (meta && !metadata.sessionExpiresAt && !templateName)
        throw new Error(
          "An approved WhatsApp receipt template is required outside the reply window",
        );
      const payload = meta
        ? metadata.sessionExpiresAt
          ? {
              messaging_product: "whatsapp",
              to: n.recipient,
              type: "text",
              text: { preview_url: false, body: n.message },
            }
          : {
              messaging_product: "whatsapp",
              to: n.recipient,
              type: "template",
              template: {
                name: templateName,
                language: { code: provider.templateLanguage || "en" },
                components: [
                  {
                    type: "body",
                    parameters: [{ type: "text", text: n.message }],
                  },
                ],
              },
            }
        : {
            id: n.id,
            channel: n.channel,
            recipient: n.recipient,
            message: n.message,
            institutionId: actor.institutionId,
            dlt: metadata.dlt,
            variables: metadata.variables,
            attachments,
          };
      const response = await fetch(provider.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + provider.token,
          "Idempotency-Key": n.id,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(4000),
        redirect: "manual",
      });
      if (!response.ok)
        throw new Error("Provider returned HTTP " + response.status);
      const result = (await response.json()) as Row;
      await run(
        "UPDATE notifications SET status='Sent',reference_id=?,sent_at=?,last_error=NULL,updated_at=? WHERE id=?",
        [
          String(
            result.id || result.referenceId || result.messages?.[0]?.id || n.id,
          ),
          now(),
          now(),
          n.id,
        ],
      );
      sent++;
    } catch {
      await run(
        "UPDATE notifications SET status='Failed',last_error='Delivery provider did not accept this message',updated_at=? WHERE id=?",
        [now(), n.id],
      );
      failed++;
    }
  }
  return { sent, failed, waiting };
}
export async function runFinancialJobs(actor: Actor) {
  permit(actor, "admin");
  const institution = await one(
      "SELECT settings FROM institutions WHERE id=?",
      [actor.institutionId],
    ),
    settings = JSON.parse(institution!.settings),
    date = today();
  let lateFees = 0,
    reminders = 0;
  const cursorKey = "jobs:cursor:" + actor.institutionId,
    cursor =
      (await one("SELECT value FROM platform WHERE key=?", [cursorKey]))
        ?.value || "";
  const installments = await all(
    "SELECT ib.* FROM installment_balances ib JOIN academic_years ay ON ay.id=ib.academic_year_id WHERE ib.institution_id=? AND ib.outstanding_paise>0 AND ay.status IN ('Draft','Active') AND ib.id>? ORDER BY ib.id LIMIT 100",
    [actor.institutionId, cursor],
  );
  for (const i of installments) {
    const days = Math.floor(
        (Date.parse(date) - Date.parse(i.due_date)) / 86400000,
      ),
      base = { institution_id: actor.institutionId, ...stamps(actor.userId) };
    if (settings.lateFee?.enabled && days > 0) {
      const previous = await one(
          "SELECT COALESCE(SUM(amount_paise),0) amount FROM late_fee_runs WHERE institution_id=? AND installment_id=?",
          [actor.institutionId, i.id],
        ),
        value = accrueLateFee(
          Math.max(0, i.outstanding_paise - i.adjustment_paise),
          i.due_date,
          date,
          settings.lateFee,
          previous!.amount,
        );
      if (value > 0) {
        const adjustmentId = uuid();
        await batch([
          insert("late_fee_runs", {
            id: uuid(),
            ...base,
            installment_id: i.id,
            period: date,
            amount_paise: value,
          }),
          insert("fee_adjustments", {
            id: adjustmentId,
            ...base,
            student_id: i.student_id,
            academic_year_id: i.academic_year_id,
            invoice_id: i.invoice_id,
            installment_id: i.id,
            kind: "Late Fee",
            amount_paise: value,
            reason: "Automatic late fee for " + i.title,
            approved_by: actor.userId,
          }),
          insert("ledger_entries", {
            id: uuid(),
            ...base,
            student_id: i.student_id,
            academic_year_id: i.academic_year_id,
            invoice_id: i.invoice_id,
            adjustment_id: adjustmentId,
            kind: "Late Fee",
            description: "Late fee for " + i.title,
            debit_paise: value,
            credit_paise: 0,
            entry_date: date,
          }),
          audit(actor, "Calculated late fee", "installments", i.id, null, {
            value,
            date,
          }),
        ]);
        lateFees++;
      }
    }
    if (
      ["Email", "WhatsApp"].includes(settings.reminders?.channel) &&
      settings.reminders?.enabled !== false &&
      (days === -Number(settings.reminders?.beforeDays ?? 7) ||
        days === 0 ||
        days === Number(settings.reminders?.afterDays ?? 3))
    ) {
      const key = `reminder:${i.id}:${date}`;
      if (
        !(await one(
          "SELECT id FROM notifications WHERE institution_id=? AND dedupe_key=?",
          [actor.institutionId, key],
        ))
      ) {
        const parent = await one(
            "SELECT par.* FROM student_parents sp JOIN parents par ON par.id=sp.parent_id WHERE sp.institution_id=? AND sp.student_id=? AND sp.is_primary=1",
            [actor.institutionId, i.student_id],
          ),
          student = await one("SELECT name FROM students WHERE id=?", [
            i.student_id,
          ]);
        if (parent) {
          const channel = settings.reminders?.channel || "SMS",
            recipient = channel === "Email" ? parent.email : parent.mobile;
          if (recipient) {
            let message =
              days > 0
                ? settings.templates.overdue
                : settings.templates.upcoming;
            for (const [k, v] of Object.entries({
              parent: parent.guardian_name,
              student: student!.name,
              amount: money(i.outstanding_paise, true),
              date: i.due_date,
            }))
              message = message.replaceAll("{" + k + "}", v as string);
            await run(
              "INSERT INTO notifications(id,institution_id,academic_year_id,parent_id,student_id,recipient,channel,message,status,dedupe_key,created_at,updated_at,created_by,updated_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
              [
                uuid(),
                actor.institutionId,
                i.academic_year_id,
                parent.id,
                i.student_id,
                recipient,
                channel,
                message,
                "Queued",
                key,
                now(),
                now(),
                actor.userId,
                actor.userId,
              ],
            );
            reminders++;
          }
        }
      }
    }
  }
  const last = installments.at(-1)?.id || cursor,
    more = await one(
      "SELECT ib.id FROM installment_balances ib JOIN academic_years ay ON ay.id=ib.academic_year_id WHERE ib.institution_id=? AND ib.outstanding_paise>0 AND ay.status IN ('Draft','Active') AND ib.id>? LIMIT 1",
      [actor.institutionId, last],
    );
  await run(
    "INSERT INTO platform(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
    [cursorKey, more ? last : ""],
  );
  const scheduled = await queueScheduledReminders(actor);
  reminders += scheduled.queued;
  const notifications = await processNotifications(actor),
    deliverable = await one(
      "SELECT COUNT(*) count FROM notifications n JOIN provider_configs pc ON pc.institution_id=n.institution_id AND pc.provider=n.channel WHERE n.institution_id=? AND n.status='Queued' AND n.attempts<5",
      [actor.institutionId],
    );
  const outbox = await one(
    "SELECT COUNT(*) count FROM notification_outbox WHERE institution_id=? AND state='Queued'",
    [actor.institutionId],
  );
  const documentPending = await one(
    "SELECT COUNT(*) count FROM document_jobs WHERE institution_id=? AND state IN ('Queued','Processing') AND attempts<5",
    [actor.institutionId],
  );
  const hasMore =
    !!more ||
    !!scheduled.hasMore ||
    !!documentPending?.count ||
    !!deliverable?.count ||
    !!outbox?.count;
  await batch([
    insert("job_runs", {
      id: uuid(),
      institution_id: actor.institutionId,
      ...stamps(actor.userId),
      kind: "Financial maintenance",
      run_key: uuid(),
      status: "Completed",
      result: JSON.stringify({ lateFees, reminders, ...notifications }),
    }),
    stmt("DELETE FROM rate_limits WHERE window<?", [
      Math.floor(Date.now() / 60000) - 10,
    ]),
  ]);
  return {
    lateFees,
    reminders,
    ...notifications,
    processed: installments.length,
    scanHasMore: !!more || !!scheduled.hasMore,
    hasMore,
  };
}

// A durable outbox row is committed with the payment. Delivery is recoverable
// by the existing scheduler even if this request's background task is interrupted.
export function scheduleNotifications(actor: Actor) {
  scheduleCommunications(actor.institutionId);
}
export async function flushNotifications(actor: Actor) {
  await expandPaymentNotifications(actor);
  return deliverNotifications(actor);
}
async function expandPaymentNotifications(actor: Actor) {
  const rows = await all(
    "SELECT o.id,p.id payment_id,p.student_id,p.academic_year_id,p.amount_paise,p.paid_at,r.number,r.id receipt_id FROM notification_outbox o JOIN payments p ON p.id=o.payment_id AND p.institution_id=o.institution_id JOIN receipts r ON r.payment_id=p.id WHERE o.institution_id=? AND o.state='Queued' AND o.available_at<=? ORDER BY o.created_at LIMIT 5",
    [actor.institutionId, now()],
  );
  const institution = await one(
    "SELECT name,settings FROM institutions WHERE id=?",
    [actor.institutionId],
  );
  const settings = JSON.parse(institution?.settings || "{}");
  for (const row of rows) {
    await run(
      "INSERT OR IGNORE INTO document_jobs(id,institution_id,receipt_id,state,attempts,created_at,updated_at) VALUES(?,?,?,'Queued',0,?,?)",
      [
        "pdf:" + row.receipt_id,
        actor.institutionId,
        row.receipt_id,
        now(),
        now(),
      ],
    );
    const contact = await one(
      "SELECT p.* FROM parents p JOIN student_parents sp ON sp.parent_id=p.id AND sp.institution_id=p.institution_id WHERE sp.institution_id=? AND sp.student_id=? AND sp.is_primary=1",
      [actor.institutionId, row.student_id],
    );
    const statements = [];
    if (settings.receiptNotifications?.enabled && contact) {
      const channel = settings.receiptNotifications.channel || "Email",
        recipient = channel === "Email" ? contact.email : contact.mobile;
      if (recipient) {
        let receiptMessage = `Payment of ${money(row.amount_paise, true)} received. Receipt ${row.number}. Your receipt is attached.`,
          receiptMetadata: Record<string, unknown> = {
            receiptId: row.receipt_id,
          };
        if (channel === "SMS") {
          const config = await communicationConfig(actor),
            t = config.templates.receipt,
            student = await own(actor, "students", row.student_id);
          if (config.enabled && t && contact.sms_consent) {
            const variables = {
              student: student.name,
              amount: money(row.amount_paise, true),
              date: String(row.paid_at).slice(0, 10),
              institution: institution!.name,
              receipt: row.number,
            };
            receiptMessage = t.body;
            for (const [k, v] of Object.entries(variables))
              receiptMessage = receiptMessage.replaceAll(
                "{" + k + "}",
                String(v).replace(/[\r\n]/g, " "),
              );
            receiptMetadata = {
              ...receiptMetadata,
              dlt: {
                entityId: config.entityId,
                senderId: config.senderId,
                templateId: t.id,
              },
              variables,
            };
          }
        }
        const grant =
          channel === "WhatsApp"
            ? await issueParentGrant(
                actor,
                contact.id,
                7,
                "Receipt notification",
              )
            : null;
        statements.push(
          stmt(
            "INSERT OR IGNORE INTO notifications(id,institution_id,academic_year_id,student_id,parent_id,recipient,channel,message,status,metadata,created_at,updated_at,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            [
              "receipt:" + row.payment_id,
              actor.institutionId,
              row.academic_year_id,
              row.student_id,
              contact.id,
              recipient,
              channel,
              grant
                ? `Payment of ${money(row.amount_paise, true)} received. Receipt ${row.number}. Download: ${grant.url}`
                : receiptMessage,
              "Queued",
              JSON.stringify(receiptMetadata),
              now(),
              now(),
              actor.userId,
              actor.userId,
            ],
          ),
        );
      }
    }
    statements.push(
      stmt(
        "UPDATE notification_outbox SET state='Completed',updated_at=? WHERE institution_id=? AND id=? AND state='Queued'",
        [now(), actor.institutionId, row.id],
      ),
    );
    await batch(statements);
  }
}
