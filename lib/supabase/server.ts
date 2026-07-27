import { createClient } from "@supabase/supabase-js";

// Cliente de servidor con la service role key. Nunca se importa desde
// código de cliente ("use client") — todo el acceso a Supabase pasa por
// las rutas de API de Next.js, ya que la app no tiene autenticación
// individual por usuario (ver middleware/proxy de contraseña compartida).
export function supabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en las variables de entorno"
    );
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export const PDF_BUCKET = "presupuestos-pdfs";
