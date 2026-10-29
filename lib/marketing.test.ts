import { describe, expect, it } from "vitest";
import { lunes, porCampana, resumirTerminos, serie, totales, variacion } from "./marketing";

const f = (fecha: string, campana: string, gasto: number, clics: number, impresiones: number, conversiones: number, presupuesto: number) => ({ fecha, campana, estado: "ENABLED", gasto, clics, impresiones, conversiones, presupuesto });
const filas = [f("2026-10-26", "A", 600, 18, 150, 1, 300), f("2026-10-27", "A", 590, 17, 178, 0, 300), f("2026-10-27", "B", 387, 17, 329, 0, 250)];

describe("marketing", () => {
  it("totales y ratios", () => {
    const t = totales(filas);
    expect(t.gasto).toBe(1577);
    expect(t.cpa).toBe(1577);
    expect(t.cpc).toBeCloseTo(1577 / 52);
  });
  it("agrupa por semana y por campaña", () => {
    expect(lunes("2026-10-29")).toBe("2026-10-26");
    expect(serie(filas, "semana")).toHaveLength(1);
    expect(serie(filas, "dia")).toHaveLength(2);
    const a = porCampana(filas).find((c) => c.campana === "A");
    expect(a?.usoPresupuesto).toBeCloseTo(1190 / 600);
  });
  it("términos sumados sin distinguir mayúsculas", () => {
    const t = resumirTerminos([
      { termino: "Inkema", campana: "A", gasto: 10, clics: 1, impresiones: 2, conversiones: 1 },
      { termino: "inkema", campana: "B", gasto: 5, clics: 1, impresiones: 1, conversiones: 0 },
    ]);
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ gasto: 15, campana: "Varias" });
  });
  it("variación", () => {
    expect(variacion(120, 100)).toBeCloseTo(0.2);
    expect(variacion(1, 0)).toBeNull();
  });
});
