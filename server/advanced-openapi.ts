// Kept separate so the original financial API contract remains stable.
const response = {
  description:
    "Successful operation. JSON uses {success,data,requestId}; document routes return a PDF, SVG or XML attachment.",
};
function operation(
  path: string,
  summary: string,
  method: "get" | "post" | "patch",
  publicAccess = false,
  idempotent = false,
) {
  const parameters = [...path.matchAll(/\{([^}]+)\}/g)].map(([, name]) => ({
    name,
    in: "path",
    required: true,
    schema: { type: "string" },
  }));
  if (idempotent)
    parameters.push({
      name: "Idempotency-Key",
      in: "header",
      required: true,
      schema: { type: "string" },
    });
  return {
    summary,
    tags: ["Advanced workflows"],
    security: publicAccess ? [] : [{ LocalSession: [] }],
    parameters,
    ...(method !== "get"
      ? {
          requestBody: {
            required: true,
            content: { "application/json": { schema: { type: "object" } } },
          },
        }
      : {}),
    responses: {
      "200": response,
      "202": {
        description:
          "Document generation queued; retry after the Retry-After interval.",
      },
      "400": {
        description:
          "Malformed request, missing idempotency key or invalid signature.",
      },
      "401": {
        description: "Invalid, expired or revoked access or signature.",
      },
      "403": {
        description: "Institution, organization or role access denied.",
      },
      "409": {
        description:
          "Duplicate reference, stale review, closed year or conflicting financial state.",
      },
      "422": { description: "Validation failure." },
      "503": {
        description:
          "Provider or document service needs configuration or recovery.",
      },
    },
  };
}
const definitions: [
  string,
  "get" | "post" | "patch",
  string,
  boolean?,
  boolean?,
][] = [
  [
    "/parent-links",
    "get",
    "List revocable grants for parentId; never returns bearer tokens",
  ],
  ["/parent-links", "post", "Issue signed guardian link for 1–30 days"],
  ["/parent-links/{id}/revoke", "post", "Revoke a guardian grant"],
  [
    "/parent-access/{token}",
    "get",
    "Guardian-only fee overview; student, year and page filters",
    true,
  ],
  [
    "/parent-access/{token}/checkout",
    "post",
    "Create server-authoritative Razorpay order",
    true,
    true,
  ],
  [
    "/parent-access/{token}/verify",
    "post",
    "Verify signature and captured provider payment before ledger settlement",
    true,
    true,
  ],
  [
    "/parent-access/{token}/receipts/{id}",
    "get",
    "Download related-child receipt from R2 or queue generation",
    true,
  ],
  [
    "/parent-access/{token}/upi",
    "get",
    "Dynamic unpaid-demand UPI QR; requires student and year",
    true,
  ],
  [
    "/parent-access/{token}/certificates/tuition",
    "get",
    "Approved annual tuition certificate; student and financialYear (April starting year)",
    true,
  ],
  [
    "/parent-access/{token}/certificates/80g/{id}",
    "get",
    "Download original official donation Form 10BE supplied by institution",
    true,
  ],
  [
    "/certificates/tuition-allocations",
    "post",
    "Supervisor approves immutable tuition portion of a settled payment",
  ],
  [
    "/certificates/donations",
    "post",
    "Record approved donation and store original official Form 10BE PDF",
  ],
  ["/communications", "get", "Read registered DLT settings"],
  [
    "/communications",
    "post",
    "Save DLT entity, sender, template IDs and exact approved content",
  ],
  [
    "/communications/consent",
    "post",
    "Record or withdraw guardian SMS consent with evidence",
  ],
  [
    "/webhooks/whatsapp/{institutionId}",
    "get",
    "Meta challenge: hub.mode, hub.verify_token, hub.challenge",
    true,
  ],
  [
    "/webhooks/whatsapp/{institutionId}",
    "post",
    "Meta raw-body webhook; X-Hub-Signature-256 required",
    true,
  ],
  [
    "/platform/organizations",
    "get",
    "Platform-only organization and campus directory",
  ],
  [
    "/platform/organizations",
    "post",
    "Create trust, assign campuses and grant report administrator",
  ],
  [
    "/platform/organizations/{id}",
    "patch",
    "Move institution or enable/revoke group report administrator; approval reason required",
  ],
  [
    "/organizations/{id}/reports",
    "get",
    "Verified organization membership only; from, to, page; totals span every assigned campus",
  ],
  [
    "/rollovers",
    "get",
    "List resumable rollover operations and available sections",
  ],
  [
    "/rollovers/preview",
    "post",
    "Validate mapping, unpaid dues and pending settlement; return review fingerprint",
  ],
  [
    "/rollovers/start",
    "post",
    "Approve fingerprint and freeze source academic year",
    false,
    true,
  ],
  [
    "/rollovers/{id}/process",
    "post",
    "Atomically promote up to five students and carry receivables per resumable batch",
    false,
    true,
  ],
  [
    "/hardware",
    "get",
    "Institution devices, card assignments, service rates and recent attendance",
  ],
  ["/hardware/devices", "post", "Create HMAC device; returns secret once"],
  ["/hardware/devices/{id}", "patch", "Enable or disable device"],
  ["/hardware/cards", "post", "Assign hashed RFID UID to institution student"],
  ["/hardware/cards/{id}", "patch", "Enable or disable assigned card"],
  [
    "/hardware/rules",
    "post",
    "Approve daily Transport or Hostel rate against student installment",
  ],
  [
    "/hardware/rfid-punch",
    "post",
    "HMAC over timestamp.nonce.rawBody using per-device secret; X-Device-ID, X-Timestamp, X-Nonce, X-Signature",
    true,
  ],
  [
    "/reports/tally",
    "get",
    "Balanced Tally Prime voucher XML; required year, optional from/to; max 1,000 vouchers",
  ],
  [
    "/reconciliation/bank-preview",
    "post",
    "Validate and persist up to 100 parsed INR bank rows; return proposed matches",
  ],
  [
    "/reconciliation/bank-commit",
    "post",
    "Accountant-approved per-row atomic bank posting; reports individual failures",
    false,
    true,
  ],
];
export const advancedPaths: Record<
  string,
  Record<string, ReturnType<typeof operation>>
> = {};
for (const [path, method, summary, publicAccess, idempotent] of definitions) {
  (advancedPaths[path] ??= {})[method] = operation(
    path,
    summary,
    method,
    publicAccess,
    idempotent,
  );
}
