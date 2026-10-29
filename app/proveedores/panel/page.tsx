"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, Plus, Save, Trash2 } from "lucide-react";
import { PortalHeader } from "../../components/PortalNav";
import { Cargando, ErrorDatos, Tarjeta, dias1, eur, fechaCorta } from "../../components/portal";
import type { FilaProveedor } from "@/lib/darsena";

// Proveedores en Dársena: cómo responde y qué precios da cada proveedor, y las dos tablas que usa la automatización
// (pestañas "Prioridad de proveedores" y "Costes instalación y transporte" de la hoja Solicitudes), editables aquí.

type Celda = string | number;
interface Datos {
  filas: FilaProveedor[];
  prioridad: Celda[][];
  costes: Celda[][];
  avisos: string[];
}

const COLS_PRIORIDAD = ["Tipo de producto", "Proveedor 1", "Proveedor 2", "Proveedor 3", "Por volumen: pasar a", "Desde (uds)", "Palabras clave", "Notas para elegir modelo"];
const COLS_COSTES = ["Tipo de producto", "Instalación €/ud", "Transporte €/ud", "Mínimo transporte/pedido", "Usar"];

const pctSigno = (v: number | null) => (v === null ? "—" : (v > 0 ? "+" : "") + Math.round(v * 100) + " %");
const numero = (v: Celda) => (v === "" || v === null || v === undefined ? null : Number(v));

