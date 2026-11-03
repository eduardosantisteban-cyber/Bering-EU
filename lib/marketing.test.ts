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
    expect(serie(filas, "mes")[0].etiquetaLarga).toBe("Octubre 2026");
    expect(serie(filas, "semana")[0].etiquetaLarga).toBe("Semana del 26 oct 2026");
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

import { campanasDeProductos, canalDeAnuncios, primerDiaConCanal, ventasDeAnuncios } from "./marketing";

describe("ventas que trae Google Ads", () => {
  const camps = ["Muelles_Carga_Tráfico", "Puertas_Tráfico"];
  it("canales y campañas", () => {
    expect(canalDeAnuncios("Web (formulario)")).toBe(true);
    expect(canalDeAnuncios("Email info@")).toBe(true);
    expect(canalDeAnuncios("Llamada")).toBe(true);
    expect(canalDeAnuncios("Email directo")).toBe(false);
    expect(canalDeAnuncios("Muelle Max")).toBe(false);
    expect(campanasDeProductos("Muelle de carga, Mantenimiento", camps)).toEqual(["Muelles_Carga_Tráfico"]);
    expect(campanasDeProductos("Muelle de carga, Puerta seccional", camps)).toEqual(camps);
    expect(campanasDeProductos("Sin clasificar", camps)).toEqual([]);
  });
  it("cruza oportunidades con gasto desde el primer día con canal", () => {
    const ads = [
      { fecha: "2026-10-01", campana: camps[0], estado: "ENABLED", gasto: 9999, clics: 1, impresiones: 1, conversiones: 9, presupuesto: 0 },
      { fecha: "2026-10-20", campana: camps[0], estado: "ENABLED", gasto: 2000, clics: 1, impresiones: 1, conversiones: 4, presupuesto: 0 },
      { fecha: "2026-10-20", campana: camps[1], estado: "ENABLED", gasto: 1000, clics: 1, impresiones: 1, conversiones: 2, presupuesto: 0 },
    ];
    const op = (codigo: string, canal: string, productos: string, estado: string, importe: number | null) => ({ codigo, empresa: codigo, canal, productos, estado, importe, fechaSolicitud: "2026-10-21T10:00:00Z" });
    const ops = [
      op("A", "Llamada", "Muelle de carga", "Ganado", 1000),
      op("B", "Web (formulario)", "Muelle de carga, Puerta seccional", "Presupuesto enviado", 400),
      op("C", "Email directo", "Puerta rapida", "Ganado", 99999),
      op("D", "WhatsApp", "Sin clasificar", "Perdido", null),
    ];
    const v = ventasDeAnuncios(ops, ads, "2026-09-01", "2026-10-31", "2026-10-13", 0.05);
    expect(v.desde).toBe("2026-10-13");
    expect(v.ops.map((o) => o.codigo)).toEqual(["A", "B", "D"]);
    expect(v.total).toMatchObject({ gasto: 3000, oportunidades: 3, ganadas: 1, ganado: 1000, presupuestado: 1400, perdidas: 1 });
    expect(v.total.retorno).toBeCloseTo(1000 / 150);
    const m = v.campanas.find((c) => c.campana === camps[0]);
    expect(m).toMatchObject({ gasto: 2000, oportunidades: 1.5, ganadas: 1 });
    expect(m?.costeOportunidad).toBeCloseTo(2000 / 1.5);
    expect(v.campanas.find((c) => c.campana === "")?.oportunidades).toBe(1);
  });
  it("primer día con canal ignora el histórico del CRM", () => {
    expect(primerDiaConCanal([
      { canal: "CRM (antes de la automatización)", fechaSolicitud: "2025-01-01", origen: "crm" },
      { canal: "Llamada", fechaSolicitud: "2026-10-26T00:00:00Z", origen: "hoja" },
      { canal: "Web (formulario)", fechaSolicitud: "2026-10-13T00:00:00Z", origen: "hoja" },
    ])).toBe("2026-10-13");
  });
});

import { campanasPorGclid } from "./marketing";

describe("clic de Google (GCLID)", () => {
  it("confirma la oportunidad y usa la campaña del clic", () => {
    const porGclid = campanasPorGclid(
      [{ codigo: "BEUQ425", gclid: "abc" }, { codigo: "BEUQ401", gclid: "(sin GCLID)" }, { codigo: "BEUQ9", gclid: "viejo" }],
      [{ gclid: "abc", campana: "Puertas_Tráfico" }]
    );
    expect(porGclid).toEqual({ BEUQ425: "Puertas_Tráfico", BEUQ9: "" });
    const ads = [{ fecha: "2026-11-03", campana: "Puertas_Tráfico", estado: "", gasto: 100, clics: 1, impresiones: 1, conversiones: 1, presupuesto: 0 },
      { fecha: "2026-11-03", campana: "Muelles_Carga_Tráfico", estado: "", gasto: 100, clics: 1, impresiones: 1, conversiones: 1, presupuesto: 0 }];
    const op = { codigo: "BEUQ425", empresa: "X", canal: "Reenviado por el equipo", productos: "Muelle de carga", estado: "Pendiente presupuesto", importe: null, fechaSolicitud: "2026-11-03T16:06:00Z" };
    const v = ventasDeAnuncios([op], ads, "2026-10-01", "2026-11-03", "2026-10-13", null, porGclid);
    expect(v.confirmadas).toBe(1);
    expect(v.ops[0]).toMatchObject({ confirmada: true, campanas: ["Puertas_Tráfico"] });
    expect(ventasDeAnuncios([op], ads, "2026-10-01", "2026-11-03", "2026-10-13", null).ops).toHaveLength(0);
  });
});
