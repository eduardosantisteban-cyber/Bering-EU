import { NextResponse } from "next/server";
import { resumirTerminos, type FilaAds, type FilaTermino } from "@/lib/marketing";

// Marketing: datos de Google Ads (cuenta "Bering") a través de Windsor.ai.
//  GET ?dias=90 → filas diarias por campaña (gasto, clics, impresiones, conversiones, presupuesto diario)
//                 de ese periodo y del anterior (para comparar), y los términos de búsqueda del periodo.
// Necesita WINDSOR_API_KEY en Vercel (Windsor.ai → Settings → API key). Se cachea 1 hora.

const API = "https://connectors.windsor.ai/google_ads";

async function windsor(key: string, fields: string[], desde: string, hasta: string): Promise<Record<string, unknown>[]> {
  const url = `${API}?api_key=${encodeURIComponent(key)}&date_from=${desde}&date_to=${hasta}&fields=${fields.join(",")}`;
  const res = await fetch(url, { next: { revalidate: 3600 } });
  const body = (await res.json().catch(() => null)) as { data?: Record<string, unknown>[]; error?: string; message?: string } | null;
  if (!res.ok || !body || !Array.isArray(body.data)) {
    throw new Error(`Windsor.ai ${res.status}: ${String(body?.error || body?.message || "respuesta no válida").slice(0, 200)}`);
  }
  return body.data;
}

const n = (v: unknown) => {
  const x = Number(v);
  return isFinite(x) ? x : 0;
};

export async function GET(req: Request) {
  const key = process.env.WINDSOR_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "Falta WINDSOR_API_KEY en Vercel (Settings → Environment Variables). La clave está en Windsor.ai → Settings → API key.", configuracion: true },
      { status: 500 }
    );
  }
  const dias = Math.min(730, Math.max(7, Number(new URL(req.url).searchParams.get("dias")) || 90));
  const hoy = new Date();
  const hasta = hoy.toISOString().slice(0, 10);
  const desde = new Date(hoy.getTime() - (dias - 1) * 86400000).toISOString().slice(0, 10);
  const desdeAnterior = new Date(hoy.getTime() - (2 * dias - 1) * 86400000).toISOString().slice(0, 10);
  try {
    const [diario, terminos] = await Promise.all([
      windsor(key, ["date", "campaign", "campaign_status", "spend", "clicks", "impressions", "conversions", "budget_amount"], desdeAnterior, hasta),
      windsor(key, ["search_term", "campaign", "spend", "clicks", "impressions", "conversions"], desde, hasta).catch(() => []),
    ]);
    const filas: FilaAds[] = diario
      .map((r) => ({
        fecha: String(r.date || "").slice(0, 10),
        campana: String(r.campaign || "—"),
        estado: String(r.campaign_status || ""),
        gasto: n(r.spend),
        clics: n(r.clicks),
        impresiones: n(r.impressions),
        conversiones: n(r.conversions),
        presupuesto: n(r.budget_amount),
      }))
      .filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.fecha));
    const terms: FilaTermino[] = (terminos as Record<string, unknown>[]).map((r) => ({
      termino: String(r.search_term || "").trim(),
      campana: String(r.campaign || ""),
      gasto: n(r.spend),
      clics: n(r.clicks),
      impresiones: n(r.impressions),
      conversiones: n(r.conversions),
    }));
    return NextResponse.json(
      { desde, hasta, desdeAnterior, dias, filas, terminos: resumirTerminos(terms), generado: new Date().toISOString() },
      { headers: { "Cache-Control": "private, max-age=300" } }
    );
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message || "No se pudieron leer los datos de Google Ads" }, { status: 502 });
  }
}
