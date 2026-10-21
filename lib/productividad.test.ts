import { describe, expect, it } from "vitest";
import { SUPUESTOS_INICIALES, TAREAS, calcularProductividad, supuestosDeEscenario } from "./productividad";

describe("calcularProductividad", () => {
  it("escenario base con los supuestos iniciales (mismo resultado que la calculadora original)", () => {
    const r = calcularProductividad(SUPUESTOS_INICIALES, TAREAS);
    expect(r.minAntes).toBe(190);
    expect(r.minAhora).toBe(48);
    expect(r.horasLiberadas).toBe(35.5);
    expect(r.ventaBase).toBe(60000);
    expect(r.subida).toBeCloseTo(0.2655, 4);
    expect(r.objetivoActual).toBe(720000);
  });
  it("el escenario conservador exige menos", () => {
    const c = calcularProductividad(supuestosDeEscenario(SUPUESTOS_INICIALES, "conservador"), TAREAS);
    expect(c.subida).toBeCloseTo(0.074, 3);
  });
});
