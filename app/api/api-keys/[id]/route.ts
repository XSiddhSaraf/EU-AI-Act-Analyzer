import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { apiKeys } from "../../../../db/schema";
import { getCurrentUser } from "../../../auth";

export type RevokeApiKeyResponse = { ok: true } | { ok: false; reason: string };

/** Revokes (soft-deletes) one of the signed-in user's API keys. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const keyId = Number(id);
  if (!Number.isInteger(keyId)) {
    return Response.json({ ok: false, reason: "Invalid key id." } satisfies RevokeApiKeyResponse, { status: 400 });
  }

  const user = await getCurrentUser();
  if (!user?.email) {
    return Response.json({ ok: false, reason: "Sign in required." } satisfies RevokeApiKeyResponse, { status: 401 });
  }
  const subject = `user:${user.email}`;

  try {
    const db = await getDb();
    const rows: (typeof apiKeys.$inferSelect)[] = await db.select().from(apiKeys).where(eq(apiKeys.id, keyId)).limit(1);
    const row = rows[0];

    if (!row || row.subject !== subject) {
      return Response.json({ ok: false, reason: "Key not found." } satisfies RevokeApiKeyResponse, { status: 404 });
    }

    await db.update(apiKeys).set({ revokedAt: new Date().toISOString() }).where(eq(apiKeys.id, keyId));
    return Response.json({ ok: true } satisfies RevokeApiKeyResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ ok: false, reason: message } satisfies RevokeApiKeyResponse, { status: 500 });
  }
}
