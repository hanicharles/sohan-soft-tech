import { uuid } from "./db";
import { idempotent, requiresIdempotency } from "./idempotency";
import { platformRoute } from "./platform";
import { organizationReport } from "./organizations";
import { cashRoute } from "./routes/cash";
import { extensionsRoute } from "./routes/extensions";
import { feesRoute } from "./routes/fees";
import { operationsRoute } from "./routes/operations";
import { paymentsRoute } from "./routes/payments";
import { publicRoute } from "./routes/public";
import { reportsRoute } from "./routes/reports";
import { listResource, patchResource } from "./routes/resources";
import { settingsRoute } from "./routes/settings";
import {
  errorResponse,
  guardRoute,
  ok,
  readBody,
  routeArea,
  RouteContext,
} from "./routes/shared";
import { studentsRoute } from "./routes/students";
import { usersRoute } from "./routes/users";
import {
  actorFor,
  ApiError,
  authenticate,
  clearedLocalSessionCookie,
  createLocalSession,
  csrf,
  localSessionCookie,
  platformActor,
  rateLimit,
} from "./security";
import { bootstrap, initializeAccount, session } from "./seed";
import { enforceSubscription, portalInfo, withTenantContext } from "./tenancy";
import { ensureLocalDatabase } from "./local-db";
export async function dispatch(request: Request): Promise<Response> {
  await ensureLocalDatabase();
  const requestId = uuid();
  try {
    const url = new URL(request.url),
      path = url.pathname
        .replace(/^\/api\/?/, "")
        .split("/")
        .filter(Boolean),
      p = url.searchParams,
      method = request.method;
    if (path[0] === "auth" && path[1] === "login" && method === "POST") {
      const body = await readBody(request);
      const username = typeof body.username === "string" ? body.username.trim() : "";
      const password = typeof body.password === "string" ? body.password : "";
      if (username !== "test" || password !== "tst@123")
        throw new ApiError(401, "INVALID_CREDENTIALS", "Invalid username or password.");
      const token = await createLocalSession();
      const response = ok({ authenticated: true }, requestId);
      response.headers.set("Set-Cookie", localSessionCookie(token));
      return response;
    }
    if (path[0] === "auth" && path[1] === "logout" && method === "POST") {
      const response = ok({ authenticated: false }, requestId);
      response.headers.set("Set-Cookie", clearedLocalSessionCookie());
      return response;
    }
    const publicResponse = await publicRoute(request, path, method, requestId);
    if (publicResponse) return publicResponse;
    if (path[0] === "campus") {
      const info = await portalInfo(path[1] || "");
      const supplied = request.headers.get("x-institution-id");
      if (supplied && supplied !== info.id)
        throw new ApiError(
          403,
          "TENANT_MISMATCH",
          "The requested institution does not match this portal.",
        );
      const headers = new Headers(request.headers);
      headers.set("x-institution-id", info.id);
      request = new Request(request.url, {
        method: request.method,
        headers,
        ...(!["GET", "HEAD"].includes(request.method)
          ? { body: await request.arrayBuffer() }
          : {}),
      });
      path.splice(0, 2);
    }
    if (["parent", "pay", "payment-links"].includes(path[0]))
      throw new ApiError(
        410,
        "PORTAL_REMOVED",
        "Parent account and payment portal access is not available. Contact the institution accounts office.",
      );
    csrf(request);
    const user = await authenticate(request);
    await rateLimit(request, user.userId);
    if (path[0] === "session") return ok(await session(request), requestId);
    if (path[0] === "platform") {
      await initializeAccount(request);
      const admin = await platformActor(request);
      const body = method === "GET" ? {} : await readBody(request);
      const result = await platformRoute(admin, path.slice(1), method, p, body);
      const response = ok(result?.cookie ? result.data : result, requestId);
      if (result?.cookie) response.headers.set("Set-Cookie", result.cookie);
      return response;
    }
    if (path[0] === "bootstrap") return ok(await bootstrap(request), requestId);
    if (
      path[0] === "organizations" &&
      path[2] === "reports" &&
      method === "GET"
    )
      return ok(await organizationReport(request, path[1], p), requestId);

    const actor = await actorFor(request);
    guardRoute(actor, path, method, p);
    await enforceSubscription(actor, method, routeArea(path));
    return await withTenantContext(actor, async () => {
      const body = ["GET", "HEAD"].includes(method)
        ? {}
        : await readBody(request);
      const ctx: RouteContext = {
        actor,
        path,
        p,
        method,
        body,
        request,
        url,
        requestId,
      };
      const handle = async () => {
        for (const route of [
          extensionsRoute,
          settingsRoute,
          usersRoute,
          reportsRoute,
          studentsRoute,
          cashRoute,
          feesRoute,
          paymentsRoute,
          operationsRoute,
        ]) {
          const response = await route(ctx);
          if (response) return response;
        }
        if (method === "GET")
          return ok(await listResource(actor, path[0], p), requestId);
        if (method === "PATCH")
          return ok(await patchResource(actor, path, body), requestId);
        throw new ApiError(404, "NOT_FOUND", "API route not found.");
      };
      return requiresIdempotency(path, method)
        ? idempotent(actor, method + ":" + path.join("/"), body, handle)
        : handle();
    });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
