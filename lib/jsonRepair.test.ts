import { describe, expect, it } from "vitest";
import { tryParseJSON } from "./jsonRepair";

describe("tryParseJSON", () => {
  it("parsea JSON válido directamente", () => {
    expect(tryParseJSON('{"a":1}')).toEqual({ a: 1 });
  });

  it("recorta texto antes/después del objeto (p. ej. una frase de la IA o un bloque ```json)", () => {
    expect(tryParseJSON('Aquí tienes el resultado:\n```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it("quita comas finales sobrantes antes de } o ]", () => {
    expect(tryParseJSON('{"items":[1,2,3,],"proveedor":"Novoferm",}')).toEqual({
      items: [1, 2, 3],
      proveedor: "Novoferm",
    });
  });

  it("repara una coma que falte entre dos objetos consecutivos de un array", () => {
    // Fallo real observado: la IA cierra un item y abre el siguiente sin
    // coma de por medio en respuestas largas (ver v1.3.0 del changelog).
    const raw = '{"items":[{"modelo":"A"} {"modelo":"B"}]}';
    expect(tryParseJSON(raw)).toEqual({ items: [{ modelo: "A" }, { modelo: "B" }] });
  });

  it("repara una coma que falte entre dos strings separadas por salto de línea", () => {
    const raw = '{"a":"uno"\n"b":"dos"}';
    expect(tryParseJSON(raw)).toEqual({ a: "uno", b: "dos" });
  });

  it("lanza un error legible cuando el texto no contiene ningún objeto JSON", () => {
    expect(() => tryParseJSON("esto no es json en absoluto")).toThrow(
      "No se encontró un objeto JSON en la respuesta"
    );
  });

  it("lanza el error original de JSON.parse cuando no se puede reparar", () => {
    expect(() => tryParseJSON('{"a": }')).toThrow();
  });
});
