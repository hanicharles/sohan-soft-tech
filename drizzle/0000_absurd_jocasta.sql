CREATE TABLE `academic_years` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`name` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`status` text DEFAULT 'Draft' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `year_name` ON `academic_years` (`institution_id`,`name`);--> statement-breakpoint
CREATE TABLE `fee_adjustments` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`student_id` text NOT NULL,
	`academic_year_id` text NOT NULL,
	`invoice_id` text NOT NULL,
	`installment_id` text NOT NULL,
	`component_id` text,
	`benefit_id` text,
	`kind` text NOT NULL,
	`amount_paise` integer NOT NULL,
	`reason` text NOT NULL,
	`approved_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`installment_id`) REFERENCES `installments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `student_fee_assignments` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`student_id` text NOT NULL,
	`academic_year_id` text NOT NULL,
	`structure_id` text NOT NULL,
	`discount_paise` integer DEFAULT 0 NOT NULL,
	`scholarship_paise` integer DEFAULT 0 NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`structure_id`) REFERENCES `fee_structures`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `assignment_unique` ON `student_fee_assignments` (`institution_id`,`student_id`,`academic_year_id`,`structure_id`);--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`user_id` text NOT NULL,
	`user_name` text NOT NULL,
	`action` text NOT NULL,
	`entity` text NOT NULL,
	`entity_id` text NOT NULL,
	`old_value` text,
	`new_value` text,
	`ip` text,
	`user_agent` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `audit_tenant_time` ON `audit_logs` (`institution_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `benefits` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`calculation` text DEFAULT 'Fixed' NOT NULL,
	`value` integer NOT NULL,
	`component_id` text,
	`installment_index` integer,
	`recurring` integer DEFAULT 0 NOT NULL,
	`auto_apply` integer DEFAULT 0 NOT NULL,
	`eligibility` text DEFAULT '' NOT NULL,
	`valid_until` text,
	`status` text DEFAULT 'Active' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`component_id`) REFERENCES `fee_components`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `campuses` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`name` text NOT NULL,
	`address` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `campus_name` ON `campuses` (`institution_id`,`name`);--> statement-breakpoint
CREATE TABLE `cash_closings` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`campus_id` text NOT NULL,
	`entry_date` text NOT NULL,
	`expected_paise` integer NOT NULL,
	`counted_paise` integer NOT NULL,
	`variance_paise` integer NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`campus_id`) REFERENCES `campuses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cash_close_day` ON `cash_closings` (`institution_id`,`campus_id`,`entry_date`);--> statement-breakpoint
CREATE TABLE `cash_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`campus_id` text NOT NULL,
	`academic_year_id` text NOT NULL,
	`kind` text NOT NULL,
	`amount_paise` integer NOT NULL,
	`entry_date` text NOT NULL,
	`reference` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`campus_id`) REFERENCES `campuses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `classes` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`name` text NOT NULL,
	`level` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`department` text,
	`active` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `class_name` ON `classes` (`institution_id`,`name`);--> statement-breakpoint
CREATE TABLE `enrollments` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`student_id` text NOT NULL,
	`academic_year_id` text NOT NULL,
	`section_id` text NOT NULL,
	`roll_number` text,
	`clearance` text DEFAULT 'Pending' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`section_id`) REFERENCES `sections`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `student_year` ON `enrollments` (`institution_id`,`student_id`,`academic_year_id`);--> statement-breakpoint
CREATE INDEX `enrollment_scope` ON `enrollments` (`institution_id`,`academic_year_id`,`section_id`);--> statement-breakpoint
CREATE TABLE `fee_components` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`name` text NOT NULL,
	`category` text DEFAULT 'Academic' NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `fee_component_name` ON `fee_components` (`institution_id`,`name`);--> statement-breakpoint
CREATE TABLE `fee_structure_items` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`structure_id` text NOT NULL,
	`component_id` text NOT NULL,
	`amount_paise` integer NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`structure_id`) REFERENCES `fee_structures`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`component_id`) REFERENCES `fee_components`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `fee_structures` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`academic_year_id` text NOT NULL,
	`class_id` text NOT NULL,
	`section_id` text,
	`stream_id` text,
	`name` text NOT NULL,
	`frequency` text DEFAULT 'Quarterly' NOT NULL,
	`schedule` text NOT NULL,
	`status` text DEFAULT 'Active' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`section_id`) REFERENCES `sections`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`stream_id`) REFERENCES `streams`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `structure_scope` ON `fee_structures` (`institution_id`,`academic_year_id`,`class_id`);--> statement-breakpoint
CREATE TABLE `gateway_events` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`gateway` text NOT NULL,
	`event_id` text NOT NULL,
	`payload_hash` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `gateway_event_unique` ON `gateway_events` (`gateway`,`event_id`);--> statement-breakpoint
CREATE TABLE `installments` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`invoice_id` text NOT NULL,
	`student_id` text NOT NULL,
	`academic_year_id` text NOT NULL,
	`title` text NOT NULL,
	`amount_paise` integer NOT NULL,
	`due_date` text NOT NULL,
	`sort_order` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `installment_due` ON `installments` (`institution_id`,`academic_year_id`,`due_date`);--> statement-breakpoint
CREATE TABLE `institutions` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`address` text DEFAULT '' NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`gstin` text,
	`logo_key` text,
	`subscription` text DEFAULT 'Professional' NOT NULL,
	`status` text DEFAULT 'Active' NOT NULL,
	`settings` text DEFAULT '{}' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `institutions_slug_unique` ON `institutions` (`slug`);--> statement-breakpoint
CREATE TABLE `invitations` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`email` text NOT NULL,
	`role` text NOT NULL,
	`parent_id` text,
	`student_id` text,
	`section_id` text,
	`fee_visibility` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'Pending' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invitation_email` ON `invitations` (`institution_id`,`email`);--> statement-breakpoint
