CREATE TABLE `attendance_events` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`device_id` text NOT NULL,
	`event_id` text NOT NULL,
	`nonce` text NOT NULL,
	`payload_hash` text NOT NULL,
	`student_id` text NOT NULL,
	`punched_at` text NOT NULL,
	`local_date` text NOT NULL,
	`direction` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`device_id`) REFERENCES `hardware_devices`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `hardware_event_once` ON `attendance_events` (`device_id`,`event_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `hardware_nonce_once` ON `attendance_events` (`device_id`,`nonce`);--> statement-breakpoint
CREATE INDEX `attendance_student_day` ON `attendance_events` (`institution_id`,`student_id`,`local_date`);--> statement-breakpoint
CREATE TABLE `balance_carryforwards` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`rollover_id` text NOT NULL,
	`student_id` text NOT NULL,
	`source_installment_id` text NOT NULL,
	`target_invoice_id` text NOT NULL,
	`amount_paise` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`rollover_id`) REFERENCES `year_rollovers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_installment_id`) REFERENCES `installments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`target_invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `carry_installment_once` ON `balance_carryforwards` (`institution_id`,`source_installment_id`);--> statement-breakpoint
CREATE TABLE `bank_import_batches` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`academic_year_id` text NOT NULL,
	`fingerprint` text NOT NULL,
	`rows` text NOT NULL,
	`created_at` text NOT NULL,
	`created_by` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bank_import_fingerprint` ON `bank_import_batches` (`institution_id`,`academic_year_id`,`fingerprint`);--> statement-breakpoint
CREATE TABLE `bank_posted_rows` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`batch_id` text NOT NULL,
	`row_key` text NOT NULL,
	`transaction_id` text NOT NULL,
	`payment_id` text,
	`reconciliation_id` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`batch_id`) REFERENCES `bank_import_batches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reconciliation_id`) REFERENCES `reconciliation_records`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bank_row_once` ON `bank_posted_rows` (`institution_id`,`transaction_id`);--> statement-breakpoint
CREATE TABLE `communication_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`configuration` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `communications_tenant` ON `communication_settings` (`institution_id`);--> statement-breakpoint
CREATE TABLE `daily_fee_charges` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`student_id` text NOT NULL,
	`attendance_id` text NOT NULL,
	`rule_id` text NOT NULL,
	`adjustment_id` text NOT NULL,
	`service` text NOT NULL,
	`local_date` text NOT NULL,
	`amount_paise` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`attendance_id`) REFERENCES `attendance_events`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`rule_id`) REFERENCES `daily_fee_rules`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`adjustment_id`) REFERENCES `fee_adjustments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `daily_charge_once` ON `daily_fee_charges` (`institution_id`,`student_id`,`service`,`local_date`);--> statement-breakpoint
CREATE TABLE `daily_fee_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`student_id` text NOT NULL,
	`installment_id` text NOT NULL,
	`service` text NOT NULL,
	`amount_paise` integer NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`installment_id`) REFERENCES `installments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `daily_service_student` ON `daily_fee_rules` (`institution_id`,`student_id`,`service`);--> statement-breakpoint
CREATE TABLE `document_artifacts` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`receipt_id` text NOT NULL,
	`object_key` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`receipt_id`) REFERENCES `receipts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `receipt_artifact` ON `document_artifacts` (`institution_id`,`receipt_id`);--> statement-breakpoint
CREATE TABLE `document_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`receipt_id` text NOT NULL,
	`state` text DEFAULT 'Queued' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`receipt_id`) REFERENCES `receipts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `document_job_receipt` ON `document_jobs` (`institution_id`,`receipt_id`);--> statement-breakpoint
CREATE INDEX `document_jobs_ready` ON `document_jobs` (`institution_id`,`state`);--> statement-breakpoint
CREATE TABLE `donation_certificates` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`parent_id` text NOT NULL,
	`financial_year` integer NOT NULL,
	`donation_reference` text NOT NULL,
	`amount_paise` integer NOT NULL,
	`urn` text NOT NULL,
	`donee_pan` text NOT NULL,
	`form10bd_acknowledgement` text NOT NULL,
	`object_key` text NOT NULL,
	`file_hash` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`parent_id`) REFERENCES `parents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `donation_reference_scope` ON `donation_certificates` (`institution_id`,`donation_reference`);--> statement-breakpoint
CREATE TABLE `hardware_devices` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`name` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `organization_members` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`email` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `organization_member_email` ON `organization_members` (`organization_id`,`email`);--> statement-breakpoint
CREATE TABLE `organizations` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`status` text DEFAULT 'Active' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `parent_portal_grants` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`parent_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` text NOT NULL,
	`revoked_at` text,
	`purpose` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`parent_id`) REFERENCES `parents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `parent_portal_grants_token_hash_unique` ON `parent_portal_grants` (`token_hash`);--> statement-breakpoint
