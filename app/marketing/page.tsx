"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { PortalHeader } from "../components/PortalNav";
import { Cargando, ErrorDatos, Kpi, Tarjeta, eur, eurCorto, haceCuanto, usePortalData } from "../components/portal";
import { entre, porCampana, serie, totales, variacion, type Agrupacion, type FilaAds, type FilaTermino, type Punto } from "@/lib/marketing";
import { ESTADOS } from "@/lib/solicitudes";

// Marketing: Google Ads (inversión, presupuesto, clics, conversiones y coste por conversión en el tiempo) vía
// Windsor.ai, cruzado con las solicitudes que llegan por la web (tabla Solicitudes).
// Los importes vienen en la moneda de la cuenta (MXN: la cuenta se gestiona desde México); se pueden ver en euros
// con el tipo de cambio del BCE del día.

interface DatosAds {
  desde: string;
  hasta: string;
  desdeAnterior: string;
  dias: number;
  moneda: string;
  cambio: { eur: number; fecha: string } | null;
  filas: FilaAds[];
  terminos: FilaTermino[];
  generado: string;
}

const PERIODOS = [
  { dias: 30, nombre: "30 días" },
  { dias: 90, nombre: "90 días" },
  { dias: 180, nombre: "6 meses" },
  { dias: 365, nombre: "12 meses" },
];

const C_GASTO = "#282828";
const C_PRESUPUESTO = "#9a9a96";
const C_CLICS = "#2a5d99";
const C_CONV = "#5b3fb0";
const C_CPA = "#282828";

const entero = (v: number) => Math.round(v).toLocaleString("es-ES");
const dec1 = (v: number) => (Math.round(v * 10) / 10).toLocaleString("es-ES");
const pct1 = (v: number | null) => (v === null ? "—" : (Math.round(v * 1000) / 10).toLocaleString("es-ES") + " %");
const vs = (v: number | null, invertir = false) => {
  if (v === null) return "sin periodo anterior";
  const mejor = invertir ? v < 0 : v > 0;
  return `${v > 0 ? "+" : ""}${Math.round(v * 100)} % vs periodo anterior${Math.abs(v) >= 0.05 ? (mejor ? " ▲" : " ▼") : ""}`;
};
const esWeb = (canal: string) => /formulario|web|google|ads/i.test(canal);
const corto = (v: number) => (v >= 1e6 ? dec1(v / 1e6) + "M" : v >= 1000 ? dec1(v / 1000) + "k" : String(Math.round(v)));

/** Formato de dinero en la moneda elegida (la de la cuenta o euros). */
function useDinero(datos: DatosAds | null, enEuros: boolean) {
  return useMemo(() => {
    const moneda = datos?.moneda || "MXN";
    const factor = enEuros && datos?.cambio ? datos.cambio.eur : 1;
    const euros = moneda === "EUR" || (enEuros && !!datos?.cambio);
    const fmt = (v: number | null, decimales = 0) => {
      if (v === null || !isFinite(v)) return "—";
      const x = v * factor;
      const t = x.toLocaleString("es-ES", { minimumFractionDigits: decimales, maximumFractionDigits: decimales });
      return euros ? t + " €" : t + " " + moneda;
    };
    return { fmt, factor, simbolo: euros ? "€" : moneda, euros, moneda };
  }, [datos, enEuros]);
}

