// Oportunidades que no llegan por email (llamadas y WhatsApp) y llamadas entrantes de VoIPstudio.
// Funciones puras: validación del formulario, teléfonos y lectura del webhook de VoIPstudio.
//
// Flujo: el portal guarda la entrada en Supabase → el script de Apps Script de la cuenta del comercial
// la recoge en su revisión (cada 5 min) y crea la oportunidad igual que con un email
// (código BEUQ/MMQ, Holded, fila en Solicitudes, Sheet de presupuesto y seguimientos).

export const CANALES_ENTRADA = ["Llamada", "WhatsApp", "Presencial / otro"] as const;
export type CanalEntrada = (typeof CANALES_ENTRADA)[number];

/** Comerciales que pueden registrar oportunidades. La marca la decide la cuenta (como con los emails). */
export const COMERCIALES: { email: string; nombre: string; marca: string }[] = [
  { email: "eduardo.z@beringeu.es", nombre: "Eduardo", marca: "Bering EU" },
  { email: "belen.diaz@beringeu.es", nombre: "Belén", marca: "Bering EU" },
  { email: "manolo.ruiz@muellemax.com", nombre: "Manolo", marca: "Muelle Max" },
];

export interface EntradaNueva {
  canal: CanalEntrada;
  registrado_por: string;
  empresa: string;
  contacto: string | null;
  email: string | null;
  telefono: string | null;
  nota: string;
  llamada_id: string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function texto(v: unknown, max: number): string {
  return String(v ?? "")
    .replace(/\r/g, "")
    .trim()
    .slice(0, max);
}

/** Valida lo que manda el formulario. Devuelve la entrada o el error para mostrar. */
export function validarEntrada(body: Record<string, unknown>): { ok: true; entrada: EntradaNueva } | { ok: false; error: string } {
  const canal = texto(body.canal, 40) as CanalEntrada;
  if (!CANALES_ENTRADA.includes(canal)) return { ok: false, error: "Elige el canal (llamada, WhatsApp…)." };
  const registrado = texto(body.registrado_por, 120).toLowerCase();
  if (!COMERCIALES.some((c) => c.email === registrado)) return { ok: false, error: "Elige quién lleva la oportunidad." };
  const empresa = texto(body.empresa, 150);
  if (empresa.length < 2) return { ok: false, error: "Falta la empresa (o el nombre del cliente si es un particular)." };
  const email = texto(body.email, 150).toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "El email no parece válido." };
  const telefono = texto(body.telefono, 40);
  if (telefono && digitos(telefono).length < 9) return { ok: false, error: "El teléfono no parece válido." };
  if (!email && !telefono) return { ok: false, error: "Pon al menos un email o un teléfono del cliente." };
  const nota = texto(body.nota, 20000);
  if (nota.length < 10) return { ok: false, error: "Describe qué pide el cliente (o pega el chat de WhatsApp)." };
  const llamada = texto(body.llamada_id, 40);
  return {
    ok: true,
    entrada: {
      canal,
      registrado_por: registrado,
      empresa,
      contacto: texto(body.contacto, 120) || null,
      email: email || null,
      telefono: telefono ? formatearTelefono(telefono) : null,
      nota,
      llamada_id: UUID.test(llamada) ? llamada : null,
    },
  };
}

export function digitos(s: string): string {
  return String(s || "").replace(/\D/g, "");
}

/** Clave para comparar teléfonos: los últimos 9 dígitos (sin prefijo +34 / 0034). */
export function claveTelefono(s: string | null | undefined): string {
  const d = digitos(String(s || ""));
  return d.length >= 9 ? d.slice(-9) : "";
}

/** +34 612 345 678 para números españoles; el resto, con + y tal cual. */
export function formatearTelefono(s: string): string {
  let d = digitos(s);
  if (d.startsWith("00")) d = d.slice(2);
  if (d.length === 9 && /^[6-9]/.test(d)) d = "34" + d;
  if (d.length === 11 && d.startsWith("34")) return `+34 ${d.slice(2, 5)} ${d.slice(5, 8)} ${d.slice(8)}`;
  return d ? "+" + d : String(s || "").trim();
}

