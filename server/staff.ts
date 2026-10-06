import { z } from "zod";
import {
  normalizedPermissions,
  permissions,
  staffRoles,
} from "../lib/permissions";
import { batch, now, one, stmt, uuid } from "./db";
import { Actor, ApiError, audit, hasPermission, own, permit } from "./security";
import { checkCapacity } from "./tenancy";
const access = z.object({
  role: z.enum(staffRoles),
  fullName: z.string().trim().min(2).max(160),
  mobile: z
    .string()
    .trim()
    .regex(/^(\+91[- ]?)?[6-9]\d{9}$/)
    .or(z.literal(""))
    .default(""),
  permissions: z.array(z.enum(permissions)).default([]),
  sectionId: z.string().optional(),
  feeVisibility: z.boolean().default(false),
});
export async function invite(actor: Actor, input: unknown) {
  permit(actor, "users.manage");
  const d = access
    .extend({ email: z.string().trim().toLowerCase().email() })
    .parse(input);
  if (d.role === "TEACHER" && !d.sectionId)
    throw new ApiError(
      422,
      "SECTION_REQUIRED",
      "Assign a section to this teacher.",
    );
  if (d.sectionId) await own(actor, "sections", d.sectionId);
  const existing = await one(
    "SELECT * FROM invitations WHERE institution_id=? AND email=?",
    [actor.institutionId, d.email],
  );
  const member = await one(
    "SELECT m.* FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.institution_id=? AND lower(u.email)=?",
    [actor.institutionId, d.email],
  );
  if (member?.role === "SUPER_ADMIN")
    throw new ApiError(
      403,
      "PLATFORM_ACCOUNT",
      "Platform access is managed separately. Use audited support access.",
    );
  if (!(existing?.status === "Pending"))
    await checkCapacity(actor, "users", d.email);
  const id = existing?.id || uuid(),
    granted = normalizedPermissions(d.role, d.permissions);
  if (d.role === "TEACHER" && d.feeVisibility && !granted.includes("fees.view"))
    granted.push("fees.view");
  enforceGrantAuthority(actor, d.role, granted);
  await batch([
    stmt(
      `INSERT INTO invitations(id,institution_id,email,role,display_name,mobile,permissions,section_id,fee_visibility,status,created_at,updated_at,created_by,updated_by) VALUES (?,?,?,?,?,?,?,?,?,'Pending',?,?,?,?) ON CONFLICT(institution_id,email) DO UPDATE SET role=excluded.role,display_name=excluded.display_name,mobile=excluded.mobile,permissions=excluded.permissions,section_id=excluded.section_id,fee_visibility=excluded.fee_visibility,status='Pending',updated_at=excluded.updated_at,updated_by=excluded.updated_by`,
      [
        id,
        actor.institutionId,
        d.email,
        d.role,
        d.fullName,
        d.mobile,
        JSON.stringify(granted),
        d.sectionId || null,
        +granted.includes("fees.view"),
        now(),
        now(),
        actor.userId,
        actor.userId,
      ],
    ),
    audit(actor, "Granted staff access", "invitations", id, existing, {
      ...d,
      permissions: granted,
    }),
  ]);
  return { id, loginMethod: "Local", accessStatus: "Pending" };
}
export async function patchUser(actor: Actor, id: string, input: unknown) {
  permit(actor, "users.manage");
  const current = await own(actor, "memberships", id);
  if (current.role === "SUPER_ADMIN")
    throw new ApiError(
      403,
      "PLATFORM_ACCOUNT",
      "Platform access is managed separately.",
    );
  if (current.user_id === actor.userId)
    throw new ApiError(
      422,
      "SELF_ROLE_CHANGE",
      "You cannot change your own access.",
    );
  const d = access
    .partial()
    .extend({ active: z.boolean().optional() })
    .parse(input);
  const role = d.role || current.role,
    section = d.sectionId ?? current.section_id;
  if (role === "TEACHER" && !section)
    throw new ApiError(
      422,
      "SECTION_REQUIRED",
      "Assign a section to this teacher.",
    );
  if (section) await own(actor, "sections", section);
  if (
    current.role === "INSTITUTION_ADMIN" &&
    current.active === 1 &&
    (d.active === false || role !== "INSTITUTION_ADMIN") &&
    !(await one(
      "SELECT id FROM memberships WHERE institution_id=? AND role='INSTITUTION_ADMIN' AND active=1 AND id<>?",
      [actor.institutionId, id],
    ))
  )
    throw new ApiError(
      409,
      "LAST_ADMIN",
      "Create another active institution administrator before changing this account.",
    );
  if (d.active === true && !current.active)
    await checkCapacity(
      actor,
      "users",
      (await one("SELECT email FROM users WHERE id=?", [current.user_id]))
        ?.email,
    );
  const granted = normalizedPermissions(
    role,
    d.permissions ?? (d.role ? [] : JSON.parse(current.permissions || "[]")),
  );
  if (role === "TEACHER" && d.feeVisibility && !granted.includes("fees.view"))
    granted.push("fees.view");
  enforceGrantAuthority(actor, role, granted);
  await batch([
    stmt(
      "UPDATE memberships SET role=?,display_name=?,mobile=?,permissions=?,section_id=?,fee_visibility=?,active=?,updated_at=?,updated_by=? WHERE id=? AND institution_id=?",
      [
        role,
        d.fullName ?? current.display_name,
        d.mobile ?? current.mobile,
        JSON.stringify(granted),
        section || null,
        +granted.includes("fees.view"),
        d.active === undefined ? current.active : +d.active,
        now(),
        actor.userId,
        id,
        actor.institutionId,
      ],
    ),
    audit(
      actor,
      "Updated staff permissions",
      "memberships",
      id,
      {
        role: current.role,
        active: current.active,
        permissions: JSON.parse(current.permissions || "[]"),
      },
      { ...d, permissions: granted },
    ),
  ]);
  return { saved: true };
}
export async function resetUser(actor: Actor, id: string) {
  permit(actor, "users.manage");
  const current = await own(actor, "memberships", id),
    u = await one("SELECT email FROM users WHERE id=?", [current.user_id]);
  if (current.user_id === actor.userId || current.role === "SUPER_ADMIN")
    throw new ApiError(
      422,
      "ACCESS_RESET_REJECTED",
      "You cannot reset this account.",
    );
  const grant = await invite(actor, {
    email: u!.email,
    role: current.role,
    fullName: current.display_name || u!.email.split("@")[0],
    mobile: current.mobile,
    sectionId: current.section_id || undefined,
    permissions: JSON.parse(current.permissions || "[]"),
  });
  await patchUser(actor, id, { active: false });
  return {
    ...grant,
    message:
      "Staff access reset. Sign in again and reopen the institution portal to accept the access grant.",
  };
}
export async function revokeInvitation(actor: Actor, id: string) {
  permit(actor, "users.manage");
  const current = await own(actor, "invitations", id);
  await batch([
    stmt(
      "UPDATE invitations SET status='Revoked',updated_at=?,updated_by=? WHERE institution_id=? AND id=?",
      [now(), actor.userId, actor.institutionId, id],
    ),
    audit(actor, "Revoked pending staff access", "invitations", id, current, {
      status: "Revoked",
    }),
  ]);
  return { saved: true };
}

function enforceGrantAuthority(
  actor: Actor,
  role: string,
  granted: readonly any[],
) {
  if (actor.role === "INSTITUTION_ADMIN") return;
  if (
    role === "INSTITUTION_ADMIN" ||
    granted.some((p) => !hasPermission(actor, p))
  )
    throw new ApiError(
      403,
      "GRANT_FORBIDDEN",
      "You may only grant permissions you already hold. Institution administrator access requires an institution administrator.",
    );
}
