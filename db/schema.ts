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
  plan: text("plan").notNull().default("free"), // "free" | "pro" | "team" | "agency"
  // "" | "monthly" | "yearly" — which billing interval the active paid
  // subscription (if any) was purchased at. See app/lib/plans.ts.
  billingInterval: text("billing_interval").notNull().default(""),
  // Overrides PLAN_LIMITS[plan].monthlyChecks for negotiated custom deals
  // (e.g. Enterprise), set manually via /api/admin/set-plan. -1 means
  // unlimited (see UNLIMITED_OVERRIDE in app/lib/plans.ts). Null means "use
  // the plan's default limit".
  monthlyCheckLimitOverride: integer("monthly_check_limit_override"),
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
  // Extra one-time-purchased checks (Razorpay Orders/Standard Checkout, see
  // app/api/one-time/*), on top of the plan's monthly limit. Independent of
  // `plan` — a free-tier subject can stack bonus checks without subscribing.
  bonusChecks: integer("bonus_checks").notNull().default(0),
  // The last Razorpay order id credited toward bonusChecks, so re-submitting
  // /api/one-time/verify for an already-processed order (e.g. a retried
  // request) doesn't double-credit the same payment.
  lastCheckPackOrderId: text("last_check_pack_order_id").notNull().default(""),
  // Credits from the one-off "Full Report" purchase (see app/lib/full-report.ts,
  // app/api/full-report/*) — each credit unlocks one all-6-framework check
  // with a branded PDF, regardless of the subject's regular plan.
  pendingFullReports: integer("pending_full_reports").notNull().default(0),
  lastFullReportOrderId: text("last_full_report_order_id").notNull().default(""),
  // Agency-only white-label branding applied to generated PDFs (see
  // app/lib/pdf-report.tsx). Logo is a hosted URL — no upload/storage in
  // this phase.
  whiteLabelCompanyName: text("white_label_company_name").notNull().default(""),
  whiteLabelLogoUrl: text("white_label_logo_url").notNull().default(""),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

// One row per completed compliance check, for Pro/Team/Agency check history
// and PDF/CSV export (see app/api/reports/*). Free-tier checks are not
// persisted here (no history entitlement) except for Full Report one-off
// runs, which always get a row so the buyer can download their PDF.
export const checkReports = sqliteTable("check_reports", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  subject: text("subject").notNull(),
  label: text("label").notNull().default(""),
  // Full JSON-serialized SmartAnalysisResponse (or heuristic-equivalent
  // shape) — kept as one opaque blob rather than normalized columns since
  // it's only ever read back whole (for PDF/CSV rendering or the history
  // list summary fields below).
  resultJson: text("result_json").notNull(),
  readiness: integer("readiness").notNull().default(0),
  verdict: text("verdict").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

// Agency-only API keys for programmatic access to POST /api/analyze-smart
// (see app/api/api-keys/*). Only a salted hash is stored; the raw key is
// shown once at creation time.
export const apiKeys = sqliteTable("api_keys", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  subject: text("subject").notNull(),
  keyHash: text("key_hash").notNull(),
  // First few characters of the raw key, safe to display for identification
  // (e.g. "gck_live_ab12…") without revealing the full secret.
  keyPrefix: text("key_prefix").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  lastUsedAt: text("last_used_at").notNull().default(""),
  revokedAt: text("revoked_at").notNull().default(""),
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
