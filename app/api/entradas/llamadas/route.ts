import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

// Descartar una llamada entrante (no es una oportunidad: proveedor, equivocado, comercial…) o volver a mostrarla.

export async function POST(req: Request) {
  let body: { id?: string; accion?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Petición no válida" }, { status: 400 });
  }
  const id = String(body.id || "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Llamada no válida" }, { status: 400 });
  const estado = body.accion === "descartar" ? "descartada" : body.accion === "reabrir" ? "nueva" : "";
  if (!estado) return NextResponse.json({ error: "Acción desconocida" }, { status: 400 });
  const { error } = await supabaseAdmin().from("llamadas_entrantes").update({ estado }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
