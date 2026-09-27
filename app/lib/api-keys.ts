import { createHash, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "../../db";
import { apiKeys } from "../../db/schema";

// Agency-only programmatic access (see app/api/api-keys/*, and the Bearer
// auth path in app/api/analyze-smart/route.ts). Only a SHA-256 hash of the
// key is ever persisted; the raw key is shown once at creation time.
const KEY_PREFIX = "gck_live_";
const DISPLAY_PREFIX_LENGTH = KEY_PREFIX.length + 8;

export function hashApiKey(rawKey: string): string {
  return createHash("sha256").update(rawKey).digest("hex");
}

export function generateApiKey(): { rawKey: string; keyPrefix: string; keyHash: string } {
  const rawKey = `${KEY_PREFIX}${randomBytes(24).toString("hex")}`;
  return {
    rawKey,
    keyPrefix: rawKey.slice(0, DISPLAY_PREFIX_LENGTH),
    keyHash: hashApiKey(rawKey),
  };
}

/**
 * Looks up the subject owning a raw API key, or `null` if it doesn't exist
 * or has been revoked. Updates `lastUsedAt` as a side effect.
 */
export async function resolveSubjectFromApiKey(rawKey: string): Promise<string | null> {
  const db = await getDb();
  const keyHash = hashApiKey(rawKey);

  const rows: (typeof apiKeys.$inferSelect)[] = await db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.keyHash, keyHash))
    .limit(1);
  const row = rows[0];
  if (!row || row.revokedAt) return null;

  await db.update(apiKeys).set({ lastUsedAt: new Date().toISOString() }).where(eq(apiKeys.id, row.id));
  return row.subject;
}

/** Extracts the raw key from a Bearer `Authorization` header, if present. */
export function extractBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization") ?? request.headers.get("Authorization");
  if (!header) return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}
