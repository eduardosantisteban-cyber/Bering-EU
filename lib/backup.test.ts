import { describe, expect, it } from "vitest";
import { extractBackupList, itemsDedupeKey } from "./backup";

describe("itemsDedupeKey", () => {
  it("es igual para el mismo conjunto de ids en cualquier orden", () => {
    expect(itemsDedupeKey([{ id: "b" }, { id: "a" }])).toBe(itemsDedupeKey([{ id: "a" }, { id: "b" }]));
  });

  it("distingue conjuntos de líneas distintos", () => {
    expect(itemsDedupeKey([{ id: "a" }])).not.toBe(itemsDedupeKey([{ id: "a" }, { id: "b" }]));
  });

  it("devuelve cadena vacía para presupuestos sin líneas", () => {
    expect(itemsDedupeKey([])).toBe("");
    expect(itemsDedupeKey(null)).toBe("");
    expect(itemsDedupeKey(undefined)).toBe("");
  });
});

describe("extractBackupList", () => {
  it("acepta el formato nuevo ({ presupuestos: [...] })", () => {
    expect(extractBackupList({ presupuestos: [{ id: "1" }] })).toEqual([{ id: "1" }]);
  });

  it("acepta el formato antiguo (array suelto)", () => {
    expect(extractBackupList([{ id: "1" }])).toEqual([{ id: "1" }]);
  });

  it("devuelve un array vacío para un JSON con formato inesperado", () => {
    expect(extractBackupList({ foo: "bar" })).toEqual([]);
    expect(extractBackupList(null)).toEqual([]);
    expect(extractBackupList("no es json")).toEqual([]);
  });
});
