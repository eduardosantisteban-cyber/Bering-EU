"use client";

import { useCallback, useEffect, useState } from "react";
import { FileSpreadsheet, FileText, Loader2, Send } from "lucide-react";
import type { PortalData } from "@/lib/portalTypes";
import type { FilaTipo, Mes, Oportunidad } from "@/lib/solicitudes";
import { nombreDeEmail } from "@/lib/solicitudes";

// Piezas compartidas por Inicio, Oportunidades y Automatizaciones.

// ── Datos ──

export function usePortalData() {
  const [data, setData] = useState<PortalData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const cargar = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/portal", { cache: "no-store" });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || `Error ${res.status}`);
      setData(body as PortalData);
      setError(null);
    } catch (err) {
      setError((err as Error).message || "No se pudieron cargar los datos");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial de datos
    cargar();
  }, [cargar]);

  return { data, error, loading, refreshing, recargar: cargar };
}

/** Persona elegida ("" = todo el equipo), recordada en este navegador. */
export function usePersona(): [string, (p: string) => void] {
  const [persona, setPersonaState] = useState("");
  useEffect(() => {
    try {
      const p = localStorage.getItem("portal_persona");
      // eslint-disable-next-line react-hooks/set-state-in-effect -- preferencia guardada en este navegador
      if (p) setPersonaState(p);
    } catch {
      /* sin almacenamiento */
    }
  }, []);
  const setPersona = (p: string) => {
    setPersonaState(p);
    try {
      localStorage.setItem("portal_persona", p);
    } catch {
      /* sin almacenamiento */
    }
  };
  return [persona, setPersona];
}

export function personasDe(ops: Oportunidad[]): string[] {
  return [...new Set(ops.map((o) => o.registradoPor).filter(Boolean))].sort();
}

// ── Formato ──

export function eur(v: number | null | undefined): string {
  if (v === null || v === undefined || !isFinite(v)) return "—";
  const n = Math.round(v);
  return (n < 0 ? "-" : "") + String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".") + " €";
}

export function eurCorto(v: number): string {
  if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(1).replace(".", ",") + " M€";
  if (Math.abs(v) >= 1e4) return Math.round(v / 1e3) + " k€";
  return eur(v);
}

