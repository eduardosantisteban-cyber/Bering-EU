import { describe, expect, it } from "vitest";
import { estadoDeLead, oportunidadesDeHolded } from "./holdedCrm";

const etapas = { s1: "Lead", s2: "Presupuesto Enviado", s3: "Presupuesto Listo" };

describe("histórico de Holded", () => {
  it("convierte las oportunidades que no están en la hoja", () => {
    const ops = oportunidadesDeHolded(
      [
        { id: "a", name: "BEUQ320-Acon Arrendamientos Urbanos SL", contactName: "Acon Arrendamientos Urbanos SL", value: 5117.09, status: 2, stageId: "s2", tags: ["muelledecarga"], createdAt: 1780358400 },
        { id: "b", name: "BEUQ307-TAFANNUN ART WORKS", contactName: "TAFANNUN ART WORKS", value: 62706, status: 0, stageId: "s2", createdAt: 1778457600 },
        { id: "c", name: "BEUQ401-Ya en la hoja", value: 100, status: 0, stageId: "s1" },
        { id: "d", name: "Sin código", value: 0, status: 0, stageId: "s1" },
        { id: "e", name: "MMQ100 - Prueba [Puerta seccional] – nave en Burgos", value: 0, status: 0, stageId: "s1", createdAt: "2026-10-20" },
      ],
      etapas,
      new Set(["BEUQ401"])
    );
    expect(ops.map((o) => o.codigo)).toEqual(["BEUQ320", "BEUQ307", "MMQ100"]);
    expect(ops[0]).toMatchObject({ estado: "Perdido", empresa: "Acon Arrendamientos Urbanos SL", importe: 5117.09, productos: "muelle de carga", origen: "crm", sinSeguimiento: true });
    expect(ops[0].fechaSolicitud?.slice(0, 10)).toBe("2026-06-02");
    expect(ops[1].estado).toBe("Presupuesto enviado");
    expect(ops[2]).toMatchObject({ marca: "Muelle Max", estado: "Pendiente presupuesto", productos: "puerta seccional", provincia: "Burgos" });
  });

  it("estado por etapa", () => {
    expect(estadoDeLead({ id: "x", status: 0, stageId: "s3", value: 0 }, etapas)).toBe("Presupuesto en Holded");
    expect(estadoDeLead({ id: "x", status: 1 }, etapas)).toBe("Ganado");
    expect(estadoDeLead({ id: "x", status: 0, stageId: "s1", value: 1000 }, etapas)).toBe("Presupuesto en Holded");
  });
});
