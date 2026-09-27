import { desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { apiKeys } from "../../../db/schema";
import { getCurrentUser } from "../../auth";
import { generateApiKey } from "../../lib/api-keys";
import { resolvePlanContext } from "../../lib/plans";

export type ApiKeySummary = { id: number; keyPrefix: string; createdAt: string; lastUsedAt: string; revokedAt: string };
export type CreateApiKeyResponse = { ok: true; id: number; rawKey: string; keyPrefix: string } | { ok: false; reason: string };
export type ListApiKeysResponse = { ok: true; keys: ApiKeySummary[] } | { ok: false; reason: string };

async function requireAgencySubject(): Promise<{ subject: string } | Response> {
  const user = await getCurrentUser();
  if (!user?.email) {
    return Response.json({ ok: false, reason: "Sign in required." }, { status: 401 });
  }
  const subject = `user:${user.email}`;
  const planContext = await resolvePlanContext(subject);
  if (planContext.plan !== "agency") {
    return Response.json({ ok: false, reason: "API access requires an Agency plan." }, { status: 403 });
  }
  return { subject };
}

/** Creates (and returns, once) a new Agency API key for POST /api/analyze-smart. */
export async function POST() {
  const auth = await requireAgencySubject();
  if (auth instanceof Response) return auth;

  try {
    const db = await getDb();
    const { rawKey, keyPrefix, keyHash } = generateApiKey();
    const inserted: { id: number }[] = await db
      .insert(apiKeys)
      .values({ subject: auth.subject, keyHash, keyPrefix })
      .returning({ id: apiKeys.id });

    return Response.json({ ok: true, id: inserted[0].id, rawKey, keyPrefix } satisfies CreateApiKeyResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ ok: false, reason: message } satisfies CreateApiKeyResponse, { status: 500 });
  }
}

/** Lists the signed-in Agency subject's API keys (masked - prefix only). */
export async function GET() {
  const auth = await requireAgencySubject();
  if (auth instanceof Response) return auth;

  try {
    const db = await getDb();
    const rows: (typeof apiKeys.$inferSelect)[] = await db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.subject, auth.subject))
      .orderBy(desc(apiKeys.createdAt));

    const keys: ApiKeySummary[] = rows.map((row) => ({
      id: row.id,
      keyPrefix: row.keyPrefix,
      createdAt: row.createdAt,
      lastUsedAt: row.lastUsedAt,
      revokedAt: row.revokedAt,
    }));

    return Response.json({ ok: true, keys } satisfies ListApiKeysResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ ok: false, reason: message } satisfies ListApiKeysResponse, { status: 500 });
  }
}
