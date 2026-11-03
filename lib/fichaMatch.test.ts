import { describe, expect, it } from "vitest";
import { matchesFicha } from "./fichaMatch";

describe("matchesFicha", () => {
  it("empareja cuando la marca coincide y el modelo de una contiene al de la otra", () => {
    expect(
      matchesFicha(
        { marca: "NOVOFERM ALSAL, SA", modelo: "L530" },
        { marca: "NOVOFERM ALSAL", modelo: "Plataforma labio telescópico L530" }
      )
    ).toBe(true);
  });

  it("no empareja si la marca es distinta, aunque el modelo coincida", () => {
    expect(matchesFicha({ marca: "Novoferm", modelo: "L530" }, { marca: "Cadlan", modelo: "L530" })).toBe(false);
  });

  it("no empareja si el modelo no tiene relación, aunque la marca coincida", () => {
    expect(matchesFicha({ marca: "Novoferm", modelo: "L530" }, { marca: "Novoferm", modelo: "M150" })).toBe(false);
  });

  it("no empareja cuando falta la marca o el modelo en cualquiera de los dos lados", () => {
    expect(matchesFicha({ marca: null, modelo: "L530" }, { marca: "Novoferm", modelo: "L530" })).toBe(false);
    expect(matchesFicha({ marca: "Novoferm", modelo: null }, { marca: "Novoferm", modelo: "L530" })).toBe(false);
    expect(matchesFicha({ marca: "Novoferm", modelo: "L530" }, { marca: "Novoferm", modelo: "" })).toBe(false);
  });

  it("tolera variantes de escritura de la marca (mismo criterio que normalizeMarca)", () => {
    expect(matchesFicha({ marca: "NOVOFERM-ALSAL S.A.", modelo: "L530" }, { marca: "Novoferm Alsal, SA", modelo: "L530" })).toBe(
      true
    );
  });
});

import { compararRecencia, fechaDeFicha, masReciente, numeroVersion, versionesAnteriores } from "./fichaMatch";

describe("varias fichas del mismo producto", () => {
  const f = (id: string, nombre_archivo: string, extra: Record<string, unknown> = {}) => ({ id, nombre_archivo, marca: "Novoferm Alsal", modelo: "Novoroll", created_at: "2026-09-09T09:00:00Z", ...extra });
  it("fecha y versión del documento o del nombre del archivo", () => {
    expect(fechaDeFicha(f("a", "NOVOGRANDE FICHA TÉCNICA - 2024-Copiar.pdf"))).toBe("2024-01-01");
    expect(fechaDeFicha(f("a", "Catalogo_Puertas_Enrollables_2018__V-2017.pdf"))).toBe("2018-01-01");
    expect(fechaDeFicha(f("a", "Novoroll.pdf", { fecha_documento: "2025-03-01" }))).toBe("2025-03-01");
    expect(fechaDeFicha(f("a", "EI2 60 MARCO MC3 2H (63).pdf"))).toBeNull();
    expect(numeroVersion(f("a", "NovoDock_L530_v07_EN.pdf"))).toBe(7);
    expect(numeroVersion(f("a", "x.pdf", { version: "Rev. 3" }))).toBe(3);
  });
  it("se queda con la más reciente", () => {
    const vieja = f("vieja", "Novoroll.pdf", { fecha_documento: "2021-05-01" });
    const nueva = f("nueva", "ficha tecnica rapida enrollable (1).pdf", { fecha_documento: "2024-02-01" });
    const sinFecha = f("sin", "otra.pdf", { created_at: "2026-10-01T00:00:00Z" });
    expect(masReciente([vieja, sinFecha, nueva])?.id).toBe("nueva");
    expect(compararRecencia(f("x", "a_v2.pdf"), f("y", "a_v10.pdf"))).toBeGreaterThan(0);
    const ant = versionesAnteriores([vieja, nueva, { ...f("otro", "L530.pdf"), modelo: "NovoDock L530" }]);
    expect(ant.get("vieja")?.id).toBe("nueva");
    expect(ant.has("nueva")).toBe(false);
    expect(ant.has("otro")).toBe(false);
  });
});
