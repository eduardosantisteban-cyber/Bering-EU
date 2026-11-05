"use client";

import { useState } from "react";
import { Check, ExternalLink, Loader2, RefreshCw, Undo2 } from "lucide-react";
import { Tarjeta } from "../components/portal";
import { enlaceDrive, importeCaja, nombreMes, type GanadoPendiente, type Movimiento } from "@/lib/finanzas";

// Caja (cobros y pagos pendientes por vencimiento) y ganado pendiente de facturar, para la página /finanzas.

const eur2 = (v: number) => v.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
const fecha = (iso: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");

function Vencimiento({ m }: { m: Movimiento }) {
  if (m.diasVencido > 0) {
    return <span className="rounded bg-[#fdecec] px-1.5 py-0.5 text-xs font-medium text-[#b3161b]">Vencido · {m.diasVencido} d</span>;
  }
  if (m.diasVencido > -15) {
    return <span className="rounded bg-[#fff4e0] px-1.5 py-0.5 text-xs font-medium text-[#9a5b00]">Vence en {-m.diasVencido} d</span>;
  }
  return <span className="text-xs text-[#606060]">En {-m.diasVencido} d</span>;
}

function TablaMovimientos({
  filas,
  verbo,
  onMarcar,
}: {
  filas: Movimiento[];
  verbo: "Cobrado" | "Pagado";
  onMarcar: (id: string, pagado: boolean | null) => Promise<void>;
}) {
  const [ocupado, setOcupado] = useState<string | null>(null);
  if (!filas.length) return <p className="text-sm text-[#606060]">Nada pendiente.</p>;
  async function marcar(id: string, pagado: boolean | null) {
    setOcupado(id);
    try {
      await onMarcar(id, pagado);
    } finally {
      setOcupado(null);
    }
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-[#e2e0dc] text-left text-xs text-[#606060]">
            <th className="py-2 pr-3 font-medium">Vence</th>
            <th className="py-2 pr-3 font-medium">Estado</th>
            <th className="py-2 pr-3 font-medium">{verbo === "Cobrado" ? "Cliente" : "Proveedor"}</th>
            <th className="py-2 pr-3 font-medium">Nº</th>
            <th className="py-2 pr-3 text-right font-medium">Total</th>
            <th className="py-2 font-medium" />
          </tr>
        </thead>
        <tbody>
          {filas.map((m) => {
            const d = m.doc;
            const url = enlaceDrive(d.drive_id);
            return (
              <tr key={d.id} className="border-b border-[#f1f1ef] last:border-0" title={d.notas || undefined}>
                <td className="py-1.5 pr-3 tabular-nums">
                  {fecha(m.fechaCaja)}
                  {!d.vencimiento && <span className="ml-1 text-xs text-[#8a8a8a]">(fecha factura)</span>}
                </td>
                <td className="py-1.5 pr-3">
                  <Vencimiento m={m} />
                  {!m.confirmadoPendiente && <span className="ml-1.5 text-xs text-[#8a8a8a]">sin comprobar</span>}
                </td>
                <td className="py-1.5 pr-3">
                  {d.contraparte}
                  {d.beuq && <span className="ml-1.5 text-xs text-[#606060]">{d.beuq}</span>}
                </td>
                <td className="py-1.5 pr-3 text-xs text-[#606060]">
                  {url ? (
                    <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[#2a5d99] hover:underline">
                      {d.numero} <ExternalLink size={11} />
                    </a>
                  ) : (
                    d.numero
                  )}
                </td>
                <td className="py-1.5 pr-3 text-right tabular-nums">{eur2(importeCaja(d))}</td>
                <td className="py-1.5 text-right">
                  <button
                    onClick={() => marcar(d.id, true)}
                    disabled={ocupado === d.id}
                    className="inline-flex items-center gap-1 rounded-md border border-[#e2e0dc] bg-white px-2 py-1 text-xs font-medium text-[#1e7e34] hover:bg-[#e6f4ea] disabled:opacity-50"
                  >
                    {ocupado === d.id ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} {verbo}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function Caja({
  cobros,
  pagos,
  recientes,
  onMarcar,
  holded,
  onSincronizar,
}: {
  holded: { cargando: boolean; texto: string; error?: boolean; noEnPanel?: string[] };
  onSincronizar: () => void;
  cobros: Movimiento[];
  pagos: Movimiento[];
  /** Últimos marcados como cobrados/pagados en esta sesión, para poder deshacer */
  recientes: { id: string; texto: string }[];
  onMarcar: (id: string, pagado: boolean | null) => Promise<void>;
}) {
  const suma = (fs: Movimiento[]) => fs.reduce((t, m) => t + importeCaja(m.doc), 0);
  const vencidos = (fs: Movimiento[]) => fs.filter((m) => m.diasVencido > 0);
  return (
    <Tarjeta
      titulo="Caja: cobros y pagos pendientes"
      sub="Importes con IVA, por fecha de vencimiento. El estado de cobro y pago se toma de Holded (bancos conciliados); «sin comprobar» = no está en Holded o Holded no lo sabe."
      accion={
        <button
          onClick={onSincronizar}
          disabled={holded.cargando}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-[#e2e0dc] bg-white px-2.5 py-1 text-xs font-medium hover:bg-[#f7f7f5] disabled:opacity-50"
        >
          {holded.cargando ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Sincronizar con Holded
        </button>
      }
    >
      {(holded.texto || holded.cargando) && (
        <p className={`mb-3 text-xs ${holded.error ? "text-[#b3161b]" : "text-[#606060]"}`}>
          {holded.cargando ? "Leyendo cobros y pagos en Holded…" : "Holded: " + holded.texto}
        </p>
      )}
      {!!holded.noEnPanel?.length && (
        <details className="mb-3 rounded-md border border-[#f0d9a8] bg-[#fff8e8] px-3 py-2 text-xs text-[#7a4a00]">
          <summary className="cursor-pointer font-medium">{holded.noEnPanel.length} facturas de venta de 2026 están en Holded pero no en el panel (falta el PDF en Drive)</summary>
          <ul className="mt-1 list-disc pl-5">
            {holded.noEnPanel.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </details>
      )}
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Resumen label="Por cobrar" valor={suma(cobros)} n={cobros.length} />
        <Resumen label="Cobros vencidos" valor={suma(vencidos(cobros))} n={vencidos(cobros).length} alerta />
        <Resumen label="Por pagar" valor={suma(pagos)} n={pagos.length} />
        <Resumen label="Pagos vencidos" valor={suma(vencidos(pagos))} n={vencidos(pagos).length} alerta />
      </div>
      {recientes.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2 text-xs">
          {recientes.map((r) => (
            <button
              key={r.id}
              onClick={() => onMarcar(r.id, null)}
              className="inline-flex items-center gap-1 rounded-full border border-[#e2e0dc] bg-[#f7f7f5] px-2 py-0.5 text-[#606060] hover:bg-white"
            >
              <Undo2 size={11} /> Deshacer: {r.texto}
            </button>
          ))}
        </div>
      )}
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-[#606060]">Cobros (facturas a clientes)</h3>
      <TablaMovimientos filas={cobros} verbo="Cobrado" onMarcar={onMarcar} />
      <h3 className="mb-1 mt-5 text-xs font-semibold uppercase tracking-wide text-[#606060]">Pagos (proveedores y gastos pendientes)</h3>
      <TablaMovimientos filas={pagos} verbo="Pagado" onMarcar={onMarcar} />
    </Tarjeta>
  );
}

function Resumen({ label, valor, n, alerta }: { label: string; valor: number; n: number; alerta?: boolean }) {
  const rojo = alerta && valor > 0;
  return (
    <div className={`rounded-md border px-3 py-2 ${rojo ? "border-[#e83038]/30 bg-[#fdecec]" : "border-[#e2e0dc] bg-[#fafaf9]"}`}>
      <p className="text-xs text-[#606060]">{label}</p>
      <p className={`text-lg font-bold tabular-nums ${rojo ? "text-[#b3161b]" : "text-[#282828]"}`}>{eur2(valor)}</p>
      <p className="text-xs text-[#8a8a8a]">{n} {n === 1 ? "factura" : "facturas"}</p>
    </div>
  );
}

export function GanadoSinFacturar({ filas, cargando, error }: { filas: GanadoPendiente[]; cargando: boolean; error: string | null }) {
  const total = filas.reduce((t, f) => t + f.pendiente, 0);
  return (
    <Tarjeta
      titulo="Ganado pendiente de facturar"
      sub="Oportunidades ganadas en 2026 (hoja Solicitudes y Holded) frente a lo facturado con el mismo BEUQ. Base sin IVA, salvo las que vienen del CRM de Holded (con IVA, se comparan con lo facturado con IVA)."
      accion={filas.length ? <span className="text-sm font-semibold tabular-nums text-[#9a5b00]">{eur2(total)}</span> : undefined}
    >
      {cargando ? (
        <p className="flex items-center gap-2 text-sm text-[#606060]"><Loader2 size={14} className="animate-spin" /> Leyendo oportunidades…</p>
      ) : error ? (
        <p className="text-sm text-[#b3161b]">No se pudieron leer las oportunidades: {error}</p>
      ) : !filas.length ? (
        <p className="text-sm text-[#606060]">Todo lo ganado en 2026 está facturado.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-sm">
            <thead>
              <tr className="border-b border-[#e2e0dc] text-left text-xs text-[#606060]">
                <th className="py-2 pr-3 font-medium">Proyecto</th>
                <th className="py-2 pr-3 font-medium">Cliente</th>
                <th className="py-2 pr-3 font-medium">Ganado</th>
                <th className="py-2 pr-3 text-right font-medium">Ofertado</th>
                <th className="py-2 pr-3 text-right font-medium">Facturado</th>
                <th className="py-2 text-right font-medium">Pendiente</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.clave} className="border-b border-[#f1f1ef] last:border-0">
                  <td className="py-1.5 pr-3 font-medium">{f.codigo}</td>
                  <td className="py-1.5 pr-3">{f.empresa || "—"}</td>
                  <td className="py-1.5 pr-3 tabular-nums">{f.fechaGanado ? nombreMes(f.fechaGanado.slice(0, 7)) : "—"}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums" title={f.conIva ? "Importe del CRM de Holded, con IVA" : "Base imponible"}>
                    {eur2(f.importe)}
                    {f.conIva && <span className="ml-1 text-[10px] text-[#8a8a8a]">IVA incl.</span>}
                  </td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{f.facturado ? eur2(f.facturado) : "—"}</td>
                  <td className="py-1.5 text-right font-semibold tabular-nums text-[#9a5b00]">{eur2(f.pendiente)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Tarjeta>
  );
}
