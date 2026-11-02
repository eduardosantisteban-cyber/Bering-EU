import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { emailDeSesion, SESSION_COOKIE } from "@/lib/auth";

// Tareas de "Hoy" marcadas como hechas (tabla tareas_hechas, compartida por el equipo).
//  GET  → { claves: [...] } de los últimos 120 días
//  POST { clave, hecho: true|false, por? } → marcar o deshacer

export async function GET() {
  const desde = new Date(Date.now() - 120 * 86400000).toISOString();
  const { data, error } = await supabaseAdmin().from("tareas_hechas").select("clave").gte("hecho", desde).limit(5000);
  if (error) return NextResponse.json({ error: error.message, claves: [] }, { status: 500 });
  return NextResponse.json({ claves: (data || []).map((r: { clave: string }) => r.clave) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  let body: { clave?: string; hecho?: boolean; por?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Petición no válida" }, { status: 400 });
  }
  const clave = String(body.clave || "").slice(0, 200);
  if (!/^[a-z]+-[\w.@-]+\|[a-z0-9]+$/i.test(clave)) return NextResponse.json({ error: "Tarea no válida" }, { status: 400 });
  const db = supabaseAdmin();
  const cookie = (req.headers.get("cookie") || "").split(/;\s*/).find((c) => c.startsWith(SESSION_COOKIE + "="));
  const yo = emailDeSesion(cookie ? decodeURIComponent(cookie.slice(SESSION_COOKIE.length + 1)) : null);
  if (yo) body.por = yo;
  const { error } = body.hecho === false
    ? await db.from("tareas_hechas").delete().eq("clave", clave)
    : await db.from("tareas_hechas").upsert({ clave, hecho_por: String(body.por || "").slice(0, 120) || null, hecho: new Date().toISOString() });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
