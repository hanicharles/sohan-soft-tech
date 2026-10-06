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
