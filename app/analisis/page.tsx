"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { PortalHeader } from "../components/PortalNav";
import {
  Barras,
  Cargando,
  ErrorDatos,
  EstadoPill,
  FichaOportunidad,
  MarcaBadge,
  SelectorMarca,
  SelectorMotivo,
  SelectorPeriodo,
  SelectorPersona,
  TablaTipos,
  Tarjeta,
  conIva,
  dias1,
  eur,
  eurCorto,
  haceCuanto,
  pct,
  personasDe,
  textoPeriodo,
  useMarca,
  usePeriodo,
  usePersona,
  usePortalData,
} from "../components/portal";
import {
  ESTADOS,
  conversionPor,
  enPeriodo,
  mediana,
  motivosPerdida,
  nombreDeEmail,
  porTipo,
  type Dimension,
  type Oportunidad,
} from "@/lib/solicitudes";
import { MARGEN_OBJETIVO } from "@/lib/portalConfig";

// Análisis comercial: conversión, tiempo de respuesta, motivos de pérdida, canal, provincia,
// tipo de producto y margen por oportunidad. Todo filtrable por marca, persona y periodo.

const DIMENSIONES: { k: Dimension; n: string }[] = [
  { k: "tipo", n: "Tipo de producto" },
  { k: "comercial", n: "Comercial" },
  { k: "marca", n: "Marca" },
  { k: "canal", n: "Canal" },
  { k: "provincia", n: "Provincia" },
];

const MAX_MARGEN = 15;

