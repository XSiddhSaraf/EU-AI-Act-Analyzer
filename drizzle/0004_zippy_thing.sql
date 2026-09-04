ALTER TABLE `account_plans` ADD `bonus_checks` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `account_plans` ADD `last_check_pack_order_id` text DEFAULT '' NOT NULL;