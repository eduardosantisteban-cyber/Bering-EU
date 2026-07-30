import { NextResponse } from "next/server";
import { PDF_BUCKET, supabaseAdmin } from "@/lib/supabase/server";
import { uid } from "@/lib/id";

// Formato esperado de un path generado por este endpoint: "<id>/<filename>".
const PATH_PATTERN = /^[a-z0-9]+\/[^/]+$/i;

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const filename =
    typeof body?.filename === "string" && body.filename.trim() ? body.filename.trim() : "documento.pdf";

  const id = uid();
  const path = `${id}/${filename}`;

  try {
    const db = supabaseAdmin();
    const { data, error } = await db.storage.from(PDF_BUCKET).createSignedUploadUrl(path);
    if (error || !data) {
      throw error || new Error("Respuesta vacía de Supabase Storage");
    }
    return NextResponse.json({ id, path: data.path, token: data.token });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message || "No se pudo preparar la subida del PDF" },
      { status: 500 }
    );
  }
}

// Borra un PDF subido que nunca llegó a guardarse como presupuesto
// (el usuario descartó el archivo tras subirlo, o falló la extracción y
// no reintentó). Best-effort: si falla, no bloquea nada en el cliente.
export async function DELETE(request: Request) {
  const body = await request.json().catch(() => null);
  const path = typeof body?.path === "string" ? body.path : null;
  if (!path || !PATH_PATTERN.test(path)) {
    return NextResponse.json({ error: "path inválido" }, { status: 400 });
  }

  try {
    const db = supabaseAdmin();
    await db.storage.from(PDF_BUCKET).remove([path]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message || "No se pudo borrar el PDF" },
      { status: 500 }
    );
  }
}
