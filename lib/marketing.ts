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
  etiqueta: string;
}

/** Lunes de la semana de una fecha aaaa-mm-dd. */
export function lunes(fecha: string): string {
  const d = new Date(fecha + "T12:00:00Z");
  const w = (d.getUTCDay() + 6) % 7;
  return new Date(d.getTime() - w * 86400000).toISOString().slice(0, 10);
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

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
      const etiqueta = agrupacion === "mes" ? `${MESES[Number(m) - 1]} ${y.slice(2)}` : `${Number(d)} ${MESES[Number(m) - 1]}`;
      return { clave, etiqueta, ...totales(rs) };
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
