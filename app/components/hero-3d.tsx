"use client";

import { useEffect } from "react";

/** Mounts the <hero-3d> web component (public/hero-3d.js — three.js orbiting brain lattice). */
export function Hero3D() {
  useEffect(() => {
    if (customElements.get("hero-3d") || document.getElementById("hero-3d-script")) return;
    const s = document.createElement("script");
    s.id = "hero-3d-script"; s.src = "/hero-3d.js"; s.async = true;
    document.head.appendChild(s);
  }, []);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Tag = "hero-3d" as any;
  return <Tag radius="24px" accent="#0e76ff" style={{ position: "absolute", inset: 0, display: "block", borderRadius: 24, background: "radial-gradient(120% 100% at 50% 0%,#fff 0%,#e9ecf2 60%,#dfe3ea 100%)" }} />;
}
