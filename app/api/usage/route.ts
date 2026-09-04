import { eq, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { accountPlans, usageEvents } from "../../../db/schema";
import { FREE_CHECK_LIMIT, anonCookieHeader, resolveSubject } from "../../lib/usage";

/**
 * Reports current usage without consuming a check. Used on page load to
 * render the usage meter.
 */
export async function GET() {
  const { subject, anonId, needsCookie, isAuthenticated } = await resolveSubject();

  let used = 0;
  let plan = "free";
  let paymentProvider = "";
  let bonusChecks = 0;
  let degraded = false;

  try {
    const db = await getDb();

    const usedRows = await db
      .select({ value: sql<number>`count(*)` })
      .from(usageEvents)
      .where(eq(usageEvents.subject, subject));
    used = Number(usedRows[0]?.value ?? 0);

    const planRows: (typeof accountPlans.$inferSelect)[] = await db
      .select()
      .from(accountPlans)
      .where(eq(accountPlans.subject, subject))
      .limit(1);
    plan = planRows[0]?.plan ?? "free";
    // Tells the client whether "Manage billing" should open the Stripe
    // portal or offer a direct cancel action (Razorpay has no portal).
    paymentProvider = planRows[0]?.paymentProvider ?? "";
    // One-time-purchased checks (see app/api/one-time/*), stacked on top of
    // FREE_CHECK_LIMIT regardless of plan.
    bonusChecks = planRows[0]?.bonusChecks ?? 0;
  } catch {
    // Metering table not provisioned yet in this environment (e.g. before
    // the first deploy applies the generated D1 migration). Degrade
    // gracefully instead of breaking the page.
    degraded = true;
  }

  const unlimited = plan !== "free";
  const limit = FREE_CHECK_LIMIT + bonusChecks;
  const remaining = unlimited ? null : Math.max(0, limit - used);

  const response = Response.json({
    accountType: isAuthenticated ? "account" : "device",
    plan,
    paymentProvider,
    used,
    limit,
    bonusChecks,
    remaining,
    unlimited,
    degraded,
  });

  if (needsCookie && anonId) {
    response.headers.append("Set-Cookie", anonCookieHeader(anonId));
  }

  return response;
}
