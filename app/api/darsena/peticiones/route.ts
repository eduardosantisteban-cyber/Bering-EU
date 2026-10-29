import { NextResponse } from "next/server";
import { leerPeticiones } from "@/lib/darsenaServer";
import { solicitudesSheetId } from "@/lib/portalConfig";

// Peticiones de precio a proveedores (pestaña "Peticiones proveedores"): bandeja Hoy, fichas y proveedores.
export async function GET() {
  try {
    const peticiones = await leerPeticiones(solicitudesSheetId());
    return NextResponse.json({ peticiones }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message || "No se pudieron leer las peticiones", peticiones: [] }, { status: 502 });
  }
}
