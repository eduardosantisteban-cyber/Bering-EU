"use client";

import { useMemo, useState } from "react";
import { Database, RotateCcw } from "lucide-react";
import { PortalHeader } from "../components/PortalNav";
import { personasDe, usePortalData } from "../components/portal";
import {
  ESCENARIOS,
  SUPUESTOS_INICIALES,
  TAREAS,
  calcularProductividad,
  datosReales,
  supuestosDeEscenario,
  type Escenario,
  type Supuestos,
  type Tarea,
} from "@/lib/productividad";
import { nombreDeEmail } from "@/lib/solicitudes";

// Calculadora de productividad comercial: tiempo que libera la automatización por presupuesto
// y cuánto se podría subir el objetivo de venta de cada comercial. Supuestos editables.

const eur = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const n1 = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1 });
const n0 = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 });

const CAMPOS: { k: keyof Supuestos; label: string; unidad: string; step: number; ayuda?: string }[] = [
  { k: "vol", label: "Solicitudes de presupuesto", unidad: "/ mes por comercial", step: 1 },
  { k: "horas", label: "Horas de trabajo", unidad: "h / mes", step: 1 },
  { k: "cierre", label: "Tasa de cierre actual", unidad: "%", step: 1 },
  { k: "ticket", label: "Importe medio por pedido", unidad: "€ sin IVA", step: 500 },
  { k: "reinv", label: "Tiempo ahorrado dedicado a vender", unidad: "%", step: 5, ayuda: "Prospección, visitas, seguimiento" },
  { k: "capt", label: "Horas para conseguir 1 solicitud nueva", unidad: "h", step: 0.5, ayuda: "Llamadas, visitas, contactos" },
  { k: "dcierre", label: "Mejora de cierre por responder antes", unidad: "puntos %", step: 0.5 },
  { k: "prud", label: "Parte de la mejora que se exige", unidad: "%", step: 5, ayuda: "Margen de prudencia para el objetivo" },
];

