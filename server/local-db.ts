import { env } from "cloudflare:workers";
import { LOCAL_MIGRATIONS } from "./local-migrations";

let initialization: Promise<void> | null = null;

/**
 * The Vite/Cloudflare dev preview creates a fresh local D1 database but does
 * not automatically run this application's Drizzle migrations. In development
 * only, initialize that database once before any API route touches it.
 * Production deployments are migrated by the deployment pipeline and never
 * execute this path.
 */
export async function ensureLocalDatabase() {
  if (!import.meta.env.DEV || !env.DB) return;
  if (!initialization) initialization = initialize();
  await initialization;
}

async function initialize() {
  const db = env.DB;
  const existing = await db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'")
    .first();
  if (existing) return;

  for (const migration of LOCAL_MIGRATIONS) {
    const statements = migration
      .split("--> statement-breakpoint")
      .map((statement) => statement.trim())
      .filter(Boolean);
    for (const statement of statements) {
      await db.prepare(statement).run();
    }
  }
}
