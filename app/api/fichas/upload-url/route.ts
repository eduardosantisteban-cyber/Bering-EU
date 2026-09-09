import { NextResponse } from "next/server";
import { FICHAS_BUCKET, createUploadUrl, supabaseAdmin } from "@/lib/supabase/server";

const PATH_PATTERN = /^[a-z0-9]+\/[^/]+$/i;

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const rawFilename = typeof body?.filename === "string" ? body.filename : "";

  try {
    const result = await createUploadUrl(FICHAS_BUCKET, rawFilename);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message || "No se pudo preparar la subida de la ficha técnica" },
      { status: 500 }
    );
  }
}

// Borra una ficha técnica subida que nunca llegó a guardarse como
// registro (el usuario descartó el archivo tras subirlo). Best-effort.
export async function DELETE(request: Request) {
  const body = await request.json().catch(() => null);
  const path = typeof body?.path === "string" ? body.path : null;
  if (!path || !PATH_PATTERN.test(path)) {
    return NextResponse.json({ error: "path inválido" }, { status: 400 });
  }

  try {
    const db = supabaseAdmin();
    await db.storage.from(FICHAS_BUCKET).remove([path]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message || "No se pudo borrar la ficha técnica" },
      { status: 500 }
    );
  }
}
