import { NextResponse } from "next/server";
import { deleteFicha, getFicha, updateFicha } from "@/lib/db";
import { FICHAS_BUCKET, supabaseAdmin } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ id: string }> };

interface UpdateBody {
  categoria?: string | null;
  tipo_producto?: string | null;
  marca?: string | null;
  modelo?: string | null;
  notas?: string | null;
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as UpdateBody | null;
  if (!body) {
    return NextResponse.json({ error: "Cuerpo de la petición inválido" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (body.categoria !== undefined) patch.categoria = body.categoria || "";
  if (body.tipo_producto !== undefined) patch.tipo_producto = body.tipo_producto;
  if (body.marca !== undefined) patch.marca = body.marca;
  if (body.modelo !== undefined) patch.modelo = body.modelo;
  if (body.notas !== undefined) patch.notas = body.notas;

  try {
    const ficha = await updateFicha(id, patch);
    return NextResponse.json(ficha);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message || "No se pudo guardar el cambio" },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const { id } = await params;
  try {
    const existing = await getFicha(id);
    if (existing?.storage_path) {
      const db = supabaseAdmin();
      await db.storage.from(FICHAS_BUCKET).remove([existing.storage_path]);
    }
    await deleteFicha(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message || "No se pudo borrar" },
      { status: 500 }
    );
  }
}
