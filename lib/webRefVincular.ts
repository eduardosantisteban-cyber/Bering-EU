import { supabaseAdmin } from "@/lib/supabase/server";
import { escribirRango, leerRangos, serviceAccountEmail } from "@/lib/googleSheets";
import { marketingSheetId, solicitudesSheetId } from "@/lib/portalConfig";
import { extraerGclidTexto, extraerRef, normalizarRef, origenLegible } from "@/lib/webRef";

// Vincular el origen web de una oportunidad (gclid del formulario o código «Ref. W-XXXXXX» de WhatsApp/email)
// y pasar el clic del anuncio a la pestaña GCLID de la hoja de marketing, de donde sale la subida de
// «Presupuesto enviado» y «Pedido ganado» a Google Ads. Lo usan la ficha de la oportunidad y la revisión
// automática cada hora (vincularPendientes). Idempotente.

const HOJA = "GCLID";

function fechaHoja(d: Date): string {
  const p = new Intl.DateTimeFormat("es-ES", {
    timeZone: "Europe/Madrid",
    day: "numeric",
    month: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const v = (t: string) => p.find((x) => x.type === t)?.value || "";
  return `${v("day")}/${v("month")}/${v("year")} ${v("hour")}:${v("minute")}:${v("second")}`;
}

export type Hoja = "ya estaba" | "añadido" | "actualizado" | "sin permiso" | "error" | "sin gclid";

async function pasarAHoja(codigo: string, email: string, gclid: string, fecha: string | null, asunto: string): Promise<{ hoja: Hoja; detalle?: string }> {
  const id = marketingSheetId();
  try {
    const [filas] = await leerRangos(id, [`${HOJA}!A2:C`]);
    const i = filas.findIndex((r) => String(r?.[0] ?? "").trim().toUpperCase() === codigo);
    if (i >= 0 && String(filas[i]?.[2] ?? "").trim() === gclid) return { hoja: "ya estaba" };
    if (i >= 0) {
      await escribirRango(id, `${HOJA}!C${i + 2}`, [[gclid]]);
      return { hoja: "actualizado" };
    }
    const fila = filas.length + 2;
    const f = fecha ? new Date(fecha) : null;
    await escribirRango(id, `${HOJA}!A${fila}:F${fila}`, [
      [codigo, email, gclid, f && !isNaN(f.getTime()) ? fechaHoja(f) : "", asunto.slice(0, 250), fechaHoja(new Date())],
    ]);
    return { hoja: "añadido" };
  } catch (err) {
    const m = (err as Error).message;
    if (/\(403\)|PERMISSION|permission/i.test(m)) {
      return { hoja: "sin permiso", detalle: `comparte la hoja de marketing como Editor con ${serviceAccountEmail() || "la cuenta de servicio"}` };
    }
    console.error("web-ref hoja", m);
    return { hoja: "error", detalle: m.slice(0, 200) };
  }
}


export interface EntradaVincular {
  codigo: string;
  email?: string;
  fecha?: string | null;
  asunto?: string;
  texto?: string;
  ref?: string | null; // código escrito a mano
}

export interface ResultadoVincular {
  ref: string | null;
  aviso: string;
  via: string | null;
  origen: string | null;
  clicAnuncio: boolean;
  campana: string | null;
  termino: string | null;
  landing: string | null;
  pagina: string | null;
  fechaClic: string | null;
  hoja: Hoja;
  hojaDetalle: string | null;
}

export class ErrorEntrada extends Error {}

export async function vincularOportunidad(e: EntradaVincular): Promise<ResultadoVincular> {
  const codigo = String(e.codigo || "").trim().toUpperCase();
  if (!/^[A-Z]{2,8}\d{1,7}$/.test(codigo)) throw new ErrorEntrada("Código de oportunidad no válido");
  const asunto = String(e.asunto || "").slice(0, 2000);
  const texto = `${asunto}\n${String(e.texto || "").slice(0, 20000)}`;
  const email = String(e.email || "").trim().slice(0, 200);
  const fecha = e.fecha ? String(e.fecha) : null;
  const manual = e.ref !== undefined && e.ref !== null && e.ref !== "";
  const ref = manual ? normalizarRef(e.ref) : extraerRef(texto);
  if (manual && !ref) throw new ErrorEntrada("El código debe tener la forma W-XXXXXX");

  const db = supabaseAdmin();
  let fila: Record<string, string | null> | null = null;
  let aviso = "";

  if (ref) {
    const { data, error } = await db.from("web_refs").select("*").eq("ref", ref).maybeSingle();
    if (error) throw error;
    fila = data as Record<string, string | null> | null;
    if (!fila) {
      aviso = `No hay ningún clic registrado con ${ref}.`;
    } else if (fila.oportunidad && fila.oportunidad !== codigo) {
      aviso = `${ref} ya está vinculada a ${fila.oportunidad}.`;
      fila = null;
    } else if (!fila.oportunidad) {
      const { error: e2 } = await db
        .from("web_refs")
        .update({ oportunidad: codigo, vinculado: new Date().toISOString() })
        .eq("ref", ref)
        .is("oportunidad", null);
      if (e2) throw e2;
      fila.oportunidad = codigo;
    }
  } else {
    // Sin código en el texto: ¿hay alguna ref ya vinculada a mano a esta oportunidad?
    const { data } = await db.from("web_refs").select("*").eq("oportunidad", codigo).order("vinculado", { ascending: false }).limit(1);
    fila = (data && (data[0] as Record<string, string | null>)) || null;
  }

  const gclidForm = extraerGclidTexto(texto);
  const gclid = fila?.gclid || gclidForm || null;
  let hoja: { hoja: Hoja; detalle?: string } = { hoja: "sin gclid" };
  if (gclid) {
    hoja = await pasarAHoja(codigo, email, gclid, fecha, asunto);
    if (fila && (hoja.hoja === "añadido" || hoja.hoja === "actualizado" || hoja.hoja === "ya estaba")) {
      await db.from("web_refs").update({ enviado_hoja: new Date().toISOString() }).eq("ref", fila.ref as string);
    }
  }

  return {
    ref: fila?.ref || ref || null,
    aviso,
    via: fila ? (fila.canal === "email" ? "Email" : "WhatsApp") : gclidForm ? "Formulario" : null,
    origen: fila ? origenLegible(fila) : gclidForm ? "Google Ads" : null,
    clicAnuncio: !!(fila?.gclid || fila?.gbraid || fila?.wbraid || gclidForm),
    campana: fila?.utm_campaign || null,
    termino: fila?.utm_term || null,
    landing: fila?.landing || null,
    pagina: fila?.pagina || null,
    fechaClic: fila?.creado || null,
    hoja: hoja.hoja,
    hojaDetalle: hoja.detalle || null,
  };
}

const DIAS = 90; // Google Ads no acepta clics de más de 90 días

/**
 * Revisión automática: busca en la hoja Solicitudes (asunto y resumen) y en las notas de las entradas
 * de WhatsApp/llamada los códigos W-XXXXXX que aún no están vinculados, los vincula y pasa el clic a la hoja
 * de marketing. Reintenta también los vinculados cuyo clic no llegó a la hoja (p. ej. sin permiso).
 */
export async function vincularPendientes(): Promise<{ pendientes: number; vinculadas: string[]; errores: string[] }> {
  const db = supabaseAdmin();
  const desde = new Date(Date.now() - DIAS * 864e5).toISOString();
  const [{ data: sueltas, error: e1 }, { data: sinHoja, error: e2 }] = await Promise.all([
    db.from("web_refs").select("ref").is("oportunidad", null).gte("creado", desde),
    db.from("web_refs").select("ref, oportunidad").not("oportunidad", "is", null).not("gclid", "is", null).is("enviado_hoja", null).gte("creado", desde),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;
  const pendientes = new Set((sueltas || []).map((r) => r.ref as string));
  const reintentos = (sinHoja || []) as { ref: string; oportunidad: string }[];
  const vinculadas: string[] = [];
  const errores: string[] = [];
  if (!pendientes.size && !reintentos.length) return { pendientes: 0, vinculadas, errores };

  // Hoja Solicitudes: A fecha · B Nº oportunidad · E email · I resumen · K asunto
  const [filas] = await leerRangos(solicitudesSheetId(), ["Solicitudes!A2:K"]);
  const porCodigo = new Map<string, { email: string; fecha: string; asunto: string; texto: string }>();
  for (const f of filas) {
    const codigo = String(f?.[1] ?? "").trim().toUpperCase();
    if (!codigo) continue;
    porCodigo.set(codigo, { email: String(f?.[4] ?? ""), fecha: String(f?.[0] ?? ""), asunto: String(f?.[10] ?? ""), texto: String(f?.[8] ?? "") });
  }
  const { data: entradas } = await db.from("entradas_oportunidad").select("codigo, nota").not("codigo", "is", null).gte("creado", desde);
  for (const en of entradas || []) {
    const c = String(en.codigo || "").toUpperCase();
    const o = porCodigo.get(c) || { email: "", fecha: "", asunto: "", texto: "" };
    o.texto += `\n${en.nota || ""}`;
    porCodigo.set(c, o);
  }

  for (const [codigo, o] of porCodigo) {
    const ref = extraerRef(`${o.asunto}\n${o.texto}`);
    if (!ref || !pendientes.has(ref)) continue;
    try {
      const r = await vincularOportunidad({ codigo, email: o.email, asunto: o.asunto, texto: o.texto, ref });
      if (!r.aviso) vinculadas.push(`${ref}→${codigo}`);
      else errores.push(r.aviso);
    } catch (err) {
      errores.push(`${ref}: ${(err as Error).message}`);
    }
  }
  for (const r of reintentos) {
    const o = porCodigo.get(r.oportunidad) || { email: "", fecha: "", asunto: "", texto: "" };
    try {
      const res = await vincularOportunidad({ codigo: r.oportunidad, email: o.email, asunto: o.asunto, ref: r.ref });
      if (res.hoja === "sin permiso" || res.hoja === "error") errores.push(`${r.ref}: ${res.hojaDetalle}`);
    } catch (err) {
      errores.push(`${r.ref}: ${(err as Error).message}`);
    }
  }
  return { pendientes: pendientes.size + reintentos.length, vinculadas, errores };
}

/** Lanza la revisión como mucho una vez por hora (marca en la tabla tareas; seguro entre instancias). */
export async function vincularPendientesSiToca(): Promise<void> {
  const db = supabaseAdmin();
  const ahora = new Date();
  const limite = new Date(ahora.getTime() - 55 * 60000).toISOString();
  await db.from("tareas").upsert({ nombre: "web_refs", ultima: "1970-01-01T00:00:00Z" }, { onConflict: "nombre", ignoreDuplicates: true });
  const { data } = await db.from("tareas").update({ ultima: ahora.toISOString() }).eq("nombre", "web_refs").lt("ultima", limite).select("nombre");
  if (!data || !data.length) return; // otra petición ya la ha hecho en la última hora
  try {
    const r = await vincularPendientes();
    await db.from("tareas").update({ resultado: r }).eq("nombre", "web_refs");
  } catch (err) {
    console.error("vincularPendientes", err);
    await db.from("tareas").update({ resultado: { error: (err as Error).message } }).eq("nombre", "web_refs");
  }
}
