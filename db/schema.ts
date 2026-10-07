import { sql } from "drizzle-orm";
import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
// INR is stored as integer paise, with financial constraints in migrations.
const id = () => text("id").primaryKey();
const time = () => ({
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  createdBy: text("created_by").notNull(),
  updatedBy: text("updated_by").notNull(),
});
const tenant = () => ({
  institutionId: text("institution_id")
    .notNull()
    .references(() => institutions.id),
});
export const platform = sqliteTable("platform", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});
export const organizations = sqliteTable("organizations", {
  id: id(),
  name: text("name").notNull(),
  status: text("status").notNull().default("Active"),
  ...time(),
});
export const institutions = sqliteTable("institutions", {
  id: id(),
  organizationId: text("organization_id").references(() => organizations.id),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  address: text("address").notNull().default(""),
  email: text("email").notNull().default(""),
  phone: text("phone").notNull().default(""),
  gstin: text("gstin"),
  logoKey: text("logo_key"),
  institutionType: text("institution_type").notNull().default("School"),
  institutionCode: text("institution_code").notNull().default(""),
  city: text("city").notNull().default(""),
  state: text("state").notNull().default(""),
  pincode: text("pincode").notNull().default(""),
  website: text("website").notNull().default(""),
  subscription: text("subscription").notNull().default("Professional"),
  status: text("status").notNull().default("Active"),
  settings: text("settings").notNull().default("{}"),
  ...time(),
});
export const campuses = sqliteTable(
  "campuses",
  {
    id: id(),
    ...tenant(),
    name: text("name").notNull(),
    address: text("address").notNull().default(""),
    ...time(),
  },
  (t) => [uniqueIndex("campus_name").on(t.institutionId, t.name)],
);
export const academicYears = sqliteTable(
  "academic_years",
  {
    id: id(),
    ...tenant(),
    name: text("name").notNull(),
    startDate: text("start_date").notNull(),
    endDate: text("end_date").notNull(),
    status: text("status").notNull().default("Draft"),
    ...time(),
  },
  (t) => [uniqueIndex("year_name").on(t.institutionId, t.name)],
);
export const classes = sqliteTable(
  "classes",
  {
    id: id(),
    ...tenant(),
    name: text("name").notNull(),
    level: text("level").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    department: text("department"),
    active: integer("active").notNull().default(1),
    ...time(),
  },
  (t) => [uniqueIndex("class_name").on(t.institutionId, t.name)],
);
export const streams = sqliteTable(
  "streams",
  { id: id(), ...tenant(), name: text("name").notNull(), ...time() },
  (t) => [uniqueIndex("stream_name").on(t.institutionId, t.name)],
);
export const sections = sqliteTable(
  "sections",
  {
    id: id(),
    ...tenant(),
    academicYearId: text("academic_year_id")
      .notNull()
      .references(() => academicYears.id),
    classId: text("class_id")
      .notNull()
      .references(() => classes.id),
    campusId: text("campus_id")
      .notNull()
      .references(() => campuses.id),
    streamId: text("stream_id").references(() => streams.id),
    name: text("name").notNull(),
    capacity: integer("capacity").notNull().default(40),
    ...time(),
  },
  (t) => [
    index("section_scope").on(t.institutionId, t.academicYearId, t.classId),
  ],
);
export const parents = sqliteTable(
  "parents",
  {
    id: id(),
    ...tenant(),
    fatherName: text("father_name").notNull().default(""),
    motherName: text("mother_name").notNull().default(""),
    guardianName: text("guardian_name").notNull(),
    mobile: text("mobile").notNull(),
    alternateMobile: text("alternate_mobile"),
    email: text("email"),
    address: text("address").notNull().default(""),
    occupation: text("occupation").notNull().default(""),
    relationship: text("relationship").notNull().default("Father"),
    smsConsent: integer("sms_consent").notNull().default(0),
    ...time(),
  },
  (t) => [index("parent_contact").on(t.institutionId, t.mobile)],
);
export const students = sqliteTable(
  "students",
  {
    id: id(),
    ...tenant(),
    admissionNumber: text("admission_number").notNull(),
    name: text("name").notNull(),
    dob: text("dob"),
    gender: text("gender").notNull().default("Not specified"),
    photoKey: text("photo_key"),
    aadhaarLast4: text("aadhaar_last4"),
    bloodGroup: text("blood_group"),
    admissionDate: text("admission_date").notNull(),
    previousSchool: text("previous_school").notNull().default(""),
    status: text("status").notNull().default("Active"),
    ...time(),
  },
  (t) => [
    uniqueIndex("student_admission").on(t.institutionId, t.admissionNumber),
    index("student_name").on(t.institutionId, t.name),
  ],
);
export const studentParents = sqliteTable(
  "student_parents",
  {
    id: id(),
    ...tenant(),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id),
    parentId: text("parent_id")
      .notNull()
      .references(() => parents.id),
    primary: integer("is_primary").notNull().default(1),
  },
  (t) => [
    uniqueIndex("student_parent_link").on(
      t.institutionId,
      t.studentId,
      t.parentId,
    ),
  ],
);
export const enrollments = sqliteTable(
  "enrollments",
  {
    id: id(),
    ...tenant(),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id),
    academicYearId: text("academic_year_id")
      .notNull()
      .references(() => academicYears.id),
    sectionId: text("section_id")
      .notNull()
      .references(() => sections.id),
    rollNumber: text("roll_number"),
    clearance: text("clearance").notNull().default("Pending"),
    ...time(),
  },
  (t) => [
    uniqueIndex("student_year").on(
      t.institutionId,
      t.studentId,
      t.academicYearId,
    ),
    index("student_roll_lookup").on(t.institutionId, t.rollNumber),
    index("enrollment_scope").on(
      t.institutionId,
      t.academicYearId,
      t.sectionId,
    ),
  ],
);
export const users = sqliteTable(
  "users",
  {
    id: id(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    ...time(),
  },
  (t) => [index("user_email_lookup").on(t.email)],
);
export const memberships = sqliteTable(
  "memberships",
  {
    id: id(),
    ...tenant(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    role: text("role").notNull(),
    displayName: text("display_name").notNull().default(""),
    mobile: text("mobile").notNull().default(""),
    permissions: text("permissions").notNull().default("[]"),
    parentId: text("parent_id").references(() => parents.id),
    studentId: text("student_id").references(() => students.id),
    sectionId: text("section_id").references(() => sections.id),
    feeVisibility: integer("fee_visibility").notNull().default(0),
    active: integer("active").notNull().default(1),
    ...time(),
  },
  (t) => [
    uniqueIndex("membership_user").on(t.institutionId, t.userId),
    index("membership_user_lookup").on(t.userId, t.active),
  ],
);
export const invitations = sqliteTable(
  "invitations",
  {
    id: id(),
    ...tenant(),
    email: text("email").notNull(),
    role: text("role").notNull(),
    displayName: text("display_name").notNull().default(""),
    mobile: text("mobile").notNull().default(""),
    permissions: text("permissions").notNull().default("[]"),
    parentId: text("parent_id"),
    studentId: text("student_id"),
    sectionId: text("section_id"),
    feeVisibility: integer("fee_visibility").notNull().default(0),
    status: text("status").notNull().default("Pending"),
    ...time(),
  },
  (t) => [
    uniqueIndex("invitation_email").on(t.institutionId, t.email),
    index("invitation_email_lookup").on(t.email, t.status),
  ],
);
export const feeComponents = sqliteTable(
  "fee_components",
  {
    id: id(),
    ...tenant(),
    name: text("name").notNull(),
    category: text("category").notNull().default("Academic"),
    active: integer("active").notNull().default(1),
    sortOrder: integer("sort_order").notNull().default(0),
    ...time(),
  },
  (t) => [uniqueIndex("fee_component_name").on(t.institutionId, t.name)],
);
export const feeStructures = sqliteTable(
  "fee_structures",
  {
    id: id(),
    ...tenant(),
    academicYearId: text("academic_year_id")
      .notNull()
      .references(() => academicYears.id),
    classId: text("class_id")
      .notNull()
      .references(() => classes.id),
    sectionId: text("section_id").references(() => sections.id),
    streamId: text("stream_id").references(() => streams.id),
    name: text("name").notNull(),
    frequency: text("frequency").notNull().default("Quarterly"),
    schedule: text("schedule").notNull(),
    status: text("status").notNull().default("Active"),
    ...time(),
  },
  (t) => [
    index("structure_scope").on(t.institutionId, t.academicYearId, t.classId),
    index("fees_tenant_year_status").on(
      t.institutionId,
      t.academicYearId,
      t.status,
    ),
  ],
);
export const feeStructureItems = sqliteTable("fee_structure_items", {
  id: id(),
  ...tenant(),
  structureId: text("structure_id")
    .notNull()
    .references(() => feeStructures.id),
  componentId: text("component_id")
    .notNull()
    .references(() => feeComponents.id),
  amountPaise: integer("amount_paise").notNull(),
});
export const benefits = sqliteTable("benefits", {
  id: id(),
  ...tenant(),
  name: text("name").notNull(),
  kind: text("kind").notNull(),
  calculation: text("calculation").notNull().default("Fixed"),
  value: integer("value").notNull(),
  componentId: text("component_id").references(() => feeComponents.id),
  installmentIndex: integer("installment_index"),
  recurring: integer("recurring").notNull().default(0),
  autoApply: integer("auto_apply").notNull().default(0),
  eligibility: text("eligibility").notNull().default(""),
  validUntil: text("valid_until"),
  status: text("status").notNull().default("Active"),
  ...time(),
});
export const assignments = sqliteTable(
  "student_fee_assignments",
  {
    id: id(),
    ...tenant(),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id),
    academicYearId: text("academic_year_id")
      .notNull()
      .references(() => academicYears.id),
    structureId: text("structure_id")
      .notNull()
      .references(() => feeStructures.id),
    discountPaise: integer("discount_paise").notNull().default(0),
    scholarshipPaise: integer("scholarship_paise").notNull().default(0),
    reason: text("reason").notNull().default(""),
    ...time(),
  },
  (t) => [
    uniqueIndex("assignment_unique").on(
      t.institutionId,
      t.studentId,
      t.academicYearId,
      t.structureId,
    ),
  ],
);
export const invoices = sqliteTable(
  "invoices",
  {
    id: id(),
    ...tenant(),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id),
    academicYearId: text("academic_year_id")
      .notNull()
      .references(() => academicYears.id),
    assignmentId: text("assignment_id")
      .notNull()
      .unique()
      .references(() => assignments.id),
    number: text("number"),
    grossPaise: integer("gross_paise").notNull(),
    discountPaise: integer("discount_paise").notNull().default(0),
    scholarshipPaise: integer("scholarship_paise").notNull().default(0),
    netPaise: integer("net_paise").notNull(),
    issuedDate: text("issued_date").notNull(),
    dueDate: text("due_date").notNull(),
    ...time(),
  },
  (t) => [
    uniqueIndex("invoice_number").on(t.institutionId, t.number),
    index("invoice_scope").on(t.institutionId, t.academicYearId, t.studentId),
  ],
);
export const invoiceItems = sqliteTable("invoice_items", {
  id: id(),
  ...tenant(),
  invoiceId: text("invoice_id")
    .notNull()
    .references(() => invoices.id),
  componentId: text("component_id")
    .notNull()
    .references(() => feeComponents.id),
  name: text("name").notNull(),
  amountPaise: integer("amount_paise").notNull(),
});
export const installments = sqliteTable(
  "installments",
  {
    id: id(),
    ...tenant(),
    invoiceId: text("invoice_id")
      .notNull()
      .references(() => invoices.id),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id),
    academicYearId: text("academic_year_id")
      .notNull()
      .references(() => academicYears.id),
    title: text("title").notNull(),
    amountPaise: integer("amount_paise").notNull(),
    dueDate: text("due_date").notNull(),
    sortOrder: integer("sort_order").notNull(),
    ...time(),
  },
  (t) => [
    index("installment_due").on(t.institutionId, t.academicYearId, t.dueDate),
  ],
);
export const adjustments = sqliteTable("fee_adjustments", {
  id: id(),
  ...tenant(),
  studentId: text("student_id")
    .notNull()
    .references(() => students.id),
  academicYearId: text("academic_year_id")
    .notNull()
    .references(() => academicYears.id),
  invoiceId: text("invoice_id")
    .notNull()
    .references(() => invoices.id),
  installmentId: text("installment_id")
    .notNull()
    .references(() => installments.id),
  componentId: text("component_id"),
  benefitId: text("benefit_id"),
  kind: text("kind").notNull(),
  amountPaise: integer("amount_paise").notNull(),
  reason: text("reason").notNull(),
  approvedBy: text("approved_by").notNull(),
  ...time(),
});
export const payments = sqliteTable(
  "payments",
  {
    id: id(),
    ...tenant(),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id),
    academicYearId: text("academic_year_id")
      .notNull()
      .references(() => academicYears.id),
    amountPaise: integer("amount_paise").notNull(),
    method: text("method").notNull(),
    status: text("status").notNull(),
    reference: text("reference"),
    idempotencyKey: text("idempotency_key").notNull(),
    requestHash: text("request_hash").notNull(),
    gateway: text("gateway"),
    gatewayOrderId: text("gateway_order_id"),
    gatewayTransactionId: text("gateway_transaction_id"),
    paidAt: text("paid_at").notNull(),
    notes: text("notes").notNull().default(""),
    ...time(),
  },
  (t) => [
    uniqueIndex("payment_idempotency").on(t.institutionId, t.idempotencyKey),
    uniqueIndex("gateway_transaction").on(t.gateway, t.gatewayTransactionId),
    uniqueIndex("gateway_order").on(t.gateway, t.gatewayOrderId),
    index("payment_scope").on(t.institutionId, t.academicYearId, t.paidAt),
    index("payments_student_created_desc").on(
      t.institutionId,
      t.studentId,
      sql`${t.createdAt} DESC`,
    ),
  ],
);
export const paymentAllocations = sqliteTable("payment_allocations", {
  id: id(),
  ...tenant(),
  paymentId: text("payment_id")
    .notNull()
    .references(() => payments.id),
  invoiceId: text("invoice_id")
    .notNull()
    .references(() => invoices.id),
  installmentId: text("installment_id")
    .notNull()
    .references(() => installments.id),
  amountPaise: integer("amount_paise").notNull(),
});
export const receipts = sqliteTable(
  "receipts",
  {
    id: id(),
    ...tenant(),
    paymentId: text("payment_id")
      .notNull()
      .unique()
      .references(() => payments.id),
    academicYearId: text("academic_year_id")
      .notNull()
      .references(() => academicYears.id),
    number: text("number"),
    ...time(),
  },
  (t) => [uniqueIndex("receipt_number").on(t.institutionId, t.number)],
);
export const refunds = sqliteTable(
  "refunds",
  {
    id: id(),
    ...tenant(),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id),
    academicYearId: text("academic_year_id")
      .notNull()
      .references(() => academicYears.id),
    paymentId: text("payment_id")
      .notNull()
      .references(() => payments.id),
    amountPaise: integer("amount_paise").notNull(),
    method: text("method").notNull(),
    reference: text("reference"),
    reason: text("reason").notNull(),
    status: text("status").notNull().default("Requested"),
    approvedBy: text("approved_by"),
    refundedAt: text("refunded_at"),
    idempotencyKey: text("idempotency_key").notNull(),
    ...time(),
  },
  (t) => [
    uniqueIndex("refund_idempotency").on(t.institutionId, t.idempotencyKey),
  ],
);
export const refundAllocations = sqliteTable("refund_allocations", {
  id: id(),
  ...tenant(),
  refundId: text("refund_id")
    .notNull()
    .references(() => refunds.id),
  allocationId: text("allocation_id")
    .notNull()
    .references(() => paymentAllocations.id),
  installmentId: text("installment_id")
    .notNull()
    .references(() => installments.id),
  amountPaise: integer("amount_paise").notNull(),
});
export const ledger = sqliteTable(
  "ledger_entries",
  {
    id: id(),
    ...tenant(),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id),
    academicYearId: text("academic_year_id")
      .notNull()
      .references(() => academicYears.id),
    invoiceId: text("invoice_id").references(() => invoices.id),
    paymentId: text("payment_id").references(() => payments.id),
    refundId: text("refund_id").references(() => refunds.id),
    adjustmentId: text("adjustment_id").references(() => adjustments.id),
    kind: text("kind").notNull(),
    description: text("description").notNull(),
    debitPaise: integer("debit_paise").notNull().default(0),
    creditPaise: integer("credit_paise").notNull().default(0),
    entryDate: text("entry_date").notNull(),
    ...time(),
  },
  (t) => [
    index("ledger_student_year").on(
      t.institutionId,
      t.studentId,
      t.academicYearId,
      t.entryDate,
    ),
  ],
);
export const lateFeeRuns = sqliteTable(
  "late_fee_runs",
  {
    id: id(),
    ...tenant(),
    installmentId: text("installment_id")
      .notNull()
      .references(() => installments.id),
    period: text("period").notNull(),
    amountPaise: integer("amount_paise").notNull(),
    ...time(),
  },
  (t) => [
    uniqueIndex("late_fee_period").on(
      t.institutionId,
      t.installmentId,
      t.period,
    ),
  ],
);
export const paymentLinks = sqliteTable("payment_links", {
  id: id(),
  ...tenant(),
  tokenHash: text("token_hash").notNull().unique(),
  studentId: text("student_id")
    .notNull()
    .references(() => students.id),
  academicYearId: text("academic_year_id")
    .notNull()
    .references(() => academicYears.id),
  amountPaise: integer("amount_paise").notNull(),
  expiresAt: text("expires_at").notNull(),
  status: text("status").notNull().default("Active"),
  ...time(),
});
export const gatewayEvents = sqliteTable(
  "gateway_events",
  {
    id: id(),
    ...tenant(),
    gateway: text("gateway").notNull(),
    eventId: text("event_id").notNull(),
    payloadHash: text("payload_hash").notNull(),
    status: text("status").notNull(),
    ...time(),
  },
  (t) => [uniqueIndex("gateway_event_unique").on(t.gateway, t.eventId)],
);
export const reconciliation = sqliteTable(
  "reconciliation_records",
  {
    id: id(),
    ...tenant(),
    academicYearId: text("academic_year_id")
      .notNull()
      .references(() => academicYears.id),
    transactionId: text("transaction_id").notNull(),
    amountPaise: integer("amount_paise").notNull(),
    transactionDate: text("transaction_date").notNull(),
    studentId: text("student_id"),
    invoiceId: text("invoice_id"),
    paymentId: text("payment_id").references(() => payments.id),
    status: text("status").notNull(),
    notes: text("notes").notNull().default(""),
    importBatch: text("import_batch").notNull(),
    ...time(),
  },
  (t) => [
    index("reconciliation_scope").on(
      t.institutionId,
      t.academicYearId,
      t.transactionId,
    ),
  ],
);
export const notifications = sqliteTable(
  "notifications",
  {
    id: id(),
    ...tenant(),
    academicYearId: text("academic_year_id").references(() => academicYears.id),
    parentId: text("parent_id").references(() => parents.id),
    studentId: text("student_id").references(() => students.id),
    recipient: text("recipient").notNull(),
    channel: text("channel").notNull(),
    message: text("message").notNull(),
    status: text("status").notNull().default("Queued"),
    referenceId: text("reference_id"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    sentAt: text("sent_at"),
    deliveredAt: text("delivered_at"),
    dedupeKey: text("dedupe_key"),
    metadata: text("metadata").notNull().default("{}"),
    ...time(),
  },
  (t) => [
    uniqueIndex("notification_dedupe").on(t.institutionId, t.dedupeKey),
    index("notification_queue").on(t.status, t.createdAt),
  ],
);
export const cashEntries = sqliteTable("cash_entries", {
  id: id(),
  ...tenant(),
  campusId: text("campus_id")
    .notNull()
    .references(() => campuses.id),
  academicYearId: text("academic_year_id")
    .notNull()
    .references(() => academicYears.id),
  kind: text("kind").notNull(),
  amountPaise: integer("amount_paise").notNull(),
  entryDate: text("entry_date").notNull(),
  reference: text("reference").notNull().default(""),
  notes: text("notes").notNull().default(""),
  ...time(),
});
export const cashClosings = sqliteTable(
  "cash_closings",
  {
    id: id(),
    ...tenant(),
    campusId: text("campus_id")
      .notNull()
      .references(() => campuses.id),
    entryDate: text("entry_date").notNull(),
    expectedPaise: integer("expected_paise").notNull(),
    countedPaise: integer("counted_paise").notNull(),
    variancePaise: integer("variance_paise").notNull(),
    denominations: text("denominations").notNull().default("{}"),
    notes: text("notes").notNull().default(""),
    ...time(),
  },
  (t) => [
    uniqueIndex("cash_close_day").on(t.institutionId, t.campusId, t.entryDate),
  ],
);
export const auditLogs = sqliteTable(
  "audit_logs",
  {
    id: id(),
    ...tenant(),
    userId: text("user_id").notNull(),
    userName: text("user_name").notNull(),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: text("entity_id").notNull(),
    oldValue: text("old_value"),
    newValue: text("new_value"),
    ip: text("ip"),
    userAgent: text("user_agent"),
    supportSessionId: text("support_session_id"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("audit_tenant_time").on(t.institutionId, t.createdAt)],
);
export const jobs = sqliteTable(
  "job_runs",
  {
    id: id(),
    ...tenant(),
    kind: text("kind").notNull(),
    runKey: text("run_key").notNull(),
    status: text("status").notNull(),
    result: text("result"),
    ...time(),
  },
  (t) => [uniqueIndex("job_run_key").on(t.institutionId, t.kind, t.runKey)],
);
export const rateLimits = sqliteTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  window: integer("window").notNull(),
});
export const paymentIntents = sqliteTable("payment_intents", {
  id: id(),
  ...tenant(),
  paymentId: text("payment_id")
    .notNull()
    .unique()
    .references(() => payments.id),
  allocations: text("allocations").notNull(),
  ...time(),
});
export const providerConfigs = sqliteTable(
  "provider_configs",
  {
    id: id(),
    ...tenant(),
    provider: text("provider").notNull(),
    ciphertext: text("ciphertext").notNull(),
    mode: text("mode").notNull(),
    ...time(),
  },
  (t) => [
    uniqueIndex("provider_config_tenant").on(t.institutionId, t.provider),
  ],
);

