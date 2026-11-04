import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { accesoFinanzas, emailDeSesion, SESSION_COOKIE } from "@/lib/auth";

// Finanzas de gestión (tablas fin_documentos y fin_incidencias, las rellena el agente CFO cada mes).
// Datos sensibles: solo para quien ha entrado con Google y está en FINANZAS_ACCESO (por defecto, Eduardo).
// Con la contraseña compartida del equipo → 403.

export async function GET(req: Request) {
  const cookie = (req.headers.get("cookie") || "").split(/;\s*/).find((c) => c.startsWith(SESSION_COOKIE + "="));
  const yo = emailDeSesion(cookie ? decodeURIComponent(cookie.slice(SESSION_COOKIE.length + 1)) : null);
  if (!accesoFinanzas(yo)) {
    return NextResponse.json({ error: "Sin acceso a Finanzas" }, { status: 403, headers: { "Cache-Control": "no-store" } });
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
