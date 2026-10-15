import { NextResponse } from "next/server";
import { leerRangoOpcional, leerRangos, serviceAccountEmail } from "@/lib/googleSheets";
import { parsearSolicitudes } from "@/lib/solicitudes";
import { enlacesPortal, solicitudesSheetId } from "@/lib/portalConfig";
import type { PortalData } from "@/lib/portalTypes";

// Datos del portal: la tabla "Solicitudes" del Google Sheet de la automatización
// (leída con la cuenta de servicio de Google) + las pestañas "Sistema" y "Errores"
// que escribe el script en cada revisión. Solo lectura.

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
    const [valores] = await leerRangos(sheetId, [`${HOJA}!A2:V`]);
    const [formB, formO] = await leerRangos(sheetId, [`${HOJA}!B2:B`, `${HOJA}!O2:O`], "FORMULA");
    const [sistema, errores] = await Promise.all([
      leerRangoOpcional(sheetId, "Sistema!A1:B20"),
      leerRangoOpcional(sheetId, "Errores!A2:E201"),
    ]);

    const oportunidades = parsearSolicitudes(
      valores,
      formB.map((r) => r[0]),
      formO.map((r) => r[0]),
      ahora
    );

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
