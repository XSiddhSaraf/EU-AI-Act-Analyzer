import { inArray } from "drizzle-orm";
import { getDb } from "../../db";
import { knowledgeSources } from "../../db/schema";
import { extractMeta, normalizeWhitespace, stripHtml } from "./html-to-text";
import {
  regulatorySources,
  sourcesForFrameworks,
  type FrameworkId,
  type RegulatorySource,
} from "./regulatory-sources";

const MAX_SOURCE_TEXT_LENGTH = 20000;
const DEFAULT_MAX_STALENESS_DAYS = 7;
const DEFAULT_REFRESH_INTERVAL_HOURS = 24;

export type KnowledgeSourceRow = typeof knowledgeSources.$inferSelect;

export type KnowledgeBaseContext = {
  /** Concatenated excerpts, ready to drop into the LLM system prompt. */
  text: string;
  /** Most recent fetchedAt among the included sources, if any. */
  updatedAt: string | null;
  sources: KnowledgeSourceRow[];
};

async function sha256(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Fetches one official source, strips HTML, hashes it, and upserts the row.
 * Never throws — on failure, records status/lastError but preserves any
 * previously fetched rawText (fail open: a stale-but-present snapshot beats
 * an empty one).
 */
export async function refreshSource(source: RegulatorySource): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();

  try {
    const response = await fetch(source.url, {
      headers: {
        Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5",
        "User-Agent": "AI-Governance-Compatibility-Checker/1.0 (+knowledge-base-refresh)",
      },
      redirect: "follow",
    });
    const contentType = response.headers.get("content-type") ?? "";
    const body = await response.text();
    const title = extractMeta(body, /<title[^>]*>([\s\S]*?)<\/title>/i) || source.title;
    const text = (contentType.includes("text/html") ? stripHtml(body) : normalizeWhitespace(body)).slice(
      0,
      MAX_SOURCE_TEXT_LENGTH,
    );
    const contentHash = await sha256(text);

    await db
      .insert(knowledgeSources)
      .values({
        id: source.id,
        frameworkId: source.frameworkId,
        sourceUrl: source.url,
        title,
        rawText: text,
        contentHash,
        status: "ok",
        lastError: "",
        fetchedAt: now,
      })
      .onConflictDoUpdate({
        target: knowledgeSources.id,
        set: { title, rawText: text, contentHash, status: "ok", lastError: "", fetchedAt: now },
      });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await db
      .insert(knowledgeSources)
      .values({
        id: source.id,
        frameworkId: source.frameworkId,
        sourceUrl: source.url,
        title: source.title,
        rawText: "",
        contentHash: "",
        status: "error",
        lastError: message,
        fetchedAt: now,
      })
      .onConflictDoUpdate({
        // Deliberately omit rawText/contentHash from the update so a prior
        // successful snapshot survives a transient refresh failure.
        target: knowledgeSources.id,
        set: { status: "error", lastError: message, fetchedAt: now },
      });
  }
}

/** Refreshes every known source. Tolerates individual failures. */
export async function refreshAllSources(): Promise<void> {
  await Promise.all(regulatorySources.map((source) => refreshSource(source)));
}

function maxStalenessMs(): number {
  const days = Number(process.env.KNOWLEDGE_BASE_MAX_STALENESS_DAYS) || DEFAULT_MAX_STALENESS_DAYS;
  return days * 24 * 60 * 60 * 1000;
}

/**
 * Returns the current knowledge-base text for the given frameworks,
 * transparently refreshing any source that's missing, errored, or older
 * than KNOWLEDGE_BASE_MAX_STALENESS_DAYS before returning. This on-demand
 * check is what guarantees freshness on runtimes with no background
 * scheduler (e.g. Cloudflare Workers), and as a safety net everywhere else.
 */
export async function getKnowledgeBaseContext(frameworkIds: FrameworkId[]): Promise<KnowledgeBaseContext> {
  ensureKnowledgeBaseScheduler();

  const relevant = sourcesForFrameworks(frameworkIds);
  if (relevant.length === 0) {
    return { text: "", updatedAt: null, sources: [] };
  }

  const db = await getDb();
  const ids = relevant.map((source) => source.id);
  const rows: KnowledgeSourceRow[] = await db
    .select()
    .from(knowledgeSources)
    .where(inArray(knowledgeSources.id, ids));
  const byId = new Map(rows.map((row): [string, KnowledgeSourceRow] => [row.id, row]));

  const staleCutoff = Date.now() - maxStalenessMs();
  const toRefresh = relevant.filter((source) => {
    const row = byId.get(source.id);
    if (!row || row.status !== "ok" || !row.rawText) return true;
    return new Date(row.fetchedAt).getTime() < staleCutoff;
  });

  if (toRefresh.length > 0) {
    await Promise.all(toRefresh.map((source) => refreshSource(source)));
    const refreshedRows: KnowledgeSourceRow[] = await db
      .select()
      .from(knowledgeSources)
      .where(inArray(knowledgeSources.id, ids));
    for (const row of refreshedRows) byId.set(row.id, row);
  }

  const finalRows = relevant
    .map((source) => byId.get(source.id))
    .filter((row): row is KnowledgeSourceRow => Boolean(row));

  const text = finalRows
    .map(
      (row) =>
        `### ${row.title} (${row.sourceUrl})\n${
          row.rawText || "(unavailable — fetch failed; rely on general knowledge of this source instead.)"
        }`,
    )
    .join("\n\n");

  const updatedAt = finalRows.reduce<string | null>((latest, row) => {
    if (!row.fetchedAt) return latest;
    if (!latest || new Date(row.fetchedAt) > new Date(latest)) return row.fetchedAt;
    return latest;
  }, null);

  return { text, updatedAt, sources: finalRows };
}

declare global {
  var __knowledgeBaseSchedulerStarted: boolean | undefined;
}

/**
 * Starts the background refresh timer exactly once per process (guarded by
 * a global flag so repeated calls, including across module reloads in
 * dev, are no-ops). Only meaningful on the self-hosted long-lived Node
 * runtime — on Cloudflare Workers, isolates are short-lived and this timer
 * simply never fires between requests; freshness there is guaranteed
 * instead by the on-demand check above.
 */
export function ensureKnowledgeBaseScheduler(): void {
  if (globalThis.__knowledgeBaseSchedulerStarted) return;
  globalThis.__knowledgeBaseSchedulerStarted = true;

  try {
    const hours = Number(process.env.KNOWLEDGE_BASE_REFRESH_INTERVAL_HOURS) || DEFAULT_REFRESH_INTERVAL_HOURS;
    const intervalMs = hours * 60 * 60 * 1000;

    setInterval(() => {
      refreshAllSources().catch(() => {
        // Best-effort background refresh; getKnowledgeBaseContext's
        // on-demand fallback covers anything this misses.
      });
    }, intervalMs);
  } catch {
    // setInterval may be unavailable/restricted outside a Node process
    // (e.g. a real Workers isolate) — the on-demand fallback still covers
    // freshness in that case, so this is safe to ignore.
  }
}
