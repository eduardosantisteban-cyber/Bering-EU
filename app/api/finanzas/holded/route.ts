import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { accesoFinanzas, emailDeSesion, SESSION_COOKIE } from "@/lib/auth";

// Estado de cobro/pago desde Holded (los bancos están conectados y conciliados allí).
// POST → lee las facturas de venta (invoice) y de compra (purchase) de 2026 en Holded, las cruza con
// fin_documentos por número y total, y actualiza «pagado»:
//   · Holded dice pagada            → pagado = true
//   · Holded dice pendiente/parcial → pagado = false, solo si estaba sin comprobar (no pisa un «pagado» marcado a mano)
// Devuelve un resumen, incluidas las facturas de Holded que no están en el panel.

const BASE = "https://api.holded.com/api/invoicing/v1";

interface DocHolded {
  id?: string;
  docNumber?: string;
  contactName?: string;
  date?: number;
  dueDate?: number;
  total?: number;
  status?: number | string;
  paymentsPending?: number;
  paymentsTotal?: number;
}

const norm = (s: unknown) => String(s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

/** true = pagada · false = pendiente o parcial · null = no se sabe (borrador, anulada…) */
function estadoHolded(d: DocHolded): boolean | null {
  const total = Number(d.total ?? 0);
  if (typeof d.paymentsPending === "number" && total > 0) return d.paymentsPending <= 0.01;
  if (d.status === 1 || d.status === "paid") return true;
  if (d.status === 0 || d.status === 2 || d.status === "unpaid" || d.status === "partially_paid") return false;
  return null;
}

async function leer(tipo: "invoice" | "purchase", key: string, desde: number, hasta: number): Promise<DocHolded[]> {
  const url = `${BASE}/documents/${tipo}?starttmp=${desde}&endtmp=${hasta}&sort=created-asc`;
  const r = await fetch(url, { headers: { key, accept: "application/json" }, cache: "no-store" });
  if (!r.ok) throw new Error(`Holded ${tipo}: ${r.status} ${(await r.text()).slice(0, 200)}`);
  const b = await r.json();
  return Array.isArray(b) ? (b as DocHolded[]) : [];
}

export async function POST(req: Request) {
  const cookie = (req.headers.get("cookie") || "").split(/;\s*/).find((c) => c.startsWith(SESSION_COOKIE + "="));
  const yo = emailDeSesion(cookie ? decodeURIComponent(cookie.slice(SESSION_COOKIE.length + 1)) : null);
  if (!accesoFinanzas(yo)) return NextResponse.json({ error: "Sin acceso a Finanzas" }, { status: 403 });
  const key = (process.env.HOLDED_API_KEY || "").trim();
  if (!key) return NextResponse.json({ error: "Falta HOLDED_API_KEY en Vercel" }, { status: 500 });

  const desde = Math.floor(new Date("2026-01-01T00:00:00Z").getTime() / 1000);
  const hasta = Math.floor(Date.now() / 1000);
  let ventas: DocHolded[], compras: DocHolded[];
  try {
    [ventas, compras] = await Promise.all([leer("invoice", key, desde, hasta), leer("purchase", key, desde, hasta)]);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }

  const db = supabaseAdmin();
  const { data, error } = await db
    .from("fin_documentos")
    .select("id,tipo,contraparte,numero,total,pagado,notas")
    .eq("sociedad", "Bering ES")
    .in("tipo", ["venta", "cogs", "fijo", "variable"]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const docs = (data || []) as { id: string; tipo: string; contraparte: string; numero: string; total: number | string | null; pagado: boolean | null; notas: string | null }[];

  // Facturas anuladas en Holded (registradas como incidencias «anulada:F26xxxx»): no cuentan ni se avisan.
  const { data: anul } = await db.from("fin_incidencias").select("clave").like("clave", "anulada:%");
  const anuladas = new Set((anul || []).map((r: { clave: string }) => norm(r.clave.slice("anulada:".length))));

  const hoy = new Date().toISOString().slice(0, 10);
  const resumen = { ventasHolded: ventas.length, comprasHolded: compras.length, cruzadas: 0, actualizadas: 0, conflictos: [] as string[], ventasNoEnPanel: [] as string[], comprasNoEnPanel: 0 };

  async function cruzar(lista: DocHolded[], esVenta: boolean) {
    for (const h of lista) {
      const n = norm(h.docNumber);
      if (!n || (esVenta && anuladas.has(n))) continue;
      const totalH = Number(h.total ?? 0);
      const candidatos = docs.filter((d) => (esVenta ? d.tipo === "venta" : d.tipo !== "venta") && norm(d.numero) === n);
      // mismo número y mismo total (±1 €) para no confundir, p. ej., «1001» de dos proveedores
      const d = candidatos.find((c) => Math.abs(Number(c.total ?? 0) - totalH) <= 1) || (candidatos.length === 1 && esVenta ? candidatos[0] : undefined);
      if (!d) {
        if (esVenta) resumen.ventasNoEnPanel.push(`${h.docNumber} ${h.contactName || ""} ${totalH.toFixed(2)} €`.trim());
        else resumen.comprasNoEnPanel++;
        continue;
      }
      resumen.cruzadas++;
      const e = estadoHolded(h);
      if (e === null) continue;
      if (e === false && d.pagado === true) {
        resumen.conflictos.push(`${d.contraparte} ${d.numero}: marcada pagada en el panel, pendiente en Holded`);
        continue;
      }
      if (d.pagado === e) continue;
      const nota = `Holded ${hoy}: ${e ? "pagada" : "pendiente"}.`;
      const notas = [String(d.notas || "").replace(/ ?Holded \d{4}-\d{2}-\d{2}: (pagada|pendiente)\./g, "").trim(), nota].filter(Boolean).join(" ");
      const { error: eu } = await db.from("fin_documentos").update({ pagado: e, notas, actualizado: new Date().toISOString() }).eq("id", d.id);
      if (!eu) {
        resumen.actualizadas++;
        d.pagado = e;
      }
    }
  }
  await cruzar(ventas, true);
  await cruzar(compras, false);

  return NextResponse.json({ ok: true, ...resumen, sincronizado: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
}
