import { env } from "cloudflare:workers";
import { all, now, one, Row, run, today } from "../db";
import { webhook } from "../gateway";
import { backfillJournal } from "../journal";
import { provisionValidationTenant } from "../maintenance";
import { runFinancialJobs } from "../notifications";
import { openApi } from "../openapi";
import { Actor, ApiError, constantEqual, rateLimit } from "../security";
import {
  portalInfo,
  tenantSubscription,
  upgradeTenantData,
  withTenantContext,
} from "../tenancy";
import { ok, readBody } from "./shared";
import { parentRoute } from "./parent";
import { messagingWebhook } from "./webhooks";
import { rfidPunch } from "../hardware";

export async function publicRoute(
  request: Request,
  path: string[],
  method: string,
  requestId: string,
): Promise<Response | null> {
  const parent = await parentRoute(request, path, requestId);
  if (parent) return parent;
  const messaging = await messagingWebhook(request, path, requestId);
  if (messaging) return messaging;
  if (path.join("/") === "hardware/rfid-punch" && method === "POST")
    return ok(await rfidPunch(request), requestId);
  if (path.join("/") === "payments/webhook" && method === "POST")
    return ok(await webhook(request), requestId);
  if (path[0] === "health") return ok({ status: "ok" }, requestId);
  if (path[0] === "openapi")
    return new Response(JSON.stringify(openApi), {
      headers: { "Content-Type": "application/json" },
    });
  if (path.join("/") === "jobs/saas-upgrade" && method === "POST") {
    if (
      !env.JOB_SECRET ||
      !constantEqual(
        request.headers.get("authorization") || "",
        "Bearer " + env.JOB_SECRET,
      )
    )
      throw new ApiError(
        401,
        "AUTH_REQUIRED",
        "A migration service credential is required.",
      );
    const owner = await one("SELECT value FROM platform WHERE key='owner'");
    if (!owner)
      throw new ApiError(
        409,
        "OWNER_REQUIRED",
        "Platform owner must sign in first.",
      );
    const result = await upgradeTenantData(owner.value);
    const body = await readBody(request);
    const validation =
      body.createValidationInstitution === true
        ? await provisionValidationTenant(request, owner.value)
        : null;
    return ok(
      { ...result, validation, journal: await backfillJournal() },
      requestId,
    );
  }
  if (path[0] === "jobs" && path[1] === "scheduled") {
    if (
      !env.JOB_SECRET ||
      !constantEqual(
        request.headers.get("authorization") || "",
        "Bearer " + env.JOB_SECRET,
      )
    )
      throw new ApiError(
        401,
        "AUTH_REQUIRED",
        "A scheduler service credential is required.",
      );
    if (method === "GET")
      return ok(
        {
          institutions: await all(
            "SELECT i.id,i.name FROM institutions i JOIN institution_subscriptions s ON s.institution_id=i.id WHERE i.status='Active' AND s.status IN ('Active','Trial') AND s.start_date<=? AND s.end_date>=? ORDER BY i.id",
            [today(), today()],
          ),
          lastRun:
            (
              await one(
                "SELECT value FROM platform WHERE key='jobs:last-service-run'",
              )
            )?.value || null,
          runs: await all(
            "SELECT institution_id,kind,status,result,created_at FROM job_runs ORDER BY created_at DESC LIMIT 20",
          ),
        },
        requestId,
      );
    if (method !== "POST")
      throw new ApiError(
        405,
        "METHOD_NOT_ALLOWED",
        "Use POST to run financial jobs.",
      );
    let body: Row;
    try {
      body = (await request.json()) as Row;
    } catch {
      throw new ApiError(400, "INVALID_JSON", "Enter valid JSON.");
    }
    const institution = await one(
      "SELECT id FROM institutions WHERE status='Active' AND id=?",
      [String(body.institutionId || "")],
    );
    if (!institution && body.institutionId)
      throw new ApiError(404, "NOT_FOUND", "Active institution not found.");
    const stamp = now();
    await run(
      "INSERT INTO platform(key,value) VALUES ('jobs:last-service-run',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      [stamp],
    );
    if (!institution)
      return ok({ processed: 0, hasMore: false, lastRun: stamp }, requestId);
    const subscription = await tenantSubscription(institution.id);
    if (
      !["Active", "Trial"].includes(subscription.effectiveStatus) ||
      subscription.start_date > today()
    )
      return ok(
        {
          institutionId: institution.id,
          lastRun: stamp,
          skipped: true,
          subscriptionStatus: subscription.effectiveStatus,
          hasMore: false,
        },
        requestId,
      );
    const actor: Actor = {
      userId: "scheduler",
      name: "Scheduled jobs",
      email: "",
      institutionId: institution.id,
      role: "INSTITUTION_ADMIN",
      feeVisibility: true,
      request,
    };
    return ok(
      {
        institutionId: institution.id,
        lastRun: stamp,
        ...(await withTenantContext(actor, () => runFinancialJobs(actor))),
      },
      requestId,
    );
  }
  if (path[0] === "portal" && method === "GET") {
    await rateLimit(
      request,
      "portal:" + request.headers.get("cf-connecting-ip"),
      120,
    );
    const info = await portalInfo(path[1] || "");
    if (path[2] === "logo") {
      const i = await one("SELECT logo_key FROM institutions WHERE id=?", [
        info.id,
      ]);
      const file =
        i?.logo_key && env.BUCKET ? await env.BUCKET.get(i.logo_key) : null;
      if (!file) throw new ApiError(404, "NOT_FOUND", "Logo not found.");
      return new Response(file.body, {
        headers: {
          "Content-Type": file.httpMetadata?.contentType || "image/png",
          "Cache-Control": "public,max-age=300",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
    return ok(info, requestId);
  }
  return null;
}
