CREATE INDEX `invitation_email_lookup` ON `invitations` (`email`,`status`);--> statement-breakpoint
CREATE INDEX `membership_user_lookup` ON `memberships` (`user_id`,`active`);