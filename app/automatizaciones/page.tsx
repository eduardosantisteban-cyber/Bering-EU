"use client";

import { ExternalLink, Loader2 } from "lucide-react";
import { PortalHeader } from "../components/PortalNav";
import { Cargando, ErrorDatos, Tarjeta, haceCuanto, usePortalData } from "../components/portal";
import { SEGUIMIENTO } from "@/lib/portalConfig";

// Qué hace cada automatización, si está funcionando y los errores recientes.
// El "motor" es el script de Google Apps Script (gmail_a_holded.gs), que revisa cada 5 minutos;
// esta página solo lee lo que deja escrito en las pestañas "Sistema" y "Errores" del Sheet.

const AUTOMATIZACIONES: { titulo: string; cuando: string; que: string; tu: string }[] = [
  {
    titulo: "Nueva solicitud → Holded",
    cuando: "Cada 5 min, al etiquetar un email con «Presupuesto»",
    que: "Crea o actualiza la empresa en Holded (con CIF y dirección de su web), la oportunidad BEUQxxx y un Sheet de presupuesto con costes de referencia, instalación, transporte y lo que pide el cliente.",
    tu: "Etiquetar el email y revisar el Sheet.",
  },
  {
    titulo: "Pedir precios a proveedores",
    cuando: "Al marcar la casilla K7 del Sheet",
    que: "Prepara un borrador por proveedor con lo que pide el cliente y sus planos. Cuando el proveedor responde, la IA lee sus precios y rellena la comparativa y los costes.",
    tu: "Revisar y enviar los borradores.",
  },
  {
    titulo: "Crear el presupuesto en Holded",
    cuando: "Al marcar la casilla K3 del Sheet",
    que: "Crea BEUQxxx-A (o la siguiente revisión) con su PDF y te envía el email de revisión: pedido frente a ofertado, mark-up, instalación y transporte, similitud y fichas técnicas.",
    tu: "Revisar el email y enviar el presupuesto desde Holded.",
  },
  {
    titulo: "Estados desde Holded",
    cuando: "Cada 10 min",
    que: "Copia a la tabla Solicitudes lo que hacéis en Holded (enviado, ganado, perdido) y guarda la fecha de cada cambio.",
    tu: "Mover las oportunidades en Holded.",
  },
  {
    titulo: "Seguimiento al cliente",
    cuando: `Lunes a viernes, 9 a 18 h · días ${SEGUIMIENTO.DIAS_1}, ${SEGUIMIENTO.DIAS_2} y ${SEGUIMIENTO.DIAS_LLAMADA}`,
    que: `Email de seguimiento el día ${SEGUIMIENTO.DIAS_1}, segundo email el día ${SEGUIMIENTO.DIAS_2} y aviso para llamar el día ${SEGUIMIENTO.DIAS_LLAMADA}. Se para si el cliente responde, si se marca «Sin seguimiento» o si la oportunidad ya no existe en Holded.`,
    tu: "Llamar cuando llegue el aviso.",
  },
  {
    titulo: "Informe semanal",
    cuando: "Lunes desde las 8:00",
    que: "Email con lo nuevo, lo enviado, lo ganado y lo perdido de la semana, la cartera abierta y lo que necesita atención, por persona.",
    tu: "Leerlo.",
  },
  {
    titulo: "Aviso de errores",
    cuando: "Cuando algo falla",
    que: "Email con dónde ha fallado, el motivo y qué hacer. El mismo error no se repite en 24 h.",
    tu: "Seguir la indicación del email.",
  },
];

