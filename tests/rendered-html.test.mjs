import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import test from "node:test";

// These checks run against source + build output rather than invoking the
// compiled Cloudflare Worker directly: once the site uses D1 (see
// db/index.ts), the worker bundle imports the `cloudflare:workers` module,
// which plain Node's `--test` runner cannot load outside a Workers runtime.
// Static assertions here still catch the two things that matter for CI:
// the build actually completes and emits the expected artifacts, and the
// shipped page is the real product (not the starter's placeholder skeleton).

const root = new URL("../", import.meta.url);

async function exists(relativePath) {
  try {
    await access(new URL(relativePath, root));
    return true;
  } catch {
    return false;
  }
}

test("build emits the worker, client assets, and D1 hosting config", async () => {
  assert.equal(await exists("dist/server/index.js"), true, "server worker entry should exist");
  assert.equal(await exists("dist/client/.vite/manifest.json"), true, "client build should exist");
  assert.equal(await exists("dist/.openai/hosting.json"), true, "hosting config should be copied into dist");

  const hostingJson = JSON.parse(
    await readFile(new URL("dist/.openai/hosting.json", root), "utf8"),
  );
  assert.equal(hostingJson.d1, "DB", "D1 binding must be enabled for usage metering");
});

test("D1 migration for usage metering is generated and bundled", async () => {
  const journal = JSON.parse(
    await readFile(new URL("drizzle/meta/_journal.json", root), "utf8"),
  );
  assert.ok(journal.entries.length >= 1, "at least one migration should be generated");

  const migrationFiles = journal.entries.map((entry) => `drizzle/${entry.tag}.sql`);
  const migrationContents = await Promise.all(
    migrationFiles.map((file) => readFile(new URL(file, root), "utf8")),
  );
  const combined = migrationContents.join("\n");
  assert.match(combined, /CREATE TABLE `usage_events`/);
  assert.match(combined, /CREATE TABLE `account_plans`/);
  assert.match(combined, /CREATE TABLE `knowledge_sources`/);
  assert.match(combined, /CREATE TABLE `check_reports`/);
  assert.match(combined, /CREATE TABLE `api_keys`/);
  assert.match(combined, /stripe_customer_id/);
  assert.match(combined, /stripe_subscription_id/);
  assert.match(combined, /payment_provider/);
  assert.match(combined, /razorpay_subscription_id/);
  assert.match(combined, /bonus_checks/);
  assert.match(combined, /last_check_pack_order_id/);
  assert.match(combined, /billing_interval/);
  assert.match(combined, /monthly_check_limit_override/);
  assert.match(combined, /pending_full_reports/);
  assert.match(combined, /last_full_report_order_id/);
  assert.match(combined, /white_label_company_name/);
  assert.match(combined, /white_label_logo_url/);

  assert.equal(
    await exists("dist/.openai/drizzle/meta/_journal.json"),
    true,
    "generated migrations should be bundled into dist for the host to apply on deploy",
  );
});

test("self-hosted bootstrap SQL stays in sync with the Drizzle schema", async () => {
  const dbIndex = await readFile(new URL("db/index.ts", root), "utf8");
  assert.match(dbIndex, /CREATE TABLE IF NOT EXISTS knowledge_sources/);
  assert.match(dbIndex, /CREATE TABLE IF NOT EXISTS check_reports/);
  assert.match(dbIndex, /CREATE TABLE IF NOT EXISTS api_keys/);
  assert.match(dbIndex, /stripe_customer_id/);
  assert.match(dbIndex, /stripe_subscription_id/);
  assert.match(dbIndex, /payment_provider/);
  assert.match(dbIndex, /razorpay_subscription_id/);
  assert.match(dbIndex, /bonus_checks/);
  assert.match(dbIndex, /last_check_pack_order_id/);
  assert.match(dbIndex, /billing_interval/);
  assert.match(dbIndex, /monthly_check_limit_override/);
  assert.match(dbIndex, /pending_full_reports/);
  assert.match(dbIndex, /white_label_company_name/);
});

test("Stripe billing is wired end to end, with a manual-plan fallback", async () => {
  const [checker, webhookRoute, portalRoute, schema] = await Promise.all([
    readFile(new URL("app/compliance-checker.tsx", root), "utf8"),
    readFile(new URL("app/api/stripe/webhook/route.ts", root), "utf8"),
    readFile(new URL("app/api/stripe/portal/route.ts", root), "utf8"),
    readFile(new URL("db/schema.ts", root), "utf8"),
  ]);

  assert.match(checker, /\/api\/stripe\/portal/);
  assert.match(checker, /Sign in and upgrade/);
  assert.match(webhookRoute, /constructEvent/, "webhook must verify the Stripe signature");
  assert.match(webhookRoute, /checkout\.session\.completed/);
  assert.match(webhookRoute, /customer\.subscription\.deleted/);
  assert.match(portalRoute, /billingPortal/);
  assert.match(schema, /stripeCustomerId/);
});

