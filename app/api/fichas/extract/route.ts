import { NextResponse } from "next/server";
import { extractFichaMetadataWithRetry } from "@/lib/anthropic";
import { FICHAS_BUCKET, downloadAsBase64 } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const storagePath = typeof body?.storagePath === "string" ? body.storagePath : null;
  if (!storagePath) {
    return NextResponse.json({ error: "Falta storagePath de la ficha ya subida" }, { status: 400 });
  }

  try {
    const base64 = await downloadAsBase64(FICHAS_BUCKET, storagePath);
    const metadata = await extractFichaMetadataWithRetry(base64);
    return NextResponse.json(metadata);
  } catch (err) {
    const error = err as Error & { rawResponse?: string };
    return NextResponse.json(
      { error: error.message || "Error al analizar la ficha técnica" },
      { status: 502 }
    );
  }
}
