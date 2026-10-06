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
