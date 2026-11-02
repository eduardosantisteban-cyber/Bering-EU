import { NextResponse } from "next/server";
import { randomBytes } from "crypto";

// Entrar con Google (paso 1): redirige a Google. Necesita GOOGLE_CLIENT_ID en Vercel.
// La dirección de vuelta es <dominio>/api/auth/google/callback (hay que darla de alta en Google Cloud).

const COOKIE_OAUTH = "darsena_oauth";

/** Solo rutas internas de Dársena (evita redirecciones a otros sitios). */
function rutaSegura(next: string | null): string {
  return next && /^\/(?!\/)[\w\-/?=&.%]*$/.test(next) && !next.startsWith("/api/") ? next : "/";
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return NextResponse.redirect(new URL("/login?error=config", url.origin));
  const state = randomBytes(18).toString("base64url");
  const destino = rutaSegura(url.searchParams.get("next"));
  const google = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  google.searchParams.set("client_id", clientId);
  google.searchParams.set("redirect_uri", url.origin + "/api/auth/google/callback");
  google.searchParams.set("response_type", "code");
  google.searchParams.set("scope", "openid email profile");
  google.searchParams.set("state", state);
  google.searchParams.set("prompt", "select_account");
  const res = NextResponse.redirect(google.toString());
  res.cookies.set(COOKIE_OAUTH, state + "|" + destino, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}
