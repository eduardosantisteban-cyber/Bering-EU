"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ClipboardList, ExternalLink, FileQuestion, Mail, PhoneCall, PhoneMissed, Send, Truck, type LucideIcon } from "lucide-react";
import { bandejaHoy, NOMBRE_TAREA, type EntradaPortal, type LlamadaPendiente, type Peticion, type Tarea, type TipoTarea } from "@/lib/darsena";
import { nombreDeEmail, type Oportunidad } from "@/lib/solicitudes";

// Piezas de Dársena: bandeja "Hoy" y datos auxiliares (peticiones a proveedores, llamadas y entradas del portal).

async function leerJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error || `Error ${res.status}`);
  return body as T;
}

/** Peticiones de precio a proveedores + llamadas sin registrar + entradas del portal (para la bandeja Hoy). */
export function useDatosHoy() {
  const [peticiones, setPeticiones] = useState<Peticion[]>([]);
  const [llamadas, setLlamadas] = useState<LlamadaPendiente[]>([]);
  const [entradas, setEntradas] = useState<EntradaPortal[]>([]);
  const [avisos, setAvisos] = useState<string[]>([]);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    const av: string[] = [];
    const [p, e] = await Promise.all([
      leerJson<{ peticiones: Peticion[] }>("/api/darsena/peticiones").catch((err: Error) => {
        av.push("Peticiones a proveedores: " + err.message);
        return { peticiones: [] as Peticion[] };
      }),
      leerJson<{ entradas: EntradaPortal[]; llamadas: LlamadaPendiente[] }>("/api/entradas").catch((err: Error) => {
        av.push("Llamadas y entradas del portal: " + err.message);
        return { entradas: [] as EntradaPortal[], llamadas: [] as LlamadaPendiente[] };
      }),
    ]);
    setPeticiones(p.peticiones || []);
    setLlamadas(e.llamadas || []);
    setEntradas(e.entradas || []);
    setAvisos(av);
    setCargando(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial de datos
    cargar();
  }, [cargar]);

  return { peticiones, llamadas, entradas, avisos, cargando, recargar: cargar };
}

const ICONO: Record<TipoTarea, LucideIcon> = {
  llamar: PhoneCall,
  respondio: Mail,
  error: AlertTriangle,
  llamada: PhoneMissed,
  datos: FileQuestion,
  proveedor: Truck,
  presupuestar: ClipboardList,
  enviar: Send,
};

const COLOR: Record<TipoTarea, string> = {
  llamar: "#e83038",
  respondio: "#e83038",
  error: "#b3161b",
  llamada: "#c2410c",
  datos: "#b45309",
  proveedor: "#1d4ed8",
  presupuestar: "#282828",
  enviar: "#4b5563",
};

