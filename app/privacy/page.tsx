import type { Metadata } from "next";
import Link from "next/link";

const CONTACT_URL = (process.env.NEXT_PUBLIC_CONTACT_URL ?? "").trim() || "mailto:hello@euactanalyzer.com?subject=Privacy%20request";
const INK = "#0b0f19";
const BLUE = "#0e76ff";
const PAPER = "#f3f3f3";
const MUTED = "rgba(11,15,25,.65)";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "What GovCheck collects, why, and how to export or delete your data.",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 36 }}>
      <h2 style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-.02em", margin: "0 0 12px" }}>{title}</h2>
      <div style={{ fontSize: 15, lineHeight: 1.65, color: MUTED }}>{children}</div>
    </section>
  );
}

/**
 * Generic placeholder privacy policy. Describes this app's actual data
 * flows (anon cookie, auth session, usage metering, check reports, API
 * keys, sub-processors) accurately, but the legal framing/wording is not
 * reviewed by counsel — see the disclaimer at the bottom, matching the
 * app's existing "Not legal advice" footer convention.
 */
export default function PrivacyPolicyPage() {
  return (
    <div style={{ minHeight: "100vh", background: PAPER, color: INK }}>
      <header style={{ padding: "20px clamp(20px,4vw,56px)" }}>
        <Link href="/" style={{ color: INK, textDecoration: "none", fontWeight: 700, fontSize: 18, letterSpacing: "-.02em", display: "inline-flex", alignItems: "center", gap: 10 }}>
          <span style={{ width: 12, height: 12, background: BLUE, borderRadius: 2, display: "inline-block" }} />
          GovCheck
        </Link>
      </header>
      <main style={{ maxWidth: 720, margin: "0 auto", padding: "20px clamp(20px,4vw,56px) 80px" }}>
        <p style={{ fontFamily: "'JetBrains Mono',ui-monospace,monospace", fontSize: 12, letterSpacing: ".12em", textTransform: "uppercase", color: BLUE, margin: "0 0 16px" }}>
          Legal
        </p>
        <h1 style={{ fontSize: "clamp(32px,4vw,44px)", letterSpacing: "-.03em", fontWeight: 600, margin: "0 0 12px" }}>Privacy Policy</h1>
        <p style={{ fontSize: 14, color: MUTED, margin: "0 0 40px" }}>Last updated: {new Date().toISOString().slice(0, 10)}</p>

        <Section title="What we collect">
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            <li>
              <strong>An anonymous device cookie</strong> (<code>agc_uid</code>) for visitors who aren&apos;t signed in, used only to
              count free monthly checks. It contains a random identifier, not your identity.
            </li>
            <li>
              <strong>Account details</strong> (email, display name) when you sign in with Google or Microsoft, and a session
              cookie that keeps you signed in.
            </li>
            <li>
              <strong>Check inputs</strong> — the URL or document text you submit for a compliance check — are sent to our AI
              provider to generate your result. Website checks only read the public page text; we don&apos;t crawl beyond it.
            </li>
            <li>
              <strong>Check history</strong> (readiness score, findings, verdict) is stored only for Pro/Team/Agency accounts and
              one-off Full Report purchases, so you can revisit or export past reports.
            </li>
            <li>
              <strong>Billing details</strong> are handled entirely by Stripe or Razorpay — we never see or store your card
              details, only your plan status and a provider customer/subscription id.
            </li>
            <li>
              <strong>Agency API keys</strong>: only a salted hash is stored; the raw key is shown once at creation and cannot be
              retrieved again.
            </li>
          </ul>
        </Section>

        <Section title="Cookies">
          <p>
            We use strictly necessary cookies only: the anonymous usage-metering cookie above, and a session cookie once you
            sign in. We don&apos;t use third-party advertising or analytics cookies. Because these cookies are required for the
            product to function (metering free usage, keeping you signed in), there is no optional-cookie consent toggle — the
            banner we show on first visit is for transparency rather than opt-in/opt-out.
          </p>
        </Section>

        <Section title="Who we share data with">
          <p>Data is shared only with the sub-processors needed to run the service:</p>
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            <li>OpenAI — processes check inputs to generate AI-powered analysis.</li>
            <li>Stripe and Razorpay — process payments and manage subscriptions.</li>
            <li>Google and Microsoft — provide sign-in (OAuth); we only receive your email and name.</li>
          </ul>
          <p>We do not sell personal data.</p>
        </Section>

        <Section title="Retention">
          <p>
            Usage-metering events and check history are kept for as long as your account is active, or until you request
            deletion. Anonymous usage events are not linked to an identity and are retained only to enforce free-tier limits.
          </p>
        </Section>

        <Section title="Your rights">
          <p>
            If you&apos;re signed in, you can exercise your data access and erasure rights directly from the product: use
            <strong> &quot;Export my data&quot;</strong> in the account menu to download everything we hold about you as JSON, or
            <strong> &quot;Delete my account&quot;</strong> to permanently remove it (this also cancels any active subscription).
            For anything else, or if you&apos;re not signed in, contact us at{" "}
            <a href={CONTACT_URL} style={{ color: BLUE }}>
              {CONTACT_URL.replace(/^mailto:/, "").split("?")[0]}
            </a>
            .
          </p>
        </Section>

        <Section title="Not legal advice">
          <p>
            This page describes our actual data practices in plain language but is a generic template, not reviewed by a
            lawyer, and does not constitute legal advice. If you need a privacy policy tailored to specific regulatory
            obligations (GDPR, CCPA, or otherwise) for your use of this service, consult qualified counsel.
          </p>
        </Section>

        <Link href="/" style={{ color: BLUE, textDecoration: "none", fontWeight: 600, fontSize: 14 }}>
          ← Back to GovCheck
        </Link>
      </main>
    </div>
  );
}
