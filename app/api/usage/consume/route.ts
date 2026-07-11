import { eq, sql } from "drizzle-orm";
import { getDb } from "../../../../db";
import { accountPlans, usageEvents } from "../../../../db/schema";
import { FREE_CHECK_LIMIT, anonCookieHeader, resolveSubject } from "../../../lib/usage";

/**
 * Gates and logs one compliance check. Called right before a check actually
 * runs. Free-tier subjects are capped at FREE_CHECK_LIMIT; Pro/Team subjects
 * (see account_plans) are unlimited.
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
    const db = getDb();

    const planRows = await db
      .select()
      .from(accountPlans)
      .where(eq(accountPlans.subject, subject))
      .limit(1);
    const plan = planRows[0]?.plan ?? "free";
    const unlimited = plan !== "free";

    const usedRows = await db
      .select({ value: sql<number>`count(*)` })
      .from(usageEvents)
      .where(eq(usageEvents.subject, subject));
    const used = Number(usedRows[0]?.value ?? 0);

    if (!unlimited && used >= FREE_CHECK_LIMIT) {
      return withCookie(
        Response.json(
          {
            allowed: false,
            plan,
            used,
            limit: FREE_CHECK_LIMIT,
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
        used: nextUsed,
        limit: FREE_CHECK_LIMIT,
        remaining: unlimited ? null : Math.max(0, FREE_CHECK_LIMIT - nextUsed),
        unlimited,
      }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    // Metering isn't provisioned yet (no D1 migration applied). Fail open so
    // the core product keeps working rather than blocking every visitor;
    // the client marks this run as "degraded" (not actually metered).
    return withCookie(
      Response.json({
        allowed: true,
        plan: "free",
        used: 0,
        limit: FREE_CHECK_LIMIT,
        remaining: FREE_CHECK_LIMIT,
        unlimited: false,
        degraded: true,
        detail: message,
      }),
    );
  }
}
