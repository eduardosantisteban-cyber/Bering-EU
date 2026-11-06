import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { origenPermitido, validarWebRef } from "@/lib/webRef";

// Endpoint PÚBLICO (sin sesión, ver proxy.ts): lo llama el script de GTM de beringeu.es cuando alguien pulsa
// WhatsApp o email, con el código «W-XXXXXX» que va en el mensaje y el clic del anuncio (gclid…).
// Solo acepta peticiones desde https://beringeu.es (cabecera Origin). Se envía con navigator.sendBeacon
// como text/plain para no necesitar preflight; también responde a OPTIONS por si acaso.

function cors(origin: string | null): Record<string, string> {
  return origenPermitido(origin)
    ? {
        "Access-Control-Allow-Origin": origin as string,
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "86400",
        Vary: "Origin",
      }
    : { Vary: "Origin" };
}

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: cors(req.headers.get("origin")) });
}

export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  const headers = cors(origin);
  if (!origenPermitido(origin)) return NextResponse.json({ error: "Origen no permitido" }, { status: 403, headers });

  const texto = await req.text();
  if (texto.length > 4000) return NextResponse.json({ error: "Demasiado grande" }, { status: 413, headers });
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(texto);
  } catch {
    return NextResponse.json({ error: "Petición no válida" }, { status: 400, headers });
  }
  const v = validarWebRef(body);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400, headers });

  try {
    const db = supabaseAdmin();
    // La misma ref puede llegar varias veces (varios clics): se conservan los datos que ya había
    // y solo se rellenan los que faltaban. Nunca se toca la vinculación con la oportunidad.
    const { data: previa } = await db.from("web_refs").select("*").eq("ref", v.ref.ref).maybeSingle();
    if (!previa) {
      const { error } = await db.from("web_refs").insert(v.ref);
      if (error) throw error;
    } else {
      const cambios: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v.ref)) {
        if (val !== null && (previa as Record<string, unknown>)[k] == null) cambios[k] = val;
      }
      if (Object.keys(cambios).length) {
        cambios.actualizado = new Date().toISOString();
        const { error } = await db.from("web_refs").update(cambios).eq("ref", v.ref.ref);
        if (error) throw error;
      }
    }
    return NextResponse.json({ ok: true }, { headers });
  } catch (err) {
    console.error("web-ref", err);
    return NextResponse.json({ error: "No se pudo guardar" }, { status: 500, headers });
  }
}
