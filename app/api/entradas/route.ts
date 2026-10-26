import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { perdidasDuplicadas, validarEntrada, type LlamadaGuardada } from "@/lib/entradas";

// Oportunidades registradas a mano en el portal (llamadas, WhatsApp…) y llamadas entrantes pendientes.
//  GET  → últimas entradas (con su estado y código) + llamadas por registrar
//  POST → nueva entrada; el script de Apps Script de quien la lleva la crea en Holded en su siguiente revisión

const faltaTabla = (m: string) =>
  /relation .* does not exist|Could not find the table/i.test(m)
    ? "Faltan las tablas en Supabase: ejecuta supabase/migrations/0003_entradas_portal.sql en el SQL Editor."
    : m;

export async function GET() {
  try {
    const db = supabaseAdmin();
    const hace14 = new Date(Date.now() - 14 * 86400000).toISOString();
    const [entradas, llamadas] = await Promise.all([
      db
        .from("entradas_oportunidad")
        .select("id, creado, canal, registrado_por, empresa, contacto, email, telefono, estado, codigo, error")
        .order("creado", { ascending: false })
        .limit(15),
      db
        .from("llamadas_entrantes")
        .select("id, creado, numero, destino, duracion, perdida, comercial, cliente, estado, codigo")
        .in("estado", ["nueva", "avisada", "cliente"])
        .gte("creado", hace14)
        .order("creado", { ascending: false })
        .limit(40),
    ]);
    if (entradas.error) throw new Error(entradas.error.message);
    if (llamadas.error) throw new Error(llamadas.error.message);
    const lista = (llamadas.data || []) as (LlamadaGuardada & Record<string, unknown>)[];
    const dup = new Set(perdidasDuplicadas(lista));
    return NextResponse.json({ entradas: entradas.data || [], llamadas: lista.filter((l) => !dup.has(l.id)) });
  } catch (err) {
    return NextResponse.json({ error: faltaTabla((err as Error).message) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Petición no válida" }, { status: 400 });
  }
  const v = validarEntrada(body);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
  try {
    const db = supabaseAdmin();
    const { data, error } = await db.from("entradas_oportunidad").insert(v.entrada).select("id").single();
    if (error) throw new Error(error.message);
    if (v.entrada.llamada_id) {
      await db.from("llamadas_entrantes").update({ estado: "registrada" }).eq("id", v.entrada.llamada_id);
    }
    return NextResponse.json({ ok: true, id: data?.id });
  } catch (err) {
    return NextResponse.json({ error: faltaTabla((err as Error).message) }, { status: 500 });
  }
}
