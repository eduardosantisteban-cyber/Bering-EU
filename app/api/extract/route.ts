import { NextResponse } from "next/server";
import { extractFromPdfWithRetry } from "@/lib/anthropic";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const base64 = typeof body?.base64 === "string" ? body.base64 : null;
  if (!base64) {
    return NextResponse.json({ error: "Falta el PDF (base64)" }, { status: 400 });
  }

  try {
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