test("Razorpay billing is wired end to end, unified with Stripe checkout", async () => {
  const [checker, checkoutRoute, cancelRoute, webhookRoute, usageRoute, razorpayLib, schema] = await Promise.all([
    readFile(new URL("app/compliance-checker.tsx", root), "utf8"),
    readFile(new URL("app/api/billing/checkout/route.ts", root), "utf8"),
    readFile(new URL("app/api/billing/cancel/route.ts", root), "utf8"),
    readFile(new URL("app/api/razorpay/webhook/route.ts", root), "utf8"),
    readFile(new URL("app/api/usage/route.ts", root), "utf8"),
    readFile(new URL("app/lib/razorpay.ts", root), "utf8"),
    readFile(new URL("db/schema.ts", root), "utf8"),
  ]);

  assert.match(checker, /\/api\/billing\/checkout/, "the client must call the unified checkout endpoint");
  assert.match(checker, /\/api\/billing\/cancel/, "the client must call the unified cancel endpoint");
  assert.match(checker, /checkout\.razorpay\.com\/v1\/checkout\.js/, "Razorpay's hosted modal script must be loaded");
  assert.match(checkoutRoute, /getCurrentUser/, "unified checkout must require sign-in");
  assert.match(checkoutRoute, /provider: "razorpay"/);
  assert.match(checkoutRoute, /provider: "stripe"/, "must still fall back to Stripe");
  assert.match(cancelRoute, /razorpay/i);
  assert.match(cancelRoute, /stripe/i, "must still support canceling Stripe subscriptions");
  assert.match(webhookRoute, /validateWebhookSignature/, "webhook must verify the Razorpay signature");
  assert.match(webhookRoute, /subscription\.activated/);
  assert.match(webhookRoute, /subscription\.cancelled/);
  assert.match(usageRoute, /paymentProvider/, "usage route must expose which provider is active");
  assert.match(razorpayLib, /RAZORPAY_KEY_ID/);
  assert.match(razorpayLib, /RAZORPAY_KEY_SECRET/);
  assert.match(schema, /razorpaySubscriptionId/);
  assert.match(schema, /paymentProvider/);
});

test("one-time Razorpay Standard Checkout (extra checks pack) backend is intact", async () => {
  // Note: the current UI (GovCheck redesign, app/compliance-checker.tsx) does
  // not yet surface this feature — it predates the redesign and was
  // intentionally left unwired for now. These assertions cover the backend
  // routes/schema only, so the feature can be re-surfaced in the UI later
  // without silently regressing in the meantime.
  const [createOrderRoute, verifyRoute, usageRoute, consumeRoute, checkPackLib, schema] = await Promise.all([
    readFile(new URL("app/api/one-time/create-order/route.ts", root), "utf8"),
    readFile(new URL("app/api/one-time/verify/route.ts", root), "utf8"),
    readFile(new URL("app/api/usage/route.ts", root), "utf8"),
    readFile(new URL("app/api/usage/consume/route.ts", root), "utf8"),
    readFile(new URL("app/lib/check-pack.ts", root), "utf8"),
    readFile(new URL("db/schema.ts", root), "utf8"),
  ]);

  assert.match(createOrderRoute, /getCurrentUser/, "order creation must require sign-in");
  assert.match(createOrderRoute, /orders\.create/, "must use the Orders API, not Subscriptions");
  assert.match(createOrderRoute, /status: 401/, "must reject anonymous callers");
  assert.match(createOrderRoute, /status: 500/, "must surface Razorpay API errors as 500");
  assert.match(verifyRoute, /createHmac/, "must verify HMAC-SHA256(order_id|payment_id)");
  assert.match(verifyRoute, /timingSafeEqual/, "signature comparison must be timing-safe");
  assert.match(verifyRoute, /status: 400/, "signature mismatch must not be treated as paid");
  assert.match(verifyRoute, /orders\.fetch/, "must confirm order ownership before crediting");
  assert.match(verifyRoute, /lastCheckPackOrderId/, "must be idempotent against repeat verification calls");
  assert.match(usageRoute, /bonusChecks/, "usage route must expose the purchased bonus checks balance");
  assert.match(consumeRoute, /bonusChecks/, "consume gating must count bonus checks toward the limit");
  assert.match(checkPackLib, /CHECK_PACK_SIZE/);
  assert.match(schema, /bonusChecks/);
  assert.match(schema, /lastCheckPackOrderId/);
});

