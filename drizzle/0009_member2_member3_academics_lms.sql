CREATE TABLE IF NOT EXISTS `departments` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`hod_id` text,
	`hod_name` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'Active' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `department_code_idx` ON `departments` (`institution_id`,`code`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `programs` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`department_id` text,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`degree_level` text DEFAULT 'Undergraduate' NOT NULL,
	`duration_years` integer DEFAULT 4 NOT NULL,
	`total_semesters` integer DEFAULT 8 NOT NULL,
	`total_credits` integer DEFAULT 160 NOT NULL,
	`coordinator_id` text,
	`coordinator_name` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'Active' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `program_code_idx` ON `programs` (`institution_id`,`code`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `academic_semesters` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`academic_year_id` text NOT NULL,
	`program_id` text,
	`name` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`is_current` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'Upcoming' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `academic_semester_scope` ON `academic_semesters` (`institution_id`,`academic_year_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `subjects` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`department_id` text,
	`class_id` text,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`type` text DEFAULT 'Theory' NOT NULL,
	`credits` integer DEFAULT 3 NOT NULL,
	`faculty_id` text,
	`status` text DEFAULT 'Active' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `subject_code_idx` ON `subjects` (`institution_id`,`code`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `faculty` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`user_id` text,
	`employee_id` text NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`department_id` text,
	`department_name` text DEFAULT '' NOT NULL,
	`designation` text DEFAULT 'Assistant Professor' NOT NULL,
	`qualification` text DEFAULT 'Master''s' NOT NULL,
	`specialization` text DEFAULT '' NOT NULL,
	`experience_years` integer DEFAULT 0 NOT NULL,
	`joining_date` text NOT NULL,
	`status` text DEFAULT 'Active' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `faculty_emp_idx` ON `faculty` (`institution_id`,`employee_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `faculty_email_idx` ON `faculty` (`institution_id`,`email`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `faculty_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`faculty_id` text NOT NULL,
	`title` text NOT NULL,
	`document_type` text DEFAULT 'Resume' NOT NULL,
	`file_url` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`faculty_id`) REFERENCES `faculty`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `faculty_docs_idx` ON `faculty_documents` (`institution_id`,`faculty_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `timetable_slots` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`academic_year_id` text NOT NULL,
	`campus_id` text,
	`class_id` text NOT NULL,
	`section_id` text NOT NULL,
	`subject_id` text NOT NULL,
	`faculty_id` text,
	`day_of_week` text NOT NULL,
	`period_number` integer NOT NULL,
	`start_time` text NOT NULL,
	`end_time` text NOT NULL,
	`room_number` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'Published' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`section_id`) REFERENCES `sections`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`subject_id`) REFERENCES `subjects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `timetable_section_idx` ON `timetable_slots` (`institution_id`,`class_id`,`section_id`,`day_of_week`,`period_number`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `timetable_faculty_idx` ON `timetable_slots` (`institution_id`,`faculty_id`,`day_of_week`,`period_number`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `timetable_room_idx` ON `timetable_slots` (`institution_id`,`room_number`,`day_of_week`,`period_number`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `student_attendance` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`academic_year_id` text NOT NULL,
	`class_id` text NOT NULL,
	`section_id` text NOT NULL,
	`student_id` text NOT NULL,
	`date` text NOT NULL,
	`period_number` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'Present' NOT NULL,
	`remarks` text DEFAULT '' NOT NULL,
	`recorded_by` text NOT NULL,
	`correction_reason` text,
	`corrected_by` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`section_id`) REFERENCES `sections`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `student_attendance_entry_idx` ON `student_attendance` (`institution_id`,`student_id`,`date`,`period_number`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `student_attendance_filter_idx` ON `student_attendance` (`institution_id`,`class_id`,`section_id`,`date`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `faculty_attendance` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`faculty_id` text NOT NULL,
	`date` text NOT NULL,
	`check_in` text,
	`check_out` text,
	`status` text DEFAULT 'Present' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`faculty_id`) REFERENCES `faculty`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `faculty_att_date_idx` ON `faculty_attendance` (`institution_id`,`faculty_id`,`date`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `faculty_leaves` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`faculty_id` text NOT NULL,
	`leave_type` text DEFAULT 'Casual' NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`days_count` integer DEFAULT 1 NOT NULL,
	`reason` text NOT NULL,
	`substitute_faculty_id` text,
	`substitute_name` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'Pending' NOT NULL,
	`reviewed_by` text,
	`reviewed_at` text,
	`review_comments` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`faculty_id`) REFERENCES `faculty`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `faculty_leave_status_idx` ON `faculty_leaves` (`institution_id`,`faculty_id`,`status`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `lms_courses` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`code` text NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`thumbnail_url` text DEFAULT '' NOT NULL,
	`department_id` text,
	`subject_id` text,
	`faculty_id` text,
	`faculty_name` text DEFAULT '' NOT NULL,
	`class_id` text,
	`section_id` text,
	`level` text DEFAULT 'Beginner' NOT NULL,
	`status` text DEFAULT 'Draft' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `lms_course_code_idx` ON `lms_courses` (`institution_id`,`code`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `lms_course_status_idx` ON `lms_courses` (`institution_id`,`status`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `lms_modules` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`course_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`sort_order` integer DEFAULT 1 NOT NULL,
	`status` text DEFAULT 'Published' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`course_id`) REFERENCES `lms_courses`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `lms_module_course_idx` ON `lms_modules` (`institution_id`,`course_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `lms_lessons` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`course_id` text NOT NULL,
	`module_id` text NOT NULL,
	`title` text NOT NULL,
	`content` text DEFAULT '' NOT NULL,
	`duration_minutes` integer DEFAULT 15 NOT NULL,
	`video_url` text DEFAULT '' NOT NULL,
	`sort_order` integer DEFAULT 1 NOT NULL,
	`status` text DEFAULT 'Published' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`course_id`) REFERENCES `lms_courses`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`module_id`) REFERENCES `lms_modules`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `lms_lesson_course_mod_idx` ON `lms_lessons` (`institution_id`,`course_id`,`module_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `lms_resources` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`course_id` text NOT NULL,
	`lesson_id` text,
	`title` text NOT NULL,
	`type` text DEFAULT 'PDF' NOT NULL,
	`file_url` text NOT NULL,
	`file_size_bytes` integer DEFAULT 0 NOT NULL,
	`is_downloadable` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`course_id`) REFERENCES `lms_courses`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `lms_resource_course_idx` ON `lms_resources` (`institution_id`,`course_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `lms_enrollments` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`course_id` text NOT NULL,
	`student_id` text NOT NULL,
	`enrolled_date` text NOT NULL,
	`progress_percent` integer DEFAULT 0 NOT NULL,
	`completed_lessons` text DEFAULT '[]' NOT NULL,
	`last_accessed_lesson_id` text,
	`last_accessed_at` text,
	`status` text DEFAULT 'Active' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`course_id`) REFERENCES `lms_courses`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `lms_enroll_student_course_idx` ON `lms_enrollments` (`institution_id`,`course_id`,`student_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `lms_enroll_student_idx` ON `lms_enrollments` (`institution_id`,`student_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `lms_assignments` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`course_id` text,
	`subject_id` text,
	`class_id` text,
	`section_id` text,
	`faculty_id` text,
	`title` text NOT NULL,
	`instructions` text DEFAULT '' NOT NULL,
	`attachment_url` text DEFAULT '' NOT NULL,
	`max_marks` integer DEFAULT 100 NOT NULL,
	`due_date` text NOT NULL,
	`allow_late` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'Published' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `lms_assignment_course_idx` ON `lms_assignments` (`institution_id`,`course_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `lms_assignment_faculty_idx` ON `lms_assignments` (`institution_id`,`faculty_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `lms_submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`assignment_id` text NOT NULL,
	`student_id` text NOT NULL,
	`student_name` text DEFAULT '' NOT NULL,
	`content` text DEFAULT '' NOT NULL,
	`attachment_url` text DEFAULT '' NOT NULL,
	`submitted_at` text NOT NULL,
	`status` text DEFAULT 'Submitted' NOT NULL,
	`marks_obtained` integer,
	`feedback` text DEFAULT '' NOT NULL,
	`graded_by` text,
	`graded_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`assignment_id`) REFERENCES `lms_assignments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `lms_submission_unique_idx` ON `lms_submissions` (`institution_id`,`assignment_id`,`student_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `lms_sub_assignment_idx` ON `lms_submissions` (`institution_id`,`assignment_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `lms_quizzes` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`course_id` text,
	`faculty_id` text,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`time_limit_minutes` integer DEFAULT 30 NOT NULL,
	`total_marks` integer DEFAULT 100 NOT NULL,
	`passing_marks` integer DEFAULT 40 NOT NULL,
	`due_date` text,
	`status` text DEFAULT 'Published' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `lms_quiz_course_idx` ON `lms_quizzes` (`institution_id`,`course_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `lms_quiz_questions` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`quiz_id` text NOT NULL,
	`question` text NOT NULL,
	`type` text DEFAULT 'MCQ' NOT NULL,
	`options` text DEFAULT '[]' NOT NULL,
	`correct_answer` text NOT NULL,
	`explanation` text DEFAULT '' NOT NULL,
	`marks` integer DEFAULT 10 NOT NULL,
	`sort_order` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`quiz_id`) REFERENCES `lms_quizzes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `lms_quiz_q_quiz_idx` ON `lms_quiz_questions` (`institution_id`,`quiz_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `lms_quiz_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`quiz_id` text NOT NULL,
	`student_id` text NOT NULL,
	`student_name` text DEFAULT '' NOT NULL,
	`answers` text DEFAULT '{}' NOT NULL,
	`score` integer DEFAULT 0 NOT NULL,
	`max_score` integer DEFAULT 100 NOT NULL,
	`percentage` integer DEFAULT 0 NOT NULL,
	`passed` integer DEFAULT 0 NOT NULL,
	`time_spent_seconds` integer DEFAULT 0 NOT NULL,
	`completed_at` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`quiz_id`) REFERENCES `lms_quizzes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `lms_quiz_attempt_student_idx` ON `lms_quiz_attempts` (`institution_id`,`quiz_id`,`student_id`);
