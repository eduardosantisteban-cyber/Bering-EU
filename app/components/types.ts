import type { Presupuesto, PresupuestoItem } from "@/lib/types";

export interface FlatRow extends PresupuestoItem {
  __rec: Presupuesto;
}