export default function AnalisisPage() {
  const { data, error, loading, refreshing, recargar } = usePortalData();
  const [persona, setPersona] = usePersona();
  const [marca, setMarca] = useMarca();
  const [periodo, setPeriodo] = usePeriodo();
  const [dim, setDim] = useState<Dimension>("tipo");
  const [verTodoMargen, setVerTodoMargen] = useState(false);
  const [ficha, setFicha] = useState<string | null>(null);
  const cerrarFicha = useCallback(() => setFicha(null), []);
  const abrir = (o: Oportunidad) => setFicha(o.codigo);

  const todasMarcas = useMemo(() => data?.oportunidades ?? [], [data]);
  const personas = useMemo(() => personasDe(todasMarcas), [todasMarcas]);
  const quien = personas.includes(persona) ? persona : "";
  const ahora = useMemo(() => (data ? new Date(data.generado) : new Date()), [data]);
  const ops = useMemo(() => {
    let l = todasMarcas;
    if (marca) l = l.filter((o) => o.marca === marca);
    if (quien) l = l.filter((o) => o.registradoPor === quien);
    return enPeriodo(l, periodo, ahora);
  }, [todasMarcas, marca, quien, periodo, ahora]);
  const fichaO = ficha ? todasMarcas.find((o) => o.codigo === ficha) || null : null;

  const conversion = useMemo(() => conversionPor(ops, dim), [ops, dim]);
  const canales = useMemo(() => conversionPor(ops, "canal"), [ops]);
  const provincias = useMemo(() => conversionPor(ops, "provincia"), [ops]);
  const tipos = useMemo(() => porTipo(ops), [ops]);
  const motivos = useMemo(() => motivosPerdida(ops), [ops]);
  const sinMotivo = useMemo(() => ops.filter((o) => o.estado === ESTADOS.PERDIDO && !o.motivoPerdida), [ops]);

  const tiempos = useMemo(() => {
    const l = ops.filter((o) => o.tiempoRespuesta !== null);
    const xs = l.map((o) => o.tiempoRespuesta as number);
    const porPersona: Record<string, number[]> = {};
    for (const o of l) (porPersona[nombreDeEmail(o.registradoPor)] ||= []).push(o.tiempoRespuesta as number);
    return {
      n: xs.length,
      med: mediana(xs),
      media: xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null,
      rapidos: xs.filter((x) => x <= 2).length,
      tramos: [
        { k: "Mismo día o 1 día", n: xs.filter((v) => v <= 1).length },
        { k: "2–3 días", n: xs.filter((v) => v > 1 && v <= 3).length },
        { k: "4–7 días", n: xs.filter((v) => v > 3 && v <= 7).length },
        { k: "Más de 7 días", n: xs.filter((v) => v > 7).length, color: "#e83038" },
      ],
      porPersona: Object.entries(porPersona).sort(([a], [b]) => a.localeCompare(b)),
      lentos: [...l].sort((a, b) => (b.tiempoRespuesta as number) - (a.tiempoRespuesta as number)).filter((o) => (o.tiempoRespuesta as number) > 3).slice(0, 5),
    };
  }, [ops]);

  const margenes = useMemo(() => {
    const l = ops.filter((o) => o.margen && o.margen.venta > 0).sort((a, b) => a.margen!.pct - b.margen!.pct);
    const venta = l.reduce((s, o) => s + o.margen!.venta, 0);
    const coste = l.reduce((s, o) => s + o.margen!.coste, 0);
    return { l, venta, coste, bajos: l.filter((o) => o.margen!.pct < MARGEN_OBJETIVO).length };
  }, [ops]);

  return (
    <div className="flex min-h-screen flex-col">
      <PortalHeader>
        <button
          onClick={recargar}
          disabled={refreshing}
          className="inline-flex items-center gap-1.5 rounded-md border border-white/20 bg-white/5 px-3 py-1.5 text-sm font-medium text-white hover:bg-white/10 disabled:opacity-50"
        >
          {refreshing && <Loader2 size={14} className="animate-spin" />} Actualizar
        </button>
      </PortalHeader>

      <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 py-5 sm:px-5">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold">Análisis comercial</h1>
            <p className="text-sm text-[#606060]">
              Solicitudes recibidas en {textoPeriodo(periodo)}
              {data ? ` · ${ops.length} oportunidades · datos de ${haceCuanto(data.generado)}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <SelectorPeriodo valor={periodo} onChange={setPeriodo} />
            <SelectorMarca valor={marca} onChange={setMarca} />
            {personas.length > 1 && <SelectorPersona personas={personas} valor={quien} onChange={setPersona} />}
          </div>
        </div>
        {(data?.avisos ?? []).map((a) => (
          <p key={a} className="mb-3 rounded-md bg-[#fff4e0] px-3 py-2 text-sm text-[#9a5b00]">
            {a}
          </p>
        ))}

        {loading ? (
          <Cargando />
        ) : error && !data ? (
          <ErrorDatos mensaje={error} onReintentar={recargar} />
        ) : (
          <div className="flex flex-col gap-4">
            <Tarjeta
              titulo="Conversión"
              sub="Presupuestadas = creadas en Holded o más avanzadas. Cierre = ganadas / (ganadas + perdidas). Conversión = ganadas / enviadas."
            >
              <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="Agrupar por">
                {DIMENSIONES.map((d) => (
                  <button
                    key={d.k}
                    type="button"
                    aria-pressed={dim === d.k}
                    onClick={() => setDim(d.k)}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                      dim === d.k ? "border-[#282828] bg-[#282828] text-white" : "border-[#e2e0dc] bg-white text-[#606060] hover:border-[#606060]"
                    }`}
                  >
                    {d.n}
                  </button>
                ))}
              </div>
              {conversion.length === 0 ? (
                <p className="text-sm text-[#606060]">Sin datos en este periodo.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-sm">
                    <thead className="text-left text-xs text-[#606060]">
                      <tr className="border-b border-[#e2e0dc]">
                        <th className="px-2 py-2 font-medium">{DIMENSIONES.find((d) => d.k === dim)!.n}</th>
                        <th className="px-2 py-2 text-center font-medium">Solicitudes</th>
                        <th className="px-2 py-2 text-center font-medium">Presupuestadas</th>
                        <th className="px-2 py-2 text-center font-medium">Enviadas</th>
                        <th className="px-2 py-2 text-center font-medium">Ganadas</th>
                        <th className="px-2 py-2 text-center font-medium">Perdidas</th>
                        <th className="px-2 py-2 text-center font-medium">Cierre</th>
                        <th className="px-2 py-2 text-center font-medium">Conversión</th>
                        <th className="px-2 py-2 text-right font-medium">Ganado (base)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {conversion.map((x) => (
                        <tr key={x.clave} className="border-b border-[#efefec]">
                          <td className="px-2 py-2 font-medium">{x.clave}</td>
                          <td className="px-2 py-2 text-center tabular-nums">{x.solicitudes}</td>
                          <td className="px-2 py-2 text-center tabular-nums">
                            {x.presupuestadas} <span className="text-xs text-[#8a8a8a]">({pct(x.presupuestadas, x.solicitudes)})</span>
                          </td>
                          <td className="px-2 py-2 text-center tabular-nums">{x.enviadas}</td>
                          <td className="px-2 py-2 text-center tabular-nums">{x.ganadas}</td>
                          <td className="px-2 py-2 text-center tabular-nums">{x.perdidas}</td>
                          <td className="px-2 py-2 text-center font-semibold tabular-nums">{pct(x.ganadas, x.ganadas + x.perdidas)}</td>
                          <td className="px-2 py-2 text-center tabular-nums">{pct(x.ganadas, x.enviadas)}</td>
                          <td className="px-2 py-2 text-right tabular-nums">{eur(x.ganado)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Tarjeta>

            <div className="grid gap-4 lg:grid-cols-2">
              <Tarjeta titulo="Tiempo de respuesta" sub="Días desde que llega la solicitud hasta que el presupuesto se crea en Holded.">
                {tiempos.n === 0 ? (
                  <p className="text-sm text-[#606060]">Aún no hay presupuestos con fecha de creación en este periodo.</p>
                ) : (
                  <>
                    <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {[
                        ["Mediana", dias1(tiempos.med)],
                        ["Media", dias1(tiempos.media)],
                        ["En ≤ 2 días", pct(tiempos.rapidos, tiempos.n)],
                        ["Presupuestos", String(tiempos.n)],
                      ].map(([l, v]) => (
                        <div key={l} className="rounded-md border border-[#e2e0dc] px-3 py-2">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#8a8a8a]">{l}</p>
                          <p className="text-lg font-bold tabular-nums">{v}</p>
                        </div>
                      ))}
                    </div>
                    <Barras filas={tiempos.tramos} />
                    {tiempos.porPersona.length > 1 && (
                      <>
                        <p className="mb-1 mt-4 text-[11px] font-bold uppercase tracking-wide text-[#8a8a8a]">Por comercial (mediana)</p>
                        <ul className="text-sm">
                          {tiempos.porPersona.map(([p, xs]) => (
                            <li key={p} className="flex justify-between py-0.5">
                              <span>{p}</span>
                              <span className="tabular-nums text-[#606060]">
                                {dias1(mediana(xs))} · {xs.length}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                    {tiempos.lentos.length > 0 && (
                      <>
                        <p className="mb-1 mt-4 text-[11px] font-bold uppercase tracking-wide text-[#8a8a8a]">Los más lentos</p>
                        <ul className="text-sm">
                          {tiempos.lentos.map((o) => (
                            <li key={o.codigo}>
                              <button type="button" onClick={() => abrir(o)} className="font-semibold underline decoration-[#e2e0dc] underline-offset-2">
                                {o.codigo}
                              </button>
                              <span className="text-[#606060]">
                                {" "}
                                · {o.empresa} · {dias1(o.tiempoRespuesta)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                  </>
                )}
              </Tarjeta>

              <Tarjeta
                titulo={`Motivos de pérdida${sinMotivo.length ? ` · ${sinMotivo.length} sin motivo` : ""}`}
                sub="Indica por qué se perdió cada oportunidad: se guarda en la hoja Solicitudes (columna W) y como nota en Holded."
              >
                {motivos.length === 0 ? (
                  <p className="text-sm font-medium text-[#1e7e34]">No hay oportunidades perdidas en este periodo.</p>
                ) : (
                  <Barras
                    filas={motivos.map((m) => ({
                      k: m.motivo,
                      n: m.n,
                      detalle: `${m.n} · ${eurCorto(m.importe)}`,
                      color: m.motivo === "Sin indicar" ? "#8a8a8a" : "#e83038",
                    }))}
                  />
                )}
                {sinMotivo.length > 0 && (
                  <>
                    <p className="mb-1 mt-4 text-[11px] font-bold uppercase tracking-wide text-[#8a8a8a]">Pendientes de indicar el motivo</p>
                    <ul className="divide-y divide-[#efefec]">
                      {sinMotivo.slice(0, 20).map((o) => (
                        <li key={o.codigo} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5">
                          <button type="button" onClick={() => abrir(o)} className="min-w-0 flex-1 text-left text-sm">
                            <span className="font-semibold underline decoration-[#e2e0dc] underline-offset-2">{o.codigo}</span>
                            <MarcaBadge marca={o.marca} />
                            <span className="text-[#606060]"> · {o.empresa || "—"} · {eur(o.importe)}</span>
                          </button>
                          <SelectorMotivo o={o} onGuardado={recargar} />
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </Tarjeta>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <Tarjeta
                titulo="Canal de entrada"
                sub="Por dónde llegan las solicitudes y cuántas se ganan. Las anteriores al 20/10/2026 solo distinguen formulario web y Muelle Max."
              >
                <Barras
                  color="#3D7BC4"
                  filas={canales.map((x) => ({ k: x.clave, n: x.solicitudes, detalle: `${x.solicitudes} sol. · ${x.ganadas} gan. · ${pct(x.ganadas, x.enviadas)}` }))}
                />
                <p className="mt-2 text-xs text-[#8a8a8a]">sol. = solicitudes · gan. = ganadas · % = ganadas / enviadas</p>
              </Tarjeta>
              <Tarjeta titulo="Provincia de la obra" sub="Detectada en la solicitud. Se corrige a mano en la columna Y de Solicitudes.">
                <Barras
                  filas={provincias
                    .filter((x) => x.clave !== "Sin provincia")
                    .slice(0, 15)
                    .map((x) => ({ k: x.clave, n: x.solicitudes, detalle: `${x.solicitudes} sol. · ${x.ganadas} gan. · ${eurCorto(x.ganado)}` }))}
                />
                {provincias.some((x) => x.clave === "Sin provincia") && (
                  <p className="mt-2 text-xs text-[#8a8a8a]">Sin provincia detectada: {provincias.find((x) => x.clave === "Sin provincia")!.solicitudes} solicitudes</p>
                )}
              </Tarjeta>
            </div>

            <Tarjeta titulo="Por tipo de producto" sub="Una solicitud con varios tipos cuenta en cada uno.">
              <TablaTipos tipos={tipos} />
            </Tarjeta>

            <Tarjeta
              titulo={`Margen por oportunidad${margenes.bajos ? ` · ${margenes.bajos} bajo objetivo` : ""}`}
              sub={`Última revisión de cada presupuesto creado en Holded. Coste = proveedor + instalación + transporte. Objetivo: ${Math.round(
                MARGEN_OBJETIVO * 100
              )} % sobre venta.`}
              accion={
                <Link href="/proveedores" className="whitespace-nowrap text-xs font-medium text-[#e83038] hover:underline">
                  Precios de proveedores →
                </Link>
              }
            >
              {margenes.l.length === 0 ? (
                <p className="text-sm text-[#606060]">No hay presupuestos con coste y precio en este periodo.</p>
              ) : (
                <>
                  <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {[
                      ["Venta (base)", eurCorto(margenes.venta), ""],
                      ["Coste", eurCorto(margenes.coste), ""],
                      ["Margen", eurCorto(margenes.venta - margenes.coste), ""],
                      [
                        "Margen medio",
                        pct(margenes.venta - margenes.coste, margenes.venta),
                        (margenes.venta - margenes.coste) / margenes.venta < MARGEN_OBJETIVO ? "text-[#b3161b]" : "text-[#1e7e34]",
                      ],
                    ].map(([l, v, cls]) => (
                      <div key={l} className="rounded-md border border-[#e2e0dc] px-3 py-2">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-[#8a8a8a]">{l}</p>
                        <p className={`text-lg font-bold tabular-nums ${cls}`}>{v}</p>
                      </div>
                    ))}
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[760px] text-sm">
                      <thead className="text-left text-xs text-[#606060]">
                        <tr className="border-b border-[#e2e0dc]">
                          <th className="px-2 py-2 font-medium">Nº</th>
                          <th className="px-2 py-2 font-medium">Empresa</th>
                          <th className="px-2 py-2 font-medium">Estado</th>
                          <th className="px-2 py-2 text-right font-medium">Venta base</th>
                          <th className="px-2 py-2 text-right font-medium">Venta IVA incl.</th>
                          <th className="px-2 py-2 text-right font-medium">Coste</th>
                          <th className="px-2 py-2 text-right font-medium">Margen</th>
                          <th className="px-2 py-2 text-center font-medium">%</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(verTodoMargen ? margenes.l : margenes.l.slice(0, MAX_MARGEN)).map((o) => {
                          const m = o.margen!;
                          const bajo = m.pct < MARGEN_OBJETIVO;
                          return (
                            <tr key={o.codigo} onClick={() => abrir(o)} className={`cursor-pointer border-b border-[#efefec] hover:bg-[#fafaf8] ${bajo ? "bg-[#fdecec]" : ""}`}>
                              <td className="px-2 py-2">
                                <span className="font-semibold">{o.codigo}</span>
                                <MarcaBadge marca={o.marca} />
                                <span className="block text-xs text-[#8a8a8a]">{m.numero}</span>
                              </td>
                              <td className="px-2 py-2">{o.empresa || "—"}</td>
                              <td className="px-2 py-2">
                                <EstadoPill estado={o.estado} />
                              </td>
                              <td className="px-2 py-2 text-right tabular-nums">{eur(m.venta)}</td>
                              <td className="px-2 py-2 text-right tabular-nums">{eur(conIva(m.venta))}</td>
                              <td className="px-2 py-2 text-right tabular-nums">{eur(m.coste)}</td>
                              <td className="px-2 py-2 text-right tabular-nums">{eur(m.venta - m.coste)}</td>
                              <td className="px-2 py-2 text-center">
                                <span className={`font-bold ${bajo ? "text-[#b3161b]" : "text-[#1e7e34]"}`}>{Math.round(m.pct * 100)}%</span>
                                {m.sinCoste > 0 && (
                                  <span className="block text-xs text-[#8a8a8a]" title="Líneas con precio pero sin coste: el margen real será menor">
                                    {m.sinCoste} sin coste
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {margenes.l.length > MAX_MARGEN && (
                    <div className="mt-3 text-center">
                      <button
                        onClick={() => setVerTodoMargen((v) => !v)}
                        className="rounded-md border border-[#e2e0dc] bg-white px-3 py-1.5 text-sm font-medium hover:bg-[#f5f4f2]"
                      >
                        {verTodoMargen ? "Ver menos" : `Ver las ${margenes.l.length}`}
                      </button>
                    </div>
                  )}
                </>
              )}
            </Tarjeta>
          </div>
        )}
      </main>
      <FichaOportunidad o={fichaO} onCerrar={cerrarFicha} onCambio={recargar} />
    </div>
  );
}
