import { and, eq, gte, sql } from "drizzle-orm";
import { getDb } from "../../../../db";
import { usageEvents } from "../../../../db/schema";
import { PLAN_LIMITS, resolvePlanContext, startOfCurrentUtcMonthIso } from "../../../lib/plans";
import { anonCookieHeader, resolveSubject } from "../../../lib/usage";

/**
 * Gates and logs one compliance check. Called right before a check actually
 * runs. Every plan (including Free) has a numeric monthly cap resolved via
 * app/lib/plans.ts — usage resets each calendar month (UTC) rather than
 * being a lifetime count.
 */
export async function POST(request: Request) {
  const { subject, anonId, needsCookie } = await resolveSubject();

  let body: { kind?: string; label?: string } = {};
  try {
    body = (await request.json()) as { kind?: string; label?: string };
  } catch {
    body = {};
  }
  const kind = body.kind === "website" ? "website" : "document";
  const label = typeof body.label === "string" ? body.label.slice(0, 200) : "";

  function withCookie(response: Response) {
    if (needsCookie && anonId) {
      response.headers.append("Set-Cookie", anonCookieHeader(anonId));
    }
    return response;
  }

  try {
    const db = await getDb();
    const planContext = await resolvePlanContext(subject);
    const { plan, paymentProvider, bonusChecks, unlimited, monthlyLimit } = planContext;
    const limit = monthlyLimit + bonusChecks;

    const usedRows = await db
      .select({ value: sql<number>`count(*)` })
      .from(usageEvents)
      .where(and(eq(usageEvents.subject, subject), gte(usageEvents.createdAt, startOfCurrentUtcMonthIso())));
    const used = Number(usedRows[0]?.value ?? 0);

    if (!unlimited && used >= limit) {
      return withCookie(
        Response.json(
          {
            allowed: false,
            plan,
            used,
            limit,
            remaining: 0,
            unlimited: false,
            reason: "free_limit_reached",
          },
          { status: 402 },
        ),
      );
    }

    await db.insert(usageEvents).values({ subject, kind, label });
    const nextUsed = used + 1;

    return withCookie(
      Response.json({
        allowed: true,
        plan,
        paymentProvider,
        used: nextUsed,
        limit,
        remaining: unlimited ? null : Math.max(0, limit - nextUsed),
        unlimited,
      }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    // Metering isn't provisioned yet (no D1 migration applied). Fail open so
    // the core product keeps working rather than blocking every visitor;
    // the client marks this run as "degraded" (not actually metered).
    const freeLimit = PLAN_LIMITS.free.monthlyChecks;
    return withCookie(
      Response.json({
        allowed: true,
        plan: "free",
        used: 0,
        limit: freeLimit,
        remaining: freeLimit,
        unlimited: false,
        degraded: true,
        detail: message,
      }),
    );
  }
}
