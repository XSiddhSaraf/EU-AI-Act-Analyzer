import { Auth } from "@auth/core";
import { getAuthConfig } from "../../../auth";

// Handles every Auth.js action under /api/auth/* (signin, signout, callback,
// session, csrf, providers, error). Reads per-request cookies/headers, so it
// must always run dynamically rather than being statically optimized.
export const dynamic = "force-dynamic";

/**
 * @auth/core's `Auth()` builds every page/URL it renders — the sign-in
 * form's action, the CSRF token endpoint, OAuth callback/redirect URLs —
 * directly from this request's `url` (see `toInternalRequest` in
 * @auth/core/lib/utils/web.ts), *not* from `X-Forwarded-Proto`/
 * `X-Forwarded-Host`. Self-hosted deployments sit behind a TLS-terminating
 * reverse proxy (see deploy/Caddyfile.example) that forwards plain HTTP to
 * this container, so the request as seen here is `http://...` even though
 * the site is actually served over HTTPS — without this fix-up, Auth.js
 * emits insecure `http://` URLs (the browser's "non-secure form" warning)
 * and can send providers like Google/Microsoft the wrong callback origin.
 * On Cloudflare Workers the request is already correctly `https://`, so
 * this is a no-op there.
 */
async function withPublicOrigin(request: Request): Promise<Request> {
  const protocol = request.headers.get("x-forwarded-proto") ?? "https";
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!host) return request;

  const url = new URL(request.url);
  if (url.protocol === `${protocol}:` && url.host === host) return request;
  url.protocol = `${protocol}:`;
  url.host = host;

  // Buffer the body instead of forwarding request.body as a stream — sign-in
  // forms are tiny (csrf token + email), and streamed bodies require the
  // `duplex: "half"` RequestInit option in Node's fetch implementation.
  const body = request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer();

  return new Request(url, { method: request.method, headers: request.headers, body });
}

export async function GET(request: Request) {
  return Auth(await withPublicOrigin(request), getAuthConfig());
}

export async function POST(request: Request) {
  return Auth(await withPublicOrigin(request), getAuthConfig());
}