// A balanced journal event always transfers one exact paise amount between two
// accounts. journal_postings projects the debit and credit legs. Events and
// their source ledger records are immutable; corrections append reversals.
export const journalEvents = sqliteTable(
  "journal_events",
  {
    id: id(),
    ...tenant(),
    ledgerEntryId: text("ledger_entry_id")
      .notNull()
      .unique()
      .references(() => ledger.id),
    academicYearId: text("academic_year_id")
      .notNull()
      .references(() => academicYears.id),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id),
    eventType: text("event_type").notNull(),
    debitAccount: text("debit_account").notNull(),
    creditAccount: text("credit_account").notNull(),
    amountPaise: integer("amount_paise").notNull(),
    reversalOf: text("reversal_of"),
    description: text("description").notNull(),
    entryDate: text("entry_date").notNull(),
    createdAt: text("created_at").notNull(),
    createdBy: text("created_by").notNull(),
  },
  (t) => [
    index("journal_student_year").on(
      t.institutionId,
      t.studentId,
      t.academicYearId,
      t.createdAt,
    ),
  ],
);

export const apiIdempotency = sqliteTable(
  "api_idempotency",
  {
    id: id(),
    ...tenant(),
    key: text("key").notNull(),
    operation: text("operation").notNull(),
    requestHash: text("request_hash").notNull(),
    response: text("response"),
    statusCode: integer("status_code"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("api_idempotency_scope").on(
      t.institutionId,
      t.operation,
      t.key,
    ),
  ],
);

export const notificationOutbox = sqliteTable(
  "notification_outbox",
  {
    id: id(),
    ...tenant(),
    paymentId: text("payment_id")
      .notNull()
      .unique()
      .references(() => payments.id),
    state: text("state").notNull().default("Queued"),
    attempts: integer("attempts").notNull().default(0),
    availableAt: text("available_at").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [index("outbox_ready").on(t.institutionId, t.state, t.availableAt)],
);

export const organizationMembers = sqliteTable(
  "organization_members",
  {
    id: id(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    email: text("email").notNull(),
    active: integer("active").notNull().default(1),
    ...time(),
  },
  (t) => [
    uniqueIndex("organization_member_email").on(t.organizationId, t.email),
  ],
);

export const parentPortalGrants = sqliteTable(
  "parent_portal_grants",
  {
    id: id(),
    ...tenant(),
    parentId: text("parent_id")
      .notNull()
      .references(() => parents.id),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: text("expires_at").notNull(),
    revokedAt: text("revoked_at"),
    purpose: text("purpose").notNull(),
    ...time(),
  },
  (t) => [
    index("parent_grant_scope").on(t.institutionId, t.parentId, t.expiresAt),
  ],
);

export const documentArtifacts = sqliteTable(
  "document_artifacts",
  {
    id: id(),
    ...tenant(),
    receiptId: text("receipt_id")
      .notNull()
      .references(() => receipts.id),
    objectKey: text("object_key").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [uniqueIndex("receipt_artifact").on(t.institutionId, t.receiptId)],
);
export const documentJobs = sqliteTable(
  "document_jobs",
  {
    id: id(),
    ...tenant(),
    receiptId: text("receipt_id")
      .notNull()
      .references(() => receipts.id),
    state: text("state").notNull().default("Queued"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [
    uniqueIndex("document_job_receipt").on(t.institutionId, t.receiptId),
    index("document_jobs_ready").on(t.institutionId, t.state),
  ],
);
export const communicationSettings = sqliteTable(
  "communication_settings",
  {
    id: id(),
    ...tenant(),
    configuration: text("configuration").notNull(),
    ...time(),
  },
  (t) => [uniqueIndex("communications_tenant").on(t.institutionId)],
);

export const webhookInbox = sqliteTable(
  "webhook_inbox",
  {
    id: id(),
    ...tenant(),
    provider: text("provider").notNull(),
    eventId: text("event_id").notNull(),
    payloadHash: text("payload_hash").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("webhook_inbox_event").on(
      t.institutionId,
      t.provider,
      t.eventId,
    ),
  ],
);

// Tax certificates require approved, explicit allocation evidence. No inference
// from a fee component's display name, and no conversion of tuition into donations.
export const tuitionAllocations = sqliteTable(
  "tuition_allocations",
  {
    id: id(),
    ...tenant(),
    paymentId: text("payment_id")
      .notNull()
      .references(() => payments.id),
    amountPaise: integer("amount_paise").notNull(),
    reason: text("reason").notNull(),
    approvedBy: text("approved_by").notNull(),
    ...time(),
  },
  (t) => [
    uniqueIndex("tuition_payment_basis").on(t.institutionId, t.paymentId),
  ],
);
export const donationCertificates = sqliteTable(
  "donation_certificates",
  {
    id: id(),
    ...tenant(),
    parentId: text("parent_id")
      .notNull()
      .references(() => parents.id),
    financialYear: integer("financial_year").notNull(),
    donationReference: text("donation_reference").notNull(),
    amountPaise: integer("amount_paise").notNull(),
    urn: text("urn").notNull(),
    doneePan: text("donee_pan").notNull(),
    form10bdAcknowledgement: text("form10bd_acknowledgement").notNull(),
    objectKey: text("object_key").notNull(),
    fileHash: text("file_hash").notNull(),
    ...time(),
  },
  (t) => [
    uniqueIndex("donation_reference_scope").on(
      t.institutionId,
      t.donationReference,
    ),
  ],
);

export const yearRollovers = sqliteTable(
  "year_rollovers",
  {
    id: id(),
    ...tenant(),
    sourceYearId: text("source_year_id")
      .notNull()
      .references(() => academicYears.id),
    targetYearId: text("target_year_id")
      .notNull()
      .references(() => academicYears.id),
    mapping: text("mapping").notNull(),
    status: text("status").notNull().default("Running"),
    reason: text("reason").notNull(),
    approvedBy: text("approved_by").notNull(),
    cursor: text("cursor").notNull().default(""),
    snapshot: text("snapshot").notNull(),
    ...time(),
  },
  (t) => [
    uniqueIndex("rollover_source_year").on(t.institutionId, t.sourceYearId),
  ],
);
export const rolloverStudents = sqliteTable(
  "rollover_students",
  {
    id: id(),
    ...tenant(),
    rolloverId: text("rollover_id")
      .notNull()
      .references(() => yearRollovers.id),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id),
    amountPaise: integer("amount_paise").notNull(),
    targetInvoiceId: text("target_invoice_id"),
    sourceSnapshot: text("source_snapshot").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [uniqueIndex("rollover_student_once").on(t.rolloverId, t.studentId)],
);
export const balanceCarryforwards = sqliteTable(
  "balance_carryforwards",
  {
    id: id(),
    ...tenant(),
    rolloverId: text("rollover_id")
      .notNull()
      .references(() => yearRollovers.id),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id),
    sourceInstallmentId: text("source_installment_id")
      .notNull()
      .references(() => installments.id),
    targetInvoiceId: text("target_invoice_id")
      .notNull()
      .references(() => invoices.id),
    amountPaise: integer("amount_paise").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("carry_installment_once").on(
      t.institutionId,
      t.sourceInstallmentId,
    ),
  ],
);

export const hardwareDevices = sqliteTable("hardware_devices", {
  id: id(),
  ...tenant(),
  name: text("name").notNull(),
  active: integer("active").notNull().default(1),
  ...time(),
});
export const rfidCards = sqliteTable(
  "rfid_cards",
  {
    id: id(),
    ...tenant(),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id),
    uidHash: text("uid_hash").notNull(),
    active: integer("active").notNull().default(1),
    ...time(),
  },
  (t) => [uniqueIndex("rfid_card_scope").on(t.institutionId, t.uidHash)],
);
export const attendanceEvents = sqliteTable(
  "attendance_events",
  {
    id: id(),
    ...tenant(),
    deviceId: text("device_id")
      .notNull()
      .references(() => hardwareDevices.id),
    eventId: text("event_id").notNull(),
    nonce: text("nonce").notNull(),
    payloadHash: text("payload_hash").notNull(),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id),
    punchedAt: text("punched_at").notNull(),
    localDate: text("local_date").notNull(),
    direction: text("direction").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("hardware_event_once").on(t.deviceId, t.eventId),
    uniqueIndex("hardware_nonce_once").on(t.deviceId, t.nonce),
    index("attendance_student_day").on(
      t.institutionId,
      t.studentId,
      t.localDate,
    ),
  ],
);
export const dailyFeeRules = sqliteTable(
  "daily_fee_rules",
  {
    id: id(),
    ...tenant(),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id),
    installmentId: text("installment_id")
      .notNull()
      .references(() => installments.id),
    service: text("service").notNull(),
    amountPaise: integer("amount_paise").notNull(),
    active: integer("active").notNull().default(1),
    ...time(),
  },
  (t) => [
    uniqueIndex("daily_service_student").on(
      t.institutionId,
      t.studentId,
      t.service,
    ),
  ],
);
export const dailyFeeCharges = sqliteTable(
  "daily_fee_charges",
  {
    id: id(),
    ...tenant(),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id),
    attendanceId: text("attendance_id")
      .notNull()
      .references(() => attendanceEvents.id),
    ruleId: text("rule_id")
      .notNull()
      .references(() => dailyFeeRules.id),
    adjustmentId: text("adjustment_id")
      .notNull()
      .references(() => adjustments.id),
    service: text("service").notNull(),
    localDate: text("local_date").notNull(),
    amountPaise: integer("amount_paise").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("daily_charge_once").on(
      t.institutionId,
      t.studentId,
      t.service,
      t.localDate,
    ),
  ],
);

export const bankImportBatches = sqliteTable(
  "bank_import_batches",
  {
    id: id(),
    ...tenant(),
    academicYearId: text("academic_year_id")
      .notNull()
      .references(() => academicYears.id),
    fingerprint: text("fingerprint").notNull(),
    rows: text("rows").notNull(),
    createdAt: text("created_at").notNull(),
    createdBy: text("created_by").notNull(),
  },
  (t) => [
    uniqueIndex("bank_import_fingerprint").on(
      t.institutionId,
      t.academicYearId,
      t.fingerprint,
    ),
  ],
);
export const bankPostedRows = sqliteTable(
  "bank_posted_rows",
  {
    id: id(),
    ...tenant(),
    batchId: text("batch_id")
      .notNull()
      .references(() => bankImportBatches.id),
    rowKey: text("row_key").notNull(),
    transactionId: text("transaction_id").notNull(),
    paymentId: text("payment_id").references(() => payments.id),
    reconciliationId: text("reconciliation_id")
      .notNull()
      .references(() => reconciliation.id),
    createdAt: text("created_at").notNull(),
  },
  (t) => [uniqueIndex("bank_row_once").on(t.institutionId, t.transactionId)],
);

export const userCredentials = sqliteTable(
  "user_credentials",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    username: text("username").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    salt: text("salt").notNull(),
    failedAttempts: integer("failed_attempts").notNull().default(0),
    lockedUntil: text("locked_until"),
    active: integer("active").notNull().default(1),
    passwordChangedAt: text("password_changed_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [uniqueIndex("user_credentials_username").on(t.username)],
);

export const authSessions = sqliteTable(
  "auth_sessions",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    role: text("role").notNull(),
    institutionId: text("institution_id").notNull().default(""),
    expiresAt: text("expires_at").notNull(),
    createdAt: text("created_at").notNull(),
    lastActiveAt: text("last_active_at").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
  },
  (t) => [
    uniqueIndex("auth_sessions_token").on(t.tokenHash),
    index("auth_sessions_user").on(t.userId),
  ],
);

export const loginHistory = sqliteTable(
  "login_history",
  {
    id: id(),
    userId: text("user_id"),
    email: text("email").notNull(),
    role: text("role"),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    status: text("status").notNull(),
    reason: text("reason"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    index("login_history_email").on(t.email),
    index("login_history_user").on(t.userId),
  ],
);

export const passwordResetTokens = sqliteTable(
  "password_reset_tokens",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    expiresAt: text("expires_at").notNull(),
    usedAt: text("used_at"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [uniqueIndex("password_reset_token_idx").on(t.token)],
);

export const holidays = sqliteTable(
  "holidays",
  {
    id: id(),
    ...tenant(),
    academicYearId: text("academic_year_id"),
    campusId: text("campus_id"),
    title: text("title").notNull(),
    date: text("date").notNull(),
    endDate: text("end_date"),
    type: text("type").notNull().default("Institutional"),
    description: text("description").notNull().default(""),
    ...time(),
  },
  (t) => [index("holiday_institution_date").on(t.institutionId, t.date)],
);

export const workingDays = sqliteTable(
  "working_days",
  {
    id: id(),
    ...tenant(),
    academicYearId: text("academic_year_id"),
    campusId: text("campus_id"),
    dayOfWeek: integer("day_of_week").notNull(),
    isWorking: integer("is_working").notNull().default(1),
    isHalfDay: integer("is_half_day").notNull().default(0),
    openTime: text("open_time").notNull().default("08:00"),
    closeTime: text("close_time").notNull().default("15:00"),
    ...time(),
  },
  (t) => [uniqueIndex("working_day_scope").on(t.institutionId, t.dayOfWeek)],
);

export const admissionsEnquiries = sqliteTable(
  "admissions_enquiries",
  {
    id: id(),
    ...tenant(),
    academicYearId: text("academic_year_id"),
    campusId: text("campus_id"),
    studentName: text("student_name").notNull(),
    parentName: text("parent_name").notNull(),
    email: text("email").notNull().default(""),
    phone: text("phone").notNull(),
    classApplied: text("class_applied").notNull(),
    source: text("source").notNull().default("Walk-in"),
    notes: text("notes").notNull().default(""),
    status: text("status").notNull().default("New"),
    ...time(),
  },
  (t) => [
    index("admissions_enquiries_scope").on(t.institutionId, t.status),
  ],
);

export const admissionsApplications = sqliteTable(
  "admissions_applications",
  {
    id: id(),
    ...tenant(),
    academicYearId: text("academic_year_id")
      .notNull()
      .references(() => academicYears.id),
    campusId: text("campus_id"),
    applicationNumber: text("application_number").notNull(),
    studentName: text("student_name").notNull(),
    dob: text("dob"),
    gender: text("gender").notNull().default("Not specified"),
    bloodGroup: text("blood_group"),
    aadhaarLast4: text("aadhaar_last4"),
    studentEmail: text("student_email"),
    studentPhone: text("student_phone"),
    address: text("address").notNull().default(""),
    city: text("city").notNull().default(""),
    state: text("state").notNull().default(""),
    pincode: text("pincode").notNull().default(""),
    parentName: text("parent_name").notNull(),
    parentPhone: text("parent_phone").notNull(),
    parentEmail: text("parent_email"),
    parentRelation: text("parent_relation").notNull().default("Father"),
    parentOccupation: text("parent_occupation").notNull().default(""),
    previousSchool: text("previous_school").notNull().default(""),
    previousGrade: text("previous_grade").notNull().default(""),
    previousPercentage: text("previous_percentage").notNull().default(""),
    status: text("status").notNull().default("Applied"),
    interviewDate: text("interview_date"),
    interviewTime: text("interview_time"),
    interviewNotes: text("interview_notes"),
    interviewResult: text("interview_result").notNull().default("Pending"),
    selectionNotes: text("selection_notes"),
    enrolledStudentId: text("enrolled_student_id"),
    ...time(),
  },
  (t) => [
    uniqueIndex("admissions_app_num").on(
      t.institutionId,
      t.applicationNumber,
    ),
  ],
);

export const admissionsDocuments = sqliteTable(
  "admissions_documents",
  {
    id: id(),
    ...tenant(),
    applicationId: text("application_id")
      .notNull()
      .references(() => admissionsApplications.id),
    documentName: text("document_name").notNull(),
    documentType: text("document_type").notNull(),
    fileKey: text("file_key"),
    verificationStatus: text("verification_status")
      .notNull()
      .default("Pending"),
    verificationNotes: text("verification_notes"),
    ...time(),
  },
);

export const studentEmergencyContacts = sqliteTable(
  "student_emergency_contacts",
  {
    id: id(),
    ...tenant(),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id),
    name: text("name").notNull(),
    relationship: text("relationship").notNull().default("Guardian"),
    phone: text("phone").notNull(),
    alternatePhone: text("alternate_phone"),
    address: text("address").notNull().default(""),
    ...time(),
  },
);

export const studentTransfers = sqliteTable(
  "student_transfers",
  {
    id: id(),
    ...tenant(),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id),
    tcNumber: text("tc_number").notNull(),
    destinationSchool: text("destination_school").notNull(),
    reason: text("reason").notNull(),
    transferDate: text("transfer_date").notNull(),
    conduct: text("conduct").notNull().default("Good"),
    status: text("status").notNull().default("Issued"),
    ...time(),
  },
  (t) => [
    uniqueIndex("student_transfer_tc").on(t.institutionId, t.tcNumber),
  ],
);

export const studentHistory = sqliteTable(
  "student_history",
  {
    id: id(),
    ...tenant(),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id),
    action: text("action").notNull(),
    details: text("details").notNull().default("{}"),
    actorId: text("actor_id").notNull(),
    actorName: text("actor_name").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    index("student_history_idx").on(
      t.institutionId,
      t.studentId,
      t.createdAt,
    ),
  ],
);

