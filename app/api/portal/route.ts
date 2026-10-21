import { NextResponse } from "next/server";
import { leerRangoOpcional, leerRangos, serviceAccountEmail } from "@/lib/googleSheets";
import { completarOportunidades, fechasPresupuesto, margenesDeOfertas, parsearSolicitudes, type LineaOferta, type Margen } from "@/lib/solicitudes";
import { supabaseAdmin } from "@/lib/supabase/server";
import { leerHistoricoHolded, oportunidadesDeHolded } from "@/lib/holdedCrm";
import { enlacesPortal, solicitudesSheetId } from "@/lib/portalConfig";
import type { PortalData } from "@/lib/portalTypes";

// Datos del portal: la tabla "Solicitudes" del Google Sheet de la automatización
// (leída con la cuenta de servicio de Google) + las pestañas "Sistema", "Errores" e
// "Historial estados" que escribe el script, y el histórico de ofertas de Supabase
// (tabla ofertas_bering) para los márgenes.

const HOJA = "Solicitudes";

/** El script escribe las fechas de "Sistema" y "Errores" como texto ISO (UTC); por si acaso, acepta también nº de serie. */
function aIso(v: unknown): string | null {
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v.trim())) return v.trim();
  if (typeof v === "number" && isFinite(v) && v > 20000) return new Date(Math.round((v - 25569) * 86400000)).toISOString();
  return null;
}

export async function GET() {
  const ahora = new Date();
  let sheetId: string;
  try {
    sheetId = solicitudesSheetId();
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message, configuracion: true }, { status: 500 });
  }

  try {
    const avisos: string[] = [];
    const [valores] = await leerRangos(sheetId, [`${HOJA}!A2:Y`]);
    const [formB, formO] = await leerRangos(sheetId, [`${HOJA}!B2:B`, `${HOJA}!O2:O`], "FORMULA");
    const [sistema, errores, historial, margenes, crm] = await Promise.all([
      leerRangoOpcional(sheetId, "Sistema!A1:B20"),
      leerRangoOpcional(sheetId, "Errores!A2:E201"),
      leerRangoOpcional(sheetId, "'Historial estados'!A2:D").catch((e: Error) => {
        avisos.push("Sin historial de estados (" + e.message.slice(0, 120) + "): el tiempo de respuesta se calcula solo con el histórico de ofertas.");
        return [] as unknown[][];
      }),
      leerMargenes().catch((e: Error) => {
        avisos.push("Márgenes no disponibles ahora mismo (" + e.message.slice(0, 120) + ").");
        return {} as Record<string, Margen>;
      }),
      leerHistoricoHolded().catch((e: Error) => {
        avisos.push("No se pudo leer el histórico de Holded (" + e.message.slice(0, 120) + "): solo se muestran las oportunidades de la hoja Solicitudes.");
        return null;
      }),
    ]);

    const oportunidades = parsearSolicitudes(
      valores,
      formB.map((r) => r[0]),
      formO.map((r) => r[0]),
      ahora
    );
    completarOportunidades(oportunidades, fechasPresupuesto(historial as unknown[][]), margenes);
    // Histórico del CRM: oportunidades de Holded que no están en la hoja (anteriores a la automatización)
    if (crm) {
      const enHoja = new Set(oportunidades.map((o) => o.codigo.toUpperCase()));
      oportunidades.push(...oportunidadesDeHolded(crm.leads, crm.etapas, enHoja, crm.tagsPorContacto));
    } else if (!process.env.HOLDED_API_KEY) {
      avisos.push("Falta HOLDED_API_KEY en Vercel: las oportunidades anteriores a la automatización (solo en Holded) no se incluyen.");
    }

    const estado: Record<string, string | number | boolean | null> = {};
    for (const [k, v] of sistema as unknown[][]) {
      if (!k) continue;
      estado[String(k)] = aIso(v) ?? (typeof v === "number" || typeof v === "boolean" ? v : String(v ?? ""));
    }

    const body: PortalData = {
      generado: ahora.toISOString(),
      oportunidades,
      sistema: estado,
      errores: (errores as unknown[][])
        .filter((r) => r && r[0] !== "" && r[0] !== undefined)
        .map((r) => ({
          fecha: aIso(r[0]) ?? String(r[0] ?? ""),
          cuenta: String(r[1] ?? ""),
          donde: String(r[2] ?? ""),
          contexto: String(r[3] ?? ""),
          error: String(r[4] ?? ""),
        }))
        .reverse()
        .slice(0, 50),
      enlaces: enlacesPortal(),
      avisos,
    };
    return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    const msg = (err as Error).message || "No se pudo leer la tabla Solicitudes";
    const cuenta = serviceAccountEmail();
    const sinPermiso = /403|PERMISSION_DENIED|404|not found/i.test(msg);
    return NextResponse.json(
      {
        error: sinPermiso && cuenta
          ? `La cuenta de servicio no puede leer la hoja Solicitudes. Compártela (como Lector) con ${cuenta}.`
          : msg,
        configuracion: sinPermiso,
      },
      { status: 502 }
    );
  }
}

/** Líneas del histórico de ofertas (Supabase, tabla ofertas_bering) → margen por oportunidad. */
async function leerMargenes(): Promise<Record<string, Margen>> {
  const db = supabaseAdmin();
  const lineas: LineaOferta[] = [];
  for (let desde = 0; desde < 20000; desde += 1000) {
    const { data, error } = await db
      .from("ofertas_bering")
      .select("codigo, numero, fecha, uds, precio_unit, coste_unit, descuento")
      .range(desde, desde + 999);
    if (error) throw new Error(error.message);
    lineas.push(...((data || []) as LineaOferta[]));
    if (!data || data.length < 1000) break;
  }
  return margenesDeOfertas(lineas);
}
