import { z } from "zod";
import { parseMoney } from "../lib/money";
import { serviceActor } from "./communications";
import { all, batch, insert, now, one, stamps, stmt, uuid } from "./db";
import { readProvider, saveProvider } from "./providers";
import {
  Actor,
  ApiError,
  audit,
  constantEqual,
  hmac,
  own,
  permit,
  rateLimit,
  sha256,
} from "./security";
import { withTenantContext } from "./tenant-context";

const cardUid = z
  .string()
  .trim()
  .regex(/^[a-fA-F0-9:-]{8,64}$/)
  .transform((v) => v.replace(/[:-]/g, "").toUpperCase())
  .pipe(
    z
      .string()
      .regex(
        /^(?:[A-F0-9]{2}){4,16}$/,
        "Use a 4–16 byte hexadecimal RFID UID.",
      ),
  );
export async function createDevice(actor: Actor, input: unknown) {
  permit(actor, "settings.manage");
  const { name } = z
      .object({ name: z.string().trim().min(2).max(100) })
      .parse(input),
    id = uuid();
  const secret = Array.from(crypto.getRandomValues(new Uint8Array(32)), (v) =>
    v.toString(16).padStart(2, "0"),
  ).join("");
  await saveProvider(actor, "RFID:" + id, { secret }, "production");
  await batch([
    insert("hardware_devices", {
      id,
      institution_id: actor.institutionId,
      name,
      ...stamps(actor.userId),
    }),
    audit(actor, "Registered RFID device", "hardware_devices", id, null, {
      name,
    }),
  ]);
  return {
    id,
    secret,
    endpoint: new URL(actor.request.url).origin + "/api/hardware/rfid-punch",
  };
}
export async function assignCard(actor: Actor, input: unknown) {
  permit(actor, "settings.manage");
  const d = z
    .object({ studentId: z.string().min(1), uid: cardUid })
    .parse(input);
  await own(actor, "students", d.studentId);
  const id = uuid();
  await batch([
    insert("rfid_cards", {
      id,
      institution_id: actor.institutionId,
      student_id: d.studentId,
      uid_hash: await sha256(d.uid),
      ...stamps(actor.userId),
    }),
    audit(actor, "Assigned RFID card", "rfid_cards", id, null, {
      studentId: d.studentId,
    }),
  ]);
  return { id };
}
export async function saveDailyRule(actor: Actor, input: unknown) {
  permit(actor, "settings.manage");
  permit(actor, "fees.manage");
  const d = z
    .object({
      studentId: z.string(),
      installmentId: z.string(),
      service: z.enum(["Transport", "Hostel"]),
      amount: z.string(),
      active: z.boolean(),
    })
    .parse(input);
  const i = await own(actor, "installments", d.installmentId),
    amount = parseMoney(d.amount);
  if (i.student_id !== d.studentId || amount <= 0)
    throw new ApiError(
      422,
      "INVALID_RULE",
      "Select that student’s installment and a positive daily rate.",
    );
  await batch([
    stmt(
      "INSERT INTO daily_fee_rules(id,institution_id,student_id,installment_id,service,amount_paise,active,created_at,updated_at,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(institution_id,student_id,service) DO UPDATE SET installment_id=excluded.installment_id,amount_paise=excluded.amount_paise,active=excluded.active,updated_at=excluded.updated_at,updated_by=excluded.updated_by",
      [
        uuid(),
        actor.institutionId,
        d.studentId,
        d.installmentId,
        d.service,
        amount,
        +d.active,
        now(),
        now(),
        actor.userId,
        actor.userId,
      ],
    ),
    audit(
      actor,
      "Approved daily attendance fee rule",
      "daily_fee_rules",
      d.studentId,
      null,
      { ...d, amountPaise: amount },
    ),
  ]);
  return { saved: true };
}
export async function rfidPunch(request: Request) {
  const deviceId = request.headers.get("x-device-id") || "",
    timestamp = request.headers.get("x-timestamp") || "",
    nonce = request.headers.get("x-nonce") || "";
  if (
    !/^\d{10}$/.test(timestamp) ||
    Math.abs(Date.now() / 1000 - Number(timestamp)) > 300 ||
    !/^[a-zA-Z0-9_-]{16,80}$/.test(nonce)
  )
    throw new ApiError(
      401,
      "STALE_DEVICE_REQUEST",
      "Use a fresh Unix-seconds timestamp and random nonce.",
    );
  const raw = await request.text();
  if (raw.length > 8192)
    throw new ApiError(
      413,
      "PAYLOAD_TOO_LARGE",
      "Device payload is too large.",
    );
  const device = await one<{ id: string; institution_id: string }>(
    "SELECT d.id,d.institution_id FROM hardware_devices d JOIN institutions i ON i.id=d.institution_id AND i.status='Active' WHERE d.id=? AND d.active=1",
    [deviceId],
  );
  const config = device
    ? await readProvider(device.institution_id, "RFID:" + device.id)
    : null;
  if (
    !device ||
    !config?.secret ||
    !constantEqual(
      await hmac(config.secret, `${timestamp}.${nonce}.${raw}`),
      request.headers.get("x-signature") || "",
    )
  )
    throw new ApiError(
      401,
      "INVALID_SIGNATURE",
      "Device authentication failed.",
    );
  await rateLimit(request, "rfid:" + device.id, 120);
  const data = z
    .object({
      eventId: z.string().regex(/^[a-zA-Z0-9_-]{8,100}$/),
      uid: cardUid,
      punchedAt: z.string().datetime({ offset: true }),
      direction: z.enum(["IN", "OUT"]),
    })
    .parse(JSON.parse(raw));
  const hash = await sha256(raw),
    existing = await one<{ payload_hash: string; id: string }>(
      "SELECT id,payload_hash FROM attendance_events WHERE device_id=? AND event_id=?",
      [device.id, data.eventId],
    );
  if (existing) {
    if (existing.payload_hash !== hash)
      throw new ApiError(
        409,
        "EVENT_CONFLICT",
        "This event ID was already used with different data.",
      );
    return { attendanceId: existing.id, duplicate: true };
  }
  const stamp = Date.parse(data.punchedAt);
  if (stamp > Date.now() + 60000 || stamp < Date.now() - 86400000)
    throw new ApiError(
      422,
      "INVALID_PUNCH_TIME",
      "Punch time must be within the past 24 hours.",
    );
  const student = await one<{ student_id: string }>(
    "SELECT c.student_id FROM rfid_cards c JOIN students s ON s.id=c.student_id AND s.institution_id=c.institution_id AND s.status='Active' WHERE c.institution_id=? AND c.uid_hash=? AND c.active=1",
    [device.institution_id, await sha256(data.uid)],
  );
  if (!student)
    throw new ApiError(
      404,
      "CARD_NOT_ASSIGNED",
      "Card is not assigned to an active student.",
    );
  const date = new Date(stamp + 19800000).toISOString().slice(0, 10),
    actor = serviceActor(device.institution_id),
    id = uuid();
  return withTenantContext(actor, async () => {
    const statements = [
      insert("attendance_events", {
        id,
        institution_id: actor.institutionId,
        device_id: device.id,
        event_id: data.eventId,
        nonce,
        payload_hash: hash,
        student_id: student.student_id,
        punched_at: data.punchedAt,
        local_date: date,
        direction: data.direction,
        created_at: now(),
      }),
    ];
    let charged = 0;
    if (data.direction === "IN") {
      const rules = await all<{
        id: string;
        installment_id: string;
        service: string;
        amount_paise: number;
        invoice_id: string;
        academic_year_id: string;
      }>(
        "SELECT r.*,i.invoice_id,i.academic_year_id FROM daily_fee_rules r JOIN installments i ON i.id=r.installment_id AND i.institution_id=r.institution_id AND i.student_id=r.student_id JOIN academic_years y ON y.id=i.academic_year_id AND y.institution_id=i.institution_id WHERE r.institution_id=? AND r.student_id=? AND r.active=1 AND y.status='Active' AND y.start_date<=? AND y.end_date>=? AND NOT EXISTS(SELECT 1 FROM year_rollovers yr WHERE yr.institution_id=r.institution_id AND yr.source_year_id=y.id) AND NOT EXISTS(SELECT 1 FROM daily_fee_charges c WHERE c.institution_id=r.institution_id AND c.student_id=r.student_id AND c.service=r.service AND c.local_date=?)",
        [actor.institutionId, student.student_id, date, date, date],
      );
      for (const r of rules) {
        const adjustmentId = uuid(),
          base = {
            institution_id: actor.institutionId,
            ...stamps(actor.userId),
          };
        statements.push(
          insert("fee_adjustments", {
            id: adjustmentId,
            ...base,
            student_id: student.student_id,
            academic_year_id: r.academic_year_id,
            invoice_id: r.invoice_id,
            installment_id: r.installment_id,
            kind: r.service,
            amount_paise: r.amount_paise,
            reason: `Daily ${r.service} attendance on ${date}`,
            approved_by: actor.userId,
          }),
          insert("ledger_entries", {
            id: uuid(),
            ...base,
            student_id: student.student_id,
            academic_year_id: r.academic_year_id,
            invoice_id: r.invoice_id,
            adjustment_id: adjustmentId,
            kind: "Daily " + r.service,
            description: `Daily ${r.service} attendance on ${date}`,
            debit_paise: r.amount_paise,
            credit_paise: 0,
            entry_date: date,
          }),
          insert("daily_fee_charges", {
            id: uuid(),
            institution_id: actor.institutionId,
            student_id: student.student_id,
            attendance_id: id,
            rule_id: r.id,
            adjustment_id: adjustmentId,
            service: r.service,
            local_date: date,
            amount_paise: r.amount_paise,
            created_at: now(),
          }),
        );
        charged += r.amount_paise;
      }
    }
    statements.push(
      audit(
        actor,
        "Accepted signed RFID attendance",
        "attendance_events",
        id,
        null,
        {
          deviceId: device.id,
          studentId: student.student_id,
          date,
          direction: data.direction,
          chargedPaise: charged,
        },
      ),
    );
    try {
      await batch(statements);
    } catch (e) {
      const retry = await one<{ id: string; payload_hash: string }>(
        "SELECT id,payload_hash FROM attendance_events WHERE device_id=? AND event_id=?",
        [device.id, data.eventId],
      );
      if (retry?.payload_hash === hash)
        return { attendanceId: retry.id, duplicate: true };
      throw e;
    }
    return { attendanceId: id, chargedPaise: charged, duplicate: false };
  });
}
