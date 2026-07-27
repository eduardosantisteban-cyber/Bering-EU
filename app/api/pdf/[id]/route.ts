import { NextResponse } from "next/server";
import { PDF_BUCKET, supabaseAdmin } from "@/lib/supabase/server";
import { getPresupuesto } from "@/lib/db";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const presupuesto = await getPresupuesto(id);
  if (!presupuesto || !presupuesto.pdf_storage_path) {
    return NextResponse.json({ error: "No hay PDF guardado" }, { status: 404 });
  }

  const db = supabaseAdmin();
  const { data, error } = await db.storage
    .from(PDF_BUCKET)
    .createSignedUrl(presupuesto.pdf_storage_path, 60 * 30);

  if (error || !data) {
    return NextResponse.json({ error: "No se pudo generar el enlace del PDF" }, { status: 500 });
  }

  return NextResponse.json({ url: data.signedUrl });
}
