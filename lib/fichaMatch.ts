import { normalizeMarca, normalizeStr } from "./format";

export interface MatchableProduct {
  marca: string | null;
  modelo: string | null;
}

/**
 * ¿Esta ficha técnica corresponde a esta línea de producto? Exige misma
 * marca (con la misma normalización que el resto de la app, ver
 * normalizeMarca) y que el modelo de una contenga al de la otra — el
 * modelo puede venir escrito de forma algo distinta según si lo extrajo la
 * IA del presupuesto o de la propia ficha técnica (p. ej. "L530" dentro de
 * "Plataforma labio telescópico L530").
 */
export function matchesFicha(ficha: MatchableProduct, product: MatchableProduct): boolean {
  if (!ficha.marca || !product.marca) return false;
  if (normalizeMarca(ficha.marca) !== normalizeMarca(product.marca)) return false;

  if (!ficha.modelo || !product.modelo) return false;
  const fm = normalizeStr(ficha.modelo);
  const pm = normalizeStr(product.modelo);
  if (!fm || !pm) return false;
  return fm === pm || fm.includes(pm) || pm.includes(fm);
}

// ───────── Varias fichas del mismo producto: siempre la más reciente ─────────

export interface FichaConFecha extends MatchableProduct {
  id: string;
  nombre_archivo: string;
  created_at: string;
  fecha_documento?: string | null; // aaaa-mm-dd, la del propio documento
  version?: string | null; // "v07", "Rev. 3", "Ed. 2024"…
}

/** Fecha de la ficha: la del documento; si no hay, el año del nombre del archivo (2024, V-2017…). */
export function fechaDeFicha(f: FichaConFecha): string | null {
  if (f.fecha_documento && /^\d{4}-\d{2}-\d{2}/.test(f.fecha_documento)) return f.fecha_documento.slice(0, 10);
  const anos = (f.nombre_archivo.match(/(?:^|[^\d])(19[89]\d|20[0-4]\d)(?!\d)/g) || []).map((x) => Number(x.replace(/\D/g, "")));
  return anos.length ? `${Math.max(...anos)}-01-01` : null;
}

/** Número de versión/revisión (del campo versión o del nombre: "v07", "rev 3", "-00 Ind"…); 0 si no hay. */
export function numeroVersion(f: FichaConFecha): number {
  const textos = [f.version || "", f.nombre_archivo.replace(/\.pdf$/i, "")];
  for (const t of textos) {
    const m = t.match(/(?:^|[^a-záéíóú])(?:v|ver|versi[oó]n|rev|revisi[oó]n|ed|edici[oó]n)[\s._-]*(\d{1,3})(?!\d)/i) || (t === f.version ? t.match(/(\d{1,3})(?!.*\d)/) : null);
    if (m) return Number(m[1]);
  }
  return 0;
}

/** Orden de más reciente a más antigua: fecha del documento, versión y, si no, cuándo se subió. */
export function compararRecencia(a: FichaConFecha, b: FichaConFecha): number {
  const fa = fechaDeFicha(a) || "";
  const fb = fechaDeFicha(b) || "";
  if (fa !== fb) return fa > fb ? -1 : 1;
  const va = numeroVersion(a);
  const vb = numeroVersion(b);
  if (va !== vb) return vb - va;
  return String(b.created_at).localeCompare(String(a.created_at));
}

/** La ficha más reciente de una lista (null si está vacía). */
export function masReciente<T extends FichaConFecha>(fichas: T[]): T | null {
  return fichas.length ? [...fichas].sort(compararRecencia)[0] : null;
}

/** ¿Son dos fichas del mismo producto? Misma marca y modelo que coincide (uno contiene al otro). */
export function mismoProducto(a: MatchableProduct, b: MatchableProduct): boolean {
  return matchesFicha(a, b);
}

/** Para cada ficha que tiene otra más reciente del mismo producto: id de esa más reciente. */
export function versionesAnteriores<T extends FichaConFecha>(fichas: T[]): Map<string, T> {
  const res = new Map<string, T>();
  for (const f of fichas) {
    const grupo = fichas.filter((g) => g.id === f.id || mismoProducto(f, g));
    const actual = masReciente(grupo);
    if (actual && actual.id !== f.id) res.set(f.id, actual);
  }
  return res;
}
