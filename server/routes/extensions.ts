import { z } from "zod";
import { commitBankImport, previewBankImport } from "../bank-reconciliation";
import {
  annualTuitionCertificate,
  approveTuitionAllocation,
  donationCertificate,
  registerDonationCertificate,
} from "../certificates";
import {
  communicationConfig,
  saveCommunicationConfig,
} from "../communications";
import { all, batch, now, stmt } from "../db";
import { assignCard, createDevice, saveDailyRule } from "../hardware";
import { issueParentGrant } from "../parent-portal";
import { audit, own, permit } from "../security";
import { ok, RouteContext } from "./shared";
export async function extensionsRoute(ctx: RouteContext) {
  const { actor, path, method, body, p, requestId } = ctx;
  if (path[0] === "parent-links") {
    permit(actor, "students.manage");
    if (method === "GET")
      return ok(
        {
          rows: await all(
            "SELECT id,parent_id,expires_at,revoked_at,purpose,created_at FROM parent_portal_grants WHERE institution_id=? AND parent_id=? ORDER BY created_at DESC LIMIT 30",
            [actor.institutionId, p.get("parentId") || ""],
          ),
        },
        requestId,
      );
    if (method === "POST" && !path[1]) {
      const d = z
        .object({
          parentId: z.string(),
          days: z.number().int().min(1).max(30).default(7),
        })
        .parse(body);
      return ok(await issueParentGrant(actor, d.parentId, d.days), requestId);
    }
    if (method === "POST" && path[2] === "revoke") {
      await own(actor, "parent_portal_grants", path[1]);
      await batch([
        stmt(
          "UPDATE parent_portal_grants SET revoked_at=?,updated_at=?,updated_by=? WHERE institution_id=? AND id=?",
          [now(), now(), actor.userId, actor.institutionId, path[1]],
        ),
        audit(
          actor,
          "Revoked parent portal link",
          "parent_portal_grants",
          path[1],
          null,
          null,
        ),
      ]);
      return ok({ revoked: true }, requestId);
    }
  }
  if (path[0] === "communications") {
    permit(actor, "settings.manage");
    if (method === "GET")
      return ok(await communicationConfig(actor), requestId);
    if (method === "POST" && path[1] === "consent") {
      const d = z
        .object({
          parentId: z.string(),
          consent: z.boolean(),
          reason: z.string().min(5).max(300),
        })
        .parse(body);
      await own(actor, "parents", d.parentId);
      await batch([
        stmt(
          "UPDATE parents SET sms_consent=?,updated_at=?,updated_by=? WHERE institution_id=? AND id=?",
          [+d.consent, now(), actor.userId, actor.institutionId, d.parentId],
        ),
        audit(
          actor,
          "Recorded guardian SMS consent",
          "parents",
          d.parentId,
          null,
          { consent: d.consent, reason: d.reason },
        ),
      ]);
      return ok({ saved: true }, requestId);
    }
    if (method === "POST" && !path[1])
      return ok(await saveCommunicationConfig(actor, body), requestId);
  }
  if (path[0] === "certificates") {
    permit(actor, "settings.manage");
    if (method === "POST" && path[1] === "tuition-allocations")
      return ok(await approveTuitionAllocation(actor, body), requestId);
    if (method === "POST" && path[1] === "donations")
      return ok(await registerDonationCertificate(actor, body), requestId);
    if (method === "GET" && path[1] === "tuition")
      return annualTuitionCertificate(
        actor,
        p.get("student") || "",
        Number(p.get("financialYear")),
      );
    if (method === "GET" && path[1] === "80g")
      return donationCertificate(actor, path[2]);
  }
  if (path[0] === "hardware") {
    permit(actor, "settings.manage");
    if (method === "GET")
      return ok(
        {
          devices: await all(
            "SELECT id,name,active,created_at FROM hardware_devices WHERE institution_id=? ORDER BY name LIMIT 100",
            [actor.institutionId],
          ),
          cards: await all(
            "SELECT c.id,c.student_id,s.name,c.active FROM rfid_cards c JOIN students s ON s.id=c.student_id AND s.institution_id=c.institution_id WHERE c.institution_id=? LIMIT 100",
            [actor.institutionId],
          ),
          rules: await all(
            "SELECT r.*,s.name student_name FROM daily_fee_rules r JOIN students s ON s.id=r.student_id AND s.institution_id=r.institution_id WHERE r.institution_id=? LIMIT 100",
            [actor.institutionId],
          ),
          attendance: await all(
            "SELECT a.id,a.punched_at,a.direction,a.local_date,s.name student_name,d.name device_name FROM attendance_events a JOIN students s ON s.id=a.student_id AND s.institution_id=a.institution_id JOIN hardware_devices d ON d.id=a.device_id AND d.institution_id=a.institution_id WHERE a.institution_id=? ORDER BY a.created_at DESC LIMIT 50",
            [actor.institutionId],
          ),
        },
        requestId,
      );
    if (method === "POST" && path[1] === "devices")
      return ok(await createDevice(actor, body), requestId);
    if (method === "POST" && path[1] === "cards")
      return ok(await assignCard(actor, body), requestId);
    if (method === "POST" && path[1] === "rules")
      return ok(await saveDailyRule(actor, body), requestId);
    if (method === "PATCH" && ["devices", "cards"].includes(path[1])) {
      const table = path[1] === "devices" ? "hardware_devices" : "rfid_cards",
        d = z.object({ active: z.boolean() }).parse(body);
      await own(actor, table, path[2]);
      await batch([
        stmt(
          `UPDATE ${table} SET active=?,updated_at=?,updated_by=? WHERE institution_id=? AND id=?`,
          [+d.active, now(), actor.userId, actor.institutionId, path[2]],
        ),
        audit(actor, "Changed RFID access", table, path[2], null, d),
      ]);
      return ok({ saved: true }, requestId);
    }
  }
  if (path[0] === "reconciliation" && method === "POST") {
    if (path[1] === "bank-preview")
      return ok(await previewBankImport(actor, body), requestId);
    if (path[1] === "bank-commit")
      return ok(await commitBankImport(actor, body), requestId);
  }
  return null;
}
