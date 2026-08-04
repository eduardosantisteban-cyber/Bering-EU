import { createClient } from "@supabase/supabase-js";
import { PDF_BUCKET } from "@/lib/constants";

// Cliente de servidor con la service role key. Nunca se importa desde
// código de cliente ("use client") — el resto del acceso a Supabase pasa
// por las rutas de API de Next.js, ya que la app no tiene autenticación
// individual por usuario (ver middleware/proxy de contraseña compartida).
// Única excepción: la subida del PDF en sí, que va directa del navegador
// a Supabase Storage con una signed upload URL de un solo uso generada
// aquí (ver app/api/pdf/upload-url) — necesario porque las funciones de
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
  // Ver la misma normalización en lib/supabase/browser.ts: una barra "/"
  // final en la URL produce rutas de Storage con doble barra.
  const url = rawUrl.trim().replace(/\/+$/, "");
  return createClient(url, key.trim(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export { PDF_BUCKET };

/** Descarga un PDF ya subido a Storage y lo devuelve en base64, para mandarlo a la API de Anthropic. */
export async function downloadPdfAsBase64(path: string): Promise<string> {
  const db = supabaseAdmin();
  const { data, error } = await db.storage.from(PDF_BUCKET).download(path);
  if (error || !data) {
    throw new Error("No se pudo leer el PDF subido: " + (error?.message || "no encontrado"));
  }
  const buffer = Buffer.from(await data.arrayBuffer());
  return buffer.toString("base64");
}
