"use client";

import { useMemo, useState } from "react";
import { CATEGORIAS } from "@/lib/constants";
import type { FlatRow } from "./types";
import { fmtMoney } from "@/lib/format";
import { ModalHeader, Overlay, inputStyleSm } from "./ui";

export default function ComparadorModal({
  rows,
  onClose,
}: {
  rows: FlatRow[];
  onClose: () => void;
}) {
  const [categoria, setCategoria] = useState("");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    if (!categoria) return [];
    let out = rows.filter((r) => r.categoria === categoria);
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      out = out.filter((r) =>
        [r.tipo_producto, r.marca, r.modelo, r.medidas]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q))
      );
    }
    return [...out].sort((a, b) => (a.precio_unitario ?? Infinity) - (b.precio_unitario ?? Infinity));
  }, [rows, categoria, query]);

  const stats = useMemo(() => {
    const precios = filtered.map((r) => r.precio_unitario).filter((p): p is number => p !== null);
    if (!precios.length) return null;
    const min = Math.min(...precios);
    const max = Math.max(...precios);
    const media = precios.reduce((a, b) => a + b, 0) / precios.length;
    const proveedores = new Set(filtered.map((r) => r.__rec.proveedor));
    return { min, max, media, nProveedores: proveedores.size };
  }, [filtered]);

  return (
    <Overlay onClose={onClose}>
      <div className="flex max-h-[90vh] w-[min(1000px,95vw)] flex-col rounded-xl bg-white">
        <ModalHeader title="Comparador de precios" onClose={onClose} />
        <div className="flex-1 overflow-y-auto p-5">
          <div className="mb-4 flex flex-wrap gap-3">
            <select
              className={inputStyleSm + " min-w-[220px]"}
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
            >
              <option value="">Elige una categoría…</option>
              {CATEGORIAS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <input
              className={inputStyleSm + " flex-1 min-w-[200px]"}
              placeholder="Filtrar por tipo, marca, modelo, medidas…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          {stats && (
            <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard label="Mínimo" value={fmtMoney(stats.min)} />
              <StatCard label="Media" value={fmtMoney(stats.media)} />
              <StatCard label="Máximo" value={fmtMoney(stats.max)} />
              <StatCard label="Proveedores" value={String(stats.nProveedores)} />
            </div>
          )}

          {categoria && (
            <div className="overflow-x-auto rounded border border-[#e2e0dc]">
              <table className="w-full text-xs">
                <thead className="bg-[#f5f4f2] text-left text-[#606060]">
                  <tr>
                    <th className="px-3 py-2">Proveedor</th>
                    <th className="px-3 py-2">Tipo</th>
                    <th className="px-3 py-2">Modelo</th>
                    <th className="px-3 py-2">Medidas</th>
                    <th className="px-3 py-2 text-right">Precio</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr key={r.id} className="border-t border-[#e2e0dc]">
                      <td className="px-3 py-1.5">{r.__rec.proveedor}</td>
                      <td className="px-3 py-1.5">{r.tipo_producto}</td>
                      <td className="px-3 py-1.5">{r.modelo}</td>
                      <td className="px-3 py-1.5">{r.medidas}</td>
                      <td className="px-3 py-1.5 text-right font-medium">{fmtMoney(r.precio_unitario)}</td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-3 py-6 text-center text-[#606060]">
                        No hay líneas en esta categoría.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Overlay>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-[#e2e0dc] bg-[#f5f4f2] px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-[#606060]">{label}</div>
      <div className="text-sm font-semibold text-[#282828]">{value}</div>
    </div>
  );
}
