import type { Oportunidad } from "./solicitudes";
import type { EnlacePortal } from "./portalConfig";

export interface ErrorAutomatizacion {
  fecha: string; // ISO (o texto si no es una fecha)
  cuenta: string;
  donde: string;
  contexto: string;
  error: string;
}

export interface PortalData {
  generado: string;
  oportunidades: Oportunidad[];
  /** Pestaña "Sistema" del Sheet: "Última revisión", "Revisado por", "Modo"… */
  sistema: Record<string, string | number | boolean | null>;
  errores: ErrorAutomatizacion[];
  enlaces: EnlacePortal[];
}
