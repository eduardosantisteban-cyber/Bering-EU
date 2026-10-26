import { describe, expect, it } from "vitest";
import { claveTelefono, destinatariosDeDestino, perdidasDuplicadas, comercialDeDestino, formatearTelefono, leerEventoVoip, leerMapaDestinos, llamadaRelevante, validarEntrada } from "./entradas";

describe("entradas por llamada / WhatsApp", () => {
  it("valida el formulario", () => {
    const ok = validarEntrada({ canal: "WhatsApp", registrado_por: "Belen.Diaz@beringeu.es", empresa: "Logística Ebro", telefono: "612345678", nota: "2 puertas seccionales 4000 x 4500 mm en Zaragoza" });
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.entrada.registrado_por).toBe("belen.diaz@beringeu.es");
      expect(ok.entrada.telefono).toBe("+34 612 345 678");
      expect(ok.entrada.email).toBe(null);
      expect(ok.entrada.llamada_id).toBe(null);
    }
    expect(validarEntrada({ canal: "Fax", registrado_por: "belen.diaz@beringeu.es", empresa: "X", telefono: "612345678", nota: "algo largo aquí" }).ok).toBe(false);
    expect(validarEntrada({ canal: "Llamada", registrado_por: "otro@x.com", empresa: "Empresa", telefono: "612345678", nota: "algo largo aquí" }).ok).toBe(false);
    const sinContacto = validarEntrada({ canal: "Llamada", registrado_por: "eduardo.z@beringeu.es", empresa: "Empresa", nota: "algo largo aquí" });
    expect(sinContacto.ok).toBe(false);
    expect(validarEntrada({ canal: "Llamada", registrado_por: "eduardo.z@beringeu.es", empresa: "Empresa", email: "mal", nota: "algo largo aquí" }).ok).toBe(false);
  });

  it("normaliza teléfonos", () => {
    expect(formatearTelefono("0034 976 123 456")).toBe("+34 976 123 456");
    expect(formatearTelefono("+34612345678")).toBe("+34 612 345 678");
    expect(formatearTelefono("+33 6 12 34 56 78")).toBe("+33612345678");
    expect(claveTelefono("+34 612 34 56 78")).toBe("612345678");
    expect(claveTelefono("101")).toBe("");
  });

  it("lee el webhook de VoIPstudio", () => {
    const ev = leerEventoVoip({ event_name: "call.ended", call_id: "abc", src: "+34612345678", dst: "+34910000000", duration: 95, connected_at: "2026-10-22 10:00:00" });
    expect(ev).toEqual({ evento: "call.ended", callId: "abc", numero: "+34612345678", destino: "+34910000000", duracion: 95, perdida: false });
    expect(leerEventoVoip({ data: { event_name: "call.missed", call_id: "x1", src: "612345678", dst: "101" } })?.perdida).toBe(true);
    expect(leerEventoVoip({ event_name: "call.ended", call_id: "x2", src: "612345678", dst: "101", duration: 0 })?.perdida).toBe(true);
    expect(leerEventoVoip({ foo: 1 })).toBe(null);
  });

  it("solo guarda llamadas entrantes relevantes", () => {
    const base = { evento: "call.ended", callId: "1", numero: "+34612345678", destino: "101", duracion: 60, perdida: false };
    expect(llamadaRelevante(base, [], 15)).toBe(true);
    expect(llamadaRelevante({ ...base, duracion: 5 }, [], 15)).toBe(false);
    expect(llamadaRelevante({ ...base, duracion: 0, perdida: true }, [], 15)).toBe(true);
    expect(llamadaRelevante({ ...base, numero: "101" }, [], 15)).toBe(false); // saliente desde extensión
    expect(llamadaRelevante({ ...base, numero: "anonymous" }, [], 15)).toBe(false);
    expect(llamadaRelevante(base, ["612 345 678"], 15)).toBe(false);
    expect(llamadaRelevante({ ...base, evento: "call.ringing" }, [], 15)).toBe(false);
  });

  it("elige el comercial por el destino", () => {
    const mapa = leerMapaDestinos('{"102":"belen.diaz@beringeu.es","+34 910 000 001":"manolo.ruiz@muellemax.com"}');
    expect(comercialDeDestino("102", mapa, "eduardo.z@beringeu.es")).toBe("belen.diaz@beringeu.es");
    expect(comercialDeDestino("0034910000001", mapa, "eduardo.z@beringeu.es")).toBe("manolo.ruiz@muellemax.com");
    expect(comercialDeDestino("101", mapa, "Eduardo.Z@beringeu.es")).toBe("eduardo.z@beringeu.es");
    expect(leerMapaDestinos("no json")).toEqual({});
  });

  it("no avisa dos veces de la misma llamada", () => {
    const ls = [
      { id: "a", creado: "2026-10-26T15:17:29Z", numero: "+34 601 015 894", perdida: true, duracion: 0 },
      { id: "b", creado: "2026-10-26T15:17:30Z", numero: "+34 601 015 894", perdida: false, duracion: 16 },
      { id: "c", creado: "2026-10-26T13:26:43Z", numero: "+34 919 895 589", perdida: true, duracion: 0 },
      { id: "d", creado: "2026-10-26T13:26:45Z", numero: "+34 919 895 589", perdida: false, duracion: 22 },
      { id: "e", creado: "2026-10-26T13:27:34Z", numero: "+34 919 895 589", perdida: false, duracion: 52 },
      { id: "f", creado: "2026-10-26T10:00:00Z", numero: "+34 600 000 000", perdida: true, duracion: 0 },
    ];
    expect(perdidasDuplicadas(ls).sort()).toEqual(["a", "c", "d"]);
  });

  it("número compartido: avisa a todos", () => {
    const mapa = leerMapaDestinos('{"34911233154":"belen.diaz@beringeu.es, manolo.ruiz@muellemax.com"}');
    expect(destinatariosDeDestino("34911233154", mapa, "eduardo.z@beringeu.es")).toEqual(["belen.diaz@beringeu.es", "manolo.ruiz@muellemax.com"]);
    expect(destinatariosDeDestino("101", mapa, "eduardo.z@beringeu.es")).toEqual(["eduardo.z@beringeu.es"]);
  });
});