export const studentExams = sqliteTable(
  "student_exams",
  {
    id: id(),
    ...tenant(),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id),
    academicYearId: text("academic_year_id")
      .notNull()
      .references(() => academicYears.id),
    examName: text("exam_name").notNull(),
    subject: text("subject").notNull(),
    marksObtained: integer("marks_obtained").notNull(),
    maxMarks: integer("max_marks").notNull().default(100),
    grade: text("grade").notNull().default("A"),
    remarks: text("remarks").notNull().default(""),
    ...time(),
  },
);

export const studentLmsCourses = sqliteTable(
  "student_lms_courses",
  {
    id: id(),
    ...tenant(),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id),
    courseName: text("course_name").notNull(),
    instructor: text("instructor").notNull().default(""),
    progressPercent: integer("progress_percent").notNull().default(0),
    status: text("status").notNull().default("Enrolled"),
    ...time(),
  },
);

// ==========================================
// MEMBER 2: ACADEMICS, FACULTY, TIMETABLE & ATTENDANCE
// ==========================================

export const departments = sqliteTable(
  "departments",
  {
    id: id(),
    ...tenant(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    hodId: text("hod_id"),
    hodName: text("hod_name").notNull().default(""),
    status: text("status").notNull().default("Active"),
    ...time(),
  },
  (t) => [uniqueIndex("department_code_idx").on(t.institutionId, t.code)],
);

export const programs = sqliteTable(
  "programs",
  {
    id: id(),
    ...tenant(),
    departmentId: text("department_id"),
    code: text("code").notNull(),
    name: text("name").notNull(),
    degreeLevel: text("degree_level").notNull().default("Undergraduate"),
    durationYears: integer("duration_years").notNull().default(4),
    totalSemesters: integer("total_semesters").notNull().default(8),
    totalCredits: integer("total_credits").notNull().default(160),
    coordinatorId: text("coordinator_id"),
    coordinatorName: text("coordinator_name").notNull().default(""),
    status: text("status").notNull().default("Active"),
    ...time(),
  },
  (t) => [uniqueIndex("program_code_idx").on(t.institutionId, t.code)],
);

export const academicSemesters = sqliteTable(
  "academic_semesters",
  {
    id: id(),
    ...tenant(),
    academicYearId: text("academic_year_id")
      .notNull()
      .references(() => academicYears.id),
    programId: text("program_id"),
    name: text("name").notNull(),
    startDate: text("start_date").notNull(),
    endDate: text("end_date").notNull(),
    isCurrent: integer("is_current").notNull().default(0),
    status: text("status").notNull().default("Upcoming"),
    ...time(),
  },
  (t) => [
    index("academic_semester_scope").on(t.institutionId, t.academicYearId),
  ],
);

export const subjects = sqliteTable(
  "subjects",
  {
    id: id(),
    ...tenant(),
    departmentId: text("department_id"),
    classId: text("class_id"),
    code: text("code").notNull(),
    name: text("name").notNull(),
    type: text("type").notNull().default("Theory"),
    credits: integer("credits").notNull().default(3),
    facultyId: text("faculty_id"),
    status: text("status").notNull().default("Active"),
    ...time(),
  },
  (t) => [uniqueIndex("subject_code_idx").on(t.institutionId, t.code)],
);

export const faculty = sqliteTable(
  "faculty",
  {
    id: id(),
    ...tenant(),
    userId: text("user_id"),
    employeeId: text("employee_id").notNull(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    phone: text("phone").notNull().default(""),
    departmentId: text("department_id"),
    departmentName: text("department_name").notNull().default(""),
    designation: text("designation").notNull().default("Assistant Professor"),
    qualification: text("qualification").notNull().default("Master's"),
    specialization: text("specialization").notNull().default(""),
    experienceYears: integer("experience_years").notNull().default(0),
    joiningDate: text("joining_date").notNull(),
    status: text("status").notNull().default("Active"),
    ...time(),
  },
  (t) => [
    uniqueIndex("faculty_emp_idx").on(t.institutionId, t.employeeId),
    index("faculty_email_idx").on(t.institutionId, t.email),
  ],
);

export const facultyDocuments = sqliteTable(
  "faculty_documents",
  {
    id: id(),
    ...tenant(),
    facultyId: text("faculty_id")
      .notNull()
      .references(() => faculty.id),
    title: text("title").notNull(),
    documentType: text("document_type").notNull().default("Resume"),
    fileUrl: text("file_url").notNull(),
    ...time(),
  },
  (t) => [index("faculty_docs_idx").on(t.institutionId, t.facultyId)],
);

export const timetableSlots = sqliteTable(
  "timetable_slots",
  {
    id: id(),
    ...tenant(),
    academicYearId: text("academic_year_id")
      .notNull()
      .references(() => academicYears.id),
    campusId: text("campus_id"),
    classId: text("class_id")
      .notNull()
      .references(() => classes.id),
    sectionId: text("section_id")
      .notNull()
      .references(() => sections.id),
    subjectId: text("subject_id")
      .notNull()
      .references(() => subjects.id),
    facultyId: text("faculty_id"),
    dayOfWeek: text("day_of_week").notNull(),
    periodNumber: integer("period_number").notNull(),
    startTime: text("start_time").notNull(),
    endTime: text("end_time").notNull(),
    roomNumber: text("room_number").notNull().default(""),
    status: text("status").notNull().default("Published"),
    ...time(),
  },
  (t) => [
    index("timetable_section_idx").on(
      t.institutionId,
      t.classId,
      t.sectionId,
      t.dayOfWeek,
      t.periodNumber,
    ),
    index("timetable_faculty_idx").on(
      t.institutionId,
      t.facultyId,
      t.dayOfWeek,
      t.periodNumber,
    ),
    index("timetable_room_idx").on(
      t.institutionId,
      t.roomNumber,
      t.dayOfWeek,
      t.periodNumber,
    ),
  ],
);

export const studentAttendance = sqliteTable(
  "student_attendance",
  {
    id: id(),
    ...tenant(),
    academicYearId: text("academic_year_id")
      .notNull()
      .references(() => academicYears.id),
    classId: text("class_id")
      .notNull()
      .references(() => classes.id),
    sectionId: text("section_id")
      .notNull()
      .references(() => sections.id),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id),
    date: text("date").notNull(),
    periodNumber: integer("period_number").notNull().default(0),
    status: text("status").notNull().default("Present"),
    remarks: text("remarks").notNull().default(""),
    recordedBy: text("recorded_by").notNull(),
    correctionReason: text("correction_reason"),
    correctedBy: text("corrected_by"),
    ...time(),
  },
  (t) => [
    uniqueIndex("student_attendance_entry_idx").on(
      t.institutionId,
      t.studentId,
      t.date,
      t.periodNumber,
    ),
    index("student_attendance_filter_idx").on(
      t.institutionId,
      t.classId,
      t.sectionId,
      t.date,
    ),
  ],
);

export const facultyAttendance = sqliteTable(
  "faculty_attendance",
  {
    id: id(),
    ...tenant(),
    facultyId: text("faculty_id")
      .notNull()
      .references(() => faculty.id),
    date: text("date").notNull(),
    checkIn: text("check_in"),
    checkOut: text("check_out"),
    status: text("status").notNull().default("Present"),
    notes: text("notes").notNull().default(""),
    ...time(),
  },
  (t) => [
    uniqueIndex("faculty_att_date_idx").on(t.institutionId, t.facultyId, t.date),
  ],
);

export const facultyLeaves = sqliteTable(
  "faculty_leaves",
  {
    id: id(),
    ...tenant(),
    facultyId: text("faculty_id")
      .notNull()
      .references(() => faculty.id),
    leaveType: text("leave_type").notNull().default("Casual"),
    startDate: text("start_date").notNull(),
    endDate: text("end_date").notNull(),
    daysCount: integer("days_count").notNull().default(1),
    reason: text("reason").notNull(),
    substituteFacultyId: text("substitute_faculty_id"),
    substituteName: text("substitute_name").notNull().default(""),
    status: text("status").notNull().default("Pending"),
    reviewedBy: text("reviewed_by"),
    reviewedAt: text("reviewed_at"),
    reviewComments: text("review_comments").notNull().default(""),
    ...time(),
  },
  (t) => [
    index("faculty_leave_status_idx").on(
      t.institutionId,
      t.facultyId,
      t.status,
    ),
  ],
);

// ==========================================
// MEMBER 3: LMS, COURSES, RESOURCES, ASSIGNMENTS & QUIZZES
// ==========================================

export const lmsCourses = sqliteTable(
  "lms_courses",
  {
    id: id(),
    ...tenant(),
    code: text("code").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    thumbnailUrl: text("thumbnail_url").notNull().default(""),
    departmentId: text("department_id"),
    subjectId: text("subject_id"),
    facultyId: text("faculty_id"),
    facultyName: text("faculty_name").notNull().default(""),
    classId: text("class_id"),
    sectionId: text("section_id"),
    level: text("level").notNull().default("Beginner"),
    status: text("status").notNull().default("Draft"),
    ...time(),
  },
  (t) => [
    uniqueIndex("lms_course_code_idx").on(t.institutionId, t.code),
    index("lms_course_status_idx").on(t.institutionId, t.status),
  ],
);

export const lmsModules = sqliteTable(
  "lms_modules",
  {
    id: id(),
    ...tenant(),
    courseId: text("course_id")
      .notNull()
      .references(() => lmsCourses.id),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    sortOrder: integer("sort_order").notNull().default(1),
    status: text("status").notNull().default("Published"),
    ...time(),
  },
  (t) => [index("lms_module_course_idx").on(t.institutionId, t.courseId)],
);

export const lmsLessons = sqliteTable(
  "lms_lessons",
  {
    id: id(),
    ...tenant(),
    courseId: text("course_id")
      .notNull()
      .references(() => lmsCourses.id),
    moduleId: text("module_id")
      .notNull()
      .references(() => lmsModules.id),
    title: text("title").notNull(),
    content: text("content").notNull().default(""),
    durationMinutes: integer("duration_minutes").notNull().default(15),
    videoUrl: text("video_url").notNull().default(""),
    sortOrder: integer("sort_order").notNull().default(1),
    status: text("status").notNull().default("Published"),
    ...time(),
  },
  (t) => [
    index("lms_lesson_course_mod_idx").on(
      t.institutionId,
      t.courseId,
      t.moduleId,
    ),
  ],
);

export const lmsResources = sqliteTable(
  "lms_resources",
  {
    id: id(),
    ...tenant(),
    courseId: text("course_id")
      .notNull()
      .references(() => lmsCourses.id),
    lessonId: text("lesson_id"),
    title: text("title").notNull(),
    type: text("type").notNull().default("PDF"),
    fileUrl: text("file_url").notNull(),
    fileSizeBytes: integer("file_size_bytes").notNull().default(0),
    isDownloadable: integer("is_downloadable").notNull().default(1),
    ...time(),
  },
  (t) => [index("lms_resource_course_idx").on(t.institutionId, t.courseId)],
);

export const lmsEnrollments = sqliteTable(
  "lms_enrollments",
  {
    id: id(),
    ...tenant(),
    courseId: text("course_id")
      .notNull()
      .references(() => lmsCourses.id),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id),
    enrolledDate: text("enrolled_date").notNull(),
    progressPercent: integer("progress_percent").notNull().default(0),
    completedLessons: text("completed_lessons").notNull().default("[]"),
    lastAccessedLessonId: text("last_accessed_lesson_id"),
    lastAccessedAt: text("last_accessed_at"),
    status: text("status").notNull().default("Active"),
    ...time(),
  },
  (t) => [
    uniqueIndex("lms_enroll_student_course_idx").on(
      t.institutionId,
      t.courseId,
      t.studentId,
    ),
    index("lms_enroll_student_idx").on(t.institutionId, t.studentId),
  ],
);

