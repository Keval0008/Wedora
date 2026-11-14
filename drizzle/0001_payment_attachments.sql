CREATE TABLE `payment_attachment` (
	`id` varchar(36) NOT NULL,
	`organization_id` varchar(36) NOT NULL,
	`payment_id` varchar(36) NOT NULL,
	`mime_type` varchar(40) NOT NULL,
	`size` int NOT NULL,
	`data` mediumblob NOT NULL,
	`uploaded_by_id` varchar(36) NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `payment_attachment_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `payment_attachment` ADD CONSTRAINT `payment_attachment_organization_id_organization_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payment_attachment` ADD CONSTRAINT `payment_attachment_payment_id_vendor_payment_id_fk` FOREIGN KEY (`payment_id`) REFERENCES `vendor_payment`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payment_attachment` ADD CONSTRAINT `payment_attachment_uploaded_by_id_user_id_fk` FOREIGN KEY (`uploaded_by_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `attachment_payment_idx` ON `payment_attachment` (`payment_id`);