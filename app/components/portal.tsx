"use client";

import { useCallback, useEffect, useState } from "react";
import { ExternalLink, FileSpreadsheet, FileText, Loader2, Send, X } from "lucide-react";
import type { PortalData } from "@/lib/portalTypes";
import type { Embudo as DatosEmbudo, FilaTipo, Mes, Oportunidad } from "@/lib/solicitudes";
import { nombreDeEmail } from "@/lib/solicitudes";
import { IVA, MARCAS, MARCA_PRINCIPAL, MOTIVOS_PERDIDA } from "@/lib/portalConfig";

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

// ── Filtros de marca y periodo (recordados en este navegador) ──

export const PERIODOS = [
  { dias: 90, nombre: "90 días" },
  { dias: 365, nombre: "12 meses" },
  { dias: 0, nombre: "Todo" },
];
export const NOMBRES_MARCA = [MARCA_PRINCIPAL, ...MARCAS.map((m) => m.nombre)];

function useGuardado<T extends string | number>(clave: string, inicial: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(inicial);
  useEffect(() => {
    try {
      const g = localStorage.getItem(clave);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- preferencia guardada en este navegador
      if (g !== null) setV((typeof inicial === "number" ? Number(g) : g) as T);
    } catch {
      /* sin almacenamiento */
    }
  }, [clave, inicial]);
  const set = (x: T) => {
    setV(x);
    try {
      localStorage.setItem(clave, String(x));
    } catch {
      /* sin almacenamiento */
    }
  };
  return [v, set];
}

/** Marca elegida ("" = todas). */
export function useMarca() {
  return useGuardado<string>("portal_marca", "");
}
/** Periodo de los análisis en días (0 = desde el inicio). */
export function usePeriodo() {
  return useGuardado<number>("portal_periodo", 365);
}

function Segmentado<T extends string | number>({
  etiqueta,
  opciones,
  valor,
  onChange,
}: {
  etiqueta: string;
  opciones: { v: T; n: string }[];
  valor: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex items-center gap-2 text-sm" role="group" aria-label={etiqueta}>
      <span className="hidden text-[#606060] sm:inline">{etiqueta}</span>
      <div className="inline-flex rounded-md border border-[#e2e0dc] bg-white p-0.5">
        {opciones.map((o) => (
          <button
            key={String(o.v)}
            type="button"
            aria-pressed={valor === o.v}
            onClick={() => onChange(o.v)}
            className={`whitespace-nowrap rounded px-2.5 py-1 text-xs font-semibold ${
              valor === o.v ? "bg-[#282828] text-white" : "text-[#606060] hover:text-[#282828]"
            }`}
          >
            {o.n}
          </button>
        ))}
      </div>
    </div>
  );
}

export function SelectorMarca({ valor, onChange }: { valor: string; onChange: (v: string) => void }) {
  return (
    <Segmentado
      etiqueta="Marca"
      valor={valor}
      onChange={onChange}
      opciones={[{ v: "", n: "Todas" }, ...NOMBRES_MARCA.map((m) => ({ v: m, n: m }))]}
    />
  );
}

export function SelectorPeriodo({ valor, onChange }: { valor: number; onChange: (v: number) => void }) {
  return <Segmentado etiqueta="Periodo" valor={valor} onChange={onChange} opciones={PERIODOS.map((p) => ({ v: p.dias, n: p.nombre }))} />;
}

export function textoPeriodo(dias: number): string {
  return dias === 90 ? "últimos 90 días" : dias === 365 ? "últimos 12 meses" : "desde el inicio";
}

export function MarcaBadge({ marca }: { marca: string }) {
  if (!marca || marca === MARCA_PRINCIPAL) return null;
  return (
    <span className="ml-1.5 inline-block rounded bg-[#e2f3f5] px-1.5 py-px align-middle text-[10px] font-bold uppercase tracking-wide text-[#0f7c8c]">
      {marca}
    </span>
  );
}

