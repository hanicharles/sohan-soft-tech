import {
  communicationQueue,
  scheduledMaintenance,
  type CommunicationJob,
} from "../server/communications";
import handler from "vinext/server/fetch-handler";
import { runWithConnectorBinding } from "../lib/connector-context";
import type { ConnectorBinding } from "../lib/connector-contract.mjs";

export default {
  async scheduled(
    _controller: ScheduledController,
    _env: Cloudflare.Env,
    ctx: ExecutionContext,
  ) {
    ctx.waitUntil(scheduledMaintenance());
  },
  async queue(batch: MessageBatch<CommunicationJob>) {
    await communicationQueue(batch);
  },
  fetch(
    request: Request,
    env: Cloudflare.Env,
    ctx: ExecutionContext<{ CONNECTORS?: ConnectorBinding }>,
  ) {
    let binding = ctx.props?.CONNECTORS;
    // Local preview emulates the same request-scoped capability. This branch and
    // the auxiliary service binding are absent from production builds.
    if (import.meta.env.DEV && !binding && env.CONNECTORS) {
      const preview = env.CONNECTORS;
      const expiresAt = Date.now() + 60_000;
      binding = {
        async getContext() {
          if (Date.now() >= expiresAt)
            return { status: "request_context_expired" };
          return preview.getContext?.() ?? { status: "binding_unavailable" };
        },
        async invoke(connectorId, actionName, args) {
          if (Date.now() >= expiresAt) {
            return {
              status: "request_context_expired",
              message: "This request has expired. Please try again.",
            };
          }
          return preview.invoke(connectorId, actionName, args);
        },
      };
    }
    const response = runWithConnectorBinding(binding, () =>
      handler.fetch(request, env, ctx),
    );
    if (
      /^\/(portal\/|api\/parent-access\/)/.test(new URL(request.url).pathname)
    )
      return Promise.resolve(response).then((original) => {
        const secured = new Response(original.body, original);
        secured.headers.set("Referrer-Policy", "no-referrer");
        secured.headers.set("Cache-Control", "private,no-store");
        secured.headers.set("X-Robots-Tag", "noindex,nofollow,noarchive");
        secured.headers.set("X-Frame-Options", "DENY");
        return secured;
      });
    return response;
  },
};
