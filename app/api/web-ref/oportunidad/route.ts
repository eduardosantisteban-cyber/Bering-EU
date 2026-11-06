import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { escribirRango, leerRangos, serviceAccountEmail } from "@/lib/googleSheets";
import { marketingSheetId } from "@/lib/portalConfig";
import { extraerGclidTexto, extraerRef, normalizarRef, origenLegible } from "@/lib/webRef";

// Origen web de una oportunidad (con sesión del portal).
// Busca el código «W-XXXXXX» en el asunto y el resumen (o el que escriba el usuario), lo vincula a la
// oportunidad y, si el clic venía de un anuncio, deja el gclid en la pestaña GCLID de la hoja de marketing
// para que la automatización suba a Google Ads «Presupuesto enviado» y «Pedido ganado» con su importe.
// Idempotente: abrir la ficha varias veces no duplica nada.

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

type Hoja = "ya estaba" | "añadido" | "actualizado" | "sin permiso" | "error" | "sin gclid";

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

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Petición no válida" }, { status: 400 });
  }
  const codigo = String(body.codigo || "").trim().toUpperCase();
  if (!/^[A-Z]{2,8}\d{1,7}$/.test(codigo)) return NextResponse.json({ error: "Código de oportunidad no válido" }, { status: 400 });
  const asunto = String(body.asunto || "").slice(0, 2000);
  const texto = `${asunto}\n${String(body.texto || "").slice(0, 20000)}`;
  const email = String(body.email || "").trim().slice(0, 200);
  const fecha = body.fecha ? String(body.fecha) : null;
  const manual = body.ref !== undefined && body.ref !== null && body.ref !== "";
  const ref = manual ? normalizarRef(body.ref) : extraerRef(texto);
  if (manual && !ref) return NextResponse.json({ error: "El código debe tener la forma W-XXXXXX" }, { status: 400 });

  try {
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

    return NextResponse.json({
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
    });
  } catch (err) {
    console.error("web-ref oportunidad", err);
    return NextResponse.json({ error: (err as Error).message || "Error" }, { status: 500 });
  }
}
