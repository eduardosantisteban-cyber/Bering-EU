import { ESTADOS, ESTADOS_SIN_PRESUPUESTO, fechaDeCelda, nombreDeEmail, type Oportunidad } from "./solicitudes";
import { normalizeStr } from "./format";

// Dársena: bandeja "Hoy", peticiones de precio a proveedores, línea de tiempo de cada oportunidad
// y estadísticas por proveedor. Funciones puras: se prueban sin red.

const DIA = 86400000;

// ── Peticiones de precio a proveedores (pestaña "Peticiones proveedores" de la hoja Solicitudes) ──
// A fecha · B Nº oportunidad · C proveedor · D emails · E cuenta · F asunto · G Sheet (HYPERLINK)
// H partidas (JSON) · I estado · J mensajes leídos · K resultado · L recordatorios

export interface Peticion {
  fila: number;
  fecha: string | null;
  codigo: string;
  proveedor: string;
  emails: string;
  cuenta: string;
  sheetUrl: string;
  partidas: number;
  estado: string; // Esperando respuesta · Respondida · Sin respuesta · Cerrada
  respondida: boolean;
  resultado: string;
  recordatorios: string;
  nRecordatorios: number;
  borradorSinEnviar: boolean;
  primeraRespuesta: string | null;
  diasRespuesta: number | null;
}

const txt = (v: unknown, max = 300) => String(v ?? "").trim().slice(0, max);

/** "29/10/2026: …" → fechas de cada línea (las más recientes van primero en la celda). */
export function fechasDeLineas(texto: string): Date[] {
  const out: Date[] = [];
  for (const m of texto.matchAll(/(?:^|\n)(\d{2})\/(\d{2})\/(\d{4})/g)) {
    const d = new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1]), 12));
    if (!isNaN(d.getTime())) out.push(d);
  }
  return out;
}

