import { AVISOS, SEGUIMIENTO, TIPOS_PRODUCTO } from "./portalConfig";
import { normalizeStr } from "./format";

// Lectura de la tabla "Solicitudes" (Google Sheet de la automatización) y
// las reglas del panel: "necesitan atención", indicadores, serie mensual y
// desglose por tipo de producto. Funciones puras: se prueban sin red.
//
// Columnas (1 = A), igual que COL en gmail_a_holded.gs:
//  A fecha email · B Nº oportunidad (HYPERLINK al Sheet) · C empresa · D contacto · E email
//  F productos · K asunto · L enlace Gmail · M registrado por · N estado
//  O presupuesto Holded (HYPERLINK al PDF) · P fecha estado · Q importe (base)
//  S seguimiento · T sin seguimiento (casilla) · U seguimiento 2 · V aviso llamada

export const ESTADOS = {
  PENDIENTE: "Pendiente presupuesto",
  LISTO: "Presupuesto listo",
  HOLDED: "Presupuesto en Holded",
  ERROR: "Error Holded",
  ENVIADO: "Presupuesto enviado",
  GANADO: "Ganado",
  PERDIDO: "Perdido",
} as const;

export const ESTADOS_CERRADOS: string[] = [ESTADOS.GANADO, ESTADOS.PERDIDO];
export const ESTADOS_SIN_PRESUPUESTO: string[] = [ESTADOS.PENDIENTE, ESTADOS.LISTO, ESTADOS.ERROR];
export const ESTADOS_ABIERTOS_CON_PRESUPUESTO: string[] = [ESTADOS.HOLDED, ESTADOS.ENVIADO];

export interface Oportunidad {
  codigo: string;
  numero: string; // nº de presupuesto en Holded (BEUQxxx-A)
  empresa: string;
  contacto: string;
  email: string;
  productos: string;
  asunto: string;
  estado: string;
  fechaSolicitud: string | null; // ISO
  fechaEstado: string | null; // ISO
  importe: number | null; // base imponible
  registradoPor: string;
  sheetUrl: string;
  pdfUrl: string;
  gmailUrl: string;
  seguimiento: [string, string, string]; // S, U, V
  sinSeguimiento: boolean;
  atencion: string; // motivo ("" si no necesita nada)
  diasAtencion: number | null;
}

const DIA = 86400000;

/** Número de serie de Sheets (días desde 30/12/1899) o texto dd/mm/aaaa → Date. */
export function fechaDeCelda(v: unknown): Date | null {
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  if (typeof v === "number" && isFinite(v) && v > 20000 && v < 80000) {
    return new Date(Math.round((v - 25569) * DIA));
  }
  const m = String(v ?? "").match(/(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (!m) return null;
  return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), Number(m[4] || 12), Number(m[5] || 0));
}