CREATE INDEX `parent_grant_scope` ON `parent_portal_grants` (`institution_id`,`parent_id`,`expires_at`);--> statement-breakpoint
CREATE TABLE `rfid_cards` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`student_id` text NOT NULL,
	`uid_hash` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rfid_card_scope` ON `rfid_cards` (`institution_id`,`uid_hash`);--> statement-breakpoint
CREATE TABLE `rollover_students` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`rollover_id` text NOT NULL,
	`student_id` text NOT NULL,
	`amount_paise` integer NOT NULL,
	`target_invoice_id` text,
	`source_snapshot` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`rollover_id`) REFERENCES `year_rollovers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rollover_student_once` ON `rollover_students` (`rollover_id`,`student_id`);--> statement-breakpoint
CREATE TABLE `tuition_allocations` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`payment_id` text NOT NULL,
	`amount_paise` integer NOT NULL,
	`reason` text NOT NULL,
	`approved_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tuition_payment_basis` ON `tuition_allocations` (`institution_id`,`payment_id`);--> statement-breakpoint
CREATE TABLE `webhook_inbox` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`provider` text NOT NULL,
	`event_id` text NOT NULL,
	`payload_hash` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `webhook_inbox_event` ON `webhook_inbox` (`institution_id`,`provider`,`event_id`);--> statement-breakpoint
CREATE TABLE `year_rollovers` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`source_year_id` text NOT NULL,
	`target_year_id` text NOT NULL,
	`mapping` text NOT NULL,
	`status` text DEFAULT 'Running' NOT NULL,
	`reason` text NOT NULL,
	`approved_by` text NOT NULL,
	`cursor` text DEFAULT '' NOT NULL,
	`snapshot` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_year_id`) REFERENCES `academic_years`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`target_year_id`) REFERENCES `academic_years`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rollover_source_year` ON `year_rollovers` (`institution_id`,`source_year_id`);--> statement-breakpoint
ALTER TABLE `institutions` ADD `organization_id` text REFERENCES organizations(id);--> statement-breakpoint
ALTER TABLE `notifications` ADD `metadata` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `parents` ADD `sms_consent` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
CREATE TRIGGER scope_attendance_events_insert BEFORE INSERT ON attendance_events BEGIN SELECT (CASE WHEN NEW.device_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM hardware_devices r WHERE r.id=NEW.device_id AND r.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.student_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM students r WHERE r.id=NEW.student_id AND r.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); END;
--> statement-breakpoint
CREATE TRIGGER scope_attendance_events_update BEFORE UPDATE ON attendance_events BEGIN SELECT (CASE WHEN NEW.device_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM hardware_devices r WHERE r.id=NEW.device_id AND r.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.student_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM students r WHERE r.id=NEW.student_id AND r.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); END;
--> statement-breakpoint
CREATE TRIGGER scope_balance_carryforwards_insert BEFORE INSERT ON balance_carryforwards BEGIN SELECT (CASE WHEN NEW.rollover_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM year_rollovers r WHERE r.id=NEW.rollover_id AND r.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.student_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM students r WHERE r.id=NEW.student_id AND r.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.source_installment_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM installments r WHERE r.id=NEW.source_installment_id AND r.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.target_invoice_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM invoices r WHERE r.id=NEW.target_invoice_id AND r.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); END;
--> statement-breakpoint
CREATE TRIGGER scope_balance_carryforwards_update BEFORE UPDATE ON balance_carryforwards BEGIN SELECT (CASE WHEN NEW.rollover_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM year_rollovers r WHERE r.id=NEW.rollover_id AND r.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.student_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM students r WHERE r.id=NEW.student_id AND r.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.source_installment_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM installments r WHERE r.id=NEW.source_installment_id AND r.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.target_invoice_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM invoices r WHERE r.id=NEW.target_invoice_id AND r.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); END;
--> statement-breakpoint
CREATE TRIGGER scope_bank_import_batches_insert BEFORE INSERT ON bank_import_batches BEGIN SELECT (CASE WHEN NEW.academic_year_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM academic_years r WHERE r.id=NEW.academic_year_id AND r.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); END;
--> statement-breakpoint
CREATE TRIGGER scope_bank_import_batches_update BEFORE UPDATE ON bank_import_batches BEGIN SELECT (CASE WHEN NEW.academic_year_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM academic_years r WHERE r.id=NEW.academic_year_id AND r.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); END;
--> statement-breakpoint
CREATE TRIGGER scope_bank_posted_rows_insert BEFORE INSERT ON bank_posted_rows BEGIN SELECT (CASE WHEN NEW.batch_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM bank_import_batches r WHERE r.id=NEW.batch_id AND r.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.payment_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM payments r WHERE r.id=NEW.payment_id AND r.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.reconciliation_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM reconciliation_records r WHERE r.id=NEW.reconciliation_id AND r.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); END;
--> statement-breakpoint
CREATE TRIGGER scope_bank_posted_rows_update BEFORE UPDATE ON bank_posted_rows BEGIN SELECT (CASE WHEN NEW.batch_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM bank_import_batches r WHERE r.id=NEW.batch_id AND r.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.payment_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM payments r WHERE r.id=NEW.payment_id AND r.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.reconciliation_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM reconciliation_records r WHERE r.id=NEW.reconciliation_id AND r.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); END;
--> statement-breakpoint
CREATE TRIGGER scope_daily_fee_charges_insert BEFORE INSERT ON daily_fee_charges BEGIN SELECT (CASE WHEN NEW.student_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM students r WHERE r.id=NEW.student_id AND r.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.attendance_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM attendance_events r WHERE r.id=NEW.attendance_id AND r.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.rule_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM daily_fee_rules r WHERE r.id=NEW.rule_id AND r.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.adjustment_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM fee_adjustments r WHERE r.id=NEW.adjustment_id AND r.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); END;
--> statement-breakpoint
CREATE TRIGGER scope_daily_fee_charges_update BEFORE UPDATE ON daily_fee_charges BEGIN SELECT (CASE WHEN NEW.student_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM students r WHERE r.id=NEW.student_id AND r.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.attendance_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM attendance_events r WHERE r.id=NEW.attendance_id AND r.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.rule_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM daily_fee_rules r WHERE r.id=NEW.rule_id AND r.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.adjustment_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM fee_adjustments r WHERE r.id=NEW.adjustment_id AND r.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); END;
--> statement-breakpoint
CREATE TRIGGER scope_daily_fee_rules_insert BEFORE INSERT ON daily_fee_rules BEGIN SELECT (CASE WHEN NEW.student_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM students r WHERE r.id=NEW.student_id AND r.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.installment_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM installments r WHERE r.id=NEW.installment_id AND r.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); END;
--> statement-breakpoint
CREATE TRIGGER scope_daily_fee_rules_update BEFORE UPDATE ON daily_fee_rules BEGIN SELECT (CASE WHEN NEW.student_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM students r WHERE r.id=NEW.student_id AND r.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.installment_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM installments r WHERE r.id=NEW.installment_id AND r.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); END;
--> statement-breakpoint
CREATE TRIGGER scope_document_artifacts_insert BEFORE INSERT ON document_artifacts BEGIN SELECT (CASE WHEN NEW.receipt_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM receipts r WHERE r.id=NEW.receipt_id AND r.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); END;
--> statement-breakpoint
CREATE TRIGGER scope_document_artifacts_update BEFORE UPDATE ON document_artifacts BEGIN SELECT (CASE WHEN NEW.receipt_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM receipts r WHERE r.id=NEW.receipt_id AND r.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); END;
--> statement-breakpoint
CREATE TRIGGER scope_document_jobs_insert BEFORE INSERT ON document_jobs BEGIN SELECT (CASE WHEN NEW.receipt_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM receipts r WHERE r.id=NEW.receipt_id AND r.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); END;
--> statement-breakpoint
CREATE TRIGGER scope_document_jobs_update BEFORE UPDATE ON document_jobs BEGIN SELECT (CASE WHEN NEW.receipt_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM receipts r WHERE r.id=NEW.receipt_id AND r.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); END;
--> statement-breakpoint
CREATE TRIGGER scope_donation_certificates_insert BEFORE INSERT ON donation_certificates BEGIN SELECT (CASE WHEN NEW.parent_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM parents r WHERE r.id=NEW.parent_id AND r.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); END;
--> statement-breakpoint
CREATE TRIGGER scope_donation_certificates_update BEFORE UPDATE ON donation_certificates BEGIN SELECT (CASE WHEN NEW.parent_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM parents r WHERE r.id=NEW.parent_id AND r.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); END;
--> statement-breakpoint
CREATE TRIGGER scope_parent_portal_grants_insert BEFORE INSERT ON parent_portal_grants BEGIN SELECT (CASE WHEN NEW.parent_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM parents r WHERE r.id=NEW.parent_id AND r.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); END;
--> statement-breakpoint
CREATE TRIGGER scope_parent_portal_grants_update BEFORE UPDATE ON parent_portal_grants BEGIN SELECT (CASE WHEN NEW.parent_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM parents r WHERE r.id=NEW.parent_id AND r.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); END;
--> statement-breakpoint
CREATE TRIGGER scope_rfid_cards_insert BEFORE INSERT ON rfid_cards BEGIN SELECT (CASE WHEN NEW.student_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM students r WHERE r.id=NEW.student_id AND r.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); END;
--> statement-breakpoint
CREATE TRIGGER scope_rfid_cards_update BEFORE UPDATE ON rfid_cards BEGIN SELECT (CASE WHEN NEW.student_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM students r WHERE r.id=NEW.student_id AND r.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); END;
--> statement-breakpoint
CREATE TRIGGER scope_rollover_students_insert BEFORE INSERT ON rollover_students BEGIN SELECT (CASE WHEN NEW.rollover_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM year_rollovers r WHERE r.id=NEW.rollover_id AND r.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.student_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM students r WHERE r.id=NEW.student_id AND r.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); END;
--> statement-breakpoint
CREATE TRIGGER scope_rollover_students_update BEFORE UPDATE ON rollover_students BEGIN SELECT (CASE WHEN NEW.rollover_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM year_rollovers r WHERE r.id=NEW.rollover_id AND r.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.student_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM students r WHERE r.id=NEW.student_id AND r.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); END;
--> statement-breakpoint
CREATE TRIGGER scope_tuition_allocations_insert BEFORE INSERT ON tuition_allocations BEGIN SELECT (CASE WHEN NEW.payment_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM payments r WHERE r.id=NEW.payment_id AND r.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); END;
--> statement-breakpoint
CREATE TRIGGER scope_tuition_allocations_update BEFORE UPDATE ON tuition_allocations BEGIN SELECT (CASE WHEN NEW.payment_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM payments r WHERE r.id=NEW.payment_id AND r.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); END;
--> statement-breakpoint
CREATE TRIGGER scope_year_rollovers_insert BEFORE INSERT ON year_rollovers BEGIN SELECT (CASE WHEN NEW.source_year_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM academic_years r WHERE r.id=NEW.source_year_id AND r.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.target_year_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM academic_years r WHERE r.id=NEW.target_year_id AND r.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); END;
--> statement-breakpoint
CREATE TRIGGER scope_year_rollovers_update BEFORE UPDATE ON year_rollovers BEGIN SELECT (CASE WHEN NEW.source_year_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM academic_years r WHERE r.id=NEW.source_year_id AND r.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); SELECT (CASE WHEN NEW.target_year_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM academic_years r WHERE r.id=NEW.target_year_id AND r.institution_id=NEW.institution_id) THEN RAISE(ABORT,'TENANT_ISOLATION') END); END;
--> statement-breakpoint
CREATE TRIGGER immutable_tuition_allocations_update BEFORE UPDATE ON tuition_allocations BEGIN SELECT RAISE(ABORT,'IMMUTABLE_FINANCIAL_RECORD'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_tuition_allocations_delete BEFORE DELETE ON tuition_allocations BEGIN SELECT RAISE(ABORT,'IMMUTABLE_FINANCIAL_RECORD'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_donation_certificates_update BEFORE UPDATE ON donation_certificates BEGIN SELECT RAISE(ABORT,'IMMUTABLE_FINANCIAL_RECORD'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_donation_certificates_delete BEFORE DELETE ON donation_certificates BEGIN SELECT RAISE(ABORT,'IMMUTABLE_FINANCIAL_RECORD'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_attendance_events_update BEFORE UPDATE ON attendance_events BEGIN SELECT RAISE(ABORT,'IMMUTABLE_FINANCIAL_RECORD'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_attendance_events_delete BEFORE DELETE ON attendance_events BEGIN SELECT RAISE(ABORT,'IMMUTABLE_FINANCIAL_RECORD'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_daily_fee_charges_update BEFORE UPDATE ON daily_fee_charges BEGIN SELECT RAISE(ABORT,'IMMUTABLE_FINANCIAL_RECORD'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_daily_fee_charges_delete BEFORE DELETE ON daily_fee_charges BEGIN SELECT RAISE(ABORT,'IMMUTABLE_FINANCIAL_RECORD'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_bank_import_batches_update BEFORE UPDATE ON bank_import_batches BEGIN SELECT RAISE(ABORT,'IMMUTABLE_FINANCIAL_RECORD'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_bank_import_batches_delete BEFORE DELETE ON bank_import_batches BEGIN SELECT RAISE(ABORT,'IMMUTABLE_FINANCIAL_RECORD'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_bank_posted_rows_update BEFORE UPDATE ON bank_posted_rows BEGIN SELECT RAISE(ABORT,'IMMUTABLE_FINANCIAL_RECORD'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_bank_posted_rows_delete BEFORE DELETE ON bank_posted_rows BEGIN SELECT RAISE(ABORT,'IMMUTABLE_FINANCIAL_RECORD'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_balance_carryforwards_update BEFORE UPDATE ON balance_carryforwards BEGIN SELECT RAISE(ABORT,'IMMUTABLE_FINANCIAL_RECORD'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_balance_carryforwards_delete BEFORE DELETE ON balance_carryforwards BEGIN SELECT RAISE(ABORT,'IMMUTABLE_FINANCIAL_RECORD'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_rollover_students_update BEFORE UPDATE ON rollover_students BEGIN SELECT RAISE(ABORT,'IMMUTABLE_FINANCIAL_RECORD'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_rollover_students_delete BEFORE DELETE ON rollover_students BEGIN SELECT RAISE(ABORT,'IMMUTABLE_FINANCIAL_RECORD'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_webhook_inbox_update BEFORE UPDATE ON webhook_inbox BEGIN SELECT RAISE(ABORT,'IMMUTABLE_FINANCIAL_RECORD'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_webhook_inbox_delete BEFORE DELETE ON webhook_inbox BEGIN SELECT RAISE(ABORT,'IMMUTABLE_FINANCIAL_RECORD'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_document_artifacts_update BEFORE UPDATE ON document_artifacts BEGIN SELECT RAISE(ABORT,'IMMUTABLE_FINANCIAL_RECORD'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_document_artifacts_delete BEFORE DELETE ON document_artifacts BEGIN SELECT RAISE(ABORT,'IMMUTABLE_FINANCIAL_RECORD'); END;
--> statement-breakpoint
CREATE TRIGGER tuition_amount_guard BEFORE INSERT ON tuition_allocations BEGIN SELECT (CASE WHEN NEW.amount_paise<=0 OR typeof(NEW.amount_paise)<>'integer' OR NOT EXISTS(SELECT 1 FROM payments p WHERE p.id=NEW.payment_id AND p.institution_id=NEW.institution_id AND p.amount_paise>=NEW.amount_paise AND p.status IN ('Successful','Partially Refunded')) THEN RAISE(ABORT,'INVALID_TUITION_ALLOCATION') END); END;
--> statement-breakpoint
CREATE TRIGGER daily_rule_guard BEFORE INSERT ON daily_fee_rules BEGIN SELECT (CASE WHEN NEW.service NOT IN ('Transport','Hostel') OR NEW.amount_paise<=0 OR typeof(NEW.amount_paise)<>'integer' OR NOT EXISTS(SELECT 1 FROM installments i WHERE i.id=NEW.installment_id AND i.institution_id=NEW.institution_id AND i.student_id=NEW.student_id) THEN RAISE(ABORT,'INVALID_DAILY_RULE') END); END;
--> statement-breakpoint
CREATE TRIGGER daily_rule_update_guard BEFORE UPDATE ON daily_fee_rules BEGIN SELECT (CASE WHEN NEW.service NOT IN ('Transport','Hostel') OR NEW.amount_paise<=0 OR typeof(NEW.amount_paise)<>'integer' OR NOT EXISTS(SELECT 1 FROM installments i WHERE i.id=NEW.installment_id AND i.institution_id=NEW.institution_id AND i.student_id=NEW.student_id) THEN RAISE(ABORT,'INVALID_DAILY_RULE') END); END;
--> statement-breakpoint
CREATE TRIGGER carry_scope_guard BEFORE INSERT ON balance_carryforwards BEGIN SELECT (CASE WHEN NEW.amount_paise<=0 OR NOT EXISTS(SELECT 1 FROM year_rollovers r JOIN installments s ON s.id=NEW.source_installment_id JOIN invoices t ON t.id=NEW.target_invoice_id WHERE r.id=NEW.rollover_id AND r.institution_id=NEW.institution_id AND r.status='Running' AND s.institution_id=r.institution_id AND t.institution_id=r.institution_id AND s.student_id=NEW.student_id AND t.student_id=NEW.student_id AND s.academic_year_id=r.source_year_id AND t.academic_year_id=r.target_year_id AND NEW.amount_paise=(SELECT outstanding_paise FROM installment_balances WHERE id=s.id)) THEN RAISE(ABORT,'INVALID_CARRY_FORWARD') END); END;
--> statement-breakpoint
CREATE TRIGGER rollover_snapshot_guard BEFORE INSERT ON year_rollovers BEGIN SELECT (CASE WHEN NEW.source_year_id=NEW.target_year_id OR json_extract(NEW.snapshot,'$.students')<>(SELECT COUNT(*) FROM enrollments e JOIN students s ON s.id=e.student_id AND s.institution_id=e.institution_id WHERE e.institution_id=NEW.institution_id AND e.academic_year_id=NEW.source_year_id AND s.status='Active') OR json_extract(NEW.snapshot,'$.ledger_count')<>(SELECT COUNT(*) FROM ledger_entries WHERE institution_id=NEW.institution_id AND academic_year_id=NEW.source_year_id) OR json_extract(NEW.snapshot,'$.outstanding')<>(SELECT COALESCE(SUM(outstanding_paise),0) FROM student_balances WHERE institution_id=NEW.institution_id AND academic_year_id=NEW.source_year_id) OR EXISTS(SELECT 1 FROM payments WHERE institution_id=NEW.institution_id AND academic_year_id=NEW.source_year_id AND status IN ('Pending','Initiated','Processing')) OR EXISTS(SELECT 1 FROM refunds WHERE institution_id=NEW.institution_id AND academic_year_id=NEW.source_year_id AND status IN ('Requested','Approved')) THEN RAISE(ABORT,'ROLLOVER_PREVIEW_CHANGED') END); END;
--> statement-breakpoint
CREATE TRIGGER frozen_payments_insert BEFORE INSERT ON payments WHEN EXISTS(SELECT 1 FROM year_rollovers r WHERE r.institution_id=NEW.institution_id AND r.source_year_id=NEW.academic_year_id) BEGIN SELECT RAISE(ABORT,'ACADEMIC_YEAR_FROZEN'); END;
--> statement-breakpoint
CREATE TRIGGER frozen_invoices_insert BEFORE INSERT ON invoices WHEN EXISTS(SELECT 1 FROM year_rollovers r WHERE r.institution_id=NEW.institution_id AND r.source_year_id=NEW.academic_year_id) BEGIN SELECT RAISE(ABORT,'ACADEMIC_YEAR_FROZEN'); END;
--> statement-breakpoint
CREATE TRIGGER frozen_student_fee_assignments_insert BEFORE INSERT ON student_fee_assignments WHEN EXISTS(SELECT 1 FROM year_rollovers r WHERE r.institution_id=NEW.institution_id AND r.source_year_id=NEW.academic_year_id) BEGIN SELECT RAISE(ABORT,'ACADEMIC_YEAR_FROZEN'); END;
--> statement-breakpoint
CREATE TRIGGER frozen_refunds_insert BEFORE INSERT ON refunds WHEN EXISTS(SELECT 1 FROM year_rollovers r WHERE r.institution_id=NEW.institution_id AND r.source_year_id=NEW.academic_year_id) BEGIN SELECT RAISE(ABORT,'ACADEMIC_YEAR_FROZEN'); END;
--> statement-breakpoint
CREATE TRIGGER frozen_enrollments_insert BEFORE INSERT ON enrollments WHEN EXISTS(SELECT 1 FROM year_rollovers r WHERE r.institution_id=NEW.institution_id AND r.source_year_id=NEW.academic_year_id) BEGIN SELECT RAISE(ABORT,'ACADEMIC_YEAR_FROZEN'); END;
--> statement-breakpoint
CREATE TRIGGER frozen_installments_update BEFORE UPDATE ON installments WHEN EXISTS(SELECT 1 FROM year_rollovers r WHERE r.institution_id=NEW.institution_id AND r.source_year_id=NEW.academic_year_id) BEGIN SELECT RAISE(ABORT,'ACADEMIC_YEAR_FROZEN'); END;
--> statement-breakpoint
CREATE TRIGGER frozen_adjustment_insert BEFORE INSERT ON fee_adjustments WHEN EXISTS(SELECT 1 FROM year_rollovers r WHERE r.institution_id=NEW.institution_id AND r.source_year_id=NEW.academic_year_id) AND NOT (NEW.kind='Carry Forward' AND EXISTS(SELECT 1 FROM balance_carryforwards c JOIN year_rollovers r ON r.id=c.rollover_id WHERE c.institution_id=NEW.institution_id AND c.source_installment_id=NEW.installment_id AND c.student_id=NEW.student_id AND c.amount_paise=-NEW.amount_paise AND r.status='Running')) BEGIN SELECT RAISE(ABORT,'ACADEMIC_YEAR_FROZEN'); END;
--> statement-breakpoint
CREATE TRIGGER frozen_ledger_insert BEFORE INSERT ON ledger_entries WHEN EXISTS(SELECT 1 FROM year_rollovers r WHERE r.institution_id=NEW.institution_id AND r.source_year_id=NEW.academic_year_id) AND NOT (NEW.kind='Rollover Out' AND NEW.debit_paise=0 AND EXISTS(SELECT 1 FROM fee_adjustments a JOIN balance_carryforwards c ON c.source_installment_id=a.installment_id AND c.institution_id=a.institution_id JOIN year_rollovers r ON r.id=c.rollover_id WHERE a.id=NEW.adjustment_id AND a.institution_id=NEW.institution_id AND a.student_id=NEW.student_id AND a.kind='Carry Forward' AND c.amount_paise=NEW.credit_paise AND r.status='Running')) BEGIN SELECT RAISE(ABORT,'ACADEMIC_YEAR_FROZEN'); END;
--> statement-breakpoint
CREATE TRIGGER frozen_year_status BEFORE UPDATE OF status ON academic_years WHEN (EXISTS(SELECT 1 FROM year_rollovers r WHERE r.institution_id=NEW.institution_id AND r.source_year_id=NEW.id) AND NEW.status NOT IN ('Closed','Archived')) OR (EXISTS(SELECT 1 FROM year_rollovers r WHERE r.institution_id=NEW.institution_id AND r.target_year_id=NEW.id AND r.status='Running') AND NEW.status NOT IN ('Active','Draft')) BEGIN SELECT RAISE(ABORT,'ACADEMIC_YEAR_FROZEN'); END;
--> statement-breakpoint
CREATE TRIGGER rollover_roster_status BEFORE UPDATE OF status ON students WHEN OLD.status<>NEW.status AND EXISTS(SELECT 1 FROM enrollments e JOIN year_rollovers r ON r.source_year_id=e.academic_year_id AND r.institution_id=e.institution_id WHERE e.student_id=NEW.id AND e.institution_id=NEW.institution_id AND r.status='Running') BEGIN SELECT RAISE(ABORT,'ROLLOVER_ROSTER_FROZEN'); END;
--> statement-breakpoint
CREATE TRIGGER rollover_enrollment_update BEFORE UPDATE OF section_id,student_id,academic_year_id ON enrollments WHEN EXISTS(SELECT 1 FROM year_rollovers r WHERE r.source_year_id=OLD.academic_year_id AND r.institution_id=OLD.institution_id) BEGIN SELECT RAISE(ABORT,'ACADEMIC_YEAR_FROZEN'); END;
--> statement-breakpoint
DROP TRIGGER ledger_double_entry;
--> statement-breakpoint
DROP TRIGGER journal_balanced;
--> statement-breakpoint
DROP VIEW journal_legacy_projection;
--> statement-breakpoint
CREATE VIEW journal_legacy_projection(id,institution_id,ledger_entry_id,academic_year_id,student_id,event_type,debit_account,credit_account,amount_paise,reversal_of,description,entry_date,created_at,created_by) AS SELECT  'journal:'||l.id,l.institution_id,l.id,l.academic_year_id,l.student_id,
 CASE WHEN l.kind IN ('Opening Dues','Rollover Out') THEN 'BALANCE_TRANSFERRED' WHEN l.kind='Fee' THEN 'INVOICE_GENERATED' WHEN l.kind='Payment' THEN 'PAYMENT_RECEIVED' WHEN l.kind='Refund' THEN 'REVERSAL_ISSUED' WHEN l.kind='Late Fee' THEN 'LATE_FEE_ACCRUED' WHEN l.credit_paise>0 THEN 'CONCESSION_APPLIED' ELSE 'FEE_ADJUSTED' END,
 CASE WHEN l.kind='Rollover Out' THEN 'OPENING_BALANCE_CLEARING' WHEN l.kind='Payment' THEN CASE WHEN (SELECT method FROM payments WHERE id=l.payment_id)='Cash' THEN 'CASH' ELSE 'BANK_CLEARING' END WHEN l.credit_paise>0 THEN 'CONCESSION_EXPENSE' ELSE 'ACCOUNTS_RECEIVABLE' END,
 CASE WHEN l.kind='Opening Dues' THEN 'OPENING_BALANCE_CLEARING' WHEN l.kind='Refund' THEN CASE WHEN (SELECT method FROM refunds WHERE id=l.refund_id)='Cash' THEN 'CASH' ELSE 'BANK_CLEARING' END WHEN l.credit_paise>0 THEN 'ACCOUNTS_RECEIVABLE' WHEN l.kind='Late Fee' THEN 'LATE_FEE_REVENUE' ELSE 'FEE_REVENUE' END,
 l.debit_paise+l.credit_paise,
 CASE WHEN l.kind='Refund' THEN (SELECT 'journal:'||lp.id FROM ledger_entries lp WHERE lp.institution_id=l.institution_id AND lp.payment_id=l.payment_id AND lp.kind='Payment' LIMIT 1) ELSE NULL END,
 l.description,l.entry_date,l.created_at,l.created_by FROM ledger_entries l WHERE l.debit_paise+l.credit_paise>0;
--> statement-breakpoint
CREATE TRIGGER ledger_double_entry AFTER INSERT ON ledger_entries WHEN NEW.debit_paise+NEW.credit_paise>0 BEGIN INSERT INTO journal_events(id,institution_id,ledger_entry_id,academic_year_id,student_id,event_type,debit_account,credit_account,amount_paise,reversal_of,description,entry_date,created_at,created_by) SELECT 'journal:'||NEW.id,NEW.institution_id,NEW.id,NEW.academic_year_id,NEW.student_id, CASE WHEN NEW.kind IN ('Opening Dues','Rollover Out') THEN 'BALANCE_TRANSFERRED' WHEN NEW.kind='Fee' THEN 'INVOICE_GENERATED' WHEN NEW.kind='Payment' THEN 'PAYMENT_RECEIVED' WHEN NEW.kind='Refund' THEN 'REVERSAL_ISSUED' WHEN NEW.kind='Late Fee' THEN 'LATE_FEE_ACCRUED' WHEN NEW.credit_paise>0 THEN 'CONCESSION_APPLIED' ELSE 'FEE_ADJUSTED' END, CASE WHEN NEW.kind='Rollover Out' THEN 'OPENING_BALANCE_CLEARING' WHEN NEW.kind='Payment' THEN CASE WHEN (SELECT method FROM payments WHERE id=NEW.payment_id)='Cash' THEN 'CASH' ELSE 'BANK_CLEARING' END WHEN NEW.credit_paise>0 THEN 'CONCESSION_EXPENSE' ELSE 'ACCOUNTS_RECEIVABLE' END, CASE WHEN NEW.kind='Opening Dues' THEN 'OPENING_BALANCE_CLEARING' WHEN NEW.kind='Refund' THEN CASE WHEN (SELECT method FROM refunds WHERE id=NEW.refund_id)='Cash' THEN 'CASH' ELSE 'BANK_CLEARING' END WHEN NEW.credit_paise>0 THEN 'ACCOUNTS_RECEIVABLE' WHEN NEW.kind='Late Fee' THEN 'LATE_FEE_REVENUE' ELSE 'FEE_REVENUE' END, NEW.debit_paise+NEW.credit_paise, CASE WHEN NEW.kind='Refund' THEN (SELECT 'journal:'||lp.id FROM ledger_entries lp WHERE lp.institution_id=NEW.institution_id AND lp.payment_id=NEW.payment_id AND lp.kind='Payment' LIMIT 1) ELSE NULL END, NEW.description,NEW.entry_date,NEW.created_at,NEW.created_by; END;
--> statement-breakpoint
CREATE TRIGGER journal_balanced BEFORE INSERT ON journal_events BEGIN SELECT (CASE WHEN NOT EXISTS(SELECT 1 FROM journal_legacy_projection p WHERE p.ledger_entry_id=NEW.ledger_entry_id AND p.event_type=NEW.event_type AND p.debit_account=NEW.debit_account AND p.credit_account=NEW.credit_account AND p.id=NEW.id AND p.entry_date=NEW.entry_date AND COALESCE(p.reversal_of,'')=COALESCE(NEW.reversal_of,'')) THEN RAISE(ABORT,'UNBALANCED_JOURNAL') END); SELECT (CASE WHEN typeof(NEW.amount_paise)<>'integer' OR NEW.amount_paise<=0 OR NEW.amount_paise>9007199254740991 OR NEW.debit_account=NEW.credit_account OR NEW.event_type NOT IN ('INVOICE_GENERATED','PAYMENT_RECEIVED','CONCESSION_APPLIED','REVERSAL_ISSUED','LATE_FEE_ACCRUED','FEE_ADJUSTED','BALANCE_TRANSFERRED') OR NEW.debit_account NOT IN ('ACCOUNTS_RECEIVABLE','CASH','BANK_CLEARING','CONCESSION_EXPENSE','FEE_REVENUE','LATE_FEE_REVENUE','OPENING_BALANCE_CLEARING') OR NEW.credit_account NOT IN ('ACCOUNTS_RECEIVABLE','CASH','BANK_CLEARING','CONCESSION_EXPENSE','FEE_REVENUE','LATE_FEE_REVENUE','OPENING_BALANCE_CLEARING') THEN RAISE(ABORT,'UNBALANCED_JOURNAL') END); SELECT (CASE WHEN NOT EXISTS(SELECT 1 FROM ledger_entries l WHERE l.id=NEW.ledger_entry_id AND l.institution_id=NEW.institution_id AND l.academic_year_id=NEW.academic_year_id AND l.student_id=NEW.student_id AND l.debit_paise+l.credit_paise=NEW.amount_paise AND (l.debit_paise=0 OR l.credit_paise=0)) THEN RAISE(ABORT,'TENANT_ISOLATION') END); END;
--> statement-breakpoint
CREATE INDEX institutions_organization_scope ON institutions(organization_id,status);
--> statement-breakpoint
PRAGMA optimize;

--> statement-breakpoint
CREATE TRIGGER rollover_enrollment_delete BEFORE DELETE ON enrollments WHEN EXISTS(SELECT 1 FROM year_rollovers r WHERE r.source_year_id=OLD.academic_year_id AND r.institution_id=OLD.institution_id) BEGIN SELECT RAISE(ABORT,'ACADEMIC_YEAR_FROZEN'); END;
--> statement-breakpoint
CREATE TRIGGER rollover_definition_immutable BEFORE UPDATE OF institution_id,source_year_id,target_year_id,mapping,reason,approved_by,snapshot ON year_rollovers BEGIN SELECT RAISE(ABORT,'IMMUTABLE_FINANCIAL_RECORD'); END;
--> statement-breakpoint
CREATE TRIGGER rollover_no_delete BEFORE DELETE ON year_rollovers BEGIN SELECT RAISE(ABORT,'IMMUTABLE_FINANCIAL_RECORD'); END;
--> statement-breakpoint
CREATE TRIGGER opening_dues_trace BEFORE INSERT ON ledger_entries WHEN NEW.kind='Opening Dues' AND NOT EXISTS(SELECT 1 FROM rollover_students rs JOIN year_rollovers r ON r.id=rs.rollover_id AND r.institution_id=rs.institution_id WHERE rs.institution_id=NEW.institution_id AND rs.student_id=NEW.student_id AND rs.target_invoice_id=NEW.invoice_id AND rs.amount_paise=NEW.debit_paise AND NEW.credit_paise=0 AND r.target_year_id=NEW.academic_year_id) BEGIN SELECT RAISE(ABORT,'ROLLOVER_SCOPE_MISMATCH'); END;
