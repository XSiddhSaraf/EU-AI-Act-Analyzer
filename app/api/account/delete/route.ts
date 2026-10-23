import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { accountPlans, apiKeys, checkReports, usageEvents } from "../../../../db/schema";
import { getCurrentUser } from "../../../auth";
import { describeError } from "../../../lib/errors";
import { getRazorpay } from "../../../lib/razorpay";
import { getStripe } from "../../../lib/stripe";

/**
 * GDPR/CCPA right-to-erasure: permanently deletes every row this app holds
 * for the signed-in subject (account_plans, usage_events, check_reports,
 * api_keys), scoped strictly via the `subject` column — no admin override,
 * no arbitrary target. Requires sign-in.
 *
 * Cancels any active subscription first (mirrors POST /api/billing/cancel)
 * so deleting the account doesn't leave an orphaned, still-billing
 * subscription at the payment provider.
 *
 * Auth.js sessions here are JWT-based (see app/auth.ts), so there is no
 * server-side session row to clear — the client must still sign the
 * browser out to drop the session cookie after this call succeeds.
 */
export async function POST() {
  const user = await getCurrentUser();
  if (!user?.email) {
    return Response.json({ ok: false, reason: "Sign in required." }, { status: 401 });
  }

  const subject = `user:${user.email}`;

  try {
    const db = await getDb();
    const rows: (typeof accountPlans.$inferSelect)[] = await db
      .select()
      .from(accountPlans)
      .where(eq(accountPlans.subject, subject))
      .limit(1);
    const row = rows[0];

    if (row?.paymentProvider === "razorpay" && row.razorpaySubscriptionId) {
      const razorpay = getRazorpay();
      if (razorpay) {
        try {
          await razorpay.subscriptions.cancel(row.razorpaySubscriptionId, false);
        } catch {
          // Best-effort: don't block account deletion on a provider hiccup
          // (e.g. the subscription was already canceled upstream).
        }
      }
    } else if (row?.paymentProvider === "stripe" && row.stripeSubscriptionId) {
      const stripe = getStripe();
      if (stripe) {
        try {
          await stripe.subscriptions.cancel(row.stripeSubscriptionId);
        } catch {
          // Best-effort, same reasoning as above.
        }
      }
    }

    await Promise.all([
      db.delete(apiKeys).where(eq(apiKeys.subject, subject)),
      db.delete(checkReports).where(eq(checkReports.subject, subject)),
      db.delete(usageEvents).where(eq(usageEvents.subject, subject)),
      db.delete(accountPlans).where(eq(accountPlans.subject, subject)),
    ]);

    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ ok: false, reason: describeError(error) }, { status: 500 });
  }
}
