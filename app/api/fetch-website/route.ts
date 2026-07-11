const MAX_TEXT_LENGTH = 18000;

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function decodeEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function stripHtml(html: string) {
  const withoutScripts = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");
  const withBreaks = withoutScripts
    .replace(/<\/(p|div|section|article|header|footer|li|h[1-6])>/gi, " ")
    .replace(/<br\s*\/?>/gi, " ");

  return normalizeWhitespace(decodeEntities(withBreaks.replace(/<[^>]+>/g, " ")));
}

function extractMeta(html: string, pattern: RegExp) {
  return decodeEntities(html.match(pattern)?.[1] ?? "").trim();
}

function isBlockedHost(hostname: string) {
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

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as { url?: string };
    const rawUrl = payload.url?.trim();

    if (!rawUrl) {
      return Response.json({ error: "Website URL is required." }, { status: 400 });
    }

    const parsedUrl = new URL(rawUrl);
    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      return Response.json({ error: "Only HTTP and HTTPS URLs can be checked." }, { status: 400 });
    }
    if (isBlockedHost(parsedUrl.hostname)) {
      return Response.json({ error: "Private or local network URLs cannot be fetched." }, { status: 400 });
    }

    const response = await fetch(parsedUrl.toString(), {
      headers: {
        Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5",
        "User-Agent":
          "AI-Governance-Compatibility-Checker/1.0 (+https://chatgpt.site)",
      },
      redirect: "follow",
    });

    const contentType = response.headers.get("content-type") ?? "";
    const body = await response.text();
    const title = extractMeta(body, /<title[^>]*>([\s\S]*?)<\/title>/i);
    const description = extractMeta(
      body,
      /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["'][^>]*>/i,
    );
    const text = contentType.includes("text/html") ? stripHtml(body) : normalizeWhitespace(body);

    return Response.json({
      ok: response.ok,
      status: response.status,
      finalUrl: response.url,
      title,
      description,
      text: text.slice(0, MAX_TEXT_LENGTH),
      textLength: text.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to fetch website.";
    return Response.json({ error: message }, { status: 500 });
  }
}
