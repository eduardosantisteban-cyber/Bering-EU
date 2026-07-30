import { describe, expect, it } from "vitest";
import { fmtMoney, normalizeMarca, normalizeStr } from "./format";

describe("normalizeStr", () => {
  it("quita acentos, mayúsculas y espacios sobrantes", () => {
    expect(normalizeStr("  Puerta Rápida  ")).toBe("puerta rapida");
  });

  it("trata null/undefined como cadena vacía", () => {
    expect(normalizeStr(null)).toBe("");
    expect(normalizeStr(undefined)).toBe("");
  });
});

describe("normalizeMarca", () => {
  // Caso real: mismo proveedor escrito de formas distintas en el
  // desplegable de marcas (ver conversación sobre consolidación).
  it("agrupa variantes de sufijo societario con y sin puntos/comas", () => {
    const key = normalizeMarca("NOVOFERM ALSAL, SA");
    expect(normalizeMarca("NOVOFERM ALSAL")).toBe(key);
    expect(normalizeMarca("NOVOFERM-ALSAL S.A.")).toBe(key);
  });

  it("ignora si hay o no espacio después de la coma", () => {
    expect(normalizeMarca("TRANSMAVE, S.L.")).toBe(normalizeMarca("TRANSMAVE,S.L."));
  });

  it("ignora diferencias de espaciado interno del nombre", () => {
    const key = normalizeMarca("Van Wijk Nederland");
    expect(normalizeMarca("Van Wijk Nederland BV")).toBe(key);
    expect(normalizeMarca("VanWijk Nederland bv")).toBe(key);
  });

  it("no fusiona marcas realmente distintas", () => {
    expect(normalizeMarca("PORTA FIRE, S.L.")).not.toBe(normalizeMarca("PORTES BISBAL SL"));
    expect(normalizeMarca("SYSTEM DOCK, S.L.")).not.toBe(normalizeMarca("Puertas Ferroflex, S.L.U."));
  });

  it("quita el sufijo SLU completo, sin dejar una 'u' suelta pegada al nombre", () => {
    // Si el orden de la lista de sufijos estuviera mal y "sl" se probara
    // antes que "slu", esto dejaría "puertasferroflexu" en vez de
    // "puertasferroflex".
    expect(normalizeMarca("Puertas Ferroflex, S.L.U.")).toBe(normalizeMarca("Puertas Ferroflex"));
  });
});

describe("fmtMoney", () => {
  it("formatea en euros con coma decimal", () => {
    // No se compara contra una cadena exacta porque el separador de miles
    // depende de los datos ICU disponibles en el runtime (Node local vs
    // Vercel); lo que nos importa es que use coma decimal y símbolo €.
    expect(fmtMoney(1234.5)).toMatch(/1\.?234,50\s?€/);
  });

  it("devuelve un guion largo para valores nulos/NaN", () => {
    expect(fmtMoney(null)).toBe("—");
    expect(fmtMoney(undefined)).toBe("—");
    expect(fmtMoney(NaN)).toBe("—");
  });
});