export const lmsAssignments = sqliteTable(
  "lms_assignments",
  {
    id: id(),
    ...tenant(),
    courseId: text("course_id"),
    subjectId: text("subject_id"),
    classId: text("class_id"),
    sectionId: text("section_id"),
    facultyId: text("faculty_id"),
    title: text("title").notNull(),
    instructions: text("instructions").notNull().default(""),
    attachmentUrl: text("attachment_url").notNull().default(""),
    maxMarks: integer("max_marks").notNull().default(100),
    dueDate: text("due_date").notNull(),
    allowLate: integer("allow_late").notNull().default(0),
    status: text("status").notNull().default("Published"),
    ...time(),
  },
  (t) => [
    index("lms_assignment_course_idx").on(t.institutionId, t.courseId),
    index("lms_assignment_faculty_idx").on(t.institutionId, t.facultyId),
  ],
);

export const lmsSubmissions = sqliteTable(
  "lms_submissions",
  {
    id: id(),
    ...tenant(),
    assignmentId: text("assignment_id")
      .notNull()
      .references(() => lmsAssignments.id),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id),
    studentName: text("student_name").notNull().default(""),
    content: text("content").notNull().default(""),
    attachmentUrl: text("attachment_url").notNull().default(""),
    submittedAt: text("submitted_at").notNull(),
    status: text("status").notNull().default("Submitted"),
    marksObtained: integer("marks_obtained"),
    feedback: text("feedback").notNull().default(""),
    gradedBy: text("graded_by"),
    gradedAt: text("graded_at"),
    ...time(),
  },
  (t) => [
    uniqueIndex("lms_submission_unique_idx").on(
      t.institutionId,
      t.assignmentId,
      t.studentId,
    ),
    index("lms_sub_assignment_idx").on(t.institutionId, t.assignmentId),
  ],
);

