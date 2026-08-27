CREATE TABLE `knowledge_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`framework_id` text NOT NULL,
	`source_url` text NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`raw_text` text DEFAULT '' NOT NULL,
	`content_hash` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'ok' NOT NULL,
	`last_error` text DEFAULT '' NOT NULL,
	`fetched_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
