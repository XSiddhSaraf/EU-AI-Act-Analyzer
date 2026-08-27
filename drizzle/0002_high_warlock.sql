ALTER TABLE `account_plans` ADD `stripe_customer_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `account_plans` ADD `stripe_subscription_id` text DEFAULT '' NOT NULL;