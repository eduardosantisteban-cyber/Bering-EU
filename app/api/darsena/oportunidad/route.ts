import { NextResponse } from "next/server";
import { leerRangoOpcional } from "@/lib/googleSheets";
import { leerPeticiones } from "@/lib/darsenaServer";
import { solicitudesSheetId } from "@/lib/portalConfig";
import { supabaseAdmin } from "@/lib/supabase/server";

// Datos de la ficha de una oportunidad que no vienen en /api/portal:
// historial de estados, peticiones a proveedores, líneas del presupuesto (histórico de ofertas) y la entrada del portal.
export async function GET(req: Request) {
  const codigo = String(new URL(req.url).searchParams.get("codigo") || "").trim().toUpperCase();
  if (!/^[A-Z]{2,8}\d{1,7}$/.test(codigo)) return NextResponse.json({ error: "Código no válido" }, { status: 400 });
  try {
    const sheetId = solicitudesSheetId();
    const [historial, peticiones] = await Promise.all([
      leerRangoOpcional(sheetId, "'Historial estados'!A2:F"),
      leerPeticiones(sheetId),
    ]);
    const db = supabaseAdmin();
    const [lineas, entrada] = await Promise.all([
      db.from("ofertas_bering").select("numero, fecha, linea, tipo, descripcion, medidas, uds, coste_unit, precio_unit, proveedor, es_servicio").eq("codigo", codigo).order("numero").order("linea").limit(300),
      db.from("entradas_oportunidad").select("creado, canal, registrado_por, nota, telefono").eq("codigo", codigo).limit(1),
    ]);
    return NextResponse.json(
      {
        historial: historial.filter((r) => String(r?.[1] ?? "").trim().toUpperCase() === codigo),
        peticiones: peticiones.filter((p) => p.codigo === codigo),
        lineas: lineas.error ? [] : lineas.data || [],
        entrada: entrada.error ? null : (entrada.data || [])[0] || null,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message || "No se pudo leer la oportunidad" }, { status: 502 });
  }
}
