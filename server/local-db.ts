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

async function devHmacSha256(secret: string, data: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    enc.encode("sohan-pwd-salt-v1:" + data),
  );
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function initialize() {
  const db = env.DB;
  if (!db) return;

  const hasCredentials = await db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='user_credentials'",
    )
    .first();

  const hasDepartments = await db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='departments'",
    )
    .first();

  if (!hasCredentials || !hasDepartments) {
    for (const migration of LOCAL_MIGRATIONS) {
      const statements = migration
        .split("--> statement-breakpoint")
        .map((statement) => statement.trim())
        .filter(Boolean);
      for (const statement of statements) {
        try {
          await db.prepare(statement).run();
        } catch (err: any) {
          const msg = String(err?.message || err);
          if (
            !msg.includes("already exists") &&
            !msg.includes("duplicate column")
          ) {
            console.warn("Dev migration statement notice:", msg);
          }
        }
      }
    }
  }

  // Ensure demo accounts and credentials exist in dev mode
  try {
    await seedDevDefaults(db);
  } catch (err) {
    console.warn("Dev default seed warning:", err);
  }
}

async function seedDevDefaults(db: any) {
  const institutions = await db
    .prepare("SELECT id, name, slug FROM institutions")
    .all();
  const instRows: Array<{ id: string; name: string; slug: string }> =
    institutions?.results || [];

  const nowIso = new Date().toISOString();

  // Demo accounts specification
  const demoUsers = [
    {
      username: "superadmin",
      email: "superadmin@sst.com",
      name: "Super Administrator",
      role: "SUPER_ADMIN",
      pwd: "SuperAdmin@123",
    },
    {
      username: "admin",
      email: "admin@sst.com",
      name: "Institution Administrator",
      role: "INSTITUTION_ADMIN",
      pwd: "Admin@123",
    },
    {
      username: "principal",
      email: "principal@sst.com",
      name: "Dr. Arvind Principal",
      role: "PRINCIPAL",
      pwd: "Principal@123",
    },
    {
      username: "faculty",
      email: "faculty@sst.com",
      name: "Prof. Sunita Sharma",
      role: "FACULTY",
      pwd: "Faculty@123",
    },
    {
      username: "student",
      email: "student@sst.com",
      name: "Aarav Kumar (Student)",
      role: "STUDENT",
      pwd: "Student@123",
    },
    {
      username: "parent",
      email: "parent@sst.com",
      name: "Rajesh Kumar (Parent)",
      role: "PARENT",
      pwd: "Parent@123",
    },
    {
      username: "accountant",
      email: "accountant@sst.com",
      name: "Mahesh Accountant",
      role: "ACCOUNTANT",
      pwd: "Accountant@123",
    },
    {
      username: "staff",
      email: "staff@sst.com",
      name: "Pooja Staff",
      role: "STAFF",
      pwd: "Staff@123",
    },
  ];

  for (const du of demoUsers) {
    // 1. Ensure user exists
    let existingUser = await db
      .prepare("SELECT id FROM users WHERE lower(email)=lower(?)")
      .bind(du.email)
      .first();

    let userId = existingUser?.id;
    if (!userId) {
      userId = "demo-" + du.username + "-id";
      await db
        .prepare(
          "INSERT OR IGNORE INTO users(id, email, name, created_at, updated_at, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(userId, du.email, du.name, nowIso, nowIso, "system", "system")
        .run();
    }

    // 2. Ensure credentials exist
    const salt = "salt-" + du.username;
    const pwdHash = await devHmacSha256(salt, du.pwd);
    await db
      .prepare(
        `INSERT INTO user_credentials(user_id, username, password_hash, salt, failed_attempts, active, created_at, updated_at)
         VALUES (?, ?, ?, ?, 0, 1, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET username=excluded.username, password_hash=excluded.password_hash, salt=excluded.salt, active=1`,
      )
      .bind(userId, du.username, pwdHash, salt, nowIso, nowIso)
      .run();

    // 3. If superadmin, add to platform_admins
    if (du.role === "SUPER_ADMIN") {
      await db
        .prepare(
          "INSERT OR IGNORE INTO platform_admins(user_id, active, created_at, updated_at, created_by, updated_by) VALUES (?, 1, ?, ?, ?, ?)",
        )
        .bind(userId, nowIso, nowIso, "system", "system")
        .run();
    }

    // 4. For institutional roles, link to all active institutions
    if (du.role !== "SUPER_ADMIN") {
      for (const inst of instRows) {
        const sampleStudent = await db
          .prepare(
            "SELECT id FROM students WHERE institution_id=? ORDER BY created_at LIMIT 1",
          )
          .bind(inst.id)
          .first();
        const sampleParent = await db
          .prepare(
            "SELECT id FROM parents WHERE institution_id=? ORDER BY created_at LIMIT 1",
          )
          .bind(inst.id)
          .first();

        const studentId =
          du.role === "STUDENT" ? sampleStudent?.id || null : null;
        const parentId = du.role === "PARENT" ? sampleParent?.id || null : null;

        await db
          .prepare(
            `INSERT INTO memberships(id, institution_id, user_id, role, display_name, active, student_id, parent_id, permissions, created_at, updated_at, created_by, updated_by)
             VALUES (?, ?, ?, ?, ?, 1, ?, ?, '[]', ?, ?, ?, ?)
             ON CONFLICT(institution_id, user_id) DO UPDATE SET role=excluded.role, student_id=excluded.student_id, parent_id=excluded.parent_id, active=1`,
          )
          .bind(
            "mem-" + du.username + "-" + inst.id.slice(0, 8),
            inst.id,
            userId,
            du.role,
            du.name,
            studentId,
            parentId,
            nowIso,
            nowIso,
            "system",
            "system",
          )
          .run();
      }
    }
  }
}

