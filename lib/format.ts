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

// Clave de comparacion para marcas/proveedores: quita puntos y comas ademas
// de acentos/mayusculas, para que "NOVOFERM ALSAL, SA" y "NOVOFERM ALSAL,
// S.A." se traten como la misma marca en filtros y en el comparador, sin
// tocar el texto tal como esta guardado en la base de datos.
export function normalizeMarca(s: unknown): string {
  return normalizeStr(s).replace(/[.,]/g, "").replace(/\s+/g, " ").trim();
}
