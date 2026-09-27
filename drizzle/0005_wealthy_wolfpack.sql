CREATE TABLE `api_keys` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`subject` text NOT NULL,
	`key_hash` text NOT NULL,
	`key_prefix` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`last_used_at` text DEFAULT '' NOT NULL,
	`revoked_at` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `check_reports` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`subject` text NOT NULL,
	`label` text DEFAULT '' NOT NULL,
	`result_json` text NOT NULL,
	`readiness` integer DEFAULT 0 NOT NULL,
	`verdict` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE `account_plans` ADD `billing_interval` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `account_plans` ADD `monthly_check_limit_override` integer;--> statement-breakpoint
ALTER TABLE `account_plans` ADD `pending_full_reports` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `account_plans` ADD `last_full_report_order_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `account_plans` ADD `white_label_company_name` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `account_plans` ADD `white_label_logo_url` text DEFAULT '' NOT NULL;