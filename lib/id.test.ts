import { describe, expect, it } from "vitest";
import { sanitizeStorageFilename } from "./id";

describe("sanitizeStorageFilename", () => {
  // Casos reales que dieron "Invalid path specified in request URL" en
  // Supabase Storage por llevar espacios en el nombre del archivo.
  it("sustituye espacios por guion bajo", () => {
    expect(sanitizeStorageFilename("Presupuesto 3-012943.pdf")).toBe("Presupuesto_3-012943.pdf");
  });

  it("sustituye espacios y paréntesis, colapsando caracteres no válidos consecutivos", () => {
    expect(sanitizeStorageFilename("10352026 BERING 354 (1).pdf")).toBe("10352026_BERING_354_1.pdf");
  });

  it("quita acentos y pasa la extensión a minúsculas", () => {
    expect(sanitizeStorageFilename("Presupuesto añadido.PDF")).toBe("Presupuesto_anadido.pdf");
  });

  it("deja intactos los nombres ya seguros", () => {
    expect(sanitizeStorageFilename("presupuesto-2026.pdf")).toBe("presupuesto-2026.pdf");
  });

  it("usa un nombre por defecto si no queda nada aprovechable", () => {
    expect(sanitizeStorageFilename("()).pdf")).toBe("documento.pdf");
    expect(sanitizeStorageFilename("   ")).toBe("documento");
  });
});