export default function MarketingPage() {
  const [dias, setDias] = useState(90);
  const [agrupar, setAgrupar] = useState<Agrupacion>("semana");
  const [campana, setCampana] = useState("");
  const [enEuros, setEnEuros] = useState(false);
  const [datos, setDatos] = useState<DatosAds | null>(null);
  const [error, setError] = useState<{ texto: string; configuracion?: boolean } | null>(null);
  const [cargando, setCargando] = useState(true);
  const portal = usePortalData();
  const dinero = useDinero(datos, enEuros);

  const cargar = useCallback(async (d: number) => {
    setCargando(true);
    try {
      const res = await fetch(`/api/marketing?dias=${d}`, { cache: "no-store" });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError({ texto: body?.error || `Error ${res.status}`, configuracion: !!body?.configuracion });
        return;
      }
      setDatos(body as DatosAds);
      setError(null);
    } catch (err) {
      setError({ texto: (err as Error).message });
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga de datos al cambiar el periodo
    cargar(dias);
  }, [dias, cargar]);

  const campanas = useMemo(() => [...new Set((datos?.filas ?? []).map((f) => f.campana))].sort(), [datos]);
  const filtradas = useMemo(() => (datos?.filas ?? []).filter((f) => !campana || f.campana === campana), [datos, campana]);
  const actual = useMemo(() => (datos ? entre(filtradas, datos.desde, datos.hasta) : []), [datos, filtradas]);
  const anterior = useMemo(() => {
    if (!datos) return [];
    const fin = new Date(new Date(datos.desde + "T12:00:00Z").getTime() - 86400000).toISOString().slice(0, 10);
    return entre(filtradas, datos.desdeAnterior, fin);
  }, [datos, filtradas]);
  const t = useMemo(() => totales(actual), [actual]);
  const t0 = useMemo(() => totales(anterior), [anterior]);
  const puntos = useMemo(() => serie(actual, agrupar), [actual, agrupar]);
  const filasCampana = useMemo(() => (datos ? porCampana(entre(datos.filas, datos.desde, datos.hasta)) : []), [datos]);
  const terminos = datos?.terminos ?? [];

  // Solicitudes que llegan por la web en el mismo periodo (tabla Solicitudes de Dársena; importes en euros)
  const web = useMemo(() => {
    if (!datos || !portal.data) return null;
    const ops = portal.data.oportunidades.filter(
      (o) => o.origen === "hoja" && esWeb(o.canal) && o.fechaSolicitud && o.fechaSolicitud.slice(0, 10) >= datos.desde && o.fechaSolicitud.slice(0, 10) <= datos.hasta
    );
    const ganadas = ops.filter((o) => o.estado === ESTADOS.GANADO);
    return { n: ops.length, ganadas: ganadas.length, ganado: ganadas.reduce((s, o) => s + (o.importe || 0), 0) };
  }, [datos, portal.data]);

  const sobrePresupuesto = filasCampana.filter((c) => c.usoPresupuesto !== null && c.usoPresupuesto > 1.1);
  const desperdicio = terminos.filter((x) => x.conversiones === 0).reduce((s, x) => s + x.gasto, 0);

  return (
    <div className="flex min-h-screen flex-col">
      <PortalHeader>
        <button
          onClick={() => cargar(dias)}
          disabled={cargando}
          className="inline-flex items-center gap-1.5 rounded-md border border-white/20 bg-white/5 px-3 py-1.5 text-sm font-medium text-white hover:bg-white/10 disabled:opacity-50"
        >
          {cargando && <Loader2 size={14} className="animate-spin" />} Actualizar
        </button>
      </PortalHeader>

      <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 py-5 sm:px-5">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold">Marketing</h1>
            <p className="text-sm text-[#606060]">
              Google Ads (cuenta Bering, en {datos?.moneda || "MXN"}) vía Windsor.ai
              {datos ? ` · ${datos.desde.split("-").reverse().join("/")} – ${datos.hasta.split("-").reverse().join("/")} · datos de ${haceCuanto(datos.generado)}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <div className="inline-flex overflow-hidden rounded-md border border-[#e2e0dc] bg-white" role="group" aria-label="Periodo">
              {PERIODOS.map((p) => (
                <button
                  key={p.dias}
                  type="button"
                  onClick={() => setDias(p.dias)}
                  className={`px-2.5 py-1 text-xs font-medium ${dias === p.dias ? "bg-[#282828] text-white" : "text-[#606060] hover:bg-[#f5f4f2]"}`}
                >
                  {p.nombre}
                </button>
              ))}
            </div>
            <select value={agrupar} onChange={(e) => setAgrupar(e.target.value as Agrupacion)} className="rounded-md border border-[#e2e0dc] bg-white px-2 py-1 text-xs" aria-label="Agrupar por">
              <option value="dia">Por día</option>
              <option value="semana">Por semana</option>
              <option value="mes">Por mes</option>
            </select>
            <select value={campana} onChange={(e) => setCampana(e.target.value)} className="max-w-[200px] rounded-md border border-[#e2e0dc] bg-white px-2 py-1 text-xs" aria-label="Campaña">
              <option value="">Todas las campañas</option>
              {campanas.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            {datos && datos.moneda !== "EUR" && (
              <div className="inline-flex overflow-hidden rounded-md border border-[#e2e0dc] bg-white" role="group" aria-label="Moneda">
                {[false, true].map((e) => (
                  <button
                    key={String(e)}
                    type="button"
                    disabled={e && !datos.cambio}
                    onClick={() => setEnEuros(e)}
                    title={e && datos.cambio ? `1 ${datos.moneda} = ${datos.cambio.eur.toLocaleString("es-ES", { maximumFractionDigits: 4 })} € (BCE, ${datos.cambio.fecha})` : undefined}
                    className={`px-2.5 py-1 text-xs font-medium disabled:opacity-40 ${enEuros === e ? "bg-[#282828] text-white" : "text-[#606060] hover:bg-[#f5f4f2]"}`}
                  >
                    {e ? "EUR" : datos.moneda}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {cargando && !datos ? (
          <Cargando texto="Leyendo Google Ads…" />
        ) : error && !datos ? (
          error.configuracion ? (
            <div className="rounded-lg border border-[#e2e0dc] bg-white p-4 text-sm">
              <p className="font-semibold">Falta conectar Google Ads</p>
              <p className="mt-1 text-[#606060]">{error.texto}</p>
            </div>
          ) : (
            <ErrorDatos mensaje={error.texto} onReintentar={() => cargar(dias)} />
          )
        ) : (
          <div className="flex flex-col gap-4">
            {enEuros && datos?.cambio && (
              <p className="text-xs text-[#606060]">
                Importes en euros al tipo de cambio del BCE del {datos.cambio.fecha.split("-").reverse().join("/")} (1 {datos.moneda} ={" "}
                {datos.cambio.eur.toLocaleString("es-ES", { maximumFractionDigits: 4 })} €). Google Ads factura en {datos.moneda}.
              </p>
            )}

            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Kpi label="Inversión" valor={dinero.fmt(t.gasto)} sub={vs(variacion(t.gasto, t0.gasto), true)} />
              <Kpi label="Clics" valor={entero(t.clics)} sub={vs(variacion(t.clics, t0.clics))} />
              <Kpi label="Conversiones" valor={dec1(t.conversiones)} sub={vs(variacion(t.conversiones, t0.conversiones))} />
              <Kpi
                label="Coste por conversión"
                valor={dinero.fmt(t.cpa)}
                sub={vs(variacion(t.cpa, t0.cpa), true)}
                alerta={t.cpa !== null && t0.cpa !== null && t.cpa > t0.cpa * 1.25}
              />
              <Kpi label="Tasa de conversión" valor={pct1(t.tasaConversion)} sub={`conversiones ÷ clics · ${vs(variacion(t.tasaConversion, t0.tasaConversion))}`} />
              <Kpi label="CPC medio" valor={dinero.fmt(t.cpc, 2)} sub={vs(variacion(t.cpc, t0.cpc), true)} />
              <Kpi label="Impresiones · CTR" valor={entero(t.impresiones)} sub={`CTR ${pct1(t.ctr)} · ${vs(variacion(t.impresiones, t0.impresiones))}`} />
              <Kpi
                label="Solicitudes por la web"
                valor={web ? String(web.n) : "—"}
                sub={web ? `${web.n ? dinero.fmt(t.gasto / web.n) + " por solicitud · " : ""}${web.ganadas} ganadas (${eurCorto(web.ganado)})` : "cargando Solicitudes…"}
              />
            </div>

            {!!sobrePresupuesto.length && (
              <p className="rounded-md bg-[#fff4e0] px-3 py-2 text-sm text-[#9a5b00]">
                {sobrePresupuesto
                  .map((c) => `${c.campana} gasta el ${Math.round((c.usoPresupuesto as number) * 100)} % de su presupuesto diario (${dinero.fmt(c.presupuestoDiario)}/día)`)
                  .join(" · ")}
                . Google permite gastar hasta el doble algún día, pero si es habitual conviene revisar el presupuesto o las pujas.
              </p>
            )}

            <Tarjeta
              titulo="Presupuesto, clics y conversiones"
              sub={`${agrupar === "dia" ? "Por día" : agrupar === "semana" ? "Por semana" : "Por mes"}, en la misma línea de tiempo: cuánto se gasta frente al presupuesto, qué tráfico trae y cuántas conversiones consigue. Cada gráfico tiene su escala.`}
            >
              <GraficoAlineado puntos={puntos} dinero={dinero} />
            </Tarjeta>

            <Tarjeta titulo={`Campañas · ${filasCampana.length}`} sub="Periodo elegido, todas las campañas. Uso del presupuesto = gasto ÷ (presupuesto diario × días con anuncios).">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-sm">
                  <thead className="text-left text-xs text-[#606060]">
                    <tr>
                      <th className="py-1.5 pr-2 font-medium">Campaña</th>
                      <th className="py-1.5 pr-2 text-right font-medium">Presupuesto/día</th>
                      <th className="py-1.5 pr-2 text-right font-medium">Inversión</th>
                      <th className="py-1.5 pr-2 font-medium">Uso del presupuesto</th>
                      <th className="py-1.5 pr-2 text-right font-medium">Clics</th>
                      <th className="py-1.5 pr-2 text-right font-medium">Conv.</th>
                      <th className="py-1.5 pr-2 text-right font-medium">Tasa conv.</th>
                      <th className="py-1.5 pr-2 text-right font-medium">Coste/conv.</th>
                      <th className="py-1.5 pr-2 text-right font-medium">CPC</th>
                      <th className="py-1.5 text-right font-medium">CTR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filasCampana.map((c) => (
                      <tr key={c.campana} className="border-t border-[#efefec]">
                        <td className="py-1.5 pr-2">
                          <span className="font-medium">{c.campana}</span>
                          {c.estado && c.estado !== "ENABLED" && <span className="ml-1 text-xs text-[#8a8a8a]">({c.estado.toLowerCase()})</span>}
                        </td>
                        <td className="py-1.5 pr-2 text-right tabular-nums">{dinero.fmt(c.presupuestoDiario)}</td>
                        <td className="py-1.5 pr-2 text-right font-semibold tabular-nums">{dinero.fmt(c.gasto)}</td>
                        <td className="py-1.5 pr-2">
                          <BarraUso v={c.usoPresupuesto} />
                        </td>
                        <td className="py-1.5 pr-2 text-right tabular-nums">{entero(c.clics)}</td>
                        <td className="py-1.5 pr-2 text-right tabular-nums">{dec1(c.conversiones)}</td>
                        <td className="py-1.5 pr-2 text-right tabular-nums">{pct1(c.tasaConversion)}</td>
                        <td className="py-1.5 pr-2 text-right tabular-nums">{dinero.fmt(c.cpa)}</td>
                        <td className="py-1.5 pr-2 text-right tabular-nums">{dinero.fmt(c.cpc, 2)}</td>
                        <td className="py-1.5 text-right tabular-nums">{pct1(c.ctr)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Tarjeta>

            <Tarjeta
              titulo="Términos de búsqueda"
              sub={`Lo que escribió la gente antes de hacer clic, de más a menos gasto. En rojo, los que gastan sin convertir: candidatos a palabra clave negativa${desperdicio ? ` (${dinero.fmt(desperdicio)} sin conversión en el periodo)` : ""}.`}
            >
              {!terminos.length ? (
                <p className="text-sm text-[#606060]">Sin términos en este periodo.</p>
              ) : (
                <div className="max-h-[440px] overflow-auto">
                  <table className="w-full min-w-[620px] text-sm">
                    <thead className="sticky top-0 bg-white text-left text-xs text-[#606060]">
                      <tr>
                        <th className="py-1.5 pr-2 font-medium">Término</th>
                        <th className="py-1.5 pr-2 font-medium">Campaña</th>
                        <th className="py-1.5 pr-2 text-right font-medium">Inversión</th>
                        <th className="py-1.5 pr-2 text-right font-medium">Clics</th>
                        <th className="py-1.5 pr-2 text-right font-medium">Impr.</th>
                        <th className="py-1.5 text-right font-medium">Conv.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {terminos.map((x) => {
                        const malo = x.gasto * dinero.factor >= (dinero.euros ? 30 : 600) && x.conversiones === 0;
                        return (
                          <tr key={x.termino} className="border-t border-[#efefec]">
                            <td className={`py-1.5 pr-2 ${malo ? "font-medium text-[#b3161b]" : ""}`}>{x.termino}</td>
                            <td className="py-1.5 pr-2 text-xs text-[#606060]">{x.campana}</td>
                            <td className="py-1.5 pr-2 text-right tabular-nums">{dinero.fmt(x.gasto)}</td>
                            <td className="py-1.5 pr-2 text-right tabular-nums">{entero(x.clics)}</td>
                            <td className="py-1.5 pr-2 text-right tabular-nums">{entero(x.impresiones)}</td>
                            <td className="py-1.5 text-right tabular-nums">{x.conversiones ? dec1(x.conversiones) : "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Tarjeta>
          </div>
        )}
      </main>
    </div>
  );
}

function BarraUso({ v }: { v: number | null }) {
  if (v === null) return <span className="text-xs text-[#8a8a8a]">—</span>;
  const alto = v > 1.1;
  return (
    <span className="flex items-center gap-2">
      <span className="relative h-2 w-24 overflow-hidden rounded bg-[#efefec]">
        <span className="absolute inset-y-0 left-0 rounded" style={{ width: `${Math.min(100, v * 100)}%`, background: alto ? "#c2410c" : C_GASTO }} />
      </span>
      <span className={`text-xs tabular-nums ${alto ? "font-semibold text-[#c2410c]" : "text-[#606060]"}`}>
        {Math.round(v * 100)} %{alto ? " ▲" : ""}
      </span>
    </span>
  );
}

/** Escala "bonita" para un máximo: tope y marcas. */
function escala(max: number, marcas = 3) {
  const m = Math.max(max, 1e-9);
  let paso = Math.pow(10, Math.floor(Math.log10(m / marcas)));
  for (const k of [1, 2, 2.5, 5, 10]) {
    if (m / (paso * k) <= marcas) {
      paso *= k;
      break;
    }
  }
  const tope = Math.ceil(m / paso) * paso || 1;
  const ticks: number[] = [];
  for (let v = 0; v <= tope + 1e-9; v += paso) ticks.push(v);
  return { tope, ticks };
}

/**
 * Cuatro gráficos apilados con el mismo eje de tiempo y un solo cursor: inversión frente a presupuesto, clics,
 * conversiones y coste por conversión. Cada uno con su propia escala (nunca dos escalas en el mismo gráfico).
 */
function GraficoAlineado({ puntos, dinero }: { puntos: Punto[]; dinero: ReturnType<typeof useDinero> }) {
  const [hover, setHover] = useState<number | null>(null);
  if (!puntos.length) return <p className="text-sm text-[#606060]">Sin datos en este periodo.</p>;

  const W = 680,
    L = 52,
    R = 10,
    GAP = 26;
  const iw = W - L - R;
  const bw = iw / puntos.length;
  const barW = Math.max(2, Math.min(26, bw - 3));
  const cadaEtiqueta = Math.max(1, Math.ceil(puntos.length / 9));
  const f = dinero.factor;

  type Panel = { titulo: string; alto: number; valor: (p: Punto) => number | null; color: string; tipo: "barra" | "linea"; formato: (v: number) => string; linea?: (p: Punto) => number };
  const paneles: Panel[] = [
    { titulo: `Inversión y presupuesto (${dinero.simbolo})`, alto: 130, valor: (p) => p.gasto * f, linea: (p) => p.presupuesto * f, color: C_GASTO, tipo: "barra", formato: corto },
    { titulo: "Clics", alto: 90, valor: (p) => p.clics, color: C_CLICS, tipo: "barra", formato: (v) => String(Math.round(v)) },
    { titulo: "Conversiones", alto: 90, valor: (p) => p.conversiones, color: C_CONV, tipo: "barra", formato: (v) => dec1(v) },
    { titulo: `Coste por conversión (${dinero.simbolo})`, alto: 90, valor: (p) => (p.cpa === null ? null : p.cpa * f), color: C_CPA, tipo: "linea", formato: corto },
  ];
  let y0 = 14;
  const capas = paneles.map((pn) => {
    const max = Math.max(...puntos.map((p) => Math.max(pn.valor(p) ?? 0, pn.linea ? pn.linea(p) : 0)));
    const { tope, ticks } = escala(max);
    const top = y0 + 14;
    const capa = { ...pn, top, tope, ticks, y: (v: number) => top + pn.alto - (v / tope) * pn.alto };
    y0 = top + pn.alto + GAP;
    return capa;
  });
  const H = y0 - GAP + 22;
  const cx = (i: number) => L + bw * i + bw / 2;
  const p = hover !== null ? puntos[hover] : null;

  return (
    <div>
      <div className="mb-2 min-h-[36px] rounded-md bg-[#f5f4f2] px-3 py-1.5 text-xs text-[#404040]">
        {p ? (
          <div className="flex flex-wrap gap-x-4 gap-y-0.5">
            <b className="text-[#282828]">{p.etiqueta}</b>
            <span>
              Inversión <b>{dinero.fmt(p.gasto)}</b> de {dinero.fmt(p.presupuesto)}
            </span>
            <span>
              Clics <b>{entero(p.clics)}</b>
            </span>
            <span>
              Conversiones <b>{dec1(p.conversiones)}</b> ({pct1(p.tasaConversion)})
            </span>
            <span>
              Coste/conv. <b>{dinero.fmt(p.cpa)}</b>
            </span>
            <span>
              CPC <b>{dinero.fmt(p.cpc, 2)}</b>
            </span>
          </div>
        ) : (
          <span className="text-[#8a8a8a]">Pasa el ratón (o toca) un periodo para ver todos sus datos a la vez.</span>
        )}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label="Inversión, presupuesto, clics, conversiones y coste por conversión en el tiempo">
        {capas.map((c) => (
          <g key={c.titulo}>
            <text x={L} y={c.top - 6} fontSize="11.5" fontWeight="600" fill="#404040">
              {c.titulo}
            </text>
            {c.linea && (
              <g>
                <rect x={W - R - 150} y={c.top - 15} width="9" height="9" rx="2" fill={C_GASTO} />
                <text x={W - R - 137} y={c.top - 7} fontSize="10.5" fill="#606060">
                  Inversión
                </text>
                <line x1={W - R - 78} x2={W - R - 60} y1={c.top - 10.5} y2={c.top - 10.5} stroke={C_PRESUPUESTO} strokeWidth="2" strokeDasharray="4 3" />
                <text x={W - R - 55} y={c.top - 7} fontSize="10.5" fill="#606060">
                  Presupuesto
                </text>
              </g>
            )}
            {c.ticks.map((tk) => (
              <g key={tk}>
                <line x1={L} x2={W - R} y1={c.y(tk)} y2={c.y(tk)} stroke={tk === 0 ? "#8a8a8a" : "#efefec"} />
                <text x={L - 6} y={c.y(tk) + 3.5} textAnchor="end" fontSize="10" fill="#8a8a8a">
                  {c.formato(tk)}
                </text>
              </g>
            ))}
            {c.tipo === "barra" &&
              puntos.map((pt, i) => {
                const v = c.valor(pt) ?? 0;
                if (v <= 0) return null;
                const h = Math.max(2, (v / c.tope) * c.alto);
                const x = cx(i) - barW / 2;
                const by = c.top + c.alto - h;
                const r = Math.min(3, barW / 2, h);
                return (
                  <path
                    key={i}
                    fill={c.color}
                    opacity={hover === null || hover === i ? 1 : 0.5}
                    d={`M${x},${by + h}V${by + r}Q${x},${by} ${x + r},${by}H${x + barW - r}Q${x + barW},${by} ${x + barW},${by + r}V${by + h}Z`}
                  />
                );
              })}
            {c.linea && (
              <path
                d={puntos.map((pt, i) => `${i ? "L" : "M"}${cx(i).toFixed(1)},${c.y((c.linea as (p: Punto) => number)(pt)).toFixed(1)}`).join("")}
                fill="none"
                stroke={C_PRESUPUESTO}
                strokeWidth={2}
                strokeDasharray="5 4"
              />
            )}
            {c.tipo === "linea" && (
              <>
                <path
                  d={puntos
                    .map((pt, i) => ({ v: c.valor(pt), i }))
                    .filter((x) => x.v !== null)
                    .map((x, k) => `${k ? "L" : "M"}${cx(x.i).toFixed(1)},${c.y(x.v as number).toFixed(1)}`)
                    .join("")}
                  fill="none"
                  stroke={c.color}
                  strokeWidth={2}
                />
                {puntos.map((pt, i) => {
                  const v = c.valor(pt);
                  return v === null ? null : <circle key={i} cx={cx(i)} cy={c.y(v)} r={hover === i ? 4.5 : 3} fill={c.color} stroke="#fff" strokeWidth="1.5" />;
                })}
              </>
            )}
          </g>
        ))}
        {hover !== null && <line x1={cx(hover)} x2={cx(hover)} y1={capas[0].top} y2={H - 20} stroke="#282828" strokeOpacity="0.25" strokeDasharray="3 3" />}
        {puntos.map((pt, i) =>
          i % cadaEtiqueta === 0 ? (
            <text key={pt.clave} x={cx(i)} y={H - 5} textAnchor="middle" fontSize="10.5" fill="#8a8a8a">
              {pt.etiqueta}
            </text>
          ) : null
        )}
        {puntos.map((pt, i) => (
          <rect
            key={"h" + pt.clave}
            x={L + bw * i}
            y={0}
            width={bw}
            height={H}
            fill={hover === i ? "rgba(40,40,40,.04)" : "transparent"}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            onClick={() => setHover(i)}
          />
        ))}
      </svg>
      <p className="mt-1 text-xs text-[#8a8a8a]">Sin punto en «Coste por conversión» = periodo sin conversiones.</p>
    </div>
  );
}
