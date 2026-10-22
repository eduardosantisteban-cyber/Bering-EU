"use client";

import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { CheckCircle2, Loader2, Phone, PhoneMissed, X } from "lucide-react";
import { PortalHeader } from "../components/PortalNav";
import { Tarjeta, haceCuanto } from "../components/portal";
import { CANALES_ENTRADA, COMERCIALES } from "@/lib/entradas";

// Nueva oportunidad que no llega por email: llamada, WhatsApp o en persona.
// Se guarda en Supabase y el script de la cuenta de quien la lleva la crea en Holded (con su código BEUQ/MMQ,
// fila en Solicitudes, Sheet de presupuesto y seguimientos) en su siguiente revisión, en unos 5 minutos.

interface Llamada {
  id: string;
  creado: string;
  numero: string;
  duracion: number | null;
  perdida: boolean;
  comercial: string | null;
  cliente: string | null;
  estado: string;
}
interface Entrada {
  id: string;
  creado: string;
  canal: string;
  registrado_por: string;
  empresa: string;
  estado: string;
  codigo: string | null;
  error: string | null;
}

const VACIO = { canal: "Llamada", registrado_por: "", empresa: "", contacto: "", email: "", telefono: "", nota: "", llamada_id: "" };

const inputCls =
  "w-full rounded-md border border-[#d6d3ce] bg-white px-3 py-2 text-sm text-[#282828] outline-none focus:border-[#282828] focus:ring-1 focus:ring-[#282828]";

function duracionTxt(s: number | null): string {
  if (s === null) return "";
  if (s < 60) return `${s} s`;
  return `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, "0")} s`;
}

function nombreComercial(email: string | null): string {
  return COMERCIALES.find((c) => c.email === email)?.nombre || email || "";
}

