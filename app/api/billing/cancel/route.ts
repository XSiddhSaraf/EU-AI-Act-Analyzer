import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { accountPlans } from "../../../../db/schema";
import { getCurrentUser } from "../../../auth";
import { getRazorpay } from "../../../lib/razorpay";
import { getStripe } from "../../../lib/stripe";

/**
 * Cancels the signed-in user's active subscription immediately, regardless
 * of provider. Primarily for Razorpay, which has no equivalent to Stripe's
 * hosted Billing Portal — Stripe subscribers normally use
 * POST /api/stripe/portal instead, which offers richer self-service
 * (payment method updates, invoices) alongside cancellation.
 *
 * Optimistically flips the local plan to "free" in addition to calling the
 * gateway, since the webhook that would otherwise do this may take a
 * moment to arrive; both paths converge on the same value.
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

    if (!row || (!row.razorpaySubscriptionId && !row.stripeSubscriptionId)) {
      return Response.json({
        ok: false,
        reason: "No active subscription found for this account.",
      });
    }

    if (row.paymentProvider === "razorpay" && row.razorpaySubscriptionId) {
      const razorpay = getRazorpay();
      if (!razorpay) {
        return Response.json({ ok: false, reason: "Razorpay is not configured on this deployment." });
      }
      await razorpay.subscriptions.cancel(row.razorpaySubscriptionId, false);
    } else if (row.paymentProvider === "stripe" && row.stripeSubscriptionId) {
      const stripe = getStripe();
      if (!stripe) {
        return Response.json({ ok: false, reason: "Stripe is not configured on this deployment." });
      }
      await stripe.subscriptions.cancel(row.stripeSubscriptionId);
    } else {
      return Response.json({ ok: false, reason: "No recognized subscription provider for this account." });
    }

    await db
      .update(accountPlans)
      .set({ plan: "free", updatedAt: new Date().toISOString() })
      .where(eq(accountPlans.subject, subject));

    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ ok: false, reason: message });
  }
}