export default function AutomatizacionesPage() {
  const { data, error, loading, refreshing, recargar } = usePortalData();
  const sistema = data?.sistema ?? {};
  const ultima = typeof sistema["Última revisión"] === "string" ? (sistema["Última revisión"] as string) : null;
  const ahora = data ? new Date(data.generado).getTime() : 0;
  const ok = !!ultima && ahora - new Date(ultima).getTime() < 30 * 60000;
  const enlaces = (data?.enlaces ?? []).filter((e) => ["guia", "flujo", "script", "solicitudes"].includes(e.id));

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
        <h1 className="text-xl font-bold">Automatizaciones</h1>
        <p className="mb-4 text-sm text-[#606060]">
          Corren en Google Apps Script (script <code className="rounded bg-[#efefec] px-1 text-xs">gmail_a_holded.gs</code>) con una revisión cada 5 minutos.
        </p>

        {loading ? (
          <Cargando />
        ) : error && !data ? (
          <ErrorDatos mensaje={error} onReintentar={recargar} />
        ) : (
          <div className="flex flex-col gap-4">
            <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
              <Tarjeta titulo="Estado">
                {ultima ? (
                  <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                    <dt className="text-[#606060]">Estado</dt>
                    <dd className="flex items-center gap-2 font-medium">
                      <span className={`inline-block h-2.5 w-2.5 rounded-full ${ok ? "bg-emerald-500" : "bg-[#e83038]"}`} aria-hidden />
                      {ok ? "Funcionando" : "Sin revisiones en los últimos 30 min"}
                    </dd>
                    <dt className="text-[#606060]">Última revisión</dt>
                    <dd>
                      {new Date(ultima).toLocaleString("es-ES")} ({haceCuanto(ultima)})
                    </dd>
                    {Object.entries(sistema)
                      .filter(([k]) => k !== "Última revisión")
                      .map(([k, v]) => (
                        <div key={k} className="contents">
                          <dt className="text-[#606060]">{k}</dt>
                          <dd>{typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v) ? new Date(v).toLocaleString("es-ES") : String(v ?? "—")}</dd>
                        </div>
                      ))}
                  </dl>
                ) : (
                  <p className="text-sm text-[#606060]">
                    Todavía no hay datos de estado. Aparecen cuando el script escribe la pestaña «Sistema» de la hoja Solicitudes
                    (versión del script del 15/10/2026 o posterior).
                  </p>
                )}
                {!!enlaces.length && (
                  <div className="mt-4 flex flex-wrap gap-2 border-t border-[#efefec] pt-3">
                    {enlaces.map((e) => (
                      <a
                        key={e.id}
                        href={e.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-md border border-[#e2e0dc] px-2.5 py-1 text-sm font-medium hover:border-[#e83038]"
                      >
                        <ExternalLink size={13} className="text-[#e83038]" /> {e.titulo}
                      </a>
                    ))}
                  </div>
                )}
              </Tarjeta>

              <Tarjeta titulo={`Errores recientes · ${data?.errores.length ?? 0}`} sub="Los últimos 50, el más reciente primero. A quien ejecuta el script también le llega cada uno por email.">
                {!data?.errores.length ? (
                  <p className="text-sm font-medium text-[#1e7e34]">Sin errores registrados.</p>
                ) : (
                  <div className="max-h-[360px] overflow-auto">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-white text-left text-xs text-[#606060]">
                        <tr>
                          <th className="py-1.5 pr-2 font-medium">Cuándo</th>
                          <th className="py-1.5 pr-2 font-medium">Dónde</th>
                          <th className="py-1.5 font-medium">Error</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.errores.map((e, i) => (
                          <tr key={i} className="border-t border-[#efefec] align-top">
                            <td className="whitespace-nowrap py-1.5 pr-2 text-xs text-[#606060]">
                              {/^\d{4}-/.test(e.fecha) ? new Date(e.fecha).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" }) : e.fecha}
                            </td>
                            <td className="py-1.5 pr-2">
                              <span className="font-medium">{e.donde}</span>
                              {e.contexto && <span className="block text-xs text-[#8a8a8a]">{e.contexto}</span>}
                            </td>
                            <td className="py-1.5 text-[#b3161b]">{e.error}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Tarjeta>
            </div>

            <Tarjeta titulo="Qué hace cada una">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {AUTOMATIZACIONES.map((a) => (
                  <div key={a.titulo} className="rounded-md border border-[#e2e0dc] p-3">
                    <p className="font-semibold">{a.titulo}</p>
                    <p className="mt-0.5 text-xs font-medium text-[#e83038]">{a.cuando}</p>
                    <p className="mt-2 text-sm text-[#404040]">{a.que}</p>
                    <p className="mt-2 text-xs text-[#606060]">
                      <span className="font-semibold">Tú:</span> {a.tu}
                    </p>
                  </div>
                ))}
              </div>
            </Tarjeta>
          </div>
        )}
      </main>
    </div>
  );
}
