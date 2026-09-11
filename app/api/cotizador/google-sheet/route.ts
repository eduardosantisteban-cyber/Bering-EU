import { NextResponse } from "next/server";
import { createQuoteSheet, type QuoteSheetItem } from "@/lib/googleSheets";

interface Body {
  items?: QuoteSheetItem[];
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Body | null;
  if (!body || !Array.isArray(body.items) || body.items.length === 0) {
    return NextResponse.json({ error: "No hay líneas en el cotizador" }, { status: 400 });
  }

  try {
    const sheet = await createQuoteSheet(body.items);
    return NextResponse.json(sheet);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message || "No se pudo crear la hoja de Google" },
      { status: 502 }
    );
  }
}
