CREATE TABLE `account` (
	`id` varchar(36) NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` timestamp(3),
	`refresh_token_expires_at` timestamp(3),
	`scope` text,
	`password` text,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL,
	CONSTRAINT `account_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `invitation` (
	`id` varchar(36) NOT NULL,
	`organization_id` varchar(36) NOT NULL,
	`email` varchar(255) NOT NULL,
	`role` varchar(255),
	`status` varchar(255) NOT NULL DEFAULT 'pending',
	`expires_at` timestamp(3) NOT NULL,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`inviter_id` varchar(36) NOT NULL,
	CONSTRAINT `invitation_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `member` (
	`id` varchar(36) NOT NULL,
	`organization_id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`role` varchar(255) NOT NULL DEFAULT 'member',
	`created_at` timestamp(3) NOT NULL,
	CONSTRAINT `member_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `organization` (
	`id` varchar(36) NOT NULL,
	`name` varchar(255) NOT NULL,
	`slug` varchar(255) NOT NULL,
	`logo` text,
	`created_at` timestamp(3) NOT NULL,
	`metadata` text,
	CONSTRAINT `organization_id` PRIMARY KEY(`id`),
	CONSTRAINT `organization_slug_unique` UNIQUE(`slug`),
	CONSTRAINT `organization_slug_uidx` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `rate_limit` (
	`id` varchar(36) NOT NULL,
	`key` varchar(255) NOT NULL,
	`count` int NOT NULL,
	`last_request` bigint NOT NULL,
	CONSTRAINT `rate_limit_id` PRIMARY KEY(`id`),
	CONSTRAINT `rate_limit_key_unique` UNIQUE(`key`)
);
--> statement-breakpoint
CREATE TABLE `session` (
	`id` varchar(36) NOT NULL,
	`expires_at` timestamp(3) NOT NULL,
	`token` varchar(255) NOT NULL,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` varchar(36) NOT NULL,
	`active_organization_id` text,
	CONSTRAINT `session_id` PRIMARY KEY(`id`),
	CONSTRAINT `session_token_unique` UNIQUE(`token`)
);
--> statement-breakpoint
CREATE TABLE `user` (
	`id` varchar(36) NOT NULL,
	`name` varchar(255) NOT NULL,
	`email` varchar(255) NOT NULL,
	`email_verified` boolean NOT NULL DEFAULT false,
	`image` text,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()),
	`username` varchar(255),
	`display_username` text,
	`passcode_hash` text,
	CONSTRAINT `user_id` PRIMARY KEY(`id`),
	CONSTRAINT `user_email_unique` UNIQUE(`email`),
	CONSTRAINT `user_username_unique` UNIQUE(`username`)
);
--> statement-breakpoint
CREATE TABLE `verification` (
	`id` varchar(36) NOT NULL,
	`identifier` varchar(255) NOT NULL,
	`value` text NOT NULL,
	`expires_at` timestamp(3) NOT NULL,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `verification_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `gift` (
	`id` varchar(36) NOT NULL,
	`organization_id` varchar(36) NOT NULL,
	`function_id` varchar(36),
	`giver_name` varchar(150) NOT NULL,
	`relation` varchar(80),
	`side` enum('groom','bride'),
	`city` varchar(80),
	`kind` enum('cash','gift','gold','silver','other') NOT NULL DEFAULT 'cash',
	`amount` int,
	`description` varchar(300),
	`recorded_by_id` varchar(36) NOT NULL,
	`client_id` varchar(40),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `gift_id` PRIMARY KEY(`id`),
	CONSTRAINT `gift_client_id_unique` UNIQUE(`client_id`)
);
--> statement-breakpoint
CREATE TABLE `job_state` (
	`key` varchar(100) NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `job_state_key` PRIMARY KEY(`key`)
);
--> statement-breakpoint
CREATE TABLE `join_request` (
	`id` varchar(36) NOT NULL,
	`organization_id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`status` enum('pending','accepted','rejected') NOT NULL DEFAULT 'pending',
	`decided_by_id` varchar(36),
	`decided_at` datetime(3),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `join_request_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `push_subscription` (
	`id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`endpoint` varchar(700) NOT NULL,
	`p256dh` varchar(200) NOT NULL,
	`auth` varchar(100) NOT NULL,
	`user_agent` varchar(300),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `push_subscription_id` PRIMARY KEY(`id`),
	CONSTRAINT `push_subscription_endpoint_unique` UNIQUE(`endpoint`)
);
--> statement-breakpoint
CREATE TABLE `reminder` (
	`id` varchar(36) NOT NULL,
	`task_id` varchar(36) NOT NULL,
	`preset` enum('at','15m','1h','morning','1d'),
	`remind_at` datetime(3) NOT NULL,
	`sent_at` datetime(3),
	`skipped` boolean NOT NULL DEFAULT false,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `reminder_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `run_item` (
	`id` varchar(36) NOT NULL,
	`organization_id` varchar(36) NOT NULL,
	`function_id` varchar(36) NOT NULL,
	`time` varchar(5),
	`title` varchar(200) NOT NULL,
	`owner_user_id` varchar(36),
	`owner_name` varchar(100),
	`notes` text,
	`sort_order` int NOT NULL DEFAULT 0,
	`done` boolean NOT NULL DEFAULT false,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `run_item_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `song` (
	`id` varchar(36) NOT NULL,
	`list_id` varchar(36) NOT NULL,
	`spotify_id` varchar(32),
	`youtube_id` varchar(16),
	`title` varchar(300) NOT NULL,
	`artist` varchar(300),
	`thumbnail_url` varchar(600),
	`duration_sec` int,
	`norm_key` varchar(300) NOT NULL,
	`possible_dup_of` varchar(36),
	`hidden` boolean NOT NULL DEFAULT false,
	`sort_order` int NOT NULL DEFAULT 0,
	`performer` varchar(120),
	`cut_start_sec` int,
	`cut_end_sec` int,
	`notes` text,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `song_id` PRIMARY KEY(`id`),
	CONSTRAINT `song_list_spotify_uidx` UNIQUE(`list_id`,`spotify_id`),
	CONSTRAINT `song_list_youtube_uidx` UNIQUE(`list_id`,`youtube_id`)
);
--> statement-breakpoint
CREATE TABLE `song_list` (
	`id` varchar(36) NOT NULL,
	`organization_id` varchar(36) NOT NULL,
	`kind` enum('baraat','sangeet','other') NOT NULL DEFAULT 'baraat',
	`title` varchar(120) NOT NULL,
	`description` text,
	`submit_slug` varchar(16) NOT NULL,
	`dj_slug` varchar(16) NOT NULL,
	`is_open` boolean NOT NULL DEFAULT true,
	`show_list_to_guests` boolean NOT NULL DEFAULT true,
	`created_by_id` varchar(36) NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `song_list_id` PRIMARY KEY(`id`),
	CONSTRAINT `song_list_submit_slug_unique` UNIQUE(`submit_slug`),
	CONSTRAINT `song_list_dj_slug_unique` UNIQUE(`dj_slug`)
);
--> statement-breakpoint
CREATE TABLE `song_submission` (
	`id` varchar(36) NOT NULL,
	`song_id` varchar(36) NOT NULL,
	`list_id` varchar(36) NOT NULL,
	`submitter_name` varchar(80) NOT NULL,
	`raw_url` varchar(600),
	`note` varchar(500),
	`ip_hash` varchar(64) NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `song_submission_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `task` (
	`id` varchar(36) NOT NULL,
	`organization_id` varchar(36) NOT NULL,
	`function_id` varchar(36),
	`title` varchar(300) NOT NULL,
	`description` text,
	`status` enum('todo','in_progress','done') NOT NULL DEFAULT 'todo',
	`priority` enum('low','medium','high','urgent') NOT NULL DEFAULT 'medium',
	`assignee_id` varchar(36),
	`created_by_id` varchar(36) NOT NULL,
	`due_at` datetime(3),
	`notify_creator` boolean NOT NULL DEFAULT false,
	`is_personal` boolean NOT NULL DEFAULT false,
	`vendor_payment_id` varchar(36),
	`completed_at` datetime(3),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `task_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `team_code` (
	`organization_id` varchar(36) NOT NULL,
	`code` varchar(12) NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `team_code_organization_id` PRIMARY KEY(`organization_id`),
	CONSTRAINT `team_code_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `telegram_link` (
	`user_id` varchar(36) NOT NULL,
	`chat_id` varchar(40),
	`link_code` varchar(40),
	`link_expires_at` datetime(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `telegram_link_user_id` PRIMARY KEY(`user_id`),
	CONSTRAINT `telegram_link_chat_id_unique` UNIQUE(`chat_id`),
	CONSTRAINT `telegram_link_link_code_unique` UNIQUE(`link_code`)
);
--> statement-breakpoint
CREATE TABLE `vendor` (
	`id` varchar(36) NOT NULL,
	`organization_id` varchar(36) NOT NULL,
	`name` varchar(150) NOT NULL,
	`category` varchar(40) NOT NULL DEFAULT 'other',
	`contact_name` varchar(120),
	`phone` varchar(20),
	`total_amount` int NOT NULL DEFAULT 0,
	`notes` text,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `vendor_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `vendor_payment` (
	`id` varchar(36) NOT NULL,
	`organization_id` varchar(36) NOT NULL,
	`vendor_id` varchar(36) NOT NULL,
	`amount` int NOT NULL,
	`due_at` datetime(3),
	`paid_at` datetime(3),
	`method` enum('cash','upi','bank','card','other'),
	`note` varchar(300),
	`created_by_id` varchar(36) NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `vendor_payment_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `wedding_function` (
	`id` varchar(36) NOT NULL,
	`organization_id` varchar(36) NOT NULL,
	`name` varchar(120) NOT NULL,
	`color` varchar(16) NOT NULL DEFAULT '#b4232c',
	`date` varchar(10),
	`start_time` varchar(5),
	`venue` varchar(200),
	`map_url` varchar(600),
	`dress_code` varchar(200),
	`notes` text,
	`sort_order` int NOT NULL DEFAULT 0,
	`archived` boolean NOT NULL DEFAULT false,
	`created_by_id` varchar(36) NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `wedding_function_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `wedding_settings` (
	`organization_id` varchar(36) NOT NULL,
	`couple_names` varchar(200),
	`wedding_date` varchar(10),
	`run_sheet_slug` varchar(16) NOT NULL,
	`run_sheet_public` boolean NOT NULL DEFAULT false,
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `wedding_settings_organization_id` PRIMARY KEY(`organization_id`),
	CONSTRAINT `wedding_settings_run_sheet_slug_unique` UNIQUE(`run_sheet_slug`)
);
--> statement-breakpoint
ALTER TABLE `account` ADD CONSTRAINT `account_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `invitation` ADD CONSTRAINT `invitation_organization_id_organization_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `invitation` ADD CONSTRAINT `invitation_inviter_id_user_id_fk` FOREIGN KEY (`inviter_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `member` ADD CONSTRAINT `member_organization_id_organization_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `member` ADD CONSTRAINT `member_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `session` ADD CONSTRAINT `session_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `gift` ADD CONSTRAINT `gift_organization_id_organization_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `gift` ADD CONSTRAINT `gift_function_id_wedding_function_id_fk` FOREIGN KEY (`function_id`) REFERENCES `wedding_function`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `gift` ADD CONSTRAINT `gift_recorded_by_id_user_id_fk` FOREIGN KEY (`recorded_by_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `join_request` ADD CONSTRAINT `join_request_organization_id_organization_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `join_request` ADD CONSTRAINT `join_request_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `join_request` ADD CONSTRAINT `join_request_decided_by_id_user_id_fk` FOREIGN KEY (`decided_by_id`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `push_subscription` ADD CONSTRAINT `push_subscription_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `reminder` ADD CONSTRAINT `reminder_task_id_task_id_fk` FOREIGN KEY (`task_id`) REFERENCES `task`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `run_item` ADD CONSTRAINT `run_item_organization_id_organization_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `run_item` ADD CONSTRAINT `run_item_function_id_wedding_function_id_fk` FOREIGN KEY (`function_id`) REFERENCES `wedding_function`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `run_item` ADD CONSTRAINT `run_item_owner_user_id_user_id_fk` FOREIGN KEY (`owner_user_id`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `song` ADD CONSTRAINT `song_list_id_song_list_id_fk` FOREIGN KEY (`list_id`) REFERENCES `song_list`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `song_list` ADD CONSTRAINT `song_list_organization_id_organization_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `song_list` ADD CONSTRAINT `song_list_created_by_id_user_id_fk` FOREIGN KEY (`created_by_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `song_submission` ADD CONSTRAINT `song_submission_song_id_song_id_fk` FOREIGN KEY (`song_id`) REFERENCES `song`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `song_submission` ADD CONSTRAINT `song_submission_list_id_song_list_id_fk` FOREIGN KEY (`list_id`) REFERENCES `song_list`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `task` ADD CONSTRAINT `task_organization_id_organization_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `task` ADD CONSTRAINT `task_function_id_wedding_function_id_fk` FOREIGN KEY (`function_id`) REFERENCES `wedding_function`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `task` ADD CONSTRAINT `task_assignee_id_user_id_fk` FOREIGN KEY (`assignee_id`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `task` ADD CONSTRAINT `task_created_by_id_user_id_fk` FOREIGN KEY (`created_by_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `team_code` ADD CONSTRAINT `team_code_organization_id_organization_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `telegram_link` ADD CONSTRAINT `telegram_link_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `vendor` ADD CONSTRAINT `vendor_organization_id_organization_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `vendor_payment` ADD CONSTRAINT `vendor_payment_organization_id_organization_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `vendor_payment` ADD CONSTRAINT `vendor_payment_vendor_id_vendor_id_fk` FOREIGN KEY (`vendor_id`) REFERENCES `vendor`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `vendor_payment` ADD CONSTRAINT `vendor_payment_created_by_id_user_id_fk` FOREIGN KEY (`created_by_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `wedding_function` ADD CONSTRAINT `wedding_function_organization_id_organization_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `wedding_function` ADD CONSTRAINT `wedding_function_created_by_id_user_id_fk` FOREIGN KEY (`created_by_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `wedding_settings` ADD CONSTRAINT `wedding_settings_organization_id_organization_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `account_userId_idx` ON `account` (`user_id`);--> statement-breakpoint
CREATE INDEX `invitation_organizationId_idx` ON `invitation` (`organization_id`);--> statement-breakpoint
CREATE INDEX `invitation_email_idx` ON `invitation` (`email`);--> statement-breakpoint
CREATE INDEX `member_organizationId_idx` ON `member` (`organization_id`);--> statement-breakpoint
CREATE INDEX `member_userId_idx` ON `member` (`user_id`);--> statement-breakpoint
CREATE INDEX `session_userId_idx` ON `session` (`user_id`);--> statement-breakpoint
CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);--> statement-breakpoint
CREATE INDEX `gift_org_idx` ON `gift` (`organization_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `gift_name_idx` ON `gift` (`organization_id`,`giver_name`);--> statement-breakpoint
CREATE INDEX `join_request_team_idx` ON `join_request` (`organization_id`,`status`);--> statement-breakpoint
CREATE INDEX `join_request_user_idx` ON `join_request` (`user_id`,`status`);--> statement-breakpoint
CREATE INDEX `push_user_idx` ON `push_subscription` (`user_id`);--> statement-breakpoint
CREATE INDEX `reminder_due_idx` ON `reminder` (`sent_at`,`remind_at`);--> statement-breakpoint
CREATE INDEX `reminder_task_idx` ON `reminder` (`task_id`);--> statement-breakpoint
CREATE INDEX `run_item_function_idx` ON `run_item` (`function_id`,`sort_order`);--> statement-breakpoint
CREATE INDEX `song_list_norm_idx` ON `song` (`list_id`,`norm_key`);--> statement-breakpoint
CREATE INDEX `song_list_order_idx` ON `song` (`list_id`,`sort_order`);--> statement-breakpoint
CREATE INDEX `song_list_org_idx` ON `song_list` (`organization_id`);--> statement-breakpoint
CREATE INDEX `submission_song_idx` ON `song_submission` (`song_id`);--> statement-breakpoint
CREATE INDEX `submission_rate_idx` ON `song_submission` (`ip_hash`,`created_at`);--> statement-breakpoint
CREATE INDEX `task_org_status_idx` ON `task` (`organization_id`,`status`);--> statement-breakpoint
CREATE INDEX `task_org_function_idx` ON `task` (`organization_id`,`function_id`);--> statement-breakpoint
CREATE INDEX `task_assignee_idx` ON `task` (`organization_id`,`assignee_id`);--> statement-breakpoint
CREATE INDEX `task_personal_idx` ON `task` (`organization_id`,`created_by_id`,`is_personal`);--> statement-breakpoint
CREATE INDEX `task_due_idx` ON `task` (`organization_id`,`due_at`);--> statement-breakpoint
CREATE INDEX `task_payment_idx` ON `task` (`vendor_payment_id`);--> statement-breakpoint
CREATE INDEX `vendor_org_idx` ON `vendor` (`organization_id`);--> statement-breakpoint
CREATE INDEX `payment_vendor_idx` ON `vendor_payment` (`vendor_id`);--> statement-breakpoint
CREATE INDEX `function_org_idx` ON `wedding_function` (`organization_id`,`archived`);