import { normalizeStr } from "./format";

// Cliente mínimo de la API de Holded (CRM/facturación) — solo se usa
// server-side (nunca desde el navegador), la API key es secreta.
//
// AVISO: los nombres de endpoints y campos de este archivo se
// reconstruyeron a partir de fragmentos indexados en buscadores, no de la
// documentación oficial (developers.holded.com está bloqueado desde este
// entorno de desarrollo y no se pudo verificar en directo). Si al probarlo
// con una API key real Holded devuelve un error de validación, el mensaje
// de la respuesta debería decir qué campo está mal — con eso se ajusta
// esta capa sin tocar el resto de la app.
const BASE_URL = "https://api.holded.com/api/invoicing/v1";

function getApiKey(): string {
  const key = process.env.HOLDED_API_KEY;
  if (!key) {
    throw new Error("Falta HOLDED_API_KEY en las variables de entorno");
  }
  return key;
}

async function holdedFetch(path: string, options: RequestInit = {}): Promise<unknown> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      key: getApiKey(),
      ...(options.headers as Record<string, string> | undefined),
    },
  });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // respuesta no-JSON: se deja `data` en null y se usa el texto crudo abajo
  }
  if (!res.ok) {
    const message =
      (data && typeof data === "object" && "message" in data && String((data as { message: unknown }).message)) ||
      text ||
      `HTTP ${res.status}`;
    throw new Error(`Holded (${res.status}): ${message}`);
  }
  return data;
}

interface HoldedContact {
  id: string;
  name: string;
}

/** Busca un contacto por nombre (coincidencia exacta normalizada) o lo crea si no existe. */
export async function findOrCreateContact(name: string, email?: string): Promise<string> {
  const trimmedName = name.trim();
  if (!trimmedName) throw new Error("Falta el nombre del cliente");

  // Nota: si la cuenta tiene muchísimos contactos y la API pagina esta
  // lista, esta búsqueda solo mira la primera página — a falta de poder
  // confirmar el comportamiento exacto de paginación sin la doc oficial.
  const listResult = await holdedFetch("/contacts");
  const contacts: HoldedContact[] = Array.isArray(listResult)
    ? (listResult as HoldedContact[])
    : ((listResult as { contacts?: HoldedContact[] } | null)?.contacts ?? []);

  const target = normalizeStr(trimmedName);
  const found = contacts.find((c) => normalizeStr(c.name) === target);
  if (found) return found.id;

  const created = (await holdedFetch("/contacts", {
    method: "POST",
    body: JSON.stringify(email ? { name: trimmedName, email } : { name: trimmedName }),
  })) as { id: string };
  return created.id;
}

export interface HoldedEstimateItem {
  name: string;
  units: number;
  price: number;
}

/** Crea un presupuesto ("estimate") en Holded con las líneas dadas. */
export async function createEstimate(contactId: string, items: HoldedEstimateItem[]): Promise<{ id: string }> {
  return (await holdedFetch("/documents/estimate", {
    method: "POST",
    body: JSON.stringify({ contactId, items }),
  })) as { id: string };
}