export function fechaCorta(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

export function haceCuanto(iso: string | null | undefined): string {
  if (!iso) return "—";
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "hace un momento";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `hace ${h} h`;
  return `hace ${Math.round(h / 24)} días`;
}

// ── Piezas visuales ──

export function Cargando({ texto = "Cargando…" }: { texto?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-20 text-[#606060]">
      <Loader2 size={18} className="animate-spin" /> {texto}
    </div>
  );
}

export function ErrorDatos({ mensaje, onReintentar }: { mensaje: string; onReintentar: () => void }) {
  return (
    <div className="rounded-lg border border-[#e83038]/30 bg-[#fdecec] p-4 text-sm text-[#8a1014]">
      <p className="font-semibold">No se pudieron leer las oportunidades</p>
      <p className="mt-1">{mensaje}</p>
      <button onClick={onReintentar} className="mt-3 rounded-md border border-[#e83038]/40 bg-white px-3 py-1 text-sm font-medium text-[#e83038]">
        Reintentar
      </button>
    </div>
  );
}

export function Tarjeta({
  titulo,
  sub,
  accion,
  children,
  className = "",
}: {
  titulo: string;
  sub?: string;
  accion?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`min-w-0 rounded-lg border border-[#e2e0dc] bg-white p-4 ${className}`}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[#282828]">{titulo}</h2>
          {sub && <p className="mt-0.5 text-xs text-[#606060]">{sub}</p>}
        </div>
        {accion}
      </div>
      {children}
    </section>
  );
}

export function Kpi({ label, valor, sub, alerta }: { label: string; valor: string; sub?: string; alerta?: boolean }) {
  return (
    <div className="rounded-lg border border-[#e2e0dc] bg-white px-4 py-3">
      <p className="text-xs font-medium text-[#606060]">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${alerta ? "text-[#e83038]" : "text-[#282828]"}`}>{valor}</p>
      {sub && <p className="mt-0.5 text-xs text-[#8a8a8a]">{sub}</p>}
    </div>
  );
}

const PILL: Record<string, { nombre: string; cls: string }> = {
  "Pendiente presupuesto": { nombre: "Pendiente", cls: "bg-[#f1f1ef] text-[#606060] border border-[#e2e0dc]" },
  "Presupuesto listo": { nombre: "Listo", cls: "bg-[#fff4e0] text-[#9a5b00]" },
  "Presupuesto en Holded": { nombre: "En Holded", cls: "bg-[#e8f0fa] text-[#2a5d99]" },
  "Presupuesto enviado": { nombre: "Enviado", cls: "bg-[#efeafc] text-[#5b3fb0]" },
  Ganado: { nombre: "Ganado", cls: "bg-[#e6f4ea] text-[#1e7e34]" },
  Perdido: { nombre: "Perdido", cls: "bg-[#f1f1ef] text-[#8a8a8a] line-through" },
  "Error Holded": { nombre: "Error", cls: "bg-[#fdecec] text-[#b3161b]" },
};

export function EstadoPill({ estado }: { estado: string }) {
  const p = PILL[estado] || { nombre: estado || "Sin estado", cls: "bg-[#f1f1ef] text-[#606060]" };
  return <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${p.cls}`}>{p.nombre}</span>;
}

export const NOMBRES_ESTADO = PILL;

/** Enlaces de una oportunidad: Sheet del presupuesto, PDF y email del cliente. */
export function EnlacesOportunidad({ o }: { o: Oportunidad }) {
  const cls =
    "inline-flex items-center gap-1 rounded-md border border-[#e2e0dc] px-1.5 py-0.5 text-xs font-medium text-[#606060] hover:border-[#606060] hover:text-[#282828]";
  return (
    <span className="inline-flex flex-wrap gap-1">
      {o.sheetUrl && (
        <a href={o.sheetUrl} target="_blank" rel="noopener noreferrer" className={cls} title="Sheet del presupuesto">
          <FileSpreadsheet size={12} /> Sheet
        </a>
      )}
      {o.pdfUrl && (
        <a href={o.pdfUrl} target="_blank" rel="noopener noreferrer" className={cls} title="Presupuesto en PDF">
          <FileText size={12} /> PDF
        </a>
      )}
      {o.gmailUrl && (
        <a href={o.gmailUrl} target="_blank" rel="noopener noreferrer" className={cls} title="Solicitud del cliente en Gmail (cuenta de quien la registró)">
          <Send size={12} /> Email
        </a>
      )}
    </span>
  );
}

export function SelectorPersona({
  personas,
  valor,
  onChange,
}: {
  personas: string[];
  valor: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-[#606060]">Ver</span>
      <select
        className="rounded-md border border-[#e2e0dc] bg-white px-2 py-1 text-sm font-medium outline-none focus:border-[#e83038]"
        value={personas.includes(valor) ? valor : ""}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Todo el equipo</option>
        {personas.map((p) => (
          <option key={p} value={p}>
            {nombreDeEmail(p)}
          </option>
        ))}
      </select>
    </label>
  );
}

// ── Gráfico: ofertado vs ganado por mes ──

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const COLOR_OFERTADO = "#3D7BC4";
const COLOR_GANADO = "#E83338";

export function GraficoMeses({ meses }: { meses: Mes[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 560,
    H = 220,
    L = 48,
    R = 8,
    T = 10,
    B = 24;
  const iw = W - L - R,
    ih = H - T - B;
  const max = Math.max(1, ...meses.map((m) => Math.max(m.ofertado, m.ganado)));
  let paso = Math.pow(10, Math.floor(Math.log10(max)));
  const tope = Math.ceil(max / paso) * paso;
  if (tope / paso > 5) paso *= 2;
  const ticks: number[] = [];
  for (let v = 0; v <= tope + 1e-9; v += paso) ticks.push(v);
  const y = (v: number) => T + ih - (v / tope) * ih;
  const bw = iw / meses.length;
  const barW = Math.min(24, (bw - 16) / 2);
  const barra = (x: number, v: number, color: string, key: string) => {
    if (v <= 0) return null;
    const h = Math.max(2, (v / tope) * ih),
      by = T + ih - h,
      r = Math.min(4, barW / 2, h);
    return (
      <path
        key={key}
        fill={color}
        d={`M${x},${by + h}V${by + r}Q${x},${by} ${x + r},${by}H${x + barW - r}Q${x + barW},${by} ${x + barW},${by + r}V${by + h}Z`}
      />
    );
  };
  const m = hover !== null ? meses[hover] : null;
  return (
    <div>
      <div className="mb-1 flex gap-4 text-xs text-[#606060]">
        <span className="inline-flex items-center gap-1.5">
          <i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: COLOR_OFERTADO }} /> Ofertado
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: COLOR_GANADO }} /> Ganado
        </span>
        <span className="ml-auto text-[#8a8a8a]">
          {m ? `${MESES[m.mes]} ${m.anio}: ofertado ${eur(m.ofertado)} (${m.solicitudes}) · ganado ${eur(m.ganado)} (${m.nGanados})` : "Pasa el ratón por un mes"}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label="Ofertado y ganado por mes">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="#efefec" />
            <text x={L - 6} y={y(t) + 4} textAnchor="end" fontSize="11" fill="#8a8a8a">
              {t === 0 ? "0" : eurCorto(t).replace(" €", "")}
            </text>
          </g>
        ))}
        {meses.map((mm, i) => {
          const cx = L + bw * i + bw / 2;
          return (
            <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onClick={() => setHover(i)}>
              <rect x={L + bw * i} y={T} width={bw} height={ih} fill={hover === i ? "rgba(40,40,40,.04)" : "transparent"} />
              {barra(cx - barW - 1, mm.ofertado, COLOR_OFERTADO, "o")}
              {barra(cx + 1, mm.ganado, COLOR_GANADO, "g")}
              <text x={cx} y={H - 7} textAnchor="middle" fontSize="11" fill="#8a8a8a">
                {MESES[mm.mes]}
                {mm.mes === 0 ? " " + String(mm.anio).slice(2) : ""}
              </text>
            </g>
          );
        })}
        <line x1={L} x2={W - R} y1={T + ih} y2={T + ih} stroke="#8a8a8a" />
      </svg>
    </div>
  );
}

