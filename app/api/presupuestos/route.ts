import { NextResponse } from "next/server";
import { createPresupuesto, listPresupuestos } from "@/lib/db";
import { PDF_BUCKET, supabaseAdmin } from "@/lib/supabase/server";
import { uid } from "@/lib/id";
import type { ExtractedItem } from "@/lib/types";

export async function GET() {
  try {
    const presupuestos = await listPresupuestos();
    return NextResponse.json(presupuestos);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message || "No se pudo cargar la base de datos" },
      { status: 500 }
    );
  }
}

interface CreateBody {
  proveedor: string;
  numero_presupuesto: string | null;
  fecha_presupuesto: string | null;
  pdf_filename: string | null;
  drive_url: string | null;
  items: ExtractedItem[];
  pdf_base64?: string | null;
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as CreateBody | null;
  if (!body || !Array.isArray(body.items)) {
    return NextResponse.json({ error: "Cuerpo de la petición inválido" }, { status: 400 });
  }

  const id = uid();
  let pdfStoragePath: string | null = null;

  try {
    if (body.pdf_base64) {
      const db = supabaseAdmin();
      const filename = body.pdf_filename || "documento.pdf";
      const path = `${id}/${filename}`;
      const bytes = Buffer.from(body.pdf_base64, "base64");
      const { error: uploadError } = await db.storage
        .from(PDF_BUCKET)
        .upload(path, bytes, { contentType: "application/pdf", upsert: false });
      if (uploadError) throw uploadError;
      pdfStoragePath = path;
    }

    const saved = await createPresupuesto(
      {
        id,
        proveedor: body.proveedor || "",
        numero_presupuesto: body.numero_presupuesto ?? null,
        fecha_presupuesto: body.fecha_presupuesto ?? null,
        pdf_filename: body.pdf_filename ?? null,
        drive_url: body.drive_url ?? null,
        pdf_storage_path: pdfStoragePath,
      },
      body.items.map((it) => ({
        id: uid(),
        codigo_articulo: it.codigo_articulo ?? null,
        categoria: it.categoria || "",
        tipo_producto: it.tipo_producto ?? null,
        marca: it.marca ?? null,
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
      }))
    );

    return NextResponse.json(saved, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message || "No se pudo guardar el presupuesto" },
      { status: 500 }
    );
  }
}
