import { extractMeta, isBlockedHost, normalizeWhitespace, stripHtml } from "../../lib/html-to-text";

const MAX_TEXT_LENGTH = 18000;

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
