import { APP_VERSION } from "./constants";
import type { Presupuesto } from "./types";

export interface BackupPayload {
  exportado_el: string;
  version_herramienta: string;
  presupuestos: Presupuesto[];
}

/** Construye el JSON de backup a partir de los presupuestos ya cargados (no hace falta pedirlos otra vez al servidor). */
export function buildBackupPayload(presupuestos: Presupuesto[]): BackupPayload {
  return {
    exportado_el: new Date().toISOString(),
    version_herramienta: APP_VERSION,
    presupuestos,
  };
}

/** Nombre de archivo sugerido para el backup, con la fecha de hoy. */
export function backupFilename(date: Date = new Date()): string {
  return `backup_presupuestos_bering_${date.toISOString().slice(0, 10)}.json`;
}

/**
 * Clave para detectar presupuestos duplicados DENTRO de un mismo archivo de
 * backup (mismo conjunto de ids de línea) — no compara contra lo que ya
 * haya en la base de datos, eso se resuelve solo al hacer upsert por id.
 * Mismo criterio que scripts/seed.mjs, para que ambos caminos de
 * importación (CLI y desde la app) se comporten igual.
 */
export function itemsDedupeKey(items: { id: string }[] | null | undefined): string {
  if (!items || items.length === 0) return "";
  return items
    .map((it) => it.id)
    .filter(Boolean)
    .sort()
    .join(",");
}

/** Extrae el array de presupuestos de un JSON de backup, tolerando el formato antiguo (array suelto) o el nuevo ({ presupuestos: [...] }). */
export function extractBackupList(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object" && Array.isArray((raw as { presupuestos?: unknown }).presupuestos)) {
    return (raw as { presupuestos: unknown[] }).presupuestos;
  }
  return [];
}