export default function NuevaOportunidadPage() {
  const [f, setF] = useState(VACIO);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const [hecho, setHecho] = useState(false);
  const [datos, setDatos] = useState<{ entradas: Entrada[]; llamadas: Llamada[] } | null>(null);
  const [errorDatos, setErrorDatos] = useState("");

  const cargar = useCallback(async () => {
    try {
      const res = await fetch("/api/entradas", { cache: "no-store" });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || `Error ${res.status}`);
      setDatos(body);
      setErrorDatos("");
    } catch (e) {
      setErrorDatos((e as Error).message);
    }
  }, []);

  useEffect(() => {
    // Comercial recordado en este navegador y datos de la llamada si se llega desde el aviso (?llamada=…&tel=…)
    const p = new URLSearchParams(window.location.search);
    let quien = "";
    try {
      quien = localStorage.getItem("portal_comercial") || "";
    } catch {
      /* sin almacenamiento */
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- valores iniciales desde la URL
    setF((x) => ({
      ...x,
      registrado_por: p.get("comercial") || quien || x.registrado_por,
      telefono: p.get("tel") || x.telefono,
      llamada_id: p.get("llamada") || x.llamada_id,
      canal: p.get("canal") || x.canal,
    }));
    cargar();
  }, [cargar]);

  const set = (k: keyof typeof VACIO) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setF((x) => ({ ...x, [k]: e.target.value }));

  function desdeLlamada(l: Llamada) {
    setHecho(false);
    setF((x) => ({ ...VACIO, registrado_por: l.comercial || x.registrado_por, canal: "Llamada", telefono: l.numero, empresa: l.cliente || "", llamada_id: l.id }));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function descartar(l: Llamada) {
    await fetch("/api/entradas/llamadas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: l.id, accion: "descartar" }) });
    cargar();
  }

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError("");
    try {
      const res = await fetch("/api/entradas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || `Error ${res.status}`);
      try {
        localStorage.setItem("portal_comercial", f.registrado_por);
      } catch {
        /* sin almacenamiento */
      }
      setHecho(true);
      setF({ ...VACIO, registrado_por: f.registrado_por });
      if (window.location.search) window.history.replaceState(null, "", "/nueva");
      cargar();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  const porRegistrar = (datos?.llamadas ?? []).filter((l) => l.estado !== "cliente");
  const deClientes = (datos?.llamadas ?? []).filter((l) => l.estado === "cliente");
  const marca = COMERCIALES.find((c) => c.email === f.registrado_por)?.marca;

  return (
    <div className="flex min-h-screen flex-col">
      <PortalHeader />
      <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 py-5 sm:px-5">
        <div className="mb-4">
          <h1 className="text-xl font-bold text-[#282828]">Nueva oportunidad</h1>
          <p className="text-sm text-[#606060]">
            Para las solicitudes que llegan por teléfono, WhatsApp o en persona. Se crea igual que las de email: código, Holded, tabla Solicitudes,
            presupuesto y seguimientos.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <Tarjeta titulo="Datos de la solicitud">
            {hecho && (
              <p className="mb-4 flex items-start gap-2 rounded-md bg-[#e6f4ea] px-3 py-2 text-sm text-[#1e7e34]">
                <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
                Registrada. En unos 5 minutos tendrá su código y aparecerá en Holded y en la tabla Solicitudes.
              </p>
            )}
            <form onSubmit={enviar} className="flex flex-col gap-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm">
                  <span className="mb-1 block font-medium text-[#282828]">Canal</span>
                  <select value={f.canal} onChange={set("canal")} className={inputCls}>
                    {CANALES_ENTRADA.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </label>
                <label className="text-sm">
                  <span className="mb-1 block font-medium text-[#282828]">La lleva</span>
                  <select value={f.registrado_por} onChange={set("registrado_por")} className={inputCls} required>
                    <option value="">Elige…</option>
                    {COMERCIALES.map((c) => (
                      <option key={c.email} value={c.email}>
                        {c.nombre} · {c.marca}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm">
                  <span className="mb-1 block font-medium text-[#282828]">Empresa *</span>
                  <input value={f.empresa} onChange={set("empresa")} className={inputCls} placeholder="o nombre si es particular" required />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block font-medium text-[#282828]">Persona de contacto</span>
                  <input value={f.contacto} onChange={set("contacto")} className={inputCls} />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block font-medium text-[#282828]">Teléfono</span>
                  <input value={f.telefono} onChange={set("telefono")} className={inputCls} inputMode="tel" placeholder="+34 6xx xxx xxx" />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block font-medium text-[#282828]">Email</span>
                  <input value={f.email} onChange={set("email")} className={inputCls} type="email" placeholder="para enviarle el presupuesto" />
                </label>
              </div>
              <label className="text-sm">
                <span className="mb-1 block font-medium text-[#282828]">Qué pide *</span>
                <textarea
                  value={f.nota}
                  onChange={set("nota")}
                  rows={8}
                  className={inputCls}
                  required
                  placeholder={
                    "Resume la llamada o pega aquí el chat de WhatsApp.\nEj.: 2 puertas seccionales 4000 x 4500 mm y 1 muelle de carga para nave en Zaragoza, obra en enero."
                  }
                />
                <span className="mt-1 block text-xs text-[#606060]">
                  La IA saca productos, medidas, cantidades y provincia de este texto. Cuanto más concreto, mejor sale el presupuesto.
                </span>
              </label>
              {!f.email && <p className="text-xs text-[#9a5b00]">Sin email no se enviarán los seguimientos automáticos (solo el aviso para llamar).</p>}
              {f.llamada_id && <p className="text-xs text-[#606060]">Se registra desde una llamada entrante de {f.telefono}.</p>}
              {error && <p className="rounded-md bg-[#fdecec] px-3 py-2 text-sm text-[#8a1014]">{error}</p>}
              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  disabled={enviando}
                  className="inline-flex items-center gap-2 rounded-md bg-[#e83038] px-4 py-2 text-sm font-semibold text-white hover:bg-[#c8232a] disabled:opacity-50"
                >
                  {enviando && <Loader2 size={14} className="animate-spin" />} Registrar oportunidad
                </button>
                {marca && <span className="text-xs text-[#606060]">Se numerará como {marca === "Muelle Max" ? "MMQ" : "BEUQ"} ({marca}).</span>}
              </div>
            </form>
          </Tarjeta>

          <div className="flex flex-col gap-4">
            <Tarjeta titulo={`Llamadas por registrar · ${porRegistrar.length}`} sub="Llamadas de números que no son clientes en Holded (VoIPstudio), últimos 14 días.">
              {errorDatos ? (
                <p className="text-sm text-[#8a1014]">{errorDatos}</p>
              ) : !datos ? (
                <p className="text-sm text-[#606060]">Cargando…</p>
              ) : porRegistrar.length === 0 ? (
                <p className="text-sm text-[#606060]">Ninguna pendiente.</p>
              ) : (
                <ul className="divide-y divide-[#efefec]">
                  {porRegistrar.map((l) => (
                    <FilaLlamada key={l.id} l={l} onRegistrar={() => desdeLlamada(l)} onDescartar={() => descartar(l)} />
                  ))}
                </ul>
              )}
              {deClientes.length > 0 && (
                <details className="mt-3 text-sm">
                  <summary className="cursor-pointer text-[#606060]">Llamadas de clientes ya en Holded · {deClientes.length}</summary>
                  <ul className="mt-2 divide-y divide-[#efefec]">
                    {deClientes.map((l) => (
                      <FilaLlamada key={l.id} l={l} onRegistrar={() => desdeLlamada(l)} onDescartar={() => descartar(l)} />
                    ))}
                  </ul>
                </details>
              )}
            </Tarjeta>

            <Tarjeta titulo="Últimas registradas aquí">
              {!datos || datos.entradas.length === 0 ? (
                <p className="text-sm text-[#606060]">{datos ? "Todavía ninguna." : "Cargando…"}</p>
              ) : (
                <ul className="divide-y divide-[#efefec] text-sm">
                  {datos.entradas.map((e) => (
                    <li key={e.id} className="flex items-start justify-between gap-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-[#282828]">{e.empresa}</p>
                        <p className="text-xs text-[#606060]">
                          {e.canal} · {nombreComercial(e.registrado_por)} · {haceCuanto(e.creado)}
                        </p>
                        {e.estado === "error" && e.error && <p className="mt-1 text-xs text-[#8a1014]">{e.error}</p>}
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                          e.estado === "creada" ? "bg-[#e6f4ea] text-[#1e7e34]" : e.estado === "error" ? "bg-[#fdecec] text-[#8a1014]" : "bg-[#f1efeb] text-[#606060]"
                        }`}
                      >
                        {e.estado === "creada" ? e.codigo || "Creada" : e.estado === "error" ? "Error" : "En cola"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Tarjeta>
          </div>
        </div>
      </main>
    </div>
  );
}

function FilaLlamada({ l, onRegistrar, onDescartar }: { l: Llamada; onRegistrar: () => void; onDescartar: () => void }) {
  return (
    <li className="flex items-center justify-between gap-3 py-2 text-sm">
      <div className="flex min-w-0 items-start gap-2">
        {l.perdida ? <PhoneMissed size={16} className="mt-0.5 shrink-0 text-[#e83038]" /> : <Phone size={16} className="mt-0.5 shrink-0 text-[#606060]" />}
        <div className="min-w-0">
          <p className="font-medium text-[#282828]">
            {l.numero}
            {l.cliente ? <span className="font-normal text-[#606060]"> · {l.cliente}</span> : null}
          </p>
          <p className="text-xs text-[#606060]">
            {l.perdida ? "Perdida — devolver llamada" : duracionTxt(l.duracion)} · {haceCuanto(l.creado)}
            {l.comercial ? ` · ${nombreComercial(l.comercial)}` : ""}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button onClick={onRegistrar} className="rounded-md border border-[#d6d3ce] px-2 py-1 text-xs font-medium text-[#282828] hover:bg-[#f6f5f2]">
          Registrar
        </button>
        <button onClick={onDescartar} title="No es una oportunidad" aria-label="Descartar" className="rounded-md p-1 text-[#909090] hover:bg-[#f6f5f2] hover:text-[#282828]">
          <X size={14} />
        </button>
      </div>
    </li>
  );
}
