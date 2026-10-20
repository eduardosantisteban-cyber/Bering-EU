import { describe, expect, it } from "vitest";
import { provinciaDeTexto } from "./provincias";
import {
  completarOportunidades,
  conversionPor,
  embudo,
  enPeriodo,
  fechasPresupuesto,
  marcaDeCodigo,
  margenesDeOfertas,
  mediana,
  motivosPerdida,
  parsearSolicitudes,
} from "./solicitudes";

// Análisis del portal: provincia, marca, canal, margen, tiempo de respuesta, embudo y conversión.

describe("provinciaDeTexto", () => {
  it("detecta la provincia que aparece antes", () => {
    expect(provinciaDeTexto("Nave en Miranda de Ebro (Burgos)")).toBe("Burgos");
    expect(provinciaDeTexto("Plataforma en PLA-ZA, Zaragoza")).toBe("Zaragoza");
    expect(provinciaDeTexto("Leganés y luego Barcelona")).toBe("Madrid");
  });
  it("ignora la dirección de Bering y Banco Santander", () => {
    expect(provinciaDeTexto("Cliente de Vigo. Calle Hermosilla, 48, 28001 Madrid")).toBe("Pontevedra");
    expect(provinciaDeTexto("IBAN Banco Santander, obra en Sevilla")).toBe("Sevilla");
    expect(provinciaDeTexto("sin ubicación")).toBe("");
  });
});

describe("marcaDeCodigo", () => {
  it("usa el prefijo de la serie", () => {
    expect(marcaDeCodigo("MMQ100")).toBe("Muelle Max");
    expect(marcaDeCodigo("BEUQ401")).toBe("Bering EU");
  });
});

const margenes = margenesDeOfertas([
  { codigo: "BEUQ1", numero: "BEUQ1-A", uds: 1, precio_unit: 1000, coste_unit: 900, descuento: 0, fecha: "2026-10-12" },
  { codigo: "BEUQ1", numero: "BEUQ1-B", uds: 2, precio_unit: 1000, coste_unit: 700, descuento: 0.05, fecha: "2026-10-14" },
  { codigo: "BEUQ1", numero: "BEUQ1-B", uds: 1, precio_unit: 300, coste_unit: null, descuento: 0.05, fecha: "2026-10-14" },
]);

describe("margenesDeOfertas", () => {
  it("usa la última revisión, aplica el descuento y cuenta las líneas sin coste", () => {
    expect(margenes.BEUQ1).toEqual({ numero: "BEUQ1-B", venta: 2185, coste: 1400, pct: 0.359, sinCoste: 1, fecha: "2026-10-12" });
  });
});

describe("oportunidades enriquecidas y análisis", () => {
  const ahora = new Date(2026, 9, 20, 12);
  const serial = (d: Date) => d.getTime() / 864e5 + 25569;
  const fila = (cod: string, est: string, fSol: Date, fEst: Date | "", imp: number | "", extra: Record<number, unknown> = {}) => {
    const f: unknown[] = new Array(25).fill("");
    f[0] = serial(fSol);
    f[1] = cod;
    f[2] = "Empresa " + cod;
    f[5] = "muelle de carga";
    f[8] = "Nave en Zaragoza";
    f[10] = "Asunto";
    f[12] = "eduardo.z@beringeu.es";
    f[13] = est;
    f[15] = fEst ? serial(fEst) : "";
    f[16] = imp;
    for (const [k, v] of Object.entries(extra)) f[Number(k)] = v;
    return f;
  };
  const ops = parsearSolicitudes(
    [
      fila("BEUQ1", "Ganado", new Date(2026, 9, 1), new Date(2026, 9, 15), 2185),
      fila("BEUQ2", "Presupuesto enviado", new Date(2026, 9, 5), new Date(2026, 9, 10), 5000, { 18: "Enviado 13/10/2026 10:05" }),
      fila("MMQ100", "Perdido", new Date(2026, 9, 6), new Date(2026, 9, 16), 3000, { 22: "Precio", 23: "Muelle Max", 24: "Madrid" }),
      fila("BEUQ3", "Pendiente presupuesto", new Date(2026, 9, 18), "", "", { 10: "Formulario web 18/10 10:00" }),
    ],
    [],
    [],
    ahora
  );
  completarOportunidades(ops, fechasPresupuesto([[serial(new Date(2026, 9, 3)), "BEUQ1", "Pendiente presupuesto", "Presupuesto en Holded"]]), margenes);

  it("lee fila, marca, canal, provincia, motivo y próximo seguimiento", () => {
    expect(ops).toHaveLength(4);
    expect(ops[2].fila).toBe(4);
    expect(ops[2].marca).toBe("Muelle Max");
    expect(ops[2].canal).toBe("Muelle Max");
    expect(ops[3].canal).toBe("Formulario web");
    expect(ops[2].provincia).toBe("Madrid");
    expect(ops[0].provincia).toBe("Zaragoza");
    expect(ops[2].motivoPerdida).toBe("Precio");
    expect(ops[1].proximoSeguimiento?.nombre).toBe("2º email");
  });

  it("calcula tiempo de respuesta y margen", () => {
    expect(ops[0].tiempoRespuesta).toBe(2);
    expect(ops[0].margen?.pct).toBe(0.359);
  });

  it("embudo, conversión por marca y motivos de pérdida", () => {
    const e = embudo(enPeriodo(ops, 90, ahora));
    expect([e.solicitudes.length, e.presupuestadas.length, e.enviadas.length, e.ganadas.length, e.perdidas.length]).toEqual([4, 3, 3, 1, 1]);
    expect(conversionPor(ops, "marca").map((x) => [x.clave, x.solicitudes, x.ganadas, x.perdidas])).toEqual([
      ["Bering EU", 3, 1, 0],
      ["Muelle Max", 1, 0, 1],
    ]);
    expect(motivosPerdida(ops)).toEqual([{ motivo: "Precio", n: 1, importe: 3000 }]);
    expect(mediana([1, 5, 3, 2])).toBe(2.5);
  });
});
