# Sohan Soft Tech — advanced workflows

This is an incremental update to the existing React 19 / Tailwind 4 / Vinext / Cloudflare Worker application. The same institution IDs, school data, staff sign-in, permissions, fee structures, collection engine, receipts and historical ledgers remain in use. No parallel application or parent password account was created.

## Where each instruction is implemented

| Requirement                                     | Exact repository-relative files                                                                                                                                                             |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Signed parent portal                            | `app/portal/[token]/page.tsx`, `features/parent/ParentPortal.tsx`, `server/parent-portal.ts`, `server/routes/parent.ts`, `server/receipt-download.ts`, `features/students/ParentAccess.tsx` |
| Hosted checkout and verified settlement         | `features/parent/ParentPortal.tsx`, `server/routes/parent.ts`, existing `server/gateway.ts`, `server/payments.ts`                                                                           |
| Annual tuition and donation certificates        | `server/certificates.ts`, `features/students/TaxEvidence.tsx`, `server/routes/extensions.ts`                                                                                                |
| Cron, DLT reminders and Queues                  | `build/sites-worker.ts`, `server/communications.ts`, `server/notifications.ts`, `features/auth/CommunicationSettings.tsx`, `infrastructure/communications.wrangler.example.jsonc`           |
| WhatsApp bot                                    | `server/routes/webhooks.ts`, `server/providers.ts`, `features/auth/Settings.tsx`                                                                                                            |
| Trust scope                                     | `server/tenant-context.ts`, `server/organizations.ts`, `features/platform/Organizations.tsx`, `app/organization/[id]/page.tsx`, `features/organization/Dashboard.tsx`                       |
| Academic rollover                               | `server/rollover.ts`, `server/routes/operations.ts`, `features/students/RolloverWizard.tsx`                                                                                                 |
| Audit visualizer                                | `features/auth/AuditLogs.tsx`, `server/routes/resources.ts`                                                                                                                                 |
| RFID ingestion                                  | `server/hardware.ts`, `server/routes/public.ts`, `features/auth/HardwareSettings.tsx`                                                                                                       |
| Tally export                                    | `server/routes/reports.ts`, `server/tally.ts`, `lib/tally.ts`, `features/auth/AccountingSettings.tsx`, `features/reports/TallyExport.tsx`                                                   |
| Bank reconciliation                             | `lib/bank-statements.ts`, `server/bank-reconciliation.ts`, `features/reports/BankImportDialog.tsx`, `features/reports/Reconciliation.tsx`                                                   |
| Schema, migration, routes and API documentation | `db/schema.ts`, `drizzle/0007_salty_ikaris.sql`, `server/api.ts`, `server/advanced-openapi.ts`, `server/openapi.ts`                                                                         |
| Tests                                           | `tests/advanced-unit.mjs`, `tests/advanced.mjs`; existing suites retained                                                                                                                   |

## Database and monetary guarantees

Migration `0007_salty_ikaris.sql` adds organizations and organization membership; an optional organization foreign key on institutions; signed-link grants; DLT configuration and guardian consent; webhook inbox; document jobs and artifacts; approved tuition allocations and official donation documents; rollover/checkpoints/carry-forward records; RFID devices/cards/attendance/daily rules/charges; immutable bank previews and posted references. Existing tables are extended rather than recreated. SQLite triggers enforce related-tenant ownership, immutable evidence, academic freezes, carry-forward traceability and balanced journal projection. Amounts remain integer INR paise; API amount input is a decimal string.

Never apply a migration twice or edit an already-applied migration. The managed Sites publisher applies the new migration before activating its matching Worker. Make a database backup according to your deployment's normal recovery procedure. For a standalone local D1 development environment, apply the repository migrations in order with the existing D1 configuration. Existing journal backfill remains available through the service-authorized `/api/jobs/saas-upgrade` endpoint; Tally refuses to export a range whose journal backfill is incomplete.

## Parent portal and checkout

1. Institution administrator opens a student profile → Parent access → Create link. Guardian contact must already be linked to the student. Copy or open the returned URL, shown only when issued.
2. The bearer URL is `/portal/<signed-token>`; a separate parent account is unnecessary. One grant covers only that guardian's related children. It expires after 1–30 days and can be revoked immediately.
3. Parents select a child/year, inspect fee components and balances, download historical receipts and pay a partial or full amount through Razorpay's hosted checkout.
4. The server creates the payment intent/order. Client success alone never credits the ledger. Verification checks HMAC, provider capture, order, currency and exact amount. The signed Razorpay `payment.captured` webhook settles independently and idempotently.
5. Receipt creation, allocation, ledger legs, invoice balance and durable document/outbox jobs commit atomically. Both A4 and 80mm receipt PDFs and dispatch happen in the background. Staff download/print actions retry HTTP 202 while preparation finishes. Historical receipts without a cached PDF return HTTP 202 with Retry-After while being prepared.