// ── Webhook de VoIPstudio ──

export interface EventoLlamada {
  evento: string; // call.ended, call.missed…
  callId: string;
  numero: string; // quien llama (src)
  destino: string; // número/extensión que recibe (dst)
  duracion: number | null; // segundos
  perdida: boolean;
}

/**
 * Lee el cuerpo del webhook de VoIPstudio (campos call_id, event_name, state, src, dst, duration, connected_at…).
 * Acepta el objeto plano o dentro de "data"/"payload". Devuelve null si no es un evento de llamada.
 */
export function leerEventoVoip(raw: unknown): EventoLlamada | null {
  if (!raw || typeof raw !== "object") return null;
  let o = raw as Record<string, unknown>;
  for (const k of ["data", "payload", "call"]) {
    const dentro = o[k];
    if (dentro && typeof dentro === "object" && !Array.isArray(dentro) && ("src" in dentro || "call_id" in dentro)) {
      o = { ...o, ...(dentro as Record<string, unknown>) };
    }
  }
  const evento = String(o.event_name ?? o.event ?? o.type ?? "").toLowerCase();
  const callId = String(o.call_id ?? o.id ?? "").trim();
  if (!callId) return null;
  const estado = String(o.state ?? "").toLowerCase();
  const duracion = o.duration === undefined || o.duration === null || o.duration === "" ? null : Number(o.duration);
  const conectada = !!o.connected_at && String(o.connected_at) !== "0" && !/^0000/.test(String(o.connected_at));
  const perdida = /missed/.test(evento) || /missed|no.?answer|unanswered/.test(estado) || (/ended|hangup/.test(evento) && !conectada && !(Number(duracion) > 0));
  return {
    evento,
    callId,
    numero: String(o.src ?? o.from ?? o.caller ?? "").trim(),
    destino: String(o.dst ?? o.to ?? "").trim(),
    duracion: duracion !== null && isFinite(duracion) ? Math.round(duracion) : null,
    perdida,
  };
}

/**
 * ¿Hay que guardar esta llamada? Solo llamadas entrantes desde un número externo (las salientes salen de una
 * extensión corta) que han terminado o se han perdido, y no las muy cortas contestadas (equivocados, cortes).
 */
export function llamadaRelevante(ev: EventoLlamada, numerosPropios: string[], minSegundos: number): boolean {
  if (!/ended|missed|hangup|terminated/.test(ev.evento) && !ev.perdida) return false;
  const clave = claveTelefono(ev.numero);
  if (!clave) return false; // extensión interna, oculto o anónimo
  if (numerosPropios.map(claveTelefono).includes(clave)) return false;
  if (!ev.perdida && ev.duracion !== null && ev.duracion < minSegundos) return false;
  return true;
}

/** Comercial al que avisar: por el número/extensión de destino (VOIP_DESTINOS) o el de por defecto. */
export function comercialDeDestino(destino: string, mapa: Record<string, string>, porDefecto: string): string {
  const d = digitos(destino);
  for (const [k, email] of Object.entries(mapa)) {
    const kd = digitos(k);
    if (kd && d && (kd === d || (kd.length >= 9 && claveTelefono(kd) === claveTelefono(d)))) return email.toLowerCase();
  }
  return porDefecto.toLowerCase();
}

/** "VOIP_DESTINOS" de Vercel: JSON {"101":"belen.diaz@beringeu.es","+34 9xx…":"manolo.ruiz@muellemax.com"}. */
export function leerMapaDestinos(v: string | undefined): Record<string, string> {
  if (!v) return {};
  try {
    const o = JSON.parse(v);
    return o && typeof o === "object" ? Object.fromEntries(Object.entries(o).map(([k, x]) => [k, String(x)])) : {};
  } catch {
    return {};
  }
}
