import type { Categoria } from "./constants";

export interface PresupuestoItem {
  id: string;
  presupuesto_id: string;
  codigo_articulo: string | null;
  categoria: Categoria | string;
  tipo_producto: string | null;
  marca: string | null;
  modelo: string | null;
  medidas: string | null;
  precio_unitario: number | null;
  moneda: string | null;
  cantidad: number;
  es_accesorio: boolean;
  grupo: number;
  notas: string | null;
}

export interface Presupuesto {
  id: string;
  proveedor: string;
  numero_presupuesto: string | null;
  fecha_presupuesto: string | null;
  pdf_filename: string | null;
  drive_url: string | null;
  pdf_storage_path: string | null;
  uploaded_at: string;
  created_at: string;
  updated_at: string;
  items: PresupuestoItem[];
}

export interface ExtractedItem {
  codigo_articulo: string | null;
  categoria: string;
  tipo_producto: string | null;
  marca: string | null;
  modelo: string | null;
  medidas: string | null;
  precio_unitario: number | null;
  moneda: string | null;
  cantidad: number | null;
  es_accesorio: boolean;
  grupo: number;
  notas: string | null;
}

export interface ExtractedPresupuesto {
  proveedor: string;
  numero_presupuesto: string | null;
  fecha_presupuesto: string | null;
  items: ExtractedItem[];
}

export interface FichaTecnica {
  id: string;
  categoria: Categoria | string;
  tipo_producto: string | null;
  marca: string | null;
  modelo: string | null;
  nombre_archivo: string;
  storage_path: string;
  notas: string | null;
  created_at: string;
}
