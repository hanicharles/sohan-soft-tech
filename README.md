# Sohan Soft Tech

This release updates the existing fee application into a tenant-scoped SaaS. It preserves the existing Sites project, React/TypeScript interface, modular Worker API, D1 database, R2 storage, financial views, triggers, and historical records. It does not create a separate application or replace the deployment with Spring Boot/PostgreSQL.

## Access and routes

The application uses local username/password authentication. The default test account is **`test` / `tst@123`**. Historical account and financial IDs are retained, and uninvited visitors cannot claim platform or institution access.

- `/admin`: independent platform dashboard.
- `/admin/institutions`, `/admin/institutions/new`, `/admin/institutions/:id`: institution onboarding, lifecycle, first administrator, branding, subscription, usage and domains.
- `/admin/plans`, `/admin/subscriptions`, `/admin/payments`: editable plan configuration, per-institution subscriptions and immutable confirmed payment register.
- `/admin/domains`, `/admin/usage`, `/admin/audit`, `/admin/settings`: platform administration.
- `/campus/:slug`: institution-specific login and fee dashboard.
- `/campus/:slug/students`, `/academic`, `/fees`, `/invoices`, `/payments`, `/receipts`, `/outstanding`, `/reports`, `/users`, `/settings`: existing tenant fee modules within the portal. Refunds, reconciliation, cash, notifications and audit are also retained.

All institution API calls can use `/api/campus/:slug/<existing-endpoint>`. The server resolves the slug to the tenant and rejects a conflicting tenant header. Legacy fee endpoints require an explicit `X-Institution-ID` and apply the same authorization. `/api/session` returns platform access and staff memberships; `/api/platform/*` requires a separate platform-admin grant. `/api/portal/:slug` exposes only public branding. `/api/openapi` documents the APIs.

The new advanced phase adds expiring signed guardian access at `/portal/:token`, without parent passwords or accounts. Staff issue and revoke links from a student profile. Trust reports are at `/organization/:id`; platform organization management is at `/admin/organizations`. Legacy parent-account routes remain retired. See [advanced workflows](docs/advanced-phase.md) for setup, new APIs, migration, provider contracts and limitations.

## Institution onboarding and staff

Creating an institution atomically provisions its record, readable unique slug, main campus, subscription and first administrator's email access grant. Optional academic setup reuses the existing default school/PU classes, streams, sections and fee components. PNG/JPEG logos are stored in R2 and validated server-side (1 MB maximum).

Staff access is accepted when the user signs in with an authorized local account and opens the portal. Share the generated portal URL with the administrator.

Roles are Institution Admin, Accountant, Fee Collector, Fee Counter Cashier, Auditor, Teacher, Receptionist and Custom User. Granular permissions cover students, academics, fees, invoices, payments, receipts, reports, users, settings and refunds. Teachers are section-scoped and have no financial access by default. Custom roles receive only assigned permissions. Disabled users lose access on the next API request. Reset Access resets the institution grant, not the user's ChatGPT password. Self-access changes and disabling the last active administrator are prevented. Delegated user managers cannot grant permissions above their own authority.

## Tenant and support isolation

Queries scope financial/student records by institution and academic year. Existing DB triggers reject cross-tenant/cross-year references, duplicate payments, overpayment and immutable record changes. No front-end tenant filter grants access. Platform administration alone does not grant access to institution fee data.

**Access as Institution Admin** requires a reason and creates a one-hour server-side support session with a hashed token and Secure/HttpOnly/SameSite cookie. It is bound to both platform user and institution. A visible banner identifies support access. Start/end are logged in platform audit, start and subsequent mutations in the institution audit. Ending or expiry invalidates access immediately. Support users do not consume institution seats.

## Schema upgrade and preserved records

`drizzle/0005_slippery_goliath.sql` appends schema changes; previous applied migrations are untouched. New tables are `platform_admins`, `saas_plans`, `institution_subscriptions`, `institution_domains`, `support_sessions`, `platform_audit_logs` and `subscription_payments`. Institution metadata, staff display/mobile/permissions and nullable audit support-session linkage extend existing tables. New database quota, uniqueness, financial scope and immutability guards are included.

Bounded, idempotent **data** upgrades are separate from schema migrations. They map existing Super Admin accounts into platform access, disable legacy parent/student/platform tenant memberships, add subscriptions and readable Test School/academy slugs, and preserve original student, invoice, payment, receipt and ledger IDs/amounts. `/api/jobs/saas-upgrade` is a service-authorized migration operation. Its explicit `createValidationInstitution` option provisions the requested additional validation school through the same backend operations as the UI.

