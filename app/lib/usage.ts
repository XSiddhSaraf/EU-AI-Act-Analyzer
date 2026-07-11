import { headers } from "next/headers";
import { getCurrentUser } from "../auth";

export const ANON_COOKIE_NAME = "agc_uid";
export const FREE_CHECK_LIMIT = 3;

export type ResolvedSubject = {
  /** Stable identity used as the row key for usage_events / account_plans. */
  subject: string;
  isAuthenticated: boolean;
  anonId: string | null;
  /** True when the caller has no anon cookie yet and one must be set. */
  needsCookie: boolean;
};

function parseCookieHeader(cookieHeader: string | null): Record<string, string> {
  if (!cookieHeader) return {};
  const entries: Array<[string, string]> = [];

  for (const part of cookieHeader.split(";")) {
    const separatorIndex = part.indexOf("=");
    if (separatorIndex === -1) continue;
    const key = part.slice(0, separatorIndex).trim();
    const rawValue = part.slice(separatorIndex + 1).trim();
    if (!key) continue;
    try {
      entries.push([key, decodeURIComponent(rawValue)]);
    } catch {
      entries.push([key, rawValue]);
    }
  }

  return Object.fromEntries(entries);
}

/**
 * Resolves a stable identity for usage metering: a signed-in Google or
 * Microsoft user's email when available (see app/auth.ts), otherwise a
 * persistent anonymous device cookie.
 */
export async function resolveSubject(): Promise<ResolvedSubject> {
  const user = await getCurrentUser();
  if (user?.email) {
    return {
      subject: `user:${user.email.trim().toLowerCase()}`,
      isAuthenticated: true,
      anonId: null,
      needsCookie: false,
    };
  }

  const requestHeaders = await headers();
  const cookies = parseCookieHeader(requestHeaders.get("cookie"));
  const existingAnonId = cookies[ANON_COOKIE_NAME];

  if (existingAnonId) {
    return {
      subject: `anon:${existingAnonId}`,
      isAuthenticated: false,
      anonId: existingAnonId,
      needsCookie: false,
    };
  }

  const anonId = crypto.randomUUID();
  return {
    subject: `anon:${anonId}`,
    isAuthenticated: false,
    anonId,
    needsCookie: true,
  };
}

export function anonCookieHeader(anonId: string): string {
  return `${ANON_COOKIE_NAME}=${anonId}; Path=/; Max-Age=31536000; SameSite=Lax`;
}
