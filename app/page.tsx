"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { ExternalLink, Loader2, Sparkles } from "lucide-react";
import { PortalHeader } from "./components/PortalNav";
import {
  Cargando,
  Embudo,
  ErrorDatos,
  FichaOportunidad,
  GraficoMeses,
  Kpi,
  ProximosSeguimientos,
  SelectorMarca,
  SelectorPeriodo,
  SelectorPersona,
  TablaTipos,
  Tarjeta,
  conIva,
  dias1,
  eurCorto,
  haceCuanto,
  personasDe,
  textoPeriodo,
  useMarca,
  usePeriodo,
  usePersona,
  usePortalData,
} from "./components/portal";
import { embudo, enPeriodo, indicadores, mediana, porTipo, serieMensual, type Oportunidad } from "@/lib/solicitudes";
import { BandejaHoy, useDatosHoy } from "./components/darsena";
import { APP_VERSION, CHANGELOG, SCRIPT_VERSIONES } from "@/lib/constants";

// Inicio de Dársena: lo que hay que hacer hoy, cómo vamos, estado de las automatizaciones y accesos directos.

export default function InicioPage() {
  const { data, error, loading, refreshing, recargar } = usePortalData();
  const hoy = useDatosHoy();
  const recargarTodo = useCallback(() => {
    recargar();
    hoy.recargar();
  }, [recargar, hoy]);
  const [persona, setPersona] = usePersona();
  const [marca, setMarca] = useMarca();
  const [periodo, setPeriodo] = usePeriodo();
  const [ficha, setFicha] = useState<string | null>(null);
  const cerrarFicha = useCallback(() => setFicha(null), []);

  const todasMarcas = useMemo(() => data?.oportunidades ?? [], [data]);
  const todas = useMemo(() => (marca ? todasMarcas.filter((o) => o.marca === marca) : todasMarcas), [todasMarcas, marca]);
  const personas = useMemo(() => personasDe(todasMarcas), [todasMarcas]);
  const quien = personas.includes(persona) ? persona : "";
  const ops = useMemo(() => (quien ? todas.filter((o) => o.registradoPor === quien) : todas), [todas, quien]);
  const abrir = useCallback((o: Oportunidad) => setFicha(o.codigo), []);
  const fichaO = ficha ? todasMarcas.find((o) => o.codigo === ficha) || null : null;
  const ahora = useMemo(() => (data ? new Date(data.generado) : new Date()), [data]);

  const k = useMemo(() => indicadores(ops, ahora), [ops, ahora]);
  const meses = useMemo(() => serieMensual(ops, ahora, 6), [ops, ahora]);
  const tipos = useMemo(() => porTipo(ops), [ops]);
  const datosEmbudo = useMemo(() => embudo(enPeriodo(ops, periodo, ahora)), [ops, periodo, ahora]);
  const respuesta = useMemo(() => {
    const xs = enPeriodo(ops, 90, ahora).map((o) => o.tiempoRespuesta).filter((x): x is number => x !== null);
    return { med: mediana(xs), n: xs.length };
  }, [ops, ahora]);

  const sistema = data?.sistema ?? {};
  const ultima = typeof sistema["Última revisión"] === "string" ? (sistema["Última revisión"] as string) : null;
  const minutos = ultima ? (ahora.getTime() - new Date(ultima).getTime()) / 60000 : null;
  const automatizacionOk = minutos !== null && minutos < 15;
  const erroresRecientes = (data?.errores ?? []).filter((e) => ahora.getTime() - new Date(e.fecha).getTime() < 86400000).length;

  return (
    <div className="flex min-h-screen flex-col">
      <PortalHeader>
        <button
          onClick={recargarTodo}
          disabled={refreshing}
          className="inline-flex items-center gap-1.5 rounded-md border border-white/20 bg-white/5 px-3 py-1.5 text-sm font-medium text-white hover:bg-white/10 disabled:opacity-50"
        >
          {refreshing && <Loader2 size={14} className="animate-spin" />} Actualizar
        </button>
      </PortalHeader>

      <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 py-5 sm:px-5">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-[#282828]">Hoy en Dársena</h1>
            <p className="text-sm text-[#606060]">
              {ahora.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" })}
              {data ? ` · datos de ${haceCuanto(data.generado)}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Versiones ok={automatizacionOk} ultima={ultima} versionScript={typeof sistema["Versión del script"] === "string" ? (sistema["Versión del script"] as string) : null} />
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
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              <Kpi
                label="Cartera abierta"
                valor={eurCorto(k.carteraAbierta)}
                sub={`${k.nAbiertas} en Holded o enviadas · ${eurCorto(conIva(k.carteraAbierta) || 0)} IVA incl.`}
              />
              <Kpi label="Enviados esperando" valor={String(k.enviados)} sub={eurCorto(k.enviadosImporte)} />
              <Kpi label="Por presupuestar" valor={String(k.porPresupuestar)} sub="pendientes, listos o con error" alerta={k.porPresupuestar > 0} />
              <Kpi label={`Ganado en ${ahora.getFullYear()}`} valor={eurCorto(k.ganadoAnio)} sub={`${k.nGanadosAnio} oportunidades`} />
              <Kpi
                label="Tasa de cierre"
                valor={k.tasaCierre90 === null ? "—" : Math.round(k.tasaCierre90 * 100) + "%"}
                sub={`últimos 90 días · ${k.nCerrados90} cerradas`}
              />
              <Kpi
                label="Respuesta (mediana)"
                valor={dias1(respuesta.med)}
                sub={`solicitud → presupuesto · 90 días · ${respuesta.n} presupuestos`}
                alerta={respuesta.med !== null && respuesta.med > 3}
              />
            </div>

            <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
              <div data-tour="hoy" className="min-w-0 rounded-lg">
              <Tarjeta
                titulo="Hoy"
                sub="Todo lo que necesita a una persona: llamadas, clientes que respondieron, datos que faltan, proveedores, presupuestos por hacer o enviar."
                accion={
                  <Link href="/oportunidades?ver=atencion" className="whitespace-nowrap text-xs font-medium text-[#e83038] hover:underline">
                    Oportunidades →
                  </Link>
                }
              >
                <BandejaHoy ops={ops} datos={hoy} ahora={ahora} quien={quien} onAbrir={(c) => setFicha(c)} />
              </Tarjeta>
              </div>

              <div className="flex min-w-0 flex-col gap-4">
                <Tarjeta
                  titulo="Automatizaciones"
                  accion={
                    <Link href="/automatizaciones" className="text-xs font-medium text-[#e83038] hover:underline">
                      Detalle
                    </Link>
                  }
                >
                  {ultima ? (
                    <div className="flex items-start gap-3">
                      <span className={`mt-1.5 inline-block h-2.5 w-2.5 shrink-0 rounded-full ${automatizacionOk ? "bg-emerald-500" : "bg-[#e83038]"}`} aria-hidden />
                      <div className="text-sm">
                        <p className="font-medium">
                          {automatizacionOk ? "Funcionando" : "Sin revisiones recientes"} · última revisión {haceCuanto(ultima)}
                        </p>
                        <p className="text-[#606060]">
                          {erroresRecientes ? `${erroresRecientes} error(es) en las últimas 24 h` : "Sin errores en las últimas 24 h"}
                          {sistema["Modo"] ? ` · ${sistema["Modo"]}` : ""}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <p className="flex items-start gap-2 text-sm text-[#606060]">
                      <Sparkles size={15} className="mt-0.5 shrink-0" />
                      El estado aparecerá aquí cuando el script de Apps Script escriba la pestaña «Sistema» (versión del 15/10 o posterior).
                    </p>
                  )}
                </Tarjeta>

                <Tarjeta titulo="Accesos directos">
                  <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                    {(data?.enlaces ?? []).map((e) => (
                      <li key={e.id}>
                        <a
                          href={e.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex h-full items-start gap-2 rounded-md border border-[#e2e0dc] p-2.5 hover:border-[#e83038]"
                        >
                          <ExternalLink size={14} className="mt-0.5 shrink-0 text-[#e83038]" />
                          <span className="min-w-0">
                            <span className="block text-sm font-semibold">{e.titulo}</span>
                            <span className="block text-xs text-[#606060]">{e.descripcion}</span>
                          </span>
                        </a>
                      </li>
                    ))}
                    <li>
                      <Link href="/proveedores" className="flex h-full items-start gap-2 rounded-md border border-[#e2e0dc] p-2.5 hover:border-[#e83038]">
                        <ExternalLink size={14} className="mt-0.5 shrink-0 text-[#e83038]" />
                        <span>
                          <span className="block text-sm font-semibold">Precios de proveedores</span>
                          <span className="block text-xs text-[#606060]">Base de datos, comparador y cotizador</span>
                        </span>
                      </Link>
                    </li>
                  </ul>
                </Tarjeta>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-[1.25fr_1fr]">
              <Tarjeta
                titulo="Embudo comercial"
                sub={`Solicitudes recibidas en ${textoPeriodo(periodo)} y hasta dónde han llegado. Importes: base imponible y con IVA.`}
                accion={<SelectorPeriodo valor={periodo} onChange={setPeriodo} />}
              >
                <Embudo e={datosEmbudo} />
                <Link href="/analisis" className="mt-2 inline-block text-xs font-medium text-[#e83038] hover:underline">
                  Ver conversión, tiempos, motivos de pérdida y márgenes →
                </Link>
              </Tarjeta>
              <Tarjeta
                titulo={`Próximos seguimientos · ${ops.filter((o) => o.proximoSeguimiento).length}`}
                sub="Emails automáticos y avisos de llamada de los presupuestos enviados (lunes a viernes, 9–18 h, desde la cuenta de quien lleva la oportunidad)."
              >
                <ProximosSeguimientos ops={ops} ahora={ahora} mostrarQuien={!quien} onAbrir={abrir} onCambio={recargar} />
              </Tarjeta>
            </div>

            <div className="grid gap-4 lg:grid-cols-[1.25fr_1fr]">
              <Tarjeta titulo="Ofertado vs ganado" sub="Últimos 6 meses · base imponible. Ofertado por fecha de solicitud; ganado por fecha en que se ganó.">
                <GraficoMeses meses={meses} />
              </Tarjeta>
              <Tarjeta titulo="Por tipo de producto" sub="Desde el inicio · una solicitud con varios tipos cuenta en cada uno.">
                <TablaTipos tipos={tipos} />
              </Tarjeta>
            </div>
          </div>
        )}
      </main>
      <FichaOportunidad o={fichaO} onCerrar={cerrarFicha} onCambio={recargar} />
    </div>
  );
}

/** Versión de Dársena y del script, con su historial al pasar el ratón, y estado en línea de la automatización. */
function Versiones({ ok, ultima, versionScript }: { ok: boolean; ultima: string | null; versionScript: string | null }) {
  const fechaCorta = (f?: string) => (f ? f.split("-").reverse().join("/") : "");
  const scriptConocido = SCRIPT_VERSIONES.find((v) => v.version === versionScript);
  return (
    <div className="group relative">
      <div
        tabIndex={0}
        className="inline-flex cursor-default items-center gap-2 rounded-md border border-[#e2e0dc] bg-white px-2.5 py-1 text-xs text-[#606060] outline-none focus:border-[#606060]"
      >
        <span className={`inline-block h-2 w-2 rounded-full ${ok ? "bg-emerald-500" : ultima ? "bg-[#e83038]" : "bg-[#b0b0ac]"}`} aria-hidden />
        <span className="font-medium text-[#282828]">{ok ? "En línea" : ultima ? "Sin conexión" : "Sin datos"}</span>
        <span className="text-[#c7c5c0]">·</span>
        <span>Dársena v{APP_VERSION}</span>
        {versionScript && (
          <>
            <span className="text-[#c7c5c0]">·</span>
            <span>Script {versionScript}</span>
          </>
        )}
      </div>
      <div className="invisible absolute right-0 z-30 mt-1 w-[min(420px,90vw)] rounded-lg border border-[#e2e0dc] bg-white p-3 text-xs opacity-0 shadow-lg transition group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
        <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-[#282828]">
          <span className={`inline-block h-2 w-2 rounded-full ${ok ? "bg-emerald-500" : "bg-[#e83038]"}`} aria-hidden />
          {ok ? "Automatización funcionando" : "La automatización no ha revisado en los últimos 15 min"}
        </p>
        {ultima && <p className="mb-3 text-[#606060]">Última revisión: {new Date(ultima).toLocaleString("es-ES")} ({haceCuanto(ultima)})</p>}

        <p className="mb-1 font-semibold text-[#282828]">Script de automatización {versionScript ? `· ${versionScript}` : ""}</p>
        {versionScript && !scriptConocido && <p className="mb-1 text-[#9a5b00]">Versión en uso sin descripción registrada.</p>}
        <ul className="mb-3 flex max-h-32 flex-col gap-1 overflow-y-auto">
          {SCRIPT_VERSIONES.map((v) => (
            <li key={v.version} className={v.version === versionScript ? "text-[#282828]" : "text-[#8a8a8a]"}>
              <b>{v.version}</b>
              {v.version === versionScript && <span className="ml-1 rounded bg-[#e6f4ea] px-1 text-[10px] font-semibold text-[#1e7e34]">en uso</span>} — {v.desc}
            </li>
          ))}
        </ul>

        <p className="mb-1 font-semibold text-[#282828]">Dársena · v{APP_VERSION}</p>
        <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto">
          {CHANGELOG.map((c, i) => (
            <li key={c.version} className={i === 0 ? "text-[#282828]" : "text-[#8a8a8a]"}>
              <b>v{c.version}</b>
              {c.fecha ? ` (${fechaCorta(c.fecha)})` : ""} — {c.desc}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