export const lmsQuizzes = sqliteTable(
  "lms_quizzes",
  {
    id: id(),
    ...tenant(),
    courseId: text("course_id"),
    facultyId: text("faculty_id"),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    timeLimitMinutes: integer("time_limit_minutes").notNull().default(30),
    totalMarks: integer("total_marks").notNull().default(100),
    passingMarks: integer("passing_marks").notNull().default(40),
    dueDate: text("due_date"),
    status: text("status").notNull().default("Published"),
    ...time(),
  },
  (t) => [index("lms_quiz_course_idx").on(t.institutionId, t.courseId)],
);

export const lmsQuizQuestions = sqliteTable(
  "lms_quiz_questions",
  {
    id: id(),
    ...tenant(),
    quizId: text("quiz_id")
      .notNull()
      .references(() => lmsQuizzes.id),
    question: text("question").notNull(),
    type: text("type").notNull().default("MCQ"),
    options: text("options").notNull().default("[]"),
    correctAnswer: text("correct_answer").notNull(),
    explanation: text("explanation").notNull().default(""),
    marks: integer("marks").notNull().default(10),
    sortOrder: integer("sort_order").notNull().default(1),
    ...time(),
  },
  (t) => [index("lms_quiz_q_quiz_idx").on(t.institutionId, t.quizId)],
);

