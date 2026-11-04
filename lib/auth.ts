import { createHmac, timingSafeEqual } from "crypto";

export const SESSION_COOKIE = "bering_session";
const MARKER = "bering-presupuestos-session";

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("Falta SESSION_SECRET en las variables de entorno");
  }
  return secret;
}

/** Token opaco derivado del secreto del servidor — no contiene datos de usuario. */
export function createSessionToken(): string {
  return createHmac("sha256", getSecret()).update(MARKER).digest("hex");
}

// ── Sesión con usuario (Entrar con Google) ──
// Token "u.<payload base64url>.<firma>": payload = { e: email, x: caducidad en ms }. Firmado con SESSION_SECRET.

const DIAS_SESION = 30;

function firmar(payload: string): string {
  return createHmac("sha256", getSecret()).update("usuario:" + payload).digest("base64url");
}

export function createUserSessionToken(email: string): string {
  const payload = Buffer.from(JSON.stringify({ e: email.toLowerCase(), x: Date.now() + DIAS_SESION * 86400000 })).toString("base64url");
  return "u." + payload + "." + firmar(payload);
}

/** Email de la sesión (null si es la sesión de contraseña compartida o no es válida). */
export function emailDeSesion(token: string | undefined | null): string | null {
  if (!token || !token.startsWith("u.")) return null;
  const [, payload, firma] = token.split(".");
  if (!payload || !firma) return null;
  const esperada = firmar(payload);
  const a = Buffer.from(firma);
  const b = Buffer.from(esperada);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const d = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { e?: string; x?: number };
    if (!d.e || !d.x || d.x < Date.now()) return null;
    return emailPermitido(d.e) ? d.e : null;   // si se le quita el acceso, deja de valer al momento
  } catch {
    return null;
  }
}

/**
 * ¿Puede entrar este email? DARSENA_ACCESO (Vercel): lista separada por comas de dominios ("@beringeu.es") y emails.
 * Por defecto: el equipo de Bering EU, Manolo (Muelle Max) y Eduardo (Bering México).
 */
export function emailPermitido(email: string): boolean {
  const e = String(email || "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(e)) return false;
  const lista = (process.env.DARSENA_ACCESO || "@beringeu.es,manolo.ruiz@muellemax.com,eduardo.santisteban@bering.com.mx")
    .split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
  return lista.some((x) => (x.startsWith("@") ? e.endsWith(x) : e === x));
}

/** ¿Se permite todavía la contraseña compartida? (DARSENA_CONTRASENA=0 en Vercel para quitarla) */
export function contrasenaPermitida(): boolean {
  return process.env.DARSENA_CONTRASENA !== "0";
}

export function isValidSessionToken(token: string | undefined | null): boolean {
  if (!token) return false;
  if (token.startsWith("u.")) return emailDeSesion(token) !== null;
  if (!contrasenaPermitida()) return false;
  const expected = createSessionToken();
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function checkPassword(password: string): boolean {
  const appPassword = process.env.APP_PASSWORD;
  if (!appPassword) {
    throw new Error("Falta APP_PASSWORD en las variables de entorno");
  }
  const a = Buffer.from(password);
  const b = Buffer.from(appPassword);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * ¿Puede ver Finanzas? Solo con Google (nunca con la contraseña compartida).
 * FINANZAS_ACCESO (Vercel): lista de emails separada por comas. Por defecto, solo Eduardo.
 */
export function accesoFinanzas(email: string | null | undefined): boolean {
  const e = String(email || "").trim().toLowerCase();
  if (!e) return false;
  const lista = (process.env.FINANZAS_ACCESO || "eduardo.z@beringeu.es")
    .split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
  return lista.includes(e);
}
