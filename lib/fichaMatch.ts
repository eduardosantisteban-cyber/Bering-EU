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
