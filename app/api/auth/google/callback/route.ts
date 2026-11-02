import { NextResponse } from "next/server";
import { OAuth2Client } from "google-auth-library";
import { createUserSessionToken, emailPermitido, SESSION_COOKIE } from "@/lib/auth";

// Entrar con Google (paso 2): Google vuelve aquí con un código; se comprueba quién es y si puede entrar
// (lista DARSENA_ACCESO) y se crea la sesión de Dársena con su email. Necesita GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET.

const COOKIE_OAUTH = "darsena_oauth";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const volver = (error: string) => {
    const r = NextResponse.redirect(new URL("/login?error=" + error, url.origin));
    r.cookies.delete(COOKIE_OAUTH);
    return r;
  };
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !secret) return volver("config");
  if (url.searchParams.get("error")) return volver("cancelado");

  const cookie = (req.headers.get("cookie") || "").split(/;\s*/).find((c) => c.startsWith(COOKIE_OAUTH + "="));
  const [state, destino] = decodeURIComponent(cookie ? cookie.slice(COOKIE_OAUTH.length + 1) : "").split("|");
  if (!state || state !== url.searchParams.get("state")) return volver("caducado");
  const code = url.searchParams.get("code");
  if (!code) return volver("cancelado");

  try {
    const cliente = new OAuth2Client({ clientId, clientSecret: secret, redirectUri: url.origin + "/api/auth/google/callback" });
    const { tokens } = await cliente.getToken(code);
    if (!tokens.id_token) return volver("google");
    const ticket = await cliente.verifyIdToken({ idToken: tokens.id_token, audience: clientId });
    const p = ticket.getPayload();
    const email = String(p?.email || "").toLowerCase();
    if (!email || !p?.email_verified) return volver("google");
    if (!emailPermitido(email)) return volver("no-autorizado&email=" + encodeURIComponent(email));

    const res = NextResponse.redirect(new URL(destino && destino.startsWith("/") ? destino : "/", url.origin));
    res.cookies.delete(COOKIE_OAUTH);
    res.cookies.set(SESSION_COOKIE, createUserSessionToken(email), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    return res;
  } catch (e) {
    console.error("Entrar con Google:", (e as Error).message);
    return volver("google");
  }
}
