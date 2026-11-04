import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { accesoFinanzas, emailDeSesion, SESSION_COOKIE } from "@/lib/auth";

// Finanzas de gestión (tablas fin_documentos y fin_incidencias, las rellena el agente CFO cada mes).
// Datos sensibles: solo para quien ha entrado con Google y está en FINANZAS_ACCESO (por defecto, Eduardo).
// Con la contraseña compartida del equipo → 403.

function quienEs(req: Request): string | null {
  const cookie = (req.headers.get("cookie") || "").split(/;\s*/).find((c) => c.startsWith(SESSION_COOKIE + "="));
  return emailDeSesion(cookie ? decodeURIComponent(cookie.slice(SESSION_COOKIE.length + 1)) : null);
}

/**
 * Marcar un documento como cobrado/pagado (o deshacerlo) desde el panel.
 * PATCH { id, pagado: true | false | null } — solo FINANZAS_ACCESO. Deja constancia en «notas».
 */
export async function PATCH(req: Request) {
  const yo = quienEs(req);
  if (!accesoFinanzas(yo)) return NextResponse.json({ error: "Sin acceso a Finanzas" }, { status: 403 });
  let body: { id?: unknown; pagado?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Petición no válida" }, { status: 400 });
  }
  const id = String(body.id || "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Documento no válido" }, { status: 400 });
  if (!(body.pagado === true || body.pagado === false || body.pagado === null)) {
    return NextResponse.json({ error: "Estado no válido" }, { status: 400 });
  }
  const db = supabaseAdmin();
  const { data: actual, error: e1 } = await db.from("fin_documentos").select("notas").eq("id", id).single();
  if (e1 || !actual) return NextResponse.json({ error: e1?.message || "No encontrado" }, { status: 404 });
  const marca = `${body.pagado === true ? "Marcado cobrado/pagado" : body.pagado === false ? "Marcado pendiente" : "Marcado sin comprobar"} en el panel por ${yo} el ${new Date().toISOString().slice(0, 10)}.`;
  const notas = [String((actual as { notas: string | null }).notas || "").trim(), marca].filter(Boolean).join(" ").slice(-2000);
  const { error } = await db.from("fin_documentos").update({ pagado: body.pagado, notas, actualizado: new Date().toISOString() }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function GET(req: Request) {
  const yo = quienEs(req);
  if (!accesoFinanzas(yo)) {
    return NextResponse.json({ error: "Sin acceso a Finanzas", email: yo }, { status: 403, headers: { "Cache-Control": "no-store" } });
  }

  const db = supabaseAdmin();
  const [docs, incs] = await Promise.all([
    db.from("fin_documentos")
      .select("id,sociedad,tipo,categoria,contraparte,numero,fecha,mes,base,iva,total,moneda,isp,ticket,beuq,hito,vencimiento,pagado,drive_id,notas")
      .order("fecha", { ascending: false })
      .limit(5000),
    db.from("fin_incidencias")
      .select("id,creado,mes,tipo,descripcion,beuq,importe,drive_id,resuelto")
      .order("creado", { ascending: false })
      .limit(1000),
  ]);
  const error = docs.error || incs.error;
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: { "Cache-Control": "no-store" } });

  // numeric llega como texto desde PostgREST: a número
  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return NextResponse.json(
    {
      documentos: (docs.data || []).map((d: Record<string, unknown>) => ({ ...d, base: num(d.base), iva: num(d.iva), total: num(d.total) })),
      incidencias: (incs.data || []).map((i: Record<string, unknown>) => ({ ...i, importe: num(i.importe) })),
      generado: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
