import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase/server";

// Cola para el script de Apps Script (no usa la sesión del portal: se protege con ENTRADAS_TOKEN).
//  GET ?usuario=email → reclama las entradas pendientes de ese comercial (las marca "procesando") y las
//                       llamadas nuevas sin avisar (las marca "avisada"), para que no las coja otra cuenta.
//  POST {id, ok, codigo, error} → resultado de crear la oportunidad.

const MIN_REINTENTO = 20; // una entrada "procesando" más de 20 min (el script se cortó) se vuelve a dar

function autorizado(req: Request): boolean {
  const esperado = (process.env.ENTRADAS_TOKEN || "").trim();
  const dado = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!esperado || !dado) return false;
  const a = Buffer.from(dado);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(req: Request) {
  if (!autorizado(req)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (new URL(req.url).searchParams.has("ping")) return NextResponse.json({ ok: true });
  const usuario = String(new URL(req.url).searchParams.get("usuario") || "").trim().toLowerCase();
  if (!/@/.test(usuario)) return NextResponse.json({ error: "Falta usuario" }, { status: 400 });
  const db = supabaseAdmin();
  const ahora = new Date().toISOString();
  const limite = new Date(Date.now() - MIN_REINTENTO * 60000).toISOString();

  // Un único UPDATE … WHERE estado = pendiente: si dos revisiones coinciden, solo una se la lleva
  const entradas = await db
    .from("entradas_oportunidad")
    .update({ estado: "procesando", reclamado: ahora })
    .eq("registrado_por", usuario)
    .or(`estado.eq.pendiente,and(estado.eq.procesando,reclamado.lt.${limite})`)
    .select("id, creado, canal, registrado_por, empresa, contacto, email, telefono, nota, llamada_id");
  if (entradas.error) return NextResponse.json({ error: entradas.error.message }, { status: 500 });

  const llamadas = await db
    .from("llamadas_entrantes")
    .update({ estado: "avisada" })
    .eq("comercial", usuario)
    .eq("estado", "nueva")
    .select("id, creado, numero, destino, duracion, perdida");
  if (llamadas.error) return NextResponse.json({ error: llamadas.error.message }, { status: 500 });

  return NextResponse.json({ entradas: entradas.data || [], llamadas: llamadas.data || [] });
}

export async function POST(req: Request) {
  if (!autorizado(req)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  let body: { id?: string; ok?: boolean; codigo?: string; error?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Petición no válida" }, { status: 400 });
  }
  const id = String(body.id || "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Entrada no válida" }, { status: 400 });
  const codigo = String(body.codigo || "").trim().slice(0, 20) || null;
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("entradas_oportunidad")
    .update(body.ok ? { estado: "creada", codigo, error: null } : { estado: "error", error: String(body.error || "Error").slice(0, 500) })
    .eq("id", id)
    .select("llamada_id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (body.ok && codigo && data?.llamada_id) await db.from("llamadas_entrantes").update({ codigo }).eq("id", data.llamada_id);
  return NextResponse.json({ ok: true });
}
