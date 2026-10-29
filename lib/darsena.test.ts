import { describe, expect, it } from "vitest";
import { areaM2, bandejaHoy, estadisticasProveedores, fechasDeLineas, parsearPeticiones } from "./darsena";
import { parsearSolicitudes } from "./solicitudes";

const serial = (iso: string) => new Date(iso).getTime() / 86400000 + 25569;
const ahora = new Date("2026-10-29T12:00:00Z");

describe("peticiones a proveedores", () => {
  const pet = parsearPeticiones(
    [
      [serial("2026-10-20T10:00:00Z"), "BEUQ416", "Porta Fire", "a@b.es", "eduardo.z@beringeu.es", "", "", '[{"n":1},{"n":2}]', "Respondida", "m1", "22/10/2026: precios\n21/10/2026: sin precios", ""],
      [serial("2026-10-22T10:00:00Z"), "BEUQ416", "Puertas Padilla", "c@d.es", "eduardo.z@beringeu.es", "", "", "[]", "Esperando respuesta", "", "", "28/10/2026: Recordatorio 1 preparado (3 días laborables sin respuesta)"],
      [serial("2026-10-27T10:00:00Z"), "BEUQ420", "Roper", "e@f.es", "belen.diaz@beringeu.es", "", "", "[]", "Esperando respuesta", "", "", "28/10/2026: Aviso: borrador sin enviar"],
    ],
    ['=HYPERLINK("https://docs.google.com/x","Abrir Sheet")', "", ""]
  );

  it("lee respuesta, recordatorios y borradores sin enviar", () => {
    expect(pet[0]).toMatchObject({ respondida: true, partidas: 2, diasRespuesta: 1.1, sheetUrl: "https://docs.google.com/x" });
    expect(pet[1]).toMatchObject({ respondida: false, nRecordatorios: 1 });
    expect(pet[2].borradorSinEnviar).toBe(true);
  });

  it("la bandeja Hoy junta proveedores, datos que faltan y llamadas", () => {
    const fila = (cod: string, z = "") => {
      const r: unknown[] = new Array(26).fill("");
      r[0] = serial("2026-10-28T10:00:00Z");
      r[1] = cod;
      r[12] = "eduardo.z@beringeu.es";
      r[13] = "Pendiente presupuesto";
      r[15] = r[0];
      r[25] = z;
      return r;
    };
    const ops = parsearSolicitudes([fila("BEUQ416"), fila("BEUQ421", "Cortafuegos: EI, hojas")], [], [], ahora);
    const t = bandejaHoy(ops, pet, [{ id: "1", creado: "2026-10-29T08:00:00Z", numero: "+34 600", perdida: true, estado: "nueva" }], [], ahora);
    expect(t.map((x) => x.tipo)).toEqual(["llamada", "datos", "proveedor", "proveedor"]);
    expect(t[2].titulo).toMatch(/Roper/);
  });

  it("estadísticas por proveedor con precio relativo", () => {
    const l = (p: string, m: string, v: number) => ({ proveedor: p, categoria: "Seccional", medidas: m, precio: v, fecha: "2026-06-01", accesorio: false });
    const f = estadisticasProveedores(pet, [l("Novoferm", "3000x4000", 3000), l("Novoferm", "3000x3000", 2400), l("Novoferm", "2500x3000", 2300), l("Doorhan", "3000x4000", 2500), l("Doorhan", "3000x3000", 2000), l("Doorhan", "2500x3000", 1800)], ahora);
    const nov = f.find((x) => x.proveedor === "Novoferm");
    expect(nov?.indicePrecio).toBeGreaterThan(0);
    expect(f.find((x) => x.proveedor === "Porta Fire")?.tasaRespuesta).toBe(1);
  });
});

describe("utilidades", () => {
  it("área en m²", () => {
    expect(areaM2("3000 x 4000 mm")).toBe(12);
    expect(areaM2("3,00x4,00 m")).toBe(12);
    expect(areaM2("sin medidas")).toBeNull();
  });
  it("fechas de las líneas de resultado", () => {
    expect(fechasDeLineas("22/10/2026: x\n21/10/2026: y")).toHaveLength(2);
  });
});
