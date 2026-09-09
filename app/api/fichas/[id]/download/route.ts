import { NextResponse } from "next/server";
import { FICHAS_BUCKET, supabaseAdmin } from "@/lib/supabase/server";
import { getFicha } from "@/lib/db";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ficha = await getFicha(id);
  if (!ficha) {
    return NextResponse.json({ error: "No encontrada" }, { status: 404 });
  }

  const db = supabaseAdmin();
  const { data, error } = await db.storage.from(FICHAS_BUCKET).createSignedUrl(ficha.storage_path, 60 * 30);
  if (error || !data) {
    return NextResponse.json({ error: "No se pudo generar el enlace de descarga" }, { status: 500 });
  }

  return NextResponse.json({ url: data.signedUrl });
}
