export function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/**
 * Sanea un nombre de archivo para usarlo como ruta en Supabase Storage, que
 * rechaza espacios y otros caracteres sueltos (visto con "Presupuesto
 * 3-012943.pdf" -> error "Invalid path specified in request URL"). El
 * nombre original no se pierde: se sigue guardando tal cual en la columna
 * pdf_filename, esto solo afecta a la clave interna del objeto.
 */
export function sanitizeStorageFilename(filename: string): string {
  const trimmed = filename.trim();
  const dot = trimmed.lastIndexOf(".");
  const hasExt = dot > 0 && dot < trimmed.length - 1;
  const base = hasExt ? trimmed.slice(0, dot) : trimmed;
  const ext = hasExt ? trimmed.slice(dot + 1) : "";

  const safeBase =
    base
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z0-9._-]+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "") || "documento";
  const safeExt = ext.replace(/[^a-zA-Z0-9]+/g, "").toLowerCase();

  return safeExt ? `${safeBase}.${safeExt}` : safeBase;
}
