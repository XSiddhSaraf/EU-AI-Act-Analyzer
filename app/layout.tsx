import type { Metadata } from "next";
import { JetBrains_Mono, Schibsted_Grotesk } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const sans = Schibsted_Grotesk({ variable: "--font-sans", subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const mono = JetBrains_Mono({ variable: "--font-mono", subsets: ["latin"], weight: ["400", "500"] });

export async function generateMetadata(): Promise<Metadata> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const protocol = h.get("x-forwarded-proto") ?? "https";
  const metadataBase = new URL(host ? `${protocol}://${host}` : "https://www.euactanalyzer.com");
  const description = "Point at a page or paste a policy. In seconds you get a readiness score, per-framework evidence and a prioritised fix list — grounded in the EU AI Act, GDPR, ISO 42001 and NIST AI RMF.";
  return {
    metadataBase,
    title: { default: "GovCheck — AI governance with an edge", template: "%s | GovCheck" },
    description,
    icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
    openGraph: { title: "GovCheck — AI governance with an edge", description, images: [{ url: "/og.png", width: 1200, height: 630, alt: "GovCheck" }] },
    twitter: { card: "summary_large_image", title: "GovCheck — AI governance with an edge", description, images: ["/og.png"] },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${sans.variable} ${mono.variable}`}>{children}</body>
    </html>
  );
}
