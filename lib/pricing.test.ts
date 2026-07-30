import { describe, expect, it } from "vitest";
import { computeTotals, priceLine } from "./pricing";

describe("priceLine", () => {
  it("aplica el markup porcentual sobre el precio de coste", () => {
    expect(priceLine(100, 20)).toEqual({ precioCoste: 100, precioVenta: 120 });
  });

  it("sin markup, el precio de venta es igual al de coste", () => {
    expect(priceLine(50, 0)).toEqual({ precioCoste: 50, precioVenta: 50 });
  });

  it("trata coste o markup nulos/no numéricos como 0", () => {
    expect(priceLine(null, 10)).toEqual({ precioCoste: 0, precioVenta: 0 });
    expect(priceLine(100, null)).toEqual({ precioCoste: 100, precioVenta: 100 });
    expect(priceLine(undefined, undefined)).toEqual({ precioCoste: 0, precioVenta: 0 });
  });

  it("admite markup negativo (descuento)", () => {
    expect(priceLine(100, -10)).toEqual({ precioCoste: 100, precioVenta: 90 });
  });
});

describe("computeTotals", () => {
  it("calcula subtotal, IVA al 21% y total", () => {
    const totals = computeTotals([
      { precioVenta: 100, cantidad: 2 }, // 200
      { precioVenta: 50, cantidad: 1 }, // 50
    ]);
    expect(totals.subtotal).toBeCloseTo(250);
    expect(totals.iva).toBeCloseTo(52.5);
    expect(totals.total).toBeCloseTo(302.5);
  });

  it("devuelve todo a cero para un carrito vacío", () => {
    expect(computeTotals([])).toEqual({ subtotal: 0, iva: 0, total: 0 });
  });

  it("trata una cantidad no numérica como 0 en vez de romper el cálculo", () => {
    const totals = computeTotals([{ precioVenta: 100, cantidad: NaN }]);
    expect(totals.subtotal).toBe(0);
  });
});
