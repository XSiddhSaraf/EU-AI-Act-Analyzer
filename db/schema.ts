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
// are written by /api/stripe/webhook or /api/razorpay/webhook on successful
// checkout/cancellation, or manually via /api/admin/set-plan (e.g. Team
// deals, support cases). See app/lib/billing.ts for provider selection
// (Razorpay preferred when configured, since it's the only option that
// currently works for India-based merchants without a Stripe invite).
export const accountPlans = sqliteTable("account_plans", {
  subject: text("subject").primaryKey(),
  plan: text("plan").notNull().default("free"), // "free" | "pro" | "team"
  // Which gateway this subject's active subscription (if any) is through.
  // Determines whether "Manage billing" opens the Stripe portal or offers a
  // direct cancel action (Razorpay has no equivalent hosted portal).
  paymentProvider: text("payment_provider").notNull().default(""), // "" | "stripe" | "razorpay"
  // Set once a subject completes Stripe Checkout; used by /api/stripe/portal
  // to open a billing-management session, and by the webhook to find the
  // right row when a subscription is updated/canceled. Empty for
  // subjects whose plan was only ever set manually (no self-service billing).
  stripeCustomerId: text("stripe_customer_id").notNull().default(""),
  stripeSubscriptionId: text("stripe_subscription_id").notNull().default(""),
  // Set once a subject completes Razorpay Checkout; used by /api/billing/cancel
  // and by /api/razorpay/webhook to find the right row on subscription events.
  razorpaySubscriptionId: text("razorpay_subscription_id").notNull().default(""),
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
