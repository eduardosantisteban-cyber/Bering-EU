// Referencias web: enlazar cada oportunidad con el clic del anuncio de Google Ads del que vino.
//
// · Formulario: el script de GTM «Bering · gclid y WhatsApp» añade «[Ref. web: <gclid>]» a los comentarios.
// · WhatsApp y email: el mismo script añade al mensaje un código corto «Ref. W-XXXXXX» y lo registra en
//   Dársena (POST /api/web-ref → tabla web_refs) junto con el gclid, la página de entrada y la campaña.
// Al abrir la oportunidad en Dársena se busca el código en el asunto y el resumen, se vincula y el gclid
// pasa a la pestaña GCLID de «Bering EU – Marketing (automatizaciones)», de donde sale la subida a Google Ads.
// Funciones puras: se prueban sin red.

/** Alfabeto sin caracteres que se confunden al leerlos o dictarlos (0/O, 1/I/L). */
export const ALFABETO_REF = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const REF_RE = /\bW-([ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6})\b/i;
const ID_CLIC = /^[A-Za-z0-9_-]{10,250}$/;

/** Busca un código «W-XXXXXX» en un texto (asunto, resumen, nota de WhatsApp). */
export function extraerRef(texto: string): string | null {
  const m = String(texto || "").match(REF_RE);
  return m ? "W-" + m[1].toUpperCase() : null;
}

/** Normaliza lo que escribe el usuario («w-abc234», «Ref. W-ABC234») o null si no es válido. */
export function normalizarRef(v: unknown): string | null {
  return extraerRef(String(v ?? ""));
}

/** gclid escrito por el script en los comentarios del formulario: «[Ref. web: <gclid>]». */
export function extraerGclidTexto(texto: string): string | null {
  const m = String(texto || "").match(/\[\s*Ref\.?\s*web:\s*([A-Za-z0-9_-]{10,250})\s*\]/i);
  return m ? m[1] : null;
}

export interface WebRefNueva {
  ref: string;
  gclid: string | null;
  gbraid: string | null;
  wbraid: string | null;
  canal: "whatsapp" | "email";
  pagina: string | null;
  landing: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
}

function idClic(v: unknown): string | null {
  const s = String(v ?? "").trim();
  return ID_CLIC.test(s) ? s : null;
}

function corto(v: unknown, max: number): string | null {
  const s = String(v ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max);
  return s || null;
}

/** Ruta de una página de la web (sin dominio ni parámetros), o null. */
function ruta(v: unknown): string | null {
  const s = corto(v, 300);
  if (!s) return null;
  try {
    return new URL(s, "https://beringeu.es").pathname.slice(0, 200);
  } catch {
    return null;
  }
}

/** Valida lo que manda el script de la web. */
export function validarWebRef(body: Record<string, unknown>): { ok: true; ref: WebRefNueva } | { ok: false; error: string } {
  const ref = normalizarRef(body.ref);
  if (!ref) return { ok: false, error: "ref no válida" };
  const canal = body.canal === "email" ? "email" : body.canal === "whatsapp" ? "whatsapp" : null;
  if (!canal) return { ok: false, error: "canal no válido" };
  return {
    ok: true,
    ref: {
      ref,
      gclid: idClic(body.gclid),
      gbraid: idClic(body.gbraid),
      wbraid: idClic(body.wbraid),
      canal,
      pagina: ruta(body.pagina),
      landing: ruta(body.landing),
      utm_source: corto(body.utm_source, 100),
      utm_medium: corto(body.utm_medium, 100),
      utm_campaign: corto(body.utm_campaign, 150),
      utm_term: corto(body.utm_term, 150),
    },
  };
}

/** Orígenes desde los que se aceptan referencias (la web y su versión www). */
export function origenPermitido(origin: string | null): boolean {
  return !!origin && /^https:\/\/(www\.)?beringeu\.es$/i.test(origin);
}

/** Origen legible de una oportunidad a partir de lo que se sabe del clic. */
export function origenLegible(x: { gclid?: string | null; gbraid?: string | null; wbraid?: string | null; utm_source?: string | null; utm_medium?: string | null }): string {
  if (x.gclid || x.gbraid || x.wbraid) return "Google Ads";
  const src = (x.utm_source || "").toLowerCase();
  const med = (x.utm_medium || "").toLowerCase();
  if (src && /cpc|ppc|paid/.test(med)) return `Publicidad (${x.utm_source})`;
  if (src) return `Web · ${x.utm_source}`;
  return "Web (sin anuncio)";
}
