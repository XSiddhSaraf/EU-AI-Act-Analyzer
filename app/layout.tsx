import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Newsreader } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

const newsreader = Newsreader({
  variable: "--font-display",
  subsets: ["latin"],
  style: ["normal", "italic"],
});

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "https";
  const metadataBase = new URL(host ? `${protocol}://${host}` : "https://localhost:3000");

  return {
    metadataBase,
    title: {
      default: "AI Governance Compatibility Checker",
      template: "%s | AI Governance Compatibility Checker",
    },
    description:
      "Check websites, policies, and document text against the EU AI Act, GDPR, ISO 42001, NIST AI RMF, and security controls.",
    icons: {
      icon: "/favicon.svg",
      shortcut: "/favicon.svg",
    },
    openGraph: {
      title: "AI Governance Compatibility Checker",
      description:
        "EU AI Act, GDPR, ISO 42001, NIST AI RMF, risks, and mitigations in one practical review.",
      images: [
        {
          url: "/og.png",
          width: 1200,
          height: 630,
          alt: "AI Governance Compatibility Checker dashboard preview",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: "AI Governance Compatibility Checker",
      description:
        "Check AI governance compatibility and turn risk findings into mitigations.",
      images: ["/og.png"],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${inter.variable} ${jetbrainsMono.variable} ${newsreader.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
