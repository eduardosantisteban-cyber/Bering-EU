"use client";

import { ExternalLink, Loader2 } from "lucide-react";
import { PortalHeader } from "../components/PortalNav";
import { Cargando, ErrorDatos, Tarjeta, haceCuanto, usePortalData } from "../components/portal";
import { SEGUIMIENTO } from "@/lib/portalConfig";
import { nombreDeEmail } from "@/lib/solicitudes";

// Qué hace cada automatización, si está funcionando (en general y en cada cuenta) y los errores recientes.
// El "motor" es el script de Google Apps Script (proyecto "Gmail a Holded"), que da una vuelta cada minuto en la
// cuenta de cada comercial; esta página solo lee lo que deja escrito en las pestañas "Sistema" y "Errores" del Sheet.

type Grupo = "Entrada" | "Presupuesto" | "Proveedores" | "Seguimiento" | "Control";

const AUTOMATIZACIONES: { titulo: string; grupo: Grupo; cuando: string; que: string; tu: string }[] = [
  {
    titulo: "Nueva solicitud → Holded",
    grupo: "Entrada",
    cuando: "Cada minuto, al etiquetar un email con «Presupuesto»",
    que: "Crea o actualiza la empresa en Holded (con CIF y dirección de su web), la oportunidad BEUQxxx y un Sheet de presupuesto con las partidas que pide el cliente (la IA lee el email y los adjuntos, fotos y planos incluidos).",
    tu: "Etiquetar el email y revisar el Sheet.",
  },
  {
    titulo: "Email de una oportunidad que ya existe",
    grupo: "Entrada",
    cuando: "Al etiquetar el email",
    que: "Si el asunto o la nota del reenvío llevan el código, o es el mismo hilo o el mismo cliente de una llamada/WhatsApp reciente, se añade a esa oportunidad (y completa los datos fiscales) en vez de crear otra. Escribe NUEVA para forzar una nueva.",
    tu: "Reenviar el email con el código si hace falta.",
  },
  {
    titulo: "Llamadas y WhatsApp",
    grupo: "Entrada",
    cuando: "Al momento (VoIPstudio) · cada minuto (+ Nueva)",
    que: "Las llamadas de números que no son clientes llegan a la bandeja Hoy y por email a quien corresponde. Lo que registras en + Nueva se convierte en oportunidad con su Sheet, igual que un email.",
    tu: "Registrar la llamada o el WhatsApp en + Nueva, o descartarla.",
  },
  {
    titulo: "Datos que faltan",
    grupo: "Presupuesto",
    cuando: "Al crear la oportunidad",
    que: "Revisa cada partida según su tipo (medidas, EI, hojas, apertura, capacidad, labio, dintel, interior/exterior, frío…) y la ubicación de la obra. Si falta algo importante, deja un borrador al cliente pidiéndolo, un aviso en el Sheet y la tarea en Hoy.",
    tu: "Revisar y enviar el borrador (o pedirlo por WhatsApp).",
  },
  {
    titulo: "Prioridad de proveedores",
    grupo: "Presupuesto",
    cuando: "Al crear el Sheet y al pedir precios",
    que: "El precio de referencia se busca primero en el proveedor 1 de cada tipo, luego en el 2 y el 3, con las reglas por volumen (p. ej. más de 5 rampas → Dock Equipment). Se edita en Proveedores.",
    tu: "Mantener la tabla de prioridad al día.",
  },
  {
    titulo: "Modelo de puerta rápida",
    grupo: "Presupuesto",
    cuando: "Al crear el Sheet y al pedir precios",
    que: "Según lo que pide el cliente (frío, autorreparable, clase de viento, exterior, uso) propone Novozip/Novoroll de Novoferm o DynamicRoll/Pack/Alupan de BMP, busca precio de ese modelo y lo indica al proveedor.",
    tu: "Revisar la nota de la columna C.",
  },
  {
    titulo: "Instalación y transporte",
    grupo: "Presupuesto",
    cuando: "Al crear el Sheet · histórico los lunes a las 7:00",
    que: "Calcula instalación (subcontrata) y transporte (del proveedor a obra) por unidad con los costes asumidos de cada tipo, con mínimo por pedido, y los compara cada semana con lo que cobran de verdad los proveedores.",
    tu: "Ajustar los costes en Proveedores si la desviación sale en rojo.",
  },
  {
    titulo: "Crear el presupuesto en Holded",
    grupo: "Presupuesto",
    cuando: "Al marcar la casilla K3 del Sheet (al momento)",
    que: "Crea BEUQxxx-A (o la siguiente revisión) con su PDF y te envía el email de revisión: pedido frente a ofertado, mark-up, instalación y transporte, similitud y fichas técnicas.",
    tu: "Revisar el email y enviar el presupuesto desde Holded.",
  },
  {
    titulo: "Pedir precios a proveedores",
    grupo: "Proveedores",
    cuando: "Al marcar la casilla K7 del Sheet (al momento)",
    que: "Prepara un borrador por proveedor con lo que pide el cliente, sus planos y el modelo propuesto. Si una partida no tiene proveedor, se pide al primero de la prioridad.",
    tu: "Revisar y enviar los borradores.",
  },
  {
    titulo: "Respuestas de proveedores",
    grupo: "Proveedores",
    cuando: "Cada 3 minutos",
    que: "La IA lee la respuesta y su PDF, guarda el presupuesto en la base de precios, rellena la comparativa del Sheet y pone el coste de la mejor oferta.",
    tu: "Nada: revisar la comparativa.",
  },
  {
    titulo: "Recordatorio a proveedores",
    grupo: "Proveedores",
    cuando: "Cada hora, lunes a viernes de 8 a 19 h",
    que: "Si el borrador de petición sigue sin enviar, avisa. Si pasan 3 días laborables sin respuesta, prepara un recordatorio (máximo 2) y después marca «Sin respuesta» para que pidas a otro.",
    tu: "Enviar los recordatorios que aparecen en Hoy.",
  },
  {
    titulo: "Estados desde Holded",
    grupo: "Seguimiento",
    cuando: "Cada 5–10 minutos",
    que: "Copia a la tabla Solicitudes lo que hacéis en Holded (enviado, ganado, perdido) y guarda la fecha de cada cambio.",
    tu: "Mover las oportunidades en Holded.",
  },
  {
    titulo: "Seguimiento al cliente",
    grupo: "Seguimiento",
    cuando: `Lunes a viernes, 9 a 18 h · días ${SEGUIMIENTO.DIAS_1}, ${SEGUIMIENTO.DIAS_2} y ${SEGUIMIENTO.DIAS_LLAMADA}`,
    que: `Email de seguimiento el día ${SEGUIMIENTO.DIAS_1}, segundo email el día ${SEGUIMIENTO.DIAS_2} y aviso para llamar el día ${SEGUIMIENTO.DIAS_LLAMADA}. Se para si el cliente responde, si se marca «Sin seguimiento» o si la oportunidad ya no existe en Holded.`,
    tu: "Llamar cuando aparezca en Hoy.",
  },
  {
    titulo: "Informe semanal",
    grupo: "Control",
    cuando: "Lunes desde las 8:00",
    que: "Email con lo nuevo, lo enviado, lo ganado y lo perdido de la semana, la cartera abierta y lo que necesita atención, por persona.",
    tu: "Leerlo.",
  },
  {
    titulo: "Aviso de errores",
    grupo: "Control",
    cuando: "Cuando algo falla",
    que: "Email con dónde ha fallado, el motivo y qué hacer. El mismo error no se repite en 24 h. Aparecen también aquí abajo.",
    tu: "Seguir la indicación del email.",
  },
];

