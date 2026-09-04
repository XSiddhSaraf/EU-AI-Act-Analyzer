"use client";

import { useEffect } from "react";

/** Mounts the <prop-illo> web component (public/prop-illo.js — animated SVG illustrations). */
export function PropIllo({ kind }: { kind: "source" | "layers" | "backlog" }) {
  useEffect(() => {
    if (customElements.get("prop-illo") || document.getElementById("prop-illo-script")) return;
    const s = document.createElement("script");
    s.id = "prop-illo-script"; s.src = "/prop-illo.js"; s.async = true;
    document.head.appendChild(s);
  }, []);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Tag = "prop-illo" as any;
  return <Tag kind={kind} style={{ position: "absolute", inset: 0, display: "block", borderRadius: 20, background: "radial-gradient(120% 100% at 50% 0%,#f4f6fa 0%,#e7eaf0 100%)" }} />;
}