export const lmsQuizAttempts = sqliteTable(
  "lms_quiz_attempts",
  {
    id: id(),
    ...tenant(),
    quizId: text("quiz_id")
      .notNull()
      .references(() => lmsQuizzes.id),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id),
    studentName: text("student_name").notNull().default(""),
    answers: text("answers").notNull().default("{}"),
    score: integer("score").notNull().default(0),
    maxScore: integer("max_score").notNull().default(100),
    percentage: integer("percentage").notNull().default(0),
    passed: integer("passed").notNull().default(0),
    timeSpentSeconds: integer("time_spent_seconds").notNull().default(0),
    completedAt: text("completed_at").notNull(),
    ...time(),
  },
  (t) => [
    index("lms_quiz_attempt_student_idx").on(
      t.institutionId,
      t.quizId,
      t.studentId,
    ),
  ],
);


// ==========================================
// MEMBER 2: STUDENT PORTAL (SECTIONS 13-24)
// ==========================================

export const studentDocuments = sqliteTable(
  "student_documents",
  {
    id: id(),
    ...tenant(),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id),
    title: text("title").notNull(),
    category: text("category").notNull().default("Academic"),
    documentType: text("document_type").notNull().default("Marksheet"),
    fileUrl: text("file_url").notNull(),
    fileName: text("file_name").notNull(),
    fileSizeBytes: integer("file_size_bytes").notNull().default(0),
    mimeType: text("mime_type").notNull().default("application/pdf"),
    verificationStatus: text("verification_status")
      .notNull()
      .default("Pending"),
    verificationNotes: text("verification_notes").notNull().default(""),
    verifiedBy: text("verified_by"),
    verifiedAt: text("verified_at"),
    isStudentUploaded: integer("is_student_uploaded").notNull().default(1),
    ...time(),
  },
  (t) => [
    index("student_docs_student_idx").on(t.institutionId, t.studentId),
    index("student_docs_cat_idx").on(t.institutionId, t.studentId, t.category),
  ],
);

