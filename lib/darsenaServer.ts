import { leerRangoOpcional, leerRangos } from "./googleSheets";
import { parsearPeticiones, type Peticion } from "./darsena";

// Lecturas de la hoja Solicitudes que usan varias rutas de Dársena (solo en el servidor).

export const PESTANA_PETICIONES = "Peticiones proveedores";
export const PESTANA_PRIORIDAD = "Prioridad de proveedores";
export const PESTANA_COSTES = "Costes instalación y transporte";

/** Pestaña "Peticiones proveedores" (vacía si aún no existe). */
export async function leerPeticiones(sheetId: string): Promise<Peticion[]> {
  const valores = await leerRangoOpcional(sheetId, `'${PESTANA_PETICIONES}'!A2:L`);
  if (!valores.length) return [];
  const [formulas] = await leerRangos(sheetId, [`'${PESTANA_PETICIONES}'!G2:G`], "FORMULA");
  return parsearPeticiones(valores, formulas.map((r) => r?.[0]));
}
