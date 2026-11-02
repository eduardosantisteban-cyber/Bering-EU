import { NextResponse } from "next/server";
import { checkPassword, contrasenaPermitida, createSessionToken, emailDeSesion, SESSION_COOKIE } from "@/lib/auth";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const password = typeof body?.password === "string" ? body.password : "";

  if (!contrasenaPermitida()) {
    return NextResponse.json({ error: "La contraseña ya no se usa: entra con tu cuenta de Google." }, { status: 401 });
  }
  if (!password || !checkPassword(password)) {
    return NextResponse.json({ error: "Contraseña incorrecta" }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, createSessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 días
  });
  return response;
}

/** Quién ha entrado: { email } (null con la contraseña compartida). */
export async function GET(request: Request) {
  const cookie = (request.headers.get("cookie") || "").split(/;\s*/).find((c) => c.startsWith(SESSION_COOKIE + "="));
  const email = emailDeSesion(cookie ? decodeURIComponent(cookie.slice(SESSION_COOKIE.length + 1)) : null);
  return NextResponse.json({ email }, { headers: { "Cache-Control": "no-store" } });
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