test("smart analysis (LLM-powered) is wired end to end, with a static fallback", async () => {
  const [checker, analyzeRoute, knowledgeBase, regulatorySources] = await Promise.all([
    readFile(new URL("app/compliance-checker.tsx", root), "utf8"),
    readFile(new URL("app/api/analyze-smart/route.ts", root), "utf8"),
    readFile(new URL("app/lib/knowledge-base.ts", root), "utf8"),
    readFile(new URL("app/lib/regulatory-sources.ts", root), "utf8"),
  ]);

  assert.match(checker, /\/api\/analyze-smart/);
  assert.match(checker, /Baseline heuristic/, "UI should surface when the AI analysis wasn't used");
  assert.match(analyzeRoute, /OPENAI_API_KEY/);
  assert.match(analyzeRoute, /ok: false/, "the route must fail open instead of erroring");
  assert.match(knowledgeBase, /getKnowledgeBaseContext/);
  assert.match(regulatorySources, /eur-lex\.europa\.eu/);
});

test("home page renders the GovCheck compliance checker, not the starter skeleton", async () => {
  const [page, layout, checker] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/layout.tsx", root), "utf8"),
    readFile(new URL("app/compliance-checker.tsx", root), "utf8"),
  ]);

  assert.match(page, /ComplianceChecker/);
  assert.doesNotMatch(page, /SkeletonPreview|codex-preview/);
  assert.match(layout, /GovCheck/);
  assert.match(checker, /AI governance with an edge/);
  assert.match(checker, /EU AI Act/);
  assert.match(checker, /GDPR/);
  assert.match(checker, /ISO\/IEC 42001/);
  assert.match(checker, /NIST AI RMF/);

  // The starter's disposable skeleton preview directory may still exist as
  // an empty leftover, but none of its skeleton files should remain.
  if (await exists("app/_sites-preview")) {
    const previewFiles = await readdir(new URL("app/_sites-preview", root));
    assert.deepEqual(previewFiles, [], "no starter skeleton files should remain");
  }
});

test("monthly usage metering (5-tier plans) is wired end to end", async () => {
  const [schema, usageLib, usageRoute, consumeRoute, plansLib, checker] = await Promise.all([
    readFile(new URL("db/schema.ts", root), "utf8"),
    readFile(new URL("app/lib/usage.ts", root), "utf8"),
    readFile(new URL("app/api/usage/route.ts", root), "utf8"),
    readFile(new URL("app/api/usage/consume/route.ts", root), "utf8"),
    readFile(new URL("app/lib/plans.ts", root), "utf8"),
    readFile(new URL("app/compliance-checker.tsx", root), "utf8"),
  ]);

  assert.match(schema, /usageEvents/);
  assert.match(schema, /accountPlans/);
  assert.doesNotMatch(usageLib, /FREE_CHECK_LIMIT/, "flat lifetime limit should be replaced by per-plan monthly limits");
  assert.match(usageRoute, /resolveSubject/);
  assert.match(usageRoute, /resolvePlanContext/, "usage must resolve limits from the plan config, not a flat constant");
  assert.match(consumeRoute, /free_limit_reached/);
  assert.match(consumeRoute, /startOfCurrentUtcMonthIso/, "usage must reset monthly, not be a lifetime cap");
  assert.match(plansLib, /monthlyChecks: 3/, "free tier");
  assert.match(plansLib, /monthlyChecks: 60/, "pro tier");
  assert.match(plansLib, /monthlyChecks: 300/, "team tier");
  assert.match(plansLib, /monthlyChecks: 1000/, "agency tier");
  assert.match(plansLib, /maxFrameworksPerCheck: 1/, "free tier is capped to 1 framework per check");

  // UI: usage meter, gated run button, and the upgrade/paywall panel.
  assert.match(checker, /free checks/i);
  assert.match(checker, /showPaywall/);
  assert.match(checker, /\/api\/usage\/consume/);
  assert.match(checker, /Upgrade to Pro/);
  assert.match(checker, /Upgrade to Team/);
  assert.match(checker, /Upgrade to Agency/);
});