CampusLedger Test School retains its two students, concession, scholarship, two invoices and demonstration partial payment: ₹80,000 expected, ₹8,000 collected and ₹72,000 outstanding. Chaitanya Shree Academy retains its existing records. Green Valley Test School is the additional validation tenant; its demonstration payment represents no real funds.

## Plans, subscriptions and domains

Plans store exact integer-paise prices, billing cycle, active status, student/user limits and enabled modules. Seeded plans begin at ₹0 for administrator configuration. Plan edits do not silently alter existing subscriptions; an institution's plan snapshot, limits, modules, dates and status can be edited separately.

Active students and active staff plus distinct pending access grants consume capacity. SQL triggers enforce limits even for concurrent writes and atomic imports. Limits cannot be reduced below usage. Expired/past-due/cancelled subscriptions block new activity and retain readable records; institution suspension/archival blocks staff access without deleting data. Verified gateway settlement remains available so an already initiated payment is not lost.

Default portals use supported path routing on the current Site origin: `/campus/:slug`. Custom hostname settings provide ownership TXT and CNAME requirements. Verification checks public DNS through Cloudflare DoH and marks Verified only when both match. It does **not** activate hosting or SSL. This deployment still requires hostname attachment, tenant-aware routing, HTTPS certificates, and local authentication configuration before a custom domain can serve its portal. The UI displays these requirements and pending statuses honestly.

Subscription payments are idempotent, immutable records of confirmed payments. Automated SaaS billing/card charging is not implemented. Recording a payment does not automatically renew a subscription.

## Preserved fee workflows

Student/guardian management, academic years/classes/sections/promotions, fee components and structures, installment assignment, concession/scholarship adjustments, bulk preview/commit, invoices, partial and multiple payments, receipts/PDF printing, immutable ledgers, authorized offline refunds, outstanding/defaulters, reports, CSV/XLSX/PDF exports, reconciliation, cash closing, notifications and encrypted provider settings remain operational.

All authoritative money is integer INR paise. Decimal strings parse server-side; calculations use exact integer/BigInt arithmetic. Payment, allocation, receipt, ledger and audit posting commit atomically. Idempotency keys bind to request hashes; provider transaction/event IDs are unique. Signed server-side gateway verification remains authoritative.

## Existing operations and limitations

The existing daily automation and `/api/jobs/scheduled` service-authorized endpoint remain in place. They process bounded due/late-fee/reminder batches and provider queues. Never store secrets in source; configure `JOB_SECRET`, `PROVIDER_ENCRYPTION_KEY`, `PLATFORM_OWNER_EMAIL`, `PLATFORM_ORIGIN` and gateway settings in runtime configuration. Service callers additionally use the fresh Sites dispatch service credential when required. Rotate the runtime job secret when that service credential rotates.

Razorpay signed captured-payment webhooks and Razorpay/Cashfree server verification are retained. Real credentials and provider sandbox/live checkout validation are required before real collections. Cashfree webhook processing and online gateway refunds remain deployment limitations. SMS/WhatsApp/email delivery uses configured provider adapters; no credentials means messages remain Queued, and provider delivery callbacks are not implemented.

Imports remain bounded to 100 rows, bulk fee generation to 50 students, and exports to existing safe limits. High-volume asynchronous exports, distributed retries, full Hindi/Kannada translation/Unicode PDF fonts, backup/restore drills, accessibility, penetration and production-scale load tests need operational completion before enterprise rollout.

## Verification

```
pnpm typecheck
pnpm test:unit
pnpm build
pnpm test:integration
pnpm test:saas
```

The integration suite applies every migration to isolated D1/R2 and tests the existing financial workflows, signed provider fixtures, replay protection, refunds, exact balances, concurrency, imports, academic isolation and preservation of Test School records. The SaaS suite adds independent institution onboarding/login, scoped URLs, staff permissions, disabled/reset access, cross-tenant ID attacks, support expiry, plan/module limits, bulk rollback, subscription payment immutability, legacy parent-account route removal and preservation checks. Tests do not perform real bank/provider transactions or sign in as another real person.

To test the UI, sign in as the owner at `/admin`, open Test School details and start support access with a reason. Use Create Institution to enter a real administrator's ChatGPT email, share its portal URL, and have that administrator create staff, students and fees. Collect a partial payment, download its receipt, and inspect reports. Open the second institution and confirm its students and balances are independent. End support access before returning to platform administration.

## Architecture and workflow refactor (2.1)

