import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { accountPlans } from "../../../../db/schema";
import { getCurrentUser } from "../../../auth";
import { getStripe } from "../../../lib/stripe";

/**
 * Opens a Stripe-hosted Billing Portal session for the signed-in user, so
 * they can update payment methods or cancel without contacting support.
 * Only works for subjects with a stripeCustomerId (i.e. they came through
 * /api/stripe/checkout) — accounts granted Pro manually via
 * /api/admin/set-plan have no Stripe customer to manage.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user?.email) {
    return Response.json({ ok: false, reason: "Sign in required." }, { status: 401 });
  }

  const stripe = getStripe();
  if (!stripe) {
    return Response.json({ ok: false, reason: "Billing management is not configured on this deployment." });
  }

  const subject = `user:${user.email}`;
  const requestUrl = new URL(request.url);
  const origin = `${requestUrl.protocol}//${requestUrl.host}`;

  try {
    const db = await getDb();
    const rows: (typeof accountPlans.$inferSelect)[] = await db
      .select()
      .from(accountPlans)
      .where(eq(accountPlans.subject, subject))
      .limit(1);
    const customerId = rows[0]?.stripeCustomerId;

    if (!customerId) {
      return Response.json({
        ok: false,
        reason:
          "No billing account found for this user. This can happen if your plan was granted manually rather than through checkout.",
      });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${origin}/`,
    });

    return Response.json({ ok: true, url: session.url });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ ok: false, reason: message });
  }
}
