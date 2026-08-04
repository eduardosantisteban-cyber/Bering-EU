import type { ExtractedPresupuesto, Presupuesto, PresupuestoItem } from "./types";

async function jsonOrThrow(res: Response) {
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.error || `Error ${res.status}`);
  }
  return data;
}

export async function fetchPresupuestos(): Promise<Presupuesto[]> {
  const res = await fetch("/api/presupuestos", { cache: "no-store" });
  return jsonOrThrow(res);
}

export async function extractPdf(storagePath: string): Promise<ExtractedPresupuesto> {
  const res = await fetch("/api/extract", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ storagePath }),
  });
  return jsonOrThrow(res);
}

export interface UploadUrlResult {
  id: string;
  path: string;
  signedUrl: string;
}

/** Pide una URL de subida firmada de un solo uso (el PDF se sube directo a Supabase Storage, sin pasar por el body de la función). */
export async function requestUploadUrl(filename: string): Promise<UploadUrlResult> {
  const res = await fetch("/api/pdf/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename }),
  });
  return jsonOrThrow(res);
}

/** Borra un PDF subido que nunca se llegó a guardar como presupuesto (best-effort). */
export async function discardUploadedPdf(path: string): Promise<void> {
  try {
    await fetch("/api/pdf/upload-url", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
    });
  } catch {
    // best-effort: si falla, se queda un archivo huérfano en Storage, no es crítico.
  }
}

export interface CreatePresupuestoInput {
  id?: string;
  proveedor: string;
  numero_presupuesto: string | null;
  fecha_presupuesto: string | null;
  pdf_filename: string | null;
  drive_url: string | null;
  items: ExtractedPresupuesto["items"];
  pdf_storage_path?: string | null;
}

export async function createPresupuesto(input: CreatePresupuestoInput): Promise<Presupuesto> {
  const res = await fetch("/api/presupuestos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return jsonOrThrow(res);
}

export interface UpdatePresupuestoInput {
  proveedor?: string;
  numero_presupuesto?: string | null;
  fecha_presupuesto?: string | null;
  drive_url?: string | null;
  items?: Array<Partial<PresupuestoItem> & { id?: string }>;
}

export async function updatePresupuesto(
  id: string,
  input: UpdatePresupuestoInput
): Promise<Presupuesto> {
  const res = await fetch(`/api/presupuestos/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return jsonOrThrow(res);
}

export async function deletePresupuesto(id: string): Promise<void> {
  const res = await fetch(`/api/presupuestos/${id}`, { method: "DELETE" });
  await jsonOrThrow(res);
}

export async function getPdfUrl(id: string): Promise<string> {
  const res = await fetch(`/api/pdf/${id}`);
  const data = await jsonOrThrow(res);
  return data.url;
}

export async function logout(): Promise<void> {
  await fetch("/api/session", { method: "DELETE" });
}