export function OrigenBadge({ o }: { o: Pick<Oportunidad, "origen"> }) {
  if (o.origen !== "crm") return null;
  return (
    <span
      className="ml-1.5 inline-block rounded bg-[#f1f1ef] px-1.5 py-px align-middle text-[10px] font-bold uppercase tracking-wide text-[#8a8a8a]"
      title="Solo está en Holded: anterior a la automatización (sin hoja de cálculo, emails ni seguimiento)"
    >
      CRM
    </span>
  );
}

export const conIva = (v: number | null | undefined) => (v === null || v === undefined ? null : v * (1 + IVA));
export const pct = (a: number, b: number) => (b ? Math.round((100 * a) / b) + "%" : "—");
export const dias1 = (v: number | null | undefined) => (v === null || v === undefined ? "—" : String(Math.round(v * 10) / 10).replace(".", ",") + " d");

// ── Acciones que escriben en la hoja ──

export async function accionPortal(accion: "motivo" | "sinSeguimiento", codigo: string, valor: string | boolean): Promise<{ holded?: boolean }> {
  const res = await fetch("/api/portal/accion", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accion, codigo, valor }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error || `Error ${res.status}`);
  return body || {};
}

export function SelectorMotivo({ o, onGuardado }: { o: Oportunidad; onGuardado: () => void }) {
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  return (
    <span className="inline-flex flex-col gap-1">
      <select
        aria-label={`Motivo de pérdida de ${o.codigo}`}
        disabled={guardando}
        value={o.motivoPerdida}
        onChange={async (e) => {
          setGuardando(true);
          setError("");
          try {
            await accionPortal("motivo", o.codigo, e.target.value);
            onGuardado();
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setGuardando(false);
          }
        }}
        className="rounded-md border border-[#e2e0dc] bg-white px-2 py-1 text-sm outline-none focus:border-[#e83038] disabled:opacity-50"
      >
        <option value="">{o.motivoPerdida ? "Quitar motivo" : "Elegir motivo…"}</option>
        {MOTIVOS_PERDIDA.map((m) => (
          <option key={m}>{m}</option>
        ))}
      </select>
      {error && <span className="max-w-xs text-xs text-[#b3161b]">{error}</span>}
    </span>
  );
}

export function BotonSeguimiento({ o, onGuardado, compacto }: { o: Oportunidad; onGuardado: () => void; compacto?: boolean }) {
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const parar = !o.sinSeguimiento;
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={guardando}
        onClick={async (e) => {
          e.stopPropagation();
          setGuardando(true);
          setError("");
          try {
            await accionPortal("sinSeguimiento", o.codigo, parar);
            onGuardado();
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setGuardando(false);
          }
        }}
        title={parar ? "No enviar más emails ni avisos a este cliente" : "Reactivar el seguimiento automático"}
        className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-[#e2e0dc] bg-white px-2 py-1 text-xs font-medium text-[#606060] hover:border-[#606060] hover:text-[#282828] disabled:opacity-50"
      >
        {guardando && <Loader2 size={12} className="animate-spin" />}
        {parar ? (compacto ? "Parar" : "Parar seguimiento") : compacto ? "Reactivar" : "Reactivar seguimiento"}
      </button>
      {error && <span className="max-w-xs text-right text-xs text-[#b3161b]">{error}</span>}
    </span>
  );
}

// ── Embudo comercial ──