Set an independent `PARENT_PORTAL_SECRET` if desired (32+ characters). Otherwise a domain-separated HMAC signing key is derived from the existing provider encryption secret, so current deployments work without an immediate secret migration. Rotating that underlying secret invalidates existing links. Token hashes, not full URLs, are stored in grant records and audit logs. Pages and APIs set no-store, no-referrer, noindex and framing protection. Treat copied URLs as confidential; keep query/path logging away from external analytics.

Configure institution Razorpay test or production credentials in Settings → Gateways. Set the callback to `https://YOUR_HOST/api/payments/webhook`, subscribe to `payment.captured`, and enter the matching webhook secret. Checkout and verification require a UUID `Idempotency-Key` header. The browser retains its key across retries. Only the public Razorpay key is returned to the browser. Cashfree's existing server adapter is preserved; the new parent UI uses Razorpay.

## Tuition and 80G: separate evidence

Accounts approves the tuition portion of each settled payment in the student profile. An approval requires a reason and is immutable. The generated annual PDF covers an Indian financial year (April–March) and subtracts processed refunds through year end conservatively from tuition first. No display-name inference silently treats development, transport or donation charges as tuition. For a misclassified approval, correct it through an authorized migration/reversal design; the application intentionally does not overwrite approved evidence.

School tuition is not automatically an 80G donation. Form 10BE is the statutory donation certificate obtained after the institution files Form 10BD. The application stores the institution's original official Form 10BE PDF with donor linkage, PAN, approval URN, acknowledgement and immutable evidence. Parents can download it; the app does not fabricate a statutory certificate or claim that ordinary fees qualify. Tuition PDFs are generated with pdf-lib; official donation PDFs are validated with pdf-lib and preserved intact.

Primary references: https://www.incometax.gov.in/iec/foportal/help/all-topics/statutory-forms/popular-form/form10bd-10be-faq and the Income Tax Act's applicable tuition/donation provisions. The document records institution-approved evidence and does not decide an individual's tax eligibility.

## Communications and actual hosting support

Settings → Communications records registered DLT principal entity ID, sender/header, exact template text and template IDs. The 7/3/1-day upcoming templates are required when enabled. Due-date, 1/3/7-day overdue and receipt templates are optional. Record guardian consent with a reason. Unsupported/unapproved SMS fails closed. Manual SMS reminders use the registered after1 template rather than arbitrary text. The provider adapter sends `dlt`, `variables`, recipient, message and a stable idempotency key to the configured HTTPS endpoint; your SMS provider adapter must honor those fields and the registered template constraints. This software does not register DLT entities/templates with telecom operators.

The Worker exports both `scheduled()` and `queue()`. Native Cron enqueues bounded financial scans; queue continuation drains remaining scans. A separate delivery message consumes durable PDF jobs, R2 artifacts and notification rows, with leases, retries and a dead-letter queue configuration. The payment request never waits for these services. There is no guaranteed sub-50ms network latency claim.

**Current managed hosting limitation:** Sites exposes D1 and R2 provisioning but does not expose a native Queue/Cron binding in its manifest. Do not put unsupported queue keys in `.openai/hosting.json`. In that environment the existing daily financial-maintenance automation remains the scheduler, and the same consumer runs using `waitUntil()` with the durable D1 outbox. Interrupted work remains recoverable through the scheduler and Notifications → Process queue. Native Cloudflare Queue and Cron require hosting administrator provisioning; merge `infrastructure/communications.wrangler.example.jsonc` into the existing Worker configuration only when supported. Do not deploy a second independent copy of the application or bypass the managed identity boundary.

The existing scheduler endpoint `/api/jobs/scheduled` is protected by `JOB_SECRET`. Its existing automation should enumerate eligible institutions and repeat institution jobs while `hasMore` is true. Native Cron runs every 15 minutes, scans ten institutions per invocation with a saved cursor and handles due dates in Asia/Kolkata. Receipt/email/WhatsApp delivery needs real provider credentials; tests use mocks only.

## WhatsApp

In Settings → Notifications configure the Meta adapter, messages endpoint, permanent access token, phone-number ID, app secret and webhook verification token. Set `https://YOUR_HOST/api/webhooks/whatsapp/INSTITUTION_ID` in Meta. The endpoint validates the raw body's `X-Hub-Signature-256`, verifies the target business phone and deduplicates message IDs. GET performs the Meta verification challenge.

A signed inbound phone must match exactly one existing guardian contact in that institution. `FEES` returns that guardian's children; an admission number additionally must belong to the same guardian. Unknown, ambiguous or non-phone senders receive no student financial data. Replies include a short-lived parent link and a dynamic UPI QR link when there are unpaid fees. Configure the institution's real UPI payee ID; unconfigured QR requests fail clearly. An ordinary UPI transfer remains pending reconciliation and never auto-settles from a QR scan.

Incoming replies use Meta's 24-hour customer-service window. Automated messages outside it require an approved template configured in provider settings, with the documented body parameter shape. Generic WhatsApp adapters remain supported. Queues provide at-least-once delivery; external adapters should honor the stable notification idempotency key. Monitor failed messages and provider acceptance/delivery separately.

## Trust reporting and rollover

