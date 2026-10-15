import { describe, expect, it } from "vitest";
import {
  enlaceGmail,
  fechaDeCelda,
  indicadores,
  motivoAtencion,
  nombreDeEmail,
  ordenAtencion,
  parsearSolicitudes,
  pasoSeguimiento,
  porTipo,
  serieMensual,
  urlDeFormula,
} from "./solicitudes";

const AHORA = new Date(2026, 9, 19, 10, 30); // lunes 19/10/2026
const hace = (d: number) => new Date(AHORA.getTime() - d * 86400000);
const serial = (d: Date) => d.getTime() / 86400000 + 25569; // fecha → nº de serie de Sheets
const pad = (n: number) => String(n).padStart(2, "0");
const marca = (t: string, d: number) => {
  const x = hace(d);
  return `${t} ${pad(x.getDate())}/${pad(x.getMonth() + 1)}/${x.getFullYear()} 10:30`;
};

/** Fila A…V de la hoja. */
function fila(p: {
  codigo: string;
  estado: string;
  diasEstado: number;
  importe?: number | "";
  productos?: string;
  registrado?: string;
  s?: string;
  t?: boolean;
  u?: string;
  v?: string;
}): unknown[] {
  const f: unknown[] = new Array(22).fill("");
  f[0] = serial(hace(p.diasEstado + 2));
  f[1] = p.codigo;
  f[2] = "Empresa " + p.codigo;
  f[3] = "Ana Gil";
  f[4] = "ana@cliente.es";
  f[5] = p.productos ?? "Muelle de carga";
  f[11] = "https://mail.google.com/mail/u/0/#all/19fec038e0f07ca0";
  f[12] = p.registrado ?? "eduardo.z@beringeu.es";
  f[13] = p.estado;
  f[14] = p.codigo + "-A (PDF)";
  f[15] = serial(hace(p.diasEstado));
  f[16] = p.importe ?? 10000;
  f[18] = p.s ?? "";
  f[19] = p.t ?? false;
  f[20] = p.u ?? "";
  f[21] = p.v ?? "";
  return f;
}

describe("utilidades", () => {
  it("convierte números de serie y textos dd/mm/aaaa en fechas", () => {
    expect(fechaDeCelda(serial(new Date(Date.UTC(2026, 9, 14))))?.toISOString().slice(0, 10)).toBe("2026-10-14");
    expect(fechaDeCelda("Enviado 07/10/2026 10:30")?.getDate()).toBe(7);
    expect(fechaDeCelda("")).toBeNull();
    expect(fechaDeCelda(5)).toBeNull();
  });

  it("saca la URL de una fórmula HYPERLINK", () => {
    expect(urlDeFormula('=HYPERLINK("https://docs.google.com/x","BEUQ1")')).toBe("https://docs.google.com/x");
    expect(urlDeFormula("BEUQ1")).toBe("");
  });

  it("enlaza Gmail con ?authuser= en vez de /u/0", () => {
    expect(enlaceGmail("https://mail.google.com/mail/u/0/#all/abc123", "eduardo.z@beringeu.es")).toBe(
      "https://mail.google.com/mail/?authuser=eduardo.z%40beringeu.es#all/abc123"
    );
    expect(enlaceGmail("no es un enlace", "x@y.es")).toBe("");
  });

  it("nombre corto del email", () => {
    expect(nombreDeEmail("belen.diaz@beringeu.es")).toBe("Belen");
    expect(nombreDeEmail("")).toBe("—");
  });
});

describe("pasoSeguimiento (misma regla que el script)", () => {
  it("día 4 sin nada → toca el 1er email", () => {
    expect(pasoSeguimiento(hace(4), ["", "", ""], AHORA)).toEqual({ estado: "toca", paso: 1 });
  });
  it("1er email hace 2 días, envío hace 12 → espera el hueco de 7 días", () => {
    expect(pasoSeguimiento(hace(12), [marca("Enviado", 2), "", ""], AHORA)).toEqual({ estado: "esperando", paso: 2 });
  });
  it("cliente respondió → parado", () => {
    expect(pasoSeguimiento(hace(20), ["No enviado: el cliente respondió (10/10/2026)", "", ""], AHORA).estado).toBe("parado");
  });
  it("todo hecho → completo", () => {
    expect(
      pasoSeguimiento(hace(30), [marca("Enviado", 27), marca("Enviado", 20), marca("Aviso enviado", 9)], AHORA).estado
    ).toBe("completo");
  });
  it("una marca de prueba no cuenta en producción", () => {
    expect(pasoSeguimiento(hace(12), [marca("Prueba enviada a yo@beringeu.es", 9), "", ""], AHORA)).toEqual({
      estado: "toca",
      paso: 1,
    });
  });
});

