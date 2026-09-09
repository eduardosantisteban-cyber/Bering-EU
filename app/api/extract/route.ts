import { NextResponse } from "next/server";
import { extractFromPdfWithRetry } from "@/lib/anthropic";
import { PDF_BUCKET, downloadAsBase64 } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const storagePath = typeof body?.storagePath === "string" ? body.storagePath : null;
  if (!storagePath) {
    return NextResponse.json({ error: "Falta storagePath del PDF ya subido" }, { status: 400 });
  }

  try {
    const base64 = await downloadAsBase64(PDF_BUCKET, storagePath);
    const extracted = await extractFromPdfWithRetry(base64);
    return NextResponse.json(extracted);
  } catch (err) {
    const error = err as Error & { rawResponse?: string };
    return NextResponse.json(
      {
        error: error.message || "Error al procesar el PDF",
        rawResponse: error.rawResponse ?? null,
      },
      { status: 502 }
    );
  }
}
