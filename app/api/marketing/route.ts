import { NextResponse } from "next/server";
import { campanasPorGclid, resumirTerminos, type FilaAds, type FilaTermino } from "@/lib/marketing";
import { leerRangoOpcional, serviceAccountEmail } from "@/lib/googleSheets";
import { fechaDeCelda } from "@/lib/solicitudes";

// Marketing: datos de Google Ads (cuenta "Bering") a través de Windsor.ai.
//  GET ?dias=90 → filas diarias por campaña (gasto, clics, impresiones, conversiones, presupuesto diario)
//                 de ese periodo y del anterior (para comparar), y los términos de búsqueda del periodo.
// Necesita WINDSOR_API_KEY en Vercel (Windsor.ai → Settings → API key). Se cachea 1 hora.
// Importes en la moneda de la cuenta (la de Bering se gestiona desde México: MXN) + tipo de cambio a EUR del BCE.

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

/** Euros por unidad de la moneda de la cuenta (tipo del BCE vía frankfurter.app, cacheado 1 día). */
async function tipoCambioEur(moneda: string): Promise<{ eur: number; fecha: string } | null> {
  if (moneda === "EUR") return { eur: 1, fecha: "" };
  try {
    const res = await fetch(`https://api.frankfurter.app/latest?from=${encodeURIComponent(moneda)}&to=EUR`, { next: { revalidate: 86400 } });
    const b = (await res.json()) as { rates?: { EUR?: number }; date?: string };
    return b.rates?.EUR ? { eur: b.rates.EUR, fecha: String(b.date || "") } : null;
  } catch {
    return null;
  }
}

// Hoja «Bering EU – Marketing (automatizaciones)»: su pestaña GCLID guarda el clic de Google de cada oportunidad
// que llega por el formulario web. La cuenta de servicio de Dársena necesita acceso de lector.
const HOJA_MARKETING = process.env.MARKETING_SHEET_ID || "1yQKPhKQx9o2t06n4mUyQdCoPbS5SwOhOIGf2H49KBvI";

/** código → campaña del clic, para las oportunidades con GCLID (los clics de Google Ads se guardan 90 días). */
async function clicsDeOportunidades(key: string, hasta: string): Promise<{ porGclid: Record<string, string>; aviso: string }> {
  let filas: unknown[][];
  try {
    filas = await leerRangoOpcional(HOJA_MARKETING, "GCLID!A2:D");
  } catch (e) {
    const sa = serviceAccountEmail();
    return {
      porGclid: {},
      aviso: /403|permission|PERMISSION/i.test((e as Error).message)
        ? `Para confirmar las oportunidades con el clic de Google, comparte la hoja «Bering EU – Marketing (automatizaciones)» como Lector con ${sa || "la cuenta de servicio de Dársena"}.`
        : "No se pudo leer la pestaña GCLID: " + (e as Error).message.slice(0, 120),
    };
  }
  const registros = filas
    .map((r) => ({ codigo: String(r?.[0] ?? "").trim().toUpperCase(), gclid: String(r?.[2] ?? "").trim(), fecha: fechaDeCelda(r?.[3]) }))
    .filter((r) => r.codigo && r.gclid && !/sin gclid/i.test(r.gclid));
  if (!registros.length) return { porGclid: {}, aviso: "" };
  const limite = new Date(new Date(hasta + "T12:00:00Z").getTime() - 89 * 86400000);
  const primera = registros.reduce((m, r) => (r.fecha && r.fecha < m ? r.fecha : m), new Date(hasta + "T12:00:00Z"));
  const desde = new Date(Math.max(limite.getTime(), primera.getTime() - 30 * 86400000)).toISOString().slice(0, 10);
  const clics = await windsor(key, ["date", "gclid", "campaign"], desde, hasta).catch(() => [] as Record<string, unknown>[]);
  return {
    porGclid: campanasPorGclid(registros, clics.map((c) => ({ gclid: String(c.gclid || ""), campana: String(c.campaign || "") }))),
    aviso: "",
  };
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
    const [diario, terminos, monedaRows, accionesRows, gclids] = await Promise.all([
      windsor(key, ["date", "campaign", "campaign_status", "spend", "clicks", "impressions", "conversions", "budget_amount"], desdeAnterior, hasta),
      windsor(key, ["search_term", "campaign", "spend", "clicks", "impressions", "conversions"], desde, hasta).catch(() => []),
      windsor(key, ["account_currency_code", "spend"], desde, hasta).catch(() => []),
      windsor(key, ["campaign", "conversion_action_name", "conversions"], desde, hasta).catch(() => []),
      clicsDeOportunidades(key, hasta).catch((e: Error) => ({ porGclid: {} as Record<string, string>, aviso: e.message.slice(0, 160) })),
    ]);
    // Qué cuenta Google como conversión (clic en WhatsApp, en llamar, formulario…), sumado en el periodo
    const accionesMapa = new Map<string, number>();
    for (const r of accionesRows as Record<string, unknown>[]) {
      const a = String(r.conversion_action_name || "").trim();
      if (a) accionesMapa.set(a, (accionesMapa.get(a) || 0) + n(r.conversions));
    }
    const acciones = [...accionesMapa.entries()].map(([accion, conversiones]) => ({ accion, conversiones })).filter((x) => x.conversiones > 0).sort((a, b) => b.conversiones - a.conversiones);
    const moneda = String((monedaRows as Record<string, unknown>[])[0]?.account_currency_code || process.env.MARKETING_MONEDA || "MXN").toUpperCase();
    const cambio = await tipoCambioEur(moneda);
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
      { desde, hasta, desdeAnterior, dias, moneda, cambio, filas, terminos: resumirTerminos(terms), acciones, porGclid: gclids.porGclid, avisoGclid: gclids.aviso, generado: new Date().toISOString() },
      { headers: { "Cache-Control": "private, max-age=300" } }
    );
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message || "No se pudieron leer los datos de Google Ads" }, { status: 502 });
  }
}
