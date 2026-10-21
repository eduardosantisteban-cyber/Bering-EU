import { normalizeStr } from "./format";
import { TIPOS_PRODUCTO } from "./portalConfig";
import { provinciaDeTexto } from "./provincias";
import { ESTADOS, marcaDeCodigo, type Oportunidad } from "./solicitudes";

// Histórico del CRM: oportunidades de Holded que no están en la hoja Solicitudes (las anteriores a la
// automatización, BEUQ < 390, y las creadas a mano). Solo lectura. Se usan en los análisis, gráficos y el
// buscador, pero no en "Necesitan atención" ni en los seguimientos (no tienen datos de seguimiento).

const BASE = "https://api.holded.com/api/crm/v1";

export interface LeadHolded {
  id: string;
  name?: string;
  contactName?: string;
  value?: number | string;
  status?: number; // 0 abierta · 1 ganada · 2 perdida
  stageId?: string;
  tags?: string[];
  createdAt?: number | string;
  updatedAt?: number | string;
  dueDate?: number | string;
  [k: string]: unknown;
}

/** Unix (segundos o milisegundos) o texto de fecha → ISO. */
function iso(v: unknown): string | null {
  if (v === null || v === undefined || v === "" || v === 0) return null;
  const n = Number(v);
  if (isFinite(n) && n > 0) {
    const d = new Date(n < 1e11 ? n * 1000 : n);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? null : d.toISOString();
}

/** Estado del portal a partir de la oportunidad de Holded (misma regla que estadoDesdeHolded_ del script). */
export function estadoDeLead(lead: LeadHolded, etapas: Record<string, string>): string {
  if (lead.status === 1) return ESTADOS.GANADO;
  if (lead.status === 2) return ESTADOS.PERDIDO;
  const etapa = normalizeStr(etapas[lead.stageId || ""] || "");
  if (/ganad|won|aceptad/.test(etapa)) return ESTADOS.GANADO;
  if (/perdid|lost|rechazad|descartad/.test(etapa)) return ESTADOS.PERDIDO;
  if (/enviad|sent|negociaci|seguimiento/.test(etapa)) return ESTADOS.ENVIADO;
  if (/listo|holded|presupuest/.test(etapa) || (Number(lead.value) || 0) > 0) return ESTADOS.HOLDED;
  return ESTADOS.PENDIENTE;
}

/** Tipos de producto a partir de los tags de Holded ("muelledecarga") o del "[…]" del título. */
function productosDe(lead: LeadHolded): string {
  const fuentes = [...(Array.isArray(lead.tags) ? lead.tags : []), ...(String(lead.name || "").match(/\[([^\]]+)\]/g) || [])];
  const texto = normalizeStr(fuentes.join(" ")).replace(/\s+/g, "");
  return TIPOS_PRODUCTO.filter((t) => t.clave !== "sin clasificar" && texto.includes(t.clave.replace(/\s+/g, "")))
    .map((t) => t.clave)
    .join(", ");
}

/** Convierte las oportunidades de Holded que no están en la hoja en oportunidades del portal. */
export function oportunidadesDeHolded(leads: LeadHolded[], etapas: Record<string, string>, codigosEnHoja: Set<string>): Oportunidad[] {
  const out: Oportunidad[] = [];
  for (const l of leads) {
    const nombre = String(l.name || "").trim();
    const m = nombre.match(/^\s*([A-Z]{2,8}\d{1,7})(?!\d)/i);
    const codigo = m ? m[1].toUpperCase() : "";
    if (!codigo || codigosEnHoja.has(codigo)) continue;
    const resto = nombre.slice(m![0].length).replace(/^\s*[-–·:]\s*/, "").trim();
    const estado = estadoDeLead(l, etapas);
    const fechaSolicitud = iso(l.createdAt);
    const importe = Number(l.value);
    out.push({
      codigo,
      numero: "",
      empresa: String(l.contactName || "").trim() || resto.split(/\s+[-–]\s+/)[0] || "—",
      contacto: "",
      email: "",
      productos: productosDe(l),
      asunto: resto.slice(0, 160),
      estado,
      fechaSolicitud,
      fechaEstado: iso(l.updatedAt) || (estado === ESTADOS.GANADO || estado === ESTADOS.PERDIDO ? iso(l.dueDate) : null) || fechaSolicitud,
      importe: isFinite(importe) && importe > 0 ? Math.round(importe * 100) / 100 : null,
      registradoPor: "",
      sheetUrl: "",
      pdfUrl: "",
      gmailUrl: "",
      seguimiento: ["", "", ""],
      sinSeguimiento: true,
      atencion: "",
      diasAtencion: null,
      fila: 0,
      cantidades: "",
      medidas: "",
      resumen: "",
      adjuntos: "",
      marca: marcaDeCodigo(codigo),
      canal: "CRM (antes de la automatización)",
      provincia: provinciaDeTexto(resto),
      motivoPerdida: "",
      fechaPresupuesto: null,
      tiempoRespuesta: null,
      margen: null,
      proximoSeguimiento: null,
      origen: "crm",
    });
  }
  return out;
}

async function holded(path: string, key: string): Promise<unknown> {
  const res = await fetch(BASE + path, { headers: { key, accept: "application/json" }, cache: "no-store" });
  if (!res.ok) throw new Error(`Holded ${res.status}: ${(await res.text()).slice(0, 160)}`);
  return res.json();
}

/** Lee oportunidades y etapas de Holded. Devuelve null si no hay HOLDED_API_KEY. */
export async function leerHistoricoHolded(): Promise<{ leads: LeadHolded[]; etapas: Record<string, string> } | null> {
  const key = (process.env.HOLDED_API_KEY || "").trim();
  if (!key) return null;
  const [leads, funnels] = await Promise.all([holded("/leads", key), holded("/funnels", key).catch(() => [])]);
  const etapas: Record<string, string> = {};
  for (const f of (Array.isArray(funnels) ? funnels : []) as { stages?: { stageId?: string; id?: string; key?: string; name?: string }[] }[]) {
    for (const s of f.stages || []) {
      const id = s.stageId || s.id || s.key;
      if (id) etapas[id] = s.name || "";
    }
  }
  return { leads: (Array.isArray(leads) ? leads : []) as LeadHolded[], etapas };
}
