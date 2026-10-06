# Sohan Soft Tech — exact updated source code

Published version: **11**. Source commit: `c8b54c7888c8307dccf22838c85b1858fb8ed440`.

This guide provides complete source blocks at the exact repository-relative paths used by the existing application. Apply it to the current Sohan Soft Tech checkout, not a new project. The downloadable source ZIP is the authoritative complete project.

Current workspace root: `/workspace/scratch/e91062231e51/campus-ledger`. Each path below is relative to that root.

`server/gateway.ts` is included as the preserved gateway implementation reused by the new portal; its payment verification remains authoritative. Existing financial history and staff authentication are preserved.

## Operational notes and setup

### Implementation and deployment guide

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


## Verified results

TypeScript strict compilation and production build passed. Existing checks: 9 money tests, 66 financial checks, 69 SaaS/navigation checks, 8 architecture unit tests, scoped Drizzle isolation checks and 17 Worker architecture checks. New checks: 5 unit tests and 32 Worker/Queue integration checks. External providers were mocked; real merchant/SMS/WhatsApp credentials and physical hardware still need configuration. Native Queue/Cron provisioning remains unavailable on the current managed host; the existing scheduler and durable background fallback run there.

## File index


### Phase 1 — Parent portal, hosted checkout and certificates

- `app/portal/[token]/page.tsx`

- `features/parent/ParentPortal.tsx`

- `server/parent-portal.ts`

- `server/routes/parent.ts`

- `server/gateway.ts`

- `server/payments.ts`

- `server/receipt-download.ts`

- `server/certificates.ts`

- `features/students/ParentAccess.tsx`

- `features/students/TaxEvidence.tsx`


### Phase 2 — Scheduled and queued communications

- `build/sites-worker.ts`

- `cloudflare-env.d.ts`

- `server/communications.ts`

- `server/notifications.ts`

- `server/routes/webhooks.ts`

- `server/providers.ts`

- `features/auth/CommunicationSettings.tsx`

- `features/auth/Settings.tsx`

- `infrastructure/communications.wrangler.example.jsonc`


### Phase 3 — Trust hierarchy, academic rollover and audit

- `server/tenant-context.ts`

- `server/organizations.ts`

- `features/platform/Organizations.tsx`

- `app/organization/[id]/page.tsx`

- `features/organization/Dashboard.tsx`

- `server/rollover.ts`

- `server/routes/operations.ts`

- `features/students/RolloverWizard.tsx`

- `features/auth/AuditLogs.tsx`


### Phase 4 — RFID, Tally and reconciliation

- `server/hardware.ts`

- `features/auth/HardwareSettings.tsx`

- `server/routes/reports.ts`

- `server/tally.ts`

- `lib/tally.ts`

- `features/auth/AccountingSettings.tsx`

- `features/reports/TallyExport.tsx`

- `features/reports/Reconciliation.tsx`

- `features/reports/BankImportDialog.tsx`

- `lib/bank-statements.ts`

- `server/bank-reconciliation.ts`


### Schema and migration

- `db/schema.ts`

- `drizzle/0007_salty_ikaris.sql`

- `drizzle/meta/_journal.json`


### Integration, API documentation, configuration and tests

- `.env.example`

- `components/campus/App.tsx`

- `components/campus/Entry.tsx`

- `components/campus/ui.tsx`

- `features/platform/App.tsx`

- `features/reports/Reports.tsx`

- `features/students/Academic.tsx`

- `features/students/StudentProfile.tsx`

- `lib/api-client.ts`

- `package.json`

- `server/advanced-openapi.ts`

- `server/api.ts`

- `server/idempotency.ts`

- `server/openapi.ts`

- `server/platform.ts`

- `server/routes/extensions.ts`

- `server/routes/public.ts`

- `server/routes/resources.ts`

- `server/routes/shared.ts`

- `server/security.ts`

- `server/seed.ts`

- `tests/advanced-unit.mjs`

- `tests/advanced.mjs`

- `tests/integration.mjs`

- `tests/refactor.mjs`

- `tests/saas.mjs`


## Phase 1 — Parent portal, hosted checkout and certificates


### `app/portal/[token]/page.tsx`

```tsx
import ParentPortal from "@/features/parent/ParentPortal";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Parent fees | Sohan Soft Tech",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export default async function Page({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <ParentPortal token={token} />;
}
```


### `features/parent/ParentPortal.tsx`

```tsx
"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { money } from "@/lib/money";
import { Download, GraduationCap, LockKeyhole, RefreshCw } from "lucide-react";

interface CheckoutResult {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}
interface CheckoutOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  order_id: string;
  handler: (value: CheckoutResult) => void;
  modal: { ondismiss: () => void };
}
declare global {
  interface Window {
    Razorpay?: new (options: CheckoutOptions) => { open(): void };
  }
}
interface Summary {
  items: {
    id: string;
    invoice_id: string;
    name: string;
    amount_paise: number;
  }[];
  institution: { name: string; slug: string; primaryColor: string };
  children: { id: string; name: string; admission_number: string }[];
  years: { id: string; name: string; status: string }[];
  studentId: string;
  yearId: string;
  balance: {
    total_paise: number;
    paid_paise: number;
    outstanding_paise: number;
    overdue_paise: number;
    next_due_date: string;
  } | null;
  installments: {
    id: string;
    title: string;
    due_date: string;
    outstanding_paise: number;
    status: string;
  }[];
  invoices: {
    id: string;
    number: string;
    gross_paise: number;
    discount_paise: number;
    scholarship_paise: number;
    adjustment_paise: number;
    total_paise: number;
    outstanding_paise: number;
  }[];
  receipts: {
    id: string;
    number: string;
    paid_at: string;
    amount_paise: number;
    method: string;
  }[];
  receiptCount: number;
  page: number;
  donations: {
    id: string;
    financial_year: number;
    donation_reference: string;
  }[];
}
async function loadCheckout() {
  if (window.Razorpay) return;
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.referrerPolicy = "no-referrer";
    script.onload = () => resolve();
    script.onerror = () =>
      reject(new Error("Payment checkout could not load. Please try again."));
    document.head.appendChild(script);
  });
}
export default function ParentPortal({ token }: { token: string }) {
  const base = "/api/parent-access/" + encodeURIComponent(token);
  const [data, setData] = useState<Summary | null>(null),
    [student, setStudent] = useState(""),
    [year, setYear] = useState(""),
    [page, setPage] = useState(1),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [amount, setAmount] = useState(""),
    [financialYear, setFinancialYear] = useState(
      new Date().getMonth() < 3
        ? new Date().getFullYear() - 1
        : new Date().getFullYear(),
    );
  const intent = useRef<{ signature: string; key: string } | null>(null);
  const request = useCallback(
    async <T,>(path: string, body?: object, key?: string): Promise<T> => {
      const response = await fetch(base + path, {
        method: body ? "POST" : "GET",
        cache: "no-store",
        referrerPolicy: "no-referrer",
        headers: body
          ? {
              "Content-Type": "application/json",
              "Idempotency-Key": key || crypto.randomUUID(),
            }
          : {},
        body: body ? JSON.stringify(body) : undefined,
      });
      const json = (await response.json()) as { message?: string; data: T };
      if (!response.ok)
        throw new Error(json.message || "The service is unavailable.");
      return json.data as T;
    },
    [base],
  );
  const reload = useCallback(async () => {
    try {
      const result = await request<Summary>(
        "?" + new URLSearchParams({ student, year, page: String(page) }),
      );
      setData(result);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, [request, student, year, page]);
  useEffect(() => {
    void reload();
  }, [reload]);
  async function download(path: string) {
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch(base + path, {
        referrerPolicy: "no-referrer",
        cache: "no-store",
      });
      if (response.status === 202) {
        setNotice(
          "Your receipt is being prepared. Download it again in a few seconds.",
        );
        return;
      }
      if (!response.ok) {
        const json = (await response.json()) as { message: string };
        throw new Error(json.message);
      }
      const url = URL.createObjectURL(await response.blob()),
        a = document.createElement("a");
      a.href = url;
      a.download =
        response.headers
          .get("content-disposition")
          ?.match(/filename="([^"]+)"/)?.[1] || "certificate.pdf";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function pay() {
    if (!data) return;
    setBusy(true);
    setNotice("");
    try {
      await loadCheckout();
      const signature = JSON.stringify({
        studentId: data.studentId,
        yearId: data.yearId,
        amount,
      });
      if (intent.current?.signature !== signature)
        intent.current = { signature, key: crypto.randomUUID() };
      const order = await request<{
        id: string;
        paymentId: string;
        keyId: string;
        amount: number;
      }>("/checkout", JSON.parse(signature), intent.current!.key);
      const Razorpay = window.Razorpay;
      if (!Razorpay) throw new Error("Checkout unavailable.");
      new Razorpay({
        key: order.keyId,
        amount: order.amount,
        currency: "INR",
        name: data.institution.name,
        order_id: order.id,
        modal: {
          ondismiss: () => {
            setBusy(false);
            setNotice(
              "Checkout closed. Refresh to check payment status before paying again.",
            );
          },
        },
        handler: async (value) => {
          try {
            await request("/verify", { ...value, paymentId: order.paymentId });
            setNotice("Payment verified. Your receipt is being prepared.");
            intent.current = null;
            await reload();
          } catch (e) {
            setNotice(
              (e as Error).message + " Refresh to check the confirmed status.",
            );
          } finally {
            setBusy(false);
          }
        },
      }).open();
    } catch (e) {
      setNotice((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex items-center gap-4">
          <div
            className="rounded-2xl p-3 text-white"
            style={{
              backgroundColor: data?.institution.primaryColor || "#3157d5",
            }}
          >
            <GraduationCap size={30} />
          </div>
          <div>
            <p className="text-sm text-slate-500">
              SOHAN SOFT TECH · PARENT SELF SERVICE
            </p>
            <h1 className="text-2xl font-semibold">
              {data?.institution.name || "Your institution’s fee portal"}
            </h1>
          </div>
        </header>
        {error ? (
          <div role="alert" className="rounded-xl border bg-white p-6">
            {error}
            <Button className="ml-4" variant="outline" onClick={reload}>
              Retry
            </Button>
          </div>
        ) : !data ? (
          <p role="status">Loading your fee details…</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-4 rounded-xl border bg-white p-5">
              <label className="flex-1 text-sm">
                Child
                <select
                  className="mt-2 block w-full rounded-lg border p-3"
                  value={data.studentId || ""}
                  onChange={(e) => {
                    setStudent(e.target.value);
                    setYear("");
                    setPage(1);
                    setAmount("");
                  }}
                >
                  {data.children.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} · {s.admission_number}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex-1 text-sm">
                Academic year
                <select
                  className="mt-2 block w-full rounded-lg border p-3"
                  value={data.yearId || ""}
                  onChange={(e) => {
                    setYear(e.target.value);
                    setPage(1);
                    setAmount("");
                  }}
                >
                  {data.years.map((y) => (
                    <option key={y.id} value={y.id}>
                      {y.name}
                    </option>
                  ))}
                </select>
              </label>
              <Button variant="outline" onClick={reload} className="self-end">
                <RefreshCw size={16} />
                Refresh
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              {[
                ["Total fees", data.balance?.total_paise],
                ["Paid", data.balance?.paid_paise],
                ["Outstanding", data.balance?.outstanding_paise],
                ["Overdue", data.balance?.overdue_paise],
              ].map(([label, value]) => (
                <div
                  key={String(label)}
                  className="rounded-xl border bg-white p-5"
                >
                  <p className="text-sm text-slate-500">{label}</p>
                  <p className="mt-2 text-xl font-semibold">
                    {money(Number(value || 0))}
                  </p>
                </div>
              ))}
            </div>
            {notice && (
              <p
                role="status"
                className="rounded-lg bg-blue-50 p-4 text-blue-900"
              >
                {notice}
              </p>
            )}
            <section className="rounded-xl border bg-white p-6">
              <h2 className="mb-4 text-lg font-semibold">Pay school fees</h2>
              <div className="flex flex-wrap items-end gap-4">
                <label className="text-sm">
                  Amount (₹)
                  <Input
                    inputMode="decimal"
                    placeholder="Enter full or partial amount"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="mt-2 w-64"
                  />
                </label>
                <Button
                  disabled={busy || !amount || !data.balance?.outstanding_paise}
                  onClick={pay}
                >
                  Pay securely
                </Button>
                <a
                  className="text-sm text-blue-700 underline"
                  target="_blank"
                  rel="noreferrer"
                  href={
                    base +
                    "/upi?" +
                    new URLSearchParams({
                      student: data.studentId || "",
                      year: data.yearId || "",
                    })
                  }
                >
                  View UPI QR
                </a>
              </div>
              <p className="mt-3 text-sm text-slate-500">
                Payments appear after confirmation from the bank or payment
                provider. UPI transfers outside checkout require accounts-office
                reconciliation.
              </p>
            </section>
            <section className="rounded-xl border bg-white p-6">
              <h2 className="mb-4 text-lg font-semibold">Fee breakdown</h2>
              {data.invoices.map((i) => (
                <details key={i.id} className="border-b py-3">
                  <summary className="cursor-pointer">
                    {i.number} · Total {money(i.total_paise)} · Balance{" "}
                    {money(i.outstanding_paise)}
                  </summary>
                  <div className="mt-3 space-y-2">
                    {data.items
                      .filter((item) => item.invoice_id === i.id)
                      .map((item) => (
                        <div key={item.id} className="flex justify-between">
                          <span>{item.name}</span>
                          <span>{money(item.amount_paise)}</span>
                        </div>
                      ))}
                    {[
                      ["Discounts", -i.discount_paise],
                      ["Scholarships", -i.scholarship_paise],
                      ["Adjustments / late fees", i.adjustment_paise],
                    ]
                      .filter(([, value]) => value !== 0)
                      .map(([label, value]) => (
                        <div
                          key={String(label)}
                          className="flex justify-between text-slate-600"
                        >
                          <span>{label}</span>
                          <span>{money(Number(value))}</span>
                        </div>
                      ))}
                  </div>
                </details>
              ))}
            </section>
            <section className="rounded-xl border bg-white p-6">
              <h2 className="mb-4 text-lg font-semibold">Fee schedule</h2>
              {data.installments.length ? (
                data.installments.map((i) => (
                  <div
                    key={i.id}
                    className="flex justify-between gap-4 border-b py-3 last:border-0"
                  >
                    <div>
                      <p>{i.title}</p>
                      <p className="text-sm text-slate-500">
                        Due {i.due_date} · {i.status}
                      </p>
                    </div>
                    <strong>{money(i.outstanding_paise)}</strong>
                  </div>
                ))
              ) : (
                <p>No fee demands for this academic year.</p>
              )}
            </section>
            <section className="rounded-xl border bg-white p-6">
              <h2 className="mb-4 text-lg font-semibold">
                Historical receipts
              </h2>
              {data.receipts.map((r) => (
                <div
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-3 border-b py-3"
                >
                  <div>
                    <p>{r.number}</p>
                    <p className="text-sm text-slate-500">
                      {r.paid_at.slice(0, 10)} · {r.method} ·{" "}
                      {money(r.amount_paise)}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => download("/receipts/" + r.id)}
                  >
                    <Download size={16} />
                    Download
                  </Button>
                </div>
              ))}
              {!data.receipts.length && (
                <p>No receipts in this academic year.</p>
              )}
              <div className="mt-4 flex items-center justify-end gap-3">
                <Button
                  variant="outline"
                  disabled={page === 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Previous
                </Button>
                <span className="text-sm">Page {page}</span>
                <Button
                  variant="outline"
                  disabled={page * 20 >= data.receiptCount}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </section>
            <section className="rounded-xl border bg-white p-6">
              <h2 className="mb-4 text-lg font-semibold">
                Annual certificates
              </h2>
              <div className="flex flex-wrap items-end gap-3">
                <label className="text-sm">
                  Financial year starting April
                  <Input
                    type="number"
                    min={2000}
                    max={2100}
                    value={financialYear}
                    onChange={(e) => setFinancialYear(Number(e.target.value))}
                    className="mt-2"
                  />
                </label>
                <Button
                  variant="outline"
                  disabled={busy || !data.studentId}
                  onClick={() =>
                    download(
                      "/certificates/tuition?" +
                        new URLSearchParams({
                          student: data.studentId,
                          financialYear: String(financialYear),
                        }),
                    )
                  }
                >
                  Download tuition certificate
                </Button>
              </div>
              <p className="mt-3 text-sm text-slate-500">
                Accounts must approve tuition allocations. Donation Form 10BE
                documents appear separately after the institution supplies the
                official certificate.
              </p>
              {data.donations.map((d) => (
                <Button
                  key={d.id}
                  variant="outline"
                  className="mt-3"
                  onClick={() => download("/certificates/80g/" + d.id)}
                >
                  Form 10BE · {d.financial_year} · {d.donation_reference}
                </Button>
              ))}
            </section>
          </>
        )}
        <footer className="flex items-center gap-2 text-sm text-slate-500">
          <LockKeyhole size={16} />
          This private link gives access to your family’s fee records. Keep it
          private.
        </footer>
      </div>
    </main>
  );
}
```


### `server/parent-portal.ts`

```typescript
import { env } from "cloudflare:workers";
import { z } from "zod";
import { all, batch, insert, now, one, stamps, uuid } from "./db";
import {
  Actor,
  ApiError,
  audit,
  constantEqual,
  hmac,
  own,
  permit,
  sha256,
} from "./security";

export interface ParentGrant {
  id: string;
  institution_id: string;
  parent_id: string;
  expires_at: string;
  token_hash: string;
  revoked_at: string | null;
}
async function signingKey() {
  const key = env.PARENT_PORTAL_SECRET || env.PROVIDER_ENCRYPTION_KEY;
  if (!key || key.length < 32)
    throw new ApiError(
      503,
      "PORTAL_NOT_CONFIGURED",
      "Parent links are not configured. Contact the accounts office.",
    );
  return hmac(key, "sohan-parent-portal:v1");
}
export async function issueParentGrant(
  actor: Actor,
  parentId: string,
  days = 7,
  purpose = "Parent self service",
) {
  permit(actor, "students.manage");
  await own(actor, "parents", parentId);
  z.number().int().min(1).max(30).parse(days);
  const id = uuid(),
    expiry = Math.floor(Date.now() / 1000) + days * 86400;
  const nonce = Array.from(crypto.getRandomValues(new Uint8Array(24)), (n) =>
    n.toString(16).padStart(2, "0"),
  ).join("");
  const payload = `v1.${id}.${expiry}.${nonce}`;
  const token = payload + "." + (await hmac(await signingKey(), payload));
  const expiresAt = new Date(expiry * 1000).toISOString();
  await batch([
    insert("parent_portal_grants", {
      id,
      institution_id: actor.institutionId,
      parent_id: parentId,
      token_hash: await sha256(token),
      expires_at: expiresAt,
      purpose,
      ...stamps(actor.userId),
    }),
    audit(
      actor,
      "Issued signed parent access",
      "parent_portal_grants",
      id,
      null,
      { parentId, expiresAt, purpose },
    ),
  ]);
  return {
    id,
    token,
    expiresAt,
    url:
      (env.PLATFORM_ORIGIN || new URL(actor.request.url).origin).replace(
        /\/$/,
        "",
      ) +
      "/portal/" +
      token,
  };
}
export async function parentActor(
  request: Request,
  token: string,
): Promise<Actor & { parentId: string; portalGrantId: string }> {
  if (!/^v1\.[a-f0-9-]{36}\.\d{10}\.[a-f0-9]{48}\.[a-f0-9]{64}$/.test(token))
    throw invalidLink();
  const parts = token.split("."),
    payload = parts.slice(0, 4).join(".");
  if (
    Number(parts[2]) <= Date.now() / 1000 ||
    !constantEqual(await hmac(await signingKey(), payload), parts[4])
  )
    throw invalidLink();
  const grant = await one<ParentGrant>(
    "SELECT g.* FROM parent_portal_grants g JOIN institutions i ON i.id=g.institution_id AND i.status='Active' JOIN parents p ON p.id=g.parent_id AND p.institution_id=g.institution_id WHERE g.id=? AND g.revoked_at IS NULL AND g.expires_at>?",
    [parts[1], now()],
  );
  if (!grant || !constantEqual(grant.token_hash, await sha256(token)))
    throw invalidLink();
  return {
    userId: "parent-link:" + grant.id,
    email: "",
    name: "Parent self service",
    institutionId: grant.institution_id,
    parentId: grant.parent_id,
    portalGrantId: grant.id,
    role: "CUSTOM",
    feeVisibility: true,
    permissions: [
      "students.view",
      "fees.view",
      "receipts.view",
      "payments.collect",
    ],
    request,
  };
}
function invalidLink() {
  return new ApiError(
    401,
    "INVALID_PARENT_LINK",
    "This private link is invalid, expired or revoked. Ask the institution for a new link.",
  );
}
export async function parentOverview(actor: Actor, params: URLSearchParams) {
  const children = await all<{
    id: string;
    name: string;
    admission_number: string;
  }>(
    "SELECT s.id,s.name,s.admission_number FROM students s JOIN student_parents sp ON sp.student_id=s.id AND sp.institution_id=s.institution_id WHERE sp.institution_id=? AND sp.parent_id=? ORDER BY s.name LIMIT 20",
    [actor.institutionId, actor.parentId],
  );
  const studentId = params.get("student") || children[0]?.id;
  if (studentId && !children.some((s) => s.id === studentId))
    throw new ApiError(404, "NOT_FOUND", "Student not found.");
  const institution = await one<{
    name: string;
    slug: string;
    settings: string;
  }>("SELECT name,slug,settings FROM institutions WHERE id=?", [
    actor.institutionId,
  ]);
  const years = studentId
    ? await all<{ id: string; name: string; status: string }>(
        "SELECT y.id,y.name,y.status FROM academic_years y JOIN enrollments e ON e.academic_year_id=y.id AND e.institution_id=y.institution_id WHERE e.institution_id=? AND e.student_id=? ORDER BY y.start_date DESC LIMIT 30",
        [actor.institutionId, studentId],
      )
    : [];
  const yearId = params.get("year") || years[0]?.id;
  if (yearId && !years.some((y) => y.id === yearId))
    throw new ApiError(404, "NOT_FOUND", "Academic year not found.");
  const page = Math.max(1, Math.min(10000, Number(params.get("page")) || 1));
  const scope = [actor.institutionId, studentId || "", yearId || ""];
  const [
    balance,
    invoices,
    installments,
    receipts,
    receiptCount,
    donations,
    items,
  ] = await Promise.all([
    one(
      "SELECT total_paise,paid_paise,outstanding_paise,overdue_paise,next_due_date FROM student_balances WHERE institution_id=? AND student_id=? AND academic_year_id=?",
      scope,
    ),
    all(
      "SELECT id,number,gross_paise,discount_paise,scholarship_paise,net_paise,total_paise,total_paise-net_paise adjustment_paise,paid_paise,outstanding_paise,due_date,status FROM invoice_balances WHERE institution_id=? AND student_id=? AND academic_year_id=? ORDER BY issued_date DESC LIMIT 100",
      scope,
    ),
    all(
      "SELECT id,title,due_date,total_paise,paid_paise,outstanding_paise,status FROM installment_balances WHERE institution_id=? AND student_id=? AND academic_year_id=? ORDER BY due_date LIMIT 100",
      scope,
    ),
    all(
      "SELECT r.id,r.number,p.amount_paise,p.paid_at,p.method,p.status FROM receipts r JOIN payments p ON p.id=r.payment_id AND p.institution_id=r.institution_id WHERE p.institution_id=? AND p.student_id=? AND p.academic_year_id=? ORDER BY p.paid_at DESC LIMIT 20 OFFSET ?",
      [...scope, (page - 1) * 20],
    ),
    one<{ count: number }>(
      "SELECT COUNT(*) count FROM receipts r JOIN payments p ON p.id=r.payment_id AND p.institution_id=r.institution_id WHERE p.institution_id=? AND p.student_id=? AND p.academic_year_id=?",
      scope,
    ),
    all(
      "SELECT id,financial_year,donation_reference,amount_paise FROM donation_certificates WHERE institution_id=? AND parent_id=? ORDER BY financial_year DESC LIMIT 50",
      [actor.institutionId, actor.parentId],
    ),
    all(
      "SELECT ii.id,ii.invoice_id,ii.name,ii.amount_paise FROM invoice_items ii JOIN invoices i ON i.id=ii.invoice_id AND i.institution_id=ii.institution_id WHERE i.institution_id=? AND i.student_id=? AND i.academic_year_id=? ORDER BY i.issued_date DESC,ii.name LIMIT 500",
      scope,
    ),
  ]);
  const settings = JSON.parse(institution?.settings || "{}");
  return {
    institution: {
      name: institution?.name,
      slug: institution?.slug,
      primaryColor: /^#[a-fA-F0-9]{6}$/.test(
        settings.branding?.primaryColor || "",
      )
        ? settings.branding.primaryColor
        : "#3157d5",
    },
    children,
    years,
    studentId,
    yearId,
    balance,
    invoices,
    installments,
    receipts,
    receiptCount: receiptCount?.count || 0,
    page,
    donations,
    items,
  };
}
```


### `server/routes/parent.ts`

```typescript
import QRCode from "qrcode";
import { z } from "zod";
import { parseMoney } from "../../lib/money";
import { upiPaymentUri } from "../../lib/upi";
import { annualTuitionCertificate, donationCertificate } from "../certificates";
import { receiptDownload } from "../receipt-download";
import { one } from "../db";
import { initiatePayment, verifyPayment } from "../gateway";
import { idempotent } from "../idempotency";
import { parentActor, parentOverview } from "../parent-portal";
import { accessStudent, ApiError, csrf, own, rateLimit } from "../security";
import { enforceSubscription } from "../tenancy";
import { withTenantContext } from "../tenant-context";
import { ok, readBody } from "./shared";

export async function parentRoute(
  request: Request,
  path: string[],
  requestId: string,
) {
  if (path[0] !== "parent-access") return null;
  const actor = await parentActor(request, path[1] || "");
  await rateLimit(request, "parent:" + actor.portalGrantId, 90);
  const method = request.method,
    p = new URL(request.url).searchParams;
  csrf(request);
  return withTenantContext(actor, async () => {
    if (method === "GET" && path.length === 2)
      return ok(await parentOverview(actor, p), requestId);
    if (method === "GET" && path[2] === "receipts")
      return receiptDownload(actor, path[3]);
    if (method === "GET" && path[2] === "certificates") {
      if (path[3] === "tuition")
        return annualTuitionCertificate(
          actor,
          p.get("student") || "",
          Number(p.get("financialYear")),
        );
      if (path[3] === "80g") return donationCertificate(actor, path[4]);
    }
    if (method === "GET" && path[2] === "upi") {
      const studentId = p.get("student") || "",
        yearId = p.get("year") || "";
      await accessStudent(actor, studentId, yearId);
      const balance = await one<{ outstanding_paise: number }>(
        "SELECT outstanding_paise FROM student_balances WHERE institution_id=? AND student_id=? AND academic_year_id=?",
        [actor.institutionId, studentId, yearId],
      );
      const institution = await one<{ name: string; settings: string }>(
        "SELECT name,settings FROM institutions WHERE id=?",
        [actor.institutionId],
      );
      const settings = JSON.parse(institution?.settings || "{}");
      if (!balance?.outstanding_paise || !settings.upi?.payeeId)
        throw new ApiError(
          409,
          "UPI_UNAVAILABLE",
          "No unpaid demand or institution UPI address is available.",
        );
      const uri = upiPaymentUri(
        settings.upi.payeeId,
        settings.upi.payeeName || institution!.name,
        balance.outstanding_paise,
        "School fees",
      );
      return new Response(
        await QRCode.toString(uri, { type: "svg", width: 360, margin: 3 }),
        {
          headers: {
            "Content-Type": "image/svg+xml",
            "Cache-Control": "private,no-store",
            "Content-Security-Policy":
              "default-src 'none'; style-src 'unsafe-inline'; sandbox",
          },
        },
      );
    }
    if (method === "POST" && path[2] === "checkout") {
      await enforceSubscription(actor, "POST", "payments");
      const body = await readBody(request);
      return idempotent(
        actor,
        "parent-checkout:" + actor.parentId,
        body,
        async () => {
          const d = z
            .object({
              studentId: z.string().min(1),
              yearId: z.string().min(1),
              amount: z.string(),
            })
            .parse(body);
          await accessStudent(actor, d.studentId, d.yearId);
          return ok(
            await initiatePayment(actor, {
              ...d,
              gateway: "Razorpay",
              amountPaise: parseMoney(d.amount),
              idempotencyKey: body.idempotencyKey,
            }),
            requestId,
          );
        },
      );
    }
    if (method === "POST" && path[2] === "verify") {
      const body = await readBody(request);
      return idempotent(
        actor,
        "parent-verify:" + actor.parentId,
        body,
        async () =>
          ok(
            await verifyPayment(
              actor,
              z
                .object({
                  paymentId: z.string(),
                  razorpay_order_id: z.string(),
                  razorpay_payment_id: z.string(),
                  razorpay_signature: z.string().regex(/^[0-9a-f]{64}$/),
                })
                .parse(body),
            ),
            requestId,
          ),
      );
    }
    throw new ApiError(404, "NOT_FOUND", "Parent service not found.");
  });
}
```


### `server/gateway.ts`

```typescript
import { env } from "cloudflare:workers";
import { parseMoney } from "../lib/money";
import { batch, insert, now, one, Row, run, stamps, stmt, uuid } from "./db";
import { validateIdempotencyKey } from "./idempotency";
import { confirmPayment, planPayment } from "./payments";
import { readProvider } from "./providers";
import {
  accessStudent,
  Actor,
  ApiError,
  audit,
  constantEqual,
  hmac,
  own,
  permit,
  sha256,
} from "./security";
interface Order {
  id: string;
  amount: number;
  keyId?: string;
  sessionId?: string;
  mode?: string;
}
interface Gateway {
  create(actor: Actor, payment: Row): Promise<Order>;
  verify(actor: Actor, payment: Row, data: Row): Promise<string>;
}
async function config(institutionId: string, provider: string) {
  const saved = await readProvider(institutionId, provider);
  if (saved) return saved;
  if (provider === "Razorpay" && env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET)
    return {
      keyId: env.RAZORPAY_KEY_ID,
      keySecret: env.RAZORPAY_KEY_SECRET,
      webhookSecret: env.RAZORPAY_WEBHOOK_SECRET || "",
    };
  if (provider === "Cashfree" && env.CASHFREE_APP_ID && env.CASHFREE_SECRET_KEY)
    return {
      keyId: env.CASHFREE_APP_ID,
      keySecret: env.CASHFREE_SECRET_KEY,
      mode: env.CASHFREE_ENV || "sandbox",
    };
  throw new ApiError(
    503,
    "GATEWAY_NOT_CONFIGURED",
    "Your institution has not connected a payment gateway. Please contact the accounts office.",
  );
}
async function gatewayFetch(
  url: string,
  headers: Record<string, string>,
  body?: unknown,
) {
  const response = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json", ...headers },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok)
    throw new ApiError(
      502,
      "GATEWAY_UNAVAILABLE",
      "The payment provider could not process this request. Try again later.",
    );
  return response.json() as Promise<Row>;
}
const razorpay: Gateway = {
  async create(actor, payment) {
    const c = await config(actor.institutionId, "Razorpay"),
      order = await gatewayFetch(
        "https://api.razorpay.com/v1/orders",
        { Authorization: "Basic " + btoa(c.keyId + ":" + c.keySecret) },
        {
          amount: payment.amount_paise,
          currency: "INR",
          receipt: payment.id,
          notes: {
            payment_id: payment.id,
            institution_id: actor.institutionId,
          },
        },
      );
    return { id: order.id, amount: payment.amount_paise, keyId: c.keyId };
  },
  async verify(actor, payment, data) {
    const c = await config(actor.institutionId, "Razorpay");
    if (
      data.razorpay_order_id !== payment.gateway_order_id ||
      !constantEqual(
        await hmac(
          c.keySecret,
          payment.gateway_order_id + "|" + data.razorpay_payment_id,
        ),
        data.razorpay_signature || "",
      )
    )
      throw new ApiError(
        400,
        "INVALID_SIGNATURE",
        "Payment verification failed.",
      );
    const p = await gatewayFetch(
      "https://api.razorpay.com/v1/payments/" +
        encodeURIComponent(data.razorpay_payment_id),
      { Authorization: "Basic " + btoa(c.keyId + ":" + c.keySecret) },
    );
    if (
      p.status !== "captured" ||
      p.amount !== payment.amount_paise ||
      p.currency !== "INR" ||
      p.order_id !== payment.gateway_order_id
    )
      throw new ApiError(
        409,
        "PAYMENT_NOT_CAPTURED",
        "Payment is awaiting confirmation from the provider.",
      );
    return p.id;
  },
};
const cashfree: Gateway = {
  async create(actor, payment) {
    const c = await config(actor.institutionId, "Cashfree"),
      parent = await one(
        "SELECT par.mobile,par.email FROM student_parents sp JOIN parents par ON par.id=sp.parent_id WHERE sp.institution_id=? AND sp.student_id=? LIMIT 1",
        [actor.institutionId, payment.student_id],
      );
    if (!parent?.mobile)
      throw new ApiError(
        422,
        "MOBILE_REQUIRED",
        "A parent mobile number is required for online payment.",
      );
    const mode = c.mode === "production" ? "production" : "sandbox",
      order = await gatewayFetch(
        mode === "production"
          ? "https://api.cashfree.com/pg/orders"
          : "https://sandbox.cashfree.com/pg/orders",
        {
          "x-client-id": c.keyId,
          "x-client-secret": c.keySecret,
          "x-api-version": "2025-01-01",
          "x-idempotency-key": payment.id,
        },
        {
          order_id: payment.id,
          order_amount: payment.amount_paise / 100,
          order_currency: "INR",
          customer_details: {
            customer_id: payment.student_id,
            customer_phone: parent.mobile,
            customer_email: parent.email || actor.email,
          },
        },
      );
    return {
      id: order.order_id,
      amount: payment.amount_paise,
      sessionId: order.payment_session_id,
      mode,
    };
  },
  async verify(actor, payment) {
    const c = await config(actor.institutionId, "Cashfree"),
      url =
        (c.mode === "production"
          ? "https://api.cashfree.com"
          : "https://sandbox.cashfree.com") +
        "/pg/orders/" +
        encodeURIComponent(payment.gateway_order_id) +
        "/payments",
      list = await gatewayFetch(url, {
        "x-client-id": c.keyId,
        "x-client-secret": c.keySecret,
        "x-api-version": "2025-01-01",
      });
    const result = (list as unknown as Row[]).find(
      (r) =>
        r.payment_status === "SUCCESS" &&
        parseMoney(String(r.payment_amount)) === payment.amount_paise &&
        r.payment_currency === "INR",
    );
    if (!result)
      throw new ApiError(
        409,
        "PAYMENT_NOT_CAPTURED",
        "Payment is awaiting provider confirmation.",
      );
    return String(result.cf_payment_id);
  },
};
const gateways: Record<string, Gateway> = {
  Razorpay: razorpay,
  Cashfree: cashfree,
};
export async function initiatePayment(actor: Actor, data: Row) {
  permit(actor, "payments.collect");
  validateIdempotencyKey(data.idempotencyKey);
  const allocations = await planPayment(
      actor,
      data.studentId,
      data.yearId,
      data.amountPaise,
    ),
    hash = await sha256(
      JSON.stringify({
        studentId: data.studentId,
        yearId: data.yearId,
        amountPaise: data.amountPaise,
        gateway: data.gateway,
      }),
    ),
    existing = await one(
      "SELECT * FROM payments WHERE institution_id=? AND idempotency_key=?",
      [actor.institutionId, data.idempotencyKey],
    );
  if (existing) {
    if (existing.request_hash !== hash)
      throw new ApiError(
        409,
        "IDEMPOTENCY_CONFLICT",
        "Payment request key has already been used.",
      );
    throw new ApiError(
      409,
      "PAYMENT_ALREADY_INITIATED",
      "This payment has already been initiated. Check payment history before trying again.",
    );
  }
  const gateway = gateways[data.gateway];
  if (!gateway)
    throw new ApiError(
      422,
      "INVALID_GATEWAY",
      "Choose a configured payment gateway.",
    );
  const payment = {
    id: uuid(),
    institution_id: actor.institutionId,
    ...stamps(actor.userId),
    student_id: data.studentId,
    academic_year_id: data.yearId,
    amount_paise: data.amountPaise,
    method: "Payment Gateway",
    gateway: data.gateway,
    status: "Initiated",
    idempotency_key: data.idempotencyKey,
    request_hash: hash,
    paid_at: now(),
  };
  // Persist the intent before contacting a provider; failure remains visible.
  await batch([
    insert("payments", payment),
    insert("payment_intents", {
      id: uuid(),
      institution_id: actor.institutionId,
      ...stamps(actor.userId),
      payment_id: payment.id,
      allocations: JSON.stringify(allocations),
    }),
  ]);
  try {
    const order = await gateway.create(actor, payment);
    await batch([
      stmt("UPDATE payments SET gateway_order_id=?,updated_at=? WHERE id=?", [
        order.id,
        now(),
        payment.id,
      ]),
      audit(actor, "Initiated online payment", "payments", payment.id, null, {
        gateway: data.gateway,
        amountPaise: payment.amount_paise,
        orderId: order.id,
      }),
    ]);
    return { paymentId: payment.id, gateway: data.gateway, ...order };
  } catch (error) {
    await run("UPDATE payments SET status='Failed',updated_at=? WHERE id=?", [
      now(),
      payment.id,
    ]);
    throw error;
  }
}
export async function verifyPayment(actor: Actor, data: Row) {
  const payment = await own(actor, "payments", data.paymentId);
  await accessStudent(actor, payment.student_id, payment.academic_year_id);
  const gateway = gateways[payment.gateway];
  if (!gateway)
    throw new ApiError(
      400,
      "INVALID_GATEWAY",
      "Payment provider is unavailable.",
    );
  const transactionId = await gateway.verify(actor, payment, data);
  return confirmPayment(actor, payment.id, transactionId, transactionId);
}
export async function webhook(request: Request) {
  const raw = await request.text();
  if (raw.length > 128000)
    throw new ApiError(
      413,
      "PAYLOAD_TOO_LARGE",
      "Webhook payload exceeds the limit.",
    );
  let event: Row;
  try {
    event = JSON.parse(raw);
  } catch {
    throw new ApiError(400, "INVALID_JSON", "Invalid webhook payload.");
  }
  const entity = event.payload?.payment?.entity,
    orderId = entity?.order_id;
  if (!orderId)
    throw new ApiError(
      400,
      "INVALID_WEBHOOK",
      "Expected a Razorpay payment event.",
    );
  const payment = await one(
    "SELECT * FROM payments WHERE gateway='Razorpay' AND gateway_order_id=?",
    [orderId],
  );
  if (!payment)
    throw new ApiError(
      404,
      "PAYMENT_NOT_FOUND",
      "No payment intent matches this order.",
    );
  const c = await config(payment.institution_id, "Razorpay");
  if (
    !c.webhookSecret ||
    !constantEqual(
      await hmac(c.webhookSecret, raw),
      request.headers.get("x-razorpay-signature") || "",
    )
  )
    throw new ApiError(
      400,
      "INVALID_SIGNATURE",
      "Webhook signature verification failed.",
    );
  const eventId =
      request.headers.get("x-razorpay-event-id") || (await sha256(raw)),
    hash = await sha256(raw),
    seen = await one(
      "SELECT * FROM gateway_events WHERE gateway='Razorpay' AND event_id=?",
      [eventId],
    );
  if (seen) {
    if (seen.payload_hash !== hash)
      throw new ApiError(
        409,
        "EVENT_CONFLICT",
        "Webhook event hash does not match.",
      );
    return { received: true, duplicate: true };
  }
  if (event.event !== "payment.captured")
    return { received: true, ignored: true };
  if (
    entity.status !== "captured" ||
    entity.currency !== "INR" ||
    entity.amount !== payment.amount_paise
  )
    throw new ApiError(
      422,
      "PAYMENT_MISMATCH",
      "Payment amount, currency or capture status does not match.",
    );
  const actor: Actor = {
    userId: "gateway:Razorpay",
    name: "Razorpay webhook",
    email: "",
    institutionId: payment.institution_id,
    role: "INSTITUTION_ADMIN",
    feeVisibility: true,
    request,
  };
  const eventStatement = insert("gateway_events", {
    id: uuid(),
    institution_id: actor.institutionId,
    ...stamps(actor.userId),
    gateway: "Razorpay",
    event_id: eventId,
    payload_hash: hash,
    status: "Processed",
  });
  try {
    const result = await confirmPayment(
      actor,
      payment.id,
      entity.id,
      entity.id,
      [eventStatement],
    );
    if (result.duplicate) await batch([eventStatement]);
    return { received: true, paymentId: payment.id };
  } catch (error) {
    if (
      await one(
        "SELECT id FROM gateway_events WHERE gateway='Razorpay' AND event_id=?",
        [eventId],
      )
    )
      return { received: true, duplicate: true };
    throw error;
  }
}
```


### `server/payments.ts`

```typescript
import { safeMoney } from "../lib/money";
import {
  all,
  batch,
  insert,
  now,
  one,
  Row,
  stamps,
  stmt,
  today,
  uuid,
} from "./db";
import { validateIdempotencyKey } from "./idempotency";
import { scheduleNotifications } from "./notifications";
import {
  accessStudent,
  Actor,
  ApiError,
  audit,
  own,
  permit,
  sha256,
} from "./security";
export type Allocation = { installmentId: string; amountPaise: number };
const successes = ["Successful", "Partially Refunded", "Refunded"];
export async function planPayment(
  actor: Actor,
  studentId: string,
  yearId: string,
  amount: number,
  requested?: Allocation[],
) {
  await accessStudent(actor, studentId, yearId);
  const year = await own(actor, "academic_years", yearId);
  if (["Closed", "Archived"].includes(year.status))
    throw new ApiError(
      409,
      "YEAR_CLOSED",
      "Payments cannot be added to a closed academic year.",
    );
  if (amount <= 0)
    throw new ApiError(
      422,
      "INVALID_AMOUNT",
      "Enter a positive payment amount.",
    );
  safeMoney(amount);
  const installments = await all(
    "SELECT * FROM installment_balances WHERE institution_id=? AND student_id=? AND academic_year_id=? AND outstanding_paise>0 ORDER BY due_date,sort_order",
    [actor.institutionId, studentId, yearId],
  );
  const map = new Map(installments.map((i) => [i.id, i]));
  let remaining = amount;
  const allocations: Row[] = [];
  if (requested?.length) {
    if (
      new Set(requested.map((r) => r.installmentId)).size !== requested.length
    )
      throw new ApiError(
        422,
        "DUPLICATE_ALLOCATION",
        "An installment can only appear once.",
      );
    for (const a of requested) {
      const inst = map.get(a.installmentId);
      if (!inst || a.amountPaise <= 0 || a.amountPaise > inst.outstanding_paise)
        throw new ApiError(
          422,
          "INVALID_ALLOCATION",
          "The selected installment amount exceeds its unpaid balance.",
        );
      safeMoney(a.amountPaise);
      allocations.push({ ...a, invoiceId: inst.invoice_id });
      remaining -= a.amountPaise;
    }
  } else {
    for (const i of installments) {
      if (remaining <= 0) break;
      const value = Math.min(remaining, i.outstanding_paise);
      allocations.push({
        installmentId: i.id,
        invoiceId: i.invoice_id,
        amountPaise: value,
      });
      remaining -= value;
    }
  }
  if (remaining !== 0)
    throw new ApiError(
      422,
      "OVERPAYMENT",
      "Payment must match the selected installments and cannot exceed the outstanding amount.",
    );
  return allocations;
}
export async function collectPayment(
  actor: Actor,
  data: {
    studentId: string;
    yearId: string;
    amountPaise: number;
    method: string;
    reference?: string;
    notes?: string;
    idempotencyKey: string;
    allocations?: Allocation[];
    paidAt?: string;
  },
  extraStatements?: (paymentId: string) => D1PreparedStatement[],
) {
  permit(actor, "collect");
  validateIdempotencyKey(data.idempotencyKey);
  if (data.paidAt) {
    permit(actor, "payments.manage");
    if (
      data.method !== "Bank Transfer" ||
      !Number.isFinite(Date.parse(data.paidAt))
    )
      throw new ApiError(
        422,
        "INVALID_PAYMENT_DATE",
        "Backdated entries require a verified bank statement.",
      );
    const year = await own(actor, "academic_years", data.yearId),
      date = new Date(Date.parse(data.paidAt) + 19800000)
        .toISOString()
        .slice(0, 10);
    if (date < year.start_date || date > year.end_date)
      throw new ApiError(
        422,
        "BANK_YEAR_MISMATCH",
        "Transaction date is outside the academic year.",
      );
  }
  const hash = await sha256(
    JSON.stringify({ ...data, idempotencyKey: undefined }),
  );
  const existing = await one(
    "SELECT * FROM payments WHERE institution_id=? AND idempotency_key=?",
    [actor.institutionId, data.idempotencyKey],
  );
  if (existing) {
    if (existing.request_hash !== hash)
      throw new ApiError(
        409,
        "IDEMPOTENCY_CONFLICT",
        "This payment key was used for a different request.",
      );
    return {
      payment: existing,
      receipt: await one("SELECT * FROM receipts WHERE payment_id=?", [
        existing.id,
      ]),
      duplicate: true,
    };
  }
  if (
    !["Cash", "UPI", "Bank Transfer", "Cheque", "Card", "Net Banking"].includes(
      data.method,
    )
  )
    throw new ApiError(
      422,
      "INVALID_METHOD",
      "Select a supported payment method.",
    );
  if (data.method !== "Cash" && !data.reference?.trim())
    throw new ApiError(
      422,
      "REFERENCE_REQUIRED",
      "Enter the transaction or cheque reference.",
    );
  const allocations = await planPayment(
      actor,
      data.studentId,
      data.yearId,
      data.amountPaise,
      data.allocations,
    ),
    id = uuid(),
    base = { institution_id: actor.institutionId, ...stamps(actor.userId) },
    pending = data.method === "Cheque";
  const payment = {
    id,
    ...base,
    student_id: data.studentId,
    academic_year_id: data.yearId,
    amount_paise: data.amountPaise,
    method: data.method,
    status: pending ? "Pending" : "Successful",
    reference: data.reference || null,
    idempotency_key: data.idempotencyKey,
    request_hash: hash,
    paid_at: data.paidAt || now(),
    notes: data.notes || "",
  };
  const statements = [
    insert("payments", payment),
    insert("payment_intents", {
      id: uuid(),
      ...base,
      payment_id: id,
      allocations: JSON.stringify(allocations),
    }),
  ];
  let receiptId: string | undefined;
  if (!pending) {
    const recorded = recordStatements(actor, payment, allocations);
    statements.push(...recorded.statements);
    receiptId = recorded.receiptId;
  }
  statements.push(
    audit(
      actor,
      pending ? "Recorded cheque awaiting clearance" : "Collected payment",
      "payments",
      id,
      null,
      payment,
    ),
  );
  if (data.paidAt)
    statements.push(
      audit(
        actor,
        "Supervisor approved backdated bank entry",
        "payments",
        id,
        null,
        { paidAt: data.paidAt, reference: data.reference, reason: data.notes },
      ),
    );
  if (extraStatements) statements.push(...extraStatements(id));
  try {
    await batch(statements);
  } catch (error) {
    const retry = await one(
      "SELECT * FROM payments WHERE institution_id=? AND idempotency_key=?",
      [actor.institutionId, data.idempotencyKey],
    );
    if (retry && retry.request_hash === hash)
      return {
        payment: retry,
        receipt: await one("SELECT * FROM receipts WHERE payment_id=?", [
          retry.id,
        ]),
        duplicate: true,
      };
    throw error;
  }
  if (receiptId) scheduleNotifications(actor);
  return {
    payment,
    receipt: receiptId
      ? await one("SELECT * FROM receipts WHERE id=?", [receiptId])
      : null,
  };
}
export function recordStatements(
  actor: Actor,
  payment: Row,
  allocations: Row[],
) {
  const base = { institution_id: actor.institutionId, ...stamps(actor.userId) },
    receiptId = uuid(),
    statements: D1PreparedStatement[] = [];
  for (const a of allocations)
    statements.push(
      insert("payment_allocations", {
        id: uuid(),
        institution_id: actor.institutionId,
        payment_id: payment.id,
        invoice_id: a.invoiceId,
        installment_id: a.installmentId,
        amount_paise: a.amountPaise,
      }),
    );
  statements.push(
    insert("ledger_entries", {
      id: uuid(),
      ...base,
      student_id: payment.student_id,
      academic_year_id: payment.academic_year_id,
      payment_id: payment.id,
      kind: "Payment",
      description: `${payment.method} payment${payment.reference ? ` · ${payment.reference}` : ""}`,
      debit_paise: 0,
      credit_paise: payment.amount_paise,
      entry_date: new Date(Date.parse(payment.paid_at) + 19800000)
        .toISOString()
        .slice(0, 10),
    }),
  );
  statements.push(
    insert("receipts", {
      id: receiptId,
      ...base,
      payment_id: payment.id,
      academic_year_id: payment.academic_year_id,
    }),
  );
  statements.push(
    insert("document_jobs", {
      id: "pdf:" + receiptId,
      institution_id: actor.institutionId,
      receipt_id: receiptId,
      state: "Queued",
      attempts: 0,
      created_at: now(),
      updated_at: now(),
    }),
  );
  statements.push(
    insert("notification_outbox", {
      id: uuid(),
      institution_id: actor.institutionId,
      payment_id: payment.id,
      state: "Queued",
      attempts: 0,
      available_at: now(),
      created_at: now(),
      updated_at: now(),
    }),
  );
  return { receiptId, statements };
}
export async function confirmPayment(
  actor: Actor,
  paymentId: string,
  reference?: string,
  gatewayTransactionId?: string,
  extra: D1PreparedStatement[] = [],
) {
  const payment = await own(actor, "payments", paymentId);
  if (successes.includes(payment.status))
    return {
      payment,
      receipt: await one("SELECT * FROM receipts WHERE payment_id=?", [
        paymentId,
      ]),
      duplicate: true,
    };
  if (["Cancelled", "Failed"].includes(payment.status))
    throw new ApiError(
      409,
      "PAYMENT_CLOSED",
      "This payment cannot be confirmed.",
    );
  const intent = await one(
    "SELECT allocations FROM payment_intents WHERE institution_id=? AND payment_id=?",
    [actor.institutionId, paymentId],
  );
  if (!intent)
    throw new ApiError(
      409,
      "INTENT_MISSING",
      "Payment allocation details are unavailable.",
    );
  const allocations = JSON.parse(intent.allocations),
    updated = {
      ...payment,
      status: "Successful",
      reference: reference || payment.reference,
      paid_at: now(),
    };
  const recorded = recordStatements(actor, updated, allocations);
  await batch([
    stmt(
      "UPDATE payments SET status='Successful',reference=?,gateway_transaction_id=COALESCE(?,gateway_transaction_id),paid_at=?,updated_at=?,updated_by=? WHERE institution_id=? AND id=? AND status IN ('Initiated','Processing','Pending')",
      [
        updated.reference,
        gatewayTransactionId || null,
        updated.paid_at,
        now(),
        actor.userId,
        actor.institutionId,
        paymentId,
      ],
    ),
    ...recorded.statements,
    ...extra,
    audit(
      actor,
      "Confirmed payment",
      "payments",
      paymentId,
      { status: payment.status },
      { status: "Successful", gatewayTransactionId },
    ),
  ]);
  scheduleNotifications(actor);
  return {
    payment: updated,
    receipt: await one("SELECT * FROM receipts WHERE id=?", [
      recorded.receiptId,
    ]),
  };
}
export async function requestRefund(actor: Actor, data: Row) {
  permit(actor, "refund");
  validateIdempotencyKey(data.idempotencyKey);
  const existing = await one(
    "SELECT * FROM refunds WHERE institution_id=? AND idempotency_key=?",
    [actor.institutionId, data.idempotencyKey],
  );
  if (existing) {
    if (
      existing.payment_id !== data.paymentId ||
      existing.amount_paise !== data.amountPaise ||
      existing.reason !== data.reason ||
      existing.method !== data.method
    )
      throw new ApiError(
        409,
        "IDEMPOTENCY_CONFLICT",
        "This refund key was used for a different request.",
      );
    return { ...existing, duplicate: true };
  }
  const payment = await own(actor, "payments", data.paymentId);
  if (!successes.includes(payment.status))
    throw new ApiError(
      422,
      "PAYMENT_NOT_SETTLED",
      "Only successful payments can be refunded.",
    );
  if (payment.gateway)
    throw new ApiError(
      409,
      "GATEWAY_REFUND_REQUIRED",
      "Initiate this refund in the payment provider dashboard, then reconcile the confirmed refund.",
    );
  const sum = await one(
    "SELECT COALESCE(SUM(amount_paise),0) amount FROM refunds WHERE payment_id=? AND status IN ('Requested','Approved','Processed')",
    [payment.id],
  );
  if (
    data.amountPaise <= 0 ||
    data.amountPaise > payment.amount_paise - sum!.amount
  )
    throw new ApiError(
      422,
      "REFUND_TOO_LARGE",
      "Refund exceeds the remaining refundable amount.",
    );
  const id = uuid(),
    record = {
      id,
      institution_id: actor.institutionId,
      student_id: payment.student_id,
      academic_year_id: payment.academic_year_id,
      payment_id: payment.id,
      amount_paise: data.amountPaise,
      method: data.method || payment.method,
      reason: data.reason,
      status: "Requested",
      idempotency_key: data.idempotencyKey,
      ...stamps(actor.userId),
    };
  await batch([
    insert("refunds", record),
    audit(actor, "Requested refund", "refunds", id, null, record),
  ]);
  return record;
}
export async function approveRefund(
  actor: Actor,
  id: string,
  reference: string,
) {
  permit(actor, "refunds.approve");
  const refund = await own(actor, "refunds", id);
  if (refund.status === "Processed") return { ...refund, duplicate: true };
  if (refund.status !== "Requested")
    throw new ApiError(409, "REFUND_CLOSED", "Refund is already reviewed.");
  if (!reference.trim())
    throw new ApiError(
      422,
      "REFERENCE_REQUIRED",
      "Enter a refund reference to confirm that the money was returned.",
    );
  const allocations = await all(
    `SELECT a.*,a.amount_paise-COALESCE((SELECT SUM(ra.amount_paise) FROM refund_allocations ra JOIN refunds r ON r.id=ra.refund_id WHERE ra.allocation_id=a.id AND r.status='Processed'),0) remaining FROM payment_allocations a WHERE a.institution_id=? AND a.payment_id=? ORDER BY a.id DESC`,
    [actor.institutionId, refund.payment_id],
  );
  let remaining = refund.amount_paise;
  const statements = [
    stmt(
      "UPDATE refunds SET status='Processed',approved_by=?,refunded_at=?,reference=?,updated_at=?,updated_by=? WHERE institution_id=? AND id=? AND status='Requested'",
      [
        actor.userId,
        now(),
        reference,
        now(),
        actor.userId,
        actor.institutionId,
        id,
      ],
    ),
  ];
  for (const a of allocations) {
    if (remaining <= 0) break;
    const value = Math.min(remaining, a.remaining);
    if (value <= 0) continue;
    statements.push(
      insert("refund_allocations", {
        id: uuid(),
        institution_id: actor.institutionId,
        refund_id: id,
        allocation_id: a.id,
        installment_id: a.installment_id,
        amount_paise: value,
      }),
    );
    remaining -= value;
  }
  if (remaining > 0)
    throw new ApiError(
      409,
      "REFUND_ALLOCATION_ERROR",
      "The refundable allocation is no longer available.",
    );
  statements.push(
    insert("ledger_entries", {
      id: uuid(),
      institution_id: actor.institutionId,
      ...stamps(actor.userId),
      student_id: refund.student_id,
      academic_year_id: refund.academic_year_id,
      refund_id: id,
      payment_id: refund.payment_id,
      kind: "Refund",
      description: refund.reason,
      debit_paise: refund.amount_paise,
      credit_paise: 0,
      entry_date: today(),
    }),
    audit(actor, "Authorized and recorded refund", "refunds", id, refund, {
      status: "Processed",
      reference,
    }),
  );
  await batch(statements);
  return { id, status: "Processed" };
}
```


### `server/receipt-download.ts`

```typescript
import { env } from "cloudflare:workers";
import { queueReceipt } from "./communications";
import { one } from "./db";
import { Actor, ApiError, accessStudent, own } from "./security";

// Both staff and guardian downloads read generated artifacts. Financial request
// handlers never generate receipt PDFs, including the thermal-print variant.
export async function receiptDownload(actor: Actor, id: string, format = "a4") {
  if (!["a4", "thermal"].includes(format))
    throw new ApiError(422, "INVALID_FORMAT", "Choose A4 or thermal format.");
  const receipt = await own(actor, "receipts", id);
  const payment = await own(actor, "payments", receipt.payment_id);
  await accessStudent(actor, payment.student_id, payment.academic_year_id);
  const artifact = await one<{ object_key: string }>(
    "SELECT object_key FROM document_artifacts WHERE institution_id=? AND receipt_id=?",
    [actor.institutionId, id],
  );
  const key = artifact
    ? format === "thermal"
      ? artifact.object_key.replace(/\.pdf$/, "-80mm.pdf")
      : artifact.object_key
    : null;
  const object = key ? await env.BUCKET?.get(key) : null;
  if (object)
    return new Response(object.body, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="Receipt-${String(receipt.number).replace(/[^a-zA-Z0-9_-]/g, "-")}${format === "thermal" ? "-80mm" : ""}.pdf"`,
        "Cache-Control": "private,no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  const job = await one<{ state: string }>(
    "SELECT state FROM document_jobs WHERE institution_id=? AND receipt_id=?",
    [actor.institutionId, id],
  );
  if (job?.state === "Failed" || artifact)
    throw new ApiError(
      503,
      "RECEIPT_PREPARATION_FAILED",
      "Please contact the accounts office to regenerate this receipt.",
    );
  await queueReceipt(actor, id);
  return Response.json(
    {
      success: true,
      data: {
        queued: true,
        message:
          "Your receipt is being prepared. Try the download again shortly.",
      },
    },
    {
      status: 202,
      headers: { "Retry-After": "2", "Cache-Control": "private,no-store" },
    },
  );
}
```


### `server/certificates.ts`

```typescript
import { env } from "cloudflare:workers";
import { PDFDocument } from "pdf-lib";
import { z } from "zod";
import { money, parseMoney } from "../lib/money";
import { all, batch, insert, one, stamps, uuid } from "./db";
import { attachment, renderPdf } from "./reports";
import {
  accessStudent,
  Actor,
  ApiError,
  audit,
  own,
  permit,
  sha256,
} from "./security";

export async function approveTuitionAllocation(actor: Actor, input: unknown) {
  permit(actor, "settings.manage");
  const d = z
    .object({
      paymentId: z.string().min(1),
      amount: z.string(),
      reason: z.string().trim().min(10).max(500),
    })
    .parse(input);
  const p = await own(actor, "payments", d.paymentId),
    amount = parseMoney(d.amount);
  if (
    !["Successful", "Partially Refunded"].includes(p.status) ||
    amount <= 0 ||
    amount > p.amount_paise
  )
    throw new ApiError(
      422,
      "INVALID_TUITION",
      "Approved tuition must be positive and within the settled payment. Verify the fee component evidence before approving.",
    );
  const id = uuid();
  await batch([
    insert("tuition_allocations", {
      id,
      institution_id: actor.institutionId,
      payment_id: p.id,
      amount_paise: amount,
      reason: d.reason,
      approved_by: actor.userId,
      ...stamps(actor.userId),
    }),
    audit(
      actor,
      "Approved tuition certificate allocation",
      "tuition_allocations",
      id,
      null,
      d,
    ),
  ]);
  return { id };
}
export async function annualTuitionCertificate(
  actor: Actor,
  studentId: string,
  financialYear: number,
) {
  z.number().int().min(2000).max(2100).parse(financialYear);
  await accessStudent(actor, studentId);
  const from = `${financialYear}-04-01`,
    to = `${financialYear + 1}-04-01`;
  const student = await own(actor, "students", studentId),
    institution = await one("SELECT * FROM institutions WHERE id=?", [
      actor.institutionId,
    ]);
  const rows = await all<{
    number: string;
    paid_date: string;
    amount: number;
    approved_by: string;
  }>(
    `SELECT r.number,date(p.paid_at,'+5 hours','+30 minutes') paid_date,MAX(0,t.amount_paise-COALESCE((SELECT SUM(f.amount_paise) FROM refunds f WHERE f.institution_id=p.institution_id AND f.payment_id=p.id AND f.status='Processed' AND date(f.refunded_at,'+5 hours','+30 minutes')<?),0)) amount,t.approved_by FROM tuition_allocations t JOIN payments p ON p.id=t.payment_id AND p.institution_id=t.institution_id JOIN receipts r ON r.payment_id=p.id AND r.institution_id=p.institution_id WHERE p.institution_id=? AND p.student_id=? AND p.status IN ('Successful','Partially Refunded','Refunded') AND date(p.paid_at,'+5 hours','+30 minutes')>=? AND date(p.paid_at,'+5 hours','+30 minutes')<? ORDER BY p.paid_at LIMIT 501`,
    [to, actor.institutionId, studentId, from, to],
  );
  if (rows.length > 500)
    throw new ApiError(
      422,
      "CERTIFICATE_LIMIT",
      "Contact accounts for a consolidated certificate.",
    );
  if (!rows.length)
    throw new ApiError(
      409,
      "TUITION_REVIEW_REQUIRED",
      "Accounts must approve the tuition portion of your payments before a certificate can be issued.",
    );
  const total = rows.reduce((sum, r) => sum + r.amount, 0);
  const content = await renderPdf(
    institution!,
    "Annual tuition payment certificate",
    [
      ["Receipt", "Paid date", "Tuition paid (INR)"],
      ...rows.map((r) => [r.number, r.paid_date, money(r.amount, true)]),
    ],
    [
      `Financial year: ${financialYear}-${String(financialYear + 1).slice(-2)}`,
      `Student: ${student.name} | Admission: ${student.admission_number}`,
      "Includes institution-approved tuition allocations only; development fees and donations are excluded.",
      "Processed refunds up to year end reduce tuition first. This document does not determine tax eligibility.",
    ],
    ["Approved tuition paid: " + money(total, true)],
  );
  return attachment(
    content,
    "application/pdf",
    `Tuition-${student.admission_number}-${financialYear}.pdf`,
  );
}
export async function registerDonationCertificate(
  actor: Actor,
  input: unknown,
) {
  permit(actor, "settings.manage");
  const d = z
    .object({
      parentId: z.string().min(1),
      financialYear: z.number().int().min(2000).max(2100),
      donationReference: z.string().trim().min(1).max(120),
      amount: z.string(),
      urn: z.string().trim().min(5).max(100),
      doneePan: z.string().regex(/^[A-Z]{5}\d{4}[A-Z]$/),
      form10bdAcknowledgement: z.string().trim().min(5).max(100),
      approved: z.literal(true),
      pdfBase64: z.string().max(2800000),
    })
    .parse(input);
  await own(actor, "parents", d.parentId);
  const amount = parseMoney(d.amount);
  if (amount <= 0 || !env.BUCKET)
    throw new ApiError(
      422,
      "INVALID_CERTIFICATE",
      "Enter a positive donation and configure document storage.",
    );
  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(atob(d.pdfBase64), (c) => c.charCodeAt(0));
    if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-")
      throw new Error();
    const pdf = await PDFDocument.load(bytes);
    if (pdf.getPageCount() > 20 || bytes.byteLength > 2000000)
      throw new Error();
  } catch {
    throw new ApiError(
      422,
      "INVALID_PDF",
      "Upload the official Form 10BE PDF, up to 2 MB and 20 pages.",
    );
  }
  const id = uuid(),
    key = `${actor.institutionId}/tax/${id}.pdf`;
  await env.BUCKET.put(key, bytes, {
    httpMetadata: { contentType: "application/pdf" },
  });
  try {
    await batch([
      insert("donation_certificates", {
        id,
        institution_id: actor.institutionId,
        parent_id: d.parentId,
        financial_year: d.financialYear,
        donation_reference: d.donationReference,
        amount_paise: amount,
        urn: d.urn,
        donee_pan: d.doneePan,
        form10bd_acknowledgement: d.form10bdAcknowledgement,
        object_key: key,
        file_hash: await sha256(d.pdfBase64),
        ...stamps(actor.userId),
      }),
      audit(
        actor,
        "Approved official donation Form 10BE",
        "donation_certificates",
        id,
        null,
        {
          parentId: d.parentId,
          donationReference: d.donationReference,
          financialYear: d.financialYear,
        },
      ),
    ]);
  } catch (e) {
    await env.BUCKET.delete(key);
    throw e;
  }
  return { id };
}
export async function donationCertificate(actor: Actor, id: string) {
  const doc = await own(actor, "donation_certificates", id);
  if (actor.portalGrantId && doc.parent_id !== actor.parentId)
    throw new ApiError(404, "NOT_FOUND", "Certificate not found.");
  const object = await env.BUCKET?.get(doc.object_key);
  if (!object)
    throw new ApiError(404, "NOT_FOUND", "Certificate file not found.");
  return attachment(
    new Uint8Array(await object.arrayBuffer()),
    "application/pdf",
    `Form-10BE-${doc.financial_year}.pdf`,
  );
}
```


### `features/students/ParentAccess.tsx`

```tsx
"use client";
import { useEffect, useState } from "react";
import { useApp } from "@/components/campus/context";
import { Button, Field, FormDialog, Input } from "@/components/campus/ui";
import { toast } from "sonner";
type Grant = {
  id: string;
  expires_at: string;
  revoked_at: string | null;
  purpose: string;
};
export function ParentAccess({ parentId }: { parentId: string }) {
  const { request } = useApp(),
    [open, setOpen] = useState(false),
    [days, setDays] = useState(7),
    [url, setUrl] = useState(""),
    [grants, setGrants] = useState<Grant[]>([]),
    [busy, setBusy] = useState(false);
  const load = () =>
    request("parent-links?parentId=" + encodeURIComponent(parentId)).then((r) =>
      setGrants(r.rows),
    );
  useEffect(() => {
    if (open) load().catch((e) => toast.error(e.message));
  }, [open, parentId]);
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        Parent access link
      </Button>
      <FormDialog
        open={open}
        onClose={() => {
          setOpen(false);
          setUrl("");
        }}
        title="Private parent access"
        description="The link covers this guardian’s linked children in this institution. You can revoke access at any time."
        busy={busy}
        submitLabel="Generate private link"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            const result = await request("parent-links", {
              method: "POST",
              body: { parentId, days },
            });
            setUrl(result.url);
            await load();
          } catch (e) {
            toast.error((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="Valid for (days)">
          <Input
            type="number"
            min={1}
            max={30}
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          />
        </Field>
        {url && (
          <div className="space-y-3 rounded-lg bg-blue-50 p-4">
            <Input
              readOnly
              aria-label="Private portal link"
              value={url}
              onFocus={(e) => e.target.select()}
            />
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                navigator.clipboard
                  .writeText(url)
                  .then(() => toast.success("Private link copied."))
                  .catch(() =>
                    toast.error("Select and copy the link manually."),
                  )
              }
            >
              Copy link
            </Button>
            <a
              className="ml-3 text-blue-700"
              href={url}
              target="_blank"
              rel="noreferrer"
            >
              Open portal
            </a>
            <p className="text-sm">
              Share only with the authorized guardian. This link is shown once.
            </p>
          </div>
        )}
        <div className="space-y-3">
          {grants.map((g) => (
            <div
              key={g.id}
              className="flex items-center justify-between gap-3 border-b pb-3"
            >
              <div>
                <p className="text-sm">{g.purpose}</p>
                <p className="text-sm text-slate-500">
                  Expires {new Date(g.expires_at).toLocaleString()}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                disabled={!!g.revoked_at || busy}
                onClick={async () => {
                  try {
                    await request("parent-links/" + g.id + "/revoke", {
                      method: "POST",
                      body: {},
                    });
                    await load();
                    toast.success("Link revoked.");
                  } catch (e) {
                    toast.error((e as Error).message);
                  }
                }}
              >
                {g.revoked_at ? "Revoked" : "Revoke"}
              </Button>
            </div>
          ))}
        </div>
      </FormDialog>
    </>
  );
}
```


### `features/students/TaxEvidence.tsx`

```tsx
"use client";
import { useState } from "react";
import { Row, useApp } from "@/components/campus/context";
import {
  Button,
  Field,
  FormDialog,
  Input,
  Picker,
  money,
} from "@/components/campus/ui";
import { toast } from "sonner";
export function TaxEvidence({
  parentId,
  payments,
}: {
  parentId: string;
  payments: Row[];
}) {
  const { request } = useApp(),
    [open, setOpen] = useState(false),
    [kind, setKind] = useState("tuition"),
    [busy, setBusy] = useState(false),
    [paymentId, setPayment] = useState(""),
    [amount, setAmount] = useState(""),
    [reason, setReason] = useState(""),
    [year, setYear] = useState(new Date().getFullYear()),
    [reference, setReference] = useState(""),
    [urn, setUrn] = useState(""),
    [pan, setPan] = useState(""),
    [ack, setAck] = useState(""),
    [file, setFile] = useState<File | null>(null);
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        Tax certificate evidence
      </Button>
      <FormDialog
        open={open}
        onClose={() => setOpen(false)}
        title="Approve certificate evidence"
        description="A supervisor must verify the underlying tuition allocation or the official donation certificate before making it available to a guardian."
        busy={busy}
        submitLabel="Approve evidence"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            if (kind === "tuition")
              await request("certificates/tuition-allocations", {
                method: "POST",
                body: { paymentId, amount, reason },
              });
            else {
              if (!file) throw new Error("Select the official Form 10BE PDF.");
              if (file.size > 2000000)
                throw new Error("PDF must be under 2 MB.");
              const bytes = new Uint8Array(await file.arrayBuffer());
              let binary = "";
              for (let n = 0; n < bytes.length; n += 8192)
                binary += String.fromCharCode(...bytes.subarray(n, n + 8192));
              await request("certificates/donations", {
                method: "POST",
                body: {
                  parentId,
                  financialYear: year,
                  donationReference: reference,
                  amount,
                  urn,
                  doneePan: pan,
                  form10bdAcknowledgement: ack,
                  approved: true,
                  pdfBase64: btoa(binary),
                },
              });
            }
            toast.success(
              "Approved evidence is available in the parent portal.",
            );
            setOpen(false);
          } catch (e) {
            toast.error((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="Document type">
          <Picker
            value={kind}
            onChange={setKind}
            options={[
              { value: "tuition", label: "Annual tuition payment certificate" },
              { value: "donation", label: "Official donation Form 10BE" },
            ]}
          />
        </Field>
        {kind === "tuition" ? (
          <>
            <Field label="Settled payment">
              <Picker
                value={paymentId}
                onChange={setPayment}
                options={[
                  { value: "", label: "Choose payment" },
                  ...payments
                    .filter((p) =>
                      ["Successful", "Partially Refunded"].includes(p.status),
                    )
                    .map((p) => ({
                      value: p.id,
                      label: `${p.paid_at?.slice(0, 10)} · ${money(p.amount_paise)} · ${p.reference || p.id}`,
                    })),
                ]}
              />
            </Field>
            <Field label="Verified tuition portion (₹)">
              <Input
                required
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </Field>
            <Field label="Allocation evidence and approval reason">
              <Input
                required
                minLength={10}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </Field>
            <p className="text-sm text-slate-500">
              Include only actual tuition. Development, transport, hostel and
              donation amounts are not tuition. Approval records cannot be
              overwritten.
            </p>
          </>
        ) : (
          <>
            <Field label="Financial year start">
              <Input
                required
                type="number"
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
              />
            </Field>
            <Field label="Donation reference">
              <Input
                required
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
            </Field>
            <Field label="Donation amount (₹)">
              <Input
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </Field>
            <Field label="80G registration URN">
              <Input
                required
                value={urn}
                onChange={(e) => setUrn(e.target.value)}
              />
            </Field>
            <Field label="Donee PAN">
              <Input
                required
                value={pan}
                onChange={(e) => setPan(e.target.value.toUpperCase())}
              />
            </Field>
            <Field label="Form 10BD acknowledgement">
              <Input
                required
                value={ack}
                onChange={(e) => setAck(e.target.value)}
              />
            </Field>
            <Field label="Official Form 10BE PDF">
              <Input
                required
                type="file"
                accept="application/pdf"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
            </Field>
            <p className="text-sm text-slate-500">
              Upload the certificate downloaded after the institution’s
              statutory filing. School fees cannot be converted into charitable
              donations.
            </p>
          </>
        )}
      </FormDialog>
    </>
  );
}
```


## Phase 2 — Scheduled and queued communications


### `build/sites-worker.ts`

```typescript
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
```


### `cloudflare-env.d.ts`

```typescript
declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
  }
}
declare namespace Cloudflare {
  interface Env {
    PROVIDER_ENCRYPTION_KEY?: string;
    PARENT_PORTAL_SECRET?: string;
    COMMUNICATION_QUEUE?: Queue<{
      institutionId: string;
      kind?: "delivery" | "financial";
    }>;
    JOB_SECRET?: string;
    PLATFORM_OWNER_EMAIL?: string;
    PLATFORM_ORIGIN?: string;
    RAZORPAY_KEY_ID?: string;
    RAZORPAY_KEY_SECRET?: string;
    RAZORPAY_WEBHOOK_SECRET?: string;
    CASHFREE_APP_ID?: string;
    CASHFREE_SECRET_KEY?: string;
    CASHFREE_ENV?: string;
    CONNECTORS?: any;
  }
}
```


### `server/communications.ts`

```typescript
import { env, waitUntil } from "cloudflare:workers";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db";
import { installments } from "../db/schema";
import { money } from "../lib/money";
import { all, batch, now, one, run, stamps, stmt, today, uuid } from "./db";
import { documentPdf } from "./reports";
import { Actor, ApiError, audit, permit } from "./security";
import { withTenantContext } from "./tenant-context";

const template = z.object({
  id: z.string().trim().min(1).max(100),
  body: z.string().trim().min(10).max(1000),
});
export const communicationSchema = z
  .object({
    enabled: z.boolean(),
    entityId: z.string().max(100),
    senderId: z.string().max(20),
    templates: z
      .record(
        z.enum([
          "before7",
          "before3",
          "before1",
          "due",
          "after1",
          "after3",
          "after7",
          "receipt",
        ]),
        template,
      )
      .default({}),
  })
  .superRefine((v, ctx) => {
    if (
      v.enabled &&
      (!v.entityId ||
        !v.senderId ||
        ["before7", "before3", "before1"].some(
          (k) => !v.templates[k as keyof typeof v.templates],
        ))
    )
      ctx.addIssue({
        code: "custom",
        message:
          "Enter the registered entity, sender and 7/3/1-day template IDs and exact approved content.",
      });
  });
export type CommunicationSettings = z.infer<typeof communicationSchema>;
export async function communicationConfig(actor: Actor) {
  const r = await one<{ configuration: string }>(
    "SELECT configuration FROM communication_settings WHERE institution_id=?",
    [actor.institutionId],
  );
  return r
    ? communicationSchema.parse(JSON.parse(r.configuration))
    : ({
        enabled: false,
        entityId: "",
        senderId: "",
        templates: {},
      } satisfies CommunicationSettings);
}
export async function saveCommunicationConfig(actor: Actor, input: unknown) {
  permit(actor, "settings.manage");
  const d = communicationSchema.parse(input);
  for (const t of Object.values(d.templates))
    if (
      /\{(?!student\}|amount\}|date\}|institution\}|receipt\})[^}]+\}/.test(
        t.body,
      )
    )
      throw new ApiError(
        422,
        "INVALID_TEMPLATE",
        "Allowed template variables: {student}, {amount}, {date}, {institution}, {receipt}.",
      );
  await batch([
    stmt(
      "INSERT INTO communication_settings(id,institution_id,configuration,created_at,updated_at,created_by,updated_by) VALUES(?,?,?,?,?,?,?) ON CONFLICT(institution_id) DO UPDATE SET configuration=excluded.configuration,updated_at=excluded.updated_at,updated_by=excluded.updated_by",
      [
        uuid(),
        actor.institutionId,
        JSON.stringify(d),
        now(),
        now(),
        actor.userId,
        actor.userId,
      ],
    ),
    audit(
      actor,
      "Updated registered SMS templates",
      "communication_settings",
      actor.institutionId,
      null,
      { enabled: d.enabled, templates: Object.keys(d.templates) },
    ),
  ]);
  return { saved: true };
}
export function serviceActor(institutionId: string): Actor {
  return {
    institutionId,
    userId: "communications-worker",
    name: "Communication worker",
    email: "",
    role: "INSTITUTION_ADMIN",
    feeVisibility: true,
    request: new Request("https://internal.invalid/worker"),
  };
}
export function scheduleCommunications(institutionId: string) {
  waitUntil(
    dispatchCommunications(institutionId).catch(() =>
      console.error("Communication job remains pending", institutionId),
    ),
  );
}
export async function dispatchCommunications(institutionId: string) {
  if (env.COMMUNICATION_QUEUE) {
    await env.COMMUNICATION_QUEUE.send({ institutionId });
    return;
  }
  // Sites currently exposes D1/R2 but no Queue binding. Retain recoverable work
  // and run the identical consumer off the HTTP response in that deployment.
  await consumeCommunications(institutionId);
}
export async function consumeCommunications(institutionId: string) {
  const institution = await one(
    "SELECT id FROM institutions WHERE id=? AND status='Active'",
    [institutionId],
  );
  if (!institution) return;
  const actor = serviceActor(institutionId);
  return withTenantContext(actor, async () => {
    await renderReceiptJobs(actor);
    const { flushNotifications } = await import("./notifications");
    const delivered = await flushNotifications(actor);
    if (delivered.failed && env.COMMUNICATION_QUEUE)
      throw new Error("Delivery requires retry");
    const remaining = await one<{ count: number }>(
      "SELECT COUNT(*) count FROM document_jobs WHERE institution_id=? AND state='Queued' AND attempts<5",
      [institutionId],
    );
    const messages = await one<{ count: number }>(
      "SELECT COUNT(*) count FROM notifications n JOIN provider_configs p ON p.institution_id=n.institution_id AND p.provider=n.channel WHERE n.institution_id=? AND n.status='Queued' AND n.attempts<5",
      [institutionId],
    );
    if ((remaining?.count || messages?.count) && env.COMMUNICATION_QUEUE)
      await env.COMMUNICATION_QUEUE.send(
        { institutionId },
        { delaySeconds: 5 },
      );
  });
}
export type CommunicationJob = {
  institutionId: string;
  kind?: "delivery" | "financial";
};
export async function communicationQueue(
  batch: MessageBatch<CommunicationJob>,
) {
  for (const message of batch.messages) {
    try {
      const d = z
        .object({
          institutionId: z.string().min(1).max(100),
          kind: z.enum(["delivery", "financial"]).optional(),
        })
        .parse(message.body);
      if (d.kind === "financial") {
        const actor = serviceActor(d.institutionId),
          { runFinancialJobs } = await import("./notifications");
        const institution = await one(
          "SELECT i.id FROM institutions i JOIN institution_subscriptions s ON s.institution_id=i.id WHERE i.id=? AND i.status='Active' AND s.status IN ('Trial','Active') AND s.start_date<=? AND s.end_date>=?",
          [d.institutionId, today(), today()],
        );
        if (institution) {
          const result = await withTenantContext(actor, () =>
            runFinancialJobs(actor),
          );
          if (result.scanHasMore && env.COMMUNICATION_QUEUE)
            await env.COMMUNICATION_QUEUE.send(d, { delaySeconds: 1 });
        }
      } else await consumeCommunications(d.institutionId);
      message.ack();
    } catch {
      message.retry({ delaySeconds: 300 });
    }
  }
}
export async function queueReceipt(actor: Actor, receiptId: string) {
  await run(
    "INSERT OR IGNORE INTO document_jobs(id,institution_id,receipt_id,state,attempts,created_at,updated_at) VALUES(?,?,?,'Queued',0,?,?)",
    ["pdf:" + receiptId, actor.institutionId, receiptId, now(), now()],
  );
  scheduleCommunications(actor.institutionId);
}
async function renderReceiptJobs(actor: Actor) {
  if (!env.BUCKET) return;
  await run(
    "UPDATE document_jobs SET state='Queued' WHERE institution_id=? AND state='Processing' AND updated_at<? AND attempts<5",
    [actor.institutionId, new Date(Date.now() - 600000).toISOString()],
  );
  const jobs = await all<{ id: string; receipt_id: string }>(
    "SELECT id,receipt_id FROM document_jobs WHERE institution_id=? AND state='Queued' AND attempts<5 ORDER BY created_at LIMIT 5",
    [actor.institutionId],
  );
  for (const job of jobs) {
    const claim = await stmt(
      "UPDATE document_jobs SET state='Processing',attempts=attempts+1,updated_at=? WHERE id=? AND institution_id=? AND state='Queued' RETURNING id",
      [now(), job.id, actor.institutionId],
    ).first();
    if (!claim) continue;
    try {
      const response = await documentPdf(actor, "receipt", job.receipt_id),
        key = `${actor.institutionId}/receipts/${job.receipt_id}.pdf`;
      await env.BUCKET.put(key, await response.arrayBuffer(), {
        httpMetadata: { contentType: "application/pdf" },
      });
      const thermal = await documentPdf(
        actor,
        "receipt",
        job.receipt_id,
        "thermal",
      );
      await env.BUCKET.put(
        key.replace(/\.pdf$/, "-80mm.pdf"),
        await thermal.arrayBuffer(),
        { httpMetadata: { contentType: "application/pdf" } },
      );
      await batch([
        stmt(
          "INSERT OR IGNORE INTO document_artifacts(id,institution_id,receipt_id,object_key,created_at) VALUES(?,?,?,?,?)",
          [
            "artifact:" + job.receipt_id,
            actor.institutionId,
            job.receipt_id,
            key,
            now(),
          ],
        ),
        stmt(
          "UPDATE document_jobs SET state='Completed',last_error=NULL,updated_at=? WHERE id=? AND institution_id=?",
          [now(), job.id, actor.institutionId],
        ),
      ]);
    } catch {
      await run(
        "UPDATE document_jobs SET state=CASE WHEN attempts>=5 THEN 'Failed' ELSE 'Queued' END,last_error='Receipt generation needs retry',updated_at=? WHERE id=? AND institution_id=?",
        [now(), job.id, actor.institutionId],
      );
    }
  }
}
export async function queueScheduledReminders(actor: Actor) {
  const config = await communicationConfig(actor);
  if (!config.enabled) return { queued: 0 };
  const date = today(),
    institution = await one<{ name: string }>(
      "SELECT name FROM institutions WHERE id=?",
      [actor.institutionId],
    );
  const dates = [-7, -3, -1, 0, 1, 3, 7].map((n) =>
    new Date(Date.parse(date) + n * 86400000).toISOString().slice(0, 10),
  );
  const cursorKey = "dlt-cursor:" + actor.institutionId + ":" + date;
  const cursor =
    (
      await one<{ value: string }>("SELECT value FROM platform WHERE key=?", [
        cursorKey,
      ])
    )?.value || "";
  const due = await getDb().select(installments, {
    limit: 100,
    orderBy: sql`${installments.id}`,
    where: sql`${installments.id}>${cursor} AND ${installments.dueDate} IN (${sql.join(
      dates.map((d) => sql`${d}`),
      sql`,`,
    )}) AND EXISTS(SELECT 1 FROM academic_years y WHERE y.id=${installments.academicYearId} AND y.status IN ('Active','Draft'))`,
  });
  let queued = 0;
  for (const candidate of due) {
    const i = await one<{
      id: string;
      student_id: string;
      academic_year_id: string;
      outstanding_paise: number;
      due_date: string;
    }>(
      "SELECT id,student_id,academic_year_id,outstanding_paise,due_date FROM installment_balances WHERE institution_id=? AND id=? AND outstanding_paise>0",
      [actor.institutionId, candidate.id],
    );
    if (!i) continue;
    const days = Math.round(
      (Date.parse(i.due_date) - Date.parse(date)) / 86400000,
    );
    const key =
        days === 0 ? "due" : days > 0 ? "before" + days : "after" + -days,
      t = config.templates[key as keyof typeof config.templates];
    if (!t) continue;
    const parent = await one<{
      id: string;
      mobile: string;
      student_name: string;
    }>(
      "SELECT p.id,p.mobile,s.name student_name FROM parents p JOIN student_parents sp ON sp.parent_id=p.id AND sp.institution_id=p.institution_id JOIN students s ON s.id=sp.student_id AND s.institution_id=sp.institution_id WHERE p.institution_id=? AND sp.student_id=? AND sp.is_primary=1 AND p.sms_consent=1",
      [actor.institutionId, i.student_id],
    );
    if (!parent) continue;
    const variables = {
      student: parent.student_name,
      amount: money(i.outstanding_paise, true),
      date: i.due_date,
      institution: institution!.name,
    };
    let message = t.body;
    for (const [k, v] of Object.entries(variables))
      message = message.replaceAll("{" + k + "}", v.replace(/[\r\n]/g, " "));
    const result = await run(
      "INSERT OR IGNORE INTO notifications(id,institution_id,academic_year_id,parent_id,student_id,recipient,channel,message,status,dedupe_key,metadata,created_at,updated_at,created_by,updated_by) VALUES(?,?,?,?,?,?,'SMS',?,'Queued',?,?,?,?,?,?)",
      [
        uuid(),
        actor.institutionId,
        i.academic_year_id,
        parent.id,
        i.student_id,
        parent.mobile,
        message,
        `dlt:${i.id}:${i.due_date}:${key}`,
        JSON.stringify({
          dlt: {
            entityId: config.entityId,
            senderId: config.senderId,
            templateId: t.id,
          },
          variables,
        }),
        now(),
        now(),
        actor.userId,
        actor.userId,
      ],
    );
    queued += result.meta.changes;
  }
  await run(
    "INSERT INTO platform(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
    [cursorKey, due.length === 100 ? String(due.at(-1)!.id) : ""],
  );
  return { queued, hasMore: due.length === 100 };
}
export async function scheduledMaintenance() {
  const key = "cron:institution-cursor",
    cursor =
      (
        await one<{ value: string }>("SELECT value FROM platform WHERE key=?", [
          key,
        ])
      )?.value || "";
  const institutions = await all<{ id: string }>(
    "SELECT i.id FROM institutions i JOIN institution_subscriptions s ON s.institution_id=i.id WHERE i.status='Active' AND s.status IN ('Trial','Active') AND s.start_date<=? AND s.end_date>=? AND i.id>? ORDER BY i.id LIMIT 10",
    [today(), today(), cursor],
  );
  const { runFinancialJobs } = await import("./notifications");
  for (const i of institutions) {
    if (env.COMMUNICATION_QUEUE)
      await env.COMMUNICATION_QUEUE.send({
        institutionId: i.id,
        kind: "financial",
      });
    else {
      const actor = serviceActor(i.id);
      await withTenantContext(actor, () => runFinancialJobs(actor));
    }
  }
  await run(
    "INSERT INTO platform(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
    [key, institutions.length === 10 ? institutions.at(-1)!.id : ""],
  );
}
```


### `server/notifications.ts`

```typescript
import { env } from "cloudflare:workers";
import {
  communicationConfig,
  queueScheduledReminders,
  scheduleCommunications,
} from "./communications";
import { issueParentGrant } from "./parent-portal";
import { money } from "../lib/money";
import {
  all,
  batch,
  insert,
  now,
  one,
  Row,
  run,
  stamps,
  stmt,
  today,
  uuid,
} from "./db";
import { accrueLateFee } from "./fees";
import { readProvider } from "./providers";
import { Actor, ApiError, audit, own, permit } from "./security";
export async function queueReminder(
  actor: Actor,
  studentIds: string[],
  channel: string,
  template?: string,
) {
  permit(actor, "collect");
  if (!["SMS", "WhatsApp", "Email"].includes(channel))
    throw new ApiError(
      422,
      "INVALID_CHANNEL",
      "Select SMS, WhatsApp or Email.",
    );
  const institution = await one(
      "SELECT name,settings FROM institutions WHERE id=?",
      [actor.institutionId],
    ),
    settings = JSON.parse(institution!.settings);
  const dlt = channel === "SMS" ? await communicationConfig(actor) : null;
  if (dlt && (!dlt.enabled || !dlt.templates.after1))
    throw new ApiError(
      422,
      "DLT_TEMPLATE_REQUIRED",
      "Configure a registered after1 template and consent before sending SMS reminders.",
    );
  const statements = [];
  for (const studentId of studentIds) {
    await own(actor, "students", studentId);
    const parent = await one(
      `SELECT par.*,s.name student_name,fs.outstanding_paise,fs.next_due_date,fs.academic_year_id FROM students s JOIN student_parents sp ON sp.student_id=s.id AND sp.institution_id=s.institution_id JOIN parents par ON par.id=sp.parent_id JOIN student_balances fs ON fs.student_id=s.id AND fs.institution_id=s.institution_id WHERE s.institution_id=? AND s.id=? AND sp.is_primary=1 ORDER BY fs.academic_year_id DESC LIMIT 1`,
      [actor.institutionId, studentId],
    );
    if (!parent)
      throw new ApiError(
        422,
        "PARENT_REQUIRED",
        "The selected student needs a parent contact.",
      );
    const recipient = channel === "Email" ? parent.email : parent.mobile;
    if (!recipient)
      throw new ApiError(
        422,
        "CONTACT_REQUIRED",
        "The parent has no contact for the selected channel.",
      );
    const values = {
      parent: parent.guardian_name,
      student: parent.student_name,
      amount: money(parent.outstanding_paise, true),
      date: parent.next_due_date || "",
    };
    let message =
      template ||
      settings.templates?.overdue ||
      "Dear {parent}, {student} has an outstanding fee of {amount}.";
    for (const [k, v] of Object.entries(values))
      message = message.replaceAll("{" + k + "}", String(v));
    let metadata = {};
    if (dlt) {
      if (!parent.sms_consent)
        throw new ApiError(
          422,
          "SMS_CONSENT_REQUIRED",
          "Record guardian SMS consent first.",
        );
      const approved = dlt.templates.after1!;
      const variables = {
        student: parent.student_name,
        amount: money(parent.outstanding_paise, true),
        date: parent.next_due_date || "",
        institution: institution!.name,
      };
      message = approved.body;
      for (const [key, value] of Object.entries(variables))
        message = message.replaceAll(
          "{" + key + "}",
          String(value).replace(/[\r\n]/g, " "),
        );
      metadata = {
        dlt: {
          entityId: dlt.entityId,
          senderId: dlt.senderId,
          templateId: approved.id,
        },
        variables,
      };
    }
    const id = uuid();
    statements.push(
      insert("notifications", {
        id,
        institution_id: actor.institutionId,
        ...stamps(actor.userId),
        academic_year_id: parent.academic_year_id,
        student_id: studentId,
        parent_id: parent.id,
        recipient,
        channel,
        message,
        metadata: JSON.stringify(metadata),
        status: "Queued",
      }),
      audit(actor, "Queued payment reminder", "notifications", id, null, {
        studentId,
        channel,
        recipient,
      }),
    );
  }
  await batch(statements);
  return { queued: studentIds.length };
}
export async function processNotifications(actor: Actor) {
  permit(actor, "admin");
  scheduleNotifications(actor);
  return { queued: true, sent: 0, failed: 0, waiting: 0 };
}
async function deliverNotifications(actor: Actor) {
  await run(
    "UPDATE notifications SET status='Queued' WHERE institution_id=? AND status='Processing' AND updated_at<?",
    [actor.institutionId, new Date(Date.now() - 600000).toISOString()],
  );
  const queued = await all(
    "SELECT * FROM notifications WHERE institution_id=? AND (status='Queued' OR (status='Failed' AND datetime(updated_at)<datetime('now','-5 minutes'))) AND attempts<5 ORDER BY created_at LIMIT 5",
    [actor.institutionId],
  );
  let sent = 0,
    failed = 0,
    waiting = 0;
  for (const n of queued) {
    const provider = await readProvider(actor.institutionId, n.channel);
    if (!provider) {
      waiting++;
      continue;
    }
    const metadata = JSON.parse(n.metadata || "{}");
    if (n.channel === "SMS") {
      const parent = n.parent_id
        ? await one(
            "SELECT sms_consent FROM parents WHERE institution_id=? AND id=?",
            [actor.institutionId, n.parent_id],
          )
        : null;
      if (
        !parent?.sms_consent ||
        !metadata.dlt?.entityId ||
        !metadata.dlt?.templateId ||
        !metadata.dlt?.senderId
      ) {
        await run(
          "UPDATE notifications SET status='Failed',attempts=5,last_error='SMS requires guardian consent and a registered DLT template',updated_at=? WHERE institution_id=? AND id=?",
          [now(), actor.institutionId, n.id],
        );
        failed++;
        continue;
      }
    }
    if (metadata.sessionExpiresAt && metadata.sessionExpiresAt < now()) {
      await run(
        "UPDATE notifications SET status='Failed',attempts=5,last_error='WhatsApp reply window expired',updated_at=? WHERE institution_id=? AND id=?",
        [now(), actor.institutionId, n.id],
      );
      failed++;
      continue;
    }
    // Claim work once. Provider receives the stable ID as its idempotency key.
    const claimed = await stmt(
      "UPDATE notifications SET status='Processing',attempts=attempts+1,updated_at=? WHERE id=? AND status IN ('Queued','Failed') RETURNING id",
      [now(), n.id],
    ).first();
    if (!claimed) continue;
    try {
      const attachments = [];
      if (metadata.receiptId && n.channel === "Email") {
        const artifact = await one(
          "SELECT object_key FROM document_artifacts WHERE institution_id=? AND receipt_id=?",
          [actor.institutionId, metadata.receiptId],
        );
        const file = artifact
          ? await env.BUCKET?.get(artifact.object_key)
          : null;
        if (!file) throw new Error("Receipt is not ready");
        const bytes = new Uint8Array(await file.arrayBuffer());
        let binary = "";
        for (let offset = 0; offset < bytes.length; offset += 8192)
          binary += String.fromCharCode(
            ...bytes.subarray(offset, offset + 8192),
          );
        attachments.push({
          filename: "receipt.pdf",
          contentType: "application/pdf",
          contentBase64: btoa(binary),
        });
      }
      const meta = n.channel === "WhatsApp" && provider.adapter === "Meta";
      const templateName = metadata.receiptId
        ? provider.receiptTemplateName
        : provider.reminderTemplateName;
      if (meta && !metadata.sessionExpiresAt && !templateName)
        throw new Error(
          "An approved WhatsApp receipt template is required outside the reply window",
        );
      const payload = meta
        ? metadata.sessionExpiresAt
          ? {
              messaging_product: "whatsapp",
              to: n.recipient,
              type: "text",
              text: { preview_url: false, body: n.message },
            }
          : {
              messaging_product: "whatsapp",
              to: n.recipient,
              type: "template",
              template: {
                name: templateName,
                language: { code: provider.templateLanguage || "en" },
                components: [
                  {
                    type: "body",
                    parameters: [{ type: "text", text: n.message }],
                  },
                ],
              },
            }
        : {
            id: n.id,
            channel: n.channel,
            recipient: n.recipient,
            message: n.message,
            institutionId: actor.institutionId,
            dlt: metadata.dlt,
            variables: metadata.variables,
            attachments,
          };
      const response = await fetch(provider.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + provider.token,
          "Idempotency-Key": n.id,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(4000),
        redirect: "manual",
      });
      if (!response.ok)
        throw new Error("Provider returned HTTP " + response.status);
      const result = (await response.json()) as Row;
      await run(
        "UPDATE notifications SET status='Sent',reference_id=?,sent_at=?,last_error=NULL,updated_at=? WHERE id=?",
        [
          String(
            result.id || result.referenceId || result.messages?.[0]?.id || n.id,
          ),
          now(),
          now(),
          n.id,
        ],
      );
      sent++;
    } catch {
      await run(
        "UPDATE notifications SET status='Failed',last_error='Delivery provider did not accept this message',updated_at=? WHERE id=?",
        [now(), n.id],
      );
      failed++;
    }
  }
  return { sent, failed, waiting };
}
export async function runFinancialJobs(actor: Actor) {
  permit(actor, "admin");
  const institution = await one(
      "SELECT settings FROM institutions WHERE id=?",
      [actor.institutionId],
    ),
    settings = JSON.parse(institution!.settings),
    date = today();
  let lateFees = 0,
    reminders = 0;
  const cursorKey = "jobs:cursor:" + actor.institutionId,
    cursor =
      (await one("SELECT value FROM platform WHERE key=?", [cursorKey]))
        ?.value || "";
  const installments = await all(
    "SELECT ib.* FROM installment_balances ib JOIN academic_years ay ON ay.id=ib.academic_year_id WHERE ib.institution_id=? AND ib.outstanding_paise>0 AND ay.status IN ('Draft','Active') AND ib.id>? ORDER BY ib.id LIMIT 100",
    [actor.institutionId, cursor],
  );
  for (const i of installments) {
    const days = Math.floor(
        (Date.parse(date) - Date.parse(i.due_date)) / 86400000,
      ),
      base = { institution_id: actor.institutionId, ...stamps(actor.userId) };
    if (settings.lateFee?.enabled && days > 0) {
      const previous = await one(
          "SELECT COALESCE(SUM(amount_paise),0) amount FROM late_fee_runs WHERE institution_id=? AND installment_id=?",
          [actor.institutionId, i.id],
        ),
        value = accrueLateFee(
          Math.max(0, i.outstanding_paise - i.adjustment_paise),
          i.due_date,
          date,
          settings.lateFee,
          previous!.amount,
        );
      if (value > 0) {
        const adjustmentId = uuid();
        await batch([
          insert("late_fee_runs", {
            id: uuid(),
            ...base,
            installment_id: i.id,
            period: date,
            amount_paise: value,
          }),
          insert("fee_adjustments", {
            id: adjustmentId,
            ...base,
            student_id: i.student_id,
            academic_year_id: i.academic_year_id,
            invoice_id: i.invoice_id,
            installment_id: i.id,
            kind: "Late Fee",
            amount_paise: value,
            reason: "Automatic late fee for " + i.title,
            approved_by: actor.userId,
          }),
          insert("ledger_entries", {
            id: uuid(),
            ...base,
            student_id: i.student_id,
            academic_year_id: i.academic_year_id,
            invoice_id: i.invoice_id,
            adjustment_id: adjustmentId,
            kind: "Late Fee",
            description: "Late fee for " + i.title,
            debit_paise: value,
            credit_paise: 0,
            entry_date: date,
          }),
          audit(actor, "Calculated late fee", "installments", i.id, null, {
            value,
            date,
          }),
        ]);
        lateFees++;
      }
    }
    if (
      ["Email", "WhatsApp"].includes(settings.reminders?.channel) &&
      settings.reminders?.enabled !== false &&
      (days === -Number(settings.reminders?.beforeDays ?? 7) ||
        days === 0 ||
        days === Number(settings.reminders?.afterDays ?? 3))
    ) {
      const key = `reminder:${i.id}:${date}`;
      if (
        !(await one(
          "SELECT id FROM notifications WHERE institution_id=? AND dedupe_key=?",
          [actor.institutionId, key],
        ))
      ) {
        const parent = await one(
            "SELECT par.* FROM student_parents sp JOIN parents par ON par.id=sp.parent_id WHERE sp.institution_id=? AND sp.student_id=? AND sp.is_primary=1",
            [actor.institutionId, i.student_id],
          ),
          student = await one("SELECT name FROM students WHERE id=?", [
            i.student_id,
          ]);
        if (parent) {
          const channel = settings.reminders?.channel || "SMS",
            recipient = channel === "Email" ? parent.email : parent.mobile;
          if (recipient) {
            let message =
              days > 0
                ? settings.templates.overdue
                : settings.templates.upcoming;
            for (const [k, v] of Object.entries({
              parent: parent.guardian_name,
              student: student!.name,
              amount: money(i.outstanding_paise, true),
              date: i.due_date,
            }))
              message = message.replaceAll("{" + k + "}", v as string);
            await run(
              "INSERT INTO notifications(id,institution_id,academic_year_id,parent_id,student_id,recipient,channel,message,status,dedupe_key,created_at,updated_at,created_by,updated_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
              [
                uuid(),
                actor.institutionId,
                i.academic_year_id,
                parent.id,
                i.student_id,
                recipient,
                channel,
                message,
                "Queued",
                key,
                now(),
                now(),
                actor.userId,
                actor.userId,
              ],
            );
            reminders++;
          }
        }
      }
    }
  }
  const last = installments.at(-1)?.id || cursor,
    more = await one(
      "SELECT ib.id FROM installment_balances ib JOIN academic_years ay ON ay.id=ib.academic_year_id WHERE ib.institution_id=? AND ib.outstanding_paise>0 AND ay.status IN ('Draft','Active') AND ib.id>? LIMIT 1",
      [actor.institutionId, last],
    );
  await run(
    "INSERT INTO platform(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
    [cursorKey, more ? last : ""],
  );
  const scheduled = await queueScheduledReminders(actor);
  reminders += scheduled.queued;
  const notifications = await processNotifications(actor),
    deliverable = await one(
      "SELECT COUNT(*) count FROM notifications n JOIN provider_configs pc ON pc.institution_id=n.institution_id AND pc.provider=n.channel WHERE n.institution_id=? AND n.status='Queued' AND n.attempts<5",
      [actor.institutionId],
    );
  const outbox = await one(
    "SELECT COUNT(*) count FROM notification_outbox WHERE institution_id=? AND state='Queued'",
    [actor.institutionId],
  );
  const documentPending = await one(
    "SELECT COUNT(*) count FROM document_jobs WHERE institution_id=? AND state IN ('Queued','Processing') AND attempts<5",
    [actor.institutionId],
  );
  const hasMore =
    !!more ||
    !!scheduled.hasMore ||
    !!documentPending?.count ||
    !!deliverable?.count ||
    !!outbox?.count;
  await batch([
    insert("job_runs", {
      id: uuid(),
      institution_id: actor.institutionId,
      ...stamps(actor.userId),
      kind: "Financial maintenance",
      run_key: uuid(),
      status: "Completed",
      result: JSON.stringify({ lateFees, reminders, ...notifications }),
    }),
    stmt("DELETE FROM rate_limits WHERE window<?", [
      Math.floor(Date.now() / 60000) - 10,
    ]),
  ]);
  return {
    lateFees,
    reminders,
    ...notifications,
    processed: installments.length,
    scanHasMore: !!more || !!scheduled.hasMore,
    hasMore,
  };
}

// A durable outbox row is committed with the payment. Delivery is recoverable
// by the existing scheduler even if this request's background task is interrupted.
export function scheduleNotifications(actor: Actor) {
  scheduleCommunications(actor.institutionId);
}
export async function flushNotifications(actor: Actor) {
  await expandPaymentNotifications(actor);
  return deliverNotifications(actor);
}
async function expandPaymentNotifications(actor: Actor) {
  const rows = await all(
    "SELECT o.id,p.id payment_id,p.student_id,p.academic_year_id,p.amount_paise,p.paid_at,r.number,r.id receipt_id FROM notification_outbox o JOIN payments p ON p.id=o.payment_id AND p.institution_id=o.institution_id JOIN receipts r ON r.payment_id=p.id WHERE o.institution_id=? AND o.state='Queued' AND o.available_at<=? ORDER BY o.created_at LIMIT 5",
    [actor.institutionId, now()],
  );
  const institution = await one(
    "SELECT name,settings FROM institutions WHERE id=?",
    [actor.institutionId],
  );
  const settings = JSON.parse(institution?.settings || "{}");
  for (const row of rows) {
    await run(
      "INSERT OR IGNORE INTO document_jobs(id,institution_id,receipt_id,state,attempts,created_at,updated_at) VALUES(?,?,?,'Queued',0,?,?)",
      [
        "pdf:" + row.receipt_id,
        actor.institutionId,
        row.receipt_id,
        now(),
        now(),
      ],
    );
    const contact = await one(
      "SELECT p.* FROM parents p JOIN student_parents sp ON sp.parent_id=p.id AND sp.institution_id=p.institution_id WHERE sp.institution_id=? AND sp.student_id=? AND sp.is_primary=1",
      [actor.institutionId, row.student_id],
    );
    const statements = [];
    if (settings.receiptNotifications?.enabled && contact) {
      const channel = settings.receiptNotifications.channel || "Email",
        recipient = channel === "Email" ? contact.email : contact.mobile;
      if (recipient) {
        let receiptMessage = `Payment of ${money(row.amount_paise, true)} received. Receipt ${row.number}. Your receipt is attached.`,
          receiptMetadata: Record<string, unknown> = {
            receiptId: row.receipt_id,
          };
        if (channel === "SMS") {
          const config = await communicationConfig(actor),
            t = config.templates.receipt,
            student = await own(actor, "students", row.student_id);
          if (config.enabled && t && contact.sms_consent) {
            const variables = {
              student: student.name,
              amount: money(row.amount_paise, true),
              date: String(row.paid_at).slice(0, 10),
              institution: institution!.name,
              receipt: row.number,
            };
            receiptMessage = t.body;
            for (const [k, v] of Object.entries(variables))
              receiptMessage = receiptMessage.replaceAll(
                "{" + k + "}",
                String(v).replace(/[\r\n]/g, " "),
              );
            receiptMetadata = {
              ...receiptMetadata,
              dlt: {
                entityId: config.entityId,
                senderId: config.senderId,
                templateId: t.id,
              },
              variables,
            };
          }
        }
        const grant =
          channel === "WhatsApp"
            ? await issueParentGrant(
                actor,
                contact.id,
                7,
                "Receipt notification",
              )
            : null;
        statements.push(
          stmt(
            "INSERT OR IGNORE INTO notifications(id,institution_id,academic_year_id,student_id,parent_id,recipient,channel,message,status,metadata,created_at,updated_at,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            [
              "receipt:" + row.payment_id,
              actor.institutionId,
              row.academic_year_id,
              row.student_id,
              contact.id,
              recipient,
              channel,
              grant
                ? `Payment of ${money(row.amount_paise, true)} received. Receipt ${row.number}. Download: ${grant.url}`
                : receiptMessage,
              "Queued",
              JSON.stringify(receiptMetadata),
              now(),
              now(),
              actor.userId,
              actor.userId,
            ],
          ),
        );
      }
    }
    statements.push(
      stmt(
        "UPDATE notification_outbox SET state='Completed',updated_at=? WHERE institution_id=? AND id=? AND state='Queued'",
        [now(), actor.institutionId, row.id],
      ),
    );
    await batch(statements);
  }
}
```


### `server/routes/webhooks.ts`

```typescript
import { z } from "zod";
import { money } from "../../lib/money";
import { scheduleCommunications, serviceActor } from "../communications";
import { all, batch, insert, now, one, stamps, uuid } from "../db";
import { issueParentGrant } from "../parent-portal";
import { readProvider } from "../providers";
import { ApiError, constantEqual, hmac, rateLimit, sha256 } from "../security";
import { withTenantContext } from "../tenant-context";
import { ok } from "./shared";

const messageSchema = z.object({
  id: z.string().max(200),
  from: z.string().max(40),
  timestamp: z.string().regex(/^\d+$/),
  type: z.string(),
  text: z.object({ body: z.string().max(2000) }).optional(),
});
const webhookSchema = z.object({
  object: z.literal("whatsapp_business_account"),
  entry: z
    .array(
      z.object({
        changes: z
          .array(
            z.object({
              value: z.object({
                metadata: z.object({ phone_number_id: z.string() }),
                messages: z.array(messageSchema).max(20).optional(),
              }),
            }),
          )
          .max(20),
      }),
    )
    .max(20),
});
export function indianMobile(value: string) {
  const digits = value.replace(/\D/g, "");
  return /^(?:91)?[6-9]\d{9}$/.test(digits) ? digits.slice(-10) : null;
}
export async function messagingWebhook(
  request: Request,
  path: string[],
  requestId: string,
) {
  if (path[0] !== "webhooks" || path[1] !== "whatsapp") return null;
  const institutionId = path[2] || "";
  const institution = await one(
    "SELECT id,name FROM institutions WHERE id=? AND status='Active'",
    [institutionId],
  );
  const provider = institution
    ? await readProvider(institutionId, "WhatsApp")
    : null;
  if (!provider?.appSecret || !provider.verifyToken || !provider.phoneNumberId)
    throw new ApiError(404, "NOT_CONFIGURED", "Webhook is not configured.");
  if (request.method === "GET") {
    const p = new URL(request.url).searchParams;
    if (
      p.get("hub.mode") !== "subscribe" ||
      !constantEqual(p.get("hub.verify_token") || "", provider.verifyToken)
    )
      throw new ApiError(403, "INVALID_VERIFICATION", "Verification failed.");
    return new Response((p.get("hub.challenge") || "").slice(0, 200), {
      headers: { "Content-Type": "text/plain" },
    });
  }
  if (request.method !== "POST")
    throw new ApiError(405, "METHOD_NOT_ALLOWED", "Use POST.");
  const raw = await request.text();
  if (raw.length > 128000)
    throw new ApiError(413, "PAYLOAD_TOO_LARGE", "Webhook is too large.");
  if (
    !constantEqual(
      "sha256=" + (await hmac(provider.appSecret, raw)),
      request.headers.get("x-hub-signature-256") || "",
    )
  )
    throw new ApiError(
      401,
      "INVALID_SIGNATURE",
      "Webhook signature is invalid.",
    );
  await rateLimit(request, "whatsapp:" + institutionId, 120);
  const event = webhookSchema.parse(JSON.parse(raw)),
    actor = serviceActor(institutionId);
  return withTenantContext(actor, async () => {
    for (const entry of event.entry)
      for (const change of entry.changes) {
        if (change.value.metadata.phone_number_id !== provider.phoneNumberId)
          throw new ApiError(
            403,
            "TENANT_MISMATCH",
            "Business phone number does not belong to this institution.",
          );
        for (const message of change.value.messages || []) {
          if (
            message.type !== "text" ||
            !message.text ||
            Date.now() / 1000 - Number(message.timestamp) > 86400 ||
            Number(message.timestamp) > Date.now() / 1000 + 60
          )
            continue;
          const existing = await one<{ payload_hash: string }>(
              "SELECT payload_hash FROM webhook_inbox WHERE institution_id=? AND provider='WhatsApp' AND event_id=?",
              [institutionId, message.id],
            ),
            hash = await sha256(JSON.stringify(message));
          if (existing) {
            if (existing.payload_hash !== hash)
              throw new ApiError(
                409,
                "EVENT_CONFLICT",
                "Event content changed.",
              );
            continue;
          }
          const phone = indianMobile(message.from);
          // Admission numbers are identifiers, never authentication. A signed
          // inbound sender must match an existing guardian's verified phone.
          const parents = phone
            ? await all<{ id: string }>(
                "SELECT id FROM parents WHERE institution_id=? AND (replace(replace(replace(mobile,'+',''),' ',''),'-','')=? OR replace(replace(replace(mobile,'+',''),' ',''),'-','')=?) LIMIT 2",
                [institutionId, phone, "91" + phone],
              )
            : [];
          const parent = parents.length === 1 ? parents[0] : null,
            text = message.text.body.trim(),
            isFees = text.toUpperCase() === "FEES";
          const children = parent
            ? await all<{
                id: string;
                name: string;
                admission_number: string;
                academic_year_id: string;
                outstanding_paise: number;
              }>(
                `SELECT s.id,s.name,s.admission_number,e.academic_year_id,COALESCE(b.outstanding_paise,0) outstanding_paise FROM student_parents sp JOIN students s ON s.id=sp.student_id AND s.institution_id=sp.institution_id JOIN enrollments e ON e.student_id=s.id AND e.institution_id=s.institution_id JOIN academic_years y ON y.id=e.academic_year_id AND y.institution_id=e.institution_id AND y.status='Active' LEFT JOIN student_balances b ON b.student_id=s.id AND b.institution_id=s.institution_id AND b.academic_year_id=e.academic_year_id WHERE sp.institution_id=? AND sp.parent_id=? ${isFees ? "" : "AND lower(s.admission_number)=lower(?)"} ORDER BY s.name LIMIT 10`,
                [institutionId, parent.id, ...(isFees ? [] : [text])],
              )
            : [];
          let reply =
            "Please contact the institution accounts office to verify your guardian contact details.";
          if (parent && children.length) {
            const grant = await issueParentGrant(
              actor,
              parent.id,
              1,
              "Guardian-initiated WhatsApp enquiry",
            );
            reply =
              children
                .map(
                  (s) =>
                    `${s.name} (${s.admission_number}): ${money(s.outstanding_paise)} outstanding`,
                )
                .join("\n") +
              "\nFees and receipts: " +
              grant.url;
            const s = children[0];
            if (s.outstanding_paise > 0)
              reply +=
                "\nUPI QR: " +
                new URL(grant.url).origin +
                "/api/parent-access/" +
                grant.token +
                "/upi?" +
                new URLSearchParams({
                  student: s.id,
                  year: s.academic_year_id,
                });
          }
          await batch([
            insert("webhook_inbox", {
              id: uuid(),
              institution_id: institutionId,
              provider: "WhatsApp",
              event_id: message.id,
              payload_hash: hash,
              created_at: now(),
            }),
            insert("notifications", {
              id: uuid(),
              institution_id: institutionId,
              parent_id: parent?.id || null,
              recipient: message.from,
              channel: "WhatsApp",
              message: reply,
              status: "Queued",
              dedupe_key: "wa-reply:" + message.id,
              metadata: JSON.stringify({
                sessionExpiresAt: new Date(
                  Number(message.timestamp) * 1000 + 86400000,
                ).toISOString(),
              }),
              ...stamps(actor.userId),
            }),
          ]);
        }
      }
    scheduleCommunications(institutionId);
    return ok({ received: true }, requestId);
  });
}
```


### `server/providers.ts`

```typescript
import { env } from "cloudflare:workers";
import { batch, now, one, stmt, uuid } from "./db";
import { Actor, ApiError, audit, permit } from "./security";
const encode = (a: Uint8Array) => btoa(String.fromCharCode(...a));
const decode = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
async function encryptionKey() {
  const key = env.PROVIDER_ENCRYPTION_KEY;
  if (!key || !/^[0-9a-f]{64}$/.test(key))
    throw new ApiError(
      503,
      "ENCRYPTION_NOT_CONFIGURED",
      "Provider credential encryption is not configured.",
    );
  return crypto.subtle.importKey(
    "raw",
    Uint8Array.from(key.match(/../g)!, (x) => parseInt(x, 16)),
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
}
export async function readProvider(
  institutionId: string,
  provider: string,
): Promise<Record<string, string> | null> {
  const record = await one(
    "SELECT ciphertext FROM provider_configs WHERE institution_id=? AND provider=?",
    [institutionId, provider],
  );
  if (!record) return null;
  const [nonce, cipher] = record.ciphertext.split(".");
  const decrypted = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: decode(nonce),
      additionalData: new TextEncoder().encode(`${institutionId}:${provider}`),
    },
    await encryptionKey(),
    decode(cipher),
  );
  return JSON.parse(new TextDecoder().decode(decrypted));
}
export async function saveProvider(
  actor: Actor,
  provider: string,
  config: Record<string, string>,
  mode: string,
) {
  permit(actor, "admin");
  if (
    !config ||
    typeof config !== "object" ||
    Array.isArray(config) ||
    Object.values(config).some(
      (v) => typeof v !== "string" || v.length > 4096,
    ) ||
    JSON.stringify(config).length > 16000
  )
    throw new ApiError(
      422,
      "INVALID_CONFIG",
      "Enter valid provider configuration.",
    );
  if (!["test", "sandbox", "production"].includes(mode))
    throw new ApiError(
      422,
      "INVALID_MODE",
      "Select a valid provider environment.",
    );
  if (
    !["Razorpay", "Cashfree", "SMS", "WhatsApp", "Email"].includes(provider) &&
    !/^RFID:[a-f0-9-]{36}$/.test(provider)
  )
    throw new ApiError(422, "INVALID_PROVIDER", "Select a supported provider.");
  if (
    ["Razorpay", "Cashfree"].includes(provider) &&
    (!config.keyId || !config.keySecret)
  )
    throw new ApiError(
      422,
      "KEY_REQUIRED",
      "Enter the provider key ID and secret.",
    );
  if (["SMS", "WhatsApp", "Email"].includes(provider)) {
    try {
      const url = new URL(config.url);
      if (
        url.protocol !== "https:" ||
        /^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[)/.test(
          url.hostname,
        ) ||
        url.username ||
        url.password
      )
        throw new Error();
    } catch {
      throw new ApiError(
        422,
        "INVALID_PROVIDER_URL",
        "Enter a public HTTPS notification provider endpoint.",
      );
    }
  }
  if (provider === "WhatsApp" && config.adapter === "Meta") {
    const url = new URL(config.url);
    if (
      url.hostname !== "graph.facebook.com" ||
      !/^\/v\d+\.\d+\/\d+\/messages$/.test(url.pathname) ||
      !config.phoneNumberId ||
      !url.pathname.endsWith("/" + config.phoneNumberId + "/messages") ||
      !config.appSecret ||
      !config.verifyToken
    )
      throw new ApiError(
        422,
        "INVALID_META_CONFIG",
        "Enter the Meta messages endpoint, phone number ID, app secret and webhook verification token.",
      );
  }
  const iv = crypto.getRandomValues(new Uint8Array(12)),
    cipher = await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv,
        additionalData: new TextEncoder().encode(
          `${actor.institutionId}:${provider}`,
        ),
      },
      await encryptionKey(),
      new TextEncoder().encode(JSON.stringify(config)),
    ),
    ciphertext = encode(iv) + "." + encode(new Uint8Array(cipher));
  await batch([
    stmt(
      "INSERT INTO provider_configs(id,institution_id,provider,ciphertext,mode,created_at,updated_at,created_by,updated_by) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(institution_id,provider) DO UPDATE SET ciphertext=excluded.ciphertext,mode=excluded.mode,updated_at=excluded.updated_at,updated_by=excluded.updated_by",
      [
        uuid(),
        actor.institutionId,
        provider,
        ciphertext,
        mode,
        now(),
        now(),
        actor.userId,
        actor.userId,
      ],
    ),
    audit(
      actor,
      "Updated provider credentials",
      "provider_configs",
      provider,
      null,
      { provider, mode, configured: true },
    ),
  ]);
  return { provider, configured: true };
}
export async function providerStatus(institutionId: string) {
  return await import("./db").then((m) =>
    m.all(
      "SELECT provider,mode,updated_at FROM provider_configs WHERE institution_id=?",
      [institutionId],
    ),
  );
}
```


### `features/auth/CommunicationSettings.tsx`

```tsx
"use client";
import { useEffect, useState } from "react";
import { useApp, useResource } from "@/components/campus/context";
import { Button, Card, Field, Input, Picker } from "@/components/campus/ui";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
type Configuration = {
  enabled: boolean;
  entityId: string;
  senderId: string;
  templates: Record<string, { id: string; body: string }>;
};
export function CommunicationSettings() {
  const { request, refresh } = useApp(),
    r = useResource<Configuration>("communications"),
    [d, setD] = useState<Configuration>({
      enabled: false,
      entityId: "",
      senderId: "",
      templates: {},
    }),
    [stage, setStage] = useState("before7"),
    [busy, setBusy] = useState(false),
    [q, setQ] = useState(""),
    [parent, setParent] = useState(""),
    [consent, setConsent] = useState(false),
    [reason, setReason] = useState(""),
    contacts = useResource("parents?size=25&q=" + encodeURIComponent(q));
  useEffect(() => {
    if (r.data) setD(r.data);
  }, [r.data]);
  const change = (key: "id" | "body", value: string) =>
    setD({
      ...d,
      templates: {
        ...d.templates,
        [stage]: {
          id: d.templates[stage]?.id || "",
          body: d.templates[stage]?.body || "",
          [key]: value,
        },
      },
    });
  return (
    <div className="space-y-6">
      <Card title="Registered SMS reminders">
        <div className="mb-5 flex items-center justify-between">
          <label htmlFor="reminders-enabled">Enable automatic reminders</label>
          <Switch
            id="reminders-enabled"
            checked={d.enabled}
            onCheckedChange={(v) => setD({ ...d, enabled: v })}
          />
        </div>
        <div className="settings-fields">
          <Field label="DLT principal entity ID">
            <Input
              value={d.entityId}
              onChange={(e) => setD({ ...d, entityId: e.target.value })}
            />
          </Field>
          <Field label="Registered sender / header">
            <Input
              value={d.senderId}
              onChange={(e) => setD({ ...d, senderId: e.target.value })}
            />
          </Field>
          <Field label="Reminder stage">
            <Picker
              value={stage}
              onChange={setStage}
              options={[
                { value: "before7", label: "7 days before" },
                { value: "before3", label: "3 days before" },
                { value: "before1", label: "1 day before" },
                { value: "due", label: "Due date" },
                { value: "after1", label: "1 day overdue" },
                { value: "after3", label: "3 days overdue" },
                { value: "after7", label: "7 days overdue" },
                { value: "receipt", label: "Payment receipt" },
              ]}
            />
          </Field>
          <Field label="Registered template ID">
            <Input
              value={d.templates[stage]?.id || ""}
              onChange={(e) => change("id", e.target.value)}
            />
          </Field>
          <Field label="Exact registered template text">
            <Textarea
              value={d.templates[stage]?.body || ""}
              onChange={(e) => change("body", e.target.value)}
              placeholder="Use {student}, {amount}, {date}, {institution}, {receipt} in the approved variable positions."
            />
          </Field>
        </div>
        <p className="my-4 text-sm text-slate-500">
          Use IDs and text approved by your DLT operator. Delivery also requires
          an SMS provider and recorded guardian consent. The system does not
          register templates with the operator.
        </p>
        <Button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await request("communications", { method: "POST", body: d });
              refresh();
              toast.success("Reminder settings saved.");
            } catch (e) {
              toast.error((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Save communication rules
        </Button>
        {r.error && <p role="alert">{r.error}</p>}
      </Card>
      <Card title="Guardian SMS consent">
        <div className="settings-fields">
          <Field label="Find guardian">
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Name or mobile"
            />
          </Field>
          <Field label="Guardian">
            <Picker
              value={parent}
              onChange={(v) => {
                setParent(v);
                setConsent(
                  !!contacts.data?.rows.find(
                    (p: { id: string; sms_consent: number }) => p.id === v,
                  )?.sms_consent,
                );
              }}
              options={[
                { value: "", label: "Choose guardian" },
                ...(contacts.data?.rows || []).map(
                  (p: {
                    id: string;
                    guardian_name: string;
                    mobile: string;
                  }) => ({
                    value: p.id,
                    label: p.guardian_name + " · " + p.mobile,
                  }),
                ),
              ]}
            />
          </Field>
          <div className="flex items-center gap-3">
            <Switch checked={consent} onCheckedChange={setConsent} />
            <span>SMS consent recorded</span>
          </div>
          <Field label="Consent evidence / withdrawal reason">
            <Input value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
        </div>
        <Button
          className="mt-4"
          disabled={!parent || reason.length < 5}
          onClick={async () => {
            try {
              await request("communications/consent", {
                method: "POST",
                body: { parentId: parent, consent, reason },
              });
              refresh();
              toast.success("Consent record updated.");
            } catch (e) {
              toast.error((e as Error).message);
            }
          }}
        >
          Record consent
        </Button>
      </Card>
    </div>
  );
}
```


### `features/auth/Settings.tsx`

```tsx
"use client";
import { Row, useApp, useResource } from "@/components/campus/context";
import {
  Button,
  Card,
  Field,
  FormDialog,
  Input,
  PageHead,
  Picker,
  Status,
} from "@/components/campus/ui";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  CheckCircle2,
  ExternalLink,
  KeyRound,
  MessageSquare,
  Save,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CommunicationSettings } from "./CommunicationSettings";
import { HardwareSettings } from "./HardwareSettings";
import { AccountingSettings } from "./AccountingSettings";
export function Settings() {
  const { boot, request, reload, refresh, t } = useApp("settings.manage"),
    r = useResource("providers"),
    [d, setD] = useState<Row>({
      ...boot.institution,
      settings: structuredClone(boot.institution.settings),
    }),
    [busy, setBusy] = useState(false),
    [provider, setProvider] = useState(""),
    [config, setConfig] = useState<Row>({
      keyId: "",
      keySecret: "",
      webhookSecret: "",
      url: "",
      token: "",
      mode: "sandbox",
    });
  useEffect(
    () =>
      setD({
        ...boot.institution,
        settings: structuredClone(boot.institution.settings),
      }),
    [boot.institution],
  );
  const field = (key: string) => (
    <Input
      value={d[key] || ""}
      onChange={(e) => setD({ ...d, [key]: e.target.value })}
    />
  );
  const settings = (section: string, key: string, value: any) =>
    setD({
      ...d,
      settings: {
        ...d.settings,
        [section]: { ...d.settings[section], [key]: value },
      },
    });
  const save = async () => {
    setBusy(true);
    try {
      await request("settings", {
        method: "PATCH",
        body: {
          name: d.name,
          address: d.address,
          email: d.email,
          phone: d.phone,
          gstin: d.gstin || undefined,
          settings: d.settings,
        },
      });
      toast.success("Institution settings saved.");
      await reload();
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <PageHead
        eyebrow="ADMINISTRATION / SETTINGS"
        title={t("Settings")}
        description={t("SettingsIntro")}
        actions={
          <Button disabled={busy} onClick={save}>
            <Save size={16} />
            {busy ? "Saving..." : "Save changes"}
          </Button>
        }
      />
      <Tabs defaultValue="institution">
        <TabsList className="page-tabs">
          <TabsTrigger value="institution">Institution</TabsTrigger>
          <TabsTrigger value="fees">Fee policies</TabsTrigger>
          <TabsTrigger value="gateway">Payment gateways</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="communication-rules">Reminders</TabsTrigger>
          <TabsTrigger value="hardware">RFID & daily fees</TabsTrigger>
          <TabsTrigger value="accounting">Tally mapping</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
        </TabsList>
        <TabsContent value="communication-rules">
          <CommunicationSettings />
        </TabsContent>
        <TabsContent value="hardware">
          <HardwareSettings />
        </TabsContent>
        <TabsContent value="accounting">
          <AccountingSettings />
        </TabsContent>
        <TabsContent value="institution">
          <Card title="Institution details">
            <div className="settings-form form-grid">
              <Field label="Institution name" className="span-2">
                {field("name")}
              </Field>
              <Field label="Email">{field("email")}</Field>
              <Field label="Phone">{field("phone")}</Field>
              <Field label="Address" className="span-2">
                {field("address")}
              </Field>
              <Field label="GSTIN (if applicable)">{field("gstin")}</Field>
              <Field label="Interface language">
                <Picker
                  value={d.settings.language || "en"}
                  onChange={(v) =>
                    setD({ ...d, settings: { ...d.settings, language: v } })
                  }
                  options={[
                    { value: "en", label: "English" },
                    { value: "kn", label: "ಕನ್ನಡ (navigation preview)" },
                    { value: "hi", label: "हिन्दी (navigation preview)" },
                  ]}
                />
              </Field>
              <Field
                label="Institution UPI ID"
                hint="Printed as a QR code on unpaid invoices."
              >
                <Input
                  placeholder="school@bank"
                  value={d.settings.upi?.payeeId || ""}
                  onChange={(e) =>
                    setD({
                      ...d,
                      settings: {
                        ...d.settings,
                        upi: {
                          payeeName: d.settings.upi?.payeeName || d.name,
                          payeeId: e.target.value,
                        },
                      },
                    })
                  }
                />
              </Field>
              <Field label="UPI payee name">
                <Input
                  value={d.settings.upi?.payeeName || d.name}
                  onChange={(e) =>
                    setD({
                      ...d,
                      settings: {
                        ...d.settings,
                        upi: {
                          payeeId: d.settings.upi?.payeeId || "",
                          payeeName: e.target.value,
                        },
                      },
                    })
                  }
                />
              </Field>
              <Field label="Receipt numbering">
                <Input readOnly value="REC / Academic year / Sequence" />
              </Field>
              <Field label="Invoice numbering">
                <Input readOnly value="INV / Academic year / Sequence" />
              </Field>
            </div>
          </Card>
        </TabsContent>
        <TabsContent value="fees">
          <Card title="Late fee policy">
            <div className="settings-form">
              <div className="setting-toggle">
                <div>
                  <strong>Automatic late fees</strong>
                  <p>
                    Post calculated charges as new, permanent ledger entries.
                  </p>
                </div>
                <Switch
                  checked={d.settings.lateFee.enabled}
                  onCheckedChange={(v) => settings("lateFee", "enabled", v)}
                />
              </div>
              <div className="form-grid">
                <Field label="Calculation">
                  <Picker
                    value={d.settings.lateFee.mode}
                    onChange={(v) => settings("lateFee", "mode", v)}
                    options={["Fixed", "Daily", "Percentage"].map((v) => ({
                      value: v,
                      label:
                        v === "Percentage"
                          ? "Percentage per month"
                          : v === "Daily"
                            ? "Per overdue day"
                            : "Fixed after due date",
                    }))}
                  />
                </Field>
                <Field
                  label={
                    d.settings.lateFee.mode === "Percentage"
                      ? "Rate (%)"
                      : "Charge (₹)"
                  }
                >
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={d.settings.lateFee.value / 100}
                    onChange={(e) =>
                      settings(
                        "lateFee",
                        "value",
                        Math.round(Number(e.target.value) * 100),
                      )
                    }
                  />
                </Field>
                <Field label="Grace period (days)">
                  <Input
                    type="number"
                    min="0"
                    value={d.settings.lateFee.graceDays}
                    onChange={(e) =>
                      settings("lateFee", "graceDays", Number(e.target.value))
                    }
                  />
                </Field>
                <Field label="Maximum per installment (₹)">
                  <Input
                    type="number"
                    min="0"
                    value={d.settings.lateFee.maxPaise / 100}
                    onChange={(e) =>
                      settings(
                        "lateFee",
                        "maxPaise",
                        Math.round(Number(e.target.value) * 100),
                      )
                    }
                  />
                </Field>
              </div>
              <p className="form-note">
                Saved policies apply to future job runs. Posted charges are
                retained in the audit history.
              </p>
              <Button
                variant="outline"
                onClick={async () => {
                  try {
                    const result = await request("jobs", {
                      method: "POST",
                      body: {},
                    });
                    toast.success(
                      `${result.lateFees} late fees posted, ${result.reminders} reminders queued.`,
                    );
                    refresh();
                  } catch (e) {
                    toast.error((e as Error).message);
                  }
                }}
              >
                Run financial jobs now
              </Button>
            </div>
          </Card>
        </TabsContent>
        <TabsContent value="gateway">
          <div className="provider-grid">
            {["Razorpay", "Cashfree"].map((name) => {
              const connected = r.data?.providers.find(
                (p: Row) => p.provider === name,
              );
              return (
                <Card key={name} className="provider-card">
                  <span className="provider-logo">
                    {name === "Razorpay" ? "R" : "C"}
                  </span>
                  <h2>{name}</h2>
                  <p>
                    Server-created orders, captured-payment verification and
                    duplicate protection.
                  </p>
                  <Status value={connected ? "Active" : "Not connected"} />
                  <div className="provider-card-footer">
                    <span>{connected?.mode || "Credentials required"}</span>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setProvider(name);
                        setConfig({
                          keyId: "",
                          keySecret: "",
                          webhookSecret: "",
                          url: "",
                          token: "",
                          mode: "sandbox",
                        });
                      }}
                    >
                      <KeyRound size={15} />
                      {connected ? "Update connection" : "Connect gateway"}
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
          <Card title="Payment preferences">
            <div className="settings-form">
              <Field label="Default payment gateway">
                <Picker
                  value={d.settings.gateway}
                  onChange={(v) =>
                    setD({ ...d, settings: { ...d.settings, gateway: v } })
                  }
                  options={["Razorpay", "Cashfree"].map((v) => ({
                    value: v,
                    label: v,
                  }))}
                />
              </Field>
              <p className="form-note">
                Staff can collect online payments after a provider is connected.
                External webhooks require a callback URL that the provider can
                reach.
              </p>
              <div className="webhook-path">
                <code>/api/payments/webhook</code>
                <span>Razorpay payment.captured</span>
              </div>
            </div>
          </Card>
        </TabsContent>
        <TabsContent value="notifications">
          <Card title="Payment receipt notifications">
            <div className="settings-form">
              <div className="setting-toggle">
                <div>
                  <strong>Send payment acknowledgements</strong>
                  <p>
                    Queue an acknowledgement after a verified payment. Configure
                    a provider below.
                  </p>
                </div>
                <Switch
                  checked={d.settings.receiptNotifications?.enabled || false}
                  onCheckedChange={(v) =>
                    setD({
                      ...d,
                      settings: {
                        ...d.settings,
                        receiptNotifications: {
                          channel:
                            d.settings.receiptNotifications?.channel || "Email",
                          enabled: v,
                        },
                      },
                    })
                  }
                />
              </div>
              <Field label="Receipt channel">
                <Picker
                  value={d.settings.receiptNotifications?.channel || "Email"}
                  onChange={(v) =>
                    setD({
                      ...d,
                      settings: {
                        ...d.settings,
                        receiptNotifications: {
                          enabled:
                            d.settings.receiptNotifications?.enabled || false,
                          channel: v,
                        },
                      },
                    })
                  }
                  options={["Email", "SMS", "WhatsApp"].map((value) => ({
                    value,
                    label: value,
                  }))}
                />
              </Field>
            </div>
          </Card>
          <Card title="Reminder schedule">
            <div className="settings-form form-grid">
              <Field label="Days before due date">
                <Input
                  type="number"
                  value={d.settings.reminders.beforeDays}
                  onChange={(e) =>
                    settings("reminders", "beforeDays", Number(e.target.value))
                  }
                />
              </Field>
              <Field label="Days after due date">
                <Input
                  type="number"
                  value={d.settings.reminders.afterDays}
                  onChange={(e) =>
                    settings("reminders", "afterDays", Number(e.target.value))
                  }
                />
              </Field>
              <Field label="Default channel">
                <Picker
                  value={d.settings.reminders.channel}
                  onChange={(v) => settings("reminders", "channel", v)}
                  options={["SMS", "WhatsApp", "Email"].map((v) => ({
                    value: v,
                    label: v,
                  }))}
                />
              </Field>
              <Field label="Upcoming fee template" className="span-2">
                <Textarea
                  value={d.settings.templates.upcoming}
                  onChange={(e) =>
                    settings("templates", "upcoming", e.target.value)
                  }
                  rows={3}
                />
              </Field>
              <Field label="Overdue fee template" className="span-2">
                <Textarea
                  value={d.settings.templates.overdue}
                  onChange={(e) =>
                    settings("templates", "overdue", e.target.value)
                  }
                  rows={3}
                />
              </Field>
              <p className="form-note span-2">
                Available variables: {"{parent}, {student}, {amount}, {date}"}
              </p>
            </div>
          </Card>
          <Card title="Delivery providers">
            <div className="notification-providers">
              {["SMS", "WhatsApp", "Email"].map((name) => {
                const connected = r.data?.providers.find(
                  (p: Row) => p.provider === name,
                );
                return (
                  <div key={name}>
                    <span className="notification-provider-icon">
                      <MessageSquare size={20} />
                    </span>
                    <div>
                      <strong>{name}</strong>
                      <small>
                        {connected
                          ? "Connected provider endpoint"
                          : "Connect a delivery provider"}
                      </small>
                    </div>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setProvider(name);
                        setConfig({ url: "", token: "", mode: "production" });
                      }}
                    >
                      {connected ? "Update" : "Connect"}
                    </Button>
                  </div>
                );
              })}
            </div>
            <p className="provider-help">
              Adapters accept HTTPS endpoints with bearer authentication. The
              delivery service receives the recipient, message and a stable
              idempotency key.
            </p>
          </Card>
        </TabsContent>
        <TabsContent value="security">
          <Card title="Security controls">
            <div className="security-controls">
              {[
                ["Sign-in", "Dispatch-owned authenticated sessions"],
                [
                  "Access control",
                  "Institution membership and server-enforced roles",
                ],
                [
                  "Financial integrity",
                  "Immutable ledger entries and transactional payment posting",
                ],
                [
                  "Duplicate protection",
                  "Idempotency keys, unique provider transactions and signed events",
                ],
                [
                  "Provider credentials",
                  "AES-256-GCM encryption with tenant-bound associated data",
                ],
                ["Aadhaar", "Only the last four digits are retained"],
                [
                  "Audit trail",
                  "Append-only financial and configuration history",
                ],
              ].map(([label, info]) => (
                <div key={label}>
                  <ShieldCheck size={20} />
                  <span>
                    <strong>{label}</strong>
                    <small>{info}</small>
                  </span>
                  <CheckCircle2 size={17} />
                </div>
              ))}
            </div>
            <a
              href="/api/openapi"
              className="api-docs-link"
              target="_blank"
              rel="noreferrer"
            >
              View OpenAPI specification <ExternalLink size={14} />
            </a>
          </Card>
        </TabsContent>
      </Tabs>
      <FormDialog
        open={!!provider}
        onClose={() => {
          setProvider("");
          setConfig({});
        }}
        title={"Connect " + provider}
        description="Credentials are encrypted on the server and never returned to the browser."
        busy={busy}
        submitLabel="Save connection"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await request("providers", {
              method: "POST",
              body: { provider, config, mode: config.mode || "production" },
            });
            toast.success("Provider connection saved.");
            setProvider("");
            setConfig({});
            refresh();
            await reload();
          } catch (e) {
            toast.error((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {["Razorpay", "Cashfree"].includes(provider) ? (
          <>
            <Field label={provider === "Cashfree" ? "App ID" : "Key ID"}>
              <Input
                value={config.keyId || ""}
                required
                onChange={(e) =>
                  setConfig({ ...config, keyId: e.target.value })
                }
                autoComplete="off"
              />
            </Field>
            <Field label="Key secret">
              <Input
                type="password"
                value={config.keySecret || ""}
                required
                onChange={(e) =>
                  setConfig({ ...config, keySecret: e.target.value })
                }
                autoComplete="new-password"
              />
            </Field>
            {provider === "Razorpay" && (
              <Field label="Webhook secret">
                <Input
                  type="password"
                  value={config.webhookSecret || ""}
                  onChange={(e) =>
                    setConfig({ ...config, webhookSecret: e.target.value })
                  }
                  autoComplete="new-password"
                />
              </Field>
            )}
            <Field label="Environment">
              <Picker
                value={config.mode || "sandbox"}
                onChange={(v) => setConfig({ ...config, mode: v })}
                options={[
                  { value: "sandbox", label: "Test / sandbox" },
                  { value: "production", label: "Live / production" },
                ]}
              />
            </Field>
          </>
        ) : (
          <>
            {provider === "WhatsApp" && (
              <>
                <Field label="WhatsApp adapter">
                  <Picker
                    value={config.adapter || "Webhook"}
                    onChange={(v) => setConfig({ ...config, adapter: v })}
                    options={[
                      { value: "Webhook", label: "Existing HTTPS adapter" },
                      { value: "Meta", label: "Meta WhatsApp Cloud API" },
                    ]}
                  />
                </Field>
                <Field label="Meta app secret (inbound signature)">
                  <Input
                    type="password"
                    value={config.appSecret || ""}
                    onChange={(e) =>
                      setConfig({ ...config, appSecret: e.target.value })
                    }
                  />
                </Field>
                <Field label="Webhook verification token">
                  <Input
                    type="password"
                    value={config.verifyToken || ""}
                    onChange={(e) =>
                      setConfig({ ...config, verifyToken: e.target.value })
                    }
                  />
                </Field>
                <Field label="Business phone number ID">
                  <Input
                    value={config.phoneNumberId || ""}
                    onChange={(e) =>
                      setConfig({ ...config, phoneNumberId: e.target.value })
                    }
                  />
                </Field>
                {config.adapter === "Meta" && (
                  <>
                    <Field label="Approved receipt template name">
                      <Input
                        value={config.receiptTemplateName || ""}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            receiptTemplateName: e.target.value,
                          })
                        }
                      />
                    </Field>
                    <Field label="Approved reminder template name">
                      <Input
                        value={config.reminderTemplateName || ""}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            reminderTemplateName: e.target.value,
                          })
                        }
                      />
                    </Field>
                    <Field label="Template language code">
                      <Input
                        value={config.templateLanguage || "en"}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            templateLanguage: e.target.value,
                          })
                        }
                      />
                    </Field>
                    <p className="text-sm text-slate-500">
                      The receipt template must have one body text variable
                      containing the receipt acknowledgement and portal link.
                    </p>
                  </>
                )}
                <p className="text-sm break-all">
                  Incoming webhook: /api/webhooks/whatsapp/{boot.institution.id}
                </p>
              </>
            )}
            <Field label="HTTPS provider endpoint">
              <Input
                type="url"
                required
                value={config.url || ""}
                onChange={(e) => setConfig({ ...config, url: e.target.value })}
                placeholder="https://your-provider.example/send"
              />
            </Field>
            <Field label="Bearer token">
              <Input
                type="password"
                required
                value={config.token || ""}
                onChange={(e) =>
                  setConfig({ ...config, token: e.target.value })
                }
              />
            </Field>
          </>
        )}
      </FormDialog>
    </>
  );
}
```


### `infrastructure/communications.wrangler.example.jsonc`

```jsonc
// Merge these entries into the existing Worker configuration only when your
// hosting administrator supports native Cloudflare Queue/Cron provisioning.
// This is NOT a second application and is NOT used by the Sites deployment.
// Create both named queues first. Retain the existing D1/R2 bindings and routes.
{
  "queues": {
    "producers": [
      { "binding": "COMMUNICATION_QUEUE", "queue": "sohan-communications" },
    ],
    "consumers": [
      {
        "queue": "sohan-communications",
        "max_batch_size": 5,
        "max_batch_timeout": 2,
        "max_retries": 5,
        "retry_delay": 300,
        "dead_letter_queue": "sohan-communications-dead-letter",
      },
    ],
  },
  "triggers": { "crons": ["*/15 * * * *"] },
}
```


## Phase 3 — Trust hierarchy, academic rollover and audit


### `server/tenant-context.ts`

```typescript
import { AsyncLocalStorage } from "node:async_hooks";
const context = new AsyncLocalStorage<{
  institutionId?: string;
  organizationId?: string;
  userId: string;
}>();
export function withTenantContext<T>(
  actor: { institutionId: string; userId: string; organizationId?: string },
  next: () => T,
): T {
  if (!actor.institutionId) throw new Error("Tenant context required");
  const existing = context.getStore();
  if (existing && existing.institutionId !== actor.institutionId)
    throw new Error("Tenant context cannot be switched");
  return context.run(
    {
      institutionId: actor.institutionId,
      organizationId: actor.organizationId,
      userId: actor.userId,
    },
    next,
  );
}
export function currentTenant() {
  const value = context.getStore();
  if (!value?.institutionId) throw new Error("Tenant context required");
  return { ...value, institutionId: value.institutionId };
}
// Organization reports are a separate scope, never a wildcard tenant. An
// organization context cannot use getDb() or turn into an institution context.
export function withOrganizationContext<T>(
  actor: { userId: string; organizationId: string },
  next: () => T,
): T {
  if (!actor.organizationId || context.getStore())
    throw new Error("Organization scope cannot replace an active scope");
  return context.run(
    { organizationId: actor.organizationId, userId: actor.userId },
    next,
  );
}
export function currentOrganization() {
  const active = context.getStore();
  if (!active?.organizationId || active.institutionId)
    throw new Error("Organization context required");
  return { organizationId: active.organizationId, userId: active.userId };
}
export function tenantIdFor(actor: { institutionId: string }) {
  const active = context.getStore();
  if (active && active.institutionId !== actor.institutionId)
    throw new Error("Tenant context cannot be switched");
  if (!actor.institutionId) throw new Error("Tenant context required");
  return active?.institutionId || actor.institutionId;
}
```


### `server/organizations.ts`

```typescript
import { z } from "zod";
import { all, batch, insert, now, one, stamps, stmt, uuid } from "./db";
import { Actor, ApiError, authenticate, permit } from "./security";
import { platformAudit } from "./tenancy";
import { currentOrganization, withOrganizationContext } from "./tenant-context";

export async function organizationReport(
  request: Request,
  id: string,
  p: URLSearchParams,
) {
  const user = await authenticate(request);
  const organization = await one<{ id: string; name: string }>(
    "SELECT o.id,o.name FROM organizations o JOIN organization_members m ON m.organization_id=o.id WHERE o.id=? AND o.status='Active' AND m.email=? AND m.active=1",
    [id, user.email],
  );
  if (!organization)
    throw new ApiError(
      403,
      "ORGANIZATION_ACCESS_REQUIRED",
      "An organization administrator must grant access to this group.",
    );
  const dates = z
    .object({
      from: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
      to: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
    })
    .parse({ from: p.get("from") || undefined, to: p.get("to") || undefined });
  return withOrganizationContext(
    { userId: user.userId, organizationId: id },
    async () => {
      const scope = currentOrganization();
      const from = dates.from || "2000-01-01",
        to = dates.to || "2100-12-31";
      if (from > to)
        throw new ApiError(
          422,
          "INVALID_DATE_RANGE",
          "Start date must be before end date.",
        );
      const page = Math.max(1, Math.min(100000, Number(p.get("page")) || 1)),
        limit = 50;
      const rows = await all(
        `SELECT i.id,i.name,i.slug,(SELECT COUNT(*) FROM students s WHERE s.institution_id=i.id AND s.status='Active') students,COALESCE((SELECT SUM(j.amount_paise) FROM journal_events j WHERE j.institution_id=i.id AND j.event_type='PAYMENT_RECEIVED' AND j.entry_date BETWEEN ? AND ?),0) collected_paise,COALESCE((SELECT SUM(j.amount_paise) FROM journal_events j WHERE j.institution_id=i.id AND j.event_type='REVERSAL_ISSUED' AND j.entry_date BETWEEN ? AND ?),0) refunded_paise,COALESCE((SELECT SUM(l.debit_paise-l.credit_paise) FROM ledger_entries l WHERE l.institution_id=i.id AND l.entry_date<=?),0) outstanding_paise FROM institutions i JOIN organizations o ON o.id=i.organization_id WHERE i.organization_id=? AND o.status='Active' ORDER BY i.name,i.id LIMIT ? OFFSET ?`,
        [
          from,
          to,
          from,
          to,
          to,
          scope.organizationId,
          limit,
          (page - 1) * limit,
        ],
      );
      const count = await one<{ count: number }>(
        "SELECT COUNT(*) count FROM institutions WHERE organization_id=?",
        [scope.organizationId],
      );
      const totals = await one(
        `SELECT (SELECT COUNT(*) FROM students s JOIN institutions i ON i.id=s.institution_id WHERE i.organization_id=? AND s.status='Active') students,(SELECT COALESCE(SUM(j.amount_paise),0) FROM journal_events j JOIN institutions i ON i.id=j.institution_id WHERE i.organization_id=? AND j.event_type='PAYMENT_RECEIVED' AND j.entry_date BETWEEN ? AND ?) collected_paise,(SELECT COALESCE(SUM(j.amount_paise),0) FROM journal_events j JOIN institutions i ON i.id=j.institution_id WHERE i.organization_id=? AND j.event_type='REVERSAL_ISSUED' AND j.entry_date BETWEEN ? AND ?) refunded_paise,(SELECT COALESCE(SUM(l.debit_paise-l.credit_paise),0) FROM ledger_entries l JOIN institutions i ON i.id=l.institution_id WHERE i.organization_id=? AND l.entry_date<=?) outstanding_paise`,
        [id, id, from, to, id, from, to, id, to],
      );
      return {
        organization,
        rows,
        totals,
        from,
        to,
        page,
        total: count?.count || 0,
        limit,
      };
    },
  );
}
export async function manageOrganizations(
  actor: Actor,
  path: string[],
  method: string,
  input: unknown,
) {
  permit(actor, "system");
  if (method === "GET")
    return {
      rows: await all(
        "SELECT o.*,(SELECT COUNT(*) FROM institutions i WHERE i.organization_id=o.id) institutions,(SELECT group_concat(m.email,', ') FROM organization_members m WHERE m.organization_id=o.id AND m.active=1) administrators FROM organizations o ORDER BY o.name LIMIT 100",
      ),
      institutions: await all(
        "SELECT id,name,organization_id FROM institutions ORDER BY name LIMIT 100",
      ),
    };
  if (method === "POST" && !path[1]) {
    const d = z
        .object({
          name: z.string().trim().min(2).max(160),
          adminEmail: z
            .string()
            .email()
            .transform((s) => s.toLowerCase()),
          institutionIds: z.array(z.string()).max(100),
        })
        .parse(input),
      id = uuid();
    const statements = [
      insert("organizations", { id, name: d.name, ...stamps(actor.userId) }),
      insert("organization_members", {
        id: uuid(),
        organization_id: id,
        email: d.adminEmail,
        ...stamps(actor.userId),
      }),
    ];
    for (const institutionId of [...new Set(d.institutionIds)]) {
      const i = await one(
        "SELECT id,organization_id FROM institutions WHERE id=?",
        [institutionId],
      );
      if (!i || i.organization_id)
        throw new ApiError(
          409,
          "GROUP_CONFLICT",
          "An institution is missing or already assigned to a group.",
        );
      statements.push(
        stmt(
          "UPDATE institutions SET organization_id=?,updated_at=?,updated_by=? WHERE id=? AND organization_id IS NULL",
          [id, now(), actor.userId, institutionId],
        ),
      );
    }
    statements.push(
      platformAudit(
        actor,
        "Created trust and approved organization administrator",
        "organizations",
        id,
        null,
        d,
      ),
    );
    await batch(statements);
    return { id, url: "/organization/" + id };
  }
  if (method === "PATCH" && path[1]) {
    const d = z
      .object({
        institutionId: z.string().optional(),
        email: z.string().email().optional(),
        active: z.boolean().optional(),
        reason: z.string().min(5).max(500),
      })
      .parse(input);
    if (!(await one("SELECT id FROM organizations WHERE id=?", [path[1]])))
      throw new ApiError(404, "NOT_FOUND", "Organization not found.");
    const statements = [];
    if (d.institutionId) {
      const old = await one(
        "SELECT organization_id FROM institutions WHERE id=?",
        [d.institutionId],
      );
      if (!old) throw new ApiError(404, "NOT_FOUND", "Institution not found.");
      statements.push(
        stmt(
          "UPDATE institutions SET organization_id=?,updated_at=?,updated_by=? WHERE id=?",
          [path[1], now(), actor.userId, d.institutionId],
        ),
        platformAudit(
          actor,
          "Moved institution to organization",
          "institutions",
          d.institutionId,
          old,
          { organizationId: path[1], reason: d.reason },
        ),
      );
    }
    if (d.email)
      statements.push(
        stmt(
          "INSERT INTO organization_members(id,organization_id,email,active,created_at,updated_at,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(organization_id,email) DO UPDATE SET active=excluded.active,updated_at=excluded.updated_at,updated_by=excluded.updated_by",
          [
            uuid(),
            path[1],
            d.email.toLowerCase(),
            +(d.active ?? true),
            now(),
            now(),
            actor.userId,
            actor.userId,
          ],
        ),
        platformAudit(
          actor,
          "Changed organization report access",
          "organizations",
          path[1],
          null,
          { email: d.email, active: d.active, reason: d.reason },
        ),
      );
    if (statements.length) await batch(statements);
    return { saved: true };
  }
  throw new ApiError(
    405,
    "METHOD_NOT_ALLOWED",
    "Organization operation is not available.",
  );
}
```


### `features/platform/Organizations.tsx`

```tsx
"use client";
import { useState } from "react";
import {
  Button,
  Card,
  DataTable,
  Field,
  FormDialog,
  Input,
  PageHead,
} from "@/components/campus/ui";
import { usePlatform, usePlatformResource } from "./context";
import { toast } from "sonner";
export function Organizations() {
  const { request, refresh } = usePlatform(),
    r = usePlatformResource<{
      rows: {
        id: string;
        name: string;
        administrators: string;
        institutions: number;
      }[];
      institutions: {
        id: string;
        name: string;
        organization_id: string | null;
      }[];
    }>("organizations"),
    [open, setOpen] = useState(false),
    [name, setName] = useState(""),
    [email, setEmail] = useState(""),
    [ids, setIds] = useState<string[]>([]),
    [busy, setBusy] = useState(false);
  return (
    <>
      <PageHead
        eyebrow="PLATFORM / TRUSTS"
        title="Organizations & trusts"
        description="Group independent institution tenants for consolidated, read-only financial reporting."
        actions={
          <Button onClick={() => setOpen(true)}>Create organization</Button>
        }
      />
      <Card>
        <DataTable
          rows={r.data?.rows || []}
          loading={r.loading}
          columns={[
            { key: "name", label: "Organization" },
            { key: "institutions", label: "Institutions" },
            { key: "administrators", label: "Report administrators" },
            {
              key: "actions",
              label: "Portal",
              render: (o) => (
                <a href={"/organization/" + o.id}>Open trust reports</a>
              ),
            },
          ]}
        />
        {r.error && <p role="alert">{r.error}</p>}
      </Card>
      <FormDialog
        open={open}
        onClose={() => setOpen(false)}
        title="Create organization"
        description="The named administrator receives access to this group’s reports using their existing ChatGPT email login."
        busy={busy}
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await request("organizations", {
              method: "POST",
              body: { name, adminEmail: email, institutionIds: ids },
            });
            refresh();
            setOpen(false);
            setName("");
            setEmail("");
            setIds([]);
            toast.success("Organization and report access created.");
          } catch (e) {
            toast.error((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="Trust / group name">
          <Input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label="Administrator email">
          <Input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <fieldset className="space-y-2">
          <legend className="mb-2 font-medium">Institutions</legend>
          {r.data?.institutions
            .filter((i) => !i.organization_id)
            .map((i) => (
              <label key={i.id} className="flex gap-2">
                <input
                  type="checkbox"
                  checked={ids.includes(i.id)}
                  onChange={(e) =>
                    setIds(
                      e.target.checked
                        ? [...ids, i.id]
                        : ids.filter((id) => id !== i.id),
                    )
                  }
                />
                {i.name}
              </label>
            ))}
        </fieldset>
      </FormDialog>
    </>
  );
}
```


### `app/organization/[id]/page.tsx`

```tsx
import OrganizationDashboard from "@/features/organization/Dashboard";
export const dynamic = "force-dynamic";
export const metadata = { title: "Trust reports | Sohan Soft Tech" };
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <OrganizationDashboard id={id} />;
}
```


### `features/organization/Dashboard.tsx`

```tsx
"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import {
  Button,
  Card,
  DataTable,
  Field,
  Input,
  PageHead,
  money,
} from "@/components/campus/ui";
type Report = {
  organization: { name: string };
  rows: {
    id: string;
    name: string;
    students: number;
    collected_paise: number;
    refunded_paise: number;
    outstanding_paise: number;
  }[];
  page: number;
  total: number;
  limit: number;
  totals: {
    students: number;
    collected_paise: number;
    refunded_paise: number;
    outstanding_paise: number;
  };
};
export default function OrganizationDashboard({ id }: { id: string }) {
  const [data, setData] = useState<Report | null>(null),
    [error, setError] = useState(""),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [page, setPage] = useState(1);
  useEffect(() => {
    api<Report>(
      "organizations/" +
        id +
        "/reports?" +
        new URLSearchParams({
          page: String(page),
          ...(from ? { from } : {}),
          ...(to ? { to } : {}),
        }),
    )
      .then((r) => {
        setData(r);
        setError("");
      })
      .catch((e) => setError(e.message));
  }, [id, from, to, page]);
  return (
    <main className="mx-auto max-w-7xl space-y-6 p-6">
      <PageHead
        eyebrow="SOHAN SOFT TECH / TRUST REPORTING"
        title={data?.organization.name || "Organization reports"}
        description="Consolidated receipts, refunds and outstanding balances for your authorized institutions."
        actions={<a href="/">Back to workspaces</a>}
      />
      <div className="flex gap-4">
        <Field label="From">
          <Input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </Field>
        <Field label="Through">
          <Input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </Field>
      </div>
      {data && (
        <div className="grid gap-4 sm:grid-cols-4">
          {[
            ["Students", data.totals.students],
            ["Collected", money(data.totals.collected_paise)],
            ["Refunded", money(data.totals.refunded_paise)],
            ["Outstanding", money(data.totals.outstanding_paise)],
          ].map(([label, value]) => (
            <Card key={label}>
              <p className="text-sm text-slate-500">{label}</p>
              <p className="text-2xl font-semibold">{value}</p>
            </Card>
          ))}
        </div>
      )}
      {error ? (
        <Card>
          <p role="alert">{error}</p>
          <a
            href={
              "/signin-with-chatgpt?return_to=" +
              encodeURIComponent("/organization/" + id)
            }
            target="_top"
          >
            Sign in with ChatGPT
          </a>
        </Card>
      ) : (
        <Card>
          <DataTable
            rows={data?.rows || []}
            loading={!data}
            columns={[
              { key: "name", label: "Institution" },
              { key: "students", label: "Active students" },
              {
                key: "collected_paise",
                label: "Collected",
                render: (r) => money(r.collected_paise),
              },
              {
                key: "refunded_paise",
                label: "Refunded",
                render: (r) => money(r.refunded_paise),
              },
              {
                key: "outstanding_paise",
                label: "Outstanding as of end date",
                render: (r) => money(r.outstanding_paise),
              },
            ]}
          />
          <div className="flex items-center gap-4">
            <Button disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <span>
              Page {page} · {data?.total || 0} institutions
            </span>
            <Button
              disabled={!data || page * data.limit >= data.total}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </Card>
      )}
      <p className="text-sm text-slate-500">
        Group report access is separate from institution staff access.
        Collections and refunds use the selected period; outstanding is
        cumulative through the end date.
      </p>
    </main>
  );
}
```


### `server/rollover.ts`

```typescript
import { z } from "zod";
import { all, batch, insert, now, one, stamps, stmt, uuid } from "./db";
import { Actor, ApiError, audit, own, permit, sha256 } from "./security";

const rolloverSchema = z.object({
  sourceYearId: z.string().min(1),
  targetYearId: z.string().min(1),
  mapping: z.record(z.string().min(1), z.string().min(1)),
  reason: z.string().trim().min(10).max(500),
});
interface Balance {
  id: string;
  invoice_id: string;
  outstanding_paise: number;
  title: string;
}
interface RolloverRecord {
  id: string;
  source_year_id: string;
  target_year_id: string;
  mapping: string;
  status: string;
  reason: string;
  approved_by: string;
}
async function scope(actor: Actor, input: unknown) {
  permit(actor, "settings.manage");
  permit(actor, "academics.manage");
  permit(actor, "fees.manage");
  const d = rolloverSchema.parse(input),
    source = await own(actor, "academic_years", d.sourceYearId),
    target = await own(actor, "academic_years", d.targetYearId);
  if (
    source.id === target.id ||
    target.start_date <= source.end_date ||
    !["Active", "Draft"].includes(target.status)
  )
    throw new ApiError(
      422,
      "INVALID_ROLLOVER",
      "Select a later, open academic year with no overlap.",
    );
  const sourceSections = await all<{ id: string }>(
    "SELECT DISTINCT e.section_id id FROM enrollments e JOIN students s ON s.id=e.student_id AND s.institution_id=e.institution_id WHERE e.institution_id=? AND e.academic_year_id=? AND s.status='Active'",
    [actor.institutionId, d.sourceYearId],
  );
  for (const s of sourceSections) {
    const destination = d.mapping[s.id];
    if (!destination)
      throw new ApiError(
        422,
        "PROMOTION_MAPPING_REQUIRED",
        "Map every source section to a destination section.",
      );
    const section = await own(actor, "sections", destination);
    if (section.academic_year_id !== target.id)
      throw new ApiError(
        422,
        "WRONG_TARGET_YEAR",
        "Each destination section must belong to the target year.",
      );
  }
  const conflict = await one(
    "SELECT e.id FROM enrollments e JOIN enrollments n ON n.institution_id=e.institution_id AND n.student_id=e.student_id AND n.academic_year_id=? JOIN students s ON s.id=e.student_id AND s.institution_id=e.institution_id WHERE e.institution_id=? AND e.academic_year_id=? AND s.status='Active' AND n.section_id<>json_extract(?, '$.\"' || e.section_id || '\"') LIMIT 1",
    [target.id, actor.institutionId, source.id, JSON.stringify(d.mapping)],
  );
  if (conflict)
    throw new ApiError(
      409,
      "PROMOTION_CONFLICT",
      "An existing destination enrollment conflicts with this mapping. Resolve it before freezing the year.",
    );
  const pending = await one<{ count: number }>(
    "SELECT (SELECT COUNT(*) FROM payments WHERE institution_id=? AND academic_year_id=? AND status IN ('Initiated','Processing','Pending'))+(SELECT COUNT(*) FROM refunds WHERE institution_id=? AND academic_year_id=? AND status IN ('Requested','Approved')) count",
    [actor.institutionId, source.id, actor.institutionId, source.id],
  );
  if (pending?.count)
    throw new ApiError(
      409,
      "PENDING_SETTLEMENT",
      "Confirm or cancel pending payments and complete refund requests before rollover.",
    );
  const inactive = await one<{ count: number }>(
    "SELECT COUNT(*) count FROM student_balances b JOIN students s ON s.id=b.student_id AND s.institution_id=b.institution_id WHERE b.institution_id=? AND b.academic_year_id=? AND b.outstanding_paise>0 AND s.status<>'Active'",
    [actor.institutionId, source.id],
  );
  if (inactive?.count)
    throw new ApiError(
      409,
      "INACTIVE_DUES",
      "Resolve transferred or inactive students’ outstanding dues before closing the year.",
    );
  const snapshot = await one<{
    students: number;
    outstanding: number;
    ledger_count: number;
  }>(
    "SELECT (SELECT COUNT(*) FROM enrollments e JOIN students s ON s.id=e.student_id AND s.institution_id=e.institution_id WHERE e.institution_id=? AND e.academic_year_id=? AND s.status='Active') students,(SELECT COALESCE(SUM(outstanding_paise),0) FROM student_balances WHERE institution_id=? AND academic_year_id=?) outstanding,(SELECT COUNT(*) FROM ledger_entries WHERE institution_id=? AND academic_year_id=?) ledger_count",
    [
      actor.institutionId,
      source.id,
      actor.institutionId,
      source.id,
      actor.institutionId,
      source.id,
    ],
  );
  const fingerprint = await sha256(JSON.stringify({ d, snapshot }));
  return { d, source, target, snapshot, fingerprint };
}
export async function previewRollover(actor: Actor, input: unknown) {
  const { source, target, snapshot, fingerprint } = await scope(actor, input);
  return { source: source.name, target: target.name, ...snapshot, fingerprint };
}
export async function startRollover(actor: Actor, input: unknown) {
  const reviewed = z
      .object({ fingerprint: z.string().length(64) })
      .parse(input),
    s = await scope(actor, input);
  if (reviewed.fingerprint !== s.fingerprint)
    throw new ApiError(
      409,
      "PREVIEW_STALE",
      "The year changed after preview. Review the refreshed figures before approving.",
    );
  const existing = await one<{ id: string }>(
    "SELECT id FROM year_rollovers WHERE institution_id=? AND source_year_id=?",
    [actor.institutionId, s.d.sourceYearId],
  );
  if (existing)
    throw new ApiError(
      409,
      "ROLLOVER_EXISTS",
      "This year already has a rollover. Resume that operation.",
    );
  const id = uuid();
  await batch([
    insert("year_rollovers", {
      id,
      institution_id: actor.institutionId,
      source_year_id: s.d.sourceYearId,
      target_year_id: s.d.targetYearId,
      mapping: JSON.stringify(s.d.mapping),
      reason: s.d.reason,
      approved_by: actor.userId,
      status: "Running",
      snapshot: JSON.stringify(s.snapshot),
      ...stamps(actor.userId),
    }),
    stmt(
      "UPDATE academic_years SET status='Closed',updated_at=?,updated_by=? WHERE institution_id=? AND id=?",
      [now(), actor.userId, actor.institutionId, s.d.sourceYearId],
    ),
    audit(
      actor,
      "Supervisor approved academic rollover and ledger freeze",
      "year_rollovers",
      id,
      s.snapshot,
      {
        source: s.d.sourceYearId,
        target: s.d.targetYearId,
        mapping: s.d.mapping,
        reason: s.d.reason,
        approvedBy: actor.userId,
      },
    ),
  ]);
  return { id, status: "Running" };
}
export async function processRollover(actor: Actor, id: string) {
  permit(actor, "settings.manage");
  permit(actor, "academics.manage");
  permit(actor, "fees.manage");
  const r = (await own(actor, "year_rollovers", id)) as RolloverRecord;
  if (r.status === "Completed") return { id, status: r.status, hasMore: false };
  const source = await own(actor, "academic_years", r.source_year_id);
  const mapping = z.record(z.string()).parse(JSON.parse(r.mapping)),
    target = await own(actor, "academic_years", r.target_year_id);
  if (!["Active", "Draft"].includes(target.status))
    throw new ApiError(
      409,
      "TARGET_YEAR_CLOSED",
      "Reopen the target year before resuming rollover.",
    );
  const students = await all<{
    student_id: string;
    section_id: string;
    roll_number: string | null;
  }>(
    "SELECT e.student_id,e.section_id,e.roll_number FROM enrollments e JOIN students s ON s.id=e.student_id AND s.institution_id=e.institution_id WHERE e.institution_id=? AND e.academic_year_id=? AND s.status='Active' AND NOT EXISTS(SELECT 1 FROM rollover_students rs WHERE rs.rollover_id=? AND rs.student_id=e.student_id) ORDER BY e.student_id LIMIT 5",
    [actor.institutionId, r.source_year_id, id],
  );
  let promoted = 0,
    carried = 0;
  for (const student of students) {
    const section = await own(actor, "sections", mapping[student.section_id]),
      prior = await one<{ section_id: string }>(
        "SELECT section_id FROM enrollments WHERE institution_id=? AND academic_year_id=? AND student_id=?",
        [actor.institutionId, r.target_year_id, student.student_id],
      );
    if (
      section.academic_year_id !== r.target_year_id ||
      (prior && prior.section_id !== section.id)
    )
      throw new ApiError(
        409,
        "PROMOTION_CONFLICT",
        "A student already has a different destination enrollment. Correct it before resuming.",
      );
    const dues = await all<Balance>(
      "SELECT id,invoice_id,outstanding_paise,title FROM installment_balances WHERE institution_id=? AND academic_year_id=? AND student_id=? AND outstanding_paise>0 ORDER BY due_date,id LIMIT 101",
      [actor.institutionId, r.source_year_id, student.student_id],
    );
    if (dues.length > 100)
      throw new ApiError(
        422,
        "ROLLOVER_BATCH_LIMIT",
        "This student has more than 100 unpaid installments. Contact accounts before continuing.",
      );
    const amount = dues.reduce((n, d) => n + d.outstanding_paise, 0),
      base = { institution_id: actor.institutionId, ...stamps(actor.userId) },
      invoiceId = amount ? uuid() : null,
      statements = [];
    if (!prior)
      statements.push(
        insert("enrollments", {
          id: uuid(),
          ...base,
          student_id: student.student_id,
          academic_year_id: r.target_year_id,
          section_id: section.id,
          roll_number: student.roll_number,
          clearance: "Pending",
        }),
      );
    // The immutable student checkpoint and all associated financial postings are
    // committed together. A resumed or concurrent batch cannot double-promote.
    statements.push(
      insert("rollover_students", {
        id: uuid(),
        institution_id: actor.institutionId,
        rollover_id: id,
        student_id: student.student_id,
        amount_paise: amount,
        target_invoice_id: invoiceId,
        source_snapshot: JSON.stringify(dues),
        created_at: now(),
      }),
    );
    if (amount && invoiceId) {
      const structureId = `rollover:${id}:${section.class_id}`,
        assignmentId = uuid(),
        installmentId = uuid();
      statements.push(
        stmt(
          "INSERT OR IGNORE INTO fee_structures(id,institution_id,academic_year_id,class_id,name,frequency,schedule,status,created_at,updated_at,created_by,updated_by) VALUES(?,?,?,?,?,'Annual',?,'System',?,?,?,?)",
          [
            structureId,
            actor.institutionId,
            r.target_year_id,
            section.class_id,
            "Opening dues · " + r.source_year_id,
            JSON.stringify([target.start_date]),
            now(),
            now(),
            actor.userId,
            actor.userId,
          ],
        ),
        insert("student_fee_assignments", {
          id: assignmentId,
          ...base,
          student_id: student.student_id,
          academic_year_id: r.target_year_id,
          structure_id: structureId,
          discount_paise: 0,
          scholarship_paise: 0,
          reason: "Approved balance carry-forward " + id,
        }),
        insert("invoices", {
          id: invoiceId,
          ...base,
          student_id: student.student_id,
          academic_year_id: r.target_year_id,
          assignment_id: assignmentId,
          gross_paise: amount,
          discount_paise: 0,
          scholarship_paise: 0,
          net_paise: amount,
          issued_date: target.start_date,
          due_date: target.start_date,
        }),
        insert("installments", {
          id: installmentId,
          ...base,
          invoice_id: invoiceId,
          student_id: student.student_id,
          academic_year_id: r.target_year_id,
          title: "Opening dues from previous year",
          amount_paise: amount,
          due_date: target.start_date,
          sort_order: 0,
        }),
      );
      for (const due of dues) {
        const adjustmentId = uuid();
        statements.push(
          insert("balance_carryforwards", {
            id: uuid(),
            institution_id: actor.institutionId,
            rollover_id: id,
            student_id: student.student_id,
            source_installment_id: due.id,
            target_invoice_id: invoiceId,
            amount_paise: due.outstanding_paise,
            created_at: now(),
          }),
          insert("fee_adjustments", {
            id: adjustmentId,
            ...base,
            student_id: student.student_id,
            academic_year_id: r.source_year_id,
            invoice_id: due.invoice_id,
            installment_id: due.id,
            kind: "Carry Forward",
            amount_paise: -due.outstanding_paise,
            reason: "Transferred to academic year " + r.target_year_id,
            approved_by: r.approved_by,
          }),
          insert("ledger_entries", {
            id: uuid(),
            ...base,
            student_id: student.student_id,
            academic_year_id: r.source_year_id,
            invoice_id: due.invoice_id,
            adjustment_id: adjustmentId,
            kind: "Rollover Out",
            description: "Receivable transferred to " + target.name,
            debit_paise: 0,
            credit_paise: due.outstanding_paise,
            entry_date: source.end_date,
          }),
        );
      }
      statements.push(
        insert("ledger_entries", {
          id: uuid(),
          ...base,
          student_id: student.student_id,
          academic_year_id: r.target_year_id,
          invoice_id: invoiceId,
          kind: "Opening Dues",
          description: "Opening receivable from previous academic year",
          debit_paise: amount,
          credit_paise: 0,
          entry_date: target.start_date,
        }),
      );
    }
    statements.push(
      audit(
        actor,
        "Promoted student and carried opening dues",
        "rollover_students",
        student.student_id,
        { yearId: r.source_year_id, sectionId: student.section_id },
        {
          yearId: r.target_year_id,
          sectionId: section.id,
          amountPaise: amount,
          rolloverId: id,
          approvedBy: r.approved_by,
        },
      ),
    );
    try {
      await batch(statements);
      promoted++;
      carried += amount;
    } catch (error) {
      if (
        !(await one(
          "SELECT id FROM rollover_students WHERE rollover_id=? AND student_id=?",
          [id, student.student_id],
        ))
      )
        throw error;
    }
  }
  const left = await one<{ count: number }>(
    "SELECT COUNT(*) count FROM enrollments e JOIN students s ON s.id=e.student_id AND s.institution_id=e.institution_id WHERE e.institution_id=? AND e.academic_year_id=? AND s.status='Active' AND NOT EXISTS(SELECT 1 FROM rollover_students rs WHERE rs.rollover_id=? AND rs.student_id=e.student_id)",
    [actor.institutionId, r.source_year_id, id],
  );
  if (!left?.count)
    await batch([
      stmt(
        "UPDATE year_rollovers SET status='Completed',updated_at=?,updated_by=? WHERE institution_id=? AND id=? AND status='Running'",
        [now(), actor.userId, actor.institutionId, id],
      ),
      audit(actor, "Completed academic rollover", "year_rollovers", id, null, {
        sourceYear: r.source_year_id,
        targetYear: r.target_year_id,
      }),
    ]);
  return {
    id,
    promoted,
    carriedPaise: carried,
    remaining: left?.count || 0,
    hasMore: !!left?.count,
    status: left?.count ? "Running" : "Completed",
  };
}
```


### `server/routes/operations.ts`

```typescript
import { z } from "zod";
import { all, batch, now, stmt } from "../db";
import { previewRollover, startRollover, processRollover } from "../rollover";
import { importRows } from "../imports";
import {
  processNotifications,
  queueReminder,
  runFinancialJobs,
} from "../notifications";
import { audit, own, permit } from "../security";
import { ok, RouteContext } from "./shared";

export async function operationsRoute(
  ctx: RouteContext,
): Promise<Response | null> {
  const { actor, path, p, method, body, request, url, requestId } = ctx;
  if (path[0] === "rollovers") {
    permit(actor, "settings.manage");
    if (method === "GET")
      return ok(
        {
          rows: await all(
            "SELECT * FROM year_rollovers WHERE institution_id=? ORDER BY created_at DESC LIMIT 20",
            [actor.institutionId],
          ),
          sections: await all(
            "SELECT s.id,s.name,s.academic_year_id,c.name class_name FROM sections s JOIN classes c ON c.id=s.class_id AND c.institution_id=s.institution_id WHERE s.institution_id=? ORDER BY s.academic_year_id,c.sort_order,s.name LIMIT 1000",
            [actor.institutionId],
          ),
        },
        requestId,
      );
    if (method === "POST" && path[1] === "preview")
      return ok(await previewRollover(actor, body), requestId);
    if (method === "POST" && path[1] === "start")
      return ok(await startRollover(actor, body), requestId);
    if (method === "POST" && path[2] === "process")
      return ok(await processRollover(actor, path[1]), requestId);
  }
  if (method === "POST") {
    if (path[0] === "notifications" && path[1] === "process")
      return ok(await processNotifications(actor), requestId);
  }
  if (method === "POST") {
    if (path[0] === "notifications" && path[2] === "retry") {
      permit(actor, "collect");
      const record = await own(actor, "notifications", path[1]);
      await batch([
        stmt(
          "UPDATE notifications SET status='Queued',attempts=0,updated_at=? WHERE id=? AND status='Failed'",
          [now(), record.id],
        ),
        audit(
          actor,
          "Retried notification",
          "notifications",
          record.id,
          null,
          null,
        ),
      ]);
      return ok({ queued: true }, requestId);
    }
  }
  if (method === "POST") {
    if (path[0] === "notifications") {
      const d = z
        .object({
          studentIds: z.array(z.string()).min(1).max(50),
          channel: z.enum(["SMS", "WhatsApp", "Email"]),
          template: z.string().max(1500).optional(),
        })
        .parse(body);
      return ok(
        await queueReminder(actor, d.studentIds, d.channel, d.template),
        requestId,
      );
    }
  }
  if (method === "POST") {
    if (path[0] === "jobs") return ok(await runFinancialJobs(actor), requestId);
  }
  if (method === "POST") {
    if (["import", "imports"].includes(path[0]))
      return ok(await importRows(actor, body), requestId);
  }
  return null;
}
```


### `features/students/RolloverWizard.tsx`

```tsx
"use client";
import { useEffect, useState } from "react";
import { Row, useApp } from "@/components/campus/context";
import {
  Button,
  Field,
  FormDialog,
  Input,
  Picker,
  money,
} from "@/components/campus/ui";
import { toast } from "sonner";
export function RolloverWizard({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { boot, scope, request, reload, refresh } = useApp(),
    [source, setSource] = useState(scope.year || ""),
    [target, setTarget] = useState(""),
    [mapping, setMapping] = useState<Record<string, string>>({}),
    [reason, setReason] = useState(""),
    [preview, setPreview] = useState<Row | null>(null),
    [run, setRun] = useState<Row | null>(null),
    [busy, setBusy] = useState(false),
    [sections, setSections] = useState<Row[]>([]),
    [existing, setExisting] = useState<Row[]>([]);
  useEffect(() => {
    if (open) {
      request("rollovers")
        .then((d) => {
          setSections(d.sections);
          setExisting(d.rows);
        })
        .catch((e) => toast.error(e.message));
    }
  }, [open, request]);
  const reset = () => {
    setPreview(null);
    setRun(null);
  };
  return (
    <FormDialog
      open={open}
      onClose={onClose}
      title="Academic year rollover"
      description="Review section mappings and opening dues. Approval freezes the source year; processing resumes in small, atomic student batches."
      busy={busy}
      submitLabel={
        run
          ? run.status === "Completed"
            ? "Done"
            : "Process next batch"
          : preview
            ? "Approve & freeze source year"
            : "Preview rollover"
      }
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          const body = {
            sourceYearId: source,
            targetYearId: target,
            mapping,
            reason,
          };
          if (run) {
            if (run.status === "Completed") {
              onClose();
              return;
            }
            const result = await request("rollovers/" + run.id + "/process", {
              method: "POST",
              body: {},
            });
            setRun(result);
            await reload();
            refresh();
          } else if (preview) {
            const result = await request("rollovers/start", {
              method: "POST",
              body: { ...body, fingerprint: preview.fingerprint },
            });
            setRun(result);
            await reload();
            refresh();
          } else
            setPreview(
              await request("rollovers/preview", { method: "POST", body }),
            );
        } catch (e) {
          toast.error((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      {!run && (
        <>
          {existing
            .filter((r) => r.status === "Running")
            .map((r) => (
              <Button
                key={r.id}
                type="button"
                variant="outline"
                onClick={() => setRun(r)}
              >
                Resume pending rollover · {r.source_year_id}
              </Button>
            ))}
          <Field label="Source academic year">
            <Picker
              value={source}
              onChange={(v) => {
                setSource(v);
                setMapping({});
                reset();
              }}
              options={[
                { value: "", label: "Choose year" },
                ...boot.years.map((y: Row) => ({ value: y.id, label: y.name })),
              ]}
            />
          </Field>
          <Field label="Destination academic year">
            <Picker
              value={target}
              onChange={(v) => {
                setTarget(v);
                setMapping({});
                reset();
              }}
              options={[
                { value: "", label: "Choose year" },
                ...boot.years
                  .filter((y: Row) => y.id !== source)
                  .map((y: Row) => ({ value: y.id, label: y.name })),
              ]}
            />
          </Field>
          {sections
            .filter((s) => s.academic_year_id === source)
            .map((s) => (
              <Field key={s.id} label={s.class_name + " · " + s.name}>
                <Picker
                  value={mapping[s.id] || ""}
                  onChange={(v) => {
                    setMapping({ ...mapping, [s.id]: v });
                    reset();
                  }}
                  options={[
                    { value: "", label: "Choose next grade / section" },
                    ...sections
                      .filter((s) => s.academic_year_id === target)
                      .map((s) => ({
                        value: s.id,
                        label: s.class_name + " · " + s.name,
                      })),
                  ]}
                />
              </Field>
            ))}
          <Field label="Supervisor approval reason">
            <Input
              required
              minLength={10}
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                reset();
              }}
            />
          </Field>
          {preview && (
            <div className="rounded-lg bg-blue-50 p-4">
              <p>{preview.students} students</p>
              <p>{money(preview.outstanding)} opening dues</p>
              <p>
                {preview.source} → {preview.target}
              </p>
              <p className="mt-2 text-sm">
                Existing transactions remain immutable. Pending payments/refunds
                must be resolved. Confirming locks new financial posting to the
                source year.
              </p>
            </div>
          )}
        </>
      )}
      {run && (
        <div role="status" className="space-y-2">
          <strong>{run.status}</strong>
          <p>Processed this batch: {run.promoted || 0}</p>
          <p>Carried this batch: {money(run.carriedPaise || 0)}</p>
          <p>
            {run.remaining === undefined
              ? "Ready to process the first batch."
              : `${run.remaining} students remaining.`}
          </p>
          <p className="text-sm text-slate-500">
            You can close this window and resume the same operation from
            Academics.
          </p>
        </div>
      )}
    </FormDialog>
  );
}
```


### `features/auth/AuditLogs.tsx`

```tsx
"use client";
import { useState } from "react";
import { Row, useApp, useResource } from "@/components/campus/context";
import {
  Button,
  Card,
  Failure,
  Input,
  PageHead,
  Picker,
} from "@/components/campus/ui";
import { Clock3, ShieldCheck } from "lucide-react";
export function AuditLogs() {
  const { query } = useApp(),
    [page, setPage] = useState(1),
    [q, setQ] = useState(""),
    [kind, setKind] = useState(""),
    r = useResource(
      "audit?" + query({ page: String(page), q, category: kind }),
    );
  function pretty(value: string | null) {
    if (!value) return "—";
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      return value;
    }
  }
  return (
    <>
      <PageHead
        eyebrow="ADMINISTRATION / IMMUTABLE AUDIT"
        title="Audit trail"
        description="Timestamped approvals, fee adjustments, access changes and financial corrections. Historical records cannot be edited."
      />
      <div className="mb-5 flex flex-wrap gap-3">
        <Input
          aria-label="Search audit"
          placeholder="Search action, user or record"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
        />
        <Picker
          value={kind}
          onChange={(v) => {
            setKind(v);
            setPage(1);
          }}
          options={[
            { value: "", label: "All actions" },
            { value: "approval", label: "Supervisor approvals" },
            { value: "waiver", label: "Concessions & penalty waivers" },
            { value: "backdated", label: "Backdated corrections" },
          ]}
        />
      </div>
      {r.error ? (
        <Failure message={r.error} retry={r.retry} />
      ) : (
        <Card>
          {r.loading && !r.data ? (
            <p>Loading audit history…</p>
          ) : !r.data?.rows.length ? (
            <p>No audit records match these filters.</p>
          ) : (
            <ol className="divide-y">
              {r.data.rows.map((a: Row) => (
                <li key={a.id} className="py-5">
                  <div className="flex items-start gap-3">
                    <ShieldCheck
                      className="mt-1 shrink-0 text-blue-700"
                      size={20}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap justify-between gap-2">
                        <h2 className="font-medium">{a.action}</h2>
                        <time className="flex items-center gap-1 text-sm text-slate-500">
                          <Clock3 size={14} />
                          {new Date(a.created_at).toLocaleString("en-IN", {
                            timeZone: "Asia/Kolkata",
                          })}{" "}
                          IST
                        </time>
                      </div>
                      <p className="mt-1 text-sm text-slate-500">
                        {a.user_name} · {a.entity} · {a.entity_id}
                      </p>
                      {a.support_session_id && (
                        <p className="text-sm text-amber-700">
                          Platform support session
                        </p>
                      )}
                      <details className="mt-3">
                        <summary className="cursor-pointer text-sm text-blue-700">
                          View recorded change
                        </summary>
                        <div className="mt-3 grid gap-3 md:grid-cols-2">
                          {[
                            ["Before", a.old_value],
                            ["After", a.new_value],
                          ].map(([label, value]) => (
                            <div key={label}>
                              <strong className="text-sm">{label}</strong>
                              <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-slate-50 p-3 text-sm">
                                {pretty(value)}
                              </pre>
                            </div>
                          ))}
                        </div>
                      </details>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
          <div className="mt-4 flex justify-end gap-3">
            <Button
              variant="outline"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <span className="self-center text-sm">Page {page}</span>
            <Button
              variant="outline"
              disabled={page * 25 >= (r.data?.total || 0)}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </Card>
      )}
    </>
  );
}
```


## Phase 4 — RFID, Tally and reconciliation


### `server/hardware.ts`

```typescript
import { z } from "zod";
import { parseMoney } from "../lib/money";
import { serviceActor } from "./communications";
import { all, batch, insert, now, one, stamps, stmt, uuid } from "./db";
import { readProvider, saveProvider } from "./providers";
import {
  Actor,
  ApiError,
  audit,
  constantEqual,
  hmac,
  own,
  permit,
  rateLimit,
  sha256,
} from "./security";
import { withTenantContext } from "./tenant-context";

const cardUid = z
  .string()
  .trim()
  .regex(/^[a-fA-F0-9:-]{8,64}$/)
  .transform((v) => v.replace(/[:-]/g, "").toUpperCase())
  .pipe(
    z
      .string()
      .regex(
        /^(?:[A-F0-9]{2}){4,16}$/,
        "Use a 4–16 byte hexadecimal RFID UID.",
      ),
  );
export async function createDevice(actor: Actor, input: unknown) {
  permit(actor, "settings.manage");
  const { name } = z
      .object({ name: z.string().trim().min(2).max(100) })
      .parse(input),
    id = uuid();
  const secret = Array.from(crypto.getRandomValues(new Uint8Array(32)), (v) =>
    v.toString(16).padStart(2, "0"),
  ).join("");
  await saveProvider(actor, "RFID:" + id, { secret }, "production");
  await batch([
    insert("hardware_devices", {
      id,
      institution_id: actor.institutionId,
      name,
      ...stamps(actor.userId),
    }),
    audit(actor, "Registered RFID device", "hardware_devices", id, null, {
      name,
    }),
  ]);
  return {
    id,
    secret,
    endpoint: new URL(actor.request.url).origin + "/api/hardware/rfid-punch",
  };
}
export async function assignCard(actor: Actor, input: unknown) {
  permit(actor, "settings.manage");
  const d = z
    .object({ studentId: z.string().min(1), uid: cardUid })
    .parse(input);
  await own(actor, "students", d.studentId);
  const id = uuid();
  await batch([
    insert("rfid_cards", {
      id,
      institution_id: actor.institutionId,
      student_id: d.studentId,
      uid_hash: await sha256(d.uid),
      ...stamps(actor.userId),
    }),
    audit(actor, "Assigned RFID card", "rfid_cards", id, null, {
      studentId: d.studentId,
    }),
  ]);
  return { id };
}
export async function saveDailyRule(actor: Actor, input: unknown) {
  permit(actor, "settings.manage");
  permit(actor, "fees.manage");
  const d = z
    .object({
      studentId: z.string(),
      installmentId: z.string(),
      service: z.enum(["Transport", "Hostel"]),
      amount: z.string(),
      active: z.boolean(),
    })
    .parse(input);
  const i = await own(actor, "installments", d.installmentId),
    amount = parseMoney(d.amount);
  if (i.student_id !== d.studentId || amount <= 0)
    throw new ApiError(
      422,
      "INVALID_RULE",
      "Select that student’s installment and a positive daily rate.",
    );
  await batch([
    stmt(
      "INSERT INTO daily_fee_rules(id,institution_id,student_id,installment_id,service,amount_paise,active,created_at,updated_at,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(institution_id,student_id,service) DO UPDATE SET installment_id=excluded.installment_id,amount_paise=excluded.amount_paise,active=excluded.active,updated_at=excluded.updated_at,updated_by=excluded.updated_by",
      [
        uuid(),
        actor.institutionId,
        d.studentId,
        d.installmentId,
        d.service,
        amount,
        +d.active,
        now(),
        now(),
        actor.userId,
        actor.userId,
      ],
    ),
    audit(
      actor,
      "Approved daily attendance fee rule",
      "daily_fee_rules",
      d.studentId,
      null,
      { ...d, amountPaise: amount },
    ),
  ]);
  return { saved: true };
}
export async function rfidPunch(request: Request) {
  const deviceId = request.headers.get("x-device-id") || "",
    timestamp = request.headers.get("x-timestamp") || "",
    nonce = request.headers.get("x-nonce") || "";
  if (
    !/^\d{10}$/.test(timestamp) ||
    Math.abs(Date.now() / 1000 - Number(timestamp)) > 300 ||
    !/^[a-zA-Z0-9_-]{16,80}$/.test(nonce)
  )
    throw new ApiError(
      401,
      "STALE_DEVICE_REQUEST",
      "Use a fresh Unix-seconds timestamp and random nonce.",
    );
  const raw = await request.text();
  if (raw.length > 8192)
    throw new ApiError(
      413,
      "PAYLOAD_TOO_LARGE",
      "Device payload is too large.",
    );
  const device = await one<{ id: string; institution_id: string }>(
    "SELECT d.id,d.institution_id FROM hardware_devices d JOIN institutions i ON i.id=d.institution_id AND i.status='Active' WHERE d.id=? AND d.active=1",
    [deviceId],
  );
  const config = device
    ? await readProvider(device.institution_id, "RFID:" + device.id)
    : null;
  if (
    !device ||
    !config?.secret ||
    !constantEqual(
      await hmac(config.secret, `${timestamp}.${nonce}.${raw}`),
      request.headers.get("x-signature") || "",
    )
  )
    throw new ApiError(
      401,
      "INVALID_SIGNATURE",
      "Device authentication failed.",
    );
  await rateLimit(request, "rfid:" + device.id, 120);
  const data = z
    .object({
      eventId: z.string().regex(/^[a-zA-Z0-9_-]{8,100}$/),
      uid: cardUid,
      punchedAt: z.string().datetime({ offset: true }),
      direction: z.enum(["IN", "OUT"]),
    })
    .parse(JSON.parse(raw));
  const hash = await sha256(raw),
    existing = await one<{ payload_hash: string; id: string }>(
      "SELECT id,payload_hash FROM attendance_events WHERE device_id=? AND event_id=?",
      [device.id, data.eventId],
    );
  if (existing) {
    if (existing.payload_hash !== hash)
      throw new ApiError(
        409,
        "EVENT_CONFLICT",
        "This event ID was already used with different data.",
      );
    return { attendanceId: existing.id, duplicate: true };
  }
  const stamp = Date.parse(data.punchedAt);
  if (stamp > Date.now() + 60000 || stamp < Date.now() - 86400000)
    throw new ApiError(
      422,
      "INVALID_PUNCH_TIME",
      "Punch time must be within the past 24 hours.",
    );
  const student = await one<{ student_id: string }>(
    "SELECT c.student_id FROM rfid_cards c JOIN students s ON s.id=c.student_id AND s.institution_id=c.institution_id AND s.status='Active' WHERE c.institution_id=? AND c.uid_hash=? AND c.active=1",
    [device.institution_id, await sha256(data.uid)],
  );
  if (!student)
    throw new ApiError(
      404,
      "CARD_NOT_ASSIGNED",
      "Card is not assigned to an active student.",
    );
  const date = new Date(stamp + 19800000).toISOString().slice(0, 10),
    actor = serviceActor(device.institution_id),
    id = uuid();
  return withTenantContext(actor, async () => {
    const statements = [
      insert("attendance_events", {
        id,
        institution_id: actor.institutionId,
        device_id: device.id,
        event_id: data.eventId,
        nonce,
        payload_hash: hash,
        student_id: student.student_id,
        punched_at: data.punchedAt,
        local_date: date,
        direction: data.direction,
        created_at: now(),
      }),
    ];
    let charged = 0;
    if (data.direction === "IN") {
      const rules = await all<{
        id: string;
        installment_id: string;
        service: string;
        amount_paise: number;
        invoice_id: string;
        academic_year_id: string;
      }>(
        "SELECT r.*,i.invoice_id,i.academic_year_id FROM daily_fee_rules r JOIN installments i ON i.id=r.installment_id AND i.institution_id=r.institution_id AND i.student_id=r.student_id JOIN academic_years y ON y.id=i.academic_year_id AND y.institution_id=i.institution_id WHERE r.institution_id=? AND r.student_id=? AND r.active=1 AND y.status='Active' AND y.start_date<=? AND y.end_date>=? AND NOT EXISTS(SELECT 1 FROM year_rollovers yr WHERE yr.institution_id=r.institution_id AND yr.source_year_id=y.id) AND NOT EXISTS(SELECT 1 FROM daily_fee_charges c WHERE c.institution_id=r.institution_id AND c.student_id=r.student_id AND c.service=r.service AND c.local_date=?)",
        [actor.institutionId, student.student_id, date, date, date],
      );
      for (const r of rules) {
        const adjustmentId = uuid(),
          base = {
            institution_id: actor.institutionId,
            ...stamps(actor.userId),
          };
        statements.push(
          insert("fee_adjustments", {
            id: adjustmentId,
            ...base,
            student_id: student.student_id,
            academic_year_id: r.academic_year_id,
            invoice_id: r.invoice_id,
            installment_id: r.installment_id,
            kind: r.service,
            amount_paise: r.amount_paise,
            reason: `Daily ${r.service} attendance on ${date}`,
            approved_by: actor.userId,
          }),
          insert("ledger_entries", {
            id: uuid(),
            ...base,
            student_id: student.student_id,
            academic_year_id: r.academic_year_id,
            invoice_id: r.invoice_id,
            adjustment_id: adjustmentId,
            kind: "Daily " + r.service,
            description: `Daily ${r.service} attendance on ${date}`,
            debit_paise: r.amount_paise,
            credit_paise: 0,
            entry_date: date,
          }),
          insert("daily_fee_charges", {
            id: uuid(),
            institution_id: actor.institutionId,
            student_id: student.student_id,
            attendance_id: id,
            rule_id: r.id,
            adjustment_id: adjustmentId,
            service: r.service,
            local_date: date,
            amount_paise: r.amount_paise,
            created_at: now(),
          }),
        );
        charged += r.amount_paise;
      }
    }
    statements.push(
      audit(
        actor,
        "Accepted signed RFID attendance",
        "attendance_events",
        id,
        null,
        {
          deviceId: device.id,
          studentId: student.student_id,
          date,
          direction: data.direction,
          chargedPaise: charged,
        },
      ),
    );
    try {
      await batch(statements);
    } catch (e) {
      const retry = await one<{ id: string; payload_hash: string }>(
        "SELECT id,payload_hash FROM attendance_events WHERE device_id=? AND event_id=?",
        [device.id, data.eventId],
      );
      if (retry?.payload_hash === hash)
        return { attendanceId: retry.id, duplicate: true };
      throw e;
    }
    return { attendanceId: id, chargedPaise: charged, duplicate: false };
  });
}
```


### `features/auth/HardwareSettings.tsx`

```tsx
"use client";
import { useEffect, useState } from "react";
import { Row, useApp, useResource } from "@/components/campus/context";
import {
  Button,
  Card,
  DataTable,
  Field,
  Input,
  Picker,
  money,
} from "@/components/campus/ui";
import { toast } from "sonner";
export function HardwareSettings() {
  const { request, query, refresh } = useApp(),
    r = useResource("hardware"),
    [name, setName] = useState(""),
    [device, setDevice] = useState<{
      id: string;
      secret: string;
      endpoint: string;
    } | null>(null),
    [search, setSearch] = useState(""),
    students = useResource("students?" + query({ q: search, size: "25" })),
    [student, setStudent] = useState(""),
    [uid, setUid] = useState(""),
    [installments, setInstallments] = useState<Row[]>([]),
    [installment, setInstallment] = useState(""),
    [service, setService] = useState("Transport"),
    [amount, setAmount] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (student)
      request("students/" + student + "?" + query())
        .then((d) => setInstallments(d.installments))
        .catch((e) => toast.error(e.message));
  }, [student, request, query]);
  async function perform(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-6">
      <Card title="RFID readers">
        <div className="flex gap-3">
          <Input
            aria-label="Device name"
            placeholder="Main gate reader"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Button
            disabled={busy || name.length < 2}
            onClick={() =>
              perform(async () => {
                const d = await request("hardware/devices", {
                  method: "POST",
                  body: { name },
                });
                setDevice(d);
                setName("");
              })
            }
          >
            Register reader
          </Button>
        </div>
        {device && (
          <div className="my-4 space-y-2 rounded-lg bg-amber-50 p-4">
            <p className="font-medium">
              Save this device secret now. It is displayed once.
            </p>
            <Input readOnly aria-label="Device ID" value={device.id} />
            <Input
              readOnly
              aria-label="Device HMAC secret"
              value={device.secret}
            />
            <p className="break-all text-sm">Endpoint: {device.endpoint}</p>
          </div>
        )}
        <DataTable
          rows={r.data?.devices || []}
          columns={[
            { key: "name", label: "Reader" },
            { key: "id", label: "Device ID" },
            {
              key: "active",
              label: "Access",
              render: (d) => (
                <Button
                  disabled={busy}
                  variant="outline"
                  onClick={() =>
                    perform(async () => {
                      await request("hardware/devices/" + d.id, {
                        method: "PATCH",
                        body: { active: !d.active },
                      });
                    })
                  }
                >
                  {d.active ? "Disable" : "Enable"}
                </Button>
              ),
            },
          ]}
        />
      </Card>
      <Card title="Student cards and daily charges">
        <div className="settings-fields">
          <Field label="Search student">
            <Input value={search} onChange={(e) => setSearch(e.target.value)} />
          </Field>
          <Field label="Student">
            <Picker
              value={student}
              onChange={(v) => {
                setStudent(v);
                setInstallment("");
              }}
              options={[
                { value: "", label: "Choose student" },
                ...(students.data?.rows || []).map((s: Row) => ({
                  value: s.id,
                  label: s.name + " · " + s.admission_number,
                })),
              ]}
            />
          </Field>
          <Field label="RFID UID (hexadecimal)">
            <Input value={uid} onChange={(e) => setUid(e.target.value)} />
          </Field>
        </div>
        <Button
          className="my-4"
          disabled={busy || !student || !uid}
          variant="outline"
          onClick={() =>
            perform(async () => {
              await request("hardware/cards", {
                method: "POST",
                body: { studentId: student, uid },
              });
              setUid("");
              toast.success("RFID card assigned.");
            })
          }
        >
          Assign card
        </Button>
        <div className="settings-fields">
          <Field label="Daily service">
            <Picker
              value={service}
              onChange={setService}
              options={[
                { value: "Transport", label: "Transport" },
                { value: "Hostel", label: "Hostel" },
              ]}
            />
          </Field>
          <Field label="Charge to installment">
            <Picker
              value={installment}
              onChange={setInstallment}
              options={[
                { value: "", label: "Choose active-year installment" },
                ...installments.map((i) => ({
                  value: i.id,
                  label: i.title + " · " + i.due_date,
                })),
              ]}
            />
          </Field>
          <Field label="Daily amount (₹)">
            <Input value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
        </div>
        <p className="my-4 text-sm text-slate-500">
          The first IN event per student, service and day adds the approved
          amount to their fee ledger. This records a fee charge; it does not
          withdraw bank funds or deduct a prepaid wallet.
        </p>
        <Button
          disabled={busy || !installment || !amount}
          onClick={() =>
            perform(async () => {
              await request("hardware/rules", {
                method: "POST",
                body: {
                  studentId: student,
                  installmentId: installment,
                  service,
                  amount,
                  active: true,
                },
              });
              toast.success("Daily fee rule approved.");
            })
          }
        >
          Approve daily rate
        </Button>
        <DataTable
          rows={r.data?.rules || []}
          columns={[
            { key: "student_name", label: "Student" },
            { key: "service", label: "Service" },
            {
              key: "amount_paise",
              label: "Daily rate",
              render: (r) => money(r.amount_paise),
            },
            {
              key: "active",
              label: "Status",
              render: (r) => (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    perform(async () => {
                      await request("hardware/rules", {
                        method: "POST",
                        body: {
                          studentId: r.student_id,
                          installmentId: r.installment_id,
                          service: r.service,
                          amount: (r.amount_paise / 100).toFixed(2),
                          active: !r.active,
                        },
                      });
                    })
                  }
                >
                  {r.active ? "Disable" : "Enable"}
                </Button>
              ),
            },
          ]}
        />
      </Card>
      <Card title="Recent attendance">
        <DataTable
          rows={r.data?.attendance || []}
          loading={r.loading}
          columns={[
            { key: "student_name", label: "Student" },
            { key: "device_name", label: "Reader" },
            { key: "punched_at", label: "Punch time" },
            { key: "direction", label: "Direction" },
            { key: "local_date", label: "India date" },
          ]}
        />
      </Card>
    </div>
  );
}
```


### `server/routes/reports.ts`

```typescript
import { accountingReport } from "../reports";
import { csv, xlsx } from "../../lib/tabular";
import { templates } from "../imports";
import { platformDashboard } from "../institutions";
import { dashboard, listStudents } from "../queries";
import {
  attachment,
  documentPdf,
  downloadReport,
  reportData,
} from "../reports";
import { ApiError, permit } from "../security";
import { ok, RouteContext } from "./shared";
import { receiptDownload } from "../receipt-download";
import { tallyExport } from "../tally";

export async function reportsRoute(
  ctx: RouteContext,
): Promise<Response | null> {
  const { actor, path, p, method, body, request, url, requestId } = ctx;
  if (method === "GET") {
    if (path.join("/") === "admin/dashboard")
      return ok(await platformDashboard(actor), requestId);
  }
  if (method === "GET") {
    if (path[0] === "dashboard")
      return ok(await dashboard(actor, p), requestId);
  }
  if (method === "GET") {
    if (["outstanding", "defaulters"].includes(path[0])) {
      permit(actor, "finance");
      return ok(
        await listStudents(
          actor,
          new URLSearchParams({ ...Object.fromEntries(p), outstanding: "1" }),
          path[0] === "defaulters",
        ),
        requestId,
      );
    }
  }
  if (method === "GET") {
    if (path[0] === "reports") {
      if (path[1] === "tally") return tallyExport(actor, p);
      if (path[1] === "summary" && !p.get("format"))
        return ok(await accountingReport(actor, p), requestId);
      if (p.get("format"))
        return await downloadReport(
          actor,
          path[1] || p.get("report") || "collections",
          p,
        );
      return ok(
        await reportData(actor, path[1] || p.get("report") || "collections", p),
        requestId,
      );
    }
  }
  if (method === "GET") {
    if (path[0] === "documents" && path[1] === "receipt")
      return receiptDownload(actor, path[2], p.get("format") || "a4");
    if (path[0] === "documents")
      return await documentPdf(
        actor,
        path[1],
        path[2],
        p.get("format") || "a4",
      );
  }
  if (method === "GET") {
    if (path[0] === "template") {
      permit(
        actor,
        path[1] === "reconciliation"
          ? "payments.collect"
          : ["students", "parents"].includes(path[1])
            ? "students.manage"
            : "fees.manage",
      );
      const rows = templates[path[1]];
      if (!rows) throw new ApiError(404, "NOT_FOUND", "Template not found.");
      return p.get("format") === "xlsx"
        ? attachment(
            xlsx(rows),
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            path[1] + "-template.xlsx",
          )
        : attachment(
            csv(rows),
            "text/csv;charset=utf-8",
            path[1] + "-template.csv",
          );
    }
  }
  return null;
}
```


### `server/tally.ts`

```typescript
import { z } from "zod";
import { TallyPosting, TallyVoucher, tallyXml } from "../lib/tally";
import { all, one } from "./db";
import { attachment } from "./reports";
import { Actor, ApiError, permit, sha256 } from "./security";
interface Event {
  kind: string;
  id: string;
  event_type: string;
  entry_date: string;
  description: string;
  debit_account: string;
  credit_account: string;
  amount_paise: number;
  invoice_id: string | null;
  student_name: string;
  admission_number: string;
}
export async function tallyExport(actor: Actor, p: URLSearchParams) {
  permit(actor, "reports.export");
  const params = z
    .object({
      year: z.string().min(1),
      from: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
      to: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
    })
    .parse({
      year: p.get("year"),
      from: p.get("from") || undefined,
      to: p.get("to") || undefined,
    });
  const values = [
    actor.institutionId,
    params.year,
    params.from || "2000-01-01",
    params.to || "2100-12-31",
  ];
  const pending = await one<{ count: number }>(
    "SELECT COUNT(*) count FROM ledger_entries l WHERE l.institution_id=? AND l.academic_year_id=? AND l.entry_date BETWEEN ? AND ? AND l.debit_paise+l.credit_paise>0 AND NOT EXISTS(SELECT 1 FROM journal_events j WHERE j.ledger_entry_id=l.id)",
    values,
  );
  if (pending?.count)
    throw new ApiError(
      409,
      "JOURNAL_BACKFILL_REQUIRED",
      "Complete the journal backfill before exporting this period.",
    );
  const events = await all<Event>(
    "SELECT j.*,l.kind,l.invoice_id,s.name student_name,s.admission_number FROM journal_events j JOIN ledger_entries l ON l.id=j.ledger_entry_id AND l.institution_id=j.institution_id JOIN students s ON s.id=j.student_id AND s.institution_id=j.institution_id WHERE j.institution_id=? AND j.academic_year_id=? AND j.entry_date BETWEEN ? AND ? ORDER BY j.entry_date,j.id LIMIT 1001",
    values,
  );
  if (events.length > 1000)
    throw new ApiError(
      422,
      "EXPORT_LIMIT",
      "Choose a shorter date range; each balanced export supports 1,000 vouchers.",
    );
  const institution = await one<{ name: string; settings: string }>(
      "SELECT name,settings FROM institutions WHERE id=?",
      [actor.institutionId],
    ),
    settings = JSON.parse(institution!.settings),
    mapping = z
      .record(z.string().min(1).max(160))
      .parse(settings.tally?.ledgers || {});
  const defaults: Record<string, string> = {
    ACCOUNTS_RECEIVABLE: "Student Fees Receivable",
    CASH: "Cash",
    BANK_CLEARING: "Bank Receipts",
    CONCESSION_EXPENSE: "Fee Concessions",
    FEE_REVENUE: "Fee Income",
    LATE_FEE_REVENUE: "Late Fee Income",
    OPENING_BALANCE_CLEARING: "Academic Year Transfer",
  };
  const items = await all<{
    invoice_id: string;
    component_id: string;
    name: string;
    amount_paise: number;
  }>(
    "SELECT ii.invoice_id,ii.component_id,ii.name,ii.amount_paise FROM invoice_items ii JOIN invoices i ON i.id=ii.invoice_id AND i.institution_id=ii.institution_id WHERE i.institution_id=? AND i.academic_year_id=? AND EXISTS(SELECT 1 FROM journal_events j WHERE j.ledger_entry_id IN(SELECT l.id FROM ledger_entries l WHERE l.invoice_id=i.id AND l.institution_id=i.institution_id) AND j.event_type='INVOICE_GENERATED' AND j.entry_date BETWEEN ? AND ?) ORDER BY ii.invoice_id,ii.component_id LIMIT 20001",
    values,
  );
  if (items.length > 20000)
    throw new ApiError(
      422,
      "EXPORT_LIMIT",
      "Choose a shorter period containing fewer fee components.",
    );
  const byInvoice = new Map<string, typeof items>();
  for (const item of items) {
    const group = byInvoice.get(item.invoice_id) || [];
    group.push(item);
    byInvoice.set(item.invoice_id, group);
  }
  const vouchers: TallyVoucher[] = [];
  for (const event of events) {
    const postings: TallyPosting[] = [
      {
        ledger: mapping[event.debit_account] || defaults[event.debit_account],
        paise: event.amount_paise,
        side: "Debit",
      },
    ];
    if (event.event_type === "INVOICE_GENERATED" && event.invoice_id) {
      const components = byInvoice.get(event.invoice_id) || [];
      if (
        components.reduce((n, i) => n + i.amount_paise, 0) !==
        event.amount_paise
      )
        throw new ApiError(
          409,
          "COMPONENT_MISMATCH",
          "An invoice component total needs review before export.",
        );
      postings.push(
        ...components
          .filter((c) => c.amount_paise > 0)
          .map((c) => ({
            ledger: mapping["component:" + c.component_id] || c.name,
            paise: c.amount_paise,
            side: "Credit" as const,
          })),
      );
    } else {
      const service =
        event.kind === "Daily Transport"
          ? "Transport"
          : event.kind === "Daily Hostel"
            ? "Hostel"
            : null;
      postings.push({
        ledger: service
          ? mapping["service:" + service] || service + " Fee Income"
          : mapping[event.credit_account] || defaults[event.credit_account],
        paise: event.amount_paise,
        side: "Credit",
      });
    }
    const hash = await sha256(actor.institutionId + ":" + event.id),
      guid = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
    vouchers.push({
      id: guid,
      date: event.entry_date,
      number: "SST-" + event.id.replace("journal:", ""),
      type:
        event.event_type === "PAYMENT_RECEIVED"
          ? "Receipt"
          : event.event_type === "REVERSAL_ISSUED"
            ? "Payment"
            : "Journal",
      narration: `${event.student_name} (${event.admission_number}) | ${event.description}`,
      postings,
    });
  }
  return attachment(
    tallyXml(settings.tally?.company || institution!.name, vouchers),
    "application/xml;charset=utf-8",
    "Sohan-Soft-Tech-Tally-Vouchers.xml",
  );
}
```


### `lib/tally.ts`

```typescript
export type TallyPosting = {
  ledger: string;
  paise: number;
  side: "Debit" | "Credit";
};
export type TallyVoucher = {
  id: string;
  date: string;
  number: string;
  narration: string;
  type: "Journal" | "Receipt" | "Payment";
  postings: TallyPosting[];
};
export function xmlEscape(value: string) {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(
      /[<>&"']/g,
      (c) =>
        ({
          "<": "&lt;",
          ">": "&gt;",
          "&": "&amp;",
          '"': "&quot;",
          "'": "&apos;",
        })[c]!,
    );
}
export function exactDecimal(paise: number) {
  if (!Number.isSafeInteger(paise) || paise < 0)
    throw new Error("Invalid monetary amount");
  return `${Math.floor(paise / 100)}.${String(paise % 100).padStart(2, "0")}`;
}
export function tallyXml(company: string, vouchers: TallyVoucher[]) {
  const xml = vouchers
    .map((v) => {
      let balance = BigInt(0);
      for (const p of v.postings) {
        if (!p.ledger.trim() || !Number.isSafeInteger(p.paise) || p.paise <= 0)
          throw new Error("Invalid posting");
        balance +=
          (p.side === "Debit" ? BigInt(1) : -BigInt(1)) * BigInt(p.paise);
      }
      if (balance !== BigInt(0)) throw new Error("Unbalanced Tally voucher");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v.date))
        throw new Error("Invalid voucher date");
      return `<TALLYMESSAGE xmlns:UDF="TallyUDF"><VOUCHER REMOTEID="${xmlEscape(v.id)}" VCHTYPE="${v.type}" ACTION="Create" OBJVIEW="Accounting Voucher View"><DATE>${v.date.replaceAll("-", "")}</DATE><GUID>${xmlEscape(v.id)}</GUID><VOUCHERTYPENAME>${v.type}</VOUCHERTYPENAME><VOUCHERNUMBER>${xmlEscape(v.number)}</VOUCHERNUMBER><PERSISTEDVIEW>Accounting Voucher View</PERSISTEDVIEW><ISINVOICE>No</ISINVOICE><NARRATION>${xmlEscape(v.narration)}</NARRATION>${v.postings.map((p) => `<ALLLEDGERENTRIES.LIST><LEDGERNAME>${xmlEscape(p.ledger)}</LEDGERNAME><ISDEEMEDPOSITIVE>${p.side === "Debit" ? "Yes" : "No"}</ISDEEMEDPOSITIVE><AMOUNT>${p.side === "Debit" ? "-" : ""}${exactDecimal(p.paise)}</AMOUNT></ALLLEDGERENTRIES.LIST>`).join("")}</VOUCHER></TALLYMESSAGE>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?><ENVELOPE><HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER><BODY><IMPORTDATA><REQUESTDESC><REPORTNAME>Vouchers</REPORTNAME><STATICVARIABLES><SVCURRENTCOMPANY>${xmlEscape(company)}</SVCURRENTCOMPANY></STATICVARIABLES></REQUESTDESC><REQUESTDATA>${xml}</REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>`;
}
```


### `features/auth/AccountingSettings.tsx`

```tsx
"use client";
import { useState } from "react";
import { useApp, Row } from "@/components/campus/context";
import { Button, Card, Field, Input } from "@/components/campus/ui";
import { toast } from "sonner";
const accounts = [
  ["ACCOUNTS_RECEIVABLE", "Student Fees Receivable"],
  ["CASH", "Cash"],
  ["BANK_CLEARING", "Bank Receipts"],
  ["CONCESSION_EXPENSE", "Fee Concessions"],
  ["FEE_REVENUE", "Fee Income"],
  ["LATE_FEE_REVENUE", "Late Fee Income"],
  ["OPENING_BALANCE_CLEARING", "Academic Year Transfer"],
  ["service:Transport", "Transport Fee Income"],
  ["service:Hostel", "Hostel Fee Income"],
];
export function AccountingSettings() {
  const { boot, request, reload } = useApp(),
    [company, setCompany] = useState(
      boot.institution.settings.tally?.company || boot.institution.name,
    ),
    [ledgers, setLedgers] = useState<Record<string, string>>(
      boot.institution.settings.tally?.ledgers || {},
    ),
    [busy, setBusy] = useState(false);
  return (
    <Card title="TallyPrime account mapping">
      <p className="mb-5 text-sm text-slate-500">
        Use the exact company and ledger names configured in TallyPrime. Create
        the corresponding ledgers in Tally before importing the XML. Stable
        voucher IDs support controlled re-import; review Tally’s import options
        to avoid duplicates.
      </p>
      <Field label="Tally company">
        <Input value={company} onChange={(e) => setCompany(e.target.value)} />
      </Field>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        {[
          ...accounts,
          ...(boot.components || []).map((c: Row) => [
            "component:" + c.id,
            c.name,
          ]),
        ].map(([code, label]) => (
          <Field key={code} label={label}>
            <Input
              value={ledgers[code] || ""}
              placeholder={label}
              onChange={(e) =>
                setLedgers({ ...ledgers, [code]: e.target.value })
              }
            />
          </Field>
        ))}
      </div>
      <Button
        className="mt-5"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await request("settings", {
              method: "PATCH",
              body: {
                name: boot.institution.name,
                address: boot.institution.address,
                email: boot.institution.email,
                phone: boot.institution.phone,
                settings: {
                  ...boot.institution.settings,
                  tally: {
                    company,
                    ledgers: Object.fromEntries(
                      Object.entries(ledgers).filter(([, name]) => name.trim()),
                    ),
                  },
                },
              },
            });
            await reload();
            toast.success("Accounting mappings saved.");
          } catch (e) {
            toast.error((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        Save account mappings
      </Button>
    </Card>
  );
}
```


### `features/reports/TallyExport.tsx`

```tsx
"use client";
import { useState } from "react";
import { useApp } from "@/components/campus/context";
import { Button } from "@/components/campus/ui";
import { toast } from "sonner";
export function TallyExport() {
  const { query, institutionId, can } = useApp(),
    [busy, setBusy] = useState(false);
  if (!can("reports.export")) return null;
  return (
    <Button
      variant="outline"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const response = await fetch(
            "/api/reports/tally?" + query({ format: "xml" }),
            {
              headers: { "X-Institution-ID": institutionId },
              cache: "no-store",
            },
          );
          if (!response.ok) {
            const error = (await response.json()) as { message: string };
            throw new Error(error.message);
          }
          const url = URL.createObjectURL(await response.blob()),
            a = document.createElement("a");
          a.href = url;
          a.download = "Sohan-Soft-Tech-Tally-Vouchers.xml";
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (e) {
          toast.error((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      Export Tally XML
    </Button>
  );
}
```


### `features/reports/Reconciliation.tsx`

```tsx
"use client";
import { Row, useApp, useResource } from "@/components/campus/context";
import { ImportDialog } from "@/components/campus/ImportDialog";
import {
  Button,
  Card,
  DataTable,
  ExportButton,
  Failure,
  Field,
  FormDialog,
  Input,
  PageHead,
  Picker,
  Status,
  money,
} from "@/components/campus/ui";
import { Link2, Upload } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { BankImportDialog } from "./BankImportDialog";
export function Reconciliation() {
  const { query, request, refresh, t } = useApp(),
    [page, setPage] = useState(1),
    [importOpen, setImport] = useState(false),
    [bankOpen, setBank] = useState(false),
    [match, setMatch] = useState<Row | null>(null),
    [payments, setPayments] = useState<Row[]>([]),
    [paymentId, setPayment] = useState(""),
    [notes, setNotes] = useState(""),
    [busy, setBusy] = useState(false),
    r = useResource("reconciliation?" + query({ page: String(page) }));
  return (
    <>
      <PageHead
        eyebrow="FINANCE / RECONCILIATION"
        title={t("Reconciliation")}
        description={t("ReconciliationIntro")}
        actions={
          <>
            <ExportButton report="reconciliation" />
            <Button variant="outline" onClick={() => setImport(true)}>
              Gateway CSV / Excel
            </Button>
            <Button onClick={() => setBank(true)}>
              <Upload size={16} />
              Import statement
            </Button>
          </>
        }
      />
      <div className="notice-bar">
        <span className="notice-icon">
          <Link2 size={18} />
        </span>
        <div>
          <strong>
            Match transactions without creating duplicate payments
          </strong>
          <span>
            Bank imports are compared with existing payment references and exact
            amounts.
          </span>
        </div>
      </div>
      <Card>
        {r.error ? (
          <Failure message={r.error} retry={r.retry} />
        ) : (
          <DataTable
            rows={r.data?.rows || []}
            loading={r.loading}
            total={r.data?.total}
            page={page}
            onPage={setPage}
            columns={[
              { key: "transaction_id", label: "Bank / gateway reference" },
              { key: "transaction_date", label: "Date" },
              { key: "student_name", label: "Matched student" },
              {
                key: "amount_paise",
                label: "Amount",
                align: "right",
                render: (r) => money(r.amount_paise),
              },
              {
                key: "status",
                label: "Status",
                render: (r) => <Status value={r.status} />,
              },
              { key: "notes", label: "Notes" },
              {
                key: "actions",
                label: "",
                render: (r) =>
                  r.status !== "Duplicate" && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        try {
                          const d = await request(
                            "payments?" +
                              query({ size: "100", status: "Successful" }),
                          );
                          setPayments(d.rows);
                          setMatch(r);
                          setPayment(r.payment_id || "");
                          setNotes(r.notes);
                        } catch (e) {
                          toast.error((e as Error).message);
                        }
                      }}
                    >
                      {r.status === "Matched"
                        ? "Review match"
                        : "Match payment"}
                    </Button>
                  ),
              },
            ]}
          />
        )}
      </Card>
      <BankImportDialog open={bankOpen} onClose={() => setBank(false)} />
      <ImportDialog
        kind="reconciliation"
        open={importOpen}
        onClose={() => setImport(false)}
      />
      <FormDialog
        open={!!match}
        onClose={() => setMatch(null)}
        title="Match bank transaction"
        description={match?.transaction_id + " · " + money(match?.amount_paise)}
        busy={busy}
        submitLabel="Save reconciliation"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await request("reconciliation/" + match!.id + "/match", {
              method: "POST",
              body: { paymentId, notes },
            });
            toast.success("Reconciliation saved.");
            refresh();
            setMatch(null);
          } catch (e) {
            toast.error((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="Successful payment">
          <Picker
            value={paymentId}
            onChange={setPayment}
            options={[
              { value: "", label: "Choose matching payment" },
              ...payments.map((p) => ({
                value: p.id,
                label:
                  p.student_name +
                  " · " +
                  money(p.amount_paise) +
                  " · " +
                  (p.reference || p.id),
              })),
            ]}
          />
        </Field>
        <Field label="Review note">
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </FormDialog>
    </>
  );
}
```


### `features/reports/BankImportDialog.tsx`

```tsx
"use client";
import { useMemo, useState } from "react";
import { Row, useApp } from "@/components/campus/context";
import {
  Button,
  DataTable,
  Field,
  FormDialog,
  Input,
  Picker,
} from "@/components/campus/ui";
import { BankColumn, csvBankRows, ofxBankRows } from "@/lib/bank-statements";
import { toast } from "sonner";
const columns: { key: BankColumn; label: string; aliases: string[] }[] = [
  {
    key: "date",
    label: "Transaction date",
    aliases: ["date", "transaction date", "value date", "posted"],
  },
  {
    key: "reference",
    label: "UTR / bank reference",
    aliases: [
      "reference",
      "utr",
      "transaction_id",
      "transaction id",
      "ref no",
      "fitid",
    ],
  },
  {
    key: "amount",
    label: "Amount in INR",
    aliases: ["amount", "credit", "deposit", "amount_inr"],
  },
  {
    key: "direction",
    label: "Credit / debit",
    aliases: ["direction", "type", "dr/cr"],
  },
  {
    key: "narration",
    label: "Narration",
    aliases: ["narration", "description", "memo", "particulars"],
  },
  {
    key: "admissionNumber",
    label: "Admission number (optional)",
    aliases: ["admission_number", "admission number", "admission"],
  },
  {
    key: "invoiceNumber",
    label: "Invoice number (optional)",
    aliases: ["invoice_number", "invoice number", "invoice"],
  },
];
export function BankImportDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { request, scope, refresh } = useApp(),
    [text, setText] = useState(""),
    [format, setFormat] = useState("csv"),
    [headers, setHeaders] = useState<string[]>([]),
    [mapping, setMapping] = useState<Partial<Record<BankColumn, string>>>({}),
    [preview, setPreview] = useState<Row | null>(null),
    [post, setPost] = useState(false),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [done, setDone] = useState<Row | null>(null);
  const parsed = useMemo(() => {
    if (!text) return { rows: [], errors: [] };
    try {
      return format === "ofx" ? ofxBankRows(text) : csvBankRows(text, mapping);
    } catch (e) {
      return { rows: [], errors: [{ row: 0, message: (e as Error).message }] };
    }
  }, [text, format, mapping]);
  const close = () => {
    onClose();
    setText("");
    setPreview(null);
    setDone(null);
    setReason("");
    setPost(false);
  };
  return (
    <FormDialog
      open={open}
      onClose={close}
      title="Import bank statement"
      description="Upload up to 100 INR transactions. Exact references match existing payments; unique invoice/admission matches can be posted after your approval."
      busy={busy}
      submitLabel={
        done
          ? "Done"
          : preview
            ? "Confirm selected import"
            : "Check against database"
      }
      onSubmit={async (e) => {
        e.preventDefault();
        if (done) {
          close();
          return;
        }
        if (!scope.year) {
          toast.error("Select the academic year first.");
          return;
        }
        if (parsed.errors.length || !parsed.rows.length) {
          toast.error("Correct the pre-flight errors before continuing.");
          return;
        }
        setBusy(true);
        try {
          if (preview) {
            if (reason.trim().length < 10)
              throw new Error(
                "Enter an approval reason of at least 10 characters.",
              );
            const result = await request("reconciliation/bank-commit", {
              method: "POST",
              body: { batchId: preview.id, postMatchedDues: post, reason },
            });
            setDone(result);
            refresh();
          } else
            setPreview(
              await request("reconciliation/bank-preview", {
                method: "POST",
                body: { yearId: scope.year, rows: parsed.rows },
              }),
            );
        } catch (e) {
          toast.error((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      {done ? (
        <>
          <p role="status">
            Import completed. {done.failed} rows need review. Each posted
            payment, receipt, ledger and bank match committed atomically.
          </p>
          <DataTable
            rows={done.rows.map((r: Row, index: number) => ({
              ...r,
              id: index,
            }))}
            columns={[
              { key: "reference", label: "Reference" },
              { key: "status", label: "Result" },
              { key: "message", label: "Details" },
            ]}
          />
        </>
      ) : preview ? (
        <>
          <DataTable
            rows={preview.rows.map((m: Row, index: number) => ({
              ...m,
              id: index,
              reference: m.row.reference,
              amount: m.row.amount,
              date: m.row.date,
            }))}
            columns={[
              { key: "reference", label: "Bank reference" },
              { key: "amount", label: "INR" },
              { key: "studentName", label: "Student" },
              { key: "status", label: "Match" },
              { key: "reason", label: "Evidence" },
            ]}
          />
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={post}
              onChange={(e) => setPost(e.target.checked)}
            />
            <span>
              Create bank-transfer payments for rows marked Ready. Existing
              payments are only reconciled; unmatched rows remain for review.
            </span>
          </label>
          <Field label="Accountant approval / backdated entry reason">
            <Input
              required
              minLength={10}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
          <p className="text-sm text-slate-500">
            Each row is processed independently and reports its result. Retries
            cannot post the same bank reference twice.
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={() => setPreview(null)}
          >
            Back to mapping
          </Button>
        </>
      ) : (
        <>
          <Field label="CSV or OFX statement">
            <Input
              type="file"
              accept=".csv,.ofx,.qfx"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                if (file.size > 2000000) {
                  toast.error("Use a file under 2 MB.");
                  return;
                }
                const content = await file.text(),
                  kind = /\.(ofx|qfx)$/i.test(file.name) ? "ofx" : "csv";
                setFormat(kind);
                setText(content);
                setPreview(null);
                if (kind === "csv") {
                  try {
                    const info = csvBankRows(content, {});
                    setHeaders(info.headers);
                    setMapping(
                      Object.fromEntries(
                        columns.map((c) => [
                          c.key,
                          info.headers.find((h) =>
                            c.aliases.includes(h.toLowerCase()),
                          ) || "",
                        ]),
                      ),
                    );
                  } catch (e) {
                    toast.error((e as Error).message);
                  }
                }
              }}
            />
          </Field>
          {text && format === "csv" && (
            <div className="grid gap-3 sm:grid-cols-2">
              {columns.map((c) => (
                <Field key={c.key} label={c.label}>
                  <Picker
                    value={mapping[c.key] || ""}
                    onChange={(v) => setMapping({ ...mapping, [c.key]: v })}
                    options={[
                      { value: "", label: "Not mapped" },
                      ...headers.map((h) => ({ value: h, label: h })),
                    ]}
                  />
                </Field>
              ))}
            </div>
          )}
          {parsed.errors.length > 0 && (
            <div
              role="alert"
              className="rounded-lg bg-red-50 p-3 text-sm text-red-800"
            >
              {parsed.errors.slice(0, 15).map((e, i) => (
                <p key={i}>
                  Row {e.row}: {e.message}
                </p>
              ))}
            </div>
          )}
          {parsed.rows.length > 0 && (
            <DataTable
              rows={parsed.rows.map((r, index) => ({ ...r, id: index }))}
              columns={[
                { key: "date", label: "Date" },
                { key: "reference", label: "Reference" },
                { key: "amount", label: "INR" },
                { key: "direction", label: "Direction" },
                { key: "admissionNumber", label: "Admission number" },
              ]}
            />
          )}
        </>
      )}
    </FormDialog>
  );
}
```


### `lib/bank-statements.ts`

```typescript
import Papa from "papaparse";
import { parseMoney } from "./money";
export interface BankRow {
  date: string;
  reference: string;
  amount: string;
  direction: "Credit" | "Debit";
  narration: string;
  admissionNumber: string;
  invoiceNumber: string;
}
export type BankColumn =
  | "date"
  | "reference"
  | "amount"
  | "direction"
  | "narration"
  | "admissionNumber"
  | "invoiceNumber";
export function bankDate(value: string) {
  const v = value.trim();
  let result = v;
  if (/^\d{8,14}(?:\[.*\])?$/.test(v))
    result = `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`;
  else if (/^\d{2}[/.-]\d{2}[/.-]\d{4}$/.test(v)) {
    const [d, m, y] = v.split(/[/.-]/);
    result = `${y}-${m}-${d}`;
  }
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(result) ||
    !Number.isFinite(Date.parse(result)) ||
    new Date(result).toISOString().slice(0, 10) !== result
  )
    throw new Error("Use a valid YYYY-MM-DD or DD/MM/YYYY date.");
  return result;
}
function amount(value: string) {
  const s = value.replace(/[₹,\s]/g, "").replace(/^INR/i, "");
  const negative = s.startsWith("-") || /^\(.*\)$/.test(s),
    clean = s.replace(/^[-+(]|\)$/g, "");
  parseMoney(clean);
  return { amount: clean, negative };
}
export function csvBankRows(
  text: string,
  mapping: Partial<Record<BankColumn, string>>,
) {
  if (text.length > 2000000)
    throw new Error("Use a statement smaller than 2 MB.");
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim(),
  });
  if (parsed.errors.length)
    throw new Error("CSV format error: " + parsed.errors[0].message);
  if (parsed.data.length > 100)
    throw new Error("Import at most 100 statement rows per batch.");
  const errors: { row: number; message: string }[] = [],
    rows: BankRow[] = [],
    seen = new Set<string>();
  parsed.data.forEach((r, index) => {
    try {
      const get = (k: BankColumn) => r[mapping[k] || ""]?.trim() || "",
        a = amount(get("amount")),
        reference = get("reference");
      if (!reference || reference.length > 100)
        throw new Error(
          "A bank reference of up to 100 characters is required.",
        );
      if (seen.has(reference))
        throw new Error("Duplicate reference in this statement.");
      seen.add(reference);
      rows.push({
        date: bankDate(get("date")),
        reference,
        amount: a.amount,
        direction:
          a.negative || /^(dr|debit|withdrawal)$/i.test(get("direction"))
            ? "Debit"
            : "Credit",
        narration: get("narration").slice(0, 500),
        admissionNumber: get("admissionNumber").slice(0, 100),
        invoiceNumber: get("invoiceNumber").slice(0, 100),
      });
    } catch (e) {
      errors.push({ row: index + 2, message: (e as Error).message });
    }
  });
  return { rows, errors, headers: parsed.meta.fields || [] };
}
export function ofxBankRows(text: string) {
  if (text.length > 2000000 || /<!DOCTYPE|<!ENTITY/i.test(text))
    throw new Error("OFX is too large or contains unsupported declarations.");
  if (!/<CURDEF>\s*INR(?:\s|<|$)/i.test(text))
    throw new Error("Only INR bank statements are supported.");
  const blocks = [...text.matchAll(/<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi)];
  if (!blocks.length)
    throw new Error("No OFX statement transactions were found.");
  if (blocks.length > 100)
    throw new Error("Import at most 100 transactions per batch.");
  const rows: BankRow[] = [],
    errors: { row: number; message: string }[] = [],
    seen = new Set<string>();
  blocks.forEach(([, body], index) => {
    try {
      const field = (name: string) =>
          new RegExp(`<${name}>([^<\\r\\n]*)`, "i").exec(body)?.[1]?.trim() ||
          "",
        a = amount(field("TRNAMT")),
        reference = field("FITID");
      if (!reference || reference.length > 100 || seen.has(reference))
        throw new Error("Missing, oversized or duplicate OFX FITID.");
      seen.add(reference);
      rows.push({
        date: bankDate(field("DTPOSTED")),
        reference,
        amount: a.amount,
        direction: a.negative ? "Debit" : "Credit",
        narration: (field("NAME") + " " + field("MEMO")).trim().slice(0, 500),
        admissionNumber: "",
        invoiceNumber: "",
      });
    } catch (e) {
      errors.push({ row: index + 1, message: (e as Error).message });
    }
  });
  return { rows, errors };
}
```


### `server/bank-reconciliation.ts`

```typescript
import { z } from "zod";
import { bankDate, BankRow } from "../lib/bank-statements";
import { parseMoney } from "../lib/money";
import { all, batch, insert, now, one, stamps, today, uuid } from "./db";
import { collectPayment, planPayment } from "./payments";
import { Actor, ApiError, audit, own, permit, sha256 } from "./security";

const rowSchema = z.object({
  date: z.string().transform(bankDate),
  reference: z.string().trim().min(1).max(100),
  amount: z.string().refine((v) => {
    try {
      return parseMoney(v) > 0;
    } catch {
      return false;
    }
  }, "Use a positive monetary amount"),
  direction: z.enum(["Credit", "Debit"]),
  narration: z.string().max(500).default(""),
  admissionNumber: z.string().max(100).default(""),
  invoiceNumber: z.string().max(100).default(""),
});
type Match = {
  row: BankRow;
  status:
    | "Matched"
    | "Ready"
    | "Unmatched"
    | "Duplicate"
    | "Debit"
    | "Under Review";
  studentId?: string;
  studentName?: string;
  paymentId?: string;
  invoiceId?: string;
  reason: string;
};
async function matchRow(
  actor: Actor,
  yearId: string,
  row: BankRow,
): Promise<Match> {
  if (row.direction === "Debit")
    return {
      row,
      status: "Debit",
      reason: "Withdrawal: excluded from fee receipts.",
    };
  if (
    await one(
      "SELECT id FROM bank_posted_rows WHERE institution_id=? AND transaction_id=?",
      [actor.institutionId, row.reference],
    )
  )
    return {
      row,
      status: "Duplicate",
      reason: "This bank reference was already imported.",
    };
  const amount = parseMoney(row.amount),
    payments = await all<{
      id: string;
      student_id: string;
      name: string;
      amount_paise: number;
      paid_at: string;
      academic_year_id: string;
    }>(
      "SELECT p.id,p.student_id,s.name,p.amount_paise,p.paid_at,p.academic_year_id FROM payments p JOIN students s ON s.id=p.student_id AND s.institution_id=p.institution_id WHERE p.institution_id=? AND (p.reference=? OR p.gateway_transaction_id=?) AND p.status IN ('Successful','Partially Refunded','Refunded') LIMIT 3",
      [actor.institutionId, row.reference, row.reference],
    );
  if (payments.length) {
    const payment = payments[0];
    if (
      payments.length !== 1 ||
      payment.amount_paise !== amount ||
      payment.academic_year_id !== yearId ||
      Math.abs(Date.parse(payment.paid_at) - Date.parse(row.date)) >
        8 * 86400000
    )
      return {
        row,
        status: "Under Review",
        reason:
          "The reference exists with a different amount, date, academic year or multiple payments.",
      };
    if (
      await one(
        "SELECT id FROM bank_posted_rows WHERE institution_id=? AND payment_id=?",
        [actor.institutionId, payment.id],
      )
    )
      return {
        row,
        status: "Under Review",
        reason: "This payment is already matched to another bank reference.",
      };
    return {
      row,
      status: "Matched",
      paymentId: payment.id,
      studentId: payment.student_id,
      studentName: payment.name,
      reason: "Exact bank reference, amount and compatible date.",
    };
  }
  let candidates: { id: string; name: string; invoice_id?: string }[] = [];
  if (row.invoiceNumber)
    candidates = await all(
      "SELECT s.id,s.name,i.id invoice_id FROM invoices i JOIN students s ON s.id=i.student_id AND s.institution_id=i.institution_id WHERE i.institution_id=? AND i.academic_year_id=? AND i.number=?",
      [actor.institutionId, yearId, row.invoiceNumber],
    );
  else if (row.admissionNumber)
    candidates = await all(
      "SELECT s.id,s.name FROM students s JOIN enrollments e ON e.student_id=s.id AND e.institution_id=s.institution_id WHERE s.institution_id=? AND e.academic_year_id=? AND s.admission_number=?",
      [actor.institutionId, yearId, row.admissionNumber],
    );
  else if (row.narration)
    candidates = await all(
      "SELECT s.id,s.name FROM students s JOIN enrollments e ON e.student_id=s.id AND e.institution_id=s.institution_id WHERE s.institution_id=? AND e.academic_year_id=? AND instr(' '||upper(?)||' ',' '||upper(s.admission_number)||' ')>0 LIMIT 2",
      [actor.institutionId, yearId, row.narration],
    );
  if (candidates.length !== 1)
    return {
      row,
      status: candidates.length ? "Under Review" : "Unmatched",
      reason:
        "No unique invoice/admission number match. Amount-only matching is not used.",
    };
  const student = candidates[0];
  try {
    const allocations = await allocationsFor(
      actor,
      student.id,
      yearId,
      amount,
      student.invoice_id,
    );
    await planPayment(actor, student.id, yearId, amount, allocations);
    return {
      row,
      status: "Ready",
      studentId: student.id,
      studentName: student.name,
      invoiceId: student.invoice_id,
      reason:
        "Unique student and sufficient open dues. Posting requires accountant confirmation.",
    };
  } catch {
    return {
      row,
      status: "Under Review",
      studentId: student.id,
      studentName: student.name,
      reason: "No sufficient open dues, or the year is closed.",
    };
  }
}
async function allocationsFor(
  actor: Actor,
  studentId: string,
  yearId: string,
  amount: number,
  invoiceId?: string,
) {
  if (!invoiceId) return undefined;
  const dues = await all<{ id: string; outstanding_paise: number }>(
    "SELECT id,outstanding_paise FROM installment_balances WHERE institution_id=? AND student_id=? AND academic_year_id=? AND invoice_id=? AND outstanding_paise>0 ORDER BY due_date,id",
    [actor.institutionId, studentId, yearId, invoiceId],
  );
  let left = amount;
  return dues.flatMap((d) => {
    const value = Math.min(left, d.outstanding_paise);
    left -= value;
    return value > 0 ? [{ installmentId: d.id, amountPaise: value }] : [];
  });
}
export async function previewBankImport(actor: Actor, input: unknown) {
  permit(actor, "payments.manage");
  const d = z
      .object({ yearId: z.string(), rows: z.array(rowSchema).min(1).max(100) })
      .parse(input),
    year = await own(actor, "academic_years", d.yearId);
  if (new Set(d.rows.map((r) => r.reference)).size !== d.rows.length)
    throw new ApiError(
      422,
      "DUPLICATE_REFERENCE",
      "Remove duplicate bank references from this upload.",
    );
  for (const row of d.rows)
    if (
      row.date < year.start_date ||
      row.date > year.end_date ||
      row.date > today()
    )
      throw new ApiError(
        422,
        "BANK_YEAR_MISMATCH",
        "Every transaction date must fall within the selected academic year and cannot be in the future.",
      );
  const fingerprint = await sha256(JSON.stringify(d.rows)),
    existing = await one<{ id: string }>(
      "SELECT id FROM bank_import_batches WHERE institution_id=? AND academic_year_id=? AND fingerprint=?",
      [actor.institutionId, d.yearId, fingerprint],
    ),
    id = existing?.id || uuid();
  if (!existing)
    await batch([
      insert("bank_import_batches", {
        id,
        institution_id: actor.institutionId,
        academic_year_id: d.yearId,
        fingerprint,
        rows: JSON.stringify(d.rows),
        created_at: now(),
        created_by: actor.userId,
      }),
      audit(
        actor,
        "Previewed bank statement import",
        "bank_import_batches",
        id,
        null,
        { rows: d.rows.length, yearId: d.yearId },
      ),
    ]);
  const matches: Match[] = [];
  for (const row of d.rows) matches.push(await matchRow(actor, d.yearId, row));
  return { id, rows: matches, fingerprint };
}
export async function commitBankImport(actor: Actor, input: unknown) {
  permit(actor, "payments.manage");
  permit(actor, "payments.collect");
  const d = z
      .object({
        batchId: z.string(),
        postMatchedDues: z.boolean(),
        reason: z.string().trim().min(10).max(300),
      })
      .parse(input),
    record = await own(actor, "bank_import_batches", d.batchId),
    rows = z.array(rowSchema).parse(JSON.parse(record.rows));
  const results: { reference: string; status: string; message?: string }[] = [];
  for (const row of rows) {
    try {
      const match = await matchRow(actor, record.academic_year_id, row);
      if (match.status === "Debit" || match.status === "Duplicate") {
        results.push({ reference: row.reference, status: match.status });
        continue;
      }
      const id = uuid(),
        bankRowId = uuid(),
        amount = parseMoney(row.amount);
      const statements = (paymentId?: string) => [
        insert("reconciliation_records", {
          id,
          institution_id: actor.institutionId,
          academic_year_id: record.academic_year_id,
          transaction_id: row.reference,
          amount_paise: amount,
          transaction_date: row.date,
          student_id: match.studentId || null,
          invoice_id: match.invoiceId || null,
          payment_id: paymentId || null,
          status: paymentId
            ? "Matched"
            : match.status === "Under Review"
              ? "Under Review"
              : "Unmatched",
          notes: d.reason + " | " + row.narration,
          import_batch: record.id,
          ...stamps(actor.userId),
        }),
        insert("bank_posted_rows", {
          id: bankRowId,
          institution_id: actor.institutionId,
          batch_id: record.id,
          row_key: row.reference,
          transaction_id: row.reference,
          payment_id: paymentId || null,
          reconciliation_id: id,
          created_at: now(),
        }),
        audit(
          actor,
          "Approved bank statement reconciliation",
          "reconciliation_records",
          id,
          null,
          {
            reference: row.reference,
            paymentId: paymentId || null,
            transactionDate: row.date,
            reason: d.reason,
          },
        ),
      ];
      if (match.status === "Ready" && d.postMatchedDues && match.studentId) {
        const keyHash = await sha256(actor.institutionId + ":" + row.reference),
          key = `${keyHash.slice(0, 8)}-${keyHash.slice(8, 12)}-4${keyHash.slice(13, 16)}-8${keyHash.slice(17, 20)}-${keyHash.slice(20, 32)}`;
        await collectPayment(
          actor,
          {
            studentId: match.studentId,
            yearId: record.academic_year_id,
            amountPaise: amount,
            method: "Bank Transfer",
            reference: row.reference,
            notes: d.reason,
            idempotencyKey: key,
            paidAt: row.date + "T06:30:00.000Z",
            allocations: await allocationsFor(
              actor,
              match.studentId,
              record.academic_year_id,
              amount,
              match.invoiceId,
            ),
          },
          statements,
        );
        results.push({ reference: row.reference, status: "Posted & matched" });
      } else {
        await batch(statements(match.paymentId));
        results.push({
          reference: row.reference,
          status: match.paymentId
            ? "Matched"
            : match.status === "Under Review"
              ? "Under Review"
              : "Unmatched",
        });
      }
    } catch (e) {
      results.push({
        reference: row.reference,
        status: "Failed",
        message:
          e instanceof ApiError
            ? e.message
            : "This row was not posted. Refresh and review the bank reference.",
      });
    }
  }
  return {
    rows: results,
    failed: results.filter((r) => r.status === "Failed").length,
  };
}
```


## Schema and migration


### `db/schema.ts`

```typescript
import { sql } from "drizzle-orm";
import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
// INR is stored as integer paise, with financial constraints in migrations.
const id = () => text("id").primaryKey();
const time = () => ({
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  createdBy: text("created_by").notNull(),
  updatedBy: text("updated_by").notNull(),
});
const tenant = () => ({
  institutionId: text("institution_id")
    .notNull()
    .references(() => institutions.id),
});
export const platform = sqliteTable("platform", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});
export const organizations = sqliteTable("organizations", {
  id: id(),
  name: text("name").notNull(),
  status: text("status").notNull().default("Active"),
  ...time(),
});
export const institutions = sqliteTable("institutions", {
  id: id(),
  organizationId: text("organization_id").references(() => organizations.id),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  address: text("address").notNull().default(""),
  email: text("email").notNull().default(""),
  phone: text("phone").notNull().default(""),
  gstin: text("gstin"),
  logoKey: text("logo_key"),
  institutionType: text("institution_type").notNull().default("School"),
  institutionCode: text("institution_code").notNull().default(""),
  city: text("city").notNull().default(""),
  state: text("state").notNull().default(""),
  pincode: text("pincode").notNull().default(""),
  website: text("website").notNull().default(""),
  subscription: text("subscription").notNull().default("Professional"),
  status: text("status").notNull().default("Active"),
  settings: text("settings").notNull().default("{}"),
  ...time(),
});
export const campuses = sqliteTable(
  "campuses",
  {
    id: id(),
    ...tenant(),
    name: text("name").notNull(),
    address: text("address").notNull().default(""),
    ...time(),
  },
  (t) => [uniqueIndex("campus_name").on(t.institutionId, t.name)],
);
export const academicYears = sqliteTable(
  "academic_years",
  {
    id: id(),
    ...tenant(),
    name: text("name").notNull(),
    startDate: text("start_date").notNull(),
    endDate: text("end_date").notNull(),
    status: text("status").notNull().default("Draft"),
    ...time(),
  },
  (t) => [uniqueIndex("year_name").on(t.institutionId, t.name)],
);
export const classes = sqliteTable(
  "classes",
  {
    id: id(),
    ...tenant(),
    name: text("name").notNull(),
    level: text("level").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    department: text("department"),
    active: integer("active").notNull().default(1),
    ...time(),
  },
  (t) => [uniqueIndex("class_name").on(t.institutionId, t.name)],
);
export const streams = sqliteTable(
  "streams",
  { id: id(), ...tenant(), name: text("name").notNull(), ...time() },
  (t) => [uniqueIndex("stream_name").on(t.institutionId, t.name)],
);
export const sections = sqliteTable(
  "sections",
  {
    id: id(),
    ...tenant(),
    academicYearId: text("academic_year_id")
      .notNull()
      .references(() => academicYears.id),
    classId: text("class_id")
      .notNull()
      .references(() => classes.id),
    campusId: text("campus_id")
      .notNull()
      .references(() => campuses.id),
    streamId: text("stream_id").references(() => streams.id),
    name: text("name").notNull(),
    capacity: integer("capacity").notNull().default(40),
    ...time(),
  },
  (t) => [
    index("section_scope").on(t.institutionId, t.academicYearId, t.classId),
  ],
);
export const parents = sqliteTable(
  "parents",
  {
    id: id(),
    ...tenant(),
    fatherName: text("father_name").notNull().default(""),
    motherName: text("mother_name").notNull().default(""),
    guardianName: text("guardian_name").notNull(),
    mobile: text("mobile").notNull(),
    alternateMobile: text("alternate_mobile"),
    email: text("email"),
    address: text("address").notNull().default(""),
    occupation: text("occupation").notNull().default(""),
    relationship: text("relationship").notNull().default("Father"),
    smsConsent: integer("sms_consent").notNull().default(0),
    ...time(),
  },
  (t) => [index("parent_contact").on(t.institutionId, t.mobile)],
);
export const students = sqliteTable(
  "students",
  {
    id: id(),
    ...tenant(),
    admissionNumber: text("admission_number").notNull(),
    name: text("name").notNull(),
    dob: text("dob"),
    gender: text("gender").notNull().default("Not specified"),
    photoKey: text("photo_key"),
    aadhaarLast4: text("aadhaar_last4"),
    bloodGroup: text("blood_group"),
    admissionDate: text("admission_date").notNull(),
    previousSchool: text("previous_school").notNull().default(""),
    status: text("status").notNull().default("Active"),
    ...time(),
  },
  (t) => [
    uniqueIndex("student_admission").on(t.institutionId, t.admissionNumber),
    index("student_name").on(t.institutionId, t.name),
  ],
);
export const studentParents = sqliteTable(
  "student_parents",
  {
    id: id(),
    ...tenant(),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id),
    parentId: text("parent_id")
      .notNull()
      .references(() => parents.id),
    primary: integer("is_primary").notNull().default(1),
  },
  (t) => [
    uniqueIndex("student_parent_link").on(
      t.institutionId,
      t.studentId,
      t.parentId,
    ),
  ],
);
export const enrollments = sqliteTable(
  "enrollments",
  {
    id: id(),
    ...tenant(),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id),
    academicYearId: text("academic_year_id")
      .notNull()
      .references(() => academicYears.id),
    sectionId: text("section_id")
      .notNull()
      .references(() => sections.id),
    rollNumber: text("roll_number"),
    clearance: text("clearance").notNull().default("Pending"),
    ...time(),
  },
  (t) => [
    uniqueIndex("student_year").on(
      t.institutionId,
      t.studentId,
      t.academicYearId,
    ),
    index("student_roll_lookup").on(t.institutionId, t.rollNumber),
    index("enrollment_scope").on(
      t.institutionId,
      t.academicYearId,
      t.sectionId,
    ),
  ],
);
export const users = sqliteTable(
  "users",
  {
    id: id(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    ...time(),
  },
  (t) => [index("user_email_lookup").on(t.email)],
);
export const memberships = sqliteTable(
  "memberships",
  {
    id: id(),
    ...tenant(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    role: text("role").notNull(),
    displayName: text("display_name").notNull().default(""),
    mobile: text("mobile").notNull().default(""),
    permissions: text("permissions").notNull().default("[]"),
    parentId: text("parent_id").references(() => parents.id),
    studentId: text("student_id").references(() => students.id),
    sectionId: text("section_id").references(() => sections.id),
    feeVisibility: integer("fee_visibility").notNull().default(0),
    active: integer("active").notNull().default(1),
    ...time(),
  },
  (t) => [
    uniqueIndex("membership_user").on(t.institutionId, t.userId),
    index("membership_user_lookup").on(t.userId, t.active),
  ],
);
export const invitations = sqliteTable(
  "invitations",
  {
    id: id(),
    ...tenant(),
    email: text("email").notNull(),
    role: text("role").notNull(),
    displayName: text("display_name").notNull().default(""),
    mobile: text("mobile").notNull().default(""),
    permissions: text("permissions").notNull().default("[]"),
    parentId: text("parent_id"),
    studentId: text("student_id"),
    sectionId: text("section_id"),
    feeVisibility: integer("fee_visibility").notNull().default(0),
    status: text("status").notNull().default("Pending"),
    ...time(),
  },
  (t) => [
    uniqueIndex("invitation_email").on(t.institutionId, t.email),
    index("invitation_email_lookup").on(t.email, t.status),
  ],
);
export const feeComponents = sqliteTable(
  "fee_components",
  {
    id: id(),
    ...tenant(),
    name: text("name").notNull(),
    category: text("category").notNull().default("Academic"),
    active: integer("active").notNull().default(1),
    sortOrder: integer("sort_order").notNull().default(0),
    ...time(),
  },
  (t) => [uniqueIndex("fee_component_name").on(t.institutionId, t.name)],
);
export const feeStructures = sqliteTable(
  "fee_structures",
  {
    id: id(),
    ...tenant(),
    academicYearId: text("academic_year_id")
      .notNull()
      .references(() => academicYears.id),
    classId: text("class_id")
      .notNull()
      .references(() => classes.id),
    sectionId: text("section_id").references(() => sections.id),
    streamId: text("stream_id").references(() => streams.id),
    name: text("name").notNull(),
    frequency: text("frequency").notNull().default("Quarterly"),
    schedule: text("schedule").notNull(),
    status: text("status").notNull().default("Active"),
    ...time(),
  },
  (t) => [
    index("structure_scope").on(t.institutionId, t.academicYearId, t.classId),
    index("fees_tenant_year_status").on(
      t.institutionId,
      t.academicYearId,
      t.status,
    ),
  ],
);
export const feeStructureItems = sqliteTable("fee_structure_items", {
  id: id(),
  ...tenant(),
  structureId: text("structure_id")
    .notNull()
    .references(() => feeStructures.id),
  componentId: text("component_id")
    .notNull()
    .references(() => feeComponents.id),
  amountPaise: integer("amount_paise").notNull(),
});
export const benefits = sqliteTable("benefits", {
  id: id(),
  ...tenant(),
  name: text("name").notNull(),
  kind: text("kind").notNull(),
  calculation: text("calculation").notNull().default("Fixed"),
  value: integer("value").notNull(),
  componentId: text("component_id").references(() => feeComponents.id),
  installmentIndex: integer("installment_index"),
  recurring: integer("recurring").notNull().default(0),
  autoApply: integer("auto_apply").notNull().default(0),
  eligibility: text("eligibility").notNull().default(""),
  validUntil: text("valid_until"),
  status: text("status").notNull().default("Active"),
  ...time(),
});
export const assignments = sqliteTable(
  "student_fee_assignments",
  {
    id: id(),
    ...tenant(),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id),
    academicYearId: text("academic_year_id")
      .notNull()
      .references(() => academicYears.id),
    structureId: text("structure_id")
      .notNull()
      .references(() => feeStructures.id),
    discountPaise: integer("discount_paise").notNull().default(0),
    scholarshipPaise: integer("scholarship_paise").notNull().default(0),
    reason: text("reason").notNull().default(""),
    ...time(),
  },
  (t) => [
    uniqueIndex("assignment_unique").on(
      t.institutionId,
      t.studentId,
      t.academicYearId,
      t.structureId,
    ),
  ],
);
export const invoices = sqliteTable(
  "invoices",
  {
    id: id(),
    ...tenant(),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id),
    academicYearId: text("academic_year_id")
      .notNull()
      .references(() => academicYears.id),
    assignmentId: text("assignment_id")
      .notNull()
      .unique()
      .references(() => assignments.id),
    number: text("number"),
    grossPaise: integer("gross_paise").notNull(),
    discountPaise: integer("discount_paise").notNull().default(0),
    scholarshipPaise: integer("scholarship_paise").notNull().default(0),
    netPaise: integer("net_paise").notNull(),
    issuedDate: text("issued_date").notNull(),
    dueDate: text("due_date").notNull(),
    ...time(),
  },
  (t) => [
    uniqueIndex("invoice_number").on(t.institutionId, t.number),
    index("invoice_scope").on(t.institutionId, t.academicYearId, t.studentId),
  ],
);
export const invoiceItems = sqliteTable("invoice_items", {
  id: id(),
  ...tenant(),
  invoiceId: text("invoice_id")
    .notNull()
    .references(() => invoices.id),
  componentId: text("component_id")
    .notNull()
    .references(() => feeComponents.id),
  name: text("name").notNull(),
  amountPaise: integer("amount_paise").notNull(),
});
export const installments = sqliteTable(
  "installments",
  {
    id: id(),
    ...tenant(),
    invoiceId: text("invoice_id")
      .notNull()
      .references(() => invoices.id),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id),
    academicYearId: text("academic_year_id")
      .notNull()
      .references(() => academicYears.id),
    title: text("title").notNull(),
    amountPaise: integer("amount_paise").notNull(),
    dueDate: text("due_date").notNull(),
    sortOrder: integer("sort_order").notNull(),
    ...time(),
  },
  (t) => [
    index("installment_due").on(t.institutionId, t.academicYearId, t.dueDate),
  ],
);
export const adjustments = sqliteTable("fee_adjustments", {
  id: id(),
  ...tenant(),
  studentId: text("student_id")
    .notNull()
    .references(() => students.id),
  academicYearId: text("academic_year_id")
    .notNull()
    .references(() => academicYears.id),
  invoiceId: text("invoice_id")
    .notNull()
    .references(() => invoices.id),
  installmentId: text("installment_id")
    .notNull()
    .references(() => installments.id),
  componentId: text("component_id"),
  benefitId: text("benefit_id"),
  kind: text("kind").notNull(),
  amountPaise: integer("amount_paise").notNull(),
  reason: text("reason").notNull(),
  approvedBy: text("approved_by").notNull(),
  ...time(),
});
export const payments = sqliteTable(
  "payments",
  {
    id: id(),
    ...tenant(),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id),
    academicYearId: text("academic_year_id")
      .notNull()
      .references(() => academicYears.id),
    amountPaise: integer("amount_paise").notNull(),
    method: text("method").notNull(),
    status: text("status").notNull(),
    reference: text("reference"),
    idempotencyKey: text("idempotency_key").notNull(),
    requestHash: text("request_hash").notNull(),
    gateway: text("gateway"),
    gatewayOrderId: text("gateway_order_id"),
    gatewayTransactionId: text("gateway_transaction_id"),
    paidAt: text("paid_at").notNull(),
    notes: text("notes").notNull().default(""),
    ...time(),
  },
  (t) => [
    uniqueIndex("payment_idempotency").on(t.institutionId, t.idempotencyKey),
    uniqueIndex("gateway_transaction").on(t.gateway, t.gatewayTransactionId),
    uniqueIndex("gateway_order").on(t.gateway, t.gatewayOrderId),
    index("payment_scope").on(t.institutionId, t.academicYearId, t.paidAt),
    index("payments_student_created_desc").on(
      t.institutionId,
      t.studentId,
      sql`${t.createdAt} DESC`,
    ),
  ],
);
export const paymentAllocations = sqliteTable("payment_allocations", {
  id: id(),
  ...tenant(),
  paymentId: text("payment_id")
    .notNull()
    .references(() => payments.id),
  invoiceId: text("invoice_id")
    .notNull()
    .references(() => invoices.id),
  installmentId: text("installment_id")
    .notNull()
    .references(() => installments.id),
  amountPaise: integer("amount_paise").notNull(),
});
export const receipts = sqliteTable(
  "receipts",
  {
    id: id(),
    ...tenant(),
    paymentId: text("payment_id")
      .notNull()
      .unique()
      .references(() => payments.id),
    academicYearId: text("academic_year_id")
      .notNull()
      .references(() => academicYears.id),
    number: text("number"),
    ...time(),
  },
  (t) => [uniqueIndex("receipt_number").on(t.institutionId, t.number)],
);
export const refunds = sqliteTable(
  "refunds",
  {
    id: id(),
    ...tenant(),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id),
    academicYearId: text("academic_year_id")
      .notNull()
      .references(() => academicYears.id),
    paymentId: text("payment_id")
      .notNull()
      .references(() => payments.id),
    amountPaise: integer("amount_paise").notNull(),
    method: text("method").notNull(),
    reference: text("reference"),
    reason: text("reason").notNull(),
    status: text("status").notNull().default("Requested"),
    approvedBy: text("approved_by"),
    refundedAt: text("refunded_at"),
    idempotencyKey: text("idempotency_key").notNull(),
    ...time(),
  },
  (t) => [
    uniqueIndex("refund_idempotency").on(t.institutionId, t.idempotencyKey),
  ],
);
export const refundAllocations = sqliteTable("refund_allocations", {
  id: id(),
  ...tenant(),
  refundId: text("refund_id")
    .notNull()
    .references(() => refunds.id),
  allocationId: text("allocation_id")
    .notNull()
    .references(() => paymentAllocations.id),
  installmentId: text("installment_id")
    .notNull()
    .references(() => installments.id),
  amountPaise: integer("amount_paise").notNull(),
});
export const ledger = sqliteTable(
  "ledger_entries",
  {
    id: id(),
    ...tenant(),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id),
    academicYearId: text("academic_year_id")
      .notNull()
      .references(() => academicYears.id),
    invoiceId: text("invoice_id").references(() => invoices.id),
    paymentId: text("payment_id").references(() => payments.id),
    refundId: text("refund_id").references(() => refunds.id),
    adjustmentId: text("adjustment_id").references(() => adjustments.id),
    kind: text("kind").notNull(),
    description: text("description").notNull(),
    debitPaise: integer("debit_paise").notNull().default(0),
    creditPaise: integer("credit_paise").notNull().default(0),
    entryDate: text("entry_date").notNull(),
    ...time(),
  },
  (t) => [
    index("ledger_student_year").on(
      t.institutionId,
      t.studentId,
      t.academicYearId,
      t.entryDate,
    ),
  ],
);
export const lateFeeRuns = sqliteTable(
  "late_fee_runs",
  {
    id: id(),
    ...tenant(),
    installmentId: text("installment_id")
      .notNull()
      .references(() => installments.id),
    period: text("period").notNull(),
    amountPaise: integer("amount_paise").notNull(),
    ...time(),
  },
  (t) => [
    uniqueIndex("late_fee_period").on(
      t.institutionId,
      t.installmentId,
      t.period,
    ),
  ],
);
export const paymentLinks = sqliteTable("payment_links", {
  id: id(),
  ...tenant(),
  tokenHash: text("token_hash").notNull().unique(),
  studentId: text("student_id")
    .notNull()
    .references(() => students.id),
  academicYearId: text("academic_year_id")
    .notNull()
    .references(() => academicYears.id),
  amountPaise: integer("amount_paise").notNull(),
  expiresAt: text("expires_at").notNull(),
  status: text("status").notNull().default("Active"),
  ...time(),
});
export const gatewayEvents = sqliteTable(
  "gateway_events",
  {
    id: id(),
    ...tenant(),
    gateway: text("gateway").notNull(),
    eventId: text("event_id").notNull(),
    payloadHash: text("payload_hash").notNull(),
    status: text("status").notNull(),
    ...time(),
  },
  (t) => [uniqueIndex("gateway_event_unique").on(t.gateway, t.eventId)],
);
export const reconciliation = sqliteTable(
  "reconciliation_records",
  {
    id: id(),
    ...tenant(),
    academicYearId: text("academic_year_id")
      .notNull()
      .references(() => academicYears.id),
    transactionId: text("transaction_id").notNull(),
    amountPaise: integer("amount_paise").notNull(),
    transactionDate: text("transaction_date").notNull(),
    studentId: text("student_id"),
    invoiceId: text("invoice_id"),
    paymentId: text("payment_id").references(() => payments.id),
    status: text("status").notNull(),
    notes: text("notes").notNull().default(""),
    importBatch: text("import_batch").notNull(),
    ...time(),
  },
  (t) => [
    index("reconciliation_scope").on(
      t.institutionId,
      t.academicYearId,
      t.transactionId,
    ),
  ],
);
export const notifications = sqliteTable(
  "notifications",
  {
    id: id(),
    ...tenant(),
    academicYearId: text("academic_year_id").references(() => academicYears.id),
    parentId: text("parent_id").references(() => parents.id),
    studentId: text("student_id").references(() => students.id),
    recipient: text("recipient").notNull(),
    channel: text("channel").notNull(),
    message: text("message").notNull(),
    status: text("status").notNull().default("Queued"),
    referenceId: text("reference_id"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    sentAt: text("sent_at"),
    deliveredAt: text("delivered_at"),
    dedupeKey: text("dedupe_key"),
    metadata: text("metadata").notNull().default("{}"),
    ...time(),
  },
  (t) => [
    uniqueIndex("notification_dedupe").on(t.institutionId, t.dedupeKey),
    index("notification_queue").on(t.status, t.createdAt),
  ],
);
export const cashEntries = sqliteTable("cash_entries", {
  id: id(),
  ...tenant(),
  campusId: text("campus_id")
    .notNull()
    .references(() => campuses.id),
  academicYearId: text("academic_year_id")
    .notNull()
    .references(() => academicYears.id),
  kind: text("kind").notNull(),
  amountPaise: integer("amount_paise").notNull(),
  entryDate: text("entry_date").notNull(),
  reference: text("reference").notNull().default(""),
  notes: text("notes").notNull().default(""),
  ...time(),
});
export const cashClosings = sqliteTable(
  "cash_closings",
  {
    id: id(),
    ...tenant(),
    campusId: text("campus_id")
      .notNull()
      .references(() => campuses.id),
    entryDate: text("entry_date").notNull(),
    expectedPaise: integer("expected_paise").notNull(),
    countedPaise: integer("counted_paise").notNull(),
    variancePaise: integer("variance_paise").notNull(),
    denominations: text("denominations").notNull().default("{}"),
    notes: text("notes").notNull().default(""),
    ...time(),
  },
  (t) => [
    uniqueIndex("cash_close_day").on(t.institutionId, t.campusId, t.entryDate),
  ],
);
export const auditLogs = sqliteTable(
  "audit_logs",
  {
    id: id(),
    ...tenant(),
    userId: text("user_id").notNull(),
    userName: text("user_name").notNull(),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: text("entity_id").notNull(),
    oldValue: text("old_value"),
    newValue: text("new_value"),
    ip: text("ip"),
    userAgent: text("user_agent"),
    supportSessionId: text("support_session_id"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("audit_tenant_time").on(t.institutionId, t.createdAt)],
);
export const jobs = sqliteTable(
  "job_runs",
  {
    id: id(),
    ...tenant(),
    kind: text("kind").notNull(),
    runKey: text("run_key").notNull(),
    status: text("status").notNull(),
    result: text("result"),
    ...time(),
  },
  (t) => [uniqueIndex("job_run_key").on(t.institutionId, t.kind, t.runKey)],
);
export const rateLimits = sqliteTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  window: integer("window").notNull(),
});
export const paymentIntents = sqliteTable("payment_intents", {
  id: id(),
  ...tenant(),
  paymentId: text("payment_id")
    .notNull()
    .unique()
    .references(() => payments.id),
  allocations: text("allocations").notNull(),
  ...time(),
});
export const providerConfigs = sqliteTable(
  "provider_configs",
  {
    id: id(),
    ...tenant(),
    provider: text("provider").notNull(),
    ciphertext: text("ciphertext").notNull(),
    mode: text("mode").notNull(),
    ...time(),
  },
  (t) => [
    uniqueIndex("provider_config_tenant").on(t.institutionId, t.provider),
  ],
);

// A balanced journal event always transfers one exact paise amount between two
// accounts. journal_postings projects the debit and credit legs. Events and
// their source ledger records are immutable; corrections append reversals.
export const journalEvents = sqliteTable(
  "journal_events",
  {
    id: id(),
    ...tenant(),
    ledgerEntryId: text("ledger_entry_id")
      .notNull()
      .unique()
      .references(() => ledger.id),
    academicYearId: text("academic_year_id")
      .notNull()
      .references(() => academicYears.id),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id),
    eventType: text("event_type").notNull(),
    debitAccount: text("debit_account").notNull(),
    creditAccount: text("credit_account").notNull(),
    amountPaise: integer("amount_paise").notNull(),
    reversalOf: text("reversal_of"),
    description: text("description").notNull(),
    entryDate: text("entry_date").notNull(),
    createdAt: text("created_at").notNull(),
    createdBy: text("created_by").notNull(),
  },
  (t) => [
    index("journal_student_year").on(
      t.institutionId,
      t.studentId,
      t.academicYearId,
      t.createdAt,
    ),
  ],
);

export const apiIdempotency = sqliteTable(
  "api_idempotency",
  {
    id: id(),
    ...tenant(),
    key: text("key").notNull(),
    operation: text("operation").notNull(),
    requestHash: text("request_hash").notNull(),
    response: text("response"),
    statusCode: integer("status_code"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("api_idempotency_scope").on(
      t.institutionId,
      t.operation,
      t.key,
    ),
  ],
);

export const notificationOutbox = sqliteTable(
  "notification_outbox",
  {
    id: id(),
    ...tenant(),
    paymentId: text("payment_id")
      .notNull()
      .unique()
      .references(() => payments.id),
    state: text("state").notNull().default("Queued"),
    attempts: integer("attempts").notNull().default(0),
    availableAt: text("available_at").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [index("outbox_ready").on(t.institutionId, t.state, t.availableAt)],
);

export const organizationMembers = sqliteTable(
  "organization_members",
  {
    id: id(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    email: text("email").notNull(),
    active: integer("active").notNull().default(1),
    ...time(),
  },
  (t) => [
    uniqueIndex("organization_member_email").on(t.organizationId, t.email),
  ],
);

export const parentPortalGrants = sqliteTable(
  "parent_portal_grants",
  {
    id: id(),
    ...tenant(),
    parentId: text("parent_id")
      .notNull()
      .references(() => parents.id),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: text("expires_at").notNull(),
    revokedAt: text("revoked_at"),
    purpose: text("purpose").notNull(),
    ...time(),
  },
  (t) => [
    index("parent_grant_scope").on(t.institutionId, t.parentId, t.expiresAt),
  ],
);

export const documentArtifacts = sqliteTable(
  "document_artifacts",
  {
    id: id(),
    ...tenant(),
    receiptId: text("receipt_id")
      .notNull()
      .references(() => receipts.id),
    objectKey: text("object_key").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [uniqueIndex("receipt_artifact").on(t.institutionId, t.receiptId)],
);
export const documentJobs = sqliteTable(
  "document_jobs",
  {
    id: id(),
    ...tenant(),
    receiptId: text("receipt_id")
      .notNull()
      .references(() => receipts.id),
    state: text("state").notNull().default("Queued"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [
    uniqueIndex("document_job_receipt").on(t.institutionId, t.receiptId),
    index("document_jobs_ready").on(t.institutionId, t.state),
  ],
);
export const communicationSettings = sqliteTable(
  "communication_settings",
  {
    id: id(),
    ...tenant(),
    configuration: text("configuration").notNull(),
    ...time(),
  },
  (t) => [uniqueIndex("communications_tenant").on(t.institutionId)],
);

export const webhookInbox = sqliteTable(
  "webhook_inbox",
  {
    id: id(),
    ...tenant(),
    provider: text("provider").notNull(),
    eventId: text("event_id").notNull(),
    payloadHash: text("payload_hash").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("webhook_inbox_event").on(
      t.institutionId,
      t.provider,
      t.eventId,
    ),
  ],
);

// Tax certificates require approved, explicit allocation evidence. No inference
// from a fee component's display name, and no conversion of tuition into donations.
export const tuitionAllocations = sqliteTable(
  "tuition_allocations",
  {
    id: id(),
    ...tenant(),
    paymentId: text("payment_id")
      .notNull()
      .references(() => payments.id),
    amountPaise: integer("amount_paise").notNull(),
    reason: text("reason").notNull(),
    approvedBy: text("approved_by").notNull(),
    ...time(),
  },
  (t) => [
    uniqueIndex("tuition_payment_basis").on(t.institutionId, t.paymentId),
  ],
);
export const donationCertificates = sqliteTable(
  "donation_certificates",
  {
    id: id(),
    ...tenant(),
    parentId: text("parent_id")
      .notNull()
      .references(() => parents.id),
    financialYear: integer("financial_year").notNull(),
    donationReference: text("donation_reference").notNull(),
    amountPaise: integer("amount_paise").notNull(),
    urn: text("urn").notNull(),
    doneePan: text("donee_pan").notNull(),
    form10bdAcknowledgement: text("form10bd_acknowledgement").notNull(),
    objectKey: text("object_key").notNull(),
    fileHash: text("file_hash").notNull(),
    ...time(),
  },
  (t) => [
    uniqueIndex("donation_reference_scope").on(
      t.institutionId,
      t.donationReference,
    ),
  ],
);

export const yearRollovers = sqliteTable(
  "year_rollovers",
  {
    id: id(),
    ...tenant(),
    sourceYearId: text("source_year_id")
      .notNull()
      .references(() => academicYears.id),
    targetYearId: text("target_year_id")
      .notNull()
      .references(() => academicYears.id),
    mapping: text("mapping").notNull(),
    status: text("status").notNull().default("Running"),
    reason: text("reason").notNull(),
    approvedBy: text("approved_by").notNull(),
    cursor: text("cursor").notNull().default(""),
    snapshot: text("snapshot").notNull(),
    ...time(),
  },
  (t) => [
    uniqueIndex("rollover_source_year").on(t.institutionId, t.sourceYearId),
  ],
);
export const rolloverStudents = sqliteTable(
  "rollover_students",
  {
    id: id(),
    ...tenant(),
    rolloverId: text("rollover_id")
      .notNull()
      .references(() => yearRollovers.id),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id),
    amountPaise: integer("amount_paise").notNull(),
    targetInvoiceId: text("target_invoice_id"),
    sourceSnapshot: text("source_snapshot").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [uniqueIndex("rollover_student_once").on(t.rolloverId, t.studentId)],
);
export const balanceCarryforwards = sqliteTable(
  "balance_carryforwards",
  {
    id: id(),
    ...tenant(),
    rolloverId: text("rollover_id")
      .notNull()
      .references(() => yearRollovers.id),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id),
    sourceInstallmentId: text("source_installment_id")
      .notNull()
      .references(() => installments.id),
    targetInvoiceId: text("target_invoice_id")
      .notNull()
      .references(() => invoices.id),
    amountPaise: integer("amount_paise").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("carry_installment_once").on(
      t.institutionId,
      t.sourceInstallmentId,
    ),
  ],
);

export const hardwareDevices = sqliteTable("hardware_devices", {
  id: id(),
  ...tenant(),
  name: text("name").notNull(),
  active: integer("active").notNull().default(1),
  ...time(),
});
export const rfidCards = sqliteTable(
  "rfid_cards",
  {
    id: id(),
    ...tenant(),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id),
    uidHash: text("uid_hash").notNull(),
    active: integer("active").notNull().default(1),
    ...time(),
  },
  (t) => [uniqueIndex("rfid_card_scope").on(t.institutionId, t.uidHash)],
);
export const attendanceEvents = sqliteTable(
  "attendance_events",
  {
    id: id(),
    ...tenant(),
    deviceId: text("device_id")
      .notNull()
      .references(() => hardwareDevices.id),
    eventId: text("event_id").notNull(),
    nonce: text("nonce").notNull(),
    payloadHash: text("payload_hash").notNull(),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id),
    punchedAt: text("punched_at").notNull(),
    localDate: text("local_date").notNull(),
    direction: text("direction").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("hardware_event_once").on(t.deviceId, t.eventId),
    uniqueIndex("hardware_nonce_once").on(t.deviceId, t.nonce),
    index("attendance_student_day").on(
      t.institutionId,
      t.studentId,
      t.localDate,
    ),
  ],
);
export const dailyFeeRules = sqliteTable(
  "daily_fee_rules",
  {
    id: id(),
    ...tenant(),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id),
    installmentId: text("installment_id")
      .notNull()
      .references(() => installments.id),
    service: text("service").notNull(),
    amountPaise: integer("amount_paise").notNull(),
    active: integer("active").notNull().default(1),
    ...time(),
  },
  (t) => [
    uniqueIndex("daily_service_student").on(
      t.institutionId,
      t.studentId,
      t.service,
    ),
  ],
);
export const dailyFeeCharges = sqliteTable(
  "daily_fee_charges",
  {
    id: id(),
    ...tenant(),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id),
    attendanceId: text("attendance_id")
      .notNull()
      .references(() => attendanceEvents.id),
    ruleId: text("rule_id")
      .notNull()
      .references(() => dailyFeeRules.id),
    adjustmentId: text("adjustment_id")
      .notNull()
      .references(() => adjustments.id),
    service: text("service").notNull(),
    localDate: text("local_date").notNull(),
    amountPaise: integer("amount_paise").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("daily_charge_once").on(
      t.institutionId,
      t.studentId,
      t.service,
      t.localDate,
    ),
  ],
);

export const bankImportBatches = sqliteTable(
  "bank_import_batches",
  {
    id: id(),
    ...tenant(),
    academicYearId: text("academic_year_id")
      .notNull()
      .references(() => academicYears.id),
    fingerprint: text("fingerprint").notNull(),
    rows: text("rows").notNull(),
    createdAt: text("created_at").notNull(),
    createdBy: text("created_by").notNull(),
  },
  (t) => [
    uniqueIndex("bank_import_fingerprint").on(
      t.institutionId,
      t.academicYearId,
      t.fingerprint,
    ),
  ],
);
export const bankPostedRows = sqliteTable(
  "bank_posted_rows",
  {
    id: id(),
    ...tenant(),
    batchId: text("batch_id")
      .notNull()
      .references(() => bankImportBatches.id),
    rowKey: text("row_key").notNull(),
    transactionId: text("transaction_id").notNull(),
    paymentId: text("payment_id").references(() => payments.id),
    reconciliationId: text("reconciliation_id")
      .notNull()
      .references(() => reconciliation.id),
    createdAt: text("created_at").notNull(),
  },
  (t) => [uniqueIndex("bank_row_once").on(t.institutionId, t.transactionId)],
);
```


### `drizzle/0007_salty_ikaris.sql`

```sql
CREATE TABLE `attendance_events` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`device_id` text NOT NULL,
	`event_id` text NOT NULL,
	`nonce` text NOT NULL,
	`payload_hash` text NOT NULL,
	`student_id` text NOT NULL,
	`punched_at` text NOT NULL,
	`local_date` text NOT NULL,
	`direction` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`device_id`) REFERENCES `hardware_devices`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `hardware_event_once` ON `attendance_events` (`device_id`,`event_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `hardware_nonce_once` ON `attendance_events` (`device_id`,`nonce`);--> statement-breakpoint
CREATE INDEX `attendance_student_day` ON `attendance_events` (`institution_id`,`student_id`,`local_date`);--> statement-breakpoint
CREATE TABLE `balance_carryforwards` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`rollover_id` text NOT NULL,
	`student_id` text NOT NULL,
	`source_installment_id` text NOT NULL,
	`target_invoice_id` text NOT NULL,
	`amount_paise` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`rollover_id`) REFERENCES `year_rollovers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_installment_id`) REFERENCES `installments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`target_invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `carry_installment_once` ON `balance_carryforwards` (`institution_id`,`source_installment_id`);--> statement-breakpoint
CREATE TABLE `bank_import_batches` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`academic_year_id` text NOT NULL,
	`fingerprint` text NOT NULL,
	`rows` text NOT NULL,
	`created_at` text NOT NULL,
	`created_by` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bank_import_fingerprint` ON `bank_import_batches` (`institution_id`,`academic_year_id`,`fingerprint`);--> statement-breakpoint
CREATE TABLE `bank_posted_rows` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`batch_id` text NOT NULL,
	`row_key` text NOT NULL,
	`transaction_id` text NOT NULL,
	`payment_id` text,
	`reconciliation_id` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`batch_id`) REFERENCES `bank_import_batches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reconciliation_id`) REFERENCES `reconciliation_records`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bank_row_once` ON `bank_posted_rows` (`institution_id`,`transaction_id`);--> statement-breakpoint
CREATE TABLE `communication_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`configuration` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `communications_tenant` ON `communication_settings` (`institution_id`);--> statement-breakpoint
CREATE TABLE `daily_fee_charges` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`student_id` text NOT NULL,
	`attendance_id` text NOT NULL,
	`rule_id` text NOT NULL,
	`adjustment_id` text NOT NULL,
	`service` text NOT NULL,
	`local_date` text NOT NULL,
	`amount_paise` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`attendance_id`) REFERENCES `attendance_events`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`rule_id`) REFERENCES `daily_fee_rules`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`adjustment_id`) REFERENCES `fee_adjustments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `daily_charge_once` ON `daily_fee_charges` (`institution_id`,`student_id`,`service`,`local_date`);--> statement-breakpoint
CREATE TABLE `daily_fee_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`student_id` text NOT NULL,
	`installment_id` text NOT NULL,
	`service` text NOT NULL,
	`amount_paise` integer NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`installment_id`) REFERENCES `installments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `daily_service_student` ON `daily_fee_rules` (`institution_id`,`student_id`,`service`);--> statement-breakpoint
CREATE TABLE `document_artifacts` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`receipt_id` text NOT NULL,
	`object_key` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`receipt_id`) REFERENCES `receipts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `receipt_artifact` ON `document_artifacts` (`institution_id`,`receipt_id`);--> statement-breakpoint
CREATE TABLE `document_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`receipt_id` text NOT NULL,
	`state` text DEFAULT 'Queued' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`receipt_id`) REFERENCES `receipts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `document_job_receipt` ON `document_jobs` (`institution_id`,`receipt_id`);--> statement-breakpoint
CREATE INDEX `document_jobs_ready` ON `document_jobs` (`institution_id`,`state`);--> statement-breakpoint
CREATE TABLE `donation_certificates` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`parent_id` text NOT NULL,
	`financial_year` integer NOT NULL,
	`donation_reference` text NOT NULL,
	`amount_paise` integer NOT NULL,
	`urn` text NOT NULL,
	`donee_pan` text NOT NULL,
	`form10bd_acknowledgement` text NOT NULL,
	`object_key` text NOT NULL,
	`file_hash` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`parent_id`) REFERENCES `parents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `donation_reference_scope` ON `donation_certificates` (`institution_id`,`donation_reference`);--> statement-breakpoint
CREATE TABLE `hardware_devices` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`name` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `organization_members` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`email` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `organization_member_email` ON `organization_members` (`organization_id`,`email`);--> statement-breakpoint
CREATE TABLE `organizations` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`status` text DEFAULT 'Active' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `parent_portal_grants` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`parent_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` text NOT NULL,
	`revoked_at` text,
	`purpose` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`parent_id`) REFERENCES `parents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `parent_portal_grants_token_hash_unique` ON `parent_portal_grants` (`token_hash`);--> statement-breakpoint
CREATE INDEX `parent_grant_scope` ON `parent_portal_grants` (`institution_id`,`parent_id`,`expires_at`);--> statement-breakpoint
CREATE TABLE `rfid_cards` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`student_id` text NOT NULL,
	`uid_hash` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rfid_card_scope` ON `rfid_cards` (`institution_id`,`uid_hash`);--> statement-breakpoint
CREATE TABLE `rollover_students` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`rollover_id` text NOT NULL,
	`student_id` text NOT NULL,
	`amount_paise` integer NOT NULL,
	`target_invoice_id` text,
	`source_snapshot` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`rollover_id`) REFERENCES `year_rollovers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rollover_student_once` ON `rollover_students` (`rollover_id`,`student_id`);--> statement-breakpoint
CREATE TABLE `tuition_allocations` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`payment_id` text NOT NULL,
	`amount_paise` integer NOT NULL,
	`reason` text NOT NULL,
	`approved_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tuition_payment_basis` ON `tuition_allocations` (`institution_id`,`payment_id`);--> statement-breakpoint
CREATE TABLE `webhook_inbox` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`provider` text NOT NULL,
	`event_id` text NOT NULL,
	`payload_hash` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `webhook_inbox_event` ON `webhook_inbox` (`institution_id`,`provider`,`event_id`);--> statement-breakpoint
CREATE TABLE `year_rollovers` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`source_year_id` text NOT NULL,
	`target_year_id` text NOT NULL,
	`mapping` text NOT NULL,
	`status` text DEFAULT 'Running' NOT NULL,
	`reason` text NOT NULL,
	`approved_by` text NOT NULL,
	`cursor` text DEFAULT '' NOT NULL,
	`snapshot` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_year_id`) REFERENCES `academic_years`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`target_year_id`) REFERENCES `academic_years`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rollover_source_year` ON `year_rollovers` (`institution_id`,`source_year_id`);--> statement-breakpoint
ALTER TABLE `institutions` ADD `organization_id` text REFERENCES organizations(id);--> statement-breakpoint
ALTER TABLE `notifications` ADD `metadata` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `parents` ADD `sms_consent` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
CREATE TRIGGER scope_attendance_events_insert BEFORE INSERT ON attendance_events BEGIN SELECT (CASE WHEN NEW.device_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM hardware_devices r WHERE r.id=NEW.device_id AND r.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.student_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM students r WHERE r.id=NEW.student_id AND r.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); END;
--> statement-breakpoint
CREATE TRIGGER scope_attendance_events_update BEFORE UPDATE ON attendance_events BEGIN SELECT (CASE WHEN NEW.device_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM hardware_devices r WHERE r.id=NEW.device_id AND r.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.student_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM students r WHERE r.id=NEW.student_id AND r.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); END;
--> statement-breakpoint
CREATE TRIGGER scope_balance_carryforwards_insert BEFORE INSERT ON balance_carryforwards BEGIN SELECT (CASE WHEN NEW.rollover_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM year_rollovers r WHERE r.id=NEW.rollover_id AND r.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.student_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM students r WHERE r.id=NEW.student_id AND r.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.source_installment_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM installments r WHERE r.id=NEW.source_installment_id AND r.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.target_invoice_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM invoices r WHERE r.id=NEW.target_invoice_id AND r.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); END;
--> statement-breakpoint
CREATE TRIGGER scope_balance_carryforwards_update BEFORE UPDATE ON balance_carryforwards BEGIN SELECT (CASE WHEN NEW.rollover_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM year_rollovers r WHERE r.id=NEW.rollover_id AND r.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.student_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM students r WHERE r.id=NEW.student_id AND r.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.source_installment_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM installments r WHERE r.id=NEW.source_installment_id AND r.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.target_invoice_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM invoices r WHERE r.id=NEW.target_invoice_id AND r.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); END;
--> statement-breakpoint
CREATE TRIGGER scope_bank_import_batches_insert BEFORE INSERT ON bank_import_batches BEGIN SELECT (CASE WHEN NEW.academic_year_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM academic_years r WHERE r.id=NEW.academic_year_id AND r.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); END;
--> statement-breakpoint
CREATE TRIGGER scope_bank_import_batches_update BEFORE UPDATE ON bank_import_batches BEGIN SELECT (CASE WHEN NEW.academic_year_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM academic_years r WHERE r.id=NEW.academic_year_id AND r.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); END;
--> statement-breakpoint
CREATE TRIGGER scope_bank_posted_rows_insert BEFORE INSERT ON bank_posted_rows BEGIN SELECT (CASE WHEN NEW.batch_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM bank_import_batches r WHERE r.id=NEW.batch_id AND r.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.payment_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM payments r WHERE r.id=NEW.payment_id AND r.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.reconciliation_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM reconciliation_records r WHERE r.id=NEW.reconciliation_id AND r.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); END;
--> statement-breakpoint
CREATE TRIGGER scope_bank_posted_rows_update BEFORE UPDATE ON bank_posted_rows BEGIN SELECT (CASE WHEN NEW.batch_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM bank_import_batches r WHERE r.id=NEW.batch_id AND r.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.payment_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM payments r WHERE r.id=NEW.payment_id AND r.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.reconciliation_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM reconciliation_records r WHERE r.id=NEW.reconciliation_id AND r.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); END;
--> statement-breakpoint
CREATE TRIGGER scope_daily_fee_charges_insert BEFORE INSERT ON daily_fee_charges BEGIN SELECT (CASE WHEN NEW.student_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM students r WHERE r.id=NEW.student_id AND r.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.attendance_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM attendance_events r WHERE r.id=NEW.attendance_id AND r.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.rule_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM daily_fee_rules r WHERE r.id=NEW.rule_id AND r.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.adjustment_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM fee_adjustments r WHERE r.id=NEW.adjustment_id AND r.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); END;
--> statement-breakpoint
CREATE TRIGGER scope_daily_fee_charges_update BEFORE UPDATE ON daily_fee_charges BEGIN SELECT (CASE WHEN NEW.student_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM students r WHERE r.id=NEW.student_id AND r.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.attendance_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM attendance_events r WHERE r.id=NEW.attendance_id AND r.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.rule_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM daily_fee_rules r WHERE r.id=NEW.rule_id AND r.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.adjustment_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM fee_adjustments r WHERE r.id=NEW.adjustment_id AND r.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); END;
--> statement-breakpoint
CREATE TRIGGER scope_daily_fee_rules_insert BEFORE INSERT ON daily_fee_rules BEGIN SELECT (CASE WHEN NEW.student_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM students r WHERE r.id=NEW.student_id AND r.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.installment_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM installments r WHERE r.id=NEW.installment_id AND r.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); END;
--> statement-breakpoint
CREATE TRIGGER scope_daily_fee_rules_update BEFORE UPDATE ON daily_fee_rules BEGIN SELECT (CASE WHEN NEW.student_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM students r WHERE r.id=NEW.student_id AND r.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.installment_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM installments r WHERE r.id=NEW.installment_id AND r.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); END;
--> statement-breakpoint
CREATE TRIGGER scope_document_artifacts_insert BEFORE INSERT ON document_artifacts BEGIN SELECT (CASE WHEN NEW.receipt_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM receipts r WHERE r.id=NEW.receipt_id AND r.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); END;
--> statement-breakpoint
CREATE TRIGGER scope_document_artifacts_update BEFORE UPDATE ON document_artifacts BEGIN SELECT (CASE WHEN NEW.receipt_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM receipts r WHERE r.id=NEW.receipt_id AND r.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); END;
--> statement-breakpoint
CREATE TRIGGER scope_document_jobs_insert BEFORE INSERT ON document_jobs BEGIN SELECT (CASE WHEN NEW.receipt_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM receipts r WHERE r.id=NEW.receipt_id AND r.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); END;
--> statement-breakpoint
CREATE TRIGGER scope_document_jobs_update BEFORE UPDATE ON document_jobs BEGIN SELECT (CASE WHEN NEW.receipt_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM receipts r WHERE r.id=NEW.receipt_id AND r.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); END;
--> statement-breakpoint
CREATE TRIGGER scope_donation_certificates_insert BEFORE INSERT ON donation_certificates BEGIN SELECT (CASE WHEN NEW.parent_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM parents r WHERE r.id=NEW.parent_id AND r.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); END;
--> statement-breakpoint
CREATE TRIGGER scope_donation_certificates_update BEFORE UPDATE ON donation_certificates BEGIN SELECT (CASE WHEN NEW.parent_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM parents r WHERE r.id=NEW.parent_id AND r.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); END;
--> statement-breakpoint
CREATE TRIGGER scope_parent_portal_grants_insert BEFORE INSERT ON parent_portal_grants BEGIN SELECT (CASE WHEN NEW.parent_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM parents r WHERE r.id=NEW.parent_id AND r.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); END;
--> statement-breakpoint
CREATE TRIGGER scope_parent_portal_grants_update BEFORE UPDATE ON parent_portal_grants BEGIN SELECT (CASE WHEN NEW.parent_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM parents r WHERE r.id=NEW.parent_id AND r.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); END;
--> statement-breakpoint
CREATE TRIGGER scope_rfid_cards_insert BEFORE INSERT ON rfid_cards BEGIN SELECT (CASE WHEN NEW.student_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM students r WHERE r.id=NEW.student_id AND r.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); END;
--> statement-breakpoint
CREATE TRIGGER scope_rfid_cards_update BEFORE UPDATE ON rfid_cards BEGIN SELECT (CASE WHEN NEW.student_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM students r WHERE r.id=NEW.student_id AND r.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); END;
--> statement-breakpoint
CREATE TRIGGER scope_rollover_students_insert BEFORE INSERT ON rollover_students BEGIN SELECT (CASE WHEN NEW.rollover_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM year_rollovers r WHERE r.id=NEW.rollover_id AND r.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.student_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM students r WHERE r.id=NEW.student_id AND r.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); END;
--> statement-breakpoint
CREATE TRIGGER scope_rollover_students_update BEFORE UPDATE ON rollover_students BEGIN SELECT (CASE WHEN NEW.rollover_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM year_rollovers r WHERE r.id=NEW.rollover_id AND r.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.student_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM students r WHERE r.id=NEW.student_id AND r.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); END;
--> statement-breakpoint
CREATE TRIGGER scope_tuition_allocations_insert BEFORE INSERT ON tuition_allocations BEGIN SELECT (CASE WHEN NEW.payment_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM payments r WHERE r.id=NEW.payment_id AND r.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); END;
--> statement-breakpoint
CREATE TRIGGER scope_tuition_allocations_update BEFORE UPDATE ON tuition_allocations BEGIN SELECT (CASE WHEN NEW.payment_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM payments r WHERE r.id=NEW.payment_id AND r.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); END;
--> statement-breakpoint
CREATE TRIGGER scope_year_rollovers_insert BEFORE INSERT ON year_rollovers BEGIN SELECT (CASE WHEN NEW.source_year_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM academic_years r WHERE r.id=NEW.source_year_id AND r.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.target_year_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM academic_years r WHERE r.id=NEW.target_year_id AND r.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); END;
--> statement-breakpoint
CREATE TRIGGER scope_year_rollovers_update BEFORE UPDATE ON year_rollovers BEGIN SELECT (CASE WHEN NEW.source_year_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM academic_years r WHERE r.id=NEW.source_year_id AND r.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.target_year_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM academic_years r WHERE r.id=NEW.target_year_id AND r.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); END;
--> statement-breakpoint
CREATE TRIGGER immutable_tuition_allocations_update BEFORE UPDATE ON tuition_allocations BEGIN SELECT RAISE(ABORT,'IMMUTABLE_FINANCIAL_RECORD'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_tuition_allocations_delete BEFORE DELETE ON tuition_allocations BEGIN SELECT RAISE(ABORT,'IMMUTABLE_FINANCIAL_RECORD'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_donation_certificates_update BEFORE UPDATE ON donation_certificates BEGIN SELECT RAISE(ABORT,'IMMUTABLE_FINANCIAL_RECORD'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_donation_certificates_delete BEFORE DELETE ON donation_certificates BEGIN SELECT RAISE(ABORT,'IMMUTABLE_FINANCIAL_RECORD'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_attendance_events_update BEFORE UPDATE ON attendance_events BEGIN SELECT RAISE(ABORT,'IMMUTABLE_FINANCIAL_RECORD'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_attendance_events_delete BEFORE DELETE ON attendance_events BEGIN SELECT RAISE(ABORT,'IMMUTABLE_FINANCIAL_RECORD'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_daily_fee_charges_update BEFORE UPDATE ON daily_fee_charges BEGIN SELECT RAISE(ABORT,'IMMUTABLE_FINANCIAL_RECORD'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_daily_fee_charges_delete BEFORE DELETE ON daily_fee_charges BEGIN SELECT RAISE(ABORT,'IMMUTABLE_FINANCIAL_RECORD'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_bank_import_batches_update BEFORE UPDATE ON bank_import_batches BEGIN SELECT RAISE(ABORT,'IMMUTABLE_FINANCIAL_RECORD'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_bank_import_batches_delete BEFORE DELETE ON bank_import_batches BEGIN SELECT RAISE(ABORT,'IMMUTABLE_FINANCIAL_RECORD'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_bank_posted_rows_update BEFORE UPDATE ON bank_posted_rows BEGIN SELECT RAISE(ABORT,'IMMUTABLE_FINANCIAL_RECORD'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_bank_posted_rows_delete BEFORE DELETE ON bank_posted_rows BEGIN SELECT RAISE(ABORT,'IMMUTABLE_FINANCIAL_RECORD'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_balance_carryforwards_update BEFORE UPDATE ON balance_carryforwards BEGIN SELECT RAISE(ABORT,'IMMUTABLE_FINANCIAL_RECORD'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_balance_carryforwards_delete BEFORE DELETE ON balance_carryforwards BEGIN SELECT RAISE(ABORT,'IMMUTABLE_FINANCIAL_RECORD'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_rollover_students_update BEFORE UPDATE ON rollover_students BEGIN SELECT RAISE(ABORT,'IMMUTABLE_FINANCIAL_RECORD'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_rollover_students_delete BEFORE DELETE ON rollover_students BEGIN SELECT RAISE(ABORT,'IMMUTABLE_FINANCIAL_RECORD'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_webhook_inbox_update BEFORE UPDATE ON webhook_inbox BEGIN SELECT RAISE(ABORT,'IMMUTABLE_FINANCIAL_RECORD'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_webhook_inbox_delete BEFORE DELETE ON webhook_inbox BEGIN SELECT RAISE(ABORT,'IMMUTABLE_FINANCIAL_RECORD'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_document_artifacts_update BEFORE UPDATE ON document_artifacts BEGIN SELECT RAISE(ABORT,'IMMUTABLE_FINANCIAL_RECORD'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_document_artifacts_delete BEFORE DELETE ON document_artifacts BEGIN SELECT RAISE(ABORT,'IMMUTABLE_FINANCIAL_RECORD'); END;
--> statement-breakpoint
CREATE TRIGGER tuition_amount_guard BEFORE INSERT ON tuition_allocations BEGIN SELECT (CASE WHEN NEW.amount_paise<=0 OR typeof(NEW.amount_paise)<>'integer' OR NOT EXISTS(SELECT 1 FROM payments p WHERE p.id=NEW.payment_id AND p.institution_id=NEW.institution_id AND p.amount_paise>=NEW.amount_paise AND p.status IN ('Successful','Partially Refunded')) THEN RAISE(ABORT,'INVALID_TUITION_ALLOCATION') END); END;
--> statement-breakpoint
CREATE TRIGGER daily_rule_guard BEFORE INSERT ON daily_fee_rules BEGIN SELECT (CASE WHEN NEW.service NOT IN ('Transport','Hostel') OR NEW.amount_paise<=0 OR typeof(NEW.amount_paise)<>'integer' OR NOT EXISTS(SELECT 1 FROM installments i WHERE i.id=NEW.installment_id AND i.institution_id=NEW.institution_id AND i.student_id=NEW.student_id) THEN RAISE(ABORT,'INVALID_DAILY_RULE') END); END;
--> statement-breakpoint
CREATE TRIGGER daily_rule_update_guard BEFORE UPDATE ON daily_fee_rules BEGIN SELECT (CASE WHEN NEW.service NOT IN ('Transport','Hostel') OR NEW.amount_paise<=0 OR typeof(NEW.amount_paise)<>'integer' OR NOT EXISTS(SELECT 1 FROM installments i WHERE i.id=NEW.installment_id AND i.institution_id=NEW.institution_id AND i.student_id=NEW.student_id) THEN RAISE(ABORT,'INVALID_DAILY_RULE') END); END;
--> statement-breakpoint
CREATE TRIGGER carry_scope_guard BEFORE INSERT ON balance_carryforwards BEGIN SELECT (CASE WHEN NEW.amount_paise<=0 OR NOT EXISTS(SELECT 1 FROM year_rollovers r JOIN installments s ON s.id=NEW.source_installment_id JOIN invoices t ON t.id=NEW.target_invoice_id WHERE r.id=NEW.rollover_id AND r.institution_id=NEW.institution_id AND r.status='Running' AND s.institution_id=r.institution_id AND t.institution_id=r.institution_id AND s.student_id=NEW.student_id AND t.student_id=NEW.student_id AND s.academic_year_id=r.source_year_id AND t.academic_year_id=r.target_year_id AND NEW.amount_paise=(SELECT outstanding_paise FROM installment_balances WHERE id=s.id)) THEN RAISE(ABORT,'INVALID_CARRY_FORWARD') END); END;
--> statement-breakpoint
CREATE TRIGGER rollover_snapshot_guard BEFORE INSERT ON year_rollovers BEGIN SELECT (CASE WHEN NEW.source_year_id=NEW.target_year_id OR json_extract(NEW.snapshot,'$.students')<>(SELECT COUNT(*) FROM enrollments e JOIN students s ON s.id=e.student_id AND s.institution_id=e.institution_id WHERE e.institution_id=NEW.institution_id AND e.academic_year_id=NEW.source_year_id AND s.status='Active') OR json_extract(NEW.snapshot,'$.ledger_count')<>(SELECT COUNT(*) FROM ledger_entries WHERE institution_id=NEW.institution_id AND academic_year_id=NEW.source_year_id) OR json_extract(NEW.snapshot,'$.outstanding')<>(SELECT COALESCE(SUM(outstanding_paise),0) FROM student_balances WHERE institution_id=NEW.institution_id AND academic_year_id=NEW.source_year_id) OR EXISTS(SELECT 1 FROM payments WHERE institution_id=NEW.institution_id AND academic_year_id=NEW.source_year_id AND status IN ('Pending','Initiated','Processing')) OR EXISTS(SELECT 1 FROM refunds WHERE institution_id=NEW.institution_id AND academic_year_id=NEW.source_year_id AND status IN ('Requested','Approved')) THEN RAISE(ABORT,'ROLLOVER_PREVIEW_CHANGED') END); END;
--> statement-breakpoint
CREATE TRIGGER frozen_payments_insert BEFORE INSERT ON payments WHEN EXISTS(SELECT 1 FROM year_rollovers r WHERE r.institution_id=NEW.institution_id AND r.source_year_id=NEW.academic_year_id) BEGIN SELECT RAISE(ABORT,'ACADEMIC_YEAR_FROZEN'); END;
--> statement-breakpoint
CREATE TRIGGER frozen_invoices_insert BEFORE INSERT ON invoices WHEN EXISTS(SELECT 1 FROM year_rollovers r WHERE r.institution_id=NEW.institution_id AND r.source_year_id=NEW.academic_year_id) BEGIN SELECT RAISE(ABORT,'ACADEMIC_YEAR_FROZEN'); END;
--> statement-breakpoint
CREATE TRIGGER frozen_student_fee_assignments_insert BEFORE INSERT ON student_fee_assignments WHEN EXISTS(SELECT 1 FROM year_rollovers r WHERE r.institution_id=NEW.institution_id AND r.source_year_id=NEW.academic_year_id) BEGIN SELECT RAISE(ABORT,'ACADEMIC_YEAR_FROZEN'); END;
--> statement-breakpoint
CREATE TRIGGER frozen_refunds_insert BEFORE INSERT ON refunds WHEN EXISTS(SELECT 1 FROM year_rollovers r WHERE r.institution_id=NEW.institution_id AND r.source_year_id=NEW.academic_year_id) BEGIN SELECT RAISE(ABORT,'ACADEMIC_YEAR_FROZEN'); END;
--> statement-breakpoint
CREATE TRIGGER frozen_enrollments_insert BEFORE INSERT ON enrollments WHEN EXISTS(SELECT 1 FROM year_rollovers r WHERE r.institution_id=NEW.institution_id AND r.source_year_id=NEW.academic_year_id) BEGIN SELECT RAISE(ABORT,'ACADEMIC_YEAR_FROZEN'); END;
--> statement-breakpoint
CREATE TRIGGER frozen_installments_update BEFORE UPDATE ON installments WHEN EXISTS(SELECT 1 FROM year_rollovers r WHERE r.institution_id=NEW.institution_id AND r.source_year_id=NEW.academic_year_id) BEGIN SELECT RAISE(ABORT,'ACADEMIC_YEAR_FROZEN'); END;
--> statement-breakpoint
CREATE TRIGGER frozen_adjustment_insert BEFORE INSERT ON fee_adjustments WHEN EXISTS(SELECT 1 FROM year_rollovers r WHERE r.institution_id=NEW.institution_id AND r.source_year_id=NEW.academic_year_id) AND NOT (NEW.kind='Carry Forward' AND EXISTS(SELECT 1 FROM balance_carryforwards c JOIN year_rollovers r ON r.id=c.rollover_id WHERE c.institution_id=NEW.institution_id AND c.source_installment_id=NEW.installment_id AND c.student_id=NEW.student_id AND c.amount_paise=-NEW.amount_paise AND r.status='Running')) BEGIN SELECT RAISE(ABORT,'ACADEMIC_YEAR_FROZEN'); END;
--> statement-breakpoint
CREATE TRIGGER frozen_ledger_insert BEFORE INSERT ON ledger_entries WHEN EXISTS(SELECT 1 FROM year_rollovers r WHERE r.institution_id=NEW.institution_id AND r.source_year_id=NEW.academic_year_id) AND NOT (NEW.kind='Rollover Out' AND NEW.debit_paise=0 AND EXISTS(SELECT 1 FROM fee_adjustments a JOIN balance_carryforwards c ON c.source_installment_id=a.installment_id AND c.institution_id=a.institution_id JOIN year_rollovers r ON r.id=c.rollover_id WHERE a.id=NEW.adjustment_id AND a.institution_id=NEW.institution_id AND a.student_id=NEW.student_id AND a.kind='Carry Forward' AND c.amount_paise=NEW.credit_paise AND r.status='Running')) BEGIN SELECT RAISE(ABORT,'ACADEMIC_YEAR_FROZEN'); END;
--> statement-breakpoint
CREATE TRIGGER frozen_year_status BEFORE UPDATE OF status ON academic_years WHEN (EXISTS(SELECT 1 FROM year_rollovers r WHERE r.institution_id=NEW.institution_id AND r.source_year_id=NEW.id) AND NEW.status NOT IN ('Closed','Archived')) OR (EXISTS(SELECT 1 FROM year_rollovers r WHERE r.institution_id=NEW.institution_id AND r.target_year_id=NEW.id AND r.status='Running') AND NEW.status NOT IN ('Active','Draft')) BEGIN SELECT RAISE(ABORT,'ACADEMIC_YEAR_FROZEN'); END;
--> statement-breakpoint
CREATE TRIGGER rollover_roster_status BEFORE UPDATE OF status ON students WHEN OLD.status<>NEW.status AND EXISTS(SELECT 1 FROM enrollments e JOIN year_rollovers r ON r.source_year_id=e.academic_year_id AND r.institution_id=e.institution_id WHERE e.student_id=NEW.id AND e.institution_id=NEW.institution_id AND r.status='Running') BEGIN SELECT RAISE(ABORT,'ROLLOVER_ROSTER_FROZEN'); END;
--> statement-breakpoint
CREATE TRIGGER rollover_enrollment_update BEFORE UPDATE OF section_id,student_id,academic_year_id ON enrollments WHEN EXISTS(SELECT 1 FROM year_rollovers r WHERE r.source_year_id=OLD.academic_year_id AND r.institution_id=OLD.institution_id) BEGIN SELECT RAISE(ABORT,'ACADEMIC_YEAR_FROZEN'); END;
--> statement-breakpoint
DROP TRIGGER ledger_double_entry;
--> statement-breakpoint
DROP TRIGGER journal_balanced;
--> statement-breakpoint
DROP VIEW journal_legacy_projection;
--> statement-breakpoint
CREATE VIEW journal_legacy_projection(id,institution_id,ledger_entry_id,academic_year_id,student_id,event_type,debit_account,credit_account,amount_paise,reversal_of,description,entry_date,created_at,created_by) AS SELECT  'journal:'||l.id,l.institution_id,l.id,l.academic_year_id,l.student_id,
 CASE WHEN l.kind IN ('Opening Dues','Rollover Out') THEN 'BALANCE_TRANSFERRED' WHEN l.kind='Fee' THEN 'INVOICE_GENERATED' WHEN l.kind='Payment' THEN 'PAYMENT_RECEIVED' WHEN l.kind='Refund' THEN 'REVERSAL_ISSUED' WHEN l.kind='Late Fee' THEN 'LATE_FEE_ACCRUED' WHEN l.credit_paise>0 THEN 'CONCESSION_APPLIED' ELSE 'FEE_ADJUSTED' END,
 CASE WHEN l.kind='Rollover Out' THEN 'OPENING_BALANCE_CLEARING' WHEN l.kind='Payment' THEN CASE WHEN (SELECT method FROM payments WHERE id=l.payment_id)='Cash' THEN 'CASH' ELSE 'BANK_CLEARING' END WHEN l.credit_paise>0 THEN 'CONCESSION_EXPENSE' ELSE 'ACCOUNTS_RECEIVABLE' END,
 CASE WHEN l.kind='Opening Dues' THEN 'OPENING_BALANCE_CLEARING' WHEN l.kind='Refund' THEN CASE WHEN (SELECT method FROM refunds WHERE id=l.refund_id)='Cash' THEN 'CASH' ELSE 'BANK_CLEARING' END WHEN l.credit_paise>0 THEN 'ACCOUNTS_RECEIVABLE' WHEN l.kind='Late Fee' THEN 'LATE_FEE_REVENUE' ELSE 'FEE_REVENUE' END,
 l.debit_paise+l.credit_paise,
 CASE WHEN l.kind='Refund' THEN (SELECT 'journal:'||lp.id FROM ledger_entries lp WHERE lp.institution_id=l.institution_id AND lp.payment_id=l.payment_id AND lp.kind='Payment' LIMIT 1) ELSE NULL END,
 l.description,l.entry_date,l.created_at,l.created_by FROM ledger_entries l WHERE l.debit_paise+l.credit_paise>0;
--> statement-breakpoint
CREATE TRIGGER ledger_double_entry AFTER INSERT ON ledger_entries WHEN NEW.debit_paise+NEW.credit_paise>0 BEGIN INSERT INTO journal_events(id,institution_id,ledger_entry_id,academic_year_id,student_id,event_type,debit_account,credit_account,amount_paise,reversal_of,description,entry_date,created_at,created_by) SELECT 'journal:'||NEW.id,NEW.institution_id,NEW.id,NEW.academic_year_id,NEW.student_id, CASE WHEN NEW.kind IN ('Opening Dues','Rollover Out') THEN 'BALANCE_TRANSFERRED' WHEN NEW.kind='Fee' THEN 'INVOICE_GENERATED' WHEN NEW.kind='Payment' THEN 'PAYMENT_RECEIVED' WHEN NEW.kind='Refund' THEN 'REVERSAL_ISSUED' WHEN NEW.kind='Late Fee' THEN 'LATE_FEE_ACCRUED' WHEN NEW.credit_paise>0 THEN 'CONCESSION_APPLIED' ELSE 'FEE_ADJUSTED' END, CASE WHEN NEW.kind='Rollover Out' THEN 'OPENING_BALANCE_CLEARING' WHEN NEW.kind='Payment' THEN CASE WHEN (SELECT method FROM payments WHERE id=NEW.payment_id)='Cash' THEN 'CASH' ELSE 'BANK_CLEARING' END WHEN NEW.credit_paise>0 THEN 'CONCESSION_EXPENSE' ELSE 'ACCOUNTS_RECEIVABLE' END, CASE WHEN NEW.kind='Opening Dues' THEN 'OPENING_BALANCE_CLEARING' WHEN NEW.kind='Refund' THEN CASE WHEN (SELECT method FROM refunds WHERE id=NEW.refund_id)='Cash' THEN 'CASH' ELSE 'BANK_CLEARING' END WHEN NEW.credit_paise>0 THEN 'ACCOUNTS_RECEIVABLE' WHEN NEW.kind='Late Fee' THEN 'LATE_FEE_REVENUE' ELSE 'FEE_REVENUE' END, NEW.debit_paise+NEW.credit_paise, CASE WHEN NEW.kind='Refund' THEN (SELECT 'journal:'||lp.id FROM ledger_entries lp WHERE lp.institution_id=NEW.institution_id AND lp.payment_id=NEW.payment_id AND lp.kind='Payment' LIMIT 1) ELSE NULL END, NEW.description,NEW.entry_date,NEW.created_at,NEW.created_by; END;
--> statement-breakpoint
CREATE TRIGGER journal_balanced BEFORE INSERT ON journal_events BEGIN SELECT (CASE WHEN NOT EXISTS(SELECT 1 FROM journal_legacy_projection p WHERE p.ledger_entry_id=NEW.ledger_entry_id AND p.event_type=NEW.event_type AND p.debit_account=NEW.debit_account AND p.credit_account=NEW.credit_account AND p.id=NEW.id AND p.entry_date=NEW.entry_date AND COALESCE(p.reversal_of,'')=COALESCE(NEW.reversal_of,'')) THEN RAISE(ABORT,'UNBALANCED_JOURNAL') END); SELECT (CASE WHEN typeof(NEW.amount_paise)<>'integer' OR NEW.amount_paise<=0 OR NEW.amount_paise>9007199254740991 OR NEW.debit_account=NEW.credit_account OR NEW.event_type NOT IN ('INVOICE_GENERATED','PAYMENT_RECEIVED','CONCESSION_APPLIED','REVERSAL_ISSUED','LATE_FEE_ACCRUED','FEE_ADJUSTED','BALANCE_TRANSFERRED') OR NEW.debit_account NOT IN ('ACCOUNTS_RECEIVABLE','CASH','BANK_CLEARING','CONCESSION_EXPENSE','FEE_REVENUE','LATE_FEE_REVENUE','OPENING_BALANCE_CLEARING') OR NEW.credit_account NOT IN ('ACCOUNTS_RECEIVABLE','CASH','BANK_CLEARING','CONCESSION_EXPENSE','FEE_REVENUE','LATE_FEE_REVENUE','OPENING_BALANCE_CLEARING') THEN RAISE(ABORT,'UNBALANCED_JOURNAL') END); SELECT (CASE WHEN NOT EXISTS(SELECT 1 FROM ledger_entries l WHERE l.id=NEW.ledger_entry_id AND l.institution_id=NEW.institution_id AND l.academic_year_id=NEW.academic_year_id AND l.student_id=NEW.student_id AND l.debit_paise+l.credit_paise=NEW.amount_paise AND (l.debit_paise=0 OR l.credit_paise=0)) THEN RAISE(ABORT,'TENANT_ISOLATION') END); END;
--> statement-breakpoint
CREATE INDEX institutions_organization_scope ON institutions(organization_id,status);
--> statement-breakpoint
PRAGMA optimize;

--> statement-breakpoint
CREATE TRIGGER rollover_enrollment_delete BEFORE DELETE ON enrollments WHEN EXISTS(SELECT 1 FROM year_rollovers r WHERE r.source_year_id=OLD.academic_year_id AND r.institution_id=OLD.institution_id) BEGIN SELECT RAISE(ABORT,'ACADEMIC_YEAR_FROZEN'); END;
--> statement-breakpoint
CREATE TRIGGER rollover_definition_immutable BEFORE UPDATE OF institution_id,source_year_id,target_year_id,mapping,reason,approved_by,snapshot ON year_rollovers BEGIN SELECT RAISE(ABORT,'IMMUTABLE_FINANCIAL_RECORD'); END;
--> statement-breakpoint
CREATE TRIGGER rollover_no_delete BEFORE DELETE ON year_rollovers BEGIN SELECT RAISE(ABORT,'IMMUTABLE_FINANCIAL_RECORD'); END;
--> statement-breakpoint
CREATE TRIGGER opening_dues_trace BEFORE INSERT ON ledger_entries WHEN NEW.kind='Opening Dues' AND NOT EXISTS(SELECT 1 FROM rollover_students rs JOIN year_rollovers r ON r.id=rs.rollover_id AND r.institution_id=rs.institution_id WHERE rs.institution_id=NEW.institution_id AND rs.student_id=NEW.student_id AND rs.target_invoice_id=NEW.invoice_id AND rs.amount_paise=NEW.debit_paise AND NEW.credit_paise=0 AND r.target_year_id=NEW.academic_year_id) BEGIN SELECT RAISE(ABORT,'ROLLOVER_SCOPE_MISMATCH'); END;
```


### `drizzle/meta/_journal.json`

```json
{
  "version": "7",
  "dialect": "sqlite",
  "entries": [
    {
      "idx": 0,
      "version": "6",
      "when": 1791000193481,
      "tag": "0000_absurd_jocasta",
      "breakpoints": true
    },
    {
      "idx": 1,
      "version": "6",
      "when": 1791000467145,
      "tag": "0001_marvelous_squadron_sinister",
      "breakpoints": true
    },
    {
      "idx": 2,
      "version": "6",
      "when": 1791000000000,
      "tag": "0002_financial_guards",
      "breakpoints": true
    },
    {
      "idx": 3,
      "version": "6",
      "when": 1791013421902,
      "tag": "0003_friendly_hobgoblin",
      "breakpoints": true
    },
    {
      "idx": 4,
      "version": "6",
      "when": 1791013806720,
      "tag": "0004_flowery_blur",
      "breakpoints": true
    },
    {
      "idx": 5,
      "version": "6",
      "when": 1791016927399,
      "tag": "0005_slippery_goliath",
      "breakpoints": true
    },
    {
      "idx": 6,
      "version": "6",
      "when": 1791030583898,
      "tag": "0006_shiny_sentinel",
      "breakpoints": true
    },
    {
      "idx": 7,
      "version": "6",
      "when": 1791038714160,
      "tag": "0007_salty_ikaris",
      "breakpoints": true
    }
  ]
}
```


## Integration, API documentation, configuration and tests


### `.env.example`

```dotenv
# Store gateway and delivery credentials as runtime secrets.
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=
CASHFREE_APP_ID=
CASHFREE_SECRET_KEY=
CASHFREE_ENV=sandbox
SMS_WEBHOOK_URL=
SMS_WEBHOOK_TOKEN=
WHATSAPP_WEBHOOK_URL=
WHATSAPP_WEBHOOK_TOKEN=
EMAIL_WEBHOOK_URL=
EMAIL_WEBHOOK_TOKEN=
JOB_SECRET=
PROVIDER_ENCRYPTION_KEY=
# Optional independent parent-link signing secret (minimum 32 characters).
# When unset, a separate signing key is derived from PROVIDER_ENCRYPTION_KEY.
PARENT_PORTAL_SECRET=

# Canonical deployed origin and existing ChatGPT platform owner.
PLATFORM_ORIGIN=
PLATFORM_OWNER_EMAIL=
```


### `components/campus/App.tsx`

```tsx
"use client";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Toaster } from "@/components/ui/sonner";
import { api, ClientError } from "@/lib/api-client";
import { useRouter } from "@/lib/browser-navigation";
import { en, Language, translate } from "@/lib/i18n";
import {
  readNavigationFilters,
  saveNavigationFilters,
} from "@/lib/navigation-filters";
import { Permission } from "@/lib/permissions";
import {
  Bell,
  BookOpen,
  Building2,
  CalendarDays,
  ChartNoAxesCombined,
  ChevronDown,
  Clock3,
  FileText,
  Filter,
  GitCompareArrows,
  GraduationCap,
  Landmark,
  Layers3,
  LayoutDashboard,
  Loader2,
  LogOut,
  Receipt,
  RotateCcw,
  ScrollText,
  Search,
  Settings2,
  ShieldCheck,
  UserRoundX,
  UsersRound,
  Wallet,
  X,
} from "lucide-react";
import { usePathname } from "next/navigation";
import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { InstitutionAccess } from "./Access";
import {
  AppContext,
  AppState,
  CampusLink as Link,
  Row,
  Scope,
  useCampusRouter,
  useApp as useContextValue,
} from "./context";
import {
  Button,
  Field,
  FormDialog,
  Initials,
  Input,
  Loading,
  PageHead,
  Picker,
} from "./ui";
const AuditLogs = lazy(() =>
  import("@/features/auth/AuditLogs").then((m) => ({ default: m.AuditLogs })),
);
const Dashboard = lazy(() =>
  import("@/features/reports/Dashboard").then((m) => ({
    default: m.Dashboard,
  })),
);
const Students = lazy(() =>
  import("@/features/students/Students").then((m) => ({ default: m.Students })),
);
const StudentProfile = lazy(() =>
  import("@/features/students/StudentProfile").then((m) => ({
    default: m.StudentProfile,
  })),
);
const Parents = lazy(() =>
  import("@/features/students/Parents").then((m) => ({ default: m.Parents })),
);
const Academic = lazy(() =>
  import("@/features/students/Academic").then((m) => ({ default: m.Academic })),
);
const Fees = lazy(() =>
  import("@/features/fees/Fees").then((m) => ({ default: m.Fees })),
);
const Registers = lazy(() =>
  import("@/features/payments/Registers").then((m) => ({
    default: m.Registers,
  })),
);
const Reports = lazy(() =>
  import("@/features/reports/Reports").then((m) => ({ default: m.Reports })),
);
const Reconciliation = lazy(() =>
  import("@/features/reports/Reconciliation").then((m) => ({
    default: m.Reconciliation,
  })),
);
const Cash = lazy(() =>
  import("@/features/reports/Cash").then((m) => ({ default: m.Cash })),
);
const Users = lazy(() =>
  import("@/features/auth/Users").then((m) => ({ default: m.Users })),
);
const Settings = lazy(() =>
  import("@/features/auth/Settings").then((m) => ({ default: m.Settings })),
);
const Notifications = lazy(() =>
  import("@/features/auth/Notifications").then((m) => ({
    default: m.Notifications,
  })),
);
const nav = [
  {
    label: "Dashboard",
    path: "/",
    icon: LayoutDashboard,
    group: "Workspace",
    permission: "finance",
  },
  {
    label: "Students",
    path: "/students",
    icon: GraduationCap,
    group: "Workspace",
    permission: "staff",
  },
  {
    label: "Parents",
    path: "/parents",
    icon: UsersRound,
    group: "Workspace",
    permission: "staff",
  },
  {
    label: "Academic",
    path: "/academic",
    icon: CalendarDays,
    group: "Workspace",
    permission: "staff",
  },
  {
    label: "AcademicYears",
    path: "/academic/years",
    icon: CalendarDays,
    group: "Workspace",
    permission: "staff",
    child: true,
  },
  {
    label: "Classes",
    path: "/academic/classes",
    icon: GraduationCap,
    group: "Workspace",
    permission: "staff",
    child: true,
  },
  {
    label: "Sections",
    path: "/academic/sections",
    icon: UsersRound,
    group: "Workspace",
    permission: "staff",
    child: true,
  },
  {
    label: "Fees",
    path: "/fees",
    icon: Layers3,
    group: "Finance",
    permission: "finance",
  },
  {
    label: "Invoices",
    path: "/invoices",
    icon: FileText,
    group: "Finance",
    permission: "finance",
  },
  {
    label: "CollectFees",
    path: "/collect-fees",
    icon: Wallet,
    group: "Finance",
    permission: "collect",
  },
  {
    label: "Payments",
    path: "/payments",
    icon: Wallet,
    group: "Finance",
    permission: "finance",
  },
  {
    label: "Receipts",
    path: "/receipts",
    icon: Receipt,
    group: "Finance",
    permission: "finance",
  },
  {
    label: "Outstanding",
    path: "/outstanding",
    icon: Clock3,
    group: "Finance",
    permission: "finance",
  },
  {
    label: "Defaulters",
    path: "/defaulters",
    icon: UserRoundX,
    group: "Finance",
    permission: "finance",
  },
  {
    label: "Refunds",
    path: "/refunds",
    icon: RotateCcw,
    group: "Finance",
    permission: "collect",
  },
  {
    label: "Reports",
    path: "/reports",
    icon: ChartNoAxesCombined,
    group: "Finance",
    permission: "finance",
  },
  {
    label: "Reconciliation",
    path: "/reconciliation",
    icon: GitCompareArrows,
    group: "Finance",
    permission: "collect",
  },
  {
    label: "Cash",
    path: "/cash",
    icon: Landmark,
    group: "Finance",
    permission: "collect",
  },
  {
    label: "Notifications",
    path: "/notifications",
    icon: Bell,
    group: "Administration",
    permission: "finance",
  },
  {
    label: "Users",
    path: "/users",
    icon: ShieldCheck,
    group: "Administration",
    permission: "admin",
  },
  {
    label: "Settings",
    path: "/settings",
    icon: Settings2,
    group: "Administration",
    permission: "admin",
  },
  {
    label: "Audit",
    path: "/audit",
    icon: ScrollText,
    group: "Administration",
    permission: "admin",
  },
  {
    label: "PlatformAdmin",
    path: "/admin",
    icon: Building2,
    group: "Administration",
    permission: "system",
  },
] as const;
export default function CampusApp({ slug }: { slug: string }) {
  const basePath = "/campus/" + slug;
  const pathname = usePathname().slice(basePath.length) || "/",
    router = useRouter(),
    [boot, setBoot] = useState<Row | null>(null),
    [error, setError] = useState<ClientError | null>(null),
    [institutionId, setInstitutionId] = useState(""),
    [revision, setRevision] = useState(0),
    [language, setLanguage] = useState<Language>("en"),
    [scope, setScope] = useState<Scope>({
      year: "",
      campus: "",
      class: "",
      section: "",
      stream: "",
      from: "",
      to: "",
    });
  const request = useCallback(
    <T,>(
      path: string,
      options: { method?: string; body?: unknown; signal?: AbortSignal } = {},
    ) => api<T>("campus/" + slug + "/" + path, { ...options }),
    [slug],
  );
  const reload = useCallback(async () => {
    const data = await request<Row>("bootstrap");
    setBoot(data);
    setLanguage(data.institution.settings.language || "en");
    setScope((previous) => {
      const selected = previous.year
        ? previous
        : readNavigationFilters(data.institution.id, data.user.userId) ||
          previous;
      const year =
        data.years.find((y: Row) => y.id === selected.year) ||
        data.years.find((y: Row) => y.status === "Active") ||
        data.years[0];
      if (!year) return { ...previous, year: "", from: "", to: "" };
      return year.id === selected.year
        ? selected
        : {
            year: year.id,
            campus: "",
            class: "",
            section: "",
            stream: "",
            from: year.start_date,
            to: year.end_date,
          };
    });
  }, [request]);
  useEffect(() => {
    setError(null);
    setBoot(null);
    reload().catch((e) => setError(e));
  }, [reload]);
  useEffect(() => {
    if (boot)
      saveNavigationFilters(boot.institution.id, boot.user.userId, scope);
  }, [boot, scope]);
  const query = useCallback(
    (extra: Record<string, string> = {}) =>
      new URLSearchParams(
        Object.fromEntries(
          Object.entries({ ...scope, ...extra }).filter(([_, v]) => v !== ""),
        ),
      ).toString(),
    [scope],
  );
  const refresh = useCallback(() => setRevision((v) => v + 1), []);
  const can = (p: Permission) =>
    !!boot?.user.permissions?.includes(p) &&
    (!boot?.subscription?.modules ||
      boot.subscription.modules.includes(
        p.startsWith("refunds.") ? "payments" : p.split(".")[0],
      ));
  const role = boot?.user.role,
    admin = role === "INSTITUTION_ADMIN",
    collect = can("payments.collect"),
    finance = can("fees.view"),
    parentRole = false;
  useEffect(() => {
    if (!boot) return;
    const context = (document as any).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const tools = [
      {
        name: "search_students",
        description:
          "Search institution students with the same academic filters as the visible table.",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string", minLength: 2, maxLength: 100 },
          },
          required: ["query"],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true, untrustedContentHint: true },
        execute: async (input: Row) => {
          if (
            typeof input.query !== "string" ||
            input.query.length < 2 ||
            input.query.length > 100
          )
            throw new Error("Provide a query of 2 to 100 characters.");
          const results = await request<Row>(
            "students?" + query({ q: input.query, size: "10" }),
          );
          return {
            students: results.rows.map((r: Row) => ({
              id: r.id,
              name: r.name,
              admissionNumber: r.admission_number,
              class: r.class_name,
            })),
            total: results.total,
          };
        },
      },
      {
        name: "open_student_profile",
        description:
          "Navigate to an authorized student financial profile. Does not create or modify records.",
        inputSchema: {
          type: "object",
          properties: { studentId: { type: "string" } },
          required: ["studentId"],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true, untrustedContentHint: false },
        execute: async (input: Row) => {
          if (
            typeof input.studentId !== "string" ||
            !/^[-a-zA-Z0-9_]{1,100}$/.test(input.studentId)
          )
            throw new Error("Invalid student ID");
          await request("students/" + input.studentId + "?" + query());
          router.push(basePath + "/students/" + input.studentId);
          return { opened: true, studentId: input.studentId };
        },
      },
    ];
    for (const tool of tools)
      Promise.resolve(
        context.registerTool(tool, { signal: lifecycle.signal }),
      ).catch(() => {});
    return () => lifecycle.abort();
  }, [boot, request, query, router]);
  if (error)
    return (
      <InstitutionAccess
        slug={slug}
        error={error}
        retry={() =>
          reload()
            .then(() => setError(null))
            .catch(setError)
        }
      />
    );
  if (!boot)
    return (
      <div className="app-boot">
        <span className="brand-symbol">S</span>
        <strong>Sohan Soft Tech</strong>
        <Loader2 className="animate-spin" size={24} />
        <span>Preparing your institution...</span>
      </div>
    );
  const state: AppState = {
    boot,
    scope,
    setScope,
    revision,
    refresh,
    reload,
    request,
    query,
    t: (key) => translate(language, key),
    admin,
    collect,
    finance,
    language,
    setLanguage,
    institutionId: boot.institution.id,
    setInstitutionId: (id) => {
      const m = boot.memberships.find((m: Row) => m.institution_id === id);
      if (m) router.push("/campus/" + m.slug);
    },
    basePath,
    can,
  };
  let page: React.ReactNode;
  const route = pathname.split("/").filter(Boolean),
    current = route[0] || "";
  if (!current)
    page = finance ? (
      <Dashboard />
    ) : can("reports.view") ? (
      <Reports />
    ) : can("students.view") ? (
      <Students />
    ) : (
      <PageHead
        title="Your institution"
        description="Your account has no enabled modules. Ask your institution administrator to assign permissions."
      />
    );
  else if (current === "students")
    page = route[1] ? <StudentProfile id={route[1]} /> : <Students />;
  else if (current === "parents") page = <Parents />;
  else if (current === "academic")
    page = (
      <Academic key={route[1] || "years"} initialTab={route[1] || "years"} />
    );
  else if (current === "collect-fees")
    page = <Registers kind="payments" collectOnOpen />;
  else if (current === "fees") page = <Fees />;
  else if (["payments", "receipts", "invoices", "refunds"].includes(current))
    page = <Registers kind={current} />;
  else if (["outstanding", "defaulters"].includes(current))
    page = <Students mode={current} />;
  else if (current === "reports") page = <Reports />;
  else if (current === "reconciliation") page = <Reconciliation />;
  else if (current === "cash") page = <Cash />;
  else if (current === "users") page = <Users />;
  else if (current === "settings") page = <Settings />;
  else if (current === "audit") page = <AuditLogs />;
  else if (current === "notifications") page = <Notifications />;
  else
    page = (
      <PageHead
        title="Page not found"
        description="Choose a section from the navigation."
      />
    );
  const required: Record<string, Permission> = {
    students: "students.view",
    parents: "students.view",
    academic: "academics.view",
    "collect-fees": "payments.collect",
    fees: "fees.view",
    invoices: "fees.view",
    payments: "payments.view",
    receipts: "receipts.view",
    outstanding: "fees.view",
    defaulters: "fees.view",
    refunds: "refunds.request",
    reports: "reports.view",
    users: "users.view",
    settings: "settings.view",
    reconciliation: "payments.manage",
    cash: "payments.collect",
    notifications: "payments.view",
    audit: "settings.view",
  };
  if (required[current] && !can(required[current]))
    page = (
      <PageHead
        title="Access restricted"
        description="Your role does not have permission to open this section."
      />
    );
  return (
    <AppContext.Provider value={state}>
      <SidebarProvider
        style={
          {
            "--sidebar-width": "244px",
            "--sidebar-width-mobile": "280px",
          } as React.CSSProperties
        }
      >
        <CampusSidebar pathname={pathname} parentRole={parentRole} />
        <SidebarInset className="campus-inset">
          <WorkspaceHeader pathname={pathname} parentRole={parentRole} />
          {boot.support && (
            <div className="support-banner">
              <ShieldCheck size={17} />
              <span>
                You are accessing this institution as Platform Administrator.
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  try {
                    await api("platform/support", { method: "POST", body: {} });
                    router.push("/admin/institutions");
                  } catch (e) {
                    toast.error((e as Error).message);
                  }
                }}
              >
                End support access
              </Button>
            </div>
          )}
          {!["Active", "Trial"].includes(boot.subscription.effectiveStatus) && (
            <div className="subscription-banner">
              Subscription: {boot.subscription.effectiveStatus}. Existing
              records remain available. Contact the platform administrator to
              renew access.
            </div>
          )}
          <main className="workspace-main">
            <Suspense fallback={<Loading />}>{page}</Suspense>
            <footer className="workspace-footer">
              <span>Sohan Soft Tech</span>
              <span>Amounts in INR · Asia/Kolkata</span>
            </footer>
          </main>
        </SidebarInset>
      </SidebarProvider>
      <Toaster position="bottom-right" richColors theme="light" />
    </AppContext.Provider>
  );
}
function CampusSidebar({
  pathname,
  parentRole,
}: {
  pathname: string;
  parentRole: boolean;
}) {
  const state = useContextValue(),
    { boot, t, admin, collect, finance } = state,
    role = boot.user.role;
  const permissions: Record<string, Permission> = {
    "/": "fees.view",
    "/students": "students.view",
    "/parents": "students.view",
    "/academic": "academics.view",
    "/academic/years": "academics.view",
    "/academic/classes": "academics.view",
    "/academic/sections": "academics.view",
    "/collect-fees": "payments.collect",
    "/fees": "fees.view",
    "/invoices": "fees.view",
    "/payments": "payments.view",
    "/receipts": "receipts.view",
    "/outstanding": "fees.view",
    "/defaulters": "fees.view",
    "/refunds": "refunds.request",
    "/reports": "reports.view",
    "/reconciliation": "payments.manage",
    "/cash": "payments.collect",
    "/notifications": "payments.view",
    "/users": "users.view",
    "/settings": "settings.view",
    "/audit": "settings.view",
  };
  const available = nav.filter(
    (n) =>
      n.path !== "/admin" &&
      permissions[n.path] &&
      state.can(permissions[n.path]),
  );
  return (
    <Sidebar className="campus-sidebar" collapsible="offcanvas">
      <SidebarHeader className="campus-sidebar-header">
        <Link href="/" className="brand">
          <span className="brand-symbol">S</span>
          <span>
            Sohan Soft Tech<small>FEES MANAGEMENT</small>
          </span>
        </Link>
        <div className="institution-card">
          {boot.institution.logo_key ? (
            <img
              className="school-monogram"
              src={"/api/portal/" + boot.institution.slug + "/logo"}
              alt={boot.institution.name + " logo"}
            />
          ) : (
            <span className="school-monogram">
              {boot.institution.name
                .split(" ")
                .map((w: string) => w[0])
                .slice(0, 3)
                .join("")}
            </span>
          )}
          <div>
            <strong>{boot.institution.name}</strong>
            <small>{boot.campuses[0]?.name || "Institution"}</small>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent className="campus-sidebar-content">
        {["Workspace", "Finance", "Administration"].map((group) => {
          const items = available.filter((n) => n.group === group);
          if (!items.length) return null;
          return (
            <SidebarGroup key={group}>
              <SidebarGroupLabel>
                {t(group as keyof typeof en)}
              </SidebarGroupLabel>
              <SidebarMenu>
                {items.map((item) => (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      asChild
                      isActive={
                        item.path === "/"
                          ? pathname === "/"
                          : pathname.startsWith(item.path)
                      }
                      className="campus-nav-button"
                    >
                      <Link href={item.path}>
                        <item.icon />
                        <span>{t(item.label as keyof typeof en)}</span>
                        {item.path === "/fees" && (
                          <span className="nav-new">MANAGE</span>
                        )}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroup>
          );
        })}
      </SidebarContent>
      <SidebarFooter>
        <div className="sidebar-footer-card">
          <BookOpen size={19} />
          <div>
            <strong>
              {boot.years.find((y: Row) => y.id === state.scope.year)?.name ||
                "Academic setup"}
            </strong>
            <small>
              {boot.subscription.plan_name} ·{" "}
              {boot.subscription.effectiveStatus}
            </small>
            <small>
              {boot.usage.students} / {boot.subscription.student_limit} students
              · {boot.usage.users + boot.usage.pendingUsers} /{" "}
              {boot.subscription.user_limit} users
            </small>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
function WorkspaceHeader({
  pathname,
  parentRole,
}: {
  pathname: string;
  parentRole: boolean;
}) {
  const {
      boot,
      scope,
      setScope,
      t,
      query,
      request,
      admin,
      institutionId,
      setInstitutionId,
    } = useContextValue(),
    router = useCampusRouter(),
    [command, setCommand] = useState(false),
    [q, setQ] = useState(""),
    [search, setSearch] = useState<Row | null>(null),
    [dateOpen, setDateOpen] = useState(false),
    [range, setRange] = useState({ from: scope.from, to: scope.to }),
    [moreFilters, setMoreFilters] = useState(false);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCommand((v) => !v);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  useEffect(() => {
    if (!command || q.length < 2) {
      setSearch(null);
      return;
    }
    const abort = new AbortController(),
      timer = setTimeout(
        () =>
          request<Row>("search?" + query({ q }), { signal: abort.signal })
            .then(setSearch)
            .catch((e) => {
              if (e.name !== "AbortError") toast.error(e.message);
            }),
        250,
      );
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [q, command, request, query]);
  const changeYear = (id: string) => {
    const year = boot.years.find((y: Row) => y.id === id);
    setScope({
      ...scope,
      year: id,
      section: "",
      from: year?.start_date || "",
      to: year?.end_date || "",
    });
  };
  const select = (key: keyof Scope, value: string) =>
    setScope({
      ...scope,
      [key]: value,
      ...(key === "class" ? { section: "", stream: "" } : {}),
    });
  const navigate = (path: string) => {
    router.push(path);
    setCommand(false);
    setQ("");
  };
  const format = (s: string) =>
    s
      ? new Date(s + "T12:00:00Z").toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short",
        })
      : "All dates";
  return (
    <>
      <header className="workspace-topbar">
        <div className="topbar-left">
          <SidebarTrigger className="mobile-menu" />
          <span className="topbar-title">
            <Building2 size={16} />
            {["/admin", "/institutions"].includes(pathname)
              ? t("PlatformAdmin")
              : boot.institution.name}
            <span className="topbar-divider" /> <strong>Fee management</strong>
          </span>
        </div>
        <div className="topbar-actions">
          <button className="global-search" onClick={() => setCommand(true)}>
            <Search size={17} />
            <span>{t("Search")}</span>
            <kbd>⌘ K</kbd>
          </button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Notification center"
            onClick={() => router.push("/notifications")}
          >
            <Bell size={19} />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="user-menu">
                <Initials name={boot.user.name} />
                <ChevronDown size={13} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="user-dropdown">
              <DropdownMenuLabel>
                {boot.user.name}
                <small>{boot.user.email}</small>
              </DropdownMenuLabel>
              {boot.memberships.length > 1 && (
                <>
                  <DropdownMenuSeparator />
                  {boot.memberships.map((m: Row) => (
                    <DropdownMenuItem
                      key={m.id}
                      onClick={() => setInstitutionId(m.institution_id)}
                    >
                      {m.institution_name}
                    </DropdownMenuItem>
                  ))}
                </>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <a
                  href={
                    "/signout-with-chatgpt?return_to=" +
                    encodeURIComponent("/campus/" + boot.institution.slug)
                  }
                  target="_top"
                >
                  <LogOut size={15} />
                  Sign out
                </a>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
      {!["/admin", "/institutions"].includes(pathname) && (
        <div className="scope-bar">
          <div className="scope-primary">
            <span className="scope-label">
              <CalendarDays size={15} />
              Academic year
            </span>
            <Picker
              value={scope.year}
              onChange={changeYear}
              options={boot.years.map((y: Row) => ({
                value: y.id,
                label: y.name,
              }))}
              className="year-picker"
            />
            {!parentRole && (
              <>
                <span className="filter-divider" />
                <Picker
                  value={scope.campus}
                  onChange={(v) => select("campus", v)}
                  options={[
                    { value: "", label: t("AllCampuses") },
                    ...boot.campuses.map((r: Row) => ({
                      value: r.id,
                      label: r.name,
                    })),
                  ]}
                />
                <Picker
                  value={scope.class}
                  onChange={(v) => select("class", v)}
                  options={[
                    { value: "", label: t("AllClasses") },
                    ...boot.classes.map((r: Row) => ({
                      value: r.id,
                      label: r.name,
                    })),
                  ]}
                />
                <Button
                  variant="ghost"
                  onClick={() => setMoreFilters((v) => !v)}
                  className="more-filters"
                >
                  <Filter size={15} />
                  Filters
                  {(scope.section || scope.stream) && (
                    <span className="filter-dot" />
                  )}
                </Button>
              </>
            )}
          </div>
          {!parentRole && (
            <Button
              variant="outline"
              className="date-filter"
              onClick={() => {
                setRange({ from: scope.from, to: scope.to });
                setDateOpen(true);
              }}
            >
              <CalendarDays size={15} />
              {format(scope.from)} – {format(scope.to)}
              <ChevronDown size={14} />
            </Button>
          )}
        </div>
      )}
      {moreFilters &&
        !parentRole &&
        !["/admin", "/institutions"].includes(pathname) && (
          <div className="extended-filters">
            <Picker
              value={scope.section}
              onChange={(v) => select("section", v)}
              options={[
                { value: "", label: t("AllSections") },
                ...boot.sections
                  .filter(
                    (s: Row) =>
                      s.academic_year_id === scope.year &&
                      (!scope.class || s.class_id === scope.class),
                  )
                  .map((s: Row) => ({
                    value: s.id,
                    label:
                      s.class_name +
                      " " +
                      s.name +
                      (s.stream_name ? " · " + s.stream_name : ""),
                  })),
              ]}
            />
            <Picker
              value={scope.stream}
              onChange={(v) => select("stream", v)}
              options={[
                { value: "", label: t("AllStreams") },
                ...boot.streams.map((s: Row) => ({
                  value: s.id,
                  label: s.name,
                })),
              ]}
            />
            <Button
              variant="ghost"
              onClick={() =>
                setScope({
                  ...scope,
                  campus: "",
                  class: "",
                  section: "",
                  stream: "",
                })
              }
            >
              <X size={15} />
              Reset
            </Button>
          </div>
        )}
      <CommandDialog
        open={command}
        onOpenChange={setCommand}
        title="Global search"
        description="Search institution students, guardians, invoices and transactions."
      >
        <CommandInput
          placeholder="Name, admission, mobile, invoice or transaction..."
          value={q}
          onValueChange={setQ}
        />
        <CommandList>
          <CommandEmpty>
            {q.length < 2
              ? "Type at least two characters"
              : "No matching records"}
          </CommandEmpty>
          {search && (
            <>
              {search.students?.length > 0 && (
                <CommandGroup heading="Students">
                  {search.students.map((s: Row) => (
                    <CommandItem
                      key={s.id}
                      value={
                        s.name +
                        " " +
                        s.admission_number +
                        " " +
                        s.mobile +
                        " " +
                        q
                      }
                      onSelect={() => navigate("/students/" + s.id)}
                    >
                      <GraduationCap />
                      <span>
                        {s.name}
                        <small>
                          {s.admission_number} · {s.class_name} {s.section_name}
                        </small>
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {search.parents?.length > 0 && (
                <CommandGroup heading="Guardians">
                  {search.parents.map((p: Row) => (
                    <CommandItem
                      key={p.id}
                      value={p.guardian_name + " " + p.mobile + " " + q}
                      onSelect={() => navigate("/parents")}
                    >
                      <UsersRound />
                      <span>
                        {p.guardian_name}
                        <small>{p.mobile}</small>
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {search.invoices?.length > 0 && (
                <CommandGroup heading="Invoices">
                  {search.invoices.map((i: Row) => (
                    <CommandItem
                      key={i.id}
                      value={i.number + " " + q}
                      onSelect={() => navigate("/students/" + i.student_id)}
                    >
                      <FileText />
                      {i.number}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {search.payments?.length > 0 && (
                <CommandGroup heading="Transactions">
                  {search.payments.map((p: Row) => (
                    <CommandItem
                      key={p.id}
                      value={p.reference + " " + q}
                      onSelect={() => navigate("/students/" + p.student_id)}
                    >
                      <Wallet />
                      {p.reference || p.id}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </>
          )}
        </CommandList>
      </CommandDialog>
      <FormDialog
        open={dateOpen}
        onClose={() => setDateOpen(false)}
        title="Filter collection dates"
        description="Date filters apply to collection records and dated reports."
        submitLabel="Apply date range"
        onSubmit={(e) => {
          e.preventDefault();
          if (range.from > range.to) {
            toast.error("End date must follow start date.");
            return;
          }
          setScope({ ...scope, ...range });
          setDateOpen(false);
        }}
      >
        <div className="date-presets">
          <Button
            variant="outline"
            type="button"
            onClick={() => {
              const year = boot.years.find((y: Row) => y.id === scope.year);
              setRange({
                from: year?.start_date || "",
                to: year?.end_date || "",
              });
            }}
          >
            Academic year
          </Button>
          <Button
            variant="outline"
            type="button"
            onClick={() => {
              const today = new Intl.DateTimeFormat("en-CA", {
                timeZone: "Asia/Kolkata",
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
              }).format(new Date());
              setRange({ from: today.slice(0, 8) + "01", to: today });
            }}
          >
            This month
          </Button>
        </div>
        <div className="form-grid">
          <Field label="From">
            <Input
              type="date"
              value={range.from}
              onChange={(e) => setRange({ ...range, from: e.target.value })}
            />
          </Field>
          <Field label="To">
            <Input
              type="date"
              value={range.to}
              onChange={(e) => setRange({ ...range, to: e.target.value })}
            />
          </Field>
        </div>
      </FormDialog>
    </>
  );
}
```


### `components/campus/Entry.tsx`

```tsx
"use client";
import PlatformApp from "@/features/platform/App";
import { api, ClientError } from "@/lib/api-client";
import { useRouter } from "@/lib/browser-navigation";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Access, BootScreen } from "./Access";
import CampusApp from "./App";
import type { Row } from "./context";
import { Button, Card, PageHead } from "./ui";
export default function Entry() {
  const path = usePathname(),
    router = useRouter();
  const [session, setSession] = useState<Row | null>(null),
    [error, setError] = useState<ClientError | null>(null),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    if (path.startsWith("/campus/") || path.startsWith("/admin")) return;
    api("session").then(setSession).catch(setError);
  }, [path, retry]);
  useEffect(() => {
    if (!session || path.startsWith("/campus/") || path.startsWith("/admin"))
      return;
    if (session.platform) router.replace("/admin");
    else if (session.memberships.length === 1 && !session.organizations?.length)
      router.replace(
        "/campus/" + session.memberships[0].slug + (path === "/" ? "" : path),
      );
  }, [session, path, router]);
  if (path.startsWith("/campus/"))
    return <CampusApp key={path.split("/")[2]} slug={path.split("/")[2]} />;
  if (path.startsWith("/admin")) return <PlatformApp />;
  if (path === "/parent" || path.startsWith("/pay/"))
    return (
      <div className="portal-chooser">
        <PageHead
          title="Portal unavailable"
          description="Contact your institution accounts office for fee assistance."
        />
        <a href="/">Return to Sohan Soft Tech</a>
      </div>
    );
  if (error)
    return (
      <Access
        error={error}
        retry={() => {
          setError(null);
          setRetry((v) => v + 1);
        }}
      />
    );
  if (
    !session ||
    session.platform ||
    (session.memberships.length === 1 && !session.organizations?.length)
  )
    return <BootScreen />;
  return (
    <div className="portal-chooser">
      <PageHead
        title="Your institutions"
        description={
          session.memberships.length
            ? "Choose an institution to open its fee workspace."
            : "Ask your institution administrator to grant staff access to your ChatGPT email."
        }
      />
      <div className="institution-choice-grid">
        {session.organizations?.map((o: Row) => (
          <Card key={o.id}>
            <h2>{o.name}</h2>
            <p>Trust / group reports</p>
            <a href={"/organization/" + o.id}>Open consolidated reports</a>
          </Card>
        ))}
        {session.memberships.map((m: Row) => (
          <Card key={m.institution_id}>
            <h2>{m.institution_name}</h2>
            <p>{m.role.toLowerCase().replaceAll("_", " ")}</p>
            <Button onClick={() => router.push("/campus/" + m.slug)}>
              Open institution
            </Button>
          </Card>
        ))}
      </div>
      <a href="/signout-with-chatgpt?return_to=/" target="_top">
        Sign out
      </a>
    </div>
  );
}
```


### `components/campus/ui.tsx`

```tsx
"use client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useIsMobile } from "@/hooks/use-mobile";
import { money } from "@/lib/money";
import { virtualTableOptions } from "@/lib/tabular";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Download, FileText, Inbox, Loader2, Search } from "lucide-react";
import { ReactNode, useContext, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AppContext, Row, useApp } from "./context";
export { Button, Input, money };
export function Picker({
  value,
  onChange,
  options,
  placeholder,
  className = "",
  disabled = false,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <Select
      value={value || "__all"}
      onValueChange={(v) => onChange(v === "__all" ? "" : v)}
      disabled={disabled}
    >
      <SelectTrigger className={"picker " + className} aria-label={placeholder}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent position="popper">
        {options.map((o) => (
          <SelectItem key={o.value || "__all"} value={o.value || "__all"}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
export function Status({ value }: { value: string }) {
  const good = [
      "Successful",
      "Paid",
      "Active",
      "Matched",
      "Sent",
      "Delivered",
      "Cleared",
      "Accepted",
      "Completed",
      "Processed",
    ],
    bad = ["Overdue", "Failed", "Suspended", "Rejected", "Unmatched"],
    neutral = ["Archived", "Closed", "Cancelled", "Refunded", "Inactive"];
  return (
    <Badge
      className={
        "status " +
        (good.includes(value)
          ? "good"
          : bad.includes(value)
            ? "bad"
            : neutral.includes(value)
              ? "neutral"
              : "pending")
      }
    >
      {value}
    </Badge>
  );
}
export const Initials = ({
  name,
  className = "",
}: {
  name: string;
  className?: string;
}) => (
  <span className={"initials " + className}>
    {(name || "S")
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((n) => n[0])
      .join("")
      .toUpperCase()}
  </span>
);
export function StudentCell({
  row,
  onClick,
}: {
  row: Row;
  onClick?: () => void;
}) {
  const name = row.name || row.student_name;
  return (
    <button className="student-cell" onClick={onClick}>
      <Initials name={name} />
      <span>
        <strong>{name}</strong>
        <small>{row.admission_number}</small>
      </span>
    </button>
  );
}
export function Card({
  title,
  action,
  children,
  className = "",
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={"panel " + className}>
      {title && (
        <div className="panel-header">
          <h2>{title}</h2>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
export function PageHead({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  eyebrow?: string;
}) {
  return (
    <div className="page-head">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      <div className="page-actions">{actions}</div>
    </div>
  );
}
export function Failure({
  message,
  retry,
}: {
  message: string;
  retry: () => void;
}) {
  return (
    <div className="failure">
      <p>{message}</p>
      <Button variant="outline" onClick={retry}>
        Try again
      </Button>
    </div>
  );
}
export function Loading() {
  return (
    <div className="loading-surface">
      <div className="loading-cards">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-32 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-64 rounded-xl" />
      <Skeleton className="h-64 rounded-xl" />
    </div>
  );
}
export function DataTable({
  columns,
  rows,
  onRow,
  loading = false,
  emptyTitle,
  total,
  page = 1,
  size = 15,
  onPage,
  selected,
  onSelect,
  virtualized = false,
}: {
  columns: {
    key: string;
    label: string;
    render?: (row: Row) => ReactNode;
    align?: "right";
  }[];
  rows: Row[];
  onRow?: (r: Row) => void;
  loading?: boolean;
  emptyTitle?: string;
  total?: number;
  page?: number;
  size?: number;
  onPage?: (p: number) => void;
  selected?: string[];
  onSelect?: (ids: string[]) => void;
  virtualized?: boolean;
}) {
  const scroller = useRef<HTMLDivElement>(null),
    enabled = virtualized && rows.length > 30;
  const virtualizer = useVirtualizer({
    ...virtualTableOptions(rows.length),
    getScrollElement: () => scroller.current,
    enabled,
    getItemKey: (index) => rows[index]?.id || index,
  });
  const virtualRows = virtualizer.getVirtualItems();
  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
  }, [page]);
  const visible = enabled
    ? virtualRows.map((v) => ({ row: rows[v.index], index: v.index }))
    : rows.map((row, index) => ({ row, index }));
  const context = useContext(AppContext),
    t = (key: string) =>
      context?.t(key as any) ||
      (
        {
          NoRecords: "No records yet",
          NoRecordsHelp: "Records will appear here when they are created.",
        } as Record<string, string>
      )[key] ||
      key;
  return (
    <>
      <div
        ref={scroller}
        className={
          "table-wrap " +
          (enabled
            ? "virtual-table [&_[data-slot=table-container]]:overflow-visible"
            : "")
        }
        style={enabled ? { maxHeight: 600, overflow: "auto" } : undefined}
        tabIndex={enabled ? 0 : undefined}
        aria-label={enabled ? "Scrollable records" : undefined}
      >
        <Table>
          <TableHeader className={enabled ? "sticky top-0 z-10 bg-white" : ""}>
            <TableRow>
              {columns.map((c) => (
                <TableHead
                  key={c.key}
                  className={c.align === "right" ? "text-right" : ""}
                >
                  {c.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {enabled && virtualRows[0]?.start > 0 && (
              <TableRow aria-hidden="true">
                <TableCell
                  colSpan={columns.length}
                  style={{
                    height: virtualRows[0].start,
                    padding: 0,
                    border: 0,
                  }}
                />
              </TableRow>
            )}
            {loading
              ? Array.from({ length: 5 }, (_, i) => (
                  <TableRow key={i}>
                    {columns.map((c) => (
                      <TableCell key={c.key}>
                        <Skeleton className="h-5 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              : visible.map(({ row: r, index: i }) => (
                  <TableRow
                    key={r.id || i}
                    data-index={i}
                    ref={enabled ? virtualizer.measureElement : undefined}
                    aria-rowindex={(page - 1) * size + i + 2}
                    onClick={onRow ? () => onRow(r) : undefined}
                    className={onRow ? "clickable-row" : ""}
                  >
                    {columns.map((c) => (
                      <TableCell
                        key={c.key}
                        className={
                          c.align === "right" ? "text-right tabular-nums" : ""
                        }
                      >
                        {c.render ? c.render(r) : (r[c.key] ?? "—")}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
            {enabled && virtualRows.length > 0 && (
              <TableRow aria-hidden="true">
                <TableCell
                  colSpan={columns.length}
                  style={{
                    height: Math.max(
                      0,
                      virtualizer.getTotalSize() -
                        virtualRows[virtualRows.length - 1].end,
                    ),
                    padding: 0,
                    border: 0,
                  }}
                />
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      {!loading && rows.length === 0 && (
        <Empty className="py-16">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Inbox />
            </EmptyMedia>
            <EmptyTitle>{emptyTitle || t("NoRecords")}</EmptyTitle>
            <EmptyDescription>{t("NoRecordsHelp")}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
      {onPage && (
        <div className="table-footer">
          <span>
            {total
              ? `${(page - 1) * size + 1}–${Math.min(page * size, total)} of ${total} records`
              : "0 records"}
          </span>
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    if (page > 1) onPage(page - 1);
                  }}
                  aria-disabled={page === 1}
                />
              </PaginationItem>
              <PaginationItem>
                <span className="page-number">{page}</span>
              </PaginationItem>
              <PaginationItem>
                <PaginationNext
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    if (page * size < (total || 0)) onPage(page + 1);
                  }}
                  aria-disabled={page * size >= (total || 0)}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      )}
    </>
  );
}
export function SearchBox({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="search-box">
      <Search size={17} />
      <Input
        aria-label={placeholder || "Search records"}
        placeholder={placeholder || "Search records..."}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
export function FormDialog({
  open,
  onClose,
  title,
  description,
  children,
  onSubmit,
  submitLabel = "Save",
  busy = false,
  wide = false,
  mobileDrawer = false,
  submitDisabled = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  onSubmit?: (e: React.FormEvent) => void;
  submitLabel?: string;
  busy?: boolean;
  wide?: boolean;
  mobileDrawer?: boolean;
  submitDisabled?: boolean;
}) {
  const mobile = useIsMobile();
  if (mobileDrawer && mobile)
    return (
      <Drawer
        open={open}
        onOpenChange={(v) => !v && !busy && onClose()}
        dismissible={!busy}
      >
        <DrawerContent className="max-h-[92dvh]! campus-dialog-mobile">
          <DrawerHeader>
            <DrawerTitle>{title}</DrawerTitle>
            <DrawerDescription>
              {description || "Complete the details below."}
            </DrawerDescription>
          </DrawerHeader>
          {onSubmit ? (
            <form onSubmit={onSubmit} className="flex min-h-0 flex-col">
              <div className="overflow-y-auto px-5 pb-5">{children}</div>
              <DrawerFooter className="border-t bg-white pb-[max(16px,env(safe-area-inset-bottom))]">
                <Button type="submit" disabled={busy || submitDisabled}>
                  {busy && <Loader2 className="animate-spin" size={16} />}{" "}
                  {submitLabel}
                </Button>
                <Button
                  variant="outline"
                  type="button"
                  disabled={busy}
                  onClick={onClose}
                >
                  Cancel
                </Button>
              </DrawerFooter>
            </form>
          ) : (
            <div className="overflow-y-auto p-5">{children}</div>
          )}
        </DrawerContent>
      </Drawer>
    );
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className={"campus-dialog " + (wide ? "wide-dialog" : "")}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {description || "Complete the details below."}
          </DialogDescription>
        </DialogHeader>
        {onSubmit ? (
          <form onSubmit={onSubmit}>
            <div className="form-body">{children}</div>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy || submitDisabled}>
                {busy && <Loader2 className="animate-spin" size={16} />}{" "}
                {submitLabel}
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <div className="form-body">{children}</div>
        )}
      </DialogContent>
    </Dialog>
  );
}
export function Field({
  label,
  children,
  hint,
  error,
  required = false,
  className = "",
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  error?: string;
  required?: boolean;
  className?: string;
}) {
  return (
    <label className={"form-field " + className}>
      <span>
        {label}
        {required && <b> *</b>}
      </span>
      {children}
      {hint && <small>{hint}</small>}
      {error && (
        <small className="text-red-600" role="alert">
          {error}
        </small>
      )}
    </label>
  );
}
export function ExportButton({
  report,
  label = "Export",
  studentId,
}: {
  report: string;
  label?: string;
  studentId?: string;
}) {
  const [open, setOpen] = useState(false),
    { query, institutionId, request, can } = useApp();
  if (!can("reports.export")) return null;
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Download size={16} />
        {label}
      </Button>
      <FormDialog
        open={open}
        onClose={() => setOpen(false)}
        title="Export report"
        description="The export uses your selected academic year and filters."
      >
        <div className="export-options">
          {["xlsx", "csv", "pdf"].map((format) => (
            <Button
              key={format}
              variant="outline"
              onClick={async () => {
                try {
                  const path =
                    "/api/reports/" +
                    report +
                    "?" +
                    query({
                      format,
                      ...(studentId ? { student: studentId } : {}),
                    });
                  const response = await fetch(path, {
                    headers: { "X-Institution-ID": institutionId },
                  });
                  if (!response.ok) {
                    const e: any = await response.json();
                    throw new Error(e.message);
                  }
                  const blob = await response.blob(),
                    url = URL.createObjectURL(blob),
                    a = document.createElement("a");
                  a.href = url;
                  a.download = report + "." + format;
                  a.click();
                  URL.revokeObjectURL(url);
                  setOpen(false);
                } catch (e) {
                  toast.error((e as Error).message);
                }
              }}
            >
              <FileText size={20} />
              <strong>
                {format === "xlsx" ? "Excel" : format.toUpperCase()}
              </strong>
            </Button>
          ))}
        </div>
      </FormDialog>
    </>
  );
}
export async function downloadDocument(
  kind: string,
  id: string,
  institutionId: string,
  print = false,
  format = "a4",
) {
  const win = print ? window.open("", "_blank") : null;
  try {
    if (win) win.document.body.textContent = "Preparing your receipt…";
    const fetchDocument = () =>
      fetch(`/api/documents/${kind}/${id}?format=${format}`, {
        headers: { "X-Institution-ID": institutionId },
      });
    let response = await fetchDocument();
    for (let attempt = 0; response.status === 202 && attempt < 15; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      response = await fetchDocument();
    }
    if (response.status === 202)
      throw new Error(
        "Receipt is still being prepared. Try downloading again shortly.",
      );
    if (!response.ok) {
      const e: { message: string } = await response.json();
      throw new Error(e.message);
    }
    const url = URL.createObjectURL(await response.blob());
    if (print && win) {
      win.location.href = url;
      win.addEventListener("load", () => win.print());
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } else {
      const a = document.createElement("a");
      a.href = url;
      a.download = kind + (format === "thermal" ? "-80mm" : "") + ".pdf";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  } catch (error) {
    win?.close();
    throw error;
  }
}
```


### `features/platform/App.tsx`

```tsx
"use client";
import { Access, BootScreen } from "@/components/campus/Access";
import type { Row } from "@/components/campus/context";
import { Button } from "@/components/campus/ui";
import { AdminDashboard } from "@/features/auth/AdminDashboard";
import { InstitutionForm } from "@/features/auth/InstitutionForm";
import { Institutions } from "@/features/auth/Institutions";
import { api, ClientError } from "@/lib/api-client";
import { useRouter } from "@/lib/browser-navigation";
import {
  Building2,
  ChartNoAxesCombined,
  CreditCard,
  Globe2,
  Layers3,
  LayoutDashboard,
  LogOut,
  Menu,
  Plus,
  ScrollText,
  Settings2,
  ShieldCheck,
} from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Toaster } from "sonner";
import { PlatformContext } from "./context";
import { InstitutionDetail } from "./InstitutionDetail";
import { Plans } from "./Plans";
import { Organizations } from "./Organizations";
import { PlatformRegister, PlatformSettings } from "./Registers";
const navigation = [
  { label: "Dashboard", href: "/admin", icon: LayoutDashboard },
  {
    label: "Organizations & Trusts",
    href: "/admin/organizations",
    icon: Building2,
  },
  { label: "Institutions", href: "/admin/institutions", icon: Building2 },
  {
    label: "Create Institution",
    href: "/admin/institutions/new",
    icon: Plus,
    child: true,
  },
  {
    label: "Plans",
    href: "/admin/plans",
    icon: Layers3,
    group: "Subscriptions",
  },
  {
    label: "Active Subscriptions",
    href: "/admin/subscriptions",
    icon: CreditCard,
  },
  { label: "Payments", href: "/admin/payments", icon: CreditCard },
  { label: "Domains", href: "/admin/domains", icon: Globe2 },
  { label: "Usage", href: "/admin/usage", icon: ChartNoAxesCombined },
  { label: "Audit Logs", href: "/admin/audit", icon: ScrollText },
  { label: "Platform Settings", href: "/admin/settings", icon: Settings2 },
];
export default function PlatformApp() {
  const path = usePathname(),
    router = useRouter(),
    [session, setSession] = useState<Row | null>(null),
    [error, setError] = useState<ClientError | null>(null),
    [retry, setRetry] = useState(0),
    [revision, setRevision] = useState(0),
    [menu, setMenu] = useState(false),
    [platformName, setPlatformName] = useState("Sohan Soft Tech");
  useEffect(() => {
    api("session")
      .then((s) => {
        if (!s.platform)
          throw new ClientError(
            "This dashboard is available to platform administrators. Open your institution portal to continue.",
            "PLATFORM_ACCESS_REQUIRED",
            403,
          );
        setSession(s);
      })
      .catch(setError);
  }, [retry]);
  useEffect(() => {
    if (session)
      api("platform/settings")
        .then((data) =>
          setPlatformName(data.settings.platformName || "Sohan Soft Tech"),
        )
        .catch(() => {});
  }, [session, revision]);
  useEffect(() => setMenu(false), [path]);
  if (error)
    return (
      <Access
        error={error}
        name="Sohan Soft Tech Platform"
        returnTo="/admin"
        retry={() => {
          setError(null);
          setRetry((v) => v + 1);
        }}
      />
    );
  if (!session) return <BootScreen />;
  const parts = path.split("/").filter(Boolean),
    current = parts[1] || "";
  let page: React.ReactNode;
  if (!current) page = <AdminDashboard />;
  else if (current === "institutions" && parts[2] && parts[2] !== "new")
    page = <InstitutionDetail id={parts[2]} />;
  else if (current === "institutions") page = <Institutions />;
  else if (current === "organizations") page = <Organizations />;
  else if (current === "plans") page = <Plans />;
  else if (current === "settings") page = <PlatformSettings />;
  else page = <PlatformRegister kind={current} />;
  return (
    <PlatformContext.Provider
      value={{
        user: session.user,
        revision,
        refresh: () => setRevision((v) => v + 1),
      }}
    >
      <div className="platform-shell">
        <aside className={"platform-sidebar " + (menu ? "open" : "")}>
          <a href="/admin" className="platform-brand">
            <span className="brand-symbol">S</span>
            <span>
              {platformName}
              <small>PLATFORM MANAGEMENT</small>
            </span>
          </a>
          <div className="platform-access">
            <ShieldCheck size={17} />
            Super Administrator
          </div>
          <nav>
            {navigation.map((n) => (
              <div key={n.href}>
                {n.group && <p className="platform-nav-group">{n.group}</p>}
                <a
                  href={n.href}
                  className={
                    (path === n.href ? "active " : "") +
                    (n.child ? "child" : "")
                  }
                >
                  <n.icon size={18} />
                  {n.label}
                </a>
              </div>
            ))}
          </nav>
          <div className="platform-sidebar-footer">
            <strong>{session.user.name}</strong>
            <small>{session.user.email}</small>
            <a href="/signout-with-chatgpt?return_to=/admin" target="_top">
              <LogOut size={15} />
              Sign out
            </a>
          </div>
        </aside>
        <div className="platform-body">
          <header className="platform-topbar">
            <Button
              variant="ghost"
              size="icon"
              className="platform-menu"
              onClick={() => setMenu((v) => !v)}
              aria-label="Open navigation"
            >
              <Menu size={20} />
            </Button>
            <span>{platformName} Platform Management</span>
            <span className="platform-topbar-badge">Platform Admin</span>
          </header>
          <main className="platform-main">
            {page}
            <footer className="workspace-footer">
              <span>Sohan Soft Tech Platform</span>
              <span>Institution management</span>
            </footer>
          </main>
        </div>
        {menu && (
          <button
            className="platform-backdrop"
            onClick={() => setMenu(false)}
            aria-label="Close navigation"
          />
        )}
      </div>
      <InstitutionForm
        open={path === "/admin/institutions/new"}
        onClose={() => router.push("/admin/institutions")}
        onCreated={async (id) => {
          setRevision((v) => v + 1);
          router.push("/admin/institutions/" + id);
        }}
      />
      <Toaster position="bottom-right" richColors theme="light" />
    </PlatformContext.Provider>
  );
}
```


### `features/reports/Reports.tsx`

```tsx
"use client";
import { Row, useApp, useResource } from "@/components/campus/context";
import {
  Card,
  DataTable,
  ExportButton,
  Failure,
  money,
  PageHead,
} from "@/components/campus/ui";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  CalendarDays,
  FileBarChart2,
  IndianRupee,
  Percent,
  RotateCcw,
  Wallet,
} from "lucide-react";
import { useState } from "react";
import { TallyExport } from "./TallyExport";
const reports = [
  ["collections", "Collection report"],
  ["outstanding", "Outstanding report"],
  ["defaulters", "Defaulter report"],
  ["class", "Class-wise collection"],
  ["section", "Section-wise collection"],
  ["stream", "Stream-wise collection"],
  ["components", "Fee component report"],
  ["methods", "Payment method report"],
  ["discounts", "Discount report"],
  ["scholarships", "Scholarship report"],
  ["refunds", "Refund report"],
  ["latefees", "Late fee report"],
  ["waivers", "Fee waiver report"],
  ["receipts", "Receipt register"],
  ["cash", "Cash collection report"],
  ["online", "Online payment report"],
  ["reconciliation", "Reconciliation report"],
];
export function Reports() {
  const { query, t } = useApp(),
    [report, setReport] = useState("collections"),
    [tab, setTab] = useState("reports"),
    r = useResource("reports/" + report + "?" + query({ size: "100" })),
    accounting = useResource("reports/summary?" + query());
  const k = accounting.data?.kpi;
  return (
    <>
      <PageHead
        eyebrow="FINANCE / REPORTS"
        title={t("Reports")}
        description={t("ReportsIntro")}
        actions={
          <>
            <TallyExport />
            <ExportButton report={report} />
          </>
        }
      />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="page-tabs">
          <TabsTrigger value="reports">Reports</TabsTrigger>
          <TabsTrigger value="accounting">Accounting summary</TabsTrigger>
        </TabsList>
        <TabsContent value="reports">
          <div className="report-layout">
            <Card className="report-menu">
              <div className="report-menu-title">
                <FileBarChart2 size={18} />
                <h2>Report library</h2>
              </div>
              {reports.map(([value, label]) => (
                <button
                  key={value}
                  className={report === value ? "active" : ""}
                  onClick={() => setReport(value)}
                >
                  {label}
                </button>
              ))}
            </Card>
            <Card
              title={r.data?.title || "Report"}
              action={
                <span className="record-count">
                  {r.data?.total || 0} records
                </span>
              }
              className="report-data"
            >
              {r.error ? (
                <Failure message={r.error} retry={r.retry} />
              ) : (
                <DataTable
                  columns={(r.data?.columns || []).map((c: Row) => ({
                    ...c,
                    align: c.money ? "right" : undefined,
                    render: c.money
                      ? (r: Row) => money(r[c.key], true)
                      : undefined,
                  }))}
                  rows={r.data?.rows?.slice(0, 100) || []}
                  loading={r.loading}
                />
              )}
              <div className="report-summary">
                <span>
                  Displayed: {Math.min(r.data?.total || 0, 100)} records
                </span>
                <strong>
                  {r.data?.columns
                    ?.filter((c: Row) => c.money)
                    .map((c: Row) => (
                      <span key={c.key}>
                        {c.label}:{" "}
                        {money(
                          (r.data?.rows || []).reduce(
                            (s: number, r: Row) => s + (r[c.key] || 0),
                            0,
                          ),
                          true,
                        )}{" "}
                      </span>
                    ))}
                </strong>
              </div>
            </Card>
          </div>
        </TabsContent>
        <TabsContent value="accounting">
          <div className="accounting-grid">
            {[
              {
                label: "Net fee revenue",
                value: k?.expected,
                icon: IndianRupee,
              },
              { label: "Net collected", value: k?.collected, icon: Wallet },
              {
                label: "Outstanding",
                value: k?.outstanding,
                icon: CalendarDays,
              },
              { label: "Refunded", value: k?.refunds, icon: RotateCcw },
              { label: "Discounts", value: k?.discounts, icon: Percent },
              { label: "Scholarships", value: k?.scholarships, icon: Percent },
            ].map((c) => (
              <Card key={c.label} className="accounting-card">
                <c.icon size={20} />
                <span>{c.label}</span>
                <strong>{money(c.value)}</strong>
              </Card>
            ))}
          </div>
          <Card title="Adjustments and late fees">
            <DataTable
              rows={accounting.data?.adjustments || []}
              columns={[
                { key: "kind", label: "Adjustment type" },
                {
                  key: "amount",
                  label: "Net amount",
                  align: "right",
                  render: (r) => money(r.amount, true),
                },
              ]}
            />
          </Card>
          <Card title="Class-wise summary">
            <DataTable
              rows={accounting.data?.byClass || []}
              columns={[
                { key: "name", label: "Class" },
                { key: "students", label: "Students" },
                {
                  key: "expected",
                  label: "Expected",
                  align: "right",
                  render: (r) => money(r.expected),
                },
                {
                  key: "collected",
                  label: "Collected",
                  align: "right",
                  render: (r) => money(r.collected),
                },
              ]}
            />
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}
```


### `features/students/Academic.tsx`

```tsx
"use client";
import { CatalogDialog } from "@/components/campus/CatalogDialog";
import { Row, useApp } from "@/components/campus/context";
import {
  Button,
  Card,
  DataTable,
  Field,
  FormDialog,
  PageHead,
  Picker,
  Status,
} from "@/components/campus/ui";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CalendarDays, GraduationCap, Plus } from "lucide-react";
import { useState } from "react";
import { RolloverWizard } from "./RolloverWizard";
import { toast } from "sonner";
export function Academic({ initialTab = "years" }: { initialTab?: string }) {
  const { boot, t, scope, request, reload, admin, query, refresh } =
      useApp("academics.manage"),
    [rollover, setRollover] = useState(false),
    [catalog, setCatalog] = useState(""),
    [promote, setPromote] = useState(false),
    [targetYear, setTargetYear] = useState(""),
    [targetSection, setTargetSection] = useState(""),
    [students, setStudents] = useState<Row[]>([]),
    [ids, setIds] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [tab, setTab] = useState(
      ["years", "classes", "sections", "streams", "campuses"].includes(
        initialTab,
      )
        ? initialTab
        : "years",
    );
  const title =
    tab === "years"
      ? "Academic year"
      : tab === "classes"
        ? "Class / program"
        : tab === "sections"
          ? "Section"
          : tab === "streams"
            ? "Stream"
            : "Campus";
  return (
    <>
      <RolloverWizard open={rollover} onClose={() => setRollover(false)} />
      <PageHead
        eyebrow="ADMINISTRATION / ACADEMIC"
        title={t("Academic")}
        description={t("AcademicIntro")}
        actions={
          admin && (
            <>
              <Button variant="outline" onClick={() => setRollover(true)}>
                Year rollover
              </Button>
              <Button
                variant="outline"
                onClick={async () => {
                  try {
                    const data = await request(
                      "students?" + query({ size: "100" }),
                    );
                    setStudents(data.rows);
                    setIds([]);
                    setTargetYear("");
                    setTargetSection("");
                    setPromote(true);
                  } catch (e) {
                    toast.error((e as Error).message);
                  }
                }}
              >
                <GraduationCap size={16} />
                Promote students
              </Button>
              <Button onClick={() => setCatalog(tab)}>
                <Plus size={16} />
                Add {title.toLowerCase()}
              </Button>
            </>
          )
        }
      />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="page-tabs">
          <TabsTrigger value="years">Academic years</TabsTrigger>
          <TabsTrigger value="classes">Classes & programs</TabsTrigger>
          <TabsTrigger value="sections">Sections</TabsTrigger>
          <TabsTrigger value="streams">Streams</TabsTrigger>
          <TabsTrigger value="campuses">Campuses</TabsTrigger>
        </TabsList>
        <TabsContent value="years">
          <div className="year-grid">
            {boot.years.map((y: Row) => (
              <Card key={y.id} className="year-card">
                <div>
                  <span className="structure-icon">
                    <CalendarDays size={22} />
                  </span>
                  <Status value={y.status} />
                </div>
                <h2>{y.name}</h2>
                <p>
                  {y.start_date} — {y.end_date}
                </p>
                <span className="year-info">
                  Fee structures and financial records are isolated by academic
                  year.
                </span>
                {admin && (
                  <Field label="Year status">
                    <Picker
                      value={y.status}
                      onChange={async (value) => {
                        try {
                          await request("years/" + y.id, {
                            method: "PATCH",
                            body: { status: value },
                          });
                          await reload();
                          refresh();
                          toast.success("Academic year updated.");
                        } catch (e) {
                          toast.error((e as Error).message);
                        }
                      }}
                      options={["Draft", "Active", "Closed", "Archived"].map(
                        (v) => ({ value: v, label: v }),
                      )}
                    />
                  </Field>
                )}
              </Card>
            ))}
          </div>
        </TabsContent>
        <TabsContent value="classes">
          <Card title="Classes and programs">
            <DataTable
              rows={boot.classes}
              columns={[
                { key: "name", label: "Class / program" },
                { key: "level", label: "Education level" },
                { key: "department", label: "Department / course" },
                { key: "sort_order", label: "Display order" },
                {
                  key: "active",
                  label: "Status",
                  render: (r) => (
                    <Status value={r.active ? "Active" : "Inactive"} />
                  ),
                },
              ]}
            />
          </Card>
        </TabsContent>
        <TabsContent value="sections">
          <Card title="Sections in the selected academic year">
            <DataTable
              rows={boot.sections.filter(
                (r: Row) => r.academic_year_id === scope.year,
              )}
              columns={[
                { key: "class_name", label: "Class" },
                { key: "name", label: "Section" },
                { key: "stream_name", label: "Stream" },
                {
                  key: "campus_id",
                  label: "Campus",
                  render: (r) =>
                    boot.campuses.find((c: Row) => c.id === r.campus_id)?.name,
                },
                { key: "capacity", label: "Capacity" },
              ]}
            />
          </Card>
        </TabsContent>
        <TabsContent value="streams">
          <Card title="Streams">
            <DataTable
              rows={boot.streams}
              columns={[
                { key: "name", label: "Stream" },
                {
                  key: "created_at",
                  label: "Created",
                  render: (r) => r.created_at.slice(0, 10),
                },
              ]}
            />
          </Card>
        </TabsContent>
        <TabsContent value="campuses">
          <Card title="Campuses">
            <DataTable
              rows={boot.campuses}
              columns={[
                { key: "name", label: "Campus" },
                { key: "address", label: "Address" },
              ]}
            />
          </Card>
        </TabsContent>
      </Tabs>
      <CatalogDialog
        kind={catalog || "years"}
        open={!!catalog}
        onClose={() => setCatalog("")}
      />
      <FormDialog
        open={promote}
        onClose={() => setPromote(false)}
        title="Promote students"
        description="Create enrollments in a new year while retaining every earlier fee record."
        wide
        busy={busy}
        submitLabel={"Promote " + ids.length + " students"}
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await request("students/promote", {
              method: "POST",
              body: {
                studentIds: ids,
                yearId: targetYear,
                sectionId: targetSection,
              },
            });
            toast.success(ids.length + " students promoted.");
            refresh();
            setPromote(false);
          } catch (e) {
            toast.error((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="form-grid">
          <Field label="Target academic year">
            <Picker
              value={targetYear}
              onChange={(v) => {
                setTargetYear(v);
                setTargetSection("");
              }}
              options={[
                { value: "", label: "Choose next academic year" },
                ...boot.years
                  .filter((y: Row) => y.id !== scope.year)
                  .map((y: Row) => ({ value: y.id, label: y.name })),
              ]}
            />
          </Field>
          <Field label="Target class / section / stream">
            <Picker
              value={targetSection}
              onChange={setTargetSection}
              options={[
                { value: "", label: "Choose section" },
                ...boot.sections
                  .filter((s: Row) => s.academic_year_id === targetYear)
                  .map((s: Row) => ({
                    value: s.id,
                    label:
                      s.class_name +
                      " " +
                      s.name +
                      (s.stream_name ? " · " + s.stream_name : ""),
                  })),
              ]}
            />
          </Field>
        </div>
        <DataTable
          rows={students}
          columns={[
            {
              key: "selected",
              label: "Select",
              render: (r) => (
                <Checkbox
                  checked={ids.includes(r.id)}
                  onCheckedChange={(v) =>
                    setIds(
                      v === true
                        ? [...ids, r.id]
                        : ids.filter((id) => id !== r.id),
                    )
                  }
                  aria-label={"Promote " + r.name}
                />
              ),
            },
            { key: "name", label: "Student" },
            { key: "class_name", label: "Current class" },
            { key: "admission_number", label: "Admission number" },
          ]}
        />
      </FormDialog>
    </>
  );
}
```


### `features/students/StudentProfile.tsx`

```tsx
"use client";
import {
  Row,
  useApp,
  useResource,
  useCampusRouter as useRouter,
} from "@/components/campus/context";
import {
  Button,
  Card,
  DataTable,
  downloadDocument,
  Failure,
  Field,
  FormDialog,
  Initials,
  Input,
  Loading,
  money,
  PageHead,
  Picker,
  Status,
} from "@/components/campus/ui";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AssignDialog } from "@/features/fees/AssignDialog";
import { PaymentDialog } from "@/features/payments/PaymentDialog";
import { Phone, Plus, ShieldCheck, UserRound } from "lucide-react";
import { lazy, Suspense, useState } from "react";
import { toast } from "sonner";
import { ParentAccess } from "./ParentAccess";
import { TaxEvidence } from "./TaxEvidence";
const FeeHistory = lazy(() => import("./FeeHistory"));
const Documents = lazy(() => import("./Documents"));
const GuardianInfo = lazy(() => import("./GuardianInfo"));
export function StudentProfile({
  id,
  portal = false,
}: {
  id: string;
  portal?: boolean;
}) {
  const {
      request,
      query,
      scope,
      refresh,
      admin,
      can,
      collect,
      finance,
      institutionId,
      t,
      boot,
    } = useApp("fees.manage"),
    router = useRouter(),
    r = useResource("students/" + id + "?" + query()),
    [pay, setPay] = useState(false),
    [assign, setAssign] = useState(false),
    [adjust, setAdjust] = useState(false),
    [details, setDetails] = useState(false),
    [due, setDue] = useState(false),
    [clearance, setClearance] = useState(false),
    [studentStatus, setStudentStatus] = useState("Active"),
    [busy, setBusy] = useState(false),
    [parents, setParents] = useState<Row[]>([]),
    [parentId, setParentId] = useState("");
  const [d, setD] = useState<Row>({
    installmentId: "",
    kind: "Concession",
    amount: "",
    direction: "Credit",
    reason: "",
    componentId: "",
    benefitId: "",
    dueDate: "",
  });
  if (r.loading && !r.data) return <Loading />;
  if (r.error) return <Failure message={r.error} retry={r.retry} />;
  const data = r.data,
    s = data?.student;
  if (!s) return null;
  const installments = data.installments || [],
    invoices = data.invoices || [],
    payments = data.payments || [];
  const download = (kind: string, id: string, print = false, format = "a4") =>
    downloadDocument(kind, id, institutionId, print, format).catch((e) =>
      toast.error(e.message),
    );
  if (!finance)
    return (
      <>
        <PageHead
          title={s.name}
          description={
            s.class_name + " " + s.section_name + " · " + s.admission_number
          }
        />
        <Card title="Student details">
          <div className="summary-lines">
            {[
              ["Name", s.name],
              ["Date of birth", s.dob],
              ["Guardian", s.parent_name],
              ["Mobile", s.mobile],
              ["Admission number", s.admission_number],
              ["Status", s.status],
            ].map(([label, value]) => (
              <div key={label}>
                <span>{label}</span>
                <b>{value || "—"}</b>
              </div>
            ))}
          </div>
        </Card>
      </>
    );
  const creditColumns = [
    {
      key: "created_at",
      label: "Date",
      render: (r: Row) => r.created_at.slice(0, 10),
    },
    { key: "kind", label: "Type" },
    { key: "reason", label: "Reason" },
    { key: "approved_by", label: "Approved by" },
    {
      key: "amount_paise",
      label: "Amount",
      align: "right" as const,
      render: (r: Row) => money(Math.abs(r.amount_paise), true),
    },
  ];
  return (
    <>
      <PageHead
        eyebrow="WORKSPACE / STUDENTS / FEE PROFILE"
        title="Student fee profile"
        actions={
          <>
            <Button variant="outline" onClick={() => setDetails(true)}>
              <UserRound size={16} />
              Student details
            </Button>
            {s.parent_id && can("students.manage") && (
              <ParentAccess parentId={s.parent_id} />
            )}
            {s.parent_id && can("settings.manage") && (
              <TaxEvidence parentId={s.parent_id} payments={payments} />
            )}
            {can("fees.invoice") && (
              <Button variant="outline" onClick={() => setAssign(true)}>
                <Plus size={16} />
                Assign fees
              </Button>
            )}
            {collect && !portal && (
              <Button onClick={() => setPay(true)}>
                <Plus size={16} />
                Collect fee
              </Button>
            )}
          </>
        }
      />
      <Card className="profile-header">
        <div className="profile-identity">
          {s.photo_key ? (
            <img
              src={"/api/campus/" + boot.institution.slug + "/uploads/" + s.id}
              alt={s.name}
              className="profile-photo"
            />
          ) : (
            <Initials name={s.name} className="large" />
          )}
          <div>
            <div className="profile-name">
              <h2>{s.name}</h2>
              <Status value={s.status} />
            </div>
            <p>
              {s.admission_number} <span>•</span> {s.class_name}{" "}
              {s.section_name}
              {s.stream_name ? " · " + s.stream_name : ""} <span>•</span>{" "}
              {s.academic_year}
            </p>
            <div className="profile-contact">
              <span>
                <UserRound size={14} />
                {s.parent_name || "No guardian linked"}
              </span>
              <span>
                <Phone size={14} />
                {s.mobile || "—"}
              </span>
            </div>
          </div>
        </div>
      </Card>
      <div className="profile-kpis">
        {[
          { label: "Total fee", value: s.total_paise },
          { label: "Paid", value: s.paid_paise, color: "teal" },
          { label: "Outstanding", value: s.outstanding_paise, color: "indigo" },
          { label: "Overdue", value: s.overdue_paise, color: "red" },
        ].map((k) => (
          <Card key={k.label} className={"profile-kpi " + (k.color || "")}>
            <span>{k.label}</span>
            <strong>{money(k.value)}</strong>
          </Card>
        ))}
      </div>
      <Tabs defaultValue="overview" className="profile-tabs">
        <div className="profile-tab-scroll">
          <TabsList variant="line">
            {[
              "Overview",
              "Fee structure",
              "Installments",
              "Payments",
              "Ledger",
              "Invoices",
              "Receipts",
              "Discounts",
              "Scholarships",
              "Notifications",
              "Guardian",
            ].map((name) => (
              <TabsTrigger
                key={name}
                value={name.toLowerCase().replace(" ", "-")}
              >
                {name}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        <TabsContent value="guardian">
          <Card title="Guardian contact">
            <Suspense fallback={<Loading />}>
              <GuardianInfo student={s} />
            </Suspense>
          </Card>
        </TabsContent>
        <TabsContent value="overview">
          <div className="profile-overview-grid">
            <Card
              title="Installment schedule"
              action={
                admin && (
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setD({ ...d, installmentId: installments[0]?.id || "" });
                      setAdjust(true);
                    }}
                  >
                    Fee adjustment
                  </Button>
                )
              }
            >
              <DataTable
                rows={installments}
                columns={[
                  { key: "title", label: "Installment" },
                  { key: "due_date", label: "Due date" },
                  {
                    key: "total_paise",
                    label: "Amount",
                    align: "right",
                    render: (r) => money(r.total_paise),
                  },
                  {
                    key: "paid_paise",
                    label: "Paid",
                    align: "right",
                    render: (r) => money(r.paid_paise),
                  },
                  {
                    key: "outstanding_paise",
                    label: "Balance",
                    align: "right",
                    render: (r) => <b>{money(r.outstanding_paise)}</b>,
                  },
                  {
                    key: "status",
                    label: "Status",
                    render: (r) => <Status value={r.status} />,
                  },
                ]}
              />
            </Card>
            <Card title="Account summary">
              <div className="summary-lines">
                <div>
                  <span>Academic year</span>
                  <b>{s.academic_year}</b>
                </div>
                <div>
                  <span>Annual fees</span>
                  <b>{money(s.total_paise)}</b>
                </div>
                <div>
                  <span>Discounts</span>
                  <b>
                    {money(
                      invoices.reduce(
                        (a: number, i: Row) => a + i.discount_paise,
                        0,
                      ),
                    )}
                  </b>
                </div>
                <div>
                  <span>Scholarships</span>
                  <b>
                    {money(
                      invoices.reduce(
                        (a: number, i: Row) => a + i.scholarship_paise,
                        0,
                      ),
                    )}
                  </b>
                </div>
                <div>
                  <span>Next installment due</span>
                  <b>{s.next_due_date || "All paid"}</b>
                </div>
                <div>
                  <span>Financial clearance</span>
                  <Status value={s.clearance} />
                </div>
              </div>
              {admin && (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setClearance(true)}
                >
                  <ShieldCheck size={16} />
                  Mark financial clearance
                </Button>
              )}
            </Card>
          </div>
        </TabsContent>
        <TabsContent value="fee-structure">
          <Card title="Assigned fee components">
            <DataTable
              rows={data.items || []}
              columns={[
                { key: "name", label: "Fee component" },
                {
                  key: "amount_paise",
                  label: "Gross fee",
                  align: "right",
                  render: (r) => money(r.amount_paise, true),
                },
              ]}
            />
          </Card>
        </TabsContent>
        <TabsContent value="installments">
          <Card
            title="Installments"
            action={
              admin && (
                <div className="inline-actions">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setD({
                        ...d,
                        installmentId: installments[0]?.id || "",
                        dueDate: installments[0]?.due_date || "",
                      });
                      setDue(true);
                    }}
                  >
                    Change due date
                  </Button>
                  <Button
                    onClick={() => {
                      setD({ ...d, installmentId: installments[0]?.id || "" });
                      setAdjust(true);
                    }}
                  >
                    Adjust fee
                  </Button>
                </div>
              )
            }
          >
            <DataTable
              rows={installments}
              columns={[
                { key: "title", label: "Installment" },
                { key: "due_date", label: "Due date" },
                {
                  key: "amount_paise",
                  label: "Base fee",
                  align: "right",
                  render: (r) => money(r.amount_paise),
                },
                {
                  key: "adjustment_paise",
                  label: "Adjustments",
                  align: "right",
                  render: (r) => money(r.adjustment_paise),
                },
                {
                  key: "paid_paise",
                  label: "Paid",
                  align: "right",
                  render: (r) => money(r.paid_paise),
                },
                {
                  key: "outstanding_paise",
                  label: "Pending",
                  align: "right",
                  render: (r) => <strong>{money(r.outstanding_paise)}</strong>,
                },
                {
                  key: "status",
                  label: "Status",
                  render: (r) => <Status value={r.status} />,
                },
              ]}
            />
          </Card>
        </TabsContent>
        <TabsContent value="payments">
          <Suspense fallback={<Loading />}>
            <FeeHistory
              view="payments"
              id={id}
              data={data}
              payments={payments}
              invoices={invoices}
              download={download}
            />
          </Suspense>
        </TabsContent>
        <TabsContent value="ledger">
          <Suspense fallback={<Loading />}>
            <FeeHistory
              view="ledger"
              id={id}
              data={data}
              payments={payments}
              invoices={invoices}
              download={download}
            />
          </Suspense>
        </TabsContent>
        <TabsContent value="invoices">
          <Suspense fallback={<Loading />}>
            <Documents
              view="invoices"
              id={id}
              data={data}
              payments={payments}
              invoices={invoices}
              download={download}
            />
          </Suspense>
        </TabsContent>
        <TabsContent value="receipts">
          <Suspense fallback={<Loading />}>
            <Documents
              view="receipts"
              id={id}
              data={data}
              payments={payments}
              invoices={invoices}
              download={download}
            />
          </Suspense>
        </TabsContent>
        {["discounts", "scholarships"].map((kind) => (
          <TabsContent key={kind} value={kind}>
            <Card
              title={
                kind === "discounts"
                  ? "Discounts & concessions"
                  : "Scholarships"
              }
              action={
                admin && (
                  <Button
                    onClick={() => {
                      setD({
                        ...d,
                        kind: kind === "discounts" ? "Discount" : "Scholarship",
                        installmentId:
                          installments.find((i: Row) => i.outstanding_paise > 0)
                            ?.id || "",
                      });
                      setAdjust(true);
                    }}
                  >
                    <Plus size={15} />
                    Apply benefit
                  </Button>
                )
              }
            >
              <DataTable
                rows={[
                  ...invoices
                    .filter((i: Row) =>
                      kind === "discounts"
                        ? i.discount_paise > 0
                        : i.scholarship_paise > 0,
                    )
                    .map((i: Row) => ({
                      id: i.id,
                      created_at: i.created_at,
                      kind: kind === "discounts" ? "Discount" : "Scholarship",
                      reason: "Approved at fee assignment",
                      approved_by: i.created_by,
                      amount_paise:
                        kind === "discounts"
                          ? i.discount_paise
                          : i.scholarship_paise,
                    })),
                  ...data.adjustments.filter((a: Row) =>
                    kind === "discounts"
                      ? ["Discount", "Concession", "Waiver"].includes(a.kind)
                      : a.kind === "Scholarship",
                  ),
                ]}
                columns={creditColumns}
              />
            </Card>
          </TabsContent>
        ))}
        <TabsContent value="notifications">
          <Card title="Notification history">
            <DataTable
              rows={data.notifications || []}
              columns={[
                {
                  key: "created_at",
                  label: "Date",
                  render: (r) => r.created_at.slice(0, 10),
                },
                { key: "channel", label: "Channel" },
                { key: "message", label: "Message" },
                {
                  key: "status",
                  label: "Status",
                  render: (r) => <Status value={r.status} />,
                },
              ]}
            />
          </Card>
        </TabsContent>
      </Tabs>
      {collect && (
        <PaymentDialog
          open={pay}
          onClose={() => setPay(false)}
          studentId={id}
        />
      )}{" "}
      {can("fees.invoice") && (
        <AssignDialog
          open={assign}
          onClose={() => setAssign(false)}
          studentId={id}
        />
      )}
      <FormDialog
        open={adjust}
        onClose={() => setAdjust(false)}
        title="Approve fee adjustment"
        description="An adjustment entry is added to the ledger. Original fees remain in the financial history."
        busy={busy}
        submitLabel="Approve adjustment"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await request("fees/adjust", {
              method: "POST",
              body: Object.fromEntries(
                Object.entries(d).filter(
                  ([k, v]) => v !== "" && k !== "dueDate",
                ),
              ),
            });
            toast.success("Adjustment approved and posted to ledger.");
            refresh();
            setAdjust(false);
          } catch (e) {
            toast.error((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="Installment">
          <Picker
            value={d.installmentId}
            onChange={(v) => setD({ ...d, installmentId: v })}
            options={[
              { value: "", label: "Choose installment" },
              ...installments.map((i: Row) => ({
                value: i.id,
                label: i.title + " · " + money(i.outstanding_paise) + " unpaid",
              })),
            ]}
          />
        </Field>
        <div className="form-grid">
          <Field label="Adjustment type">
            <Picker
              value={d.kind}
              onChange={(v) =>
                setD({
                  ...d,
                  kind: v,
                  direction: v === "Late Fee" ? "Debit" : "Credit",
                })
              }
              options={[
                "Discount",
                "Scholarship",
                "Concession",
                "Waiver",
                "Adjustment",
                "Late Fee",
              ].map((v) => ({ value: v, label: v }))}
            />
          </Field>
          <Field label="Amount (₹)">
            <Input
              required
              value={d.amount}
              onChange={(e) => setD({ ...d, amount: e.target.value })}
            />
          </Field>
          <Field label="Direction">
            <Picker
              value={d.direction}
              onChange={(v) => setD({ ...d, direction: v })}
              options={[
                { value: "Credit", label: "Reduce fee (credit)" },
                { value: "Debit", label: "Increase fee (debit)" },
              ]}
            />
          </Field>
          <Field label="Fee component (optional)">
            <Picker
              value={d.componentId}
              onChange={(v) => setD({ ...d, componentId: v })}
              options={[
                { value: "", label: "Whole installment" },
                ...boot.components.map((c: Row) => ({
                  value: c.id,
                  label: c.name,
                })),
              ]}
            />
          </Field>
          <Field label="Approval reason" required className="span-2">
            <Input
              required
              minLength={3}
              value={d.reason}
              onChange={(e) => setD({ ...d, reason: e.target.value })}
            />
          </Field>
        </div>
      </FormDialog>
      <FormDialog
        open={due}
        onClose={() => setDue(false)}
        title="Change installment due date"
        busy={busy}
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await request("installments/" + d.installmentId, {
              method: "PATCH",
              body: { dueDate: d.dueDate, reason: d.reason },
            });
            toast.success("Due date updated and audited.");
            refresh();
            setDue(false);
          } catch (e) {
            toast.error((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="Installment">
          <Picker
            value={d.installmentId}
            onChange={(v) =>
              setD({
                ...d,
                installmentId: v,
                dueDate:
                  installments.find((i: Row) => i.id === v)?.due_date || "",
              })
            }
            options={installments.map((i: Row) => ({
              value: i.id,
              label: i.title,
            }))}
          />
        </Field>
        <Field label="New due date">
          <Input
            type="date"
            required
            value={d.dueDate}
            onChange={(e) => setD({ ...d, dueDate: e.target.value })}
          />
        </Field>
        <Field label="Reason">
          <Input
            required
            minLength={3}
            value={d.reason}
            onChange={(e) => setD({ ...d, reason: e.target.value })}
          />
        </Field>
      </FormDialog>
      <Sheet open={details} onOpenChange={setDetails}>
        <SheetContent className="student-sheet">
          <SheetHeader>
            <SheetTitle>{s.name}</SheetTitle>
            <SheetDescription>Student and guardian details</SheetDescription>
          </SheetHeader>
          <div className="sheet-body">
            <Suspense fallback={<Loading />}>
              <GuardianInfo student={s} />
            </Suspense>
            {can("students.manage") && (
              <>
                <Field label="Student photo">
                  <Input
                    type="file"
                    accept="image/png,image/jpeg"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      try {
                        if (file.size > 1000000)
                          throw new Error("Photo must be under 1 MB.");
                        const bytes = new Uint8Array(await file.arrayBuffer());
                        await request("uploads", {
                          method: "POST",
                          body: {
                            studentId: id,
                            type: file.type,
                            content: btoa(
                              Array.from(bytes, (b) =>
                                String.fromCharCode(b),
                              ).join(""),
                            ),
                          },
                        });
                        toast.success("Photo updated.");
                        refresh();
                      } catch (e) {
                        toast.error((e as Error).message);
                      }
                    }}
                  />
                </Field>
                <Field label="Student status">
                  <Picker
                    value={studentStatus}
                    onChange={setStudentStatus}
                    options={[
                      "Active",
                      "Inactive",
                      "Transferred",
                      "Graduated",
                      "Left",
                      "Suspended",
                    ].map((v) => ({ value: v, label: v }))}
                  />
                </Field>
                <Field label="Change reason">
                  <Input
                    value={d.reason}
                    onChange={(e) => setD({ ...d, reason: e.target.value })}
                  />
                </Field>
                <Button
                  onClick={async () => {
                    try {
                      await request("students/" + id, {
                        method: "PATCH",
                        body: { status: studentStatus, reason: d.reason },
                      });
                      refresh();
                      toast.success("Student status updated.");
                    } catch (e) {
                      toast.error((e as Error).message);
                    }
                  }}
                >
                  Update status
                </Button>
                <Button
                  variant="outline"
                  onClick={async () => {
                    try {
                      const result = await request(
                        "parents?" + query({ size: "100" }),
                      );
                      setParents(result.rows);
                      setDetails(false);
                      setD({ ...d, kind: "Link guardian" });
                      setParentId("");
                    } catch (e) {
                      toast.error((e as Error).message);
                    }
                  }}
                >
                  Link another guardian
                </Button>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>
      <FormDialog
        open={parents.length > 0}
        onClose={() => setParents([])}
        title="Link guardian"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await request("students/link-parent", {
              method: "POST",
              body: { studentId: id, parentId },
            });
            toast.success("Guardian linked to student.");
            setParents([]);
            refresh();
          } catch (e) {
            toast.error((e as Error).message);
          }
        }}
      >
        <Field label="Existing guardian">
          <Picker
            value={parentId}
            onChange={setParentId}
            options={[
              { value: "", label: "Choose guardian" },
              ...parents.map((p) => ({
                value: p.id,
                label: p.guardian_name + " · " + p.mobile,
              })),
            ]}
          />
        </Field>
      </FormDialog>
      <AlertDialog open={clearance} onOpenChange={setClearance}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark financial clearance?</AlertDialogTitle>
            <AlertDialogDescription>
              Clearance is allowed only when the selected academic year has no
              outstanding fees. Historical records remain available.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                try {
                  await request("students/" + id, {
                    method: "PATCH",
                    body: {
                      clearance: true,
                      yearId: s.academic_year_id,
                      reason: "Authorized financial clearance",
                    },
                  });
                  refresh();
                  toast.success("Financial clearance recorded.");
                } catch (e) {
                  toast.error((e as Error).message);
                }
              }}
            >
              Confirm clearance
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
```


### `lib/api-client.ts`

```typescript
const pendingKeys = new Map<string, string>();
export class ClientError extends Error {
  constructor(
    message: string,
    public code: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T = any>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    institutionId?: string;
    signal?: AbortSignal;
    idempotencyKey?: string;
  } = {},
): Promise<T> {
  const financial =
    options.method === "POST" &&
    /^(payments|refunds|cash|fees|invoices|rollovers)(\/|$)|^reconciliation\/bank-commit/.test(
      path,
    );
  const bodyKey = (options.body as any)?.idempotencyKey;
  const fingerprint = financial
    ? JSON.stringify([options.institutionId, path, options.body])
    : "";
  // Keep the key after a network/unknown error. Successful intentional repeats
  // get a fresh key; explicit form keys survive retries and double clicks.
  const key =
    options.idempotencyKey ||
    bodyKey ||
    (financial
      ? pendingKeys.get(fingerprint) || crypto.randomUUID()
      : undefined);
  if (financial && key) pendingKeys.set(fingerprint, key);
  const response = await fetch("/api/" + path, {
    method: options.method || "GET",
    headers: {
      ...(key ? { "Idempotency-Key": key } : {}),
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.institutionId
        ? { "X-Institution-ID": options.institutionId }
        : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: options.signal,
    cache: "no-store",
  });
  const result: any = await response.json();
  if (!response.ok || !result.success)
    throw new ClientError(
      result.message || "This request could not be completed.",
      result.errorCode || "REQUEST_FAILED",
      response.status,
    );
  if (financial) pendingKeys.delete(fingerprint);
  return result.data;
}
```


### `package.json`

```json
{
  "name": "campus-ledger",
  "version": "1.0.0",
  "private": true,
  "engines": {
    "node": ">=22.13.0"
  },
  "scripts": {
    "install:ci": "bash scripts/install-pnpm.sh",
    "dev": "node scripts/run-framework.mjs dev",
    "build": "node scripts/run-framework.mjs build",
    "start": "node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js dev --config dist/server/wrangler.json --local --persist-to .wrangler/state --ip 127.0.0.1 --inspector-port 0",
    "lint": "eslint . --ignore-pattern dist --ignore-pattern .next",
    "db:generate": "drizzle-kit generate",
    "test:unit": "node --experimental-strip-types --test tests/money.test.mjs",
    "test:integration": "node tests/integration.mjs",
    "typecheck": "tsc --noEmit",
    "format": "prettier --write app components/campus features server lib/money.ts lib/tabular.ts lib/api-client.ts lib/i18n.ts db tests README.md",
    "test:saas": "node tests/saas.mjs",
    "test:refactor": "node tests/refactor-unit.mjs && node tests/drizzle-tenancy.mjs && node tests/refactor.mjs",
    "test:advanced": "node tests/advanced-unit.mjs && node tests/advanced.mjs"
  },
  "dependencies": {
    "@base-ui/react": "^1.7.0",
    "@hookform/resolvers": "^5.7.1",
    "@shadcn/react": "^0.3.0",
    "@tanstack/react-virtual": "^3.14.13",
    "class-variance-authority": "0.7.1",
    "clsx": "2.1.1",
    "cmdk": "^1.1.1",
    "date-fns": "^4.4.0",
    "drizzle-orm": "0.45.2",
    "embla-carousel-react": "^8.6.0",
    "fflate": "^0.8.3",
    "input-otp": "^1.4.2",
    "lucide-react": "^1.31.0",
    "next": "16.3.4",
    "next-themes": "^0.4.6",
    "papaparse": "^5.7.0",
    "pdf-lib": "^1.17.1",
    "qrcode": "^1.5.4",
    "radix-ui": "^1.6.7",
    "react": "19.2.6",
    "react-day-picker": "^10.0.1",
    "react-dom": "19.2.6",
    "react-hook-form": "^7.85.0",
    "react-resizable-panels": "^4.12.2",
    "recharts": "^3.8.0",
    "sonner": "^2.0.8",
    "tailwind-merge": "3.6.0",
    "vaul": "^1.1.2",
    "zod": "^3.25.76"
  },
  "devDependencies": {
    "@cloudflare/vite-plugin": "1.37.1",
    "@cloudflare/workers-types": "4.20260515.1",
    "@tailwindcss/postcss": "4.2.1",
    "@types/node": "22.19.19",
    "@types/papaparse": "^5.5.2",
    "@types/qrcode": "^1.5.6",
    "@types/react": "19.2.14",
    "@types/react-dom": "19.2.3",
    "@vitejs/plugin-react": "6.0.2",
    "@vitejs/plugin-rsc": "0.5.26",
    "drizzle-kit": "0.31.10",
    "eslint": "9.39.4",
    "eslint-config-next": "16.3.4",
    "json-rpc-2.0": "1.7.1",
    "prettier": "3.6.2",
    "raw-body": "3.0.2",
    "react-server-dom-webpack": "19.2.6",
    "tailwindcss": "4.2.1",
    "tw-animate-css": "^1.4.0",
    "typescript": "5.9.3",
    "vinext": "1.0.0-beta.5",
    "vite": "8.0.13",
    "wrangler": "4.92.0"
  },
  "type": "module",
  "overrides": {
    "miniflare": {
      "sharp": "0.35.4"
    }
  },
  "packageManager": "pnpm@11.25.0"
}
```


### `server/advanced-openapi.ts`

```typescript
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
    security: publicAccess ? [] : [{ ChatGPTSession: [] }],
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
```


### `server/api.ts`

```typescript
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
  csrf,
  platformActor,
  rateLimit,
} from "./security";
import { bootstrap, initializeAccount, session } from "./seed";
import { enforceSubscription, portalInfo, withTenantContext } from "./tenancy";
export async function dispatch(request: Request): Promise<Response> {
  const requestId = uuid();
  try {
    const url = new URL(request.url),
      path = url.pathname
        .replace(/^\/api\/?/, "")
        .split("/")
        .filter(Boolean),
      p = url.searchParams,
      method = request.method;
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
```


### `server/idempotency.ts`

```typescript
import { z } from "zod";
import { MoneyError } from "../lib/money";
import { now, one, Row, run, uuid } from "./db";
import { Actor, ApiError, sha256 } from "./security";

export function validateIdempotencyKey(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
    throw new ApiError(
      400,
      "IDEMPOTENCY_KEY_REQUIRED",
      "Supply a valid UUID in the Idempotency-Key header. Reuse it when retrying the same operation.",
    );
  return value;
}
function canonical(value: any): any {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .filter((k) => k !== "idempotencyKey")
        .sort()
        .map((k) => [k, canonical(value[k])]),
    );
  return value;
}
export function requiresIdempotency(path: string[], method: string) {
  return (
    method === "POST" &&
    (["payments", "refunds", "cash", "fees", "invoices", "rollovers"].includes(
      path[0],
    ) ||
      (path[0] === "reconciliation" && path[1] === "bank-commit"))
  );
}
// Unique, durable claim serializes concurrent requests. Incomplete claims remain
// closed to automatic retries: a process crash must never create a second charge.
export async function idempotent(
  actor: Actor,
  operation: string,
  body: Row,
  next: () => Promise<Response>,
): Promise<Response> {
  const key = validateIdempotencyKey(
    actor.request.headers.get("Idempotency-Key"),
  );
  if (body.idempotencyKey && body.idempotencyKey !== key)
    throw new ApiError(
      409,
      "IDEMPOTENCY_CONFLICT",
      "Header and body idempotency keys must match.",
    );
  body.idempotencyKey = key;
  const hash = await sha256(JSON.stringify(canonical(body)));
  const existing = await one(
    "SELECT * FROM api_idempotency WHERE institution_id=? AND operation=? AND key=?",
    [actor.institutionId, operation, key],
  );
  const replay = (record: Row) => {
    if (record.request_hash !== hash)
      throw new ApiError(
        409,
        "IDEMPOTENCY_CONFLICT",
        "This key belongs to a different request. Use the original request for retries.",
      );
    if (!record.response)
      throw new ApiError(
        409,
        "REQUEST_IN_PROGRESS",
        "This operation is in progress or awaiting recovery. Check its status before retrying.",
      );
    return new Response(record.response, {
      status: record.status_code,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "Idempotency-Replayed": "true",
      },
    });
  };
  if (existing) return replay(existing);
  const id = uuid();
  try {
    await run(
      "INSERT INTO api_idempotency(id,institution_id,key,operation,request_hash,created_at) VALUES(?,?,?,?,?,?)",
      [id, actor.institutionId, key, operation, hash, now()],
    );
  } catch (error) {
    const winner = await one(
      "SELECT * FROM api_idempotency WHERE institution_id=? AND operation=? AND key=?",
      [actor.institutionId, operation, key],
    );
    if (winner) return replay(winner);
    throw error;
  }
  try {
    const response = await next(),
      text = await response.clone().text();
    await run(
      "UPDATE api_idempotency SET response=?,status_code=? WHERE id=? AND institution_id=?",
      [text, response.status, id, actor.institutionId],
    );
    return response;
  } catch (error) {
    // Validation/authorization errors precede mutation. Transient/unknown failures
    // retain the claim because the financial commit may already have succeeded.
    if (
      (error instanceof ApiError &&
        [400, 401, 403, 404, 409, 422, 503].includes(error.status)) ||
      error instanceof z.ZodError ||
      error instanceof MoneyError
    )
      await run(
        "DELETE FROM api_idempotency WHERE id=? AND institution_id=? AND response IS NULL",
        [id, actor.institutionId],
      );
    throw error;
  }
}
```


### `server/openapi.ts`

```typescript
import { advancedPaths } from "./advanced-openapi";
const error = {
  type: "object",
  properties: {
    success: { type: "boolean", example: false },
    message: { type: "string" },
    errorCode: { type: "string" },
    requestId: { type: "string" },
  },
};
const response = {
  description: "Successful operation",
  content: {
    "application/json": {
      schema: {
        type: "object",
        properties: {
          success: { type: "boolean", example: true },
          data: { type: "object" },
          requestId: { type: "string" },
        },
      },
    },
  },
};
const op = (summary: string, tag: string, write = false) => ({
  summary,
  tags: [tag],
  security: [{ ChatGPTSession: [] }],
  ...(write
    ? {
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object" } } },
        },
      }
    : {}),
  responses: {
    "200": response,
    "401": { description: "Sign-in required" },
    "403": { description: "Role or tenant access denied" },
    "422": {
      description: "Validation failure",
      content: { "application/json": { schema: error } },
    },
  },
});
export const openApi = {
  openapi: "3.0.3",
  info: {
    title: "Sohan Soft Tech API",
    version: "3.0.0",
    description:
      "Authenticated, tenant-scoped APIs. Money is integer INR paise in responses and decimal strings in input. All browser identity is validated by Sites authentication. Institution routes are available under /api/campus/{slug}/ with the same fee endpoint suffixes. Legacy tenant APIs require X-Institution-ID and still enforce server authorization. Platform APIs require an independent platform-admin grant. Staff authentication is unchanged. Expiring signed guardian links use /parent-access/{token}; legacy parent-account routes remain retired. See docs/advanced-phase.md for webhook contracts and operational setup.",
  },
  servers: [{ url: "/api" }],
  components: {
    securitySchemes: {
      ChatGPTSession: {
        type: "apiKey",
        in: "cookie",
        name: "dispatch_owned_session",
        description:
          "Dispatch-owned Sign in with ChatGPT. Identity headers are injected by the trusted hosting boundary.",
      },
    },
  },
  paths: {
    ...advancedPaths,
    "/session": {
      get: op(
        "Resolve canonical ChatGPT account, platform role and staff institutions",
        "Authentication",
      ),
    },
    "/portal/{slug}": {
      get: {
        ...op(
          "Public institution branding and default portal path",
          "Institutions",
        ),
        security: [],
      },
    },
    "/campus/{slug}/bootstrap": {
      get: op(
        "Resolve and authorize this institution portal; never fall back to another tenant",
        "Institutions",
      ),
    },
    "/platform/institutions/{id}": {
      get: op(
        "Institution details, usage, administrators and domain settings",
        "Platform",
      ),
      patch: op(
        "Edit institution, branding and lifecycle status",
        "Platform",
        true,
      ),
    },
    "/platform/institutions/{id}/support": {
      post: op(
        "Start an audited one-hour support session; secure cookie is user/tenant bound",
        "Platform",
        true,
      ),
    },
    "/platform/support": {
      post: op("End and invalidate support access", "Platform", true),
    },
    "/platform/plans": {
      get: op("List plan configuration", "Subscriptions"),
      post: op(
        "Create plan with exact INR price and module/seat limits",
        "Subscriptions",
        true,
      ),
    },
    "/platform/plans/{id}": {
      patch: op(
        "Edit plan without silently changing existing subscriptions",
        "Subscriptions",
        true,
      ),
    },
    "/platform/institutions/{id}/subscription": {
      patch: op(
        "Assign plan, dates, status, modules and limits; reject limits below usage",
        "Subscriptions",
        true,
      ),
    },
    "/platform/subscriptions": {
      get: op("Paginated institution subscriptions", "Subscriptions"),
    },
    "/platform/payments": {
      get: op("Subscription payment register", "Subscriptions"),
      post: op(
        "Idempotently record a confirmed subscription payment",
        "Subscriptions",
        true,
      ),
    },
    "/platform/domains": {
      get: op("Paginated custom-domain and SSL provisioning status", "Domains"),
    },
    "/platform/institutions/{id}/domain": {
      post: op(
        "Configure custom hostname and ownership token",
        "Domains",
        true,
      ),
    },
    "/platform/institutions/{id}/verify-domain": {
      post: op(
        "Verify TXT ownership and CNAME through public DNS; does not provision SSL",
        "Domains",
        true,
      ),
    },
    "/platform/usage": {
      get: op("Paginated tenant capacity and usage", "Platform"),
    },
    "/platform/audit": {
      get: op("Immutable platform and support access audit trail", "Audit"),
    },
    "/platform/settings": {
      get: op("Read platform settings", "Platform"),
      patch: op("Save platform settings", "Platform", true),
    },
    "/users/{id}": {
      patch: op(
        "Edit or disable institution staff; prevent self/last-admin changes",
        "Users",
        true,
      ),
    },
    "/users/{id}/reset-access": {
      post: op(
        "Reset institution access grant without changing ChatGPT authentication",
        "Users",
        true,
      ),
    },
    "/invitations/{id}": {
      patch: op("Revoke pending staff access", "Users", true),
    },
    "/usage": {
      get: op(
        "Read this institution's seats, subscription and enabled modules",
        "Institutions",
      ),
    },

    "/platform/dashboard": {
      get: op("Platform institution, staff and subscription KPIs", "Platform"),
    },
    "/platform/institutions": {
      get: op("Search and paginate institutions (Super Admin)", "Platform"),
      post: op(
        "Create institution, academics and ChatGPT administrator grant atomically",
        "Platform",
        true,
      ),
    },
    "/platform/institutions/{id}/admins": {
      post: {
        ...op(
          "Grant an institution administrator access by verified ChatGPT email",
          "Platform",
          true,
        ),
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
      },
    },
    "/bootstrap": {
      get: op("Current user, membership and catalogs", "Authentication"),
    },
    "/students": {
      get: op("Search and paginate students", "Students"),
      post: op("Create student and parent association", "Students", true),
    },
    "/students/{id}": {
      get: {
        ...op("Student financial profile", "Students"),
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
      },
      patch: op("Update status or authorized clearance", "Students", true),
    },
    "/students/promote": {
      post: op("Promote without deleting prior enrollments", "Academic", true),
    },
    "/catalog/years": { post: op("Create academic year", "Academic", true) },
    "/catalog/classes": {
      post: op("Create class or program", "Academic", true),
    },
    "/catalog/sections": {
      post: op("Create section and stream mapping", "Academic", true),
    },
    "/catalog/parents": { post: op("Create guardian", "Parents", true) },
    "/catalog/structures": {
      post: op("Create fee structure and schedule", "Fees", true),
    },
    "/fees/assign": {
      post: op(
        "Assign fee structure and generate invoice atomically",
        "Fees",
        true,
      ),
    },
    "/fees/bulk": {
      post: op("Preview or commit class fee generation", "Fees", true),
    },
    "/fees/adjust": {
      post: op("Create immutable fee concession or adjustment", "Fees", true),
    },
    "/payments": {
      get: op("Payment register", "Payments"),
      post: op("Collect offline payment with idempotency", "Payments", true),
    },
    "/payments/initiate": {
      post: op("Create server-side gateway order", "Payments", true),
    },
    "/payments/verify": {
      post: op(
        "Verify provider signature and captured status",
        "Payments",
        true,
      ),
    },
    "/payments/webhook": {
      post: {
        ...op(
          "Validate raw Razorpay webhook and record once",
          "Payments",
          true,
        ),
        security: [],
        parameters: [
          {
            name: "X-Razorpay-Signature",
            in: "header",
            required: true,
            schema: { type: "string" },
          },
        ],
      },
    },
    "/refunds": {
      get: op("Refund requests", "Refunds"),
      post: op("Request authorized refund", "Refunds", true),
    },
    "/refunds/{id}/approve": {
      post: op(
        "Confirm money returned and post refund ledger",
        "Refunds",
        true,
      ),
    },
    "/reports/{report}": {
      get: op(
        "Collection, outstanding, defaulter and accounting reports",
        "Reports",
      ),
    },
    "/documents/{kind}/{id}": {
      get: op("Download PDF invoice or receipt", "Documents"),
    },
    "/notifications/process": {
      post: op(
        "Dispatch queued notifications through configured adapters",
        "Notifications",
        true,
      ),
    },
    "/users/invite": {
      post: op(
        "Grant staff access with role, granular permissions and optional teacher section",
        "Users",
        true,
      ),
    },
    "/settings": {
      patch: op("Update institution and financial policies", "Settings", true),
    },
    "/providers": {
      get: op("Configured provider status without secrets", "Settings"),
      post: op("Store encrypted provider credentials", "Settings", true),
    },
    "/imports": {
      post: op(
        "Validate, preview or atomically import spreadsheet data",
        "Imports",
        true,
      ),
    },
    "/audit": { get: op("Paginated immutable audit history", "Audit") },
  },
};

for (const [path, routes] of Object.entries(openApi.paths)) {
  const operation = (routes as any).post;
  if (
    operation &&
    /^\/(payments|refunds|fees|invoices|cash)(\/|$)/.test(path) &&
    path !== "/payments/webhook"
  ) {
    operation.parameters = [
      ...(operation.parameters || []),
      {
        name: "Idempotency-Key",
        in: "header",
        required: true,
        description:
          "UUID for this operation. Reuse the same key and payload on retries. Changed payloads and incomplete concurrent requests return 409.",
        schema: { type: "string", format: "uuid" },
      },
    ];
    operation.responses["400"] = {
      description: "Missing or malformed Idempotency-Key",
    };
    operation.responses["409"] = {
      description:
        "Conflicting payload, financial conflict, or request awaiting completion",
    };
  }
}
(openApi.paths["/documents/{kind}/{id}"].get as any).parameters = [
  {
    name: "format",
    in: "query",
    schema: { type: "string", enum: ["a4", "thermal"], default: "a4" },
    description:
      "thermal produces an 80mm receipt. Unpaid A4 invoices include a UPI QR when the institution has configured its payee ID.",
  },
];
```


### `server/platform.ts`

```typescript
import { z } from "zod";
import { parseMoney } from "../lib/money";
import { modules } from "../lib/permissions";
import { saveLogo } from "./branding";
import { dateField } from "./catalog";
import { all, batch, insert, now, one, Row, stamps, stmt, uuid } from "./db";
import {
  configureDomain,
  domainInfo,
  portalOrigin,
  verifyDomain,
} from "./domains";
import {
  createInstitution,
  grantInstitutionAdmin,
  listInstitutions,
  platformDashboard,
} from "./institutions";
import { paging } from "./queries";
import { Actor, ApiError, audit, permit, sha256 } from "./security";
import { platformAudit, tenantSubscription, tenantUsage } from "./tenancy";
import { manageOrganizations } from "./organizations";

const planSchema = z.object({
  name: z.string().trim().min(2).max(80),
  code: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9-]{2,40}$/),
  price: z.string(),
  billingCycle: z.enum(["Monthly", "Quarterly", "Annual"]),
  studentLimit: z.number().int().min(1).max(1000000),
  userLimit: z.number().int().min(1).max(100000),
  modules: z.array(z.enum(modules)).min(1),
  status: z.enum(["Active", "Inactive"]),
});
export async function platformRoute(
  actor: Actor,
  path: string[],
  method: string,
  p: URLSearchParams,
  body: Row,
): Promise<any> {
  permit(actor, "system");
  if (path[0] === "organizations")
    return manageOrganizations(actor, path, method, body);
  const kind = path[0],
    id = path[1],
    action = path[2];
  if (method === "GET") {
    if (kind === "dashboard") return platformDashboard(actor);
    if (kind === "institutions") {
      if (!id) return listInstitutions(actor, p);
      const institution = await one("SELECT * FROM institutions WHERE id=?", [
        id,
      ]);
      if (!institution)
        throw new ApiError(404, "NOT_FOUND", "Institution not found.");
      return {
        institution: {
          ...institution,
          settings: JSON.parse(institution.settings),
        },
        subscription: await tenantSubscription(id),
        usage: await tenantUsage(id),
        domains: await domainInfo(id, actor.request),
        admins: await all(
          "SELECT u.email,COALESCE(NULLIF(m.display_name,''),u.name) name,m.mobile,m.active FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.institution_id=? AND m.role='INSTITUTION_ADMIN'",
          [id],
        ),
        pendingAdmins: await all(
          "SELECT email,display_name name,mobile,status FROM invitations WHERE institution_id=? AND role='INSTITUTION_ADMIN' AND status='Pending'",
          [id],
        ),
      };
    }
    if (kind === "plans")
      return {
        rows: await all("SELECT * FROM saas_plans ORDER BY price_paise,name"),
      };
    if (kind === "subscriptions" || kind === "usage" || kind === "domains") {
      const page = paging(p),
        q = "%" + (p.get("q") || "") + "%",
        status = p.get("status");
      const where =
          " WHERE i.name LIKE ?" +
          (status && kind === "subscriptions" ? " AND s.status=?" : ""),
        values: unknown[] =
          status && kind === "subscriptions" ? [q, status] : [q];
      const base =
        " FROM institutions i JOIN institution_subscriptions s ON s.institution_id=i.id JOIN saas_plans p ON p.id=s.plan_id LEFT JOIN institution_domains d ON d.institution_id=i.id";
      const rows = await all(
        `SELECT i.id,i.name,i.slug,i.status institution_status,s.id subscription_id,s.status,s.start_date,s.end_date,s.student_limit,s.user_limit,p.name plan_name,p.price_paise,p.billing_cycle,d.hostname,d.status domain_status,d.verification_status,d.ssl_status,(SELECT COUNT(*) FROM students st WHERE st.institution_id=i.id AND st.status='Active') students,(SELECT COUNT(*) FROM memberships m WHERE m.institution_id=i.id AND m.active=1 AND m.role NOT IN ('SUPER_ADMIN','PARENT','STUDENT')) users${base}${where} ORDER BY i.name LIMIT ? OFFSET ?`,
        [...values, page.size, page.offset],
      );
      const total = await one("SELECT COUNT(*) count" + base + where, values);
      return {
        rows,
        total: total!.count,
        ...page,
        origin: portalOrigin(actor.request),
      };
    }
    if (kind === "audit") {
      const page = paging(p),
        q = "%" + (p.get("q") || "") + "%";
      const total = await one(
        "SELECT COUNT(*) count FROM platform_audit_logs WHERE action LIKE ?",
        [q],
      );
      return {
        rows: await all(
          "SELECT a.*,i.name institution_name FROM platform_audit_logs a LEFT JOIN institutions i ON i.id=a.institution_id WHERE a.action LIKE ? ORDER BY a.created_at DESC LIMIT ? OFFSET ?",
          [q, page.size, page.offset],
        ),
        total: total!.count,
        ...page,
      };
    }
    if (kind === "payments") {
      const page = paging(p),
        q = "%" + (p.get("q") || "") + "%";
      return {
        rows: await all(
          "SELECT pay.*,i.name institution_name FROM subscription_payments pay JOIN institutions i ON i.id=pay.institution_id WHERE i.name LIKE ? ORDER BY pay.paid_date DESC LIMIT ? OFFSET ?",
          [q, page.size, page.offset],
        ),
        total: (await one(
          "SELECT COUNT(*) count FROM subscription_payments pay JOIN institutions i ON i.id=pay.institution_id WHERE i.name LIKE ?",
          [q],
        ))!.count,
        ...page,
      };
    }
    if (kind === "settings") {
      const settings = JSON.parse(
        (await one("SELECT value FROM platform WHERE key='settings'"))?.value ||
          "{}",
      );
      if (!settings.platformName || settings.platformName === "CampusLedger")
        settings.platformName = "Sohan Soft Tech";
      return {
        origin: portalOrigin(actor.request),
        loginMethod: "ChatGPT",
        owner: actor.email,
        settings,
      };
    }
  }
  if (kind === "institutions" && !id && method === "POST")
    return createInstitution(actor, body);
  if (kind === "institutions" && id) {
    const institution = await one("SELECT * FROM institutions WHERE id=?", [
      id,
    ]);
    if (!institution)
      throw new ApiError(404, "NOT_FOUND", "Institution not found.");
    if (action === "logo" && method === "POST")
      return saveLogo(actor, id, body);
    if (action === "admins" && method === "POST")
      return grantInstitutionAdmin(actor, id, body);
    if (action === "domain" && method === "POST")
      return configureDomain(actor, id, body);
    if (action === "verify-domain" && method === "POST")
      return verifyDomain(actor, id);
    if (action === "support" && method === "POST") {
      const d = z
        .object({ reason: z.string().trim().min(5).max(500) })
        .parse(body);
      const token = uuid() + uuid().replaceAll("-", ""),
        sessionId = uuid(),
        expires = new Date(Date.now() + 3600000).toISOString();
      await batch([
        stmt(
          "UPDATE support_sessions SET ended_at=? WHERE user_id=? AND ended_at IS NULL",
          [now(), actor.userId],
        ),
        insert("support_sessions", {
          id: sessionId,
          institution_id: id,
          user_id: actor.userId,
          token_hash: await sha256(token),
          reason: d.reason,
          expires_at: expires,
          created_at: now(),
        }),
        platformAudit(
          actor,
          "Started institution support access",
          "support_sessions",
          sessionId,
          null,
          { reason: d.reason, expiresAt: expires },
          id,
        ),
        audit(
          { ...actor, institutionId: id, supportSessionId: sessionId },
          "Platform administrator started support access",
          "support_sessions",
          sessionId,
          null,
          { reason: d.reason, expiresAt: expires },
        ),
      ]);
      return {
        data: { portalPath: "/campus/" + institution.slug, expiresAt: expires },
        cookie: `campusledger_support=${token}; Path=/api; Max-Age=3600; HttpOnly; Secure; SameSite=Strict`,
      };
    }
    if (action === "subscription" && method === "PATCH") {
      const d = z
        .object({
          planId: z.string(),
          status: z.enum([
            "Trial",
            "Active",
            "Past Due",
            "Suspended",
            "Expired",
            "Cancelled",
          ]),
          startDate: dateField,
          endDate: dateField,
          studentLimit: z.number().int().min(1).max(1000000),
          userLimit: z.number().int().min(1).max(100000),
          modules: z.array(z.enum(modules)).min(1),
        })
        .parse(body);
      if (d.startDate > d.endDate)
        throw new ApiError(
          422,
          "INVALID_DATES",
          "End date must follow start date.",
        );
      const plan = await one("SELECT * FROM saas_plans WHERE id=?", [d.planId]);
      if (!plan) throw new ApiError(422, "PLAN_REQUIRED", "Select a plan.");
      const old = await tenantSubscription(id),
        usage = await tenantUsage(id);
      if (
        d.studentLimit < usage.students ||
        d.userLimit < usage.users + usage.pendingUsers
      )
        throw new ApiError(
          409,
          "LIMIT_BELOW_USAGE",
          "Limits cannot be lower than current usage, including pending staff access.",
        );
      await batch([
        stmt(
          "UPDATE institution_subscriptions SET plan_id=?,status=?,start_date=?,end_date=?,student_limit=?,user_limit=?,modules=?,updated_at=?,updated_by=? WHERE institution_id=?",
          [
            d.planId,
            d.status,
            d.startDate,
            d.endDate,
            d.studentLimit,
            d.userLimit,
            JSON.stringify(d.modules),
            now(),
            actor.userId,
            id,
          ],
        ),
        stmt(
          "UPDATE institutions SET subscription=?,updated_at=?,updated_by=? WHERE id=?",
          [plan.name, now(), actor.userId, id],
        ),
        platformAudit(
          actor,
          "Updated institution subscription",
          "institution_subscriptions",
          old.id,
          old,
          d,
          id,
        ),
      ]);
      return { saved: true };
    }
    if (!action && method === "PATCH") {
      const d = z
        .object({
          name: z.string().trim().min(2).max(160),
          institutionType: z.enum([
            "School",
            "PU College",
            "College",
            "Academy",
            "Coaching Institute",
            "Other",
          ]),
          institutionCode: z
            .string()
            .trim()
            .regex(/^[A-Za-z0-9_-]{2,30}$/),
          email: z.string().trim().email().or(z.literal("")),
          phone: z.string().max(30),
          address: z.string().max(500),
          city: z.string().max(100),
          state: z.string().max(100),
          pincode: z
            .string()
            .regex(/^\d{6}$/)
            .or(z.literal("")),
          website: z.string().url().startsWith("https://").or(z.literal("")),
          primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
          status: z.enum(["Active", "Suspended", "Archived"]),
        })
        .parse(body);
      if (
        await one(
          "SELECT id FROM institutions WHERE upper(institution_code)=? AND id<>?",
          [d.institutionCode.toUpperCase(), id],
        )
      )
        throw new ApiError(
          409,
          "CODE_EXISTS",
          "Institution code is already in use.",
        );
      await batch([
        stmt(
          "UPDATE institutions SET name=?,institution_type=?,institution_code=?,email=?,phone=?,address=?,city=?,state=?,pincode=?,website=?,status=?,settings=?,updated_at=?,updated_by=? WHERE id=?",
          [
            d.name,
            d.institutionType,
            d.institutionCode.toUpperCase(),
            d.email.toLowerCase(),
            d.phone,
            d.address,
            d.city,
            d.state,
            d.pincode,
            d.website,
            d.status,
            JSON.stringify({
              ...JSON.parse(institution.settings),
              primaryColor: d.primaryColor,
            }),
            now(),
            actor.userId,
            id,
          ],
        ),
        platformAudit(
          actor,
          "Updated institution",
          "institutions",
          id,
          { name: institution.name, status: institution.status },
          d,
          id,
        ),
      ]);
      return { saved: true };
    }
  }
  if (kind === "support" && method === "POST") {
    const rows = await all(
      "SELECT id,institution_id FROM support_sessions WHERE user_id=? AND ended_at IS NULL",
      [actor.userId],
    );
    await batch([
      stmt(
        "UPDATE support_sessions SET ended_at=? WHERE user_id=? AND ended_at IS NULL",
        [now(), actor.userId],
      ),
      ...rows.map((s) =>
        platformAudit(
          actor,
          "Ended institution support access",
          "support_sessions",
          s.id,
          null,
          {},
          s.institution_id,
        ),
      ),
    ]);
    return {
      data: { ended: true },
      cookie:
        "campusledger_support=; Path=/api; Max-Age=0; HttpOnly; Secure; SameSite=Strict",
    };
  }
  if (kind === "plans" && (method === "POST" || method === "PATCH")) {
    const d = planSchema.parse(body),
      price = parseMoney(d.price),
      old = id ? await one("SELECT * FROM saas_plans WHERE id=?", [id]) : null,
      planId = id || uuid();
    if (id && !old) throw new ApiError(404, "NOT_FOUND", "Plan not found.");
    await batch([
      id
        ? stmt(
            "UPDATE saas_plans SET name=?,code=?,price_paise=?,billing_cycle=?,student_limit=?,user_limit=?,modules=?,status=?,updated_at=?,updated_by=? WHERE id=?",
            [
              d.name,
              d.code,
              price,
              d.billingCycle,
              d.studentLimit,
              d.userLimit,
              JSON.stringify(d.modules),
              d.status,
              now(),
              actor.userId,
              id,
            ],
          )
        : insert("saas_plans", {
            id: planId,
            name: d.name,
            code: d.code,
            price_paise: price,
            billing_cycle: d.billingCycle,
            student_limit: d.studentLimit,
            user_limit: d.userLimit,
            modules: JSON.stringify(d.modules),
            status: d.status,
            ...stamps(actor.userId),
          }),
      platformAudit(
        actor,
        id ? "Updated plan" : "Created plan",
        "saas_plans",
        planId,
        old,
        d,
      ),
    ]);
    return { id: planId };
  }
  if (kind === "payments" && method === "POST") {
    const d = z
      .object({
        institutionId: z.string(),
        amount: z.string(),
        method: z.enum(["Bank Transfer", "UPI", "Cash", "Card", "Cheque"]),
        reference: z.string().trim().min(2).max(160),
        paidDate: dateField,
        notes: z.string().max(500).default(""),
        idempotencyKey: z.string().min(16).max(80),
      })
      .parse(body);
    const amount = parseMoney(d.amount);
    if (amount <= 0)
      throw new ApiError(
        422,
        "INVALID_AMOUNT",
        "Amount must be greater than zero.",
      );
    const subscription = await tenantSubscription(d.institutionId),
      hash = await sha256(JSON.stringify({ ...d, idempotencyKey: undefined }));
    const existing = await one(
      "SELECT id,request_hash FROM subscription_payments WHERE institution_id=? AND idempotency_key=?",
      [d.institutionId, d.idempotencyKey],
    );
    if (existing) {
      if (existing.request_hash !== hash)
        throw new ApiError(
          409,
          "IDEMPOTENCY_CONFLICT",
          "This payment key was already used for another request.",
        );
      return { id: existing.id };
    }
    const paymentId = uuid();
    await batch([
      insert("subscription_payments", {
        id: paymentId,
        institution_id: d.institutionId,
        subscription_id: subscription.id,
        amount_paise: amount,
        method: d.method,
        reference: d.reference,
        paid_date: d.paidDate,
        notes: d.notes,
        idempotency_key: d.idempotencyKey,
        request_hash: hash,
        ...stamps(actor.userId),
      }),
      platformAudit(
        actor,
        "Recorded subscription payment",
        "subscription_payments",
        paymentId,
        null,
        { amountPaise: amount, reference: d.reference },
        d.institutionId,
      ),
    ]);
    return { id: paymentId };
  }
  if (kind === "settings" && method === "PATCH") {
    const d = z
        .object({
          supportEmail: z.string().email().or(z.literal("")),
          platformName: z.string().trim().min(2).max(80),
          expiryNoticeDays: z.number().int().min(1).max(90),
        })
        .parse(body),
      old = await one("SELECT value FROM platform WHERE key='settings'");
    await batch([
      stmt(
        "INSERT INTO platform(key,value) VALUES ('settings',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        [JSON.stringify(d)],
      ),
      platformAudit(
        actor,
        "Updated platform settings",
        "platform",
        "settings",
        old ? JSON.parse(old.value) : null,
        d,
      ),
    ]);
    return { saved: true };
  }
  throw new ApiError(404, "NOT_FOUND", "Platform route not found.");
}
```


### `server/routes/extensions.ts`

```typescript
import { z } from "zod";
import { commitBankImport, previewBankImport } from "../bank-reconciliation";
import {
  annualTuitionCertificate,
  approveTuitionAllocation,
  donationCertificate,
  registerDonationCertificate,
} from "../certificates";
import {
  communicationConfig,
  saveCommunicationConfig,
} from "../communications";
import { all, batch, now, stmt } from "../db";
import { assignCard, createDevice, saveDailyRule } from "../hardware";
import { issueParentGrant } from "../parent-portal";
import { audit, own, permit } from "../security";
import { ok, RouteContext } from "./shared";
export async function extensionsRoute(ctx: RouteContext) {
  const { actor, path, method, body, p, requestId } = ctx;
  if (path[0] === "parent-links") {
    permit(actor, "students.manage");
    if (method === "GET")
      return ok(
        {
          rows: await all(
            "SELECT id,parent_id,expires_at,revoked_at,purpose,created_at FROM parent_portal_grants WHERE institution_id=? AND parent_id=? ORDER BY created_at DESC LIMIT 30",
            [actor.institutionId, p.get("parentId") || ""],
          ),
        },
        requestId,
      );
    if (method === "POST" && !path[1]) {
      const d = z
        .object({
          parentId: z.string(),
          days: z.number().int().min(1).max(30).default(7),
        })
        .parse(body);
      return ok(await issueParentGrant(actor, d.parentId, d.days), requestId);
    }
    if (method === "POST" && path[2] === "revoke") {
      await own(actor, "parent_portal_grants", path[1]);
      await batch([
        stmt(
          "UPDATE parent_portal_grants SET revoked_at=?,updated_at=?,updated_by=? WHERE institution_id=? AND id=?",
          [now(), now(), actor.userId, actor.institutionId, path[1]],
        ),
        audit(
          actor,
          "Revoked parent portal link",
          "parent_portal_grants",
          path[1],
          null,
          null,
        ),
      ]);
      return ok({ revoked: true }, requestId);
    }
  }
  if (path[0] === "communications") {
    permit(actor, "settings.manage");
    if (method === "GET")
      return ok(await communicationConfig(actor), requestId);
    if (method === "POST" && path[1] === "consent") {
      const d = z
        .object({
          parentId: z.string(),
          consent: z.boolean(),
          reason: z.string().min(5).max(300),
        })
        .parse(body);
      await own(actor, "parents", d.parentId);
      await batch([
        stmt(
          "UPDATE parents SET sms_consent=?,updated_at=?,updated_by=? WHERE institution_id=? AND id=?",
          [+d.consent, now(), actor.userId, actor.institutionId, d.parentId],
        ),
        audit(
          actor,
          "Recorded guardian SMS consent",
          "parents",
          d.parentId,
          null,
          { consent: d.consent, reason: d.reason },
        ),
      ]);
      return ok({ saved: true }, requestId);
    }
    if (method === "POST" && !path[1])
      return ok(await saveCommunicationConfig(actor, body), requestId);
  }
  if (path[0] === "certificates") {
    permit(actor, "settings.manage");
    if (method === "POST" && path[1] === "tuition-allocations")
      return ok(await approveTuitionAllocation(actor, body), requestId);
    if (method === "POST" && path[1] === "donations")
      return ok(await registerDonationCertificate(actor, body), requestId);
    if (method === "GET" && path[1] === "tuition")
      return annualTuitionCertificate(
        actor,
        p.get("student") || "",
        Number(p.get("financialYear")),
      );
    if (method === "GET" && path[1] === "80g")
      return donationCertificate(actor, path[2]);
  }
  if (path[0] === "hardware") {
    permit(actor, "settings.manage");
    if (method === "GET")
      return ok(
        {
          devices: await all(
            "SELECT id,name,active,created_at FROM hardware_devices WHERE institution_id=? ORDER BY name LIMIT 100",
            [actor.institutionId],
          ),
          cards: await all(
            "SELECT c.id,c.student_id,s.name,c.active FROM rfid_cards c JOIN students s ON s.id=c.student_id AND s.institution_id=c.institution_id WHERE c.institution_id=? LIMIT 100",
            [actor.institutionId],
          ),
          rules: await all(
            "SELECT r.*,s.name student_name FROM daily_fee_rules r JOIN students s ON s.id=r.student_id AND s.institution_id=r.institution_id WHERE r.institution_id=? LIMIT 100",
            [actor.institutionId],
          ),
          attendance: await all(
            "SELECT a.id,a.punched_at,a.direction,a.local_date,s.name student_name,d.name device_name FROM attendance_events a JOIN students s ON s.id=a.student_id AND s.institution_id=a.institution_id JOIN hardware_devices d ON d.id=a.device_id AND d.institution_id=a.institution_id WHERE a.institution_id=? ORDER BY a.created_at DESC LIMIT 50",
            [actor.institutionId],
          ),
        },
        requestId,
      );
    if (method === "POST" && path[1] === "devices")
      return ok(await createDevice(actor, body), requestId);
    if (method === "POST" && path[1] === "cards")
      return ok(await assignCard(actor, body), requestId);
    if (method === "POST" && path[1] === "rules")
      return ok(await saveDailyRule(actor, body), requestId);
    if (method === "PATCH" && ["devices", "cards"].includes(path[1])) {
      const table = path[1] === "devices" ? "hardware_devices" : "rfid_cards",
        d = z.object({ active: z.boolean() }).parse(body);
      await own(actor, table, path[2]);
      await batch([
        stmt(
          `UPDATE ${table} SET active=?,updated_at=?,updated_by=? WHERE institution_id=? AND id=?`,
          [+d.active, now(), actor.userId, actor.institutionId, path[2]],
        ),
        audit(actor, "Changed RFID access", table, path[2], null, d),
      ]);
      return ok({ saved: true }, requestId);
    }
  }
  if (path[0] === "reconciliation" && method === "POST") {
    if (path[1] === "bank-preview")
      return ok(await previewBankImport(actor, body), requestId);
    if (path[1] === "bank-commit")
      return ok(await commitBankImport(actor, body), requestId);
  }
  return null;
}
```


### `server/routes/public.ts`

```typescript
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
```


### `server/routes/resources.ts`

```typescript
import { env } from "cloudflare:workers";
import { z } from "zod";
import { Permission } from "../../lib/permissions";
import { dateField } from "../catalog";
import { all, batch, now, one, Row, stmt } from "../db";
import { listInstitutions } from "../institutions";
import { providerStatus } from "../providers";
import { filters, listStudents, paging } from "../queries";
import { Actor, ApiError, audit, own, permit } from "../security";

export async function listResource(
  actor: Actor,
  kind: string,
  p: URLSearchParams,
) {
  const page = paging(p),
    f = filters(actor, p);
  let sql = "",
    values: unknown[] = [],
    countSql = "";
  if (kind === "parents") {
    permit(actor, "students");
    const w = ["par.institution_id=?"],
      v: unknown[] = [actor.institutionId];
    if (p.get("q")) {
      w.push(
        "(par.guardian_name LIKE ? OR par.mobile LIKE ? OR par.email LIKE ?)",
      );
      v.push(
        "%" + p.get("q") + "%",
        "%" + p.get("q") + "%",
        "%" + p.get("q") + "%",
      );
    }
    if (actor.role === "TEACHER") {
      w.push(
        "EXISTS(SELECT 1 FROM student_parents sp JOIN enrollments e ON e.student_id=sp.student_id WHERE sp.parent_id=par.id AND e.section_id=?)",
      );
      v.push(actor.sectionId);
    }
    sql = `SELECT par.*,(SELECT COUNT(*) FROM student_parents sp WHERE sp.parent_id=par.id) children,(SELECT GROUP_CONCAT(s.name, ', ') FROM student_parents sp JOIN students s ON s.id=sp.student_id WHERE sp.parent_id=par.id) children_names FROM parents par WHERE ${w.join(" AND ")} ORDER BY par.guardian_name`;
    values = v;
  } else if (kind === "structures") {
    permit(actor, "finance");
    sql = `SELECT fs.*,c.name class_name,st.name stream_name,sec.name section_name,(SELECT SUM(amount_paise) FROM fee_structure_items WHERE structure_id=fs.id) total_paise,(SELECT COUNT(*) FROM student_fee_assignments WHERE structure_id=fs.id) assigned FROM fee_structures fs JOIN classes c ON c.id=fs.class_id LEFT JOIN streams st ON st.id=fs.stream_id LEFT JOIN sections sec ON sec.id=fs.section_id WHERE fs.institution_id=? ${p.get("year") ? "AND fs.academic_year_id=?" : ""} ORDER BY c.sort_order,fs.created_at`;
    values = p.get("year")
      ? [actor.institutionId, p.get("year")]
      : [actor.institutionId];
  } else if (["payments", "receipts", "invoices", "refunds"].includes(kind)) {
    if (actor.role === "TEACHER" && !actor.feeVisibility)
      permit(actor, "finance");
    const w = [f.where],
      v = [...f.values],
      alias = kind === "invoices" ? "i" : kind === "refunds" ? "rf" : "pay";
    if (p.get("from")) {
      w.push(
        `date(${alias}.${kind === "payments" || kind === "receipts" ? "paid_at" : "created_at"},'+5 hours','+30 minutes')>=?`,
      );
      v.push(p.get("from"));
    }
    if (p.get("to")) {
      w.push(
        `date(${alias}.${kind === "payments" || kind === "receipts" ? "paid_at" : "created_at"},'+5 hours','+30 minutes')<=?`,
      );
      v.push(p.get("to"));
    }
    if (p.get("q")) {
      w.push(
        `(s.name LIKE ? OR s.admission_number LIKE ? OR ${kind === "invoices" ? "i.number" : kind === "receipts" ? "rec.number" : "COALESCE(" + alias + ".reference,'')"} LIKE ?)`,
      );
      v.push(
        "%" + p.get("q") + "%",
        "%" + p.get("q") + "%",
        "%" + p.get("q") + "%",
      );
    }
    if (p.get("status")) {
      w.push(`${alias}.status=?`);
      v.push(p.get("status"));
    }
    const joins = (al: string) =>
      `JOIN students s ON s.id=${al}.student_id JOIN enrollments e ON e.student_id=${al}.student_id AND e.academic_year_id=${al}.academic_year_id AND e.institution_id=${al}.institution_id JOIN sections sec ON sec.id=e.section_id JOIN classes c ON c.id=sec.class_id`;
    if (kind === "payments")
      sql = `SELECT pay.*,s.name student_name,s.admission_number,c.name class_name,sec.name section_name,rec.id receipt_id,rec.number receipt_number,COALESCE((SELECT SUM(amount_paise) FROM refunds rf WHERE rf.payment_id=pay.id AND rf.status='Processed'),0) refunded_paise FROM payments pay ${joins("pay")} LEFT JOIN receipts rec ON rec.payment_id=pay.id WHERE ${w.join(" AND ")} ORDER BY pay.paid_at DESC`;
    if (kind === "receipts")
      sql = `SELECT rec.*,pay.student_id,pay.amount_paise,pay.method,pay.reference,pay.paid_at,s.name student_name,s.admission_number,c.name class_name FROM receipts rec JOIN payments pay ON pay.id=rec.payment_id ${joins("pay")} WHERE ${w.join(" AND ")} ORDER BY pay.paid_at DESC`;
    if (kind === "invoices")
      sql = `SELECT i.*,s.name student_name,s.admission_number,c.name class_name FROM invoice_balances i ${joins("i")} WHERE ${w.join(" AND ")} ORDER BY i.created_at DESC`;
    if (kind === "refunds") {
      permit(actor, "refund");
      sql = `SELECT rf.*,s.name student_name,c.name class_name FROM refunds rf ${joins("rf")} WHERE ${w.join(" AND ")} ORDER BY rf.created_at DESC`;
    }
    values = v;
  } else if (kind === "notifications") {
    if (["PARENT", "STUDENT", "TEACHER"].includes(actor.role)) {
      if (actor.role === "TEACHER") permit(actor, "finance");
      const data = await listStudents(
        actor,
        new URLSearchParams({ ...Object.fromEntries(p), size: "100" }),
      );
      const ids = data.rows.map((r) => r.id);
      if (!ids.length) return { rows: [], total: 0, ...page };
      sql = `SELECT * FROM notifications WHERE institution_id=? AND student_id IN (${ids.map(() => "?").join(",")}) ORDER BY created_at DESC`;
      values = [actor.institutionId, ...ids];
    } else {
      permit(actor, "finance");
      sql =
        "SELECT n.*,s.name student_name FROM notifications n LEFT JOIN students s ON s.id=n.student_id WHERE n.institution_id=? ORDER BY n.created_at DESC";
      values = [actor.institutionId];
    }
  } else if (kind === "audit") {
    permit(actor, "admin");
    const where = ["institution_id=?"];
    values = [actor.institutionId];
    if (p.get("q")) {
      where.push("(action LIKE ? OR user_name LIKE ? OR entity_id LIKE ?)");
      const q = "%" + p.get("q") + "%";
      values.push(q, q, q);
    }
    const category = p.get("category");
    if (category === "approval")
      where.push(
        "(lower(action) LIKE '%approv%' OR lower(action) LIKE '%supervisor%')",
      );
    if (category === "waiver")
      where.push(
        "(lower(action) LIKE '%concession%' OR lower(action) LIKE '%waiv%' OR lower(new_value) LIKE '%waiv%' OR lower(new_value) LIKE '%concession%')",
      );
    if (category === "backdated")
      where.push(
        "(lower(action) LIKE '%backdat%' OR lower(action) LIKE '%due date%' OR lower(action) LIKE '%revers%')",
      );
    sql =
      "SELECT * FROM audit_logs WHERE " +
      where.join(" AND ") +
      " ORDER BY created_at DESC,id DESC";
  } else if (kind === "reconciliation") {
    permit(actor, "collect");
    sql = `SELECT r.*,s.name student_name FROM reconciliation_records r LEFT JOIN students s ON s.id=r.student_id WHERE r.institution_id=? ${p.get("year") ? "AND r.academic_year_id=?" : ""} ORDER BY r.created_at DESC`;
    values = p.get("year")
      ? [actor.institutionId, p.get("year")]
      : [actor.institutionId];
  } else if (kind === "users") {
    permit(actor, "users.view");
    const members = await all(
        "SELECT m.*,COALESCE(NULLIF(m.display_name,''),u.name) name,u.email FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.institution_id=? AND m.role NOT IN ('SUPER_ADMIN','PARENT','STUDENT') ORDER BY u.name",
        [actor.institutionId],
      ),
      invitations = await all(
        "SELECT * FROM invitations WHERE institution_id=? AND role NOT IN ('PARENT','STUDENT','SUPER_ADMIN') ORDER BY created_at DESC",
        [actor.institutionId],
      );
    return { members, invitations };
  } else if (kind === "providers") {
    permit(actor, "admin");
    return {
      providers: await providerStatus(actor.institutionId),
      encryptionReady: !!env.PROVIDER_ENCRYPTION_KEY,
    };
  } else if (kind === "institutions") {
    return listInstitutions(actor, p);
  } else if (kind === "jobs") {
    permit(actor, "admin");
    sql =
      "SELECT * FROM job_runs WHERE institution_id=? ORDER BY created_at DESC";
    values = [actor.institutionId];
  } else if (kind === "structure-items") {
    permit(actor, "finance");
    const id = p.get("structure") || "";
    await own(actor, "fee_structures", id);
    sql =
      "SELECT fi.*,fc.name FROM fee_structure_items fi JOIN fee_components fc ON fc.id=fi.component_id WHERE fi.institution_id=? AND fi.structure_id=?";
    values = [actor.institutionId, id];
  } else throw new ApiError(404, "NOT_FOUND", "Resource not found.");
  const total = await one(
      "SELECT COUNT(*) count FROM (" + sql + ") records",
      values,
    ),
    rows = await all(sql + " LIMIT ? OFFSET ?", [
      ...values,
      page.size,
      page.offset,
    ]);
  return { rows, total: total!.count, ...page };
}
export async function patchResource(actor: Actor, path: string[], body: Row) {
  permit(
    actor,
    (
      {
        students: "students.manage",
        years: "academics.manage",
        components: "fees.manage",
        installments: "fees.manage",
        settings: "settings.manage",
      } as Record<string, Permission>
    )[path[0]] || "settings.manage",
  );
  const kind = path[0],
    id = path[1];
  if (kind === "settings") {
    const current = (await one("SELECT * FROM institutions WHERE id=?", [
      actor.institutionId,
    ])) as Row;
    const d = z
      .object({
        name: z.string().min(2).max(160),
        address: z.string().max(500),
        email: z.string().email().or(z.literal("")),
        phone: z.string().max(20),
        gstin: z.string().max(15).optional(),
        settings: z.object({
          lateFee: z.object({
            enabled: z.boolean(),
            mode: z.enum(["Fixed", "Daily", "Percentage"]),
            value: z.number().int().min(0).max(10000000),
            graceDays: z.number().int().min(0).max(90),
            maxPaise: z.number().int().min(0).max(100000000),
          }),
          reminders: z.object({
            beforeDays: z.number().int().min(0).max(30),
            afterDays: z.number().int().min(0).max(90),
            channel: z.enum(["SMS", "WhatsApp", "Email"]),
          }),
          templates: z.object({
            upcoming: z.string().min(5).max(1500),
            overdue: z.string().min(5).max(1500),
          }),
          upi: z
            .object({
              payeeId: z
                .string()
                .regex(/^[a-zA-Z0-9._-]{2,256}@[a-zA-Z][a-zA-Z0-9.-]{1,64}$/)
                .or(z.literal("")),
              payeeName: z.string().max(100),
            })
            .optional(),
          receiptNotifications: z
            .object({
              enabled: z.boolean(),
              channel: z.enum(["Email", "SMS", "WhatsApp"]),
            })
            .optional(),
          gateway: z.enum(["Razorpay", "Cashfree"]),
          language: z.enum(["en", "kn", "hi"]),
        }),
      })
      .parse(body);
    const settings = { ...JSON.parse(current.settings), ...d.settings };
    await batch([
      stmt(
        "UPDATE institutions SET name=?,address=?,email=?,phone=?,gstin=?,settings=?,updated_at=?,updated_by=? WHERE id=?",
        [
          d.name,
          d.address,
          d.email,
          d.phone,
          d.gstin || null,
          JSON.stringify(settings),
          now(),
          actor.userId,
          actor.institutionId,
        ],
      ),
      audit(
        actor,
        "Updated institution settings",
        "institutions",
        actor.institutionId,
        { ...current, settings: JSON.parse(current.settings) },
        { ...d, settings },
      ),
    ]);
    return { saved: true };
  }
  if (kind === "students") {
    const current = await own(actor, "students", id),
      d = z
        .object({
          name: z.string().min(1).max(160).optional(),
          status: z
            .enum([
              "Active",
              "Inactive",
              "Transferred",
              "Graduated",
              "Left",
              "Suspended",
            ])
            .optional(),
          clearance: z.boolean().optional(),
          yearId: z.string().optional(),
          reason: z.string().min(3).max(500),
        })
        .parse(body);
    const statements = [];
    if (d.clearance) {
      if (!d.yearId)
        throw new ApiError(422, "YEAR_REQUIRED", "Select the academic year.");
      const balance = await one(
        "SELECT outstanding_paise FROM student_balances WHERE institution_id=? AND student_id=? AND academic_year_id=?",
        [actor.institutionId, id, d.yearId],
      );
      if ((balance?.outstanding_paise || 0) > 0)
        throw new ApiError(
          409,
          "FEES_OUTSTANDING",
          "Clear outstanding fees before marking financial clearance.",
        );
      statements.push(
        stmt(
          "UPDATE enrollments SET clearance='Cleared',updated_at=?,updated_by=? WHERE institution_id=? AND student_id=? AND academic_year_id=?",
          [now(), actor.userId, actor.institutionId, id, d.yearId],
        ),
      );
    }
    if (d.name || d.status)
      statements.push(
        stmt(
          "UPDATE students SET name=COALESCE(?,name),status=COALESCE(?,status),updated_at=?,updated_by=? WHERE institution_id=? AND id=?",
          [
            d.name || null,
            d.status || null,
            now(),
            actor.userId,
            actor.institutionId,
            id,
          ],
        ),
      );
    statements.push(
      audit(
        actor,
        "Updated student / financial clearance",
        "students",
        id,
        { name: current.name, status: current.status },
        d,
      ),
    );
    await batch(statements);
    return { saved: true };
  }
  if (kind === "installments") {
    const current = await own(actor, "installments", id),
      d = z
        .object({ dueDate: dateField, reason: z.string().min(3).max(500) })
        .parse(body),
      year = await own(actor, "academic_years", current.academic_year_id);
    if (["Closed", "Archived"].includes(year.status))
      throw new ApiError(409, "YEAR_CLOSED", "This academic year is closed.");
    if (d.dueDate < year.start_date || d.dueDate > year.end_date)
      throw new ApiError(
        422,
        "INVALID_DUE_DATE",
        "Due date must fall within the academic year.",
      );
    await batch([
      stmt(
        "UPDATE installments SET due_date=?,updated_at=?,updated_by=? WHERE institution_id=? AND id=?",
        [d.dueDate, now(), actor.userId, actor.institutionId, id],
      ),
      audit(
        actor,
        "Overrode installment due date",
        "installments",
        id,
        { dueDate: current.due_date },
        d,
      ),
    ]);
    return { saved: true };
  }
  if (kind === "years") {
    const current = await own(actor, "academic_years", id),
      d = z
        .object({ status: z.enum(["Draft", "Active", "Closed", "Archived"]) })
        .parse(body);
    await batch([
      stmt(
        "UPDATE academic_years SET status=?,updated_at=?,updated_by=? WHERE institution_id=? AND id=?",
        [d.status, now(), actor.userId, actor.institutionId, id],
      ),
      audit(
        actor,
        "Changed academic year status",
        "academic_years",
        id,
        { status: current.status },
        d,
      ),
    ]);
    return { saved: true };
  }
  if (kind === "components") {
    const current = await own(actor, "fee_components", id),
      d = z
        .object({
          name: z.string().min(1).max(160),
          category: z.string().min(1).max(100),
          active: z.boolean(),
          sortOrder: z.number().int().min(0),
        })
        .parse(body);
    await batch([
      stmt(
        "UPDATE fee_components SET name=?,category=?,active=?,sort_order=?,updated_at=?,updated_by=? WHERE institution_id=? AND id=?",
        [
          d.name,
          d.category,
          +d.active,
          d.sortOrder,
          now(),
          actor.userId,
          actor.institutionId,
          id,
        ],
      ),
      audit(actor, "Updated fee component", "fee_components", id, current, d),
    ]);
    return { saved: true };
  }
  if (kind === "users") {
    const current = await own(actor, "memberships", id);
    if (current.role === "SUPER_ADMIN" && actor.role !== "SUPER_ADMIN")
      throw new ApiError(
        403,
        "FORBIDDEN",
        "Only a platform administrator can manage Super Admin access.",
      );
    if (current.user_id === actor.userId)
      throw new ApiError(
        422,
        "SELF_ROLE_CHANGE",
        "You cannot remove or change your own access.",
      );
    const d = z.object({ active: z.boolean() }).parse(body);
    await batch([
      stmt(
        "UPDATE memberships SET active=?,updated_at=?,updated_by=? WHERE institution_id=? AND id=?",
        [+d.active, now(), actor.userId, actor.institutionId, id],
      ),
      audit(
        actor,
        "Updated user access",
        "memberships",
        id,
        { active: current.active },
        d,
      ),
    ]);
    return { saved: true };
  }
  if (kind === "institutions") {
    permit(actor, "system");
    const current = await one(
      "SELECT id,status,subscription FROM institutions WHERE id=?",
      [id],
    );
    if (!current)
      throw new ApiError(404, "NOT_FOUND", "Institution not found.");
    const d = z
      .object({
        status: z.enum(["Active", "Suspended"]),
        subscription: z.enum(["Starter", "Professional", "Enterprise"]),
      })
      .parse(body);
    await batch([
      stmt(
        "UPDATE institutions SET status=?,subscription=?,updated_at=?,updated_by=? WHERE id=?",
        [d.status, d.subscription, now(), actor.userId, id],
      ),
      audit(
        { ...actor, institutionId: id },
        "Updated subscription",
        "institutions",
        id,
        current,
        d,
      ),
    ]);
    return { saved: true };
  }
  throw new ApiError(404, "NOT_FOUND", "Update route not found.");
}
```


### `server/routes/shared.ts`

```typescript
import { z } from "zod";
import { MoneyError } from "../../lib/money";
import { Permission } from "../../lib/permissions";
import { Row } from "../db";
import { Actor, ApiError, hasPermission, permit } from "../security";
export type RouteContext = {
  actor: Actor;
  path: string[];
  p: URLSearchParams;
  method: string;
  body: Row;
  request: Request;
  url: URL;
  requestId: string;
};
export function responseHeaders(id: string) {
  return {
    "Content-Type": "application/json",
    "Cache-Control": "private,no-store",
    "X-Content-Type-Options": "nosniff",
    "X-Request-ID": id,
    "Referrer-Policy": "strict-origin-when-cross-origin",
  };
}
export function ok(data: unknown, id: string) {
  return new Response(JSON.stringify({ success: true, data, requestId: id }), {
    headers: responseHeaders(id),
  });
}
export async function readBody(request: Request): Promise<Row> {
  const text = await request.text();
  if (text.length > 3500000)
    throw new ApiError(
      413,
      "PAYLOAD_TOO_LARGE",
      "Request exceeds the upload limit.",
    );
  try {
    return text.trim() ? JSON.parse(text) : {};
  } catch {
    throw new ApiError(400, "INVALID_JSON", "Enter valid JSON data.");
  }
}
export function routeArea(path: string[]) {
  const areas: Record<string, string> = {
    students: "students",
    parents: "students",
    years: "academics",
    catalog: ["components", "structures", "benefits"].includes(path[1])
      ? "fees"
      : "academics",
    structures: "fees",
    fees: "fees",
    installments: "fees",
    invoices: "fees",
    outstanding: "fees",
    defaulters: "fees",
    payments: "payments",
    refunds: "payments",
    cash: "payments",
    reconciliation: "payments",
    receipts: "receipts",
    documents: path[1] === "receipt" ? "receipts" : "fees",
    reports: "reports",
    users: "users",
    invitations: "users",
    settings: "settings",
    providers: "settings",
    hardware: "settings",
    communications: "settings",
    certificates: "fees",
    "parent-links": "students",
    rollovers: "academics",
  };
  return areas[path[0]];
}
export function guardRoute(
  actor: Actor,
  path: string[],
  method: string,
  p: URLSearchParams,
) {
  const k = path[0],
    read = method === "GET";
  let permission: Permission | undefined;
  if (["students", "parents", "uploads", "search"].includes(k))
    permission = read ? "students.view" : "students.manage";
  if (k === "catalog")
    permission =
      path[1] === "parents"
        ? "students.manage"
        : ["components", "structures", "benefits"].includes(path[1])
          ? "fees.manage"
          : "academics.manage";
  if (["years"].includes(k))
    permission = read ? "academics.view" : "academics.manage";
  if (
    [
      "fees",
      "structures",
      "structure-items",
      "components",
      "installments",
      "invoices",
      "outstanding",
      "defaulters",
    ].includes(k)
  )
    permission = read
      ? "fees.view"
      : k === "invoices"
        ? "fees.invoice"
        : "fees.manage";
  if (["payments", "reconciliation", "cash", "notifications"].includes(k))
    permission = read ? "payments.view" : "payments.collect";
  if (k === "payments" && !read && ["confirm", "cancel"].includes(path[2]))
    permission = "payments.manage";
  if (k === "reconciliation" && !read) permission = "payments.manage";
  if (k === "cash") permission = read ? "payments.view" : "cash.close";
  if (k === "refunds")
    permission = read || !path[1] ? "refunds.request" : "refunds.approve";
  if (k === "receipts") permission = "receipts.view";
  if (k === "reports")
    permission = p.get("format") ? "reports.export" : "reports.view";
  if (k === "users" || k === "invitations")
    permission = read ? "users.view" : "users.manage";
  if (["settings", "providers", "jobs", "audit"].includes(k))
    permission = read ? "settings.view" : "settings.manage";
  if (k === "documents")
    permission = path[1] === "receipt" ? "receipts.view" : "fees.view";
  if (permission) permit(actor, permission);
  if (k === "template")
    permit(
      actor,
      path[1] === "students" || path[1] === "parents"
        ? "students.manage"
        : path[1] === "reconciliation"
          ? "payments.manage"
          : "fees.manage",
    );
  if (k === "dashboard" && !hasPermission(actor, "fees.view"))
    throw new ApiError(
      403,
      "FORBIDDEN",
      "Your role cannot access financial dashboards.",
    );
}
export function errorResponse(error: unknown, requestId: string): Response {
  let status = 500,
    code = "INTERNAL_ERROR",
    message = "This operation could not be completed. Please try again.";
  let fields: unknown;
  if (error instanceof ApiError) {
    status = error.status;
    code = error.code;
    message = error.message;
  } else if (error instanceof MoneyError) {
    status = 422;
    code = "INVALID_AMOUNT";
    message = error.message;
  } else if (error instanceof z.ZodError) {
    status = 422;
    code = "VALIDATION_ERROR";
    message = error.issues
      .map((i) => i.path.join(".") + ": " + i.message)
      .join("; ");
    fields = error.flatten().fieldErrors;
  } else if (error instanceof Error) {
    if (/STUDENT_LIMIT_REACHED|USER_LIMIT_REACHED/.test(error.message)) {
      status = 409;
      code = error.message.includes("STUDENT_LIMIT_REACHED")
        ? "STUDENT_LIMIT_REACHED"
        : "USER_LIMIT_REACHED";
      message =
        "Your institution plan limit has been reached. Contact the platform administrator to upgrade.";
    } else if (/UNIQUE constraint|ALREADY|duplicate/i.test(error.message)) {
      status = 409;
      code = "DUPLICATE_RECORD";
      message =
        "This record already exists. Check existing records before trying again.";
    } else if (
      /ACADEMIC_YEAR_FROZEN|ROLLOVER_ROSTER_FROZEN|ROLLOVER_PREVIEW_CHANGED|INVALID_CARRY_FORWARD|CASH_BALANCE_CHANGED|UNBALANCED_JOURNAL|OVERPAYMENT|INVALID_ADJUSTMENT|REFUND_TOO_LARGE|IMMUTABLE|TENANT_ISOLATION|INVALID_ALLOCATION|INCOMPLETE_PAYMENT|ACADEMIC_YEAR_ISOLATION|CASH_DAY_CLOSED/.test(
        error.message,
      )
    ) {
      status = 409;
      code = "FINANCIAL_CONFLICT";
      message =
        "The balance or record changed. Refresh the page and try again.";
    } else if (
      /Enter an amount|supported range|Percentage|Installments/.test(
        error.message,
      )
    ) {
      status = 422;
      code = "INVALID_AMOUNT";
      message = error.message;
    } else
      console.error(
        "Sohan Soft Tech request failed",
        requestId,
        error.message.slice(0, 240),
      );
  }
  return new Response(
    JSON.stringify({
      success: false,
      message,
      errorCode: code,
      fields,
      requestId,
    }),
    { status, headers: responseHeaders(requestId) },
  );
}
```


### `server/security.ts`

```typescript
import { normalizedPermissions, Permission } from "../lib/permissions";
import { all, insert, now, one, Row, stmt, uuid } from "./db";
export type Role =
  | "SUPER_ADMIN"
  | "INSTITUTION_ADMIN"
  | "ACCOUNTANT"
  | "FEE_COLLECTOR"
  | "FEE_COUNTER_CASHIER"
  | "AUDITOR"
  | "RECEPTIONIST"
  | "CUSTOM"
  | "TEACHER"
  | "PARENT"
  | "STUDENT";
export type Actor = {
  userId: string;
  name: string;
  email: string;
  institutionId: string;
  role: Role;
  parentId?: string;
  studentId?: string;
  sectionId?: string;
  feeVisibility: boolean;
  request: Request;
  permissions?: Permission[];
  platform?: boolean;
  supportSessionId?: string;
  portalGrantId?: string;
  organizationId?: string;
};
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export const deny = () => {
  throw new ApiError(
    403,
    "FORBIDDEN",
    "You do not have permission for this action.",
  );
};
export function permit(
  actor: Actor,
  permission:
    | "admin"
    | "collect"
    | "finance"
    | "students"
    | "refund"
    | "system"
    | Permission,
) {
  if (permission === "system") {
    if (actor.platform) return;
    deny();
  }
  const required: Permission =
    (
      {
        admin: "settings.manage",
        collect: "payments.collect",
        finance: "fees.view",
        students: "students.view",
        refund: "refunds.request",
      } as Record<string, Permission>
    )[permission] || (permission as Permission);
  if (!hasPermission(actor, required)) deny();
}
export function hasPermission(actor: Actor, permission: Permission) {
  return (actor.permissions || normalizedPermissions(actor.role)).includes(
    permission,
  );
}
export async function platformActor(request: Request): Promise<Actor> {
  const identity = await authenticate(request);
  if (
    !(await one(
      "SELECT user_id FROM platform_admins WHERE user_id=? AND active=1",
      [identity.userId],
    ))
  )
    deny();
  return {
    ...identity,
    institutionId: "",
    role: "SUPER_ADMIN",
    feeVisibility: false,
    permissions: [],
    platform: true,
    request,
  };
}
export async function authenticate(
  request: Request,
): Promise<{ userId: string; name: string; email: string }> {
  const email = request.headers
    .get("oai-authenticated-user-email")
    ?.trim()
    .toLowerCase();
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new ApiError(
      401,
      "AUTH_REQUIRED",
      "Sign in to access Sohan Soft Tech.",
    );
  // Dispatch verifies and sanitizes the email header. Its optional subject can
  // change between session formats; it must never create a second app account.
  const userId = await accountIdForEmail(email);
  let name = email.split("@")[0];
  if (
    request.headers.get("oai-authenticated-user-full-name-encoding") ===
    "percent-encoded-utf-8"
  ) {
    try {
      name = decodeURIComponent(
        request.headers.get("oai-authenticated-user-full-name") || name,
      );
    } catch {}
  }
  return { userId, name, email };
}
export async function accountIdForEmail(email: string): Promise<string> {
  const accounts = await all<{
    id: string;
    is_owner: number;
    has_membership: number;
  }>(
    `SELECT u.id,CASE WHEN u.id=(SELECT value FROM platform WHERE key='owner') THEN 1 ELSE 0 END is_owner,
      EXISTS(SELECT 1 FROM memberships m WHERE m.user_id=u.id) has_membership
     FROM users u WHERE u.email=? ORDER BY is_owner DESC,has_membership DESC,u.created_at,u.id LIMIT 3`,
    [email],
  );
  const owner = accounts.find((account) => account.is_owner);
  const members = accounts.filter((account) => account.has_membership);
  if (!owner && members.length > 1)
    throw new ApiError(
      403,
      "ACCOUNT_AMBIGUOUS",
      "Your account could not be matched. Contact your institution administrator.",
    );
  // Keep the account that owns memberships and financial history. Legacy empty
  // duplicate rows remain intact; they never acquire permissions from a subject.
  return (
    owner?.id ||
    members[0]?.id ||
    accounts[0]?.id ||
    "email-" + (await sha256(email))
  );
}
export async function actorFor(request: Request): Promise<Actor> {
  const identity = await authenticate(request),
    institutionId = request.headers.get("x-institution-id");
  if (!institutionId)
    throw new ApiError(
      400,
      "TENANT_REQUIRED",
      "Open your institution portal to continue.",
    );
  const institution = await one(
    "SELECT id,status,organization_id FROM institutions WHERE id=?",
    [institutionId],
  );
  if (!institution)
    throw new ApiError(404, "NOT_FOUND", "Institution not found.");
  const isPlatform = !!(await one(
    "SELECT user_id FROM platform_admins WHERE user_id=? AND active=1",
    [identity.userId],
  ));
  const cookie = request.headers
    .get("cookie")
    ?.split(";")
    .map((v) => v.trim())
    .find((v) => v.startsWith("campusledger_support="))
    ?.slice("campusledger_support=".length);
  if (isPlatform && cookie) {
    const support = await one(
      "SELECT id FROM support_sessions WHERE token_hash=? AND user_id=? AND institution_id=? AND ended_at IS NULL AND expires_at>?",
      [await sha256(cookie), identity.userId, institutionId, now()],
    );
    if (support)
      return {
        ...identity,
        institutionId,
        organizationId: institution.organization_id || undefined,
        role: "INSTITUTION_ADMIN",
        feeVisibility: true,
        permissions: normalizedPermissions("INSTITUTION_ADMIN"),
        platform: false,
        supportSessionId: support.id,
        request,
      };
  }
  if (institution.status !== "Active")
    throw new ApiError(
      403,
      "INSTITUTION_UNAVAILABLE",
      "This institution is suspended or archived. Contact the platform administrator.",
    );
  const members = await all(
    "SELECT m.* FROM memberships m WHERE m.user_id=? AND m.active=1 AND m.institution_id=? AND m.role NOT IN ('SUPER_ADMIN','PARENT','STUDENT')",
    [identity.userId, institutionId],
  );
  const m = members[0];
  if (!m)
    throw new ApiError(
      403,
      "MEMBERSHIP_REQUIRED",
      isPlatform
        ? "Start an audited support session from Platform → Institutions."
        : "Ask your institution administrator to grant staff access to your email address.",
    );
  return {
    ...identity,
    institutionId: m.institution_id,
    organizationId: institution.organization_id || undefined,
    role: m.role,
    parentId: m.parent_id,
    studentId: m.student_id,
    sectionId: m.section_id,
    feeVisibility: !!m.fee_visibility,
    permissions: normalizedPermissions(
      m.role,
      JSON.parse(m.permissions || "[]"),
    ),
    request,
  };
}
export async function own(
  actor: Actor,
  table: string,
  id: string,
  yearId?: string,
): Promise<Row> {
  if (!/^[a-z_]+$/.test(table)) throw new Error("Invalid identifier");
  const record = await one(
    `SELECT * FROM ${table} WHERE institution_id=? AND id=? ${yearId ? "AND academic_year_id=?" : ""}`,
    yearId ? [actor.institutionId, id, yearId] : [actor.institutionId, id],
  );
  if (!record)
    throw new ApiError(
      404,
      "NOT_FOUND",
      "The requested record could not be found.",
    );
  return record;
}
export async function accessStudent(
  actor: Actor,
  studentId: string,
  yearId?: string,
) {
  await own(actor, "students", studentId);
  permit(actor, "students.view");
  if (
    actor.portalGrantId &&
    !(await one(
      "SELECT id FROM student_parents WHERE institution_id=? AND student_id=? AND parent_id=?",
      [actor.institutionId, studentId, actor.parentId],
    ))
  )
    throw new ApiError(404, "NOT_FOUND", "Student not found.");
  if (actor.role !== "TEACHER") return;
  if (
    actor.role === "TEACHER" &&
    actor.sectionId &&
    (await one(
      `SELECT id FROM enrollments WHERE institution_id=? AND section_id=? AND student_id=? ${yearId ? "AND academic_year_id=?" : ""}`,
      yearId
        ? [actor.institutionId, actor.sectionId, studentId, yearId]
        : [actor.institutionId, actor.sectionId, studentId],
    ))
  )
    return;
  deny();
}
export function audit(
  actor: Actor,
  action: string,
  entity: string,
  entityId: string,
  oldValue: unknown,
  newValue: unknown,
) {
  return insert("audit_logs", {
    id: uuid(),
    institution_id: actor.institutionId,
    user_id: actor.userId,
    user_name: actor.name,
    action,
    entity,
    entity_id: entityId,
    old_value: oldValue == null ? null : JSON.stringify(oldValue),
    new_value: newValue == null ? null : JSON.stringify(newValue),
    ip: actor.request.headers.get("cf-connecting-ip"),
    user_agent: actor.request.headers.get("user-agent")?.slice(0, 256),
    created_at: now(),
    support_session_id: actor.supportSessionId || null,
  });
}
export function csrf(request: Request) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return;
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    throw new ApiError(403, "CSRF_REJECTED", "Request origin is not allowed.");
  if (request.headers.get("sec-fetch-site") === "cross-site")
    throw new ApiError(
      403,
      "CSRF_REJECTED",
      "Cross-site requests are not allowed.",
    );
  if (!request.headers.get("content-type")?.includes("application/json"))
    throw new ApiError(
      415,
      "JSON_REQUIRED",
      "Use an application/json request.",
    );
}
export async function rateLimit(
  request: Request,
  identity: string,
  limit = 180,
) {
  const window = Math.floor(Date.now() / 60000),
    key = `${identity}:${window}`;
  const result = await stmt(
    "INSERT INTO rate_limits(key,count,window) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count",
    [key, window],
  ).first<{ count: number }>();
  if ((result?.count ?? 0) > limit)
    throw new ApiError(
      429,
      "RATE_LIMITED",
      "Too many requests. Please try again in a minute.",
    );
}
export async function sha256(value: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
}
export async function hmac(secret: string, value: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return Array.from(
    new Uint8Array(
      await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)),
    ),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
}
export function constantEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
```


### `server/seed.ts`

```typescript
import { env } from "cloudflare:workers";
import { splitMoney } from "../lib/money";
import { staffRoles } from "../lib/permissions";
import {
  all,
  batch,
  insert,
  now,
  one,
  Row,
  run,
  stamps,
  stmt,
  uuid,
} from "./db";
import { actorFor, audit, authenticate, hasPermission } from "./security";
import { tenantSubscription, tenantUsage, upgradeTenantData } from "./tenancy";
export const defaultSettings = {
  lateFee: {
    enabled: false,
    mode: "Fixed",
    value: 10000,
    graceDays: 7,
    maxPaise: 200000,
  },
  reminders: { beforeDays: 7, afterDays: 3, channel: "SMS" },
  templates: {
    upcoming:
      "Dear {parent}, {student} has a fee installment of {amount} due on {date}. Please contact the accounts office for assistance.",
    overdue:
      "Dear {parent}, the fee installment of {amount} for {student} was due on {date}. Please arrange payment.",
  },
  upi: { payeeId: "", payeeName: "" },
  receiptNotifications: { enabled: false, channel: "Email" },
  receiptPrefix: "REC",
  invoicePrefix: "INV",
  currency: "INR",
  timezone: "Asia/Kolkata",
  language: "en",
  gateway: "Razorpay",
};
export async function initializeAccount(request: Request) {
  const user = await authenticate(request);
  await run(
    "INSERT OR IGNORE INTO users(id,email,name,created_at,updated_at,created_by,updated_by) VALUES (?,?,?,?,?,?,?)",
    [
      user.userId,
      user.email,
      user.name,
      now(),
      now(),
      user.userId,
      user.userId,
    ],
  );
  if (user.email === env.PLATFORM_OWNER_EMAIL?.trim().toLowerCase()) {
    await run("INSERT OR IGNORE INTO platform(key,value) VALUES ('owner',?)", [
      user.userId,
    ]);
    if (
      !(await one("SELECT id FROM memberships WHERE user_id=? LIMIT 1", [
        user.userId,
      ]))
    )
      await seedInstitution(user);
    await upgradeTenantData(user.userId);
  }
  const invitations = await all(
    "SELECT v.* FROM invitations v JOIN institutions i ON i.id=v.institution_id WHERE lower(v.email)=? AND v.status='Pending' AND i.status='Active' LIMIT 25",
    [user.email],
  );
  for (const v of invitations) {
    if (!staffRoles.includes(v.role)) continue;
    const existing = await one(
      "SELECT * FROM memberships WHERE institution_id=? AND user_id=?",
      [v.institution_id, user.userId],
    );
    if (existing?.role === "SUPER_ADMIN") continue;
    await batch([
      stmt(
        `INSERT INTO memberships(id,institution_id,user_id,role,display_name,mobile,permissions,section_id,fee_visibility,active,created_at,updated_at,created_by,updated_by) VALUES (?,?,?,?,?,?,?,?,?,1,?,?,?,?) ON CONFLICT(institution_id,user_id) DO UPDATE SET role=excluded.role,display_name=excluded.display_name,mobile=excluded.mobile,permissions=excluded.permissions,section_id=excluded.section_id,fee_visibility=excluded.fee_visibility,active=1,updated_at=excluded.updated_at,updated_by=excluded.updated_by`,
        [
          uuid(),
          v.institution_id,
          user.userId,
          v.role,
          v.display_name,
          v.mobile,
          v.permissions,
          v.section_id,
          v.fee_visibility,
          now(),
          now(),
          v.created_by,
          v.updated_by,
        ],
      ),
      stmt(
        "UPDATE invitations SET status='Accepted',updated_at=? WHERE id=? AND status='Pending'",
        [now(), v.id],
      ),
      audit(
        {
          ...user,
          institutionId: v.institution_id,
          role: v.role,
          feeVisibility: !!v.fee_visibility,
          request,
        },
        "Accepted staff access",
        "invitations",
        v.id,
        null,
        { role: v.role, email: user.email },
      ),
    ]);
  }
  return user;
}
export async function session(request: Request) {
  const user = await initializeAccount(request);
  const platform = !!(await one(
    "SELECT user_id FROM platform_admins WHERE user_id=? AND active=1",
    [user.userId],
  ));
  const memberships = await all(
    "SELECT m.role,m.institution_id,i.name institution_name,i.slug,i.status institution_status FROM memberships m JOIN institutions i ON i.id=m.institution_id WHERE m.user_id=? AND m.active=1 AND m.role NOT IN ('SUPER_ADMIN','PARENT','STUDENT')",
    [user.userId],
  );
  const organizations = await all(
    "SELECT o.id,o.name FROM organizations o JOIN organization_members m ON m.organization_id=o.id WHERE o.status='Active' AND m.email=? AND m.active=1 ORDER BY o.name LIMIT 100",
    [user.email],
  );
  return { user, platform, memberships, organizations };
}
export async function bootstrap(request: Request) {
  await initializeAccount(request);
  const actor = await actorFor(request),
    tenantId = actor.institutionId;
  const institution = await one("SELECT * FROM institutions WHERE id=?", [
    tenantId,
  ]);
  const members = await all(
    "SELECT m.role,m.institution_id,i.name institution_name,i.slug FROM memberships m JOIN institutions i ON i.id=m.institution_id WHERE m.user_id=? AND m.active=1 AND m.role NOT IN ('SUPER_ADMIN','PARENT','STUDENT')",
    [actor.userId],
  );
  const [years, campuses, classes, sections, streams, components, benefits] =
    await Promise.all([
      all(
        "SELECT * FROM academic_years WHERE institution_id=? ORDER BY start_date DESC",
        [tenantId],
      ),
      all("SELECT * FROM campuses WHERE institution_id=?", [tenantId]),
      all("SELECT * FROM classes WHERE institution_id=? ORDER BY sort_order", [
        tenantId,
      ]),
      all(
        "SELECT sec.*,c.name class_name,st.name stream_name FROM sections sec JOIN classes c ON c.id=sec.class_id LEFT JOIN streams st ON st.id=sec.stream_id WHERE sec.institution_id=? ORDER BY c.sort_order,sec.name",
        [tenantId],
      ),
      all("SELECT * FROM streams WHERE institution_id=?", [tenantId]),
      all(
        "SELECT * FROM fee_components WHERE institution_id=? ORDER BY sort_order",
        [tenantId],
      ),
      all("SELECT * FROM benefits WHERE institution_id=? ORDER BY name", [
        tenantId,
      ]),
    ]);
  const providers = await all(
    "SELECT provider,mode FROM provider_configs WHERE institution_id=?",
    [tenantId],
  );
  return {
    providers: hasPermission(actor, "settings.manage") ? providers : [],
    subscription: await tenantSubscription(tenantId),
    usage: await tenantUsage(tenantId),
    support: actor.supportSessionId
      ? { id: actor.supportSessionId, platformAdministrator: actor.name }
      : null,
    user: {
      userId: actor.userId,
      name: actor.name,
      email: actor.email,
      role: actor.role,
      sectionId: actor.sectionId,
      feeVisibility: hasPermission(actor, "fees.view"),
      permissions: actor.permissions,
    },
    memberships: members,
    institution: {
      ...institution,
      settings: JSON.parse(institution!.settings),
    },
    years,
    campuses,
    classes,
    sections,
    streams,
    components: hasPermission(actor, "fees.view") ? components : [],
    benefits: hasPermission(actor, "fees.view") ? benefits : [],
  };
}
async function seedInstitution(user: {
  userId: string;
  name: string;
  email: string;
}) {
  const tenantId =
      "csa-" + user.userId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 32),
    yearId = uuid(),
    campusId = uuid(),
    base = {
      institution_id: tenantId,
      ...stamps(user.userId, "2026-06-01T04:30:00.000Z"),
    },
    statements: D1PreparedStatement[] = [];
  if (await one("SELECT id FROM institutions WHERE id=?", [tenantId])) return;
  statements.push(
    insert("institutions", {
      id: tenantId,
      name: "Chaitanya Shree Academy",
      slug: tenantId,
      address: "24, Vidyanagar, Bengaluru, Karnataka – 560040",
      email: "accounts@chaitanyashree.example",
      phone: "080-2345-6789",
      subscription: "Professional",
      settings: JSON.stringify(defaultSettings),
      ...stamps(user.userId),
    }),
  );
  statements.push(
    insert("memberships", {
      id: uuid(),
      ...base,
      user_id: user.userId,
      role: "SUPER_ADMIN",
    }),
    insert("campuses", {
      id: campusId,
      ...base,
      name: "Main campus",
      address: "Vidyanagar, Bengaluru",
    }),
    insert("academic_years", {
      id: yearId,
      ...base,
      name: "2026–27",
      start_date: "2026-06-01",
      end_date: "2027-05-31",
      status: "Active",
    }),
  );
  const science = uuid(),
    commerce = uuid();
  statements.push(
    insert("streams", { id: science, ...base, name: "Science" }),
    insert("streams", { id: commerce, ...base, name: "Commerce" }),
  );
  const classNames = [
    "Pre-KG",
    "LKG",
    "UKG",
    "1st",
    "2nd",
    "3rd",
    "4th",
    "5th",
    "6th",
    "7th",
    "8th",
    "9th",
    "10th",
    "1st PUC",
    "2nd PUC",
  ];
  const classRows = classNames.map((name, i) => ({
    id: uuid(),
    ...base,
    name,
    level: i < 3 ? "Pre-Primary" : i < 13 ? "School" : "PU College",
    sort_order: i,
  }));
  classRows.forEach((r) => statements.push(insert("classes", r)));
  const componentNames = [
    "Tuition Fee",
    "Admission Fee",
    "Development Fee",
    "Lab Fee",
    "Computer Fee",
    "Library Fee",
    "Sports Fee",
    "Examination Fee",
    "Transport Fee",
    "Hostel Fee",
    "Books Fee",
    "Uniform Fee",
    "ID Card Fee",
    "Miscellaneous Fee",
  ];
  const componentRows = componentNames.map((name, i) => ({
    id: uuid(),
    ...base,
    name,
    category: i === 8 ? "Transport" : i === 9 ? "Hostel" : "Academic",
    sort_order: i,
  }));
  componentRows.forEach((r) => statements.push(insert("fee_components", r)));
  statements.push(
    insert("benefits", {
      id: uuid(),
      ...base,
      name: "Sibling discount",
      kind: "Discount",
      calculation: "Percentage",
      value: 1000,
      eligibility: "Two or more children enrolled",
      auto_apply: 1,
    }),
    insert("benefits", {
      id: uuid(),
      ...base,
      name: "Merit scholarship",
      kind: "Scholarship",
      calculation: "Percentage",
      value: 2500,
      eligibility: "Academic merit approved by principal",
      auto_apply: 0,
    }),
    insert("benefits", {
      id: uuid(),
      ...base,
      name: "Staff child concession",
      kind: "Concession",
      calculation: "Percentage",
      value: 2000,
      eligibility: "Verified staff child",
      auto_apply: 0,
    }),
  );
  const scope: Row[] = [];
  classRows.forEach((c, i) => {
    const str = i >= 13 ? [science, commerce] : [null];
    str.forEach((stream) => {
      const section = {
        id: uuid(),
        ...base,
        academic_year_id: yearId,
        class_id: c.id,
        campus_id: campusId,
        stream_id: stream,
        name: i >= 13 ? "A" : i % 3 === 1 ? "B" : "A",
        capacity: 40,
      };
      statements.push(insert("sections", section));
      const structure = {
        id: uuid(),
        ...base,
        academic_year_id: yearId,
        class_id: c.id,
        stream_id: stream,
        name: `${c.name}${stream ? " · " + (stream === science ? "Science" : "Commerce") : ""} annual fees`,
        frequency: "Quarterly",
        schedule: JSON.stringify(["2026-06-10", "2026-09-10", "2026-12-10"]),
      };
      statements.push(insert("fee_structures", structure));
      const tuition =
          (i < 3
            ? 24000
            : i < 8
              ? 30000
              : i < 13
                ? 40000
                : stream === science
                  ? 68000
                  : 58000) * 100,
        items = [
          {
            component_id: componentRows[0].id,
            name: "Tuition Fee",
            amount_paise: tuition,
          },
          {
            component_id: componentRows[2].id,
            name: "Development Fee",
            amount_paise: 500000,
          },
          {
            component_id: componentRows[7].id,
            name: "Examination Fee",
            amount_paise: 200000,
          },
        ];
      if (i >= 13)
        items.push({
          component_id: componentRows[3].id,
          name: "Lab Fee",
          amount_paise: 400000,
        });
      items.forEach((it) =>
        statements.push(
          insert("fee_structure_items", {
            id: uuid(),
            institution_id: tenantId,
            structure_id: structure.id,
            component_id: it.component_id,
            amount_paise: it.amount_paise,
          }),
        ),
      );
      scope.push({
        section,
        structure,
        items,
        gross: items.reduce((s, it) => s + it.amount_paise, 0),
      });
    });
  });
  const firstNames = [
    "Ananya",
    "Rahul",
    "Aarav",
    "Diya",
    "Vivaan",
    "Ishita",
    "Aditya",
    "Sneha",
    "Arjun",
    "Meera",
    "Dhruv",
    "Kavya",
    "Rohan",
    "Saanvi",
    "Vihaan",
    "Nandini",
    "Akash",
    "Pranav",
    "Siddharth",
    "Tanvi",
    "Kiran",
    "Aditi",
    "Varun",
    "Pooja",
    "Nikhil",
    "Shruti",
    "Manas",
    "Keerthi",
    "Atharv",
    "Riya",
    "Sanjay",
    "Anika",
    "Darshan",
    "Shreya",
  ];
  const surnames = [
    "Rao",
    "Kumar",
    "Sharma",
    "Patil",
    "Gowda",
    "Hegde",
    "Reddy",
    "Shetty",
    "Iyer",
    "Naik",
    "Joshi",
    "Desai",
    "Bhat",
    "Kulkarni",
    "Prasad",
    "Pai",
    "M",
  ];
  const parentRows = scope.map((_, i) => ({
    id: uuid(),
    ...base,
    guardian_name: `${["Ramesh", "Suresh", "Mahesh", "Prakash", "Vijay", "Sanjay", "Ravi"][i % 7]} ${surnames[i]}`,
    father_name: `${["Ramesh", "Suresh", "Mahesh", "Prakash", "Vijay", "Sanjay", "Ravi"][i % 7]} ${surnames[i]}`,
    mother_name: `${["Lakshmi", "Padma", "Savitha", "Geetha"][i % 4]} ${surnames[i]}`,
    mobile: `98${String(76540000 + i).padStart(8, "0")}`,
    email: `parent${i + 1}@example.test`,
    address: "Bengaluru, Karnataka",
    occupation: i % 2 ? "Business" : "Engineer",
    relationship: "Father",
  }));
  parentRows.forEach((r) => statements.push(insert("parents", r)));
  scope.forEach((scopeItem, i) => {
    for (let child = 0; child < 2; child++) {
      const n = i * 2 + child,
        parent = parentRows[n % parentRows.length],
        studentId = uuid(),
        student = {
          id: studentId,
          ...base,
          admission_number: `CSA/26/${String(n + 1).padStart(4, "0")}`,
          name: `${firstNames[n]} ${surnames[n % 17]}`,
          dob: `${2011 + Math.max(0, 13 - i)}-0${(n % 8) + 1}-15`,
          gender: n % 2 ? "Male" : "Female",
          admission_date: "2026-06-01",
          status: "Active",
        };
      statements.push(
        insert("students", student),
        insert("student_parents", {
          id: uuid(),
          institution_id: tenantId,
          student_id: studentId,
          parent_id: parent.id,
          is_primary: 1,
        }),
        insert("enrollments", {
          id: uuid(),
          ...base,
          student_id: studentId,
          academic_year_id: yearId,
          section_id: scopeItem.section.id,
          roll_number: String(child + 1),
        }),
      );
      const discount = n % 7 === 0 ? Math.floor(scopeItem.gross / 10) : 0,
        scholarship = n === 29 ? Math.floor(scopeItem.gross / 4) : 0,
        net = scopeItem.gross - discount - scholarship,
        assignmentId = uuid(),
        invoiceId = uuid(),
        amounts = splitMoney(net, 3),
        instIds = [uuid(), uuid(), uuid()];
      statements.push(
        insert("student_fee_assignments", {
          id: assignmentId,
          ...base,
          student_id: studentId,
          academic_year_id: yearId,
          structure_id: scopeItem.structure.id,
          discount_paise: discount,
          scholarship_paise: scholarship,
          reason: discount
            ? "Approved sibling discount"
            : scholarship
              ? "Merit scholarship approved"
              : "",
        }),
        insert("invoices", {
          id: invoiceId,
          ...base,
          student_id: studentId,
          academic_year_id: yearId,
          assignment_id: assignmentId,
          gross_paise: scopeItem.gross,
          discount_paise: discount,
          scholarship_paise: scholarship,
          net_paise: net,
          issued_date: "2026-06-01",
          due_date: "2026-06-10",
        }),
      );
      scopeItem.items.forEach((it: Row) =>
        statements.push(
          insert("invoice_items", {
            id: uuid(),
            institution_id: tenantId,
            invoice_id: invoiceId,
            ...it,
          }),
        ),
      );
      instIds.forEach((id, j) =>
        statements.push(
          insert("installments", {
            id,
            ...base,
            invoice_id: invoiceId,
            student_id: studentId,
            academic_year_id: yearId,
            title: `Installment ${j + 1}`,
            amount_paise: amounts[j],
            due_date: ["2026-06-10", "2026-09-10", "2026-12-10"][j],
            sort_order: j,
          }),
        ),
      );
      const le = {
        ...base,
        student_id: studentId,
        academic_year_id: yearId,
        invoice_id: invoiceId,
        entry_date: "2026-06-01",
      };
      statements.push(
        insert("ledger_entries", {
          id: uuid(),
          ...le,
          kind: "Fee",
          description: scopeItem.structure.name,
          debit_paise: scopeItem.gross,
          credit_paise: 0,
        }),
      );
      if (discount)
        statements.push(
          insert("ledger_entries", {
            id: uuid(),
            ...le,
            kind: "Discount",
            description: "Approved sibling discount",
            credit_paise: discount,
            debit_paise: 0,
          }),
        );
      if (scholarship)
        statements.push(
          insert("ledger_entries", {
            id: uuid(),
            ...le,
            kind: "Scholarship",
            description: "Approved merit scholarship",
            credit_paise: scholarship,
            debit_paise: 0,
          }),
        );
      const portions =
        n % 9 === 0
          ? []
          : n % 5 === 0
            ? [Math.floor(amounts[0] * 0.6)]
            : n % 4 === 0
              ? [amounts[0]]
              : [
                  amounts[0],
                  n % 3 === 0 ? Math.floor(amounts[1] / 2) : amounts[1],
                ];
      portions.forEach((amount, j) => {
        const pid = uuid(),
          rid = uuid(),
          method = ["UPI", "Cash", "Bank Transfer", "Card", "Net Banking"][
            n % 5
          ],
          paidDate =
            j === 0
              ? `2026-0${6 + (n % 2)}-${String(5 + (n % 20)).padStart(2, "0")}`
              : n % 6 === 1
                ? "2026-10-03"
                : `2026-09-${String(4 + (n % 23)).padStart(2, "0")}`,
          paidAt = paidDate + "T05:30:00.000Z";
        statements.push(
          insert("payments", {
            id: pid,
            institution_id: tenantId,
            ...stamps(user.userId, paidAt),
            student_id: studentId,
            academic_year_id: yearId,
            amount_paise: amount,
            method,
            status: "Successful",
            reference: `DEMO${n + 1001}${j}`,
            idempotency_key: `seed-${n}-${j}`,
            request_hash: "seed",
            paid_at: paidAt,
            notes: "Demo record",
          }),
          insert("payment_allocations", {
            id: uuid(),
            institution_id: tenantId,
            payment_id: pid,
            invoice_id: invoiceId,
            installment_id: instIds[j],
            amount_paise: amount,
          }),
          insert("ledger_entries", {
            id: uuid(),
            institution_id: tenantId,
            ...stamps(user.userId, paidAt),
            student_id: studentId,
            academic_year_id: yearId,
            payment_id: pid,
            kind: "Payment",
            description: `${method} payment`,
            debit_paise: 0,
            credit_paise: amount,
            entry_date: paidDate,
          }),
          insert("receipts", {
            id: rid,
            institution_id: tenantId,
            ...stamps(user.userId, paidAt),
            payment_id: pid,
            academic_year_id: yearId,
          }),
        );
      });
    }
  });
  statements.push(
    insert("audit_logs", {
      id: uuid(),
      institution_id: tenantId,
      user_id: user.userId,
      user_name: user.name,
      action: "Created institution with demonstration records",
      entity: "institutions",
      entity_id: tenantId,
      new_value: JSON.stringify({ students: 34, academicYear: "2026–27" }),
      created_at: now(),
    }),
  );
  try {
    await batch(statements);
  } catch (error) {
    if (
      !(await one(
        "SELECT id FROM memberships WHERE institution_id=? AND user_id=?",
        [tenantId, user.userId],
      ))
    )
      throw error;
  }
}
```


### `tests/advanced-unit.mjs`

```javascript
import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
const require = createRequire(import.meta.url),
  { build } = createRequire(require.resolve("wrangler"))("esbuild");
const temp = await mkdtemp(resolve(tmpdir(), "sohan-advanced-"));
await build({
  entryPoints: [
    "lib/bank-statements.ts",
    "lib/tally.ts",
    "server/tenant-context.ts",
  ],
  outdir: temp,
  bundle: true,
  format: "esm",
  platform: "node",
  outExtension: { ".js": ".mjs" },
  logLevel: "silent",
});
const load = (p) => import(pathToFileURL(resolve(temp, p + ".mjs")));
const { csvBankRows, ofxBankRows, bankDate } = await load(
  "lib/bank-statements",
);
const { tallyXml } = await load("lib/tally");
const {
  withOrganizationContext,
  currentOrganization,
  currentTenant,
  withTenantContext,
} = await load("server/tenant-context");
test("CSV keeps paise, quoted narrations and duplicate errors before server import", () => {
  const result = csvBankRows(
    'Date,UTR,Value,Description\n01/10/2026,N1,"1,000.01","School, fees"\n01/10/2026,N1,4.00,duplicate\n30/02/2026,N2,4.00,bad-date',
    {
      date: "Date",
      reference: "UTR",
      amount: "Value",
      narration: "Description",
    },
  );
  assert.equal(result.rows[0].amount, "1000.01");
  assert.equal(result.rows[0].narration, "School, fees");
  assert.equal(result.errors.length, 2);
});
test("OFX distinguishes withdrawals and disallows foreign currency and entities", () => {
  const source =
    "<OFX><CURDEF>INR<STMTTRN><DTPOSTED>20261001120000[0:GMT]<TRNAMT>100.01<FITID>UTR1<MEMO>STU-1</STMTTRN><STMTTRN><DTPOSTED>20261001<TRNAMT>-2.50<FITID>UTR2</STMTTRN></OFX>";
  const p = ofxBankRows(source);
  assert.equal(p.errors.length, 0);
  assert.equal(p.rows[0].date, "2026-10-01");
  assert.equal(p.rows[1].direction, "Debit");
  assert.equal(p.rows[1].amount, "2.50");
  assert.throws(() => ofxBankRows(source.replace("INR", "USD")), /INR/);
  assert.throws(() => ofxBankRows("<!DOCTYPE x>" + source), /declarations/);
});
test("Bank dates validate leap days instead of silently normalizing", () => {
  assert.equal(bankDate("29/02/2024"), "2024-02-29");
  assert.throws(() => bankDate("29/02/2026"));
});
test("Tally vouchers escape XML, retain exact paise and reject unbalanced accounts", () => {
  const voucher = {
    id: "v-1",
    date: "2026-10-01",
    type: "Receipt",
    number: "R1",
    narration: "Fees <&>",
    postings: [
      { ledger: "Bank & Cash", side: "Debit", paise: 10001 },
      { ledger: "Fees", side: "Credit", paise: 10001 },
    ],
  };
  const xml = tallyXml("School & Trust", [voucher]);
  assert.match(xml, /<AMOUNT>-100.01<\/AMOUNT>/);
  assert.match(xml, /<AMOUNT>100.01<\/AMOUNT>/);
  assert.match(xml, /School &amp; Trust/);
  assert.match(xml, /Fees &lt;&amp;&gt;/);
  assert.throws(
    () => tallyXml("School", [{ ...voucher, postings: [voucher.postings[0]] }]),
    /Unbalanced/,
  );
});
test("Trust context does not imply campus permission and cannot nest a foreign scope", async () => {
  assert.throws(() => currentOrganization());
  await withOrganizationContext(
    { userId: "u", organizationId: "trust-a" },
    async () => {
      assert.equal(currentOrganization().organizationId, "trust-a");
      assert.throws(() => currentTenant());
      assert.throws(() =>
        withOrganizationContext(
          { userId: "u", organizationId: "trust-b" },
          () => {},
        ),
      );
      assert.throws(() =>
        withTenantContext({ userId: "u", institutionId: "school" }, () => {}),
      );
    },
  );
  assert.throws(() => currentOrganization());
});
await rm(temp, { recursive: true, force: true });
```


### `tests/advanced.mjs`

```javascript
// Uses a disposable D1/R2/Queue runtime and mocked provider responses only.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile, readdir } from "node:fs/promises";
import { randomBytes, randomUUID, createHmac } from "node:crypto";
import { resolve } from "node:path";
import { PDFDocument } from "pdf-lib";
const require = createRequire(import.meta.url),
  { Miniflare } = createRequire(require.resolve("wrangler"))("miniflare");
const files = (await readdir("dist/server", { recursive: true }))
  .filter((f) => f.endsWith(".js"))
  .sort((a, b) => (a === "index.js" ? -1 : b === "index.js" ? 1 : 0));
const owner = "tejomaya@mvdt.in",
  admin = "advanced-admin@example.test",
  jobSecret = randomBytes(32).toString("hex"),
  gatewaySecret = randomBytes(32).toString("hex"),
  webhookSecret = randomBytes(32).toString("hex");
const orders = new Map(),
  deliveries = [];
const mf = new Miniflare({
  modules: files.map((f) => ({
    type: "ESModule",
    path: resolve("dist/server", f),
  })),
  modulesRoot: resolve("dist/server"),
  compatibilityDate: "2026-05-15",
  compatibilityFlags: ["nodejs_compat"],
  d1Databases: { DB: "advanced" },
  r2Buckets: ["BUCKET"],
  queueProducers: { COMMUNICATION_QUEUE: "communications" },
  queueConsumers: { communications: { maxBatchSize: 1, maxBatchTimeout: 0 } },
  bindings: {
    PLATFORM_OWNER_EMAIL: owner,
    JOB_SECRET: jobSecret,
    PROVIDER_ENCRYPTION_KEY: randomBytes(32).toString("hex"),
  },
  outboundService: async (req) => {
    const u = new URL(req.url);
    if (u.hostname === "api.razorpay.com" && u.pathname === "/v1/orders") {
      const data = await req.json(),
        id = "order_" + randomUUID();
      orders.set(id, data);
      return Response.json({ id, amount: data.amount, currency: "INR" });
    }
    if (
      u.hostname === "api.razorpay.com" &&
      u.pathname.startsWith("/v1/payments/")
    ) {
      const id = u.pathname.split("/").at(-1),
        order = [...orders].find(([key]) => id === "captured_" + key);
      return Response.json({
        id,
        order_id: order?.[0],
        amount: order?.[1].amount,
        currency: "INR",
        status: "captured",
      });
    }
    if (
      u.hostname === "notify.example.test" ||
      u.hostname === "graph.facebook.com"
    ) {
      deliveries.push(await req.json());
      return Response.json({
        id: "mock-delivery",
        messages: [{ id: "meta-mock" }],
      });
    }
    throw new Error("Unexpected network request " + req.url);
  },
});
let tenant,
  checks = 0;
const check = (name, fn = () => {}) => {
  fn();
  checks++;
  console.log("PASS " + name);
};
async function req(
  path,
  {
    email = admin,
    method = "GET",
    body,
    status = 200,
    raw = false,
    headers = {},
    tenantId = tenant,
  } = {},
) {
  const response = await mf.dispatchFetch("https://campus.test/api/" + path, {
    method,
    headers: {
      "oai-authenticated-user-email": email,
      ...(tenantId ? { "x-institution-id": tenantId } : {}),
      ...(body
        ? { "content-type": "application/json", origin: "https://campus.test" }
        : {}),
      ...(method === "POST"
        ? { "Idempotency-Key": body?.idempotencyKey || randomUUID() }
        : {}),
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (raw) {
    assert.equal(
      response.status,
      status,
      path + " " + (response.status === status ? "" : await response.text()),
    );
    return response;
  }
  const result = await response.json();
  assert.equal(response.status, status, path + " " + JSON.stringify(result));
  return result.data ?? result;
}
const post = (path, body, extra = {}) =>
  req(path, { method: "POST", body, ...extra });
const sign = (secret, raw) =>
  createHmac("sha256", secret).update(raw).digest("hex");
const eventually = async (fn) => {
  for (let i = 0; i < 50; i++) {
    const value = await fn();
    if (value) return value;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("Background operation did not complete");
};
try {
  const db = await mf.getD1Database("DB");
  for (const file of (await readdir("drizzle"))
    .filter((f) => f.endsWith(".sql"))
    .sort())
    for (const sql of (await readFile("drizzle/" + file, "utf8"))
      .split("--> statement-breakpoint")
      .filter((s) => s.trim()))
      await db.prepare(sql).run();
  await req("session", { email: owner });
  const testSchool = "70a45679-cbbd-48aa-a126-34c73d631853",
    original = await db
      .prepare("SELECT COUNT(*) count FROM students WHERE institution_id=?")
      .bind(testSchool)
      .first();
  const institution = await post(
    "platform/institutions",
    {
      name: "Advanced Integration School",
      institutionCode: "ADV-QA",
      institutionType: "School",
      adminName: "Advanced Admin",
      adminEmail: admin,
      adminMobile: "9876543210",
      planId: "plan-starter",
      subscriptionStatus: "Active",
      subscriptionStart: "2026-06-01",
      subscriptionEnd: "2027-05-31",
      setupAcademic: true,
    },
    { email: owner },
  );
  tenant = institution.id;
  const second = await post(
    "platform/institutions",
    {
      name: "Isolated Integration School",
      institutionCode: "ISO-QA",
      institutionType: "School",
      adminName: "Isolated Admin",
      adminEmail: "isolated@example.test",
      adminMobile: "9876543210",
      planId: "plan-starter",
      subscriptionStatus: "Active",
      subscriptionStart: "2026-06-01",
      subscriptionEnd: "2027-05-31",
      setupAcademic: true,
    },
    { email: owner },
  );
  await req("bootstrap", {
    email: "isolated@example.test",
    tenantId: second.id,
  });
  const boot = await req("bootstrap"),
    year = boot.years[0].id,
    section = boot.sections[0];
  const student = await post("students", {
    name: "Portal Student",
    admissionNumber: "ADV-001",
    yearId: year,
    sectionId: section.id,
    parentName: "Portal Guardian",
    mobile: "9876543201",
    email: "parent@example.test",
  });
  const sibling = await post("students", {
    name: "Other Family Student",
    admissionNumber: "ADV-002",
    yearId: year,
    sectionId: section.id,
    parentName: "Other Guardian",
    mobile: "9876543202",
  });
  const profile = await req("students/" + student.id + "?year=" + year),
    parentId = profile.student.parent_id;
  const component = await post("catalog/components", {
    name: "Tuition QA",
    category: "Academic",
  });
  const structure = await post("catalog/structures", {
    name: "Annual QA tuition",
    yearId: year,
    classId: section.class_id,
    sectionId: section.id,
    frequency: "Annual",
    dates: ["2026-10-10"],
    items: [{ componentId: component.id, amount: "10000" }],
  });
  await post("fees/assign", {
    studentId: student.id,
    structureId: structure.id,
  });
  const grant = await post("parent-links", { parentId, days: 1 }),
    portal = "parent-access/" + grant.token;
  const view = await req(portal, { email: "" });
  check(
    "signed portal exposes only the linked child and persisted fee breakdown",
    () => {
      assert.equal(view.children.length, 1);
      assert.equal(view.children[0].id, student.id);
      assert.equal(view.items[0].name, "Tuition QA");
      assert.equal(view.balance.outstanding_paise, 1000000);
    },
  );
  await req(portal + "?student=" + sibling.id, { email: "", status: 404 });
  await req(
    "parent-access/" +
      grant.token.slice(0, -1) +
      (grant.token.endsWith("0") ? "1" : "0"),
    { email: "", status: 401 },
  );
  check("parent cannot switch to another guardian child or tamper with token");
  const portalPage = await mf.dispatchFetch(
    "https://campus.test/portal/" + grant.token,
  );
  check("token page routes securely without authentication", () => {
    assert.equal(portalPage.status, 200);
    assert.equal(portalPage.headers.get("referrer-policy"), "no-referrer");
    assert.match(portalPage.headers.get("cache-control"), /no-store/);
  });
  await post("providers", {
    provider: "Razorpay",
    mode: "test",
    config: { keyId: "rzp_test_mock", keySecret: gatewaySecret, webhookSecret },
  });
  const key = randomUUID(),
    checkoutBody = {
      studentId: student.id,
      yearId: year,
      amount: "800.01",
      idempotencyKey: key,
    };
  await post(portal + "/checkout", checkoutBody, {
    email: "",
    headers: { "Idempotency-Key": "" },
    status: 400,
  });
  const order = await post(portal + "/checkout", checkoutBody, { email: "" }),
    replayOrder = await post(portal + "/checkout", checkoutBody, { email: "" });
  check(
    "checkout idempotency reuses one real server intent and mocked gateway order",
    () => {
      assert.equal(order.paymentId, replayOrder.paymentId);
      assert.equal(orders.size, 1);
      assert.equal(orders.get(order.id).amount, 80001);
    },
  );
  const capturedId = "captured_" + order.id;
  await post(
    portal + "/verify",
    {
      paymentId: order.paymentId,
      razorpay_order_id: order.id,
      razorpay_payment_id: capturedId,
      razorpay_signature: "0".repeat(64),
    },
    { email: "", status: 400 },
  );
  const event = {
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: capturedId,
            order_id: order.id,
            amount: 80001,
            currency: "INR",
            status: "captured",
          },
        },
      },
    },
    eventRaw = JSON.stringify(event),
    eventHeaders = {
      "x-razorpay-signature": sign(webhookSecret, eventRaw),
      "x-razorpay-event-id": "adv-captured",
    };
  await post("payments/webhook", event, {
    email: "",
    headers: { ...eventHeaders, "x-razorpay-signature": "0".repeat(64) },
    status: 400,
  });
  await post("payments/webhook", event, { email: "", headers: eventHeaders });
  await post("payments/webhook", event, { email: "", headers: eventHeaders });
  await post(
    portal + "/verify",
    {
      paymentId: order.paymentId,
      razorpay_order_id: order.id,
      razorpay_payment_id: capturedId,
      razorpay_signature: sign(gatewaySecret, order.id + "|" + capturedId),
    },
    { email: "" },
  );
  const paid = await req(portal, { email: "" }),
    receipt = paid.receipts[0];
  check(
    "verified capture and repeated callbacks produce one receipt and balanced journal",
    () => {
      assert.equal(paid.balance.outstanding_paise, 919999);
      assert.equal(paid.receipts.length, 1);
    },
  );
  const postings = await db
    .prepare(
      "SELECT COUNT(*) count,SUM(p.debit_paise-p.credit_paise) balance FROM journal_postings p JOIN journal_events e ON e.id=p.event_id WHERE e.institution_id=? AND e.event_type='PAYMENT_RECEIVED'",
    )
    .bind(tenant)
    .first();
  check("gateway confirmation creates both ledger legs atomically", () => {
    assert.equal(postings.count, 2);
    assert.equal(postings.balance, 0);
  });
  await eventually(() =>
    db
      .prepare(
        "SELECT id FROM document_artifacts WHERE institution_id=? AND receipt_id=?",
      )
      .bind(tenant, receipt.id)
      .first(),
  );
  const pdf = await req(portal + "/receipts/" + receipt.id, {
    email: "",
    raw: true,
  });
  check("Queue consumer produces a parent-downloadable receipt PDF", () =>
    assert.equal(pdf.headers.get("content-type"), "application/pdf"),
  );
  assert.ok(
    (await PDFDocument.load(await pdf.arrayBuffer())).getPageCount() > 0,
  );
  await req(
    portal +
      "/certificates/tuition?student=" +
      student.id +
      "&financialYear=2026",
    { email: "", status: 409 },
  );
  await post("certificates/tuition-allocations", {
    paymentId: order.paymentId,
    amount: "700.01",
    reason: "Tuition component evidence checked by supervisor",
  });
  const certificate = await req(
    portal +
      "/certificates/tuition?student=" +
      student.id +
      "&financialYear=2026",
    { email: "", raw: true },
  );
  assert.ok(
    (await PDFDocument.load(await certificate.arrayBuffer())).getPageCount() >
      0,
  );
  check("annual tuition requires approved amounts and produces a real PDF");
  await req(
    portal +
      "/certificates/tuition?student=" +
      sibling.id +
      "&financialYear=2026",
    { email: "", status: 404 },
  );
  await assert.rejects(
    () =>
      db
        .prepare(
          "UPDATE tuition_allocations SET amount_paise=1 WHERE institution_id=?",
        )
        .bind(tenant)
        .run(),
    /IMMUTABLE/,
  );
  check("tuition approval cannot be overwritten");
  const donationPdf = await PDFDocument.create();
  donationPdf
    .addPage()
    .drawText("Official certificate fixture, not a legal certificate");
  const donation = await post("certificates/donations", {
    parentId,
    financialYear: 2026,
    donationReference: "DON-TEST",
    amount: "100",
    urn: "URN-TEST",
    doneePan: "ABCDE1234F",
    form10bdAcknowledgement: "ACK-TEST",
    approved: true,
    pdfBase64: Buffer.from(await donationPdf.save()).toString("base64"),
  });
  await req(portal + "/certificates/80g/" + donation.id, {
    email: "",
    raw: true,
  });
  check("official donation documents are separate from tuition receipts");
  await post("parent-links/" + grant.id + "/revoke", {});
  await req(portal, { email: "", status: 401 });
  const expired = await post("parent-links", { parentId, days: 1 });
  await db
    .prepare(
      "UPDATE parent_portal_grants SET expires_at='2000-01-01' WHERE id=?",
    )
    .bind(expired.id)
    .run();
  await req("parent-access/" + expired.token, { email: "", status: 401 });
  check("revoked and expired grants fail closed");
  const org = await post(
    "platform/organizations",
    {
      name: "QA Education Trust",
      adminEmail: "trust@example.test",
      institutionIds: [tenant],
    },
    { email: owner },
  );
  await req("session", { email: "trust@example.test" });
  const report = await req("organizations/" + org.id + "/reports", {
    email: "trust@example.test",
  });
  check("trust report consolidates only explicitly assigned campuses", () => {
    assert.equal(report.rows.length, 1);
    assert.equal(report.rows[0].id, tenant);
    assert.equal(report.totals.collected_paise, 80001);
  });
  await req("organizations/" + org.id + "/reports", {
    email: "isolated@example.test",
    status: 403,
  });
  await req("students", { email: "trust@example.test", status: 403 });
  check(
    "trust reporting membership grants no campus write or foreign trust access",
  );
  const install = await db
    .prepare(
      "SELECT id FROM installments WHERE institution_id=? AND student_id=?",
    )
    .bind(tenant, student.id)
    .first();
  const device = await post("hardware/devices", { name: "QA Bus Reader" });
  await post("hardware/cards", { studentId: student.id, uid: "A1B2C3D4" });
  await post("hardware/rules", {
    studentId: student.id,
    installmentId: install.id,
    service: "Transport",
    amount: "25.25",
    active: true,
  });
  const payload = {
      eventId: "rfid-event-001",
      uid: "A1B2C3D4",
      punchedAt: new Date().toISOString(),
      direction: "IN",
    },
    ts = String(Math.floor(Date.now() / 1000)),
    nonce = randomUUID().replaceAll("-", ""),
    rfidHeaders = {
      "x-device-id": device.id,
      "x-timestamp": ts,
      "x-nonce": nonce,
      "x-signature": sign(
        device.secret,
        ts + "." + nonce + "." + JSON.stringify(payload),
      ),
    };
  await post("hardware/rfid-punch", payload, {
    email: "",
    headers: { ...rfidHeaders, "x-signature": "invalid" },
    status: 401,
  });
  const punch = await post("hardware/rfid-punch", payload, {
    email: "",
    headers: rfidHeaders,
  });
  await post("hardware/rfid-punch", payload, {
    email: "",
    headers: rfidHeaders,
  });
  const payload2 = { ...payload, eventId: "rfid-event-002" },
    nonce2 = randomUUID().replaceAll("-", "");
  await post("hardware/rfid-punch", payload2, {
    email: "",
    headers: {
      ...rfidHeaders,
      "x-nonce": nonce2,
      "x-signature": sign(
        device.secret,
        ts + "." + nonce2 + "." + JSON.stringify(payload2),
      ),
    },
  });
  const charged = await db
    .prepare(
      "SELECT COUNT(*) count,SUM(amount_paise) amount FROM daily_fee_charges WHERE institution_id=?",
    )
    .bind(tenant)
    .first();
  check(
    "RFID HMAC and replay protection charge a daily service exactly once",
    () => {
      assert.equal(punch.chargedPaise, 2525);
      assert.equal(charged.count, 1);
      assert.equal(charged.amount, 2525);
    },
  );
  const changed = { ...payload, direction: "OUT" };
  await post("hardware/rfid-punch", changed, {
    email: "",
    headers: {
      ...rfidHeaders,
      "x-signature": sign(
        device.secret,
        ts + "." + nonce + "." + JSON.stringify(changed),
      ),
    },
    status: 409,
  });
  check("same hardware event with different content is rejected");
  const date = new Date(Date.now() + 19800000).toISOString().slice(0, 10),
    bankRows = [
      {
        date,
        reference: "NEFT-ADV-001",
        amount: "100.01",
        direction: "Credit",
        admissionNumber: "ADV-001",
        narration: "NEFT deposit",
      },
      {
        date,
        reference: "NEFT-UNKNOWN",
        amount: "10",
        direction: "Credit",
        narration: "Unknown payer",
      },
    ];
  const preview = await post("reconciliation/bank-preview", {
    yearId: year,
    rows: bankRows,
  });
  check(
    "bank matching requires a unique identity and does not guess by amount",
    () => {
      assert.equal(preview.rows[0].status, "Ready");
      assert.equal(preview.rows[1].status, "Unmatched");
    },
  );
  const committed = await post("reconciliation/bank-commit", {
    batchId: preview.id,
    postMatchedDues: true,
    reason: "Bank statement manually verified by accountant",
  });
  check(
    "approved bank imports post receipts while unmatched rows remain reviewable",
    () => {
      assert.equal(committed.rows[0].status, "Posted & matched");
      assert.equal(committed.rows[1].status, "Unmatched");
      assert.equal(committed.failed, 0);
    },
  );
  const duplicate = await post("reconciliation/bank-commit", {
    batchId: preview.id,
    postMatchedDues: true,
    reason: "Retry after browser connection interruption",
  });
  check("bank reference deduplication prevents double posting on retries", () =>
    assert.ok(duplicate.rows.every((r) => r.status === "Duplicate")),
  );
  await post(
    "reconciliation/bank-preview",
    { yearId: year, rows: [bankRows[0], bankRows[0]] },
    { status: 422 },
  );
  await post(
    "reconciliation/bank-commit",
    {
      batchId: preview.id,
      postMatchedDues: true,
      reason: "Attempting another campus batch",
    },
    { email: "isolated@example.test", tenantId: second.id, status: 404 },
  );
  check("bank batches reject duplicated rows and foreign institution IDs");
  const tally = await req("reports/tally?year=" + year, { raw: true }),
    xml = await tally.text();
  check(
    "Tally export includes balanced financial vouchers and transport income",
    () => {
      assert.match(xml, /<TALLYREQUEST>Import Data/);
      assert.match(xml, /Tuition QA/);
      assert.match(xml, /Transport Fee Income/);
      assert.match(xml, /<AMOUNT>-100.01<\/AMOUNT>/);
    },
  );
  const smsConfig = {
    enabled: true,
    entityId: "ENTITY-REGISTERED",
    senderId: "SSTFEES",
    templates: Object.fromEntries(
      ["before7", "before3", "before1", "after1"].map((k) => [
        k,
        {
          id: "DLT-" + k,
          body: "{institution}: {student} fee {amount} is due on {date}.",
        },
      ]),
    ),
  };
  await post("communications", smsConfig);
  await post("communications/consent", {
    parentId,
    consent: true,
    reason: "Guardian opted in via signed admission form",
  });
  await post("providers", {
    provider: "SMS",
    mode: "test",
    config: { url: "https://notify.example.test/sms", token: "mock-token" },
  });
  const due = new Date(Date.parse(date) + 7 * 86400000)
    .toISOString()
    .slice(0, 10);
  await db
    .prepare("UPDATE installments SET due_date=? WHERE id=?")
    .bind(due, install.id)
    .run();
  await post("jobs", {});
  await post("jobs", {});
  const reminder = await eventually(() =>
    db
      .prepare(
        "SELECT * FROM notifications WHERE institution_id=? AND dedupe_key LIKE 'dlt:%:before7'",
      )
      .bind(tenant)
      .first(),
  );
  await eventually(() =>
    db
      .prepare("SELECT id FROM notifications WHERE id=? AND status='Sent'")
      .bind(reminder.id)
      .first(),
  );
  check(
    "7-day reminders retain DLT IDs, consent and dedupe across repeated jobs",
    () => {
      assert.equal(JSON.parse(reminder.metadata).dlt.templateId, "DLT-before7");
      assert.ok(
        deliveries.some((d) => d.dlt?.entityId === "ENTITY-REGISTERED"),
      );
    },
  );
  for (const days of [3, 1]) {
    const dueDate = new Date(Date.parse(date) + days * 86400000)
      .toISOString()
      .slice(0, 10);
    await db
      .prepare("UPDATE installments SET due_date=? WHERE id=?")
      .bind(dueDate, install.id)
      .run();
    await post("jobs", {});
    const row = await db
      .prepare(
        "SELECT metadata FROM notifications WHERE institution_id=? AND dedupe_key=?",
      )
      .bind(tenant, `dlt:${install.id}:${dueDate}:before${days}`)
      .first();
    check(`${days}-day reminder uses its registered stage template`, () =>
      assert.equal(
        JSON.parse(row.metadata).dlt.templateId,
        `DLT-before${days}`,
      ),
    );
  }
  await post("communications/consent", {
    parentId,
    consent: false,
    reason: "Guardian withdrew SMS consent",
  });
  const overdueDate = new Date(Date.parse(date) - 86400000)
    .toISOString()
    .slice(0, 10);
  await db
    .prepare("UPDATE installments SET due_date=? WHERE id=?")
    .bind(overdueDate, install.id)
    .run();
  await post("jobs", {});
  const blocked = await db
    .prepare(
      "SELECT id FROM notifications WHERE institution_id=? AND dedupe_key=?",
    )
    .bind(tenant, `dlt:${install.id}:${overdueDate}:after1`)
    .first();
  check("withdrawn SMS consent prevents new automatic dispatch", () =>
    assert.equal(blocked, null),
  );
  const waSecret = randomBytes(32).toString("hex");
  await post("providers", {
    provider: "WhatsApp",
    mode: "test",
    config: {
      adapter: "Meta",
      url: "https://graph.facebook.com/v23.0/123456/messages",
      token: "mock-wa-token",
      phoneNumberId: "123456",
      appSecret: waSecret,
      verifyToken: "verify-test",
    },
  });
  const wa = {
      object: "whatsapp_business_account",
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: "123456" },
                messages: [
                  {
                    id: "wa-adv-1",
                    from: "919876543201",
                    timestamp: ts,
                    type: "text",
                    text: { body: "FEES" },
                  },
                ],
              },
            },
          ],
        },
      ],
    },
    waRaw = JSON.stringify(wa);
  await post("webhooks/whatsapp/" + tenant, wa, {
    email: "",
    headers: { "x-hub-signature-256": "sha256=" + sign(waSecret, waRaw) },
  });
  await post("webhooks/whatsapp/" + tenant, wa, {
    email: "",
    headers: { "x-hub-signature-256": "sha256=" + sign(waSecret, waRaw) },
  });
  await post("webhooks/whatsapp/" + tenant, wa, {
    email: "",
    status: 401,
    headers: { "x-hub-signature-256": "sha256=" + "0".repeat(64) },
  });
  const wrongPhone = structuredClone(wa);
  wrongPhone.entry[0].changes[0].value.metadata.phone_number_id = "999999";
  await post("webhooks/whatsapp/" + tenant, wrongPhone, {
    email: "",
    status: 403,
    headers: {
      "x-hub-signature-256":
        "sha256=" + sign(waSecret, JSON.stringify(wrongPhone)),
    },
  });
  check("WhatsApp rejects forged signatures and another campus business phone");
  const bot = await db
    .prepare(
      "SELECT message FROM notifications WHERE institution_id=? AND dedupe_key='wa-reply:wa-adv-1'",
    )
    .bind(tenant)
    .first();
  check(
    "signed WhatsApp FEES request returns only the sender guardian children",
    () => {
      assert.match(bot.message, /ADV-001/);
      assert.doesNotMatch(bot.message, /ADV-002/);
      assert.match(bot.message, /UPI QR/);
    },
  );
  const foreign = structuredClone(wa);
  foreign.entry[0].changes[0].value.messages[0] = {
    id: "wa-adv-2",
    from: "919876543202",
    timestamp: ts,
    type: "text",
    text: { body: "ADV-001" },
  };
  await post("webhooks/whatsapp/" + tenant, foreign, {
    email: "",
    headers: {
      "x-hub-signature-256":
        "sha256=" + sign(waSecret, JSON.stringify(foreign)),
    },
  });
  const hidden = await db
    .prepare(
      "SELECT message FROM notifications WHERE institution_id=? AND dedupe_key='wa-reply:wa-adv-2'",
    )
    .bind(tenant)
    .first();
  check("admission number alone never reveals another family fees", () =>
    assert.doesNotMatch(hidden.message, /ADV-001|800|portal\//),
  );
  const target = await post("catalog/years", {
      name: "2027–28",
      startDate: "2027-06-01",
      endDate: "2028-05-31",
      status: "Draft",
    }),
    nextClass = await post("catalog/classes", {
      name: "QA Next Grade",
      level: "School",
    }),
    nextSection = await post("catalog/sections", {
      name: "Next A",
      yearId: target.id,
      classId: nextClass.id,
      campusId: boot.campuses[0].id,
    });
  const rollBody = {
    sourceYearId: year,
    targetYearId: target.id,
    mapping: { [section.id]: nextSection.id },
    reason: "Approved annual promotion and balance transfer",
  };
  const review = await post("rollovers/preview", rollBody);
  await post(
    "rollovers/start",
    { ...rollBody, fingerprint: "0".repeat(64) },
    { status: 409 },
  );
  const rollover = await post("rollovers/start", {
    ...rollBody,
    fingerprint: review.fingerprint,
  });
  await post(
    "payments",
    {
      studentId: student.id,
      yearId: year,
      amount: "1",
      method: "Cash",
      idempotencyKey: randomUUID(),
    },
    { status: 409 },
  );
  await assert.rejects(
    () =>
      db
        .prepare("UPDATE academic_years SET status='Active' WHERE id=?")
        .bind(year)
        .run(),
    /FROZEN/,
  );
  check(
    "rollover freezes source year and rejects stale previews or new payments",
  );
  const before = await db
    .prepare(
      "SELECT COALESCE(SUM(debit_paise-credit_paise),0) balance FROM ledger_entries WHERE institution_id=?",
    )
    .bind(tenant)
    .first();
  const processed = await post("rollovers/" + rollover.id + "/process", {});
  await post("rollovers/" + rollover.id + "/process", {});
  const after = await db
    .prepare(
      "SELECT COALESCE(SUM(debit_paise-credit_paise),0) balance FROM ledger_entries WHERE institution_id=?",
    )
    .bind(tenant)
    .first();
  const next = await req("students/" + student.id + "?year=" + target.id);
  check(
    "resumable rollover transfers dues without duplicate income or balances",
    () => {
      assert.equal(processed.status, "Completed");
      assert.equal(before.balance, after.balance);
      assert.equal(next.student.outstanding_paise, review.outstanding);
    },
  );
  const carry = await db
    .prepare(
      "SELECT COUNT(*) count FROM journal_events WHERE institution_id=? AND event_type='BALANCE_TRANSFERRED'",
    )
    .bind(tenant)
    .first();
  assert.equal(carry.count, 2);
  check("carry-forward uses explicit clearing-account double entries");
  await assert.rejects(
    () =>
      db
        .prepare("DELETE FROM audit_logs WHERE institution_id=?")
        .bind(tenant)
        .run(),
    /IMMUTABLE/,
  );
  await assert.rejects(
    () =>
      db
        .prepare("DELETE FROM year_rollovers WHERE institution_id=?")
        .bind(tenant)
        .run(),
    /IMMUTABLE/,
  );
  check("supervisor evidence and rollover history remain immutable");
  const oldSchool = await db
    .prepare("SELECT COUNT(*) count FROM students WHERE institution_id=?")
    .bind(testSchool)
    .first();
  check("existing CampusLedger Test School data remains unchanged", () =>
    assert.equal(oldSchool.count, original.count),
  );
  console.log(`\n${checks} advanced checks passed.`);
} finally {
  await mf.dispose();
}
```


### `tests/integration.mjs`

```javascript
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile, readdir } from "node:fs/promises";
import { randomBytes, randomUUID, createHmac } from "node:crypto";
import { resolve } from "node:path";
const require = createRequire(import.meta.url);
const { Miniflare } = createRequire(require.resolve("wrangler"))("miniflare");
const files = (await readdir("dist/server", { recursive: true }))
  .filter((f) => f.endsWith(".js"))
  .sort((a, b) => (a === "index.js" ? -1 : b === "index.js" ? 1 : 0));
const jobSecret = randomBytes(32).toString("hex");
const mf = new Miniflare({
  modules: files.map((f) => ({
    type: "ESModule",
    path: resolve("dist/server", f),
  })),
  modulesRoot: resolve("dist/server"),
  compatibilityDate: "2026-05-15",
  compatibilityFlags: ["nodejs_compat"],
  d1Databases: { DB: "integration" },
  r2Buckets: ["BUCKET"],
  bindings: {
    PROVIDER_ENCRYPTION_KEY: randomBytes(32).toString("hex"),
    JOB_SECRET: jobSecret,
    PLATFORM_OWNER_EMAIL: "owner@example.test",
  },
});
let checks = 0;
const check = (name, fn) => {
  fn();
  checks++;
  console.log("PASS " + name);
};
const identities = {
  // Production dispatch supplies a verified email without an account-ID header.
  admin: ["", "owner@example.test"],
  parent: ["qa-parent", "qa-parent@example.test"],
  accountant: ["qa-accountant", "qa-accountant@example.test"],
  teacher: ["qa-teacher", "qa-teacher@example.test"],
  stranger: ["qa-stranger", "stranger@example.test"],
  schoolAdmin: ["qa-school-admin", "qa-school-admin@example.test"],
  testOwner: ["current-test-owner-subject", "tejomaya@mvdt.in"],
};
let tenant;
const supportCookies = {};
async function request(
  path,
  {
    role = "admin",
    method = "GET",
    body,
    tenantId = tenant,
    headers = {},
    status = 200,
    raw = false,
  } = {},
) {
  const identity = identities[role];
  if (
    tenantId &&
    ["admin", "testOwner"].includes(role) &&
    !path.startsWith("platform/") &&
    !path.startsWith("jobs/") &&
    headers["oai-authenticated-user-email"] !== ""
  ) {
    const current = supportCookies[role];
    if (!current || current.tenant !== tenantId) {
      const support = await mf.dispatchFetch(
        "https://campus.test/api/platform/institutions/" +
          tenantId +
          "/support",
        {
          method: "POST",
          headers: {
            "oai-authenticated-user-email": identity[1],
            "content-type": "application/json",
            origin: "https://campus.test",
          },
          body: JSON.stringify({ reason: "Financial regression verification" }),
        },
      );
      assert.equal(
        support.status,
        200,
        "start audited regression support session",
      );
      supportCookies[role] = {
        tenant: tenantId,
        cookie: support.headers.get("set-cookie").split(";")[0],
      };
    }
    headers = { cookie: supportCookies[role].cookie, ...headers };
  }
  const response = await mf.dispatchFetch("https://campus.test/api/" + path, {
    method,
    headers: {
      ...(method === "POST" &&
      /^(payments|refunds|cash|fees|invoices)(\/|$)/.test(path) &&
      path !== "payments/webhook"
        ? { "Idempotency-Key": body?.idempotencyKey || randomUUID() }
        : {}),
      "oai-authenticated-user-id": identity[0],
      "oai-authenticated-user-email": identity[1],
      ...(tenantId ? { "x-institution-id": tenantId } : {}),
      ...(body
        ? { "content-type": "application/json", origin: "https://campus.test" }
        : {}),
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (raw && response.status === 202 && path.includes("documents/receipt/")) {
    await response.text();
    await new Promise((r) => setTimeout(r, 100));
    return request(path, {
      role,
      method,
      body,
      tenantId,
      headers,
      status,
      raw,
    });
  }
  if (raw) {
    assert.equal(response.status, status, path);
    return response;
  }
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(
      path +
        " returned " +
        response.status +
        " " +
        JSON.stringify([...response.headers]) +
        " " +
        text.slice(0, 1200),
    );
  }
  assert.equal(response.status, status, path + " " + JSON.stringify(data));
  if (status === 200) assert.equal(data.success, true, path);
  return data.data ?? data;
}
try {
  const db = await mf.getD1Database("DB");
  for (const file of (await readdir("drizzle"))
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    const sql = await readFile("drizzle/" + file, "utf8");
    for (const statement of sql
      .split("--> statement-breakpoint")
      .filter((s) => s.trim()))
      await db.prepare(statement.trim()).run();
  }
  console.log("PASS all database migrations");
  checks++;
  await request("bootstrap", {
    headers: {
      "oai-authenticated-user-id": "",
      "oai-authenticated-user-email": "",
    },
    status: 401,
  });
  checks++;
  console.log("PASS anonymous requests still require sign-in");
  await request("bootstrap", {
    role: "stranger",
    tenantId: "70a45679-cbbd-48aa-a126-34c73d631853",
    status: 403,
  });
  const beforeOwner = await db
    .prepare("SELECT value FROM platform WHERE key='owner'")
    .first();
  check("an uninvited first visitor cannot claim the platform", () =>
    assert.equal(beforeOwner, null),
  );
  await request("session");
  const initialInstitution = await db
    .prepare("SELECT id FROM institutions WHERE name='Chaitanya Shree Academy'")
    .first();
  tenant = initialInstitution.id;
  const boot = await request("bootstrap");
  tenant = boot.institution.id;
  const repeatedLogin = await request("bootstrap", {
    headers: { "oai-authenticated-user-email": " OWNER@EXAMPLE.TEST " },
  });
  check(
    "verified email-only sessions retain the same account and institution",
    () => {
      assert.ok(boot.user.userId.startsWith("email-"));
      assert.equal(repeatedLogin.user.userId, boot.user.userId);
      assert.equal(repeatedLogin.institution.id, boot.institution.id);
    },
  );
  await db
    .prepare(
      "INSERT INTO users(id,email,name,created_at,updated_at,created_by,updated_by) VALUES (?,?,?,?,?,?,?)",
    )
    .bind(
      "legacy-native-owner",
      identities.admin[1],
      "Legacy session",
      new Date().toISOString(),
      new Date().toISOString(),
      "legacy-native-owner",
      "legacy-native-owner",
    )
    .run();
  const subjectLogin = await request("bootstrap", {
    headers: { "oai-authenticated-user-id": "legacy-native-owner" },
  });
  const changedSubject = await request("bootstrap", {
    headers: { "oai-authenticated-user-id": "a-new-native-subject" },
  });
  check(
    "ChatGPT subject changes retain owner access despite a legacy duplicate",
    () => {
      assert.equal(subjectLogin.user.userId, boot.user.userId);
      assert.equal(changedSubject.user.userId, boot.user.userId);
      assert.equal(subjectLogin.user.role, "INSTITUTION_ADMIN");
      assert.equal(changedSubject.institution.id, tenant);
    },
  );
  check("bootstrap creates normalized demo data", () => {
    assert.equal(boot.classes.length, 15);
    assert.equal(boot.sections.length, 17);
    assert.equal(boot.user.role, "INSTITUTION_ADMIN");
  });
  const testBoot = await request("bootstrap", {
    role: "testOwner",
    tenantId: "70a45679-cbbd-48aa-a126-34c73d631853",
  });
  const testYear = testBoot.years[0].id;
  const testDashboard = await request("dashboard?year=" + testYear, {
    role: "testOwner",
    tenantId: testBoot.institution.id,
  });
  check(
    "persisted test school has accurate invoices, concessions, scholarship and partial payment",
    () => {
      assert.equal(testBoot.institution.name, "CampusLedger Test School");
      assert.equal(testBoot.user.role, "INSTITUTION_ADMIN");
      assert.equal(testDashboard.kpi.students, 2);
      assert.equal(testDashboard.kpi.expected, 8000000);
      assert.equal(testDashboard.kpi.collected, 800000);
      assert.equal(testDashboard.kpi.outstanding, 7200000);
    },
  );
  const testReceipts = await request("receipts?year=" + testYear, {
    role: "testOwner",
    tenantId: testBoot.institution.id,
  });
  const testPdf = await request(
    "documents/receipt/" + testReceipts.rows[0].id,
    { role: "testOwner", tenantId: testBoot.institution.id, raw: true },
  );
  check("test-school receipt is downloadable from the persisted payment", () =>
    assert.equal(testPdf.headers.get("content-type"), "application/pdf"),
  );
  const demo = await request("students?year=" + boot.years[0].id + "&size=100");
  check("demo student database queries", () => assert.equal(demo.total, 34));
  const dashboard = await request("dashboard?year=" + boot.years[0].id);
  check("dashboard returns server analytics", () => assert.ok(dashboard));
  const year = (
    await request("catalog/years", {
      method: "POST",
      body: {
        name: "QA 2026–27",
        startDate: "2026-06-01",
        endDate: "2027-05-31",
        status: "Active",
      },
    })
  ).id;
  const clazz = (
    await request("catalog/classes", {
      method: "POST",
      body: { name: "QA 10th", level: "School" },
    })
  ).id;
  const section = (
    await request("catalog/sections", {
      method: "POST",
      body: {
        name: "QA-A",
        yearId: year,
        classId: clazz,
        campusId: boot.campuses[0].id,
      },
    })
  ).id;
  const parent = (
    await request("catalog/parents", {
      method: "POST",
      body: {
        guardianName: "QA Ramesh Kumar",
        mobile: "9876543210",
        email: identities.parent[1],
        relationship: "Father",
      },
    })
  ).id;
  const student = (
    await request("students", {
      method: "POST",
      body: {
        name: "QA Rahul Kumar",
        admissionNumber: "QA/2026/0001",
        yearId: year,
        sectionId: section,
        parentId: parent,
      },
    })
  ).id;
  const sibling = (
    await request("students", {
      method: "POST",
      body: {
        name: "QA Ananya Kumar",
        admissionNumber: "QA/2026/0002",
        yearId: year,
        sectionId: section,
        parentId: parent,
      },
    })
  ).id;
  const component = (
    await request("catalog/components", {
      method: "POST",
      body: { name: "QA Tuition", category: "Academic" },
    })
  ).id;
  const structure = (
    await request("catalog/structures", {
      method: "POST",
      body: {
        name: "QA annual fees",
        yearId: year,
        classId: clazz,
        sectionId: section,
        frequency: "Quarterly",
        dates: ["2026-06-10", "2026-09-10", "2026-12-10"],
        items: [{ componentId: component, amount: "60000" }],
      },
    })
  ).id;
  const invoice = (
    await request("fees/assign", {
      method: "POST",
      body: {
        studentId: student,
        structureId: structure,
        discount: "3000",
        scholarship: "0",
        reason: "QA concession approval",
      },
    })
  ).invoiceId;
  let profile = await request("students/" + student + "?year=" + year);
  check("net fees and installments are exact", () => {
    assert.equal(profile.student.total_paise, 5700000);
    assert.deepEqual(
      profile.installments.map((i) => i.total_paise),
      [1900000, 1900000, 1900000],
    );
  });
  check("academic and fee workflow persists", () => {
    assert.ok(profile.installments.length === 3);
    assert.ok(invoice);
  });
  await db
    .prepare(
      "INSERT INTO users(id,email,name,created_at,updated_at,created_by,updated_by) VALUES (?,?,?,?,?,?,?)",
    )
    .bind(
      identities.parent[0],
      identities.parent[1],
      "Existing parent",
      new Date().toISOString(),
      new Date().toISOString(),
      identities.parent[0],
      identities.parent[0],
    )
    .run();
  for (const [role, data] of [
    ["accountant", {}],
    ["teacher", { sectionId: section, feeVisibility: false }],
  ]) {
    await request("users/invite", {
      method: "POST",
      body: {
        email: identities[role][1],
        fullName: "QA " + role,
        role:
          role === "parent"
            ? "PARENT"
            : role === "teacher"
              ? "TEACHER"
              : "ACCOUNTANT",
        ...data,
      },
    });
    await request("bootstrap", { role });
  }
  await request("users/invite", {
    method: "POST",
    body: { email: identities.parent[1], fullName: "Guardian", role: "PARENT" },
    status: 422,
  });
  await request("bootstrap", { role: "parent", status: 403 });
  await request("parent?year=" + year, { role: "parent", status: 410 });
  check("parent accounts and portal endpoints are unavailable", () =>
    assert.ok(true),
  );
  await request("students?year=" + year, {
    role: "accountant",
    tenantId: "not-a-tenant",
    status: 404,
  });
  checks++;
  console.log("PASS tenant header cannot grant access");
  const key = randomUUID(),
    body = {
      studentId: student,
      yearId: year,
      amount: "8000",
      method: "UPI",
      reference: "QA-PARTIAL",
      idempotencyKey: key,
    };
  const payment = await request("payments", {
    role: "accountant",
    method: "POST",
    body,
  });
  const repeated = await request("payments", {
    role: "accountant",
    method: "POST",
    body,
  });
  check("duplicate payment requests return the original transaction", () =>
    assert.equal(payment.payment.id, repeated.payment.id),
  );
  await request("payments", {
    role: "accountant",
    method: "POST",
    body: { ...body, amount: "8001" },
    status: 409,
  });
  checks++;
  console.log("PASS reused key with different amount is rejected");
  profile = await request("students/" + student + "?year=" + year);
  check("partial installment stays unpaid until complete", () => {
    assert.equal(profile.installments[0].outstanding_paise, 1100000);
    assert.equal(profile.student.paid_paise, 800000);
    assert.notEqual(profile.installments[0].status, "Paid");
  });
  await request("payments", {
    role: "accountant",
    method: "POST",
    body: {
      ...body,
      amount: "10999.99",
      reference: "QA-NEXT",
      idempotencyKey: randomUUID(),
    },
  });
  profile = await request("students/" + student + "?year=" + year);
  check("one paise balance remains outstanding", () =>
    assert.equal(profile.installments[0].outstanding_paise, 1),
  );
  await request("payments", {
    role: "accountant",
    method: "POST",
    body: {
      ...body,
      amount: "0.01",
      reference: "QA-FINAL",
      idempotencyKey: randomUUID(),
    },
  });
  profile = await request("students/" + student + "?year=" + year);
  check("complete installment is paid", () => {
    assert.equal(profile.installments[0].outstanding_paise, 0);
    assert.equal(profile.installments[0].status, "Paid");
    assert.equal(profile.student.outstanding_paise, 3800000);
  });
  await request("payments", {
    role: "accountant",
    method: "POST",
    body: { ...body, amount: "999999", idempotencyKey: randomUUID() },
    status: 422,
  });
  checks++;
  console.log("PASS overpayment is rejected");
  const pending = await request("payments", {
    role: "accountant",
    method: "POST",
    body: {
      ...body,
      amount: "1000",
      method: "Cheque",
      reference: "QA-CHEQUE",
      idempotencyKey: randomUUID(),
    },
  });
  check("cheque creates no receipt before clearance", () => {
    assert.equal(pending.payment.status, "Pending");
    assert.equal(pending.receipt, null);
  });
  const cleared = await request("payments/" + pending.payment.id + "/confirm", {
    role: "accountant",
    method: "POST",
    body: { reference: "QA-CLEARED" },
  });
  check("cleared cheque gets a receipt", () =>
    assert.ok(cleared.receipt.number),
  );
  const refund = await request("refunds", {
    role: "accountant",
    method: "POST",
    body: {
      paymentId: payment.payment.id,
      amount: "500",
      method: "Bank Transfer",
      reason: "QA partial refund",
      idempotencyKey: randomUUID(),
    },
  });
  await request("refunds/" + refund.id + "/approve", {
    role: "accountant",
    method: "POST",
    body: { reference: "QA-REFUND" },
    status: 403,
  });
  checks++;
  console.log("PASS accountant cannot authorize own refund");
  await request("refunds/" + refund.id + "/approve", {
    method: "POST",
    body: { reference: "QA-REFUND" },
  });
  await request("refunds/" + refund.id + "/approve", {
    method: "POST",
    body: { reference: "QA-REFUND" },
  });
  profile = await request("students/" + student + "?year=" + year);
  check("refund reverses paid amount exactly once", () => {
    assert.equal(profile.student.outstanding_paise, 3750000);
    assert.equal(profile.ledger.filter((l) => l.kind === "Refund").length, 1);
  });
  await request("fees/adjust", {
    method: "POST",
    body: {
      installmentId: profile.installments[0].id,
      kind: "Concession",
      amount: "250",
      direction: "Credit",
      reason: "QA authorized concession",
    },
  });
  profile = await request("students/" + student + "?year=" + year);
  check("concession appends ledger and agrees with balance", () => {
    assert.equal(profile.student.outstanding_paise, 3725000);
    assert.equal(profile.ledger.at(-1).balance_paise, 3725000);
  });
  const teacher = await request("students/" + student + "?year=" + year, {
    role: "teacher",
  });
  check("teacher fee permission masks financial profile", () => {
    assert.equal(teacher.student.outstanding_paise, undefined);
    assert.equal(teacher.ledger.length, 0);
  });
  await request("catalog/components", {
    role: "accountant",
    method: "POST",
    body: { name: "Forbidden", category: "Academic" },
    status: 403,
  });
  checks++;
  console.log("PASS accountant cannot change critical configuration");
  await request("students/" + student, {
    method: "PATCH",
    body: { clearance: true, yearId: year, reason: "QA clearance request" },
    status: 409,
  });
  checks++;
  console.log("PASS financial clearance requires zero balance");
  await request("fees/assign", {
    method: "POST",
    body: { studentId: sibling, structureId: structure },
  });
  const siblingProfile = await request("students/" + sibling + "?year=" + year);
  check("automatic sibling concession uses server eligibility", () =>
    assert.equal(siblingProfile.student.total_paise, 5400000),
  );
  const pdf = await request("documents/receipt/" + payment.receipt.id, {
    role: "accountant",
    raw: true,
  });
  check("staff downloads a real PDF receipt", () =>
    assert.equal(pdf.headers.get("content-type"), "application/pdf"),
  );
  assert.equal(
    new TextDecoder().decode(
      new Uint8Array(await pdf.arrayBuffer()).slice(0, 5),
    ),
    "%PDF-",
  );
  await request("documents/invoice/" + demo.rows[0].id, {
    role: "accountant",
    raw: true,
    status: 404,
  });
  for (const format of ["csv", "xlsx", "pdf"]) {
    const result = await request(
      "reports/collections?year=" + year + "&format=" + format,
      { raw: true },
    );
    const bytes = new Uint8Array(await result.arrayBuffer());
    check(format + " report contains actual records", () =>
      assert.ok(bytes.length > 100),
    );
  }
  const report = await request("reports/collections?year=" + year);
  check("collection report uses persisted transactions", () =>
    assert.equal(report.rows.length, 4),
  );
  const invalidRows = [
    {
      name: "QA Valid import",
      admissionNumber: "QA-IMPORT-1",
      className: "QA 10th",
      sectionName: "QA-A",
      parentName: "QA Guardian",
      mobile: "9876543210",
    },
    {
      name: "Invalid mobile",
      admissionNumber: "QA-IMPORT-2",
      className: "QA 10th",
      sectionName: "QA-A",
      parentName: "QA Guardian",
      mobile: "123",
    },
  ];
  const preview = await request("import", {
    method: "POST",
    body: { kind: "students", yearId: year, rows: invalidRows },
  });
  check("import shows invalid row number", () =>
    assert.equal(preview.errors[0].row, 3),
  );
  await request("import", {
    method: "POST",
    body: { kind: "students", yearId: year, rows: invalidRows, commit: true },
    status: 422,
  });
  const afterImport = await request("students?year=" + year + "&q=QA-IMPORT");
  check("invalid import saves no partial records", () =>
    assert.equal(afterImport.total, 0),
  );
  await request("import", {
    method: "POST",
    body: {
      kind: "reconciliation",
      yearId: year,
      rows: [
        { transactionId: "QA-PARTIAL", amount: "8000", date: "2026-10-03" },
      ],
      commit: true,
    },
  });
  const reconciliation = await request("reconciliation?year=" + year);
  check("bank import matches reference and amount", () =>
    assert.equal(reconciliation.rows[0].status, "Matched"),
  );
  await request("communications", {
    method: "POST",
    body: {
      enabled: true,
      entityId: "QA-ENTITY",
      senderId: "QAFEES",
      templates: Object.fromEntries(
        ["before7", "before3", "before1", "after1"].map((key) => [
          key,
          {
            id: "QA-" + key,
            body: "{student} fees of {amount} are due on {date}.",
          },
        ]),
      ),
    },
  });
  await request("communications/consent", {
    method: "POST",
    body: {
      parentId: parent,
      consent: true,
      reason: "Guardian opted in during test setup",
    },
  });
  await request("notifications", {
    method: "POST",
    body: { studentIds: [student], channel: "SMS" },
  });
  const queue = await request("notifications/process", {
    method: "POST",
    body: {},
  });
  check("unconfigured providers leave messages queued", () =>
    assert.equal(queue.queued, true),
  );
  const secret = "qa-webhook-secret";
  await request("providers", {
    method: "POST",
    body: {
      provider: "Razorpay",
      mode: "test",
      config: {
        keyId: "qa-key",
        keySecret: "qa-secret",
        webhookSecret: secret,
      },
    },
  });
  const provider = await db
    .prepare("SELECT ciphertext FROM provider_configs WHERE institution_id=?")
    .bind(tenant)
    .first();
  check("gateway credentials are encrypted at rest", () =>
    assert.ok(!provider.ciphertext.includes(secret)),
  );
  const fixture = await request("payments", {
    role: "accountant",
    method: "POST",
    body: {
      ...body,
      amount: "2000",
      method: "Cheque",
      reference: "QA-GATEWAY-FIXTURE",
      idempotencyKey: randomUUID(),
    },
  });
  await db
    .prepare(
      "UPDATE payments SET gateway='Razorpay',gateway_order_id='qa_order_signed',status='Initiated' WHERE id=?",
    )
    .bind(fixture.payment.id)
    .run();
  const event = {
    event: "payment.captured",
    payload: {
      payment: {
        entity: {
          id: "qa_gateway_payment",
          order_id: "qa_order_signed",
          status: "captured",
          currency: "INR",
          amount: 200000,
        },
      },
    },
  };
  const signature = createHmac("sha256", secret)
    .update(JSON.stringify(event))
    .digest("hex");
  await request("payments/webhook", {
    method: "POST",
    body: event,
    headers: {
      "x-razorpay-signature": "invalid",
      "x-razorpay-event-id": "qa_event",
    },
    status: 400,
  });
  checks++;
  console.log("PASS invalid webhook signature rejected");
  const wrong = {
    ...event,
    payload: {
      payment: { entity: { ...event.payload.payment.entity, amount: 200001 } },
    },
  };
  await request("payments/webhook", {
    method: "POST",
    body: wrong,
    headers: {
      "x-razorpay-signature": createHmac("sha256", secret)
        .update(JSON.stringify(wrong))
        .digest("hex"),
      "x-razorpay-event-id": "qa_wrong",
    },
    status: 422,
  });
  checks++;
  console.log("PASS signed wrong amount webhook rejected");
  await request("payments/webhook", {
    method: "POST",
    body: event,
    headers: {
      "x-razorpay-signature": signature,
      "x-razorpay-event-id": "qa_event",
    },
  });
  const duplicateEvent = await request("payments/webhook", {
    method: "POST",
    body: event,
    headers: {
      "x-razorpay-signature": signature,
      "x-razorpay-event-id": "qa_event",
    },
  });
  check("signed captured webhook is idempotent", () =>
    assert.equal(duplicateEvent.duplicate, true),
  );
  const confirmed = await request("students/" + student + "?year=" + year, {
    role: "accountant",
  });
  check(
    "gateway confirmation updates ledger, invoice and institution balance",
    () => {
      assert.equal(confirmed.student.outstanding_paise, 3525000);
      assert.ok(
        confirmed.payments.find((p) => p.id === fixture.payment.id).receipt_id,
      );
      assert.equal(confirmed.ledger.at(-1).balance_paise, 3525000);
    },
  );
  const fresh = await request("dashboard?year=" + year);
  check("dashboard and reports update after gateway confirmation", () => {
    assert.equal(fresh.kpi.collected, 2150000);
    assert.equal(fresh.kpi.refunds, 50000);
  });
  const components = await request("reports/components?year=" + year);
  check("component collections conserve the receipt total", () =>
    assert.equal(
      components.rows.reduce((s, r) => s + r.collected_paise, 0),
      2200000,
    ),
  );
  await request("payments", {
    role: "accountant",
    method: "POST",
    body: { ...body, amount: "1.001", idempotencyKey: randomUUID() },
    status: 422,
  });
  checks++;
  console.log("PASS invalid financial precision gives a validation error");
  const races = await Promise.all(
    [0, 1].map(async (index) => {
      const idempotencyKey = randomUUID();
      const response = await mf.dispatchFetch(
        "https://campus.test/api/payments",
        {
          method: "POST",
          headers: {
            "Idempotency-Key": idempotencyKey,
            "oai-authenticated-user-id": identities.accountant[0],
            "oai-authenticated-user-email": identities.accountant[1],
            "x-institution-id": tenant,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            studentId: sibling,
            yearId: year,
            amount: "40000",
            method: "Bank Transfer",
            reference: "QA-RACE-" + index,
            idempotencyKey,
          }),
        },
      );
      return { status: response.status, data: await response.json() };
    }),
  );
  check("concurrent payments cannot overdraw installments", () => {
    assert.equal(races.filter((r) => r.status === 200).length, 1);
    assert.ok(races.some((r) => [409, 422].includes(r.status)));
  });
  await request("jobs/scheduled", { status: 401 });
  checks++;
  console.log("PASS scheduler endpoint requires service authorization");
  const settings = {
    ...boot.institution.settings,
    lateFee: { ...boot.institution.settings.lateFee, enabled: true },
  };
  await request("settings", {
    method: "PATCH",
    body: {
      name: boot.institution.name,
      address: boot.institution.address,
      email: boot.institution.email,
      phone: boot.institution.phone,
      settings,
    },
  });
  const firstJobs = await request("jobs/scheduled", {
    method: "POST",
    body: { institutionId: tenant },
    headers: { authorization: "Bearer " + jobSecret },
  });
  const repeatedJobs = await request("jobs/scheduled", {
    method: "POST",
    body: { institutionId: tenant },
    headers: { authorization: "Bearer " + jobSecret },
  });
  check("maintenance posts configured late fees once", () => {
    assert.ok(firstJobs.lateFees > 0);
    assert.equal(repeatedJobs.lateFees, 0);
  });
  const serviceRead = await request("jobs/scheduled", {
    headers: { authorization: "Bearer " + jobSecret },
  });
  check("scheduler can read persisted maintenance history", () => {
    assert.ok(serviceRead.lastRun);
    assert.ok(serviceRead.runs.length > 0);
  });
  await assert.rejects(() =>
    db
      .prepare("UPDATE ledger_entries SET credit_paise=1 WHERE payment_id=?")
      .bind(payment.payment.id)
      .run(),
  );
  checks++;
  console.log("PASS historical ledger updates are blocked by database");
  const newTenant = (
    await request("platform/institutions", {
      method: "POST",
      body: {
        name: "QA Independent College",
        institutionCode: "QA-INDEPENDENT",
        adminName: "QA Administrator",
        adminMobile: "9876543210",
        planId: "plan-enterprise",
        subscriptionStart: "2026-06-01",
        subscriptionEnd: "2027-05-31",
        subscriptionStatus: "Active",
        subscription: "Enterprise",
        adminEmail: identities.schoolAdmin[1],
        setupAcademic: true,
      },
    })
  ).id;
  const newData = await request("students", { tenantId: newTenant });
  check("second institution has no first-tenant data", () =>
    assert.equal(newData.total, 0),
  );
  const newSchool = await request("bootstrap", {
    role: "schoolAdmin",
    tenantId: newTenant,
  });
  check(
    "institution creation atomically provisions academics and ChatGPT administrator access",
    () => {
      assert.equal(newSchool.user.role, "INSTITUTION_ADMIN");
      assert.equal(newSchool.institution.id, newTenant);
      assert.equal(newSchool.classes.length, 15);
      assert.equal(newSchool.sections.length, 17);
      assert.equal(newSchool.streams.length, 2);
      assert.equal(newSchool.years[0].name, "2026–27");
    },
  );
  const schoolStudents = await request("students", {
    role: "schoolAdmin",
    tenantId: newTenant,
  });
  check("new institution administrator sees only their institution", () =>
    assert.equal(schoolStudents.total, 0),
  );
  await request("platform/dashboard", {
    role: "schoolAdmin",
    tenantId: newTenant,
    status: 403,
  });
  await request("platform/institutions", {
    role: "schoolAdmin",
    tenantId: newTenant,
    method: "POST",
    body: { name: "Unauthorized school" },
    status: 403,
  });
  checks++;
  console.log(
    "PASS institution administrator cannot use platform administration",
  );
  const schoolUsers = await request("users", {
    role: "schoolAdmin",
    tenantId: newTenant,
  });
  check("platform administrator is not an institution staff member", () =>
    assert.ok(!schoolUsers.members.some((m) => m.role === "SUPER_ADMIN")),
  );
  const platformStats = await request("platform/dashboard");
  check(
    "platform dashboard uses persisted institution and financial totals",
    () => {
      assert.ok(platformStats.institutions >= 2);
      assert.ok(platformStats.students >= 36);
      assert.ok(platformStats.activeSubscriptions > 0);
    },
  );
  await request("platform/institutions/" + newTenant + "/admins", {
    method: "POST",
    body: {
      email: identities.schoolAdmin[1],
      fullName: "QA Administrator",
      mobile: "9876543210",
    },
  });
  await request("platform/institutions/" + newTenant + "/admins", {
    method: "POST",
    body: {
      email: identities.schoolAdmin[1],
      fullName: "QA Administrator",
      mobile: "9876543210",
    },
  });
  const reGranted = await request("bootstrap", {
    role: "schoolAdmin",
    tenantId: newTenant,
    headers: { "oai-authenticated-user-id": "another-school-admin-subject" },
  });
  check(
    "repeated administrator grants retain a single account and membership",
    () => {
      assert.equal(reGranted.user.userId, newSchool.user.userId);
      assert.equal(reGranted.memberships.length, 1);
      assert.equal(reGranted.user.role, "INSTITUTION_ADMIN");
    },
  );
  await request("platform/institutions/" + newTenant + "/admins", {
    role: "parent",
    method: "POST",
    body: { email: identities.parent[1] },
    status: 403,
  });
  checks++;
  console.log("PASS parent cannot grant institution access");
  await request("students/" + student + "?year=" + year, {
    tenantId: newTenant,
    status: 404,
  });
  checks++;
  console.log("PASS cross-tenant entity IDs cannot be read");
  await request("students", {
    role: "parent",
    tenantId: newTenant,
    status: 403,
  });
  checks++;
  console.log("PASS parents cannot switch to an unauthorized tenant");
  await request("bootstrap", { role: "stranger", status: 403 });
  checks++;
  console.log("PASS uninvited account cannot join institution");
  await request("catalog/components", {
    method: "POST",
    body: { name: "CSRF", category: "Academic" },
    headers: { origin: "https://attacker.test" },
    status: 403,
  });
  checks++;
  console.log("PASS cross-origin mutation rejected");
  await request("years/" + year, {
    method: "PATCH",
    body: { status: "Closed" },
  });
  await request("payments", {
    role: "accountant",
    method: "POST",
    body: { ...body, amount: "1", idempotencyKey: randomUUID() },
    status: 409,
  });
  checks++;
  console.log("PASS closed academic year rejects financial writes");
  await request("installments/" + profile.installments[0].id, {
    method: "PATCH",
    body: { dueDate: "2026-12-01", reason: "QA closed-year check" },
    status: 409,
  });
  checks++;
  console.log("PASS closed academic year rejects due-date edits");
  const preserved = await request("students/" + student + "?year=" + year, {
    role: "accountant",
  });
  check("closed academic year retains history", () =>
    assert.ok(preserved.ledger.length > 5),
  );

  console.log("Integration checks passed:", checks);
} finally {
  await mf.dispose();
}
```


### `tests/refactor.mjs`

```javascript
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile, readdir } from "node:fs/promises";
import { randomUUID, randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { PDFDocument } from "pdf-lib";
const require = createRequire(import.meta.url),
  { Miniflare } = createRequire(require.resolve("wrangler"))("miniflare");
const files = (await readdir("dist/server", { recursive: true }))
  .filter((f) => f.endsWith(".js"))
  .sort((a, b) => (a === "index.js" ? -1 : b === "index.js" ? 1 : 0));
const secret = randomBytes(32).toString("hex"),
  tenant = "70a45679-cbbd-48aa-a126-34c73d631853",
  owner = "tejomaya@mvdt.in";
let cookie = "",
  checks = 0,
  delivered = false,
  deliveryStarted = false;
const mf = new Miniflare({
  modules: files.map((f) => ({
    type: "ESModule",
    path: resolve("dist/server", f),
  })),
  modulesRoot: resolve("dist/server"),
  compatibilityDate: "2026-05-15",
  compatibilityFlags: ["nodejs_compat"],
  d1Databases: { DB: "refactor" },
  r2Buckets: ["BUCKET"],
  bindings: {
    PLATFORM_OWNER_EMAIL: owner,
    JOB_SECRET: secret,
    PROVIDER_ENCRYPTION_KEY: randomBytes(32).toString("hex"),
  },
  outboundService: async (request) => {
    if (new URL(request.url).hostname === "notify.example.test") {
      deliveryStarted = true;
      await new Promise((r) => setTimeout(r, 1500));
      delivered = true;
      return Response.json({ id: "mock-delivered" });
    }
    throw new Error("Unexpected outbound request " + request.url);
  },
});
const check = (name, fn) => {
  fn();
  checks++;
  console.log("PASS " + name);
};
async function req(
  path,
  {
    email = owner,
    method = "GET",
    body,
    status = 200,
    extra = {},
    raw = false,
    tenantId = tenant,
  } = {},
) {
  const response = await mf.dispatchFetch("https://campus.test/api/" + path, {
    method,
    headers: {
      "oai-authenticated-user-email": email,
      "x-institution-id": tenantId,
      ...(cookie && email === owner ? { cookie } : {}),
      ...(body
        ? { "Content-Type": "application/json", origin: "https://campus.test" }
        : {}),
      ...(method === "POST" &&
      /^(payments|fees|invoices|refunds|cash)(\/|$)/.test(path)
        ? { "Idempotency-Key": body?.idempotencyKey || randomUUID() }
        : {}),
      ...extra,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (raw && response.status === 202 && path.includes("documents/receipt/")) {
    await response.text();
    await new Promise((r) => setTimeout(r, 100));
    return req(path, { email, method, body, status, raw, tenantId, extra });
  }
  if (raw) {
    if (status !== null) assert.equal(response.status, status, path);
    return response;
  }
  const result = await response.json();
  assert.equal(response.status, status, path + " " + JSON.stringify(result));
  return result.data ?? result;
}
try {
  const db = await mf.getD1Database("DB");
  for (const file of (await readdir("drizzle"))
    .filter((f) => f.endsWith(".sql"))
    .sort())
    for (const statement of (await readFile("drizzle/" + file, "utf8"))
      .split("--> statement-breakpoint")
      .filter((s) => s.trim()))
      await db.prepare(statement).run();
  await req("session");
  const support = await req("platform/institutions/" + tenant + "/support", {
    method: "POST",
    body: { reason: "Architecture regression checks" },
    raw: true,
  });
  cookie = support.headers.get("set-cookie").split(";")[0];
  const boot = await req("bootstrap"),
    year = boot.years[0].id,
    students = await req("students?year=" + year),
    student = students.rows[0].id;
  const initial = await req("students/" + student + "?year=" + year);
  const upgrade = await req("jobs/saas-upgrade", {
    method: "POST",
    body: {},
    extra: { authorization: "Bearer " + secret },
  });
  const replayUpgrade = await req("jobs/saas-upgrade", {
    method: "POST",
    body: {},
    extra: { authorization: "Bearer " + secret },
  });
  check("journal backfill is repeatable and preserves student balances", () => {
    assert.ok(upgrade.journal.backfilled > 0);
    assert.equal(replayUpgrade.journal.backfilled, 0);
  });
  const after = await req("students/" + student + "?year=" + year);
  check("historical balance unchanged and old events have two entries", () => {
    assert.equal(
      after.student.outstanding_paise,
      initial.student.outstanding_paise,
    );
    assert.ok(after.journal.length > 0);
    assert.equal(
      after.journal.reduce((n, r) => n + r.debit_paise - r.credit_paise, 0),
      0,
    );
  });
  await assert.rejects(
    () => db.prepare("UPDATE journal_events SET amount_paise=1").run(),
    /IMMUTABLE/,
  );
  await assert.rejects(
    () => db.prepare("DELETE FROM journal_events").run(),
    /IMMUTABLE/,
  );
  checks++;
  console.log("PASS journal rows cannot be updated or deleted");
  const body = {
    studentId: student,
    yearId: year,
    amount: "0.29",
    method: "UPI",
    reference: "REFRACTOR-29",
    idempotencyKey: randomUUID(),
  };
  await req("payments", {
    method: "POST",
    body,
    extra: { "Idempotency-Key": "" },
    status: 400,
  });
  await req("payments", {
    method: "POST",
    body,
    extra: { "Idempotency-Key": "not-a-uuid" },
    status: 400,
  });
  await req("payments", {
    method: "POST",
    body,
    extra: { "Idempotency-Key": randomUUID() },
    status: 409,
  });
  checks++;
  console.log(
    "PASS financial routes reject missing, malformed and mismatched headers",
  );
  const results = await Promise.all(
    [0, 1].map(() =>
      req("payments", { method: "POST", body, raw: true, status: null }),
    ),
  );
  // Concurrent loser may return the completed cached response or an in-progress conflict.
  assert.ok(results.every((r) => [200, 409].includes(r.status)));
  const successful = results.filter((r) => r.status === 200);
  assert.ok(successful.length >= 1);
  const payment = await req("payments", { method: "POST", body });
  const count = await db
    .prepare(
      "SELECT COUNT(*) n FROM payments WHERE institution_id=? AND idempotency_key=?",
    )
    .bind(tenant, body.idempotencyKey)
    .first();
  check("concurrent retry commits one payment", () => assert.equal(count.n, 1));
  await req("payments", {
    method: "POST",
    body: { ...body, amount: "0.30" },
    status: 409,
  });
  checks++;
  console.log("PASS a reused key cannot change the amount");
  const refundBody = {
      paymentId: payment.payment.id,
      amount: "0.10",
      reason: "Regression partial reversal",
      method: "UPI",
      idempotencyKey: randomUUID(),
    },
    refund = await req("refunds", { method: "POST", body: refundBody }),
    repeatedRefund = await req("refunds", { method: "POST", body: refundBody });
  check("refund retries reuse the original request", () =>
    assert.equal(refund.id, repeatedRefund.id),
  );
  const approveKey = randomUUID();
  await req("refunds/" + refund.id + "/approve", {
    method: "POST",
    body: { reference: "REFUND-VERIFIED", idempotencyKey: approveKey },
  });
  await req("refunds/" + refund.id + "/approve", {
    method: "POST",
    body: { reference: "REFUND-VERIFIED", idempotencyKey: approveKey },
  });
  const reversal = await db
    .prepare(
      "SELECT * FROM journal_events WHERE institution_id=? AND event_type='REVERSAL_ISSUED' ORDER BY created_at DESC LIMIT 1",
    )
    .bind(tenant)
    .first();
  check(
    "refund appends a linked reversal without rewriting the payment",
    () => {
      assert.equal(reversal.amount_paise, 10);
      assert.ok(reversal.reversal_of.startsWith("journal:"));
    },
  );
  const pdfResponse = await req(
      "documents/receipt/" + payment.receipt.id + "?format=thermal",
      { raw: true },
    ),
    pdf = await PDFDocument.load(await pdfResponse.arrayBuffer());
  check("thermal receipt has an 80mm page width", () =>
    assert.ok(Math.abs(pdf.getPage(0).getWidth() - (80 * 72) / 25.4) < 0.01),
  );
  const settings = structuredClone(boot.institution.settings || {});
  settings.upi = { payeeId: "school@bank", payeeName: "Test School" };
  settings.receiptNotifications = { enabled: true, channel: "SMS" };
  await db
    .prepare("UPDATE institutions SET settings=? WHERE id=?")
    .bind(JSON.stringify(settings), tenant)
    .run();
  const invoice = initial.invoices[0].id;
  const demand = await req("documents/invoice/" + invoice, { raw: true });
  check("unpaid demand with UPI configuration generates a real PDF", () =>
    assert.equal(demand.headers.get("Content-Type"), "application/pdf"),
  );
  for (const [role, email] of [
    ["FEE_COUNTER_CASHIER", "cashier@example.test"],
    ["AUDITOR", "auditor@example.test"],
  ]) {
    await req("users/invite", {
      method: "POST",
      body: { role, email, fullName: role },
    });
    await req("bootstrap", { email });
  }
  await req("payments", {
    email: "cashier@example.test",
    method: "POST",
    body: {
      ...body,
      amount: "1",
      reference: "CASHIER-COLLECTION",
      idempotencyKey: randomUUID(),
    },
  });
  await req("payments/" + payment.payment.id + "/cancel", {
    email: "cashier@example.test",
    method: "POST",
    body: {},
    status: 403,
  });
  await req("fees/adjust", {
    email: "cashier@example.test",
    method: "POST",
    body: {},
    status: 403,
  });
  await req("reports/collections?year=" + year, {
    email: "auditor@example.test",
  });
  await req("reports/outstanding?year=" + year, {
    email: "auditor@example.test",
  });
  await req("reports/summary?year=" + year, { email: "auditor@example.test" });
  await req("students", { email: "auditor@example.test", status: 403 });
  await req("payments", {
    email: "auditor@example.test",
    method: "POST",
    body,
    status: 403,
  });
  checks++;
  console.log(
    "PASS cashier can collect and auditor can report without mutation privileges",
  );
  const report = await req("dashboard?year=" + year);
  check("aging buckets use persisted outstanding installments", () => {
    assert.equal(report.aging.length, 4);
    assert.equal(
      report.aging.reduce((n, r) => n + r.amount, 0),
      report.kpi.overdue,
    );
  });
  const closure = await req("cash?campus=" + boot.campuses[0].id),
    closureBody = {
      kind: "Close",
      campusId: closure.campusId,
      yearId: year,
      date: closure.date,
      denominations: { 500: 0 },
      expectedPaise: closure.expected,
      notes: "Counted in regression test",
      idempotencyKey: randomUUID(),
    };
  await req("cash", {
    method: "POST",
    body: { ...closureBody, denominations: { 500: 0.5 } },
    status: 422,
  });
  await req("cash", {
    method: "POST",
    body: {
      ...closureBody,
      expectedPaise: closure.expected + 100,
      idempotencyKey: randomUUID(),
    },
    status: 409,
  });
  await req("cash", {
    email: "cashier@example.test",
    method: "POST",
    body: closureBody,
  });
  checks++;
  console.log(
    "PASS closure validates counts and rejects stale register totals",
  );
  await assert.rejects(
    () =>
      db
        .prepare(
          "UPDATE cash_closings SET counted_paise=999 WHERE institution_id=?",
        )
        .bind(tenant)
        .run(),
    /IMMUTABLE/,
  );
  checks++;
  console.log("PASS counted cash and variance cannot be overwritten");
  await req("providers", {
    method: "POST",
    body: {
      provider: "SMS",
      mode: "test",
      config: { url: "https://notify.example.test/send", token: "local-test" },
    },
  });
  const start = performance.now();
  await req("payments", {
    method: "POST",
    body: {
      ...body,
      amount: "1",
      reference: "ASYNC",
      idempotencyKey: randomUUID(),
    },
  });
  const elapsed = performance.now() - start;
  check("payment response returns before notification delivery completes", () =>
    assert.equal(delivered, false),
  );
  console.log(
    "Payment response with delayed provider:",
    Math.round(elapsed),
    "ms",
  );
  const outbox = await db
    .prepare(
      "SELECT COUNT(*) n FROM notification_outbox WHERE institution_id=?",
    )
    .bind(tenant)
    .first();
  check("notification work is persisted with successful payments", () =>
    assert.ok(outbox.n >= 3),
  );
  const journal = await db
    .prepare(
      "SELECT SUM(debit_paise)-SUM(credit_paise) balance,COUNT(*) n FROM journal_postings WHERE institution_id=?",
    )
    .bind(tenant)
    .first();
  check("all financial postings remain double-entry balanced", () => {
    assert.equal(journal.balance, 0);
    assert.ok(journal.n > 10);
  });
  console.log("Architecture checks passed:", checks);
} finally {
  await mf.dispose();
}
```


### `tests/saas.mjs`

```javascript
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile, readdir } from "node:fs/promises";
import { randomBytes, randomUUID } from "node:crypto";
import { resolve } from "node:path";
const require = createRequire(import.meta.url),
  { Miniflare } = createRequire(require.resolve("wrangler"))("miniflare");
const files = (await readdir("dist/server", { recursive: true }))
  .filter((f) => f.endsWith(".js"))
  .sort((a, b) => (a === "index.js" ? -1 : b === "index.js" ? 1 : 0));
const secret = randomBytes(32).toString("hex");
const mf = new Miniflare({
  modules: files.map((f) => ({
    type: "ESModule",
    path: resolve("dist/server", f),
  })),
  modulesRoot: resolve("dist/server"),
  compatibilityDate: "2026-05-15",
  compatibilityFlags: ["nodejs_compat"],
  d1Databases: { DB: "saas" },
  r2Buckets: ["BUCKET"],
  bindings: {
    PLATFORM_OWNER_EMAIL: "tejomaya@mvdt.in",
    PLATFORM_ORIGIN: "https://campus.test",
    JOB_SECRET: secret,
    PROVIDER_ENCRYPTION_KEY: randomBytes(32).toString("hex"),
  },
});
let checks = 0;
const check = (name, fn) => {
  fn();
  checks++;
  console.log("PASS " + name);
};
async function req(
  path,
  {
    email = "tejomaya@mvdt.in",
    method = "GET",
    body,
    tenant,
    cookie,
    status = 200,
    extra = {},
    raw = false,
  } = {},
) {
  const response = await mf.dispatchFetch("https://campus.test/api/" + path, {
    method,
    headers: {
      ...(method === "POST" &&
      /^(payments|refunds|cash|fees|invoices)(\/|$)/.test(
        path.replace(/^campus\/[^/]+\//, ""),
      ) &&
      path !== "payments/webhook"
        ? { "Idempotency-Key": body?.idempotencyKey || randomUUID() }
        : {}),
      "oai-authenticated-user-email": email,
      ...(tenant ? { "x-institution-id": tenant } : {}),
      ...(cookie ? { cookie } : {}),
      ...(body
        ? { "content-type": "application/json", origin: "https://campus.test" }
        : {}),
      ...extra,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (raw && response.status === 202 && path.includes("documents/receipt/")) {
    await response.text();
    await new Promise((r) => setTimeout(r, 100));
    return req(path, {
      email,
      method,
      body,
      status,
      raw,
      tenant,
      cookie,
      extra,
    });
  }
  if (raw) {
    assert.equal(response.status, status, path);
    return response;
  }
  const result = await response.json();
  assert.equal(response.status, status, path + " " + JSON.stringify(result));
  return result.data ?? result;
}
try {
  const db = await mf.getD1Database("DB");
  for (const file of (await readdir("drizzle"))
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    for (const statement of (await readFile("drizzle/" + file, "utf8"))
      .split("--> statement-breakpoint")
      .filter((s) => s.trim()))
      await db.prepare(statement.trim()).run();
  }
  const test = "70a45679-cbbd-48aa-a126-34c73d631853",
    snapshot = await db
      .prepare(
        "SELECT id,net_paise FROM invoices WHERE institution_id=? ORDER BY id",
      )
      .bind(test)
      .all();
  const login = await req("session");
  check("existing canonical Super Admin becomes platform admin", () => {
    assert.equal(login.platform, true);
    assert.equal(login.user.email, "tejomaya@mvdt.in");
    assert.equal(login.memberships.length, 0);
  });
  const subject = await req("session", {
    extra: { "oai-authenticated-user-id": "a-changed-chatgpt-subject" },
  });
  check("ChatGPT subject changes preserve the owner account", () =>
    assert.equal(subject.user.userId, login.user.userId),
  );
  await req("students", { tenant: test, status: 403 });
  checks++;
  console.log("PASS platform role alone cannot read institution data");
  await req("students", { status: 400 });
  checks++;
  console.log("PASS requests require explicit tenant identification");
  const publicPortal = await req("portal/campusledger-test-school", {
    email: "",
  });
  check("public branding contains no financial or user records", () => {
    assert.equal(publicPortal.name, "CampusLedger Test School");
    assert.equal(publicPortal.portalPath, "/campus/campusledger-test-school");
    assert.equal(publicPortal.students, undefined);
    assert.equal(publicPortal.email, undefined);
  });
  const create = await req("platform/institutions", {
    method: "POST",
    body: {
      name: "Green Valley Test School",
      institutionCode: "GV-TEST",
      institutionType: "School",
      adminName: "Green Valley Administrator",
      adminEmail: "admin@green-valley.example.test",
      adminMobile: "9876543210",
      planId: "plan-starter",
      subscriptionStatus: "Active",
      subscriptionStart: "2026-06-01",
      subscriptionEnd: "2027-05-31",
      setupAcademic: true,
    },
  });
  const campus = "campus/" + create.slug + "/",
    admin = "admin@green-valley.example.test";
  check("onboarding creates a unique readable institution URL", () =>
    assert.equal(create.portalPath, "/campus/green-valley-test-school"),
  );
  const boot = await req(campus + "bootstrap", { email: admin });
  check(
    "first administrator and academics are provisioned for this tenant",
    () => {
      assert.equal(boot.user.role, "INSTITUTION_ADMIN");
      assert.equal(boot.classes.length, 15);
      assert.equal(boot.sections.length, 17);
      assert.equal(boot.institution.id, create.id);
    },
  );
  await req("platform/dashboard", { email: admin, status: 403 });
  checks++;
  console.log("PASS institution admin cannot open platform API");
  await req(campus + "students", { email: admin, tenant: test, status: 403 });
  await req("students", { email: admin, tenant: test, status: 403 });
  checks++;
  console.log(
    "PASS changing portal or tenant header cannot switch an institution user",
  );
  const student = await req(campus + "students", {
    email: admin,
    method: "POST",
    body: {
      name: "Green Valley Student",
      admissionNumber: "GV/2026/0001",
      yearId: boot.years[0].id,
      sectionId: boot.sections[0].id,
      parentName: "Guardian Contact",
      mobile: "9876543210",
    },
  });
  const component = await req(campus + "catalog/components", {
    email: admin,
    method: "POST",
    body: { name: "QA Tuition", category: "Academic" },
  });
  const structure = await req(campus + "catalog/structures", {
    email: admin,
    method: "POST",
    body: {
      name: "Green Valley annual fee",
      yearId: boot.years[0].id,
      classId: boot.sections[0].class_id,
      sectionId: boot.sections[0].id,
      frequency: "Quarterly",
      dates: ["2026-06-10", "2026-09-10", "2026-12-10"],
      items: [{ componentId: component.id, amount: "60000" }],
    },
  });
  const assignment = await req(campus + "fees/assign", {
    email: admin,
    method: "POST",
    body: { studentId: student.id, structureId: structure.id },
  });
  await req(campus + "users/invite", {
    email: admin,
    method: "POST",
    body: {
      email: "collector@green-valley.example.test",
      fullName: "Fee Collector",
      role: "FEE_COLLECTOR",
    },
  });
  const collector = "collector@green-valley.example.test";
  await req(campus + "bootstrap", { email: collector });
  const paid = await req(campus + "payments", {
    email: collector,
    method: "POST",
    body: {
      studentId: student.id,
      yearId: boot.years[0].id,
      amount: "8000",
      method: "UPI",
      reference: "GV-TEST-PARTIAL",
      idempotencyKey: randomUUID(),
    },
  });
  const receipt = await req(campus + "documents/receipt/" + paid.receipt.id, {
    email: collector,
    raw: true,
  });
  check("collector receives a real receipt for an atomic partial payment", () =>
    assert.equal(receipt.headers.get("content-type"), "application/pdf"),
  );
  const profile = await req(campus + "students/" + student.id, {
    email: admin,
  });
  check("partial payment retains the correct installment balance", () => {
    assert.equal(profile.student.outstanding_paise, 5200000);
    assert.equal(profile.installments[0].outstanding_paise, 1200000);
    assert.equal(profile.installments[0].paid_paise, 800000);
  });
  await req(campus + "catalog/components", {
    email: collector,
    method: "POST",
    body: { name: "Forbidden", category: "Academic" },
    status: 403,
  });
  await req(campus + "users", { email: collector, status: 403 });
  await req(campus + "reports/collections", { email: collector, status: 403 });
  checks++;
  console.log("PASS fee collector cannot configure fees, users or reports");
  await req(campus + "users/invite", {
    email: admin,
    method: "POST",
    body: {
      email: "teacher@green-valley.example.test",
      fullName: "Class Teacher",
      role: "TEACHER",
      sectionId: boot.sections[0].id,
    },
  });
  const teacher = "teacher@green-valley.example.test";
  await req(campus + "bootstrap", { email: teacher });
  const teacherStudents = await req(campus + "students", { email: teacher }),
    teacherProfile = await req(campus + "students/" + student.id, {
      email: teacher,
    });
  check("teacher sees assigned students without financial data", () => {
    assert.equal(teacherStudents.rows.length, 1);
    assert.equal(teacherStudents.rows[0].outstanding_paise, undefined);
    assert.equal(teacherProfile.payments.length, 0);
  });
  for (const target of [
    "dashboard",
    "payments",
    "receipts",
    "reports/collections",
    "documents/receipt/" + paid.receipt.id,
  ])
    await req(campus + target, { email: teacher, status: 403 });
  checks++;
  console.log("PASS teacher cannot access financial APIs or receipts");
  await req(campus + "users/invite", {
    email: admin,
    method: "POST",
    body: {
      email: "custom@green-valley.example.test",
      fullName: "Custom User",
      role: "CUSTOM",
      permissions: ["students.view"],
    },
  });
  const custom = "custom@green-valley.example.test";
  await req(campus + "bootstrap", { email: custom });
  await req(campus + "students", { email: custom });
  await req(campus + "payments", { email: custom, status: 403 });
  await req(campus + "students", {
    email: custom,
    method: "POST",
    body: { name: "Forbidden" },
    status: 403,
  });
  checks++;
  console.log("PASS custom permissions remain limited to selected areas");
  for (const target of ["parent", "pay/token", "payment-links"])
    await req(target, {
      email: admin,
      method: target === "payment-links" ? "POST" : "GET",
      body: target === "payment-links" ? {} : undefined,
      tenant: create.id,
      status: 410,
    });
  await req(campus + "users/invite", {
    email: admin,
    method: "POST",
    body: {
      email: "parent@green-valley.example.test",
      fullName: "Parent",
      role: "PARENT",
    },
    status: 422,
  });
  checks++;
  console.log("PASS parent login and payment portal are removed");
  const supportResponse = await req(
    "platform/institutions/" + test + "/support",
    {
      method: "POST",
      body: {
        reason: "Verify tenant isolation and preserve existing Test School",
      },
      raw: true,
    },
  );
  const cookie = supportResponse.headers.get("set-cookie").split(";")[0];
  check("support access uses a secure HttpOnly cookie", () => {
    assert.ok(
      supportResponse.headers
        .get("set-cookie")
        .includes("HttpOnly; Secure; SameSite=Strict"),
    );
  });
  const tb = await req("campus/campusledger-test-school/bootstrap", { cookie }),
    year = tb.years[0].id;
  const td = await req(
    "campus/campusledger-test-school/dashboard?year=" + year,
    { cookie },
  );
  check("existing Test School financial totals are unchanged", () => {
    assert.equal(td.kpi.expected, 8000000);
    assert.equal(td.kpi.collected, 800000);
    assert.equal(td.kpi.outstanding, 7200000);
  });
  await req("students/" + student.id, { tenant: test, cookie, status: 404 });
  await req(campus + "students/" + student.id, { cookie, status: 403 });
  await req(campus + "documents/receipt/" + paid.receipt.id, {
    tenant: test,
    cookie,
    status: 403,
  });
  checks++;
  console.log("PASS support cookie is bound to user and institution");
  const testStudent = (
    await req("students?year=" + year, { tenant: test, cookie })
  ).rows[0];
  await req(campus + "students/" + testStudent.id, {
    email: admin,
    status: 404,
  });
  const testReceipt = (
    await req("receipts?year=" + year, { tenant: test, cookie })
  ).rows[0];
  await req(campus + "documents/receipt/" + testReceipt.id, {
    email: admin,
    status: 404,
  });
  await req(campus + "payments", {
    email: admin,
    method: "POST",
    body: {
      studentId: testStudent.id,
      yearId: year,
      amount: "1",
      method: "Cash",
      idempotencyKey: randomUUID(),
    },
    status: 404,
  });
  checks++;
  console.log(
    "PASS foreign student, receipt, year and payment IDs cannot be used",
  );
  await req("platform/support", { method: "POST", body: {} });
  await req("students", { tenant: test, cookie, status: 403 });
  checks++;
  console.log("PASS ending support access invalidates the cookie immediately");
  const users = await req(campus + "users", { email: admin });
  const customMember = users.members.find((v) => v.email === custom);
  await req(campus + "users/" + customMember.id, {
    email: admin,
    method: "PATCH",
    body: { active: false },
  });
  await req(campus + "students", { email: custom, status: 403 });
  await req(campus + "users/" + customMember.id, {
    email: admin,
    method: "PATCH",
    body: { active: true },
  });
  await req(campus + "students", { email: custom });
  checks++;
  console.log(
    "PASS disabling and re-enabling staff takes effect on every API request",
  );
  await req(campus + "users/" + customMember.id, {
    email: admin,
    method: "PATCH",
    body: {
      role: "TEACHER",
      sectionId: boot.sections[0].id,
      permissions: ["students.view", "academics.view"],
    },
  });
  await req(campus + "payments", { email: custom, status: 403 });
  checks++;
  console.log("PASS edits immediately update staff roles and permissions");
  await req(campus + "users/" + customMember.id + "/reset-access", {
    email: admin,
    method: "POST",
    body: {},
  });
  const reset = await req(campus + "bootstrap", { email: custom });
  check("reset access creates and accepts a fresh scoped email grant", () =>
    assert.equal(reset.user.role, "TEACHER"),
  );
  const billingKey = randomUUID(),
    billing = {
      institutionId: create.id,
      amount: "2500.00",
      method: "Bank Transfer",
      reference: "QA-SUBSCRIPTION",
      paidDate: "2026-10-03",
      notes: "Test confirmation only",
      idempotencyKey: billingKey,
    };
  const bill = await req("platform/payments", {
      method: "POST",
      body: billing,
    }),
    repeatBill = await req("platform/payments", {
      method: "POST",
      body: billing,
    });
  check("subscription payment recording is persisted and idempotent", () =>
    assert.equal(bill.id, repeatBill.id),
  );
  await req("platform/payments", {
    method: "POST",
    body: { ...billing, amount: "2501" },
    status: 409,
  });
  checks++;
  console.log("PASS changed subscription payment replays are rejected");
  await assert.rejects(
    () =>
      db
        .prepare("UPDATE subscription_payments SET amount_paise=1 WHERE id=?")
        .bind(bill.id)
        .run(),
    /IMMUTABLE/,
  );
  checks++;
  console.log("PASS subscription payments cannot be overwritten");
  const planInput = {
    name: "QA Custom Plan",
    code: "qa-custom",
    price: "2500.50",
    billingCycle: "Monthly",
    studentLimit: 300,
    userLimit: 12,
    modules: [
      "students",
      "academics",
      "fees",
      "payments",
      "receipts",
      "reports",
      "users",
      "settings",
    ],
    status: "Active",
  };
  const createdPlan = await req("platform/plans", {
    method: "POST",
    body: planInput,
  });
  await req("platform/plans/" + createdPlan.id, {
    method: "PATCH",
    body: { ...planInput, name: "QA Edited Plan" },
  });
  const savedPlan = (await req("platform/plans")).rows.find(
    (v) => v.id === createdPlan.id,
  );
  check("plans can be created and edited with exact monetary prices", () => {
    assert.equal(savedPlan.name, "QA Edited Plan");
    assert.equal(savedPlan.price_paise, 250050);
  });
  const details = await req("platform/institutions/" + create.id),
    sub = {
      planId: details.subscription.plan_id,
      status: "Active",
      startDate: details.subscription.start_date,
      endDate: details.subscription.end_date,
      studentLimit: 1,
      userLimit: details.usage.users + details.usage.pendingUsers,
      modules: details.subscription.modules,
    };
  await req("platform/institutions/" + create.id + "/subscription", {
    method: "PATCH",
    body: sub,
  });
  await req(campus + "students", {
    email: admin,
    method: "POST",
    body: {
      name: "Over quota",
      admissionNumber: "GV/2026/0002",
      yearId: boot.years[0].id,
      sectionId: boot.sections[0].id,
      parentName: "Guardian",
      mobile: "9876543210",
    },
    status: 409,
  });
  await req(campus + "users/invite", {
    email: admin,
    method: "POST",
    body: {
      email: "extra@green-valley.example.test",
      fullName: "Extra User",
      role: "ACCOUNTANT",
    },
    status: 409,
  });
  checks++;
  console.log("PASS student and staff limits are enforced on API writes");
  await assert.rejects(
    () =>
      db
        .prepare(
          "INSERT INTO students(id,institution_id,admission_number,name,admission_date,status,created_at,updated_at,created_by,updated_by) VALUES (?,?,?,'Direct quota attempt','2026-06-01','Active',?,?,?,?)",
        )
        .bind(
          randomUUID(),
          create.id,
          "DIRECT/OVER",
          new Date().toISOString(),
          new Date().toISOString(),
          login.user.userId,
          login.user.userId,
        )
        .run(),
    /STUDENT_LIMIT_REACHED/,
  );
  checks++;
  console.log("PASS database quota guard prevents bypass and bulk overrun");
  await req("platform/institutions/" + create.id + "/subscription", {
    method: "PATCH",
    body: { ...sub, studentLimit: 2 },
  });
  const bulkRows = [1, 2].map((n) => ({
    name: "Bulk quota " + n,
    admissionNumber: "GV/BULK/" + n,
    className: boot.sections[0].class_name,
    sectionName: boot.sections[0].name,
    streamName: boot.sections[0].stream_name || "",
    parentName: "Guardian",
    mobile: "9876543210",
  }));
  await req(campus + "imports", {
    email: admin,
    method: "POST",
    body: {
      kind: "students",
      yearId: boot.years[0].id,
      rows: bulkRows,
      commit: true,
    },
    status: 409,
  });
  const afterBulk = await req(campus + "students", { email: admin });
  check("bulk imports exceeding capacity roll back every row", () =>
    assert.equal(afterBulk.total, 1),
  );
  await req("platform/institutions/" + create.id + "/subscription", {
    method: "PATCH",
    body: { ...sub, status: "Expired" },
  });
  await req(campus + "students", { email: admin });
  await req(campus + "students", {
    email: admin,
    method: "POST",
    body: { name: "Expired write" },
    status: 403,
  });
  checks++;
  console.log(
    "PASS expired subscriptions retain readable history and reject new activity",
  );
  const scheduledExpired = await req("jobs/scheduled", {
    method: "POST",
    body: { institutionId: create.id },
    extra: { authorization: "Bearer " + secret },
  });
  check(
    "scheduled jobs skip expired subscriptions without posting charges",
    () => assert.equal(scheduledExpired.skipped, true),
  );

  await req("platform/institutions/" + create.id + "/subscription", {
    method: "PATCH",
    body: { ...sub, modules: sub.modules.filter((v) => v !== "reports") },
  });
  await req(campus + "reports/collections", { email: admin, status: 403 });
  checks++;
  console.log("PASS plan modules are enforced at the backend");
  const domain = await req("platform/institutions/" + create.id + "/domain", {
    method: "POST",
    body: { hostname: "fees.greenvalley.invalid" },
  });
  check("custom domains stay pending with exact DNS instructions", () => {
    assert.equal(domain.status, "Pending Verification");
    assert.equal(domain.sslStatus, "Pending Provisioning");
    assert.equal(domain.dns.length, 2);
    assert.equal(domain.provisioningAvailable, false);
  });
  await req("platform/institutions/" + create.id + "/domain", {
    method: "POST",
    body: { hostname: "https://127.0.0.1/private" },
    status: 422,
  });
  checks++;
  console.log(
    "PASS domain input cannot contain protocols, paths or private IP targets",
  );
  const pa = await req("platform/audit");
  check("support actions are recorded in platform audit history", () =>
    assert.ok(
      pa.rows.some((v) => v.action === "Started institution support access"),
    ),
  );
  await assert.rejects(
    () => db.prepare("UPDATE platform_audit_logs SET action='Tampered'").run(),
    /IMMUTABLE/,
  );
  checks++;
  console.log("PASS platform audit records are immutable");
  const expiring = await req("platform/institutions/" + test + "/support", {
      method: "POST",
      body: { reason: "Verify support expiration" },
      raw: true,
    }),
    expiredCookie = expiring.headers.get("set-cookie").split(";")[0];
  await db
    .prepare(
      "UPDATE support_sessions SET expires_at='2000-01-01T00:00:00.000Z' WHERE user_id=? AND ended_at IS NULL",
    )
    .bind(login.user.userId)
    .run();
  await req("students", { tenant: test, cookie: expiredCookie, status: 403 });
  checks++;
  console.log("PASS expired support sessions cannot read institution data");
  await db
    .prepare(
      "UPDATE institutions SET institution_code='GV-ORIGINAL-TEST' WHERE id=?",
    )
    .bind(create.id)
    .run();
  const serviceUpgrade = await req("jobs/saas-upgrade", {
    method: "POST",
    body: { createValidationInstitution: true },
    extra: { authorization: "Bearer " + secret },
  });
  check(
    "bounded service upgrade provisions validation data through real fee operations",
    () => {
      assert.notEqual(serviceUpgrade.validation.id, create.id);
      assert.ok(serviceUpgrade.validation.receiptId);
    },
  );
  const serviceReplay = await req("jobs/saas-upgrade", {
    method: "POST",
    body: { createValidationInstitution: true },
    extra: { authorization: "Bearer " + secret },
  });
  check(
    "repeating the validation provisioner does not duplicate institutions",
    () =>
      assert.equal(serviceReplay.validation.id, serviceUpgrade.validation.id),
  );
  const after = await db
    .prepare(
      "SELECT id,net_paise FROM invoices WHERE institution_id=? ORDER BY id",
    )
    .bind(test)
    .all();
  check(
    "migration and second-tenant operations preserve original invoice IDs and amounts",
    () => assert.deepEqual(after.results, snapshot.results),
  );
  const createdPlans = await req("platform/plans");
  check("platform plan management persists normalized configuration", () =>
    assert.equal(createdPlans.rows.length, 4),
  );
  const platformBrand = await req("platform/settings");
  check("platform settings use Sohan Soft Tech branding", () =>
    assert.equal(platformBrand.settings.platformName, "Sohan Soft Tech"),
  );
  // The section links now load complete documents instead of catch-all RSC
  // transitions. Exercise every destination against the built Worker.
  const routes = [
    "/admin",
    "/admin/institutions",
    "/admin/institutions/new",
    "/admin/institutions/" + test,
    ...[
      "plans",
      "subscriptions",
      "payments",
      "domains",
      "usage",
      "audit",
      "settings",
    ].map((p) => "/admin/" + p),
    ...[
      "",
      "students",
      "academic/years",
      "academic/classes",
      "academic/sections",
      "fees",
      "collect-fees",
      "invoices",
      "payments",
      "receipts",
      "outstanding",
      "reports",
      "users",
      "settings",
    ].map((p) => "/campus/campusledger-test-school/" + p),
  ];
  for (const path of routes) {
    const response = await mf.dispatchFetch("https://campus.test" + path);
    const html = await response.text();
    check("direct section navigation renders " + path, () => {
      assert.equal(response.status, 200);
      assert.match(response.headers.get("content-type"), /text\/html/);
      assert.match(html, /Sohan Soft Tech/);
      assert.doesNotMatch(html, /parent portal/);
    });
  }
  console.log("SaaS checks passed:", checks);
} finally {
  await mf.dispose();
}
```