export default function ProveedoresPanelPage() {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [prioridad, setPrioridad] = useState<Celda[][]>([]);
  const [costes, setCostes] = useState<Celda[][]>([]);
  const [guardando, setGuardando] = useState<"" | "prioridad" | "costes">("");
  const [mensaje, setMensaje] = useState<{ tabla: string; ok: boolean; texto: string } | null>(null);
  const [orden, setOrden] = useState<"peticiones" | "respuesta" | "precio">("peticiones");

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const res = await fetch("/api/darsena/proveedores", { cache: "no-store" });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || `Error ${res.status}`);
      setDatos(body as Datos);
      setPrioridad((body as Datos).prioridad.map((r) => [...r]));
      setCostes((body as Datos).costes.map((r) => [...r]));
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial de datos
    cargar();
  }, [cargar]);

  const nombres = useMemo(() => {
    const s = new Set<string>();
    for (const f of datos?.filas ?? []) s.add(f.proveedor);
    for (const r of prioridad) for (const i of [1, 2, 3, 4]) if (String(r[i] ?? "").trim()) s.add(String(r[i]).trim());
    return [...s].sort((a, b) => a.localeCompare(b));
  }, [datos, prioridad]);

  const filas = useMemo(() => {
    const l = [...(datos?.filas ?? [])];
    if (orden === "respuesta") l.sort((a, b) => (b.tasaRespuesta ?? -1) - (a.tasaRespuesta ?? -1) || (a.medianaDias ?? 99) - (b.medianaDias ?? 99));
    if (orden === "precio") l.sort((a, b) => (a.indicePrecio ?? 99) - (b.indicePrecio ?? 99));
    return l;
  }, [datos, orden]);

  async function guardar(tabla: "prioridad" | "costes") {
    setGuardando(tabla);
    setMensaje(null);
    try {
      const res = await fetch("/api/darsena/proveedores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tabla, filas: tabla === "prioridad" ? prioridad : costes.map((r) => r.slice(0, 5)) }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || `Error ${res.status}`);
      setMensaje({ tabla, ok: true, texto: `Guardado (${body.filas} filas). La automatización lo usa desde el siguiente presupuesto.` });
      const copia = (tabla === "prioridad" ? prioridad : costes).map((r) => [...r]);
      setDatos((d) => (!d ? d : tabla === "prioridad" ? { ...d, prioridad: copia } : { ...d, costes: copia }));
    } catch (err) {
      setMensaje({ tabla, ok: false, texto: (err as Error).message });
    } finally {
      setGuardando("");
    }
  }

  const editar = (set: typeof setPrioridad, i: number, j: number, v: string) =>
    set((t) => t.map((r, k) => (k === i ? r.map((c, m) => (m === j ? v : c)) : r)));

  const cambiosPrioridad = JSON.stringify(prioridad) !== JSON.stringify(datos?.prioridad ?? []);
  const cambiosCostes = JSON.stringify(costes) !== JSON.stringify(datos?.costes ?? []);
  const input = "w-full min-w-0 rounded border border-[#e2e0dc] bg-white px-1.5 py-1 text-sm focus:border-[#282828] focus:outline-none";

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
        <h1 className="text-xl font-bold">Proveedores</h1>
        <p className="mb-4 text-sm text-[#606060]">
          Cómo responden y qué precios dan, y las tablas de prioridad y de costes que usa la automatización. Los precios de cada presupuesto están en{" "}
          <Link href="/proveedores" className="font-medium text-[#e83038] hover:underline">
            Precios
          </Link>
          .
        </p>
        <datalist id="lista-proveedores">
          {nombres.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>

        {cargando && !datos ? (
          <Cargando />
        ) : error && !datos ? (
          <ErrorDatos mensaje={error} onReintentar={cargar} />
        ) : (
          <div className="flex flex-col gap-4">
            {(datos?.avisos ?? []).map((a) => (
              <p key={a} className="rounded-md bg-[#fff4e0] px-3 py-2 text-sm text-[#9a5b00]">
                {a}
              </p>
            ))}

            <Tarjeta
              titulo={`Rendimiento · ${filas.length}`}
              sub="Peticiones de precio desde los Sheets (respuesta = el proveedor contestó) y precio frente al resto: mediana de su €/m² frente a la de su tipo de producto en los últimos 24 meses (− es más barato)."
              accion={
                <select value={orden} onChange={(e) => setOrden(e.target.value as typeof orden)} className="rounded border border-[#e2e0dc] bg-white px-2 py-1 text-xs">
                  <option value="peticiones">Más peticiones</option>
                  <option value="respuesta">Mejor respuesta</option>
                  <option value="precio">Más barato</option>
                </select>
              }
            >
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-sm">
                  <thead className="text-left text-xs text-[#606060]">
                    <tr>
                      <th className="py-1.5 pr-2 font-medium">Proveedor</th>
                      <th className="py-1.5 pr-2 text-right font-medium">Peticiones</th>
                      <th className="py-1.5 pr-2 text-right font-medium">Responde</th>
                      <th className="py-1.5 pr-2 text-right font-medium">Tarda (mediana)</th>
                      <th className="py-1.5 pr-2 text-right font-medium">Sin respuesta</th>
                      <th className="py-1.5 pr-2 text-right font-medium">Precio vs resto</th>
                      <th className="py-1.5 pr-2 text-right font-medium">Líneas de precio</th>
                      <th className="py-1.5 text-right font-medium">Último presupuesto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filas.map((f) => (
                      <tr key={f.proveedor} className="border-t border-[#efefec]">
                        <td className="py-1.5 pr-2 font-medium">{f.proveedor}</td>
                        <td className="py-1.5 pr-2 text-right tabular-nums">
                          {f.peticiones || "—"}
                          {f.pendientes > 0 && <span className="text-xs text-[#8a8a8a]"> ({f.pendientes} esperando)</span>}
                        </td>
                        <td
                          className={`py-1.5 pr-2 text-right tabular-nums ${f.tasaRespuesta !== null && f.peticiones >= 3 && f.tasaRespuesta < 0.5 ? "font-semibold text-[#b3161b]" : ""}`}
                        >
                          {f.tasaRespuesta === null ? "—" : Math.round(f.tasaRespuesta * 100) + " %"}
                        </td>
                        <td className={`py-1.5 pr-2 text-right tabular-nums ${f.medianaDias !== null && f.medianaDias > 5 ? "text-[#b45309]" : ""}`}>{dias1(f.medianaDias)}</td>
                        <td className="py-1.5 pr-2 text-right tabular-nums">{f.sinRespuesta || "—"}</td>
                        <td
                          className={`py-1.5 pr-2 text-right font-medium tabular-nums ${
                            f.indicePrecio === null ? "" : f.indicePrecio > 0.1 ? "text-[#b3161b]" : f.indicePrecio < -0.1 ? "text-[#1e7e34]" : ""
                          }`}
                        >
                          {pctSigno(f.indicePrecio)}
                        </td>
                        <td className="py-1.5 pr-2 text-right tabular-nums">{f.lineasPrecio || "—"}</td>
                        <td className="py-1.5 text-right tabular-nums">{fechaCorta(f.ultimoPresupuesto)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Tarjeta>

            <Tarjeta
              titulo="Prioridad de proveedores"
              sub="El precio de referencia se busca primero en el proveedor 1; si no tiene uno comparable, en el 2 y luego en el 3. «Por volumen»: a partir de esas unidades de ese tipo en el presupuesto, ese proveedor pasa a ser el primero. Las palabras clave sirven para productos sin tipo propio (topes, mesas elevadoras…)."
              accion={
                <BotonGuardar
                  onClick={() => guardar("prioridad")}
                  guardando={guardando === "prioridad"}
                  cambios={cambiosPrioridad}
                />
              }
            >
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1100px] text-sm">
                  <thead className="text-left text-xs text-[#606060]">
                    <tr>
                      {COLS_PRIORIDAD.map((c) => (
                        <th key={c} className="py-1.5 pr-1.5 font-medium">
                          {c}
                        </th>
                      ))}
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {prioridad.map((r, i) => (
                      <tr key={i} className="border-t border-[#efefec] align-top">
                        {COLS_PRIORIDAD.map((_, j) => (
                          <td key={j} className={`py-1 pr-1.5 ${j === 0 ? "w-[190px]" : j === 5 ? "w-[80px]" : j === 7 ? "w-[260px]" : ""}`}>
                            {j === 7 ? (
                              <textarea rows={1} value={String(r[j] ?? "")} onChange={(e) => editar(setPrioridad, i, j, e.target.value)} className={input + " resize-y"} />
                            ) : (
                              <input
                                value={String(r[j] ?? "")}
                                onChange={(e) => editar(setPrioridad, i, j, e.target.value)}
                                list={j >= 1 && j <= 4 ? "lista-proveedores" : undefined}
                                inputMode={j === 5 ? "numeric" : undefined}
                                className={input + (j === 0 ? " font-medium" : "")}
                              />
                            )}
                          </td>
                        ))}
                        <td className="py-1">
                          <button
                            type="button"
                            onClick={() => setPrioridad((t) => t.filter((_, k) => k !== i))}
                            className="rounded p-1 text-[#8a8a8a] hover:bg-[#fdecec] hover:text-[#b3161b]"
                            aria-label={`Quitar ${r[0]}`}
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => setPrioridad((t) => [...t, ["", "", "", "", "", "", "", ""]])}
                  className="inline-flex items-center gap-1 text-xs font-medium text-[#e83038] hover:underline"
                >
                  <Plus size={13} /> Añadir tipo
                </button>
                {mensaje?.tabla === "prioridad" && <Mensaje ok={mensaje.ok} texto={mensaje.texto} />}
              </div>
            </Tarjeta>

            <Tarjeta
              titulo="Costes de instalación y transporte"
              sub="Lo que asumimos por unidad (subcontrata de montaje y porte del proveedor a obra) frente al histórico real de los presupuestos de proveedores (se recalcula los lunes). En rojo si la desviación pasa del ±20 %."
              accion={<BotonGuardar onClick={() => guardar("costes")} guardando={guardando === "costes"} cambios={cambiosCostes} />}
            >
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] text-sm">
                  <thead className="text-left text-xs text-[#606060]">
                    <tr>
                      {COLS_COSTES.map((c) => (
                        <th key={c} className="py-1.5 pr-1.5 font-medium">
                          {c}
                        </th>
                      ))}
                      <th className="py-1.5 pr-1.5 text-right font-medium">Histórico inst.</th>
                      <th className="py-1.5 pr-1.5 text-right font-medium">Desv.</th>
                      <th className="py-1.5 pr-1.5 text-right font-medium">Histórico transp.</th>
                      <th className="py-1.5 text-right font-medium">Desv.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {costes.map((r, i) => {
                      const hInst = numero(r[5]);
                      const hTr = numero(r[7]);
                      const dInst = hInst && numero(r[1]) !== null ? (numero(r[1]) as number) / hInst - 1 : null;
                      const dTr = hTr && numero(r[2]) !== null ? (numero(r[2]) as number) / hTr - 1 : null;
                      const color = (d: number | null) => (d === null ? "" : Math.abs(d) > 0.2 ? "font-semibold text-[#b3161b]" : "text-[#1e7e34]");
                      return (
                        <tr key={i} className="border-t border-[#efefec]">
                          <td className="w-[230px] py-1 pr-1.5">
                            <input value={String(r[0] ?? "")} onChange={(e) => editar(setCostes, i, 0, e.target.value)} className={input + " font-medium"} />
                          </td>
                          {[1, 2, 3].map((j) => (
                            <td key={j} className="w-[120px] py-1 pr-1.5">
                              <input value={String(r[j] ?? "")} onChange={(e) => editar(setCostes, i, j, e.target.value)} inputMode="decimal" className={input + " text-right"} />
                            </td>
                          ))}
                          <td className="w-[120px] py-1 pr-1.5">
                            <select value={/hist/i.test(String(r[4] ?? "")) ? "Histórico" : "Asumido"} onChange={(e) => editar(setCostes, i, 4, e.target.value)} className={input}>
                              <option>Asumido</option>
                              <option>Histórico</option>
                            </select>
                          </td>
                          <td className="py-1 pr-1.5 text-right tabular-nums">
                            {hInst === null ? "—" : eur(hInst)}
                            {r[6] ? <span className="text-xs text-[#8a8a8a]"> ({r[6]})</span> : null}
                          </td>
                          <td className={`py-1 pr-1.5 text-right tabular-nums ${color(dInst)}`}>{pctSigno(dInst)}</td>
                          <td className="py-1 pr-1.5 text-right tabular-nums">
                            {hTr === null ? "—" : eur(hTr)}
                            {r[8] ? <span className="text-xs text-[#8a8a8a]"> ({r[8]})</span> : null}
                          </td>
                          <td className={`py-1 text-right tabular-nums ${color(dTr)}`}>{pctSigno(dTr)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => setCostes((t) => [...t, ["", "", "", "", "Asumido", "", "", "", "", "", "", ""]])}
                  className="inline-flex items-center gap-1 text-xs font-medium text-[#e83038] hover:underline"
                >
                  <Plus size={13} /> Añadir tipo
                </button>
                {mensaje?.tabla === "costes" && <Mensaje ok={mensaje.ok} texto={mensaje.texto} />}
              </div>
            </Tarjeta>
          </div>
        )}
      </main>
    </div>
  );
}

function BotonGuardar({ onClick, guardando, cambios }: { onClick: () => void; guardando: boolean; cambios: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={guardando || !cambios}
      className="inline-flex items-center gap-1.5 rounded-md bg-[#282828] px-3 py-1.5 text-xs font-semibold text-white hover:bg-black disabled:opacity-40"
    >
      {guardando ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} {cambios ? "Guardar cambios" : "Sin cambios"}
    </button>
  );
}

function Mensaje({ ok, texto }: { ok: boolean; texto: string }) {
  return <span className={`text-xs ${ok ? "text-[#1e7e34]" : "text-[#b3161b]"}`}>{texto}</span>;
}
