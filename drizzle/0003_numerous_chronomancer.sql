ALTER TABLE `account_plans` ADD `payment_provider` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `account_plans` ADD `razorpay_subscription_id` text DEFAULT '' NOT NULL;