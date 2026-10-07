import { z } from "zod";
import { invite } from "../catalog";
import { all, now, one, stmt, uuid, batch, stamps } from "../db";
import { patchUser, resetUser, revokeInvitation } from "../staff";
import { Actor, ApiError, audit, own, permit } from "../security";
import { hashPassword } from "../auth-service";
import { normalizedPermissions } from "../../lib/permissions";
import { checkCapacity } from "../tenancy";
import { ok, RouteContext } from "./shared";

export async function usersRoute(ctx: RouteContext): Promise<Response | null> {
  const { actor, path, p, method, body, request, url, requestId } = ctx;

  // 1. Direct user creation: POST /api/users
  if (path[0] === "users" && path.length === 1 && method === "POST") {
    permit(actor, "users.manage");
    const schema = z.object({
      email: z.string().trim().toLowerCase().email(),
      fullName: z.string().trim().min(2),
      mobile: z.string().optional().default(""),
      role: z.string().default("STAFF"),
      password: z.string().optional().default("Temp@1234"),
      permissions: z.array(z.string()).optional(),
      sectionId: z.string().optional(),
      feeVisibility: z.boolean().optional().default(false),
    });
    const d = schema.parse(body);

    await checkCapacity(actor, "users", d.email);

    let user = await one<{ id: string }>("SELECT id FROM users WHERE lower(email)=?", [d.email]);
    if (!user) {
      const newUserId = uuid();
      await stmt(
        "INSERT INTO users(id, email, name, created_at, updated_at, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [newUserId, d.email, d.fullName, now(), now(), actor.userId, actor.userId],
      ).run();
      user = { id: newUserId };
    }

    const membershipId = uuid();
    const granted = normalizedPermissions(d.role, d.permissions || []);
    if (d.role === "TEACHER" && d.feeVisibility && !granted.includes("fees.view")) {
      granted.push("fees.view");
    }

    // Insert or update membership
    await stmt(
      `INSERT INTO memberships(id, institution_id, user_id, role, display_name, mobile, permissions, section_id, fee_visibility, active, created_at, updated_at, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
       ON CONFLICT(institution_id, user_id) DO UPDATE SET
         role=excluded.role,
         display_name=excluded.display_name,
         mobile=excluded.mobile,
         permissions=excluded.permissions,
         section_id=excluded.section_id,
         fee_visibility=excluded.fee_visibility,
         active=1,
         updated_at=excluded.updated_at,
         updated_by=excluded.updated_by`,
      [
        membershipId,
        actor.institutionId,
        user.id,
        d.role,
        d.fullName,
        d.mobile,
        JSON.stringify(granted),
        d.sectionId || null,
        d.feeVisibility ? 1 : 0,
        now(),
        now(),
        actor.userId,
        actor.userId,
      ],
    ).run();

    // Setup user credentials
    const salt = uuid();
    const passwordHash = await hashPassword(d.password, salt);
    await stmt(
      `INSERT INTO user_credentials(user_id, username, password_hash, salt, failed_attempts, locked_until, active, password_changed_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, 0, NULL, 1, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         password_hash=excluded.password_hash,
         salt=excluded.salt,
         active=1,
         updated_at=excluded.updated_at`,
      [user.id, d.email, passwordHash, salt, now(), now(), now()],
    ).run();

    await audit(actor, "Created institution user", "memberships", membershipId, null, {
      userId: user.id,
      email: d.email,
      role: d.role,
    });

    return ok({ id: membershipId, userId: user.id, created: true }, requestId);
  }

  // 2. Admin Password Reset: POST /api/users/:id/reset-password
  if (path[0] === "users" && path[1] && path[2] === "reset-password" && method === "POST") {
    permit(actor, "users.manage");
    const member = await own(actor, "memberships", path[1]);
    const schema = z.object({
      password: z.string().min(6).optional(),
    });
    const parsed = schema.safeParse(body);
    const newPassword = (parsed.success && parsed.data.password) ? parsed.data.password : `Pass@${uuid().slice(0, 8)}`;

    const salt = uuid();
    const hash = await hashPassword(newPassword, salt);

    await stmt(
      `INSERT INTO user_credentials(user_id, username, password_hash, salt, failed_attempts, locked_until, active, password_changed_at, created_at, updated_at)
       VALUES (?, (SELECT email FROM users WHERE id=?), ?, ?, 0, NULL, 1, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         password_hash=excluded.password_hash,
         salt=excluded.salt,
         failed_attempts=0,
         locked_until=NULL,
         password_changed_at=excluded.password_changed_at,
         updated_at=excluded.updated_at`,
      [member.user_id, member.user_id, hash, salt, now(), now(), now()],
    ).run();

    await audit(actor, "Reset user password", "memberships", member.id, null, { userId: member.user_id });
    return ok({ success: true, temporaryPassword: newPassword, message: "Password updated successfully." }, requestId);
  }

  // 3. User Login History: GET /api/users/:id/login-history
  if (path[0] === "users" && path[1] && path[2] === "login-history" && method === "GET") {
    permit(actor, "users.view");
    const member = await own(actor, "memberships", path[1]);
    const history = await all(
      "SELECT * FROM login_history WHERE user_id=? ORDER BY created_at DESC LIMIT 25",
      [member.user_id],
    );
    return ok({ rows: history }, requestId);
  }

  // 4. Toggle Active Status: POST /api/users/:id/toggle-active
  if (path[0] === "users" && path[1] && path[2] === "toggle-active" && method === "POST") {
    permit(actor, "users.manage");
    const member = await own(actor, "memberships", path[1]);
    if (member.user_id === actor.userId) {
      throw new ApiError(422, "SELF_DEACTIVATE_REJECTED", "You cannot deactivate your own account.");
    }
    const nextActive = member.active === 1 ? 0 : 1;

    await batch([
      stmt("UPDATE memberships SET active=?, updated_at=?, updated_by=? WHERE id=? AND institution_id=?", [
        nextActive,
        now(),
        actor.userId,
        member.id,
        actor.institutionId,
      ]),
      stmt("UPDATE user_credentials SET active=?, updated_at=? WHERE user_id=?", [
        nextActive,
        now(),
        member.user_id,
      ]),
    ]);

    await audit(actor, nextActive ? "Activated user" : "Deactivated user", "memberships", member.id, member, { active: nextActive });
    return ok({ success: true, active: nextActive === 1 }, requestId);
  }

  // 5. Delete User: DELETE /api/users/:id
  if (path[0] === "users" && path[1] && method === "DELETE") {
    permit(actor, "users.manage");
    const member = await own(actor, "memberships", path[1]);
    if (member.user_id === actor.userId) {
      throw new ApiError(422, "SELF_DELETE_REJECTED", "You cannot delete your own account.");
    }
    if (member.role === "INSTITUTION_ADMIN") {
      const otherAdmins = await one(
        "SELECT id FROM memberships WHERE institution_id=? AND role='INSTITUTION_ADMIN' AND active=1 AND id!=?",
        [actor.institutionId, member.id],
      );
      if (!otherAdmins) {
        throw new ApiError(409, "LAST_ADMIN", "Cannot remove the only active administrator.");
      }
    }

    await stmt("DELETE FROM memberships WHERE institution_id=? AND id=?", [actor.institutionId, member.id]).run();
    await audit(actor, "Removed user membership", "memberships", member.id, member, null);
    return ok({ deleted: true }, requestId);
  }

  // Existing routes
  if (path[0] === "users" && path[1] && method === "PATCH")
    return ok(await patchUser(actor, path[1], body), requestId);
  if (
    path[0] === "users" &&
    path[1] &&
    path[2] === "reset-access" &&
    method === "POST"
  )
    return ok(await resetUser(actor, path[1]), requestId);
  if (path[0] === "invitations" && path[1] && method === "PATCH")
    return ok(await revokeInvitation(actor, path[1]), requestId);
  if (method === "POST") {
    if (path[0] === "users" && path[1] === "invite")
      return ok(await invite(actor, body), requestId);
  }
  return null;
}
