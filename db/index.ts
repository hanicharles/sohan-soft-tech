import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import { and, eq, sql, SQL } from "drizzle-orm";
import { AnySQLiteTable } from "drizzle-orm/sqlite-core";
import { currentTenant } from "../server/tenant-context";

type TenantTable = AnySQLiteTable & { institutionId: any };
// Deliberately expose only bounded, tenant-scoped operations. Returning raw
// Drizzle builders would let a subsequent .where() replace the tenant predicate.
// No raw SQL/execute/query escape hatch is exposed to institution routes.
export function getDb() {
  const { institutionId } = currentTenant();
  if (!env.DB) throw new Error("Database is unavailable");
  const db = drizzle(env.DB);
  const scope = (table: TenantTable, where?: SQL) => {
    if (!table.institutionId)
      throw new Error("Global tables are unavailable in a tenant database");
    if (currentTenant().institutionId !== institutionId)
      throw new Error("Tenant context cannot be switched");
    return where
      ? and(eq(table.institutionId, institutionId), sql`(${where})`)
      : eq(table.institutionId, institutionId);
  };
  const values = (row: Record<string, unknown>) => {
    if (row.institutionId !== undefined && row.institutionId !== institutionId)
      throw new Error("Tenant ID cannot be overridden");
    return { ...row, institutionId };
  };
  return Object.freeze({
    async select(
      table: TenantTable,
      options: {
        where?: SQL;
        limit?: number;
        offset?: number;
        orderBy?: SQL;
      } = {},
    ) {
      let q = db
        .select()
        .from(table)
        .where(scope(table, options.where))
        .limit(Math.min(100, Math.max(1, options.limit || 25)))
        .offset(Math.max(0, options.offset || 0))
        .$dynamic();
      if (options.orderBy) q = q.orderBy(options.orderBy);
      return q.all();
    },
    async insert(table: TenantTable, row: Record<string, unknown>) {
      scope(table);
      return db
        .insert(table)
        .values(values(row) as any)
        .returning();
    },
    async update(table: TenantTable, row: Record<string, unknown>, where: SQL) {
      if (!where) throw new Error("An update predicate is required");
      if (
        row.institutionId !== undefined &&
        row.institutionId !== institutionId
      )
        throw new Error("Tenant ID cannot be overridden");
      const { institutionId: ignored, ...changes } = row;
      return db
        .update(table)
        .set(changes)
        .where(scope(table, where))
        .returning();
    },
    async delete(table: TenantTable, where: SQL) {
      if (!where) throw new Error("A delete predicate is required");
      return db.delete(table).where(scope(table, where)).returning();
    },
  });
}
