import { saveLogo } from "../branding";
import { createCatalog } from "../catalog";
import { createInstitution, grantInstitutionAdmin } from "../institutions";
import { saveProvider } from "../providers";
import { ApiError } from "../security";
import { tenantSubscription, tenantUsage } from "../tenancy";
import { ok, RouteContext } from "./shared";

export async function settingsRoute(
  ctx: RouteContext,
): Promise<Response | null> {
  const { actor, path, p, method, body, request, url, requestId } = ctx;
  if (path[0] === "usage" && method === "GET")
    return ok(
      {
        usage: await tenantUsage(actor.institutionId),
        subscription: await tenantSubscription(actor.institutionId),
      },
      requestId,
    );
  if (path.join("/") === "settings/logo" && method === "POST")
    return ok(await saveLogo(actor, actor.institutionId, body), requestId);
  if (method === "POST") {
    if (path[0] === "catalog")
      return ok(await createCatalog(actor, path[1], body), requestId);
  }
  if (method === "POST") {
    if (path[0] === "providers")
      return ok(
        await saveProvider(
          actor,
          String(body.provider),
          body.config,
          String(body.mode || "test"),
        ),
        requestId,
      );
  }
  if (method === "POST") {
    if (path[0] === "institutions") {
      if (path[1] && path[2] === "admins")
        return ok(await grantInstitutionAdmin(actor, path[1], body), requestId);
      if (path.length !== 1)
        throw new ApiError(404, "NOT_FOUND", "Institution route not found.");
      return ok(await createInstitution(actor, body), requestId);
    }
  }
  return null;
}
