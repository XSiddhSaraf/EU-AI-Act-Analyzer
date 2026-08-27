import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

// Logs each website/document compliance check so the free tier can be capped
// (see app/lib/usage.ts) and usage can be audited later.
export const usageEvents = sqliteTable("usage_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  subject: text("subject").notNull(),
  kind: text("kind").notNull(), // "website" | "document"
  label: text("label").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

// Overrides the free tier for a subject once they upgrade (Pro/Team). Rows
// are written today by /api/admin/set-plan; point a real billing webhook
// (Stripe, etc.) at the same endpoint when one is wired up.
export const accountPlans = sqliteTable("account_plans", {
  subject: text("subject").primaryKey(),
  plan: text("plan").notNull().default("free"), // "free" | "pro" | "team"
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

// One cached snapshot per official regulatory source (see
// app/lib/regulatory-sources.ts). Refreshed by app/lib/knowledge-base.ts —
// on a timer when self-hosted, and on demand (see getKnowledgeBaseContext)
// whenever a row is missing or older than KNOWLEDGE_BASE_MAX_STALENESS_DAYS.
// Powers the LLM-backed analysis in app/api/analyze-smart.
export const knowledgeSources = sqliteTable("knowledge_sources", {
  id: text("id").primaryKey(), // stable slug derived from sourceUrl
  frameworkId: text("framework_id").notNull(), // euai | gdpr | iso42001 | nist | oecd | soc2
  sourceUrl: text("source_url").notNull(),
  title: text("title").notNull().default(""),
  rawText: text("raw_text").notNull().default(""),
  contentHash: text("content_hash").notNull().default(""),
  status: text("status").notNull().default("ok"), // "ok" | "error"
  lastError: text("last_error").notNull().default(""),
  fetchedAt: text("fetched_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
