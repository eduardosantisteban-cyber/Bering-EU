import { NextResponse } from "next/server";
import { escribirRango, leerRangos, serviceAccountEmail } from "@/lib/googleSheets";
import { solicitudesSheetId, MOTIVOS_PERDIDA } from "@/lib/portalConfig";
import { COL } from "@/lib/solicitudes";

// Acciones del portal que escriben en la hoja Solicitudes:
//  · motivo  → columna W "Motivo pérdida" (y nota en la oportunidad de Holded, si hay HOLDED_API_KEY)
//  · sinSeguimiento → casilla T "Sin seguimiento" (para el seguimiento automático del script)
// La hoja tiene que estar compartida como EDITOR con la cuenta de servicio.

const HOJA = "Solicitudes";

function letra(col: number): string {
  let s = "";
  for (let n = col; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

export async function POST(req: Request) {
  let body: { accion?: string; codigo?: string; valor?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Petición no válida" }, { status: 400 });
  }
  const codigo = String(body.codigo || "").trim().toUpperCase();
  if (!/^[A-Z]{2,8}\d{1,7}$/.test(codigo)) return NextResponse.json({ error: "Código de oportunidad no válido" }, { status: 400 });

  let col: number;
  let valor: string | boolean;
  if (body.accion === "motivo") {
    valor = String(body.valor ?? "").trim();
    if (valor && !MOTIVOS_PERDIDA.includes(valor)) return NextResponse.json({ error: "Motivo no válido" }, { status: 400 });
    col = COL.MOTIVO_PERDIDA;
  } else if (body.accion === "sinSeguimiento") {
    valor = body.valor === true;
    col = COL.SIN_SEGUIMIENTO;
  } else {
    return NextResponse.json({ error: "Acción desconocida" }, { status: 400 });
  }

  try {
    const sheetId = solicitudesSheetId();
    // La fila se busca por el código (columna B) en el momento, por si la hoja ha cambiado
    const [codigos, cabecera] = await leerRangos(sheetId, [`${HOJA}!B2:B`, `${HOJA}!W1:Y1`]);
    const i = codigos.findIndex((r) => String(r?.[0] ?? "").trim().toUpperCase() === codigo);
    if (i < 0) return NextResponse.json({ error: `No encuentro ${codigo} en la hoja Solicitudes` }, { status: 404 });
    const fila = i + 2;
    if (col === COL.MOTIVO_PERDIDA && !String(cabecera?.[0]?.[0] ?? "").trim()) {
      await escribirRango(sheetId, `${HOJA}!W1`, [["Motivo pérdida"]]);
    }
    await escribirRango(sheetId, `${HOJA}!${letra(col)}${fila}`, [[valor]]);

    let holded = false;
    if (body.accion === "motivo" && valor) holded = await notaHolded(codigo, `Motivo de pérdida: ${valor} (indicado en el portal).`);
    return NextResponse.json({ ok: true, fila, holded });
  } catch (err) {
    const msg = (err as Error).message || "No se pudo guardar";
    const cuenta = serviceAccountEmail();
    const sinPermiso = /403|PERMISSION_DENIED|caller does not have permission/i.test(msg);
    return NextResponse.json(
      {
        error:
          sinPermiso && cuenta
            ? `El portal no puede escribir en la hoja Solicitudes. Compártela como EDITOR (no solo Lector) con ${cuenta}.`
            : msg,
      },
      { status: sinPermiso ? 403 : 502 }
    );
  }
}

/** Nota en la oportunidad de Holded cuyo título empieza por el código. Opcional: si falla, no pasa nada. */
async function notaHolded(codigo: string, texto: string): Promise<boolean> {
  const key = process.env.HOLDED_API_KEY;
  if (!key) return false;
  try {
    const h = { key, accept: "application/json", "Content-Type": "application/json" };
    const res = await fetch("https://api.holded.com/api/crm/v1/leads", { headers: h });
    if (!res.ok) return false;
    const leads = (await res.json()) as { id: string; name?: string }[];
    const re = new RegExp("^\\s*" + codigo + "(?!\\d)", "i");
    const lead = (Array.isArray(leads) ? leads : []).filter((l) => re.test(String(l.name || ""))).pop();
    if (!lead) return false;
    const r = await fetch(`https://api.holded.com/api/crm/v1/leads/${lead.id}/notes`, {
      method: "POST",
      headers: h,
      body: JSON.stringify({ title: "Motivo de pérdida", desc: texto }),
    });
    return r.ok;
  } catch {
    return false;
  }
}
