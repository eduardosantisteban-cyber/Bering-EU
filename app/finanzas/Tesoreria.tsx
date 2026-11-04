"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Check, ChevronDown, ChevronRight, Loader2, MessageSquare, RotateCcw } from "lucide-react";
import { Tarjeta } from "../components/portal";
import { previsionCaja, type DocFin, type IncidenciaFin } from "@/lib/finanzas";

// Conflictos con Holded, previsión de tesorería a 13 semanas y pendientes con respuesta, para /finanzas.

const eur2 = (v: number | null | undefined) =>
  v === null || v === undefined || !isFinite(v) ? "—" : v.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
const eur0 = (v: number) => v.toLocaleString("es-ES", { maximumFractionDigits: 0 }) + " €";
const fecha = (iso: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");
const diaMes = (iso: string) => {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
};

// ── 2. Conflictos con Holded ──

export interface Conflicto {
  id: string;
  tipo: string;
  contraparte: string;
  numero: string;
  total: number | null;
  pendienteHolded: number | null;
  vencimientoHolded: string | null;
}

export function ConflictosHolded({
  conflictos,
  onResolver,
}: {
  conflictos: Conflicto[];
  /** quedarseConHolded = true → pasa a pendiente; false → «está cobrada/pagada» (deja de avisar) */
  onResolver: (c: Conflicto, quedarseConHolded: boolean) => Promise<void>;
}) {
  const [ocupado, setOcupado] = useState<string | null>(null);
  if (!conflictos.length) return null;
  async function resolver(c: Conflicto, h: boolean) {
    setOcupado(c.id + h);
    try {
      await onResolver(c, h);
    } finally {
      setOcupado(null);
    }
  }
  return (
    <section className="rounded-lg border border-[#e83038]/30 bg-[#fdf6f6] p-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-[#8a1014]">
        <AlertTriangle size={15} /> {conflictos.length} {conflictos.length === 1 ? "factura no cuadra" : "facturas no cuadran"} con Holded
      </h2>
      <p className="mt-0.5 text-xs text-[#8a1014]/80">
        En el panel están como cobradas o pagadas, pero en Holded (bancos conciliados) siguen pendientes. Decide cuál vale.
      </p>
      <ul className="mt-3 flex flex-col divide-y divide-[#e83038]/15">
        {conflictos.map((c) => {
          const venta = c.tipo === "venta";
          return (
            <li key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {c.contraparte} <span className="font-normal text-[#606060]">{c.numero}</span>
                </p>
                <p className="text-xs text-[#606060]">
                  Total {eur2(c.total)}
                  {c.pendienteHolded !== null && ` · pendiente en Holded ${eur2(c.pendienteHolded)}`}
                  {c.vencimientoHolded && ` · vence ${fecha(c.vencimientoHolded)}`}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => resolver(c, true)}
                  disabled={!!ocupado}
                  className="inline-flex items-center gap-1 rounded-md border border-[#e2e0dc] bg-white px-2.5 py-1 text-xs font-medium hover:bg-[#f7f7f5] disabled:opacity-50"
                  title={venta ? "Vuelve a la lista de cobros pendientes" : "Vuelve a la lista de pagos pendientes"}
                >
                  {ocupado === c.id + true ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
                  Holded tiene razón: {venta ? "no está cobrada" : "no está pagada"}
                </button>
                <button
                  onClick={() => resolver(c, false)}
                  disabled={!!ocupado}
                  className="inline-flex items-center gap-1 rounded-md border border-[#e2e0dc] bg-white px-2.5 py-1 text-xs font-medium text-[#1e7e34] hover:bg-[#e6f4ea] disabled:opacity-50"
                  title="Deja de avisar. Conviene conciliar el movimiento en Holded."
                >
                  {ocupado === c.id + false ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                  {venta ? "Sí está cobrada" : "Sí está pagada"} (falta conciliar en Holded)
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ── 3. Previsión de tesorería ──

export interface CuentaBanco {
  id: string;
  nombre: string;
  tipo: string;
  iban4: string | null;
  saldo: number;
}

export function PrevisionTesoreria({
  docs,
  cuentas,
  cargando,
  error,
}: {
  docs: DocFin[];
  cuentas: CuentaBanco[] | null;
  cargando: boolean;
  error: string | null;
}) {
  const [abierta, setAbierta] = useState<string | null>(null);
  const saldoInicial = useMemo(() => (cuentas || []).reduce((t, c) => t + c.saldo, 0), [cuentas]);
  const semanas = useMemo(() => (cuentas ? previsionCaja(docs, saldoInicial, new Date()) : []), [docs, cuentas, saldoInicial]);
  const minimo = semanas.length ? semanas.reduce((m, s) => (s.saldoFinal < m.saldoFinal ? s : m), semanas[0]) : null;
  const max = Math.max(1, ...semanas.map((s) => Math.abs(s.saldoFinal)), Math.abs(saldoInicial));

  return (
    <Tarjeta
      titulo="Previsión de tesorería · 13 semanas"
      sub="Saldo de los bancos en Holded + cobros pendientes − pagos pendientes − nóminas y cuotas fijas que aún no tienen factura. Con IVA. No incluye impuestos (IVA trimestral, retenciones, Sociedades) ni lo ganado sin facturar."
      accion={
        cuentas ? (
          <span className="text-right text-xs text-[#606060]">
            Saldo hoy
            <span className="block text-sm font-semibold tabular-nums text-[#282828]">{eur2(saldoInicial)}</span>
          </span>
        ) : undefined
      }
    >
      {cargando ? (
        <p className="flex items-center gap-2 text-sm text-[#606060]"><Loader2 size={14} className="animate-spin" /> Leyendo saldos en Holded…</p>
      ) : error ? (
        <p className="text-sm text-[#b3161b]">No se pudo leer el saldo de los bancos en Holded: {error}</p>
      ) : !cuentas || !cuentas.length ? (
        <p className="text-sm text-[#606060]">Holded no devuelve ninguna cuenta de tesorería con saldo.</p>
      ) : (
        <>
          <p className="mb-3 text-xs text-[#606060]">
            {cuentas.map((c) => `${c.nombre}${c.iban4 ? " ···" + c.iban4 : ""}: ${eur2(c.saldo)}`).join(" · ")}
          </p>
          {minimo && (
            <p
              className={`mb-3 rounded-md px-3 py-2 text-sm ${
                minimo.saldoFinal < 0 ? "border border-[#e83038]/30 bg-[#fdecec] text-[#8a1014]" : "border border-[#e2e0dc] bg-[#fafaf9] text-[#282828]"
              }`}
            >
              Punto más bajo: <b className="tabular-nums">{eur2(minimo.saldoFinal)}</b> la semana del {diaMes(minimo.inicio)}
              {minimo.saldoFinal < 0 ? " — la caja se queda en negativo." : "."}
            </p>
          )}

          {/* Saldo al final de cada semana */}
          <div className="mb-1 flex h-28 items-end gap-1.5 border-b border-[#e2e0dc]">
            {semanas.map((s) => (
              <div key={s.inicio} className="flex h-full min-w-0 flex-1 items-end" title={`Semana del ${diaMes(s.inicio)}: ${eur2(s.saldoFinal)}`}>
                <span
                  className="w-full rounded-t"
                  style={{ height: `${Math.max(2, (100 * Math.abs(s.saldoFinal)) / max)}%`, background: s.saldoFinal < 0 ? "#e83038" : "#2a5d99" }}
                />
              </div>
            ))}
          </div>
          <div className="mb-4 flex gap-1.5">
            {semanas.map((s) => (
              <span key={s.inicio} className="min-w-0 flex-1 truncate text-center text-[10px] text-[#606060]">{diaMes(s.inicio)}</span>
            ))}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-sm">
              <thead>
                <tr className="border-b border-[#e2e0dc] text-left text-xs text-[#606060]">
                  <th className="py-2 pr-3 font-medium">Semana</th>
                  <th className="py-2 pr-3 text-right font-medium">Cobros</th>
                  <th className="py-2 pr-3 text-right font-medium">Pagos</th>
                  <th className="py-2 pr-3 text-right font-medium">Nóminas y cuotas</th>
                  <th className="py-2 text-right font-medium">Saldo final</th>
                </tr>
              </thead>
              <tbody>
                {semanas.map((s, i) => {
                  const ab = abierta === s.inicio;
                  const vacia = !s.detalle.length;
                  return (
                    <FilaSemana
                      key={s.inicio}
                      etiqueta={i === 0 ? `Esta semana (${diaMes(s.inicio)})` : diaMes(s.inicio)}
                      s={s}
                      abierta={ab}
                      vacia={vacia}
                      onClick={() => setAbierta(ab ? null : s.inicio)}
                      primera={i === 0}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-[#8a8a8a]">
            Lo vencido y aún sin cobrar o pagar cuenta en esta semana. Las nóminas se estiman con el coste del último mes cargado; las cuotas fijas,
            con el último importe de cada proveedor que ha facturado al menos 2 de los últimos 3 meses. Pulsa una semana para ver el detalle.
          </p>
        </>
      )}
    </Tarjeta>
  );
}

function FilaSemana({
  etiqueta,
  s,
  abierta,
  vacia,
  onClick,
  primera,
}: {
  etiqueta: string;
  s: ReturnType<typeof previsionCaja>[number];
  abierta: boolean;
  vacia: boolean;
  onClick: () => void;
  primera: boolean;
}) {
  const vencidos = s.detalle.filter((d) => d.vencido);
  return (
    <>
      <tr className={`border-b border-[#f1f1ef] ${vacia ? "" : "cursor-pointer hover:bg-[#fafaf9]"}`} onClick={vacia ? undefined : onClick}>
        <td className="py-1.5 pr-3">
          <span className="inline-flex items-center gap-1">
            {vacia ? <span className="w-3" /> : abierta ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            {etiqueta}
          </span>
          {primera && vencidos.length > 0 && <span className="ml-1.5 text-xs text-[#b3161b]">incluye {vencidos.length} vencidos</span>}
        </td>
        <td className="py-1.5 pr-3 text-right tabular-nums text-[#1e7e34]">{s.cobros ? "+" + eur0(s.cobros) : "—"}</td>
        <td className="py-1.5 pr-3 text-right tabular-nums">{s.pagos ? "−" + eur0(s.pagos) : "—"}</td>
        <td className="py-1.5 pr-3 text-right tabular-nums">{s.recurrentes ? "−" + eur0(s.recurrentes) : "—"}</td>
        <td className={`py-1.5 text-right font-semibold tabular-nums ${s.saldoFinal < 0 ? "text-[#e83038]" : ""}`}>{eur0(s.saldoFinal)}</td>
      </tr>
      {abierta && (
        <tr className="border-b border-[#f1f1ef] bg-[#fafaf9]">
          <td colSpan={5} className="px-5 py-2">
            <ul className="flex flex-col gap-0.5 text-xs">
              {s.detalle.map((d, i) => (
                <li key={i} className="flex justify-between gap-3">
                  <span className="text-[#606060]">
                    {d.clase === "cobro" ? "Cobro" : d.clase === "pago" ? "Pago" : "Estimado"} · {d.texto}
                    {d.vencido && <span className="ml-1 text-[#b3161b]">(vencido)</span>}
                  </span>
                  <span className={`tabular-nums ${d.importe > 0 ? "text-[#1e7e34]" : ""}`}>{eur2(d.importe)}</span>
                </li>
              ))}
            </ul>
          </td>
        </tr>
      )}
    </>
  );
}

// ── 1. Pendientes con respuesta ──

export function Pendientes({
  incidencias,
  nombres,
  onGuardar,
}: {
  incidencias: IncidenciaFin[];
  nombres: Record<string, string>;
  onGuardar: (id: string, cambios: { respuesta?: string; resuelto?: boolean }) => Promise<boolean>;
}) {
  const [verCerrados, setVerCerrados] = useState(false);
  const abiertas = incidencias.filter((i) => !i.resuelto);
  const cerradas = incidencias.filter((i) => i.resuelto).slice(0, 15);
  const sinResponder = abiertas.filter((i) => !i.respuesta).length;
  return (
    <Tarjeta
      titulo="Pendientes"
      sub="De la revisión mensual de Ada (CFO): lo que falta o no cuadra. Responde aquí y Ada lo aplica en su siguiente revisión; si ya está arreglado, márcalo como resuelto."
      accion={abiertas.length ? <span className="text-xs text-[#606060]">{sinResponder} sin responder</span> : undefined}
    >
      {abiertas.length === 0 ? (
        <p className="text-sm text-[#606060]">Nada pendiente.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-[#f1f1ef]">
          {abiertas.map((i) => (
            <FilaPendiente key={i.id} i={i} nombre={nombres[i.tipo] || i.tipo} onGuardar={onGuardar} />
          ))}
        </ul>
      )}
      {cerradas.length > 0 && (
        <div className="mt-3">
          <button onClick={() => setVerCerrados(!verCerrados)} className="inline-flex items-center gap-1 text-xs text-[#606060] hover:text-[#282828]">
            {verCerrados ? <ChevronDown size={12} /> : <ChevronRight size={12} />} Resueltos recientemente
          </button>
          {verCerrados && (
            <ul className="mt-1 flex flex-col divide-y divide-[#f1f1ef]">
              {cerradas.map((i) => (
                <li key={i.id} className="flex items-baseline gap-3 py-1.5 text-xs text-[#606060]">
                  <span className="min-w-0 flex-1">{i.descripcion}</span>
                  <button onClick={() => onGuardar(i.id, { resuelto: false })} className="shrink-0 text-[#2a5d99] hover:underline">
                    Reabrir
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Tarjeta>
  );
}

function FilaPendiente({
  i,
  nombre,
  onGuardar,
}: {
  i: IncidenciaFin;
  nombre: string;
  onGuardar: (id: string, cambios: { respuesta?: string; resuelto?: boolean }) => Promise<boolean>;
}) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(i.respuesta || "");
  const [ocupado, setOcupado] = useState<"responder" | "resolver" | null>(null);

  async function guardar(cambios: { respuesta?: string; resuelto?: boolean }, que: "responder" | "resolver") {
    setOcupado(que);
    try {
      if (await onGuardar(i.id, cambios)) setEditando(false);
    } finally {
      setOcupado(null);
    }
  }

  return (
    <li className="py-2.5 text-sm">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="rounded bg-[#f1f1ef] px-1.5 py-0.5 text-xs font-medium text-[#606060]">{nombre}</span>
        <span className="min-w-0 flex-1">{i.descripcion}</span>
        {i.beuq && <span className="text-xs text-[#606060]">{i.beuq}</span>}
        {i.importe !== null && <span className="text-xs tabular-nums text-[#606060]">{eur2(i.importe)}</span>}
        {i.drive_id && (
          <a href={`https://drive.google.com/file/d/${encodeURIComponent(i.drive_id)}/view`} target="_blank" rel="noreferrer" className="text-xs text-[#2a5d99] hover:underline">
            Drive
          </a>
        )}
      </div>

      {i.respuesta && !editando && (
        <p className="mt-1.5 rounded-md bg-[#eef4fb] px-2.5 py-1.5 text-xs text-[#1f4a7a]">
          <b>Tu respuesta{i.respondido_en ? ` (${fecha(i.respondido_en)})` : ""}:</b> {i.respuesta}
          <span className="ml-1 text-[#1f4a7a]/70">· Ada la aplicará en su siguiente revisión.</span>
        </p>
      )}

      {editando ? (
        <div className="mt-2 flex flex-col gap-2">
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={2}
            autoFocus
            placeholder="P. ej.: «Está anulada», «Va al BEUQ203», «Ya lo he pedido al proveedor»…"
            className="w-full rounded-md border border-[#e2e0dc] bg-white px-2.5 py-1.5 text-sm outline-none focus:border-[#2a5d99]"
          />
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => guardar({ respuesta: texto }, "responder")}
              disabled={!!ocupado || !texto.trim()}
              className="inline-flex items-center gap-1 rounded-md bg-[#282828] px-2.5 py-1 text-xs font-medium text-white hover:bg-black disabled:opacity-50"
            >
              {ocupado === "responder" && <Loader2 size={12} className="animate-spin" />} Guardar respuesta
            </button>
            <button
              onClick={() => guardar({ respuesta: texto, resuelto: true }, "resolver")}
              disabled={!!ocupado || !texto.trim()}
              className="inline-flex items-center gap-1 rounded-md border border-[#e2e0dc] bg-white px-2.5 py-1 text-xs font-medium text-[#1e7e34] hover:bg-[#e6f4ea] disabled:opacity-50"
            >
              {ocupado === "resolver" && <Loader2 size={12} className="animate-spin" />} Guardar y marcar resuelto
            </button>
            <button onClick={() => { setEditando(false); setTexto(i.respuesta || ""); }} className="px-1 text-xs text-[#606060] hover:text-[#282828]">
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-1.5 flex flex-wrap gap-2">
          <button
            onClick={() => setEditando(true)}
            className="inline-flex items-center gap-1 rounded-md border border-[#e2e0dc] bg-white px-2 py-0.5 text-xs font-medium text-[#282828] hover:bg-[#f7f7f5]"
          >
            <MessageSquare size={12} /> {i.respuesta ? "Cambiar respuesta" : "Responder"}
          </button>
          <button
            onClick={() => guardar({ resuelto: true }, "resolver")}
            disabled={!!ocupado}
            className="inline-flex items-center gap-1 rounded-md border border-[#e2e0dc] bg-white px-2 py-0.5 text-xs font-medium text-[#1e7e34] hover:bg-[#e6f4ea] disabled:opacity-50"
          >
            {ocupado === "resolver" ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Resuelto
          </button>
        </div>
      )}
    </li>
  );
}