CREATE TABLE `invoice_items` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`invoice_id` text NOT NULL,
	`component_id` text NOT NULL,
	`name` text NOT NULL,
	`amount_paise` integer NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`component_id`) REFERENCES `fee_components`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `invoices` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`student_id` text NOT NULL,
	`academic_year_id` text NOT NULL,
	`assignment_id` text NOT NULL,
	`number` text,
	`gross_paise` integer NOT NULL,
	`discount_paise` integer DEFAULT 0 NOT NULL,
	`scholarship_paise` integer DEFAULT 0 NOT NULL,
	`net_paise` integer NOT NULL,
	`issued_date` text NOT NULL,
	`due_date` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`assignment_id`) REFERENCES `student_fee_assignments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invoices_assignment_id_unique` ON `invoices` (`assignment_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `invoice_number` ON `invoices` (`institution_id`,`number`);--> statement-breakpoint
CREATE INDEX `invoice_scope` ON `invoices` (`institution_id`,`academic_year_id`,`student_id`);--> statement-breakpoint
CREATE TABLE `job_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`kind` text NOT NULL,
	`run_key` text NOT NULL,
	`status` text NOT NULL,
	`result` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `job_run_key` ON `job_runs` (`institution_id`,`kind`,`run_key`);--> statement-breakpoint
CREATE TABLE `late_fee_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`installment_id` text NOT NULL,
	`period` text NOT NULL,
	`amount_paise` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`installment_id`) REFERENCES `installments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `late_fee_period` ON `late_fee_runs` (`institution_id`,`installment_id`,`period`);--> statement-breakpoint
CREATE TABLE `ledger_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`student_id` text NOT NULL,
	`academic_year_id` text NOT NULL,
	`invoice_id` text,
	`payment_id` text,
	`refund_id` text,
	`adjustment_id` text,
	`kind` text NOT NULL,
	`description` text NOT NULL,
	`debit_paise` integer DEFAULT 0 NOT NULL,
	`credit_paise` integer DEFAULT 0 NOT NULL,
	`entry_date` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`refund_id`) REFERENCES `refunds`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`adjustment_id`) REFERENCES `fee_adjustments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `ledger_student_year` ON `ledger_entries` (`institution_id`,`student_id`,`academic_year_id`,`entry_date`);--> statement-breakpoint
CREATE TABLE `memberships` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`parent_id` text,
	`student_id` text,
	`section_id` text,
	`fee_visibility` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`parent_id`) REFERENCES `parents`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`section_id`) REFERENCES `sections`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `membership_user` ON `memberships` (`institution_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`academic_year_id` text,
	`parent_id` text,
	`student_id` text,
	`recipient` text NOT NULL,
	`channel` text NOT NULL,
	`message` text NOT NULL,
	`status` text DEFAULT 'Queued' NOT NULL,
	`reference_id` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`sent_at` text,
	`delivered_at` text,
	`dedupe_key` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`parent_id`) REFERENCES `parents`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notification_dedupe` ON `notifications` (`institution_id`,`dedupe_key`);--> statement-breakpoint
CREATE INDEX `notification_queue` ON `notifications` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `parents` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`father_name` text DEFAULT '' NOT NULL,
	`mother_name` text DEFAULT '' NOT NULL,
	`guardian_name` text NOT NULL,
	`mobile` text NOT NULL,
	`alternate_mobile` text,
	`email` text,
	`address` text DEFAULT '' NOT NULL,
	`occupation` text DEFAULT '' NOT NULL,
	`relationship` text DEFAULT 'Father' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `parent_contact` ON `parents` (`institution_id`,`mobile`);--> statement-breakpoint
CREATE TABLE `payment_allocations` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`payment_id` text NOT NULL,
	`invoice_id` text NOT NULL,
	`installment_id` text NOT NULL,
	`amount_paise` integer NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`installment_id`) REFERENCES `installments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `payment_intents` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`payment_id` text NOT NULL,
	`allocations` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payment_intents_payment_id_unique` ON `payment_intents` (`payment_id`);--> statement-breakpoint
