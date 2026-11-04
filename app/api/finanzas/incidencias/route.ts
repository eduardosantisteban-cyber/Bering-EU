import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { accesoFinanzas, emailDeSesion, SESSION_COOKIE } from "@/lib/auth";

// Responder o cerrar un pendiente de la revisión del CFO desde el panel.
// PATCH { id, respuesta?: string, resuelto?: boolean } — solo FINANZAS_ACCESO.
// La respuesta queda guardada en fin_incidencias.respuesta para que el agente CFO la aplique en su siguiente revisión.

export async function PATCH(req: Request) {
  const cookie = (req.headers.get("cookie") || "").split(/;\s*/).find((c) => c.startsWith(SESSION_COOKIE + "="));
  const yo = emailDeSesion(cookie ? decodeURIComponent(cookie.slice(SESSION_COOKIE.length + 1)) : null);
  if (!accesoFinanzas(yo)) return NextResponse.json({ error: "Sin acceso a Finanzas" }, { status: 403 });

  let body: { id?: unknown; respuesta?: unknown; resuelto?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Petición no válida" }, { status: 400 });
  }
  const id = String(body.id || "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Pendiente no válido" }, { status: 400 });
  if (body.resuelto !== undefined && typeof body.resuelto !== "boolean") return NextResponse.json({ error: "Estado no válido" }, { status: 400 });
  if (body.respuesta !== undefined && typeof body.respuesta !== "string") return NextResponse.json({ error: "Respuesta no válida" }, { status: 400 });

  const cambios: Record<string, unknown> = {};
  const respuesta = typeof body.respuesta === "string" ? body.respuesta.trim().slice(0, 2000) : undefined;
  if (respuesta !== undefined) {
    cambios.respuesta = respuesta || null;
    cambios.respondido_por = respuesta ? yo : null;
    cambios.respondido_en = respuesta ? new Date().toISOString() : null;
  }
  if (typeof body.resuelto === "boolean") {
    cambios.resuelto = body.resuelto;
    cambios.resuelto_en = body.resuelto ? new Date().toISOString() : null;
  }
  if (!Object.keys(cambios).length) return NextResponse.json({ error: "Nada que guardar" }, { status: 400 });

  const { error } = await supabaseAdmin().from("fin_incidencias").update(cambios).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
