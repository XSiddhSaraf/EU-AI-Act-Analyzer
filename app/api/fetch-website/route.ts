import { extractMeta, isBlockedHost, normalizeWhitespace, stripHtml } from "../../lib/html-to-text";

const MAX_TEXT_LENGTH = 18000;
// Raw response size cap (before any text extraction/truncation) —
// protects bandwidth and CPU from huge or malicious pages. This is
// intentionally much larger than MAX_TEXT_LENGTH since raw HTML is usually
// several times bigger than its stripped visible text.
const MAX_FETCH_BYTES = 3 * 1024 * 1024; // 3MB
const PAGE_TOO_LARGE_MESSAGE =
  "This page is too large to check automatically (over 3MB). Paste the relevant text in Document mode instead.";

/**
 * Reads a Response body up to `maxBytes`, returning null if it exceeds the
 * cap. Streams and bails out early rather than using response.text()
 * (which buffers the whole body first) so an oversized or malicious page
 * can't be fully downloaded before we notice — protects bandwidth/CPU
 * even when a server omits or lies about Content-Length.
 */
async function readBodyWithCap(response: Response, maxBytes: number): Promise<string | null> {
  if (!response.body) {
    const text = await response.text();
    return text.length > maxBytes ? null : text;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }

  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8").decode(combined);
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

    const declaredLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_FETCH_BYTES) {
      return Response.json({ error: PAGE_TOO_LARGE_MESSAGE }, { status: 400 });
    }

    const contentType = response.headers.get("content-type") ?? "";
    const body = await readBodyWithCap(response, MAX_FETCH_BYTES);
    if (body === null) {
      return Response.json({ error: PAGE_TOO_LARGE_MESSAGE }, { status: 400 });
    }
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
