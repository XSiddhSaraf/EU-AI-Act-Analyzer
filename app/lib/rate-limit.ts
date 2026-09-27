// Lightweight in-memory sliding-window rate limiter, scoped per subject
// (or API key subject). This deployment runs as a single Node process (see
// db/index.ts's self-hosted SQLite fallback), so per-process memory state
// is sufficient to blunt rapid scripted abuse - it is not meant to be the
// sole line of defense; the monthly plan limit in app/lib/plans.ts remains
// the primary cap on total usage. State resets on restart and isn't shared
// across horizontally-scaled instances, an acceptable tradeoff here.
const WINDOW_MS = 60_000;
const DEFAULT_MAX_PER_MINUTE = 5;

function maxPerMinute(): number {
  const configured = Number(process.env.RATE_LIMIT_MAX_PER_MINUTE);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_MAX_PER_MINUTE;
}

const hits = new Map<string, number[]>();

/**
 * Returns true if `key` has already made the per-minute limit's worth of
 * requests within the trailing window, and records this call as a hit
 * otherwise. Override the limit with RATE_LIMIT_MAX_PER_MINUTE.
 */
export function isRateLimited(key: string): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= maxPerMinute()) {
    hits.set(key, recent);
    return true;
  }
  recent.push(now);
  hits.set(key, recent);
  return false;
}
