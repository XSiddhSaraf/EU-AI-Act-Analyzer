"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "gc_cookie_notice_ack";
const INK = "#0b0f19";
const BLUE = "#0e76ff";

/**
 * First-visit cookie notice. This app only sets strictly-necessary cookies
 * (the anonymous usage-metering cookie `agc_uid`, and an auth session
 * cookie once signed in — see app/lib/usage.ts and app/auth.ts) with no
 * third-party advertising/analytics cookies, so there is no consent
 * toggle to collect: this is a transparency notice, not an opt-in gate,
 * matching what app/privacy/page.tsx tells visitors.
 *
 * Dismissal is remembered in localStorage (not a cookie) so acknowledging
 * the notice doesn't itself require setting another cookie.
 */
export function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time check of a browser-only API (localStorage) that can't run during render/SSR
      if (!window.localStorage.getItem(STORAGE_KEY)) setVisible(true);
    } catch {
      // Storage unavailable (e.g. privacy mode) — skip the banner rather
      // than risk showing it on every navigation.
    }
  }, []);

  function dismiss() {
    setVisible(false);
    try {
      window.localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // Ignore — worst case the banner reappears on the next visit.
    }
  }

  if (!visible) return null;

  return (
    <div
      role="region"
      aria-label="Cookie notice"
      style={{
        position: "fixed",
        left: 16,
        right: 16,
        bottom: 16,
        zIndex: 40,
        maxWidth: 640,
        margin: "0 auto",
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 16,
        padding: "16px 20px",
        borderRadius: 16,
        background: INK,
        color: "#fff",
        boxShadow: "0 24px 60px -24px rgba(11,15,25,.5)",
      }}
    >
      <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, flex: "1 1 320px" }}>
        We use only strictly necessary cookies to meter free checks and keep you signed in — no ads, no third-party tracking.{" "}
        <a href="/privacy" style={{ color: "#fff", textDecoration: "underline" }}>
          Learn more
        </a>
        .
      </p>
      <button
        type="button"
        onClick={dismiss}
        style={{
          flex: "none",
          padding: "10px 18px",
          borderRadius: 999,
          border: 0,
          cursor: "pointer",
          fontSize: 13,
          fontWeight: 600,
          letterSpacing: ".02em",
          textTransform: "uppercase",
          background: BLUE,
          color: "#fff",
        }}
      >
        Got it
      </button>
    </div>
  );
}
