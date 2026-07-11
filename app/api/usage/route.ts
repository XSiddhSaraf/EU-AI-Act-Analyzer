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
  let degraded = false;

  try {
    const db = getDb();

    const usedRows = await db
      .select({ value: sql<number>`count(*)` })
      .from(usageEvents)
      .where(eq(usageEvents.subject, subject));
    used = Number(usedRows[0]?.value ?? 0);

    const planRows = await db
      .select()
      .from(accountPlans)
      .where(eq(accountPlans.subject, subject))
      .limit(1);
    plan = planRows[0]?.plan ?? "free";
  } catch {
    // Metering table not provisioned yet in this environment (e.g. before
    // the first deploy applies the generated D1 migration). Degrade
    // gracefully instead of breaking the page.
    degraded = true;
  }

  const unlimited = plan !== "free";
  const remaining = unlimited ? null : Math.max(0, FREE_CHECK_LIMIT - used);

  const response = Response.json({
    accountType: isAuthenticated ? "account" : "device",
    plan,
    used,
    limit: FREE_CHECK_LIMIT,
    remaining,
    unlimited,
    degraded,
  });

  if (needsCookie && anonId) {
    response.headers.append("Set-Cookie", anonCookieHeader(anonId));
  }

  return response;
}
