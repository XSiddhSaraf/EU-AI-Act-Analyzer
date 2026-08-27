import * as schema from "./schema";

/**
 * Runtime-adaptive database access.
 *
 * - On Cloudflare Workers, the D1 binding `DB` is used (the original path).
 * - Self-hosted on a plain Linux server (`vinext start` under Node), the
 *   `cloudflare:workers` module doesn't exist, so we fall back to a local
 *   SQLite file via better-sqlite3 — same Drizzle schema, same query API,
 *   so every route works unchanged in both runtimes.
 *
 * The fallback database lives at $DATA_DIR/app.db (default ./data/app.db).
 */

// Matches drizzle/*.sql, made idempotent for self-hosting. Keep in sync with
// db/schema.ts by hand whenever the schema changes (run `npm run db:generate`
// for the Cloudflare/D1 migration, then mirror the new table here too).
const BOOTSTRAP_SQL = `
CREATE TABLE IF NOT EXISTS account_plans (
  subject text PRIMARY KEY NOT NULL,
  plan text DEFAULT 'free' NOT NULL,
  updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE TABLE IF NOT EXISTS usage_events (
  id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  subject text NOT NULL,
  kind text NOT NULL,
  label text DEFAULT '' NOT NULL,
  created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE TABLE IF NOT EXISTS knowledge_sources (
  id text PRIMARY KEY NOT NULL,
  framework_id text NOT NULL,
  source_url text NOT NULL,
  title text DEFAULT '' NOT NULL,
  raw_text text DEFAULT '' NOT NULL,
  content_hash text DEFAULT '' NOT NULL,
  status text DEFAULT 'ok' NOT NULL,
  last_error text DEFAULT '' NOT NULL,
  fetched_at text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cached: any = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getDb(): Promise<any> {
  if (cached) return cached;

  // 1) Cloudflare Workers: `cloudflare:workers` only resolves inside workerd.
  //    The computed specifier keeps Vite from resolving it at build time.
  try {
    const cfSpecifier = "cloudflare:workers";
    const { env } = await import(/* @vite-ignore */ cfSpecifier);
    if (env?.DB) {
      const { drizzle } = await import("drizzle-orm/d1");
      cached = drizzle(env.DB, { schema });
      return cached;
    }
  } catch {
    // Not running in workerd — fall through to the Node/SQLite path.
  }

  // 2) Self-hosted Node: persistent SQLite file.
  try {
    const driverSpecifier = "better-sqlite3";
    const { default: Database } = await import(/* @vite-ignore */ driverSpecifier);
    const { drizzle } = await import("drizzle-orm/better-sqlite3");
    const { mkdirSync } = await import("node:fs");
    const { join } = await import("node:path");

    const dataDir = process.env.DATA_DIR || "./data";
    mkdirSync(dataDir, { recursive: true });
    const sqlite = new Database(join(dataDir, "app.db"));
    sqlite.pragma("journal_mode = WAL");
    sqlite.exec(BOOTSTRAP_SQL);

    cached = drizzle(sqlite, { schema });
    return cached;
  } catch (error) {
    throw new Error(
      "No database available. On Cloudflare, set the `d1` field in .openai/hosting.json to `DB`. " +
        "Self-hosted, run `npm install better-sqlite3` (DATA_DIR controls where app.db is stored). " +
        `Underlying error: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