export default function ProductividadPage() {
  const { data } = usePortalData();
  const [escenario, setEscenario] = useState<Escenario>("base");
  const [s, setS] = useState<Supuestos>(SUPUESTOS_INICIALES);
  const [tareas, setTareas] = useState<Tarea[]>(TAREAS);
  const [persona, setPersona] = useState("");
  const [origen, setOrigen] = useState("");

  const r = useMemo(() => calcularProductividad(s, tareas), [s, tareas]);
  const ops = useMemo(() => data?.oportunidades ?? [], [data]);
  const personas = useMemo(() => personasDe(ops), [ops]);
  const maxMin = Math.max(1, ...tareas.flatMap((t) => [t.antes, t.ahora]));

  const set = (k: keyof Supuestos, v: string) => setS((x) => ({ ...x, [k]: v === "" ? 0 : Number(v) }));
  const cambiarEscenario = (e: Escenario) => {
    setEscenario(e);
    setS((x) => supuestosDeEscenario(x, e));
  };
  const usarDatos = () => {
    if (!data) return;
    const l = persona ? ops.filter((o) => o.registradoPor === persona) : ops;
    const d = datosReales(l, new Date(data.generado));
    setS((x) => ({ ...x, ...(d.vol !== undefined && { vol: d.vol }), ...(d.cierre !== undefined && { cierre: d.cierre }), ...(d.ticket !== undefined && { ticket: d.ticket }) }));
    setOrigen(
      d.detalle.length
        ? `Datos del portal${persona ? ` (${nombreDeEmail(persona)})` : " (todo el equipo)"}: ${d.detalle.join(" · ")}.`
        : "No hay datos suficientes en el portal para rellenar la calculadora."
    );
  };
  const reiniciar = () => {
    setS(supuestosDeEscenario(SUPUESTOS_INICIALES, escenario));
    setTareas(TAREAS);
    setOrigen("");
  };

  const input = "w-full min-w-0 bg-transparent px-2.5 py-1.5 text-sm font-semibold tabular-nums outline-none";

  return (
    <div className="flex min-h-screen flex-col">
      <PortalHeader />

      <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 py-5 sm:px-5">
        <div className="mb-4 border-l-4 border-[#e83038] pl-3">
          <p className="text-xs font-bold uppercase tracking-wider text-[#b5232a]">Automatización de presupuestos</p>
          <h1 className="text-xl font-bold">¿Cuánto más puede vender un comercial?</h1>
          <p className="max-w-3xl text-sm text-[#606060]">
            Calcula el tiempo que libera la automatización por presupuesto y cuánto se podría subir el objetivo de venta. Todas las cifras son supuestos
            editables: ajústalos a vuestros datos reales o rellénalos con los del portal.
          </p>
        </div>

        <div className="grid items-start gap-4 lg:grid-cols-[1.15fr_1fr]">
          {/* Supuestos */}
          <section className="flex min-w-0 flex-col gap-4 rounded-lg border border-[#e2e0dc] bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide">Supuestos</h2>
              <div className="flex flex-wrap items-center gap-2">
                {personas.length > 1 && (
                  <select
                    aria-label="Datos de"
                    value={persona}
                    onChange={(e) => setPersona(e.target.value)}
                    className="rounded-md border border-[#e2e0dc] bg-white px-2 py-1 text-xs font-medium outline-none focus:border-[#e83038]"
                  >
                    <option value="">Todo el equipo</option>
                    {personas.map((p) => (
                      <option key={p} value={p}>
                        {nombreDeEmail(p)}
                      </option>
                    ))}
                  </select>
                )}
                <button
                  type="button"
                  onClick={usarDatos}
                  disabled={!data}
                  className="inline-flex items-center gap-1 rounded-md border border-[#e2e0dc] bg-white px-2.5 py-1 text-xs font-semibold hover:border-[#606060] disabled:opacity-50"
                  title="Solicitudes al mes, tasa de cierre e importe medio a partir de la tabla Solicitudes"
                >
                  <Database size={13} /> Usar datos del portal
                </button>
                <button
                  type="button"
                  onClick={reiniciar}
                  className="inline-flex items-center gap-1 rounded-md border border-[#e2e0dc] bg-white px-2.5 py-1 text-xs font-semibold hover:border-[#606060]"
                >
                  <RotateCcw size={13} /> Reiniciar
                </button>
              </div>
            </div>
            {origen && <p className="rounded-md bg-[#e8f0fa] px-3 py-2 text-xs text-[#2a5d99]">{origen}</p>}

            <div className="flex flex-wrap gap-2" role="group" aria-label="Escenario">
              {(Object.keys(ESCENARIOS) as Escenario[]).map((e) => (
                <button
                  key={e}
                  type="button"
                  aria-pressed={escenario === e}
                  onClick={() => cambiarEscenario(e)}
                  className={`rounded-full border px-3.5 py-1.5 text-sm font-semibold capitalize ${
                    escenario === e ? "border-[#e83038] bg-[#e83038] text-white" : "border-[#e2e0dc] bg-[#f5f4f2] hover:border-[#606060]"
                  }`}
                >
                  {e}
                </button>
              ))}
            </div>
            <p className="-mt-2 text-xs text-[#606060]">{ESCENARIOS[escenario].descripcion}</p>

            <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
              {CAMPOS.map((c) => (
                <label key={c.k} className="flex min-w-0 flex-col gap-1">
                  <span className="text-xs font-semibold">{c.label}</span>
                  <span className="flex items-center overflow-hidden rounded-md border border-[#e2e0dc] bg-[#f5f4f2] focus-within:border-[#e83038]">
                    <input type="number" min={0} step={c.step} value={s[c.k]} onChange={(e) => set(c.k, e.target.value)} className={input} />
                    <span className="whitespace-nowrap px-2.5 text-xs text-[#606060]">{c.unidad}</span>
                  </span>
                  {c.ayuda && <span className="text-xs text-[#8a8a8a]">{c.ayuda}</span>}
                </label>
              ))}
            </div>

            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide">Minutos por presupuesto</h2>
              <p className="text-xs text-[#606060]">Tiempo medio de cada tarea, antes y con la automatización. Edita los que no cuadren.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-sm">
                <thead className="text-left text-xs text-[#606060]">
                  <tr className="border-b border-[#e2e0dc]">
                    <th className="px-2 py-1.5 font-medium">Tarea</th>
                    <th className="px-2 py-1.5 text-right font-medium">Antes</th>
                    <th className="px-2 py-1.5 text-right font-medium">Ahora</th>
                    <th className="px-2 py-1.5 text-right font-medium">Ahorro</th>
                  </tr>
                </thead>
                <tbody>
                  {tareas.map((t, i) => (
                    <tr key={t.nombre} className="border-b border-[#efefec]">
                      <td className="px-2 py-1.5">
                        {t.nombre}
                        <span className="relative mt-1 block h-1.5 min-w-[80px] rounded bg-[#efefec]" aria-hidden>
                          <span className="absolute inset-y-0 left-0 rounded bg-[#9a9a9e]" style={{ width: `${(100 * t.antes) / maxMin}%` }} />
                          <span className="absolute inset-y-0 left-0 rounded bg-[#e83038]" style={{ width: `${(100 * t.ahora) / maxMin}%` }} />
                        </span>
                      </td>
                      {(["antes", "ahora"] as const).map((k) => (
                        <td key={k} className="px-2 py-1.5 text-right">
                          <input
                            type="number"
                            min={0}
                            step={1}
                            value={t[k]}
                            aria-label={`Minutos ${k}: ${t.nombre}`}
                            onChange={(e) => {
                              const v = e.target.value === "" ? 0 : Number(e.target.value);
                              setTareas((l) => l.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
                            }}
                            className="w-16 rounded border border-[#e2e0dc] bg-[#f5f4f2] px-1.5 py-1 text-right font-semibold tabular-nums outline-none focus:border-[#e83038]"
                          />
                        </td>
                      ))}
                      <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums">{n0.format(t.antes - t.ahora)} min</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="font-bold">
                    <td className="px-2 py-2">Total por presupuesto</td>
                    <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums">{n0.format(r.minAntes)} min</td>
                    <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums">{n0.format(r.minAhora)} min</td>
                    <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums">{n0.format(r.minAntes - r.minAhora)} min</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>

          {/* Resultado */}
          <section className="flex min-w-0 flex-col gap-4 rounded-lg border border-[#e2e0dc] bg-white p-4 lg:sticky lg:top-20" aria-live="polite">
            <h2 className="text-sm font-semibold uppercase tracking-wide">Resultado por comercial</h2>
            <div className="rounded-lg bg-[#e83038] px-5 py-4 text-white">
              <p className="text-xs font-bold uppercase tracking-wider opacity-90">Subida de objetivo recomendada</p>
              <p className="text-5xl font-bold tabular-nums leading-tight">+{n0.format(r.subida * 100)} %</p>
              <p className="text-sm">
                Se exige el {n0.format(s.prud)} % de la mejora teórica (+{n0.format(r.mejora * 100)} %), para dejar margen a imprevistos.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                [n1.format(r.horasLiberadas) + " h", "horas liberadas al mes"],
                [n0.format(r.pctTiempo * 100) + " %", "de su tiempo de trabajo"],
                [r.veces ? "×" + n1.format(r.veces) : "—", "más rápido por presupuesto"],
                ["+" + n1.format(r.extra), "solicitudes extra al mes"],
              ].map(([v, l]) => (
                <div key={l} className="rounded-lg bg-[#f5f4f2] px-3 py-3">
                  <p className="text-2xl font-bold tabular-nums">{v}</p>
                  <p className="text-xs text-[#606060]">{l}</p>
                </div>
              ))}
            </div>
            <dl className="divide-y divide-[#efefec] text-sm">
              {[
                ["Venta actual estimada", eur.format(r.ventaBase) + " / mes", false],
                ["+ Por más solicitudes trabajadas", eur.format(r.ventaVolumen) + " / mes", false],
                ["+ Por responder antes (mejor cierre)", eur.format(r.ventaRapidez) + " / mes", false],
                ["Venta potencial", eur.format(r.ventaBase + r.ventaVolumen + r.ventaRapidez) + " / mes", true],
                ["Mejora teórica", "+" + n0.format(r.mejora * 100) + " %", false],
              ].map(([l, v, t]) => (
                <div key={l as string} className="flex justify-between gap-3 py-1.5">
                  <dt className={t ? "font-bold" : ""}>{l}</dt>
                  <dd className={`text-right font-bold tabular-nums ${t ? "text-[#b5232a]" : ""}`}>{v}</dd>
                </div>
              ))}
            </dl>
            <dl className="divide-y divide-[#efefec] text-sm">
              <div className="flex justify-between gap-3 py-1.5">
                <dt>Objetivo anual actual (estimado)</dt>
                <dd className="text-right font-bold tabular-nums">{eur.format(r.objetivoActual)}</dd>
              </div>
              <div className="flex justify-between gap-3 py-1.5">
                <dt className="font-bold">Objetivo anual propuesto</dt>
                <dd className="text-right font-bold tabular-nums text-[#b5232a]">{eur.format(r.objetivoPropuesto)}</dd>
              </div>
            </dl>
            <p className="rounded-md bg-[#f5f4f2] px-3 py-2 text-xs text-[#606060]">
              Importes sin IVA. Son estimaciones, no garantías: antes de cambiar objetivos, mide 2–3 meses de tiempos y volúmenes reales y vuelve a calcular con
              ellos.
            </p>
            <details className="border-t border-[#efefec] pt-3 text-sm">
              <summary className="cursor-pointer font-semibold">Cómo se calcula</summary>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-[#606060]">
                <li>
                  <b>Horas liberadas</b> = (minutos antes − minutos ahora) × solicitudes al mes ÷ 60.
                </li>
                <li>
                  <b>Solicitudes extra</b> = horas liberadas × % dedicado a vender ÷ (horas para conseguir una solicitud + horas para presupuestarla con la
                  automatización).
                </li>
                <li>
                  <b>Venta por volumen</b> = solicitudes extra × tasa de cierre mejorada × importe medio.
                </li>
                <li>
                  <b>Venta por rapidez</b> = solicitudes actuales × mejora de cierre × importe medio.
                </li>
                <li>
                  <b>Subida recomendada</b> = (venta extra ÷ venta actual) × parte que se exige.
                </li>
                <li>
                  <b>Usar datos del portal</b>: solicitudes al mes por comercial (últimos 90 días), tasa de cierre (ganadas ÷ cerradas) e importe medio de las
                  ganadas (o de las presupuestadas si aún no hay ganadas).
                </li>
              </ol>
            </details>
          </section>
        </div>
      </main>
    </div>
  );
}
