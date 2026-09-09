import { createClient } from "@supabase/supabase-js";
import { PDF_BUCKET, FICHAS_BUCKET } from "@/lib/constants";
import { sanitizeStorageFilename, uid } from "@/lib/id";

// Cliente de servidor con la service role key. Nunca se importa desde
// código de cliente ("use client") — el navegador no habla con Supabase
// directamente en ningún caso: la subida del PDF va a una signed upload
// URL de un solo uso generada aquí con esta misma service role key (ver
// app/api/pdf/upload-url) y luego el navegador hace un PUT normal a esa
// URL, sin usar el SDK de Supabase — necesario porque las funciones de
// Vercel tienen un límite de tamaño de payload (~4.5MB) que un PDF de
// varias páginas puede superar fácilmente.
export function supabaseAdmin() {
  const rawUrl = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!rawUrl || !key) {
    throw new Error(
      "Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en las variables de entorno"
    );
  }
  // Una barra "/" final en la URL (fácil de pegar sin querer en Vercel)
  // produce rutas de Storage con doble barra, que Supabase rechaza con
  // "Invalid path specified in request URL".
  const url = rawUrl.trim().replace(/\/+$/, "");
  return createClient(url, key.trim(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export { PDF_BUCKET, FICHAS_BUCKET };

/**
 * Genera una signed upload URL de un solo uso para un bucket dado —
 * compartido por /api/pdf/upload-url (PDFs de presupuesto) y
 * /api/fichas/upload-url (PDFs de fichas técnicas), único cambio entre
 * ambos es el bucket.
 */
export async function createUploadUrl(bucket: string, filename: string) {
  const id = uid();
  const path = `${id}/${sanitizeStorageFilename(filename)}`;
  const db = supabaseAdmin();
  const { data, error } = await db.storage.from(bucket).createSignedUploadUrl(path);
  if (error || !data) {
    throw error || new Error("Respuesta vacía de Supabase Storage");
  }
  return { id, path: data.path, signedUrl: data.signedUrl };
}

/** Descarga un PDF ya subido a Storage (de cualquier bucket) y lo devuelve en base64, para mandarlo a la API de Anthropic. */
export async function downloadAsBase64(bucket: string, path: string): Promise<string> {
  const db = supabaseAdmin();
  const { data, error } = await db.storage.from(bucket).download(path);
  if (error || !data) {
    throw new Error("No se pudo leer el PDF subido: " + (error?.message || "no encontrado"));
  }
  const buffer = Buffer.from(await data.arrayBuffer());
  return buffer.toString("base64");
}