export function TablaTipos({ tipos }: { tipos: FilaTipo[] }) {
  if (!tipos.length) return <p className="text-sm text-[#606060]">Sin datos.</p>;
  const max = Math.max(1, ...tipos.map((t) => t.ofertado));
  return (
    <table className="w-full text-sm">
      <thead className="text-left text-xs text-[#606060]">
        <tr>
          <th className="py-1.5 font-medium">Tipo</th>
          <th className="py-1.5 text-center font-medium">Solic.</th>
          <th className="py-1.5 text-right font-medium">Ofertado</th>
          <th className="py-1.5 text-center font-medium" title="Ganados / perdidos">
            G / P
          </th>
          <th className="py-1.5 text-center font-medium">Cierre</th>
        </tr>
      </thead>
      <tbody>
        {tipos.map((t) => (
          <tr key={t.tipo} className="border-t border-[#efefec]">
            <td className="py-2 pr-2">
              <span className="font-medium">{t.tipo}</span>
              <span className="mt-1 block h-1.5 rounded bg-[#efefec]">
                <span className="block h-1.5 rounded bg-[#282828]" style={{ width: `${(100 * t.ofertado) / max}%` }} />
              </span>
            </td>
            <td className="py-2 text-center tabular-nums">{t.solicitudes}</td>
            <td className="py-2 text-right tabular-nums">{eur(t.ofertado)}</td>
            <td className="py-2 text-center tabular-nums">
              {t.ganados} / {t.perdidos}
            </td>
            <td className="py-2 text-center tabular-nums">{t.tasa === null ? "—" : Math.round(t.tasa * 100) + "%"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
