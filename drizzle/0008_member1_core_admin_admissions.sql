CREATE TABLE IF NOT EXISTS `user_credentials` (
	`user_id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`salt` text NOT NULL,
	`failed_attempts` integer NOT NULL DEFAULT 0,
	`locked_until` text,
	`active` integer NOT NULL DEFAULT 1,
	`password_changed_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `user_credentials_username` ON `user_credentials` (`username`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `auth_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`role` text NOT NULL,
	`institution_id` text NOT NULL DEFAULT '',
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL,
	`last_active_at` text NOT NULL,
	`ip_address` text,
	`user_agent` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `auth_sessions_token` ON `auth_sessions` (`token_hash`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `auth_sessions_user` ON `auth_sessions` (`user_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `login_history` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`email` text NOT NULL,
	`role` text,
	`ip_address` text,
	`user_agent` text,
	`status` text NOT NULL,
	`reason` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `login_history_email` ON `login_history` (`email`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `login_history_user` ON `login_history` (`user_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `password_reset_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token` text NOT NULL,
	`expires_at` text NOT NULL,
	`used_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `password_reset_token_idx` ON `password_reset_tokens` (`token`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `holidays` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`academic_year_id` text,
	`campus_id` text,
	`title` text NOT NULL,
	`date` text NOT NULL,
	`end_date` text,
	`type` text NOT NULL DEFAULT 'Institutional',
	`description` text NOT NULL DEFAULT '',
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `holiday_institution_date` ON `holidays` (`institution_id`,`date`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `working_days` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`academic_year_id` text,
	`campus_id` text,
	`day_of_week` integer NOT NULL,
	`is_working` integer NOT NULL DEFAULT 1,
	`is_half_day` integer NOT NULL DEFAULT 0,
	`open_time` text NOT NULL DEFAULT '08:00',
	`close_time` text NOT NULL DEFAULT '15:00',
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `working_day_scope` ON `working_days` (`institution_id`,`day_of_week`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `admissions_enquiries` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`academic_year_id` text,
	`campus_id` text,
	`student_name` text NOT NULL,
	`parent_name` text NOT NULL,
	`email` text NOT NULL DEFAULT '',
	`phone` text NOT NULL,
	`class_applied` text NOT NULL,
	`source` text NOT NULL DEFAULT 'Walk-in',
	`notes` text NOT NULL DEFAULT '',
	`status` text NOT NULL DEFAULT 'New',
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `admissions_enquiries_scope` ON `admissions_enquiries` (`institution_id`,`status`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `admissions_applications` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`academic_year_id` text NOT NULL,
	`campus_id` text,
	`application_number` text NOT NULL,
	`student_name` text NOT NULL,
	`dob` text,
	`gender` text NOT NULL DEFAULT 'Not specified',
	`blood_group` text,
	`aadhaar_last4` text,
	`student_email` text,
	`student_phone` text,
	`address` text NOT NULL DEFAULT '',
	`city` text NOT NULL DEFAULT '',
	`state` text NOT NULL DEFAULT '',
	`pincode` text NOT NULL DEFAULT '',
	`parent_name` text NOT NULL,
	`parent_phone` text NOT NULL,
	`parent_email` text,
	`parent_relation` text NOT NULL DEFAULT 'Father',
	`parent_occupation` text NOT NULL DEFAULT '',
	`previous_school` text NOT NULL DEFAULT '',
	`previous_grade` text NOT NULL DEFAULT '',
	`previous_percentage` text NOT NULL DEFAULT '',
	`status` text NOT NULL DEFAULT 'Applied',
	`interview_date` text,
	`interview_time` text,
	`interview_notes` text,
	`interview_result` text NOT NULL DEFAULT 'Pending',
	`selection_notes` text,
	`enrolled_student_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `admissions_app_num` ON `admissions_applications` (`institution_id`,`application_number`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `admissions_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`application_id` text NOT NULL,
	`document_name` text NOT NULL,
	`document_type` text NOT NULL,
	`file_key` text,
	`verification_status` text NOT NULL DEFAULT 'Pending',
	`verification_notes` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`application_id`) REFERENCES `admissions_applications`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `student_emergency_contacts` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`student_id` text NOT NULL,
	`name` text NOT NULL,
	`relationship` text NOT NULL DEFAULT 'Guardian',
	`phone` text NOT NULL,
	`alternate_phone` text,
	`address` text NOT NULL DEFAULT '',
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `student_transfers` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`student_id` text NOT NULL,
	`tc_number` text NOT NULL,
	`destination_school` text NOT NULL,
	`reason` text NOT NULL,
	`transfer_date` text NOT NULL,
	`conduct` text NOT NULL DEFAULT 'Good',
	`status` text NOT NULL DEFAULT 'Issued',
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `student_transfer_tc` ON `student_transfers` (`institution_id`,`tc_number`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `student_history` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`student_id` text NOT NULL,
	`action` text NOT NULL,
	`details` text NOT NULL DEFAULT '{}',
	`actor_id` text NOT NULL,
	`actor_name` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `student_history_idx` ON `student_history` (`institution_id`,`student_id`,`created_at`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `student_exams` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`student_id` text NOT NULL,
	`academic_year_id` text NOT NULL,
	`exam_name` text NOT NULL,
	`subject` text NOT NULL,
	`marks_obtained` integer NOT NULL,
	`max_marks` integer NOT NULL DEFAULT 100,
	`grade` text NOT NULL DEFAULT 'A',
	`remarks` text NOT NULL DEFAULT '',
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `student_lms_courses` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`student_id` text NOT NULL,
	`course_name` text NOT NULL,
	`instructor` text NOT NULL DEFAULT '',
	`progress_percent` integer NOT NULL DEFAULT 0,
	`status` text NOT NULL DEFAULT 'Enrolled',
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE cascade
);
