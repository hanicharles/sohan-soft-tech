CREATE TABLE IF NOT EXISTS `student_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`student_id` text NOT NULL,
	`title` text NOT NULL,
	`category` text DEFAULT 'Academic' NOT NULL,
	`document_type` text DEFAULT 'Marksheet' NOT NULL,
	`file_url` text NOT NULL,
	`file_name` text NOT NULL,
	`file_size_bytes` integer DEFAULT 0 NOT NULL,
	`mime_type` text DEFAULT 'application/pdf' NOT NULL,
	`verification_status` text DEFAULT 'Pending' NOT NULL,
	`verification_notes` text DEFAULT '' NOT NULL,
	`verified_by` text,
	`verified_at` text,
	`is_student_uploaded` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `student_docs_student_idx` ON `student_documents` (`institution_id`,`student_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `student_docs_cat_idx` ON `student_documents` (`institution_id`,`student_id`,`category`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `student_certificate_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`student_id` text NOT NULL,
	`certificate_type` text NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'Pending' NOT NULL,
	`certificate_number` text,
	`verification_code` text,
	`qr_payload` text,
	`pdf_url` text,
	`rejection_reason` text,
	`approved_by` text,
	`approved_at` text,
	`issued_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `student_cert_student_idx` ON `student_certificate_requests` (`institution_id`,`student_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `student_cert_number_idx` ON `student_certificate_requests` (`institution_id`,`certificate_number`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `student_cert_code_idx` ON `student_certificate_requests` (`institution_id`,`verification_code`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `campus_announcements` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`category` text DEFAULT 'General' NOT NULL,
	`priority` text DEFAULT 'Normal' NOT NULL,
	`target_scope` text DEFAULT 'All' NOT NULL,
	`department_id` text,
	`program_id` text,
	`class_id` text,
	`section_id` text,
	`student_group` text DEFAULT '' NOT NULL,
	`attachments` text DEFAULT '[]' NOT NULL,
	`is_pinned` integer DEFAULT 0 NOT NULL,
	`published_at` text NOT NULL,
	`expires_at` text,
	`author_name` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `campus_announcements_scope_idx` ON `campus_announcements` (`institution_id`,`target_scope`,`published_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `campus_announcements_cat_idx` ON `campus_announcements` (`institution_id`,`category`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `student_announcement_reads` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`announcement_id` text NOT NULL,
	`student_id` text NOT NULL,
	`read_at` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`announcement_id`) REFERENCES `campus_announcements`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `student_ann_reads_unique_idx` ON `student_announcement_reads` (`institution_id`,`announcement_id`,`student_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `student_ann_reads_student_idx` ON `student_announcement_reads` (`institution_id`,`student_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `student_portal_notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`student_id` text NOT NULL,
	`type` text DEFAULT 'General' NOT NULL,
	`title` text NOT NULL,
	`message` text NOT NULL,
	`action_url` text DEFAULT '' NOT NULL,
	`is_read` integer DEFAULT 0 NOT NULL,
	`read_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `student_notif_student_idx` ON `student_portal_notifications` (`institution_id`,`student_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `student_notif_read_idx` ON `student_portal_notifications` (`institution_id`,`student_id`,`is_read`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `student_conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`student_id` text NOT NULL,
	`participant_type` text DEFAULT 'Faculty' NOT NULL,
	`participant_id` text NOT NULL,
	`participant_name` text DEFAULT '' NOT NULL,
	`participant_role` text DEFAULT '' NOT NULL,
	`subject` text DEFAULT '' NOT NULL,
	`last_message_at` text NOT NULL,
	`last_message_preview` text DEFAULT '' NOT NULL,
	`unread_count_student` integer DEFAULT 0 NOT NULL,
	`unread_count_participant` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'Active' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `student_conv_student_idx` ON `student_conversations` (`institution_id`,`student_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `student_conv_participant_idx` ON `student_conversations` (`institution_id`,`participant_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `student_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`conversation_id` text NOT NULL,
	`sender_type` text NOT NULL,
	`sender_id` text NOT NULL,
	`sender_name` text DEFAULT '' NOT NULL,
	`content` text NOT NULL,
	`attachments` text DEFAULT '[]' NOT NULL,
	`read_at` text,
	`is_reported` integer DEFAULT 0 NOT NULL,
	`report_reason` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`conversation_id`) REFERENCES `student_conversations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `student_msgs_conv_idx` ON `student_messages` (`institution_id`,`conversation_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `student_msgs_sender_idx` ON `student_messages` (`institution_id`,`sender_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `campus_events` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`category` text DEFAULT 'Academic' NOT NULL,
	`location` text DEFAULT '' NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`is_all_day` integer DEFAULT 0 NOT NULL,
	`target_scope` text DEFAULT 'All' NOT NULL,
	`department_id` text,
	`max_participants` integer DEFAULT 0 NOT NULL,
	`registration_deadline` text,
	`status` text DEFAULT 'Upcoming' NOT NULL,
	`image_url` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `campus_events_date_idx` ON `campus_events` (`institution_id`,`start_date`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `campus_events_status_idx` ON `campus_events` (`institution_id`,`status`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `student_event_registrations` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`event_id` text NOT NULL,
	`student_id` text NOT NULL,
	`status` text DEFAULT 'Registered' NOT NULL,
	`registered_at` text NOT NULL,
	`attendance_status` text DEFAULT 'Pending' NOT NULL,
	`attended_at` text,
	`reminder_enabled` integer DEFAULT 1 NOT NULL,
	`reminder_minutes_before` integer DEFAULT 60 NOT NULL,
	`reminder_sent_at` text,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`event_id`) REFERENCES `campus_events`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `student_event_reg_unique_idx` ON `student_event_registrations` (`institution_id`,`event_id`,`student_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `student_event_reg_student_idx` ON `student_event_registrations` (`institution_id`,`student_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `student_tickets` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`student_id` text NOT NULL,
	`ticket_number` text NOT NULL,
	`category` text DEFAULT 'General' NOT NULL,
	`subject` text NOT NULL,
	`description` text NOT NULL,
	`priority` text DEFAULT 'Medium' NOT NULL,
	`status` text DEFAULT 'Open' NOT NULL,
	`assigned_to` text,
	`assigned_to_name` text DEFAULT '' NOT NULL,
	`resolved_at` text,
	`resolution_notes` text DEFAULT '' NOT NULL,
	`closed_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `student_tickets_student_idx` ON `student_tickets` (`institution_id`,`student_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `student_tickets_number_idx` ON `student_tickets` (`institution_id`,`ticket_number`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `student_tickets_status_idx` ON `student_tickets` (`institution_id`,`status`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `student_ticket_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`ticket_id` text NOT NULL,
	`sender_type` text NOT NULL,
	`sender_id` text NOT NULL,
	`sender_name` text DEFAULT '' NOT NULL,
	`message` text NOT NULL,
	`attachments` text DEFAULT '[]' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`ticket_id`) REFERENCES `student_tickets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `student_ticket_msgs_ticket_idx` ON `student_ticket_messages` (`institution_id`,`ticket_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `student_ticket_status_history` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`ticket_id` text NOT NULL,
	`old_status` text NOT NULL,
	`new_status` text NOT NULL,
	`changed_by` text NOT NULL,
	`changed_by_name` text DEFAULT '' NOT NULL,
	`change_reason` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`ticket_id`) REFERENCES `student_tickets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `student_ticket_hist_ticket_idx` ON `student_ticket_status_history` (`institution_id`,`ticket_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `student_feedback_submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`student_id` text NOT NULL,
	`feedback_type` text DEFAULT 'General' NOT NULL,
	`target_id` text,
	`target_name` text DEFAULT '' NOT NULL,
	`rating` integer DEFAULT 5 NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`comments` text NOT NULL,
	`is_anonymous` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'Submitted' NOT NULL,
	`response_notes` text DEFAULT '' NOT NULL,
	`reviewed_by` text,
	`reviewed_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `student_feedback_student_idx` ON `student_feedback_submissions` (`institution_id`,`student_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `student_feedback_type_idx` ON `student_feedback_submissions` (`institution_id`,`feedback_type`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `student_personal_deadlines` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`student_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`due_date` text NOT NULL,
	`category` text DEFAULT 'Personal' NOT NULL,
	`priority` text DEFAULT 'Medium' NOT NULL,
	`is_completed` integer DEFAULT 0 NOT NULL,
	`completed_at` text,
	`reminder_date` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `student_deadlines_student_idx` ON `student_personal_deadlines` (`institution_id`,`student_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `student_deadlines_due_idx` ON `student_personal_deadlines` (`institution_id`,`student_id`,`due_date`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `student_portal_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`student_id` text NOT NULL,
	`theme` text DEFAULT 'system' NOT NULL,
	`language` text DEFAULT 'en' NOT NULL,
	`email_notifications` integer DEFAULT 1 NOT NULL,
	`sms_notifications` integer DEFAULT 0 NOT NULL,
	`push_notifications` integer DEFAULT 1 NOT NULL,
	`fee_alerts` integer DEFAULT 1 NOT NULL,
	`exam_alerts` integer DEFAULT 1 NOT NULL,
	`assignment_alerts` integer DEFAULT 1 NOT NULL,
	`event_alerts` integer DEFAULT 1 NOT NULL,
	`compact_view` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `student_settings_student_idx` ON `student_portal_settings` (`institution_id`,`student_id`);
