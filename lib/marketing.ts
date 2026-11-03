// Marketing (Google Ads vía Windsor.ai): agregados para la sección Marketing de Dársena. Funciones puras.

export interface FilaAds {
  fecha: string; // aaaa-mm-dd
  campana: string;
  estado: string;
  gasto: number;
  clics: number;
  impresiones: number;
  conversiones: number;
  presupuesto: number; // presupuesto diario de la campaña
}

export interface FilaTermino {
  termino: string;
  campana: string;
  gasto: number;
  clics: number;
  impresiones: number;
  conversiones: number;
}

export interface Totales {
  gasto: number;
  clics: number;
  impresiones: number;
  conversiones: number;
  presupuesto: number;
  ctr: number | null;
  cpc: number | null;
  cpa: number | null;
  tasaConversion: number | null;
}

const div = (a: number, b: number) => (b ? a / b : null);

export function totales(filas: FilaAds[]): Totales {
  const t = filas.reduce(
    (s, r) => ({
      gasto: s.gasto + r.gasto,
      clics: s.clics + r.clics,
      impresiones: s.impresiones + r.impresiones,
      conversiones: s.conversiones + r.conversiones,
      presupuesto: s.presupuesto + r.presupuesto,
    }),
    { gasto: 0, clics: 0, impresiones: 0, conversiones: 0, presupuesto: 0 }
  );
  return { ...t, ctr: div(t.clics, t.impresiones), cpc: div(t.gasto, t.clics), cpa: div(t.gasto, t.conversiones), tasaConversion: div(t.conversiones, t.clics) };
}

/** Filas entre dos fechas (aaaa-mm-dd, ambas incluidas). */
export function entre(filas: FilaAds[], desde: string, hasta: string): FilaAds[] {
  return filas.filter((r) => r.fecha >= desde && r.fecha <= hasta);
}

export type Agrupacion = "dia" | "semana" | "mes";

export interface Punto extends Totales {
  clave: string;
  etiqueta: string; // corta, para el eje ("sep", "26 oct")
  etiquetaLarga: string; // sin ambigüedad, para el detalle ("Septiembre 2026", "Semana del 26 oct 2026")
}

