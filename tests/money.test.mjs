import test from "node:test";
import assert from "node:assert/strict";
import {
  parseMoney,
  percentage,
  splitMoney,
  lateFee,
  safeMoney,
  apportionMoney,
} from "../lib/money.ts";
import { parseCsv, xlsx, parseXlsx, csv } from "../lib/tabular.ts";
test("decimal input is parsed to exact integer paise", () => {
  assert.equal(parseMoney("0.29"), 29);
  assert.equal(parseMoney("60000.01"), 6000001);
  assert.equal(parseMoney("1234567890.99"), 123456789099);
  for (const bad of ["-1", "1.001", "NaN", "1e3", "Infinity", 1.2])
    assert.throws(() => parseMoney(bad));
});
test("discount and scholarship percentages round deterministically", () => {
  assert.equal(percentage(5000000, 1000), 500000);
  assert.equal(percentage(5000000, 2500), 1250000);
  assert.equal(percentage(101, 5000), 51);
  assert.throws(() => percentage(100, 10001));
});
test("custom installments conserve every paise", () => {
  for (const total of [1, 29, 5800000, 6000001])
    for (const count of [1, 2, 3, 12]) {
      const split = splitMoney(total, count);
      assert.equal(
        split.reduce((s, n) => s + n, 0),
        total,
      );
      assert.ok(Math.max(...split) - Math.min(...split) <= 1);
    }
});
test("partial and multiple collections leave exact balances", () => {
  let due = parseMoney("20000");
  due -= parseMoney("8000");
  assert.equal(due, 1200000);
  due -= parseMoney("11999.99");
  assert.equal(due, 1);
  due -= parseMoney("0.01");
  assert.equal(due, 0);
});
test("late fees respect grace periods, daily rates, caps and prior postings", () => {
  const rule = { mode: "Fixed", value: 10000, graceDays: 7, maxPaise: 200000 };
  assert.equal(lateFee(100000, "2026-09-10", "2026-09-17", rule), 0);
  assert.equal(lateFee(100000, "2026-09-10", "2026-09-18", rule), 10000);
  assert.equal(lateFee(100000, "2026-09-10", "2026-09-18", rule, 10000), 0);
  assert.equal(
    lateFee(100000, "2026-09-10", "2026-10-03", {
      ...rule,
      mode: "Daily",
      value: 5000,
      maxPaise: 20000,
    }),
    20000,
  );
  assert.equal(
    lateFee(100000, "2026-09-01", "2026-10-03", {
      ...rule,
      mode: "Percentage",
      value: 200,
      graceDays: 0,
    }),
    4000,
  );
});
test("unsafe integers are rejected", () =>
  assert.throws(() => safeMoney(Number.MAX_SAFE_INTEGER)));
test("component allocations conserve paise with integer proportions", () => {
  assert.deepEqual(apportionMoney(101, [1, 1, 1]), [34, 34, 33]);
  assert.deepEqual(
    apportionMoney(800000, [4000000, 500000, 200000]),
    [680851, 85106, 34043],
  );
  for (const amount of [1, 29, 999999999999])
    assert.equal(
      apportionMoney(amount, [4000000, 500000, 200000]).reduce(
        (s, n) => s + n,
        0,
      ),
      amount,
    );
});
test("CSV handles quoted commas, line breaks, quotes and row errors", () => {
  assert.deepEqual(
    parseCsv(
      'name,notes\r\n"Aarav Rao","contains, comma"\r\n"Diya","say ""hi"""',
    ),
    [
      ["name", "notes"],
      ["Aarav Rao", "contains, comma"],
      ["Diya", 'say "hi"'],
    ],
  );
  assert.throws(() => parseCsv('"unfinished'));
  assert.ok(csv([["=SUM(A1)"]]).includes("'=SUM"));
});
test("Excel exports round-trip names and monetary decimal strings", () => {
  const rows = [
    ["Student", "Amount"],
    ["Rahul Kumar", "8000.01"],
    ["Aarav & Diya", "20000"],
  ];
  assert.deepEqual(parseXlsx(xlsx(rows)), rows);
});
