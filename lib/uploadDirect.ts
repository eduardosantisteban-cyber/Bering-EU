// PUT directo del navegador a una signed upload URL ya generada y validada
// por el servidor (ver /api/pdf/upload-url y /api/fichas/upload-url) — sin
// pasar por el body de una función de Vercel (límite ~4.5MB) y sin que el
// navegador tenga que reconstruir la URL a partir de la ruta y el token.
export async function putFileToSignedUrl(
  signedUrl: string,
  file: File,
  contentType = "application/pdf"
): Promise<void> {
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!anonKey) {
    throw new Error("Falta NEXT_PUBLIC_SUPABASE_ANON_KEY en las variables de entorno");
  }
  const res = await fetch(signedUrl, {
    method: "PUT",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      "Content-Type": contentType,
    },
    body: file,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`No se pudo subir el archivo (HTTP ${res.status}): ${detail.slice(0, 300) || res.statusText}`);
  }
}
