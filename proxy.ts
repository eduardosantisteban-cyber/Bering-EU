import { NextResponse, type NextRequest } from "next/server";
import { isValidSessionToken, SESSION_COOKIE } from "@/lib/auth";

// Puerta de acceso compartida: no hay login individual por persona,
// solo una contraseña única del equipo. Protege todas las rutas
// excepto /login y su propio endpoint de sesión.
// /api/auth/google (Entrar con Google) se valida en Google; /api/voip (webhook de VoIPstudio) y /api/entradas/cola (script de Apps Script) llevan su propio token.
// /api/web-ref (exacto, no sus subrutas) lo llama la web beringeu.es y solo acepta su origen.
const PUBLIC_PATHS = ["/login", "/api/session", "/api/auth/google", "/api/voip", "/api/entradas/cola"];
const PUBLIC_EXACT = ["/api/web-ref"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isPublic =
    PUBLIC_EXACT.includes(pathname) ||
    PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (isPublic) return NextResponse.next();

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (isValidSessionToken(token)) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
