import { Auth, setEnvDefaults, type AuthConfig } from "@auth/core";
import Google from "@auth/core/providers/google";
import MicrosoftEntraID from "@auth/core/providers/microsoft-entra-id";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

// Mount path for the Auth.js catch-all route handler
// (see app/api/auth/[...auth]/route.ts). Must match `basePath` below.
export const AUTH_BASE_PATH = "/api/auth";

export type AppUser = {
  email: string;
  name: string | null;
  image: string | null;
};

/**
 * Builds the Auth.js config used by the `/api/auth/[...auth]` route and by
 * the session helpers below.
 *
 * Google and Microsoft credentials are read from environment variables
 * (`AUTH_SECRET`, `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`,
 * `AUTH_MICROSOFT_ENTRA_ID_ID` / `AUTH_MICROSOFT_ENTRA_ID_SECRET`) via
 * `setEnvDefaults` — see README "Sign in with Google or Microsoft" for setup.
 * Sessions are JWT-based (signed/encrypted cookie), so no database adapter
 * or extra schema is required.
 *
 * Built fresh per call instead of cached at module scope so it always
 * reflects the current environment bindings (matches how other routes in
 * this project read `process.env` lazily, e.g. app/api/admin/set-plan).
 */
export function getAuthConfig(): AuthConfig {
  const config: AuthConfig = {
    basePath: AUTH_BASE_PATH,
    trustHost: true,
    session: { strategy: "jwt" },
    providers: [Google({}), MicrosoftEntraID({})],
  };

  setEnvDefaults(process.env as Record<string, string | undefined>, config);
  return config;
}

/**
 * Returns the signed-in user (via Google or Microsoft), or null when the
 * visitor is anonymous. Resolves the session in-process by calling Auth.js's
 * `session` action directly with the incoming request's cookies — no network
 * round trip.
 */
export async function getCurrentUser(): Promise<AppUser | null> {
  try {
    const requestHeaders = await headers();
    const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
    if (!host) return null;

    const protocol = requestHeaders.get("x-forwarded-proto") ?? "https";
    const cookie = requestHeaders.get("cookie") ?? "";

    const sessionRequest = new Request(`${protocol}://${host}${AUTH_BASE_PATH}/session`, {
      headers: cookie ? { cookie } : {},
    });

    const response = await Auth(sessionRequest, getAuthConfig());
    if (!response.ok) return null;

    const session = (await response.json().catch(() => null)) as {
      user?: { email?: string | null; name?: string | null; image?: string | null };
    } | null;

    const email = session?.user?.email?.trim().toLowerCase();
    if (!email) return null;

    return {
      email,
      name: session?.user?.name ?? null,
      image: session?.user?.image ?? null,
    };
  } catch {
    // Auth isn't configured yet (missing AUTH_SECRET / provider credentials)
    // or the session can't be resolved in this environment. Degrade to
    // anonymous instead of breaking the page — see app/lib/usage.ts, which
    // falls back to the anonymous device cookie in this case.
    return null;
  }
}

/**
 * For server-rendered pages that require sign-in: returns the current user,
 * or redirects anonymous visitors through the sign-in flow first.
 * Mark pages that call this with `export const dynamic = "force-dynamic"`
 * since they depend on per-request identity/session cookies.
 */
export async function requireUser(returnTo: string): Promise<AppUser> {
  const user = await getCurrentUser();
  if (user) return user;

  redirect(signInPath(returnTo));
}

/**
 * Link target for "Sign in" buttons. Renders Auth.js's built-in sign-in page
 * listing every configured provider (Google, Microsoft); the page itself
 * handles CSRF tokens and the redirect to the provider's consent screen.
 */
export function signInPath(returnTo = "/"): string {
  return `${AUTH_BASE_PATH}/signin?callbackUrl=${encodeURIComponent(safeRelativeReturnPath(returnTo))}`;
}

/**
 * Link target for "Sign out" buttons/links. Renders Auth.js's built-in
 * sign-out confirmation page (CSRF-protected POST under the hood).
 */
export function signOutPath(returnTo = "/"): string {
  return `${AUTH_BASE_PATH}/signout?callbackUrl=${encodeURIComponent(safeRelativeReturnPath(returnTo))}`;
}

function safeRelativeReturnPath(value: string): string {
  if (!value.startsWith("/") || value.startsWith("//")) return "/";

  let url: URL;
  try {
    url = new URL(value, "https://app.local");
  } catch {
    return "/";
  }
  if (url.origin !== "https://app.local") return "/";

  return `${url.pathname}${url.search}${url.hash}`;
}
