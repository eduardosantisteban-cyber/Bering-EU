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

export function isValidSessionToken(token: string | undefined | null): boolean {
  if (!token) return false;
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