describe("parsearSolicitudes + necesitan atención", () => {
  const valores = [
    fila({ codigo: "BEUQ401", estado: "Presupuesto enviado", diasEstado: 4 }), // seguimiento automático → nada
    fila({ codigo: "BEUQ404", estado: "Presupuesto enviado", diasEstado: 22, s: marca("Enviado", 19), u: marca("Enviado", 12), v: marca("Aviso enviado", 1) }),
    fila({ codigo: "BEUQ405", estado: "Presupuesto enviado", diasEstado: 22, s: "No enviado: el cliente respondió (10/10/2026)" }),
    fila({ codigo: "BEUQ406", estado: "Presupuesto enviado", diasEstado: 15, t: true }),
    fila({ codigo: "BEUQ410", estado: "Pendiente presupuesto", diasEstado: 5, importe: "" }),
    fila({ codigo: "BEUQ411", estado: "Presupuesto en Holded", diasEstado: 1 }),
    fila({ codigo: "BEUQ412", estado: "Error Holded", diasEstado: 6 }),
    fila({ codigo: "BEUQ420", estado: "Ganado", diasEstado: 10, importe: 25000, productos: "Puerta rapida" }),
    fila({ codigo: "BEUQ421", estado: "Perdido", diasEstado: 20, importe: 8000, productos: "Puerta rapida, Muelle de carga" }),
    ["", "", ""], // fila vacía (casillas hasta el final de la hoja)
  ];
  const formB = valores.map((f) => (f[1] ? `=HYPERLINK("https://docs.google.com/spreadsheets/d/S-${f[1]}/edit","${f[1]}")` : ""));
  const formO = valores.map((f) => (f[1] ? `=HYPERLINK("https://drive.google.com/file/d/P-${f[1]}/view","x")` : ""));
  const ops = parsearSolicitudes(valores, formB, formO, AHORA);
  const por = (c: string) => ops.find((o) => o.codigo === c)!;

  it("ignora filas vacías y lee enlaces y números", () => {
    expect(ops).toHaveLength(9);
    expect(por("BEUQ401").sheetUrl).toBe("https://docs.google.com/spreadsheets/d/S-BEUQ401/edit");
    expect(por("BEUQ401").pdfUrl).toBe("https://drive.google.com/file/d/P-BEUQ401/view");
    expect(por("BEUQ401").numero).toBe("BEUQ401-A");
    expect(por("BEUQ410").importe).toBeNull();
    expect(por("BEUQ406").sinSeguimiento).toBe(true);
  });

  it("aplica la regla de atención del script", () => {
    expect(por("BEUQ401").atencion).toBe("");
    expect(por("BEUQ404").atencion).toMatch(/^Llamar al cliente/);
    expect(por("BEUQ405").atencion).toBe("El cliente respondió: actualizar el estado");
    expect(por("BEUQ406").atencion).toBe("Enviado sin respuesta (sin seguimiento automático)");
    expect(por("BEUQ410").atencion).toBe("Sin presupuestar");
    expect(por("BEUQ411").atencion).toBe("");
    expect(por("BEUQ412").atencion).toBe("Error al crear en Holded");
    expect(por("BEUQ420").atencion).toBe("");
  });

  it("ordena las llamadas primero", () => {
    const l = ops.filter((o) => o.atencion).sort(ordenAtencion);
    expect(l[0].codigo).toBe("BEUQ404");
  });

  it("calcula los indicadores", () => {
    const k = indicadores(ops, AHORA);
    expect(k.enviados).toBe(4);
    expect(k.nAbiertas).toBe(5); // 4 enviados + 1 en Holded
    expect(k.carteraAbierta).toBe(50000);
    expect(k.porPresupuestar).toBe(2);
    expect(k.ganadoAnio).toBe(25000);
    expect(k.tasaCierre90).toBe(0.5);
    expect(k.atencion).toBe(5);
  });

  it("serie mensual y tipos de producto", () => {
    const m = serieMensual(ops, AHORA, 6);
    expect(m).toHaveLength(6);
    expect(m[5].mes).toBe(9); // octubre
    expect(m.reduce((s, x) => s + x.ganado, 0)).toBe(25000);
    const t = porTipo(ops);
    const rapida = t.find((x) => x.tipo === "Puerta rápida")!;
    expect(rapida.solicitudes).toBe(2);
    expect(rapida.ganados).toBe(1);
    expect(rapida.tasa).toBe(0.5);
    expect(t.find((x) => x.tipo === "Muelle de carga")!.solicitudes).toBe(8);
  });
});