/** Lunes de la semana de una fecha aaaa-mm-dd. */
export function lunes(fecha: string): string {
  const d = new Date(fecha + "T12:00:00Z");
  const w = (d.getUTCDay() + 6) % 7;
  return new Date(d.getTime() - w * 86400000).toISOString().slice(0, 10);
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const MESES_LARGOS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

export function serie(filas: FilaAds[], agrupacion: Agrupacion): Punto[] {
  const grupos = new Map<string, FilaAds[]>();
  for (const r of filas) {
    const k = agrupacion === "dia" ? r.fecha : agrupacion === "semana" ? lunes(r.fecha) : r.fecha.slice(0, 7);
    grupos.set(k, [...(grupos.get(k) || []), r]);
  }
  return [...grupos.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([clave, rs]) => {
      const [y, m, d] = clave.split("-");
      const mes = Number(m) - 1;
      const etiqueta = agrupacion === "mes" ? (mes === 0 ? `ene ${y}` : MESES[mes]) : `${Number(d)} ${MESES[mes]}`;
      const etiquetaLarga =
        agrupacion === "mes"
          ? `${MESES_LARGOS[mes]} ${y}`
          : agrupacion === "semana"
            ? `Semana del ${Number(d)} ${MESES[mes]} ${y}`
            : `${Number(d)} ${MESES[mes]} ${y}`;
      return { clave, etiqueta, etiquetaLarga, ...totales(rs) };
    });
}

export interface FilaCampana extends Totales {
  campana: string;
  estado: string;
  presupuestoDiario: number;
  diasActivos: number;
  /** gasto ÷ (presupuesto diario × días con datos) */
  usoPresupuesto: number | null;
}

export function porCampana(filas: FilaAds[]): FilaCampana[] {
  const grupos = new Map<string, FilaAds[]>();
  for (const r of filas) grupos.set(r.campana, [...(grupos.get(r.campana) || []), r]);
  return [...grupos.entries()]
    .map(([campana, rs]) => {
      const ultima = rs.reduce((a, b) => (b.fecha > a.fecha ? b : a));
      const t = totales(rs);
      const dias = new Set(rs.map((r) => r.fecha)).size;
      return { campana, estado: ultima.estado, presupuestoDiario: ultima.presupuesto, diasActivos: dias, usoPresupuesto: div(t.gasto, t.presupuesto), ...t };
    })
    .sort((a, b) => b.gasto - a.gasto);
}

/** Términos sumados entre campañas, de más a menos gasto (los 60 primeros). */
export function resumirTerminos(terms: FilaTermino[]): FilaTermino[] {
  const m = new Map<string, FilaTermino>();
  for (const t of terms) {
    if (!t.termino) continue;
    const k = t.termino.toLowerCase();
    const x = m.get(k) || { termino: t.termino, campana: t.campana, gasto: 0, clics: 0, impresiones: 0, conversiones: 0 };
    x.gasto += t.gasto;
    x.clics += t.clics;
    x.impresiones += t.impresiones;
    x.conversiones += t.conversiones;
    if (x.campana !== t.campana) x.campana = "Varias";
    m.set(k, x);
  }
  return [...m.values()].sort((a, b) => b.gasto - a.gasto || b.clics - a.clics).slice(0, 60);
}

/** Variación relativa (0,12 = +12 %); null si no hay base. */
export function variacion(actual: number | null, anterior: number | null): number | null {
  if (actual === null || anterior === null || !anterior) return null;
  return actual / anterior - 1;
}

// ───────── Ventas que trae Google Ads (oportunidades reales cruzadas con las campañas) ─────────
//
// Google Ads cuenta como «conversión» un clic en WhatsApp o en llamar, no una oportunidad. Aquí se cuentan las
// oportunidades reales de la hoja Solicitudes que llegan por canales que pueden venir de los anuncios (formulario
// web, info@, llamadas, WhatsApp) y se asignan a la campaña de su producto (muelles → campaña de muelles,
// puertas → campaña de puertas). Es una atribución por canal y producto, no exacta: no hay gclid.

/** Canales que pueden venir de Google Ads. «Email directo» (clientes y licitaciones) y Muelle Max (otra web) no. */
export function canalDeAnuncios(canal: string): boolean {
  const c = canal.toLowerCase();
  if (/directo|muelle ?max|crm|sin detalle/.test(c)) return false;
  return /formulario|web|info@|llamada|whatsapp|google|ads/.test(c);
}

const sinAcentos = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Campañas que encajan con los productos pedidos (por el nombre de la campaña). */
export function campanasDeProductos(productos: string, campanas: string[]): string[] {
  const p = sinAcentos(productos);
  const quiereMuelle = /muelle|rampa|abrigo|calzo|nivelad|plataforma/.test(p);
  const quierePuerta = /puerta/.test(p);
  return campanas.filter((c) => {
    const n = sinAcentos(c);
    return (quiereMuelle && /muelle|rampa|carga/.test(n)) || (quierePuerta && /puerta/.test(n));
  });
}

export interface OpMarketing {
  codigo: string;
  empresa: string;
  canal: string;
  productos: string;
  estado: string;
  importe: number | null; // euros, base
  fechaSolicitud: string | null; // ISO
}

export interface FilaVentas {
  campana: string; // "" = sin campaña clara
  gasto: number; // moneda de la cuenta
  conversionesGoogle: number;
  oportunidades: number; // puede ser fraccionario si una oportunidad pide productos de dos campañas
  presupuestadas: number;
  presupuestado: number; // €
  ganadas: number;
  ganado: number; // €
  perdidas: number;
  costeOportunidad: number | null; // moneda de la cuenta
  costeVenta: number | null; // moneda de la cuenta
  retorno: number | null; // ganado € ÷ gasto € (null sin tipo de cambio o sin gasto)
}

export interface Ventas {
  /** Desde cuándo hay canal en las oportunidades (antes no se puede saber de dónde vinieron) */
  desde: string;
  hasta: string;
  /** confirmada = el formulario trajo el clic de Google (GCLID): viene seguro de un anuncio */
  ops: (OpMarketing & { campanas: string[]; confirmada: boolean })[];
  confirmadas: number;
  campanas: FilaVentas[];
  total: FilaVentas;
}

/**
 * Cruza oportunidades y Google Ads en [desde, hasta], recortado al primer día con canal registrado (desdeCanal).
 * eurPorUnidad: euros por unidad de la moneda de la cuenta (null si no hay tipo de cambio).
 */
export function ventasDeAnuncios(
  ops: OpMarketing[],
  filas: FilaAds[],
  desde: string,
  hasta: string,
  desdeCanal: string | null,
  eurPorUnidad: number | null,
  /** código → campaña del clic (GCLID); "" si hubo clic pero no se sabe la campaña */
  porGclid: Record<string, string> = {}
): Ventas {
  const inicio = desdeCanal && desdeCanal > desde ? desdeCanal : desde;
  const ads = entre(filas, inicio, hasta);
  const nombres = [...new Set(filas.map((f) => f.campana))].sort();
  const elegidas = ops
    .filter((o) => o.fechaSolicitud && o.fechaSolicitud.slice(0, 10) >= inicio && o.fechaSolicitud.slice(0, 10) <= hasta && (canalDeAnuncios(o.canal) || o.codigo in porGclid))
    .map((o) => {
      const confirmada = o.codigo in porGclid;
      const delClic = porGclid[o.codigo];
      return { ...o, confirmada, campanas: delClic && nombres.includes(delClic) ? [delClic] : campanasDeProductos(o.productos, nombres) };
    })
    .sort((a, b) => String(b.fechaSolicitud).localeCompare(String(a.fechaSolicitud)));

  const vacia = (campana: string): FilaVentas => ({
    campana, gasto: 0, conversionesGoogle: 0, oportunidades: 0, presupuestadas: 0, presupuestado: 0, ganadas: 0, ganado: 0, perdidas: 0,
    costeOportunidad: null, costeVenta: null, retorno: null,
  });
  const filasV = new Map<string, FilaVentas>(nombres.map((n) => [n, vacia(n)]));
  const total = vacia("Total");
  for (const r of ads) {
    const f = filasV.get(r.campana) as FilaVentas;
    f.gasto += r.gasto;
    f.conversionesGoogle += r.conversiones;
    total.gasto += r.gasto;
    total.conversionesGoogle += r.conversiones;
  }
  const sumar = (f: FilaVentas, o: OpMarketing, peso: number) => {
    const imp = o.importe && o.importe > 0 ? o.importe : 0;
    f.oportunidades += peso;
    if (imp) {
      f.presupuestadas += peso;
      f.presupuestado += imp * peso;
    }
    if (/^ganado$/i.test(o.estado)) {
      f.ganadas += peso;
      f.ganado += imp * peso;
    }
    if (/^perdido$/i.test(o.estado)) f.perdidas += peso;
  };
  for (const o of elegidas) {
    sumar(total, o, 1);
    if (!o.campanas.length) {
      if (!filasV.has("")) filasV.set("", vacia(""));
      sumar(filasV.get("") as FilaVentas, o, 1);
    } else for (const c of o.campanas) sumar(filasV.get(c) as FilaVentas, o, 1 / o.campanas.length);
  }
  const ratios = (f: FilaVentas): FilaVentas => ({
    ...f,
    costeOportunidad: f.campana && f.oportunidades ? f.gasto / f.oportunidades : null,
    costeVenta: f.campana && f.ganadas ? f.gasto / f.ganadas : null,
    retorno: f.campana && eurPorUnidad && f.gasto ? f.ganado / (f.gasto * eurPorUnidad) : null,
  });
  return {
    desde: inicio,
    hasta,
    ops: elegidas,
    confirmadas: elegidas.filter((o) => o.confirmada).length,
    campanas: [...filasV.values()].map(ratios).filter((f) => f.gasto || f.oportunidades),
    total: ratios(total),
  };
}

/** Primer día (aaaa-mm-dd) con canal registrado en las oportunidades de la hoja. */
export function primerDiaConCanal(ops: { canal: string; fechaSolicitud: string | null; origen?: string }[]): string | null {
  const fechas = ops
    .filter((o) => o.origen !== "crm" && o.fechaSolicitud && o.canal && !/sin detalle|crm/i.test(o.canal))
    .map((o) => String(o.fechaSolicitud).slice(0, 10))
    .sort();
  return fechas[0] || null;
}

/**
 * Oportunidades con clic de Google (pestaña GCLID de la hoja de Marketing) → campaña del clic, cruzando con los
 * clics de Google Ads (click_view, últimos 90 días). "" si el clic es más antiguo o no aparece.
 */
export function campanasPorGclid(registros: { codigo: string; gclid: string }[], clics: { gclid: string; campana: string }[]): Record<string, string> {
  const mapa = new Map(clics.map((c) => [c.gclid, c.campana]));
  const res: Record<string, string> = {};
  for (const r of registros) {
    const g = r.gclid.trim();
    if (!r.codigo || !g || /sin gclid/i.test(g)) continue;
    res[r.codigo.trim().toUpperCase()] = mapa.get(g) || "";
  }
  return res;
}
