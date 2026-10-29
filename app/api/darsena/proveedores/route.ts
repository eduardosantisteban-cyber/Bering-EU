import { NextResponse } from "next/server";
import { escribirRango, leerRangoOpcional, serviceAccountEmail } from "@/lib/googleSheets";
import { estadisticasProveedores, type LineaPrecio } from "@/lib/darsena";
import { leerPeticiones, PESTANA_COSTES, PESTANA_PRIORIDAD } from "@/lib/darsenaServer";
import { solicitudesSheetId } from "@/lib/portalConfig";
import { supabaseAdmin } from "@/lib/supabase/server";

// Proveedores en Dársena:
//  GET  → rendimiento por proveedor (peticiones de precio + base de precios) y las pestañas
//         "Prioridad de proveedores" y "Costes instalación y transporte" de la hoja Solicitudes
//  POST → guarda una de esas dos pestañas ({ tabla: "prioridad" | "costes", filas })
// Para guardar, la hoja tiene que estar compartida como EDITOR con la cuenta de servicio.

const COLUMNAS_PRIORIDAD = 8; // A tipo · B-D proveedores · E pasar a · F desde uds · G palabras clave · H notas
const COLUMNAS_COSTES = 5; // A tipo · B instalación · C transporte · D mínimo · E usar (F… lo calcula el script)

async function lineasPrecio(): Promise<LineaPrecio[]> {
  const db = supabaseAdmin();
  const pres = new Map<string, { proveedor: string; fecha: string | null }>();
  for (let desde = 0; desde < 20000; desde += 1000) {
    const { data, error } = await db.from("presupuestos").select("id, proveedor, fecha_presupuesto").range(desde, desde + 999);
    if (error) throw new Error(error.message);
    for (const p of data || []) pres.set(p.id, { proveedor: p.proveedor, fecha: p.fecha_presupuesto });
    if (!data || data.length < 1000) break;
  }
  const out: LineaPrecio[] = [];
  for (let desde = 0; desde < 50000; desde += 1000) {
    const { data, error } = await db
      .from("presupuesto_items")
      .select("presupuesto_id, categoria, medidas, precio_unitario, es_accesorio")
      .range(desde, desde + 999);
    if (error) throw new Error(error.message);
    for (const it of data || []) {
      const p = pres.get(it.presupuesto_id);
      if (!p) continue;
      out.push({ proveedor: p.proveedor, categoria: String(it.categoria || ""), medidas: it.medidas, precio: it.precio_unitario, fecha: p.fecha, accesorio: !!it.es_accesorio });
    }
    if (!data || data.length < 1000) break;
  }
  return out;
}

const celdas = (filas: unknown[][], n: number) =>
  filas.filter((r) => r && String(r[0] ?? "").trim()).map((r) => Array.from({ length: n }, (_, i) => r[i] ?? ""));

export async function GET() {
  const avisos: string[] = [];
  try {
    const sheetId = solicitudesSheetId();
    const [peticiones, prioridad, costes, lineas] = await Promise.all([
      leerPeticiones(sheetId).catch((e: Error) => {
        avisos.push("Sin peticiones de precio: " + e.message.slice(0, 120));
        return [];
      }),
      leerRangoOpcional(sheetId, `'${PESTANA_PRIORIDAD}'!A2:H`),
      leerRangoOpcional(sheetId, `'${PESTANA_COSTES}'!A2:L`),
      lineasPrecio().catch((e: Error) => {
        avisos.push("Sin base de precios: " + e.message.slice(0, 120));
        return [] as LineaPrecio[];
      }),
    ]);
    return NextResponse.json(
      {
        filas: estadisticasProveedores(peticiones, lineas, new Date()),
        prioridad: celdas(prioridad, COLUMNAS_PRIORIDAD),
        costes: celdas(costes, 12),
        avisos,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message || "No se pudieron leer los proveedores" }, { status: 502 });
  }
}

const num = (v: unknown) => {
  if (v === "" || v === null || v === undefined) return "";
  const n = Number(String(v).replace(/\./g, "").replace(",", "."));
  return isFinite(n) && n >= 0 ? n : null;
};

export async function POST(req: Request) {
  let body: { tabla?: string; filas?: unknown[][] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Petición no válida" }, { status: 400 });
  }
  const filas = Array.isArray(body.filas) ? body.filas.filter((r) => Array.isArray(r) && String(r[0] ?? "").trim()) : null;
  if (!filas || filas.length > 100) return NextResponse.json({ error: "Filas no válidas" }, { status: 400 });

  let pestana: string;
  let n: number;
  let valores: unknown[][];
  try {
    if (body.tabla === "prioridad") {
    pestana = PESTANA_PRIORIDAD;
    n = COLUMNAS_PRIORIDAD;
    valores = filas.map((r) => {
      const desde = num(r[5]);
      if (desde === null) throw new Error(`"Desde (uds)" no es un número en ${r[0]}`);
      const textos: unknown[] = [0, 1, 2, 3, 4].map((i) => String(r[i] ?? "").trim().slice(0, 80));
      return [...textos, desde, String(r[6] ?? "").slice(0, 300), String(r[7] ?? "").slice(0, 1500)];
    });
  } else if (body.tabla === "costes") {
    pestana = PESTANA_COSTES;
    n = COLUMNAS_COSTES;
    valores = filas.map((r) => {
      const v = [num(r[1]), num(r[2]), num(r[3])];
      if (v.some((x) => x === null)) throw new Error(`Hay un importe no válido en ${r[0]}`);
      const usar = /hist/i.test(String(r[4] ?? "")) ? "Histórico" : "Asumido";
      return [String(r[0]).trim().slice(0, 80), ...v, usar];
    });
  } else {
    return NextResponse.json({ error: "Tabla desconocida" }, { status: 400 });
  }
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }

  try {
    const sheetId = solicitudesSheetId();
    // Las filas que sobran (si se han quitado) se vacían
    const actuales = await leerRangoOpcional(sheetId, `'${pestana}'!A2:A`);
    const total = Math.max(valores.length, actuales.length);
    const relleno = Array.from({ length: total - valores.length }, () => Array.from({ length: n }, () => ""));
    const fin = String.fromCharCode(64 + n);
    await escribirRango(sheetId, `'${pestana}'!A2:${fin}${total + 1}`, [...valores, ...relleno]);
    return NextResponse.json({ ok: true, filas: valores.length });
  } catch (err) {
    const msg = (err as Error).message || "No se pudo guardar";
    const sinPermiso = /403|PERMISSION_DENIED|caller does not have permission/i.test(msg);
    const cuenta = serviceAccountEmail();
    return NextResponse.json(
      { error: sinPermiso && cuenta ? `Dársena no puede escribir en la hoja Solicitudes. Compártela como EDITOR con ${cuenta}.` : msg },
      { status: sinPermiso ? 403 : 502 }
    );
  }
}
