import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import { getDb } from "../../../../db";
import { accountPlans } from "../../../../db/schema";
import { getStripe } from "../../../lib/stripe";

/**
 * Handles Stripe subscription lifecycle events, replacing the day-to-day
 * job of the manual POST /api/admin/set-plan (which stays available as a
 * fallback for Team deals / support cases). Configure this URL in the
 * Stripe Dashboard under Developers -> Webhooks.
 *
 * Verification requires the exact raw request body — read it with
 * request.text() before any JSON parsing, unlike every other route here.
 */
export async function POST(request: Request) {
  const stripe = getStripe();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !webhookSecret) {
    return Response.json({ error: "Stripe webhook is not configured on this deployment." }, { status: 501 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return Response.json({ error: "Missing stripe-signature header." }, { status: 400 });
  }

  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid signature";
    return Response.json({ error: `Webhook signature verification failed: ${message}` }, { status: 400 });
  }

  try {
    const db = await getDb();

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const subject = session.metadata?.subject ?? session.client_reference_id ?? undefined;
      const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
      const subscriptionId =
        typeof session.subscription === "string" ? session.subscription : session.subscription?.id;

      if (subject && customerId) {
        const now = new Date().toISOString();
        await db
          .insert(accountPlans)
          .values({
            subject,
            plan: "pro",
            stripeCustomerId: customerId,
            stripeSubscriptionId: subscriptionId ?? "",
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: accountPlans.subject,
            set: {
              plan: "pro",
              stripeCustomerId: customerId,
              stripeSubscriptionId: subscriptionId ?? "",
              updatedAt: now,
            },
          });
      }
    } else if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId =
        typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id;
      const isActive = subscription.status === "active" || subscription.status === "trialing";

      if (customerId) {
        const rows: (typeof accountPlans.$inferSelect)[] = await db
          .select()
          .from(accountPlans)
          .where(eq(accountPlans.stripeCustomerId, customerId))
          .limit(1);
        const row = rows[0];

        if (row) {
          await db
            .update(accountPlans)
            .set({
              plan: isActive ? "pro" : "free",
              stripeSubscriptionId: isActive ? subscription.id : "",
              updatedAt: new Date().toISOString(),
            })
            .where(eq(accountPlans.subject, row.subject));
        }
      }
    }

    return Response.json({ received: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    // Unlike this app's other routes, return a real error status here so
    // Stripe retries delivery — silently succeeding would drop the update.
    return Response.json({ error: message }, { status: 500 });
  }
}
