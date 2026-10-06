CREATE INDEX allocation_installment ON payment_allocations(institution_id,installment_id);
--> statement-breakpoint
CREATE INDEX allocation_payment ON payment_allocations(payment_id);
--> statement-breakpoint
CREATE INDEX refund_payment_status ON refunds(payment_id,status);
--> statement-breakpoint
CREATE INDEX refund_allocation_installment ON refund_allocations(installment_id);
--> statement-breakpoint
CREATE INDEX refund_allocation_source ON refund_allocations(allocation_id);
--> statement-breakpoint
CREATE INDEX adjustment_installment ON fee_adjustments(installment_id);
--> statement-breakpoint
CREATE INDEX invoice_item_invoice ON invoice_items(invoice_id);
--> statement-breakpoint
CREATE INDEX installment_invoice ON installments(invoice_id);
--> statement-breakpoint
CREATE INDEX structure_item_structure ON fee_structure_items(structure_id);
--> statement-breakpoint
CREATE INDEX student_parent_guardian ON student_parents(institution_id,parent_id);
--> statement-breakpoint
CREATE INDEX notification_institution_time ON notifications(institution_id,created_at);
--> statement-breakpoint
CREATE TRIGGER immutable_successful_payment_status BEFORE UPDATE OF status ON payments WHEN OLD.status IN ('Successful','Partially Refunded','Refunded') AND NEW.status NOT IN ('Successful','Partially Refunded','Refunded') BEGIN SELECT RAISE(ABORT,'IMMUTABLE_PAYMENT'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_successful_payment_reference BEFORE UPDATE OF paid_at,reference,gateway_transaction_id ON payments WHEN OLD.status IN ('Successful','Partially Refunded','Refunded') AND (NEW.paid_at!=OLD.paid_at OR NEW.reference IS NOT OLD.reference OR NEW.gateway_transaction_id IS NOT OLD.gateway_transaction_id) BEGIN SELECT RAISE(ABORT,'IMMUTABLE_PAYMENT'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_refund_amount BEFORE UPDATE OF institution_id,student_id,academic_year_id,payment_id,amount_paise,method,reason,idempotency_key ON refunds BEGIN SELECT RAISE(ABORT,'IMMUTABLE_REFUND'); END;
--> statement-breakpoint
CREATE TRIGGER invoice_assignment_scope BEFORE INSERT ON invoices BEGIN SELECT (CASE WHEN NOT EXISTS(SELECT 1 FROM student_fee_assignments a WHERE a.id=NEW.assignment_id AND a.institution_id=NEW.institution_id AND a.student_id=NEW.student_id AND a.academic_year_id=NEW.academic_year_id) THEN RAISE(ABORT,'ACADEMIC_YEAR_ISOLATION') END); END;
--> statement-breakpoint
CREATE TRIGGER installment_invoice_scope BEFORE INSERT ON installments BEGIN SELECT (CASE WHEN NEW.amount_paise<0 OR NOT EXISTS(SELECT 1 FROM invoices i WHERE i.id=NEW.invoice_id AND i.institution_id=NEW.institution_id AND i.student_id=NEW.student_id AND i.academic_year_id=NEW.academic_year_id) THEN RAISE(ABORT,'ACADEMIC_YEAR_ISOLATION') END); END;
--> statement-breakpoint
CREATE TRIGGER adjustment_installment_scope BEFORE INSERT ON fee_adjustments BEGIN SELECT (CASE WHEN NOT EXISTS(SELECT 1 FROM installments i WHERE i.id=NEW.installment_id AND i.institution_id=NEW.institution_id AND i.invoice_id=NEW.invoice_id AND i.student_id=NEW.student_id AND i.academic_year_id=NEW.academic_year_id) THEN RAISE(ABORT,'ACADEMIC_YEAR_ISOLATION') END); END;
--> statement-breakpoint
CREATE TRIGGER ledger_scope BEFORE INSERT ON ledger_entries BEGIN SELECT (CASE WHEN NEW.invoice_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM invoices i WHERE i.id=NEW.invoice_id AND i.institution_id=NEW.institution_id AND i.student_id=NEW.student_id AND i.academic_year_id=NEW.academic_year_id) OR NEW.payment_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM payments p WHERE p.id=NEW.payment_id AND p.institution_id=NEW.institution_id AND p.student_id=NEW.student_id AND p.academic_year_id=NEW.academic_year_id) THEN RAISE(ABORT,'ACADEMIC_YEAR_ISOLATION') END); END;
--> statement-breakpoint
CREATE TRIGGER cash_payment_closed_day BEFORE INSERT ON payments WHEN NEW.method='Cash' BEGIN SELECT (CASE WHEN EXISTS(SELECT 1 FROM cash_closings cc JOIN sections sec ON sec.campus_id=cc.campus_id JOIN enrollments e ON e.section_id=sec.id WHERE cc.institution_id=NEW.institution_id AND cc.entry_date=date(NEW.paid_at,'+5 hours','+30 minutes') AND e.student_id=NEW.student_id AND e.academic_year_id=NEW.academic_year_id) THEN RAISE(ABORT,'CASH_DAY_CLOSED') END); END;
--> statement-breakpoint
CREATE TRIGGER cash_refund_closed_day BEFORE UPDATE OF status ON refunds WHEN NEW.status='Processed' AND NEW.method='Cash' BEGIN SELECT (CASE WHEN EXISTS(SELECT 1 FROM cash_closings cc JOIN sections sec ON sec.campus_id=cc.campus_id JOIN enrollments e ON e.section_id=sec.id WHERE cc.institution_id=NEW.institution_id AND cc.entry_date=date(NEW.refunded_at,'+5 hours','+30 minutes') AND e.student_id=NEW.student_id AND e.academic_year_id=NEW.academic_year_id) THEN RAISE(ABORT,'CASH_DAY_CLOSED') END); END;
--> statement-breakpoint
CREATE TRIGGER cash_entry_closed_day BEFORE INSERT ON cash_entries BEGIN SELECT (CASE WHEN NEW.amount_paise<0 OR EXISTS(SELECT 1 FROM cash_closings cc WHERE cc.institution_id=NEW.institution_id AND cc.campus_id=NEW.campus_id AND cc.entry_date=NEW.entry_date) THEN RAISE(ABORT,'CASH_DAY_CLOSED') END); END;
