import { z } from "zod";
import { money } from "../../lib/money";
import { scheduleCommunications, serviceActor } from "../communications";
import { all, batch, insert, now, one, stamps, uuid } from "../db";
import { issueParentGrant } from "../parent-portal";
import { readProvider } from "../providers";
import { ApiError, constantEqual, hmac, rateLimit, sha256 } from "../security";
import { withTenantContext } from "../tenant-context";
import { ok } from "./shared";

const messageSchema = z.object({
  id: z.string().max(200),
  from: z.string().max(40),
  timestamp: z.string().regex(/^\d+$/),
  type: z.string(),
  text: z.object({ body: z.string().max(2000) }).optional(),
});
const webhookSchema = z.object({
  object: z.literal("whatsapp_business_account"),
  entry: z
    .array(
      z.object({
        changes: z
          .array(
            z.object({
              value: z.object({
                metadata: z.object({ phone_number_id: z.string() }),
                messages: z.array(messageSchema).max(20).optional(),
              }),
            }),
          )
          .max(20),
      }),
    )
    .max(20),
});
export function indianMobile(value: string) {
  const digits = value.replace(/\D/g, "");
  return /^(?:91)?[6-9]\d{9}$/.test(digits) ? digits.slice(-10) : null;
}
export async function messagingWebhook(
  request: Request,
  path: string[],
  requestId: string,
) {
  if (path[0] !== "webhooks" || path[1] !== "whatsapp") return null;
  const institutionId = path[2] || "";
  const institution = await one(
    "SELECT id,name FROM institutions WHERE id=? AND status='Active'",
    [institutionId],
  );
  const provider = institution
    ? await readProvider(institutionId, "WhatsApp")
    : null;
  if (!provider?.appSecret || !provider.verifyToken || !provider.phoneNumberId)
    throw new ApiError(404, "NOT_CONFIGURED", "Webhook is not configured.");
  if (request.method === "GET") {
    const p = new URL(request.url).searchParams;
    if (
      p.get("hub.mode") !== "subscribe" ||
      !constantEqual(p.get("hub.verify_token") || "", provider.verifyToken)
    )
      throw new ApiError(403, "INVALID_VERIFICATION", "Verification failed.");
    return new Response((p.get("hub.challenge") || "").slice(0, 200), {
      headers: { "Content-Type": "text/plain" },
    });
  }
  if (request.method !== "POST")
    throw new ApiError(405, "METHOD_NOT_ALLOWED", "Use POST.");
  const raw = await request.text();
  if (raw.length > 128000)
    throw new ApiError(413, "PAYLOAD_TOO_LARGE", "Webhook is too large.");
  if (
    !constantEqual(
      "sha256=" + (await hmac(provider.appSecret, raw)),
      request.headers.get("x-hub-signature-256") || "",
    )
  )
    throw new ApiError(
      401,
      "INVALID_SIGNATURE",
      "Webhook signature is invalid.",
    );
  await rateLimit(request, "whatsapp:" + institutionId, 120);
  const event = webhookSchema.parse(JSON.parse(raw)),
    actor = serviceActor(institutionId);
  return withTenantContext(actor, async () => {
    for (const entry of event.entry)
      for (const change of entry.changes) {
        if (change.value.metadata.phone_number_id !== provider.phoneNumberId)
          throw new ApiError(
            403,
            "TENANT_MISMATCH",
            "Business phone number does not belong to this institution.",
          );
        for (const message of change.value.messages || []) {
          if (
            message.type !== "text" ||
            !message.text ||
            Date.now() / 1000 - Number(message.timestamp) > 86400 ||
            Number(message.timestamp) > Date.now() / 1000 + 60
          )
            continue;
          const existing = await one<{ payload_hash: string }>(
              "SELECT payload_hash FROM webhook_inbox WHERE institution_id=? AND provider='WhatsApp' AND event_id=?",
              [institutionId, message.id],
            ),
            hash = await sha256(JSON.stringify(message));
          if (existing) {
            if (existing.payload_hash !== hash)
              throw new ApiError(
                409,
                "EVENT_CONFLICT",
                "Event content changed.",
              );
            continue;
          }
          const phone = indianMobile(message.from);
          // Admission numbers are identifiers, never authentication. A signed
          // inbound sender must match an existing guardian's verified phone.
          const parents = phone
            ? await all<{ id: string }>(
                "SELECT id FROM parents WHERE institution_id=? AND (replace(replace(replace(mobile,'+',''),' ',''),'-','')=? OR replace(replace(replace(mobile,'+',''),' ',''),'-','')=?) LIMIT 2",
                [institutionId, phone, "91" + phone],
              )
            : [];
          const parent = parents.length === 1 ? parents[0] : null,
            text = message.text.body.trim(),
            isFees = text.toUpperCase() === "FEES";
          const children = parent
            ? await all<{
                id: string;
                name: string;
                admission_number: string;
                academic_year_id: string;
                outstanding_paise: number;
              }>(
                `SELECT s.id,s.name,s.admission_number,e.academic_year_id,COALESCE(b.outstanding_paise,0) outstanding_paise FROM student_parents sp JOIN students s ON s.id=sp.student_id AND s.institution_id=sp.institution_id JOIN enrollments e ON e.student_id=s.id AND e.institution_id=s.institution_id JOIN academic_years y ON y.id=e.academic_year_id AND y.institution_id=e.institution_id AND y.status='Active' LEFT JOIN student_balances b ON b.student_id=s.id AND b.institution_id=s.institution_id AND b.academic_year_id=e.academic_year_id WHERE sp.institution_id=? AND sp.parent_id=? ${isFees ? "" : "AND lower(s.admission_number)=lower(?)"} ORDER BY s.name LIMIT 10`,
                [institutionId, parent.id, ...(isFees ? [] : [text])],
              )
            : [];
          let reply =
            "Please contact the institution accounts office to verify your guardian contact details.";
          if (parent && children.length) {
            const grant = await issueParentGrant(
              actor,
              parent.id,
              1,
              "Guardian-initiated WhatsApp enquiry",
            );
            reply =
              children
                .map(
                  (s) =>
                    `${s.name} (${s.admission_number}): ${money(s.outstanding_paise)} outstanding`,
                )
                .join("\n") +
              "\nFees and receipts: " +
              grant.url;
            const s = children[0];
            if (s.outstanding_paise > 0)
              reply +=
                "\nUPI QR: " +
                new URL(grant.url).origin +
                "/api/parent-access/" +
                grant.token +
                "/upi?" +
                new URLSearchParams({
                  student: s.id,
                  year: s.academic_year_id,
                });
          }
          await batch([
            insert("webhook_inbox", {
              id: uuid(),
              institution_id: institutionId,
              provider: "WhatsApp",
              event_id: message.id,
              payload_hash: hash,
              created_at: now(),
            }),
            insert("notifications", {
              id: uuid(),
              institution_id: institutionId,
              parent_id: parent?.id || null,
              recipient: message.from,
              channel: "WhatsApp",
              message: reply,
              status: "Queued",
              dedupe_key: "wa-reply:" + message.id,
              metadata: JSON.stringify({
                sessionExpiresAt: new Date(
                  Number(message.timestamp) * 1000 + 86400000,
                ).toISOString(),
              }),
              ...stamps(actor.userId),
            }),
          ]);
        }
      }
    scheduleCommunications(institutionId);
    return ok({ received: true }, requestId);
  });
}