const GRUPOS: Grupo[] = ["Entrada", "Presupuesto", "Proveedores", "Seguimiento", "Control"];

/** "Ciclo eduardo.z@…" → cuentas con su última vuelta (las escribe Ciclo.gs en la pestaña Sistema). */
function cuentasDeSistema(sistema: Record<string, string | number | boolean | null>) {
  return Object.entries(sistema)
    .filter(([k, v]) => /^Ciclo /.test(k) && typeof v === "string")
    .map(([k, v]) => ({ cuenta: k.replace(/^Ciclo /, ""), ultima: v as string }))
    .sort((a, b) => a.cuenta.localeCompare(b.cuenta));
}

export default function AutomatizacionesPage() {
  const { data, error, loading, refreshing, recargar } = usePortalData();
  const sistema = data?.sistema ?? {};
  const ultima = typeof sistema["Última revisión"] === "string" ? (sistema["Última revisión"] as string) : null;
  const ahora = data ? new Date(data.generado).getTime() : 0;
  const ok = !!ultima && ahora - new Date(ultima).getTime() < 15 * 60000;
  const cuentas = cuentasDeSistema(sistema);
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
          Corren en Google Apps Script (proyecto «Gmail a Holded»): una vuelta cada minuto en la cuenta de cada comercial, y las casillas del Sheet al momento.
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
                      {ok ? "Funcionando" : "Sin revisiones en los últimos 15 min"}
                    </dd>
                    <dt className="text-[#606060]">Última revisión</dt>
                    <dd>
                      {new Date(ultima).toLocaleString("es-ES")} ({haceCuanto(ultima)})
                    </dd>
                    {Object.entries(sistema)
                      .filter(([k]) => k !== "Última revisión" && !/^Ciclo /.test(k))
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
                <div className="mt-4 border-t border-[#efefec] pt-3">
                  <p className="mb-1.5 text-xs font-semibold text-[#606060]">Ciclo de cada cuenta</p>
                  {!cuentas.length ? (
                    <p className="text-xs text-[#8a8a8a]">
                      Aparece cuando cada cuenta tenga el Ciclo.gs del 29/10 (configurarCicloRapido ejecutado en esa cuenta).
                    </p>
                  ) : (
                    <ul className="flex flex-col gap-1 text-sm">
                      {cuentas.map((c) => {
                        const min = (ahora - new Date(c.ultima).getTime()) / 60000;
                        const viva = min < 15;
                        return (
                          <li key={c.cuenta} className="flex items-center gap-2">
                            <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${viva ? "bg-emerald-500" : "bg-[#e83038]"}`} aria-hidden />
                            <span className="font-medium">{nombreDeEmail(c.cuenta)}</span>
                            <span className="truncate text-xs text-[#8a8a8a]">{c.cuenta}</span>
                            <span className="ml-auto whitespace-nowrap text-xs text-[#606060]">{viva ? haceCuanto(c.ultima) : `parado · ${haceCuanto(c.ultima)}`}</span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
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

            <Tarjeta titulo={`Qué hace cada una · ${AUTOMATIZACIONES.length}`}>
              <div className="flex flex-col gap-5">
                {GRUPOS.map((g) => (
                  <section key={g}>
                    <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-[#8a8a8a]">{g}</h3>
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {AUTOMATIZACIONES.filter((a) => a.grupo === g).map((a) => (
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
                  </section>
                ))}
              </div>
            </Tarjeta>
          </div>
        )}
      </main>
    </div>
  );
}
