/** Precio de venta de una línea a partir del coste y el markup (%) aplicado. */
export function priceLine(
  precioCosteRaw: number | null | undefined,
  markupRaw: number | null | undefined
): { precioCoste: number; precioVenta: number } {
  const markup = Number(markupRaw) || 0;
  const precioCoste = Number(precioCosteRaw) || 0;
  const precioVenta = precioCoste * (1 + markup / 100);
  return { precioCoste, precioVenta };
}

/** Subtotal (sin IVA), IVA al 21% y total de un conjunto de líneas ya con precio de venta. */
export function computeTotals(
  rows: { precioVenta: number; cantidad: number }[]
): { subtotal: number; iva: number; total: number } {
  const subtotal = rows.reduce((s, r) => s + r.precioVenta * (Number(r.cantidad) || 0), 0);
  const iva = subtotal * 0.21;
  const total = subtotal + iva;
  return { subtotal, iva, total };
}
