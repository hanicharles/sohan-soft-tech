import { invite } from "../catalog";
import { patchUser, resetUser, revokeInvitation } from "../staff";
import { ok, RouteContext } from "./shared";

export async function usersRoute(ctx: RouteContext): Promise<Response | null> {
  const { actor, path, p, method, body, request, url, requestId } = ctx;
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
