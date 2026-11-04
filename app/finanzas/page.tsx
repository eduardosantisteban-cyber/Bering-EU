"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ExternalLink, Loader2, Lock } from "lucide-react";
import { PortalHeader } from "../components/PortalNav";
import { Barras, Cargando, Kpi, Tarjeta } from "../components/portal";
import {
  SOCIEDAD_PRINCIPAL, enlaceDrive, gastosPorCategoria, importe, nombreMes, proyectos, pygMensual,
  type DocFin, type FilaPyG, type IncidenciaFin, type TipoDoc,
} from "@/lib/finanzas";

// Finanzas de gestión de Bering ES: cuenta de resultados mensual, margen real por proyecto (BEUQ),
// pendientes de la revisión del CFO y facturas con enlace a Drive. Importes sin IVA.
// Los datos los carga el agente CFO (revisión mensual, día 5) en Supabase; esta página solo lee.

interface Datos {
  documentos: DocFin[];
  incidencias: IncidenciaFin[];
  generado: string;
}

const C_VENTAS = "#1e7e34";
const C_COSTES = "#e83038";

const eur2 = (v: number | null | undefined) =>
  v === null || v === undefined || !isFinite(v) ? "—" : v.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
const pct1 = (v: number | null) => (v === null || !isFinite(v) ? "—" : (Math.round(v * 1000) / 10).toLocaleString("es-ES") + " %");
const fecha = (iso: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");

const NOMBRE_TIPO: Record<TipoDoc, string> = {
  venta: "Venta",
  cogs: "COGS",
  fijo: "Fijo",
  variable: "Variable",
  personal: "Personal",
  grupo: "Grupo (LU)",
};

const NOMBRE_INCIDENCIA: Record<IncidenciaFin["tipo"], string> = {
  faltante: "Falta documento",
  duplicado: "Duplicado",
  sin_emparejar: "COGS sin proyecto",
  cogs_pendiente: "COGS pendiente del proveedor",
  otra_sociedad: "Otra sociedad",
  ilegible: "Ilegible",
  otro: "Otro",
};

export default function FinanzasPage() {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sinAcceso, setSinAcceso] = useState<{ email: string | null } | null>(null);
  const [cargando, setCargando] = useState(true);
  const [mes, setMes] = useState(""); // "" = todos los meses
  const [filtroTipo, setFiltroTipo] = useState<"" | TipoDoc>("");

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const r = await fetch("/api/finanzas", { cache: "no-store" });
      if (r.status === 403) {
        const b = await r.json().catch(() => null);
        setSinAcceso({ email: b && typeof b.email === "string" ? b.email : null });
        return;
      }
      const b = await r.json();
      if (!r.ok) throw new Error(b?.error || `Error ${r.status}`);
      setDatos(b as Datos);
      setError(null);
    } catch (e) {
      setError((e as Error).message || "No se pudieron leer las finanzas");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial de datos
    cargar();
  }, [cargar]);

  const pyg = useMemo(() => (datos ? pygMensual(datos.documentos) : []), [datos]);
  const meses = useMemo(() => pyg.map((f) => f.mes), [pyg]);
  const delPeriodo = useMemo(() => (mes ? pyg.filter((f) => f.mes === mes) : pyg), [pyg, mes]);
  const total = useMemo(() => sumar(delPeriodo), [delPeriodo]);
  const abiertas = useMemo(() => (datos ? datos.incidencias.filter((i) => !i.resuelto) : []), [datos]);
  const proys = useMemo(() => (datos ? proyectos(datos.documentos, datos.incidencias) : []), [datos]);
  const mezcla = useMemo(() => (datos ? gastosPorCategoria(datos.documentos, new Set(delPeriodo.map((f) => f.mes))) : []), [datos, delPeriodo]);
  const sinNominas = delPeriodo.filter((f) => !f.personalCargado).map((f) => nombreMes(f.mes));
  const docs = useMemo(
    () => (datos ? datos.documentos.filter((d) => (!mes || d.mes === mes) && (!filtroTipo || d.tipo === filtroTipo)) : []),
    [datos, mes, filtroTipo],
  );

  return (
    <div className="flex min-h-screen flex-col">
      <PortalHeader>
        <button
          onClick={cargar}
          disabled={cargando}
          className="inline-flex items-center gap-1.5 rounded-md border border-white/20 bg-white/5 px-3 py-1.5 text-sm font-medium text-white hover:bg-white/10 disabled:opacity-50"
        >
          {cargando && <Loader2 size={14} className="animate-spin" />} Actualizar
        </button>
      </PortalHeader>

      <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 py-5 sm:px-5">
        {sinAcceso ? (
          <div className="mx-auto mt-16 max-w-md rounded-lg border border-[#e2e0dc] bg-white p-6 text-center">
            <Lock className="mx-auto text-[#606060]" size={22} />
            <p className="mt-3 font-semibold">Finanzas es privada</p>
            <p className="mt-1 text-sm text-[#606060]">
              {sinAcceso.email
                ? `Has entrado en Dársena como ${sinAcceso.email}, que no tiene acceso a Finanzas.`
                : "Has entrado en Dársena con la contraseña del equipo. Finanzas solo se ve entrando con tu cuenta de Google autorizada."}
            </p>
            <a
              href="/api/auth/google?next=%2Ffinanzas"
              className="mt-4 inline-block rounded-md bg-[#282828] px-4 py-2 text-sm font-medium text-white hover:bg-black"
            >
              Entrar con Google
            </a>
          </div>
        ) : error ? (
          <div className="rounded-lg border border-[#e83038]/30 bg-[#fdecec] p-4 text-sm text-[#8a1014]">
            <p className="font-semibold">No se pudieron leer las finanzas</p>
            <p className="mt-1">{error}</p>
            <button onClick={cargar} className="mt-3 rounded-md border border-[#e83038]/40 bg-white px-3 py-1 text-sm font-medium text-[#e83038]">
              Reintentar
            </button>
          </div>
        ) : !datos ? (
          <Cargando texto="Cargando finanzas…" />
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="text-xl font-bold">Finanzas · {SOCIEDAD_PRINCIPAL}</h1>
                <p className="text-sm text-[#606060]">
                  Cuenta de gestión sin IVA, a partir de las facturas de la carpeta de la gestoría. La actualiza el agente CFO el día 5 de cada mes.
                </p>
              </div>
              <select
                value={mes}
                onChange={(e) => setMes(e.target.value)}
                className="rounded-md border border-[#e2e0dc] bg-white px-2 py-1.5 text-sm"
                aria-label="Mes"
              >
                <option value="">Todos los meses</option>
                {[...meses].reverse().map((m) => (
                  <option key={m} value={m}>{nombreMes(m)}</option>
                ))}
              </select>
            </div>

            {sinNominas.length > 0 && (
              <p className="rounded-md border border-[#f0d9a8] bg-[#fff8e8] px-3 py-2 text-sm text-[#7a4a00]">
                Sin coste de personal cargado en {sinNominas.join(", ")}: el resultado de esos meses no incluye nóminas todavía.
              </p>
            )}

            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              <Kpi label="Ventas" valor={eur2(total.ventas)} sub={mes ? nombreMes(mes) : `${meses.length} meses`} />
              <Kpi label="Margen bruto" valor={eur2(total.margenBruto)} sub={total.ventas ? pct1(total.margenBruto / total.ventas) + " sobre ventas" : undefined} alerta={total.margenBruto < 0} />
              <Kpi label="Gastos de estructura" valor={eur2(total.fijos + total.variables + total.personal)} sub="fijos + variables + personal" />
              <Kpi label="Resultado operativo" valor={eur2(total.resultado)} alerta={total.resultado < 0} />
              <Kpi label="Pendientes abiertos" valor={String(abiertas.length)} sub="ver lista abajo" alerta={abiertas.length > 0} />
            </div>

            <Tarjeta titulo="Cuenta de resultados" sub="Base imponible por mes de factura. Los COGS se imputan al mes de la factura del proveedor.">
              <TablaPyG filas={pyg} />
            </Tarjeta>

            <div className="grid gap-4 lg:grid-cols-2">
              <Tarjeta titulo="Ventas y costes por mes" sub="Costes = COGS + fijos + variables + personal">
                <VentasCostes filas={pyg} />
              </Tarjeta>
              <Tarjeta titulo="Gastos de estructura por categoría" sub={mes ? nombreMes(mes) : "Todos los meses"}>
                <Barras filas={mezcla.map((m) => ({ k: m.k, n: m.n, detalle: eur2(m.n) }))} color="#606060" />
              </Tarjeta>
            </div>

            <Tarjeta titulo="Margen por proyecto" sub="Venta a cliente frente a la factura del proveedor (COGS) del mismo BEUQ">
              {proys.length === 0 ? (
                <p className="text-sm text-[#606060]">Aún no hay ventas ni COGS asignados a proyectos.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[620px] text-sm">
                    <thead>
                      <tr className="border-b border-[#e2e0dc] text-left text-xs text-[#606060]">
                        <th className="py-2 pr-3 font-medium">Proyecto</th>
                        <th className="py-2 pr-3 font-medium">Cliente</th>
                        <th className="py-2 pr-3 text-right font-medium">Venta</th>
                        <th className="py-2 pr-3 text-right font-medium">COGS</th>
                        <th className="py-2 pr-3 text-right font-medium">Margen</th>
                        <th className="py-2 font-medium">Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {proys.map((p) => (
                        <tr key={p.beuq} className="border-b border-[#f1f1ef] last:border-0">
                          <td className="py-2 pr-3 font-medium">{p.beuq}</td>
                          <td className="py-2 pr-3">{p.cliente || "—"}</td>
                          <td className="py-2 pr-3 text-right tabular-nums">{eur2(p.ventas)}</td>
                          <td className="py-2 pr-3 text-right tabular-nums">{p.cogs ? eur2(p.cogs) : "—"}</td>
                          <td className="py-2 pr-3 text-right tabular-nums">
                            {p.estado === "completo" ? `${eur2(p.margen)} · ${pct1(p.margenPct)}` : "—"}
                          </td>
                          <td className="py-2">
                            <EstadoProyecto estado={p.estado} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Tarjeta>

            <Tarjeta titulo="Pendientes" sub="De la revisión mensual del CFO: lo que falta o no cuadra">
              {abiertas.length === 0 ? (
                <p className="text-sm text-[#606060]">Nada pendiente.</p>
              ) : (
                <ul className="flex flex-col divide-y divide-[#f1f1ef]">
                  {abiertas.map((i) => (
                    <li key={i.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2 text-sm">
                      <span className="rounded bg-[#f1f1ef] px-1.5 py-0.5 text-xs font-medium text-[#606060]">{NOMBRE_INCIDENCIA[i.tipo] || i.tipo}</span>
                      <span className="min-w-0 flex-1">{i.descripcion}</span>
                      {i.beuq && <span className="text-xs text-[#606060]">{i.beuq}</span>}
                      {i.importe !== null && <span className="text-xs tabular-nums text-[#606060]">{eur2(i.importe)}</span>}
                      <EnlaceDrive id={i.drive_id} />
                    </li>
                  ))}
                </ul>
              )}
            </Tarjeta>

            <Tarjeta
              titulo="Documentos"
              sub={`${docs.length} ${docs.length === 1 ? "documento" : "documentos"}${mes ? " · " + nombreMes(mes) : ""}`}
              accion={
                <select
                  value={filtroTipo}
                  onChange={(e) => setFiltroTipo(e.target.value as "" | TipoDoc)}
                  className="rounded-md border border-[#e2e0dc] bg-white px-2 py-1 text-xs"
                  aria-label="Tipo de documento"
                >
                  <option value="">Todos los tipos</option>
                  {(Object.keys(NOMBRE_TIPO) as TipoDoc[]).map((t) => (
                    <option key={t} value={t}>{NOMBRE_TIPO[t]}</option>
                  ))}
                </select>
              }
            >
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-sm">
                  <thead>
                    <tr className="border-b border-[#e2e0dc] text-left text-xs text-[#606060]">
                      <th className="py-2 pr-3 font-medium">Fecha</th>
                      <th className="py-2 pr-3 font-medium">Tipo</th>
                      <th className="py-2 pr-3 font-medium">Contraparte</th>
                      <th className="py-2 pr-3 font-medium">Nº</th>
                      <th className="py-2 pr-3 font-medium">Categoría</th>
                      <th className="py-2 pr-3 text-right font-medium">Base</th>
                      <th className="py-2 pr-3 text-right font-medium">Total</th>
                      <th className="py-2 font-medium" aria-label="Drive" />
                    </tr>
                  </thead>
                  <tbody>
                    {docs.map((d) => (
                      <tr key={d.id} className="border-b border-[#f1f1ef] last:border-0" title={d.notas || undefined}>
                        <td className="py-1.5 pr-3 tabular-nums">{fecha(d.fecha)}</td>
                        <td className="py-1.5 pr-3">{NOMBRE_TIPO[d.tipo]}</td>
                        <td className="py-1.5 pr-3">
                          {d.contraparte}
                          {d.beuq && <span className="ml-1.5 text-xs text-[#606060]">{d.beuq}</span>}
                        </td>
                        <td className="py-1.5 pr-3 text-xs text-[#606060]">{d.numero}</td>
                        <td className="py-1.5 pr-3 text-xs text-[#606060]">
                          {d.categoria || "—"}
                          {d.isp && " · ISP"}
                          {d.ticket && " · ticket"}
                        </td>
                        <td className="py-1.5 pr-3 text-right tabular-nums">{importe(d) !== null ? eur2(importe(d)) : "—"}</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums">
                          {d.total === null ? "—" : d.moneda === "EUR" ? eur2(d.total) : `${d.total.toLocaleString("es-ES", { minimumFractionDigits: 2 })} ${d.moneda}`}
                        </td>
                        <td className="py-1.5">
                          <EnlaceDrive id={d.drive_id} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Tarjeta>

            <p className="text-xs text-[#8a8a8a]">
              Bering LU (holding) aparece en Documentos como «Grupo (LU)» y no entra en la cuenta de Bering ES. Importes en otra moneda no se suman.
              Actualizado {new Date(datos.generado).toLocaleString("es-ES")}.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}

function sumar(filas: FilaPyG[]) {
  const t = { ventas: 0, cogs: 0, margenBruto: 0, fijos: 0, variables: 0, personal: 0, resultado: 0 };
  for (const f of filas) {
    t.ventas += f.ventas;
    t.cogs += f.cogs;
    t.margenBruto += f.margenBruto;
    t.fijos += f.fijos;
    t.variables += f.variables;
    t.personal += f.personal;
    t.resultado += f.resultado;
  }
  return t;
}

function TablaPyG({ filas }: { filas: FilaPyG[] }) {
  if (!filas.length) return <p className="text-sm text-[#606060]">Aún no hay datos.</p>;
  const t = sumar(filas);
  const lineas: { k: string; v: (f: FilaPyG | ReturnType<typeof sumar>) => number; fuerte?: boolean; resta?: boolean }[] = [
    { k: "Ventas", v: (f) => f.ventas },
    { k: "COGS (proveedores)", v: (f) => f.cogs, resta: true },
    { k: "Margen bruto", v: (f) => f.margenBruto, fuerte: true },
    { k: "Gastos fijos", v: (f) => f.fijos, resta: true },
    { k: "Gastos variables", v: (f) => f.variables, resta: true },
    { k: "Personal", v: (f) => f.personal, resta: true },
    { k: "Resultado operativo", v: (f) => f.resultado, fuerte: true },
  ];
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-sm">
        <thead>
          <tr className="border-b border-[#e2e0dc] text-xs text-[#606060]">
            <th className="py-2 pr-3 text-left font-medium" />
            {filas.map((f) => (
              <th key={f.mes} className="py-2 pr-3 text-right font-medium">{nombreMes(f.mes)}</th>
            ))}
            <th className="py-2 text-right font-semibold text-[#282828]">Total</th>
          </tr>
        </thead>
        <tbody>
          {lineas.map((l) => (
            <tr key={l.k} className={`border-b border-[#f1f1ef] last:border-0 ${l.fuerte ? "font-semibold" : ""}`}>
              <td className="py-1.5 pr-3">{l.k}</td>
              {filas.map((f) => {
                const v = l.v(f);
                const vacio = l.k === "Personal" && !f.personalCargado;
                return (
                  <td key={f.mes} className={`py-1.5 pr-3 text-right tabular-nums ${l.fuerte && v < 0 ? "text-[#e83038]" : ""} ${vacio ? "text-[#b0b0ac]" : ""}`}>
                    {vacio ? "sin cargar" : eur2(l.resta && v ? -v : v)}
                  </td>
                );
              })}
              <td className={`py-1.5 text-right tabular-nums font-semibold ${l.fuerte && l.v(t) < 0 ? "text-[#e83038]" : ""}`}>
                {eur2(l.resta && l.v(t) ? -l.v(t) : l.v(t))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Barras verticales emparejadas: ventas frente a costes totales de cada mes. */
function VentasCostes({ filas }: { filas: FilaPyG[] }) {
  if (!filas.length) return <p className="text-sm text-[#606060]">Aún no hay datos.</p>;
  const costes = (f: FilaPyG) => f.cogs + f.fijos + f.variables + f.personal;
  const max = Math.max(1, ...filas.map((f) => Math.max(f.ventas, costes(f))));
  return (
    <div>
      <div className="mb-2 flex gap-4 text-xs text-[#606060]">
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: C_VENTAS }} /> Ventas</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: C_COSTES }} /> Costes</span>
      </div>
      <div className="flex h-44 items-end gap-3 border-b border-[#e2e0dc]">
        {filas.map((f) => (
          <div key={f.mes} className="flex h-full min-w-0 flex-1 items-end justify-center gap-1" title={`${nombreMes(f.mes)} · ventas ${eur2(f.ventas)} · costes ${eur2(costes(f))}`}>
            <span className="w-1/3 max-w-6 rounded-t" style={{ height: `${(100 * f.ventas) / max}%`, background: C_VENTAS }} />
            <span className="w-1/3 max-w-6 rounded-t" style={{ height: `${(100 * costes(f)) / max}%`, background: C_COSTES }} />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-3">
        {filas.map((f) => (
          <span key={f.mes} className="min-w-0 flex-1 truncate text-center text-xs text-[#606060]">{nombreMes(f.mes)}</span>
        ))}
      </div>
    </div>
  );
}

function EstadoProyecto({ estado }: { estado: "completo" | "cogs_pendiente" | "sin_venta" }) {
  const e = {
    completo: { t: "Margen real", c: "bg-[#e6f4ea] text-[#1e7e34]" },
    cogs_pendiente: { t: "COGS pendiente", c: "bg-[#fff4e0] text-[#9a5b00]" },
    sin_venta: { t: "Sin factura de venta", c: "bg-[#f1f1ef] text-[#606060]" },
  }[estado];
  return <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${e.c}`}>{e.t}</span>;
}

function EnlaceDrive({ id }: { id: string | null }) {
  const url = enlaceDrive(id);
  if (!url) return null;
  return (
    <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-[#2a5d99] hover:underline" aria-label="Abrir en Drive">
      Drive <ExternalLink size={12} />
    </a>
  );
}
