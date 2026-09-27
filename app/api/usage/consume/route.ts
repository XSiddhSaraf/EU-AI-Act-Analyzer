import { PLAN_LIMITS, consumeUsageUnit } from "../../../lib/plans";
import { isRateLimited } from "../../../lib/rate-limit";
import { issueCheckTicket } from "../../../lib/check-tickets";
import { anonCookieHeader, resolveSubject } from "../../../lib/usage";

/**
 * Gates and logs one compliance check. Called right before a check actually
 * runs. Every plan (including Free) has a numeric monthly cap resolved via
 * app/lib/plans.ts — usage resets each calendar month (UTC) rather than
 * being a lifetime count. On success, also issues a one-shot `checkTicket`
 * (see app/lib/check-tickets.ts) that POST /api/analyze-smart requires —
 * without it, a client could consume one quota unit here and then call
 * analyze-smart an unlimited number of times.
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

  // Cheap, DB-free check first: blunts rapid scripted abuse regardless of
  // remaining monthly quota (protects margin — real cost is incurred per
  // check, not just once the monthly cap is hit).
  if (isRateLimited(subject)) {
    return withCookie(
      Response.json(
        { allowed: false, reason: "rate_limited", plan: "free", used: 0, limit: 0, remaining: 0, unlimited: false },
        { status: 429 },
      ),
    );
  }

  try {
    const gate = await consumeUsageUnit(subject, kind, label);

    if (!gate.allowed) {
      return withCookie(Response.json({ ...gate, reason: "free_limit_reached" }, { status: 402 }));
    }

    return withCookie(Response.json({ ...gate, checkTicket: issueCheckTicket(subject) }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    // Metering isn't provisioned yet (no D1 migration applied). Fail open so
    // the core product keeps working rather than blocking every visitor;
    // the client marks this run as "degraded" (not actually metered). The
    // ticket system is pure in-memory state, so it still works here even
    // though quota bookkeeping itself is degraded.
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
        checkTicket: issueCheckTicket(subject),
      }),
    );
  }
}
