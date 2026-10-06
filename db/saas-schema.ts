import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { institutions, users } from "./schema";
const stamps = {
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  createdBy: text("created_by").notNull(),
  updatedBy: text("updated_by").notNull(),
};
export const platformAdmins = sqliteTable("platform_admins", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id),
  active: integer("active").notNull().default(1),
  ...stamps,
});
export const plans = sqliteTable("saas_plans", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  code: text("code").notNull().unique(),
  pricePaise: integer("price_paise").notNull(),
  billingCycle: text("billing_cycle").notNull(),
  studentLimit: integer("student_limit").notNull(),
  userLimit: integer("user_limit").notNull(),
  modules: text("modules").notNull(),
  status: text("status").notNull().default("Active"),
  ...stamps,
});
export const subscriptions = sqliteTable(
  "institution_subscriptions",
  {
    id: text("id").primaryKey(),
    institutionId: text("institution_id")
      .notNull()
      .unique()
      .references(() => institutions.id),
    planId: text("plan_id")
      .notNull()
      .references(() => plans.id),
    status: text("status").notNull(),
    startDate: text("start_date").notNull(),
    endDate: text("end_date").notNull(),
    studentLimit: integer("student_limit").notNull(),
    userLimit: integer("user_limit").notNull(),
    modules: text("modules").notNull(),
    ...stamps,
  },
  (t) => [index("subscription_expiry").on(t.status, t.endDate)],
);
export const domains = sqliteTable("institution_domains", {
  id: text("id").primaryKey(),
  institutionId: text("institution_id")
    .notNull()
    .unique()
    .references(() => institutions.id),
  hostname: text("hostname").notNull().unique(),
  verificationToken: text("verification_token").notNull(),
  status: text("status").notNull().default("Pending Verification"),
  verificationStatus: text("verification_status")
    .notNull()
    .default("Pending Verification"),
  sslStatus: text("ssl_status").notNull().default("Pending Provisioning"),
  lastCheckedAt: text("last_checked_at"),
  dnsMessage: text("dns_message"),
  ...stamps,
});
export const supportSessions = sqliteTable(
  "support_sessions",
  {
    id: text("id").primaryKey(),
    institutionId: text("institution_id")
      .notNull()
      .references(() => institutions.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    tokenHash: text("token_hash").notNull().unique(),
    reason: text("reason").notNull(),
    expiresAt: text("expires_at").notNull(),
    endedAt: text("ended_at"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    index("support_session_user").on(t.userId, t.institutionId, t.expiresAt),
  ],
);
export const platformAudit = sqliteTable(
  "platform_audit_logs",
  {
    id: text("id").primaryKey(),
    institutionId: text("institution_id").references(() => institutions.id),
    userId: text("user_id").notNull(),
    userName: text("user_name").notNull(),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: text("entity_id").notNull(),
    oldValue: text("old_value"),
    newValue: text("new_value"),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("platform_audit_date").on(t.createdAt)],
);
export const subscriptionPayments = sqliteTable(
  "subscription_payments",
  {
    id: text("id").primaryKey(),
    institutionId: text("institution_id")
      .notNull()
      .references(() => institutions.id),
    subscriptionId: text("subscription_id")
      .notNull()
      .references(() => subscriptions.id),
    amountPaise: integer("amount_paise").notNull(),
    method: text("method").notNull(),
    reference: text("reference").notNull(),
    paidDate: text("paid_date").notNull(),
    notes: text("notes").notNull().default(""),
    idempotencyKey: text("idempotency_key").notNull(),
    requestHash: text("request_hash").notNull(),
    ...stamps,
  },
  (t) => [
    uniqueIndex("subscription_payment_idempotency").on(
      t.institutionId,
      t.idempotencyKey,
    ),
    index("subscription_payment_date").on(t.paidDate),
  ],
);
