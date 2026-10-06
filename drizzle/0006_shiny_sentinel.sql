CREATE TABLE `api_idempotency` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`key` text NOT NULL,
	`operation` text NOT NULL,
	`request_hash` text NOT NULL,
	`response` text,
	`status_code` integer,
	`created_at` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `api_idempotency_scope` ON `api_idempotency` (`institution_id`,`operation`,`key`);--> statement-breakpoint
CREATE TABLE `journal_events` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`ledger_entry_id` text NOT NULL,
	`academic_year_id` text NOT NULL,
	`student_id` text NOT NULL,
	`event_type` text NOT NULL,
	`debit_account` text NOT NULL,
	`credit_account` text NOT NULL,
	`amount_paise` integer NOT NULL,
	`reversal_of` text,
	`description` text NOT NULL,
	`entry_date` text NOT NULL,
	`created_at` text NOT NULL,
	`created_by` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`ledger_entry_id`) REFERENCES `ledger_entries`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `journal_events_ledger_entry_id_unique` ON `journal_events` (`ledger_entry_id`);--> statement-breakpoint
CREATE INDEX `journal_student_year` ON `journal_events` (`institution_id`,`student_id`,`academic_year_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `notification_outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`payment_id` text NOT NULL,
	`state` text DEFAULT 'Queued' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`available_at` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notification_outbox_payment_id_unique` ON `notification_outbox` (`payment_id`);--> statement-breakpoint
CREATE INDEX `outbox_ready` ON `notification_outbox` (`institution_id`,`state`,`available_at`);--> statement-breakpoint
ALTER TABLE `cash_closings` ADD `denominations` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
CREATE INDEX `student_roll_lookup` ON `enrollments` (`institution_id`,`roll_number`);--> statement-breakpoint
CREATE INDEX `fees_tenant_year_status` ON `fee_structures` (`institution_id`,`academic_year_id`,`status`);--> statement-breakpoint
CREATE INDEX `payments_student_created_desc` ON `payments` (`institution_id`,`student_id`,"created_at" DESC);
--> statement-breakpoint
CREATE VIEW journal_legacy_projection(id,institution_id,ledger_entry_id,academic_year_id,student_id,event_type,debit_account,credit_account,amount_paise,reversal_of,description,entry_date,created_at,created_by) AS SELECT  'journal:'||l.id,l.institution_id,l.id,l.academic_year_id,l.student_id,
 CASE WHEN l.kind='Fee' THEN 'INVOICE_GENERATED' WHEN l.kind='Payment' THEN 'PAYMENT_RECEIVED' WHEN l.kind='Refund' THEN 'REVERSAL_ISSUED' WHEN l.kind='Late Fee' THEN 'LATE_FEE_ACCRUED' WHEN l.credit_paise>0 THEN 'CONCESSION_APPLIED' ELSE 'FEE_ADJUSTED' END,
 CASE WHEN l.kind='Payment' THEN CASE WHEN (SELECT method FROM payments WHERE id=l.payment_id)='Cash' THEN 'CASH' ELSE 'BANK_CLEARING' END WHEN l.credit_paise>0 THEN 'CONCESSION_EXPENSE' ELSE 'ACCOUNTS_RECEIVABLE' END,
 CASE WHEN l.kind='Refund' THEN CASE WHEN (SELECT method FROM refunds WHERE id=l.refund_id)='Cash' THEN 'CASH' ELSE 'BANK_CLEARING' END WHEN l.credit_paise>0 THEN 'ACCOUNTS_RECEIVABLE' WHEN l.kind='Late Fee' THEN 'LATE_FEE_REVENUE' ELSE 'FEE_REVENUE' END,
 l.debit_paise+l.credit_paise,
 CASE WHEN l.kind='Refund' THEN (SELECT 'journal:'||lp.id FROM ledger_entries lp WHERE lp.institution_id=l.institution_id AND lp.payment_id=l.payment_id AND lp.kind='Payment' LIMIT 1) ELSE NULL END,
 l.description,l.entry_date,l.created_at,l.created_by FROM ledger_entries l WHERE l.debit_paise+l.credit_paise>0;
--> statement-breakpoint
CREATE TRIGGER ledger_double_entry AFTER INSERT ON ledger_entries WHEN NEW.debit_paise+NEW.credit_paise>0 BEGIN INSERT INTO journal_events(id,institution_id,ledger_entry_id,academic_year_id,student_id,event_type,debit_account,credit_account,amount_paise,reversal_of,description,entry_date,created_at,created_by) SELECT 'journal:'||NEW.id,NEW.institution_id,NEW.id,NEW.academic_year_id,NEW.student_id, CASE WHEN NEW.kind='Fee' THEN 'INVOICE_GENERATED' WHEN NEW.kind='Payment' THEN 'PAYMENT_RECEIVED' WHEN NEW.kind='Refund' THEN 'REVERSAL_ISSUED' WHEN NEW.kind='Late Fee' THEN 'LATE_FEE_ACCRUED' WHEN NEW.credit_paise>0 THEN 'CONCESSION_APPLIED' ELSE 'FEE_ADJUSTED' END, CASE WHEN NEW.kind='Payment' THEN CASE WHEN (SELECT method FROM payments WHERE id=NEW.payment_id)='Cash' THEN 'CASH' ELSE 'BANK_CLEARING' END WHEN NEW.credit_paise>0 THEN 'CONCESSION_EXPENSE' ELSE 'ACCOUNTS_RECEIVABLE' END, CASE WHEN NEW.kind='Refund' THEN CASE WHEN (SELECT method FROM refunds WHERE id=NEW.refund_id)='Cash' THEN 'CASH' ELSE 'BANK_CLEARING' END WHEN NEW.credit_paise>0 THEN 'ACCOUNTS_RECEIVABLE' WHEN NEW.kind='Late Fee' THEN 'LATE_FEE_REVENUE' ELSE 'FEE_REVENUE' END, NEW.debit_paise+NEW.credit_paise, CASE WHEN NEW.kind='Refund' THEN (SELECT 'journal:'||lp.id FROM ledger_entries lp WHERE lp.institution_id=NEW.institution_id AND lp.payment_id=NEW.payment_id AND lp.kind='Payment' LIMIT 1) ELSE NULL END, NEW.description,NEW.entry_date,NEW.created_at,NEW.created_by; END;
--> statement-breakpoint
CREATE TRIGGER journal_balanced BEFORE INSERT ON journal_events BEGIN SELECT (CASE WHEN NOT EXISTS(SELECT 1 FROM journal_legacy_projection p WHERE p.ledger_entry_id=NEW.ledger_entry_id AND p.event_type=NEW.event_type AND p.debit_account=NEW.debit_account AND p.credit_account=NEW.credit_account AND p.id=NEW.id AND p.entry_date=NEW.entry_date AND COALESCE(p.reversal_of,'')=COALESCE(NEW.reversal_of,'')) THEN RAISE(ABORT,'UNBALANCED_JOURNAL') END); SELECT (CASE WHEN typeof(NEW.amount_paise)<>'integer' OR NEW.amount_paise<=0 OR NEW.amount_paise>9007199254740991 OR NEW.debit_account=NEW.credit_account OR NEW.event_type NOT IN ('INVOICE_GENERATED','PAYMENT_RECEIVED','CONCESSION_APPLIED','REVERSAL_ISSUED','LATE_FEE_ACCRUED','FEE_ADJUSTED') OR NEW.debit_account NOT IN ('ACCOUNTS_RECEIVABLE','CASH','BANK_CLEARING','CONCESSION_EXPENSE','FEE_REVENUE','LATE_FEE_REVENUE') OR NEW.credit_account NOT IN ('ACCOUNTS_RECEIVABLE','CASH','BANK_CLEARING','CONCESSION_EXPENSE','FEE_REVENUE','LATE_FEE_REVENUE') THEN RAISE(ABORT,'UNBALANCED_JOURNAL') END); SELECT (CASE WHEN NOT EXISTS(SELECT 1 FROM ledger_entries l WHERE l.id=NEW.ledger_entry_id AND l.institution_id=NEW.institution_id AND l.academic_year_id=NEW.academic_year_id AND l.student_id=NEW.student_id AND l.debit_paise+l.credit_paise=NEW.amount_paise AND (l.debit_paise=0 OR l.credit_paise=0)) THEN RAISE(ABORT,'TENANT_ISOLATION') END); END;
--> statement-breakpoint
CREATE TRIGGER journal_no_update BEFORE UPDATE ON journal_events BEGIN SELECT RAISE(ABORT,'IMMUTABLE_JOURNAL'); END;
--> statement-breakpoint
CREATE TRIGGER journal_no_delete BEFORE DELETE ON journal_events BEGIN SELECT RAISE(ABORT,'IMMUTABLE_JOURNAL'); END;
--> statement-breakpoint
CREATE VIEW journal_postings AS SELECT id||':D' id,id event_id,institution_id,academic_year_id,student_id,event_type,debit_account account_code,amount_paise debit_paise,0 credit_paise,entry_date,created_at FROM journal_events UNION ALL SELECT id||':C',id,institution_id,academic_year_id,student_id,event_type,credit_account,0,amount_paise,entry_date,created_at FROM journal_events;
--> statement-breakpoint
CREATE TRIGGER cash_closing_append_only BEFORE UPDATE ON cash_closings BEGIN SELECT RAISE(ABORT,'IMMUTABLE_CASH_CLOSE'); END;
--> statement-breakpoint
CREATE TRIGGER cash_closing_no_delete BEFORE DELETE ON cash_closings BEGIN SELECT RAISE(ABORT,'IMMUTABLE_CASH_CLOSE'); END;
--> statement-breakpoint
PRAGMA optimize;

--> statement-breakpoint
CREATE TRIGGER cash_close_reconcile BEFORE INSERT ON cash_closings BEGIN SELECT (CASE WHEN NEW.counted_paise<0 OR NEW.variance_paise!=NEW.counted_paise-NEW.expected_paise OR NEW.expected_paise != ( COALESCE((SELECT counted_paise FROM cash_closings WHERE institution_id=NEW.institution_id AND campus_id=NEW.campus_id AND entry_date<NEW.entry_date ORDER BY entry_date DESC LIMIT 1),(SELECT COALESCE(SUM(amount_paise),0) FROM cash_entries WHERE institution_id=NEW.institution_id AND campus_id=NEW.campus_id AND entry_date=NEW.entry_date AND kind='Opening')) + (SELECT COALESCE(SUM(p.amount_paise),0) FROM payments p JOIN enrollments e ON e.student_id=p.student_id AND e.institution_id=p.institution_id AND e.academic_year_id=p.academic_year_id JOIN sections sec ON sec.id=e.section_id WHERE p.institution_id=NEW.institution_id AND sec.campus_id=NEW.campus_id AND p.method='Cash' AND p.status IN ('Successful','Partially Refunded','Refunded') AND date(p.paid_at,'+5 hours','+30 minutes')=NEW.entry_date) - (SELECT COALESCE(SUM(r.amount_paise),0) FROM refunds r JOIN enrollments e ON e.student_id=r.student_id AND e.institution_id=r.institution_id AND e.academic_year_id=r.academic_year_id JOIN sections sec ON sec.id=e.section_id WHERE r.institution_id=NEW.institution_id AND sec.campus_id=NEW.campus_id AND r.method='Cash' AND r.status='Processed' AND date(r.refunded_at,'+5 hours','+30 minutes')=NEW.entry_date) - (SELECT COALESCE(SUM(amount_paise),0) FROM cash_entries WHERE institution_id=NEW.institution_id AND campus_id=NEW.campus_id AND entry_date=NEW.entry_date AND kind='Deposit')) THEN RAISE(ABORT,'CASH_BALANCE_CHANGED') END); END;
