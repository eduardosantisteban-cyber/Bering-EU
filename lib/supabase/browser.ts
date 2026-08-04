import { createClient } from "@supabase/supabase-js";

// Cliente de navegador con la clave anónima (pública, segura de exponer).
// Se usa ÚNICAMENTE para subir el PDF a una signed upload URL de un solo
// uso generada por el backend (ver app/api/pdf/upload-url) — el resto de
// la app sigue sin hablar con Supabase desde el navegador. La clave
// anónima por sí sola no da acceso a nada: RLS bloquea las tablas por
// completo, y en Storage solo se puede usar un token de subida ya
// autorizado por el servidor con la service role key.
let client: ReturnType<typeof createClient> | null = null;

export function supabaseBrowser() {
  if (!client) {
    const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!rawUrl || !anonKey) {
      throw new Error(
        "Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY en las variables de entorno"
      );
    }
    // Una barra "/" final (fácil de copiar sin querer al pegar la URL en
    // Vercel) hace que el cliente construya rutas de Storage con doble
    // barra, que Supabase rechaza con "Invalid path specified in request
    // URL" — se quita aquí como red de seguridad.
    const url = rawUrl.trim().replace(/\/+$/, "");
    client = createClient(url, anonKey.trim(), { auth: { persistSession: false } });
  }
  return client;
}