function FilaTarea({ t, mostrarQuien, onAbrir }: { t: Tarea; mostrarQuien: boolean; onAbrir?: (codigo: string) => void }) {
  const Icono = ICONO[t.tipo];
  const externo = t.enlace && /^https?:/.test(t.enlace.url);
  return (
    <li className={`flex items-start gap-3 py-2.5 ${t.prioridad === 1 ? "" : "opacity-90"}`}>
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full" style={{ background: COLOR[t.tipo] + "14", color: COLOR[t.tipo] }} aria-hidden>
        <Icono size={15} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm">
          <span className="font-semibold text-[#282828]">{t.titulo}</span>
          {t.prioridad === 1 && <span className="ml-1.5 rounded bg-[#fdecec] px-1.5 py-0.5 align-middle text-[10px] font-bold uppercase tracking-wide text-[#b3161b]">Hoy</span>}
        </p>
        <p className="text-xs text-[#606060]">
          {t.codigo && (
            <>
              {onAbrir ? (
                <button type="button" onClick={() => onAbrir(t.codigo as string)} className="font-semibold text-[#282828] underline decoration-[#e2e0dc] underline-offset-2 hover:decoration-[#282828]">
                  {t.codigo}
                </button>
              ) : (
                <Link href={`/oportunidades/${t.codigo}`} className="font-semibold text-[#282828] underline decoration-[#e2e0dc] underline-offset-2">
                  {t.codigo}
                </Link>
              )}
              {t.empresa ? ` · ${t.empresa}` : ""}
              {" · "}
            </>
          )}
          {t.detalle}
          {mostrarQuien && t.quien && <span className="text-[#8a8a8a]"> · {nombreDeEmail(t.quien)}</span>}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1 text-xs text-[#606060]">
        {t.dias !== null && t.dias !== undefined && <span className="tabular-nums">{t.dias === 0 ? "hoy" : `${t.dias} d`}</span>}
        {t.enlace &&
          (externo ? (
            <a href={t.enlace.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-[#e83038] hover:underline">
              {t.enlace.texto} <ExternalLink size={11} />
            </a>
          ) : (
            <Link href={t.enlace.url} className="font-medium text-[#e83038] hover:underline">
              {t.enlace.texto}
            </Link>
          ))}
      </div>
    </li>
  );
}

/** Bandeja "Hoy": todo lo que necesita a una persona, de todas las fuentes. */
export function BandejaHoy({
  ops,
  datos,
  ahora,
  quien,
  onAbrir,
  max = 12,
}: {
  ops: Oportunidad[];
  datos: ReturnType<typeof useDatosHoy>;
  ahora: Date;
  quien: string;
  onAbrir?: (codigo: string) => void;
  max?: number;
}) {
  const [tipo, setTipo] = useState<TipoTarea | "">("");
  const [todas, setTodas] = useState(false);
  const tareas = useMemo(() => {
    const t = bandejaHoy(ops, datos.peticiones, datos.llamadas, datos.entradas, ahora);
    return quien ? t.filter((x) => !x.quien || x.quien === quien) : t;
  }, [ops, datos.peticiones, datos.llamadas, datos.entradas, ahora, quien]);
  const tipos = useMemo(() => {
    const m = new Map<TipoTarea, number>();
    for (const t of tareas) m.set(t.tipo, (m.get(t.tipo) || 0) + 1);
    return [...m.entries()];
  }, [tareas]);
  const visibles = tipo ? tareas.filter((t) => t.tipo === tipo) : tareas;
  const lista = todas ? visibles : visibles.slice(0, max);
  const urgentes = tareas.filter((t) => t.prioridad === 1).length;

  return (
    <div>
      <p className="mb-2 text-xs text-[#606060]">
        {tareas.length ? `${urgentes} para hoy · ${tareas.length - urgentes} más` : ""}
      </p>
      {tipos.length > 1 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setTipo("")}
            className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${tipo === "" ? "border-[#282828] bg-[#282828] text-white" : "border-[#e2e0dc] text-[#606060] hover:border-[#606060]"}`}
          >
            Todo · {tareas.length}
          </button>
          {tipos.map(([k, n]) => (
            <button
              key={k}
              type="button"
              onClick={() => setTipo(tipo === k ? "" : k)}
              className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${tipo === k ? "border-[#282828] bg-[#282828] text-white" : "border-[#e2e0dc] text-[#606060] hover:border-[#606060]"}`}
            >
              {NOMBRE_TAREA[k]} · {n}
            </button>
          ))}
        </div>
      )}
      {datos.cargando && !tareas.length ? (
        <p className="py-2 text-sm text-[#606060]">Cargando…</p>
      ) : !tareas.length ? (
        <p className="py-2 text-sm font-medium text-[#1e7e34]">Nada pendiente. Todo al día.</p>
      ) : (
        <ul className="divide-y divide-[#efefec]">
          {lista.map((t) => (
            <FilaTarea key={t.id} t={t} mostrarQuien={!quien} onAbrir={onAbrir} />
          ))}
        </ul>
      )}
      {visibles.length > max && (
        <button type="button" onClick={() => setTodas((v) => !v)} className="mt-2 text-xs font-medium text-[#e83038] hover:underline">
          {todas ? "Ver menos" : `Ver las ${visibles.length}`}
        </button>
      )}
      {datos.avisos.map((a) => (
        <p key={a} className="mt-2 text-xs text-[#9a5b00]">
          {a}
        </p>
      ))}
    </div>
  );
}
