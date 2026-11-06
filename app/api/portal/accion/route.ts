import { NextResponse } from "next/server";
import { escribirRango, leerRangos, serviceAccountEmail } from "@/lib/googleSheets";
import { solicitudesSheetId, MOTIVOS_PERDIDA } from "@/lib/portalConfig";
import { COL } from "@/lib/solicitudes";

// Acciones del portal que escriben en la hoja Solicitudes:
//  · motivo  → columna W "Motivo pérdida" (y nota en la oportunidad de Holded, si hay HOLDED_API_KEY)
//  · sinSeguimiento → casilla T "Sin seguimiento" (para el seguimiento automático del script)
//  · estado → columna N "Estado": Ganado, Perdido (con motivo opcional en W) o Presupuesto enviado (reabrir).
//    El script de la hoja registra la fecha del cambio y lo pasa al histórico de ofertas en su siguiente ronda (≤10 min).
//    En Holded se mueve la oportunidad a la etapa Ganado/Perdido de su embudo si existe; si no, se deja una nota.
// La hoja tiene que estar compartida como EDITOR con la cuenta de servicio.

const HOJA = "Solicitudes";

function letra(col: number): string {
  let s = "";
  for (let n = col; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

export async function POST(req: Request) {
  let body: { accion?: string; codigo?: string; valor?: unknown; motivo?: unknown };
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
  } else if (body.accion === "estado") {
    valor = String(body.valor ?? "").trim();
    if (!ESTADOS_PORTAL.includes(valor)) return NextResponse.json({ error: "Estado no válido" }, { status: 400 });
    col = COL.ESTADO;
  } else {
    return NextResponse.json({ error: "Acción desconocida" }, { status: 400 });
  }
  const motivo = body.accion === "estado" && valor === "Perdido" ? String(body.motivo ?? "").trim() : "";
  if (motivo && !MOTIVOS_PERDIDA.includes(motivo)) return NextResponse.json({ error: "Motivo no válido" }, { status: 400 });

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
    let holdedDetalle = "";
    if (body.accion === "motivo" && valor) holded = await notaHolded(codigo, `Motivo de pérdida: ${valor} (indicado en el portal).`);
    if (body.accion === "estado") {
      // Al cerrar o reabrir, el motivo de pérdida se ajusta: se guarda el elegido o se borra si ya no está perdida
      if (motivo || valor !== "Perdido") await escribirRango(sheetId, `${HOJA}!${letra(COL.MOTIVO_PERDIDA)}${fila}`, [[motivo]]);
      // Al cerrarla se para el seguimiento automático al cliente
      if (valor === "Ganado" || valor === "Perdido") await escribirRango(sheetId, `${HOJA}!${letra(COL.SIN_SEGUIMIENTO)}${fila}`, [[true]]);
      const r = await estadoHolded(codigo, valor as string, motivo);
      holded = r.ok;
      holdedDetalle = r.detalle;
    }
    return NextResponse.json({ ok: true, fila, holded, holdedDetalle });
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

const ESTADOS_PORTAL = ["Ganado", "Perdido", "Presupuesto enviado"];

/**
 * Refleja el cambio en Holded. En Holded «ganada/perdida» es el estado de la oportunidad (status 1 / -1; 0 = abierta),
 * no una etapa: primero se cambia ese estado; si la API no lo acepta, se prueba a mover a una etapa llamada
 * «Ganado»/«Perdido» del embudo. Siempre deja una nota. Devuelve si se aplicó y, si no, por qué.
 */
async function estadoHolded(codigo: string, estado: string, motivo: string): Promise<{ ok: boolean; detalle: string }> {
  const key = process.env.HOLDED_API_KEY;
  if (!key) return { ok: false, detalle: "falta HOLDED_API_KEY" };
  const h = { key, accept: "application/json", "Content-Type": "application/json" };
  const base = "https://api.holded.com/api/crm/v1";
  const pasos: string[] = [];
  try {
    const rl = await fetch(`${base}/leads`, { headers: h });
    if (!rl.ok) return { ok: false, detalle: `Holded leads ${rl.status}` };
    const leads = (await rl.json()) as { id: string; name?: string; stageId?: string; status?: number }[];
    const re = new RegExp("^\\s*" + codigo + "(?!\\d)", "i");
    const lead = (Array.isArray(leads) ? leads : []).filter((l) => re.test(String(l.name || ""))).pop();
    if (!lead) return { ok: false, detalle: `no hay ninguna oportunidad en Holded cuyo nombre empiece por ${codigo}` };

    const nota = `Marcada como ${estado} en Dársena${motivo ? ` · motivo: ${motivo}` : ""}.`;
    await fetch(`${base}/leads/${lead.id}/notes`, { method: "POST", headers: h, body: JSON.stringify({ title: `Estado: ${estado}`, desc: nota }) }).catch(() => null);

    const leer = () => fetch(`${base}/leads/${lead.id}`, { headers: h }).then((x) => (x.ok ? x.json() : null)).catch(() => null);

    // 1) Estado de la oportunidad en la API de Holded: 1 ganada · -1 perdida · 0 abierta
    //    (con 2 la API lo acepta y lo guarda, pero Holded no la muestra como perdida)
    const status = estado === "Ganado" ? 1 : estado === "Perdido" ? -1 : 0;
    for (const cuerpo of [{ status }]) {
      const r = await fetch(`${base}/leads/${lead.id}`, { method: "PUT", headers: h, body: JSON.stringify(cuerpo) }).catch(() => null);
      if (!r) continue;
      if (!r.ok) {
        pasos.push(`PUT status → ${r.status} ${(await r.text().catch(() => "")).slice(0, 120)}`);
        continue;
      }
      const l = await leer();
      if (l && Number(l.status) === status) return { ok: true, detalle: "estado de la oportunidad actualizado" };
      pasos.push(`PUT status → ${r.status}, pero la oportunidad sigue con status ${l?.status ?? "?"}`);
    }

    // 2) Etapa con ese nombre en el embudo de la oportunidad
    const rf = await fetch(`${base}/funnels`, { headers: h });
    if (!rf.ok) return { ok: false, detalle: pasos.concat(`funnels ${rf.status}`).join(" · ") };
    const funnels = (await rf.json()) as { name?: string; stages?: { stageId?: string; id?: string; key?: string; name?: string }[] }[];
    const idDe = (s: { stageId?: string; id?: string; key?: string }) => s.stageId || s.id || s.key;
    const embudo = (Array.isArray(funnels) ? funnels : []).find((f) => (f.stages || []).some((s) => idDe(s) === lead.stageId));
    const patron = estado === "Ganado" ? /ganad|won|aceptad/i : estado === "Perdido" ? /perdid|lost|rechazad|descartad/i : /enviad|sent|seguimiento|negociaci/i;
    const etapa = (embudo?.stages || []).find((s) => patron.test(String(s.name || "")));
    if (!etapa) {
      pasos.push(`el embudo «${embudo?.name || "?"}» no tiene etapa ${estado} (etapas: ${(embudo?.stages || []).map((s) => s.name).join(", ")})`);
      return { ok: false, detalle: pasos.join(" · ") };
    }
    const stageId = idDe(etapa);
    for (const [url, cuerpo] of [
      [`${base}/leads/${lead.id}/stages`, { stageId }],
      [`${base}/leads/${lead.id}`, { stageId }],
    ] as const) {
      const r = await fetch(url, { method: "PUT", headers: h, body: JSON.stringify(cuerpo) }).catch(() => null);
      if (!r?.ok) continue;
      const l = await leer();
      if (l?.stageId === stageId) return { ok: true, detalle: `movida a la etapa «${etapa.name}»` };
    }
    pasos.push(`no se pudo mover a la etapa «${etapa.name}»`);
    return { ok: false, detalle: pasos.join(" · ") };
  } catch (e) {
    return { ok: false, detalle: pasos.concat((e as Error).message).join(" · ") };
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
