import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url),
  runtime = createRequire(require.resolve("wrangler")),
  { build } = runtime("esbuild"),
  { Miniflare } = runtime("miniflare");
const built = await build({
  stdin: {
    contents: `import {getDb} from './db/index.ts';import {withTenantContext} from './server/tenant-context.ts';import {sqliteTable,text} from 'drizzle-orm/sqlite-core';import {eq,sql} from 'drizzle-orm';const rows=sqliteTable('records',{id:text('id').primaryKey(),institutionId:text('institution_id'),name:text('name')});export default{async fetch(request){try{const input=await request.json(),actor={institutionId:input.tenant,userId:'test'};const action=async()=>{const db=getDb();if(input.op==='create')return db.insert(rows,input.row);if(input.op==='update')return db.update(rows,{name:'Edited'},eq(rows.id,input.id));if(input.op==='delete')return db.delete(rows,eq(rows.id,input.id));return db.select(rows,{where:input.id?eq(rows.id,input.id):sql\`1=1 OR 1=1\`,limit:10000});};return Response.json(input.tenant?await withTenantContext(actor,action):await action());}catch(e){return Response.json({error:e.message},{status:403});}}}`,
    resolveDir: process.cwd(),
  },
  bundle: true,
  format: "esm",
  platform: "neutral",
  external: ["cloudflare:workers", "node:async_hooks"],
  write: false,
  logLevel: "silent",
});
const mf = new Miniflare({
  script: built.outputFiles[0].text,
  modules: true,
  compatibilityDate: "2026-05-15",
  compatibilityFlags: ["nodejs_compat"],
  d1Databases: { DB: "isolation" },
});
try {
  const db = await mf.getD1Database("DB");
  await db
    .prepare(
      "CREATE TABLE records(id TEXT PRIMARY KEY,institution_id TEXT,name TEXT)",
    )
    .run();
  await db
    .prepare(
      "INSERT INTO records VALUES('a1','A','School A'),('b1','B','School B')",
    )
    .run();
  const call = async (body) => {
    const r = await mf.dispatchFetch("https://test/", {
      method: "POST",
      body: JSON.stringify(body),
    });
    return { status: r.status, data: await r.json() };
  };
  assert.equal((await call({})).status, 403);
  const [a, b] = await Promise.all([
    call({ tenant: "A" }),
    call({ tenant: "B" }),
  ]);
  assert.deepEqual(
    a.data.map((r) => r.id),
    ["a1"],
  );
  assert.deepEqual(
    b.data.map((r) => r.id),
    ["b1"],
  );
  assert.deepEqual((await call({ tenant: "A", id: "b1" })).data, []);
  assert.deepEqual(
    (await call({ tenant: "A", id: "b1", op: "update" })).data,
    [],
  );
  assert.deepEqual(
    (await call({ tenant: "A", id: "b1", op: "delete" })).data,
    [],
  );
  assert.equal(
    (
      await call({
        tenant: "A",
        op: "create",
        row: { id: "x", institutionId: "B", name: "blocked" },
      })
    ).status,
    403,
  );
  await call({
    tenant: "A",
    op: "create",
    row: { id: "a2", name: "Injected tenant" },
  });
  assert.equal(
    (
      await db
        .prepare("SELECT institution_id FROM records WHERE id='a2'")
        .first()
    ).institution_id,
    "A",
  );
  assert.equal(
    (await db.prepare("SELECT name FROM records WHERE id='b1'").first()).name,
    "School B",
  );
  console.log(
    "PASS Drizzle requires tenant context; injects tenant on insert; protects select, update, delete and concurrent requests",
  );
} finally {
  await mf.dispose();
}
