/**
 * Parsea el JSON que devuelve la IA, con dos reparaciones de red de
 * seguridad ante fallos de formato conocidos (ver CHANGELOG v1.3.0):
 * comas finales sobrantes, y comas que falten entre elementos
 * consecutivos de un array/objeto en respuestas largas.
 */
export function tryParseJSON(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) {
      throw new Error("No se encontró un objeto JSON en la respuesta");
    }
    let candidate = raw.slice(start, end + 1);
    candidate = candidate.replace(/,\s*([}\]])/g, "$1");
    try {
      return JSON.parse(candidate);
    } catch (e2) {
      // Reparación adicional: inserta comas que falten entre elementos
      // consecutivos (fallo típico de la IA en respuestas JSON largas,
      // p. ej. presupuestos con muchas líneas o descripciones extensas).
      let repaired = candidate
        .replace(/}\s*{/g, "},{")
        .replace(/]\s*\[/g, "],[")
        .replace(/"\s*\n\s*"/g, '",\n"');
      repaired = repaired.replace(/,\s*([}\]])/g, "$1");
      try {
        return JSON.parse(repaired);
      } catch {
        throw e2;
      }
    }
  }
}