export const studentCertificateRequests = sqliteTable(
  "student_certificate_requests",
  {
    id: id(),
    ...tenant(),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id),
    certificateType: text("certificate_type").notNull(),
    reason: text("reason").notNull().default(""),
    status: text("status").notNull().default("Pending"),
    certificateNumber: text("certificate_number"),
    verificationCode: text("verification_code"),
    qrPayload: text("qr_payload"),
    pdfUrl: text("pdf_url"),
    rejectionReason: text("rejection_reason"),
    approvedBy: text("approved_by"),
    approvedAt: text("approved_at"),
    issuedAt: text("issued_at"),
    ...time(),
  },
  (t) => [
    index("student_cert_student_idx").on(t.institutionId, t.studentId),
    index("student_cert_number_idx").on(t.institutionId, t.certificateNumber),
    index("student_cert_code_idx").on(t.institutionId, t.verificationCode),
  ],
);

export const campusAnnouncements = sqliteTable(
  "campus_announcements",
  {
    id: id(),
    ...tenant(),
    title: text("title").notNull(),
    content: text("content").notNull(),
    category: text("category").notNull().default("General"),
    priority: text("priority").notNull().default("Normal"),
    targetScope: text("target_scope").notNull().default("All"),
    departmentId: text("department_id"),
    programId: text("program_id"),
    classId: text("class_id"),
    sectionId: text("section_id"),
    studentGroup: text("student_group").notNull().default(""),
    attachments: text("attachments").notNull().default("[]"),
    isPinned: integer("is_pinned").notNull().default(0),
    publishedAt: text("published_at").notNull(),
    expiresAt: text("expires_at"),
    authorName: text("author_name").notNull().default(""),
    ...time(),
  },
  (t) => [
    index("campus_announcements_scope_idx").on(
      t.institutionId,
      t.targetScope,
      t.publishedAt,
    ),
    index("campus_announcements_cat_idx").on(t.institutionId, t.category),
  ],
);

export const studentAnnouncementReads = sqliteTable(
  "student_announcement_reads",
  {
    id: id(),
    ...tenant(),
    announcementId: text("announcement_id")
      .notNull()
      .references(() => campusAnnouncements.id),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id),
    readAt: text("read_at").notNull(),
  },
  (t) => [
    uniqueIndex("student_ann_reads_unique_idx").on(
      t.institutionId,
      t.announcementId,
      t.studentId,
    ),
    index("student_ann_reads_student_idx").on(t.institutionId, t.studentId),
  ],
);

