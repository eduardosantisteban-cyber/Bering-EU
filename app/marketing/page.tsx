"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { PortalHeader } from "../components/PortalNav";
import { Cargando, ErrorDatos, Kpi, Tarjeta, eur, eurCorto, haceCuanto, usePortalData } from "../components/portal";
import { entre, porCampana, serie, totales, variacion, type Agrupacion, type FilaAds, type FilaTermino, type Punto } from "@/lib/marketing";
import { ESTADOS } from "@/lib/solicitudes";

// Marketing: Google Ads (inversión, clics, impresiones, conversiones y presupuesto en el tiempo) vía Windsor.ai,
// cruzado con las solicitudes que llegan por la web (tabla Solicitudes).

interface DatosAds {
  desde: string;
  hasta: string;
  desdeAnterior: string;
  dias: number;
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
const C_SERIE = "#2a5d99";

const entero = (v: number) => Math.round(v).toLocaleString("es-ES");
const pct1 = (v: number | null) => (v === null ? "—" : (Math.round(v * 1000) / 10).toString().replace(".", ",") + " %");
const eur2 = (v: number | null) => (v === null ? "—" : v.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €");
const vs = (v: number | null, invertir = false) => {
  if (v === null) return "sin periodo anterior";
  const mejor = invertir ? v < 0 : v > 0;
  return `${v > 0 ? "+" : ""}${Math.round(v * 100)} % vs periodo anterior${Math.abs(v) >= 0.05 ? (mejor ? " ▲" : " ▼") : ""}`;
};
const esWeb = (canal: string) => /formulario|web|google|ads/i.test(canal);

export default function MarketingPage() {
  const [dias, setDias] = useState(90);
  const [agrupar, setAgrupar] = useState<Agrupacion>("semana");
  const [campana, setCampana] = useState("");
  const [datos, setDatos] = useState<DatosAds | null>(null);
  const [error, setError] = useState<{ texto: string; configuracion?: boolean } | null>(null);
  const [cargando, setCargando] = useState(true);
  const portal = usePortalData();

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

  // Solicitudes que llegan por la web en el mismo periodo (tabla Solicitudes de Dársena)
  const web = useMemo(() => {
    if (!datos || !portal.data) return null;
    const ops = portal.data.oportunidades.filter(
      (o) => o.origen === "hoja" && esWeb(o.canal) && o.fechaSolicitud && o.fechaSolicitud.slice(0, 10) >= datos.desde && o.fechaSolicitud.slice(0, 10) <= datos.hasta
    );
    const ganadas = ops.filter((o) => o.estado === ESTADOS.GANADO);
    return { n: ops.length, ofertado: ops.reduce((s, o) => s + (o.importe || 0), 0), ganadas: ganadas.length, ganado: ganadas.reduce((s, o) => s + (o.importe || 0), 0) };
  }, [datos, portal.data]);

  const sobrePresupuesto = filasCampana.filter((c) => c.usoPresupuesto !== null && c.usoPresupuesto > 1.1);

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
              Google Ads (cuenta Bering) vía Windsor.ai{datos ? ` · ${datos.desde.split("-").reverse().join("/")} – ${datos.hasta.split("-").reverse().join("/")} · datos de ${haceCuanto(datos.generado)}` : ""}
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
          </div>
        </div>

        {cargando && !datos ? (
          <Cargando texto="Leyendo Google Ads…" />
        ) : error && !datos ? (
          error.configuracion ? (
            <div className="rounded-lg border border-[#e2e0dc] bg-white p-4 text-sm">
              <p className="font-semibold">Falta conectar Google Ads</p>
              <p className="mt-1 text-[#606060]">{error.texto}</p>
              <ol className="mt-2 list-decimal pl-5 text-[#606060]">
                <li>En Windsor.ai, copia tu API key (Settings → API key).</li>
                <li>En Vercel → proyecto bering-eu → Settings → Environment Variables, crea WINDSOR_API_KEY con esa clave (Production y Preview).</li>
                <li>Vuelve a desplegar (Deployments → … → Redeploy) y recarga esta página.</li>
              </ol>
            </div>
          ) : (
            <ErrorDatos mensaje={error.texto} onReintentar={() => cargar(dias)} />
          )
        ) : (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Kpi label="Inversión" valor={eur(t.gasto)} sub={vs(variacion(t.gasto, t0.gasto), true)} />
              <Kpi label="Clics" valor={entero(t.clics)} sub={vs(variacion(t.clics, t0.clics))} />
              <Kpi label="Impresiones" valor={entero(t.impresiones)} sub={vs(variacion(t.impresiones, t0.impresiones))} />
              <Kpi label="Conversiones" valor={entero(t.conversiones)} sub={vs(variacion(t.conversiones, t0.conversiones))} />
              <Kpi label="CTR" valor={pct1(t.ctr)} sub={vs(variacion(t.ctr, t0.ctr))} />
              <Kpi label="CPC medio" valor={eur2(t.cpc)} sub={vs(variacion(t.cpc, t0.cpc), true)} />
              <Kpi label="Coste por conversión" valor={eur(t.cpa)} sub={vs(variacion(t.cpa, t0.cpa), true)} alerta={t.cpa !== null && t0.cpa !== null && t.cpa > t0.cpa * 1.25} />
              <Kpi
                label="Solicitudes por la web"
                valor={web ? String(web.n) : "—"}
                sub={web ? `${web.n ? eur(t.gasto / web.n) + " por solicitud · " : ""}${web.ganadas} ganadas (${eurCorto(web.ganado)})` : "cargando Solicitudes…"}
              />
            </div>

            {!!sobrePresupuesto.length && (
              <p className="rounded-md bg-[#fff4e0] px-3 py-2 text-sm text-[#9a5b00]">
                {sobrePresupuesto.map((c) => `${c.campana} gasta el ${Math.round((c.usoPresupuesto as number) * 100)} % de su presupuesto diario (${eur(c.presupuestoDiario)}/día)`).join(" · ")}.
                Google permite gastar hasta el doble algún día, pero si es habitual conviene revisar el presupuesto o las pujas.
              </p>
            )}

            <Tarjeta titulo="Inversión y presupuesto" sub={`Gasto real ${agrupar === "dia" ? "por día" : agrupar === "semana" ? "por semana" : "por mes"} frente al presupuesto diario de las campañas en los días con anuncios.`}>
              <GraficoTiempo
                puntos={puntos}
                valor={(p) => p.gasto}
                linea={(p) => p.presupuesto}
                formato={(v) => eur(v)}
                eje={(v) => (v >= 1000 ? Math.round(v / 100) / 10 + "k" : String(Math.round(v)))}
                color={C_GASTO}
                nombre="Inversión"
                nombreLinea="Presupuesto"
                detalle={(p) => `${entero(p.clics)} clics · ${entero(p.conversiones)} conv. · CPC ${eur2(p.cpc)}`}
              />
            </Tarjeta>

            <div className="grid gap-4 md:grid-cols-3">
              <Tarjeta titulo="Clics" sub={`CTR ${pct1(t.ctr)}`}>
                <GraficoTiempo puntos={puntos} valor={(p) => p.clics} formato={entero} eje={(v) => String(Math.round(v))} color={C_SERIE} nombre="Clics" alto={150} />
              </Tarjeta>
              <Tarjeta titulo="Impresiones" sub={`${entero(t.impresiones)} en el periodo`}>
                <GraficoTiempo puntos={puntos} valor={(p) => p.impresiones} formato={entero} eje={(v) => (v >= 1000 ? Math.round(v / 100) / 10 + "k" : String(Math.round(v)))} color={C_SERIE} nombre="Impresiones" alto={150} />
              </Tarjeta>
              <Tarjeta titulo="Conversiones" sub={`coste por conversión ${eur(t.cpa)}`}>
                <GraficoTiempo
                  puntos={puntos}
                  valor={(p) => p.conversiones}
                  formato={(v) => (Math.round(v * 10) / 10).toString().replace(".", ",")}
                  eje={(v) => String(Math.round(v * 10) / 10)}
                  color={C_SERIE}
                  nombre="Conversiones"
                  alto={150}
                />
              </Tarjeta>
            </div>

            <Tarjeta titulo={`Campañas · ${filasCampana.length}`} sub="Periodo elegido, todas las campañas. Uso del presupuesto = gasto ÷ (presupuesto diario × días con anuncios).">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[860px] text-sm">
                  <thead className="text-left text-xs text-[#606060]">
                    <tr>
                      <th className="py-1.5 pr-2 font-medium">Campaña</th>
                      <th className="py-1.5 pr-2 text-right font-medium">Presupuesto/día</th>
                      <th className="py-1.5 pr-2 text-right font-medium">Inversión</th>
                      <th className="py-1.5 pr-2 font-medium">Uso del presupuesto</th>
                      <th className="py-1.5 pr-2 text-right font-medium">Clics</th>
                      <th className="py-1.5 pr-2 text-right font-medium">Impr.</th>
                      <th className="py-1.5 pr-2 text-right font-medium">CTR</th>
                      <th className="py-1.5 pr-2 text-right font-medium">CPC</th>
                      <th className="py-1.5 pr-2 text-right font-medium">Conv.</th>
                      <th className="py-1.5 text-right font-medium">€/conv.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filasCampana.map((c) => (
                      <tr key={c.campana} className="border-t border-[#efefec]">
                        <td className="py-1.5 pr-2">
                          <span className="font-medium">{c.campana}</span>
                          {c.estado && c.estado !== "ENABLED" && <span className="ml-1 text-xs text-[#8a8a8a]">({c.estado.toLowerCase()})</span>}
                        </td>
                        <td className="py-1.5 pr-2 text-right tabular-nums">{eur(c.presupuestoDiario)}</td>
                        <td className="py-1.5 pr-2 text-right font-semibold tabular-nums">{eur(c.gasto)}</td>
                        <td className="py-1.5 pr-2">
                          <BarraUso v={c.usoPresupuesto} />
                        </td>
                        <td className="py-1.5 pr-2 text-right tabular-nums">{entero(c.clics)}</td>
                        <td className="py-1.5 pr-2 text-right tabular-nums">{entero(c.impresiones)}</td>
                        <td className="py-1.5 pr-2 text-right tabular-nums">{pct1(c.ctr)}</td>
                        <td className="py-1.5 pr-2 text-right tabular-nums">{eur2(c.cpc)}</td>
                        <td className="py-1.5 pr-2 text-right tabular-nums">{(Math.round(c.conversiones * 10) / 10).toString().replace(".", ",")}</td>
                        <td className="py-1.5 text-right tabular-nums">{eur(c.cpa)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Tarjeta>

            <Tarjeta
              titulo="Términos de búsqueda"
              sub="Lo que escribió la gente antes de hacer clic, de más a menos gasto (periodo elegido). En rojo, los que gastan sin convertir: candidatos a palabra clave negativa."
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
                        const desperdicio = x.gasto >= 30 && x.conversiones === 0;
                        return (
                          <tr key={x.termino} className="border-t border-[#efefec]">
                            <td className={`py-1.5 pr-2 ${desperdicio ? "font-medium text-[#b3161b]" : ""}`}>{x.termino}</td>
                            <td className="py-1.5 pr-2 text-xs text-[#606060]">{x.campana}</td>
                            <td className="py-1.5 pr-2 text-right tabular-nums">{eur(x.gasto)}</td>
                            <td className="py-1.5 pr-2 text-right tabular-nums">{entero(x.clics)}</td>
                            <td className="py-1.5 pr-2 text-right tabular-nums">{entero(x.impresiones)}</td>
                            <td className="py-1.5 text-right tabular-nums">{x.conversiones ? (Math.round(x.conversiones * 10) / 10).toString().replace(".", ",") : "—"}</td>
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

/** Barras en el tiempo (una serie, un eje) con línea opcional en la misma escala y tooltip al pasar el ratón. */
function GraficoTiempo({
  puntos,
  valor,
  linea,
  formato,
  eje,
  color,
  nombre,
  nombreLinea,
  detalle,
  alto = 230,
}: {
  puntos: Punto[];
  valor: (p: Punto) => number;
  linea?: (p: Punto) => number;
  formato: (v: number) => string;
  eje: (v: number) => string;
  color: string;
  nombre: string;
  nombreLinea?: string;
  detalle?: (p: Punto) => string;
  alto?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  if (!puntos.length) return <p className="text-sm text-[#606060]">Sin datos en este periodo.</p>;
  const W = 640,
    H = alto,
    L = 40,
    R = 8,
    T = 10,
    B = 22;
  const iw = W - L - R,
    ih = H - T - B;
  const max = Math.max(1e-9, ...puntos.map((p) => Math.max(valor(p), linea ? linea(p) : 0)));
  let paso = Math.pow(10, Math.floor(Math.log10(max)));
  if (max / paso < 2) paso /= 2;
  const tope = Math.ceil(max / paso) * paso;
  const ticks: number[] = [];
  for (let v = 0; v <= tope + 1e-9; v += paso) ticks.push(v);
  const y = (v: number) => T + ih - (v / tope) * ih;
  const bw = iw / puntos.length;
  const barW = Math.max(2, Math.min(28, bw - 2));
  const cadaEtiqueta = Math.max(1, Math.ceil(puntos.length / 10));
  const p = hover !== null ? puntos[hover] : null;
  const ruta = linea
    ? puntos.map((pt, i) => `${i ? "L" : "M"}${(L + bw * i + bw / 2).toFixed(1)},${y(linea(pt)).toFixed(1)}`).join("")
    : "";
  return (
    <div>
      <div className="mb-1 flex min-h-[18px] flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#606060]">
        {linea && (
          <>
            <span className="inline-flex items-center gap-1.5">
              <i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: color }} /> {nombre}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <i className="inline-block w-4 border-t-2 border-dashed" style={{ borderColor: C_PRESUPUESTO }} /> {nombreLinea}
            </span>
          </>
        )}
        <span className="ml-auto text-[#282828]">
          {p ? (
            <>
              <b>{p.etiqueta}</b>: {formato(valor(p))}
              {linea ? ` de ${formato(linea(p))}` : ""}
              {detalle ? <span className="text-[#606060]"> · {detalle(p)}</span> : null}
            </>
          ) : (
            <span className="text-[#8a8a8a]">Pasa el ratón por una barra</span>
          )}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label={nombre + " en el tiempo"}>
        {ticks.map((tk) => (
          <g key={tk}>
            <line x1={L} x2={W - R} y1={y(tk)} y2={y(tk)} stroke="#efefec" />
            <text x={L - 6} y={y(tk) + 4} textAnchor="end" fontSize="11" fill="#8a8a8a">
              {eje(tk)}
            </text>
          </g>
        ))}
        {puntos.map((pt, i) => {
          const v = valor(pt);
          const h = v > 0 ? Math.max(2, (v / tope) * ih) : 0;
          const x = L + bw * i + (bw - barW) / 2;
          const by = T + ih - h;
          const r = Math.min(4, barW / 2, h);
          return (
            <g key={pt.clave} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onClick={() => setHover(i)}>
              <rect x={L + bw * i} y={T} width={bw} height={ih} fill={hover === i ? "rgba(40,40,40,.05)" : "transparent"} />
              {h > 0 && (
                <path
                  fill={color}
                  opacity={hover === null || hover === i ? 1 : 0.55}
                  d={`M${x},${by + h}V${by + r}Q${x},${by} ${x + r},${by}H${x + barW - r}Q${x + barW},${by} ${x + barW},${by + r}V${by + h}Z`}
                />
              )}
              {i % cadaEtiqueta === 0 && (
                <text x={L + bw * i + bw / 2} y={H - 6} textAnchor="middle" fontSize="11" fill="#8a8a8a">
                  {pt.etiqueta}
                </text>
              )}
            </g>
          );
        })}
        {linea && <path d={ruta} fill="none" stroke={C_PRESUPUESTO} strokeWidth={2} strokeDasharray="5 4" pointerEvents="none" />}
        <line x1={L} x2={W - R} y1={T + ih} y2={T + ih} stroke="#8a8a8a" />
      </svg>
    </div>
  );
}