export function parsearPeticiones(valores: unknown[][], formulasG: unknown[]): Peticion[] {
  const out: Peticion[] = [];
  valores.forEach((r, k) => {
    const codigo = txt(r?.[1], 30).toUpperCase();
    if (!codigo) return;
    const f = fechaDeCelda(r[0]);
    const resultado = txt(r[10], 2000);
    const recordatorios = txt(r[11], 2000);
    const leidos = txt(r[9], 2000);
    const estado = txt(r[8], 40) || "Esperando respuesta";
    const respondida = estado === "Respondida" || !!leidos;
    const fechasResp = respondida ? fechasDeLineas(resultado) : [];
    const primera = fechasResp.length ? new Date(Math.min(...fechasResp.map((d) => d.getTime()))) : null;
    let partidas = 0;
    try {
      const p = JSON.parse(String(r[7] || "[]"));
      partidas = Array.isArray(p) ? p.length : 0;
    } catch {
      partidas = 0;
    }
    const g = String(formulasG[k] ?? "");
    out.push({
      fila: k + 2,
      fecha: f ? f.toISOString() : null,
      codigo,
      proveedor: txt(r[2], 80),
      emails: txt(r[3], 200),
      cuenta: txt(r[4], 120).toLowerCase(),
      sheetUrl: (g.match(/HYPERLINK\("([^"]+)"/i) || [])[1] || (/^https?:/.test(txt(r[6])) ? txt(r[6]) : ""),
      partidas,
      estado,
      respondida,
      resultado,
      recordatorios,
      nRecordatorios: (recordatorios.match(/Recordatorio \d+ preparado/g) || []).length,
      borradorSinEnviar: /borrador sin enviar/i.test(recordatorios.split("\n")[0] || ""),
      primeraRespuesta: primera ? primera.toISOString() : null,
      diasRespuesta: primera && f ? Math.max(0, Math.round(((primera.getTime() - f.getTime()) / DIA) * 10) / 10) : null,
    });
  });
  return out;
}

// ── Llamadas sin registrar y entradas del portal con error (Supabase) ──

export interface LlamadaPendiente {
  id: string;
  creado: string;
  numero: string;
  perdida?: boolean | null;
  duracion?: number | null;
  comercial?: string | null;
  estado: string;
}

export interface EntradaPortal {
  id: string;
  creado: string;
  canal: string;
  registrado_por: string;
  empresa?: string | null;
  contacto?: string | null;
  estado: string;
  codigo?: string | null;
  error?: string | null;
}

// ── Bandeja "Hoy" ──

export type TipoTarea = "llamar" | "presupuestar" | "datos" | "enviar" | "proveedor" | "llamada" | "error" | "respondio";

export interface Tarea {
  id: string;
  tipo: TipoTarea;
  prioridad: 1 | 2 | 3; // 1 = hoy sin falta
  titulo: string;
  detalle: string;
  codigo?: string;
  empresa?: string;
  quien: string; // email de quien tiene que hacerlo ("" = cualquiera)
  dias: number | null;
  enlace?: { url: string; texto: string };
}

export const NOMBRE_TAREA: Record<TipoTarea, string> = {
  llamar: "Llamar al cliente",
  presupuestar: "Presupuestar",
  datos: "Pedir datos al cliente",
  enviar: "Enviar presupuesto",
  proveedor: "Proveedores",
  llamada: "Llamada sin registrar",
  error: "Error",
  respondio: "El cliente respondió",
};

const dias = (desde: string | null, ahora: Date) => (desde ? Math.floor((ahora.getTime() - new Date(desde).getTime()) / DIA) : null);

/**
 * Todo lo que necesita a una persona, de todas las fuentes, ordenado por urgencia:
 * oportunidades que necesitan atención, datos que faltan, peticiones a proveedores sin enviar o sin respuesta,
 * llamadas entrantes sin registrar y entradas del portal que fallaron.
 */
export function bandejaHoy(
  ops: Oportunidad[],
  peticiones: Peticion[],
  llamadas: LlamadaPendiente[],
  entradas: EntradaPortal[],
  ahora: Date
): Tarea[] {
  const tareas: Tarea[] = [];
  const porCodigo = new Map(ops.map((o) => [o.codigo, o]));
  const cerradas = new Set(ops.filter((o) => o.estado === ESTADOS.GANADO || o.estado === ESTADOS.PERDIDO).map((o) => o.codigo));

  for (const o of ops) {
    if (o.origen === "crm") continue;
    const base = { codigo: o.codigo, empresa: o.empresa, quien: o.registradoPor };
    if (o.faltanDatos && ESTADOS_SIN_PRESUPUESTO.includes(o.estado)) {
      tareas.push({
        ...base,
        id: "datos-" + o.codigo,
        tipo: "datos",
        prioridad: 1,
        titulo: "Faltan datos del cliente",
        detalle: o.faltanDatos + " · El borrador para pedírselos está en Gmail.",
        dias: dias(o.fechaSolicitud, ahora),
        enlace: o.gmailUrl ? { url: o.gmailUrl, texto: "Gmail" } : undefined,
      });
    }
    if (!o.atencion) continue;
    const tipo: TipoTarea = /^Llamar/.test(o.atencion)
      ? "llamar"
      : /respondi/i.test(o.atencion)
        ? "respondio"
        : /Error/.test(o.atencion)
          ? "error"
          : ESTADOS_SIN_PRESUPUESTO.includes(o.estado)
            ? "presupuestar"
            : "enviar";
    tareas.push({
      ...base,
      id: "op-" + o.codigo,
      tipo,
      prioridad: tipo === "llamar" || tipo === "respondio" || tipo === "error" ? 1 : (o.diasAtencion ?? 0) > 7 ? 1 : 2,
      titulo: o.atencion,
      detalle: [o.productos, o.importe ? Math.round(o.importe).toLocaleString("es-ES") + " €" : ""].filter(Boolean).join(" · "),
      dias: o.diasAtencion,
      enlace: o.sheetUrl ? { url: o.sheetUrl, texto: "Sheet" } : undefined,
    });
  }

  for (const p of peticiones) {
    if (cerradas.has(p.codigo) || p.respondida || p.estado === "Cerrada") continue;
    const d = dias(p.fecha, ahora);
    if (d !== null && d > 45) continue;
    const o = porCodigo.get(p.codigo);
    const base = { codigo: p.codigo, empresa: o?.empresa, quien: p.cuenta, dias: d, enlace: p.sheetUrl ? { url: p.sheetUrl, texto: "Sheet" } : undefined };
    if (p.estado === "Sin respuesta") {
      tareas.push({ ...base, id: "prov-" + p.fila, tipo: "proveedor", prioridad: 1, titulo: `${p.proveedor} no responde`, detalle: `Sin respuesta tras ${p.nRecordatorios} recordatorio(s): pide precio a otro proveedor de la lista.` });
    } else if (p.borradorSinEnviar) {
      tareas.push({ ...base, id: "prov-" + p.fila, tipo: "proveedor", prioridad: 1, titulo: `Enviar la petición de precio a ${p.proveedor}`, detalle: "El borrador sigue en Gmail sin enviar." });
    } else if (/^\d{2}\/\d{2}\/\d{4}: Recordatorio \d+ preparado/.test(p.recordatorios)) {
      const linea = p.recordatorios.split("\n")[0];
      tareas.push({ ...base, id: "prov-" + p.fila, tipo: "proveedor", prioridad: 2, titulo: `Enviar el recordatorio a ${p.proveedor}`, detalle: linea.replace(/^\d{2}\/\d{2}\/\d{4}: /, "") + " · Está en Borradores." });
    }
  }

  for (const l of llamadas) {
    if (l.estado !== "nueva" && l.estado !== "avisada") continue;
    tareas.push({
      id: "llamada-" + l.id,
      tipo: "llamada",
      prioridad: l.perdida ? 1 : 2,
      titulo: `${l.perdida ? "Llamada perdida" : "Llamada"} de ${l.numero}`,
      detalle: (l.perdida ? "Devuélvela y, " : "") + "si es una oportunidad, regístrala en + Nueva; si no, descártala.",
      quien: String(l.comercial || "").toLowerCase(),
      dias: dias(l.creado, ahora),
      enlace: { url: "/nueva", texto: "+ Nueva" },
    });
  }

  for (const e of entradas) {
    if (e.estado !== "error") continue;
    tareas.push({
      id: "entrada-" + e.id,
      tipo: "error",
      prioridad: 1,
      titulo: `No se pudo crear la oportunidad de ${e.empresa || e.contacto || "una entrada del portal"}`,
      detalle: e.error || "Revisa la entrada en + Nueva.",
      quien: String(e.registrado_por || "").toLowerCase(),
      dias: dias(e.creado, ahora),
      enlace: { url: "/nueva", texto: "+ Nueva" },
    });
  }

  const orden: Record<TipoTarea, number> = { llamar: 0, respondio: 1, error: 2, llamada: 3, datos: 4, proveedor: 5, presupuestar: 6, enviar: 7 };
  return tareas.sort((a, b) => a.prioridad - b.prioridad || orden[a.tipo] - orden[b.tipo] || (b.dias ?? 0) - (a.dias ?? 0));
}

// ── Línea de tiempo de una oportunidad ──

export interface Hito {
  fecha: string; // ISO
  tipo: "entrada" | "estado" | "proveedor" | "respuesta" | "recordatorio" | "seguimiento" | "presupuesto";
  texto: string;
  detalle?: string;
}

/** Pestaña "Historial estados": A fecha · B código · C de · D a · E importe · F registrado por */
export function lineaDeTiempo(o: Oportunidad, historial: unknown[][], peticiones: Peticion[]): Hito[] {
  const h: Hito[] = [];
  if (o.fechaSolicitud) {
    h.push({ fecha: o.fechaSolicitud, tipo: "entrada", texto: `Solicitud recibida${o.canal ? " · " + o.canal : ""}`, detalle: o.asunto || undefined });
  }
  for (const r of historial) {
    if (String(r?.[1] ?? "").trim().toUpperCase() !== o.codigo) continue;
    const d = fechaDeCelda(r[0]);
    if (!d) continue;
    const imp = Number(r[4]);
    h.push({
      fecha: d.toISOString(),
      tipo: String(r[3]) === ESTADOS.HOLDED ? "presupuesto" : "estado",
      texto: `${String(r[2] || "—")} → ${String(r[3] || "—")}`,
      detalle: [isFinite(imp) && imp > 0 ? Math.round(imp).toLocaleString("es-ES") + " €" : "", r[5] ? nombreDeEmail(String(r[5])) : ""].filter(Boolean).join(" · ") || undefined,
    });
  }
  for (const p of peticiones) {
    if (p.codigo !== o.codigo) continue;
    if (p.fecha) h.push({ fecha: p.fecha, tipo: "proveedor", texto: `Precio pedido a ${p.proveedor}`, detalle: `${p.partidas} partida(s) · ${p.estado}` });
    const lineas = p.resultado.split("\n").filter((l) => /^\d{2}\/\d{2}\/\d{4}/.test(l));
    for (const l of lineas) {
      const d = fechasDeLineas(l)[0];
      if (d) h.push({ fecha: d.toISOString(), tipo: "respuesta", texto: `Respuesta de ${p.proveedor}`, detalle: l.replace(/^\d{2}\/\d{2}\/\d{4}: /, "").slice(0, 240) });
    }
    for (const l of p.recordatorios.split("\n").filter(Boolean)) {
      const d = fechasDeLineas(l)[0];
      if (d) h.push({ fecha: d.toISOString(), tipo: "recordatorio", texto: `${p.proveedor}: ${l.replace(/^\d{2}\/\d{2}\/\d{4}: /, "")}` });
    }
  }
  const nombres = ["1er email de seguimiento", "2º email de seguimiento", "Aviso para llamar"];
  o.seguimiento.forEach((s, i) => {
    const d = fechaDeCelda(s);
    if (s && d) h.push({ fecha: d.toISOString(), tipo: "seguimiento", texto: nombres[i], detalle: s });
  });
  return h.sort((a, b) => a.fecha.localeCompare(b.fecha));
}

// ── Estadísticas por proveedor ──

export interface FilaProveedor {
  proveedor: string;
  peticiones: number;
  respondidas: number;
  sinRespuesta: number;
  pendientes: number;
  tasaRespuesta: number | null;
  medianaDias: number | null;
  ultima: string | null;
  /** Precio frente al resto (mediana de su €/m² ÷ mediana del tipo) − 1: +0,12 = 12 % más caro. */
  indicePrecio: number | null;
  lineasPrecio: number;
  ultimoPresupuesto: string | null;
}

export function claveProveedor(nombre: string): string {
  const n = normalizeStr(nombre);
  const mapa: [RegExp, string][] = [
    [/novoferm/, "novoferm"], [/transmave/, "transmave"], [/padilla/, "padilla"], [/porta ?fire/, "portafire"],
    [/dock ?equipment/, "dockequipment"], [/angel ?mir|mi ?door/, "angelmir"], [/inkema/, "inkema"], [/bmp/, "bmp"],
  ];
  for (const [re, k] of mapa) if (re.test(n)) return k;
  return n.replace(/\b(s\.?a\.?|s\.?l\.?u?\.?|sl|sa|slu)\b/g, "").replace(/[^a-z0-9]/g, "");
}

export function mediana(xs: number[]): number | null {
  const v = xs.filter((x) => isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

/** Ancho x alto en metros a partir de textos como "3000 x 4000 mm", "3,00x4,00 m", "1600(800+800)x2100". */
export function areaM2(medidas: string | null | undefined): number | null {
  const t = String(medidas || "").replace(/(\d)\.(\d{3})(?!\d)/g, "$1$2");
  const m = t.match(/(\d{1,5}(?:[.,]\d{1,3})?)\s*(?:\([^)]*\))?\s*(mm|cm|m)?\s*[x×X*]\s*(\d{1,5}(?:[.,]\d{1,3})?)\s*(mm|cm|m)?/);
  if (!m) return null;
  const n = (s: string) => Number(s.replace(",", "."));
  let a = n(m[1]);
  let b = n(m[3]);
  const u = m[2] || m[4] || "";
  const aMm = (v: number) => (u === "m" || v < 20 ? v * 1000 : u === "cm" || v < 100 ? v * 10 : v);
  a = aMm(a);
  b = aMm(b);
  if (a < 300 || b < 300 || a > 30000 || b > 30000) return null;
  return (a / 1000) * (b / 1000);
}

export interface LineaPrecio {
  proveedor: string;
  categoria: string;
  medidas: string | null;
  precio: number | null;
  fecha: string | null;
  accesorio: boolean;
}

export function estadisticasProveedores(peticiones: Peticion[], lineas: LineaPrecio[], ahora: Date): FilaProveedor[] {
  const filas = new Map<string, FilaProveedor & { _dias: number[]; _ratios: number[] }>();
  const fila = (nombre: string) => {
    const k = claveProveedor(nombre);
    let f = filas.get(k);
    if (!f) {
      f = { proveedor: nombre, peticiones: 0, respondidas: 0, sinRespuesta: 0, pendientes: 0, tasaRespuesta: null, medianaDias: null, ultima: null, indicePrecio: null, lineasPrecio: 0, ultimoPresupuesto: null, _dias: [], _ratios: [] };
      filas.set(k, f);
    }
    return f;
  };
  for (const p of peticiones) {
    if (!p.proveedor) continue;
    const f = fila(p.proveedor);
    f.peticiones++;
    if (p.respondida) {
      f.respondidas++;
      if (p.diasRespuesta !== null) f._dias.push(p.diasRespuesta);
    } else if (p.estado === "Sin respuesta" || (p.fecha && ahora.getTime() - new Date(p.fecha).getTime() > 14 * DIA)) f.sinRespuesta++;
    else f.pendientes++;
    if (p.fecha && (!f.ultima || p.fecha > f.ultima)) f.ultima = p.fecha;
  }

  // Precio relativo: €/m² de cada línea frente a la mediana de su categoría (últimos 24 meses, sin accesorios)
  const validas = lineas
    .filter((l) => !l.accesorio && l.precio && l.precio > 0 && (!l.fecha || ahora.getTime() - new Date(l.fecha).getTime() < 730 * DIA))
    .map((l) => ({ ...l, m2: areaM2(l.medidas) }))
    .filter((l): l is typeof l & { m2: number } => l.m2 !== null && l.m2 > 0.5);
  const porCat = new Map<string, number[]>();
  for (const l of validas) porCat.set(l.categoria, [...(porCat.get(l.categoria) || []), (l.precio as number) / l.m2]);
  const medCat = new Map([...porCat].filter(([, v]) => v.length >= 4).map(([k, v]) => [k, mediana(v) as number]));
  for (const l of lineas) {
    if (!l.proveedor) continue;
    const f = fila(l.proveedor);
    f.lineasPrecio++;
    if (l.fecha && (!f.ultimoPresupuesto || l.fecha > f.ultimoPresupuesto)) f.ultimoPresupuesto = l.fecha;
  }
  for (const l of validas) {
    const m = medCat.get(l.categoria);
    if (m) fila(l.proveedor)._ratios.push((l.precio as number) / l.m2 / m);
  }

  return [...filas.values()]
    .map(({ _dias, _ratios, ...f }) => ({
      ...f,
      tasaRespuesta: f.peticiones ? f.respondidas / f.peticiones : null,
      medianaDias: mediana(_dias),
      indicePrecio: _ratios.length >= 3 ? (mediana(_ratios) as number) - 1 : null,
    }))
    .sort((a, b) => b.peticiones - a.peticiones || b.lineasPrecio - a.lineasPrecio);
}
