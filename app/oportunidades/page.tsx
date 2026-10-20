"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Search, X } from "lucide-react";
import { PortalHeader } from "../components/PortalNav";
import {
  Cargando,
  EnlacesOportunidad,
  ErrorDatos,
  EstadoPill,
  FichaOportunidad,
  MarcaBadge,
  NOMBRES_ESTADO,
  SelectorMarca,
  SelectorPersona,
  eur,
  fechaCorta,
  haceCuanto,
  personasDe,
  useMarca,
  usePersona,
  usePortalData,
} from "../components/portal";
import { ESTADOS_CERRADOS, nombreDeEmail, ordenAtencion, type Oportunidad } from "@/lib/solicitudes";
import { normalizeStr } from "@/lib/format";

// Buscador de oportunidades: todas las filas de la tabla Solicitudes, con filtros por estado y persona.

type Filtro = "abiertas" | "atencion" | "todas" | string; // o un estado concreto

const PAGINA = 50;

export default function OportunidadesPage() {
  const { data, error, loading, refreshing, recargar } = usePortalData();
  const [persona, setPersona] = usePersona();
  const [q, setQ] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("abiertas");
  const [limite, setLimite] = useState(PAGINA);
  const [marca, setMarca] = useMarca();
  const [ficha, setFicha] = useState<string | null>(null);
  const cerrarFicha = useCallback(() => setFicha(null), []);

  // ?ver=atencion desde el Inicio
  useEffect(() => {
    const ver = new URLSearchParams(window.location.search).get("ver");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- filtro inicial desde la URL
    if (ver) setFiltro(ver);
  }, []);

  const todasMarcas = useMemo(() => data?.oportunidades ?? [], [data]);
  const todas = useMemo(() => (marca ? todasMarcas.filter((o) => o.marca === marca) : todasMarcas), [todasMarcas, marca]);
  const personas = useMemo(() => personasDe(todasMarcas), [todasMarcas]);
  const fichaO = ficha ? todasMarcas.find((o) => o.codigo === ficha) || null : null;
  const quien = personas.includes(persona) ? persona : "";
  const dePersona = useMemo(() => (quien ? todas.filter((o) => o.registradoPor === quien) : todas), [todas, quien]);

  const cuenta = (f: Filtro) => dePersona.filter((o) => pasaFiltro(o, f)).length;
  const estadosPresentes = useMemo(
    () => Object.keys(NOMBRES_ESTADO).filter((e) => dePersona.some((o) => o.estado === e)),
    [dePersona]
  );

  const lista = useMemo(() => {
    const t = normalizeStr(q);
    const l = dePersona.filter((o) => {
      if (t) {
        // Al buscar se mira en todas, también en las cerradas
        return normalizeStr([o.codigo, o.numero, o.empresa, o.contacto, o.email, o.productos, o.asunto, o.provincia, o.canal, o.marca].join(" ")).includes(t);
      }
      return pasaFiltro(o, filtro);
    });
    return filtro === "atencion" && !t
      ? l.sort(ordenAtencion)
      : l.sort((a, b) => (b.fechaSolicitud || "").localeCompare(a.fechaSolicitud || "") || b.codigo.localeCompare(a.codigo));
  }, [dePersona, filtro, q]);

  const chip = (f: Filtro, nombre: string) => (
    <button
      key={f}
      type="button"
      aria-pressed={!q && filtro === f}
      onClick={() => {
        setFiltro(f);
        setQ("");
        setLimite(PAGINA);
      }}
      className={`rounded-full border px-3 py-1 text-xs font-semibold ${
        !q && filtro === f ? "border-[#282828] bg-[#282828] text-white" : "border-[#e2e0dc] bg-white text-[#606060] hover:border-[#606060]"
      }`}
    >
      {nombre} · {cuenta(f)}
    </button>
  );

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
            <h1 className="text-xl font-bold">Oportunidades</h1>
            <p className="text-sm text-[#606060]">
              {todas.length} en la tabla Solicitudes{data ? ` · datos de ${haceCuanto(data.generado)}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <SelectorMarca valor={marca} onChange={setMarca} />
            {personas.length > 1 && <SelectorPersona personas={personas} valor={quien} onChange={setPersona} />}
          </div>
        </div>

        {loading ? (
          <Cargando />
        ) : error && !data ? (
          <ErrorDatos mensaje={error} onReintentar={recargar} />
        ) : (
          <section className="rounded-lg border border-[#e2e0dc] bg-white p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <div className="relative min-w-[220px] flex-1">
                <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[#606060]" />
                <input
                  id="buscar-oportunidad"
                  className="w-full rounded-md border border-[#e2e0dc] py-1.5 pl-8 pr-8 text-sm outline-none focus:border-[#e83038]"
                  placeholder="Buscar por nº, empresa, contacto, email, producto o provincia"
                  value={q}
                  onChange={(e) => {
                    setQ(e.target.value);
                    setLimite(PAGINA);
                  }}
                />
                {q && (
                  <button onClick={() => setQ("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-[#606060]" aria-label="Borrar búsqueda">
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>
            <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por estado">
              {chip("abiertas", "Abiertas")}
              {chip("atencion", "Necesitan atención")}
              {estadosPresentes.map((e) => chip(e, NOMBRES_ESTADO[e].nombre))}
              {chip("todas", "Todas")}
            </div>
            {q && <p className="mb-2 text-xs text-[#606060]">Buscando en todas las oportunidades, también las cerradas.</p>}

            {lista.length === 0 ? (
              <p className="py-6 text-center text-sm text-[#606060]">No hay oportunidades con este filtro.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] text-sm">
                  <thead className="text-left text-xs text-[#606060]">
                    <tr className="border-b border-[#e2e0dc]">
                      <th className="px-2 py-2 font-medium">Nº</th>
                      <th className="px-2 py-2 font-medium">Fecha</th>
                      <th className="px-2 py-2 font-medium">Empresa</th>
                      <th className="px-2 py-2 font-medium">Productos</th>
                      <th className="px-2 py-2 font-medium">Estado</th>
                      <th className="px-2 py-2 text-right font-medium">Importe</th>
                      {!quien && <th className="px-2 py-2 font-medium">Quién</th>}
                      <th className="px-2 py-2 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lista.slice(0, limite).map((o) => (
                      <Fila key={o.codigo + o.fechaSolicitud} o={o} mostrarQuien={!quien} onAbrir={() => setFicha(o.codigo)} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {lista.length > limite && (
              <div className="mt-3 text-center">
                <button
                  onClick={() => setLimite((l) => l + PAGINA)}
                  className="rounded-md border border-[#e2e0dc] bg-white px-3 py-1.5 text-sm font-medium hover:bg-[#f5f4f2]"
                >
                  Mostrar más ({lista.length - limite})
                </button>
              </div>
            )}
          </section>
        )}
      </main>
      <FichaOportunidad o={fichaO} onCerrar={cerrarFicha} onCambio={recargar} />
    </div>
  );
}

function pasaFiltro(o: Oportunidad, f: Filtro): boolean {
  if (f === "todas") return true;
  if (f === "abiertas") return !ESTADOS_CERRADOS.includes(o.estado);
  if (f === "atencion") return !!o.atencion;
  return o.estado === f;
}

function Fila({ o, mostrarQuien, onAbrir }: { o: Oportunidad; mostrarQuien: boolean; onAbrir: () => void }) {
  const seg = o.seguimiento.filter(Boolean).slice(-1)[0];
  return (
    <tr
      onClick={(e) => {
        if (!(e.target as HTMLElement).closest("a,button")) onAbrir();
      }}
      className={`cursor-pointer border-b border-[#efefec] align-top hover:bg-[#fafaf8] ${/^Llamar/.test(o.atencion) ? "bg-[#fff4e0]" : ""}`}
    >
      <td className="px-2 py-2">
        <button type="button" onClick={onAbrir} className="font-semibold underline decoration-[#e2e0dc] underline-offset-2 hover:decoration-[#282828]">
          {o.codigo}
        </button>
        <MarcaBadge marca={o.marca} />
        {o.numero && <span className="block text-xs text-[#8a8a8a]">{o.numero}</span>}
      </td>
      <td className="whitespace-nowrap px-2 py-2 text-xs text-[#606060]">{fechaCorta(o.fechaSolicitud)}</td>
      <td className="px-2 py-2">
        <span className="font-medium">{o.empresa || "—"}</span>
        {(o.contacto || o.email) && <span className="block text-xs text-[#8a8a8a]">{o.contacto || o.email}</span>}
        {o.provincia && <span className="block text-xs text-[#8a8a8a]">{o.provincia}</span>}
      </td>
      <td className="px-2 py-2 text-xs">{o.productos || "—"}</td>
      <td className="px-2 py-2">
        <EstadoPill estado={o.estado} />
        {o.atencion ? (
          <span className="mt-1 block text-xs font-medium text-[#b3161b]">{o.atencion}</span>
        ) : o.estado === "Presupuesto enviado" && (o.sinSeguimiento || seg) ? (
          <span className="mt-1 block text-xs text-[#8a8a8a]">{o.sinSeguimiento ? "Sin seguimiento" : seg}</span>
        ) : o.estado === "Perdido" && o.motivoPerdida ? (
          <span className="mt-1 block text-xs text-[#8a8a8a]">{o.motivoPerdida}</span>
        ) : null}
      </td>
      <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums">{eur(o.importe)}</td>
      {mostrarQuien && <td className="px-2 py-2 text-xs">{nombreDeEmail(o.registradoPor)}</td>}
      <td className="px-2 py-2">
        <EnlacesOportunidad o={o} />
      </td>
    </tr>
  );
}