- `server/api.ts` is an authentication/tenant middleware chain; feature routes live under `server/routes/`. Existing endpoint URLs remain compatible, with mandatory `Idempotency-Key` UUID headers on financial POSTs (payments, refunds, fees, invoices and cash). Frontend requests supply them. Retries return the original response; altered payloads fail. Unknown failures retain an incomplete claim for review instead of risking a second charge. Signed gateway webhooks use their provider event IDs rather than this browser header.
- `getDb()` is a request-scoped Drizzle facade. It requires the verified tenant context, wraps caller predicates, injects tenant IDs on inserts, scopes reads/updates/deletes, caps reads at 100 and refuses caller tenant overrides. It never exposes unscoped builders. Existing prepared D1 reporting and service queries retain explicit tenant checks and database relationship triggers; global platform operations are separately authorized.
- Generated migration `0006_shiny_sentinel.sql` adds `journal_events`, `api_idempotency`, `notification_outbox`, cash denomination snapshots, and the requested indexes. Roll numbers live on year-specific enrollments, so their `(institution_id, roll_number)` index belongs there. The fee index covers fee structures; the payment index uses descending creation time.
- Every new immutable student-ledger event creates one immutable account transfer in the same transaction. `journal_postings` exposes the two debit/credit legs. Events cover invoices, payments, concessions, late fees, adjustments and linked refund reversals. Database triggers reject tampering and invalid account mappings. Existing financial history is retained, never overwritten. Run service-authorized `POST /api/jobs/saas-upgrade` until `journal.hasMore` is false to backfill historical events in batches of 100. Repeating it is safe and does not send notifications.
- A payment writes its notification outbox row atomically, then Cloudflare `waitUntil` expands/delivers bounded batches after the response. The existing scheduled job recovers unfinished work. Providers get a stable notification ID for idempotency. Failed messages retry with bounded attempts; stale processing leases recover. Receipt notifications are off until enabled in Settings with a configured provider. This uses a durable database outbox/background task, not a provisioned Cloudflare Queue binding.
- Unpaid invoice PDFs embed an exact-amount UPI QR once Settings → Institution has a valid payee ID. Scanning never marks an invoice paid; staff or a verified provider must confirm receipt of funds. Receipt registers and the student profile offer 80mm PDF printing via `/api/documents/receipt/:id?format=thermal`.
- Automatic sibling benefits and scheduled late-fee accrual use the shared decimal-safe rule engine. Overlapping component concessions cannot exceed the component or invoice amount. Existing opt-in late-fee settings, grace periods, caps, audit history and daily deduplication remain.
- Institution screens and student document/history/guardian sections load lazily. Registers use TanStack row virtualization and server pages of 100, avoiding full-database downloads. Fees retain structure inspection/assignment actions in a paginated table. Recharts adds selectable aging buckets (0–30, 31–60, 61–90 and 91+) and prior academic-year delta badges. No prior year produces an explicit missing baseline, not invented growth.
- The mobile payment dialog uses Vaul with scrollable content and safe-area controls. Desktop retains the existing dialog. Student and fee-structure forms use Zod validation and 7-day device drafts scoped to the verified account, tenant, academic year and form; successful submission removes the draft. Discard is available, and financial records are still committed only by the server.
- Fee Counter Cashier can collect, print and close cash but cannot change payments/configuration or approve refunds. Auditor is restricted to read-only reports/exports. These role ceilings cannot be widened by arbitrary permission grants. Super Admin remains an independent platform role.
- Daily Closure reviews the register, collects whole note/coin counts and flags shortages/surpluses. A variance requires a reason. Both the API and an atomic database trigger reject stale totals; closure records and denomination snapshots are immutable.
- CSV/XLSX imports parse locally, expose column mapping and row errors, and flag in-file duplicate admission numbers before server validation. Existing database validation, 100-row limits and all-or-nothing commits remain.

Validation: `pnpm test:refactor` adds fee-rule, UPI, cash-count, CSV, role-ceiling, async-context, scoped Drizzle and built-Worker architecture tests. The original financial and SaaS/navigation suites remain. The local delayed-provider test returned the payment response in 14 ms before notification delivery; this is not a production latency guarantee. Production p95 under 50 ms requires measurement against deployed database/network conditions. Live gateway/provider credentials, browser/device testing and scale testing remain operational requirements.

## Advanced workflows (3.0)

See [docs/advanced-phase.md](docs/advanced-phase.md) for signed parent checkout, approved tax documents, DLT/WhatsApp/Queue delivery, trust reports, immutable academic rollover, RFID attendance charges, Tally vouchers and OFX/CSV bank reconciliation. Migration 0007 extends the existing schema; all monetary mutations retain authoritative server calculations and immutable journal evidence. `pnpm test:advanced` runs the new unit and isolated Worker/Queue integration checks. The current managed deployment uses the existing scheduler and durable background fallback until native Queue/Cron provisioning is available.
