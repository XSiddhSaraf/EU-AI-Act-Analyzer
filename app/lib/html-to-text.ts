/**
 * Lightweight HTML-to-plain-text stripping, shared by:
 * - app/api/fetch-website/route.ts (user-submitted URLs)
 * - app/lib/knowledge-base.ts (official regulatory source URLs)
 */

export function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function decodeEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

export function stripHtml(html: string) {
  const withoutScripts = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");
  const withBreaks = withoutScripts
    .replace(/<\/(p|div|section|article|header|footer|li|h[1-6])>/gi, " ")
    .replace(/<br\s*\/?>/gi, " ");

  return normalizeWhitespace(decodeEntities(withBreaks.replace(/<[^>]+>/g, " ")));
}

export function extractMeta(html: string, pattern: RegExp) {
  return decodeEntities(html.match(pattern)?.[1] ?? "").trim();
}

export function isBlockedHost(hostname: string) {
  const host = hostname.toLowerCase();
  return (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "0.0.0.0" ||
    host.startsWith("127.") ||
    host.startsWith("10.") ||
    host.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
  );
}
