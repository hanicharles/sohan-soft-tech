import { env } from "cloudflare:workers";
export type Row = Record<string, any>;
export function database(): D1Database {
  if (!env.DB) throw new Error("Database unavailable");
  return env.DB;
}
export const stmt = (sql: string, values: unknown[] = []) =>
  database()
    .prepare(sql)
    .bind(...values.map((v) => (v === undefined ? null : v)));
export async function all<T = Row>(
  sql: string,
  values: unknown[] = [],
): Promise<T[]> {
  return (await stmt(sql, values).all<T>()).results;
}
export async function one<T = Row>(
  sql: string,
  values: unknown[] = [],
): Promise<T | null> {
  return await stmt(sql, values).first<T>();
}
export const run = (sql: string, values: unknown[] = []) =>
  stmt(sql, values).run();
export const batch = (statements: D1PreparedStatement[]) =>
  database().batch(statements);
export function insert(table: string, data: Row): D1PreparedStatement {
  const keys = Object.keys(data);
  if (
    !/^[a-z_][a-z0-9_]*$/.test(table) ||
    keys.some((k) => !/^[a-z_][a-z0-9_]*$/.test(k))
  )
    throw new Error("Invalid database identifier");
  return stmt(
    `INSERT INTO ${table} (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")})`,
    keys.map((k) => data[k]),
  );
}
export const uuid = () => crypto.randomUUID();
export const now = () => new Date().toISOString();
export const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export const stamps = (user: string, date = now()) => ({
  created_at: date,
  updated_at: date,
  created_by: user,
  updated_by: user,
});
