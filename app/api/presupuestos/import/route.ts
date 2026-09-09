import { NextResponse } from "next/server";
import { importPresupuestos } from "@/lib/db";
import { extractBackupList } from "@/lib/backup";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const records = extractBackupList(body);
  if (records.length === 0) {
    return NextResponse.json(
      { error: "El backup no tiene el formato esperado ({ presupuestos: [...] })" },
      { status: 400 }
    );
  }

  try {
    const result = await importPresupuestos(records);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message || "No se pudo importar el backup" },
      { status: 500 }
    );
  }
}
