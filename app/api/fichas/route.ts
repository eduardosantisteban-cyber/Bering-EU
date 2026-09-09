import { NextResponse } from "next/server";
import { createFicha, listFichas } from "@/lib/db";
import { uid } from "@/lib/id";

export async function GET() {
  try {
    const fichas = await listFichas();
    return NextResponse.json(fichas);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message || "No se pudieron cargar las fichas técnicas" },
      { status: 500 }
    );
  }
}

interface CreateBody {
  id?: string;
  categoria?: string | null;
  tipo_producto?: string | null;
  marca?: string | null;
  modelo?: string | null;
  nombre_archivo: string;
  storage_path: string;
  notas?: string | null;
}

// Se llama justo después de subir el PDF a Storage (ver
// /api/fichas/upload-url) para registrar sus metadatos.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as CreateBody | null;
  if (!body || !body.nombre_archivo || !body.storage_path) {
    return NextResponse.json({ error: "Cuerpo de la petición inválido" }, { status: 400 });
  }

  try {
    const ficha = await createFicha({
      id: body.id || uid(),
      categoria: body.categoria || "",
      tipo_producto: body.tipo_producto ?? null,
      marca: body.marca ?? null,
      modelo: body.modelo ?? null,
      nombre_archivo: body.nombre_archivo,
      storage_path: body.storage_path,
      notas: body.notas ?? null,
    });
    return NextResponse.json(ficha, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message || "No se pudo guardar la ficha técnica" },
      { status: 500 }
    );
  }
}
