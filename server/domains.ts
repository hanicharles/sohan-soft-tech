import { env } from "cloudflare:workers";
import { z } from "zod";
import { batch, now, one, stmt, uuid } from "./db";
import { Actor, ApiError, permit } from "./security";
import { platformAudit } from "./tenancy";
export const portalOrigin = (request: Request) =>
  env.PLATFORM_ORIGIN || new URL(request.url).origin;
export async function domainInfo(id: string, request: Request) {
  const i = await one("SELECT id,slug FROM institutions WHERE id=?", [id]);
  if (!i) throw new ApiError(404, "NOT_FOUND", "Institution not found.");
  const domain = await one(
    "SELECT * FROM institution_domains WHERE institution_id=?",
    [id],
  );
  const target = new URL(portalOrigin(request)).hostname;
  return {
    defaultPortal: portalOrigin(request) + "/campus/" + i.slug,
    domain,
    status: domain?.status || "Not Configured",
    verificationStatus: domain?.verification_status || "Not Configured",
    sslStatus: domain?.ssl_status || "Not Configured",
    dns: domain
      ? [
          { type: "CNAME", name: domain.hostname, value: target },
          {
            type: "TXT",
            name: "_campusledger." + domain.hostname,
            value: domain.verification_token,
          },
        ]
      : [],
    provisioningAvailable: false,
    provisioningNote:
      "After DNS verification, a platform administrator must attach the hostname to this deployment, configure tenant routing, and provision HTTPS and authentication. DNS verification alone does not activate the domain.",
  };
}
export async function configureDomain(
  actor: Actor,
  id: string,
  input: unknown,
) {
  permit(actor, "system");
  const d = z
    .object({
      hostname: z
        .string()
        .trim()
        .toLowerCase()
        .max(253)
        .regex(
          /^(?!.*\.\.)[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/,
        ),
    })
    .parse(input);
  await domainInfo(id, actor.request);
  if (
    d.hostname === new URL(portalOrigin(actor.request)).hostname ||
    /\.(local|test|example|localhost)$/.test(d.hostname) ||
    /^\d+\.\d+\.\d+\.\d+$/.test(d.hostname)
  )
    throw new ApiError(
      422,
      "INVALID_DOMAIN",
      "Enter a public institution hostname, such as fees.yourschool.in.",
    );
  const old = await one(
    "SELECT * FROM institution_domains WHERE institution_id=?",
    [id],
  );
  if (old?.hostname === d.hostname) return domainInfo(id, actor.request);
  const token =
    "campusledger-verification=" + uuid() + uuid().replaceAll("-", "");
  await batch([
    stmt(
      `INSERT INTO institution_domains(id,institution_id,hostname,verification_token,status,verification_status,ssl_status,created_at,updated_at,created_by,updated_by) VALUES (?,?,?,?,'Pending Verification','Pending Verification','Pending Provisioning',?,?,?,?) ON CONFLICT(institution_id) DO UPDATE SET hostname=excluded.hostname,verification_token=excluded.verification_token,status='Pending Verification',verification_status='Pending Verification',ssl_status='Pending Provisioning',last_checked_at=NULL,dns_message=NULL,updated_at=excluded.updated_at,updated_by=excluded.updated_by`,
      [
        old?.id || uuid(),
        id,
        d.hostname,
        token,
        now(),
        now(),
        actor.userId,
        actor.userId,
      ],
    ),
    platformAudit(
      actor,
      "Configured custom domain",
      "institution_domains",
      id,
      old,
      { hostname: d.hostname },
      id,
    ),
  ]);
  return domainInfo(id, actor.request);
}
export async function verifyDomain(actor: Actor, id: string) {
  permit(actor, "system");
  const info = await domainInfo(id, actor.request),
    d = info.domain;
  if (!d)
    throw new ApiError(422, "DOMAIN_REQUIRED", "Configure a domain first.");
  async function lookup(name: string, type: string) {
    const response = await fetch(
      "https://cloudflare-dns.com/dns-query?" +
        new URLSearchParams({ name, type }),
      {
        headers: { accept: "application/dns-json" },
        signal: AbortSignal.timeout(8000),
      },
    );
    if (!response.ok)
      throw new ApiError(
        503,
        "DNS_UNAVAILABLE",
        "DNS verification is unavailable. Please retry.",
      );
    const value: any = await response.json();
    if (value.Status !== 0 && value.Status !== 3)
      throw new ApiError(
        503,
        "DNS_UNAVAILABLE",
        "The DNS resolver could not complete verification. Please retry.",
      );
    return value.Answer || [];
  }
  const [txt, cname] = await Promise.all([
    lookup("_campusledger." + d.hostname, "TXT"),
    lookup(d.hostname, "CNAME"),
  ]);
  const owned = txt.some(
    (a: any) =>
      a.type === 16 &&
      a.data.replace(/"\s*"/g, "").replace(/^"|"$/g, "") ===
        d.verification_token,
  );
  const routed = cname.some(
    (a: any) =>
      a.type === 5 &&
      a.name.replace(/\.$/, "").toLowerCase() === d.hostname &&
      a.data.replace(/\.$/, "").toLowerCase() ===
        new URL(portalOrigin(actor.request)).hostname,
  );
  const verified = owned && routed,
    status = verified ? "Verified" : "Pending Verification";
  const message = verified
    ? "Ownership and CNAME verified. Domain activation and HTTPS provisioning are pending."
    : `TXT ownership: ${owned ? "found" : "missing"}. CNAME target: ${routed ? "correct" : "missing or different"}. DNS changes can take time to propagate.`;
  await batch([
    stmt(
      "UPDATE institution_domains SET status=?,verification_status=?,ssl_status='Pending Provisioning',last_checked_at=?,dns_message=?,updated_at=?,updated_by=? WHERE institution_id=?",
      [status, status, now(), message, now(), actor.userId, id],
    ),
    platformAudit(
      actor,
      "Checked DNS verification",
      "institution_domains",
      id,
      { status: d.status },
      { status, message },
      id,
    ),
  ]);
  return domainInfo(id, actor.request);
}
