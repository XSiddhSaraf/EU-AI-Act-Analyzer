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
  assert.match(combined, /stripe_customer_id/);
  assert.match(combined, /stripe_subscription_id/);
  assert.match(combined, /payment_provider/);
  assert.match(combined, /razorpay_subscription_id/);

  assert.equal(
    await exists("dist/.openai/drizzle/meta/_journal.json"),
    true,
    "generated migrations should be bundled into dist for the host to apply on deploy",
  );
});

test("self-hosted bootstrap SQL stays in sync with the Drizzle schema", async () => {
  const dbIndex = await readFile(new URL("db/index.ts", root), "utf8");
  assert.match(dbIndex, /CREATE TABLE IF NOT EXISTS knowledge_sources/);
  assert.match(dbIndex, /stripe_customer_id/);
  assert.match(dbIndex, /stripe_subscription_id/);
  assert.match(dbIndex, /payment_provider/);
  assert.match(dbIndex, /razorpay_subscription_id/);
});

test("Stripe billing is wired end to end, with a manual-plan fallback", async () => {
  const [checker, webhookRoute, portalRoute, schema] = await Promise.all([
    readFile(new URL("app/compliance-checker.tsx", root), "utf8"),
    readFile(new URL("app/api/stripe/webhook/route.ts", root), "utf8"),
    readFile(new URL("app/api/stripe/portal/route.ts", root), "utf8"),
    readFile(new URL("db/schema.ts", root), "utf8"),
  ]);

  assert.match(checker, /\/api\/stripe\/portal/);
  assert.match(checker, /Sign in to upgrade/);
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

test("smart analysis (LLM-powered) is wired end to end, with a static fallback", async () => {
  const [checker, analyzeRoute, knowledgeBase, regulatorySources] = await Promise.all([
    readFile(new URL("app/compliance-checker.tsx", root), "utf8"),
    readFile(new URL("app/api/analyze-smart/route.ts", root), "utf8"),
    readFile(new URL("app/lib/knowledge-base.ts", root), "utf8"),
    readFile(new URL("app/lib/regulatory-sources.ts", root), "utf8"),
  ]);

  assert.match(checker, /\/api\/analyze-smart/);
  assert.match(checker, /Baseline heuristic/, "UI should surface when the AI analysis wasn't used");
  assert.match(analyzeRoute, /ANTHROPIC_API_KEY/);
  assert.match(analyzeRoute, /ok: false/, "the route must fail open instead of erroring");
  assert.match(knowledgeBase, /getKnowledgeBaseContext/);
  assert.match(regulatorySources, /eur-lex\.europa\.eu/);
});

test("home page renders the AI Governance Compatibility Checker, not the starter skeleton", async () => {
  const [page, layout, checker] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/layout.tsx", root), "utf8"),
    readFile(new URL("app/compliance-checker.tsx", root), "utf8"),
  ]);

  assert.match(page, /ComplianceChecker/);
  assert.doesNotMatch(page, /SkeletonPreview|codex-preview/);
  assert.match(layout, /AI Governance Compatibility Checker/);
  assert.match(checker, /Check a website or document against the EU AI Act/);
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

test("free-tier usage metering (3 free checks) is wired end to end", async () => {
  const [schema, usageLib, usageRoute, consumeRoute, checker] = await Promise.all([
    readFile(new URL("db/schema.ts", root), "utf8"),
    readFile(new URL("app/lib/usage.ts", root), "utf8"),
    readFile(new URL("app/api/usage/route.ts", root), "utf8"),
    readFile(new URL("app/api/usage/consume/route.ts", root), "utf8"),
    readFile(new URL("app/compliance-checker.tsx", root), "utf8"),
  ]);

  assert.match(schema, /usageEvents/);
  assert.match(schema, /accountPlans/);
  assert.match(usageLib, /FREE_CHECK_LIMIT = 3/);
  assert.match(usageRoute, /resolveSubject/);
  assert.match(consumeRoute, /free_limit_reached/);

  // UI: usage meter, gated run button, and the upgrade/paywall panel.
  assert.match(checker, /free checks used/);
  assert.match(checker, /showPaywall/);
  assert.match(checker, /\/api\/usage\/consume/);
  assert.match(checker, /Upgrade to Pro/);
});