CREATE TABLE `payment_links` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`student_id` text NOT NULL,
	`academic_year_id` text NOT NULL,
	`amount_paise` integer NOT NULL,
	`expires_at` text NOT NULL,
	`status` text DEFAULT 'Active' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payment_links_token_hash_unique` ON `payment_links` (`token_hash`);--> statement-breakpoint
CREATE TABLE `payments` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`student_id` text NOT NULL,
	`academic_year_id` text NOT NULL,
	`amount_paise` integer NOT NULL,
	`method` text NOT NULL,
	`status` text NOT NULL,
	`reference` text,
	`idempotency_key` text NOT NULL,
	`request_hash` text NOT NULL,
	`gateway` text,
	`gateway_order_id` text,
	`gateway_transaction_id` text,
	`paid_at` text NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payment_idempotency` ON `payments` (`institution_id`,`idempotency_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `gateway_transaction` ON `payments` (`gateway`,`gateway_transaction_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `gateway_order` ON `payments` (`gateway`,`gateway_order_id`);--> statement-breakpoint
CREATE INDEX `payment_scope` ON `payments` (`institution_id`,`academic_year_id`,`paid_at`);--> statement-breakpoint
CREATE TABLE `platform` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`window` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`payment_id` text NOT NULL,
	`academic_year_id` text NOT NULL,
	`number` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `receipts_payment_id_unique` ON `receipts` (`payment_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `receipt_number` ON `receipts` (`institution_id`,`number`);--> statement-breakpoint
CREATE TABLE `reconciliation_records` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`academic_year_id` text NOT NULL,
	`transaction_id` text NOT NULL,
	`amount_paise` integer NOT NULL,
	`transaction_date` text NOT NULL,
	`student_id` text,
	`invoice_id` text,
	`payment_id` text,
	`status` text NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`import_batch` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `reconciliation_scope` ON `reconciliation_records` (`institution_id`,`academic_year_id`,`transaction_id`);--> statement-breakpoint
CREATE TABLE `refund_allocations` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`refund_id` text NOT NULL,
	`allocation_id` text NOT NULL,
	`installment_id` text NOT NULL,
	`amount_paise` integer NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`refund_id`) REFERENCES `refunds`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`allocation_id`) REFERENCES `payment_allocations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`installment_id`) REFERENCES `installments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `refunds` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`student_id` text NOT NULL,
	`academic_year_id` text NOT NULL,
	`payment_id` text NOT NULL,
	`amount_paise` integer NOT NULL,
	`method` text NOT NULL,
	`reference` text,
	`reason` text NOT NULL,
	`status` text DEFAULT 'Requested' NOT NULL,
	`approved_by` text,
	`refunded_at` text,
	`idempotency_key` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `refund_idempotency` ON `refunds` (`institution_id`,`idempotency_key`);--> statement-breakpoint
CREATE TABLE `sections` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`academic_year_id` text NOT NULL,
	`class_id` text NOT NULL,
	`campus_id` text NOT NULL,
	`stream_id` text,
	`name` text NOT NULL,
	`capacity` integer DEFAULT 40 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`campus_id`) REFERENCES `campuses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`stream_id`) REFERENCES `streams`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `section_scope` ON `sections` (`institution_id`,`academic_year_id`,`class_id`);--> statement-breakpoint