export const studentPortalNotifications = sqliteTable(
  "student_portal_notifications",
  {
    id: id(),
    ...tenant(),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id),
    type: text("type").notNull().default("General"),
    title: text("title").notNull(),
    message: text("message").notNull(),
    actionUrl: text("action_url").notNull().default(""),
    isRead: integer("is_read").notNull().default(0),
    readAt: text("read_at"),
    ...time(),
  },
  (t) => [
    index("student_notif_student_idx").on(t.institutionId, t.studentId),
    index("student_notif_read_idx").on(
      t.institutionId,
      t.studentId,
      t.isRead,
    ),
  ],
);

export const studentConversations = sqliteTable(
  "student_conversations",
  {
    id: id(),
    ...tenant(),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id),
    participantType: text("participant_type").notNull().default("Faculty"),
    participantId: text("participant_id").notNull(),
    participantName: text("participant_name").notNull().default(""),
    participantRole: text("participant_role").notNull().default(""),
    subject: text("subject").notNull().default(""),
    lastMessageAt: text("last_message_at").notNull(),
    lastMessagePreview: text("last_message_preview").notNull().default(""),
    unreadCountStudent: integer("unread_count_student").notNull().default(0),
    unreadCountParticipant: integer("unread_count_participant")
      .notNull()
      .default(0),
    status: text("status").notNull().default("Active"),
    ...time(),
  },
  (t) => [
    index("student_conv_student_idx").on(t.institutionId, t.studentId),
    index("student_conv_participant_idx").on(
      t.institutionId,
      t.participantId,
    ),
  ],
);

export const studentMessages = sqliteTable(
  "student_messages",
  {
    id: id(),
    ...tenant(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => studentConversations.id),
    senderType: text("sender_type").notNull(),
    senderId: text("sender_id").notNull(),
    senderName: text("sender_name").notNull().default(""),
    content: text("content").notNull(),
    attachments: text("attachments").notNull().default("[]"),
    readAt: text("read_at"),
    isReported: integer("is_reported").notNull().default(0),
    reportReason: text("report_reason").notNull().default(""),
    ...time(),
  },
  (t) => [
    index("student_msgs_conv_idx").on(t.institutionId, t.conversationId),
    index("student_msgs_sender_idx").on(t.institutionId, t.senderId),
  ],
);

export const campusEvents = sqliteTable(
  "campus_events",
  {
    id: id(),
    ...tenant(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    category: text("category").notNull().default("Academic"),
    location: text("location").notNull().default(""),
    startDate: text("start_date").notNull(),
    endDate: text("end_date").notNull(),
    isAllDay: integer("is_all_day").notNull().default(0),
    targetScope: text("target_scope").notNull().default("All"),
    departmentId: text("department_id"),
    maxParticipants: integer("max_participants").notNull().default(0),
    registrationDeadline: text("registration_deadline"),
    status: text("status").notNull().default("Upcoming"),
    imageUrl: text("image_url").notNull().default(""),
    ...time(),
  },
  (t) => [
    index("campus_events_date_idx").on(t.institutionId, t.startDate),
    index("campus_events_status_idx").on(t.institutionId, t.status),
  ],
);

export const studentEventRegistrations = sqliteTable(
  "student_event_registrations",
  {
    id: id(),
    ...tenant(),
    eventId: text("event_id")
      .notNull()
      .references(() => campusEvents.id),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id),
    status: text("status").notNull().default("Registered"),
    registeredAt: text("registered_at").notNull(),
    attendanceStatus: text("attendance_status")
      .notNull()
      .default("Pending"),
    attendedAt: text("attended_at"),
    reminderEnabled: integer("reminder_enabled").notNull().default(1),
    reminderMinutesBefore: integer("reminder_minutes_before")
      .notNull()
      .default(60),
    reminderSentAt: text("reminder_sent_at"),
    notes: text("notes").notNull().default(""),
    ...time(),
  },
  (t) => [
    uniqueIndex("student_event_reg_unique_idx").on(
      t.institutionId,
      t.eventId,
      t.studentId,
    ),
    index("student_event_reg_student_idx").on(t.institutionId, t.studentId),
  ],
);

export const studentTickets = sqliteTable(
  "student_tickets",
  {
    id: id(),
    ...tenant(),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id),
    ticketNumber: text("ticket_number").notNull(),
    category: text("category").notNull().default("General"),
    subject: text("subject").notNull(),
    description: text("description").notNull(),
    priority: text("priority").notNull().default("Medium"),
    status: text("status").notNull().default("Open"),
    assignedTo: text("assigned_to"),
    assignedToName: text("assigned_to_name").notNull().default(""),
    resolvedAt: text("resolved_at"),
    resolutionNotes: text("resolution_notes").notNull().default(""),
    closedAt: text("closed_at"),
    ...time(),
  },
  (t) => [
    index("student_tickets_student_idx").on(t.institutionId, t.studentId),
    uniqueIndex("student_tickets_number_idx").on(
      t.institutionId,
      t.ticketNumber,
    ),
    index("student_tickets_status_idx").on(t.institutionId, t.status),
  ],
);

export const studentTicketMessages = sqliteTable(
  "student_ticket_messages",
  {
    id: id(),
    ...tenant(),
    ticketId: text("ticket_id")
      .notNull()
      .references(() => studentTickets.id),
    senderType: text("sender_type").notNull(),
    senderId: text("sender_id").notNull(),
    senderName: text("sender_name").notNull().default(""),
    message: text("message").notNull(),
    attachments: text("attachments").notNull().default("[]"),
    ...time(),
  },
  (t) => [
    index("student_ticket_msgs_ticket_idx").on(t.institutionId, t.ticketId),
  ],
);

export const studentTicketStatusHistory = sqliteTable(
  "student_ticket_status_history",
  {
    id: id(),
    ...tenant(),
    ticketId: text("ticket_id")
      .notNull()
      .references(() => studentTickets.id),
    oldStatus: text("old_status").notNull(),
    newStatus: text("new_status").notNull(),
    changedBy: text("changed_by").notNull(),
    changedByName: text("changed_by_name").notNull().default(""),
    changeReason: text("change_reason").notNull().default(""),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    index("student_ticket_hist_ticket_idx").on(t.institutionId, t.ticketId),
  ],
);

export const studentFeedbackSubmissions = sqliteTable(
  "student_feedback_submissions",
  {
    id: id(),
    ...tenant(),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id),
    feedbackType: text("feedback_type").notNull().default("General"),
    targetId: text("target_id"),
    targetName: text("target_name").notNull().default(""),
    rating: integer("rating").notNull().default(5),
    title: text("title").notNull().default(""),
    comments: text("comments").notNull(),
    isAnonymous: integer("is_anonymous").notNull().default(0),
    status: text("status").notNull().default("Submitted"),
    responseNotes: text("response_notes").notNull().default(""),
    reviewedBy: text("reviewed_by"),
    reviewedAt: text("reviewed_at"),
    ...time(),
  },
  (t) => [
    index("student_feedback_student_idx").on(t.institutionId, t.studentId),
    index("student_feedback_type_idx").on(
      t.institutionId,
      t.feedbackType,
    ),
  ],
);

export const studentPersonalDeadlines = sqliteTable(
  "student_personal_deadlines",
  {
    id: id(),
    ...tenant(),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    dueDate: text("due_date").notNull(),
    category: text("category").notNull().default("Personal"),
    priority: text("priority").notNull().default("Medium"),
    isCompleted: integer("is_completed").notNull().default(0),
    completedAt: text("completed_at"),
    reminderDate: text("reminder_date"),
    ...time(),
  },
  (t) => [
    index("student_deadlines_student_idx").on(t.institutionId, t.studentId),
    index("student_deadlines_due_idx").on(
      t.institutionId,
      t.studentId,
      t.dueDate,
    ),
  ],
);

export const studentPortalSettings = sqliteTable(
  "student_portal_settings",
  {
    id: id(),
    ...tenant(),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id),
    theme: text("theme").notNull().default("system"),
    language: text("language").notNull().default("en"),
    emailNotifications: integer("email_notifications").notNull().default(1),
    smsNotifications: integer("sms_notifications").notNull().default(0),
    pushNotifications: integer("push_notifications").notNull().default(1),
    feeAlerts: integer("fee_alerts").notNull().default(1),
    examAlerts: integer("exam_alerts").notNull().default(1),
    assignmentAlerts: integer("assignment_alerts").notNull().default(1),
    eventAlerts: integer("event_alerts").notNull().default(1),
    compactView: integer("compact_view").notNull().default(0),
    ...time(),
  },
  (t) => [
    uniqueIndex("student_settings_student_idx").on(
      t.institutionId,
      t.studentId,
    ),
  ],
);

