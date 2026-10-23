import type { NextConfig } from "next";

// Razorpay Checkout (loaded client-side in compliance-checker.tsx) talks to
// several *.razorpay.com subdomains for the widget script, its embedded
// iframe, telemetry, and images — allow the whole subdomain rather than an
// incomplete fixed list that silently breaks checkout when Razorpay adds a
// host. Stripe Checkout is server-redirected to a hosted page (top-level
// navigation), so it needs no CSP entry here.
const RAZORPAY = "https://*.razorpay.com";

// Next.js App Router ships small inline bootstrap/hydration scripts and this
// app renders plenty of inline `style={{}}` attributes, so 'unsafe-inline'
// is required for script-src/style-src without adopting per-request nonces
// (which would force this marketing/app page off static rendering). CSP is
// still useful here as a defense-in-depth layer restricting *destinations*
// (connect-src/frame-src/form-action/base-uri/object-src), not as a strict
// anti-XSS boundary.
const CSP_DIRECTIVES = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' ${RAZORPAY}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self' data:",
  `connect-src 'self' ${RAZORPAY}`,
  `frame-src 'self' ${RAZORPAY}`,
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: CSP_DIRECTIVES },
  // Caddy terminates TLS in front of this app (see deploy/Caddyfile.example)
  // but HSTS is set here too so it still applies if fronted differently.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Superseded by frame-ancestors above in CSP-aware browsers; kept for
  // older browsers that don't support CSP frame-ancestors.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
];

const nextConfig: NextConfig = {
  async headers() {
    // vinext's header-source matcher treats ":path*" as a plain required
    // segment plus a literal trailing "*", so "/:path*" fails to match the
    // bare root path "/" (verified locally: sub-paths got the headers below,
    // "/" did not). An explicit "(.*)" capture group matches zero-or-more
    // characters, including none, so it covers "/" as well as every sub-path.
    return [{ source: "/(.*)", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