/** URL de una fórmula =HYPERLINK("url","texto"). */
export function urlDeFormula(f: unknown): string {
  return (String(f ?? "").match(/HYPERLINK\(\s*"([^"]+)"/i) || [])[1] || "";
}

const txt = (v: unknown, max = 200) => String(v ?? "").trim().slice(0, max);
const fechaIso = (iso: string | null) => (iso ? new Date(iso) : null);

/** Enlace a Gmail con la cuenta en ?authuser= (no /u/0, que puede ser una cuenta personal). */
export function enlaceGmail(enlace: string, cuenta: string): string {
  const id = (enlace.match(/#[a-z]+\/([\w-]+)/i) || [])[1];
  if (!id || !/^https:\/\/mail\.google\.com\//.test(enlace)) return "";
  return cuenta
    ? `https://mail.google.com/mail/?authuser=${encodeURIComponent(cuenta)}#all/${id}`
    : enlace;
}

/** Qué paso de seguimiento toca (misma regla que siguientePasoSeguimiento_ del script). */
export function pasoSeguimiento(
  fechaEnvio: Date | null,
  marcas: [string, string, string],
  ahora: Date
): { estado: "sin-fecha" | "esperando" | "toca" | "parado" | "completo"; paso?: 1 | 2 | 3 } {
  if (!fechaEnvio) return { estado: "sin-fecha" };
  const pasos: { paso: 1 | 2 | 3; dias: number }[] = [
    { paso: 1, dias: SEGUIMIENTO.DIAS_1 },
    { paso: 2, dias: SEGUIMIENTO.DIAS_2 },
    { paso: 3, dias: SEGUIMIENTO.DIAS_LLAMADA },
  ];
  const dias = (ahora.getTime() - fechaEnvio.getTime()) / DIA;
  let anterior = fechaEnvio;
  let diaAnterior = 0;
  for (let i = 0; i < pasos.length; i++) {
    const p = pasos[i];
    if (!p.dias) continue;
    const marca = (marcas[i] || "").trim();
    // En producción, lo marcado como "Prueba…" se repite de verdad
    if (marca && !/^prueba/i.test(marca)) {
      if (/^(no enviado|no avisado|error)/i.test(marca)) return { estado: "parado", paso: p.paso };
      anterior = fechaDeCelda(marca) || anterior;
      diaAnterior = p.dias;
      continue;
    }
    const desdeAnterior = (ahora.getTime() - anterior.getTime()) / DIA;
    if (dias < p.dias || desdeAnterior < p.dias - diaAnterior) return { estado: "esperando", paso: p.paso };
    return { estado: "toca", paso: p.paso };
  }
  return { estado: "completo" };
}

/**
 * ¿Necesita esta oportunidad que alguien haga algo? (misma regla que motivoAtencion_ del script:
 * lo que el seguimiento automático ya está gestionando no cuenta).
 */
export function motivoAtencion(
  o: Pick<Oportunidad, "estado" | "fechaEstado" | "fechaSolicitud" | "seguimiento" | "sinSeguimiento" | "registradoPor">,
  ahora: Date
): { motivo: string; dias: number } | null {
  const fe = fechaIso(o.fechaEstado) || fechaIso(o.fechaSolicitud);
  if (!fe) return null;
  const dias = Math.floor((ahora.getTime() - fe.getTime()) / DIA);
  const [s1, s2, llamada] = o.seguimiento;
  let motivo = "";
  if (o.estado === ESTADOS.ENVIADO) {
    const paso = pasoSeguimiento(fe, o.seguimiento, ahora);
    if (/^aviso enviado/i.test(llamada)) {
      motivo = "Llamar al cliente (aviso del " + llamada.replace(/^aviso enviado\s*/i, "").slice(0, 10) + ")";
    } else if (/cliente respondi/i.test([s1, s2, llamada].join(" | ")) && dias > AVISOS.DIAS_ENVIADO) {
      motivo = "El cliente respondió: actualizar el estado";
    } else if (
      dias > AVISOS.DIAS_ENVIADO &&
      (o.sinSeguimiento || paso.estado === "parado" || paso.estado === "completo" || !o.registradoPor)
    ) {
      motivo = "Enviado sin respuesta (sin seguimiento automático)";
    }
  } else if (ESTADOS_SIN_PRESUPUESTO.includes(o.estado) && dias > AVISOS.DIAS_PENDIENTE) {
    motivo = o.estado === ESTADOS.ERROR ? "Error al crear en Holded" : "Sin presupuestar";
  } else if (o.estado === ESTADOS.HOLDED && dias > AVISOS.DIAS_PENDIENTE) {
    motivo = "En Holded, sin enviar";
  }
  return motivo ? { motivo, dias } : null;
}

/**
 * Convierte las filas de la hoja (valores sin formato + fórmulas de B y O) en oportunidades.
 * `valores[k]` es la fila k+2 (A…V); `formulasB[k]` / `formulasO[k]` las fórmulas de esas celdas.
 */
export function parsearSolicitudes(
  valores: unknown[][],
  formulasB: unknown[],
  formulasO: unknown[],
  ahora: Date
): Oportunidad[] {
  const out: Oportunidad[] = [];
  valores.forEach((f, k) => {
    const c = (col: number) => (f ? f[col - 1] : "");
    const codigo = txt(c(2), 30);
    if (!codigo) return;
    const importeRaw = c(17);
    const importe = importeRaw === "" || importeRaw === null || importeRaw === undefined ? null : Number(importeRaw);
    const fs = fechaDeCelda(c(1));
    const fe = fechaDeCelda(c(16));
    const registradoPor = txt(c(13), 120).toLowerCase();
    const o: Oportunidad = {
      codigo,
      numero: (txt(c(15), 60).match(/[A-Z]{2,8}\d{1,7}-[A-Z]/) || [""])[0],
      empresa: txt(c(3), 120),
      contacto: txt(c(4), 80),
      email: txt(c(5), 120),
      productos: txt(c(6), 200),
      asunto: txt(c(11), 160),
      estado: txt(c(14), 40),
      fechaSolicitud: fs ? fs.toISOString() : null,
      fechaEstado: fe ? fe.toISOString() : null,
      importe: importe !== null && isFinite(importe) ? Math.round(importe * 100) / 100 : null,
      registradoPor,
      sheetUrl: urlDeFormula(formulasB[k]),
      pdfUrl: urlDeFormula(formulasO[k]),
      gmailUrl: enlaceGmail(txt(c(12), 300), registradoPor),
      seguimiento: [txt(c(19), 80), txt(c(21), 80), txt(c(22), 80)],
      sinSeguimiento: c(20) === true || String(c(20)).toUpperCase() === "TRUE",
      atencion: "",
      diasAtencion: null,
    };
    const a = motivoAtencion(o, ahora);
    if (a) {
      o.atencion = a.motivo;
      o.diasAtencion = a.dias;
    }
    out.push(o);
  });
  return out;
}

const fecha = fechaIso;
const suma = (l: Oportunidad[]) => l.reduce((s, o) => s + (o.importe || 0), 0);

export interface Indicadores {
  carteraAbierta: number;
  nAbiertas: number;
  enviados: number;
  enviadosImporte: number;
  porPresupuestar: number;
  ganadoAnio: number;
  nGanadosAnio: number;
  tasaCierre90: number | null;
  nCerrados90: number;
  atencion: number;
}

export function indicadores(ops: Oportunidad[], ahora: Date): Indicadores {
  const anio = ahora.getFullYear();
  const hace90 = new Date(ahora.getTime() - 90 * DIA);
  const abiertas = ops.filter((o) => ESTADOS_ABIERTOS_CON_PRESUPUESTO.includes(o.estado));
  const enviados = ops.filter((o) => o.estado === ESTADOS.ENVIADO);
  const ganadosAnio = ops.filter((o) => o.estado === ESTADOS.GANADO && fecha(o.fechaEstado)?.getFullYear() === anio);
  const cerrados90 = ops.filter((o) => {
    const d = fecha(o.fechaEstado);
    return ESTADOS_CERRADOS.includes(o.estado) && !!d && d >= hace90;
  });
  return {
    carteraAbierta: suma(abiertas),
    nAbiertas: abiertas.length,
    enviados: enviados.length,
    enviadosImporte: suma(enviados),
    porPresupuestar: ops.filter((o) => ESTADOS_SIN_PRESUPUESTO.includes(o.estado)).length,
    ganadoAnio: suma(ganadosAnio),
    nGanadosAnio: ganadosAnio.length,
    tasaCierre90: cerrados90.length ? cerrados90.filter((o) => o.estado === ESTADOS.GANADO).length / cerrados90.length : null,
    nCerrados90: cerrados90.length,
    atencion: ops.filter((o) => o.atencion).length,
  };
}

export interface Mes {
  anio: number;
  mes: number; // 0-11
  ofertado: number;
  ganado: number;
  solicitudes: number;
  nGanados: number;
}

/** Últimos `n` meses: ofertado por fecha de la solicitud, ganado por fecha en que se ganó. */
export function serieMensual(ops: Oportunidad[], ahora: Date, n = 6): Mes[] {
  const meses: Mes[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(ahora.getFullYear(), ahora.getMonth() - i, 1);
    meses.push({ anio: d.getFullYear(), mes: d.getMonth(), ofertado: 0, ganado: 0, solicitudes: 0, nGanados: 0 });
  }
  const de = (d: Date | null) => (d ? meses.find((m) => m.anio === d.getFullYear() && m.mes === d.getMonth()) : undefined);
  for (const o of ops) {
    const a = de(fecha(o.fechaSolicitud));
    if (a) {
      a.ofertado += o.importe || 0;
      a.solicitudes++;
    }
    if (o.estado === ESTADOS.GANADO) {
      const b = de(fecha(o.fechaEstado));
      if (b) {
        b.ganado += o.importe || 0;
        b.nGanados++;
      }
    }
  }
  return meses;
}

export interface FilaTipo {
  tipo: string;
  solicitudes: number;
  ofertado: number;
  ganados: number;
  perdidos: number;
  tasa: number | null;
}

/** Desglose por tipo de producto (una solicitud con varios tipos cuenta en cada uno). */
export function porTipo(ops: Oportunidad[]): FilaTipo[] {
  return TIPOS_PRODUCTO.map(({ clave, nombre }) => {
    const l = ops.filter((o) => normalizeStr(o.productos).includes(clave));
    const ganados = l.filter((o) => o.estado === ESTADOS.GANADO).length;
    const perdidos = l.filter((o) => o.estado === ESTADOS.PERDIDO).length;
    return {
      tipo: nombre,
      solicitudes: l.length,
      ofertado: suma(l),
      ganados,
      perdidos,
      tasa: ganados + perdidos ? ganados / (ganados + perdidos) : null,
    };
  })
    .filter((x) => x.solicitudes > 0)
    .sort((a, b) => b.ofertado - a.ofertado || b.solicitudes - a.solicitudes);
}

/** Orden de "necesitan atención": primero las llamadas, después las más antiguas. */
export function ordenAtencion(a: Oportunidad, b: Oportunidad): number {
  const la = /^Llamar/.test(a.atencion) ? 1 : 0;
  const lb = /^Llamar/.test(b.atencion) ? 1 : 0;
  return lb - la || (b.diasAtencion || 0) - (a.diasAtencion || 0);
}

/** Nombre corto a partir del email ("eduardo.z@beringeu.es" → "Eduardo"). */
export function nombreDeEmail(email: string): string {
  if (!email) return "—";
  const x = email.split("@")[0].split(/[._-]/)[0];
  return x.charAt(0).toUpperCase() + x.slice(1);
}
