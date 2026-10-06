import assert from "node:assert/strict";
import { test } from "node:test";
import { useRouter } from "../lib/browser-navigation.ts";
import {
  readNavigationFilters,
  saveNavigationFilters,
} from "../lib/navigation-filters.ts";

test("section buttons use full document navigation, including query strings and history replacement", () => {
  const calls = [];
  globalThis.window = {
    location: {
      href: "https://school.test/admin",
      origin: "https://school.test",
      assign: (url) => calls.push(["assign", url]),
      replace: (url) => calls.push(["replace", url]),
    },
  };
  const router = useRouter();
  for (const path of [
    "/admin/institutions",
    "/admin/plans",
    "/admin/institutions/new",
    "/campus/test-school/students",
    "/campus/test-school/fees?new=1",
    "/campus/test-school/receipts",
  ])
    router.push(path);
  router.replace("/admin");
  assert.equal(calls.length, 7);
  assert.deepEqual(calls[4], [
    "assign",
    "https://school.test/campus/test-school/fees?new=1",
  ]);
  assert.deepEqual(calls[6], ["replace", "https://school.test/admin"]);
  assert.throws(() => router.push("javascript:alert(1)"));
  assert.throws(() => router.push("https://another-school.test/admin"));
  delete globalThis.window;
});

test("academic filters survive section navigation without crossing user or institution boundaries", () => {
  const values = new Map();
  globalThis.sessionStorage = {
    getItem: (key) => values.get(key),
    setItem: (key, value) => values.set(key, value),
  };
  const scope = {
    year: "2026",
    campus: "main",
    class: "10",
    section: "A",
    stream: "",
    from: "2026-06-01",
    to: "2027-05-31",
  };
  saveNavigationFilters("school-a", "user-a", scope);
  assert.deepEqual(readNavigationFilters("school-a", "user-a"), scope);
  assert.equal(readNavigationFilters("school-b", "user-a"), null);
  assert.equal(readNavigationFilters("school-a", "user-b"), null);
  values.set("fee-filters:user-a:school-a", "invalid json");
  assert.equal(readNavigationFilters("school-a", "user-a"), null);
  delete globalThis.sessionStorage;
  assert.doesNotThrow(() => saveNavigationFilters("a", "b", scope));
  assert.equal(readNavigationFilters("a", "b"), null);
});
