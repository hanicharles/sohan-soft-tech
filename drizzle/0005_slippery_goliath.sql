CREATE TABLE `institution_domains` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`hostname` text NOT NULL,
	`verification_token` text NOT NULL,
	`status` text DEFAULT 'Pending Verification' NOT NULL,
	`verification_status` text DEFAULT 'Pending Verification' NOT NULL,
	`ssl_status` text DEFAULT 'Pending Provisioning' NOT NULL,
	`last_checked_at` text,
	`dns_message` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `institution_domains_institution_id_unique` ON `institution_domains` (`institution_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `institution_domains_hostname_unique` ON `institution_domains` (`hostname`);--> statement-breakpoint
CREATE TABLE `saas_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`code` text NOT NULL,
	`price_paise` integer NOT NULL,
	`billing_cycle` text NOT NULL,
	`student_limit` integer NOT NULL,
	`user_limit` integer NOT NULL,
	`modules` text NOT NULL,
	`status` text DEFAULT 'Active' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `saas_plans_code_unique` ON `saas_plans` (`code`);--> statement-breakpoint
CREATE TABLE `platform_admins` (
	`user_id` text PRIMARY KEY NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `platform_audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text,
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
CREATE INDEX `platform_audit_date` ON `platform_audit_logs` (`created_at`);--> statement-breakpoint
CREATE TABLE `subscription_payments` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`subscription_id` text NOT NULL,
	`amount_paise` integer NOT NULL,
	`method` text NOT NULL,
	`reference` text NOT NULL,
	`paid_date` text NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`idempotency_key` text NOT NULL,
	`request_hash` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`subscription_id`) REFERENCES `institution_subscriptions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `subscription_payment_idempotency` ON `subscription_payments` (`institution_id`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `subscription_payment_date` ON `subscription_payments` (`paid_date`);--> statement-breakpoint
CREATE TABLE `institution_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`plan_id` text NOT NULL,
	`status` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`student_limit` integer NOT NULL,
	`user_limit` integer NOT NULL,
	`modules` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`plan_id`) REFERENCES `saas_plans`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `institution_subscriptions_institution_id_unique` ON `institution_subscriptions` (`institution_id`);--> statement-breakpoint
CREATE INDEX `subscription_expiry` ON `institution_subscriptions` (`status`,`end_date`);--> statement-breakpoint
CREATE TABLE `support_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`reason` text NOT NULL,
	`expires_at` text NOT NULL,
	`ended_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `support_sessions_token_hash_unique` ON `support_sessions` (`token_hash`);--> statement-breakpoint
CREATE INDEX `support_session_user` ON `support_sessions` (`user_id`,`institution_id`,`expires_at`);--> statement-breakpoint
ALTER TABLE `audit_logs` ADD `support_session_id` text;--> statement-breakpoint
ALTER TABLE `institutions` ADD `institution_type` text DEFAULT 'School' NOT NULL;--> statement-breakpoint
ALTER TABLE `institutions` ADD `institution_code` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `institutions` ADD `city` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `institutions` ADD `state` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `institutions` ADD `pincode` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `institutions` ADD `website` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `invitations` ADD `display_name` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `invitations` ADD `mobile` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `invitations` ADD `permissions` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `memberships` ADD `display_name` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `memberships` ADD `mobile` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `memberships` ADD `permissions` text DEFAULT '[]' NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX institution_code_unique ON institutions(upper(institution_code)) WHERE institution_code<>'';
--> statement-breakpoint
CREATE TRIGGER student_capacity_insert BEFORE INSERT ON students WHEN NEW.status='Active' BEGIN SELECT (CASE WHEN (SELECT COUNT(*) FROM students WHERE institution_id=NEW.institution_id AND status='Active' AND id<>NEW.id)>=(SELECT student_limit FROM institution_subscriptions WHERE institution_id=NEW.institution_id) THEN RAISE(ABORT,'STUDENT_LIMIT_REACHED') END); END;
--> statement-breakpoint
CREATE TRIGGER student_capacity_update BEFORE UPDATE OF status,institution_id ON students WHEN NEW.status='Active' AND (OLD.status<>'Active' OR OLD.institution_id<>NEW.institution_id) BEGIN SELECT (CASE WHEN (SELECT COUNT(*) FROM students WHERE institution_id=NEW.institution_id AND status='Active' AND id<>NEW.id)>=(SELECT student_limit FROM institution_subscriptions WHERE institution_id=NEW.institution_id) THEN RAISE(ABORT,'STUDENT_LIMIT_REACHED') END); END;
--> statement-breakpoint
CREATE TRIGGER member_capacity_insert BEFORE INSERT ON memberships WHEN NEW.active=1 AND NEW.role NOT IN ('SUPER_ADMIN','PARENT','STUDENT') BEGIN SELECT (CASE WHEN (SELECT COUNT(*) FROM memberships m WHERE m.institution_id=NEW.institution_id AND m.active=1 AND m.role NOT IN ('SUPER_ADMIN','PARENT','STUDENT') AND m.id<>NEW.id) + (SELECT COUNT(*) FROM invitations v WHERE v.institution_id=NEW.institution_id AND v.status='Pending' AND v.role NOT IN ('SUPER_ADMIN','PARENT','STUDENT') AND lower(v.email)<>(SELECT lower(email) FROM users WHERE id=NEW.user_id) AND NOT EXISTS(SELECT 1 FROM memberships mm JOIN users u ON u.id=mm.user_id WHERE mm.institution_id=v.institution_id AND mm.active=1 AND mm.role NOT IN ('SUPER_ADMIN','PARENT','STUDENT') AND lower(u.email)=lower(v.email)))>=(SELECT user_limit FROM institution_subscriptions WHERE institution_id=NEW.institution_id) THEN RAISE(ABORT,'USER_LIMIT_REACHED') END); END;
--> statement-breakpoint
CREATE TRIGGER member_capacity_update BEFORE UPDATE OF active,role,institution_id ON memberships WHEN NEW.active=1 AND NEW.role NOT IN ('SUPER_ADMIN','PARENT','STUDENT') AND (OLD.active=0 OR OLD.role IN ('SUPER_ADMIN','PARENT','STUDENT') OR OLD.institution_id<>NEW.institution_id) BEGIN SELECT (CASE WHEN (SELECT COUNT(*) FROM memberships m WHERE m.institution_id=NEW.institution_id AND m.active=1 AND m.role NOT IN ('SUPER_ADMIN','PARENT','STUDENT') AND m.id<>NEW.id) + (SELECT COUNT(*) FROM invitations v WHERE v.institution_id=NEW.institution_id AND v.status='Pending' AND v.role NOT IN ('SUPER_ADMIN','PARENT','STUDENT') AND lower(v.email)<>(SELECT lower(email) FROM users WHERE id=NEW.user_id) AND NOT EXISTS(SELECT 1 FROM memberships mm JOIN users u ON u.id=mm.user_id WHERE mm.institution_id=v.institution_id AND mm.active=1 AND mm.role NOT IN ('SUPER_ADMIN','PARENT','STUDENT') AND lower(u.email)=lower(v.email)))>=(SELECT user_limit FROM institution_subscriptions WHERE institution_id=NEW.institution_id) THEN RAISE(ABORT,'USER_LIMIT_REACHED') END); END;
--> statement-breakpoint
CREATE TRIGGER invitation_capacity_insert BEFORE INSERT ON invitations WHEN NEW.status='Pending' AND NEW.role NOT IN ('SUPER_ADMIN','PARENT','STUDENT') AND NOT EXISTS(SELECT 1 FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.institution_id=NEW.institution_id AND m.active=1 AND m.role NOT IN ('SUPER_ADMIN','PARENT','STUDENT') AND lower(u.email)=lower(NEW.email)) BEGIN SELECT (CASE WHEN (SELECT COUNT(*) FROM memberships m WHERE m.institution_id=NEW.institution_id AND m.active=1 AND m.role NOT IN ('SUPER_ADMIN','PARENT','STUDENT')) + (SELECT COUNT(*) FROM invitations v WHERE v.institution_id=NEW.institution_id AND v.status='Pending' AND v.role NOT IN ('SUPER_ADMIN','PARENT','STUDENT') AND v.id<>NEW.id AND NOT EXISTS(SELECT 1 FROM memberships mm JOIN users u ON u.id=mm.user_id WHERE mm.institution_id=v.institution_id AND mm.active=1 AND mm.role NOT IN ('SUPER_ADMIN','PARENT','STUDENT') AND lower(u.email)=lower(v.email)))>=(SELECT user_limit FROM institution_subscriptions WHERE institution_id=NEW.institution_id) THEN RAISE(ABORT,'USER_LIMIT_REACHED') END); END;
--> statement-breakpoint
CREATE TRIGGER invitation_capacity_update BEFORE UPDATE OF status,email ON invitations WHEN NEW.status='Pending' AND NEW.role NOT IN ('SUPER_ADMIN','PARENT','STUDENT') AND NOT EXISTS(SELECT 1 FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.institution_id=NEW.institution_id AND m.active=1 AND m.role NOT IN ('SUPER_ADMIN','PARENT','STUDENT') AND lower(u.email)=lower(NEW.email)) BEGIN SELECT (CASE WHEN (SELECT COUNT(*) FROM memberships m WHERE m.institution_id=NEW.institution_id AND m.active=1 AND m.role NOT IN ('SUPER_ADMIN','PARENT','STUDENT')) + (SELECT COUNT(*) FROM invitations v WHERE v.institution_id=NEW.institution_id AND v.status='Pending' AND v.role NOT IN ('SUPER_ADMIN','PARENT','STUDENT') AND v.id<>NEW.id AND NOT EXISTS(SELECT 1 FROM memberships mm JOIN users u ON u.id=mm.user_id WHERE mm.institution_id=v.institution_id AND mm.active=1 AND mm.role NOT IN ('SUPER_ADMIN','PARENT','STUDENT') AND lower(u.email)=lower(v.email)))>=(SELECT user_limit FROM institution_subscriptions WHERE institution_id=NEW.institution_id) THEN RAISE(ABORT,'USER_LIMIT_REACHED') END); END;
--> statement-breakpoint
CREATE TRIGGER immutable_platform_audit_logs_update BEFORE UPDATE ON platform_audit_logs BEGIN SELECT RAISE(ABORT,'IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_platform_audit_logs_delete BEFORE DELETE ON platform_audit_logs BEGIN SELECT RAISE(ABORT,'IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_subscription_payments_update BEFORE UPDATE ON subscription_payments BEGIN SELECT RAISE(ABORT,'IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_subscription_payments_delete BEFORE DELETE ON subscription_payments BEGIN SELECT RAISE(ABORT,'IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER subscription_payment_scope BEFORE INSERT ON subscription_payments BEGIN SELECT (CASE WHEN NOT EXISTS(SELECT 1 FROM institution_subscriptions s WHERE s.id=NEW.subscription_id AND s.institution_id=NEW.institution_id) OR NEW.amount_paise<=0 THEN RAISE(ABORT,'TENANT_ISOLATION') END); END;
--> statement-breakpoint
CREATE TRIGGER institution_subscription_guard BEFORE INSERT ON institution_subscriptions BEGIN SELECT (CASE WHEN NEW.student_limit<1 OR NEW.user_limit<1 OR NEW.start_date>NEW.end_date OR NOT json_valid(NEW.modules) THEN RAISE(ABORT,'INVALID_SUBSCRIPTION') END); END;
