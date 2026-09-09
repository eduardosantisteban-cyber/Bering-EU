"use client";

import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { Copy, FileSpreadsheet, FileText, Loader2, Send, Trash2, X } from "lucide-react";
import type { FlatRow } from "./types";
import { fmtMoney } from "@/lib/format";
import { priceLine, computeTotals } from "@/lib/pricing";
import { matchesFicha } from "@/lib/fichaMatch";
import { fetchFichas, getFichaDownloadUrl, sendToHolded } from "@/lib/apiClient";
import type { FichaTecnica } from "@/lib/types";
import { Button, inputStyleSm } from "./ui";

export interface CartLine {
  itemId: string;
  cantidad: number;
  markup: number;
}

// Abre una pestaña en blanco de inmediato (dentro del gesto de clic, para
// que el navegador no la bloquee) y la rellena en cuanto llega la URL
// firmada — necesario porque conseguir la URL es una llamada asíncrona.
function openWhenReady(win: Window | null, urlPromise: Promise<string>) {
  urlPromise
    .then((url) => {
      if (win) win.location.href = url;
    })
    .catch(() => win?.close());
}

export default function CotizadorPanel({
  rows,
  cart,
  setCart,
  onClose,
  onNotice,
}: {
  rows: FlatRow[];
  cart: CartLine[];
  setCart: (updater: (prev: CartLine[]) => CartLine[]) => void;
  onClose: () => void;
  onNotice?: (type: "error" | "success", message: string) => void;
}) {
  const [markupGlobal, setMarkupGlobal] = useState(0);
  const [exportedText, setExportedText] = useState<string | null>(null);
  const [fichas, setFichas] = useState<FichaTecnica[]>([]);
  const [clienteName, setClienteName] = useState("");
  const [clienteEmail, setClienteEmail] = useState("");
  const [sendingToHolded, setSendingToHolded] = useState(false);

  useEffect(() => {
    // Mejor esfuerzo: si falla, el cotizador sigue funcionando igual, solo
    // sin los enlaces a fichas técnicas.
    fetchFichas()
      .then(setFichas)
      .catch(() => onNotice?.("error", "No se pudieron cargar las fichas técnicas para emparejar."));
  }, [onNotice]);

  const cartRows = useMemo(
    () =>
      cart
        .map((c) => {
          const row = rows.find((r) => r.id === c.itemId);
          if (!row) return null;
          const { precioCoste, precioVenta } = priceLine(row.precio_unitario, c.markup);
          const matchedFichas = fichas.filter((f) => matchesFicha(f, row));
          return { ...row, cantidad: c.cantidad, markup: Number(c.markup) || 0, precioCoste, precioVenta, matchedFichas };
        })
        .filter((r): r is NonNullable<typeof r> => r !== null),
    [cart, rows, fichas]
  );

  const { subtotal, iva, total } = useMemo(() => computeTotals(cartRows), [cartRows]);

  const allMatchedFichas = useMemo(() => {
    const map = new Map<string, FichaTecnica>();
    for (const r of cartRows) for (const f of r.matchedFichas) map.set(f.id, f);
    return Array.from(map.values());
  }, [cartRows]);

  function openFicha(id: string) {
    const win = window.open("", "_blank");
    openWhenReady(win, getFichaDownloadUrl(id));
  }

  function downloadAllFichas() {
    // Abre todas las pestañas en blanco primero (mismo gesto de clic),
    // y las va rellenando según van llegando las URLs firmadas.
    for (const f of allMatchedFichas) {
      openFicha(f.id);
    }
  }

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

  async function handleSendToHolded() {
    if (!clienteName.trim()) {
      onNotice?.("error", "Escribe el nombre del cliente antes de enviar a Holded.");
      return;
    }
    setSendingToHolded(true);
    try {
      await sendToHolded({
        clienteName: clienteName.trim(),
        clienteEmail: clienteEmail.trim() || undefined,
        items: cartRows.map((r) => ({
          name: `${r.tipo_producto || ""} ${r.modelo || ""}${r.medidas ? ` (${r.medidas})` : ""}`.replace(/\s+/g, " ").trim(),
          units: r.cantidad,
          price: r.precioVenta,
        })),
      });
      onNotice?.("success", `Presupuesto enviado a Holded como "estimate" de ${clienteName.trim()}.`);
    } catch (err) {
      onNotice?.("error", "No se pudo enviar a Holded: " + (err as Error).message);
    } finally {
      setSendingToHolded(false);
    }
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

        <div className="mb-3 flex items-center gap-2">
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

        {allMatchedFichas.length > 0 && (
          <Button variant="ghost-light" className="mb-4 w-full justify-center" onClick={downloadAllFichas}>
            <FileText size={14} /> Descargar fichas técnicas ({allMatchedFichas.length})
          </Button>
        )}

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
              {r.matchedFichas.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5 border-t border-[#e2e0dc] pt-2">
                  {r.matchedFichas.map((f) => (
                    <button
                      key={f.id}
                      onClick={() => openFicha(f.id)}
                      className="flex items-center gap-1 truncate rounded border border-[#e2e0dc] px-1.5 py-0.5 text-[11px] text-[#606060] hover:border-[#e83038] hover:text-[#e83038]"
                      title={f.nombre_archivo}
                    >
                      <FileText size={11} className="shrink-0" />
                      <span className="max-w-[140px] truncate">{f.nombre_archivo}</span>
                    </button>
                  ))}
                </div>
              )}
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
          <div className="mb-3 flex gap-2">
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
              className="mb-3 h-32 w-full rounded-md border border-[#e2e0dc] p-2 text-xs"
              value={exportedText}
            />
          )}

          <div className="border-t border-[#e2e0dc] pt-3">
            <p className="mb-2 text-xs font-semibold tracking-wide text-[#606060]">ENVIAR A HOLDED</p>
            <div className="mb-2 flex gap-2">
              <input
                className={inputStyleSm + " flex-1"}
                placeholder="Nombre del cliente"
                value={clienteName}
                onChange={(e) => setClienteName(e.target.value)}
              />
              <input
                className={inputStyleSm + " flex-1"}
                placeholder="Email (opcional)"
                value={clienteEmail}
                onChange={(e) => setClienteEmail(e.target.value)}
              />
            </div>
            <Button
              variant="ghost-light"
              className="w-full justify-center"
              onClick={handleSendToHolded}
              disabled={sendingToHolded || !clienteName.trim()}
            >
              {sendingToHolded ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              Crear presupuesto en Holded
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
