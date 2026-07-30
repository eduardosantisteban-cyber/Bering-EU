"use client";

import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { Copy, FileSpreadsheet, Trash2, X } from "lucide-react";
import type { FlatRow } from "./types";
import { fmtMoney } from "@/lib/format";
import { priceLine, computeTotals } from "@/lib/pricing";
import { Button, inputStyleSm } from "./ui";

export interface CartLine {
  itemId: string;
  cantidad: number;
  markup: number;
}

export default function CotizadorPanel({
  rows,
  cart,
  setCart,
  onClose,
}: {
  rows: FlatRow[];
  cart: CartLine[];
  setCart: (updater: (prev: CartLine[]) => CartLine[]) => void;
  onClose: () => void;
}) {
  const [markupGlobal, setMarkupGlobal] = useState(0);
  const [exportedText, setExportedText] = useState<string | null>(null);

  const cartRows = useMemo(
    () =>
      cart
        .map((c) => {
          const row = rows.find((r) => r.id === c.itemId);
          if (!row) return null;
          const { precioCoste, precioVenta } = priceLine(row.precio_unitario, c.markup);
          return { ...row, cantidad: c.cantidad, markup: Number(c.markup) || 0, precioCoste, precioVenta };
        })
        .filter((r): r is NonNullable<typeof r> => r !== null),
    [cart, rows]
  );

  const { subtotal, iva, total } = useMemo(() => computeTotals(cartRows), [cartRows]);

  function setQty(itemId: string, qty: number) {
    setCart((c) => c.map((x) => (x.itemId === itemId ? { ...x, cantidad: qty } : x)));
  }
  function setMarkup(itemId: string, markup: number) {
    setCart((c) => c.map((x) => (x.itemId === itemId ? { ...x, markup } : x)));
  }
  function removeFromCart(itemId: string) {
    setCart((c) => c.filter((x) => x.itemId !== itemId));
  }
  function applyMarkupToAll() {
    setCart((c) => c.map((x) => ({ ...x, markup: markupGlobal })));
  }

  function buildExportText() {
    const lines = cartRows.flatMap((r) => [
      `${r.tipo_producto || "-"} ${r.modelo || "-"} ${r.medidas ? `(${r.medidas})` : ""} x${r.cantidad}`
        .replace(/\s+/g, " ")
        .trim(),
      `Precio: ${fmtMoney(r.precioVenta)} / ud | Subtotal: ${fmtMoney(r.precioVenta * r.cantidad)}`,
      "",
    ]);
    return [
      "PRESUPUESTO PARA CLIENTE — Bering EU",
      new Date().toLocaleDateString("es-ES"),
      "",
      ...lines,
      `Subtotal (sin IVA): ${fmtMoney(subtotal)}`,
      `IVA (21%): ${fmtMoney(iva)}`,
      `TOTAL: ${fmtMoney(total)}`,
    ].join("\n");
  }

  async function copyExportText() {
    const text = buildExportText();
    setExportedText(text);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // el textarea visible sirve como respaldo si el portapapeles falla
    }
  }

  function generateExcelQuote() {
    const startRow = 5;
    const aoa: (string | number | null)[][] = [
      ["PRESUPUESTO PARA CLIENTE — Bering EU"],
      [new Date().toLocaleDateString("es-ES")],
      [],
      ["Descripción", "Medidas", "Cantidad", "Precio coste (ud)", "Markup %", "Precio venta (ud)", "Subtotal"],
    ];
    cartRows.forEach((r) => {
      const desc = `${r.tipo_producto || ""} ${r.modelo || ""}`.trim();
      aoa.push([desc, r.medidas || "", r.cantidad, r.precioCoste, r.markup, null, null]);
    });
    const lastDataRow = startRow + cartRows.length - 1;
    aoa.push([]);
    aoa.push(["", "", "", "", "", "Subtotal (sin IVA)", null]);
    aoa.push(["", "", "", "", "", "IVA (21%)", null]);
    aoa.push(["", "", "", "", "", "TOTAL", null]);

    const ws = XLSX.utils.aoa_to_sheet(aoa);

    for (let i = 0; i < cartRows.length; i++) {
      const row = startRow + i;
      ws[`F${row}`] = { t: "n", f: `D${row}*(1+E${row}/100)`, z: '#,##0.00 "€"' };
      ws[`G${row}`] = { t: "n", f: `F${row}*C${row}`, z: '#,##0.00 "€"' };
    }
    const subtotalRow = lastDataRow + 2;
    ws[`G${subtotalRow}`] = { t: "n", f: `SUM(G${startRow}:G${lastDataRow})`, z: '#,##0.00 "€"' };
    ws[`G${subtotalRow + 1}`] = { t: "n", f: `G${subtotalRow}*0.21`, z: '#,##0.00 "€"' };
    ws[`G${subtotalRow + 2}`] = { t: "n", f: `G${subtotalRow}+G${subtotalRow + 1}`, z: '#,##0.00 "€"' };

    ws["!cols"] = [{ wch: 40 }, { wch: 14 }, { wch: 10 }, { wch: 16 }, { wch: 10 }, { wch: 16 }, { wch: 14 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Presupuesto");
    XLSX.writeFile(wb, `presupuesto_bering_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-[#e2e0dc] bg-white shadow-xl">
      <div className="flex items-center justify-between border-b border-[#e2e0dc] px-4 py-3">
        <h2 className="text-sm font-semibold text-[#282828]">Cotizador ({cartRows.length})</h2>
        <button onClick={onClose} className="rounded p-1 text-[#606060] hover:bg-[#f5f4f2]">
          <X size={18} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {cartRows.length === 0 && (
          <p className="text-sm text-[#606060]">
            Añade líneas desde la tabla principal con el icono del carrito.
          </p>
        )}

        <div className="mb-4 flex items-center gap-2">
          <input
            type="number"
            className={inputStyleSm + " w-20"}
            value={markupGlobal}
            onChange={(e) => setMarkupGlobal(Number(e.target.value) || 0)}
            placeholder="%"
          />
          <Button variant="ghost-light" onClick={applyMarkupToAll}>
            Aplicar markup a todas
          </Button>
        </div>

        <div className="flex flex-col gap-3">
          {cartRows.map((r) => (
            <div key={r.id} className="rounded-md border border-[#e2e0dc] p-3 text-xs">
              <div className="mb-2 flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-[#282828]">
                    {r.tipo_producto} {r.modelo}
                  </p>
                  <p className="text-[#606060]">{r.medidas}</p>
                </div>
                <button onClick={() => removeFromCart(r.id)} className="rounded p-1 text-[#606060] hover:bg-[#f5f4f2]">
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1">
                  Cant.
                  <input
                    type="number"
                    className={inputStyleSm + " w-14"}
                    value={r.cantidad}
                    onChange={(e) => setQty(r.id, Number(e.target.value) || 0)}
                  />
                </label>
                <label className="flex items-center gap-1">
                  Markup %
                  <input
                    type="number"
                    className={inputStyleSm + " w-16"}
                    value={r.markup}
                    onChange={(e) => setMarkup(r.id, Number(e.target.value) || 0)}
                  />
                </label>
                <span className="ml-auto font-medium">{fmtMoney(r.precioVenta * r.cantidad)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {cartRows.length > 0 && (
        <div className="border-t border-[#e2e0dc] p-4">
          <div className="mb-3 space-y-1 text-sm">
            <div className="flex justify-between text-[#606060]">
              <span>Subtotal (sin IVA)</span>
              <span>{fmtMoney(subtotal)}</span>
            </div>
            <div className="flex justify-between text-[#606060]">
              <span>IVA (21%)</span>
              <span>{fmtMoney(iva)}</span>
            </div>
            <div className="flex justify-between text-base font-semibold text-[#282828]">
              <span>TOTAL</span>
              <span>{fmtMoney(total)}</span>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost-light" className="flex-1 justify-center" onClick={copyExportText}>
              <Copy size={14} /> Copiar texto
            </Button>
            <Button variant="ghost-light" className="flex-1 justify-center" onClick={generateExcelQuote}>
              <FileSpreadsheet size={14} /> Excel
            </Button>
          </div>
          {exportedText && (
            <textarea
              readOnly
              className="mt-3 h-32 w-full rounded-md border border-[#e2e0dc] p-2 text-xs"
              value={exportedText}
            />
          )}
        </div>
      )}
    </div>
  );
}