export function Embudo({ e }: { e: DatosEmbudo }) {
  const total = e.solicitudes.length;
  if (!total) return <p className="text-sm text-[#606060]">No hay solicitudes en este periodo.</p>;
  const suma = (l: Oportunidad[]) => l.reduce((s, o) => s + (o.importe || 0), 0);
  const pasos = [
    { n: "Solicitudes", d: "recibidas", l: e.solicitudes, eu: false, color: "#282828" },
    { n: "Presupuestadas", d: `${pct(e.presupuestadas.length, total)} de las solicitudes`, l: e.presupuestadas, eu: true, color: "#282828" },
    { n: "Enviadas", d: `${pct(e.enviadas.length, e.presupuestadas.length)} de las presupuestadas`, l: e.enviadas, eu: true, color: "#282828" },
    { n: "Ganadas", d: `${pct(e.ganadas.length, e.enviadas.length)} de las enviadas`, l: e.ganadas, eu: true, color: "#1e7e34" },
  ];
  return (
    <div>
      <div className="flex flex-col gap-2.5">
        {pasos.map((p) => (
          <div key={p.n} className="grid grid-cols-1 items-center gap-x-3 gap-y-1 sm:grid-cols-[130px_1fr_170px]">
            <div>
              <p className="text-sm font-semibold">{p.n}</p>
              <p className="text-xs text-[#8a8a8a]">{p.d}</p>
            </div>
            <div className="h-7 overflow-hidden rounded bg-[#efefec]">
              <div
                className="flex h-full min-w-[32px] items-center rounded px-2 text-xs font-bold text-white"
                style={{ width: `${Math.max(4, (100 * p.l.length) / total)}%`, background: p.color }}
              >
                {p.l.length}
              </div>
            </div>
            <div className="text-xs tabular-nums sm:text-right">
              {p.eu ? (
                <>
                  <span className="font-semibold text-[#282828]">{eur(suma(p.l))}</span> base
                  <span className="block text-[#8a8a8a]">{eur(conIva(suma(p.l)))} IVA incl.</span>
                </>
              ) : null}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-sm text-[#606060]">
        Perdidas: <b>{e.perdidas.length}</b> · {eur(suma(e.perdidas))} base
      </p>
    </div>
  );
}

// ── Próximos seguimientos ──

export function ProximosSeguimientos({
  ops,
  ahora,
  mostrarQuien,
  onAbrir,
  onCambio,
}: {
  ops: Oportunidad[];
  ahora: Date;
  mostrarQuien: boolean;
  onAbrir: (o: Oportunidad) => void;
  onCambio: () => void;
}) {
  const hoy = new Date(ahora);
  hoy.setHours(0, 0, 0, 0);
  const DIA = 86400000;
  const l = ops.filter((o) => o.proximoSeguimiento).sort((a, b) => a.proximoSeguimiento!.fecha.localeCompare(b.proximoSeguimiento!.fecha));
  const parados = ops.filter((o) => o.estado === "Presupuesto enviado" && o.sinSeguimiento && o.origen !== "crm");
  if (!l.length && !parados.length) return <p className="text-sm text-[#606060]">No hay presupuestos enviados con seguimiento pendiente.</p>;
  const t = (o: Oportunidad) => new Date(o.proximoSeguimiento!.fecha).getTime();
  const grupos = [
    { n: "Atrasados", rojo: true, l: l.filter((o) => t(o) < hoy.getTime()) },
    { n: "Hoy", l: l.filter((o) => t(o) >= hoy.getTime() && t(o) < hoy.getTime() + DIA) },
    { n: "Próximos 7 días", l: l.filter((o) => t(o) >= hoy.getTime() + DIA && t(o) < hoy.getTime() + 8 * DIA) },
    { n: "Más adelante", l: l.filter((o) => t(o) >= hoy.getTime() + 8 * DIA) },
  ].filter((g) => g.l.length);
  return (
    <div className="flex flex-col gap-3">
      {grupos.map((g) => (
        <div key={g.n}>
          <p className={`mb-1 text-[11px] font-bold uppercase tracking-wide ${g.rojo ? "text-[#b3161b]" : "text-[#8a8a8a]"}`}>
            {g.n} · {g.l.length}
          </p>
          <ul className="divide-y divide-[#efefec]">
            {g.l.slice(0, 12).map((o) => (
              <li key={o.codigo} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5">
                <button type="button" onClick={() => onAbrir(o)} className="min-w-0 flex-1 text-left">
                  <span className="text-sm font-semibold underline decoration-[#e2e0dc] underline-offset-2 hover:decoration-[#282828]">{o.codigo}</span>
                  <MarcaBadge marca={o.marca} />
                  <span className="text-sm"> · {o.empresa || "—"}</span>
                  <span className="block text-xs text-[#606060]">
                    {o.proximoSeguimiento!.nombre} · {fechaCorta(o.proximoSeguimiento!.fecha)}
                    {mostrarQuien && o.registradoPor ? ` · ${nombreDeEmail(o.registradoPor)}` : ""}
                  </span>
                </button>
                <BotonSeguimiento o={o} onGuardado={onCambio} compacto />
              </li>
            ))}
          </ul>
          {g.l.length > 12 && <p className="text-xs text-[#8a8a8a]">… y {g.l.length - 12} más</p>}
        </div>
      ))}
      {parados.length > 0 && (
        <p className="text-xs text-[#606060]">
          Con «Sin seguimiento»:{" "}
          {parados.slice(0, 10).map((o, i) => (
            <span key={o.codigo}>
              {i > 0 && ", "}
              <button type="button" onClick={() => onAbrir(o)} className="font-semibold underline decoration-[#e2e0dc] underline-offset-2">
                {o.codigo}
              </button>
            </span>
          ))}
          {parados.length > 10 ? ` y ${parados.length - 10} más` : ""}
        </p>
      )}
    </div>
  );
}

// ── Ficha de una oportunidad ──

export function FichaOportunidad({ o, onCerrar, onCambio }: { o: Oportunidad | null; onCerrar: () => void; onCambio: () => void }) {
  useEffect(() => {
    if (!o) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onCerrar();
    window.addEventListener("keydown", esc);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", esc);
      document.body.style.overflow = prev;
    };
  }, [o, onCerrar]);
  if (!o) return null;
  const fila = (t: string, v: React.ReactNode) =>
    v ? (
      <div className="grid grid-cols-1 gap-x-4 py-1 sm:grid-cols-[140px_1fr]">
        <dt className="text-xs font-semibold text-[#8a8a8a]">{t}</dt>
        <dd className="text-sm">{v}</dd>
      </div>
    ) : null;
  const seg = (["1er email", "2º email", "Aviso llamada"] as const)
    .map((n, i) => (o.seguimiento[i] ? `${n}: ${o.seguimiento[i]}` : ""))
    .filter(Boolean);
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/45 sm:p-8"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ficha-titulo"
      onClick={(e) => e.target === e.currentTarget && onCerrar()}
    >
      <div className="min-h-full w-full max-w-3xl bg-white shadow-2xl sm:min-h-0 sm:rounded-xl">
        <div className="flex items-start gap-3 border-b border-[#e2e0dc] px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 id="ficha-titulo" className="text-lg font-bold">
              {o.codigo}
              <MarcaBadge marca={o.marca} />
              <OrigenBadge o={o} />
            </h2>
            <p className="text-sm text-[#606060]">
              {o.empresa || "—"}
              {o.numero ? ` · ${o.numero}` : ""}
            </p>
          </div>
          <EstadoPill estado={o.estado} />
          <button type="button" onClick={onCerrar} className="rounded p-1 text-[#8a8a8a] hover:bg-[#f5f4f2] hover:text-[#282828]" aria-label="Cerrar">
            <X size={20} />
          </button>
        </div>
        <div className="px-5 py-4">
          <dl className="mb-3">
            {fila(
              "Contacto",
              (o.contacto || o.email) && (
                <>
                  {o.contacto || "—"}
                  {o.email && (
                    <>
                      {" · "}
                      <a className="underline" href={`mailto:${o.email}`}>
                        {o.email}
                      </a>
                    </>
                  )}
                </>
              )
            )}
            {fila("Productos", o.productos)}
            {fila("Cantidades", o.cantidades)}
            {fila("Medidas", o.medidas)}
            {fila("Provincia", o.provincia)}
            {fila("Canal", o.canal)}
            {fila("Asunto", o.asunto)}
            {fila("Adjuntos", o.adjuntos)}
            {fila("Solicitud", o.fechaSolicitud && fechaCorta(o.fechaSolicitud))}
            {fila(
              "Presupuesto",
              o.fechaPresupuesto && (
                <>
                  {fechaCorta(o.fechaPresupuesto)}
                  {o.tiempoRespuesta !== null && <span className="text-[#8a8a8a]"> ({dias1(o.tiempoRespuesta)} de respuesta)</span>}
                </>
              )
            )}
            {fila("Último estado", o.fechaEstado && fechaCorta(o.fechaEstado))}
            {fila(
              "Importe",
              o.importe !== null && (
                <>
                  <b>{eur(o.importe)}</b> base · {eur(conIva(o.importe))} IVA incl.
                </>
              )
            )}
            {fila(
              "Margen",
              o.margen && (
                <>
                  {eur(o.margen.venta - o.margen.coste)} ({Math.round(o.margen.pct * 100)} %) · coste {eur(o.margen.coste)}
                  {o.margen.sinCoste > 0 && <span className="text-[#b3161b]"> · {o.margen.sinCoste} líneas sin coste</span>}
                </>
              )
            )}
            {fila("Lleva", o.registradoPor && `${nombreDeEmail(o.registradoPor)} (${o.registradoPor})`)}
            {fila(
              "Seguimiento",
              o.origen !== "crm" && (o.sinSeguimiento || seg.length || o.proximoSeguimiento) && (
                <>
                  {o.sinSeguimiento && <b className="block">Sin seguimiento automático</b>}
                  {seg.map((x) => (
                    <span key={x} className="block">
                      {x}
                    </span>
                  ))}
                  {o.proximoSeguimiento && (
                    <span className="block text-[#606060]">
                      Próximo: {o.proximoSeguimiento.nombre} el {fechaCorta(o.proximoSeguimiento.fecha)}
                    </span>
                  )}
                </>
              )
            )}
            {fila("Motivo pérdida", o.estado === "Perdido" && o.origen !== "crm" && <SelectorMotivo o={o} onGuardado={onCambio} />)}
            {fila("Atención", o.atencion && <span className="font-semibold text-[#b3161b]">{o.atencion}</span>)}
          </dl>
          {o.resumen && <p className="mb-4 whitespace-pre-line rounded-md bg-[#f5f4f2] px-3 py-2 text-sm">{o.resumen}</p>}
          {o.origen === "crm" && (
            <p className="mb-4 rounded-md bg-[#f5f4f2] px-3 py-2 text-xs text-[#606060]">
              Oportunidad del histórico de Holded, anterior a la automatización: no tiene hoja de cálculo, emails registrados ni seguimiento automático.
              Ábrela en Holded para ver el detalle.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2 border-t border-[#e2e0dc] pt-3">
            <EnlacesOportunidad o={o} />
            <a
              href="https://app.holded.com/crm"
              target="_blank"
              rel="noopener noreferrer"
              title={`Oportunidades en Holded (busca ${o.codigo})`}
              className="inline-flex items-center gap-1 rounded-md border border-[#e2e0dc] px-1.5 py-0.5 text-xs font-medium text-[#606060] hover:border-[#606060] hover:text-[#282828]"
            >
              <ExternalLink size={12} /> Holded
            </a>
            <span className="flex-1" />
            {o.estado === "Presupuesto enviado" && o.origen !== "crm" && <BotonSeguimiento o={o} onGuardado={onCambio} />}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Barras horizontales sencillas (canal, provincia, motivos, tramos). */
export function Barras({ filas, color = "#282828" }: { filas: { k: string; n: number; detalle?: string; color?: string }[]; color?: string }) {
  if (!filas.length) return <p className="text-sm text-[#606060]">Sin datos en este periodo.</p>;
  const max = Math.max(1, ...filas.map((f) => f.n));
  return (
    <ul className="flex flex-col gap-2">
      {filas.map((f) => (
        <li key={f.k} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 text-sm sm:grid-cols-[minmax(110px,30%)_1fr_auto]">
          <span className="truncate font-medium">{f.k}</span>
          <span className="col-span-2 row-start-2 h-2.5 overflow-hidden rounded bg-[#efefec] sm:col-span-1 sm:row-start-auto">
            <span className="block h-full rounded" style={{ width: `${(100 * f.n) / max}%`, background: f.color || color }} />
          </span>
          <span className="whitespace-nowrap text-xs tabular-nums text-[#606060]">{f.detalle ?? f.n}</span>
        </li>
      ))}
    </ul>
  );
}
