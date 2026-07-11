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