Platform → Organizations & Trusts creates a group, assigns campuses and grants a report administrator using their existing verified ChatGPT email. `/organization/<id>` is a separate read-only aggregate view. It checks organization membership at the backend. Membership never grants institution API access. The API supports adding/revoking group report administrators or moving institutions with an approval reason. Reports paginate campuses while totals cover all authorized campuses; collections/refunds respect the date range, outstanding is cumulative through the end date.

Academic → Year rollover: create a later target academic year and destination sections first. Map every active source section, preview, and approve using a current fingerprint. Pending gateway/cheque transactions and refunds, inactive-student dues and conflicting target enrollments must be resolved first. Starting closes and permanently freezes the source ledger for ordinary writes. Only the explicitly linked rollover transfers can post through the freeze.

Each batch processes up to five students. Enrollment, checkpoint, source receivable transfer and opening-dues invoice post atomically per student. Refresh/resume is safe. Use Process next batch until Completed. Old invoices and transactions are never deleted. Historical snapshots remain; current old-year outstanding becomes zero for transferred dues, and the target year holds the receivable. Transfers use OPENING_BALANCE_CLEARING, so this does not recognize tuition revenue twice. Completed source years cannot be reopened by editing their status. This is an approved accounting close, not an operation to run against the Test School casually.

## RFID edge contract

Register a reader and store its returned secret securely on the device; it is displayed once. Assign an RFID UID to a student and explicitly configure a Transport/Hostel daily rate against that student's installment. UID hashes are stored. A device can be disabled immediately.

```http
POST /api/hardware/rfid-punch
Content-Type: application/json
X-Device-ID: <device UUID>
X-Timestamp: <Unix seconds>
X-Nonce: <random 16–80 character token>
X-Signature: <hex HMAC-SHA256(secret, timestamp + "." + nonce + "." + exactRawBody)>
```

```json
{
  "eventId": "reader-001-00001234",
  "uid": "A1B2C3D4",
  "punchedAt": "2026-10-03T08:30:00+05:30",
  "direction": "IN"
}
```

Sign exactly the transmitted JSON bytes. The request timestamp must be within five minutes; punch time within 24 hours. Keep the event ID stable when retrying; changed content under the same event ID is rejected. Reuse exact event bytes for a retry, with a fresh request timestamp/nonce if needed. A nonce cannot authenticate a different event. IN/OUT attendance is recorded; the first IN for a student/service/IST day posts the configured charge exactly once. Repeated events cannot duplicate the charge. Amounts from devices are not accepted.

**Accounting behavior:** these are daily service charges (debit student receivable, credit fee income), not direct bank debits or prepaid wallet deductions. No wallet balance or bank mandate is invented. Physical reader enrollment, firmware clock synchronization and live device testing remain deployment tasks.

## Tally and bank statements

Settings → Accounting maps internal accounts and fee components to exact existing Tally ledger names, including Student Fees Receivable, Cash, Bank Receipts, concession expense, fee/late income and academic-year transfer clearing. Reports → Tally XML exports balanced vouchers for a selected academic year and date range (maximum 1,000 per file; narrow the dates for more). Invoice credits are split into fee components; daily charges map to service income. XML text is escaped, amounts are exact decimal strings, vouchers include stable IDs and debit/credit signs follow Tally's accounting voucher format. Create the matching company/ledger masters in Tally before importing. Test import and duplicate handling in a copy of your actual company before production use; live Tally software was not available for these tests.

Reconciliation → Import bank statement accepts INR OFX or mapped CSV with date, reference, amount, direction, narration and optional admission/invoice number. Preflight parses locally, shows row errors and duplicate references, and caps batches at 100 rows / 2 MB. Debit transactions are excluded from fee receipts. Foreign-currency OFX is rejected.

Server preview repeats validation, checks academic-year dates and prohibits future transactions. Exact transaction reference + amount + compatible date matches existing payments. A unique admission/invoice with sufficient outstanding can propose a new Bank Transfer collection. Amount-only matching never posts money. Accountant approval and a reason are required; each row is its own atomic financial transaction. The response reports per-row outcomes; it intentionally can partially commit a valid batch, with explicit failed rows. Re-uploaded references cannot create duplicate payments. Unmatched and ambiguous deposits remain reviewable through the existing reconciliation workflow.

## Validation

```bash
pnpm typecheck
pnpm build
pnpm test:unit
pnpm test:integration
pnpm test:saas
pnpm test:refactor
pnpm test:advanced
```

The advanced Worker suite applies all migrations in disposable D1, uses R2 and a real local Queue consumer, and mocks Razorpay/Meta/SMS HTTP endpoints. It checks token tampering/revocation/expiry, related-child boundaries, capture/webhook idempotency and balanced postings, async receipt PDFs, tax evidence, organization isolation, RFID signatures/replays, safe bank matching, Tally XML, DLT reminders, WhatsApp privacy, academic freeze/resume and unchanged Test School data. Tests do not send actual messages, make real charges, create live organizations or roll over real school years.

API documentation is available at `/api/openapi`. Test local source with the existing managed preview/identity setup; the trusted identity headers used by isolated tests must never be accepted from an untrusted public reverse proxy.
