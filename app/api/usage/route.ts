import { and, eq, gte, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { usageEvents } from "../../../db/schema";
import { PLAN_LIMITS, resolvePlanContext, startOfCurrentUtcMonthIso } from "../../lib/plans";
import { anonCookieHeader, resolveSubject } from "../../lib/usage";

/**
 * Reports current usage without consuming a check. Used on page load to
 * render the usage meter. Usage is scoped to the current calendar month
 * (UTC) — see app/lib/plans.ts.
 */
export async function GET() {
  const { subject, anonId, needsCookie, isAuthenticated } = await resolveSubject();

  let used = 0;
  let plan = "free";
  let paymentProvider = "";
  let bonusChecks = 0;
  let unlimited = false;
  let limit = PLAN_LIMITS.free.monthlyChecks;
  let degraded = false;

  try {
    const db = await getDb();
    const planContext = await resolvePlanContext(subject);
    plan = planContext.plan;
    // Tells the client whether "Manage billing" should open the Stripe
    // portal or offer a direct cancel action (Razorpay has no portal).
    paymentProvider = planContext.paymentProvider;
    // One-time-purchased checks (see app/api/one-time/*), stacked on top of
    // the plan's monthly limit regardless of plan.
    bonusChecks = planContext.bonusChecks;
    unlimited = planContext.unlimited;
    limit = planContext.monthlyLimit + bonusChecks;

    const usedRows = await db
      .select({ value: sql<number>`count(*)` })
      .from(usageEvents)
      .where(and(eq(usageEvents.subject, subject), gte(usageEvents.createdAt, startOfCurrentUtcMonthIso())));
    used = Number(usedRows[0]?.value ?? 0);
  } catch {
    // Metering table not provisioned yet in this environment (e.g. before
    // the first deploy applies the generated D1 migration). Degrade
    // gracefully instead of breaking the page.
    degraded = true;
  }

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