CREATE TABLE `streams` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`name` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `stream_name` ON `streams` (`institution_id`,`name`);--> statement-breakpoint
CREATE TABLE `student_parents` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`student_id` text NOT NULL,
	`parent_id` text NOT NULL,
	`is_primary` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`parent_id`) REFERENCES `parents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `student_parent_link` ON `student_parents` (`institution_id`,`student_id`,`parent_id`);--> statement-breakpoint
CREATE TABLE `students` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`admission_number` text NOT NULL,
	`name` text NOT NULL,
	`dob` text,
	`gender` text DEFAULT 'Not specified' NOT NULL,
	`photo_key` text,
	`aadhaar_last4` text,
	`blood_group` text,
	`admission_date` text NOT NULL,
	`previous_school` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'Active' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `student_admission` ON `students` (`institution_id`,`admission_number`);--> statement-breakpoint
CREATE INDEX `student_name` ON `students` (`institution_id`,`name`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL
);

--> statement-breakpoint
-- CampusLedger safeguards
CREATE VIEW installment_balances AS SELECT t.*,t.amount_paise+t.adjustment_paise total_paise,MAX(0,t.amount_paise+t.adjustment_paise-t.paid_paise) outstanding_paise,CASE WHEN t.amount_paise+t.adjustment_paise<=t.paid_paise THEN 'Paid' WHEN t.paid_paise>0 THEN 'Partial' WHEN t.due_date<date('now','+5 hours','+30 minutes') THEN 'Overdue' ELSE 'Upcoming' END status FROM (SELECT i.*,COALESCE((SELECT SUM(a.amount_paise) FROM fee_adjustments a WHERE a.installment_id=i.id),0) adjustment_paise,COALESCE((SELECT SUM(pa.amount_paise) FROM payment_allocations pa JOIN payments p ON p.id=pa.payment_id WHERE pa.installment_id=i.id AND p.status IN ('Successful','Partially Refunded','Refunded')),0)-COALESCE((SELECT SUM(ra.amount_paise) FROM refund_allocations ra JOIN refunds r ON r.id=ra.refund_id WHERE ra.installment_id=i.id AND r.status='Processed'),0) paid_paise FROM installments i) t;
--> statement-breakpoint
CREATE VIEW invoice_balances AS SELECT inv.*,COALESCE(a.total_paise,inv.net_paise) total_paise,COALESCE(a.paid_paise,0) paid_paise,COALESCE(a.outstanding_paise,inv.net_paise) outstanding_paise,CASE WHEN COALESCE(a.outstanding_paise,inv.net_paise)=0 THEN 'Paid' WHEN COALESCE(a.paid_paise,0)>0 THEN 'Partial' WHEN inv.due_date<date('now','+5 hours','+30 minutes') THEN 'Overdue' ELSE 'Unpaid' END status FROM invoices inv LEFT JOIN (SELECT invoice_id,SUM(total_paise) total_paise,SUM(paid_paise) paid_paise,SUM(outstanding_paise) outstanding_paise FROM installment_balances GROUP BY invoice_id) a ON a.invoice_id=inv.id;
--> statement-breakpoint
CREATE VIEW student_balances AS SELECT institution_id,student_id,academic_year_id,SUM(total_paise) total_paise,SUM(paid_paise) paid_paise,SUM(outstanding_paise) outstanding_paise,SUM(CASE WHEN due_date<date('now','+5 hours','+30 minutes') THEN outstanding_paise ELSE 0 END) overdue_paise,MIN(CASE WHEN outstanding_paise>0 THEN due_date END) next_due_date FROM installment_balances GROUP BY institution_id,student_id,academic_year_id;
--> statement-breakpoint
CREATE TABLE document_counters (institution_id TEXT NOT NULL,academic_year_id TEXT NOT NULL,kind TEXT NOT NULL,value INTEGER NOT NULL,PRIMARY KEY(institution_id,academic_year_id,kind));
--> statement-breakpoint
CREATE TRIGGER invoice_number_after_insert AFTER INSERT ON invoices BEGIN INSERT INTO document_counters(institution_id,academic_year_id,kind,value) VALUES(NEW.institution_id,NEW.academic_year_id,'INV',1) ON CONFLICT(institution_id,academic_year_id,kind) DO UPDATE SET value=value+1; UPDATE invoices SET number='INV/'||(SELECT replace(name,'–','-') FROM academic_years WHERE id=NEW.academic_year_id)||'/'||printf('%06d',(SELECT value FROM document_counters WHERE institution_id=NEW.institution_id AND academic_year_id=NEW.academic_year_id AND kind='INV')) WHERE id=NEW.id; END;
--> statement-breakpoint
CREATE TRIGGER receipt_number_after_insert AFTER INSERT ON receipts BEGIN INSERT INTO document_counters(institution_id,academic_year_id,kind,value) VALUES(NEW.institution_id,NEW.academic_year_id,'REC',1) ON CONFLICT(institution_id,academic_year_id,kind) DO UPDATE SET value=value+1; UPDATE receipts SET number='REC/'||(SELECT replace(name,'–','-') FROM academic_years WHERE id=NEW.academic_year_id)||'/'||printf('%06d',(SELECT value FROM document_counters WHERE institution_id=NEW.institution_id AND academic_year_id=NEW.academic_year_id AND kind='REC')) WHERE id=NEW.id; END;
--> statement-breakpoint
CREATE TRIGGER invoice_amount_guard BEFORE INSERT ON invoices BEGIN SELECT (CASE WHEN NEW.net_paise<0 OR NEW.gross_paise<0 OR NEW.discount_paise<0 OR NEW.scholarship_paise<0 OR NEW.net_paise!=NEW.gross_paise-NEW.discount_paise-NEW.scholarship_paise THEN RAISE(ABORT,'INVALID_INVOICE_TOTAL') END); END;
--> statement-breakpoint
CREATE TRIGGER allocation_guard BEFORE INSERT ON payment_allocations BEGIN SELECT (CASE WHEN NEW.amount_paise<=0 OR NOT EXISTS(SELECT 1 FROM payments p JOIN installments i ON i.id=NEW.installment_id WHERE p.id=NEW.payment_id AND p.institution_id=NEW.institution_id AND i.institution_id=NEW.institution_id AND p.student_id=i.student_id AND p.academic_year_id=i.academic_year_id AND i.invoice_id=NEW.invoice_id AND p.status='Successful') THEN RAISE(ABORT,'INVALID_ALLOCATION') END); SELECT (CASE WHEN NEW.amount_paise+COALESCE((SELECT SUM(amount_paise) FROM payment_allocations WHERE payment_id=NEW.payment_id),0)>(SELECT amount_paise FROM payments WHERE id=NEW.payment_id) OR NEW.amount_paise>(SELECT outstanding_paise FROM installment_balances WHERE id=NEW.installment_id) THEN RAISE(ABORT,'OVERPAYMENT') END); END;
--> statement-breakpoint
CREATE TRIGGER receipt_guard BEFORE INSERT ON receipts BEGIN SELECT (CASE WHEN (SELECT amount_paise FROM payments WHERE id=NEW.payment_id)!=COALESCE((SELECT SUM(amount_paise) FROM payment_allocations WHERE payment_id=NEW.payment_id),0) OR NOT EXISTS(SELECT 1 FROM ledger_entries l JOIN payments p ON p.id=l.payment_id WHERE p.id=NEW.payment_id AND l.kind='Payment' AND l.credit_paise=p.amount_paise AND l.institution_id=NEW.institution_id AND l.student_id=p.student_id AND l.academic_year_id=p.academic_year_id) THEN RAISE(ABORT,'INCOMPLETE_PAYMENT_TRANSACTION') END); END;
--> statement-breakpoint
CREATE TRIGGER adjustment_guard BEFORE INSERT ON fee_adjustments BEGIN SELECT (CASE WHEN NEW.amount_paise=0 OR NEW.amount_paise<0 AND -NEW.amount_paise>(SELECT outstanding_paise FROM installment_balances WHERE id=NEW.installment_id) THEN RAISE(ABORT,'INVALID_ADJUSTMENT') END); END;
--> statement-breakpoint
CREATE TRIGGER ledger_guard BEFORE INSERT ON ledger_entries BEGIN SELECT (CASE WHEN NEW.debit_paise<0 OR NEW.credit_paise<0 OR (NEW.debit_paise>0 AND NEW.credit_paise>0) THEN RAISE(ABORT,'INVALID_LEDGER_ENTRY') END); END;
--> statement-breakpoint
CREATE TRIGGER refund_amount_guard BEFORE INSERT ON refunds BEGIN SELECT (CASE WHEN NEW.amount_paise<=0 OR NEW.amount_paise+COALESCE((SELECT SUM(amount_paise) FROM refunds WHERE payment_id=NEW.payment_id AND status IN ('Requested','Approved','Processed')),0)>(SELECT amount_paise FROM payments WHERE id=NEW.payment_id) THEN RAISE(ABORT,'REFUND_TOO_LARGE') END); END;
--> statement-breakpoint
CREATE TRIGGER refund_allocation_guard BEFORE INSERT ON refund_allocations BEGIN SELECT (CASE WHEN NEW.amount_paise<=0 OR NEW.amount_paise+COALESCE((SELECT SUM(ra.amount_paise) FROM refund_allocations ra JOIN refunds r ON r.id=ra.refund_id WHERE ra.allocation_id=NEW.allocation_id AND r.status='Processed'),0)>(SELECT amount_paise FROM payment_allocations WHERE id=NEW.allocation_id) OR NOT EXISTS(SELECT 1 FROM refunds r JOIN payment_allocations a ON a.payment_id=r.payment_id WHERE r.id=NEW.refund_id AND a.id=NEW.allocation_id AND a.installment_id=NEW.installment_id AND r.institution_id=NEW.institution_id AND a.institution_id=NEW.institution_id) THEN RAISE(ABORT,'INVALID_REFUND_ALLOCATION') END); END;
--> statement-breakpoint
CREATE TRIGGER immutable_payment_financials BEFORE UPDATE OF institution_id,student_id,academic_year_id,amount_paise,method,idempotency_key,request_hash ON payments BEGIN SELECT RAISE(ABORT,'IMMUTABLE_PAYMENT'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_invoice_financials BEFORE UPDATE OF institution_id,student_id,academic_year_id,assignment_id,gross_paise,discount_paise,scholarship_paise,net_paise ON invoices BEGIN SELECT RAISE(ABORT,'IMMUTABLE_INVOICE'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_installment_amount BEFORE UPDATE OF institution_id,student_id,academic_year_id,invoice_id,amount_paise ON installments BEGIN SELECT RAISE(ABORT,'IMMUTABLE_INSTALLMENT'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_ledger_entries_update BEFORE UPDATE ON ledger_entries BEGIN SELECT RAISE(ABORT,'IMMUTABLE_FINANCIAL_RECORD'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_ledger_entries_delete BEFORE DELETE ON ledger_entries BEGIN SELECT RAISE(ABORT,'IMMUTABLE_FINANCIAL_RECORD'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_payment_allocations_update BEFORE UPDATE ON payment_allocations BEGIN SELECT RAISE(ABORT,'IMMUTABLE_FINANCIAL_RECORD'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_payment_allocations_delete BEFORE DELETE ON payment_allocations BEGIN SELECT RAISE(ABORT,'IMMUTABLE_FINANCIAL_RECORD'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_refund_allocations_update BEFORE UPDATE ON refund_allocations BEGIN SELECT RAISE(ABORT,'IMMUTABLE_FINANCIAL_RECORD'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_refund_allocations_delete BEFORE DELETE ON refund_allocations BEGIN SELECT RAISE(ABORT,'IMMUTABLE_FINANCIAL_RECORD'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_fee_adjustments_update BEFORE UPDATE ON fee_adjustments BEGIN SELECT RAISE(ABORT,'IMMUTABLE_FINANCIAL_RECORD'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_fee_adjustments_delete BEFORE DELETE ON fee_adjustments BEGIN SELECT RAISE(ABORT,'IMMUTABLE_FINANCIAL_RECORD'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_invoice_items_update BEFORE UPDATE ON invoice_items BEGIN SELECT RAISE(ABORT,'IMMUTABLE_FINANCIAL_RECORD'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_invoice_items_delete BEFORE DELETE ON invoice_items BEGIN SELECT RAISE(ABORT,'IMMUTABLE_FINANCIAL_RECORD'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_student_fee_assignments_update BEFORE UPDATE ON student_fee_assignments BEGIN SELECT RAISE(ABORT,'IMMUTABLE_FINANCIAL_RECORD'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_student_fee_assignments_delete BEFORE DELETE ON student_fee_assignments BEGIN SELECT RAISE(ABORT,'IMMUTABLE_FINANCIAL_RECORD'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_audit_logs_update BEFORE UPDATE ON audit_logs BEGIN SELECT RAISE(ABORT,'IMMUTABLE_FINANCIAL_RECORD'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_audit_logs_delete BEFORE DELETE ON audit_logs BEGIN SELECT RAISE(ABORT,'IMMUTABLE_FINANCIAL_RECORD'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_cash_entries_update BEFORE UPDATE ON cash_entries BEGIN SELECT RAISE(ABORT,'IMMUTABLE_FINANCIAL_RECORD'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_cash_entries_delete BEFORE DELETE ON cash_entries BEGIN SELECT RAISE(ABORT,'IMMUTABLE_FINANCIAL_RECORD'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_cash_closings_update BEFORE UPDATE ON cash_closings BEGIN SELECT RAISE(ABORT,'IMMUTABLE_FINANCIAL_RECORD'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_cash_closings_delete BEFORE DELETE ON cash_closings BEGIN SELECT RAISE(ABORT,'IMMUTABLE_FINANCIAL_RECORD'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_payments_delete BEFORE DELETE ON payments BEGIN SELECT RAISE(ABORT,'IMMUTABLE_FINANCIAL_RECORD'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_invoices_delete BEFORE DELETE ON invoices BEGIN SELECT RAISE(ABORT,'IMMUTABLE_FINANCIAL_RECORD'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_receipts_delete BEFORE DELETE ON receipts BEGIN SELECT RAISE(ABORT,'IMMUTABLE_FINANCIAL_RECORD'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_refunds_delete BEFORE DELETE ON refunds BEGIN SELECT RAISE(ABORT,'IMMUTABLE_FINANCIAL_RECORD'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_installments_delete BEFORE DELETE ON installments BEGIN SELECT RAISE(ABORT,'IMMUTABLE_FINANCIAL_RECORD'); END;
--> statement-breakpoint
CREATE TRIGGER tenant_fee_adjustments_insert BEFORE INSERT ON fee_adjustments BEGIN SELECT (CASE WHEN NEW.student_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM students t WHERE t.id=NEW.student_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.academic_year_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM academic_years t WHERE t.id=NEW.academic_year_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.invoice_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM invoices t WHERE t.id=NEW.invoice_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.installment_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM installments t WHERE t.id=NEW.installment_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); END;
--> statement-breakpoint
CREATE TRIGGER tenant_fee_adjustments_update BEFORE UPDATE ON fee_adjustments BEGIN SELECT (CASE WHEN NEW.student_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM students t WHERE t.id=NEW.student_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.academic_year_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM academic_years t WHERE t.id=NEW.academic_year_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.invoice_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM invoices t WHERE t.id=NEW.invoice_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.installment_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM installments t WHERE t.id=NEW.installment_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); END;
--> statement-breakpoint
CREATE TRIGGER tenant_student_fee_assignments_insert BEFORE INSERT ON student_fee_assignments BEGIN SELECT (CASE WHEN NEW.student_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM students t WHERE t.id=NEW.student_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.academic_year_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM academic_years t WHERE t.id=NEW.academic_year_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.structure_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM fee_structures t WHERE t.id=NEW.structure_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); END;
--> statement-breakpoint
CREATE TRIGGER tenant_student_fee_assignments_update BEFORE UPDATE ON student_fee_assignments BEGIN SELECT (CASE WHEN NEW.student_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM students t WHERE t.id=NEW.student_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.academic_year_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM academic_years t WHERE t.id=NEW.academic_year_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.structure_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM fee_structures t WHERE t.id=NEW.structure_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); END;
--> statement-breakpoint
CREATE TRIGGER tenant_benefits_insert BEFORE INSERT ON benefits BEGIN SELECT (CASE WHEN NEW.component_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM fee_components t WHERE t.id=NEW.component_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); END;
--> statement-breakpoint
CREATE TRIGGER tenant_benefits_update BEFORE UPDATE ON benefits BEGIN SELECT (CASE WHEN NEW.component_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM fee_components t WHERE t.id=NEW.component_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); END;
--> statement-breakpoint
CREATE TRIGGER tenant_cash_closings_insert BEFORE INSERT ON cash_closings BEGIN SELECT (CASE WHEN NEW.campus_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM campuses t WHERE t.id=NEW.campus_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); END;
--> statement-breakpoint
CREATE TRIGGER tenant_cash_closings_update BEFORE UPDATE ON cash_closings BEGIN SELECT (CASE WHEN NEW.campus_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM campuses t WHERE t.id=NEW.campus_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); END;
--> statement-breakpoint
CREATE TRIGGER tenant_cash_entries_insert BEFORE INSERT ON cash_entries BEGIN SELECT (CASE WHEN NEW.campus_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM campuses t WHERE t.id=NEW.campus_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.academic_year_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM academic_years t WHERE t.id=NEW.academic_year_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); END;
--> statement-breakpoint
CREATE TRIGGER tenant_cash_entries_update BEFORE UPDATE ON cash_entries BEGIN SELECT (CASE WHEN NEW.campus_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM campuses t WHERE t.id=NEW.campus_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.academic_year_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM academic_years t WHERE t.id=NEW.academic_year_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); END;
--> statement-breakpoint
CREATE TRIGGER tenant_enrollments_insert BEFORE INSERT ON enrollments BEGIN SELECT (CASE WHEN NEW.student_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM students t WHERE t.id=NEW.student_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.academic_year_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM academic_years t WHERE t.id=NEW.academic_year_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.section_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM sections t WHERE t.id=NEW.section_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); END;
--> statement-breakpoint
CREATE TRIGGER tenant_enrollments_update BEFORE UPDATE ON enrollments BEGIN SELECT (CASE WHEN NEW.student_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM students t WHERE t.id=NEW.student_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.academic_year_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM academic_years t WHERE t.id=NEW.academic_year_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.section_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM sections t WHERE t.id=NEW.section_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); END;
--> statement-breakpoint
CREATE TRIGGER tenant_fee_structure_items_insert BEFORE INSERT ON fee_structure_items BEGIN SELECT (CASE WHEN NEW.structure_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM fee_structures t WHERE t.id=NEW.structure_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.component_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM fee_components t WHERE t.id=NEW.component_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); END;
--> statement-breakpoint
CREATE TRIGGER tenant_fee_structure_items_update BEFORE UPDATE ON fee_structure_items BEGIN SELECT (CASE WHEN NEW.structure_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM fee_structures t WHERE t.id=NEW.structure_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.component_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM fee_components t WHERE t.id=NEW.component_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); END;
--> statement-breakpoint
CREATE TRIGGER tenant_fee_structures_insert BEFORE INSERT ON fee_structures BEGIN SELECT (CASE WHEN NEW.academic_year_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM academic_years t WHERE t.id=NEW.academic_year_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.class_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM classes t WHERE t.id=NEW.class_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.section_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM sections t WHERE t.id=NEW.section_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.stream_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM streams t WHERE t.id=NEW.stream_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); END;
--> statement-breakpoint
CREATE TRIGGER tenant_fee_structures_update BEFORE UPDATE ON fee_structures BEGIN SELECT (CASE WHEN NEW.academic_year_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM academic_years t WHERE t.id=NEW.academic_year_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.class_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM classes t WHERE t.id=NEW.class_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.section_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM sections t WHERE t.id=NEW.section_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.stream_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM streams t WHERE t.id=NEW.stream_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); END;
--> statement-breakpoint
CREATE TRIGGER tenant_installments_insert BEFORE INSERT ON installments BEGIN SELECT (CASE WHEN NEW.invoice_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM invoices t WHERE t.id=NEW.invoice_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.student_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM students t WHERE t.id=NEW.student_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.academic_year_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM academic_years t WHERE t.id=NEW.academic_year_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); END;
--> statement-breakpoint
CREATE TRIGGER tenant_installments_update BEFORE UPDATE ON installments BEGIN SELECT (CASE WHEN NEW.invoice_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM invoices t WHERE t.id=NEW.invoice_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.student_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM students t WHERE t.id=NEW.student_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.academic_year_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM academic_years t WHERE t.id=NEW.academic_year_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); END;
--> statement-breakpoint
CREATE TRIGGER tenant_invoice_items_insert BEFORE INSERT ON invoice_items BEGIN SELECT (CASE WHEN NEW.invoice_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM invoices t WHERE t.id=NEW.invoice_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.component_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM fee_components t WHERE t.id=NEW.component_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); END;
--> statement-breakpoint
CREATE TRIGGER tenant_invoice_items_update BEFORE UPDATE ON invoice_items BEGIN SELECT (CASE WHEN NEW.invoice_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM invoices t WHERE t.id=NEW.invoice_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.component_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM fee_components t WHERE t.id=NEW.component_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); END;
--> statement-breakpoint
CREATE TRIGGER tenant_invoices_insert BEFORE INSERT ON invoices BEGIN SELECT (CASE WHEN NEW.student_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM students t WHERE t.id=NEW.student_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.academic_year_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM academic_years t WHERE t.id=NEW.academic_year_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.assignment_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM student_fee_assignments t WHERE t.id=NEW.assignment_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); END;
--> statement-breakpoint
CREATE TRIGGER tenant_invoices_update BEFORE UPDATE ON invoices BEGIN SELECT (CASE WHEN NEW.student_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM students t WHERE t.id=NEW.student_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.academic_year_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM academic_years t WHERE t.id=NEW.academic_year_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.assignment_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM student_fee_assignments t WHERE t.id=NEW.assignment_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); END;
--> statement-breakpoint
CREATE TRIGGER tenant_late_fee_runs_insert BEFORE INSERT ON late_fee_runs BEGIN SELECT (CASE WHEN NEW.installment_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM installments t WHERE t.id=NEW.installment_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); END;
--> statement-breakpoint
CREATE TRIGGER tenant_late_fee_runs_update BEFORE UPDATE ON late_fee_runs BEGIN SELECT (CASE WHEN NEW.installment_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM installments t WHERE t.id=NEW.installment_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); END;
--> statement-breakpoint
CREATE TRIGGER tenant_ledger_entries_insert BEFORE INSERT ON ledger_entries BEGIN SELECT (CASE WHEN NEW.student_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM students t WHERE t.id=NEW.student_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.academic_year_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM academic_years t WHERE t.id=NEW.academic_year_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.invoice_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM invoices t WHERE t.id=NEW.invoice_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.payment_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM payments t WHERE t.id=NEW.payment_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.refund_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM refunds t WHERE t.id=NEW.refund_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.adjustment_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM fee_adjustments t WHERE t.id=NEW.adjustment_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); END;
--> statement-breakpoint
CREATE TRIGGER tenant_ledger_entries_update BEFORE UPDATE ON ledger_entries BEGIN SELECT (CASE WHEN NEW.student_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM students t WHERE t.id=NEW.student_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.academic_year_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM academic_years t WHERE t.id=NEW.academic_year_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.invoice_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM invoices t WHERE t.id=NEW.invoice_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.payment_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM payments t WHERE t.id=NEW.payment_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.refund_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM refunds t WHERE t.id=NEW.refund_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.adjustment_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM fee_adjustments t WHERE t.id=NEW.adjustment_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); END;
--> statement-breakpoint
CREATE TRIGGER tenant_memberships_insert BEFORE INSERT ON memberships BEGIN SELECT (CASE WHEN NEW.parent_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM parents t WHERE t.id=NEW.parent_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.student_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM students t WHERE t.id=NEW.student_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.section_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM sections t WHERE t.id=NEW.section_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); END;
--> statement-breakpoint
CREATE TRIGGER tenant_memberships_update BEFORE UPDATE ON memberships BEGIN SELECT (CASE WHEN NEW.parent_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM parents t WHERE t.id=NEW.parent_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.student_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM students t WHERE t.id=NEW.student_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.section_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM sections t WHERE t.id=NEW.section_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); END;
--> statement-breakpoint
CREATE TRIGGER tenant_notifications_insert BEFORE INSERT ON notifications BEGIN SELECT (CASE WHEN NEW.academic_year_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM academic_years t WHERE t.id=NEW.academic_year_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.parent_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM parents t WHERE t.id=NEW.parent_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.student_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM students t WHERE t.id=NEW.student_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); END;
--> statement-breakpoint
CREATE TRIGGER tenant_notifications_update BEFORE UPDATE ON notifications BEGIN SELECT (CASE WHEN NEW.academic_year_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM academic_years t WHERE t.id=NEW.academic_year_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.parent_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM parents t WHERE t.id=NEW.parent_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.student_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM students t WHERE t.id=NEW.student_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); END;
--> statement-breakpoint
CREATE TRIGGER tenant_payment_allocations_insert BEFORE INSERT ON payment_allocations BEGIN SELECT (CASE WHEN NEW.payment_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM payments t WHERE t.id=NEW.payment_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.invoice_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM invoices t WHERE t.id=NEW.invoice_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.installment_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM installments t WHERE t.id=NEW.installment_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); END;
--> statement-breakpoint
CREATE TRIGGER tenant_payment_allocations_update BEFORE UPDATE ON payment_allocations BEGIN SELECT (CASE WHEN NEW.payment_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM payments t WHERE t.id=NEW.payment_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.invoice_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM invoices t WHERE t.id=NEW.invoice_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.installment_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM installments t WHERE t.id=NEW.installment_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); END;
--> statement-breakpoint
CREATE TRIGGER tenant_payment_intents_insert BEFORE INSERT ON payment_intents BEGIN SELECT (CASE WHEN NEW.payment_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM payments t WHERE t.id=NEW.payment_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); END;
--> statement-breakpoint
CREATE TRIGGER tenant_payment_intents_update BEFORE UPDATE ON payment_intents BEGIN SELECT (CASE WHEN NEW.payment_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM payments t WHERE t.id=NEW.payment_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); END;
--> statement-breakpoint
CREATE TRIGGER tenant_payment_links_insert BEFORE INSERT ON payment_links BEGIN SELECT (CASE WHEN NEW.student_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM students t WHERE t.id=NEW.student_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.academic_year_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM academic_years t WHERE t.id=NEW.academic_year_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); END;
--> statement-breakpoint
CREATE TRIGGER tenant_payment_links_update BEFORE UPDATE ON payment_links BEGIN SELECT (CASE WHEN NEW.student_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM students t WHERE t.id=NEW.student_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.academic_year_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM academic_years t WHERE t.id=NEW.academic_year_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); END;
--> statement-breakpoint
CREATE TRIGGER tenant_payments_insert BEFORE INSERT ON payments BEGIN SELECT (CASE WHEN NEW.student_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM students t WHERE t.id=NEW.student_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.academic_year_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM academic_years t WHERE t.id=NEW.academic_year_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); END;
--> statement-breakpoint
CREATE TRIGGER tenant_payments_update BEFORE UPDATE ON payments BEGIN SELECT (CASE WHEN NEW.student_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM students t WHERE t.id=NEW.student_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.academic_year_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM academic_years t WHERE t.id=NEW.academic_year_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); END;
--> statement-breakpoint
CREATE TRIGGER tenant_receipts_insert BEFORE INSERT ON receipts BEGIN SELECT (CASE WHEN NEW.payment_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM payments t WHERE t.id=NEW.payment_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.academic_year_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM academic_years t WHERE t.id=NEW.academic_year_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); END;
--> statement-breakpoint
CREATE TRIGGER tenant_receipts_update BEFORE UPDATE ON receipts BEGIN SELECT (CASE WHEN NEW.payment_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM payments t WHERE t.id=NEW.payment_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.academic_year_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM academic_years t WHERE t.id=NEW.academic_year_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); END;
--> statement-breakpoint
CREATE TRIGGER tenant_reconciliation_records_insert BEFORE INSERT ON reconciliation_records BEGIN SELECT (CASE WHEN NEW.academic_year_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM academic_years t WHERE t.id=NEW.academic_year_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.payment_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM payments t WHERE t.id=NEW.payment_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); END;
--> statement-breakpoint
CREATE TRIGGER tenant_reconciliation_records_update BEFORE UPDATE ON reconciliation_records BEGIN SELECT (CASE WHEN NEW.academic_year_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM academic_years t WHERE t.id=NEW.academic_year_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.payment_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM payments t WHERE t.id=NEW.payment_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); END;
--> statement-breakpoint
CREATE TRIGGER tenant_refund_allocations_insert BEFORE INSERT ON refund_allocations BEGIN SELECT (CASE WHEN NEW.refund_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM refunds t WHERE t.id=NEW.refund_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.allocation_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM payment_allocations t WHERE t.id=NEW.allocation_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.installment_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM installments t WHERE t.id=NEW.installment_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); END;
--> statement-breakpoint
CREATE TRIGGER tenant_refund_allocations_update BEFORE UPDATE ON refund_allocations BEGIN SELECT (CASE WHEN NEW.refund_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM refunds t WHERE t.id=NEW.refund_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.allocation_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM payment_allocations t WHERE t.id=NEW.allocation_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.installment_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM installments t WHERE t.id=NEW.installment_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); END;
--> statement-breakpoint
CREATE TRIGGER tenant_refunds_insert BEFORE INSERT ON refunds BEGIN SELECT (CASE WHEN NEW.student_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM students t WHERE t.id=NEW.student_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.academic_year_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM academic_years t WHERE t.id=NEW.academic_year_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.payment_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM payments t WHERE t.id=NEW.payment_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); END;
--> statement-breakpoint
CREATE TRIGGER tenant_refunds_update BEFORE UPDATE ON refunds BEGIN SELECT (CASE WHEN NEW.student_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM students t WHERE t.id=NEW.student_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.academic_year_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM academic_years t WHERE t.id=NEW.academic_year_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.payment_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM payments t WHERE t.id=NEW.payment_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); END;
--> statement-breakpoint
CREATE TRIGGER tenant_sections_insert BEFORE INSERT ON sections BEGIN SELECT (CASE WHEN NEW.academic_year_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM academic_years t WHERE t.id=NEW.academic_year_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.class_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM classes t WHERE t.id=NEW.class_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.campus_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM campuses t WHERE t.id=NEW.campus_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.stream_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM streams t WHERE t.id=NEW.stream_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); END;
--> statement-breakpoint
CREATE TRIGGER tenant_sections_update BEFORE UPDATE ON sections BEGIN SELECT (CASE WHEN NEW.academic_year_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM academic_years t WHERE t.id=NEW.academic_year_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.class_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM classes t WHERE t.id=NEW.class_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.campus_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM campuses t WHERE t.id=NEW.campus_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.stream_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM streams t WHERE t.id=NEW.stream_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); END;
--> statement-breakpoint
CREATE TRIGGER tenant_student_parents_insert BEFORE INSERT ON student_parents BEGIN SELECT (CASE WHEN NEW.student_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM students t WHERE t.id=NEW.student_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.parent_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM parents t WHERE t.id=NEW.parent_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); END;
--> statement-breakpoint
CREATE TRIGGER tenant_student_parents_update BEFORE UPDATE ON student_parents BEGIN SELECT (CASE WHEN NEW.student_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM students t WHERE t.id=NEW.student_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.parent_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM parents t WHERE t.id=NEW.parent_id AND t.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); END;
