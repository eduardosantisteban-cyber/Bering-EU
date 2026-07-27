import { NextResponse } from "next/server";
import { deletePresupuesto, getPresupuesto, updatePresupuesto } from "@/lib/db";
import { PDF_BUCKET, supabaseAdmin } from "@/lib/supabase/server";
import { uid } from "@/lib/id";
import type { PresupuestoItem } from "@/lib/types";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  const { id } = await params;
  const presupuesto = await getPresupuesto(id);
  if (!presupuesto) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }
  return NextResponse.json(presupuesto);
}

interface UpdateBody {
  proveedor?: string;
  numero_presupuesto?: string | null;
  fecha_presupuesto?: string | null;
  drive_url?: string | null;
  items?: Array<Partial<PresupuestoItem> & { id?: string }>;
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as UpdateBody | null;
  if (!body) {
    return NextResponse.json({ error: "Cuerpo de la petición inválido" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (body.proveedor !== undefined) patch.proveedor = body.proveedor;
  if (body.numero_presupuesto !== undefined) patch.numero_presupuesto = body.numero_presupuesto;
  if (body.fecha_presupuesto !== undefined) patch.fecha_presupuesto = body.fecha_presupuesto;
  if (body.drive_url !== undefined) patch.drive_url = body.drive_url;

  // Si se cambia el proveedor, la marca de todas las líneas se sincroniza
  // automáticamente (misma regla que la app original).
  const items = body.items?.map((it) => ({
    id: it.id || uid(),
    codigo_articulo: it.codigo_articulo ?? null,
    categoria: it.categoria || "",
    tipo_producto: it.tipo_producto ?? null,
    marca: body.proveedor !== undefined ? body.proveedor : it.marca ?? null,
    modelo: it.modelo ?? null,
    medidas: it.medidas ?? null,
    precio_unitario:
      it.precio_unitario === null || it.precio_unitario === undefined
        ? null
        : Number(it.precio_unitario),
    moneda: it.moneda || "EUR",
    cantidad: it.cantidad === null || it.cantidad === undefined ? 1 : Number(it.cantidad),
    es_accesorio: !!it.es_accesorio,
    grupo: it.grupo ?? 1,
    notas: it.notas ?? null,
  }));

  try {
    const saved = await updatePresupuesto(
      id,
      patch as Parameters<typeof updatePresupuesto>[1],
      items
    );
    return NextResponse.json(saved);
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
    const existing = await getPresupuesto(id);
    if (existing?.pdf_storage_path) {
      const db = supabaseAdmin();
      await db.storage.from(PDF_BUCKET).remove([existing.pdf_storage_path]);
    }
    await deletePresupuesto(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message || "No se pudo borrar" },
      { status: 500 }
    );
  }
}
