export function fmtMoney(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(n);
}

export function driveEmbedUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const m1 = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  const m2 = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  const fileId = (m1 && m1[1]) || (m2 && m2[1]);
  return fileId ? `https://drive.google.com/file/d/${fileId}/preview` : null;
}

export function normalizeStr(s: unknown): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

// Formas societarias comunes que aparecen pegadas al final del nombre de
// una marca/proveedor y que no deben distinguir una marca de otra
// (ordenadas para que las mas largas se prueben antes que sus prefijos,
// p. ej. "slu" antes que "sl").
const LEGAL_SUFFIXES =
  "sau|slu|sa|sl|scoop|sc|srl|bv|nv|gmbh|ltd|plc|inc|corp|co";
const LEGAL_SUFFIX_RE = new RegExp(`\\s+(${LEGAL_SUFFIXES})$`, "i");

/**
 * Clave de comparacion para marcas/proveedores: quita acentos/mayusculas,
 * puntos, comas y guiones, el sufijo societario final (SA, S.A., SL, SLU,
 * BV...) y cualquier diferencia de espaciado interno. Con esto
 * "NOVOFERM ALSAL, SA", "NOVOFERM-ALSAL S.A." y "NOVOFERM ALSAL" (o
 * "Van Wijk Nederland BV" y "VanWijk Nederland bv") se tratan como la misma
 * marca en filtros y en el comparador, sin tocar el texto tal como esta
 * guardado en la base de datos.
 */
export function normalizeMarca(s: unknown): string {
  let t = normalizeStr(s)
    .replace(/\./g, "") // "S.A." -> "SA" (las siglas se juntan, no se separan)
    .replace(/[,-]/g, " ") // comas y guiones SI actuan como separador de palabras
    .replace(/\s+/g, " ")
    .trim();
  t = t.replace(LEGAL_SUFFIX_RE, "").trim();
  return t.replace(/\s+/g, ""); // ignora tambien espaciado interno (p. ej. "Van Wijk" vs "VanWijk")
}
