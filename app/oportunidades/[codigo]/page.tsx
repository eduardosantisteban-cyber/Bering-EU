"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, ExternalLink, Loader2 } from "lucide-react";
import { PortalHeader } from "../../components/PortalNav";
import {
  BotonSeguimiento,
  Cargando,
  EnlacesOportunidad,
  ErrorDatos,
  EstadoPill,
  MarcaBadge,
  OrigenBadge,
  SelectorMotivo,
  Tarjeta,
  conIva,
  dias1,
  eur,
  fechaCorta,
  usePortalData,
} from "../../components/portal";
import { bandejaHoy, lineaDeTiempo, NOMBRE_TAREA, type Hito, type Peticion } from "@/lib/darsena";
import { nombreDeEmail } from "@/lib/solicitudes";

// Ficha completa de una oportunidad: qué toca, línea de tiempo, peticiones a proveedores y líneas del presupuesto.

interface LineaPresupuesto {
  numero: string | null;
  fecha: string | null;
  linea: number | null;
  tipo: string | null;
  descripcion: string | null;
  medidas: string | null;
  uds: number | null;
  coste_unit: number | null;
  precio_unit: number | null;
  proveedor: string | null;
  es_servicio: boolean | null;
}

interface Extra {
  historial: unknown[][];
  peticiones: Peticion[];
  lineas: LineaPresupuesto[];
  entrada: { creado: string; canal: string; registrado_por: string; nota: string | null; telefono: string | null } | null;
}

const COLOR_HITO: Record<Hito["tipo"], string> = {
  entrada: "#282828",
  estado: "#606060",
  presupuesto: "#e83038",
  proveedor: "#1d4ed8",
  respuesta: "#1e7e34",
  recordatorio: "#b45309",
  seguimiento: "#7c3aed",
};

const fechaHora = (iso: string) =>
  new Date(iso).toLocaleString("es-ES", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });

export default function FichaPage() {
  const params = useParams<{ codigo: string }>();
  const codigo = decodeURIComponent(String(params?.codigo || "")).toUpperCase();
  const { data, error, loading, refreshing, recargar } = usePortalData();
  const [extra, setExtra] = useState<Extra | null>(null);
  const [errorExtra, setErrorExtra] = useState<string | null>(null);

  const cargarExtra = useCallback(async () => {
    try {
      const res = await fetch(`/api/darsena/oportunidad?codigo=${encodeURIComponent(codigo)}`, { cache: "no-store" });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || `Error ${res.status}`);
      setExtra(body as Extra);
      setErrorExtra(null);
    } catch (err) {
      setErrorExtra((err as Error).message);
    }
  }, [codigo]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial de datos
    if (codigo) cargarExtra();
  }, [codigo, cargarExtra]);

  const o = data?.oportunidades.find((x) => x.codigo === codigo) || null;
  const ahora = useMemo(() => (data ? new Date(data.generado) : new Date()), [data]);
  const hitos = useMemo(() => (o ? lineaDeTiempo(o, extra?.historial ?? [], extra?.peticiones ?? []) : []), [o, extra]);
  const tareas = useMemo(() => (o ? bandejaHoy([o], extra?.peticiones ?? [], [], [], ahora) : []), [o, extra, ahora]);
  const revision = useMemo(() => {
    const ls = extra?.lineas ?? [];
    const ultima = ls.reduce((m, l) => (String(l.numero || "") > m ? String(l.numero || "") : m), "");
    return { numero: ultima, lineas: ls.filter((l) => String(l.numero || "") === ultima) };
  }, [extra]);
  const totales = useMemo(() => {
    const venta = revision.lineas.reduce((s, l) => s + (l.precio_unit || 0) * (l.uds || 0), 0);
    const coste = revision.lineas.reduce((s, l) => s + (l.coste_unit || 0) * (l.uds || 0), 0);
    return { venta, coste, margen: venta ? (venta - coste) / venta : null };
  }, [revision]);

  const actualizar = () => {
    recargar();
    cargarExtra();
  };

  const fila = (t: string, v: React.ReactNode) =>
    v ? (
      <div className="grid grid-cols-[110px_1fr] gap-x-3 py-1">
        <dt className="text-xs font-semibold text-[#8a8a8a]">{t}</dt>
        <dd className="text-sm">{v}</dd>
      </div>
    ) : null;

  return (
    <div className="flex min-h-screen flex-col">
      <PortalHeader>
        <button
          onClick={actualizar}
          disabled={refreshing}
          className="inline-flex items-center gap-1.5 rounded-md border border-white/20 bg-white/5 px-3 py-1.5 text-sm font-medium text-white hover:bg-white/10 disabled:opacity-50"
        >
          {refreshing && <Loader2 size={14} className="animate-spin" />} Actualizar
        </button>
      </PortalHeader>

      <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 py-5 sm:px-5">
        <Link href="/oportunidades" className="mb-3 inline-flex items-center gap-1 text-sm text-[#606060] hover:text-[#282828]">
          <ArrowLeft size={14} /> Oportunidades
        </Link>

        {loading ? (
          <Cargando />
        ) : error && !data ? (
          <ErrorDatos mensaje={error} onReintentar={recargar} />
        ) : !o ? (
          <p className="rounded-md bg-white p-4 text-sm">No encuentro la oportunidad {codigo}.</p>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-start gap-3 rounded-lg border border-[#e2e0dc] bg-white px-4 py-3">
              <div className="min-w-0 flex-1">
                <h1 className="text-xl font-bold">
                  {o.codigo}
                  <MarcaBadge marca={o.marca} />
                  <OrigenBadge o={o} />
                </h1>
                <p className="text-sm text-[#606060]">
                  {o.empresa || "—"}
                  {o.contacto ? ` · ${o.contacto}` : ""}
                  {o.numero ? ` · ${o.numero}` : ""}
                  {o.registradoPor ? ` · lleva ${nombreDeEmail(o.registradoPor)}` : ""}
                </p>
                <div className="mt-2">
                  <EnlacesOportunidad o={o} />
                </div>
              </div>
              <div className="text-right">
                <EstadoPill estado={o.estado} />
                <p className="mt-1 text-lg font-bold tabular-nums">{eur(o.importe)}</p>
                {o.importe !== null && <p className="text-xs text-[#606060]">{eur(conIva(o.importe))} IVA incl.</p>}
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
              <div className="flex min-w-0 flex-col gap-4">
                <Tarjeta titulo={`Qué toca · ${tareas.length}`}>
                  {!tareas.length ? (
                    <p className="text-sm font-medium text-[#1e7e34]">Nada pendiente en esta oportunidad.</p>
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {tareas.map((t) => (
                        <li key={t.id} className="rounded-md border border-[#e2e0dc] px-3 py-2">
                          <p className="text-sm font-semibold">
                            {t.titulo}
                            <span className="ml-2 text-xs font-normal text-[#8a8a8a]">{NOMBRE_TAREA[t.tipo]}</span>
                          </p>
                          <p className="text-xs text-[#606060]">{t.detalle}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </Tarjeta>

                <Tarjeta titulo="Línea de tiempo" sub="Entrada, cambios de estado, peticiones a proveedores, respuestas, recordatorios y seguimientos.">
                  {errorExtra && <p className="mb-2 text-xs text-[#9a5b00]">{errorExtra}</p>}
                  {!extra && !errorExtra ? (
                    <p className="text-sm text-[#606060]">Cargando…</p>
                  ) : !hitos.length ? (
                    <p className="text-sm text-[#606060]">Sin movimientos registrados.</p>
                  ) : (
                    <ol className="relative ml-2 border-l border-[#e2e0dc]">
                      {hitos.map((h, i) => (
                        <li key={i} className="mb-3 ml-4">
                          <span className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full" style={{ background: COLOR_HITO[h.tipo] }} aria-hidden />
                          <p className="text-xs tabular-nums text-[#8a8a8a]">{fechaHora(h.fecha)}</p>
                          <p className="text-sm font-medium">{h.texto}</p>
                          {h.detalle && <p className="whitespace-pre-line text-xs text-[#606060]">{h.detalle}</p>}
                        </li>
                      ))}
                    </ol>
                  )}
                </Tarjeta>

                <Tarjeta titulo={`Peticiones a proveedores · ${extra?.peticiones.length ?? 0}`}>
                  {!extra?.peticiones.length ? (
                    <p className="text-sm text-[#606060]">No se ha pedido precio a ningún proveedor desde el Sheet.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[560px] text-sm">
                        <thead className="text-left text-xs text-[#606060]">
                          <tr>
                            <th className="py-1.5 pr-2 font-medium">Proveedor</th>
                            <th className="py-1.5 pr-2 font-medium">Pedido</th>
                            <th className="py-1.5 pr-2 font-medium">Partidas</th>
                            <th className="py-1.5 pr-2 font-medium">Estado</th>
                            <th className="py-1.5 font-medium">Respuesta</th>
                          </tr>
                        </thead>
                        <tbody>
                          {extra.peticiones.map((p) => (
                            <tr key={p.fila} className="border-t border-[#efefec] align-top">
                              <td className="py-1.5 pr-2 font-medium">{p.proveedor}</td>
                              <td className="py-1.5 pr-2 tabular-nums">{fechaCorta(p.fecha)}</td>
                              <td className="py-1.5 pr-2 tabular-nums">{p.partidas}</td>
                              <td className="py-1.5 pr-2">
                                {p.estado}
                                {p.nRecordatorios > 0 && <span className="block text-xs text-[#b45309]">{p.nRecordatorios} recordatorio(s)</span>}
                              </td>
                              <td className="py-1.5 text-xs text-[#606060]">
                                {p.diasRespuesta !== null ? `en ${dias1(p.diasRespuesta)}` : p.respondida ? "Sí" : "—"}
                                {p.resultado && <span className="block max-w-[320px] truncate" title={p.resultado}>{p.resultado.split("\n")[0]}</span>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Tarjeta>
              </div>

              <div className="flex min-w-0 flex-col gap-4">
                <Tarjeta titulo="Datos">
                  <dl>
                    {fila(
                      "Contacto",
                      (o.contacto || o.email) && (
                        <>
                          {o.contacto || "—"}
                          {o.email && (
                            <a className="block underline" href={`mailto:${o.email}`}>
                              {o.email}
                            </a>
                          )}
                          {extra?.entrada?.telefono && <span className="block">{extra.entrada.telefono}</span>}
                        </>
                      )
                    )}
                    {fila("Productos", o.productos)}
                    {fila("Cantidades", o.cantidades)}
                    {fila("Medidas", o.medidas)}
                    {fila("Provincia", o.provincia)}
                    {fila("Canal", o.canal)}
                    {fila("Solicitud", o.fechaSolicitud && fechaCorta(o.fechaSolicitud))}
                    {fila(
                      "Presupuesto",
                      o.fechaPresupuesto && (
                        <>
                          {fechaCorta(o.fechaPresupuesto)}
                          {o.tiempoRespuesta !== null && <span className="text-[#8a8a8a]"> ({dias1(o.tiempoRespuesta)})</span>}
                        </>
                      )
                    )}
                    {fila("Faltan datos", o.faltanDatos && <span className="text-[#9a5b00]">{o.faltanDatos}</span>)}
                    {fila(
                      "Margen",
                      o.margen && (
                        <>
                          {eur(o.margen.venta - o.margen.coste)} ({Math.round(o.margen.pct * 100)} %)
                          {o.margen.sinCoste > 0 && <span className="text-[#b3161b]"> · {o.margen.sinCoste} líneas sin coste</span>}
                        </>
                      )
                    )}
                    {fila("Motivo pérdida", o.estado === "Perdido" && o.origen !== "crm" && <SelectorMotivo o={o} onGuardado={recargar} />)}
                  </dl>
                  {o.resumen && <p className="mt-2 whitespace-pre-line rounded-md bg-[#f5f4f2] px-3 py-2 text-sm">{o.resumen}</p>}
                  {extra?.entrada?.nota && <p className="mt-2 whitespace-pre-line rounded-md bg-[#f5f4f2] px-3 py-2 text-sm">{extra.entrada.nota}</p>}
                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[#efefec] pt-3">
                    {o.estado === "Presupuesto enviado" && o.origen !== "crm" && <BotonSeguimiento o={o} onGuardado={recargar} />}
                    <a
                      href="https://app.holded.com/crm"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-md border border-[#e2e0dc] px-2 py-1 text-xs font-medium text-[#606060] hover:border-[#606060]"
                    >
                      <ExternalLink size={12} /> Holded
                    </a>
                  </div>
                </Tarjeta>

                <Tarjeta
                  titulo={revision.numero ? `Presupuesto ${revision.numero}` : "Presupuesto"}
                  sub={revision.lineas.length ? `Venta ${eur(totales.venta)} · coste ${eur(totales.coste)}${totales.margen !== null ? ` · margen ${Math.round(totales.margen * 100)} %` : ""} (antes de descuento)` : undefined}
                >
                  {!revision.lineas.length ? (
                    <p className="text-sm text-[#606060]">Todavía no se ha creado en Holded.</p>
                  ) : (
                    <ul className="divide-y divide-[#efefec]">
                      {revision.lineas.map((l, i) => (
                        <li key={i} className="py-1.5 text-sm">
                          <p className="font-medium">
                            {l.uds ?? "—"} × {l.descripcion || l.tipo || "—"}
                          </p>
                          <p className="text-xs text-[#606060]">
                            {[l.medidas, l.proveedor, l.coste_unit !== null ? `coste ${eur(l.coste_unit)}` : "", l.precio_unit !== null ? `venta ${eur(l.precio_unit)}` : ""]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </Tarjeta>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
