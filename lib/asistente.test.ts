import { describe, expect, it } from "vitest";
import { codigosEnTexto, recortarHistorial } from "./asistente";

describe("asistente", () => {
  it("detecta códigos de oportunidad", () => {
    expect(codigosEnTexto("¿qué pasa con beuq419 y MMQ 12? y BEUQ419")).toEqual(["BEUQ419", "MMQ12"]);
    expect(codigosEnTexto("sin código")).toEqual([]);
  });
  it("recorta y limpia el historial", () => {
    const h = recortarHistorial([{ rol: "usuario", texto: " " }, { rol: "usuario", texto: "hola" }, { rol: "asistente", texto: "x".repeat(5000) }]);
    expect(h).toHaveLength(2);
    expect(h[1].texto.length).toBe(4000);
  });
});