test("Full Report one-off purchase is wired end to end", async () => {
  const [createOrderRoute, verifyRoute, analyzeRoute, stripeWebhook, fullReportLib, schema, checker] = await Promise.all([
    readFile(new URL("app/api/full-report/create-order/route.ts", root), "utf8"),
    readFile(new URL("app/api/full-report/verify/route.ts", root), "utf8"),
    readFile(new URL("app/api/analyze-smart/route.ts", root), "utf8"),
    readFile(new URL("app/api/stripe/webhook/route.ts", root), "utf8"),
    readFile(new URL("app/lib/full-report.ts", root), "utf8"),
    readFile(new URL("db/schema.ts", root), "utf8"),
    readFile(new URL("app/compliance-checker.tsx", root), "utf8"),
  ]);

  assert.match(createOrderRoute, /getCurrentUser/, "order creation must require sign-in");
  assert.match(createOrderRoute, /orders\.create/, "must prefer the Razorpay Orders API");
  assert.match(createOrderRoute, /mode: "payment"/, "must fall back to a Stripe one-off payment session");
  assert.match(verifyRoute, /createHmac/, "must verify HMAC-SHA256(order_id|payment_id)");
  assert.match(verifyRoute, /pendingFullReports/, "must credit the full-report counter, not bonusChecks");
  assert.match(stripeWebhook, /kind === "full_report"/, "stripe webhook must distinguish one-off payments from subscriptions");
  assert.match(analyzeRoute, /pendingFullReports/, "analyze-smart must consume the credit and unlock all frameworks");
  assert.match(analyzeRoute, /FRAMEWORK_IDS\s*$/m, "a full-report run should force all framework ids");
  assert.match(fullReportLib, /FULL_REPORT_PRICE_USD_CENTS/);
  assert.match(schema, /pendingFullReports/);
  assert.match(checker, /\/api\/full-report\/create-order/);
  assert.match(checker, /Buy Full Report/);
});

test("check history + PDF/CSV export are wired end to end", async () => {
  const [reportsRoute, pdfRoute, csvRoute, pdfLib, csvLib, analyzeRoute, checker] = await Promise.all([
    readFile(new URL("app/api/reports/route.ts", root), "utf8"),
    readFile(new URL("app/api/reports/[id]/pdf/route.ts", root), "utf8"),
    readFile(new URL("app/api/reports/[id]/csv/route.ts", root), "utf8"),
    readFile(new URL("app/lib/pdf-report.tsx", root), "utf8"),
    readFile(new URL("app/lib/csv.ts", root), "utf8"),
    readFile(new URL("app/api/analyze-smart/route.ts", root), "utf8"),
    readFile(new URL("app/compliance-checker.tsx", root), "utf8"),
  ]);

  assert.match(reportsRoute, /resolveSubject/);
  assert.match(pdfRoute, /row\.subject !== subject/, "PDF export must be ownership-checked");
  assert.match(csvRoute, /row\.subject !== subject/, "CSV export must be ownership-checked");
  assert.match(pdfLib, /renderComplianceReportPdf/);
  assert.match(pdfLib, /companyName/, "PDF must support Agency white-label branding");
  assert.match(csvLib, /reportToCsv/);
  assert.match(analyzeRoute, /checkReports/, "analyze-smart must persist reports for history/export");
  assert.match(checker, /\/api\/reports/);
  assert.match(checker, /Download PDF/);
  assert.match(checker, /Download CSV/);
});

test("Agency API keys and white-label branding are wired end to end", async () => {
  const [apiKeysRoute, revokeRoute, apiKeysLib, brandingRoute, analyzeRoute, schema, checker] = await Promise.all([
    readFile(new URL("app/api/api-keys/route.ts", root), "utf8"),
    readFile(new URL("app/api/api-keys/[id]/route.ts", root), "utf8"),
    readFile(new URL("app/lib/api-keys.ts", root), "utf8"),
    readFile(new URL("app/api/account/branding/route.ts", root), "utf8"),
    readFile(new URL("app/api/analyze-smart/route.ts", root), "utf8"),
    readFile(new URL("db/schema.ts", root), "utf8"),
    readFile(new URL("app/compliance-checker.tsx", root), "utf8"),
  ]);

  assert.match(apiKeysRoute, /plan !== "agency"/, "key creation/listing must require the Agency plan");
  assert.match(revokeRoute, /row\.subject !== subject/, "key revocation must be ownership-checked");
  assert.match(apiKeysLib, /createHash\("sha256"\)/, "raw keys must never be stored, only a hash");
  assert.match(brandingRoute, /plan !== "agency"/, "branding must require the Agency plan");
  assert.match(brandingRoute, /protocol === "https:"/, "logo URL must be validated as https");
  assert.match(analyzeRoute, /extractBearerToken/, "analyze-smart must accept an Agency API key as an alternate identity");
  assert.match(schema, /apiKeys/);
  assert.match(checker, /Generate new key/);
  assert.match(checker, /White-label branding/);
});
