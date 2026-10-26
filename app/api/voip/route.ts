import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase/server";
import { destinatariosDeDestino, formatearTelefono, claveTelefono, leerEventoVoip, leerMapaDestinos, llamadaRelevante } from "@/lib/entradas";
import { telefonosDeContactos } from "@/lib/holdedCrm";

// Webhook de VoIPstudio (Integraciones → Webhooks): https://bering-eu.vercel.app/api/voip?token=…
// Guarda las llamadas entrantes de números externos. Si el número no es de un cliente de Holded,
// queda "nueva" y el script avisa por email al comercial con el enlace para registrar la oportunidad.
// Ruta pública (VoIPstudio no tiene la sesión del portal): se protege con VOIP_WEBHOOK_TOKEN.

function tokenValido(dado: string | null): boolean {
  const esperado = (process.env.VOIP_WEBHOOK_TOKEN || "").trim();
  if (!esperado || !dado) return false;
  const a = Buffer.from(dado);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  const url = new URL(req.url);
  if (!tokenValido(url.searchParams.get("token"))) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  let raw: unknown;
  try {
    const txt = await req.text();
    raw = txt ? JSON.parse(txt) : {};
  } catch {
    return NextResponse.json({ ok: true, ignorado: "cuerpo no JSON" });
  }
  // VoIPstudio puede mandar un evento o una lista
  const eventos = (Array.isArray(raw) ? raw : [raw]).map(leerEventoVoip).filter((e) => e !== null);
  const propios = (process.env.VOIP_NUMEROS_PROPIOS || "").split(/[,;]/).map((s) => s.trim()).filter(Boolean);
  const minSeg = Number(process.env.VOIP_MIN_SEGUNDOS || 15) || 15;
  const relevantes = eventos.filter((e) => llamadaRelevante(e, propios, minSeg));
  if (!relevantes.length) return NextResponse.json({ ok: true, guardadas: 0 });

  let clientes: Record<string, string> = {};
  const key = (process.env.HOLDED_API_KEY || "").trim();
  if (key) {
    try {
      clientes = await telefonosDeContactos(key);
    } catch {
      /* si Holded falla, se avisa igualmente */
    }
  }
  const mapa = leerMapaDestinos(process.env.VOIP_DESTINOS);
  const porDefecto = process.env.VOIP_COMERCIAL || "eduardo.z@beringeu.es";

  const filas = relevantes.map((e) => {
    const cliente = clientes[claveTelefono(e.numero)] || null;
    return {
      call_id: e.callId,
      numero: formatearTelefono(e.numero),
      destino: e.destino || null,
      duracion: e.duracion,
      perdida: e.perdida,
      comercial: destinatariosDeDestino(e.destino, mapa, porDefecto)[0],
      cliente,
      estado: cliente ? "cliente" : "nueva",
    };
  });
  // La misma llamada puede llegar como "perdida" y "terminada": se queda la primera
  const { error } = await supabaseAdmin().from("llamadas_entrantes").upsert(filas, { onConflict: "call_id", ignoreDuplicates: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, guardadas: filas.length });
}

// Para comprobar la dirección desde el navegador (VoIPstudio exige que responda por HTTPS)
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (!tokenValido(url.searchParams.get("token"))) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  return NextResponse.json({ ok: true, mensaje: "Webhook de VoIPstudio listo" });
}
