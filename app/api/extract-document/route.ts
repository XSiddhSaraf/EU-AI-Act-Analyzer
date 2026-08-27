import { OfficeParser } from "officeparser";

const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15MB
const SUPPORTED_EXTENSIONS = ["pptx", "docx", "pdf"] as const;
type SupportedExtension = (typeof SUPPORTED_EXTENSIONS)[number];

function isSupportedExtension(value: string): value is SupportedExtension {
  return (SUPPORTED_EXTENSIONS as readonly string[]).includes(value);
}

/**
 * Extracts plain text from an uploaded .pptx/.docx/.pdf file. Plain-text
 * formats (.txt/.md/.csv/.json) don't need this — the client keeps reading
 * those directly with FileReader, since no binary parsing is involved.
 */
export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return Response.json({ error: "No file uploaded." }, { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return Response.json({ error: "File is too large (max 15MB)." }, { status: 400 });
    }

    const extension = (file.name.split(".").pop() ?? "").toLowerCase();
    if (!isSupportedExtension(extension)) {
      return Response.json(
        { error: `Unsupported file type: .${extension || "unknown"}. Use .pptx, .docx, or .pdf.` },
        { status: 400 },
      );
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const ast = await OfficeParser.parseOffice(bytes, { fileType: extension });
    const text = ast.toText().trim();

    if (!text) {
      return Response.json(
        { error: "No text could be extracted from this file — it may be image-only or empty." },
        { status: 422 },
      );
    }

    return Response.json({ text, fileName: file.name });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to extract text from document.";
    return Response.json({ error: message }, { status: 500 });
  }
}
