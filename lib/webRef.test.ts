import { describe, expect, it } from "vitest";
import { extraerGclidTexto, extraerRef, normalizarRef, origenLegible, origenPermitido, validarWebRef } from "./webRef";

describe("webRef", () => {
  it("extrae el código del mensaje", () => {
    expect(extraerRef("Hola, vengo de la web (Puertas Rápidas). Ref. W-CYQD7Y")).toBe("W-CYQD7Y");
    expect(extraerRef("ref w-cyqd7y")).toBe("W-CYQD7Y");
    expect(extraerRef("W-CYQD7")).toBeNull();
    expect(extraerRef("W-CYQD0Y")).toBeNull(); // 0 no está en el alfabeto
    expect(normalizarRef(" w-abc234 ")).toBe("W-ABC234");
  });
  it("extrae el gclid del formulario", () => {
    expect(extraerGclidTexto("texto\n\n[Ref. web: CjwKCAiAqabXBhBUEiwAw_SQpVQF]")).toBe("CjwKCAiAqabXBhBUEiwAw_SQpVQF");
    expect(extraerGclidTexto("[Ref. web:\nCjwKCAiAqabXBhBUEiwAw]")).toBe("CjwKCAiAqabXBhBUEiwAw");
    expect(extraerGclidTexto("sin nada")).toBeNull();
  });
  it("valida lo que manda la web", () => {
    const v = validarWebRef({ ref: "W-CYQD7Y", canal: "whatsapp", gclid: "TESTgclid_1234567890abc", pagina: "/puertas/?x=1", gbraid: "<script>" });
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.ref.gclid).toBe("TESTgclid_1234567890abc");
      expect(v.ref.gbraid).toBeNull();
      expect(v.ref.pagina).toBe("/puertas/");
    }
    expect(validarWebRef({ ref: "X", canal: "whatsapp" }).ok).toBe(false);
    expect(validarWebRef({ ref: "W-CYQD7Y", canal: "sms" }).ok).toBe(false);
  });
  it("solo acepta la web", () => {
    expect(origenPermitido("https://beringeu.es")).toBe(true);
    expect(origenPermitido("https://www.beringeu.es")).toBe(true);
    expect(origenPermitido("https://beringeu.es.evil.com")).toBe(false);
    expect(origenPermitido(null)).toBe(false);
  });
  it("origen legible", () => {
    expect(origenLegible({ gclid: "x" })).toBe("Google Ads");
    expect(origenLegible({ utm_source: "linkedin", utm_medium: "paid" })).toBe("Publicidad (linkedin)");
    expect(origenLegible({})).toBe("Web (sin anuncio)");
  });
});
