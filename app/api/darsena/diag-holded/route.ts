import { NextResponse } from "next/server";

// TEMPORAL (diagnóstico): qué campos usa Holded para la razón de pérdida de una oportunidad.
// Solo devuelve nombres de campos y los valores de estado/etapa/razón (sin datos del cliente). Se borrará.

export async function GET(req: Request) {
  const codigo = (new URL(req.url).searchParams.get("codigo") || "").toUpperCase();
  if (!/^[A-Z]{2,8}\d{1,7}$/.test(codigo)) return NextResponse.json({ error: "codigo" }, { status: 400 });
  const key = process.env.HOLDED_API_KEY;
  if (!key) return NextResponse.json({ error: "sin clave" }, { status: 500 });
  const h = { key, accept: "application/json" };
  const base = "https://api.holded.com/api/crm/v1";
  const leads = (await fetch(`${base}/leads`, { headers: h }).then((r) => r.json())) as Record<string, unknown>[];
  const re = new RegExp("^\\s*" + codigo + "(?!\\d)", "i");
  const lista = leads.filter((l) => re.test(String(l.name || "")));
  const resumen = (o: Record<string, unknown>) => {
    const out: Record<string, unknown> = { _claves: Object.keys(o) };
    for (const [k, v] of Object.entries(o)) {
      if (/status|stage|lost|reason|razon|motiv|won|close|funnel|custom/i.test(k)) out[k] = v;
    }
    return out;
  };
  const detalle = [];
  for (const l of lista) {
    const full = (await fetch(`${base}/leads/${l.id}`, { headers: h }).then((r) => r.json()).catch(() => ({}))) as Record<string, unknown>;
    detalle.push({ lista: resumen(l), detalle: resumen(full), events: JSON.stringify(full.events ?? l.events ?? null).slice(0, 3000) });
  }
  // Posibles listados de razones de pérdida
  const extra: Record<string, unknown> = {};
  for (const p of ["lostreasons", "lost-reasons", "leads/lostreasons", "reasons"]) {
    const r = await fetch(`${base}/${p}`, { headers: h }).catch(() => null);
    extra[p] = r ? `${r.status} ${(await r.text()).slice(0, 400)}` : "error";
  }
  const funnels = (await fetch(`${base}/funnels`, { headers: h }).then((r) => r.json()).catch(() => [])) as Record<string, unknown>[];
  extra.funnelKeys = funnels.map((f) => ({ name: f.name, keys: Object.keys(f), lost: Object.entries(f).filter(([k]) => /lost|reason/i.test(k)), preferences: JSON.stringify(f.preferences ?? null).slice(0, 2000), customFields: JSON.stringify(f.customFields ?? null).slice(0, 800) }));
  return NextResponse.json({ n: lista.length, detalle, extra });
}
