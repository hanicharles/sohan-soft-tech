import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { mkdtemp, rm } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
const require = createRequire(import.meta.url),
  { build } = createRequire(require.resolve("wrangler"))("esbuild");
const temp = await mkdtemp(resolve(tmpdir(), "sohan-refactor-"));
await build({
  entryPoints: [
    "lib/fee-rules.ts",
    "lib/cash.ts",
    "lib/upi.ts",
    "lib/permissions.ts",
    "lib/import-preflight.ts",
    "server/tenant-context.ts",
  ],
  outdir: temp,
  bundle: true,
  format: "esm",
  platform: "node",
  outExtension: { ".js": ".mjs" },
  logLevel: "silent",
});
const load = (name) => import(pathToFileURL(resolve(temp, name + ".mjs")));
const { evaluateFeeRules, accrueLateFee } = await load("lib/fee-rules"),
  { countedCash } = await load("lib/cash"),
  { upiPaymentUri } = await load("lib/upi"),
  { normalizedPermissions } = await load("lib/permissions"),
  { parseCsvPreflight, initialMapping, preflightRows } = await load(
    "lib/import-preflight",
  ),
  { withTenantContext, currentTenant } = await load("server/tenant-context");
const rule = {
  id: "sibling",
  name: "Sibling discount",
  kind: "Discount",
  eligibility: "Sibling",
  calculation: "Percentage",
  value: 1000,
};
test("sibling rule needs at least two active children and preserves every paise", () => {
  const context = {
    items: [{ componentId: "tuition", amountPaise: 10001 }],
    siblingCount: 1,
  };
  assert.equal(evaluateFeeRules(context, [rule]).discount, 0);
  assert.equal(
    evaluateFeeRules({ ...context, siblingCount: 2 }, [rule]).discount,
    1000,
  );
});
test("overlapping rules cannot over-discount the component or invoice", () => {
  const result = evaluateFeeRules(
    {
      items: [
        { componentId: "tuition", amountPaise: 101 },
        { componentId: "lab", amountPaise: 20 },
      ],
      siblingCount: 2,
    },
    [
      { ...rule, componentId: "lab", value: 10000 },
      { ...rule, id: "second", componentId: "lab", value: 10000 },
    ],
  );
  assert.equal(result.discount, 20);
  assert.equal(result.net, 101);
});
test("late-fee accrual posts only the additional uncharged amount", () => {
  const policy = { mode: "Daily", value: 50, graceDays: 1, maxPaise: 1000 };
  assert.equal(
    accrueLateFee(50000, "2026-10-01", "2026-10-05", policy, 100),
    50,
  );
  assert.equal(
    accrueLateFee(50000, "2026-10-01", "2026-11-30", policy, 1000),
    0,
  );
});
test("cash counters reject fractional counts, unknown denominations and negatives", () => {
  assert.equal(countedCash({ 500: 2, 20: 3, 1: 1 }), 106100);
  for (const value of [{ 500: -1 }, { 3: 10 }, { 20: 0.5 }])
    assert.throws(() => countedCash(value));
});
test("UPI requests encode exact INR amounts and untrusted names as URL parameters", () => {
  const uri = upiPaymentUri(
    "school@bank",
    "School & Academy",
    10001,
    "INV/2026/001",
  );
  const u = new URL(uri);
  assert.equal(u.searchParams.get("am"), "100.01");
  assert.equal(u.searchParams.get("cu"), "INR");
  assert.equal(u.searchParams.get("pn"), "School & Academy");
  assert.throws(() => upiPaymentUri("invalid", "Name", 100, "id"));
  assert.throws(() => upiPaymentUri("school@bank", "Name", 0, "id"));
});
test("cashier and auditor role ceilings cannot be widened through custom grants", () => {
  const cashier = normalizedPermissions("FEE_COUNTER_CASHIER", [
    "settings.manage",
    "refunds.approve",
  ]);
  assert.ok(cashier.includes("payments.collect"));
  assert.ok(!cashier.includes("payments.manage"));
  assert.ok(!cashier.includes("fees.manage"));
  assert.deepEqual(normalizedPermissions("AUDITOR", ["users.manage"]), [
    "reports.view",
    "reports.export",
  ]);
  assert.deepEqual(normalizedPermissions("SUPER_ADMIN"), []);
});
test("CSV handles quoted cells, column mapping and duplicate admission numbers", () => {
  const source = parseCsvPreflight(
    'admission_number,name,className,parentName,mobile,email\n001,"Rao, A",10th,Rao,9876543210,a@example.test\n001,B,10th,Rao,123,bad\n',
  );
  const rows = preflightRows(
    "students",
    source.headers,
    source.matrix,
    initialMapping("students", source.headers),
  );
  assert.equal(rows[0].value.name, "Rao, A");
  assert.equal(rows[0].errors.length, 0);
  assert.ok(
    rows[1].errors.some((e) => e.includes("Duplicate admission_number")),
  );
  assert.ok(rows[1].errors.some((e) => e.includes("mobile")));
  assert.throws(() => parseCsvPreflight("name,name\na,b"));
});
test("tenant context rejects absent and nested foreign tenants and survives concurrent awaits", async () => {
  assert.throws(() => currentTenant());
  await Promise.all(
    ["institution-a", "institution-b"].map((institutionId) =>
      withTenantContext({ institutionId, userId: "u" }, async () => {
        await Promise.resolve();
        assert.equal(currentTenant().institutionId, institutionId);
        assert.throws(() =>
          withTenantContext({ institutionId: "other", userId: "u" }, () => {}),
        );
      }),
    ),
  );
  assert.throws(() => currentTenant());
});
await rm(temp, { recursive: true, force: true });
