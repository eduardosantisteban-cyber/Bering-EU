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
